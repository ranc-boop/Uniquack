import { NextResponse } from "next/server";

import { updateLinkedAssignmentProgressAfterPractice } from "@/lib/practice/assignment-linkage";
import { requirePracticeApiUser } from "@/lib/practice/auth";
import { gradePracticeAttempt } from "@/lib/practice/grading";
import type {
  PracticeGradeRequest,
  PracticeGradeResponse,
  PracticeTraceEvent,
} from "@/lib/practice/types";
import { loadQuestionsForReview } from "@/lib/practice/tools";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

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
