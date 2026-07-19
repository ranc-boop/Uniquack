#!/usr/bin/env node

// Non-live proof for the controlled-input to Practice review-request boundary.

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
const [clientSource, helperSource, questionCardSource, harnessSource] = await Promise.all([
  readFile(resolve(root, "src/components/practice/practice-agent-client.tsx"), "utf8"),
  readFile(resolve(root, "src/lib/practice/client-helpers.ts"), "utf8"),
  readFile(resolve(root, "src/components/practice/practice-question-card.tsx"), "utf8"),
  readFile(resolve(root, "scripts/assignment-practice-resume-submit-live-e2e.mjs"), "utf8"),
]);

const helperBlock = sourceBlock(helperSource, "type PracticeAnswerMap", "export function formatDuration");
const compiledHelpers = ts.transpileModule(helperBlock.replace(/^export /gm, ""), {
  compilerOptions: {
    module: ts.ModuleKind.None,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const helpers = Function(
  `const canonicalPracticeSourceQuestionId = (question) => question.sourceQuestionId?.trim() || question.id; ${compiledHelpers}; return { buildPracticeSubmittedAttempts, evaluatePracticeSubmittedAttempts, hasSubmittedPracticeAnswer, practiceAnswerKey };`,
)();

for (const value of ["submitted", 0, false, ["option"], { part: "structured" }]) {
  assert(helpers.hasSubmittedPracticeAnswer(value), "supported submitted answer must remain present");
}
for (const value of ["", "   ", [], {}, null, undefined]) {
  assert(!helpers.hasSubmittedPracticeAnswer(value), "missing submitted answer must remain empty");
}

const sourceQuestionId = "SOURCE_QUESTION_SYMBOLIC_ID";
const renderedQuestionId = "RENDERED_QUESTION_SYMBOLIC_ID";
const roundQuestionRowId = "ROUND_QUESTION_ROW_SYMBOLIC_ID";
const attemptQuestionId = "ATTEMPT_QUESTION_SYMBOLIC_ID";
assert(
  new Set([sourceQuestionId, renderedQuestionId, roundQuestionRowId, attemptQuestionId]).size === 4,
  "question identities must be deliberately distinct",
);
const renderedQuestion = {
  id: roundQuestionRowId,
  renderedQuestionId,
  sourceQuestionId,
};
assert(
  helpers.practiceAnswerKey(renderedQuestion) === sourceQuestionId,
  "the explicit source identity must be the canonical answer key",
);

let authoritativeAnswers = {};
const updateAnswer = (questionId, value) => {
  const nextAnswers = { ...authoritativeAnswers, [questionId]: value };
  authoritativeAnswers = nextAnswers;
};
updateAnswer(helpers.practiceAnswerKey(renderedQuestion), "submitted");
const submittedAnswerSnapshot = Object.freeze({ ...authoritativeAnswers });
const submittedAttempts = helpers.buildPracticeSubmittedAttempts(
  [renderedQuestion],
  submittedAnswerSnapshot,
  {},
);
const submittedEvaluation = helpers.evaluatePracticeSubmittedAttempts(
  [renderedQuestion],
  submittedAttempts,
  submittedAnswerSnapshot,
);
assert(
  submittedAttempts.length === 1 &&
    submittedAttempts[0].questionId === sourceQuestionId &&
    helpers.hasSubmittedPracticeAnswer(submittedAttempts[0].answer) &&
    submittedEvaluation.submittedAttempt === "FOUND" &&
    submittedEvaluation.missingRequiredAttemptCount === 0,
  "immediate input followed by Submit must retain the canonical answer",
);
assert(
  helpers.buildPracticeSubmittedAttempts([renderedQuestion], {}, {})
    .some((attempt) => !helpers.hasSubmittedPracticeAnswer(attempt.answer)),
  "missing authoritative answer must activate the request guard",
);

const answerInputBlock = sourceBlock(
  questionCardSource,
  "function QuestionAnswerInput",
  "function QuestionReviewDiagnostic",
);
assert(
  answerInputBlock.includes("onChange={(event) => onChange(event.currentTarget.value)}") &&
    !answerInputBlock.includes("onInput=") &&
    !answerInputBlock.includes("onChange={(event) => onChange(event.target.value)}"),
  "textarea must synchronously forward its canonical React change value",
);

const updateBlock = sourceBlock(clientSource, "function updateAnswer", "function requestHint");
const submitBlock = sourceBlock(clientSource, "function submitRound", "function requestFeedbackNextRound");
assert(
  updateBlock.indexOf("answersRef.current = nextAnswers") < updateBlock.indexOf("setAnswers(nextAnswers)"),
  "authoritative ref must update before React state scheduling",
);
assert(
  submitBlock.includes("const submittedAnswerSnapshot = Object.freeze({ ...answersRef.current })") &&
    submitBlock.includes('const submittedAttempts: PracticeReviewRequest["attempts"] = buildPracticeSubmittedAttempts(') &&
    submitBlock.includes("Object.freeze(submittedAttempts)") &&
    submitBlock.includes("evaluatePracticeSubmittedAttempts(") &&
    submitBlock.includes('const submittedAttempts: PracticeReviewRequest["attempts"]') &&
    submitBlock.indexOf("evaluatePracticeSubmittedAttempts(") < submitBlock.indexOf("await postReviewStream({") &&
    submitBlock.includes("Your answer was not captured. Please review it and try again.") &&
    (submitBlock.match(/attempts: submittedAttempts/g) ?? []).length === 3 &&
    !submitBlock.includes("reviewPayloadAttempts") &&
    !submitBlock.includes("submittedAttemptInputs"),
  "review, fallback, and client handling must share one guarded submitted-attempt snapshot",
);

const reviewFetch = sourceBlock(clientSource, "async function postReviewStream", "function reviewFromGradeFallback");
assert(
  reviewFetch.includes('fetch("/api/practice/review"') &&
    reviewFetch.includes("body: JSON.stringify(body)") &&
    reviewFetch.includes('method: "POST"'),
  "review serialization must preserve the submitted request object",
);

const requestObserver = sourceBlock(
  harnessSource,
  "function reviewRequestAttemptState",
  "function observeGrade",
);
assert(
  requestObserver.includes("request.postDataJSON()") &&
    requestObserver.includes("payload?.attempts") &&
    requestObserver.includes("item?.questionId === expectedQuestionId") &&
    requestObserver.includes('attempt: "FOUND"') &&
    requestObserver.includes('attempt: "MISSING"') &&
    requestObserver.includes('attempt: "AMBIGUOUS"'),
  "request observer must distinguish answer state from attempt selection",
);

for (const source of [clientSource, helperSource, questionCardSource, harnessSource]) {
  assert(
    !/(?:console\.log|console\.error|console\.warn)\([^)]*(?:SOURCE_QUESTION|RENDERED_QUESTION|ROUND_QUESTION|ATTEMPT_QUESTION|answer\.length|JSON\.stringify\([^)]*answer)/.test(source),
    "answer and identity content must never be logged",
  );
}

console.log("PASS practice_client_answer_request_smoke");
