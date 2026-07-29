import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();
const read = (path) => readFile(resolve(root, path), "utf8");

const [
  client,
  persistence,
  scopePanels,
  types,
] = await Promise.all([
  read("src/components/practice/practice-agent-client.tsx"),
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

console.log("PASS practice round state recovery and stale-operation guard");
