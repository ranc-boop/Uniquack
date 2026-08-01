"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAdmin } from "@/lib/auth/guards";
import { PRACTICE_FRAMEWORK_INPUT_LIMITS } from "@/lib/practice/framework-input-limits";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database";

function parseLearningPath(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return [];
  if (trimmed.length > PRACTICE_FRAMEWORK_INPUT_LIMITS.LEARNING_PATH_CHARS) {
    throw new Error("Learning path is too long.");
  }

  let items: Json[];
  try {
    const parsed = JSON.parse(trimmed) as Json;
    items = Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    items = trimmed
      .split(/\r?\n/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  if (items.length > PRACTICE_FRAMEWORK_INPUT_LIMITS.LEARNING_PATH_ITEMS) {
    throw new Error("Learning path contains too many items.");
  }
  if (items.some((item) => JSON.stringify(item).length > PRACTICE_FRAMEWORK_INPUT_LIMITS.LEARNING_PATH_ITEM_CHARS)) {
    throw new Error("A learning path item is too long.");
  }
  return items;
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
  const title = String(formData.get("title") ?? "").trim().slice(0, PRACTICE_FRAMEWORK_INPUT_LIMITS.TITLE_CHARS);
  const description = String(formData.get("description") ?? "").trim().slice(0, PRACTICE_FRAMEWORK_INPUT_LIMITS.DESCRIPTION_CHARS);
  const frameworkPrompt = String(formData.get("framework_prompt") ?? "").trim().slice(0, PRACTICE_FRAMEWORK_INPUT_LIMITS.FRAMEWORK_PROMPT_CHARS);
  const priorityRules = String(formData.get("priority_rules") ?? "").trim().slice(0, PRACTICE_FRAMEWORK_INPUT_LIMITS.PRIORITY_RULES_CHARS);
  const learningPathInput = String(formData.get("learning_path") ?? "");
  const allowedTagInput = String(formData.get("allowed_tag_ids") ?? "");

  if (allowedTagInput.length > PRACTICE_FRAMEWORK_INPUT_LIMITS.ALLOWED_TAG_IDS_CHARS) {
    redirect("/admin/practice-frameworks?error=Allowed%20tag%20IDs%20are%20too%20long");
  }
  let learningPath: Json[];
  try {
    learningPath = parseLearningPath(learningPathInput);
  } catch (error) {
    redirect(`/admin/practice-frameworks?error=${encodeURIComponent(error instanceof Error ? error.message : "Invalid learning path.")}`);
  }
  const allowedTagIds = parseTagIds(allowedTagInput);

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
