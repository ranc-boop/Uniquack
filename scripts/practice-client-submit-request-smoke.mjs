#!/usr/bin/env node

// Non-live proof for Practice Submit handler and request-observer boundaries.

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
const [cardSource, clientSource, helperSource, harnessSource] = await Promise.all([
  readFile(resolve(root, "src/components/practice/practice-question-card.tsx"), "utf8"),
  readFile(resolve(root, "src/components/practice/practice-agent-client.tsx"), "utf8"),
  readFile(resolve(root, "src/lib/practice/client-helpers.ts"), "utf8"),
  readFile(resolve(root, "scripts/assignment-practice-resume-submit-live-e2e.mjs"), "utf8"),
]);

const helperBlock = sourceBlock(helperSource, "type PracticeAnswerMap", "export function recommendationFromHistoryQuestion");
const compiledHelpers = ts.transpileModule(helperBlock.replace(/^export /gm, ""), {
  compilerOptions: { module: ts.ModuleKind.None, target: ts.ScriptTarget.ES2022 },
}).outputText;
const helpers = Function(
  `const canonicalPracticeSourceQuestionId = (question) => question.sourceQuestionId?.trim() || question.id; ${compiledHelpers}; return { buildPracticeSubmittedAttempts, evaluatePracticeSubmittedAttempts, hasSubmittedPracticeAnswer, practiceAnswerKey };`,
)();

const currentQuestionId = "CURRENT_QUESTION_SYMBOLIC_ID";
const unrelatedQuestionId = "UNRELATED_QUESTION_SYMBOLIC_ID";
const roundRowId = "ROUND_ROW_SYMBOLIC_ID";
assert(
  new Set([currentQuestionId, unrelatedQuestionId, roundRowId]).size === 3,
  "test question identities must remain distinct",
);

let authoritativeAnswers = {};
const updateAnswer = (questionId, value) => {
  const nextAnswers = { ...authoritativeAnswers, [questionId]: value };
  authoritativeAnswers = nextAnswers;
};
updateAnswer(currentQuestionId, "submitted");
const currentRound = [{ id: roundRowId, sourceQuestionId: currentQuestionId }];
const currentAttempts = helpers.buildPracticeSubmittedAttempts(
  currentRound,
  Object.freeze({ ...authoritativeAnswers, [unrelatedQuestionId]: "" }),
  {},
);
const currentEvaluation = helpers.evaluatePracticeSubmittedAttempts(
  currentRound,
  currentAttempts,
  authoritativeAnswers,
);
assert(
  currentAttempts.length === 1 &&
    currentAttempts[0].questionId === currentQuestionId &&
    currentAttempts.every((attempt) => helpers.hasSubmittedPracticeAnswer(attempt.answer)) &&
    currentEvaluation.submittedAttempt === "FOUND" &&
    currentEvaluation.submittedAttemptAnswer === "PRESENT" &&
    currentEvaluation.missingRequiredAttemptCount === 0,
  "current-round answer must pass without inspecting an unrelated answer-map entry",
);
assert(
  helpers.buildPracticeSubmittedAttempts(currentRound, {}, {})
    .some((attempt) => !helpers.hasSubmittedPracticeAnswer(attempt.answer)),
  "genuinely missing current-round answer must be blocked",
);
for (const value of ["submitted", 0, false, ["option"], { part: "structured" }]) {
  assert(helpers.hasSubmittedPracticeAnswer(value), "supported answer must pass the guard");
}

const answerInput = sourceBlock(cardSource, "function QuestionAnswerInput", "function QuestionReviewDiagnostic");
const updateBlock = sourceBlock(clientSource, "function updateAnswer", "function requestHint");
const submitBlock = sourceBlock(clientSource, "function submitRound", "function requestFeedbackNextRound");
assert(
  answerInput.includes("onChange={(event) => onChange(event.currentTarget.value)}") &&
    !answerInput.includes("onInput=") &&
    updateBlock.includes('commitAnswers(nextAnswers, "INPUT")') &&
    clientSource.indexOf("answersRef.current = committedAnswers") <
      clientSource.indexOf("setAnswers(committedAnswers)"),
  "canonical React change input must synchronously reach the authoritative commit",
);
assert(
  submitBlock.includes("const submittedAnswerSnapshot = Object.freeze({ ...answersRef.current })") &&
    submitBlock.includes('const submittedAttempts: PracticeReviewRequest["attempts"] = buildPracticeSubmittedAttempts(') &&
    submitBlock.includes("Object.freeze(submittedAttempts)") &&
    submitBlock.includes("evaluatePracticeSubmittedAttempts(") &&
    submitBlock.indexOf("evaluatePracticeSubmittedAttempts(") < submitBlock.indexOf("await postReviewStream({") &&
    submitBlock.includes("Your answer was not captured. Please review it and try again.") &&
    (submitBlock.match(/attempts: submittedAttempts/g) ?? []).length === 3 &&
    !submitBlock.includes("reviewPayloadAttempts") &&
    !submitBlock.includes("submittedAttemptInputs"),
  "valid Submit must reach review fetch while all downstream paths reuse one snapshot",
);

const observerBlock = sourceBlock(harnessSource, "function reviewRequestAttemptState", "function observeGrade");
assert(
  observerBlock.includes("request.postDataJSON()") &&
    observerBlock.includes('category: "REQUEST_NOT_EMITTED"') &&
    observerBlock.includes('category: "REQUEST_OBSERVER_FAILED"') &&
    observerBlock.includes('category: "REQUEST_BODY_UNREADABLE"') &&
    observerBlock.includes('category: "REQUEST_ATTEMPT_MISSING"') &&
    observerBlock.includes('"REQUEST_ANSWER_PRESENT" : "REQUEST_ANSWER_EMPTY"') &&
    harnessSource.includes('request.resourceType() === "fetch"') &&
    harnessSource.includes("url.origin === expectedOrigin") &&
    observerBlock.includes('page.on("request", onRequest)') &&
    observerBlock.includes('page.off("request", onRequest)'),
  "request observer must distinguish emission, parser, attempt, and answer outcomes",
);

const journeyBlock = sourceBlock(
  harnessSource,
  'phase(fixtures, "ASSIGNMENT_PRACTICE_ANSWER_INPUT")',
  'phase(fixtures, "ASSIGNMENT_PRACTICE_RESULT_BADGE")',
);
assert(
    journeyBlock.indexOf("observeReviewRequest(page, server.origin, contract.questionId)") <
      journeyBlock.indexOf("submitButton.click") &&
    journeyBlock.includes('diagnostics.submitClick = "HANDLED"') &&
    journeyBlock.includes('diagnostics.clientMissingAnswerGuard = submissionDiagnostics.guard') &&
    journeyBlock.includes('diagnostics.clientMissingAnswerGuard === "BLOCKED"') &&
    journeyBlock.includes('diagnostics.reviewFetch = "NOT_INVOKED"') &&
    journeyBlock.includes('fail("REVIEW_REQUEST_NOT_EMITTED")') &&
    journeyBlock.includes('fail("REVIEW_REQUEST_OBSERVER_FAILED")'),
  "every post-click branch must retain a bounded semantic result",
);

for (const source of [cardSource, clientSource, helperSource, harnessSource]) {
  assert(
    !/(?:console\.log|console\.error|console\.warn)\([^)]*(?:CURRENT_QUESTION|UNRELATED_QUESTION|ROUND_ROW|answer\.length|JSON\.stringify\([^)]*answer)/.test(source),
    "diagnostics must never print answer or identity content",
  );
}

console.log("PASS practice_client_submit_request_smoke");
