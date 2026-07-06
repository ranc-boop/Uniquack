import "server-only";

import { createClient } from "@/lib/supabase/server";
import type {
  BankMember,
  BankMemberRole,
  BankShareCode,
  Profile,
  QuestionBank,
  QuestionBankStatus,
  QuestionBankVisibility,
} from "@/types/database";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type TeacherQuestionBankSummary = QuestionBank & {
  activeMemberCount: number;
  membershipRole: BankMemberRole;
  questionCount: number;
};

export type TeacherQuestionBankDetail = {
  activeMemberCount: number;
  bank: QuestionBank;
  currentUserRole: BankMemberRole | null;
  members: BankMemberWithProfile[];
  questionCount: number;
};

export type BankMemberWithProfile = BankMember & {
  profile: Pick<
    Profile,
    "display_name" | "email" | "full_name" | "id" | "username"
  > | null;
};

export type BankShareCodeSummary = Pick<
  BankShareCode,
  | "id"
  | "bank_id"
  | "code_hint"
  | "created_at"
  | "expires_at"
  | "last_used_at"
  | "role_granted"
  | "status"
  | "updated_at"
>;

export class QuestionBankSchemaMissingError extends Error {
  constructor(message = "Question Bank tables are not available yet.") {
    super(message);
    this.name = "QuestionBankSchemaMissingError";
  }
}

function isMissingQuestionBankSchemaError(error: { message?: string } | null) {
  const message = error?.message?.toLowerCase() ?? "";
  return (
    message.includes("question_banks") ||
    message.includes("bank_members") ||
    message.includes("bank_questions") ||
    message.includes("bank_share_codes")
  ) && (message.includes("does not exist") || message.includes("schema cache"));
}

function assertQuestionBankSchema(error: { message?: string } | null) {
  if (isMissingQuestionBankSchemaError(error)) {
    throw new QuestionBankSchemaMissingError();
  }
}

function countByBankId(rows: Array<{ bank_id: string }> | null | undefined) {
  const counts = new Map<string, number>();

  for (const row of rows ?? []) {
    counts.set(row.bank_id, (counts.get(row.bank_id) ?? 0) + 1);
  }

  return counts;
}

export async function listTeacherQuestionBanks({
  profileId,
  supabase,
}: {
  profileId: string;
  supabase: SupabaseServerClient;
}) {
  const { data: memberships, error: membershipError } = await supabase
    .from("bank_members")
    .select("bank_id, role, status")
    .eq("user_id", profileId)
    .eq("status", "active");

  assertQuestionBankSchema(membershipError);

  if (membershipError) {
    throw new Error(membershipError.message);
  }

  const membershipByBankId = new Map(
    (memberships ?? []).map((membership) => [membership.bank_id, membership]),
  );
  const bankIds = Array.from(membershipByBankId.keys());

  if (!bankIds.length) {
    return [];
  }

  const { data: banks, error: banksError } = await supabase
    .from("question_banks")
    .select(
      "id, organization_id, owner_id, name, description, visibility, status, metadata, created_by, updated_by, created_at, updated_at",
    )
    .in("id", bankIds)
    .order("updated_at", { ascending: false });

  assertQuestionBankSchema(banksError);

  if (banksError) {
    throw new Error(banksError.message);
  }

  const { data: bankQuestionRows, error: questionError } = await supabase
    .from("bank_questions")
    .select("bank_id")
    .in("bank_id", bankIds)
    .eq("status", "active");

  assertQuestionBankSchema(questionError);

  if (questionError) {
    throw new Error(questionError.message);
  }

  const { data: memberRows, error: memberCountError } = await supabase
    .from("bank_members")
    .select("bank_id")
    .in("bank_id", bankIds)
    .eq("status", "active");

  assertQuestionBankSchema(memberCountError);

  if (memberCountError) {
    throw new Error(memberCountError.message);
  }

  const questionCounts = countByBankId(bankQuestionRows);
  const memberCounts = countByBankId(memberRows);

  return (banks ?? []).map((bank) => {
    const membership = membershipByBankId.get(bank.id);

    return {
      ...bank,
      activeMemberCount: memberCounts.get(bank.id) ?? 0,
      membershipRole: membership?.role ?? "viewer",
      questionCount: questionCounts.get(bank.id) ?? 0,
    } satisfies TeacherQuestionBankSummary;
  });
}

export async function getTeacherQuestionBankDetail({
  bankId,
  profileId,
  supabase,
}: {
  bankId: string;
  profileId?: string;
  supabase: SupabaseServerClient;
}) {
  const { data: bank, error: bankError } = await supabase
    .from("question_banks")
    .select(
      "id, organization_id, owner_id, name, description, visibility, status, metadata, created_by, updated_by, created_at, updated_at",
    )
    .eq("id", bankId)
    .maybeSingle();

  assertQuestionBankSchema(bankError);

  if (bankError) {
    throw new Error(bankError.message);
  }

  if (!bank) {
    return null;
  }

  const { data: members, error: memberError } = await supabase
    .from("bank_members")
    .select("id, bank_id, user_id, role, status, invited_by, joined_at, created_at, updated_at")
    .eq("bank_id", bankId)
    .order("created_at", { ascending: true });

  assertQuestionBankSchema(memberError);

  if (memberError) {
    throw new Error(memberError.message);
  }

  const { data: bankQuestionRows, error: questionError } = await supabase
    .from("bank_questions")
    .select("bank_id")
    .eq("bank_id", bankId)
    .eq("status", "active");

  assertQuestionBankSchema(questionError);

  if (questionError) {
    throw new Error(questionError.message);
  }

  const userIds = Array.from(new Set((members ?? []).map((member) => member.user_id)));
  let profilesById = new Map<string, BankMemberWithProfile["profile"]>();

  if (userIds.length) {
    const { data: profiles, error: profileError } = await supabase
      .from("profiles")
      .select("id, display_name, email, full_name, username")
      .in("id", userIds);

    if (profileError) {
      throw new Error(profileError.message);
    }

    profilesById = new Map(
      (profiles ?? []).map((profile) => [profile.id, profile]),
    );
  }

  const membersWithProfiles = (members ?? []).map((member) => ({
    ...member,
    profile: profilesById.get(member.user_id) ?? null,
  }));

  return {
    activeMemberCount:
      members?.filter((member) => member.status === "active").length ?? 0,
    bank,
    currentUserRole:
      members?.find((member) => member.user_id === profileId)?.role ?? null,
    members: membersWithProfiles,
    questionCount: bankQuestionRows?.length ?? 0,
  } satisfies TeacherQuestionBankDetail;
}

export async function listBankShareCodes({
  bankId,
  supabase,
}: {
  bankId: string;
  supabase: SupabaseServerClient;
}) {
  const { data, error } = await supabase
    .from("bank_share_codes")
    .select(
      "id, bank_id, code_hint, role_granted, status, expires_at, last_used_at, created_at, updated_at",
    )
    .eq("bank_id", bankId)
    .order("created_at", { ascending: false });

  assertQuestionBankSchema(error);

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}

export function canManageBankMembers(role: BankMemberRole | null | undefined) {
  return role === "owner";
}

export function bankMemberProfileLabel(member: BankMemberWithProfile) {
  return (
    member.profile?.display_name ||
    member.profile?.full_name ||
    member.profile?.username ||
    member.profile?.email ||
    "Unknown member"
  );
}

export function questionBankVisibilityLabel(
  visibility: QuestionBankVisibility,
) {
  const labels: Record<QuestionBankVisibility, string> = {
    organization: "Organization",
    private: "Private",
    public: "Public review",
    shared: "Shared",
  };

  return labels[visibility];
}

export function questionBankStatusLabel(status: QuestionBankStatus) {
  const labels: Record<QuestionBankStatus, string> = {
    active: "Active",
    archived: "Archived",
    disabled: "Disabled",
  };

  return labels[status];
}

export function bankMemberRoleLabel(role: BankMemberRole) {
  const labels: Record<BankMemberRole, string> = {
    editor: "Editor",
    owner: "Owner",
    viewer: "Viewer",
  };

  return labels[role];
}
