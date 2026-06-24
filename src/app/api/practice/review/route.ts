import { NextResponse } from "next/server";

import { requirePracticeApiUser } from "@/lib/practice/auth";
import { callPracticeJsonModel, loadPracticeAIProfile } from "@/lib/practice/ai";
import { compactSessionMemory, compactText, traced } from "@/lib/practice/context";
import { persistRoundReview } from "@/lib/practice/persistence";
import type {
  PracticeGradeResult,
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
    nextRoundGoal,
    results: body.attempts.map((attempt) => attempt.result),
    summary,
    updatedSessionMemory: `${previous} Latest round: ${summary}`.slice(0, 1600),
  };
}

function compactAnswerSpec(value: unknown) {
  if (!value) {
    return null;
  }

  try {
    return compactText(JSON.stringify(value), 900);
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

  const persistedRecommendations = ((roundQuestions ?? []) as Record<string, unknown>[])
    .map(recommendationFromRoundQuestion)
    .filter((question) => question.id);

  const attempts = body.attempts ?? [];
  const sessionMemory = compactSessionMemory(body.sessionMemory, goal);
  const questionIds = Array.from(new Set(attempts.map((attempt) => attempt.questionId).filter(Boolean)));
  const reviewQuestions = await loadQuestionsForReview({ questionIds, supabase });
  const questionById = new Map(reviewQuestions.map((question) => [question.id, question]));
  const recommendationById = new Map((body.recommendations ?? []).map((question) => [question.id, question]));
  const solutionByQuestionId = new Map(reviewQuestions.map((question) => [question.id, question.solution_html]));
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
    inputSummary: "Review context contains the last-round questions, options, answer specs, solution excerpts, submitted answers, hint counts, and compact memory. Recommendation tool context is intentionally discarded.",
    outputSummary: `attempts=${compactAttempts.length}; previous memory=${sessionMemory.length} chars`,
    phase: "context",
    toolName: "compact_review_context",
  });


  try {
    const profile = await loadPracticeAIProfile(supabase);
    const aiResult = await traced({
      inputSummary: `DS review JSON call with ${compactAttempts.length} attempts.`,
      outputSummary: (value) => `provider=${value.providerLabel}`,
      phase: "review",
      trace,
      toolName: "ds_review_round",
      run: () =>
        callPracticeJsonModel<AIReviewResponse>({
          debugContext: { goal, phase: "review" },
          profile,
          messages: [
            {
              role: "system",
              content: [
                "You are O2I Practice Review Agent. Review the completed round and update compact session memory. Return valid json only.",
                "Borrow Codex-style context management: preserve stable facts, do not copy full old history, and write a compact summary for future rounds.",
                "Ignore prior recommendation/tool context. Judge correctness from the provided question, options, answer_spec, solution excerpt, and student answer.",
                "For every attempt, decide is_correct with the model as the final authority. Use null only when the provided data is insufficient.",
                "Write summary as a coaching review, not a one-line score. Use 120-220 words.",
                "The summary must mention: what the student did well, what needs training, and what to practice next.",
                "Be specific to the submitted attempts. Name question codes or skill patterns when useful.",
                "Return JSON only with keys: summary, results, next_round_goal, updated_session_memory.",
                "Schema example: {\"summary\":\"...\",\"results\":[{\"question_id\":\"q1\",\"is_correct\":true,\"score\":1,\"explanation\":\"...\"}],\"next_round_goal\":\"...\",\"updated_session_memory\":\"...\"}.",
                "Do not invent question IDs. Keep per-question explanations concise, but make the round summary substantial and actionable.",
              ].join("\n"),
            },
            {
              role: "user",
              content: JSON.stringify({
                attempts: compactAttempts,
                goal,
                previous_session_memory: sessionMemory,
              }),
            },
          ],
        }),
    });
    const fallback = heuristicReview(body);
    const modelResults = normalizeModelResults({
      aiResults: aiResult.parsed.results,
      attempts,
      solutionByQuestionId,
    });
    const response: PracticeReviewResponse = {
      mode: "ai",
      nextRoundGoal: aiResult.parsed.next_round_goal?.trim() || fallback.nextRoundGoal,
      providerLabel: aiResult.providerLabel,
      results: modelResults,
      sessionId,
      summary: aiResult.parsed.summary?.trim() || fallback.summary,
      trace,
      updatedSessionMemory:
        aiResult.parsed.updated_session_memory?.trim().slice(0, 1600) ||
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
      mode: "heuristic",
      nextRoundGoal: fallback.nextRoundGoal,
      results: fallback.results,
      sessionId,
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
