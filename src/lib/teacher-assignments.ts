import "server-only";

import { createClient } from "@/lib/supabase/server";
import type {
  Assignment,
  AssignmentItem,
  Classroom,
  Json,
  PracticeAttempt,
  Profile,
  Question,
  StudentAssignmentProgress,
} from "@/types/database";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

type TeacherAssignmentClassroom = Pick<
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

type TeacherAssignmentQuestion = Pick<
  Question,
  | "difficulty_rating"
  | "id"
  | "question_code"
  | "question_type"
  | "status"
  | "title"
>;

type TeacherAssignmentEvidenceQuestion = TeacherAssignmentQuestion &
  Pick<
    Question,
    "content_html" | "deleted_at" | "owner_bank_id" | "published_at"
  >;

type TeacherAssignableQuestion = TeacherAssignmentQuestion & {
  contentPreview: string;
};

type TeacherAssignmentItem = Pick<
  AssignmentItem,
  | "bank_question_id"
  | "id"
  | "item_type"
  | "order_index"
  | "points"
  | "question_id"
  | "source_bank_id"
> & {
  question: TeacherAssignmentEvidenceQuestion | null;
  readinessIssues: string[];
};

type TeacherAssignmentProgressSummary = {
  completedCount: number;
  inProgressCount: number;
  latestPracticeSessionAt: string | null;
  notStartedCount: number;
  linkedPracticeSessionCount: number;
  studentCount: number;
};

type TeacherAssignmentStudentProgress = {
  completedAt: string | null;
  displayName: string;
  email: string | null;
  evidenceSummary: Json;
  latestPracticeSessionAt: string | null;
  linkedPracticeSessionCount: number;
  lastPracticeSessionId: string | null;
  practiceAttemptCount: number;
  practiceCorrectCount: number;
  practiceHintCount: number;
  practiceIncorrectCount: number;
  profile: Pick<Profile, "display_name" | "email" | "full_name" | "id" | "role" | "username"> | null;
  recentAttempts: TeacherAssignmentAttempt[];
  startedAt: string | null;
  status: StudentAssignmentProgress["status"];
  studentId: string;
  updatedAt: string | null;
};

type TeacherAssignmentAttempt = {
  answerPreview: string;
  createdAt: string;
  feedbackSummary: string | null;
  gradingMode: string;
  hintCount: number;
  id: string;
  isCorrect: boolean | null;
  questionId: string;
  questionTitle: string;
  roundId: string;
  score: number | null;
  sessionId: string;
};

type TeacherAssignmentQuestionPerformance = {
  assignedStudentCount: number;
  assignmentItemId: string;
  attemptCount: number;
  attentionStatus: "mixed_results" | "needs_attention" | "no_attempts" | "on_track" | "unavailable";
  correctAttemptCount: number;
  incorrectAttemptCount: number;
  latestActivityAt: string | null;
  question: TeacherAssignmentEvidenceQuestion | null;
  sourceLabel: string;
  studentAttemptedCount: number;
};

type TeacherAssignmentEvidenceSummary = {
  attemptCount: number;
  completionRate: number | null;
  correctAttemptCount: number;
  incorrectAttemptCount: number;
  latestActivityAt: string | null;
  studentsNeedingAttentionCount: number;
};

export type TeacherAssignmentDetail = TeacherAssignmentSummary & {
  classroom: TeacherAssignmentClassroom;
  evidenceSummary: TeacherAssignmentEvidenceSummary;
  items: TeacherAssignmentItem[];
  progressSummary: TeacherAssignmentProgressSummary;
  questionPerformanceRows: TeacherAssignmentQuestionPerformance[];
  studentProgressRows: TeacherAssignmentStudentProgress[];
};

export type TeacherAssignmentStudentPreview = Pick<
  Assignment,
  "assigned_at" | "due_at" | "id" | "instructions" | "status" | "title"
> & {
  classroom: Pick<Classroom, "id" | "name" | "subject">;
  items: Array<
    Pick<AssignmentItem, "id" | "order_index" | "points"> & {
      question: Pick<
        Question,
        | "content_html"
        | "difficulty_rating"
        | "id"
        | "question_type"
        | "title"
      > | null;
    }
  >;
};

export type AssignmentDeliveryQuarantine = {
  previousAssignedAt: string | null;
  quarantinedAt: string | null;
};

export function getAssignmentDeliveryQuarantine(
  summary: Json,
): AssignmentDeliveryQuarantine | null {
  if (!summary || typeof summary !== "object" || Array.isArray(summary)) {
    return null;
  }

  const record = summary as Record<string, Json | undefined>;
  if (
    record.deliveryQuarantineReason !== "unreviewed_library_question" ||
    typeof record.deliveryResumedAt === "string"
  ) {
    return null;
  }

  return {
    previousAssignedAt:
      typeof record.deliveryQuarantinedPreviousAssignedAt === "string"
        ? record.deliveryQuarantinedPreviousAssignedAt
        : null,
    quarantinedAt:
      typeof record.deliveryQuarantinedAt === "string"
        ? record.deliveryQuarantinedAt
        : null,
  };
}

const MAX_ASSIGNMENT_ITEMS = 120;
const MAX_ASSIGNMENT_STUDENTS = 320;
const MAX_ASSIGNMENT_PROGRESS_ROWS = 360;
const MAX_ASSIGNMENT_PRACTICE_LINKS = 360;
const MAX_ASSIGNMENT_ATTEMPTS = 720;
const MAX_RECENT_ATTEMPTS_PER_STUDENT = 6;

function profileDisplayName(profile: TeacherAssignmentStudentProgress["profile"]) {
  return (
    profile?.display_name ||
    profile?.full_name ||
    profile?.username ||
    profile?.email ||
    "Unknown student"
  );
}

function latestIso(values: Array<string | null | undefined>) {
  return values
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1) ?? null;
}

function compactEvidenceText(value: unknown, maxLength = 360) {
  const raw = typeof value === "string" ? value : String(value ?? "");
  const normalized = raw
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) return "";
  if (/^data:/i.test(normalized) || /base64/i.test(normalized)) {
    return "Submitted binary content omitted.";
  }

  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 1)}...` : normalized;
}

function answerPreview(value: unknown) {
  if (typeof value === "string") {
    return compactEvidenceText(value, 480) || "No answer submitted.";
  }

  if (Array.isArray(value)) {
    const preview = value
      .slice(0, 8)
      .map((item) => compactEvidenceText(item, 120))
      .filter(Boolean)
      .join(", ");
    return preview || "No answer submitted.";
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const preferred = record.answer ?? record.value ?? record.text ?? record.selectedOptionId;
    if (preferred !== undefined) {
      return answerPreview(preferred);
    }

    try {
      return compactEvidenceText(JSON.stringify(record), 480) || "No answer submitted.";
    } catch {
      return "Submitted answer could not be displayed.";
    }
  }

  return "No answer submitted.";
}

function feedbackSummary(explanation: unknown, result: unknown) {
  const explanationText = compactEvidenceText(explanation, 360);
  if (explanationText) return explanationText;

  if (!result || typeof result !== "object" || Array.isArray(result)) {
    return null;
  }

  const record = result as Record<string, unknown>;
  return (
    compactEvidenceText(
      record.judgmentReason ?? record.explanation ?? record.feedback ?? record.message,
      360,
    ) || null
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
  const linkedStudentIds = new Set(practiceLinks.map((link) => link.student_id));
  let inProgressCount = 0;
  let completedCount = 0;

  for (const studentId of activeStudentIds) {
    const status = progressByStudentId.get(studentId);
    if (status === "completed") {
      completedCount += 1;
    } else if (status === "in_progress" || linkedStudentIds.has(studentId)) {
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

export async function getTeacherAssignmentStudentPreview({
  assignmentId,
  classroomId,
  supabase,
}: {
  assignmentId: string;
  classroomId: string;
  supabase: SupabaseServerClient;
}): Promise<TeacherAssignmentStudentPreview | null> {
  const classroom = await getManagedClassroom({ classroomId, supabase });
  const { data: assignment, error } = await supabase
    .from("assignments")
    .select("id, title, instructions, status, assigned_at, due_at")
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
    .select("id, order_index, points, question_id")
    .eq("assignment_id", assignmentId)
    .order("order_index", { ascending: true })
    .limit(MAX_ASSIGNMENT_ITEMS);

  if (itemError) {
    throw new Error(itemError.message);
  }

  const itemRows = (items ?? []) as Array<
    Pick<AssignmentItem, "id" | "order_index" | "points" | "question_id">
  >;
  const questionIds = Array.from(
    new Set(itemRows.map((item) => item.question_id).filter(Boolean) as string[]),
  );
  const { data: questions, error: questionError } = questionIds.length
    ? await supabase
        .from("questions")
        .select(
          "id, title, content_html, question_type, difficulty_rating",
        )
        .in("id", questionIds)
        .limit(MAX_ASSIGNMENT_ITEMS)
    : { data: [], error: null };

  if (questionError) {
    throw new Error(questionError.message);
  }

  const questionById = new Map(
    (
      (questions ?? []) as Array<
        Pick<
          Question,
          | "content_html"
          | "difficulty_rating"
          | "id"
          | "question_type"
          | "title"
        >
      >
    ).map((question) => [question.id, question]),
  );

  return {
    ...assignment,
    classroom: {
      id: classroom.id,
      name: classroom.name,
      subject: classroom.subject,
    },
    items: itemRows.map(({ question_id, ...item }) => ({
      ...item,
      question: question_id ? questionById.get(question_id) ?? null : null,
    })),
  };
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
    .order("order_index", { ascending: true })
    .limit(MAX_ASSIGNMENT_ITEMS);

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
        .select(
          "id, question_code, title, content_html, question_type, difficulty_rating, status, owner_bank_id, published_at, deleted_at",
        )
        .in("id", questionIds)
        .limit(MAX_ASSIGNMENT_ITEMS)
    : { data: [] };
  const questionById = new Map(
    ((questions ?? []) as TeacherAssignmentEvidenceQuestion[]).map((question) => [
      question.id,
      question,
    ]),
  );
  const bankQuestionIds = Array.from(
    new Set(
      itemRows
        .map((item) => item.bank_question_id)
        .filter(Boolean) as string[],
    ),
  );
  const { data: bankQuestions, error: bankQuestionError } = bankQuestionIds.length
    ? await supabase
        .from("bank_questions")
        .select("id, bank_id, question_id, status")
        .in("id", bankQuestionIds)
    : { data: [], error: null };

  if (bankQuestionError) {
    throw new Error(bankQuestionError.message);
  }
  const bankQuestionById = new Map(
    (bankQuestions ?? []).map((bankQuestion) => [bankQuestion.id, bankQuestion]),
  );

  function readinessIssues(
    item: (typeof itemRows)[number],
    question: TeacherAssignmentEvidenceQuestion | null,
  ) {
    if (
      question?.owner_bank_id === null ||
      (!question && !item.source_bank_id && !item.bank_question_id)
    ) {
      return [];
    }
    const issues: string[] = [];
    const bankQuestion = item.bank_question_id
      ? bankQuestionById.get(item.bank_question_id)
      : null;

    if (!question) issues.push("Question is unavailable");
    if (question?.status !== "review") issues.push("Question needs Library Review");
    if (question?.deleted_at) issues.push("Question is archived or deleted");
    if (question?.published_at) issues.push("Bank-owned question has invalid publish state");
    if (!item.bank_question_id) issues.push("Library item link is missing");
    if (!item.source_bank_id) issues.push("Source Library link is missing");
    if (
      question?.owner_bank_id &&
      item.source_bank_id !== question.owner_bank_id
    ) {
      issues.push("Source Library link does not match question ownership");
    }
    if (
      !bankQuestion ||
      bankQuestion.question_id !== item.question_id ||
      bankQuestion.bank_id !== item.source_bank_id
    ) {
      issues.push("Library item mapping needs replacement");
    } else if (bankQuestion.status !== "active") {
      issues.push("Library item is not active");
    }

    return Array.from(new Set(issues));
  }
  const [{ data: members }, { data: progressRows }, { data: practiceLinks }] =
    await Promise.all([
      supabase
        .from("classroom_members")
        .select("user_id")
        .eq("classroom_id", classroomId)
        .eq("role", "student")
        .eq("status", "active")
        .limit(MAX_ASSIGNMENT_STUDENTS),
      supabase
        .from("student_assignment_progress")
        .select(
          "student_id, status, started_at, completed_at, last_practice_session_id, evidence_summary, updated_at",
        )
        .eq("assignment_id", assignmentId)
        .limit(MAX_ASSIGNMENT_PROGRESS_ROWS),
      supabase
        .from("assignment_practice_sessions")
        .select("student_id, practice_session_id, created_at")
        .eq("assignment_id", assignmentId)
        .order("created_at", { ascending: false })
        .limit(MAX_ASSIGNMENT_PRACTICE_LINKS),
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
  const practiceLinkRows = ((practiceLinks ?? []) as Array<{
    created_at: string;
    practice_session_id: string;
    student_id: string;
  }>).filter((link) => activeStudentIds.has(link.student_id));
  const practiceSessionIds = Array.from(
    new Set(practiceLinkRows.map((link) => link.practice_session_id)),
  );
  const [{ data: profiles }, { data: practiceSessions }, { data: practiceAttempts }] =
    await Promise.all([
      activeStudentIdList.length
        ? supabase
            .from("profiles")
            .select("id, username, email, full_name, display_name, role")
            .in("id", activeStudentIdList)
            .limit(MAX_ASSIGNMENT_STUDENTS)
        : Promise.resolve({ data: [] }),
      practiceSessionIds.length
        ? supabase
            .from("practice_sessions")
            .select("id, user_id, last_activity_at, status, title")
            .in("id", practiceSessionIds)
            .limit(MAX_ASSIGNMENT_PRACTICE_LINKS)
        : Promise.resolve({ data: [] }),
      practiceSessionIds.length && questionIds.length
        ? supabase
            .from("practice_attempts")
            .select(
              "id, user_id, session_id, round_id, source_question_id, question_title, answer, hint_count, grading_mode, is_correct, score, explanation, result, created_at",
            )
            .in("session_id", practiceSessionIds)
            .in("source_question_id", questionIds)
            .order("created_at", { ascending: false })
            .limit(MAX_ASSIGNMENT_ATTEMPTS)
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
  const linkedStudentBySessionId = new Map<string, string>();
  const attemptsByStudentId = new Map<string, TeacherAssignmentAttempt[]>();
  const attemptsByQuestionId = new Map<string, TeacherAssignmentAttempt[]>();

  for (const link of practiceLinkRows) {
    const links = linksByStudentId.get(link.student_id) ?? [];
    links.push(link);
    linksByStudentId.set(link.student_id, links);
    linkedStudentBySessionId.set(link.practice_session_id, link.student_id);
  }
  for (const attempt of (practiceAttempts ?? []) as Array<
    Pick<
      PracticeAttempt,
      | "answer"
      | "created_at"
      | "explanation"
      | "grading_mode"
      | "hint_count"
      | "id"
      | "is_correct"
      | "question_title"
      | "result"
      | "round_id"
      | "score"
      | "session_id"
      | "source_question_id"
      | "user_id"
    >
  >) {
    const linkedStudentId = linkedStudentBySessionId.get(attempt.session_id);
    const questionId = attempt.source_question_id;

    if (
      !linkedStudentId ||
      linkedStudentId !== attempt.user_id ||
      !questionId ||
      !questionById.has(questionId)
    ) {
      continue;
    }

    const evidenceAttempt: TeacherAssignmentAttempt = {
      answerPreview: answerPreview(attempt.answer),
      createdAt: attempt.created_at,
      feedbackSummary: feedbackSummary(attempt.explanation, attempt.result),
      gradingMode: attempt.grading_mode,
      hintCount: attempt.hint_count,
      id: attempt.id,
      isCorrect: attempt.is_correct,
      questionId,
      questionTitle: questionById.get(questionId)?.title || attempt.question_title || "Question",
      roundId: attempt.round_id,
      score: attempt.score,
      sessionId: attempt.session_id,
    };
    const studentAttempts = attemptsByStudentId.get(linkedStudentId) ?? [];
    studentAttempts.push(evidenceAttempt);
    attemptsByStudentId.set(linkedStudentId, studentAttempts);

    const questionAttempts = attemptsByQuestionId.get(questionId) ?? [];
    questionAttempts.push(evidenceAttempt);
    attemptsByQuestionId.set(questionId, questionAttempts);
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
      const attempts = (attemptsByStudentId.get(studentId) ?? []).sort((a, b) =>
        b.createdAt.localeCompare(a.createdAt),
      );
      const practiceCorrectCount = attempts.filter((attempt) => attempt.isCorrect === true).length;
      const practiceIncorrectCount = attempts.filter((attempt) => attempt.isCorrect === false).length;
      const profile = profileById.get(studentId) ?? null;

      return {
        completedAt: progress?.completed_at ?? null,
        displayName: profileDisplayName(profile),
        email: profile?.email ?? null,
        evidenceSummary: progress?.evidence_summary ?? {},
        latestPracticeSessionAt,
        linkedPracticeSessionCount: links.length,
        lastPracticeSessionId: progress?.last_practice_session_id ?? links[0]?.practice_session_id ?? null,
        practiceAttemptCount: attempts.length,
        practiceCorrectCount,
        practiceHintCount: attempts.reduce((total, attempt) => total + attempt.hintCount, 0),
        practiceIncorrectCount,
        profile,
        recentAttempts: attempts.slice(0, MAX_RECENT_ATTEMPTS_PER_STUDENT),
        startedAt: progress?.started_at ?? null,
        status: progress?.status ?? (links.length ? "in_progress" : "not_started"),
        studentId,
        updatedAt: progress?.updated_at ?? null,
      } satisfies TeacherAssignmentStudentProgress;
    })
    .sort((a, b) => {
      const attentionRank = (row: TeacherAssignmentStudentProgress) =>
        row.practiceAttemptCount >= 2 &&
        row.practiceIncorrectCount >= row.practiceCorrectCount
          ? 0
          : row.status === "in_progress"
            ? 1
            : row.status === "not_started"
              ? 2
              : 3;
      const attentionDelta = attentionRank(a) - attentionRank(b);
      if (attentionDelta) return attentionDelta;

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
  const questionPerformanceItems = Array.from(
    new Map(
      itemRows.map((item) => [item.question_id ?? `unavailable:${item.id}`, item]),
    ).values(),
  );
  const questionPerformanceRows = questionPerformanceItems.map((item) => {
    const question = item.question_id ? questionById.get(item.question_id) ?? null : null;
    const attempts = item.question_id ? attemptsByQuestionId.get(item.question_id) ?? [] : [];
    const correctAttemptCount = attempts.filter((attempt) => attempt.isCorrect === true).length;
    const incorrectAttemptCount = attempts.filter((attempt) => attempt.isCorrect === false).length;
    const studentAttemptedCount = new Set(
      activeStudentIdList.filter((studentId) =>
        (attemptsByStudentId.get(studentId) ?? []).some(
          (attempt) => attempt.questionId === item.question_id,
        ),
      ),
    ).size;
    const attentionStatus: TeacherAssignmentQuestionPerformance["attentionStatus"] =
      !question
        ? "unavailable"
        : attempts.length === 0
          ? "no_attempts"
          : incorrectAttemptCount > correctAttemptCount && attempts.length >= 2
            ? "needs_attention"
            : incorrectAttemptCount > 0
              ? "mixed_results"
              : "on_track";

    return {
      assignedStudentCount: activeStudentIdList.length,
      assignmentItemId: item.id,
      attemptCount: attempts.length,
      attentionStatus,
      correctAttemptCount,
      incorrectAttemptCount,
      latestActivityAt: latestIso(attempts.map((attempt) => attempt.createdAt)),
      question,
      sourceLabel: item.bank_question_id
        ? "Selected Library item"
        : "Assignment item",
      studentAttemptedCount,
    } satisfies TeacherAssignmentQuestionPerformance;
  });
  const evidenceSummary: TeacherAssignmentEvidenceSummary = {
    attemptCount: studentProgressRows.reduce((total, row) => total + row.practiceAttemptCount, 0),
    completionRate: activeStudentIdList.length
      ? Math.round((progressSummary.completedCount / activeStudentIdList.length) * 100)
      : null,
    correctAttemptCount: studentProgressRows.reduce(
      (total, row) => total + row.practiceCorrectCount,
      0,
    ),
    incorrectAttemptCount: studentProgressRows.reduce(
      (total, row) => total + row.practiceIncorrectCount,
      0,
    ),
    latestActivityAt: latestIso(
      studentProgressRows.map((row) => row.latestPracticeSessionAt),
    ),
    studentsNeedingAttentionCount: studentProgressRows.filter(
      (row) =>
        row.practiceAttemptCount >= 2 &&
        row.practiceIncorrectCount >= row.practiceCorrectCount,
    ).length,
  };

  return {
    ...(assignment as Omit<TeacherAssignmentSummary, "itemCount" | "progressSummary">),
    classroom,
    itemCount: itemRows.length,
    items: itemRows.map((item) => ({
      ...item,
      question: item.question_id ? questionById.get(item.question_id) ?? null : null,
      readinessIssues: readinessIssues(
        item,
        item.question_id ? questionById.get(item.question_id) ?? null : null,
      ),
    })),
    evidenceSummary,
    progressSummary,
    questionPerformanceRows,
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
