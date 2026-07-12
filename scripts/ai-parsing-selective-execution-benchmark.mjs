import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function loadSelectiveExecution() {
  const source = await readFile(
    resolve(root, "src/lib/ai-pdf-import/selective-execution.ts"),
    "utf8",
  );
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

const selective = await loadSelectiveExecution();
const pages = Array.from({ length: 24 }, (_, index) => page(index + 1));
pages[2] = page(3, {
  extractedTextLength: 280,
  pageClass: "question_page",
  questionNumberHints: ["1"],
});
pages[10] = page(11, {
  extractedTextLength: 300,
  pageClass: "question_page",
  questionNumberHints: ["2"],
});
pages[18] = page(19, {
  answerMarkerHints: ["Answer key"],
  extractedTextLength: 180,
  pageClass: "answer_page",
});

const plan = selective.buildAISelectiveExecutionPlan({
  extractionBatchPlan: {
    batches: [
      {
        packetRefs: [{ packetId: "sparse-question-one" }, { packetId: "sparse-question-two" }],
        status: "planned",
      },
    ],
    sourceKind: "pdf",
    status: "completed",
    warnings: [],
  },
  generatedAt: "2026-07-12T00:00:00.000Z",
  packetPlan: {
    packets: [
      { kind: "pdf_question_candidate", packetId: "sparse-question-one", pageNumbers: [3], reviewHints: { reasonCodes: ["question_marker_detected"] } },
      { kind: "pdf_question_candidate", packetId: "sparse-question-two", pageNumbers: [11], reviewHints: { reasonCodes: ["question_marker_detected"] } },
    ],
    sourceKind: "pdf",
    status: "completed",
    warnings: [],
  },
  preanalysis: {
    documentHints: {
      hasAnswerMarkers: true,
      hasChoiceMarkers: false,
      hasQuestionMarkers: true,
      likelyScannedPdf: false,
    },
    generatedAt: "2026-07-12T00:00:00.000Z",
    pageCount: 24,
    pages,
    sourceHash: "non-sensitive-sparse-24-page-fixture",
    sourceKind: "pdf",
    status: "completed",
    textLayerAvailable: true,
    version: "preanalysis_v1",
    warnings: [],
  },
  providerStrategy: "gemini_native_pdf",
});

assert(plan.totalPageCount === 24, "benchmark fixture must model a meaningful 24-page source");
assert(
  plan.eligibility === "eligible" &&
    plan.sentPageCount < plan.totalPageCount &&
    plan.estimatedPageReductionRatio >= 0.25 &&
    plan.originalPageMap.every((item) => item.localPage >= 1 && item.originalPage >= 1),
  "sparse fixture must retain original-page mapping and meet the conservative estimated reduction threshold",
);
assert(
  !/token|cost|provider.?response|base64|secret/i.test(JSON.stringify(plan)),
  "the local benchmark plan must not claim provider billing or retain private provider/source payloads",
);

console.log(
  `PASS AI Parsing selective benchmark: 24 source pages, ${plan.sentPageCount} planned pages, ${(plan.estimatedPageReductionRatio * 100).toFixed(1)}% estimated page reduction (provider token/cost usage unavailable by design)`,
);
