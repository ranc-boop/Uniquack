import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function read(relativePath) {
  return readFile(resolve(root, relativePath), "utf8");
}

async function loadSelectiveExecution() {
  const source = await read("src/lib/ai-pdf-import/selective-execution.ts");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: "selective-execution.ts",
  }).outputText;
  const url = `data:text/javascript;base64,${Buffer.from(output).toString("base64")}`;

  return import(url);
}

function page(pageNumber, overrides = {}) {
  return {
    answerMarkerHints: [],
    assetHints: [],
    boundaryRisks: [],
    choiceMarkerHints: [],
    extractedTextLength: 0,
    extractedTextPreview: null,
    pageClass: "blank_page",
    pageNumber,
    questionNumberHints: [],
    textLayerAvailable: true,
    ...overrides,
  };
}

function preanalysis(overrides = {}) {
  return {
    documentHints: {
      hasAnswerMarkers: true,
      hasChoiceMarkers: false,
      hasQuestionMarkers: true,
      likelyScannedPdf: false,
    },
    generatedAt: "2026-07-11T00:00:00.000Z",
    pageCount: 12,
    pages: [
      page(1, { pageClass: "cover_page" }),
      page(2, {
        extractedTextLength: 240,
        pageClass: "question_page",
        questionNumberHints: ["1"],
      }),
      page(3, {
        extractedTextLength: 260,
        pageClass: "question_page",
        questionNumberHints: ["2"],
      }),
      page(4),
      page(5),
      page(6),
      page(7),
      page(8, {
        answerMarkerHints: ["Solution"],
        extractedTextLength: 160,
        pageClass: "answer_page",
      }),
      page(9),
      page(10),
      page(11),
      page(12),
    ],
    sourceHash: "source-hash",
    sourceKind: "pdf",
    status: "completed",
    textLayerAvailable: true,
    version: "preanalysis_v1",
    warnings: [],
    ...overrides,
  };
}

function packet(packetId, pageNumbers, kind = "pdf_question_candidate") {
  return {
    kind,
    packetId,
    pageNumbers,
    reviewHints: {
      reasonCodes: ["question_marker_detected"],
    },
  };
}

function packetPlan(overrides = {}) {
  return {
    packets: [packet("packet-one", [2]), packet("packet-two", [3])],
    sourceKind: "pdf",
    status: "completed",
    warnings: [],
    ...overrides,
  };
}

function extractionBatchPlan(overrides = {}) {
  return {
    batches: [
      {
        packetRefs: [{ packetId: "packet-one" }, { packetId: "packet-two" }],
        status: "planned",
      },
    ],
    sourceKind: "pdf",
    status: "completed",
    warnings: [],
    ...overrides,
  };
}

const selective = await loadSelectiveExecution();
const source = await read("src/lib/ai-pdf-import/selective-execution.ts");
const service = await read("src/lib/ai-pdf-import/service.ts");
const display = await read("src/lib/ai-pdf-import/display.ts");
const preanalysisCore = await read("src/lib/ai-pdf-import/preanalysis-core.ts");
const smokeAll = await read("scripts/smoke-all.mjs");

assert(
  source.includes('"ai_pdf_selective_execution_v1"') &&
    source.includes("buildAISelectiveExecutionPlan") &&
    source.includes("mergeAISelectiveExecutionPlanIntoSummary"),
  "selective execution must expose a versioned plan and summary merge helper",
);
assert(
  !/base64|signed.?url|raw.?prompt|provider.?response|secret/i.test(source),
  "selective execution summary contract must not store private input or provider payload fields",
);
assert(
  /function uniqueMatches\(text: string, pattern: RegExp, limit = 12\) \{\s*pattern\.lastIndex = 0;/m.test(
    preanalysisCore,
  ),
  "per-page preanalysis matching must reset global regex state before reading the next source page",
);

const plan = selective.buildAISelectiveExecutionPlan({
  extractionBatchPlan: extractionBatchPlan(),
  generatedAt: "2026-07-11T00:00:00.000Z",
  packetPlan: packetPlan(),
  preanalysis: preanalysis(),
  providerStrategy: "gemini_native_pdf",
});

assert(
  plan.eligibility === "eligible" &&
    plan.mode === "selective_with_context" &&
    plan.selectedPageCount === 3 &&
    plan.sentPageCount === 7 &&
    plan.estimatedPageReductionRatio > 0.4,
  "a sparse, well-classified native PDF should use merged selective windows with a meaningful page reduction",
);
assert(
  JSON.stringify(plan.originalPageMap) ===
    JSON.stringify([
      { localPage: 1, originalPage: 1 },
      { localPage: 2, originalPage: 2 },
      { localPage: 3, originalPage: 3 },
      { localPage: 4, originalPage: 4 },
      { localPage: 5, originalPage: 7 },
      { localPage: 6, originalPage: 8 },
      { localPage: 7, originalPage: 9 },
    ]),
  "subset local pages must retain a complete ordered original-page map",
);

const chunk = selective.selectiveExecutionPlanToSegmentChunk(plan);
assert(
  chunk?.sourcePages.join(",") === "1,2,3,4,7,8,9" &&
    chunk.pageMapping[5]?.sourcePage === 8,
  "selective subset materialization must preserve original reading order and page mapping",
);

const materialized = selective.markAISelectiveExecutionMaterialized(plan);
const withUsage = selective.recordAISelectiveExecutionUsage({
  plan: materialized,
  usage: {
    cachedInputTokens: 4,
    inputTokens: 80,
    outputTokens: 20,
    totalTokens: 100,
  },
});
assert(
  withUsage.windows.every(
    (window) =>
      window.executionStatus === "provider_completed" &&
      window.providerUsageSummary?.totalTokens === 100,
  ),
  "safe provider usage aggregates must be attachable without provider payloads",
);

const highBoundaryRisk = selective.buildAISelectiveExecutionPlan({
  extractionBatchPlan: extractionBatchPlan(),
  packetPlan: packetPlan(),
  preanalysis: preanalysis({
    pages: preanalysis().pages.map((item) =>
      item.pageNumber === 3
        ? { ...item, boundaryRisks: [{ confidence: 0.9, type: "may_end_mid_question" }] }
        : item,
    ),
  }),
  providerStrategy: "gemini_native_pdf",
});
assert(
  highBoundaryRisk.eligibility === "boundary_risk" &&
    highBoundaryRisk.mode === "full_document_fallback",
  "high-confidence cross-page risks must use the full document",
);

const unsupportedProvider = selective.buildAISelectiveExecutionPlan({
  extractionBatchPlan: extractionBatchPlan(),
  packetPlan: packetPlan(),
  preanalysis: preanalysis(),
  providerStrategy: "page_images",
});
assert(
  unsupportedProvider.eligibility === "unsupported_provider" &&
    unsupportedProvider.sentPageCount === 12,
  "unimplemented selective provider inputs must fall back rather than pretend to save tokens",
);

const shortDense = selective.buildAISelectiveExecutionPlan({
  extractionBatchPlan: extractionBatchPlan(),
  packetPlan: packetPlan(),
  preanalysis: preanalysis({ pageCount: 4, pages: preanalysis().pages.slice(0, 4) }),
  providerStrategy: "gemini_native_pdf",
});
assert(
  shortDense.eligibility === "dense_document",
  "short documents must retain their full document context",
);

const unknownContent = selective.buildAISelectiveExecutionPlan({
  extractionBatchPlan: extractionBatchPlan(),
  packetPlan: packetPlan(),
  preanalysis: preanalysis({
    pages: preanalysis().pages.map((item) =>
      item.pageNumber === 5
        ? { ...item, extractedTextLength: 120, pageClass: "unknown" }
        : item,
    ),
  }),
  providerStrategy: "gemini_native_pdf",
});
assert(
  unknownContent.eligibility === "insufficient_confidence",
  "unknown content pages must prevent a selective execution omission",
);

const merged = selective.mergeAISelectiveExecutionPlanIntoSummary(
  {
    extractionBatchPlan: { version: "extraction_batch_plan_v1" },
    packetPlan: { version: "packet_plan_v1" },
    preanalysis: { version: "preanalysis_v1" },
    targetBankId: "bank-one",
  },
  plan,
);
assert(
  merged.targetBankId === "bank-one" &&
    merged.packetPlan &&
    merged.extractionBatchPlan &&
    merged.preanalysis &&
    merged.selectiveExecutionPlan === plan,
  "selective planning must preserve existing packet, batch, preanalysis, and bank lineage fields",
);

assert(
  service.includes("buildAISelectiveExecutionPlan") &&
    service.includes("buildMaskedPdfChunk") &&
    service.includes("selectiveExecutionPlanToSegmentChunk") &&
    service.includes("recordAISelectiveExecutionUsage") &&
    service.includes("targetBankId: input.targetBankId"),
  "AI PDF service must materialize only eligible selections while preserving bank-scoped draft import boundaries",
);
assert(
  display.includes('preparing_selective_pdf_input: "Preparing selected source pages"'),
  "teacher-facing status copy must describe selected source preparation without provider internals",
);
assert(
  smokeAll.includes("ai-parsing-selective-packet-execution-smoke.mjs"),
  "aggregate smoke must include selective packet execution coverage",
);

console.log("PASS AI Parsing selective packet execution smoke");
