#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();
const read = (file) => readFile(resolve(root, file), "utf8");

const [
  limits,
  editor,
  answerFields,
  questionValidation,
  answerSpec,
  practiceValidation,
  hint,
  recommend,
  sessions,
  blueprintBuilder,
  blueprintActions,
  blueprintNewPage,
  blueprintDetailPage,
] =
  await Promise.all([
    read("src/lib/ai-input-limits.ts"),
    read("src/components/question-html-editor.tsx"),
    read("src/components/question-answer-fields.tsx"),
    read("src/lib/validations/question.ts"),
    read("src/lib/questions/answer-spec.ts"),
    read("src/lib/practice/request-validation.ts"),
    read("src/app/api/practice/hint/route.ts"),
    read("src/app/api/practice/recommend/route.ts"),
    read("src/app/api/practice/sessions/route.ts"),
    read("src/lib/teacher-blueprint-builder.ts"),
    read("src/app/teacher/blueprints/actions.ts"),
    read("src/app/teacher/blueprints/new/page.tsx"),
    read("src/app/teacher/blueprints/[blueprintId]/page.tsx"),
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

assert.match(practiceValidation, /export function boundedPracticeTextList/);
assert.match(hint, /boundedPracticeTextList\(body\.currentAnswer/);
assert.match(hint, /maxItems: PRACTICE_INPUT_LIMITS\.ANSWER_PARTS/);
assert.match(hint, /maxTotalLength: PRACTICE_INPUT_LIMITS\.ANSWER_CHARS/);
assert.match(practiceValidation, /export function boundedPracticeIdList/);
for (const field of ["completedQuestionIds", "wrongQuestionIds"]) {
  assert.match(recommend, new RegExp(`boundedPracticeIdList\\(body\\.${field}`));
}
assert.match(recommend, /maxItems: PRACTICE_INPUT_LIMITS\.QUESTION_ID_LIST_ITEMS/);
assert.match(recommend, /maxItemLength: PRACTICE_INPUT_LIMITS\.QUESTION_ID_CHARS/);

assert.match(blueprintBuilder, /TeacherBlueprintInputError/);
assert.match(blueprintBuilder, /REQUIRED_ELEMENT_CHARS: 240/);
assert.match(blueprintBuilder, /item\.length > TEACHER_BLUEPRINT_INPUT_LIMITS\.REQUIRED_ELEMENT_CHARS/);
assert.match(blueprintActions, /required-element-too-long/);
for (const page of [blueprintNewPage, blueprintDetailPage]) {
  assert.match(page, /maxLength=\{TEACHER_BLUEPRINT_INPUT_LIMITS\.REQUIRED_ELEMENTS_INPUT_CHARS\}/);
}
console.log("PASS client and server AI prompt input limits");
