#!/usr/bin/env node

// Non-live source and pure-state proof for authoritative Practice answer commits.

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

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
const [cardSource, clientSource, helperSource, roundRestorationSource, narrowHarness, fullHarness] = await Promise.all([
  readFile(resolve(root, "src/components/practice/practice-question-card.tsx"), "utf8"),
  readFile(resolve(root, "src/components/practice/practice-agent-client.tsx"), "utf8"),
  readFile(resolve(root, "src/lib/practice/client-helpers.ts"), "utf8"),
  readFile(resolve(root, "src/lib/practice/round-restoration.ts"), "utf8"),
  readFile(resolve(root, "scripts/assignment-practice-resume-submit-live-e2e.mjs"), "utf8"),
  readFile(resolve(root, "scripts/student-v1-browser-e2e.mjs"), "utf8"),
]);

const commitBlock = sourceBlock(clientSource, "function commitAnswers", "async function refreshPracticeState");
assert(
  (clientSource.match(/setAnswers\(/g) ?? []).length === 1 &&
    (clientSource.match(/answersRef\.current\s*=/g) ?? []).length === 1 &&
    commitBlock.includes("const committedAnswers = Object.freeze({ ...nextAnswers })") &&
    commitBlock.indexOf("answersRef.current = committedAnswers") <
      commitBlock.indexOf("setAnswers(committedAnswers)"),
  "every answer-map write must assign the same immutable map to ref and state through commitAnswers",
);
assert(
  commitBlock.includes('protectNewerInput && answerWriteMetaRef.current.lastWriteReason === "INPUT"') &&
    commitBlock.includes('reason === "INPUT" ? true : clearsInputGeneration ? false : hadInput') &&
    commitBlock.includes('reason === "SESSION_CHANGE"') &&
    commitBlock.includes('reason === "ROUND_CHANGE"') &&
    commitBlock.includes('reason === "COMPLETED_RESTORE"'),
  "newer input must resist stale hydration while legitimate context changes reset its generation",
);

const restoreBlock = sourceBlock(clientSource, "function restoreRoundFromHistory", "useEffect(() =>");
const updateBlock = sourceBlock(clientSource, "function updateAnswer", "function requestHint");
assert(
    restoreBlock.includes("commitAnswers(restored.answers, reason") &&
    restoreBlock.includes('protectNewerInput: reason === "SESSION_HYDRATION"') &&
    updateBlock.includes('commitAnswers(nextAnswers, "INPUT")') &&
    roundRestorationSource.includes("round.status === \"completed\" ? persistedAnswers : draftAnswers ?? persistedAnswers") &&
    clientSource.includes('resetRoundState("ROUND_CHANGE")') &&
    clientSource.includes('resetRoundState("SESSION_CHANGE")'),
  "input, hydration, round changes, and session changes must use the authoritative commit boundary",
);

const cardInput = sourceBlock(cardSource, "function QuestionAnswerInput", "function QuestionReviewDiagnostic");
assert(
  cardInput.includes('data-answer-committed={answerCommitted ? "yes" : "no"}') &&
    clientSource.includes("hasSubmittedPracticeAnswer(answers[questionId])") &&
    clientSource.includes('answerTransitionDiagnostics.answerStateRefConsistency === "MATCH"') &&
    commitBlock.includes('answerStateRefConsistency: "MATCH"'),
  "committed must prove canonical state presence after the shared state/ref commit",
);

const submitBlock = sourceBlock(clientSource, "function submitRound", "function requestFeedbackNextRound");
assert(
  submitBlock.includes('submittedAnswerState !== "PRESENT"') &&
    submitBlock.includes('submittedAnswerRef !== "PRESENT"') &&
    submitBlock.includes('submittedAnswerConsistency !== "MATCH"') &&
    submitBlock.includes('submissionEvaluation.submittedAttempt !== "FOUND"') &&
    submitBlock.includes("submissionEvaluation.missingRequiredAttemptCount > 0"),
  "Submit must preserve the missing-answer guard and add state/ref consistency checks",
);

function createCommitModel() {
  let answerState = Object.freeze({});
  let answerRef = answerState;
  let hadInput = false;
  let lastWriteReason = "NOT_OBSERVED";
  return {
    commit(nextAnswers, reason, protectNewerInput = false) {
      if (protectNewerInput && lastWriteReason === "INPUT") return false;
      const committed = Object.freeze({ ...nextAnswers });
      answerRef = committed;
      answerState = committed;
      const clearsInputGeneration = ["SESSION_CHANGE", "ROUND_CHANGE", "RESET", "COMPLETED_RESTORE"].includes(reason);
      hadInput = reason === "INPUT" ? true : clearsInputGeneration ? false : hadInput;
      lastWriteReason = reason;
      return true;
    },
    snapshot() {
      return { answerRef, answerState, hadInput, lastWriteReason };
    },
  };
}

const protectedModel = createCommitModel();
assert(protectedModel.commit({ canonical: "present" }, "INPUT"), "input commit must succeed");
assert(
  !protectedModel.commit({}, "SESSION_HYDRATION", true) &&
    protectedModel.snapshot().answerRef === protectedModel.snapshot().answerState &&
    protectedModel.snapshot().lastWriteReason === "INPUT",
  "delayed empty hydration must not erase newer input",
);
const hydrationModel = createCommitModel();
assert(
  hydrationModel.commit({}, "SESSION_HYDRATION", true) &&
    hydrationModel.snapshot().answerRef === hydrationModel.snapshot().answerState,
  "hydration must still initialize an unanswered round before user input",
);
assert(
  protectedModel.commit({}, "ROUND_CHANGE") &&
    protectedModel.snapshot().answerRef === protectedModel.snapshot().answerState &&
    !protectedModel.snapshot().hadInput,
  "an explicit round change must reset both answer stores and input generation",
);

for (const harness of [narrowHarness, fullHarness]) {
  assert(
    harness.includes('[data-answer-state-after-input="PRESENT"]') &&
      harness.includes('[data-answer-ref-after-input="PRESENT"]') &&
      harness.includes('[data-answer-state-before-submit="PRESENT"]') &&
      harness.includes('[data-answer-ref-before-submit="PRESENT"]') &&
      harness.includes('[data-answer-state-ref-consistency="MATCH"]') &&
      harness.includes('[data-answer-reset-after-input="NO"]') &&
      harness.includes('[data-answer-last-write-reason="INPUT"]'),
    "browser synchronization must require bounded authoritative answer state before Submit",
  );
}

assert(
  helperSource.includes("export function practiceAnswerMapStatus") &&
    helperSource.includes("export function practiceAnswerMapsMatch"),
  "canonical answer-map status helpers must remain shared",
);
for (const source of [cardSource, clientSource, narrowHarness, fullHarness]) {
  assert(
    !/(?:console\.log|console\.error|console\.warn)\([^)]*(?:answer\.length|inputValue|createHash|JSON\.stringify\([^)]*answer)/.test(source),
    "answer diagnostics must not emit answer data or derivatives",
  );
}

console.log("PASS practice_answer_state_consistency_smoke");
