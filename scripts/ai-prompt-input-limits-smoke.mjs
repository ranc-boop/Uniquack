#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();
const read = (file) => readFile(resolve(root, file), "utf8");

const [limits, editor, answerFields, questionValidation, answerSpec, recommend, sessions] =
  await Promise.all([
    read("src/lib/ai-input-limits.ts"),
    read("src/components/question-html-editor.tsx"),
    read("src/components/question-answer-fields.tsx"),
    read("src/lib/validations/question.ts"),
    read("src/lib/questions/answer-spec.ts"),
    read("src/app/api/practice/recommend/route.ts"),
    read("src/app/api/practice/sessions/route.ts"),
  ]);

assert.match(limits, /QUESTION_SOURCE_CHARS/);
assert.match(limits, /OPTION_TEXT_CHARS/);
assert.match(editor, /maxLength=\{maxLength\}/);
assert.match(answerFields, /maxLength=\{AI_INPUT_LIMITS\.OPTION_TEXT_CHARS\}/);
assert.match(questionValidation, /content_html:[\s\S]*\.max\(AI_INPUT_LIMITS\.QUESTION_RENDERED_HTML_CHARS\)/);
assert.match(questionValidation, /content_source:[\s\S]*AI_INPUT_LIMITS\.QUESTION_SOURCE_CHARS/);
assert.match(answerSpec, /boundedFormText/);
assert.match(answerSpec, /AI_INPUT_LIMITS\.OPTION_ITEMS/);

for (const route of [recommend, sessions]) {
  assert.match(route, /boundedPracticeText/);
  assert.match(route, /PRACTICE_INPUT_LIMITS\.GOAL_CHARS/);
  assert.match(route, /practiceValidationResponse/);
}

assert.doesNotMatch(recommend, /body\.goal[^\n]*\.slice\(/);
console.log("PASS client and server AI prompt input limits");
