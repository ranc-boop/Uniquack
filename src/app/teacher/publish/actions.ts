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

const publishQuestionBankAssignmentsSchema = z.object({
  bankId: z.string().uuid(),
  dueAt: z.string().trim().optional().default(""),
  instructions: z.string().trim().max(4000).optional().default(""),
  publishMode: z.enum(["assigned", "draft"]).default("draft"),
  title: z.string().trim().min(1).max(180),
});

function normalizeDueAt(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const parsed = new Date(trimmed);

  if (Number.isNaN(parsed.getTime())) {
    throw new Error("Due date is invalid.");
  }

  return parsed.toISOString();
}

function uniqueStrings(values: FormDataEntryValue[]) {
  return Array.from(
    new Set(
      values
        .map((value) => String(value).trim())
        .filter(Boolean),
    ),
  );
}

export async function publishQuestionBankAssignments(formData: FormData) {
  const fallbackBankId = String(formData.get("bankId") ?? "");
  const fallbackPath = fallbackBankId
    ? `/teacher/publish?sourceBankId=${encodeURIComponent(fallbackBankId)}`
    : "/teacher/publish";

  try {
    await requireTeacher();
    const parsed = publishQuestionBankAssignmentsSchema.parse(
      Object.fromEntries(formData),
    );
    const selectedBankQuestionIds = uniqueStrings(
      formData.getAll("bankQuestionIds"),
    );
    const selectedClassroomIds = uniqueStrings(formData.getAll("classroomIds"));

    if (!selectedBankQuestionIds.length) {
      throw new Error("Choose at least one approved bank question.");
    }

    if (!selectedClassroomIds.length) {
      throw new Error("Choose at least one classroom target.");
    }

    const supabase = await createClient();
    const created: Array<{ assignmentId: string; classroomId: string }> = [];

    for (const classroomId of selectedClassroomIds) {
      const { data: assignmentId, error } = await supabase.rpc(
        "create_assignment_from_bank",
        {
          p_assign_now: parsed.publishMode === "assigned",
          p_assignment_due_at: normalizeDueAt(parsed.dueAt),
          p_assignment_instructions: parsed.instructions || null,
          p_assignment_title: parsed.title,
          p_selected_bank_question_ids: selectedBankQuestionIds,
          p_target_bank_id: parsed.bankId,
          p_target_classroom_id: classroomId,
        },
      );

      if (error) {
        const completed = created.length
          ? ` ${created.length} assignment(s) were created before the failure; review the selected classrooms.`
          : "";
        throw new Error(`${error.message}.${completed}`);
      }

      if (!assignmentId) {
        throw new Error("Assignment was not created from this bank.");
      }

      created.push({ assignmentId, classroomId });
      revalidatePath(`/teacher/classrooms/${classroomId}`);
      revalidatePath(`/teacher/classrooms/${classroomId}/assignments`);
      revalidatePath(
        `/teacher/classrooms/${classroomId}/assignments/${assignmentId}`,
      );
    }

    revalidatePath("/teacher/publish");
    revalidatePath("/student/work");
    revalidatePath(`/teacher/banks/${parsed.bankId}`);
    revalidatePath(`/teacher/banks/${parsed.bankId}/questions`);

    const firstCreated = created[0];
    const successPath =
      created.length === 1 && firstCreated
        ? `/teacher/classrooms/${firstCreated.classroomId}/assignments/${firstCreated.assignmentId}`
        : `/teacher/publish?sourceBankId=${encodeURIComponent(parsed.bankId)}`;

    redirectWithSaved(
      successPath,
      parsed.publishMode === "assigned"
        ? `Assigned selected bank content to ${created.length} classroom(s). Students see assignment items only.`
        : `Saved ${created.length} teacher draft assignment(s). Students cannot see drafts.`,
    );
  } catch (error) {
    redirectWithError(fallbackPath, formatActionError(error));
  }
}
