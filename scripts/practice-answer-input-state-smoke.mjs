#!/usr/bin/env node

// Source-only proof for the Practice controlled-answer event and semantic state boundary.

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
const [textareaSource, cardSource, clientSource, helperSource, narrowHarness, fullHarness] =
  await Promise.all([
    readFile(resolve(root, "src/components/ui/textarea.tsx"), "utf8"),
    readFile(resolve(root, "src/components/practice/practice-question-card.tsx"), "utf8"),
    readFile(resolve(root, "src/components/practice/practice-agent-client.tsx"), "utf8"),
    readFile(resolve(root, "src/lib/practice/client-helpers.ts"), "utf8"),
    readFile(resolve(root, "scripts/assignment-practice-resume-submit-live-e2e.mjs"), "utf8"),
    readFile(resolve(root, "scripts/student-v1-browser-e2e.mjs"), "utf8"),
  ]);

assert(
  textareaSource.includes("<textarea") &&
    textareaSource.includes("ref={ref}") &&
    textareaSource.includes("{...props}"),
  "shared Textarea must render a native textarea and forward all runtime props",
);

const answerInput = sourceBlock(cardSource, "function QuestionAnswerInput", "function QuestionReviewDiagnostic");
assert(
  answerInput.includes("onChange={(event) => onChange(event.currentTarget.value)}") &&
    !answerInput.includes("onInput=") &&
    (answerInput.match(/onChange=\{/g) ?? []).length >= 2,
  "text and choice controls must use one canonical React change contract each",
);
assert(
  answerInput.includes('data-testid="practice-answer-control"') &&
    answerInput.includes('data-client-ready={clientReady ? "yes" : "no"}') &&
    answerInput.includes('data-answer-committed={answerCommitted ? "yes" : "no"}') &&
    !answerInput.includes("JSON.stringify") &&
    !answerInput.includes("answer.length"),
  "answer hooks must expose only bounded readiness and authoritative committed state",
);

const mountBoundary = sourceBlock(clientSource, "function subscribeToClientReady", "async function refreshPracticeState");
assert(
  mountBoundary.includes("function getClientReadySnapshot()") &&
    mountBoundary.includes("return true") &&
    mountBoundary.includes("function getServerClientReadySnapshot()") &&
    mountBoundary.includes("return false") &&
    mountBoundary.includes("const clientReady = useSyncExternalStore(") &&
    mountBoundary.includes("getServerClientReadySnapshot"),
  "client readiness must be false in the server snapshot and true only in the client hydration snapshot",
);
assert(
  clientSource.includes("clientReady={clientReady}") &&
    cardSource.includes("clientReady={clientReady}"),
  "mounted readiness must reach the stable answer-control container",
);

const updateAnswer = sourceBlock(clientSource, "function updateAnswer", "function requestHint");
assert(
  updateAnswer.includes("const nextAnswers = { ...answersRef.current, [questionId]: value }") &&
    updateAnswer.includes('commitAnswers(nextAnswers, "INPUT")') &&
    clientSource.includes("answersRef.current = committedAnswers") &&
    clientSource.includes("setAnswers(committedAnswers)"),
  "controlled input must use the shared authoritative state/ref commit",
);

const helperBlock = sourceBlock(helperSource, "type PracticeAnswerMap", "export function recommendationFromHistoryQuestion");
const compiledHelpers = ts.transpileModule(helperBlock.replace(/^export /gm, ""), {
  compilerOptions: { module: ts.ModuleKind.None, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { hasSubmittedPracticeAnswer } = Function(
  `const canonicalPracticeSourceQuestionId = (question) => question.sourceQuestionId?.trim() || question.id; ${compiledHelpers}; return { hasSubmittedPracticeAnswer };`,
)();
for (const value of ["committed", 0, false, ["choice"], { part: "structured" }]) {
  assert(hasSubmittedPracticeAnswer(value), "supported committed answer must pass the guard");
}
for (const value of [undefined, null, "", "   ", []]) {
  assert(!hasSubmittedPracticeAnswer(value), "missing answer must remain blocked");
}

const narrowSequence = sourceBlock(
  narrowHarness,
  'phase(fixtures, "ASSIGNMENT_PRACTICE_ANSWER_INPUT")',
  'phase(fixtures, "ASSIGNMENT_PRACTICE_SUBMIT_BUTTON")',
);
for (const required of [
  '[data-testid="practice-answer-control"]',
  '[data-client-ready="yes"]',
  'answerControl.fill("2")',
  '[data-answer-committed="yes"]',
  "answerControl.evaluate",
  '"CLIENT_HYDRATION_NOT_READY"',
  '"ANSWER_INPUT_EVENT_NOT_COMMITTED"',
  '"ANSWER_DOM_STATE_MISSING"',
]) {
  assert(narrowSequence.includes(required), `narrow harness is missing ${required}`);
}
assert(
    narrowSequence.indexOf('[data-client-ready="yes"]') < narrowSequence.indexOf('answerControl.fill("2")') &&
    narrowSequence.indexOf('answerControl.fill("2")') < narrowSequence.indexOf('[data-answer-committed="yes"]') &&
    narrowSequence.indexOf('[data-answer-committed="yes"]') < narrowSequence.indexOf("readAnswerTransitionDiagnostics(page)") &&
    narrowSequence.indexOf("readAnswerTransitionDiagnostics(page)") < narrowSequence.indexOf("answerControl.evaluate"),
  "narrow harness must prove hydration, committed state, and state/ref consistency before submitting",
);

const fullSequence = sourceBlock(
  fullHarness,
  'setHarnessPhase(fixtures, "browser_assignment_practice_answer_control")',
  'setHarnessPhase(fixtures, "browser_assignment_practice_submit_button")',
);
assert(
  fullSequence.indexOf('[data-client-ready="yes"]') < fullSequence.indexOf('answerControl.fill("2")') &&
    fullSequence.indexOf('answerControl.fill("2")') < fullSequence.indexOf('[data-answer-committed="yes"]') &&
    fullSequence.indexOf('[data-answer-committed="yes"]') < fullSequence.indexOf('[data-answer-state-ref-consistency="MATCH"]'),
  "full harness must use the same ready-input-commit-consistency sequence",
);

for (const source of [cardSource, clientSource, narrowHarness, fullHarness]) {
  assert(
    !/console\.(?:log|error|warn)\([^)]*(?:answer\.length|inputValue|JSON\.stringify\([^)]*answer)/.test(source),
    "answer state diagnostics must not print answer content or derived answer data",
  );
}

console.log("PASS practice_answer_input_state_smoke");
