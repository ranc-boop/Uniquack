"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  formatActionError,
  redirectWithError,
  redirectWithSaved,
} from "@/lib/actions/feedback";
import { requireTeacher } from "@/lib/auth/guards";
import { getTeacherQuestionBankDetail } from "@/lib/question-banks";
import { createClient } from "@/lib/supabase/server";
import {
  canPublishFromBank,
  listPublishableBankQuestions,
  verifyPublishableSelection,
} from "@/lib/teacher-publish";

const publishQuestionBankAssignmentsSchema = z.object({
  bankId: z.string().uuid(),
  clientRequestKey: z.string().uuid(),
  dueAt: z.string().trim().optional().default(""),
  instructions: z.string().trim().max(4000).optional().default(""),
  publishMode: z.enum(["assigned", "draft"]).default("draft"),
  sourceType: z.string().trim().optional().default("bank"),
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
    const profile = await requireTeacher();
    const parsed = publishQuestionBankAssignmentsSchema.parse(
      Object.fromEntries(formData),
    );
    const selectedBankQuestionIds = uniqueStrings(
      formData.getAll("bankQuestionIds"),
    );
    const selectedClassroomIds = uniqueStrings(formData.getAll("classroomIds"));

    if (!selectedBankQuestionIds.length) {
      throw new Error("Choose at least one approved Library question.");
    }

    if (!selectedClassroomIds.length) {
      throw new Error("Choose one classroom target.");
    }

    if (selectedClassroomIds.length !== 1) {
      throw new Error(
        "Create one classroom delivery at a time so every result is clear and recoverable.",
      );
    }

    const supabase = await createClient();
    const bankDetail = await getTeacherQuestionBankDetail({
      bankId: parsed.bankId,
      profileId: profile.id,
      supabase,
    });

    if (!bankDetail || bankDetail.bank.status !== "active") {
      throw new Error("Selected source Library is not active.");
    }

    if (!canPublishFromBank(bankDetail.currentUserRole)) {
      throw new Error("Only Library owners and editors can create assignments.");
    }

    const publishableQuestions = await listPublishableBankQuestions({
      bankId: parsed.bankId,
      supabase,
    });
    verifyPublishableSelection({
      questions: publishableQuestions,
      selectedBankQuestionIds,
    });
    const { data: classrooms, error: classroomError } = await supabase
      .from("classrooms")
      .select("id, organization_id, status")
      .in("id", selectedClassroomIds)
      .eq("status", "active");

    if (classroomError) {
      throw new Error(classroomError.message);
    }

    if ((classrooms ?? []).length !== selectedClassroomIds.length) {
      throw new Error(
        "One or more selected classrooms are unavailable or not manageable.",
      );
    }

    if (
      (classrooms ?? []).some(
        (classroom) =>
          classroom.organization_id !== bankDetail.bank.organization_id,
      )
    ) {
      throw new Error("Selected classrooms must belong to the source Library organization.");
    }

    const classroomId = selectedClassroomIds[0]!;
    const { data: assignmentId, error } = await supabase.rpc(
      "create_assignment_from_bank",
      {
        p_assign_now: parsed.publishMode === "assigned",
        p_assignment_due_at: normalizeDueAt(parsed.dueAt),
        p_assignment_instructions: parsed.instructions || null,
        p_assignment_title: parsed.title,
        p_client_request_key: parsed.clientRequestKey,
        p_selected_bank_question_ids: selectedBankQuestionIds,
        p_target_bank_id: parsed.bankId,
        p_target_classroom_id: classroomId,
      },
    );

    if (error) {
      throw new Error(error.message);
    }

    if (!assignmentId) {
      throw new Error("Assignment was not created from this Library.");
    }

    revalidatePath(`/teacher/classrooms/${classroomId}`);
    revalidatePath(`/teacher/classrooms/${classroomId}/assignments`);
    revalidatePath(
      `/teacher/classrooms/${classroomId}/assignments/${assignmentId}`,
    );
    revalidatePath("/teacher/publish");
    revalidatePath("/student/work");
    revalidatePath(`/teacher/banks/${parsed.bankId}`);
    revalidatePath(`/teacher/banks/${parsed.bankId}/questions`);

    redirectWithSaved(
      `/teacher/classrooms/${classroomId}/assignments/${assignmentId}`,
      parsed.publishMode === "assigned"
        ? "Assigned selected Library content to one classroom. Students see Assignment items only."
        : "Saved one teacher draft Assignment. Students cannot see drafts.",
    );
  } catch (error) {
    redirectWithError(fallbackPath, formatActionError(error));
  }
}
