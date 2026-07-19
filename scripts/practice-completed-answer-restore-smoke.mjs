#!/usr/bin/env node

// Non-live source and pure-helper coverage for completed Practice answer restore.

import { Buffer } from "node:buffer";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import ts from "typescript";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const root = process.cwd();
const answerRestorePath = resolve(root, "src/lib/practice/answer-restore.ts");
const [answerRestoreSource, clientSource, cardSource, persistenceSource, reviewRouteSource] =
  await Promise.all([
    readFile(answerRestorePath, "utf8"),
    readFile(resolve(root, "src/components/practice/practice-agent-client.tsx"), "utf8"),
    readFile(resolve(root, "src/components/practice/practice-question-card.tsx"), "utf8"),
    readFile(resolve(root, "src/lib/practice/persistence.ts"), "utf8"),
    readFile(resolve(root, "src/app/api/practice/review/route.ts"), "utf8"),
  ]);

const compiledHelper = ts.transpileModule(answerRestoreSource, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const helper = await import(
  `data:text/javascript;base64,${Buffer.from(compiledHelper).toString("base64")}`
);

const sourceQuestionId = "SOURCE_QUESTION_SYMBOLIC_ID";
const roundQuestionRowId = "ROUND_QUESTION_ROW_SYMBOLIC_ID";
const databaseQuestionId = "DATABASE_QUESTION_SYMBOLIC_ID";
const questions = [{
  id: roundQuestionRowId,
  questionId: databaseQuestionId,
  sourceQuestionId,
}];

assert(
  new Set([sourceQuestionId, roundQuestionRowId, databaseQuestionId]).size === 3,
  "symbolic question identities must be deliberately distinct",
);
assert(
  helper.restoredPracticeQuestionId(
    { answer: "submitted", questionId: databaseQuestionId, sourceQuestionId: null },
    questions,
  ) === sourceQuestionId,
  "internal question identity must normalize to the rendered source identity",
);
assert(
  helper.restoredPracticeQuestionId(
    { answer: "submitted", questionId: roundQuestionRowId, sourceQuestionId },
    questions,
  ) === sourceQuestionId,
  "persisted source identity must normalize to the rendered source identity",
);

for (const supported of [
  "written answer",
  42,
  ["choice-a", "choice-b"],
  { numerator: 1, denominator: 2 },
]) {
  assert(
    helper.hasVisiblePracticeAnswer(helper.normalizePersistedPracticeAnswer(supported)),
    "supported persisted answer form must remain visible after JSON normalization",
  );
}

const restoredAnswers = helper.buildRestoredPracticeAnswers(
  [{ answer: "submitted", questionId: databaseQuestionId, sourceQuestionId: null }],
  questions,
);
assert(
  helper.hasVisiblePracticeAnswer(restoredAnswers[sourceQuestionId]) &&
    restoredAnswers[databaseQuestionId] === undefined &&
    restoredAnswers[roundQuestionRowId] === undefined,
  "completed hydration must key a non-empty answer exactly as the rendered question expects",
);

assert(
  reviewRouteSource.includes("persistQuestionReviewResults({") &&
    reviewRouteSource.includes("          attempts,") &&
    persistenceSource.includes("answer: submittedPracticeAnswerForPersistence(attempt.answer)") &&
    answerRestoreSource.includes("submittedPracticeAnswerForPersistence") &&
    !persistenceSource.includes("answer: review.studentAnswer"),
  "the original submitted answer must remain authoritative for persistence",
);
assert(
  persistenceSource.includes('.from("practice_attempts")') &&
    persistenceSource.includes('.select("*")') &&
    persistenceSource.includes("answer: normalizePersistedPracticeAnswer(attempt.answer)"),
  "session detail must select and preserve the persisted answer",
);
assert(
  clientSource.includes("buildRestoredPracticeAnswers(") &&
    clientSource.includes("setAnswers(restoredAnswers)") &&
    clientSource.includes("const questionId = practiceAnswerKey(question)") &&
    clientSource.includes("currentAnswer={answers[questionId]}") &&
    cardSource.includes("answer={currentAnswer}") &&
    cardSource.includes("value={answerValue(answer)}"),
  "restored answers must reach the controlled completed answer field",
);
assert(
  cardSource.includes('disabled={phase === "feedback"}') &&
    cardSource.includes('data-result="correct"') &&
    cardSource.includes("onInput={(event) => onChange(event.currentTarget.value)}"),
  "completed answers must be immutable while unfinished answers remain editable beside result state",
);
assert(
  !/(?:console\.log|console\.error|console\.warn)\([^)]*(?:submitted|written answer|choice-a|numerator)/.test(
    await readFile(resolve(root, "scripts/practice-completed-answer-restore-smoke.mjs"), "utf8"),
  ),
  "answer content must not be printed by restore diagnostics",
);

console.log("PASS practice_completed_answer_restore_smoke");
