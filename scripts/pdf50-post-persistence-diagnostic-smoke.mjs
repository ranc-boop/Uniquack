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
const contractModuleUrl = `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`;
const contract = await import(contractModuleUrl);
const duplicateContract = await import(`${contractModuleUrl}#duplicate-bundle`);
const fencedPersistenceSource = await readFile(
  resolve(root, "src/lib/batch-import/fenced-persistence.ts"),
  "utf8",
);
const fencedPersistenceCompiled = ts.transpileModule(fencedPersistenceSource, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const fencedPersistence = await import(
  `data:text/javascript;base64,${Buffer.from(fencedPersistenceCompiled).toString("base64")}`
);
const checkpointSource = await readFile(
  resolve(root, "src/lib/ai-jobs/checkpoint.ts"),
  "utf8",
);
const checkpointCompiled = ts.transpileModule(
  checkpointSource.replace('import "server-only";', ""),
  {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  },
).outputText;
const checkpointModuleUrl = `data:text/javascript;base64,${Buffer.from(checkpointCompiled).toString("base64")}`;
const checkpoint = await import(checkpointModuleUrl);
const duplicateCheckpoint = await import(
  `${checkpointModuleUrl}#duplicate-bundle`
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
  contract.AI_PDF_POST_PERSISTENCE_STAGES.length === 5 &&
    contract.AI_PDF_POST_PERSISTENCE_STAGES.includes("draft_persistence"),
  "post-persistence diagnostics must remain a bounded stage vocabulary",
);

let draftPersistenceError = null;
try {
  await contract.runAIPdfPostPersistenceStage({
    operation: async () => {
      throw new Error(privateSentinel);
    },
    stage: "draft_persistence",
  });
} catch (error) {
  draftPersistenceError = error;
}
assert(
  contract.getAIPdfPostPersistenceFailureStage(draftPersistenceError) ===
    "draft_persistence",
  "draft persistence failures must retain only their bounded stage",
);

const duplicateBundleError = new duplicateContract.AIPdfPostPersistenceError(
  "draft_persistence",
  new Error(privateSentinel),
);
assert(
  !(duplicateBundleError instanceof contract.AIPdfPostPersistenceError) &&
    contract.isAIPdfPostPersistenceError(duplicateBundleError) &&
    contract.getAIPdfPostPersistenceFailureStage(duplicateBundleError) ===
      "draft_persistence",
  "post-persistence identity must survive duplicated server module instances",
);

let replayAttempts = 0;
const replayed = await fencedPersistence.runFencedImportItemRpcWithReplay(
  async () => {
    replayAttempts += 1;
    return replayAttempts === 1
      ? { data: null, error: { safe: true } }
      : { data: "APPLIED", error: null };
  },
);
assert(
  replayAttempts === 2 && replayed.data === "APPLIED",
  "a fenced atomic item RPC may replay once after an ambiguous error",
);

let permanentAttempts = 0;
const permanent = await fencedPersistence.runFencedImportItemRpcWithReplay(
  async () => {
    permanentAttempts += 1;
    return { data: null, error: { safe: true } };
  },
);
assert(
  permanentAttempts === 2 && permanent.error?.safe === true,
  "a permanent fenced item RPC error must remain failed after two attempts",
);
const permanentTyped = fencedPersistence.fencedImportPersistenceError({
  code: "23505",
  message: privateSentinel,
});
const permanentWrapped = new contract.AIPdfPostPersistenceError(
  "draft_persistence",
  permanentTyped,
);
const permanentDiagnostic = contract.getAIPdfPostPersistenceFailureDiagnostic({
  attemptNumber: 2,
  error: permanentWrapped,
});
assert(
  permanentDiagnostic?.reason === "post_persistence_constraint" &&
    permanentDiagnostic.retryable === false &&
    permanentDiagnostic.validationCategory === "constraint" &&
    permanentDiagnostic.sqlStateClass === "23" &&
    /^[a-f0-9]{64}$/.test(permanentDiagnostic.evidenceFingerprint),
  "constraint failures must remain specific, bounded, and non-retryable",
);
assert(
  !JSON.stringify(permanentDiagnostic).includes(privateSentinel),
  "safe persistence diagnostics must not contain raw failure content",
);

const transientTyped = fencedPersistence.fencedImportPersistenceError({
  code: "40001",
  message: privateSentinel,
});
const transientDiagnostic = contract.getAIPdfPostPersistenceFailureDiagnostic({
  attemptNumber: 1,
  error: new contract.AIPdfPostPersistenceError(
    "draft_persistence",
    transientTyped,
  ),
});
assert(
  transientDiagnostic?.reason === "post_persistence_transient" &&
    transientDiagnostic.retryable === true &&
    transientDiagnostic.safeErrorCode ===
      "ai_pdf_post_persistence_transient" &&
    transientDiagnostic.sqlStateClass === "40",
  "transaction rollback failures must enter bounded checkpoint replay",
);

const syntheticFencedJob = {
  execution_fence_token: "synthetic-fence",
  id: "synthetic-job",
  lease_owner: "synthetic-lease",
};
let checkpointAttempts = 0;
const checkpointOutcome = await checkpoint.checkpointAIProviderJobProviderResult({
  job: syntheticFencedJob,
  outputContractVersion: 1,
  payload: { contractVersion: 1 },
  payloadSha256: "a".repeat(64),
  supabase: {
    async rpc() {
      checkpointAttempts += 1;
      return checkpointAttempts === 1
        ? { data: null, error: { code: "08006", message: privateSentinel } }
        : { data: "NOOP_ALREADY_CHECKPOINTED", error: null };
    },
  },
});
assert(
  checkpointAttempts === 2 &&
    checkpointOutcome === "NOOP_ALREADY_CHECKPOINTED",
  "a transient Provider-result checkpoint failure must replay exactly once without another inference",
);

let permanentCheckpointAttempts = 0;
let permanentCheckpointError = null;
try {
  await checkpoint.checkpointAIProviderJobProviderResult({
    job: syntheticFencedJob,
    outputContractVersion: 1,
    payload: { contractVersion: 1 },
    payloadSha256: "b".repeat(64),
    supabase: {
      async rpc() {
        permanentCheckpointAttempts += 1;
        return {
          data: null,
          error: { code: "23505", message: privateSentinel },
        };
      },
    },
  });
} catch (error) {
  permanentCheckpointError = error;
}
const permanentCheckpointDiagnostic =
  duplicateCheckpoint.getAIProviderJobCheckpointFailureDiagnostic(
    permanentCheckpointError,
  );
assert(
  permanentCheckpointAttempts === 1 &&
    permanentCheckpointDiagnostic?.operation ===
      "checkpoint_provider_result" &&
    permanentCheckpointDiagnostic?.reason === "checkpoint_constraint" &&
    permanentCheckpointDiagnostic.retryable === false &&
    permanentCheckpointDiagnostic.sqlStateClass === "23",
  "permanent checkpoint constraints must fail closed with bounded cross-bundle diagnostics",
);
assert(
  !JSON.stringify(permanentCheckpointError).includes(privateSentinel),
  "checkpoint diagnostics must not serialize raw database failure content",
);

let oversizedCheckpointRpcCalls = 0;
let oversizedCheckpointError = null;
try {
  await checkpoint.checkpointAIProviderJobStage({
    job: syntheticFencedJob,
    metadata: { oversized: "x".repeat(4097) },
    stage: "drafts_persisted",
    supabase: {
      async rpc() {
        oversizedCheckpointRpcCalls += 1;
        return { data: "APPLIED", error: null };
      },
    },
  });
} catch (error) {
  oversizedCheckpointError = error;
}
const oversizedCheckpointDiagnostic =
  checkpoint.getAIProviderJobCheckpointFailureDiagnostic(
    oversizedCheckpointError,
  );
assert(
  oversizedCheckpointRpcCalls === 0 &&
    oversizedCheckpointDiagnostic?.operation === "checkpoint_stage" &&
    oversizedCheckpointDiagnostic?.reason === "checkpoint_request" &&
    oversizedCheckpointDiagnostic.sqlStateClass === "22",
  "oversized checkpoint metadata must fail closed before the hosted RPC",
);

let thrownAttempts = 0;
const recoveredThrown = await fencedPersistence.runFencedImportItemRpcWithReplay(
  async () => {
    thrownAttempts += 1;
    if (thrownAttempts === 1) throw new Error(privateSentinel);
    return { data: "NOOP_ALREADY_PERSISTED", error: null };
  },
);
assert(
  thrownAttempts === 2 &&
    recoveredThrown.data === "NOOP_ALREADY_PERSISTED",
  "a lost atomic RPC response may replay through deterministic lineage",
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
const aiPdfService = await readFile(
  resolve(root, "src/lib/ai-pdf-import/service.ts"),
  "utf8",
);
const harness = await readFile(
  resolve(root, "scripts/pdf50-end-to-end-live-e2e.mjs"),
  "utf8",
);
assert(
  worker.includes("getAIPdfPostPersistenceFailureStage") &&
    worker.includes("getAIPdfPostPersistenceFailureDiagnostic") &&
    worker.includes("postPersistenceFailureReason") &&
    worker.includes("postPersistenceEvidenceFingerprint") &&
    worker.includes("postPersistenceDiagnostic?.safeErrorCode") &&
    worker.includes("getAIProviderJobCheckpointFailureDiagnostic") &&
    worker.includes("checkpointFailureOperation") &&
    worker.includes("checkpointDiagnostic?.safeErrorCode") &&
    checkpointSource.includes("maxAttempts: 2") &&
    source.includes("ai_pdf_post_persistence_transient"),
  "the durable worker must persist bounded diagnostics and retry transient persistence/checkpoint failures",
);
function hasChunkPersistenceGuard(value) {
  const catchIndex = value.indexOf("} catch (error) {", value.indexOf("for (const chunk"));
  const guardIndex = value.indexOf(
    "if (isAIPdfPostPersistenceError(error)) throw error;",
    catchIndex,
  );
  const providerClassificationIndex = value.indexOf(
    "const providerError = safeAIProviderErrorState",
    catchIndex,
  );
  return (
    catchIndex >= 0 &&
    guardIndex > catchIndex &&
    providerClassificationIndex > guardIndex
  );
}
assert(
  hasChunkPersistenceGuard(aiPdfService),
  "sequential chunk handling must rethrow persistence failures before provider classification",
);
assert(
  !hasChunkPersistenceGuard(
    aiPdfService.replace(
      "if (isAIPdfPostPersistenceError(error)) throw error;",
      "",
    ),
  ),
  "the persistence-identity regression mutation must be detected",
);
function durableLineageSkipsGlobalQuestionCodeScan(value) {
  return value.includes(
    "const existingQuestionCodes = persistenceLineageKey\n    ? new Set<string>()\n    : await loadExistingQuestionCodeKeys(supabase);",
  );
}
assert(
  durableLineageSkipsGlobalQuestionCodeScan(aiPdfService),
  "durable deterministic imports must not depend on a global question-code read after Provider checkpointing",
);
assert(
  !durableLineageSkipsGlobalQuestionCodeScan(
    aiPdfService.replace(
      "const existingQuestionCodes = persistenceLineageKey",
      "const existingQuestionCodes = undefined && persistenceLineageKey",
    ),
  ),
  "the redundant post-Provider global-read regression mutation must be detected",
);
function draftsPersistedMetadataIsBounded(value) {
  const blocks = Array.from(
    value.matchAll(
      /onCheckpointStage\?\.\("drafts_persisted", \{([\s\S]*?)\n\s*\}\);/g,
    ),
  );
  return (
    blocks.length === 2 &&
    blocks.every((match) => !match[1].includes("qualityObservatory"))
  );
}
assert(
  draftsPersistedMetadataIsBounded(aiPdfService),
  "draft-persistence stage metadata must not duplicate the full quality observatory into the 4096-byte checkpoint",
);
assert(
  !draftsPersistedMetadataIsBounded(
    aiPdfService.replace(
      "createdDraftCount: importSummary.createdCount,",
      "createdDraftCount: importSummary.createdCount,\n    qualityObservatory: input.qualityObserver?.snapshot(),",
    ),
  ),
  "the oversized checkpoint-metadata regression mutation must be detected",
);
assert(
  harness.includes("safePostPersistenceFailureStage") &&
    harness.includes("POST_PERSISTENCE_FAILURE_STAGE=") &&
    harness.includes("BATCH_FINALIZATION_FAILURE_REASON=") &&
    harness.includes("BATCH_FINALIZATION_SUMMARY_BYTES="),
  "the live proof must emit only the sanitized failure stage",
);

console.log("PASS PDF50 bounded post-persistence diagnostics smoke");
