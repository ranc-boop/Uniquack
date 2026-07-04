import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Assignment, AssignmentItem, Classroom, Question } from "@/types/database";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type TeacherAssignmentClassroom = Pick<
  Classroom,
  "created_at" | "description" | "id" | "name" | "organization_id" | "status" | "subject"
>;

export type TeacherAssignmentSummary = Pick<
  Assignment,
  | "assigned_at"
  | "classroom_id"
  | "created_at"
  | "due_at"
  | "id"
  | "instructions"
  | "status"
  | "title"
> & {
  itemCount: number;
};

export type TeacherAssignmentQuestion = Pick<
  Question,
  "difficulty_rating" | "id" | "question_code" | "question_type" | "status" | "title"
>;

export type TeacherAssignableQuestion = TeacherAssignmentQuestion & {
  contentPreview: string;
};

export type TeacherAssignmentItem = Pick<
  AssignmentItem,
  "id" | "item_type" | "order_index" | "points" | "question_id"
> & {
  question: TeacherAssignmentQuestion | null;
};

export type TeacherAssignmentProgressSummary = {
  completedCount: number;
  inProgressCount: number;
  latestPracticeSessionAt: string | null;
  notStartedCount: number;
  studentCount: number;
};

export type TeacherAssignmentDetail = TeacherAssignmentSummary & {
  classroom: TeacherAssignmentClassroom;
  items: TeacherAssignmentItem[];
  progressSummary: TeacherAssignmentProgressSummary;
};

export async function getManagedClassroom({
  classroomId,
  supabase,
}: {
  classroomId: string;
  supabase: SupabaseServerClient;
}) {
  const { data, error } = await supabase
    .from("classrooms")
    .select("id, organization_id, name, description, subject, status, created_at")
    .eq("id", classroomId)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data as TeacherAssignmentClassroom;
}

export async function listTeacherClassroomAssignments({
  classroomId,
  supabase,
}: {
  classroomId: string;
  supabase: SupabaseServerClient;
}): Promise<TeacherAssignmentSummary[]> {
  const { data: assignments, error } = await supabase
    .from("assignments")
    .select("id, classroom_id, title, instructions, status, assigned_at, due_at, created_at")
    .eq("classroom_id", classroomId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  const assignmentRows = (assignments ?? []) as Array<
    Omit<TeacherAssignmentSummary, "itemCount">
  >;
  const assignmentIds = assignmentRows.map((assignment) => assignment.id);
  const { data: items } = assignmentIds.length
    ? await supabase
        .from("assignment_items")
        .select("assignment_id, id")
        .in("assignment_id", assignmentIds)
    : { data: [] };
  const countByAssignmentId = new Map<string, number>();

  for (const item of items ?? []) {
    countByAssignmentId.set(
      item.assignment_id,
      (countByAssignmentId.get(item.assignment_id) ?? 0) + 1,
    );
  }

  return assignmentRows.map((assignment) => ({
    ...assignment,
    itemCount: countByAssignmentId.get(assignment.id) ?? 0,
  }));
}

export async function getTeacherAssignmentDetail({
  assignmentId,
  classroomId,
  supabase,
}: {
  assignmentId: string;
  classroomId: string;
  supabase: SupabaseServerClient;
}): Promise<TeacherAssignmentDetail | null> {
  const classroom = await getManagedClassroom({ classroomId, supabase });
  const { data: assignment, error } = await supabase
    .from("assignments")
    .select("id, classroom_id, title, instructions, status, assigned_at, due_at, created_at")
    .eq("id", assignmentId)
    .eq("classroom_id", classroomId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!assignment) {
    return null;
  }

  const { data: items, error: itemError } = await supabase
    .from("assignment_items")
    .select("id, item_type, order_index, points, question_id")
    .eq("assignment_id", assignmentId)
    .order("order_index", { ascending: true });

  if (itemError) {
    throw new Error(itemError.message);
  }

  const itemRows = (items ?? []) as Array<
    Pick<AssignmentItem, "id" | "item_type" | "order_index" | "points" | "question_id">
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
    ((questions ?? []) as TeacherAssignmentQuestion[]).map((question) => [
      question.id,
      question,
    ]),
  );
  const [{ data: members }, { data: progressRows }, { data: practiceLinks }] =
    await Promise.all([
      supabase
        .from("classroom_members")
        .select("user_id")
        .eq("classroom_id", classroomId)
        .eq("role", "student")
        .eq("status", "active"),
      supabase
        .from("student_assignment_progress")
        .select("student_id, status, updated_at")
        .eq("assignment_id", assignmentId),
      supabase
        .from("assignment_practice_sessions")
        .select("created_at")
        .eq("assignment_id", assignmentId)
        .order("created_at", { ascending: false })
        .limit(1),
    ]);
  const activeStudentIds = new Set((members ?? []).map((member) => member.user_id));
  const progressByStudentId = new Map(
    (progressRows ?? []).map((progress) => [progress.student_id, progress.status]),
  );
  let inProgressCount = 0;
  let completedCount = 0;

  for (const studentId of activeStudentIds) {
    const status = progressByStudentId.get(studentId);
    if (status === "completed") {
      completedCount += 1;
    } else if (status === "in_progress") {
      inProgressCount += 1;
    }
  }
  const studentCount = activeStudentIds.size;
  const progressSummary: TeacherAssignmentProgressSummary = {
    completedCount,
    inProgressCount,
    latestPracticeSessionAt: practiceLinks?.[0]?.created_at ?? null,
    notStartedCount: Math.max(0, studentCount - inProgressCount - completedCount),
    studentCount,
  };

  return {
    ...(assignment as Omit<TeacherAssignmentSummary, "itemCount">),
    classroom,
    itemCount: itemRows.length,
    items: itemRows.map((item) => ({
      ...item,
      question: item.question_id ? questionById.get(item.question_id) ?? null : null,
    })),
    progressSummary,
  };
}

export async function listAssignablePublishedQuestions({
  query,
  supabase,
}: {
  query?: string;
  supabase: SupabaseServerClient;
}): Promise<TeacherAssignableQuestion[]> {
  const normalizedQuery = (query ?? "").trim().replaceAll(",", " ").slice(0, 80);
  let builder = supabase
    .from("questions")
    .select(
      "id, question_code, title, content_html, question_type, difficulty_rating, status",
    )
    .eq("status", "published")
    .order("updated_at", { ascending: false })
    .limit(50);

  if (normalizedQuery) {
    const escaped = normalizedQuery.replaceAll("%", "\\%").replaceAll("_", "\\_");
    builder = builder.or(`title.ilike.%${escaped}%,question_code.ilike.%${escaped}%`);
  }

  const { data, error } = await builder;

  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as Array<TeacherAssignableQuestion & { content_html: string }>).map(
    (question) => ({
      difficulty_rating: question.difficulty_rating,
      id: question.id,
      question_code: question.question_code,
      question_type: question.question_type,
      status: question.status,
      title: question.title,
      contentPreview: question.content_html
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 160),
    }),
  );
}
