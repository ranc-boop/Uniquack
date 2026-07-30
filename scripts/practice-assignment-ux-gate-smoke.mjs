import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();
const [client, questionCard] = await Promise.all([
  readFile(
    resolve(root, "src/components/practice/practice-agent-client.tsx"),
    "utf8",
  ),
  readFile(
    resolve(root, "src/components/practice/practice-question-card.tsx"),
    "utf8",
  ),
]);

function sourceBlock(source, start, end) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert(startIndex >= 0, `missing source block start: ${start}`);
  assert(endIndex > startIndex, `missing source block end: ${end}`);
  return source.slice(startIndex, endIndex);
}

const sessionSwitch = sourceBlock(
  client,
  "function switchSession",
  "async function loadMoreSessions",
);
const newSession = sourceBlock(
  client,
  "function createNewSession",
  "function showHistoricalRound",
);
const scopedSession = sourceBlock(
  client,
  "function prepareScopedNewSession",
  "function deleteSession",
);
const deleteSession = sourceBlock(
  client,
  "function deleteSession",
  "function saveOutlineNotes",
);
const submitRound = sourceBlock(
  client,
  "function submitRound",
  "function requestFeedbackNextRound",
);
const answerInput = sourceBlock(
  questionCard,
  "function QuestionAnswerInput",
  "function QuestionReviewDiagnostic",
);

assert(
  client.includes("const isAssignmentMode = Boolean(assignmentId)") &&
    client.includes("{!isAssignmentMode ? (") &&
    client.includes(
      '? "xl:grid-cols-[minmax(0,1fr)_var(--practice-right)]"',
    ),
  "Assignment mode must remove the ordinary Sessions column so mobile and desktop start with assignment content",
);

assert(
  sessionSwitch.includes("if (isAssignmentMode)") &&
    newSession.includes("if (isAssignmentMode)") &&
    scopedSession.includes("if (isAssignmentMode && assignmentId)") &&
    scopedSession.includes("await startAssignmentPractice(assignmentId)") &&
    deleteSession.includes("if (isAssignmentMode)"),
  "Assignment mode must block ordinary session switching, creation, and deletion while preserving assignmentId on restart",
);

assert(
  client.includes("isAssignmentMode && nextSession") &&
    client.includes("isAssignmentMode ? false") &&
    client.includes(
      "{!isAssignmentMode && phase === \"feedback\" && review ? (",
    ),
  "Assignment mode must keep only its current session and hide unrelated next-round quantity controls",
);

assert(
  answerInput.includes("<fieldset") &&
    answerInput.includes("<legend") &&
    answerInput.includes("<Label htmlFor={answerControlId}>Your answer</Label>") &&
    answerInput.includes("aria-describedby={hasAnswerError ? answerErrorId : undefined}") &&
    answerInput.includes("aria-invalid={hasAnswerError || undefined}") &&
    questionCard.includes('role="heading"'),
  "Each answer control must have a programmatic question label, group semantics, and an associated error",
);

assert(
  submitRound.includes("submitInFlightRef.current ||") &&
    submitRound.includes("isPending ||") &&
    submitRound.includes("const missingAnswerIndexes") &&
    submitRound.includes("setAnswerErrorQuestionIndexes(missingAnswerIndexes)") &&
    submitRound.includes("answerErrorSummaryRef.current?.focus()") &&
    submitRound.includes("submitInFlightRef.current = true") &&
    submitRound.includes("submitInFlightRef.current = false") &&
    client.includes("aria-busy={isPending || isReviewStreaming}") &&
    client.includes("hasAnswerError={answerErrorQuestionIndexes.includes(index + 1)}") &&
    client.includes('href={`#practice-question-${questionIndex}`}'),
  "Submit must reject duplicate pending work and focus a question-specific missing-answer summary",
);

console.log("PASS Practice Assignment UX/WCAG source gates");
