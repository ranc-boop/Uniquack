"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/auth/guards";
import {
  formatActionError,
  redirectWithError,
  redirectWithSaved,
} from "@/lib/actions/feedback";
import { createClient } from "@/lib/supabase/server";
import {
  tagCreateSchema,
  tagDeleteSchema,
  tagStatusSchema,
  tagUpdateSchema,
} from "@/lib/validations/tag";

export async function createTag(formData: FormData) {
  try {
    const profile = await requireAdmin();
    const parsed = tagCreateSchema.parse(Object.fromEntries(formData));
    const supabase = await createClient();

    const { error } = await supabase.from("tags").insert({
      ...parsed,
      parent_id: parsed.tag_type === "attribute" ? null : parsed.parent_id,
      created_by: profile.id,
      updated_by: profile.id,
    });

    if (error) {
      throw new Error(error.message);
    }
  } catch (error) {
    redirectWithError("/admin/tags", formatActionError(error));
  }

  revalidatePath("/admin/tags");
  revalidatePath("/questions");
  revalidatePath("/videos");
  redirectWithSaved("/admin/tags", "Tag created.");
}

export async function updateTag(formData: FormData) {
  try {
    const profile = await requireAdmin();
    const parsed = tagUpdateSchema.parse(Object.fromEntries(formData));
    const supabase = await createClient();
    const { id, ...values } = parsed;

    const { error } = await supabase
      .from("tags")
      .update({
        ...values,
        parent_id: values.tag_type === "attribute" ? null : values.parent_id,
        updated_by: profile.id,
      })
      .eq("id", id);

    if (error) {
      throw new Error(error.message);
    }
  } catch (error) {
    redirectWithError("/admin/tags", formatActionError(error));
  }

  revalidatePath("/admin/tags");
  revalidatePath("/questions");
  revalidatePath("/videos");
  redirectWithSaved("/admin/tags", "Tag updated.");
}

export async function updateTagStatus(formData: FormData) {
  try {
    const profile = await requireAdmin();
    const parsed = tagStatusSchema.parse(Object.fromEntries(formData));
    const supabase = await createClient();

    const { error } = await supabase
      .from("tags")
      .update({ status: parsed.status, updated_by: profile.id })
      .eq("id", parsed.id);

    if (error) {
      throw new Error(error.message);
    }
  } catch (error) {
    redirectWithError("/admin/tags", formatActionError(error));
  }

  revalidatePath("/admin/tags");
  revalidatePath("/questions");
  revalidatePath("/videos");
  redirectWithSaved("/admin/tags", "Tag status updated.");
}

export async function deleteTag(formData: FormData) {
  try {
    await requireAdmin();
    const parsed = tagDeleteSchema.parse(Object.fromEntries(formData));
    const supabase = await createClient();

    const { error } = await supabase.from("tags").delete().eq("id", parsed.id);

    if (error) {
      throw new Error(error.message);
    }
  } catch (error) {
    redirectWithError("/admin/tags", formatActionError(error));
  }

  revalidatePath("/admin/tags");
  revalidatePath("/questions");
  revalidatePath("/videos");
  redirectWithSaved("/admin/tags", "Tag deleted.");
}
