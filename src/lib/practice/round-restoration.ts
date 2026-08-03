import {
  buildRestoredPracticeAnswers,
  restoredPracticeQuestionId,
} from "@/lib/practice/answer-restore";
import {
  recommendationFromHistoryQuestion,
  resultsFromHistoryRound,
} from "@/lib/practice/client-helpers";
import type {
  PracticeGradeResult,
  PracticeRecommendResponse,
  PracticeReviewResponse,
  PracticeRoundHistory,
  PracticeSessionDetail,
  PracticeTraceEvent,
} from "@/lib/practice/types";

type AnswersState = Record<string, string | string[]>;
type HintsState = Record<string, string[]>;

export type RestoredPracticeRoundState = {
  answers: AnswersState;
  goal: string;
  hints: HintsState;
  liveTrace: PracticeTraceEvent[];
  phase: "recommended" | "feedback";
  recommendation: PracticeRecommendResponse;
  results: PracticeGradeResult[];
  review: PracticeReviewResponse | null;
  reviewTrace: PracticeTraceEvent[];
};

export function restorePracticeRoundState(
  round: PracticeRoundHistory,
  session: PracticeSessionDetail,
  draftAnswers?: AnswersState,
): RestoredPracticeRoundState | null {
  if (!round.questions.length) return null;

  const restoredRecommendations = round.questions
    .map(recommendationFromHistoryQuestion)
    .filter((question) => question.id);
  if (!restoredRecommendations.length) return null;

  const recommendation: PracticeRecommendResponse = {
    maxToolCalls: 0,
    mode: "heuristic",
    recommendations: restoredRecommendations,
    roundId: round.id,
    roundGoal: round.roundGoal || session.goal,
    sessionId: session.id,
    sessionMemory: session.sessionMemory,
    tagContext: session.tagContext,
    trace: round.trace ?? [],
  };
  const results = resultsFromHistoryRound(round);
  const persistedAnswers = buildRestoredPracticeAnswers(
    round.attempts,
    round.questions,
  );
  const answers = round.status === "completed" ? persistedAnswers : draftAnswers ?? persistedAnswers;
  const hints: HintsState = {};

  for (const attempt of round.attempts) {
    const questionId = restoredPracticeQuestionId(attempt, round.questions);
    if (questionId) hints[questionId] = attempt.hints;
  }

  const review = round.status === "completed"
    ? {
        mode: "heuristic" as const,
        nextRoundGoal: round.nextRoundGoal ?? session.goal,
        results,
        sessionId: session.id,
        summary: round.reviewSummary ?? "This round has saved review results.",
        trace: round.trace ?? [],
        updatedSessionMemory: session.sessionMemory,
      }
    : null;

  return {
    answers,
    goal: round.nextRoundGoal ?? "",
    hints,
    liveTrace: round.trace ?? [],
    phase: review ? "feedback" : "recommended",
    recommendation,
    results,
    review,
    reviewTrace: review ? round.trace ?? [] : [],
  };
}
