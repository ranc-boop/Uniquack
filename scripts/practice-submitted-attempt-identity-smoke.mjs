#!/usr/bin/env node

// Non-live proof that rendered, persisted, and submitted Practice questions
// share one source-question identity without exposing identity or answer data.

import { Buffer } from "node:buffer";
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
const [
  answerRestoreSource,
  cardSource,
  clientSource,
  helperSource,
  identitySource,
  narrowHarnessSource,
  persistenceSource,
  typesSource,
] = await Promise.all([
  readFile(resolve(root, "src/lib/practice/answer-restore.ts"), "utf8"),
  readFile(resolve(root, "src/components/practice/practice-question-card.tsx"), "utf8"),
  readFile(resolve(root, "src/components/practice/practice-agent-client.tsx"), "utf8"),
  readFile(resolve(root, "src/lib/practice/client-helpers.ts"), "utf8"),
  readFile(resolve(root, "src/lib/practice/question-identity.ts"), "utf8"),
  readFile(resolve(root, "scripts/assignment-practice-resume-submit-live-e2e.mjs"), "utf8"),
  readFile(resolve(root, "src/lib/practice/persistence.ts"), "utf8"),
  readFile(resolve(root, "src/lib/practice/types.ts"), "utf8"),
]);

const identityExecutable = ts.transpileModule(
  identitySource.replace(/^export /gm, ""),
  { compilerOptions: { module: ts.ModuleKind.None, target: ts.ScriptTarget.ES2022 } },
).outputText;
const helperBlock = sourceBlock(helperSource, "type PracticeAnswerMap", "export function recommendationFromHistoryQuestion");
const helperExecutable = ts.transpileModule(helperBlock.replace(/^export /gm, ""), {
  compilerOptions: { module: ts.ModuleKind.None, target: ts.ScriptTarget.ES2022 },
}).outputText;
const helpers = Function(
  `${identityExecutable}; ${helperExecutable}; return { buildPracticeSubmittedAttempts, evaluatePracticeSubmittedAttempts, hasSubmittedPracticeAnswer, practiceAnswerKey, practiceSubmittedAttemptQuestionId };`,
)();

const sourceQuestionId = "SOURCE_Q";
const roundQuestionRowId = "ROUND_ROW";
const persistedQuestionId = "PERSISTED_ROW_REFERENCE";
assert(
  new Set([sourceQuestionId, roundQuestionRowId, persistedQuestionId]).size === 3,
  "symbolic identities must remain deliberately distinct",
);

const normalizedRoundQuestion = {
  id: roundQuestionRowId,
  questionId: persistedQuestionId,
  sourceQuestionId,
};
const renderedKey = helpers.practiceAnswerKey(normalizedRoundQuestion);
const submitIdentity = helpers.practiceSubmittedAttemptQuestionId(normalizedRoundQuestion);
assert(
  renderedKey === sourceQuestionId && submitIdentity === sourceQuestionId,
  "render and Submit must resolve the normalized round question to its source identity",
);

const answers = Object.freeze({ [renderedKey]: "present" });
const hints = Object.freeze({ [renderedKey]: ["present"] });
assert(
  helpers.hasSubmittedPracticeAnswer(answers[renderedKey]),
  "the rendered currentAnswer key must retrieve the committed answer",
);
const attempts = helpers.buildPracticeSubmittedAttempts(
  [normalizedRoundQuestion],
  answers,
  hints,
);
Object.freeze(attempts);
const evaluation = helpers.evaluatePracticeSubmittedAttempts(
  [normalizedRoundQuestion],
  attempts,
  answers,
);
assert(
  attempts.length === 1 &&
    attempts[0].questionId === sourceQuestionId &&
    helpers.hasSubmittedPracticeAnswer(attempts[0].answer) &&
    attempts[0].hintCount === 1 &&
    evaluation.clientAnswerSnapshot === "PRESENT" &&
    evaluation.renderedKeyEqualsSubmitLookupKey === "SAME" &&
    evaluation.answerMapHasRenderedKey === "YES" &&
    evaluation.answerMapHasSubmitLookupKey === "YES" &&
    evaluation.submitQuestionHasSourceIdentity === "YES" &&
    evaluation.submitIdentityMapping === "VALID" &&
    evaluation.submittedAttempt === "FOUND" &&
    evaluation.submittedAttemptAnswer === "PRESENT" &&
    evaluation.missingRequiredAttemptCount === 0,
  "the submitted attempt must retain the answer and API-required source identity",
);

const unanswered = helpers.buildPracticeSubmittedAttempts(
  [normalizedRoundQuestion],
  {},
  {},
);
const unansweredEvaluation = helpers.evaluatePracticeSubmittedAttempts(
  [normalizedRoundQuestion],
  unanswered,
  {},
);
assert(
  unansweredEvaluation.submittedAttempt === "FOUND" &&
    unansweredEvaluation.submittedAttemptAnswer === "EMPTY" &&
    unansweredEvaluation.missingRequiredAttemptCount === 1,
  "the guard must still block a genuinely unanswered current question",
);

const executableAnswerRestoreSource = answerRestoreSource.replace(
  /import \{ canonicalPracticeSourceQuestionId \} from "@\/lib\/practice\/question-identity";\r?\n/,
  "",
);
const answerRestoreExecutable = ts.transpileModule(executableAnswerRestoreSource, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const answerRestore = await import(
  `data:text/javascript;base64,${Buffer.from(`${identityExecutable}\n${answerRestoreExecutable}`).toString("base64")}`,
);
const restored = answerRestore.buildRestoredPracticeAnswers(
  [{ answer: "present", questionId: persistedQuestionId, sourceQuestionId }],
  [normalizedRoundQuestion],
);
assert(
  helpers.hasSubmittedPracticeAnswer(restored[sourceQuestionId]) &&
    restored[roundQuestionRowId] === undefined &&
    restored[persistedQuestionId] === undefined,
  "completed restoration must write only the canonical source answer key",
);

const submitBlock = sourceBlock(clientSource, "function submitRound", "function requestFeedbackNextRound");
assert(
  submitBlock.includes("const submittedAnswerSnapshot = Object.freeze({ ...answersRef.current })") &&
    submitBlock.includes("practiceSubmittedAttemptQuestionId(item) === attempt.questionId") &&
    submitBlock.includes("Object.freeze(submittedAttempts)") &&
    submitBlock.includes("submittedAnswerSnapshot,") &&
    (submitBlock.match(/attempts: submittedAttempts/g) ?? []).length === 3 &&
    submitBlock.includes("id: practiceSubmittedAttemptQuestionId(question)"),
  "Submit metadata, Review, grade fallback, and persistence fallback must reuse one mapped attempt",
);
assert(
  clientSource.includes("const questionId = practiceAnswerKey(question)") &&
    clientSource.includes("currentAnswer={answers[questionId]}") &&
    clientSource.includes("hasSubmittedPracticeAnswer(answers[questionId])") &&
    clientSource.includes('answerTransitionDiagnostics.answerStateRefConsistency === "MATCH"') &&
    clientSource.includes("hints={hints[questionId] ?? []}") &&
    clientSource.includes("result={resultsById.get(questionId)}") &&
    clientSource.includes("review={questionReviewsById.get(questionId)}") &&
    cardSource.includes("const answerKey = practiceAnswerKey(question)") &&
    cardSource.includes("name={`answer-${answerKey}`}"),
  "rendered answer, hint, result, and review maps must use the canonical answer key",
);
assert(
  persistenceSource.includes('id: String(question.id ?? "")') &&
    persistenceSource.includes("sourceQuestionId: String(question.source_question_id") &&
    typesSource.includes("sourceQuestionId?: string | null") &&
    identitySource.includes("question.sourceQuestionId?.trim() || question.id"),
  "session detail must preserve row identity separately from canonical source identity",
);

for (const relationship of [
  "rendered_key_equals_submit_lookup_key",
  "answer_map_has_rendered_key",
  "answer_map_has_submit_lookup_key",
  "submit_question_has_source_identity",
  "submit_identity_mapping",
]) {
  assert(narrowHarnessSource.includes(`${relationship}=`), `missing bounded diagnostic ${relationship}`);
}
for (const source of [clientSource, helperSource, narrowHarnessSource]) {
  assert(
    !/(?:console\.log|console\.error|console\.warn)\([^)]*(?:SOURCE_Q|ROUND_ROW|PERSISTED_ROW_REFERENCE|answer\.length|JSON\.stringify\([^)]*answer)/.test(source),
    "identity diagnostics must not print keys, IDs, answer content, or derived answer data",
  );
}

console.log("PASS practice_submitted_attempt_identity_smoke");
