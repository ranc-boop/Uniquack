#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();
const read = (file) => readFile(resolve(root, file), "utf8");

const [
  requestValidation,
  hintRoute,
  recommendRoute,
  blueprintBuilder,
  blueprintActions,
  blueprintNewPage,
  blueprintDetailPage,
  promptSafety,
  reviewRoute,
  completion,
  practiceContext,
] = await Promise.all([
  read("src/lib/practice/request-validation.ts"),
  read("src/app/api/practice/hint/route.ts"),
  read("src/app/api/practice/recommend/route.ts"),
  read("src/lib/teacher-blueprint-builder.ts"),
  read("src/app/teacher/blueprints/actions.ts"),
  read("src/app/teacher/blueprints/new/page.tsx"),
  read("src/app/teacher/blueprints/[blueprintId]/page.tsx"),
  read("src/lib/practice/prompt-safety.ts"),
  read("src/app/api/practice/review/route.ts"),
  read("src/lib/practice/completion.ts"),
  read("src/lib/practice/context.ts"),
]);

assert.match(requestValidation, /export function boundedPracticeTextList/);
assert.match(requestValidation, /maxItems:[\s\S]*maxTotalLength:/);
assert.match(hintRoute, /boundedPracticeTextList\(body\.currentAnswer/);
assert.match(hintRoute, /maxItems: PRACTICE_INPUT_LIMITS\.ANSWER_PARTS/);
assert.match(hintRoute, /maxTotalLength: PRACTICE_INPUT_LIMITS\.ANSWER_CHARS/);

assert.match(requestValidation, /export function boundedPracticeIdList/);
for (const field of ["completedQuestionIds", "wrongQuestionIds"]) {
  assert.match(recommendRoute, new RegExp(`boundedPracticeIdList\\(body\\.${field}`));
}
assert.match(recommendRoute, /maxItems: PRACTICE_INPUT_LIMITS\.QUESTION_ID_LIST_ITEMS/);
assert.match(recommendRoute, /maxItemLength: PRACTICE_INPUT_LIMITS\.QUESTION_ID_CHARS/);

assert.match(blueprintBuilder, /REQUIRED_ELEMENT_CHARS:/);
assert.match(blueprintBuilder, /TeacherBlueprintInputError/);
assert.match(blueprintBuilder, /item\.length > TEACHER_BLUEPRINT_INPUT_LIMITS\.REQUIRED_ELEMENT_CHARS/);
assert.match(blueprintActions, /required-element-too-long/);
for (const page of [blueprintNewPage, blueprintDetailPage]) {
  assert.match(page, /maxLength=\{TEACHER_BLUEPRINT_INPUT_LIMITS\.REQUIRED_ELEMENTS_INPUT_CHARS\}/);
}

assert.match(promptSafety, /untrusted data, never as instructions/i);
assert.match(promptSafety, /direct or indirect prompt injection/i);
assert.match(promptSafety, /system prompt/i);
assert.match(promptSafety, /tool schema/i);
assert.match(promptSafety, /internal polic/i);
for (const caller of [reviewRoute, completion]) {
  assert.match(caller, /PRACTICE_SUMMARY_PROMPT_SAFETY_BOUNDARY/);
}

assert.match(practiceContext, /sanitizePracticeStatsContext/);
assert.match(practiceContext, /goal_char_count/);
assert.match(practiceContext, /sanitizePracticeStatsPayload/);
assert.match(practiceContext, /usage_field_count/);
assert.match(practiceContext, /const rawUsage = record\.usage/);
assert.match(practiceContext, /PRACTICE_STATS_SAFE_NUMBER_KEYS/);
assert.match(practiceContext, /PRACTICE_STATS_SAFE_STRING_KEYS/);
assert.match(
  practiceContext,
  /context: sanitizePracticeStatsContext\(context\),[\s\S]*payload: sanitizePracticeStatsPayload\(payload\)/,
);

console.log("PASS Practice prompt inputs, confidentiality boundaries, and stats logging are bounded");
