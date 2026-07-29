import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relativePath) =>
  fs.readFileSync(path.join(root, relativePath), "utf8");

const validation = read("src/lib/practice/request-validation.ts");
const gradeRoute = read("src/app/api/practice/grade/route.ts");
const reviewRoute = read("src/app/api/practice/review/route.ts");
const hintRoute = read("src/app/api/practice/hint/route.ts");

assert.match(validation, /PRACTICE_INPUT_LIMITS/);
assert.match(validation, /validatePracticeRoundAttempts/);
assert.match(validation, /ATTEMPT_SET_MISMATCH/);
assert.match(validation, /DUPLICATE_QUESTION_ID/);
assert.match(validation, /ANSWER_TOO_LONG/);

for (const route of [gradeRoute, reviewRoute]) {
  assert.match(route, /validatePracticeRoundAttempts/);
  assert.match(route, /\.from\("practice_rounds"\)/);
  assert.match(route, /\.from\("practice_round_questions"\)/);
}

assert.match(gradeRoute, /sessionId and roundId are required/);
assert.match(
  gradeRoute,
  /attemptedQuestionIds:\s*validatedRoundQuestionIds/,
);
assert.doesNotMatch(
  reviewRoute,
  /recommendationById = new Map<string, any>\(\(body\.recommendations/,
);
assert.match(reviewRoute, /gradePracticeAttempt/);

assert.match(hintRoute, /sessionId and roundId are required/);
assert.match(hintRoute, /\.from\("practice_round_questions"\)/);
assert.match(hintRoute, /HINTS_PER_QUESTION/);

console.log("practice round request security smoke passed");
