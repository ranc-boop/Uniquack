import "server-only";

import { htmlToPlainTextExcerpt } from "@/lib/html/excerpt";
import {
  createPracticeSession,
  getPracticeSession,
  normalizePracticeTagContext,
  persistRecommendationRound,
} from "@/lib/practice/persistence";
import type {
  PracticeGradeResult,
  PracticeRecommendation,
  PracticeRecommendResponse,
  PracticeSessionDetail,
  PracticeTraceEvent,
} from "@/lib/practice/types";
import { normalizeQuestionOptions } from "@/lib/questions/answer-spec";
import type { Json, QuestionType } from "@/types/database";

type SupabaseLike = {
  from: (table: string) => any;
};

type AssignmentPracticeQuestionRow = {
  content_html: string;
  difficulty_rating: number;
  id: string;
  options: unknown;
  question_code: string;
  question_type: QuestionType;
  source: string | null;
  title: string;
};

type AssignedQuestionPracticeItem = {
  assignment: {
    classroom_id: string;
    due_at: string | null;
    id: string;
    status: string;
    title: string;
  };
  recommendations: PracticeRecommendation[];
};

export type AssignmentPracticeStartResult = {
  assignment: {
    dueAt: string | null;
    id: string;
    itemCount: number;
    title: string;
  };
  progressStatus: "not_started" | "in_progress" | "completed";
  recommendation: PracticeRecommendResponse;
  session: PracticeSessionDetail;
};

function recommendationFromAssignmentQuestion(
  row: AssignmentPracticeQuestionRow,
  tagIds: string[],
): PracticeRecommendation {
  return {
    contentExcerpt: htmlToPlainTextExcerpt(row.content_html),
    contentHtml: row.content_html,
    difficulty: Number(row.difficulty_rating ?? 0),
    expectedSkill: "Complete assigned classroom work",
    id: row.id,
    options: normalizeQuestionOptions(row.options),
    questionCode: row.question_code,
    questionType: row.question_type,
    reason: "Assigned by your teacher for this classroom.",
    source: row.source,
    tagIds,
    title: row.title,
  };
}

async function assertStudentProfile({
  supabase,
  userId,
}: {
  supabase: SupabaseLike;
  userId: string;
}) {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, role, status")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }
  if (!data || data.status !== "active" || data.role !== "student") {
    throw new Error("Assignment practice is available only to active students.");
  }
}

async function loadAssignedQuestionPracticeItems({
  assignmentId,
  supabase,
}: {
  assignmentId: string;
  supabase: SupabaseLike;
}): Promise<AssignedQuestionPracticeItem> {
  const { data: assignment, error: assignmentError } = await supabase
    .from("assignments")
    .select("id, classroom_id, title, status, due_at")
    .eq("id", assignmentId)
    .eq("status", "assigned")
    .maybeSingle();

  if (assignmentError) {
    throw new Error(assignmentError.message);
  }
  if (!assignment) {
    throw new Error("Assigned work was not found for this student.");
  }

  const { data: itemRows, error: itemError } = await supabase
    .from("assignment_items")
    .select("id, item_type, order_index, question_id")
    .eq("assignment_id", assignmentId)
    .eq("item_type", "question")
    .order("order_index", { ascending: true });

  if (itemError) {
    throw new Error(itemError.message);
  }

  const questionIds = Array.from(
    new Set(
      ((itemRows ?? []) as Array<{ question_id: string | null }>)
        .map((item: { question_id?: string | null }) => item.question_id)
        .filter((id: string | null | undefined): id is string => Boolean(id)),
    ),
  );

  if (!questionIds.length) {
    throw new Error("This assignment does not have usable question items yet.");
  }

  const { data: questions, error: questionError } = await supabase
    .from("questions")
    .select("id, question_code, title, content_html, difficulty_rating, options, question_type, source")
    .in("id", questionIds);

  if (questionError) {
    throw new Error(questionError.message);
  }

  const questionById = new Map(
    ((questions ?? []) as AssignmentPracticeQuestionRow[]).map((question) => [
      question.id,
      question,
    ]),
  );
  const missingQuestionIds = questionIds.filter((questionId) => !questionById.has(questionId));
  if (missingQuestionIds.length) {
    throw new Error("This assignment has question items that are no longer available to you.");
  }

  const { data: taxonomyRows, error: taxonomyError } = await supabase
    .from("question_taxonomy_assignments")
    .select("question_id, tag_id")
    .in("question_id", questionIds)
    .eq("review_status", "approved");

  if (taxonomyError) {
    throw new Error(taxonomyError.message);
  }

  const tagIdsByQuestion = new Map<string, string[]>();
  for (const row of taxonomyRows ?? []) {
    tagIdsByQuestion.set(row.question_id, [
      ...(tagIdsByQuestion.get(row.question_id) ?? []),
      row.tag_id,
    ]);
  }

  const recommendations = questionIds.map((questionId) =>
    recommendationFromAssignmentQuestion(
      questionById.get(questionId)!,
      tagIdsByQuestion.get(questionId) ?? [],
    ),
  );

  return { assignment, recommendations };
}

export async function startAssignmentPractice({
  assignmentId,
  supabase,
  userId,
}: {
  assignmentId: string;
  supabase: SupabaseLike;
  userId: string;
}): Promise<AssignmentPracticeStartResult> {
  await assertStudentProfile({ supabase, userId });
  const { assignment, recommendations } = await loadAssignedQuestionPracticeItems({
    assignmentId,
    supabase,
  });
  const goal = `Assignment: ${assignment.title}`;
  const session = await createPracticeSession({
    goal,
    supabase,
    title: assignment.title,
    userId,
  });
  const tagContext = normalizePracticeTagContext(session.tagContext, goal);
  const trace: PracticeTraceEvent[] = [
    {
      inputSummary: `assignmentId=${assignmentId}; questionItems=${recommendations.length}`,
      outputSummary: `created ${recommendations.length} assignment practice recommendations`,
      phase: "context",
      resultCount: recommendations.length,
      toolName: "assignment_practice_start",
    },
  ];
  const response: PracticeRecommendResponse = {
    maxToolCalls: 0,
    mode: "heuristic",
    recommendations,
    roundGoal: goal,
    sessionId: session.id,
    sessionMemory: session.sessionMemory,
    tagContext,
    trace,
  };
  const roundId = await persistRecommendationRound({
    recommendations,
    response: {
      ...response,
      currentTaskSuffix: {
        assignment_id: assignmentId,
        current_round_request: {
          goal,
          question_count: recommendations.length,
          source: "assignment_practice",
        },
        selected_question_ids: recommendations.map((question) => question.id),
        tag_context: tagContext,
      },
    },
    sessionId: session.id,
    supabase,
    trace,
    userId,
  });
  response.roundId = roundId;

  const now = new Date().toISOString();
  const { data: existingProgress, error: existingProgressError } = await supabase
    .from("student_assignment_progress")
    .select("status, started_at, completed_at")
    .eq("assignment_id", assignmentId)
    .eq("student_id", userId)
    .maybeSingle();

  if (existingProgressError) {
    throw new Error(existingProgressError.message);
  }

  const progressStatus =
    existingProgress?.status === "completed" ? "completed" : "in_progress";
  const { error: linkError } = await supabase.from("assignment_practice_sessions").upsert(
    {
      assignment_id: assignmentId,
      practice_session_id: session.id,
      student_id: userId,
    },
    { onConflict: "assignment_id,student_id,practice_session_id" },
  );
  if (linkError) {
    throw new Error(linkError.message);
  }

  const { error: progressError } = await supabase.from("student_assignment_progress").upsert(
    {
      assignment_id: assignmentId,
      completed_at: progressStatus === "completed" ? existingProgress?.completed_at ?? now : null,
      evidence_summary: {
        assignmentId,
        itemCount: recommendations.length,
        lastRoundId: roundId,
        lastStartedAt: now,
        linkedPracticeSessionId: session.id,
        source: "assignment_practice",
      } as unknown as Json,
      last_practice_session_id: session.id,
      started_at: existingProgress?.started_at ?? now,
      status: progressStatus,
      student_id: userId,
    },
    { onConflict: "assignment_id,student_id" },
  );
  if (progressError) {
    throw new Error(progressError.message);
  }

  const detail = await getPracticeSession({ sessionId: session.id, supabase, userId });
  if (!detail) {
    throw new Error("Assignment practice session could not be loaded after creation.");
  }

  return {
    assignment: {
      dueAt: assignment.due_at,
      id: assignment.id,
      itemCount: recommendations.length,
      title: assignment.title,
    },
    progressStatus,
    recommendation: response,
    session: detail,
  };
}

export async function updateLinkedAssignmentProgressAfterPractice({
  attemptedQuestionIds,
  results,
  roundId,
  sessionId,
  supabase,
  userId,
}: {
  attemptedQuestionIds?: string[];
  results?: PracticeGradeResult[];
  roundId?: string;
  sessionId: string;
  supabase: SupabaseLike;
  userId: string;
}) {
  const { data: links, error: linkError } = await supabase
    .from("assignment_practice_sessions")
    .select("assignment_id, student_id, practice_session_id")
    .eq("student_id", userId)
    .eq("practice_session_id", sessionId);

  if (linkError) {
    throw new Error(linkError.message);
  }
  if (!links?.length) {
    return { completed: 0, updated: 0 };
  }

  const assignmentIds = Array.from(
    new Set(
      (links as Array<{ assignment_id: string }>).map((link) => link.assignment_id),
    ),
  );
  const { data: items, error: itemError } = await supabase
    .from("assignment_items")
    .select("assignment_id, question_id")
    .in("assignment_id", assignmentIds)
    .eq("item_type", "question");

  if (itemError) {
    throw new Error(itemError.message);
  }

  const resultIds = (results ?? []).map((result) => result.questionId);
  const submittedIds = Array.from(new Set([...(attemptedQuestionIds ?? []), ...resultIds].filter(Boolean)));
  let practiceAttemptIds = submittedIds;

  if (!practiceAttemptIds.length) {
    const { data: attempts, error: attemptError } = await supabase
      .from("practice_attempts")
      .select("source_question_id")
      .eq("user_id", userId)
      .eq("session_id", sessionId);
    if (attemptError) {
      throw new Error(attemptError.message);
    }
    practiceAttemptIds = Array.from(
      new Set(
        (attempts ?? [])
          .map((attempt: { source_question_id?: string | null }) => attempt.source_question_id)
          .filter((id: string | null | undefined): id is string => Boolean(id)),
      ),
    );
  }

  const attemptedSet = new Set(practiceAttemptIds);
  const correct = (results ?? []).filter((result) => result.isCorrect === true).length;
  const scored = (results ?? []).filter((result) => result.isCorrect !== null).length;
  const itemsByAssignment = new Map<string, string[]>();
  for (const item of items ?? []) {
    if (!item.question_id) continue;
    itemsByAssignment.set(item.assignment_id, [
      ...(itemsByAssignment.get(item.assignment_id) ?? []),
      item.question_id,
    ]);
  }

  let updated = 0;
  let completed = 0;
  const now = new Date().toISOString();
  for (const assignmentId of assignmentIds) {
    const questionIds = Array.from(new Set(itemsByAssignment.get(assignmentId) ?? []));
    const completedQuestionIds = questionIds.filter((questionId) => attemptedSet.has(questionId));
    const isComplete = questionIds.length > 0 && completedQuestionIds.length === questionIds.length;
    const { error: progressError } = await supabase.from("student_assignment_progress").upsert(
      {
        assignment_id: assignmentId,
        completed_at: isComplete ? now : null,
        evidence_summary: {
          assignmentId,
          attemptedQuestionCount: completedQuestionIds.length,
          completedQuestionIds,
          correct,
          lastRoundId: roundId ?? null,
          lastUpdatedAt: now,
          linkedPracticeSessionId: sessionId,
          scoreTotal: scored,
          source: "assignment_practice",
          totalQuestionCount: questionIds.length,
        } as unknown as Json,
        last_practice_session_id: sessionId,
        started_at: now,
        status: isComplete ? "completed" : "in_progress",
        student_id: userId,
      },
      { onConflict: "assignment_id,student_id" },
    );
    if (progressError) {
      throw new Error(progressError.message);
    }
    updated += 1;
    if (isComplete) completed += 1;
  }

  return { completed, updated };
}
