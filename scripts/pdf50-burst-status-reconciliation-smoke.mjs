import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const modulePath = resolve(
  root,
  "src",
  "lib",
  "ai-pdf-import",
  "burst-status-reconciliation.ts",
);
const source = await readFile(modulePath, "utf8");
const output = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
  fileName: modulePath,
}).outputText;
const loadedModule = { exports: {} };
new Function("exports", "module", output)(loadedModule.exports, loadedModule);

const {
  markPdfBurstCancellationRequestFailed,
  markPdfBurstCancellationRequested,
  mergePdfBurstDurableSnapshot,
  mergePdfBurstDurableSnapshotsByClientKey,
  reconcilePdfBurstDisplayState,
} = loadedModule.exports;

const durable = (status, safeErrorCode = null) => ({ safeErrorCode, status });
const reconcile = ({
  durableStatus = null,
  localPhase,
  localRequestState = null,
  localWarningCode = null,
}) =>
  reconcilePdfBurstDisplayState({
    durable: durableStatus,
    localPhase,
    localRequestState,
    localWarningCode,
  });

const completedAfterLocalFailure = reconcile({
  durableStatus: durable("completed"),
  localPhase: "failed",
  localWarningCode: "finalize_response_interrupted",
});
assert.equal(completedAfterLocalFailure.status, "completed");
assert.equal(completedAfterLocalFailure.shouldPoll, false);
assert.equal(
  completedAfterLocalFailure.localWarningCode,
  "finalize_response_interrupted",
);

const failedAfterLocalFailure = reconcile({
  durableStatus: durable("failed", "provider_invalid_response"),
  localPhase: "failed",
  localWarningCode: "finalize_response_interrupted",
});
assert.equal(failedAfterLocalFailure.status, "failed");
assert.equal(failedAfterLocalFailure.safeErrorCode, "provider_invalid_response");
assert.equal(
  failedAfterLocalFailure.localWarningCode,
  "finalize_response_interrupted",
);

const completedSnapshot = mergePdfBurstDurableSnapshot(
  null,
  durable("completed"),
);
assert.strictEqual(
  mergePdfBurstDurableSnapshot(completedSnapshot, durable("processing")),
  completedSnapshot,
  "a delayed server snapshot must not downgrade completed",
);
assert.strictEqual(
  mergePdfBurstDurableSnapshot(completedSnapshot, durable("failed")),
  completedSnapshot,
  "a delayed conflicting terminal snapshot must not downgrade completed",
);
assert.strictEqual(
  mergePdfBurstDurableSnapshot(completedSnapshot, durable("cancelled")),
  completedSnapshot,
  "a delayed cancellation response must not downgrade completed",
);
assert.equal(
  reconcile({
    durableStatus: completedSnapshot,
    localPhase: "failed",
    localWarningCode: "upload_failed",
  }).status,
  "completed",
  "a delayed local failure must not override durable completion",
);

assert.equal(
  reconcile({
    durableStatus: durable("completed"),
    localPhase: "selected",
  }).status,
  "completed",
  "refresh/remount must restore completed from durable state",
);
assert.equal(
  reconcile({
    durableStatus: durable("failed", "provider_timeout"),
    localPhase: "uploading",
  }).status,
  "failed",
  "durable failure must override stale local nonterminal state",
);
assert.equal(
  reconcile({
    durableStatus: durable("cancelled"),
    localPhase: "finalizing",
  }).status,
  "cancelled",
  "durable cancellation must override stale local nonterminal state",
);
assert.deepEqual(
  reconcile({
    durableStatus: durable("reserved"),
    localPhase: "finalizing",
    localWarningCode: "finalize_response_interrupted",
  }),
  {
    durableStatusKnown: true,
    localRequestState: null,
    localWarningCode: "finalize_response_interrupted",
    safeErrorCode: null,
    shouldPoll: true,
    status: "finalizing",
  },
  "an interrupted finalize response must keep polling without claiming failure",
);
assert.equal(
  reconcile({
    durableStatus: durable("queued"),
    localPhase: "failed",
    localWarningCode: "finalize_response_interrupted",
  }).shouldPoll,
  true,
  "queued durable work must continue polling despite a local warning",
);

const selectedBeforeCompletion = [
  {
    clientItemKey: "item-1",
    durableSnapshot: durable("processing"),
  },
];
const selectedAfterCompletion = mergePdfBurstDurableSnapshotsByClientKey(
  selectedBeforeCompletion,
  new Map([["item-1", durable("completed")]]),
);
assert.equal(selectedAfterCompletion[0].durableSnapshot.status, "completed");
const selectedAfterDelayedProcessing =
  mergePdfBurstDurableSnapshotsByClientKey(
    selectedAfterCompletion,
    new Map([["item-1", durable("processing")]]),
  );
assert.strictEqual(
  selectedAfterDelayedProcessing,
  selectedAfterCompletion,
  "the component state merge must retain completed across a delayed server refresh",
);

const selectedQueuedForCancellation = [
  {
    clientItemKey: "race-item",
    durableSnapshot: durable("queued"),
    localPhase: "reserved",
    localRequestState: null,
    localWarningCode: null,
  },
];
const cancellationRequested = markPdfBurstCancellationRequested(
  selectedQueuedForCancellation,
);
assert.strictEqual(
  cancellationRequested[0].durableSnapshot,
  selectedQueuedForCancellation[0].durableSnapshot,
  "a cancellation request must not manufacture a durable snapshot",
);
assert.equal(
  cancellationRequested[0].localRequestState,
  "cancellation_requested",
);

const workerClaimWon = mergePdfBurstDurableSnapshotsByClientKey(
  cancellationRequested,
  new Map([["race-item", durable("processing")]]),
);
const processingAfterCancellationRace = reconcilePdfBurstDisplayState({
  durable: workerClaimWon[0].durableSnapshot,
  localPhase: workerClaimWon[0].localPhase,
  localRequestState: workerClaimWon[0].localRequestState,
  localWarningCode: workerClaimWon[0].localWarningCode,
});
assert.equal(processingAfterCancellationRace.status, "processing");
assert.equal(processingAfterCancellationRace.localRequestState, null);
assert.equal(processingAfterCancellationRace.shouldPoll, true);

const workerCompleted = mergePdfBurstDurableSnapshotsByClientKey(
  workerClaimWon,
  new Map([["race-item", durable("completed")]]),
);
const completedAfterCancellationRace = reconcilePdfBurstDisplayState({
  durable: workerCompleted[0].durableSnapshot,
  localPhase: workerCompleted[0].localPhase,
  localRequestState: workerCompleted[0].localRequestState,
  localWarningCode: workerCompleted[0].localWarningCode,
});
assert.equal(completedAfterCancellationRace.status, "completed");
assert.equal(completedAfterCancellationRace.localRequestState, null);
assert.equal(completedAfterCancellationRace.shouldPoll, false);

const trulyCancelled = mergePdfBurstDurableSnapshotsByClientKey(
  cancellationRequested,
  new Map([["race-item", durable("cancelled")]]),
);
assert.equal(
  reconcilePdfBurstDisplayState({
    durable: trulyCancelled[0].durableSnapshot,
    localPhase: trulyCancelled[0].localPhase,
    localRequestState: trulyCancelled[0].localRequestState,
    localWarningCode: trulyCancelled[0].localWarningCode,
  }).status,
  "cancelled",
  "only the authoritative server snapshot may establish cancellation",
);

const partialBatch = markPdfBurstCancellationRequested([
  {
    clientItemKey: "cancelled-item",
    durableSnapshot: durable("queued"),
    localPhase: "reserved",
    localRequestState: null,
    localWarningCode: null,
  },
  {
    clientItemKey: "processing-item",
    durableSnapshot: durable("processing"),
    localPhase: "reserved",
    localRequestState: null,
    localWarningCode: null,
  },
  {
    clientItemKey: "completed-item",
    durableSnapshot: durable("completed"),
    localPhase: "reserved",
    localRequestState: null,
    localWarningCode: null,
  },
]);
assert.equal(partialBatch[0].localRequestState, "cancellation_requested");
assert.equal(partialBatch[1].localRequestState, null);
assert.equal(partialBatch[2].localRequestState, null);
const partialServerResult = mergePdfBurstDurableSnapshotsByClientKey(
  partialBatch,
  new Map([
    ["cancelled-item", durable("cancelled")],
    ["processing-item", durable("processing")],
    ["completed-item", durable("completed")],
  ]),
);
assert.deepEqual(
  partialServerResult.map((item) =>
    reconcilePdfBurstDisplayState({
      durable: item.durableSnapshot,
      localPhase: item.localPhase,
      localRequestState: item.localRequestState,
      localWarningCode: item.localWarningCode,
    }).status,
  ),
  ["cancelled", "processing", "completed"],
  "partial cancellation must preserve each authoritative server outcome",
);

const cancellationTransportFailed = markPdfBurstCancellationRequestFailed(
  cancellationRequested,
);
assert.strictEqual(
  cancellationTransportFailed[0].durableSnapshot,
  selectedQueuedForCancellation[0].durableSnapshot,
);
assert.equal(cancellationTransportFailed[0].localRequestState, null);
assert.equal(
  cancellationTransportFailed[0].localWarningCode,
  "cancellation_request_failed",
);
assert.equal(
  reconcilePdfBurstDisplayState({
    durable: cancellationTransportFailed[0].durableSnapshot,
    localPhase: cancellationTransportFailed[0].localPhase,
    localRequestState: cancellationTransportFailed[0].localRequestState,
    localWarningCode: cancellationTransportFailed[0].localWarningCode,
  }).shouldPoll,
  true,
  "a cancellation transport failure must keep polling authoritative queued work",
);

const component = await readFile(
  resolve(root, "src", "components", "teacher", "teacher-pdf-burst-upload.tsx"),
  "utf8",
);
assert(component.includes("reconcilePdfBurstDisplayState"));
assert(component.includes("mergePdfBurstDurableSnapshot"));
assert(component.includes("mergePdfBurstDurableSnapshotsByClientKey"));
assert(component.includes("window.setTimeout"));
assert(component.includes("localWarningCode"));
assert(component.includes("localRequestState"));
assert(component.includes("item.shouldPoll"));
assert(!component.includes("statusProgress"));
assert(!component.includes('status: "cancelled" as const'));

console.log(
  "PASS PDF50 durable/local status reconciliation matrix (cancellation authority, worker-claim race, partial cancellation, transport failure, delayed responses, remount, polling)",
);
