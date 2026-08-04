import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = await readFile(
  resolve(root, "src/lib/ai-pdf-import/terminal-summary.ts"),
  "utf8",
);
const serviceSource = await readFile(
  resolve(root, "src/lib/ai-pdf-import/service.ts"),
  "utf8",
);
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const {
  AI_PDF_FENCED_SUMMARY_MAX_BYTES,
  AI_PDF_TERMINAL_TRANSIENT_PLAN_KEYS,
  compactAIPdfTerminalSummary,
} = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
);

const rawSentinel = "RAW_SOURCE_CONTENT_MUST_NOT_SURVIVE_TERMINAL_COMPACTION";
const largePayload = Array.from({ length: 80 }, (_, index) => ({
  index,
  text: `${rawSentinel}-${index}-${"x".repeat(180)}`,
}));
const transientPlans = Object.fromEntries(
  AI_PDF_TERMINAL_TRANSIENT_PLAN_KEYS.map((key) => [
    key,
    {
      payload: largePayload,
      status: "completed",
      version: `${key.replace(/[A-Z]/g, (value) => `_${value.toLowerCase()}`)}_v1`,
      warnings: ["bounded_warning"],
    },
  ]),
);
const preserved = {
  chunking: { chunks: [{ id: "chunk-1", status: "completed" }] },
  coverageRecoveryExecution: { status: "queued" },
  coverageRecoveryPlan: {
    mode: "planning_only",
    requestDrafts: [{ pageNumbers: [1], requestId: "request-1" }],
    sourceAuditPlanPresent: true,
    version: "coverage_recovery_plan_v1",
  },
  manualSegmentation: { status: "confirmed" },
  questionBoundaryGuardPlan: {
    duplicateGroups: [],
    status: "complete",
    version: "question_boundary_guard_v1",
  },
  selectiveExecutionPlan: {
    eligibility: "not_beneficial",
    originalPageMap: [{ localPage: 1, originalPage: 1 }],
    sentPageCount: 1,
    totalPageCount: 1,
    version: "ai_pdf_selective_execution_v1",
  },
  sourceAssetId: "synthetic-source",
  sourceObjectPath: "synthetic/object",
};
const summary = {
  aiPdfImport: {
    ...preserved,
    ...transientPlans,
  },
  createdCount: 1,
  createdQuestions: [{ id: "draft-1", questionCode: "Q-1" }],
};

assert.ok(
  Buffer.byteLength(JSON.stringify(summary), "utf8") >
    AI_PDF_FENCED_SUMMARY_MAX_BYTES,
  "fixture must reproduce an oversized fenced final summary",
);

const compacted = compactAIPdfTerminalSummary(summary);
const compactedText = JSON.stringify(compacted);
const compactedAi = compacted.aiPdfImport;
const archive = compactedAi.executionPlanArchive;

assert.ok(
  Buffer.byteLength(compactedText, "utf8") < AI_PDF_FENCED_SUMMARY_MAX_BYTES,
  "terminal summary must fit the immutable fenced RPC limit",
);
assert.equal(
  compactedText.includes(rawSentinel),
  false,
  "execution-only source content must not survive terminal compaction",
);
for (const key of AI_PDF_TERMINAL_TRANSIENT_PLAN_KEYS) {
  assert.equal(key in compactedAi, false, `${key} must be terminally compacted`);
  assert.match(archive.plans[key].contentHash, /^[a-f0-9]{64}$/);
  assert.equal(archive.plans[key].warningCount, 1);
}
assert.equal(
  archive.archivedPlanCount,
  AI_PDF_TERMINAL_TRANSIENT_PLAN_KEYS.length,
);
assert.deepEqual(
  Object.fromEntries(Object.keys(preserved).map((key) => [key, compactedAi[key]])),
  preserved,
  "review, recovery, source, chunk, and selective-execution contracts must remain intact",
);
assert.deepEqual(compacted.createdQuestions, summary.createdQuestions);
assert.deepEqual(
  compactAIPdfTerminalSummary(compacted),
  compacted,
  "terminal compaction must be idempotent",
);

const reviewCalls = Array.from(
  serviceSource.matchAll(
    /operation: \(\) => generateAndStorePostPersistenceReviewPlans\(\{ input \}\)/g,
  ),
).map((match) => match.index);
const compactCalls = Array.from(
  serviceSource.matchAll(/const finalSummary = compactAIPdfTerminalSummary\(/g),
).map((match) => match.index);
assert.equal(reviewCalls.length, 2, "both extraction paths must derive review evidence");
assert.equal(compactCalls.length, 2, "both extraction paths must compact terminal summaries");
assert.ok(
  reviewCalls.every((position, index) => position < compactCalls[index]),
  "review and recovery evidence must be derived before transient plans are compacted",
);
assert.equal(
  serviceSource.includes(
    "summaryBytes > AI_PDF_FENCED_SUMMARY_MAX_BYTES",
  ),
  true,
  "the trusted finalizer must retain its fail-closed source-size guard",
);

console.log("PASS PDF50 terminal summary compaction smoke");
