import {
  CURRENT_PRACTICE_PENDING_ROUND_STORAGE_KEY,
  LEGACY_PRACTICE_STORAGE_KEYS,
} from "@/lib/practice/schema";
import { restoredPracticeQuestionId } from "@/lib/practice/answer-restore";
import type {
  PracticeGradeResult,
  PracticeRecommendResponse,
  PracticeRecommendation,
  PracticeRoundHistory,
} from "@/lib/practice/types";

export function formatDuration(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes ? `${minutes}m ${seconds.toString().padStart(2, "0")}s` : `${seconds}s`;
}

export function recommendationFromHistoryQuestion(
  question: PracticeRoundHistory["questions"][number],
): PracticeRecommendation {
  return {
    contentExcerpt: question.contentExcerpt,
    contentHtml: question.contentHtml,
    difficulty: question.difficulty,
    expectedSkill: question.expectedSkill,
    id: question.sourceQuestionId ?? question.id,
    options: question.options,
    questionCode: question.questionCode,
    questionType: question.questionType as PracticeRecommendation["questionType"],
    reason: question.reason || "Saved from this practice session.",
    source: question.source,
    tagIds: question.tagIds,
    title: question.title,
  };
}

export function resultsFromHistoryRound(round: PracticeRoundHistory): PracticeGradeResult[] {
  return round.attempts.map((attempt) => ({
    explanation: attempt.explanation ?? "No saved explanation.",
    gradingMode: "manual" as const,
    isCorrect: attempt.isCorrect,
    questionId: restoredPracticeQuestionId(attempt, round.questions) ?? "",
    score: attempt.score,
    solutionHtml: attempt.solutionHtml,
  })).filter((result) => result.questionId);
}

export function clearLegacyPracticeStorage() {
  for (const key of LEGACY_PRACTICE_STORAGE_KEYS) {
    window.sessionStorage.removeItem(key);
  }
}

export function readPendingPracticeRound() {
  const pendingRoundRaw = window.sessionStorage.getItem(
    CURRENT_PRACTICE_PENDING_ROUND_STORAGE_KEY,
  );
  if (!pendingRoundRaw) {
    return null;
  }

  window.sessionStorage.removeItem(CURRENT_PRACTICE_PENDING_ROUND_STORAGE_KEY);
  try {
    const pendingRound = JSON.parse(pendingRoundRaw) as PracticeRecommendResponse;
    return pendingRound.roundId && pendingRound.recommendations?.length
      ? pendingRound
      : null;
  } catch {
    return null;
  }
}
