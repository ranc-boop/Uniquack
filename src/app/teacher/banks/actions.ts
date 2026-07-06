"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  formatActionError,
  redirectWithError,
  redirectWithSaved,
} from "@/lib/actions/feedback";
import { requireTeacher } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";

const bankCreateSchema = z.object({
  description: z.string().trim().max(2000).optional().default(""),
  name: z.string().trim().min(1).max(120),
  visibility: z
    .enum(["private", "shared", "organization", "public"])
    .default("private"),
});

const bankShareCodeCreateSchema = z.object({
  bankId: z.string().uuid(),
  grantedRole: z.enum(["viewer", "editor"]).default("viewer"),
});

const bankShareCodeRevokeSchema = z.object({
  bankId: z.string().uuid(),
  shareCodeId: z.string().uuid(),
});

const bankJoinSchema = z.object({
  shareCode: z.string().trim().min(6).max(64),
});

const bankMemberRoleSchema = z.object({
  bankId: z.string().uuid(),
  role: z.enum(["viewer", "editor"]),
  userId: z.string().uuid(),
});

const bankMemberRemoveSchema = z.object({
  bankId: z.string().uuid(),
  userId: z.string().uuid(),
});

export async function createQuestionBank(formData: FormData) {
  try {
    await requireTeacher();
    const parsed = bankCreateSchema.parse(Object.fromEntries(formData));
    const supabase = await createClient();

    const { data: bankId, error } = await supabase.rpc("create_question_bank", {
      bank_description: parsed.description || null,
      bank_name: parsed.name,
      bank_visibility: parsed.visibility,
    });

    if (error) {
      throw new Error(error.message);
    }

    if (!bankId) {
      throw new Error("Question Bank was not created.");
    }

    revalidatePath("/teacher");
    revalidatePath("/teacher/banks");
    redirectWithSaved(
      `/teacher/banks/${bankId}`,
      "Question Bank created. Start with reviewed content before assigning work.",
    );
  } catch (error) {
    redirectWithError("/teacher/banks/new", formatActionError(error));
  }
}

export async function createBankShareCode(formData: FormData) {
  const fallbackPath = `/teacher/banks/${formData.get("bankId")}/members`;

  try {
    await requireTeacher();
    const parsed = bankShareCodeCreateSchema.parse(Object.fromEntries(formData));
    const supabase = await createClient();

    const { data, error } = await supabase.rpc("create_bank_share_code", {
      expires_at: null,
      granted_role: parsed.grantedRole,
      target_bank_id: parsed.bankId,
    });

    if (error) {
      throw new Error(error.message);
    }

    const created = data?.[0];

    if (!created?.raw_share_code) {
      throw new Error("Bank share code was not created.");
    }

    revalidatePath(`/teacher/banks/${parsed.bankId}`);
    revalidatePath(`/teacher/banks/${parsed.bankId}/members`);
    redirectWithSaved(
      `/teacher/banks/${parsed.bankId}/members?newCode=${encodeURIComponent(
        created.raw_share_code,
      )}&role=${encodeURIComponent(created.role_granted)}`,
      "Share code created. Copy it now; only the hash is stored.",
    );
  } catch (error) {
    redirectWithError(fallbackPath, formatActionError(error));
  }
}

export async function revokeBankShareCode(formData: FormData) {
  const fallbackPath = `/teacher/banks/${formData.get("bankId")}/members`;

  try {
    await requireTeacher();
    const parsed = bankShareCodeRevokeSchema.parse(Object.fromEntries(formData));
    const supabase = await createClient();

    const { error } = await supabase.rpc("revoke_bank_share_code", {
      target_share_code_id: parsed.shareCodeId,
    });

    if (error) {
      throw new Error(error.message);
    }

    revalidatePath(`/teacher/banks/${parsed.bankId}/members`);
    redirectWithSaved(fallbackPath, "Share code revoked.");
  } catch (error) {
    redirectWithError(fallbackPath, formatActionError(error));
  }
}

export async function joinQuestionBankByCode(formData: FormData) {
  try {
    await requireTeacher();
    const parsed = bankJoinSchema.parse(Object.fromEntries(formData));
    const supabase = await createClient();

    const { data, error } = await supabase.rpc("join_question_bank_by_code", {
      raw_share_code: parsed.shareCode,
    });

    if (error) {
      throw new Error(error.message);
    }

    const joined = data?.[0];

    if (!joined?.bank_id) {
      throw new Error("Unable to join that Question Bank.");
    }

    revalidatePath("/teacher");
    revalidatePath("/teacher/banks");
    redirectWithSaved(
      `/teacher/banks/${joined.bank_id}`,
      `Joined ${joined.bank_name} as ${joined.granted_role}.`,
    );
  } catch (error) {
    redirectWithError("/teacher/banks/join", formatActionError(error));
  }
}

export async function updateBankMemberRole(formData: FormData) {
  const fallbackPath = `/teacher/banks/${formData.get("bankId")}/members`;

  try {
    await requireTeacher();
    const parsed = bankMemberRoleSchema.parse(Object.fromEntries(formData));
    const supabase = await createClient();

    const { error } = await supabase.rpc("update_bank_member_role", {
      new_role: parsed.role,
      target_bank_id: parsed.bankId,
      target_user_id: parsed.userId,
    });

    if (error) {
      throw new Error(error.message);
    }

    revalidatePath(`/teacher/banks/${parsed.bankId}`);
    revalidatePath(`/teacher/banks/${parsed.bankId}/members`);
    redirectWithSaved(fallbackPath, "Bank member role updated.");
  } catch (error) {
    redirectWithError(fallbackPath, formatActionError(error));
  }
}

export async function removeBankMember(formData: FormData) {
  const fallbackPath = `/teacher/banks/${formData.get("bankId")}/members`;

  try {
    await requireTeacher();
    const parsed = bankMemberRemoveSchema.parse(Object.fromEntries(formData));
    const supabase = await createClient();

    const { error } = await supabase.rpc("remove_bank_member", {
      target_bank_id: parsed.bankId,
      target_user_id: parsed.userId,
    });

    if (error) {
      throw new Error(error.message);
    }

    revalidatePath(`/teacher/banks/${parsed.bankId}`);
    revalidatePath(`/teacher/banks/${parsed.bankId}/members`);
    redirectWithSaved(fallbackPath, "Bank member removed.");
  } catch (error) {
    redirectWithError(fallbackPath, formatActionError(error));
  }
}
