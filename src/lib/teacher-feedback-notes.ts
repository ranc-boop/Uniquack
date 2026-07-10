import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { TeacherFeedbackNote } from "@/types/database";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

const MAX_ASSIGNMENT_FEEDBACK_NOTES = 120;
const MAX_STUDENT_SENT_FEEDBACK_NOTES = 60;

export type TeacherAssignmentFeedbackNote = Pick<
  TeacherFeedbackNote,
  | "author_id"
  | "body"
  | "classroom_id"
  | "created_at"
  | "id"
  | "practice_attempt_id"
  | "question_id"
  | "sent_at"
  | "status"
  | "student_id"
  | "updated_at"
  | "visibility"
>;

export type StudentSentFeedbackNote = Pick<
  TeacherFeedbackNote,
  "body" | "created_at" | "id" | "sent_at"
>;

export async function listTeacherAssignmentFeedbackNotes({
  assignmentId,
  classroomId,
  supabase,
}: {
  assignmentId: string;
  classroomId: string;
  supabase: SupabaseServerClient;
}): Promise<TeacherAssignmentFeedbackNote[]> {
  const { data, error } = await supabase
    .from("teacher_feedback_notes")
    .select(
      "id, classroom_id, student_id, question_id, practice_attempt_id, author_id, visibility, status, body, sent_at, created_at, updated_at",
    )
    .eq("assignment_id", assignmentId)
    .eq("classroom_id", classroomId)
    .order("updated_at", { ascending: false })
    .limit(MAX_ASSIGNMENT_FEEDBACK_NOTES);

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as TeacherAssignmentFeedbackNote[];
}

export async function listStudentSentAssignmentFeedbackNotes({
  assignmentId,
  studentId,
  supabase,
}: {
  assignmentId: string;
  studentId: string;
  supabase: SupabaseServerClient;
}): Promise<StudentSentFeedbackNote[]> {
  const { data, error } = await supabase
    .from("teacher_feedback_notes")
    .select("id, body, sent_at, created_at")
    .eq("assignment_id", assignmentId)
    .eq("student_id", studentId)
    .eq("visibility", "sent_to_student")
    .eq("status", "sent")
    .order("sent_at", { ascending: false })
    .limit(MAX_STUDENT_SENT_FEEDBACK_NOTES);

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as StudentSentFeedbackNote[];
}
