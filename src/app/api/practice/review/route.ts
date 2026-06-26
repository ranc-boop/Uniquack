import { NextResponse } from "next/server";

import { requirePracticeApiUser } from "@/lib/practice/auth";
import { callPracticeJsonModel, loadPracticeAIProfile } from "@/lib/practice/ai";
import { buildUsageEnvelope, compactSessionMemory, compactText, stableHash, stableStringify, summarizeLLMUsage, traced, writePracticeStatsLog } from "@/lib/practice/context";
import { getOrCreatePracticePreference, persistRoundReview } from "@/lib/practice/persistence";
import { loadPracticePrompt } from "@/lib/practice/prompt-loader";
import type {
  PracticeGradeResult,
  PracticeMemoryUpdate,
  PracticeQuestionReview,
  PracticeRecommendation,
  PracticeReviewRequest,
  PracticeReviewResponse,
  PracticeTraceEvent,
} from "@/lib/practice/types";
import { loadQuestionsForReview } from "@/lib/practice/tools";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";


type AIReviewResponse = {
  next_round_goal?: string;
  results?: Array<{
    explanation?: string;
    is_correct?: boolean | null;
    question_id?: string;
    score?: number | null;
  }>;
  episode_card?: unknown;
  memory_update?: PracticeMemoryUpdate;
  question_reviews?: PracticeQuestionReview[];
  round_patterns?: string[];
  session_state?: unknown;
  summary?: string;
  updated_session_memory?: string;
};

function heuristicReview(body: PracticeReviewRequest) {
  const autoResults = body.attempts
    .map((attempt) => attempt.result)
    .filter((result) => result.gradingMode === "auto");
  const correct = autoResults.filter((result) => result.isCorrect).length;
  const total = autoResults.length;
  const missed = body.attempts
    .filter((attempt) => attempt.result.isCorrect === false)
    .map((attempt) => attempt.questionCode ?? attempt.questionId)
    .join(", ");
  const summary = total
    ? [
        `Score: ${correct}/${total}.`,
        correct
          ? "What went well: you showed enough control on the correctly graded questions to keep moving."
          : "What went well: this round still gives a useful baseline for what to train next.",
        missed
          ? `Needs training: revisit ${missed}; slow down on the underlying setup, definitions, and answer form before raising difficulty.`
          : "Needs training: keep checking notation, units, and edge cases so the correct work stays reliable.",
        "Next step: do a short reinforcement round before broadening the goal.",
      ].join(" ")
    : [
        "This round was saved, but the questions need manual or AI review for scoring.",
        "What went well: your submitted work is now attached to the session, so the next round can still use the attempt context.",
        "Needs training: compare your answer structure with the solution and identify the first step where uncertainty appears.",
      ].join(" ");
  const nextRoundGoal = missed
    ? `${body.goal} — reinforce the skills behind the missed questions before raising difficulty.`
    : `${body.goal} — continue with a slightly broader or harder set.`;
  const previous = compactSessionMemory(body.sessionMemory, body.goal);

  return {
    memoryUpdate: {
      longTermCandidate: missed
        ? `Possible recurring pattern to watch: missed ${missed} under goal "${body.goal}". Confirm across more rounds before treating as durable.`
        : null,
      sessionMemoryNote: missed
        ? `This round showed misses on ${missed}; next training should identify the exact first failing step before raising difficulty.`
        : "This round did not surface an auto-graded miss; keep checking answer form and edge cases.",
    },
    nextRoundGoal,
    questionReviews: body.attempts.map((attempt) => ({
      fixNext: attempt.result.isCorrect === false
        ? "Redo this skill with one simpler variant and name the first uncertain step before calculating."
        : "Use one nearby variant to confirm the answer form stays reliable.",
      observedError: attempt.result.explanation,
      personalizationLink: attempt.result.isCorrect === false
        ? "This miss should influence the next round until a follow-up attempt is correct."
        : null,
      questionId: attempt.questionId,
      verdict: attempt.result.isCorrect === true
        ? "correct"
        : attempt.result.isCorrect === false
          ? "incorrect"
          : "needs review",
    })),
    roundPatterns: missed
      ? [`Missed questions this round: ${missed}.`]
      : ["No auto-graded misses in this round."],
    results: body.attempts.map((attempt) => attempt.result),
    summary,
    updatedSessionMemory: `${previous} Latest round: ${summary}`.slice(0, 1600),
  };
}

function normalizeQuestionReviews({
  attempts,
  value,
}: {
  attempts: PracticeReviewRequest["attempts"];
  value: unknown;
}): PracticeQuestionReview[] {
  const allowedIds = new Set(attempts.map((attempt) => attempt.questionId));
  const rows = Array.isArray(value) ? value : [];
  const byId = new Map<string, PracticeQuestionReview>();

  for (const row of rows) {
    const item = row && typeof row === "object" ? row as Record<string, unknown> : {};
    const questionId = String(item.questionId ?? item.question_id ?? "").trim();

    if (!allowedIds.has(questionId)) {
      continue;
    }

    byId.set(questionId, {
      answerFormIssue: compactText(String(item.answerFormIssue ?? item.answer_form_issue ?? ""), 360) || null,
      conceptGap: compactText(String(item.conceptGap ?? item.concept_gap ?? ""), 360) || null,
      fixNext: compactText(String(item.fixNext ?? item.fix_next ?? item.next_micro_drill ?? ""), 420) || null,
      missingOrExtraParts: compactText(String(item.missingOrExtraParts ?? item.missing_or_extra_parts ?? ""), 360) || null,
      observedError: compactText(String(item.observedError ?? item.observed_error ?? ""), 420) || null,
      personalizationLink: compactText(String(item.personalizationLink ?? item.personalization_link ?? ""), 420) || null,
      questionId,
      verdict: compactText(String(item.verdict ?? ""), 120) || null,
    });
  }

  return attempts.map((attempt) => byId.get(attempt.questionId) ?? {
    fixNext: attempt.result.isCorrect === false
      ? "Use the solution to locate the first incorrect or missing step, then request a simpler follow-up."
      : "Try one nearby variant to make sure the same answer form remains stable.",
    observedError: attempt.result.explanation,
    questionId: attempt.questionId,
    verdict: attempt.result.isCorrect === true
      ? "correct"
      : attempt.result.isCorrect === false
        ? "incorrect"
        : "needs review",
  });
}

function normalizeRoundPatterns(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => compactText(String(item), 260)).filter(Boolean).slice(0, 5)
    : [];
}

function normalizeMemoryUpdate(value: unknown): PracticeMemoryUpdate {
  const item = value && typeof value === "object" ? value as Record<string, unknown> : {};

  return {
    longTermCandidate: compactText(String(item.longTermCandidate ?? item.long_term_candidate ?? ""), 520) || null,
    sessionMemoryNote: compactText(String(item.sessionMemoryNote ?? item.session_memory_note ?? ""), 520) || null,
  };
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function normalizeEpisodeCard(value: unknown, fallback: Record<string, unknown>) {
  const item = asObject(value);
  return Object.keys(item).length ? item : fallback;
}

function normalizeSessionState(value: unknown, fallback: Record<string, unknown>) {
  const item = asObject(value);
  return Object.keys(item).length ? item : fallback;
}

function compactAnswerSpec(value: unknown) {
  if (!value) {
    return null;
  }

  try {
    return compactText(stableStringify(value), 900);
  } catch {
    return compactText(String(value), 900);
  }
}

function optionText(options: unknown) {
  if (!Array.isArray(options)) {
    return [];
  }

  return options.slice(0, 8).map((option) => {
    const item = option && typeof option === "object" ? (option as Record<string, unknown>) : {};
    return {
      content: compactText(String(item.content_html ?? item.content ?? ""), 260),
      id: String(item.id ?? ""),
      label: String(item.label ?? ""),
    };
  });
}

function recommendationFromRoundQuestion(row: Record<string, unknown>): PracticeRecommendation {
  const snapshot =
    row.question_snapshot && typeof row.question_snapshot === "object" && !Array.isArray(row.question_snapshot)
      ? (row.question_snapshot as Partial<PracticeRecommendation>)
      : {};

  return {
    contentExcerpt: String(snapshot.contentExcerpt ?? ""),
    contentHtml: String(snapshot.contentHtml ?? row.content_html ?? ""),
    difficulty: Number(snapshot.difficulty ?? row.difficulty_rating ?? 0),
    expectedSkill: String(snapshot.expectedSkill ?? row.expected_skill ?? ""),
    id: String(row.source_question_id ?? row.question_id ?? snapshot.id ?? ""),
    options: Array.isArray(snapshot.options) ? snapshot.options : [],
    questionCode: String(snapshot.questionCode ?? row.question_code ?? "snapshot"),
    questionType: (snapshot.questionType ?? row.question_type ?? "mixed") as PracticeRecommendation["questionType"],
    reason: String(snapshot.reason ?? row.reason ?? ""),
    source: snapshot.source,
    tagIds: Array.isArray(snapshot.tagIds) ? snapshot.tagIds : [],
    title: String(snapshot.title ?? row.title ?? "Saved question"),
  };
}

function normalizeModelResults({
  aiResults,
  attempts,
  solutionByQuestionId,
}: {
  aiResults: AIReviewResponse["results"];
  attempts: PracticeReviewRequest["attempts"];
  solutionByQuestionId: Map<string, string | null | undefined>;
}): PracticeGradeResult[] {
  const byId = new Map((aiResults ?? []).map((result) => [String(result.question_id ?? ""), result]));

  return attempts.map((attempt) => {
    const model = byId.get(attempt.questionId);
    const isCorrect =
      typeof model?.is_correct === "boolean"
        ? model.is_correct
        : model?.is_correct === null
          ? null
          : attempt.result.isCorrect;
    const score = typeof model?.score === "number"
      ? Math.max(0, Math.min(1, model.score))
      : isCorrect === true
        ? 1
        : isCorrect === false
          ? 0
          : null;

    return {
      acceptedAnswers: attempt.result.acceptedAnswers,
      correctOptionIds: attempt.result.correctOptionIds,
      explanation:
        compactText(model?.explanation ?? "", 900) ||
        attempt.result.explanation ||
        "The review model did not provide a per-question explanation.",
      gradingMode: "manual",
      isCorrect,
      questionId: attempt.questionId,
      score,
      solutionHtml: solutionByQuestionId.get(attempt.questionId) ?? attempt.result.solutionHtml ?? null,
    };
  });
}

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  }

  const supabase = await createClient();
  const auth = await requirePracticeApiUser(supabase);
  if (auth.response) {
    return auth.response;
  }

  const body = (await request.json()) as PracticeReviewRequest;
  const goal = (body.goal ?? "").trim().slice(0, 500);
  const sessionId = (body.sessionId ?? "").trim();
  const roundId = (body.roundId ?? "").trim();
  const trace: PracticeTraceEvent[] = [];

  if (!goal) {
    return NextResponse.json({ error: "Practice goal is required." }, { status: 400 });
  }

  if (!sessionId || !roundId) {
    return NextResponse.json({ error: "sessionId and roundId are required." }, { status: 400 });
  }

  const { data: roundQuestions, error: roundQuestionsError } = await supabase
    .from("practice_round_questions")
    .select("*")
    .eq("user_id", auth.user.id)
    .eq("session_id", sessionId)
    .eq("round_id", roundId)
    .order("position", { ascending: true });

  if (roundQuestionsError) {
    return NextResponse.json({ error: roundQuestionsError.message }, { status: 500 });
  }
  const { data: sessionRecord, error: sessionRecordError } = await supabase
    .from("practice_sessions")
    .select("cache_prefix_version,course_framework_snapshot,long_term_memory_snapshot,outline_user_notes,next_user_notes,session_plan,session_thread_messages")
    .eq("user_id", auth.user.id)
    .eq("id", sessionId)
    .maybeSingle();

  if (sessionRecordError) {
    return NextResponse.json({ error: sessionRecordError.message }, { status: 500 });
  }

  const { data: episodeRecord, error: episodeRecordError } = await supabase
    .from("practice_agent_episodes")
    .select("round_contract,episode_card,cache_thread_entry")
    .eq("user_id", auth.user.id)
    .eq("round_id", roundId)
    .maybeSingle();

  if (episodeRecordError) {
    return NextResponse.json({ error: episodeRecordError.message }, { status: 500 });
  }

  const cachePrefixVersion = String(sessionRecord?.cache_prefix_version ?? "practice-core-v1");
  const sessionPlan = sessionRecord?.session_plan ?? null;
  const sessionThreadMessages = Array.isArray(sessionRecord?.session_thread_messages)
    ? sessionRecord.session_thread_messages.slice(-24)
    : [];
  const outlineUserNotes = String(sessionRecord?.outline_user_notes ?? "");
  const userNextRoundNote = String(body.userNextRoundNote ?? sessionRecord?.next_user_notes ?? "").trim().slice(0, 1200);
  const roundContract = episodeRecord?.round_contract ?? {};
  const currentRoundThreadEntry = episodeRecord?.cache_thread_entry ?? {};

  const persistedRecommendations = ((roundQuestions ?? []) as Record<string, unknown>[])
    .map(recommendationFromRoundQuestion)
    .filter((question) => question.id);

  const attempts = body.attempts ?? [];
  const preference = await getOrCreatePracticePreference({ supabase, userId: auth.user.id });
  const lockedLongTermMemory = String(sessionRecord?.long_term_memory_snapshot ?? "").trim() ||
    preference.long_term_preference.trim();
  if (!String(sessionRecord?.long_term_memory_snapshot ?? "").trim() && lockedLongTermMemory) {
    await supabase
      .from("practice_sessions")
      .update({ long_term_memory_snapshot: lockedLongTermMemory.slice(0, 1000) })
      .eq("user_id", auth.user.id)
      .eq("id", sessionId);
  }
  const longTermMemory = compactText(lockedLongTermMemory, 1000);
  const questionIds = Array.from(new Set(attempts.map((attempt) => attempt.questionId).filter(Boolean)));
  const reviewQuestions = await loadQuestionsForReview({ questionIds, supabase }) as any[];
  const questionById = new Map<string, any>(reviewQuestions.map((question) => [String(question.id), question]));
  const recommendationById = new Map<string, any>((body.recommendations ?? []).map((question) => [String(question.id), question]));
  const solutionByQuestionId = new Map<string, string | null | undefined>(reviewQuestions.map((question) => [String(question.id), question.solution_html]));
  const compactAttempts = attempts.map((attempt) => {
    const stored = questionById.get(attempt.questionId);
    const recommended = recommendationById.get(attempt.questionId);

    return {
      answer_spec: compactAnswerSpec(stored?.answer_spec),
      hint_count: attempt.hintCount ?? 0,
      options: optionText(stored?.options ?? recommended?.options),
      question_code: stored?.question_code ?? recommended?.questionCode ?? attempt.questionCode,
      question_id: attempt.questionId,
      question_type: stored?.question_type ?? recommended?.questionType,
      solution_excerpt: compactText(stored?.solution_html, 900),
      stem: compactText(stored?.content_html ?? recommended?.contentHtml, 1200),
      student_answer: attempt.answer,
      title: compactText(stored?.title ?? recommended?.title ?? attempt.title, 180),
    };
  });

  trace.push({
    inputSummary: "Cache-first review context: stable session plan + append-only prior thread entries + volatile current round suffix.",
    outputSummary: `prefix_hash=${stableHash({ sessionPlan, sessionThreadMessages })}; suffix_hash=${stableHash({ roundContract, roundId, attempts: compactAttempts.length, userNextRoundNote })}; attempts=${compactAttempts.length}; user_note=${userNextRoundNote.length}; locked_memory=${longTermMemory.length} chars`,
    phase: "context",
    toolName: "compact_review_context",
  });


  try {
    const profile = await loadPracticeAIProfile(supabase);
    const systemPrompt = await loadPracticePrompt("review-system");
    const fallback = heuristicReview(body);
    const stableReviewPrefix = {
      cache_policy: {
        cache_prefix_version: cachePrefixVersion,
        dynamic_suffix_rule: "Attempts, answers, ids, and user notes stay in the final user message.",
        review_policy: "Per-question review judges correctness; aggregator decides next round using session_plan and the current round contract from the suffix.",
      },
      course_framework: sessionRecord?.course_framework_snapshot ?? null,
      session_plan: sessionPlan,
    };
    const stableThreadMessages = sessionThreadMessages.filter((entry) => {
      const item = asObject(entry);
      return !(item.kind === "current_task" && item.round_id === roundId);
    });
    const threadMessages = stableThreadMessages.map((entry, index) => ({
      content: stableStringify(entry),
      name: `practice_thread_${index + 1}`,
      role: "assistant" as const,
    }));
    const reviewSuffix = {
      attempts: compactAttempts,
      current_round_thread_entry: currentRoundThreadEntry,
      goal,
      long_term_memory: longTermMemory || "No long-term memory yet.",
      outline_user_notes: outlineUserNotes,
      round_contract: roundContract,
      task_type: "round_review",
      user_next_round_note: userNextRoundNote,
      volatile_notice: "This suffix contains the current round contract, current task entry, attempts, answers, ids, solution excerpts, locked memory snapshot, and user notes.",
    };

    const aiResult = await traced({
      inputSummary: `Single-pass review JSON call with ${compactAttempts.length} attempts.`,
      outputSummary: (value) => `provider=${value.providerLabel}`,
      phase: "review",
      trace,
      toolName: "ds_review_round",
      run: () => callPracticeJsonModel<AIReviewResponse>({
        debugContext: { goal, phase: "review", roundId, sessionId },
        profile,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "system", content: stableStringify(stableReviewPrefix) },
          ...threadMessages,
          { role: "user", content: stableStringify(reviewSuffix) },
        ],
      }),
    });

    const usageEnvelopes: Record<string, unknown>[] = [];
    if (aiResult.usage) {
      const usageEnvelope = buildUsageEnvelope({
        cachePrefixVersion,
        phase: "review",
        prefixPayload: { stableReviewPrefix, stableThreadMessages },
        providerLabel: aiResult.providerLabel,
        suffixPayload: reviewSuffix,
        usage: aiResult.usage,
      });
      usageEnvelopes.push(usageEnvelope);
      void writePracticeStatsLog({
        context: { goal, phase: "review", roundId, sessionId },
        payload: usageEnvelope,
      });
      trace.push({
        inputSummary: "Provider usage for review prompt caching/token monitoring.",
        llmUsage: aiResult.usage,
        outputSummary: summarizeLLMUsage(aiResult.usage),
        phase: "review",
        toolName: "model_usage",
      });
    }

    const questionReviews = normalizeQuestionReviews({
      attempts,
      value: aiResult.parsed.question_reviews,
    });
    const modelResults = normalizeModelResults({
      aiResults: aiResult.parsed.results,
      attempts,
      solutionByQuestionId,
    });
    const roundPatterns = normalizeRoundPatterns(aiResult.parsed.round_patterns);
    const memoryUpdate = normalizeMemoryUpdate(aiResult.parsed.memory_update);
    const nextRoundGoal = aiResult.parsed.next_round_goal?.trim() || fallback.nextRoundGoal;
    const summary = aiResult.parsed.summary?.trim() || fallback.summary;
    const episodeCard = normalizeEpisodeCard(aiResult.parsed.episode_card, {
      next_round_constraint: nextRoundGoal,
      review_diagnosis: { question_reviews: questionReviews, round_patterns: roundPatterns, summary },
      student_attempt_summary: modelResults.map((result) => ({
        is_correct: result.isCorrect,
        question_id: result.questionId,
        score: result.score,
      })),
    });
    const nextSessionState = normalizeSessionState(aiResult.parsed.session_state, {
      current_focus: nextRoundGoal,
      last_review_summary: summary,
      next_round_constraints: roundPatterns.length ? roundPatterns : fallback.roundPatterns,
      user_next_round_note: userNextRoundNote,
      version: 1,
    });
    const response: PracticeReviewResponse = {
      episodeCard,
      llmUsage: usageEnvelopes,
      memoryUpdate,
      mode: "ai",
      nextRoundGoal,
      providerLabel: aiResult.providerLabel,
      questionReviews,
      results: modelResults,
      roundPatterns: roundPatterns.length ? roundPatterns : fallback.roundPatterns,
      sessionId,
      sessionState: nextSessionState,
      summary,
      trace,
      updatedSessionMemory:
        aiResult.parsed.updated_session_memory?.trim() ||
        fallback.updatedSessionMemory,
    };

    await persistRoundReview({
      attempts,
      hintsByQuestionId: body.hintsByQuestionId,
      recommendations: persistedRecommendations,
      results: modelResults,
      review: response,
      roundId,
      sessionId,
      supabase,
      userId: auth.user.id,
    });

    return NextResponse.json(response);
  } catch (error) {
    trace.push({
      error: error instanceof Error ? error.message : String(error),
      inputSummary: "AI review failed; deterministic compact memory update used.",
      phase: "review",
      toolName: "ds_review_round",
    });
    const fallback = heuristicReview(body);
    const response: PracticeReviewResponse = {
      episodeCard: {
        next_round_constraint: fallback.nextRoundGoal,
        review_diagnosis: { question_reviews: fallback.questionReviews, round_patterns: fallback.roundPatterns, summary: fallback.summary },
      },
      llmUsage: [],
      memoryUpdate: fallback.memoryUpdate,
      mode: "heuristic",
      nextRoundGoal: fallback.nextRoundGoal,
      questionReviews: fallback.questionReviews,
      results: fallback.results,
      roundPatterns: fallback.roundPatterns,
      sessionId,
      sessionState: {
        current_focus: fallback.nextRoundGoal,
        last_review_summary: fallback.summary,
        next_round_constraints: fallback.roundPatterns,
        user_next_round_note: body.userNextRoundNote ?? "",
        version: 1,
      },
      summary: fallback.summary,
      trace,
      updatedSessionMemory: fallback.updatedSessionMemory,
    };

    await persistRoundReview({
      attempts,
      hintsByQuestionId: body.hintsByQuestionId,
      recommendations: persistedRecommendations,
      results: fallback.results,
      review: response,
      roundId,
      sessionId,
      supabase,
      userId: auth.user.id,
    });

    return NextResponse.json(response);
  }
}
