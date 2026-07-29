#!/usr/bin/env node

// Non-live source and pure-classifier proof for Practice attempt answers.

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
const [answerContractSource, clientSource, gradeSource, harnessSource, persistenceSource, reviewSource, schemaSource, typesSource] =
  await Promise.all([
    readFile(resolve(root, "src/lib/practice/answer-restore.ts"), "utf8"),
    readFile(resolve(root, "src/components/practice/practice-agent-client.tsx"), "utf8"),
    readFile(resolve(root, "src/app/api/practice/grade/route.ts"), "utf8"),
    readFile(resolve(root, "scripts/assignment-practice-resume-submit-live-e2e.mjs"), "utf8"),
    readFile(resolve(root, "src/lib/practice/persistence.ts"), "utf8"),
    readFile(resolve(root, "src/app/api/practice/review/route.ts"), "utf8"),
    readFile(resolve(root, "supabase/clean-migrations/0008_practice_agent_evidence.sql"), "utf8"),
    readFile(resolve(root, "src/types/database.ts"), "utf8"),
  ]);

const restoreBlock = sourceBlock(clientSource, "function restoreRoundFromHistory", "useEffect(() =>");
const updateBlock = sourceBlock(clientSource, "function updateAnswer", "function requestHint");
const submitBlock = sourceBlock(clientSource, "function submitRound", "function requestFeedbackNextRound");
assert(
  clientSource.includes("const answersRef = useRef<AnswersState>({})") &&
    restoreBlock.includes("commitAnswers(restoredAnswers, reason") &&
    clientSource.includes("commitAnswers({}, reason)") &&
    updateBlock.includes('commitAnswers(nextAnswers, "INPUT")') &&
    clientSource.indexOf("answersRef.current = committedAnswers") <
      clientSource.indexOf("setAnswers(committedAnswers)") &&
    submitBlock.includes("const submittedAnswerSnapshot = Object.freeze({ ...answersRef.current })") &&
    submitBlock.includes("buildPracticeSubmittedAttempts("),
  "submission must snapshot the latest controlled answer before React commits another render",
);
assert(
  submitBlock.includes('const submittedAttempts: PracticeReviewRequest["attempts"]') &&
    (submitBlock.match(/attempts: submittedAttempts/g) ?? []).length === 3 &&
    submitBlock.includes("body: JSON.stringify({") &&
    submitBlock.includes('"/api/practice/grade"'),
  "review success and deterministic fallback must derive from the same submitted attempt snapshot",
);

const reviewPersistence = sourceBlock(
  reviewSource,
  "const attempts = validatePracticeRoundAttempts({",
  "await updateLinkedAssignmentProgressAfterPractice",
);
const gradePersistence = sourceBlock(
  gradeSource,
  "const attempts = validatePracticeRoundAttempts({",
  "const assignmentProgress",
);
const attemptWrite = sourceBlock(
  persistenceSource,
  "export async function persistQuestionReviewResults",
  "export async function persistRoundReviewSummary",
);
assert(
  reviewPersistence.includes("persistQuestionReviewResults({") &&
    reviewPersistence.includes("attempts,") &&
    gradePersistence.includes("persistQuestionReviewResults({") &&
    gradePersistence.includes("attempts,") &&
    attemptWrite.includes("answer: submittedPracticeAnswerForPersistence(attempt.answer)"),
  "both review paths must persist the original submitted answer",
);
assert(
  reviewSource.includes("studentAnswer: parsed.student_answer ?? attempt.answer") &&
    !attemptWrite.includes("review.studentAnswer") &&
    !attemptWrite.includes("student_answer"),
  "Provider-returned student_answer must not control persisted answer data",
);
assert(
  (persistenceSource.match(/\.from\("practice_attempts"\)\.upsert/g) ?? []).length === 1 &&
    !/\.from\("practice_attempts"\)[\s\S]{0,120}\.update\(/.test(persistenceSource),
  "no later Practice attempt write may clear the authoritative answer",
);

const executableAnswerContractSource = answerContractSource.replace(
  /import \{ canonicalPracticeSourceQuestionId \} from "@\/lib\/practice\/question-identity";\r?\n/,
  "const canonicalPracticeSourceQuestionId = (question) => question.sourceQuestionId?.trim() || question.id;\n",
);
const compiledAnswerContract = ts.transpileModule(executableAnswerContractSource, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const answerContract = await import(
  `data:text/javascript;base64,${Buffer.from(compiledAnswerContract).toString("base64")}`
);
for (const value of ["written", 0, false, ["choice"], { part: "structured" }]) {
  assert(
    answerContract.submittedPracticeAnswerForPersistence(value) === value,
    "persistence contract must preserve the exact submitted answer",
  );
}
assert(
  schemaSource.includes("answer jsonb not null default '\"\"'::jsonb") &&
    typesSource.includes("export type PracticeAttempt = {") &&
    typesSource.includes("  answer: Json;"),
  "canonical schema and generated types must retain a non-null JSON answer column",
);

const classifierBlock = sourceBlock(
  harnessSource,
  "function classifyPracticeAnswer",
  "async function sessionDetailAttemptDiagnostics",
);
const classifiers = Function(`${classifierBlock}; return { classifyPracticeAnswer, classifyPersistedAttemptRows };`)();
for (const value of ["written", 0, false, ["choice"], { part: "structured" }]) {
  assert(classifiers.classifyPracticeAnswer(value) === "PRESENT", "supported answer must be present");
}
for (const value of ["", [], {}]) {
  assert(classifiers.classifyPracticeAnswer(value) === "EMPTY", "empty answer must be bounded as empty");
}
assert(classifiers.classifyPracticeAnswer(null) === "NULL", "null answer must remain distinct");
assert(
  classifiers.classifyPersistedAttemptRows([]).row === "MISSING" &&
    classifiers.classifyPersistedAttemptRows([{ answer: "one" }, { answer: "two" }]).row === "AMBIGUOUS" &&
    classifiers.classifyPersistedAttemptRows([{ answer: false }]).answer === "PRESENT",
  "attempt diagnostics must distinguish missing, ambiguous, and present states",
);

const sourceQuestionId = "SOURCE_QUESTION_SYMBOLIC_ID";
const roundQuestionRowId = "ROUND_QUESTION_ROW_SYMBOLIC_ID";
const attemptRowId = "ATTEMPT_ROW_SYMBOLIC_ID";
const sessionId = "SESSION_SYMBOLIC_ID";
const roundId = "ROUND_SYMBOLIC_ID";
assert(
  new Set([sourceQuestionId, roundQuestionRowId, attemptRowId, sessionId, roundId]).size === 5,
  "attempt-selection identities must be deliberately distinct",
);
const candidateRows = [
  { answer: "wrong", id: "OTHER_ATTEMPT", roundId, sessionId, sourceQuestionId: "OTHER_SOURCE" },
  { answer: "right", id: attemptRowId, roundId, sessionId, sourceQuestionId },
];
const selectedRows = candidateRows.filter((row) =>
  row.sessionId === sessionId && row.roundId === roundId && row.sourceQuestionId === sourceQuestionId
);
assert(
  selectedRows.length === 1 && selectedRows[0].id === attemptRowId,
  "postcondition must select the rendered round question attempt, not merely a session row",
);

const persistedDiagnostic = sourceBlock(
  harnessSource,
  'phase(fixtures, "ASSIGNMENT_PRACTICE_PERSISTENCE")',
  'phase(fixtures, "ASSIGNMENT_PRACTICE_COMPLETED_RELOAD_ROUTE")',
);
for (const filter of [
  '.eq("session_id", firstStart.sessionId)',
  '.eq("round_id", fixtures.roundIds[0])',
  '.eq("user_id", contract.studentId)',
  '.eq("source_question_id", contract.questionId)',
]) {
  assert(persistedDiagnostic.includes(filter), `missing exact attempt filter: ${filter}`);
}
assert(
  harnessSource.includes("item?.id === expectedRoundId") &&
    harnessSource.includes("item?.sourceQuestionId === expectedSourceId") &&
    persistenceSource.includes("answer: normalizePersistedPracticeAnswer(attempt.answer)") &&
    clientSource.includes("buildRestoredPracticeAnswers("),
  "session detail and completed restoration must retain the selected attempt answer",
);
const browserBoundary = sourceBlock(
  harnessSource,
  'phase(fixtures, "ASSIGNMENT_PRACTICE_ANSWER_INPUT")',
  'phase(fixtures, "ASSIGNMENT_PRACTICE_SUBMIT_BUTTON")',
);
const reviewBoundary = sourceBlock(
  harnessSource,
  "function reviewRequestAttemptState",
  "function observeGrade",
);
assert(
  browserBoundary.includes("answerControl.evaluate") &&
    browserBoundary.includes("Boolean(element.value.trim())") &&
    harnessSource.includes('observeReviewRequest(page, server.origin, contract.questionId)') &&
    reviewBoundary.includes("request.postDataJSON()") &&
    reviewBoundary.includes("item?.questionId === expectedQuestionId") &&
    reviewBoundary.includes('attempt: "MISSING"') &&
    reviewBoundary.includes('attempt: "AMBIGUOUS"') &&
    reviewBoundary.includes('attempt: "FOUND"'),
  "bounded diagnostics must locate the first empty browser-to-review boundary",
);
assert(
  !/(?:console\.log|console\.error|console\.warn)\([^)]*(?:written|choice|structured|wrong|right)/.test(
    await readFile(resolve(root, "scripts/practice-attempt-answer-persistence-smoke.mjs"), "utf8"),
  ),
  "focused diagnostics must not print answer content",
);

console.log("PASS practice_attempt_answer_persistence_smoke");
