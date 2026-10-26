import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Assignment, AssignmentItem, Question } from "@/types/database";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

type AssignmentSummaryRow = Pick<
  Assignment,
  | "assigned_at"
  | "classroom_id"
  | "created_at"
  | "due_at"
  | "id"
  | "instructions"
  | "source_kind"
  | "status"
  | "title"
>;

type AssignmentProgressRow = {
  assignment_id: string;
  completed_at: string | null;
  started_at: string | null;
  status: "not_started" | "in_progress" | "completed";
  updated_at: string;
};

export type StudentWorkSummary = AssignmentSummaryRow & {
  classroomName: string;
  classroomSubject: string | null;
  itemCount: number;
  progress: AssignmentProgressRow | null;
  progressStatus: "not_started" | "in_progress" | "completed";
};

type StudentWorkQuestion = Pick<
  Question,
  "difficulty_rating" | "id" | "question_code" | "question_type" | "status" | "title"
>;

type StudentWorkItem = Pick<
  AssignmentItem,
  | "bank_question_id"
  | "id"
  | "item_type"
  | "order_index"
  | "points"
  | "question_id"
  | "source_bank_id"
> & {
  question: StudentWorkQuestion | null;
};

export type StudentWorkDetail = StudentWorkSummary & {
  items: StudentWorkItem[];
};

function progressStatus(progress: AssignmentProgressRow | null) {
  return progress?.status ?? "not_started";
}

export async function listStudentAssignedWork({
  studentId,
  supabase,
}: {
  studentId: string;
  supabase: SupabaseServerClient;
}): Promise<StudentWorkSummary[]> {
  const { data: memberships, error: membershipError } = await supabase
    .from("classroom_members")
    .select("classroom_id")
    .eq("user_id", studentId)
    .eq("role", "student")
    .eq("status", "active");

  if (membershipError) {
    throw new Error(membershipError.message);
  }

  const classroomIds = Array.from(
    new Set((memberships ?? []).map((membership) => membership.classroom_id)),
  );

  if (!classroomIds.length) {
    return [];
  }

  const { data: assignments, error: assignmentError } = await supabase
    .from("assignments")
    .select("id, classroom_id, title, instructions, source_kind, status, assigned_at, due_at, created_at")
    .in("classroom_id", classroomIds)
    .eq("status", "assigned")
    .order("due_at", { ascending: true })
    .order("created_at", { ascending: false });

  if (assignmentError) {
    throw new Error(assignmentError.message);
  }

  const assignmentRows = (assignments ?? []) as AssignmentSummaryRow[];
  const assignmentIds = assignmentRows.map((assignment) => assignment.id);

  if (!assignmentIds.length) {
    return [];
  }

  const [{ data: classrooms }, { data: progressRows }, { data: itemRows }] =
    await Promise.all([
      supabase
        .from("classrooms")
        .select("id, name, subject")
        .in("id", classroomIds),
      supabase
        .from("student_assignment_progress")
        .select("assignment_id, status, started_at, completed_at, updated_at")
        .eq("student_id", studentId)
        .in("assignment_id", assignmentIds),
      supabase
        .from("assignment_items")
        .select("assignment_id, id")
        .in("assignment_id", assignmentIds),
    ]);

  const classroomById = new Map(
    (classrooms ?? []).map((classroom) => [classroom.id, classroom]),
  );
  const progressByAssignmentId = new Map(
    ((progressRows ?? []) as AssignmentProgressRow[]).map((progress) => [
      progress.assignment_id,
      progress,
    ]),
  );
  const itemCountByAssignmentId = new Map<string, number>();

  for (const item of itemRows ?? []) {
    itemCountByAssignmentId.set(
      item.assignment_id,
      (itemCountByAssignmentId.get(item.assignment_id) ?? 0) + 1,
    );
  }

  return assignmentRows.map((assignment) => {
    const classroom = classroomById.get(assignment.classroom_id);
    const progress = progressByAssignmentId.get(assignment.id) ?? null;

    return {
      ...assignment,
      classroomName: classroom?.name ?? "Classroom",
      classroomSubject: classroom?.subject ?? null,
      itemCount: itemCountByAssignmentId.get(assignment.id) ?? 0,
      progress,
      progressStatus: progressStatus(progress),
    };
  });
}

export async function getStudentAssignedWorkDetail({
  assignmentId,
  studentId,
  supabase,
}: {
  assignmentId: string;
  studentId: string;
  supabase: SupabaseServerClient;
}): Promise<StudentWorkDetail | null> {
  const { data: assignment, error: assignmentError } = await supabase
    .from("assignments")
    .select("id, classroom_id, title, instructions, source_kind, status, assigned_at, due_at, created_at")
    .eq("id", assignmentId)
    .eq("status", "assigned")
    .maybeSingle();

  if (assignmentError) {
    throw new Error(assignmentError.message);
  }

  if (!assignment) {
    return null;
  }

  const assignmentRow = assignment as AssignmentSummaryRow;
  const [
    { data: classroom },
    { data: progress },
    { data: items, error: itemsError },
  ] = await Promise.all([
    supabase
      .from("classrooms")
      .select("id, name, subject")
      .eq("id", assignmentRow.classroom_id)
      .maybeSingle(),
    supabase
      .from("student_assignment_progress")
      .select("assignment_id, status, started_at, completed_at, updated_at")
      .eq("assignment_id", assignmentRow.id)
      .eq("student_id", studentId)
      .maybeSingle(),
      supabase
        .from("assignment_items")
        .select("id, item_type, order_index, points, question_id, bank_question_id, source_bank_id")
        .eq("assignment_id", assignmentRow.id)
        .order("order_index", { ascending: true }),
  ]);

  if (itemsError) {
    throw new Error(itemsError.message);
  }

  const itemRows = (items ?? []) as Array<
    Pick<
      AssignmentItem,
      | "bank_question_id"
      | "id"
      | "item_type"
      | "order_index"
      | "points"
      | "question_id"
      | "source_bank_id"
    >
  >;
  const questionIds = Array.from(
    new Set(itemRows.map((item) => item.question_id).filter(Boolean) as string[]),
  );
  const { data: questions } = questionIds.length
    ? await supabase
        .from("questions")
        .select("id, question_code, title, question_type, difficulty_rating, status")
        .in("id", questionIds)
    : { data: [] };
  const questionById = new Map(
    ((questions ?? []) as StudentWorkQuestion[]).map((question) => [
      question.id,
      question,
    ]),
  );
  const progressRow = (progress as AssignmentProgressRow | null) ?? null;

  return {
    ...assignmentRow,
    classroomName: classroom?.name ?? "Classroom",
    classroomSubject: classroom?.subject ?? null,
    itemCount: itemRows.length,
    items: itemRows.map((item) => ({
      ...item,
      question: item.question_id ? questionById.get(item.question_id) ?? null : null,
    })),
    progress: progressRow,
    progressStatus: progressStatus(progressRow),
  };
}
