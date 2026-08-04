import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const source = await readFile(
  resolve(root, "src/lib/ai-pdf-import/post-persistence.ts"),
  "utf8",
);
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const contract = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
);

const privateSentinel = "raw-provider-body-private-sentinel";
let captured = null;
try {
  await contract.runAIPdfPostPersistenceStage({
    operation: async () => {
      throw new Error(privateSentinel);
    },
    stage: "batch_finalization",
  });
} catch (error) {
  captured = error;
}

assert(captured, "post-persistence failures must remain observable");
assert(
  contract.getAIPdfPostPersistenceFailureStage(captured) ===
    "batch_finalization",
  "post-persistence diagnostics must preserve only the allowlisted stage",
);
assert(
  !String(captured.message).includes(privateSentinel) &&
    !JSON.stringify(captured).includes(privateSentinel),
  "post-persistence diagnostics must not serialize raw failure content",
);
assert(
  contract.AI_PDF_POST_PERSISTENCE_STAGES.length === 4,
  "post-persistence diagnostics must remain a bounded stage vocabulary",
);

const finalizationError = new contract.AIPdfBatchFinalizationContractError({
  cause: new Error(privateSentinel),
  reason: "rpc_rejected",
  summaryBytes: 12_345,
});
let wrappedFinalizationError = null;
try {
  await contract.runAIPdfPostPersistenceStage({
    operation: async () => {
      throw finalizationError;
    },
    stage: "batch_finalization",
  });
} catch (error) {
  wrappedFinalizationError = error;
}
const finalizationEvidence = contract.getAIPdfBatchFinalizationFailure(
  wrappedFinalizationError,
);
assert(
  finalizationEvidence?.reason === "rpc_rejected" &&
    finalizationEvidence.summaryBytes === 12_345,
  "batch finalization diagnostics must preserve only reason and bounded bytes",
);
assert(
  !JSON.stringify(wrappedFinalizationError).includes(privateSentinel),
  "batch finalization diagnostics must keep the raw RPC error non-serializable",
);

const worker = await readFile(resolve(root, "src/lib/ai-jobs/worker.ts"), "utf8");
const harness = await readFile(
  resolve(root, "scripts/pdf50-end-to-end-live-e2e.mjs"),
  "utf8",
);
assert(
  worker.includes("getAIPdfPostPersistenceFailureStage") &&
    worker.includes("postPersistenceFailureStage"),
  "the durable worker must persist the safe failure stage",
);
assert(
  harness.includes("safePostPersistenceFailureStage") &&
    harness.includes("POST_PERSISTENCE_FAILURE_STAGE=") &&
    harness.includes("BATCH_FINALIZATION_FAILURE_REASON=") &&
    harness.includes("BATCH_FINALIZATION_SUMMARY_BYTES="),
  "the live proof must emit only the sanitized failure stage",
);

console.log("PASS PDF50 bounded post-persistence diagnostics smoke");
