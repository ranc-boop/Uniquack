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
  mergePdfBurstDurableSnapshot,
  mergePdfBurstDurableSnapshotsByClientKey,
  reconcilePdfBurstDisplayState,
} = loadedModule.exports;

const durable = (status, safeErrorCode = null) => ({ safeErrorCode, status });
const reconcile = ({
  durableStatus = null,
  localPhase,
  localWarningCode = null,
}) =>
  reconcilePdfBurstDisplayState({
    durable: durableStatus,
    localPhase,
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

const component = await readFile(
  resolve(root, "src", "components", "teacher", "teacher-pdf-burst-upload.tsx"),
  "utf8",
);
assert(component.includes("reconcilePdfBurstDisplayState"));
assert(component.includes("mergePdfBurstDurableSnapshot"));
assert(component.includes("mergePdfBurstDurableSnapshotsByClientKey"));
assert(component.includes("window.setTimeout"));
assert(component.includes("localWarningCode"));
assert(component.includes("item.shouldPoll"));
assert(!component.includes("statusProgress"));

console.log(
  "PASS PDF50 durable/local status reconciliation matrix (completion precedence, terminal conflicts, delayed responses, remount, polling)",
);
