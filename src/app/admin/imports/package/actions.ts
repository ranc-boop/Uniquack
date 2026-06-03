"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/auth/guards";
import {
  importBatchImportJson,
  previewBatchImportJson,
} from "@/lib/batch-import/service";
import { createClient } from "@/lib/supabase/server";

export async function previewPackageImportQuestions(input: { jsonText: string }) {
  await requireAdmin();
  const supabase = await createClient();

  return previewBatchImportJson({
    jsonText: input.jsonText,
    supabase,
  });
}

export async function importPackageDraftQuestions(input: { jsonText: string }) {
  const profile = await requireAdmin();
  const supabase = await createClient();
  const summary = await importBatchImportJson({
    jsonText: input.jsonText,
    profileId: profile.id,
    supabase,
  });

  revalidatePath("/admin/imports");
  revalidatePath("/admin/imports/package");
  revalidatePath("/admin/questions");
  revalidatePath("/admin/review");

  return summary;
}
