import { NextResponse } from "next/server";

import { updateLinkedAssignmentProgressAfterPractice } from "@/lib/practice/assignment-linkage";
import { requirePracticeApiUser } from "@/lib/practice/auth";
import { gradePracticeAttempt } from "@/lib/practice/grading";
import {
  persistQuestionReviewResults,
} from "@/lib/practice/persistence";
import {
  isCurrentPracticeQuestionSnapshot,
} from "@/lib/practice/schema";
import type {
  PracticeGradeRequest,
  PracticeGradeResponse,
  PracticeTraceEvent,
  PracticeRecommendation,
  PracticeQuestionReview,
} from "@/lib/practice/types";
import { loadQuestionsForReview } from "@/lib/practice/tools";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function recommendationFromRoundQuestion(row: Record<string, unknown>): PracticeRecommendation | null {
  if (!isCurrentPracticeQuestionSnapshot(row.question_snapshot)) {
    return null;
  }

  const snapshot = row.question_snapshot as Partial<PracticeRecommendation>;
  const sourceQuestionId = String(row.source_question_id ?? snapshot.id ?? "").trim();
  if (!sourceQuestionId) {
    return null;
  }

  return {
    contentExcerpt: String(snapshot.contentExcerpt ?? ""),
    contentHtml: String(snapshot.contentHtml ?? row.content_html ?? ""),
    difficulty: Number(snapshot.difficulty ?? row.difficulty_rating ?? 0),
    expectedSkill: String(snapshot.expectedSkill ?? row.expected_skill ?? "Practice this assigned question"),
    id: sourceQuestionId,
    options: Array.isArray(snapshot.options) ? snapshot.options : [],
    questionCode: String(snapshot.questionCode ?? row.question_code ?? "snapshot"),
    questionType: snapshot.questionType ?? "mixed",
    reason: String(snapshot.reason ?? row.reason ?? "Assigned practice item."),
    source: typeof snapshot.source === "string" ? snapshot.source : null,
    tagIds: Array.isArray(snapshot.tagIds) ? snapshot.tagIds.map(String).filter(Boolean) : [],
    title: String(snapshot.title ?? row.title ?? "Practice question"),
  };
}

function reviewFromGradeResult({
  answer,
  explanation,
  isCorrect,
  questionId,
  score,
  solutionHtml,
}: {
  answer: string | string[];
  explanation: string;
  isCorrect: boolean | null;
  questionId: string;
  score: number | null;
  solutionHtml: string | null;
}): PracticeQuestionReview {
  return {
    isCorrect,
    judgmentReason: explanation,
    questionId,
    score,
    solutionKeyPoints: solutionHtml,
    studentAnswer: answer,
    verdict: isCorrect === true ? "correct" : isCorrect === false ? "incorrect" : "needs_review",
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

  const body = (await request.json()) as PracticeGradeRequest;
  const attempts = body.attempts ?? [];
  const trace: PracticeTraceEvent[] = [];

  if (!attempts.length) {
    return NextResponse.json({ error: "No attempts submitted." }, { status: 400 });
  }

  const started = Date.now();

  try {
    const questionIds = Array.from(new Set(attempts.map((attempt) => attempt.questionId)));
    const questions = await loadQuestionsForReview({ questionIds, supabase });
    const byId = new Map(questions.map((question) => [question.id, question]));
    trace.push({
      elapsedMs: Date.now() - started,
      inputSummary: `${questionIds.length} submitted question IDs`,
      outputSummary: `Loaded ${questions.length} question records with answer_spec after submit.`,
      phase: "grading",
      resultCount: questions.length,
      toolName: "get_round_review_context",
    });

    const results = attempts.map((attempt) => {
      const question = byId.get(attempt.questionId);

      if (!question) {
        return {
          explanation: "Question not found or unavailable.",
          gradingMode: "manual" as const,
          isCorrect: null,
          questionId: attempt.questionId,
          score: null,
          solutionHtml: null,
        };
      }

      return gradePracticeAttempt({ attempt, question });
    });

    if (body.sessionId && body.roundId) {
      const { data: roundQuestions, error: roundQuestionError } = await supabase
        .from("practice_round_questions")
        .select("source_question_id,question_snapshot")
        .eq("user_id", auth.user.id)
        .eq("session_id", body.sessionId)
        .eq("round_id", body.roundId);

      if (roundQuestionError) {
        throw new Error(roundQuestionError.message);
      }

      const recommendations = ((roundQuestions ?? []) as Record<string, unknown>[])
        .map(recommendationFromRoundQuestion)
        .filter((question): question is PracticeRecommendation => Boolean(question?.id));
      const resultByQuestionId = new Map(results.map((result) => [result.questionId, result]));
      const questionReviews = attempts
        .map((attempt) => {
          const result = resultByQuestionId.get(attempt.questionId);
          return result
            ? reviewFromGradeResult({
                answer: attempt.answer,
                explanation: result.explanation,
                isCorrect: result.isCorrect,
                questionId: result.questionId,
                score: result.score,
                solutionHtml: result.solutionHtml,
              })
            : null;
        })
        .filter((review): review is PracticeQuestionReview => review !== null);

      if (recommendations.length && questionReviews.length) {
        await persistQuestionReviewResults({
          attempts,
          hintsByQuestionId: {},
          llmUsage: [],
          providerLabel: "Deterministic fallback",
          questionReviews,
          recommendations,
          results,
          roundId: body.roundId,
          sessionId: body.sessionId,
          supabase,
          trace,
          userId: auth.user.id,
        });
        trace.push({
          inputSummary: `${attempts.length} submitted answer${attempts.length === 1 ? "" : "s"}`,
          outputSummary: `Persisted ${questionReviews.length} deterministic review result${questionReviews.length === 1 ? "" : "s"}.`,
          phase: "review",
          resultCount: questionReviews.length,
          toolName: "persist_deterministic_grade_review",
        });
      }
    }

    const assignmentProgress = body.sessionId
      ? await updateLinkedAssignmentProgressAfterPractice({
          attemptedQuestionIds: attempts.map((attempt) => attempt.questionId),
          results,
          roundId: body.roundId,
          sessionId: body.sessionId,
          supabase,
          userId: auth.user.id,
        })
      : undefined;
    const response: PracticeGradeResponse = { assignmentProgress, results, trace };

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : String(error),
        trace,
      },
      { status: 500 },
    );
  }
}
