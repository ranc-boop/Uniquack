import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const root = resolve(__dirname, "..");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function read(relativePath) {
  return readFile(resolve(root, relativePath), "utf8");
}

async function loadGuard() {
  const source = await read("src/lib/ai-pdf-import/question-boundary-guard.ts");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: "question-boundary-guard.ts",
  }).outputText;
  const url = `data:text/javascript;base64,${Buffer.from(output).toString("base64")}`;

  return import(url);
}

function candidate(overrides = {}) {
  return {
    contentSource: "Solve 2x + 3 = 7.",
    id: "question-a",
    pageRefs: [3],
    questionCode: "AI-QUESTION-A",
    recoveryProvenance: "original",
    solutionSource: "Subtract 3, then divide by 2.",
    sourceAssetId: "asset-one",
    visibleQuestionNumber: "1",
    ...overrides,
  };
}

function findings(plan) {
  return [
    ...plan.duplicateGroups,
    ...plan.boundaryGroups,
    ...plan.associationRisks,
  ];
}

const guard = await loadGuard();
const source = await read("src/lib/ai-pdf-import/question-boundary-guard.ts");
const service = await read("src/lib/ai-pdf-import/service.ts");
const dashboard = await read(
  "src/components/ai-pdf-dashboard/ai-pdf-control-dashboard.tsx",
);
const importUi = await read("src/app/teacher/banks/bank-import-ui.tsx");
const reviewPage = await read("src/app/teacher/banks/[bankId]/review/page.tsx");
const questionBanks = await read("src/lib/question-banks.ts");
const smokeAll = await read("scripts/smoke-all.mjs");

assert(
  source.includes('"question_boundary_guard_v1"') &&
    source.includes("buildQuestionBoundaryGuardPlan") &&
    source.includes("mergeQuestionBoundaryGuardPlanIntoSummary"),
  "guard module must expose the versioned plan builder and summary merge helper",
);
assert(
  !source.includes("callAIPdfExtractionProvider") &&
    !source.includes(".delete(") &&
    !source.includes(".insert(") &&
    !source.includes("published") &&
    !source.includes("taxonomy"),
  "guard module must remain provider-free and mutation-free",
);

const exactDuplicate = guard.buildQuestionBoundaryGuardPlan({
  generatedAt: "2026-07-10T00:00:00.000Z",
  questions: [
    candidate(),
    candidate({ id: "question-b", questionCode: "AI-QUESTION-B" }),
  ],
});
assert(
  exactDuplicate.likelyDuplicateGroupCount === 1 &&
    exactDuplicate.highRiskCount >= 1 &&
    exactDuplicate.duplicateGroups[0]?.issueKind === "likely_duplicate",
  "exact same-batch/page/number content must be a high-risk duplicate group",
);

const recoveryDuplicate = guard.buildQuestionBoundaryGuardPlan({
  questions: [
    candidate(),
    candidate({
      id: "question-recovery",
      questionCode: "AI-RECOVERY",
      recoveryProvenance: "recovery",
    }),
  ],
});
assert(
  recoveryDuplicate.duplicateGroups[0]?.issueKind === "recovery_duplicate",
  "original and recovery candidates with matching source evidence must be flagged together",
);

const crossPageFragment = guard.buildQuestionBoundaryGuardPlan({
  questions: [
    candidate({
      contentSource: "Use the graph below to answer:",
      id: "question-stem",
      pageRefs: [3],
      questionCode: "AI-STEM",
      visibleQuestionNumber: "2",
    }),
    candidate({
      contentSource: "",
      id: "question-choices",
      optionsCount: 4,
      pageRefs: [4],
      questionCode: "AI-CHOICES",
      solutionSource: "",
      visibleQuestionNumber: "2",
    }),
  ],
});
assert(
  findings(crossPageFragment).some((item) => item.issueKind === "cross_page_fragment") &&
    findings(crossPageFragment).some((item) => item.issueKind === "choices_only_fragment"),
  "adjacent stem/choices fragments must receive cross-page and choices-only review warnings",
);

const solutionOnly = guard.buildQuestionBoundaryGuardPlan({
  questions: [
    candidate({
      contentSource: "",
      id: "question-solution-only",
      questionCode: "AI-SOLUTION-ONLY",
      solutionSource: "The solution is x = 2.",
      visibleQuestionNumber: "3",
    }),
  ],
});
assert(
  findings(solutionOnly).some((item) => item.issueKind === "solution_only_fragment"),
  "solution-only candidates must be flagged for answer alignment",
);

const numberConflict = guard.buildQuestionBoundaryGuardPlan({
  questions: [
    candidate({ contentSource: "Find the derivative of x squared.", id: "question-c", questionCode: "AI-C", visibleQuestionNumber: "4" }),
    candidate({ contentSource: "Explain why the French Revolution began.", id: "question-d", questionCode: "AI-D", pageRefs: [4], visibleQuestionNumber: "4" }),
  ],
});
assert(
  numberConflict.duplicateGroups.length === 0 &&
    findings(numberConflict).some((item) => item.issueKind === "question_number_conflict"),
  "same visible number with different content must be a numbering conflict, not an exact duplicate",
);

const parameterVariants = guard.buildQuestionBoundaryGuardPlan({
  questions: [
    candidate({ contentSource: "Solve 2x + 3 = 7.", id: "question-e", questionCode: "AI-E", visibleQuestionNumber: "5" }),
    candidate({ contentSource: "Solve 11x + 3 = 7.", id: "question-f", questionCode: "AI-F", pageRefs: [5], visibleQuestionNumber: "6" }),
  ],
});
assert(
  parameterVariants.duplicateGroups.length === 0,
  "parameter variants must not be promoted to exact duplicates",
);

const unrelatedSources = guard.buildQuestionBoundaryGuardPlan({
  questions: [
    candidate({ id: "question-g", questionCode: "AI-G", sourceAssetId: "asset-one" }),
    candidate({ id: "question-h", questionCode: "AI-H", sourceAssetId: "asset-two" }),
  ],
});
assert(
  unrelatedSources.duplicateGroups.length === 0,
  "same text from unrelated source assets must not be grouped",
);

const visualRisk = guard.buildQuestionBoundaryGuardPlan({
  questions: [
    candidate({
      contentSource: "Use the graph shown above to answer the question.",
      id: "question-visual",
      questionCode: "AI-VISUAL",
      visibleQuestionNumber: "7",
    }),
  ],
});
assert(
  visualRisk.associationRiskCount === 1 &&
    visualRisk.associationRisks[0]?.issueKind === "visual_association",
  "a visual reference without supporting asset evidence must be flagged",
);

const clean = guard.buildQuestionBoundaryGuardPlan({
  questions: [
    candidate({
      contentSource: "Evaluate the integral of 3x squared from 0 to 2.",
      id: "question-clean",
      questionCode: "AI-CLEAN",
      solutionSource: "The result is 8.",
      visibleQuestionNumber: "8",
    }),
  ],
});
assert(
  clean.status === "complete" && clean.highRiskCount === 0,
  "a complete extraction must not receive a false high-risk finding",
);

const merged = guard.mergeQuestionBoundaryGuardPlanIntoSummary(
  {
    adaptiveRereadPlan: { version: "adaptive_reread_plan_v1" },
    chunking: { chunks: [] },
    coverageRecoveryMergePlan: { version: "coverage_recovery_merge_plan_v1" },
    packetPlan: { version: "ai_packet_plan_v1" },
    preanalysis: { pages: [] },
    targetBankId: "bank-one",
  },
  clean,
);
assert(
  merged.preanalysis &&
    merged.packetPlan &&
    merged.chunking &&
    merged.adaptiveRereadPlan &&
    merged.coverageRecoveryMergePlan &&
    merged.targetBankId === "bank-one" &&
    merged.questionBoundaryGuardPlan === clean,
  "summary merge must preserve existing AI Parsing, recovery, chunking, and bank lineage fields",
);

const failed = guard.failedQuestionBoundaryGuardPlan();
assert(
  failed.status === "failed" &&
    failed.warnings.includes("question_boundary_guard_import_continued"),
  "guard failure must remain advisory and preserve the import path",
);

assert(
  service.includes("generateAndStoreQuestionBoundaryGuardPlan") &&
    service.includes("loadCurrentAIPdfSummary(input)") &&
    service.includes("mergeQuestionBoundaryGuardPlanIntoSummary") &&
    service.includes("all drafts remain review-only") &&
    service.includes("adaptiveRereadPlan") &&
    service.includes("coverageRecoveryMergePlan") &&
    service.includes('from("questions")') &&
    service.includes('from("question_assets")') &&
    /await generateAndStoreExtractionCoverageAuditPlan\(\{ input \}\);\r?\n\s+await generateAndStoreQuestionBoundaryGuardPlan\(\{ input \}\);/.test(
      service,
    ),
  "AI PDF service must load the latest summary, reuse safe reread/recovery evidence, analyze created drafts, and persist the advisory guard after coverage planning",
);
assert(
  dashboard.includes("QuestionBoundaryGuardCard") &&
    importUi.includes("QuestionBoundaryGuardCard") &&
    reviewPage.includes("boundaryFindings") &&
    reviewPage.includes("Possible duplicate") &&
    questionBanks.includes("questionBoundaryPlanByBatchId"),
  "admin status, teacher import status, and bank Review Draft cards must surface structural review guidance",
);
assert(
  smokeAll.includes("ai-parsing-boundary-duplicate-guard-smoke.mjs"),
  "aggregate smoke must include the boundary and duplicate guard coverage",
);

console.log("PASS AI Parsing boundary and duplicate guard smoke");
