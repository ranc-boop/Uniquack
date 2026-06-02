"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/auth/guards";
import {
  importBatchImportJson,
  previewBatchImportJson,
} from "@/lib/batch-import/service";
import { createClient } from "@/lib/supabase/server";

export async function previewManualJsonImport(input: { jsonText: string }) {
  await requireAdmin();
  const supabase = await createClient();

  return previewBatchImportJson({
    supabase,
    jsonText: input.jsonText,
  });
}

export async function importManualJsonDrafts(input: { jsonText: string }) {
  const profile = await requireAdmin();
  const supabase = await createClient();
  const summary = await importBatchImportJson({
    supabase,
    profileId: profile.id,
    jsonText: input.jsonText,
  });

  revalidatePath("/admin/imports");
  revalidatePath("/admin/questions");
  revalidatePath("/questions");

  return summary;
}
