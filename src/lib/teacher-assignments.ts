import "server-only";

import { createClient } from "@/lib/supabase/server";
import type {
  Assignment,
  AssignmentItem,
  Classroom,
  Json,
  Profile,
  Question,
  StudentAssignmentProgress,
} from "@/types/database";

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
  | "source_kind"
  | "source_record_id"
  | "source_summary"
  | "status"
  | "title"
> & {
  itemCount: number;
  progressSummary: TeacherAssignmentProgressSummary;
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
  | "bank_question_id"
  | "id"
  | "item_type"
  | "order_index"
  | "points"
  | "question_id"
  | "source_bank_id"
> & {
  question: TeacherAssignmentQuestion | null;
};

export type TeacherAssignmentProgressSummary = {
  completedCount: number;
  inProgressCount: number;
  latestPracticeSessionAt: string | null;
  notStartedCount: number;
  linkedPracticeSessionCount: number;
  studentCount: number;
};

export type TeacherAssignmentStudentProgress = {
  completedAt: string | null;
  displayName: string;
  email: string | null;
  evidenceSummary: Json;
  latestPracticeSessionAt: string | null;
  linkedPracticeSessionCount: number;
  lastPracticeSessionId: string | null;
  practiceAttemptCount: number;
  practiceCorrectCount: number;
  profile: Pick<Profile, "display_name" | "email" | "full_name" | "id" | "role" | "username"> | null;
  startedAt: string | null;
  status: StudentAssignmentProgress["status"];
  studentId: string;
  updatedAt: string | null;
};

export type TeacherAssignmentDetail = TeacherAssignmentSummary & {
  classroom: TeacherAssignmentClassroom;
  items: TeacherAssignmentItem[];
  progressSummary: TeacherAssignmentProgressSummary;
  studentProgressRows: TeacherAssignmentStudentProgress[];
};

function profileDisplayName(profile: TeacherAssignmentStudentProgress["profile"]) {
  return (
    profile?.display_name ||
    profile?.full_name ||
    profile?.username ||
    profile?.email ||
    "Unknown student"
  );
}

function summarizeProgress({
  activeStudentIds,
  practiceLinks,
  progressRows,
}: {
  activeStudentIds: Set<string>;
  practiceLinks: Array<{ assignment_id?: string | null; created_at: string; student_id: string }>;
  progressRows: Array<Pick<StudentAssignmentProgress, "status" | "student_id">>;
}): TeacherAssignmentProgressSummary {
  const progressByStudentId = new Map(
    progressRows.map((progress) => [progress.student_id, progress.status]),
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
  const latestPracticeSessionAt =
    practiceLinks
      .map((link) => link.created_at)
      .filter(Boolean)
      .sort()
      .at(-1) ?? null;

  return {
    completedCount,
    inProgressCount,
    latestPracticeSessionAt,
    linkedPracticeSessionCount: practiceLinks.length,
    notStartedCount: Math.max(0, studentCount - inProgressCount - completedCount),
    studentCount,
  };
}

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

export async function listManagedClassrooms({
  supabase,
}: {
  supabase: SupabaseServerClient;
}): Promise<TeacherAssignmentClassroom[]> {
  const { data, error } = await supabase
    .from("classrooms")
    .select("id, organization_id, name, description, subject, status, created_at")
    .eq("status", "active")
    .order("updated_at", { ascending: false })
    .limit(100);

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as TeacherAssignmentClassroom[];
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
    .select(
      "id, classroom_id, title, instructions, status, assigned_at, due_at, source_kind, source_record_id, source_summary, created_at",
    )
    .eq("classroom_id", classroomId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  const assignmentRows = (assignments ?? []) as Array<
    Omit<TeacherAssignmentSummary, "itemCount" | "progressSummary">
  >;
  const assignmentIds = assignmentRows.map((assignment) => assignment.id);
  const [{ data: items }, { data: members }, { data: progressRows }, { data: practiceLinks }] =
    await Promise.all([
      assignmentIds.length
        ? supabase
            .from("assignment_items")
            .select("assignment_id, id")
            .in("assignment_id", assignmentIds)
        : Promise.resolve({ data: [] }),
      supabase
        .from("classroom_members")
        .select("user_id")
        .eq("classroom_id", classroomId)
        .eq("role", "student")
        .eq("status", "active"),
      assignmentIds.length
        ? supabase
            .from("student_assignment_progress")
            .select("assignment_id, student_id, status")
            .in("assignment_id", assignmentIds)
        : Promise.resolve({ data: [] }),
      assignmentIds.length
        ? supabase
            .from("assignment_practice_sessions")
            .select("assignment_id, student_id, created_at")
            .in("assignment_id", assignmentIds)
        : Promise.resolve({ data: [] }),
    ]);
  const countByAssignmentId = new Map<string, number>();
  const activeStudentIds = new Set((members ?? []).map((member) => member.user_id));
  const progressByAssignmentId = new Map<
    string,
    Array<Pick<StudentAssignmentProgress, "status" | "student_id">>
  >();
  const linksByAssignmentId = new Map<
    string,
    Array<{ assignment_id?: string | null; created_at: string; student_id: string }>
  >();

  for (const item of items ?? []) {
    countByAssignmentId.set(
      item.assignment_id,
      (countByAssignmentId.get(item.assignment_id) ?? 0) + 1,
    );
  }
  for (const progress of progressRows ?? []) {
    const rows = progressByAssignmentId.get(progress.assignment_id) ?? [];
    rows.push(progress);
    progressByAssignmentId.set(progress.assignment_id, rows);
  }
  for (const link of practiceLinks ?? []) {
    if (!link.assignment_id) continue;
    const links = linksByAssignmentId.get(link.assignment_id) ?? [];
    links.push(link);
    linksByAssignmentId.set(link.assignment_id, links);
  }

  return assignmentRows.map((assignment) => ({
    ...assignment,
    itemCount: countByAssignmentId.get(assignment.id) ?? 0,
    progressSummary: summarizeProgress({
      activeStudentIds,
      practiceLinks: linksByAssignmentId.get(assignment.id) ?? [],
      progressRows: progressByAssignmentId.get(assignment.id) ?? [],
    }),
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
    .select(
      "id, classroom_id, title, instructions, status, assigned_at, due_at, source_kind, source_record_id, source_summary, created_at",
    )
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
    .select("id, item_type, order_index, points, question_id, bank_question_id, source_bank_id")
    .eq("assignment_id", assignmentId)
    .order("order_index", { ascending: true });

  if (itemError) {
    throw new Error(itemError.message);
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
        .select(
          "student_id, status, started_at, completed_at, last_practice_session_id, evidence_summary, updated_at",
        )
        .eq("assignment_id", assignmentId),
      supabase
        .from("assignment_practice_sessions")
        .select("student_id, practice_session_id, created_at")
        .eq("assignment_id", assignmentId)
        .order("created_at", { ascending: false })
    ]);
  const activeStudentIds = new Set((members ?? []).map((member) => member.user_id));
  const activeStudentIdList = Array.from(activeStudentIds);
  const progressRowList = (progressRows ?? []) as Array<
    Pick<
      StudentAssignmentProgress,
      | "completed_at"
      | "evidence_summary"
      | "last_practice_session_id"
      | "started_at"
      | "status"
      | "student_id"
      | "updated_at"
    >
  >;
  const practiceLinkRows = (practiceLinks ?? []) as Array<{
    created_at: string;
    practice_session_id: string;
    student_id: string;
  }>;
  const [{ data: profiles }, { data: practiceSessions }, { data: practiceAttempts }] =
    await Promise.all([
      activeStudentIdList.length
        ? supabase
            .from("profiles")
            .select("id, username, email, full_name, display_name, role")
            .in("id", activeStudentIdList)
        : Promise.resolve({ data: [] }),
      practiceLinkRows.length
        ? supabase
            .from("practice_sessions")
            .select("id, user_id, last_activity_at, status, title")
            .in(
              "id",
              Array.from(new Set(practiceLinkRows.map((link) => link.practice_session_id))),
            )
        : Promise.resolve({ data: [] }),
      practiceLinkRows.length
        ? supabase
            .from("practice_attempts")
            .select("id, user_id, session_id, is_correct")
            .in(
              "session_id",
              Array.from(new Set(practiceLinkRows.map((link) => link.practice_session_id))),
            )
        : Promise.resolve({ data: [] }),
    ]);
  const progressByStudentId = new Map(
    progressRowList.map((progress) => [progress.student_id, progress]),
  );
  const profileById = new Map(
    ((profiles ?? []) as TeacherAssignmentStudentProgress["profile"][]).map((profile) => [
      profile?.id ?? "",
      profile,
    ]),
  );
  const practiceSessionById = new Map(
    ((practiceSessions ?? []) as Array<{ id: string; last_activity_at: string | null }>).map(
      (session) => [session.id, session],
    ),
  );
  const linksByStudentId = new Map<string, typeof practiceLinkRows>();
  const attemptCountsByStudentId = new Map<string, { correct: number; total: number }>();

  for (const link of practiceLinkRows) {
    const links = linksByStudentId.get(link.student_id) ?? [];
    links.push(link);
    linksByStudentId.set(link.student_id, links);
  }
  for (const attempt of (practiceAttempts ?? []) as Array<{
    is_correct: boolean | null;
    user_id: string;
  }>) {
    const counts = attemptCountsByStudentId.get(attempt.user_id) ?? { correct: 0, total: 0 };
    counts.total += 1;
    if (attempt.is_correct === true) {
      counts.correct += 1;
    }
    attemptCountsByStudentId.set(attempt.user_id, counts);
  }

  const studentProgressRows = activeStudentIdList
    .map((studentId) => {
      const progress = progressByStudentId.get(studentId);
      const links = linksByStudentId.get(studentId) ?? [];
      const latestPracticeSessionAt =
        links
          .map((link) => {
            const session = practiceSessionById.get(link.practice_session_id);
            return session?.last_activity_at ?? link.created_at;
          })
          .filter(Boolean)
          .sort()
          .at(-1) ?? null;
      const attemptCounts = attemptCountsByStudentId.get(studentId) ?? { correct: 0, total: 0 };
      const profile = profileById.get(studentId) ?? null;

      return {
        completedAt: progress?.completed_at ?? null,
        displayName: profileDisplayName(profile),
        email: profile?.email ?? null,
        evidenceSummary: progress?.evidence_summary ?? {},
        latestPracticeSessionAt,
        linkedPracticeSessionCount: links.length,
        lastPracticeSessionId: progress?.last_practice_session_id ?? links[0]?.practice_session_id ?? null,
        practiceAttemptCount: attemptCounts.total,
        practiceCorrectCount: attemptCounts.correct,
        profile,
        startedAt: progress?.started_at ?? null,
        status: progress?.status ?? "not_started",
        studentId,
        updatedAt: progress?.updated_at ?? null,
      } satisfies TeacherAssignmentStudentProgress;
    })
    .sort((a, b) => {
      const statusOrder: Record<StudentAssignmentProgress["status"], number> = {
        completed: 2,
        in_progress: 0,
        not_started: 1,
      };
      const statusDelta = statusOrder[a.status] - statusOrder[b.status];
      return statusDelta || a.displayName.localeCompare(b.displayName);
    });
  const progressSummary = summarizeProgress({
    activeStudentIds,
    practiceLinks: practiceLinkRows,
    progressRows: progressRowList,
  });

  return {
    ...(assignment as Omit<TeacherAssignmentSummary, "itemCount" | "progressSummary">),
    classroom,
    itemCount: itemRows.length,
    items: itemRows.map((item) => ({
      ...item,
      question: item.question_id ? questionById.get(item.question_id) ?? null : null,
    })),
    progressSummary,
    studentProgressRows,
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
