import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();
const read = (path) => readFile(resolve(root, path), "utf8");

const [
  client,
  questionBankClient,
  persistence,
  scopePanels,
  types,
] = await Promise.all([
  read("src/components/practice/practice-agent-client.tsx"),
  read("src/components/question-bank-client.tsx"),
  read("src/lib/practice/persistence.ts"),
  read("src/components/practice/practice-session-scope-panels.tsx"),
  read("src/lib/practice/types.ts"),
]);

const recommendationStart = client.indexOf("function requestRecommendation(");
const recommendationEnd = client.indexOf("\n  function updateAnswer(", recommendationStart);
assert(recommendationStart >= 0 && recommendationEnd > recommendationStart);
const recommendationBlock = client.slice(recommendationStart, recommendationEnd);

assert(
  client.includes("activePracticeOperationRef") &&
    client.includes("AbortController") &&
    client.includes("signal,") &&
    client.includes("signal,") &&
    client.includes("signal.aborted"),
  "Practice streams must be abortable and guarded by the current operation token",
);
assert(
  client.includes("function cancelPracticeOperation({ resetReviewState = true }") &&
    client.includes("setIsReviewStreaming(false)") &&
    client.includes("cancelPracticeOperation({ resetReviewState: false })"),
  "Canceling a practice operation must clear review-streaming state while unmount cleanup avoids state updates",
);

assert(
  recommendationBlock.includes("phaseBeforeRecommendation") &&
    recommendationBlock.includes("finishThinking(phaseBeforeRecommendation)") &&
    recommendationBlock.indexOf("postRecommendationStream") <
      recommendationBlock.indexOf('resetRoundState("ROUND_CHANGE")'),
  "A failed next-round request must keep the previous rendered round instead of clearing the workspace",
);

assert(
  client.includes("disabled={practiceNavigationLocked}") &&
    scopePanels.includes("disabled: boolean;") &&
    scopePanels.includes("disabled={disabled}"),
  "Round history navigation must be locked while a recommendation or review transition is in flight",
);

assert(
  client.includes("roundAnswerDraftsRef") &&
    client.includes("practiceRoundDraftKey") &&
    client.includes("roundAnswerDraftsRef.current[draftKey]") &&
    /round\.status === "completed"\s*\? persistedAnswers\s*:\s*roundAnswerDraftsRef\.current\[draftKey\] \?\? persistedAnswers/.test(client),
  "Browsing completed rounds must preserve and restore the active round's unsubmitted answer draft",
);

assert(
  types.includes('status: "active" | "completed" | "skipped";') &&
    persistence.includes(
      '"id,next_round_goal,review_summary,round_goal,score_correct,score_total,status,trace"',
    ) &&
    persistence.includes('round.status === "completed"') &&
    persistence.includes('status: "completed"') &&
    persistence.includes("completed_at:"),
  "Persisted round status must be authoritative and restored explicitly",
);

assert(
  client.includes('round.status === "completed"') &&
    !client.includes(
      "round.reviewSummary || restoredResults.length",
    ),
  "Restoring a round must not infer completion from a partial attempt or transient review payload",
);

const initialHydrationStart = client.indexOf("initialHydrationStartedRef.current = true");
const initialHydrationEnd = client.indexOf(
  "// eslint-disable-next-line react-hooks/exhaustive-deps",
  initialHydrationStart,
);
const initialHydrationBlock = client.slice(
  initialHydrationStart,
  initialHydrationEnd,
);
assert(
  initialHydrationBlock.includes("restoreActive: true"),
  "Refreshing /practice must restore the owned active session and its latest authoritative round",
);
assert(
  questionBankClient.includes("CURRENT_PRACTICE_PENDING_ROUND_STORAGE_KEY") &&
    !questionBankClient.includes('"o2i:pendingPracticeRound"'),
  "Question Bank handoff must write the current pending-round key instead of a key cleared as legacy",
);

const errorBannerIndex = client.indexOf('{error ? (');
const mainIndex = client.indexOf('<main className=');
const mainEndIndex = client.indexOf("</main>", mainIndex);
assert(
  errorBannerIndex > mainIndex && errorBannerIndex < mainEndIndex,
  "Practice errors must render inside the main column instead of changing the outer three-column grid placement",
);

console.log("PASS practice round state recovery and stale-operation guard");
