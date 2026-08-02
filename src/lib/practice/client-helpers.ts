import {
  CURRENT_PRACTICE_PENDING_ROUND_STORAGE_KEY,
  LEGACY_PRACTICE_STORAGE_KEYS,
} from "@/lib/practice/schema";
import { restoredPracticeQuestionId } from "@/lib/practice/answer-restore";
import {
  canonicalPracticeSourceQuestionId,
  type PracticeQuestionIdentityLike,
} from "@/lib/practice/question-identity";
import type {
  PracticeAttemptInput,
  PracticeGradeResult,
  PracticeRecommendResponse,
  PracticeRecommendation,
  PracticeRoundHistory,
} from "@/lib/practice/types";

type PracticeAnswerMap = Readonly<Record<string, PracticeAttemptInput["answer"]>>;
type PracticeHintMap = Readonly<Record<string, readonly string[]>>;
type PracticeQuestionIdentity = Pick<PracticeRecommendation, "id" | "sourceQuestionId"> &
  PracticeQuestionIdentityLike;

export function settlePracticeRequest<T>(
  request: Promise<T>,
  onSuccess: (value: T) => void,
  onSettled?: () => void,
) {
  return request.then(
    (value) => {
      onSuccess(value);
      return null;
    },
    (error: unknown) => error,
  ).finally(onSettled);
}

export function clampPracticeSidebarWidth(value: number) {
  return Math.min(560, Math.max(240, Math.round(value)));
}

export function practiceApiErrorMessage(
  error: unknown,
  status: number,
  fallback = `Request failed with ${status}`,
) {
  if (typeof error === "string" && error.trim()) return error;
  if (error && typeof error === "object") {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
}

export async function practiceJsonRequest<T>(
  url: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const payload = (await response.json().catch(() => ({}))) as T & {
    error?: unknown;
  };

  if (!response.ok) {
    throw new Error(practiceApiErrorMessage(payload.error, response.status));
  }

  return payload;
}

export function parsePracticeSseEvents(buffer: string) {
  const parts = buffer.split(/\n\n/);
  const rest = parts.pop() ?? "";
  const events = parts
    .map((part) => {
      let event = "message";
      const dataLines: string[] = [];

      for (const line of part.split(/\n/)) {
        if (line.startsWith("event:")) {
          event = line.slice("event:".length).trim();
        } else if (line.startsWith("data:")) {
          dataLines.push(line.slice("data:".length).trimStart());
        }
      }

      return dataLines.length ? { data: dataLines.join("\n"), event } : null;
    })
    .filter((event): event is { data: string; event: string } => event !== null);

  return { events, rest };
}

export function parsePracticeSsePayload(data: string) {
  try {
    return JSON.parse(data) as unknown;
  } catch {
    throw new Error(
      "A live practice update could not be read. Your saved work is still available; please retry.",
    );
  }
}

function practiceSourceQuestionId(question: PracticeQuestionIdentity) {
  return canonicalPracticeSourceQuestionId(question);
}

export function practiceAnswerKey(question: PracticeQuestionIdentity) {
  return practiceSourceQuestionId(question);
}

export function practiceSubmittedAttemptQuestionId(question: PracticeQuestionIdentity) {
  return practiceSourceQuestionId(question);
}

export function hasSubmittedPracticeAnswer(value: unknown) {
  if (typeof value === "string") return Boolean(value.trim());
  if (typeof value === "number" || typeof value === "boolean") return true;
  if (Array.isArray(value)) return value.length > 0;
  if (value && typeof value === "object") return Object.keys(value).length > 0;
  return false;
}

function practiceAnswerValuesMatch(
  left: PracticeAttemptInput["answer"] | undefined,
  right: PracticeAttemptInput["answer"] | undefined,
) {
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((value, index) => value === right[index]);
  }
  return left === right;
}

export function practiceAnswerMapStatus(
  questions: readonly PracticeQuestionIdentity[],
  answers: PracticeAnswerMap,
) {
  if (!questions.length) return "NOT_OBSERVED" as const;
  return questions.every((question) => {
    const key = practiceAnswerKey(question);
    return Object.prototype.hasOwnProperty.call(answers, key) &&
      hasSubmittedPracticeAnswer(answers[key]);
  })
    ? "PRESENT" as const
    : "EMPTY" as const;
}

export function practiceAnswerMapsMatch(
  questions: readonly PracticeQuestionIdentity[],
  left: PracticeAnswerMap,
  right: PracticeAnswerMap,
) {
  if (!questions.length) return "NOT_OBSERVED" as const;
  return questions.every((question) => {
    const key = practiceAnswerKey(question);
    return practiceAnswerValuesMatch(left[key], right[key]);
  })
    ? "MATCH" as const
    : "MISMATCH" as const;
}

export function buildPracticeSubmittedAttempts(
  questions: readonly PracticeQuestionIdentity[],
  answers: PracticeAnswerMap,
  hints: PracticeHintMap,
): PracticeAttemptInput[] {
  return questions.map((question) => {
    const answerKey = practiceAnswerKey(question);
    const questionId = practiceSubmittedAttemptQuestionId(question);
    return {
      answer: answers[answerKey] ?? "",
      hintCount: hints[answerKey]?.length ?? 0,
      questionId,
    };
  });
}

export function evaluatePracticeSubmittedAttempts(
  questions: readonly PracticeQuestionIdentity[],
  attempts: readonly PracticeAttemptInput[],
  answers?: PracticeAnswerMap,
) {
  const requiredQuestionKeys = questions.map(practiceSubmittedAttemptQuestionId);
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
  const renderedKeys = questions.map(practiceAnswerKey);
  const submitLookupKeys = questions.map(practiceSubmittedAttemptQuestionId);
  const renderedKeyEqualsSubmitLookupKey = questions.length
    ? renderedKeys.every((key, index) => key === submitLookupKeys[index])
      ? "SAME" as const
      : "DIFFERENT" as const
    : "NOT_OBSERVED" as const;
  const answerMapHasRenderedKey = answers
    ? renderedKeys.every((key) => Object.prototype.hasOwnProperty.call(answers, key))
      ? "YES" as const
      : "NO" as const
    : "NOT_OBSERVED" as const;
  const answerMapHasSubmitLookupKey = answers
    ? submitLookupKeys.every((key) => Object.prototype.hasOwnProperty.call(answers, key))
      ? "YES" as const
      : "NO" as const
    : "NOT_OBSERVED" as const;
  const clientAnswerSnapshot = answers
    ? renderedKeys.every(
        (key) => Object.prototype.hasOwnProperty.call(answers, key) &&
          hasSubmittedPracticeAnswer(answers[key]),
      )
      ? "PRESENT" as const
      : "EMPTY" as const
    : "NOT_OBSERVED" as const;
  const submitQuestionHasSourceIdentity = questions.length
    ? questions.every((question) => Boolean(question.sourceQuestionId?.trim()))
      ? "YES" as const
      : "NO" as const
    : "NOT_OBSERVED" as const;
  const submitIdentityMapping = questions.length && submittedAttempt !== "AMBIGUOUS"
    ? submitLookupKeys.every((key) => (attemptCountsByQuestionKey.get(key) ?? 0) === 1)
      ? "VALID" as const
      : "INVALID" as const
    : "NOT_OBSERVED" as const;

  return {
    answerMapHasRenderedKey,
    answerMapHasSubmitLookupKey,
    clientAnswerSnapshot,
    currentRoundQuestionCount: requiredQuestionKeys.length,
    missingRequiredAttemptCount,
    renderedKeyEqualsSubmitLookupKey,
    submitIdentityMapping,
    submitQuestionHasSourceIdentity,
    submittedAttempt,
    submittedAttemptAnswer,
    submittedAttemptCount: attempts.length,
  };
}

export function recommendationFromHistoryQuestion(
  question: PracticeRoundHistory["questions"][number],
): PracticeRecommendation {
  return {
    contentExcerpt: question.contentExcerpt,
    contentHtml: question.contentHtml,
    difficulty: question.difficulty,
    expectedSkill: question.expectedSkill,
    id: question.id,
    options: question.options,
    questionCode: question.questionCode,
    questionType: question.questionType as PracticeRecommendation["questionType"],
    reason: question.reason || "Saved from this practice session.",
    source: question.source,
    sourceQuestionId: question.sourceQuestionId ?? question.id,
    tagIds: question.tagIds,
    title: question.title,
  };
}

export function resultsFromHistoryRound(round: PracticeRoundHistory): PracticeGradeResult[] {
  return round.attempts.map((attempt) => ({
    explanation: attempt.explanation ?? "No saved explanation.",
    gradingCapability: attempt.isCorrect === null ? "ai_review" as const : "deterministic" as const,
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
