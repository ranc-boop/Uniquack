import type { Json } from "@/types/database";
import { canonicalPracticeSourceQuestionId } from "@/lib/practice/question-identity";

export type RestoredPracticeAnswer = string | string[];

type RestoredAttemptIdentityLike = {
  questionId?: string | null;
  sourceQuestionId?: string | null;
};

type RestoredAttemptLike = RestoredAttemptIdentityLike & {
  answer: unknown;
};

type RestoredQuestionLike = {
  id: string;
  questionId?: string | null;
  sourceQuestionId?: string | null;
};

export type RestoredPracticeQuestionAssociation = {
  question: RestoredQuestionLike;
  questionId: string;
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

  const association = resolveRestoredPracticeQuestionAssociation(
    attempt,
    questions,
  );
  if (association) return association.questionId;

  return sourceQuestionId ?? persistedQuestionId;
}

export function resolveRestoredPracticeQuestionAssociation(
  attempt: RestoredAttemptIdentityLike,
  questions: RestoredQuestionLike[],
): RestoredPracticeQuestionAssociation | null {
  const sourceQuestionId = attempt.sourceQuestionId?.trim() || null;
  const persistedQuestionId = attempt.questionId?.trim() || null;
  if (!sourceQuestionId && !persistedQuestionId) return null;

  const sourceMatches = sourceQuestionId
    ? questions.filter(
        (question) =>
          canonicalPracticeSourceQuestionId(question) === sourceQuestionId,
      )
    : [];
  const persistedMatches = persistedQuestionId
    ? questions.filter(
        (question) =>
          question.questionId === persistedQuestionId ||
          question.id === persistedQuestionId,
      )
    : [];

  if (
    (sourceQuestionId && sourceMatches.length !== 1) ||
    (persistedQuestionId && persistedMatches.length !== 1)
  ) {
    return null;
  }

  const sourceMatch = sourceMatches[0] ?? null;
  const persistedMatch = persistedMatches[0] ?? null;
  if (sourceMatch && persistedMatch && sourceMatch !== persistedMatch) {
    return null;
  }

  const question = sourceMatch ?? persistedMatch;
  return question
    ? {
        question,
        questionId: canonicalPracticeSourceQuestionId(question),
      }
    : null;
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
