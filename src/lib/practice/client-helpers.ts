import {
  CURRENT_PRACTICE_PENDING_ROUND_STORAGE_KEY,
  LEGACY_PRACTICE_STORAGE_KEYS,
} from "@/lib/practice/schema";
import { restoredPracticeQuestionId } from "@/lib/practice/answer-restore";
import type {
  PracticeAttemptInput,
  PracticeGradeResult,
  PracticeRecommendResponse,
  PracticeRecommendation,
  PracticeRoundHistory,
} from "@/lib/practice/types";

type PracticeAnswerMap = Readonly<Record<string, PracticeAttemptInput["answer"]>>;
type PracticeHintMap = Readonly<Record<string, readonly string[]>>;

export function practiceAnswerKey(question: Pick<PracticeRecommendation, "id">) {
  return question.id;
}

export function hasSubmittedPracticeAnswer(value: unknown) {
  if (typeof value === "string") return Boolean(value.trim());
  if (typeof value === "number" || typeof value === "boolean") return true;
  if (Array.isArray(value)) return value.length > 0;
  if (value && typeof value === "object") return Object.keys(value).length > 0;
  return false;
}

export function buildPracticeSubmittedAttempts(
  questions: readonly Pick<PracticeRecommendation, "id">[],
  answers: PracticeAnswerMap,
  hints: PracticeHintMap,
): PracticeAttemptInput[] {
  return questions.map((question) => {
    const questionId = practiceAnswerKey(question);
    return {
      answer: answers[questionId] ?? "",
      hintCount: hints[questionId]?.length ?? 0,
      questionId,
    };
  });
}

export function evaluatePracticeSubmittedAttempts(
  questions: readonly Pick<PracticeRecommendation, "id">[],
  attempts: readonly PracticeAttemptInput[],
) {
  const requiredQuestionKeys = questions.map(practiceAnswerKey);
  const requiredQuestionKeySet = new Set(requiredQuestionKeys);
  const attemptCountsByQuestionKey = new Map<string, number>();

  for (const attempt of attempts) {
    attemptCountsByQuestionKey.set(
      attempt.questionId,
      (attemptCountsByQuestionKey.get(attempt.questionId) ?? 0) + 1,
    );
  }

  const hasAmbiguousAttempt =
    requiredQuestionKeySet.size !== requiredQuestionKeys.length ||
    attempts.some((attempt) => !requiredQuestionKeySet.has(attempt.questionId)) ||
    requiredQuestionKeys.some(
      (questionKey) => (attemptCountsByQuestionKey.get(questionKey) ?? 0) > 1,
    );
  const hasMissingAttempt =
    !requiredQuestionKeys.length ||
    requiredQuestionKeys.some(
      (questionKey) => (attemptCountsByQuestionKey.get(questionKey) ?? 0) === 0,
    );
  const submittedAttempt = hasAmbiguousAttempt
    ? "AMBIGUOUS" as const
    : hasMissingAttempt
      ? "MISSING" as const
      : "FOUND" as const;
  const attemptByQuestionKey = new Map(
    attempts.map((attempt) => [attempt.questionId, attempt]),
  );
  const missingRequiredAttemptCount = requiredQuestionKeys.reduce((count, questionKey) => {
    const matchingAttempt = attemptByQuestionKey.get(questionKey);
    return count + (
      matchingAttempt &&
      (attemptCountsByQuestionKey.get(questionKey) ?? 0) === 1 &&
      hasSubmittedPracticeAnswer(matchingAttempt.answer)
        ? 0
        : 1
    );
  }, 0);
  const submittedAttemptAnswer = submittedAttempt === "AMBIGUOUS"
    ? "NOT_CHECKED" as const
    : submittedAttempt === "MISSING"
      ? "MISSING" as const
      : missingRequiredAttemptCount
        ? "EMPTY" as const
        : "PRESENT" as const;

  return {
    currentRoundQuestionCount: requiredQuestionKeys.length,
    missingRequiredAttemptCount,
    submittedAttempt,
    submittedAttemptAnswer,
    submittedAttemptCount: attempts.length,
  };
}

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
