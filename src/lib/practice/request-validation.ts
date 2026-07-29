import type { PracticeAttemptInput } from "@/lib/practice/types";

export const PRACTICE_INPUT_LIMITS = {
  ANSWER_CHARS: 8_000,
  ANSWER_PARTS: 12,
  GOAL_CHARS: 500,
  HINT_CHARS: 1_200,
  HINT_HISTORY_ITEMS: 3,
  HINTS_PER_QUESTION: 4,
  NEXT_ROUND_NOTE_CHARS: 1_200,
  OUTLINE_NOTES_CHARS: 4_000,
  PRACTICE_ATTEMPTS: 12,
  QUESTION_ID_CHARS: 160,
  QUESTION_ID_LIST_ITEMS: 48,
  SESSION_MEMORY_CHARS: 1_000,
  SESSION_TITLE_CHARS: 160,
} as const;

export type PracticeRequestValidationCode =
  | "ANSWER_REQUIRED"
  | "ANSWER_TOO_LONG"
  | "ATTEMPT_SET_MISMATCH"
  | "DUPLICATE_QUESTION_ID"
  | "INVALID_ATTEMPTS"
  | "INVALID_QUESTION_ID"
  | "TOO_MANY_ATTEMPTS";

export class PracticeRequestValidationError extends Error {
  readonly code: PracticeRequestValidationCode;
  readonly status: number;

  constructor(
    code: PracticeRequestValidationCode,
    message: string,
    status = 422,
  ) {
    super(message);
    this.name = "PracticeRequestValidationError";
    this.code = code;
    this.status = status;
  }
}

export function boundedPracticeText(
  value: unknown,
  {
    field,
    maxLength,
    required = false,
  }: {
    field: string;
    maxLength: number;
    required?: boolean;
  },
) {
  if (typeof value !== "string") {
    if (!required && (value === undefined || value === null)) return "";
    throw new PracticeRequestValidationError(
      "INVALID_ATTEMPTS",
      `${field} must be text.`,
      400,
    );
  }

  const normalized = value.replace(/\u0000/g, "").trim();
  if (required && !normalized) {
    throw new PracticeRequestValidationError(
      "ANSWER_REQUIRED",
      `${field} is required.`,
    );
  }
  if (normalized.length > maxLength) {
    throw new PracticeRequestValidationError(
      "ANSWER_TOO_LONG",
      `${field} must be ${maxLength} characters or fewer.`,
      413,
    );
  }
  return normalized;
}

function normalizeAnswer(value: unknown, index: number): string | string[] {
  if (typeof value === "string") {
    return boundedPracticeText(value, {
      field: `attempts[${index}].answer`,
      maxLength: PRACTICE_INPUT_LIMITS.ANSWER_CHARS,
      required: true,
    });
  }

  if (!Array.isArray(value) || value.length > PRACTICE_INPUT_LIMITS.ANSWER_PARTS) {
    throw new PracticeRequestValidationError(
      "INVALID_ATTEMPTS",
      `attempts[${index}].answer must be text or at most ${PRACTICE_INPUT_LIMITS.ANSWER_PARTS} text values.`,
    );
  }

  const parts = value.map((part, partIndex) =>
    boundedPracticeText(part, {
      field: `attempts[${index}].answer[${partIndex}]`,
      maxLength: PRACTICE_INPUT_LIMITS.ANSWER_CHARS,
      required: true,
    }),
  );
  if (
    !parts.length ||
    parts.reduce((total, part) => total + part.length, 0) >
      PRACTICE_INPUT_LIMITS.ANSWER_CHARS
  ) {
    throw new PracticeRequestValidationError(
      "ANSWER_TOO_LONG",
      `attempts[${index}].answer must contain at most ${PRACTICE_INPUT_LIMITS.ANSWER_CHARS} characters in total.`,
      413,
    );
  }
  return parts;
}

export function validatePracticeRoundAttempts({
  attempts,
  expectedQuestionIds,
}: {
  attempts: unknown;
  expectedQuestionIds: string[];
}): PracticeAttemptInput[] {
  if (!Array.isArray(attempts) || !attempts.length) {
    throw new PracticeRequestValidationError(
      "INVALID_ATTEMPTS",
      "At least one attempt is required.",
      400,
    );
  }
  if (attempts.length > PRACTICE_INPUT_LIMITS.PRACTICE_ATTEMPTS) {
    throw new PracticeRequestValidationError(
      "TOO_MANY_ATTEMPTS",
      `A round can submit at most ${PRACTICE_INPUT_LIMITS.PRACTICE_ATTEMPTS} attempts.`,
      413,
    );
  }

  const seen = new Set<string>();
  const normalized = attempts.map((rawAttempt, index) => {
    if (!rawAttempt || typeof rawAttempt !== "object" || Array.isArray(rawAttempt)) {
      throw new PracticeRequestValidationError(
        "INVALID_ATTEMPTS",
        `attempts[${index}] must be an object.`,
      );
    }
    const attempt = rawAttempt as Record<string, unknown>;
    const questionId = boundedPracticeText(attempt.questionId, {
      field: `attempts[${index}].questionId`,
      maxLength: PRACTICE_INPUT_LIMITS.QUESTION_ID_CHARS,
      required: true,
    });
    if (seen.has(questionId)) {
      throw new PracticeRequestValidationError(
        "DUPLICATE_QUESTION_ID",
        `Question ${questionId} was submitted more than once.`,
      );
    }
    seen.add(questionId);

    return {
      answer: normalizeAnswer(attempt.answer, index),
      hintCount: Math.min(
        PRACTICE_INPUT_LIMITS.HINTS_PER_QUESTION,
        Math.max(0, Math.trunc(Number(attempt.hintCount ?? 0) || 0)),
      ),
      questionId,
      timeSpentSeconds: Math.min(
        86_400,
        Math.max(0, Math.trunc(Number(attempt.timeSpentSeconds ?? 0) || 0)),
      ),
    };
  });

  const expected = expectedQuestionIds.map(String).filter(Boolean);
  const expectedSet = new Set(expected);
  if (
    expected.length !== expectedSet.size ||
    expectedSet.size !== seen.size ||
    [...seen].some((questionId) => !expectedSet.has(questionId))
  ) {
    throw new PracticeRequestValidationError(
      "ATTEMPT_SET_MISMATCH",
      "Submitted attempts must match every question in the saved round exactly.",
      409,
    );
  }

  return normalized;
}

export function practiceValidationResponse(error: unknown) {
  if (!(error instanceof PracticeRequestValidationError)) return null;
  return {
    body: { code: error.code, error: error.message },
    status: error.status,
  };
}
