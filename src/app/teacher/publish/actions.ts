"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { redirectWithSaved } from "@/lib/actions/feedback";
import { requireTeacher } from "@/lib/auth/guards";
import { getTeacherQuestionBankDetail } from "@/lib/question-banks";
import { createClient } from "@/lib/supabase/server";
import type { AssignmentErrorCode } from "@/lib/teacher-assignment-error";
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

export type AssignmentComposerErrorField =
  | "classroom"
  | "content"
  | "dueAt"
  | "form"
  | "instructions"
  | "title";

export type AssignmentComposerActionState =
  | { status: "idle" }
  | {
      status: "error";
      code: AssignmentErrorCode | "request_failed";
      field: AssignmentComposerErrorField;
    };

class AssignmentInputError extends Error {
  constructor(
    readonly code: AssignmentErrorCode,
    readonly field: AssignmentComposerErrorField,
  ) {
    super(code);
  }
}

function normalizeDueAt(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const parsed = new Date(trimmed);

  if (Number.isNaN(parsed.getTime())) {
    throw new AssignmentInputError(
      "invalid_due_at",
      "dueAt",
    );
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

export async function publishQuestionBankAssignments(
  _previousState: AssignmentComposerActionState,
  formData: FormData,
): Promise<AssignmentComposerActionState> {
  try {
    const profile = await requireTeacher();
    const parsedResult = publishQuestionBankAssignmentsSchema.safeParse(
      Object.fromEntries(formData),
    );
    if (!parsedResult.success) {
      const issue = parsedResult.error.issues[0];
      const field =
        issue?.path[0] === "title" ||
        issue?.path[0] === "dueAt" ||
        issue?.path[0] === "instructions"
          ? issue.path[0]
          : "form";
      throw new AssignmentInputError(
        field === "title"
          ? "invalid_title"
          : "invalid_details",
        field,
      );
    }
    const parsed = parsedResult.data;
    const selectedBankQuestionIds = uniqueStrings(
      formData.getAll("bankQuestionIds"),
    );
    const selectedClassroomIds = uniqueStrings(formData.getAll("classroomIds"));

    if (!selectedBankQuestionIds.length) {
      throw new AssignmentInputError(
        "missing_content",
        "content",
      );
    }

    if (!selectedClassroomIds.length) {
      throw new AssignmentInputError(
        "missing_classroom",
        "classroom",
      );
    }

    if (selectedClassroomIds.length !== 1) {
      throw new AssignmentInputError(
        "multiple_classrooms",
        "classroom",
      );
    }

    const supabase = await createClient();
    const bankDetail = await getTeacherQuestionBankDetail({
      bankId: parsed.bankId,
      profileId: profile.id,
      supabase,
    });

    if (!bankDetail || bankDetail.bank.status !== "active") {
      throw new AssignmentInputError(
        "inactive_library",
        "content",
      );
    }

    if (!canPublishFromBank(bankDetail.currentUserRole)) {
      throw new AssignmentInputError("forbidden", "form");
    }

    const publishableQuestions = await listPublishableBankQuestions({
      bankId: parsed.bankId,
      supabase,
    });
    try {
      verifyPublishableSelection({
        questions: publishableQuestions,
        selectedBankQuestionIds,
      });
    } catch {
      throw new AssignmentInputError(
        "selection_unavailable",
        "content",
      );
    }
    const { data: classrooms, error: classroomError } = await supabase
      .from("classrooms")
      .select("id, organization_id, status")
      .in("id", selectedClassroomIds)
      .eq("status", "active");

    if (classroomError) {
      throw new Error("classroom_read_failed");
    }

    if ((classrooms ?? []).length !== selectedClassroomIds.length) {
      throw new AssignmentInputError(
        "classroom_unavailable",
        "classroom",
      );
    }

    if (
      (classrooms ?? []).some(
        (classroom) =>
          classroom.organization_id !== bankDetail.bank.organization_id,
      )
    ) {
      throw new AssignmentInputError(
        "classroom_organization_mismatch",
        "classroom",
      );
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
      throw new Error("assignment_create_failed");
    }

    if (!assignmentId) {
      throw new Error("assignment_create_missing");
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
    if (error instanceof AssignmentInputError) {
      return {
        code: error.code,
        field: error.field,
        status: "error",
      };
    }

    return {
      code: "request_failed",
      field: "form",
      status: "error",
    };
  }
}
