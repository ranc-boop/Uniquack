import "server-only";

import { htmlToPlainTextExcerpt } from "@/lib/html/excerpt";
import {
  createPracticeSession,
  getPracticeSession,
  normalizePracticeTagContext,
  persistRecommendationRound,
} from "@/lib/practice/persistence";
import { resolveAssignmentPracticeResumeSession } from "@/lib/practice/assignment-resume";
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

export const ASSIGNMENT_PRACTICE_START_ERROR_CODES = [
  "INVALID_REQUEST",
  "AUTHENTICATION_REQUIRED",
  "STUDENT_NOT_ELIGIBLE",
  "ASSIGNMENT_NOT_AVAILABLE",
  "ASSIGNMENT_CONTENT_UNAVAILABLE",
  "TAXONOMY_READ_FAILED",
  "PREFERENCE_READ_FAILED",
  "PREFERENCE_CREATE_FAILED",
  "PREFERENCE_MERGE_READ_FAILED",
  "PREFERENCE_MERGE_WRITE_FAILED",
  "SESSION_CREATE_FAILED",
  "ROUND_PERSISTENCE_FAILED",
  "ASSIGNMENT_LINKAGE_FAILED",
  "SESSION_RELOAD_FAILED",
  "PRACTICE_START_FAILED",
] as const;

export type AssignmentPracticeStartErrorCode =
  (typeof ASSIGNMENT_PRACTICE_START_ERROR_CODES)[number];

export const ASSIGNMENT_PRACTICE_START_STAGES = [
  "request",
  "authentication",
  "student_profile",
  "assignment_visibility",
  "assignment_content",
  "taxonomy",
  "preference_read",
  "preference_create",
  "preference_merge_read",
  "preference_merge_write",
  "session",
  "round",
  "assignment_linkage",
  "session_reload",
  "start",
] as const;

export type AssignmentPracticeStartStage =
  (typeof ASSIGNMENT_PRACTICE_START_STAGES)[number];

export class AssignmentPracticeStartError extends Error {
  readonly code: AssignmentPracticeStartErrorCode;
  readonly stage: AssignmentPracticeStartStage;

  constructor({
    cause,
    code,
    stage,
  }: {
    cause?: unknown;
    code: AssignmentPracticeStartErrorCode;
    stage: AssignmentPracticeStartStage;
  }) {
    super("Unable to start assignment practice.");
    this.name = "AssignmentPracticeStartError";
    this.code = code;
    this.stage = stage;
    if (cause !== undefined) this.cause = cause;
  }
}

function assignmentPracticeStartError({
  cause,
  code,
  stage,
}: {
  cause?: unknown;
  code: AssignmentPracticeStartErrorCode;
  stage: AssignmentPracticeStartStage;
}) {
  if (cause instanceof AssignmentPracticeStartError) return cause;
  return new AssignmentPracticeStartError({ cause, code, stage });
}

export function normalizeAssignmentPracticeStartError(cause: unknown) {
  if (cause instanceof AssignmentPracticeStartError) return cause;
  return assignmentPracticeStartError({
    cause,
    code: "PRACTICE_START_FAILED",
    stage: "start",
  });
}

async function runAssignmentPracticeStartStage<T>({
  code,
  operation,
  stage,
}: {
  code: AssignmentPracticeStartErrorCode;
  operation: () => PromiseLike<T> | T;
  stage: AssignmentPracticeStartStage;
}): Promise<T> {
  try {
    return await operation();
  } catch (cause) {
    throw assignmentPracticeStartError({ cause, code, stage });
  }
}

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

type AssignmentPracticeProgressRow = {
  completed_at: string | null;
  last_practice_session_id: string | null;
  started_at: string | null;
  status: "not_started" | "in_progress" | "completed";
};

function recommendationFromPersistedAssignmentSession(
  session: PracticeSessionDetail,
): PracticeRecommendResponse {
  const round = session.rounds[session.rounds.length - 1];

  return {
    maxToolCalls: 0,
    mode: "heuristic",
    recommendations: round.questions.map((question) => ({
      contentExcerpt: question.contentExcerpt,
      contentHtml: question.contentHtml,
      difficulty: question.difficulty,
      expectedSkill: question.expectedSkill,
      id: question.sourceQuestionId ?? question.id,
      options: question.options,
      questionCode: question.questionCode,
      questionType: question.questionType as QuestionType,
      reason: question.reason,
      source: question.source,
      tagIds: question.tagIds,
      title: question.title,
    })),
    roundGoal: round.roundGoal || session.goal,
    roundId: round.id,
    sessionId: session.id,
    sessionMemory: session.sessionMemory,
    sessionPlan: session.sessionPlan,
    sessionState: session.sessionState,
    tagContext: session.tagContext,
    trace: round.trace ?? [],
  };
}

async function loadAssignmentPracticeResumeContext({
  assignmentId,
  supabase,
  userId,
}: {
  assignmentId: string;
  supabase: SupabaseLike;
  userId: string;
}) {
  const { data: progress, error: progressError } =
    await runAssignmentPracticeStartStage({
      code: "ASSIGNMENT_LINKAGE_FAILED",
      operation: () =>
        supabase
          .from("student_assignment_progress")
          .select("status, started_at, completed_at, last_practice_session_id")
          .eq("assignment_id", assignmentId)
          .eq("student_id", userId)
          .maybeSingle(),
      stage: "assignment_linkage",
    });

  if (progressError) {
    throw assignmentPracticeStartError({
      cause: progressError,
      code: "ASSIGNMENT_LINKAGE_FAILED",
      stage: "assignment_linkage",
    });
  }

  const { data: links, error: linksError } = await runAssignmentPracticeStartStage({
    code: "ASSIGNMENT_LINKAGE_FAILED",
    operation: () =>
      supabase
        .from("assignment_practice_sessions")
        .select("practice_session_id, created_at")
        .eq("assignment_id", assignmentId)
        .eq("student_id", userId)
        .order("created_at", { ascending: false })
        .order("practice_session_id", { ascending: false }),
    stage: "assignment_linkage",
  });

  if (linksError) {
    throw assignmentPracticeStartError({
      cause: linksError,
      code: "ASSIGNMENT_LINKAGE_FAILED",
      stage: "assignment_linkage",
    });
  }

  return {
    links: ((links ?? []) as Array<{
      created_at: string;
      practice_session_id: string;
    }>).map((link) => ({
      createdAt: link.created_at,
      practiceSessionId: link.practice_session_id,
    })),
    progress: (progress ?? null) as AssignmentPracticeProgressRow | null,
  };
}

async function assertStudentProfile({
  supabase,
  userId,
}: {
  supabase: SupabaseLike;
  userId: string;
}) {
  const { data, error } = await runAssignmentPracticeStartStage({
    code: "STUDENT_NOT_ELIGIBLE",
    operation: () =>
      supabase
        .from("profiles")
        .select("id, role, status")
        .eq("id", userId)
        .maybeSingle(),
    stage: "student_profile",
  });

  if (error) {
    throw assignmentPracticeStartError({
      cause: error,
      code: "STUDENT_NOT_ELIGIBLE",
      stage: "student_profile",
    });
  }
  if (!data || data.status !== "active" || data.role !== "student") {
    throw assignmentPracticeStartError({
      cause: new Error("Assignment practice is available only to active students."),
      code: "STUDENT_NOT_ELIGIBLE",
      stage: "student_profile",
    });
  }
}

async function loadAssignedQuestionPracticeItems({
  assignmentId,
  supabase,
}: {
  assignmentId: string;
  supabase: SupabaseLike;
}): Promise<AssignedQuestionPracticeItem> {
  const { data: assignment, error: assignmentError } =
    await runAssignmentPracticeStartStage({
      code: "ASSIGNMENT_NOT_AVAILABLE",
      operation: () =>
        supabase
          .from("assignments")
          .select("id, classroom_id, title, status, due_at")
          .eq("id", assignmentId)
          .eq("status", "assigned")
          .maybeSingle(),
      stage: "assignment_visibility",
    });

  if (assignmentError) {
    throw assignmentPracticeStartError({
      cause: assignmentError,
      code: "ASSIGNMENT_NOT_AVAILABLE",
      stage: "assignment_visibility",
    });
  }
  if (!assignment) {
    throw assignmentPracticeStartError({
      code: "ASSIGNMENT_NOT_AVAILABLE",
      stage: "assignment_visibility",
    });
  }

  const { data: itemRows, error: itemError } = await runAssignmentPracticeStartStage({
    code: "ASSIGNMENT_CONTENT_UNAVAILABLE",
    operation: () =>
      supabase
        .from("assignment_items")
        .select("id, item_type, order_index, question_id")
        .eq("assignment_id", assignmentId)
        .eq("item_type", "question")
        .order("order_index", { ascending: true }),
    stage: "assignment_content",
  });

  if (itemError) {
    throw assignmentPracticeStartError({
      cause: itemError,
      code: "ASSIGNMENT_CONTENT_UNAVAILABLE",
      stage: "assignment_content",
    });
  }

  const questionIds = Array.from(
    new Set(
      ((itemRows ?? []) as Array<{ question_id: string | null }>)
        .map((item: { question_id?: string | null }) => item.question_id)
        .filter((id: string | null | undefined): id is string => Boolean(id)),
    ),
  );

  if (!questionIds.length) {
    throw assignmentPracticeStartError({
      code: "ASSIGNMENT_CONTENT_UNAVAILABLE",
      stage: "assignment_content",
    });
  }

  const { data: questions, error: questionError } = await runAssignmentPracticeStartStage({
    code: "ASSIGNMENT_CONTENT_UNAVAILABLE",
    operation: () =>
      supabase
        .from("questions")
        .select("id, question_code, title, content_html, difficulty_rating, options, question_type, source")
        .in("id", questionIds),
    stage: "assignment_content",
  });

  if (questionError) {
    throw assignmentPracticeStartError({
      cause: questionError,
      code: "ASSIGNMENT_CONTENT_UNAVAILABLE",
      stage: "assignment_content",
    });
  }

  const questionById = new Map(
    ((questions ?? []) as AssignmentPracticeQuestionRow[]).map((question) => [
      question.id,
      question,
    ]),
  );
  const missingQuestionIds = questionIds.filter((questionId) => !questionById.has(questionId));
  if (missingQuestionIds.length) {
    throw assignmentPracticeStartError({
      code: "ASSIGNMENT_CONTENT_UNAVAILABLE",
      stage: "assignment_content",
    });
  }

  const { data: taxonomyRows, error: taxonomyError } =
    await runAssignmentPracticeStartStage({
      code: "TAXONOMY_READ_FAILED",
      operation: () =>
        supabase
          .from("question_taxonomy_assignments")
          .select("question_id, tag_id")
          .in("question_id", questionIds)
          .eq("review_status", "approved"),
      stage: "taxonomy",
    });

  if (taxonomyError) {
    throw assignmentPracticeStartError({
      cause: taxonomyError,
      code: "TAXONOMY_READ_FAILED",
      stage: "taxonomy",
    });
  }

  const tagIdsByQuestion = new Map<string, string[]>();
  for (const row of taxonomyRows ?? []) {
    tagIdsByQuestion.set(row.question_id, [
      ...(tagIdsByQuestion.get(row.question_id) ?? []),
      row.tag_id,
    ]);
  }

  const recommendations = await runAssignmentPracticeStartStage({
    code: "ASSIGNMENT_CONTENT_UNAVAILABLE",
    operation: () =>
      questionIds.map((questionId) =>
        recommendationFromAssignmentQuestion(
          questionById.get(questionId)!,
          tagIdsByQuestion.get(questionId) ?? [],
        ),
      ),
    stage: "assignment_content",
  });

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
  const resumeContext = await loadAssignmentPracticeResumeContext({
    assignmentId,
    supabase,
    userId,
  });

  // Assignment Practice V1 resumes a requester-owned linked session before it
  // creates anything. The progress pointer wins when it is still linked;
  // otherwise the newest valid link is checked deterministically. A stale link
  // is ignored only when the requester-scoped session loader returns no session.
  const resumed = await runAssignmentPracticeStartStage({
    code: "SESSION_RELOAD_FAILED",
    operation: () =>
      resolveAssignmentPracticeResumeSession({
        lastPracticeSessionId: resumeContext.progress?.last_practice_session_id,
        linkedSessions: resumeContext.links,
        loadSession: async (practiceSessionId) => {
          const detail = await getPracticeSession({
            sessionId: practiceSessionId,
            supabase,
            userId,
          });
          const currentRound = detail?.rounds[detail.rounds.length - 1];
          return currentRound?.questions.length ? detail : null;
        },
      }),
    stage: "session_reload",
  });

  if (resumed) {
    return {
      assignment: {
        dueAt: assignment.due_at,
        id: assignment.id,
        itemCount: recommendations.length,
        title: assignment.title,
      },
      progressStatus:
        resumeContext.progress?.status === "completed" ? "completed" : "in_progress",
      recommendation: recommendationFromPersistedAssignmentSession(resumed.session),
      session: resumed.session,
    };
  }

  const session = await runAssignmentPracticeStartStage({
    code: "SESSION_CREATE_FAILED",
    operation: () =>
      createPracticeSession({
        goal,
        onInitializationFailure: (stage, cause) => {
          const codeByStage = {
            preference_create: "PREFERENCE_CREATE_FAILED",
            preference_merge_read: "PREFERENCE_MERGE_READ_FAILED",
            preference_merge_write: "PREFERENCE_MERGE_WRITE_FAILED",
            preference_read: "PREFERENCE_READ_FAILED",
            session: "SESSION_CREATE_FAILED",
          } as const;
          return assignmentPracticeStartError({
            cause,
            code: codeByStage[stage],
            stage,
          });
        },
        supabase,
        title: assignment.title,
        userId,
      }),
    stage: "session",
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
  const roundId = await runAssignmentPracticeStartStage({
    code: "ROUND_PERSISTENCE_FAILED",
    operation: () =>
      persistRecommendationRound({
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
      }),
    stage: "round",
  });
  response.roundId = roundId;

  const now = new Date().toISOString();
  const existingProgress = resumeContext.progress;

  const progressStatus =
    existingProgress?.status === "completed" ? "completed" : "in_progress";
  const { error: linkError } = await runAssignmentPracticeStartStage({
    code: "ASSIGNMENT_LINKAGE_FAILED",
    operation: () =>
      supabase.from("assignment_practice_sessions").upsert(
        {
          assignment_id: assignmentId,
          practice_session_id: session.id,
          student_id: userId,
        },
        { onConflict: "assignment_id,student_id,practice_session_id" },
      ),
    stage: "assignment_linkage",
  });
  if (linkError) {
    throw assignmentPracticeStartError({
      cause: linkError,
      code: "ASSIGNMENT_LINKAGE_FAILED",
      stage: "assignment_linkage",
    });
  }

  const { error: progressError } = await runAssignmentPracticeStartStage({
    code: "ASSIGNMENT_LINKAGE_FAILED",
    operation: () =>
      supabase.from("student_assignment_progress").upsert(
        {
          assignment_id: assignmentId,
          completed_at:
            progressStatus === "completed" ? existingProgress?.completed_at ?? now : null,
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
      ),
    stage: "assignment_linkage",
  });
  if (progressError) {
    throw assignmentPracticeStartError({
      cause: progressError,
      code: "ASSIGNMENT_LINKAGE_FAILED",
      stage: "assignment_linkage",
    });
  }

  const detail = await runAssignmentPracticeStartStage({
    code: "SESSION_RELOAD_FAILED",
    operation: () => getPracticeSession({ sessionId: session.id, supabase, userId }),
    stage: "session_reload",
  });
  if (!detail) {
    throw assignmentPracticeStartError({
      code: "SESSION_RELOAD_FAILED",
      stage: "session_reload",
    });
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
