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
