import type { Json } from "@/types/database";
import { canonicalPracticeSourceQuestionId } from "@/lib/practice/question-identity";

export type RestoredPracticeAnswer = string | string[];

type RestoredAttemptLike = {
  answer: unknown;
  questionId?: string | null;
  sourceQuestionId?: string | null;
};

type RestoredQuestionLike = {
  id: string;
  questionId?: string | null;
  sourceQuestionId?: string | null;
};

export function submittedPracticeAnswerForPersistence(value: Json): Json {
  return value;
}

function jsonValueText(value: unknown) {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (!value || typeof value !== "object") return "";

  try {
    return JSON.stringify(value) ?? "";
  } catch {
    return "";
  }
}

export function normalizePersistedPracticeAnswer(value: unknown): RestoredPracticeAnswer {
  if (Array.isArray(value)) {
    return value.map(jsonValueText);
  }

  return jsonValueText(value);
}

export function hasVisiblePracticeAnswer(value: unknown) {
  const normalized = normalizePersistedPracticeAnswer(value);
  return Array.isArray(normalized)
    ? normalized.some((item) => Boolean(item.trim()))
    : Boolean(normalized.trim());
}

export function restoredPracticeQuestionId(
  attempt: RestoredAttemptLike,
  questions: RestoredQuestionLike[],
) {
  const sourceQuestionId = attempt.sourceQuestionId?.trim() || null;
  const persistedQuestionId = attempt.questionId?.trim() || null;

  const matchedQuestion = questions.find((question) => {
    const renderedQuestionId = canonicalPracticeSourceQuestionId(question);
    return (
      (sourceQuestionId && renderedQuestionId === sourceQuestionId) ||
      (persistedQuestionId &&
        (question.questionId === persistedQuestionId || question.id === persistedQuestionId))
    );
  });

  if (matchedQuestion) {
    return canonicalPracticeSourceQuestionId(matchedQuestion);
  }

  return sourceQuestionId ?? persistedQuestionId;
}

export function buildRestoredPracticeAnswers(
  attempts: RestoredAttemptLike[],
  questions: RestoredQuestionLike[],
) {
  const restoredAnswers: Record<string, RestoredPracticeAnswer> = {};

  for (const attempt of attempts) {
    const questionId = restoredPracticeQuestionId(attempt, questions);
    if (!questionId) continue;
    restoredAnswers[questionId] = normalizePersistedPracticeAnswer(attempt.answer);
  }

  return restoredAnswers;
}
