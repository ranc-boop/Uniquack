import { NextResponse } from "next/server";

import { requirePracticeApiUser } from "@/lib/practice/auth";
import { callPracticeJsonModel, loadPracticeAIProfile } from "@/lib/practice/ai";
import { compactSessionMemory, compactText, traced } from "@/lib/practice/context";
import type {
  PracticeReviewRequest,
  PracticeReviewResponse,
  PracticeTraceEvent,
} from "@/lib/practice/types";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type AIReviewResponse = {
  next_round_goal?: string;
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
    ? `Auto-graded score: ${correct}/${total}. ${missed ? `Missed: ${missed}.` : "No auto-graded misses."}`
    : "This round was saved, but the questions need manual or AI review for scoring.";
  const nextRoundGoal = missed
    ? `${body.goal} — reinforce the skills behind the missed questions before raising difficulty.`
    : `${body.goal} — continue with a slightly broader or harder set.`;
  const previous = compactSessionMemory(body.sessionMemory, body.goal);

  return {
    nextRoundGoal,
    summary,
    updatedSessionMemory: `${previous} Latest round: ${summary}`.slice(0, 1600),
  };
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
  const trace: PracticeTraceEvent[] = [];

  if (!goal) {
    return NextResponse.json({ error: "Practice goal is required." }, { status: 400 });
  }

  const compactAttempts = (body.attempts ?? []).map((attempt) => ({
    answer: attempt.answer,
    accepted_answers: attempt.result.acceptedAnswers?.slice(0, 6),
    correct_option_ids: attempt.result.correctOptionIds?.slice(0, 6),
    explanation: attempt.result.explanation,
    grading_mode: attempt.result.gradingMode,
    hint_count: attempt.hintCount ?? 0,
    is_correct: attempt.result.isCorrect,
    question_code: attempt.questionCode,
    question_id: attempt.questionId,
    score: attempt.result.score,
    solution_excerpt:
      attempt.result.isCorrect === false || attempt.result.gradingMode === "manual"
        ? compactText(attempt.result.solutionHtml, 700)
        : undefined,
    title: attempt.title,
  }));
  const sessionMemory = compactSessionMemory(body.sessionMemory, goal);

  trace.push({
    inputSummary: "Review context contains submitted answers, grading results, solution availability, recommendation reasons, and compact memory. Long HTML is not carried forward.",
    outputSummary: `attempts=${compactAttempts.length}; previous memory=${sessionMemory.length} chars`,
    phase: "context",
    toolName: "compact_review_context",
  });


  try {
    const profile = await loadPracticeAIProfile(supabase);
    const aiResult = await traced({
      inputSummary: `DS review call with ${compactAttempts.length} graded attempts.`,
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
                "You are O2I Practice Review Agent. Review the completed round and update compact session memory.",
                "Borrow Codex-style context management: preserve stable facts, do not copy full old history, and write a compact summary for future rounds.",
                "Return JSON only with keys: summary, next_round_goal, updated_session_memory.",
                "Do not invent new question IDs or scores. Keep feedback short and actionable.",
              ].join("\n"),
            },
            {
              role: "user",
              content: JSON.stringify({
                attempts: compactAttempts,
                goal,
                previous_session_memory: sessionMemory,
                recommendations: (body.recommendations ?? []).map((item) => ({
                  difficulty: item.difficulty,
                  question_code: item.questionCode,
                  question_id: item.id,
                  question_type: item.questionType,
                  reason: item.reason,
                  tag_ids: item.tagIds?.slice(0, 8) ?? [],
                  title: compactText(item.title, 180),
                })),
              }),
            },
          ],
        }),
    });
    const fallback = heuristicReview(body);
    const response: PracticeReviewResponse = {
      mode: "ai",
      nextRoundGoal: aiResult.parsed.next_round_goal?.trim() || fallback.nextRoundGoal,
      providerLabel: aiResult.providerLabel,
      summary: aiResult.parsed.summary?.trim() || fallback.summary,
      trace,
      updatedSessionMemory:
        aiResult.parsed.updated_session_memory?.trim().slice(0, 1600) ||
        fallback.updatedSessionMemory,
    };

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
      summary: fallback.summary,
      trace,
      updatedSessionMemory: fallback.updatedSessionMemory,
    };

    return NextResponse.json(response);
  }
}
