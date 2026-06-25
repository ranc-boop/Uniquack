"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";

function parseLearningPath(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return [];

  try {
    const parsed = JSON.parse(trimmed);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return trimmed
      .split(/\r?\n/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
}

function parseTagIds(value: string) {
  return Array.from(new Set(
    value
      .split(/[\s,]+/)
      .map((item) => item.trim())
      .filter(Boolean),
  )).slice(0, 80);
}

export async function createPracticeFramework(formData: FormData) {
  const profile = await requireAdmin();
  const supabase = await createClient();
  const title = String(formData.get("title") ?? "").trim().slice(0, 160);
  const description = String(formData.get("description") ?? "").trim().slice(0, 1000);
  const frameworkPrompt = String(formData.get("framework_prompt") ?? "").trim().slice(0, 12000);
  const priorityRules = String(formData.get("priority_rules") ?? "").trim().slice(0, 4000);
  const learningPath = parseLearningPath(String(formData.get("learning_path") ?? ""));
  const allowedTagIds = parseTagIds(String(formData.get("allowed_tag_ids") ?? ""));

  if (!title || !frameworkPrompt) {
    redirect("/admin/practice-frameworks?error=Title%20and%20framework%20prompt%20are%20required");
  }

  const { error } = await supabase.from("practice_course_frameworks").insert({
    allowed_tag_ids: allowedTagIds,
    created_by: profile.id,
    description,
    framework_prompt: frameworkPrompt,
    learning_path: learningPath,
    priority_rules: priorityRules,
    title,
  });

  if (error) {
    redirect(`/admin/practice-frameworks?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/admin/practice-frameworks");
  redirect("/admin/practice-frameworks?saved=1");
}

export async function archivePracticeFramework(formData: FormData) {
  await requireAdmin();
  const supabase = await createClient();
  const id = String(formData.get("id") ?? "").trim();

  if (!id) {
    redirect("/admin/practice-frameworks?error=Framework%20id%20is%20required");
  }

  const { error } = await supabase
    .from("practice_course_frameworks")
    .update({ status: "archived" })
    .eq("id", id);

  if (error) {
    redirect(`/admin/practice-frameworks?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/admin/practice-frameworks");
  redirect("/admin/practice-frameworks?saved=1");
}
