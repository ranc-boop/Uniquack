import "server-only";

import type {
  PracticeAttemptInput,
  PracticeGradeResult,
  PracticeRecommendation,
  PracticeRoundHistory,
  PracticeSessionDetail,
  PracticeSessionSummary,
  PracticeTagContext,
  PracticeTraceEvent,
  PracticeWrongQuestionView,
} from "@/lib/practice/types";
import type { Json, PracticeSession } from "@/types/database";

type SupabaseLike = {
  from: (...args: any[]) => any;
};

const DEFAULT_TAG_CONTEXT: PracticeTagContext = {
  confirmedTagIds: [],
  usefulTags: [],
  version: 1,
};

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

function answerFromJson(value: unknown): string | string[] {
  if (Array.isArray(value)) {
    return value.map(String);
  }

  return typeof value === "string" ? value : "";
}

function hintsFromJson(value: unknown) {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

function sessionSummaryFromRow(row: PracticeSession & { round_count?: number }): PracticeSessionSummary {
  return {
    completedQuestionIds: asStringArray(row.completed_question_ids),
    createdAt: row.created_at,
    goal: row.goal,
    id: row.id,
    lastActivityAt: row.last_activity_at,
    roundCount: Number(row.round_count ?? 0),
    sessionMemory: row.session_memory,
    status: row.status,
    tagContext: normalizePracticeTagContext(row.tag_context, row.goal),
    title: row.title,
  };
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
    questions: (questionsByRound.get(round.id) ?? []).map((question) => ({
      contentHtml: question.content_html,
      difficulty: Number(question.difficulty_rating ?? 0),
      expectedSkill: question.expected_skill ?? "",
      id: question.question_id,
      position: question.position,
      questionCode: question.question_code ?? "snapshot",
      questionId: question.question_id,
      questionType: question.question_type ?? "mixed",
      reason: question.reason ?? "",
      sourceQuestionId: question.source_question_id,
      title: question.title,
    })),
    reviewSummary: round.review_summary,
    roundGoal: round.round_goal,
    score: {
      correct: round.score_correct,
      total: round.score_total,
    },
  }));

  return {
    ...sessionSummaryFromRow({ ...(session as PracticeSession), round_count: historyRounds.length }),
    rounds: historyRounds,
  };
}

export async function createPracticeSession({
  goal,
  supabase,
  title,
  userId,
}: {
  goal: string;
  supabase: SupabaseLike;
  title?: string;
  userId: string;
}) {
  const trimmedGoal = goal.trim().slice(0, 500);
  const sessionTitle =
    (title?.trim() || trimmedGoal || "New practice session").slice(0, 160);
  const sessionMemory = trimmedGoal
    ? `Goal: ${trimmedGoal}. No completed rounds yet.`
    : "No completed rounds yet.";

  await maybeQueuePreferenceMergeJob({ supabase, userId });

  const { data, error } = await supabase
    .from("practice_sessions")
    .insert({
      goal: trimmedGoal,
      session_memory: sessionMemory,
      tag_context: { ...DEFAULT_TAG_CONTEXT, lastGoal: trimmedGoal },
      title: sessionTitle,
      user_id: userId,
    })
    .select("*")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return sessionSummaryFromRow({ ...(data as PracticeSession), round_count: 0 });
}

export async function maybeQueuePreferenceMergeJob({
  supabase,
  userId,
}: {
  supabase: SupabaseLike;
  userId: string;
}) {
  const cutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  const { data: source, error: sourceError } = await supabase
    .from("practice_sessions")
    .select("id,session_memory,preference_merged_at,last_activity_at")
    .eq("user_id", userId)
    .lt("last_activity_at", cutoff)
    .is("preference_merged_at", null)
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
    .in("status", ["pending", "running", "succeeded"])
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
  recommendations,
  response,
  sessionId,
  supabase,
  trace,
  userId,
}: {
  recommendations: PracticeRecommendation[];
  response: {
    mode: "ai" | "heuristic";
    providerLabel?: string;
    roundGoal: string;
    sessionMemory: string;
    tagContext: PracticeTagContext;
  };
  sessionId: string;
  supabase: SupabaseLike;
  trace: PracticeTraceEvent[];
  userId: string;
}) {
  const countResult = await supabase
    .from("practice_rounds")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("session_id", sessionId);

  if (countResult.error) {
    throw new Error(countResult.error.message);
  }

  const roundIndex = (countResult.count ?? 0) + 1;
  const insertedRound = await supabase
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

  if (insertedRound.error) {
    throw new Error(insertedRound.error.message);
  }

  const roundId = insertedRound.data.id as string;
  const questionRows = recommendations.map((question, index) => ({
    content_html: question.contentHtml,
    difficulty_rating: question.difficulty,
    expected_skill: question.expectedSkill,
    position: index + 1,
    question_code: question.questionCode,
    question_id: question.id,
    question_snapshot: question as unknown as Json,
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

  const { error: sessionError } = await supabase
    .from("practice_sessions")
    .update({
      goal: response.roundGoal.slice(0, 500),
      last_activity_at: new Date().toISOString(),
      session_memory: response.sessionMemory,
      tag_context: response.tagContext as unknown as Json,
    })
    .eq("user_id", userId)
    .eq("id", sessionId);

  if (sessionError) {
    throw new Error(sessionError.message);
  }

  return roundId;
}

export async function persistRoundReview({
  attempts,
  hintsByQuestionId,
  recommendations,
  results,
  review,
  roundId,
  sessionId,
  supabase,
  userId,
}: {
  attempts: PracticeAttemptInput[];
  hintsByQuestionId?: Record<string, string[]>;
  recommendations: PracticeRecommendation[];
  results: PracticeGradeResult[];
  review: {
    mode: "ai" | "heuristic";
    nextRoundGoal: string;
    providerLabel?: string;
    summary: string;
    trace: PracticeTraceEvent[];
    updatedSessionMemory: string;
  };
  roundId: string;
  sessionId: string;
  supabase: SupabaseLike;
  userId: string;
}) {
  const resultByQuestionId = new Map(results.map((result) => [result.questionId, result]));
  const recommendationById = new Map(recommendations.map((question) => [question.id, question]));
  const rows = attempts.map((attempt) => {
    const result = resultByQuestionId.get(attempt.questionId);
    const question = recommendationById.get(attempt.questionId);

    return {
      answer: attempt.answer as unknown as Json,
      explanation: result?.explanation ?? null,
      grading_mode: result?.gradingMode ?? "manual",
      hint_count: attempt.hintCount ?? 0,
      hints: (hintsByQuestionId?.[attempt.questionId] ?? []) as unknown as Json,
      is_correct: result?.isCorrect ?? null,
      question_code: question?.questionCode ?? null,
      question_id: null,
      question_snapshot: (question ?? {}) as unknown as Json,
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
    is_correct: boolean | null;
    question_id: string | null;
    source_question_id: string | null;
  }>;
  const attemptByQuestionId = new Map(
    insertedAttempts.map((attempt) => [attempt.source_question_id ?? attempt.question_id ?? "", attempt]),
  );

  const correct = results.filter((result) => result.isCorrect === true).length;
  const total = results.filter((result) => result.isCorrect !== null).length;
  const completedQuestionIds = Array.from(new Set(recommendations.map((question) => question.id)));

  const roundUpdate = await supabase
    .from("practice_rounds")
    .update({
      mode: review.mode,
      next_round_goal: review.nextRoundGoal,
      provider_label: review.providerLabel ?? null,
      review_summary: review.summary,
      score_correct: correct,
      score_total: total,
      trace: review.trace as unknown as Json,
    })
    .eq("user_id", userId)
    .eq("id", roundId);

  if (roundUpdate.error) {
    throw new Error(roundUpdate.error.message);
  }

  const { data: currentSession, error: sessionLoadError } = await supabase
    .from("practice_sessions")
    .select("completed_question_ids")
    .eq("user_id", userId)
    .eq("id", sessionId)
    .single();

  if (sessionLoadError) {
    throw new Error(sessionLoadError.message);
  }

  const mergedCompleted = Array.from(
    new Set([...asStringArray(currentSession?.completed_question_ids), ...completedQuestionIds]),
  );
  const sessionUpdate = await supabase
    .from("practice_sessions")
    .update({
      completed_question_ids: mergedCompleted,
      last_activity_at: new Date().toISOString(),
      session_memory: review.updatedSessionMemory,
    })
    .eq("user_id", userId)
    .eq("id", sessionId);

  if (sessionUpdate.error) {
    throw new Error(sessionUpdate.error.message);
  }

  for (const result of results) {
    const question = recommendationById.get(result.questionId);
    if (!question) {
      continue;
    }
    const attempt = attemptByQuestionId.get(result.questionId);

    if (result.isCorrect === false) {
      const wrongRow = {
        last_answer: (attempt?.answer ?? "") as Json,
        last_attempt_id: attempt?.id ?? null,
        last_explanation: result.explanation,
        last_missed_at: new Date().toISOString(),
        last_round_id: roundId,
        last_session_id: sessionId,
        mastered_at: null,
        question_code: question.questionCode,
        question_id: null,
        question_snapshot: question as unknown as Json,
        question_title: question.title,
        source_question_id: question.id,
        user_id: userId,
      };
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
          ...wrongRow,
          miss_count: Number(existing.data?.miss_count ?? 0) + 1,
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

export async function listActiveWrongQuestions({
  supabase,
  userId,
}: {
  supabase: SupabaseLike;
  userId: string;
}): Promise<PracticeWrongQuestionView[]> {
  const { data, error } = await supabase
    .from("practice_wrong_questions")
    .select("*")
    .eq("user_id", userId)
    .is("mastered_at", null)
    .order("last_missed_at", { ascending: false })
    .limit(50);

  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as any[]).map((row) => {
    const snapshot =
      row.question_snapshot && typeof row.question_snapshot === "object" && !Array.isArray(row.question_snapshot)
        ? (row.question_snapshot as Record<string, unknown>)
        : {};

    return {
      contentHtml: String(snapshot.contentHtml ?? row.question_snapshot?.content_html ?? ""),
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
    };
  });
}
