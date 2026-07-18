import "server-only";

import type {
  PracticeAttemptInput,
  PracticeCourseFrameworkSummary,
  PracticeGradeResult,
  PracticeQuestionReview,
  PracticeRecommendation,
  PracticeRoundHistory,
  PracticeSessionDetail,
  PracticeSessionSummary,
  PracticeTagContext,
  PracticeTraceEvent,
  PracticeWrongQuestionView,
} from "@/lib/practice/types";
import {
  CURRENT_PRACTICE_QUESTION_SNAPSHOT_SCHEMA_VERSION,
  CURRENT_PRACTICE_SESSION_SCHEMA_VERSION,
  isCurrentPracticeQuestionSnapshot,
} from "@/lib/practice/schema";
import type { Json, PracticeSession } from "@/types/database";

type SupabaseLike = {
  from: (...args: any[]) => any;
};

export type PracticeSessionInitializationFailureStage = "preference" | "session";

type PracticeSessionInitializationFailureMapper = (
  stage: PracticeSessionInitializationFailureStage,
  cause: unknown,
) => Error;

function throwPracticeSessionInitializationFailure({
  cause,
  mapper,
  stage,
}: {
  cause: unknown;
  mapper?: PracticeSessionInitializationFailureMapper;
  stage: PracticeSessionInitializationFailureStage;
}): never {
  if (mapper) throw mapper(stage, cause);
  throw cause;
}

const DEFAULT_TAG_CONTEXT: PracticeTagContext = {
  confirmedTagIds: [],
  usefulTags: [],
  version: 1,
};

export { CURRENT_PRACTICE_SESSION_SCHEMA_VERSION };

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function hasObjectKeys(value: unknown) {
  return Object.keys(asObject(value)).length > 0;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function compactLine(value: unknown, maxLength = 500) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function buildDefaultSessionPlan({
  courseFramework,
  goal,
}: {
  courseFramework?: PracticeCourseFrameworkSummary | null;
  goal: string;
}) {
  const trimmedGoal = compactLine(goal, 500);
  if (courseFramework) {
    return {
      allowed_scope: courseFramework.allowedTagIds,
      framework_id: courseFramework.id,
      framework_title: courseFramework.title,
      kind: "framework_snapshot",
      learning_path: courseFramework.learningPath,
      priority_rules: courseFramework.priorityRules,
      root_goal: trimmedGoal || courseFramework.title,
      user_note_policy: "User outline/next-round notes are appended at the dynamic suffix and should be prioritized when they do not contradict the framework.",
    };
  }

  return {
    allowed_scope: [],
    kind: "ai_draft_outline",
    learning_path: [
      { node_id: "diagnostic", goal: "Start with a short diagnostic round aligned to the user goal." },
      { node_id: "targeted_bridge", goal: "Use review evidence to add bridge drills for active misconceptions." },
      { node_id: "challenge_variants", goal: "Increase difficulty or mix formats after the student shows stability." },
    ],
    remediation_rules: [
      "If the student says the miss was careless, verify once before lowering difficulty.",
      "If the student requests a direction after review, prefer that request unless it clearly leaves the session scope.",
      "Do not move far away from the root goal without explicit user intent.",
    ],
    root_goal: trimmedGoal || "New practice session",
    user_note_policy: "This outline is a soft guide. User notes on the outline and next round are appended after the cached prefix and should be weighted more than automatic assumptions.",
  };
}

function buildInitialSessionState(goal: string) {
  return {
    active_misconceptions: [],
    confirmed_strengths: [],
    current_focus: compactLine(goal, 500) || "Waiting for the first practice goal.",
    next_round_constraints: [],
    training_strategy: [],
    version: 1,
  };
}

function appendThreadEntry(current: unknown, entry: Record<string, unknown>, limit = 80) {
  return [...asArray(current), entry].slice(-limit);
}

function compactJsonForThread(value: unknown, maxLength = 2200) {
  let text = "";
  try {
    text = JSON.stringify(value ?? {});
  } catch {
    text = String(value ?? "");
  }

  return text.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function buildThreadCheckpoint({
  entries,
  episodeCard,
  review,
  roundIndex,
}: {
  entries: unknown[];
  episodeCard: unknown;
  review: { nextRoundGoal: string; roundPatterns?: string[]; summary: string };
  roundIndex: number;
}) {
  return {
    created_at: new Date().toISOString(),
    kind: "thread_checkpoint",
    summary: {
      latest_review: review.summary,
      next_round_goal: review.nextRoundGoal,
      recent_entries: entries.slice(-20).map((entry) => compactJsonForThread(entry, 1800)),
      round_patterns: review.roundPatterns ?? [],
      terminal_episode: compactJsonForThread(episodeCard, 2400),
    },
    through_round_index: roundIndex,
  };
}

function buildRoundContract({
  recommendations,
  response,
}: {
  recommendations: PracticeRecommendation[];
  response: { roundContract?: unknown; roundGoal: string; tagContext: PracticeTagContext };
}) {
  const explicit = asObject(response.roundContract);
  return {
    plan_node_id: compactLine(explicit.plan_node_id ?? explicit.planNodeId ?? "current_focus", 160),
    recommendation_intent: compactLine(explicit.recommendation_intent ?? explicit.intent ?? response.roundGoal, 900),
    round_goal: response.roundGoal,
    search_strategy: explicit.search_strategy ?? { tag_context: response.tagContext },
    selected_questions: recommendations.map((question) => ({
      diagnostic_purpose: compactLine((explicit.diagnostic_purposes as Record<string, unknown> | undefined)?.[question.id] ?? question.reason, 500),
      expected_skill: question.expectedSkill,
      question_code: question.questionCode,
      question_id: question.id,
      reason: question.reason,
    })),
    user_note_policy: "When the student adds an outline or next-round note, prefer it over automatic drift unless it contradicts explicit correctness evidence.",
  };
}

function buildRecommendThreadEntry({
  currentTaskSuffix,
  roundContract,
  roundId,
  roundIndex,
  recommendations,
}: {
  currentTaskSuffix?: unknown;
  roundContract: unknown;
  roundId: string;
  roundIndex: number;
  recommendations: PracticeRecommendation[];
}) {
  const contract = asObject(roundContract);
  return {
    kind: "current_task",
    current_task_suffix: currentTaskSuffix ?? {},
    round_contract: roundContract,
    round_goal: contract.round_goal ?? "Practice round",
    round_id: roundId,
    round_index: roundIndex,
    selected_question_purposes: recommendations.map((question) => ({
      expected_skill: question.expectedSkill,
      question_code: question.questionCode,
      question_id: question.id,
      reason: question.reason,
    })),
    summary: {
      plan_node_id: contract.plan_node_id ?? "current_focus",
      recommendation_intent: contract.recommendation_intent ?? contract.round_goal ?? "Practice round",
      round_goal: contract.round_goal ?? "Practice round",
    },
  };
}

function formatAnswerForThread(answer: string | string[] | null | undefined) {
  return Array.isArray(answer) ? answer.join(", ") : String(answer ?? "");
}

function verdictText(isCorrect: boolean | null | undefined) {
  if (isCorrect === true) return "correct";
  if (isCorrect === false) return "incorrect";
  return "needs review";
}

function buildQuestionReviewThreadText({
  questionReviews,
  recommendations,
}: {
  questionReviews: PracticeQuestionReview[];
  recommendations: PracticeRecommendation[];
}) {
  const questionById = new Map(recommendations.map((question) => [question.id, question]));
  return questionReviews
    .map((review, index) => {
      const question = questionById.get(review.questionId);
      const label = question?.questionCode || `Question ${index + 1}`;
      const answer = compactLine(formatAnswerForThread(review.studentAnswer), 220) || "(blank)";
      const reason = compactLine(review.judgmentReason || review.observedError || "", 420);
      return `${label}: student answered "${answer}"; verdict ${verdictText(review.isCorrect)}${reason ? `; reason: ${reason}` : ""}.`;
    })
    .join("\n")
    .slice(0, 5000);
}

function buildRoundReviewThreadText(summary: string) {
  return compactLine(summary, 2400);
}

export function normalizePracticeTagContext(value: unknown, goal = ""): PracticeTagContext {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ...DEFAULT_TAG_CONTEXT, lastGoal: goal || undefined };
  }

  const record = value as Partial<PracticeTagContext>;
  return {
    confirmedTagIds: Array.isArray(record.confirmedTagIds)
      ? Array.from(new Set(record.confirmedTagIds.map(String).filter(Boolean))).slice(0, 24)
      : [],
    lastGoal: typeof record.lastGoal === "string" ? record.lastGoal.slice(0, 240) : goal || undefined,
    usefulTags: Array.isArray(record.usefulTags)
      ? record.usefulTags
          .map((tag) => {
            const item = tag && typeof tag === "object" ? (tag as Record<string, unknown>) : {};
            const source: PracticeTagContext["usefulTags"][number]["source"] =
              item.source === "browse" || item.source === "search" || item.source === "memory"
                ? item.source
                : "memory";
            const searchableQuestionCount = Number(item.searchableQuestionCount);

            return {
              searchableQuestionCount: Number.isFinite(searchableQuestionCount)
                ? Math.max(0, Math.trunc(searchableQuestionCount))
                : undefined,
              source,
              tagId: String(item.tagId ?? "").trim(),
            };
          })
          .filter((tag) => tag.tagId)
          .slice(0, 24)
      : [],
    version: 1,
  };
}

function asStringArray(value: unknown) {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

function buildPracticeQuestionSnapshot(question: PracticeRecommendation): PracticeRecommendation & {
  practiceSchemaVersion: typeof CURRENT_PRACTICE_QUESTION_SNAPSHOT_SCHEMA_VERSION;
} {
  return {
    ...question,
    practiceSchemaVersion: CURRENT_PRACTICE_QUESTION_SNAPSHOT_SCHEMA_VERSION,
  };
}

function answerFromJson(value: unknown): string | string[] {
  if (Array.isArray(value)) {
    return value.map(String);
  }

  return typeof value === "string" ? value : "";
}

function hintsFromJson(value: unknown) {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

function traceEventsFromJson(value: unknown): PracticeTraceEvent[] {
  return Array.isArray(value)
    ? value.filter((event): event is PracticeTraceEvent => Boolean(
      event &&
      typeof event === "object" &&
      "toolName" in event,
    ))
    : [];
}

function isUniqueConstraintError(error: unknown) {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: unknown }).code === "23505",
  );
}

function sessionSummaryFromRow(row: PracticeSession & { round_count?: number }): PracticeSessionSummary {
  const record = row as PracticeSession & Record<string, unknown>;
  const courseFrameworkSnapshot = hasObjectKeys(row.course_framework_snapshot)
    ? asObject(row.course_framework_snapshot) as PracticeCourseFrameworkSummary
    : null;
  const sessionPlan = hasObjectKeys(record.session_plan)
    ? asObject(record.session_plan)
    : row.goal || courseFrameworkSnapshot
      ? buildDefaultSessionPlan({
        courseFramework: courseFrameworkSnapshot,
        goal: row.goal,
      })
      : {};
  const sessionState = hasObjectKeys(record.session_state)
    ? asObject(record.session_state)
    : buildInitialSessionState(row.goal);

  return {
    cachePrefixVersion: CURRENT_PRACTICE_SESSION_SCHEMA_VERSION,
    completedQuestionIds: asStringArray(row.completed_question_ids),
    courseFrameworkId: row.course_framework_id,
    courseFrameworkSnapshot: row.course_framework_snapshot,
    createdAt: row.created_at,
    goal: row.goal,
    id: row.id,
    lastActivityAt: row.last_activity_at,
    longTermMemorySnapshot: String(record.long_term_memory_snapshot ?? ""),
    outlineUserNotes: String(record.outline_user_notes ?? ""),
    roundCount: Number(row.round_count ?? 0),
    sessionMemory: row.session_memory,
    sessionPlan,
    sessionState,
    sessionThreadMessages: asArray(record.session_thread_messages),
    status: row.status,
    tagContext: normalizePracticeTagContext(row.tag_context, row.goal),
    title: row.title,
  };
}

function courseFrameworkSummaryFromRow(row: Record<string, unknown>): PracticeCourseFrameworkSummary {
  return {
    allowedTagIds: Array.isArray(row.allowed_tag_ids) ? row.allowed_tag_ids.map(String).filter(Boolean) : [],
    description: String(row.description ?? ""),
    frameworkPrompt: String(row.framework_prompt ?? ""),
    id: String(row.id ?? ""),
    learningPath: row.learning_path ?? [],
    priorityRules: String(row.priority_rules ?? ""),
    status: row.status === "archived" ? "archived" : "active",
    title: String(row.title ?? ""),
  };
}

export async function listActivePracticeCourseFrameworks({
  supabase,
}: {
  supabase: SupabaseLike;
}) {
  const { data, error } = await supabase
    .from("practice_course_frameworks")
    .select("*")
    .eq("status", "active")
    .order("updated_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as Record<string, unknown>[]).map(courseFrameworkSummaryFromRow);
}

async function loadPracticeCourseFramework({
  frameworkId,
  supabase,
}: {
  frameworkId: string;
  supabase: SupabaseLike;
}) {
  if (!frameworkId) {
    return null;
  }

  const { data, error } = await supabase
    .from("practice_course_frameworks")
    .select("*")
    .eq("id", frameworkId)
    .eq("status", "active")
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data ? courseFrameworkSummaryFromRow(data as Record<string, unknown>) : null;
}

export async function getOrCreatePracticePreference({
  supabase,
  userId,
}: {
  supabase: SupabaseLike;
  userId: string;
}) {
  const { data, error } = await supabase
    .from("user_practice_preferences")
    .select("user_id,long_term_preference,last_agent_updated_at,created_at,updated_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (data) {
    return data as {
      last_agent_updated_at: string | null;
      long_term_preference: string;
      user_id: string;
    };
  }

  const inserted = await supabase
    .from("user_practice_preferences")
    .insert({ user_id: userId })
    .select("user_id,long_term_preference,last_agent_updated_at")
    .single();

  if (inserted.error) {
    throw new Error(inserted.error.message);
  }

  return inserted.data as {
    last_agent_updated_at: string | null;
    long_term_preference: string;
    user_id: string;
  };
}

export async function countPendingPreferenceJobs({
  supabase,
  userId,
}: {
  supabase: SupabaseLike;
  userId: string;
}) {
  const { count, error } = await supabase
    .from("practice_preference_merge_jobs")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .in("status", ["pending", "running"]);

  if (error) {
    throw new Error(error.message);
  }

  return count ?? 0;
}

export async function listPracticeSessions({
  supabase,
  userId,
}: {
  supabase: SupabaseLike;
  userId: string;
}) {
  const { data, error } = await supabase
    .from("practice_sessions")
    .select("*,practice_rounds(id)")
    .eq("user_id", userId)
    .eq("cache_prefix_version", CURRENT_PRACTICE_SESSION_SCHEMA_VERSION)
    .order("last_activity_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as Array<PracticeSession & { practice_rounds?: unknown[] }>).map((row) =>
    sessionSummaryFromRow({ ...row, round_count: row.practice_rounds?.length ?? 0 }),
  );
}

export async function getPracticeSession({
  sessionId,
  supabase,
  userId,
}: {
  sessionId: string;
  supabase: SupabaseLike;
  userId: string;
}): Promise<PracticeSessionDetail | null> {
  const { data: session, error: sessionError } = await supabase
    .from("practice_sessions")
    .select("*")
    .eq("user_id", userId)
    .eq("id", sessionId)
    .eq("cache_prefix_version", CURRENT_PRACTICE_SESSION_SCHEMA_VERSION)
    .maybeSingle();

  if (sessionError) {
    throw new Error(sessionError.message);
  }

  if (!session) {
    return null;
  }

  const { data: rounds, error: roundsError } = await supabase
    .from("practice_rounds")
    .select("*")
    .eq("user_id", userId)
    .eq("session_id", sessionId)
    .order("round_index", { ascending: true });

  if (roundsError) {
    throw new Error(roundsError.message);
  }

  const roundIds = ((rounds ?? []) as Array<{ id: string }>).map((round) => round.id);
  const questionsResult = roundIds.length
    ? await supabase
        .from("practice_round_questions")
        .select("*")
        .eq("user_id", userId)
        .in("round_id", roundIds)
        .order("position", { ascending: true })
    : { data: [], error: null };
  const attemptsResult = roundIds.length
    ? await supabase
        .from("practice_attempts")
        .select("*")
        .eq("user_id", userId)
        .in("round_id", roundIds)
        .order("created_at", { ascending: true })
    : { data: [], error: null };

  if (questionsResult.error) {
    throw new Error(questionsResult.error.message);
  }
  if (attemptsResult.error) {
    throw new Error(attemptsResult.error.message);
  }

  const questionsByRound = new Map<string, any[]>();
  for (const question of questionsResult.data ?? []) {
    questionsByRound.set(question.round_id, [...(questionsByRound.get(question.round_id) ?? []), question]);
  }

  const attemptsByRound = new Map<string, any[]>();
  for (const attempt of attemptsResult.data ?? []) {
    attemptsByRound.set(attempt.round_id, [...(attemptsByRound.get(attempt.round_id) ?? []), attempt]);
  }

  const historyRounds: PracticeRoundHistory[] = ((rounds ?? []) as any[]).map((round) => ({
    attempts: (attemptsByRound.get(round.id) ?? []).map((attempt) => ({
      answer: answerFromJson(attempt.answer),
      explanation: attempt.explanation,
      hintCount: attempt.hint_count,
      hints: hintsFromJson(attempt.hints),
      id: attempt.id,
      isCorrect: attempt.is_correct,
      questionId: attempt.question_id,
      score: attempt.score,
      solutionHtml: attempt.solution_html,
      sourceQuestionId: attempt.source_question_id,
    })),
    id: round.id,
    nextRoundGoal: round.next_round_goal,
    questions: (questionsByRound.get(round.id) ?? []).flatMap((question) => {
      if (!isCurrentPracticeQuestionSnapshot(question.question_snapshot)) {
        return [];
      }

      const snapshot = question.question_snapshot as Partial<PracticeRecommendation>;

      return [{
        contentExcerpt: String(snapshot.contentExcerpt ?? ""),
        contentHtml: String(snapshot.contentHtml ?? ""),
        difficulty: Number(snapshot.difficulty ?? 0),
        expectedSkill: String(snapshot.expectedSkill ?? question.expected_skill ?? ""),
        id: String(question.source_question_id ?? snapshot.id ?? ""),
        options: Array.isArray(snapshot.options) ? snapshot.options : [],
        position: Number(question.position ?? 0),
        questionCode: String(snapshot.questionCode ?? "snapshot"),
        questionId: question.question_id,
        questionType: String(snapshot.questionType ?? "mixed"),
        reason: String(snapshot.reason ?? question.reason ?? ""),
        source: typeof snapshot.source === "string" ? snapshot.source : null,
        sourceQuestionId: question.source_question_id,
        tagIds: Array.isArray(snapshot.tagIds) ? snapshot.tagIds.map(String) : [],
        title: String(snapshot.title ?? "Saved question"),
      }];
    }),
    reviewSummary: round.review_summary,
    roundGoal: round.round_goal,
    score: {
      correct: round.score_correct,
      total: round.score_total,
    },
    trace: traceEventsFromJson(round.trace),
  }));

  return {
    ...sessionSummaryFromRow({ ...(session as PracticeSession), round_count: historyRounds.length }),
    rounds: historyRounds,
  };
}

export async function createPracticeSession({
  courseFrameworkId,
  goal,
  onInitializationFailure,
  supabase,
  title,
  userId,
}: {
  courseFrameworkId?: string | null;
  goal: string;
  onInitializationFailure?: PracticeSessionInitializationFailureMapper;
  supabase: SupabaseLike;
  title?: string;
  userId: string;
}) {
  const trimmedGoal = goal.trim().slice(0, 500);
  const sessionTitle =
    (title?.trim() || trimmedGoal || "New practice session").slice(0, 160);
  let preference: Awaited<ReturnType<typeof getOrCreatePracticePreference>>;
  try {
    await maybeQueuePreferenceMergeJob({ supabase, userId });
    preference = await getOrCreatePracticePreference({ supabase, userId });
  } catch (cause) {
    throwPracticeSessionInitializationFailure({
      cause,
      mapper: onInitializationFailure,
      stage: "preference",
    });
  }
  const courseFramework = courseFrameworkId
    ? await loadPracticeCourseFramework({ frameworkId: courseFrameworkId, supabase })
    : null;
  const sessionPlan = trimmedGoal || courseFramework
    ? buildDefaultSessionPlan({ courseFramework, goal: trimmedGoal })
    : {};

  let sessionResult: { data: unknown; error: { message?: string } | null };
  try {
    sessionResult = await supabase
      .from("practice_sessions")
      .insert({
        cache_prefix_version: CURRENT_PRACTICE_SESSION_SCHEMA_VERSION,
        course_framework_id: courseFramework?.id ?? null,
        course_framework_snapshot: courseFramework ? courseFramework as unknown as Json : null,
        goal: trimmedGoal,
        long_term_memory_snapshot: preference.long_term_preference.trim().slice(0, 1000),
        session_memory: "",
        session_plan: sessionPlan as unknown as Json,
        session_state: {} as unknown as Json,
        session_thread_messages: [] as unknown as Json,
        tag_context: { ...DEFAULT_TAG_CONTEXT, lastGoal: trimmedGoal },
        title: sessionTitle,
        user_id: userId,
      })
      .select("*")
      .single();
  } catch (cause) {
    throwPracticeSessionInitializationFailure({
      cause,
      mapper: onInitializationFailure,
      stage: "session",
    });
  }

  const { data, error } = sessionResult;

  if (error) {
    throwPracticeSessionInitializationFailure({
      cause: error,
      mapper: onInitializationFailure,
      stage: "session",
    });
  }

  return sessionSummaryFromRow({ ...(data as PracticeSession), round_count: 0 });
}

async function maybeQueuePreferenceMergeJob({
  supabase,
  userId,
}: {
  supabase: SupabaseLike;
  userId: string;
}) {
  const cutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  const { data: source, error: sourceError } = await supabase
    .from("practice_sessions")
    .select("id,goal,session_memory,session_state,session_thread_messages,outline_user_notes,next_user_notes,preference_merged_at,preference_dirty_at,last_activity_at")
    .eq("user_id", userId)
    .eq("cache_prefix_version", CURRENT_PRACTICE_SESSION_SCHEMA_VERSION)
    .lt("last_activity_at", cutoff)
    .or("preference_merged_at.is.null,preference_dirty_at.not.is.null")
    .order("last_activity_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (sourceError) {
    throw new Error(sourceError.message);
  }

  if (!source) {
    return null;
  }

  const preference = await getOrCreatePracticePreference({ supabase, userId });
  const existing = await supabase
    .from("practice_preference_merge_jobs")
    .select("id")
    .eq("user_id", userId)
    .eq("source_session_id", source.id)
    .in("status", ["pending", "running"])
    .limit(1)
    .maybeSingle();

  if (existing.error) {
    throw new Error(existing.error.message);
  }

  if (existing.data) {
    return existing.data;
  }

  const inserted = await supabase
    .from("practice_preference_merge_jobs")
    .insert({
      previous_preference: preference.long_term_preference,
      source_session_id: source.id,
      source_session_memory: source.session_memory,
      source_summary: {
        goal: source.goal,
        outline_user_notes: source.outline_user_notes,
        next_user_notes: source.next_user_notes,
        session_state: source.session_state,
        session_thread_messages: Array.isArray(source.session_thread_messages)
          ? source.session_thread_messages.slice(-12)
          : [],
      } as unknown as Json,
      user_id: userId,
    })
    .select("id")
    .single();

  if (inserted.error) {
    throw new Error(inserted.error.message);
  }

  return inserted.data;
}

export async function persistRecommendationRound({
  courseFrameworkSnapshot,
  llmUsage,
  recommendations,
  response,
  sessionId,
  supabase,
  trace,
  userId,
}: {
  courseFrameworkSnapshot?: unknown;
  llmUsage?: Record<string, unknown>[];
  recommendations: PracticeRecommendation[];
  response: {
    llmUsage?: Record<string, unknown>[];
    mode: "ai" | "heuristic";
    providerLabel?: string;
    roundContract?: unknown;
    roundGoal: string;
    currentTaskSuffix?: unknown;
    sessionMemory: string;
    sessionState?: unknown;
    tagContext: PracticeTagContext;
  };
  sessionId: string;
  supabase: SupabaseLike;
  trace: PracticeTraceEvent[];
  userId: string;
}) {
  let insertedRound:
    | {
        data: { id: string } | null;
        error: { code?: string; message: string } | null;
      }
    | undefined;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const latestRound = await supabase
      .from("practice_rounds")
      .select("round_index")
      .eq("user_id", userId)
      .eq("session_id", sessionId)
      .order("round_index", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestRound.error) {
      throw new Error(latestRound.error.message);
    }

    const roundIndex = (Number(latestRound.data?.round_index) || 0) + 1;
    const attemptedRound = await supabase
      .from("practice_rounds")
      .insert({
        mode: response.mode,
        provider_label: response.providerLabel ?? null,
        round_goal: response.roundGoal,
        round_index: roundIndex,
        session_id: sessionId,
        trace: trace as unknown as Json,
        user_id: userId,
      })
      .select("id")
      .single();

    insertedRound = attemptedRound;

    if (!attemptedRound.error || !isUniqueConstraintError(attemptedRound.error)) {
      break;
    }
  }

  if (!insertedRound || insertedRound.error || !insertedRound.data) {
    throw new Error(insertedRound?.error?.message ?? "Failed to persist recommendation round.");
  }

  const persistedRound = insertedRound.data;
  const roundId = persistedRound.id as string;
  const { data: roundMeta, error: roundMetaError } = await supabase
    .from("practice_rounds")
    .select("round_index")
    .eq("user_id", userId)
    .eq("id", roundId)
    .maybeSingle();
  if (roundMetaError) {
    throw new Error(roundMetaError.message);
  }
  const roundIndex = Number(roundMeta?.round_index ?? 1);
  const roundContract = buildRoundContract({ recommendations, response });
  const recommendThreadEntry = buildRecommendThreadEntry({
    currentTaskSuffix: response.currentTaskSuffix,
    recommendations,
    roundContract,
    roundId,
    roundIndex,
  });
  const questionRows = recommendations.map((question, index) => ({
    content_html: question.contentHtml,
    difficulty_rating: question.difficulty,
    expected_skill: question.expectedSkill,
    position: index + 1,
    question_code: question.questionCode,
    question_id: null,
    question_snapshot: buildPracticeQuestionSnapshot(question) as unknown as Json,
    question_type: question.questionType,
    reason: question.reason,
    round_id: roundId,
    session_id: sessionId,
    source_question_id: question.id,
    title: question.title,
    user_id: userId,
  }));

  if (questionRows.length) {
    const insertedQuestions = await supabase.from("practice_round_questions").insert(questionRows);
    if (insertedQuestions.error) {
      throw new Error(insertedQuestions.error.message);
    }
  }

  const { data: currentSession, error: currentSessionError } = await supabase
    .from("practice_sessions")
    .select("session_thread_messages")
    .eq("user_id", userId)
    .eq("id", sessionId)
    .maybeSingle();

  if (currentSessionError) {
    throw new Error(currentSessionError.message);
  }

  const { error: sessionError } = await supabase
    .from("practice_sessions")
    .update({
      goal: response.roundGoal.slice(0, 500),
      last_activity_at: new Date().toISOString(),
      session_thread_messages: appendThreadEntry(currentSession?.session_thread_messages, recommendThreadEntry) as unknown as Json,
      tag_context: response.tagContext as unknown as Json,
    })
    .eq("user_id", userId)
    .eq("id", sessionId);

  if (sessionError) {
    throw new Error(sessionError.message);
  }

  await upsertPracticeAgentEpisode({
    llmUsage: llmUsage ?? response.llmUsage ?? [],
    recommendContext: {
      courseFrameworkSnapshot: courseFrameworkSnapshot ?? null,
      recommendationReasons: recommendations.map((question) => ({
        expectedSkill: question.expectedSkill,
        questionCode: question.questionCode,
        questionId: question.id,
        reason: question.reason,
      })),
      roundContract,
      roundGoal: response.roundGoal,
      tagContext: response.tagContext,
    },
    roundContract,
    cacheThreadEntry: recommendThreadEntry,
    roundId,
    sessionId,
    supabase,
    toolTraceSummary: trace,
    userId,
  });

  return roundId;
}

async function upsertPracticeAgentEpisode({
  cacheThreadEntry,
  episodeCard,
  llmUsage,
  memoryUpdate,
  recommendContext,
  reviewDiagnosis,
  roundContract,
  roundId,
  sessionId,
  studentAttemptSummary,
  supabase,
  toolTraceSummary,
  userId,
}: {
  cacheThreadEntry?: unknown;
  episodeCard?: unknown;
  llmUsage?: unknown[];
  memoryUpdate?: string;
  recommendContext?: unknown;
  reviewDiagnosis?: unknown;
  roundContract?: unknown;
  roundId: string;
  sessionId: string;
  studentAttemptSummary?: unknown;
  supabase: SupabaseLike;
  toolTraceSummary?: unknown[];
  userId: string;
}) {
  const { data: latestRound, error: latestRoundError } = await supabase
    .from("practice_rounds")
    .select("round_index")
    .eq("user_id", userId)
    .eq("id", roundId)
    .maybeSingle();

  if (latestRoundError) {
    throw new Error(latestRoundError.message);
  }

  const row = {
    episode_index: Number(latestRound?.round_index ?? 1),
    llm_usage: (llmUsage ?? []) as unknown as Json,
    cache_thread_entry: (cacheThreadEntry ?? {}) as unknown as Json,
    episode_card: (episodeCard ?? {}) as unknown as Json,
    memory_update: (memoryUpdate ?? "").slice(0, 4000),
    recommend_context: (recommendContext ?? {}) as unknown as Json,
    review_diagnosis: (reviewDiagnosis ?? {}) as unknown as Json,
    round_contract: (roundContract ?? {}) as unknown as Json,
    round_id: roundId,
    session_id: sessionId,
    student_attempt_summary: (studentAttemptSummary ?? []) as unknown as Json,
    tool_trace_summary: (toolTraceSummary ?? []) as unknown as Json,
    user_id: userId,
  };
  const { error } = await supabase
    .from("practice_agent_episodes")
    .upsert(row, { onConflict: "round_id" });

  if (error) {
    throw new Error(error.message);
  }
}

export async function persistQuestionReviewResults({
  attempts,
  hintsByQuestionId,
  llmUsage,
  providerLabel,
  questionReviews,
  recommendations,
  results,
  roundId,
  sessionId,
  supabase,
  trace,
  userId,
}: {
  attempts: PracticeAttemptInput[];
  hintsByQuestionId?: Record<string, string[]>;
  llmUsage?: Record<string, unknown>[];
  providerLabel?: string;
  questionReviews: PracticeQuestionReview[];
  recommendations: PracticeRecommendation[];
  results: PracticeGradeResult[];
  roundId: string;
  sessionId: string;
  supabase: SupabaseLike;
  trace: PracticeTraceEvent[];
  userId: string;
}) {
  const resultByQuestionId = new Map(results.map((result) => [result.questionId, result]));
  const reviewByQuestionId = new Map(questionReviews.map((review) => [review.questionId, review]));
  const recommendationById = new Map(recommendations.map((question) => [question.id, question]));
  const rows = attempts.map((attempt) => {
    const result = resultByQuestionId.get(attempt.questionId);
    const review = reviewByQuestionId.get(attempt.questionId);
    const question = recommendationById.get(attempt.questionId);

    return {
      answer: attempt.answer as unknown as Json,
      explanation: result?.explanation ?? review?.judgmentReason ?? null,
      grading_mode: result?.gradingMode ?? "manual",
      hint_count: attempt.hintCount ?? 0,
      hints: (hintsByQuestionId?.[attempt.questionId] ?? []) as unknown as Json,
      is_correct: result?.isCorrect ?? null,
      question_code: question?.questionCode ?? null,
      question_id: null,
      question_snapshot: question
        ? buildPracticeQuestionSnapshot(question) as unknown as Json
        : {} as Json,
      question_title: question?.title ?? "",
      result: (result ?? {}) as unknown as Json,
      round_id: roundId,
      score: result?.score ?? null,
      session_id: sessionId,
      solution_html: result?.solutionHtml ?? null,
      source_question_id: attempt.questionId,
      user_id: userId,
    };
  });

  const inserted = rows.length
    ? await supabase.from("practice_attempts").upsert(rows, { onConflict: "round_id,source_question_id" }).select("*")
    : { data: [], error: null };

  if (inserted.error) {
    throw new Error(inserted.error.message);
  }

  const insertedAttempts = (inserted.data ?? []) as Array<{
    answer: Json;
    id: string;
    question_id: string | null;
    source_question_id: string | null;
  }>;
  const attemptByQuestionId = new Map(
    insertedAttempts.map((attempt) => [attempt.source_question_id ?? attempt.question_id ?? "", attempt]),
  );
  const correct = results.filter((result) => result.isCorrect === true).length;
  const total = results.filter((result) => result.isCorrect !== null).length;
  const completedQuestionIds = Array.from(new Set(recommendations.map((question) => question.id)));

  const existingRoundResult = await supabase
    .from("practice_rounds")
    .select("round_index,trace")
    .eq("user_id", userId)
    .eq("id", roundId)
    .maybeSingle();

  if (existingRoundResult.error) {
    throw new Error(existingRoundResult.error.message);
  }

  const existingTrace = traceEventsFromJson(existingRoundResult.data?.trace);
  const mergedTrace = [
    ...existingTrace,
    ...trace.filter((event) => !existingTrace.some((existing) =>
      existing.toolName === event.toolName &&
      existing.iteration === event.iteration &&
      existing.inputSummary === event.inputSummary &&
      existing.outputSummary === event.outputSummary
    )),
  ];
  const roundUpdate = await supabase
    .from("practice_rounds")
    .update({
      mode: "ai",
      provider_label: providerLabel ?? null,
      score_correct: correct,
      score_total: total,
      trace: mergedTrace as unknown as Json,
    })
    .eq("user_id", userId)
    .eq("id", roundId);

  if (roundUpdate.error) {
    throw new Error(roundUpdate.error.message);
  }

  const { data: currentSession, error: sessionLoadError } = await supabase
    .from("practice_sessions")
    .select("completed_question_ids,session_thread_messages")
    .eq("user_id", userId)
    .eq("id", sessionId)
    .single();

  if (sessionLoadError) {
    throw new Error(sessionLoadError.message);
  }

  const { data: existingEpisode, error: existingEpisodeError } = await supabase
    .from("practice_agent_episodes")
    .select("cache_thread_entry,episode_card,llm_usage,memory_update,recommend_context,round_contract")
    .eq("user_id", userId)
    .eq("round_id", roundId)
    .maybeSingle();

  if (existingEpisodeError) {
    throw new Error(existingEpisodeError.message);
  }

  const roundIndex = Number(existingRoundResult.data?.round_index ?? 0);
  const questionReviewText = buildQuestionReviewThreadText({ questionReviews, recommendations });
  const questionReviewThreadEntry = {
    kind: "question_review",
    round_id: roundId,
    round_index: roundIndex,
    text: questionReviewText,
  };
  const nextThreadMessages = appendThreadEntry(
    currentSession?.session_thread_messages,
    questionReviewThreadEntry,
  );
  const mergedCompleted = Array.from(
    new Set([...asStringArray(currentSession?.completed_question_ids), ...completedQuestionIds]),
  );
  const sessionUpdate = await supabase
    .from("practice_sessions")
    .update({
      completed_question_ids: mergedCompleted,
      last_activity_at: new Date().toISOString(),
      preference_dirty_at: new Date().toISOString(),
      session_thread_messages: nextThreadMessages as unknown as Json,
    })
    .eq("user_id", userId)
    .eq("id", sessionId);

  if (sessionUpdate.error) {
    throw new Error(sessionUpdate.error.message);
  }

  await upsertPracticeAgentEpisode({
    cacheThreadEntry: existingEpisode?.cache_thread_entry ?? {},
    episodeCard: existingEpisode?.episode_card ?? {},
    llmUsage: llmUsage?.length ? llmUsage : asArray(existingEpisode?.llm_usage),
    memoryUpdate: String(existingEpisode?.memory_update ?? ""),
    recommendContext: existingEpisode?.recommend_context ?? {},
    reviewDiagnosis: {
      questionReviews,
      questionReviewThreadText: questionReviewText,
    },
    roundContract: existingEpisode?.round_contract ?? {},
    roundId,
    sessionId,
    studentAttemptSummary: rows.map((row) => ({
      answer: row.answer,
      hintCount: row.hint_count,
      isCorrect: row.is_correct,
      questionCode: row.question_code,
      questionId: row.source_question_id,
      score: row.score,
    })),
    supabase,
    toolTraceSummary: trace,
    userId,
  });

  for (const result of results) {
    const question = recommendationById.get(result.questionId);
    if (!question) {
      continue;
    }
    const attempt = attemptByQuestionId.get(result.questionId);

    if (result.isCorrect === false) {
      const existing = await supabase
        .from("practice_wrong_questions")
        .select("miss_count")
        .eq("user_id", userId)
        .eq("source_question_id", question.id)
        .maybeSingle();

      if (existing.error) {
        throw new Error(existing.error.message);
      }

      const upserted = await supabase.from("practice_wrong_questions").upsert(
        {
          last_answer: (attempt?.answer ?? "") as Json,
          last_attempt_id: attempt?.id ?? null,
          last_explanation: result.explanation,
          last_missed_at: new Date().toISOString(),
          last_round_id: roundId,
          last_session_id: sessionId,
          mastered_at: null,
          miss_count: Number(existing.data?.miss_count ?? 0) + 1,
          question_code: question.questionCode,
          question_id: null,
          question_snapshot: buildPracticeQuestionSnapshot(question) as unknown as Json,
          question_title: question.title,
          source_question_id: question.id,
          user_id: userId,
        },
        { onConflict: "user_id,source_question_id" },
      );

      if (upserted.error) {
        throw new Error(upserted.error.message);
      }
    } else if (result.isCorrect === true) {
      const mastered = await supabase
        .from("practice_wrong_questions")
        .update({
          last_attempt_id: attempt?.id ?? null,
          mastered_at: new Date().toISOString(),
        })
        .eq("user_id", userId)
        .eq("source_question_id", question.id)
        .is("mastered_at", null);

      if (mastered.error) {
        throw new Error(mastered.error.message);
      }
    }
  }
}

export async function persistRoundReviewSummary({
  providerLabel,
  roundId,
  sessionId,
  summary,
  supabase,
  trace,
  userId,
}: {
  providerLabel?: string;
  roundId: string;
  sessionId: string;
  summary: string;
  supabase: SupabaseLike;
  trace: PracticeTraceEvent[];
  userId: string;
}) {
  const existingRoundResult = await supabase
    .from("practice_rounds")
    .select("round_index,trace")
    .eq("user_id", userId)
    .eq("id", roundId)
    .maybeSingle();

  if (existingRoundResult.error) {
    throw new Error(existingRoundResult.error.message);
  }

  const existingTrace = traceEventsFromJson(existingRoundResult.data?.trace);
  const mergedTrace = [
    ...existingTrace,
    ...trace.filter((event) => !existingTrace.some((existing) =>
      existing.toolName === event.toolName &&
      existing.iteration === event.iteration &&
      existing.inputSummary === event.inputSummary &&
      existing.outputSummary === event.outputSummary
    )),
  ];
  const roundUpdate = await supabase
    .from("practice_rounds")
    .update({
      mode: "ai",
      provider_label: providerLabel ?? null,
      review_summary: summary,
      trace: mergedTrace as unknown as Json,
    })
    .eq("user_id", userId)
    .eq("id", roundId);

  if (roundUpdate.error) {
    throw new Error(roundUpdate.error.message);
  }

  const { data: currentSession, error: sessionLoadError } = await supabase
    .from("practice_sessions")
    .select("session_thread_messages")
    .eq("user_id", userId)
    .eq("id", sessionId)
    .single();

  if (sessionLoadError) {
    throw new Error(sessionLoadError.message);
  }

  const roundIndex = Number(existingRoundResult.data?.round_index ?? 0);
  const nextThreadMessages = appendThreadEntry(
    currentSession?.session_thread_messages,
    {
      kind: "round_review",
      round_id: roundId,
      round_index: roundIndex,
      text: buildRoundReviewThreadText(summary),
    },
  );
  const persistedThreadMessages = roundIndex > 0 && roundIndex % 10 === 0
    ? [buildThreadCheckpoint({
        entries: nextThreadMessages,
        episodeCard: { summary },
        review: { nextRoundGoal: "", summary },
        roundIndex,
      })]
    : nextThreadMessages;
  const sessionUpdate = await supabase
    .from("practice_sessions")
    .update({
      last_activity_at: new Date().toISOString(),
      preference_dirty_at: new Date().toISOString(),
      session_thread_messages: persistedThreadMessages as unknown as Json,
    })
    .eq("user_id", userId)
    .eq("id", sessionId);

  if (sessionUpdate.error) {
    throw new Error(sessionUpdate.error.message);
  }

  const { data: existingEpisode, error: episodeError } = await supabase
    .from("practice_agent_episodes")
    .select("cache_thread_entry,episode_card,llm_usage,memory_update,recommend_context,review_diagnosis,round_contract,student_attempt_summary")
    .eq("user_id", userId)
    .eq("round_id", roundId)
    .maybeSingle();

  if (episodeError) {
    throw new Error(episodeError.message);
  }

  await upsertPracticeAgentEpisode({
    cacheThreadEntry: existingEpisode?.cache_thread_entry ?? {},
    episodeCard: existingEpisode?.episode_card ?? {},
    llmUsage: asArray(existingEpisode?.llm_usage),
    memoryUpdate: String(existingEpisode?.memory_update ?? ""),
    recommendContext: existingEpisode?.recommend_context ?? {},
    reviewDiagnosis: {
      ...asObject(existingEpisode?.review_diagnosis),
      roundReviewSummary: summary,
    },
    roundContract: existingEpisode?.round_contract ?? {},
    roundId,
    sessionId,
    studentAttemptSummary: asArray(existingEpisode?.student_attempt_summary),
    supabase,
    toolTraceSummary: trace,
    userId,
  });
}

export async function listActiveWrongQuestions({
  sessionId,
  supabase,
  userId,
}: {
  sessionId?: string | null;
  supabase: SupabaseLike;
  userId: string;
}): Promise<PracticeWrongQuestionView[]> {
  let query = supabase
    .from("practice_wrong_questions")
    .select("*")
    .eq("user_id", userId)
    .is("mastered_at", null)
    .order("last_missed_at", { ascending: false });

  if (sessionId) {
    query = query.eq("last_session_id", sessionId);
  }

  const { data, error } = await query.limit(50);

  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as any[]).flatMap((row) => {
    if (!isCurrentPracticeQuestionSnapshot(row.question_snapshot)) {
      return [];
    }

    const snapshot = row.question_snapshot as Record<string, unknown>;

    return [{
      contentHtml: String(snapshot.contentHtml ?? ""),
      id: row.id,
      lastAnswer: answerFromJson(row.last_answer),
      lastExplanation: row.last_explanation,
      lastMissedAt: row.last_missed_at,
      masteredAt: row.mastered_at,
      missCount: row.miss_count,
      questionCode: row.question_code ?? String(snapshot.questionCode ?? "snapshot"),
      questionId: row.question_id,
      sourceQuestionId: row.source_question_id,
      title: row.question_title || String(snapshot.title ?? "Saved question"),
    }];
  });
}
