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

const optionalUuid = z
  .string()
  .trim()
  .optional()
  .default("")
  .transform((value) => value || null)
  .refine((value) => value === null || z.string().uuid().safeParse(value).success, {
    message: "Attachment reference must be valid.",
  });

const feedbackNoteSchema = z.object({
  assignmentId: z.string().uuid(),
  body: z.string().trim().min(1).max(4000),
  classroomId: z.string().uuid(),
  practiceAttemptId: optionalUuid,
  questionId: optionalUuid,
  studentId: z.string().uuid(),
});

type FeedbackVisibility = "private_teacher" | "sent_to_student";

async function assertFeedbackScope({
  assignmentId,
  classroomId,
  practiceAttemptId,
  questionId,
  studentId,
}: z.infer<typeof feedbackNoteSchema>) {
  const supabase = await createClient();
  const { data: assignment, error: assignmentError } = await supabase
    .from("assignments")
    .select("id, organization_id, classroom_id")
    .eq("id", assignmentId)
    .eq("classroom_id", classroomId)
    .maybeSingle();

  if (assignmentError) {
    throw new Error(assignmentError.message);
  }
  if (!assignment) {
    throw new Error("You cannot manage feedback for this assignment.");
  }

  const { data: membership, error: membershipError } = await supabase
    .from("classroom_members")
    .select("user_id")
    .eq("classroom_id", classroomId)
    .eq("user_id", studentId)
    .eq("role", "student")
    .eq("status", "active")
    .maybeSingle();

  if (membershipError) {
    throw new Error(membershipError.message);
  }
  if (!membership) {
    throw new Error("Feedback can be sent only to an active student in this classroom.");
  }

  if (questionId) {
    const { data: assignmentItem, error: assignmentItemError } = await supabase
      .from("assignment_items")
      .select("id")
      .eq("assignment_id", assignmentId)
      .eq("question_id", questionId)
      .eq("item_type", "question")
      .maybeSingle();

    if (assignmentItemError) {
      throw new Error(assignmentItemError.message);
    }
    if (!assignmentItem) {
      throw new Error("The selected question is not part of this assignment.");
    }
  }

  if (practiceAttemptId) {
    const { data: attempt, error: attemptError } = await supabase
      .from("practice_attempts")
      .select("id, user_id, session_id, source_question_id")
      .eq("id", practiceAttemptId)
      .maybeSingle();

    if (attemptError) {
      throw new Error(attemptError.message);
    }
    if (!attempt || attempt.user_id !== studentId) {
      throw new Error("The selected attempt does not belong to this student.");
    }
    if (questionId && attempt.source_question_id !== questionId) {
      throw new Error("The selected attempt does not match the selected assignment question.");
    }

    const { data: assignmentSession, error: assignmentSessionError } = await supabase
      .from("assignment_practice_sessions")
      .select("practice_session_id")
      .eq("assignment_id", assignmentId)
      .eq("student_id", studentId)
      .eq("practice_session_id", attempt.session_id)
      .maybeSingle();

    if (assignmentSessionError) {
      throw new Error(assignmentSessionError.message);
    }
    if (!assignmentSession) {
      throw new Error("The selected attempt is not linked to this assignment.");
    }
  }

  return { assignment, supabase };
}

async function createTeacherFeedbackNote(
  formData: FormData,
  visibility: FeedbackVisibility,
) {
  const fallbackClassroomId = String(formData.get("classroomId") ?? "");
  const fallbackAssignmentId = String(formData.get("assignmentId") ?? "");
  const fallbackPath =
    fallbackClassroomId && fallbackAssignmentId
      ? `/teacher/classrooms/${fallbackClassroomId}/assignments/${fallbackAssignmentId}`
      : "/teacher/classrooms";

  try {
    const profile = await requireTeacher();
    const parsed = feedbackNoteSchema.parse(Object.fromEntries(formData));
    const { assignment, supabase } = await assertFeedbackScope(parsed);
    const sent = visibility === "sent_to_student";
    const { error } = await supabase.from("teacher_feedback_notes").insert({
      assignment_id: parsed.assignmentId,
      author_id: profile.id,
      body: parsed.body,
      classroom_id: parsed.classroomId,
      organization_id: assignment.organization_id,
      practice_attempt_id: parsed.practiceAttemptId,
      question_id: parsed.questionId,
      sent_at: sent ? new Date().toISOString() : null,
      status: sent ? "sent" : "draft",
      student_id: parsed.studentId,
      visibility,
    });

    if (error) {
      throw new Error(error.message);
    }

    revalidatePath(fallbackPath);
    revalidatePath(`/teacher/classrooms/${parsed.classroomId}`);
    revalidatePath("/teacher/progress");
    revalidatePath("/student/work");
    revalidatePath(`/student/work/${parsed.assignmentId}`);
    redirectWithSaved(
      fallbackPath,
      sent ? "Feedback sent to the student." : "Private teacher note saved.",
    );
  } catch (error) {
    redirectWithError(fallbackPath, formatActionError(error));
  }
}

export async function savePrivateTeacherFeedbackNote(formData: FormData) {
  return createTeacherFeedbackNote(formData, "private_teacher");
}

export async function sendTeacherFeedbackNote(formData: FormData) {
  return createTeacherFeedbackNote(formData, "sent_to_student");
}
