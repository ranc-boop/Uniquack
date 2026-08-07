import assert from "node:assert/strict";
import test from "node:test";

import {
  PRACTICE_INPUT_LIMITS,
  PracticeRequestValidationError,
  boundedPracticeIdList,
  boundedPracticeText,
  boundedPracticeTextList,
  practiceValidationResponse,
  validatePracticeRoundAttempts,
} from "../src/lib/practice/request-validation.ts";

function expectValidation(action, code, status) {
  assert.throws(action, (error) => {
    assert.ok(error instanceof PracticeRequestValidationError);
    assert.equal(error.code, code);
    if (status !== undefined) assert.equal(error.status, status);
    return true;
  });
}

test("normalizes bounded text and preserves the validation error contract", () => {
  assert.equal(boundedPracticeText("  hello\u0000 world  ", {
    field: "answer",
    maxLength: 20,
  }), "hello world");
  assert.equal(boundedPracticeText(null, { field: "note", maxLength: 20 }), "");
  expectValidation(
    () => boundedPracticeText("  ", { field: "answer", maxLength: 20, required: true }),
    "ANSWER_REQUIRED",
  );
  expectValidation(
    () => boundedPracticeText(42, { field: "answer", maxLength: 20 }),
    "INVALID_ATTEMPTS",
    400,
  );
  expectValidation(
    () => boundedPracticeText("12345", { field: "answer", maxLength: 4 }),
    "ANSWER_TOO_LONG",
    413,
  );
});
test("bounds text lists and deduplicates question identifiers", () => {
  assert.deepEqual(
    boundedPracticeTextList([" first ", null], {
      field: "hints",
      maxItemLength: 20,
      maxItems: 3,
      maxTotalLength: 20,
    }),
    ["first", ""],
  );
  assert.deepEqual(
    boundedPracticeIdList(["q-1", " q-1 ", "q-2"], {
      field: "questionIds",
      maxItemLength: 20,
      maxItems: 5,
    }),
    ["q-1", "q-2"],
  );
  expectValidation(
    () => boundedPracticeTextList("not-a-list", {
      field: "hints",
      maxItemLength: 20,
      maxItems: 3,
      maxTotalLength: 20,
    }),
    "INVALID_TEXT_LIST",
    400,
  );
  expectValidation(
    () => boundedPracticeTextList(["a", "b", "c"], {
      field: "hints",
      maxItemLength: 20,
      maxItems: 2,
      maxTotalLength: 20,
    }),
    "TOO_MANY_LIST_ITEMS",
    413,
  );
  expectValidation(
    () => boundedPracticeTextList(["123", "456"], {
      field: "hints",
      maxItemLength: 20,
      maxItems: 3,
      maxTotalLength: 5,
    }),
    "TEXT_LIST_TOO_LONG",
    413,
  );
});

test("normalizes valid string and multipart practice attempts with numeric clamps", () => {
  const normalized = validatePracticeRoundAttempts({
    attempts: [
      {
        answer: "  first answer  ",
        hintCount: 99,
        questionId: " q-1 ",
        timeSpentSeconds: -10,
      },
      {
        answer: [" part one ", "part two"],
        hintCount: 2.9,
        questionId: "q-2",
        timeSpentSeconds: 86_401.9,
      },
    ],
    expectedQuestionIds: ["q-1", "q-2"],
  });

  assert.deepEqual(normalized, [
    {
      answer: "first answer",
      hintCount: PRACTICE_INPUT_LIMITS.HINTS_PER_QUESTION,
      questionId: "q-1",
      timeSpentSeconds: 0,
    },
    {
      answer: ["part one", "part two"],
      hintCount: 2,
      questionId: "q-2",
      timeSpentSeconds: 86_400,
    },
  ]);
});

test("rejects malformed, duplicate, incomplete, and oversized attempt sets", () => {
  const expectedQuestionIds = ["q-1", "q-2"];
  const baseAttempt = { answer: "answer", questionId: "q-1" };

  expectValidation(
    () => validatePracticeRoundAttempts({ attempts: [], expectedQuestionIds }),
    "INVALID_ATTEMPTS",
    400,
  );
  expectValidation(
    () => validatePracticeRoundAttempts({ attempts: [null], expectedQuestionIds: ["q-1"] }),
    "INVALID_ATTEMPTS",
  );
  expectValidation(
    () => validatePracticeRoundAttempts({
      attempts: [baseAttempt, { ...baseAttempt, answer: "again" }],
      expectedQuestionIds: ["q-1", "q-1"],
    }),
    "DUPLICATE_QUESTION_ID",
  );
  expectValidation(
    () => validatePracticeRoundAttempts({
      attempts: [{ answer: "answer", questionId: "q-1" }],
      expectedQuestionIds,
    }),
    "ATTEMPT_SET_MISMATCH",
    409,
  );
  expectValidation(
    () => validatePracticeRoundAttempts({
      attempts: [{ answer: ["", "answer"], questionId: "q-1" }],
      expectedQuestionIds: ["q-1"],
    }),
    "ANSWER_REQUIRED",
  );
  expectValidation(
    () => validatePracticeRoundAttempts({
      attempts: [{ answer: 123, questionId: "q-1" }],
      expectedQuestionIds: ["q-1"],
    }),
    "INVALID_ATTEMPTS",
  );
  expectValidation(
    () => validatePracticeRoundAttempts({
      attempts: Array.from({ length: PRACTICE_INPUT_LIMITS.PRACTICE_ATTEMPTS + 1 }, (_, index) => ({
        answer: "answer",
        questionId: `q-${index}`,
      })),
      expectedQuestionIds: [],
    }),
    "TOO_MANY_ATTEMPTS",
    413,
  );
});

test("serializes only known validation errors into API responses", () => {
  const known = new PracticeRequestValidationError("ANSWER_REQUIRED", "answer is required");
  assert.deepEqual(practiceValidationResponse(known), {
    body: { code: "ANSWER_REQUIRED", error: "answer is required" },
    status: 422,
  });
  assert.equal(practiceValidationResponse(new Error("unexpected")), null);
  assert.equal(practiceValidationResponse(null), null);
});
