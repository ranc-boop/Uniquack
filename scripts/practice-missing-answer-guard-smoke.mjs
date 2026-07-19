#!/usr/bin/env node

// Non-live proof for current-round Practice missing-answer guard evaluation.

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import ts from "typescript";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sourceBlock(content, startMarker, endMarker) {
  const start = content.indexOf(startMarker);
  const end = content.indexOf(endMarker, start + startMarker.length);
  assert(start >= 0 && end > start, `source block not found: ${startMarker}`);
  return content.slice(start, end);
}

const root = process.cwd();
const [clientSource, helperSource, harnessSource] = await Promise.all([
  readFile(resolve(root, "src/components/practice/practice-agent-client.tsx"), "utf8"),
  readFile(resolve(root, "src/lib/practice/client-helpers.ts"), "utf8"),
  readFile(resolve(root, "scripts/assignment-practice-resume-submit-live-e2e.mjs"), "utf8"),
]);

const helperBlock = sourceBlock(helperSource, "type PracticeAnswerMap", "export function formatDuration");
const compiledHelpers = ts.transpileModule(helperBlock.replace(/^export /gm, ""), {
  compilerOptions: { module: ts.ModuleKind.None, target: ts.ScriptTarget.ES2022 },
}).outputText;
const helpers = Function(
  `${compiledHelpers}; return { buildPracticeSubmittedAttempts, evaluatePracticeSubmittedAttempts, hasSubmittedPracticeAnswer, practiceAnswerKey };`,
)();

const sourceQuestionId = "SOURCE_QUESTION_SYMBOLIC_ID";
const roundQuestionRowId = "ROUND_QUESTION_ROW_SYMBOLIC_ID";
const unrelatedQuestionId = "UNRELATED_QUESTION_SYMBOLIC_ID";
assert(
  new Set([sourceQuestionId, roundQuestionRowId, unrelatedQuestionId]).size === 3,
  "source, round-row, and unrelated identities must remain distinct",
);
const currentRound = [{ id: sourceQuestionId, roundQuestionRowId }];
assert(
  helpers.practiceAnswerKey(currentRound[0]) === sourceQuestionId,
  "current round must use the recommendation ID as its one canonical answer key",
);

const committedAnswerMap = Object.freeze({
  [sourceQuestionId]: "committed",
  [unrelatedQuestionId]: "",
});
const submittedAttempts = helpers.buildPracticeSubmittedAttempts(
  currentRound,
  committedAnswerMap,
  {},
);
Object.freeze(submittedAttempts);
const submittedEvaluation = helpers.evaluatePracticeSubmittedAttempts(
  currentRound,
  submittedAttempts,
);
assert(
  submittedEvaluation.currentRoundQuestionCount === 1 &&
    submittedEvaluation.submittedAttemptCount === 1 &&
    submittedEvaluation.submittedAttempt === "FOUND" &&
    submittedEvaluation.submittedAttemptAnswer === "PRESENT" &&
    submittedEvaluation.missingRequiredAttemptCount === 0 &&
    submittedAttempts[0].answer === committedAnswerMap[sourceQuestionId],
  "one committed current-round answer must produce one complete submitted attempt",
);

const missingCurrentAttempts = helpers.buildPracticeSubmittedAttempts(
  currentRound,
  { [unrelatedQuestionId]: "committed" },
  {},
);
const missingCurrentEvaluation = helpers.evaluatePracticeSubmittedAttempts(
  currentRound,
  missingCurrentAttempts,
);
assert(
  missingCurrentEvaluation.submittedAttempt === "FOUND" &&
    missingCurrentEvaluation.submittedAttemptAnswer === "EMPTY" &&
    missingCurrentEvaluation.missingRequiredAttemptCount === 1,
  "an unrelated answer-map entry must not satisfy a missing current answer",
);
const outsideCurrentRound = { id: unrelatedQuestionId, roundQuestionRowId };
assert(
  helpers.evaluatePracticeSubmittedAttempts(currentRound, submittedAttempts)
    .missingRequiredAttemptCount === 0 &&
    helpers.practiceAnswerKey(outsideCurrentRound) !== sourceQuestionId,
  "an unanswered question outside the current round must not block this round",
);

for (const value of ["committed", 0, false, ["choice"], { part: "structured" }]) {
  assert(helpers.hasSubmittedPracticeAnswer(value), "supported committed answer must pass");
}
for (const value of [undefined, null, "", "   ", [], {}]) {
  assert(!helpers.hasSubmittedPracticeAnswer(value), "genuinely missing answer must remain blocked");
}

const submitBlock = sourceBlock(clientSource, "function submitRound", "function requestFeedbackNextRound");
assert(
  submitBlock.includes('const submittedAttempts: PracticeReviewRequest["attempts"] = buildPracticeSubmittedAttempts(') &&
    submitBlock.includes("Object.freeze(submittedAttempts)") &&
    submitBlock.includes("evaluatePracticeSubmittedAttempts(") &&
    submitBlock.includes('submissionEvaluation.submittedAttempt !== "FOUND"') &&
    submitBlock.includes("submissionEvaluation.missingRequiredAttemptCount > 0") &&
    (submitBlock.match(/attempts: submittedAttempts/g) ?? []).length === 3 &&
    !submitBlock.includes("submittedAttemptInputs"),
  "the guard and every review/fallback path must share one final submitted-attempt array",
);
assert(
  clientSource.includes('data-testid="practice-submission-state"') &&
    clientSource.includes("data-current-round-question-count") &&
    clientSource.includes("data-submitted-attempt-answer") &&
    clientSource.includes("data-missing-required-attempt-count") &&
    harnessSource.includes("readSubmissionGuardDiagnostics(page)"),
  "product and narrow harness must expose only bounded guard evidence",
);

for (const source of [clientSource, helperSource, harnessSource]) {
  assert(
    !/(?:console\.log|console\.error|console\.warn)\([^)]*(?:committed|SOURCE_QUESTION|ROUND_QUESTION|UNRELATED_QUESTION|answer\.length|JSON\.stringify\([^)]*answer)/.test(source),
    "guard diagnostics must not print answer or identity content",
  );
}

console.log("PASS practice_missing_answer_guard_smoke");
