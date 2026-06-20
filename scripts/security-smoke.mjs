import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const hasReactServerCondition = process.execArgv.some(
  (arg) => arg === "--conditions=react-server" || arg === "-Creact-server",
);

if (!process.env.O2I_SECURITY_SMOKE_REEXECED && !hasReactServerCondition) {
  const scriptPath = fileURLToPath(import.meta.url);
  const child = spawnSync(
    process.execPath,
    [
      ...process.execArgv,
      "--conditions=react-server",
      scriptPath,
      ...process.argv.slice(2),
    ],
    {
      env: {
        ...process.env,
        O2I_SECURITY_SMOKE_REEXECED: "1",
      },
      stdio: "inherit",
    },
  );

  process.exit(child.status ?? 1);
}

const { sanitizeContentHtml, toDangerousHtml } = await import(
  "../src/lib/sanitize/html.ts"
);
const { aiPdfExtractionSchema } = await import(
  "../src/lib/ai-pdf-import/schema.ts"
);
const {
  createAIPdfChunkingSummary,
  ensureAIPdfChunkingSummary,
  mergeAIPdfImportChunkingSummary,
  normalizeAIPdfChunkingSummary,
  patchAIPdfChunkingSummary,
  planAIPdfPageChunks,
} = await import("../src/lib/ai-pdf-import/chunking.ts");
const {
  buildManualSegmentationPlan,
  chunkingSummaryFromSegmentationPlan,
  normalizeManualSegmentationPlan,
  suggestedBoundaryPages,
} = await import("../src/lib/ai-pdf-import/segmentation.ts");
const {
  analyzePdfPageTexts,
  generateImagePreanalysisFromMetadata,
} = await import("../src/lib/ai-pdf-import/preanalysis-core.ts");
const {
  buildAIPacketPlanFromPreanalysis,
  mergeAIPacketPlanIntoSummary,
} = await import("../src/lib/ai-pdf-import/packets.ts");
const {
  buildDraftReadyQuestionFromExtraction,
  buildSchemaFirstExtractionPrompt,
  normalizeAIPacketExtractionResult,
} = await import("../src/lib/ai-pdf-import/extraction-schema.ts");
const {
  buildAIExtractionBatchPlanFromPacketPlan,
  mergeAIExtractionBatchPlanIntoSummary,
} = await import("../src/lib/ai-pdf-import/extraction-batches.ts");
const {
  buildAIProviderRequestPlanFromExtractionBatchPlan,
  mergeAIProviderRequestPlanIntoSummary,
} = await import("../src/lib/ai-pdf-import/provider-requests.ts");
const {
  buildAIProviderRunPlanFromProviderRequestPlan,
  buildProviderRequestRun,
  mergeAIProviderRunPlanIntoSummary,
  simulateProviderRequestDryRun,
  validateDryRunProviderOutput,
} = await import("../src/lib/ai-pdf-import/provider-runner.ts");
const {
  buildAIAdaptiveRereadPlanFromSummary,
  mergeAIAdaptiveRereadPlanIntoSummary,
} = await import("../src/lib/ai-pdf-import/adaptive-reread.ts");
const {
  buildAIAdaptiveRereadProviderRequestPlanFromAdaptiveRereadPlan,
  mergeAIAdaptiveRereadProviderRequestPlanIntoSummary,
} = await import(
  "../src/lib/ai-pdf-import/adaptive-reread-provider-requests.ts"
);
const {
  buildAIAdaptiveRereadRunPlanFromProviderRequestPlan,
  buildAdaptiveRereadRequestRun,
  mergeAIAdaptiveRereadRunPlanIntoSummary,
  simulateAdaptiveRereadDryRun,
  validateAdaptiveRereadDryRunOutput,
} = await import("../src/lib/ai-pdf-import/adaptive-reread-runner.ts");
const {
  buildAIAdaptiveRereadMergePlanFromSummary,
  buildAdaptiveRereadMergeItems,
  mergeAIAdaptiveRereadMergePlanIntoSummary,
} = await import("../src/lib/ai-pdf-import/adaptive-reread-merge.ts");
const {
  buildAITaggingV2PlanFromSummary,
  buildRuleBasedTagSuggestionsForTarget,
  findTaxonomyTagById,
  getControlledAITagTaxonomy,
  mergeAITaggingV2PlanIntoSummary,
  normalizeTagSuggestion,
  validateTagSuggestionAgainstTaxonomy,
} = await import("../src/lib/ai-pdf-import/tagging-v2.ts");
const {
  buildAITaxonomyBootstrapPlanFromSummary,
  buildStarterTaxonomyDraftPacks,
  mergeAITaxonomyBootstrapPlanIntoSummary,
  validateTaxonomyDraftTag,
} = await import("../src/lib/ai-pdf-import/taxonomy-bootstrap.ts");
const {
  buildAITaxonomyReviewPlanFromBootstrapPlan,
  buildTaxonomyPatchPreview,
  mergeAITaxonomyReviewPlanIntoSummary,
  validateTaxonomyReviewAction,
} = await import("../src/lib/ai-pdf-import/taxonomy-review.ts");
const {
  buildAITaxonomyPersistencePlanFromSummary,
  mergeAITaxonomyPersistencePlanIntoSummary,
  validateTaxonomyPersistencePlan,
} = await import("../src/lib/ai-pdf-import/taxonomy-persistence.ts");
const {
  buildAIFiveFacetTagTaxonomyPlan,
  mergeAIFiveFacetTagTaxonomyPlanIntoSummary,
} = await import("../src/lib/ai-pdf-import/five-facet-tag-taxonomy.ts");
const {
  buildAIExtractionCoverageAuditPlanFromSummary,
  mergeAIExtractionCoverageAuditPlanIntoSummary,
} = await import("../src/lib/ai-pdf-import/extraction-coverage-audit.ts");
const {
  buildAICoverageRecoveryPlanFromSummary,
  mergeAICoverageRecoveryPlanIntoSummary,
} = await import("../src/lib/ai-pdf-import/coverage-recovery.ts");
const {
  buildAICoverageRecoveryRunPlanFromSummary,
  buildCoverageRecoveryRunItem,
  mergeAICoverageRecoveryRunPlanIntoSummary,
  validateCoverageRecoveryRequestDraft,
} = await import("../src/lib/ai-pdf-import/coverage-recovery-runner.ts");
const {
  buildAICoverageRecoveryMergePlanFromSummary,
  mergeAICoverageRecoveryMergePlanIntoSummary,
} = await import("../src/lib/ai-pdf-import/coverage-recovery-merge.ts");
const {
  generateAIPdfQuestionCodeForImport,
  visibleQuestionNumberKey,
} = await import("../src/lib/ai-pdf-import/question-code.ts");
const {
  AI_PROVIDER_MODE_OPTIONS,
  aiPdfInputStrategyLabel,
  aiPdfInputStrategySummaryLabel,
  aiProviderModeSummaryLabel,
  describeAiPdfProviderInput,
  estimateAIPdfProviderCallCount,
  getAiProviderCapabilities,
  inferAiProviderMode,
  selectAiPdfInputStrategy,
  supportsAIPdfSequentialChunkExtraction,
} = await import("../src/lib/ai-providers/adapters.ts");
const { decryptSecret } = await import("../src/lib/ai-providers/encryption.ts");
const {
  generateWithGeminiNativePdf,
  testGeminiNativeTextConnection,
} = await import(
  "../src/lib/ai-providers/gemini-native.ts"
);
const { parsePossiblyMalformedJson } = await import(
  "../src/lib/ai-providers/json-repair.ts"
);

const scriptInput = '<p>Safe</p><script>alert("x")</script>';
assert.equal(sanitizeContentHtml(scriptInput), "<p>Safe</p>");

const eventInput = '<p onclick="alert(1)">Click</p><img src=x onerror=alert(1)>';
assert.equal(sanitizeContentHtml(eventInput), "<p>Click</p>");

const javascriptUrlInput = '<a href="javascript:alert(1)">bad</a><p>ok</p>';
assert.equal(sanitizeContentHtml(javascriptUrlInput), "bad<p>ok</p>");

const storageImageInput =
  '<img src="https://example.supabase.co/storage/v1/object/public/question-assets/questions/question-id/asset-id.png" alt="diagram">';
assert.equal(
  sanitizeContentHtml(storageImageInput),
  '<img src="https://example.supabase.co/storage/v1/object/public/question-assets/questions/question-id/asset-id.png" alt="diagram" />',
);

const dangerousHtml = toDangerousHtml(scriptInput);
assert.deepEqual(dangerousHtml, { __html: "<p>Safe</p>" });

console.log(
  "PASS sanitizer removes unsafe HTML and preserves Supabase Storage image URLs",
);

assert.deepEqual(
  planAIPdfPageChunks({
    chunkSizePages: 3,
    overlapPages: 1,
    pageCount: 10,
  }).map((chunk) => [chunk.pageStart, chunk.pageEnd]),
  [
    [1, 3],
    [3, 5],
    [5, 7],
    [7, 9],
    [9, 10],
  ],
);
assert.deepEqual(
  planAIPdfPageChunks({
    chunkSizePages: 3,
    overlapPages: 1,
    pageCount: 2,
  }).map((chunk) => [chunk.pageStart, chunk.pageEnd]),
  [[1, 2]],
);
assert.throws(
  () =>
    planAIPdfPageChunks({
      chunkSizePages: 3,
      overlapPages: 3,
      pageCount: 10,
    }),
  /overlapPages must be smaller/,
);
const chunkingSummary = createAIPdfChunkingSummary({
  chunkSizePages: 3,
  overlapPages: 1,
  pageCount: 10,
});
assert.equal(chunkingSummary.totalChunks, 5);
assert.deepEqual(chunkingSummary.chunks[1].overlapPages, [3]);
assert.equal(chunkingSummary.chunks.every((chunk) => chunk.status === "planned"), true);

const maskedSegmentationPlan = buildManualSegmentationPlan({
  boundaries: [
    {
      id: "boundary-1",
      sourcePage: 35,
      splitY: 0.42,
      status: "confirmed",
    },
    {
      id: "boundary-2",
      sourcePage: 69,
      splitY: 0.73,
      status: "confirmed",
    },
  ],
  confirmedAt: "2026-06-18T00:00:00.000Z",
  pageCount: 73,
  status: "confirmed",
  targetPages: 35,
});
assert.deepEqual(
  maskedSegmentationPlan.chunks.map((chunk) => [
    chunk.pageStart,
    chunk.pageEnd,
  ]),
  [
    [1, 35],
    [35, 69],
    [69, 73],
  ],
);
assert.deepEqual(maskedSegmentationPlan.chunks[0].masks, [
  { sourcePage: 35, splitY: 0.42, type: "white_below" },
]);
assert.deepEqual(maskedSegmentationPlan.chunks[1].masks, [
  { sourcePage: 35, splitY: 0.42, type: "white_above" },
  { sourcePage: 69, splitY: 0.73, type: "white_below" },
]);
assert.equal(
  normalizeManualSegmentationPlan(maskedSegmentationPlan)?.status,
  "confirmed",
);
const maskedChunking = chunkingSummaryFromSegmentationPlan(
  maskedSegmentationPlan,
);
assert.equal(maskedChunking.totalChunks, 3);
assert.equal(maskedChunking.overlapPages, 0);
assert.equal(maskedChunking.mode, "sequential");
assert.deepEqual(
  suggestedBoundaryPages({ pageCount: 73, targetPages: 35 }),
  [24, 49],
);
console.log(
  "PASS masked full-PDF segmentation produces complementary non-overlapping boundary masks",
);
const normalizedChunking = normalizeAIPdfChunkingSummary({
  enabled: true,
  mode: "foundation",
  totalChunks: 2,
  chunks: [
    {
      chunk_index: 1,
      page_start: 3,
      page_end: 5,
      status: "failed",
      warnings: ["raw warning stays counted, not used for identity"],
    },
    {
      chunk_index: 0,
      page_start: 1,
      page_end: 3,
      status: "completed",
      question_count: 2,
    },
  ],
});
assert.equal(normalizedChunking?.chunks[0].chunkIndex, 0);
assert.equal(normalizedChunking?.chunks[1].warningCount, 1);
assert.equal(normalizedChunking?.failedChunks, 1);
const sourceUploadAiPdfImport = mergeAIPdfImportChunkingSummary(
  {},
  {
    chunking: createAIPdfChunkingSummary({ pageCount: 12 }),
    pageCount: 12,
    phase: "source_uploaded",
  },
);
const leasedAiPdfImport = mergeAIPdfImportChunkingSummary(
  sourceUploadAiPdfImport,
  {
    jobId: "lease-1",
    phase: "queued",
  },
);
const progressAiPdfImport = mergeAIPdfImportChunkingSummary(leasedAiPdfImport, {
  pageCount: 12,
  phase: "calling_provider",
});
const finalAiPdfImport = mergeAIPdfImportChunkingSummary(progressAiPdfImport, {
  createdQuestionCount: 2,
  pageCount: 12,
  phase: "completed",
});
assert.equal(finalAiPdfImport.pageCount, 12);
assert.equal(finalAiPdfImport.chunking?.totalChunks, 6);
assert.notEqual(finalAiPdfImport.chunking?.totalChunks, undefined);
assert.equal(finalAiPdfImport.chunking?.mode, "foundation");
assert.equal(
  finalAiPdfImport.chunking?.chunks.every((chunk) => chunk.status === "planned"),
  true,
);
assert.equal(
  ensureAIPdfChunkingSummary({ pageCount: 12 })?.totalChunks,
  6,
  "old AI PDF summaries with pageCount should backfill foundation chunking",
);
console.log("PASS AI PDF chunking summary survives source, lease, progress, and final summary updates");

const pdfPreanalysis = analyzePdfPageTexts({
  generatedAt: "2026-06-16T00:00:00.000Z",
  pageCount: 2,
  pages: [
    {
      pageNumber: 1,
      text: [
        "Problem 1. A circuit question asks for current.",
        "A. 1 A",
        "B. 2 A",
        "See the figure at the bottom of the page.",
      ].join("\n"),
      textLayerAvailable: true,
    },
    {
      pageNumber: 2,
      text: [
        "C. 3 A",
        "D. 4 A",
        "Solution: Use Ohm's Law.",
        "Answer: 3 A",
      ].join("\n"),
      textLayerAvailable: true,
    },
  ],
  sourceHash: "pdf-hash",
});
assert.equal(pdfPreanalysis.sourceKind, "pdf");
assert.equal(pdfPreanalysis.version, "preanalysis_v1");
assert.equal(pdfPreanalysis.pageCount, 2);
assert.equal(pdfPreanalysis.pages.length, 2);
assert.equal(pdfPreanalysis.documentHints.hasQuestionMarkers, true);
assert.equal(pdfPreanalysis.documentHints.hasChoiceMarkers, true);
assert.equal(pdfPreanalysis.documentHints.hasAnswerMarkers, true);
assert.ok(pdfPreanalysis.pages[0].questionNumberHints.length > 0);
assert.ok(pdfPreanalysis.pages[0].choiceMarkerHints.length >= 2);
assert.ok(pdfPreanalysis.pages[1].answerMarkerHints.length > 0);
assert.equal(
  pdfPreanalysis.pages[0].boundaryRisks.some(
    (risk) => risk.type === "may_end_mid_question",
  ),
  true,
);
assert.equal(
  pdfPreanalysis.pages[1].boundaryRisks.some(
    (risk) =>
      risk.type === "may_start_with_choices" ||
      risk.type === "may_continue_previous_question",
  ),
  true,
);
assert.ok((pdfPreanalysis.pages[0].extractedTextPreview ?? "").length <= 800);

const imagePreanalysis = generateImagePreanalysisFromMetadata({
  fileSizeBytes: 7 * 1024 * 1024,
  generatedAt: "2026-06-16T00:00:00.000Z",
  height: 2400,
  sourceHash: "image-hash",
  width: 1200,
});
assert.equal(imagePreanalysis.sourceKind, "single_image");
assert.equal(imagePreanalysis.version, "preanalysis_v1");
assert.equal(imagePreanalysis.sourceHash, "image-hash");
assert.equal(imagePreanalysis.image.width, 1200);
assert.equal(imagePreanalysis.image.height, 2400);
assert.equal(imagePreanalysis.image.orientationHint, "portrait");
assert.equal(imagePreanalysis.image.qualityHints.includes("large_image"), true);
assert.equal(imagePreanalysis.image.qualityHints.includes("likely_photo"), true);
assert.equal(imagePreanalysis.textHints.ocrTextAvailable, false);
assert.equal(imagePreanalysis.textHints.extractedTextLength, 0);

const preanalysisMergedAiPdfImport = mergeAIPdfImportChunkingSummary(
  {
    chunking: createAIPdfChunkingSummary({ pageCount: 4 }),
    provider: { id: "provider-1", name: "Provider", model: "model" },
    warnings: ["keep existing warning"],
  },
  { preanalysis: pdfPreanalysis },
);
assert.equal(preanalysisMergedAiPdfImport.preanalysis.version, "preanalysis_v1");
assert.equal(preanalysisMergedAiPdfImport.chunking.totalChunks, 2);
assert.equal(preanalysisMergedAiPdfImport.provider.id, "provider-1");
assert.deepEqual(preanalysisMergedAiPdfImport.warnings, ["keep existing warning"]);
console.log(
  "PASS AI parsing preanalysis classifies PDF/image inputs and preserves summary metadata",
);

const packetPlanPreanalysis = analyzePdfPageTexts({
  generatedAt: "2026-06-16T00:00:00.000Z",
  pageCount: 3,
  pages: [
    {
      pageNumber: 1,
      text: [
        "Question 1. A block slides down a ramp.",
        "A. 1 m/s",
        "B. 2 m/s",
        "Figure 1 shows the ramp near the page bottom.",
      ].join("\n"),
      textLayerAvailable: true,
    },
    {
      pageNumber: 2,
      text: [
        "C. 3 m/s",
        "D. 4 m/s",
        "Solution: use conservation of energy.",
        "Answer: 3 m/s",
      ].join("\n"),
      textLayerAvailable: true,
    },
    {
      pageNumber: 3,
      text: "   ",
      textLayerAvailable: false,
    },
  ],
  sourceHash: "packet-pdf-hash",
});
const pdfPacketPlan = buildAIPacketPlanFromPreanalysis(packetPlanPreanalysis);
assert.equal(pdfPacketPlan.sourceKind, "pdf");
assert.equal(pdfPacketPlan.version, "packet_plan_v1");
assert.equal(pdfPacketPlan.status, "completed");
assert.ok(pdfPacketPlan.stats.totalPackets >= 2);
assert.ok(pdfPacketPlan.stats.pdfQuestionCandidatePackets >= 1);
assert.ok(pdfPacketPlan.stats.boundaryRiskPackets >= 1);
assert.ok(pdfPacketPlan.stats.assetLinkedPackets >= 1);
assert.equal(pdfPacketPlan.stats.skippedPages, 1);
assert.ok(
  pdfPacketPlan.packets.some(
    (packet) =>
      packet.kind === "pdf_boundary_risk" &&
      packet.pageSpan?.startPage === 1 &&
      packet.pageSpan.endPage === 2 &&
      packet.reviewHints.likelyNeedsBoundaryReread,
  ),
);
assert.ok(
  pdfPacketPlan.packets.some(
    (packet) => packet.assetRefs.length > 0 && packet.packetHash,
  ),
);
assert.equal(
  pdfPacketPlan.packets.every(
    (packet) => (packet.textPreview?.length ?? 0) <= 1200,
  ),
  true,
);

const imagePacketPlan = buildAIPacketPlanFromPreanalysis(imagePreanalysis);
assert.equal(imagePacketPlan.sourceKind, "single_image");
assert.equal(imagePacketPlan.stats.singleImagePackets, 1);
assert.equal(imagePacketPlan.packets[0].kind, "single_image_question");
assert.equal(imagePacketPlan.packets[0].sourceHash, "image-hash");
assert.equal(imagePacketPlan.packets[0].reviewHints.likelyNeedsVision, true);
assert.equal(
  imagePacketPlan.packets[0].reviewHints.reasonCodes.includes(
    "likely_screenshot",
  ),
  true,
);
assert.ok(imagePacketPlan.packets[0].packetHash);

const packetPlanMergedAiPdfImport = mergeAIPacketPlanIntoSummary(
  {
    chunking: createAIPdfChunkingSummary({ pageCount: 4 }),
    preanalysis: pdfPreanalysis,
    provider: { id: "provider-1", name: "Provider", model: "model" },
    warnings: ["keep existing warning"],
  },
  pdfPacketPlan,
);
assert.equal(packetPlanMergedAiPdfImport.packetPlan.version, "packet_plan_v1");
assert.equal(packetPlanMergedAiPdfImport.preanalysis.version, "preanalysis_v1");
assert.equal(packetPlanMergedAiPdfImport.chunking.totalChunks, 2);
assert.equal(packetPlanMergedAiPdfImport.provider.id, "provider-1");
assert.deepEqual(packetPlanMergedAiPdfImport.warnings, ["keep existing warning"]);
console.log(
  "PASS AI parsing packet builder creates PDF/image packets and preserves summary metadata",
);

function makeExtractionPacket({
  assetRefs = [],
  boundaryRiskRefs = [],
  estimatedChars = 900,
  index,
  kind = "pdf_question_candidate",
  pageNumbers = [index + 1],
  reviewHints = {},
}) {
  return {
    assetRefs,
    boundaryRiskRefs,
    inputBudget: {
      estimatedChars,
      estimatedTokens: Math.ceil(estimatedChars / 4),
      hasImageInput: assetRefs.length > 0 || kind === "single_image_question",
      hasTextInput: estimatedChars > 0,
    },
    kind,
    markerHints: {
      answers: [],
      choices: ["A.", "B.", "C.", "D."],
      questionNumbers: [`${index + 1}.`],
    },
    packetHash: `packet-hash-${index}`,
    packetId: `packet-${index}`,
    pageNumbers,
    pageSpan:
      pageNumbers.length > 0
        ? { endPage: pageNumbers[pageNumbers.length - 1], startPage: pageNumbers[0] }
        : null,
    questionNumberHint: String(index + 1),
    reviewHints: {
      likelyNeedsAI: true,
      likelyNeedsBoundaryReread: false,
      likelyNeedsVision: assetRefs.length > 0 || kind === "single_image_question",
      reasonCodes: [],
      ...reviewHints,
    },
    sourceHash: "schema-source-hash",
    sourceKind: kind === "single_image_question" ? "single_image" : "pdf",
    status: "planned",
    textLength: estimatedChars,
    textPreview: `Packet ${index + 1} preview`,
  };
}

const schemaPacket = makeExtractionPacket({ index: 0, pageNumbers: [1] });
const validExtraction = normalizeAIPacketExtractionResult({
  packet: schemaPacket,
  raw: {
    confidence: 0.93,
    packetHash: schemaPacket.packetHash,
    packetId: schemaPacket.packetId,
    question: {
      answer: "B",
      explanation: "Use Ohm's Law.",
      format: "multiple-choice",
      options: ["(A) 1 A", "B. 2 A", "C) 3 A", "d. 4 A"],
      questionNumber: "1",
      source: { pageNumbers: [1] },
      stem: "What is the current?",
    },
    status: "valid",
    version: "question_extract_v1",
    warnings: ["model uncertainty kept"],
  },
});
assert.equal(validExtraction.version, "question_extract_v1");
assert.equal(validExtraction.status, "valid");
assert.equal(validExtraction.question.options[0].label, "A");
assert.equal(validExtraction.question.options[3].label, "D");
assert.equal(validExtraction.review.reviewRequired, false);
const draftReady = buildDraftReadyQuestionFromExtraction(validExtraction);
assert.equal(draftReady.draft.questionType, "mcq");
assert.equal(draftReady.draft.aiMetadata.packetId, schemaPacket.packetId);
assert.match(draftReady.draft.contentHtml, /What is the current/);

const missingAnswerExtraction = normalizeAIPacketExtractionResult({
  packet: schemaPacket,
  raw: {
    confidence: 0.9,
    packetHash: schemaPacket.packetHash,
    packetId: schemaPacket.packetId,
    question: {
      answer: null,
      explanation: "Needs review.",
      format: "free_response",
      source: { pageNumbers: [1] },
      stem: "Explain the trend.",
    },
    status: "valid",
    version: "question_extract_v1",
  },
});
assert.equal(missingAnswerExtraction.status, "valid");
assert.equal(missingAnswerExtraction.review.reviewRequired, true);
assert.ok(
  missingAnswerExtraction.review.reasonCodes.includes("missing_answer"),
);

const badOptionsExtraction = normalizeAIPacketExtractionResult({
  packet: schemaPacket,
  raw: {
    confidence: 0.95,
    packetHash: schemaPacket.packetHash,
    packetId: schemaPacket.packetId,
    question: {
      answer: "A",
      format: "multiple_choice",
      options: ["A. only one option"],
      source: { pageNumbers: [1] },
      stem: "Choose one.",
    },
    status: "valid",
    version: "question_extract_v1",
  },
});
assert.equal(badOptionsExtraction.status, "invalid");
assert.ok(
  badOptionsExtraction.errors.some((error) => error.code === "invalid_options"),
);
assert.equal(buildDraftReadyQuestionFromExtraction(badOptionsExtraction).draft, null);

const assetPacket = makeExtractionPacket({
  assetRefs: [{ assetHintIndex: 0, kind: "figure", pageNumber: 2 }],
  index: 1,
  kind: "pdf_asset_linked",
  pageNumbers: [2],
});
const invalidAssetExtraction = normalizeAIPacketExtractionResult({
  packet: assetPacket,
  raw: {
    confidence: 0.88,
    packetHash: assetPacket.packetHash,
    packetId: assetPacket.packetId,
    question: {
      answer: "A",
      assets: [{ assetRef: "asset:999", kind: "figure", pageNumber: 9 }],
      format: "short_answer",
      source: { pageNumbers: [2] },
      stem: "Use the figure.",
    },
    status: "valid",
    version: "question_extract_v1",
  },
});
assert.equal(invalidAssetExtraction.status, "partial");
assert.ok(
  invalidAssetExtraction.errors.some((error) => error.code === "invalid_asset_ref"),
);

const boundaryPacket = makeExtractionPacket({
  boundaryRiskRefs: [{ confidence: 0.7, pageNumber: 2, type: "may_end_mid_question" }],
  index: 2,
  kind: "pdf_boundary_risk",
  pageNumbers: [2, 3],
  reviewHints: { likelyNeedsBoundaryReread: true },
});
const boundaryExtraction = normalizeAIPacketExtractionResult({
  packet: boundaryPacket,
  raw: {
    confidence: 0.92,
    packetHash: boundaryPacket.packetHash,
    packetId: boundaryPacket.packetId,
    question: {
      answer: "42",
      explanation: "Boundary context preserved.",
      format: "short_answer",
      source: { pageNumbers: [2, 3] },
      stem: "Question crosses pages.",
    },
    status: "valid",
    version: "question_extract_v1",
  },
});
assert.equal(boundaryExtraction.review.reviewRequired, true);
assert.ok(
  boundaryExtraction.review.reasonCodes.includes("boundary_risk_packet"),
);

const tenTextPackets = Array.from({ length: 10 }, (_, index) =>
  makeExtractionPacket({ index, pageNumbers: [index + 1] }),
);
const batchPlan = buildAIExtractionBatchPlanFromPacketPlan({
  generatedAt: "2026-06-16T00:00:00.000Z",
  packets: tenTextPackets,
  sourceHash: "schema-source-hash",
  sourceKind: "pdf",
  stats: {
    assetLinkedPackets: 0,
    boundaryRiskPackets: 0,
    estimatedTotalChars: 9000,
    estimatedTotalTokens: 2250,
    pdfQuestionCandidatePackets: 10,
    singleImagePackets: 0,
    skippedPages: 0,
    totalPackets: 10,
  },
  status: "completed",
  version: "packet_plan_v1",
  warnings: [],
});
assert.equal(batchPlan.version, "extraction_batch_plan_v1");
assert.equal(batchPlan.status, "completed");
assert.ok(batchPlan.stats.totalBatches < 10);
assert.equal(batchPlan.stats.textQuestionBatches, batchPlan.stats.totalBatches);
assert.equal(batchPlan.stats.totalPackets, 10);

const boundaryBatchPlan = buildAIExtractionBatchPlanFromPacketPlan({
  ...batchPlan,
  packets: Array.from({ length: 4 }, (_, index) =>
    makeExtractionPacket({
      boundaryRiskRefs: [{ confidence: 0.7, pageNumber: index + 1, type: "unknown" }],
      index,
      kind: "pdf_boundary_risk",
      reviewHints: { likelyNeedsBoundaryReread: true },
    }),
  ),
});
assert.equal(boundaryBatchPlan.stats.boundaryRiskBatches, 2);
assert.equal(
  boundaryBatchPlan.batches.every(
    (batch) => batch.packetRefs.length <= 3 && batch.batchKind === "boundary_risk_batch",
  ),
  true,
);

const assetBatchPlan = buildAIExtractionBatchPlanFromPacketPlan({
  ...batchPlan,
  packets: Array.from({ length: 4 }, (_, index) =>
    makeExtractionPacket({
      assetRefs: [{ assetHintIndex: 0, kind: "figure", pageNumber: index + 1 }],
      index,
      kind: "pdf_asset_linked",
    }),
  ),
});
assert.equal(assetBatchPlan.stats.assetLinkedBatches, 2);
assert.equal(
  assetBatchPlan.batches.every((batch) => batch.recommendedInputMode === "mixed"),
  true,
);

const singleImageBatchPlan = buildAIExtractionBatchPlanFromPacketPlan({
  ...batchPlan,
  packets: Array.from({ length: 2 }, (_, index) =>
    makeExtractionPacket({
      estimatedChars: 200,
      index,
      kind: "single_image_question",
      pageNumbers: [],
    }),
  ),
  sourceKind: "single_image",
});
assert.equal(singleImageBatchPlan.stats.singleImageBatches, 2);
assert.equal(singleImageBatchPlan.batches[0].packetRefs.length, 1);

const extractionBatchMergedAiPdfImport = mergeAIExtractionBatchPlanIntoSummary(
  {
    chunking: createAIPdfChunkingSummary({ pageCount: 4 }),
    packetPlan: pdfPacketPlan,
    preanalysis: pdfPreanalysis,
    provider: { id: "provider-1", name: "Provider", model: "model" },
    warnings: ["keep existing warning"],
  },
  batchPlan,
);
assert.equal(
  extractionBatchMergedAiPdfImport.extractionBatchPlan.version,
  "extraction_batch_plan_v1",
);
assert.equal(extractionBatchMergedAiPdfImport.packetPlan.version, "packet_plan_v1");
assert.equal(extractionBatchMergedAiPdfImport.preanalysis.version, "preanalysis_v1");
assert.equal(extractionBatchMergedAiPdfImport.chunking.totalChunks, 2);
assert.equal(extractionBatchMergedAiPdfImport.provider.id, "provider-1");
assert.deepEqual(extractionBatchMergedAiPdfImport.warnings, ["keep existing warning"]);

const schemaPrompt = buildSchemaFirstExtractionPrompt(batchPlan.batches[0]);
assert.match(schemaPrompt, /Return JSON only/);
assert.match(schemaPrompt, /one result per packet/i);
assert.match(schemaPrompt, /Preserve each packetId and packetHash exactly/);
assert.match(schemaPrompt, /Do not invent answers, assets, page numbers/);
console.log(
  "PASS AI schema-first extraction normalizes results, plans batches, and preserves summary metadata",
);

const providerRequestPlan = buildAIProviderRequestPlanFromExtractionBatchPlan(
  batchPlan,
);
assert.equal(providerRequestPlan.version, "provider_request_plan_v1");
assert.equal(providerRequestPlan.status, "completed");
assert.equal(providerRequestPlan.stats.textRequests, batchPlan.stats.totalBatches);
assert.equal(providerRequestPlan.stats.totalPacketsCovered, 10);
assert.equal(providerRequestPlan.requests[0].kind, "schema_text_extraction");
assert.equal(providerRequestPlan.requests[0].recommendedMode, "text");
assert.deepEqual(
  providerRequestPlan.requests[0].packetIds,
  batchPlan.batches[0].packetRefs.map((packet) => packet.packetId),
);
assert.deepEqual(
  providerRequestPlan.requests[0].packetHashes,
  batchPlan.batches[0].packetRefs.map((packet) => packet.packetHash),
);
assert.equal(providerRequestPlan.requests[0].safety.jsonOnly, true);
assert.equal(providerRequestPlan.requests[0].safety.noMarkdown, true);
assert.match(
  providerRequestPlan.requests[0].prompt.systemInstruction,
  /Return JSON only/,
);
assert.match(
  providerRequestPlan.requests[0].prompt.userInstruction,
  /Return exactly one result per packet/,
);
assert.match(
  providerRequestPlan.requests[0].prompt.userInstruction,
  /Preserve each packetId and packetHash exactly/,
);
assert.match(
  providerRequestPlan.requests[0].prompt.userInstruction,
  /Do not invent answers, assets, page numbers/,
);

const boundaryRequestPlan =
  buildAIProviderRequestPlanFromExtractionBatchPlan(boundaryBatchPlan);
assert.equal(boundaryRequestPlan.requests[0].kind, "schema_boundary_review");
assert.equal(boundaryRequestPlan.requests[0].recommendedMode, "review_only");
assert.match(
  boundaryRequestPlan.requests[0].prompt.systemInstruction,
  /boundary review only/i,
);

const assetRequestPlan =
  buildAIProviderRequestPlanFromExtractionBatchPlan(assetBatchPlan);
assert.equal(assetRequestPlan.requests[0].kind, "schema_mixed_extraction");
assert.equal(assetRequestPlan.requests[0].recommendedMode, "mixed");
assert.ok(assetRequestPlan.requests[0].inputRefs.assetRefs.length > 0);
const assetRequestJson = JSON.stringify(assetRequestPlan);
assert.equal(/data:image|base64|JVBERi0|iVBORw0KGgo/i.test(assetRequestJson), false);

const singleImageRequestPlan =
  buildAIProviderRequestPlanFromExtractionBatchPlan(singleImageBatchPlan);
assert.equal(
  singleImageRequestPlan.requests[0].kind,
  "schema_single_image_extraction",
);
assert.equal(singleImageRequestPlan.requests[0].recommendedMode, "vision");

const skippedRequestPlan = buildAIProviderRequestPlanFromExtractionBatchPlan({
  batches: [
    {
      batchId: "mixed-review-1",
      batchIndex: 0,
      batchKind: "mixed_review_batch",
      inputBudget: {
        estimatedChars: 100,
        estimatedTokens: 25,
        hasImageInput: false,
        hasTextInput: true,
      },
      packetRefs: [
        {
          assetRefCount: 0,
          boundaryRiskCount: 0,
          estimatedChars: 100,
          kind: "unknown",
          packetHash: "unknown-hash",
          packetId: "unknown-packet",
          pageNumbers: [1],
        },
      ],
      recommendedInputMode: "mixed",
      routingHints: ["unknown_packet_review"],
      sourceKind: "pdf",
      status: "planned",
    },
  ],
  generatedAt: "2026-06-16T00:00:00.000Z",
  sourceHash: "schema-source-hash",
  sourceKind: "pdf",
  stats: {
    assetLinkedBatches: 0,
    boundaryRiskBatches: 0,
    estimatedTotalChars: 100,
    estimatedTotalTokens: 25,
    mixedReviewBatches: 1,
    singleImageBatches: 0,
    skippedPackets: 0,
    textQuestionBatches: 0,
    totalBatches: 1,
    totalPackets: 1,
  },
  status: "completed",
  version: "extraction_batch_plan_v1",
  warnings: [],
});
assert.equal(skippedRequestPlan.status, "skipped");
assert.equal(skippedRequestPlan.stats.skippedBatches, 1);
assert.equal(skippedRequestPlan.requests.length, 0);

const providerRequestMergedAiPdfImport = mergeAIProviderRequestPlanIntoSummary(
  {
    chunking: createAIPdfChunkingSummary({ pageCount: 4 }),
    extractionBatchPlan: batchPlan,
    packetPlan: pdfPacketPlan,
    preanalysis: pdfPreanalysis,
    provider: { id: "provider-1", name: "Provider", model: "model" },
    warnings: ["keep existing warning"],
  },
  providerRequestPlan,
);
assert.equal(
  providerRequestMergedAiPdfImport.providerRequestPlan.version,
  "provider_request_plan_v1",
);
assert.equal(
  providerRequestMergedAiPdfImport.extractionBatchPlan.version,
  "extraction_batch_plan_v1",
);
assert.equal(providerRequestMergedAiPdfImport.packetPlan.version, "packet_plan_v1");
assert.equal(providerRequestMergedAiPdfImport.preanalysis.version, "preanalysis_v1");
assert.equal(providerRequestMergedAiPdfImport.chunking.totalChunks, 2);
assert.equal(providerRequestMergedAiPdfImport.provider.id, "provider-1");
assert.deepEqual(providerRequestMergedAiPdfImport.warnings, ["keep existing warning"]);
console.log(
  "PASS AI provider request builder creates shadow request plans and preserves summary metadata",
);

const providerRunPlan = buildAIProviderRunPlanFromProviderRequestPlan({
  mode: "dry_run",
  providerRequestPlan,
});
assert.equal(providerRunPlan.version, "provider_run_plan_v1");
assert.equal(providerRunPlan.mode, "dry_run");
assert.equal(providerRunPlan.status, "completed");
assert.equal(providerRunPlan.stats.requestCount, providerRequestPlan.requests.length);
assert.equal(
  providerRunPlan.stats.totalPacketCount,
  providerRequestPlan.stats.totalPacketsCovered,
);
assert.equal(providerRunPlan.requestRuns[0].requestId, providerRequestPlan.requests[0].requestId);
assert.equal(providerRunPlan.requestRuns[0].requestHash, providerRequestPlan.requests[0].requestHash);
assert.deepEqual(providerRunPlan.requestRuns[0].packetIds, providerRequestPlan.requests[0].packetIds);
assert.deepEqual(
  providerRunPlan.requestRuns[0].packetHashes,
  providerRequestPlan.requests[0].packetHashes,
);
assert.equal(providerRunPlan.requestRuns[0].provider.realCall, false);
assert.equal(providerRunPlan.requestRuns[0].status, "simulated");
assert.equal(providerRunPlan.requestRuns[0].dryRunResult.resultCount, providerRunPlan.requestRuns[0].packetIds.length);
assert.equal(providerRunPlan.requestRuns[0].dryRunResult.validation.valid, true);
assert.equal(providerRunPlan.requestRuns[0].dryRunResult.schemaVersion, "question_extract_v1");

const dryRunResult = simulateProviderRequestDryRun(providerRequestPlan.requests[0]);
assert.equal(dryRunResult.resultCount, providerRequestPlan.requests[0].packetIds.length);
assert.equal(dryRunResult.validation.valid, true);
const invalidDryRunValidation = validateDryRunProviderOutput({
  packetHashes: ["expected-hash"],
  packetIds: ["expected-packet"],
  results: [
    {
      packetHash: "wrong-hash",
      packetId: "expected-packet",
      question: {
        answer: "fake answer",
        explanation: null,
      },
      review: { reviewRequired: true },
      version: "question_extract_v1",
    },
  ],
});
assert.equal(invalidDryRunValidation.valid, false);
assert.ok(
  invalidDryRunValidation.errors.includes("result_0_packet_hash_mismatch"),
);
assert.ok(
  invalidDryRunValidation.errors.includes("result_0_dry_run_answer_must_be_null"),
);

const unsupportedRequestRun = buildProviderRequestRun({
  mode: "dry_run",
  request: {
    ...providerRequestPlan.requests[0],
    kind: "unsupported_request_kind",
    requestHash: "unsupported-request-hash",
    requestId: "unsupported-request",
  },
});
assert.equal(unsupportedRequestRun.status, "skipped");
assert.equal(unsupportedRequestRun.provider.realCall, false);
assert.ok(
  unsupportedRequestRun.warnings.includes(
    "provider_run_request_skipped_unknown_kind",
  ),
);

const providerRunJson = JSON.stringify(providerRunPlan);
assert.equal(/data:image|base64|JVBERi0|iVBORw0KGgo/i.test(providerRunJson), false);

const providerRunMergedAiPdfImport = mergeAIProviderRunPlanIntoSummary(
  {
    chunking: createAIPdfChunkingSummary({ pageCount: 4 }),
    extractionBatchPlan: batchPlan,
    packetPlan: pdfPacketPlan,
    preanalysis: pdfPreanalysis,
    provider: { id: "provider-1", name: "Provider", model: "model" },
    providerRequestPlan,
    warnings: ["keep existing warning"],
  },
  providerRunPlan,
);
assert.equal(
  providerRunMergedAiPdfImport.providerRunPlan.version,
  "provider_run_plan_v1",
);
assert.equal(
  providerRunMergedAiPdfImport.providerRequestPlan.version,
  "provider_request_plan_v1",
);
assert.equal(
  providerRunMergedAiPdfImport.extractionBatchPlan.version,
  "extraction_batch_plan_v1",
);
assert.equal(providerRunMergedAiPdfImport.packetPlan.version, "packet_plan_v1");
assert.equal(providerRunMergedAiPdfImport.preanalysis.version, "preanalysis_v1");
assert.equal(providerRunMergedAiPdfImport.chunking.totalChunks, 2);
assert.equal(providerRunMergedAiPdfImport.provider.id, "provider-1");
assert.deepEqual(providerRunMergedAiPdfImport.warnings, ["keep existing warning"]);
console.log(
  "PASS AI provider runner creates dry-run plans without real provider calls and preserves summary metadata",
);

const adaptiveBatchPlan = buildAIExtractionBatchPlanFromPacketPlan(pdfPacketPlan);
const adaptiveProviderRequestPlan =
  buildAIProviderRequestPlanFromExtractionBatchPlan(adaptiveBatchPlan);
const adaptiveProviderRunPlan = buildAIProviderRunPlanFromProviderRequestPlan({
  mode: "dry_run",
  providerRequestPlan: adaptiveProviderRequestPlan,
});
const warningProviderRunPlan = {
  ...adaptiveProviderRunPlan,
  requestRuns: adaptiveProviderRunPlan.requestRuns.map((run, index) =>
    index === 0
      ? {
          ...run,
          dryRunResult: {
            ...run.dryRunResult,
            validation: {
              ...run.dryRunResult.validation,
              warnings: ["validation_needs_boundary_review"],
            },
          },
        }
      : run,
  ),
};
const adaptiveSummary = {
  chunking: createAIPdfChunkingSummary({ pageCount: 8 }),
  extractionBatchPlan: adaptiveBatchPlan,
  packetPlan: pdfPacketPlan,
  preanalysis: {
    ...packetPlanPreanalysis,
    pageCount: 8,
  },
  provider: { id: "provider-1", name: "Provider", model: "model" },
  providerRequestPlan: adaptiveProviderRequestPlan,
  providerRunPlan: warningProviderRunPlan,
  warnings: ["keep existing warning"],
};
const adaptiveRereadPlan =
  buildAIAdaptiveRereadPlanFromSummary(adaptiveSummary);
assert.equal(adaptiveRereadPlan.version, "adaptive_reread_plan_v1");
assert.equal(adaptiveRereadPlan.mode, "planning_only");
assert.notEqual(adaptiveRereadPlan.status, "failed");
assert.ok(adaptiveRereadPlan.requests.length > 0);
assert.equal(
  adaptiveRereadPlan.requests.every((request) => request.safety.realCall === false),
  true,
);
assert.equal(
  adaptiveRereadPlan.requests.every(
    (request) =>
      request.safety.planningOnly &&
      request.safety.noBase64 &&
      request.safety.noFullPdfText &&
      request.safety.noImageBytes,
  ),
  true,
);
assert.equal(
  adaptiveRereadPlan.requests.every(
    (request) =>
      request.pageWindow.pageNumbers.length <= 3 &&
      request.pageWindow.pageNumbers.length < 8,
  ),
  true,
);
assert.ok(
  adaptiveRereadPlan.requests.some((request) =>
    request.reasons.some(
      (reason) => reason.code === "provider_run_validation_warning",
    ),
  ),
);
assert.ok(
  adaptiveRereadPlan.requests.some(
    (request) => request.packetIds.length > 0 && request.packetHashes.length > 0,
  ),
);
const adaptiveRereadPlanAgain =
  buildAIAdaptiveRereadPlanFromSummary(adaptiveSummary);
assert.deepEqual(
  adaptiveRereadPlanAgain.requests.map((request) => request.rereadRequestHash),
  adaptiveRereadPlan.requests.map((request) => request.rereadRequestHash),
);
const unknownRiskPlan = buildAIAdaptiveRereadPlanFromSummary({
  ...adaptiveSummary,
  preanalysis: {
    ...packetPlanPreanalysis,
    pages: [
      {
        boundaryRisks: [{ confidence: 0.5, type: "strange_marker" }],
        extractedTextLength: 120,
        pageNumber: 2,
        textLayerAvailable: true,
      },
    ],
  },
});
assert.ok(
  unknownRiskPlan.requests.some((request) =>
    request.reasons.some((reason) => reason.code === "unknown_boundary_risk"),
  ),
);
const adaptivePlanJson = JSON.stringify(adaptiveRereadPlan);
assert.equal(/data:image|;base64,|JVBERi0|iVBORw0KGgo/i.test(adaptivePlanJson), false);
const adaptiveMergedAiPdfImport = mergeAIAdaptiveRereadPlanIntoSummary(
  adaptiveSummary,
  adaptiveRereadPlan,
);
assert.equal(
  adaptiveMergedAiPdfImport.adaptiveRereadPlan.version,
  "adaptive_reread_plan_v1",
);
assert.equal(adaptiveMergedAiPdfImport.providerRunPlan.version, "provider_run_plan_v1");
assert.equal(
  adaptiveMergedAiPdfImport.providerRequestPlan.version,
  "provider_request_plan_v1",
);
assert.equal(
  adaptiveMergedAiPdfImport.extractionBatchPlan.version,
  "extraction_batch_plan_v1",
);
assert.equal(adaptiveMergedAiPdfImport.packetPlan.version, "packet_plan_v1");
assert.equal(adaptiveMergedAiPdfImport.preanalysis.version, "preanalysis_v1");
assert.equal(adaptiveMergedAiPdfImport.chunking.totalChunks, 4);
assert.equal(adaptiveMergedAiPdfImport.provider.id, "provider-1");
assert.deepEqual(adaptiveMergedAiPdfImport.warnings, ["keep existing warning"]);
console.log(
  "PASS AI adaptive reread planning creates bounded planning-only requests and preserves summary metadata",
);

const adaptiveProviderKinds = [
  ["cross_page_question_context", "adaptive_cross_page_text_extraction", "text"],
  ["answer_key_context", "adaptive_answer_key_review", "text"],
  ["asset_context", "adaptive_asset_context_review", "mixed"],
  [
    "low_text_confidence_context",
    "adaptive_low_text_confidence_review",
    "review_only",
  ],
  ["mixed_layout_context", "adaptive_mixed_layout_review", "mixed"],
  ["review_only", "adaptive_review_only", "review_only"],
];
const adaptiveProviderBaseRequest = adaptiveRereadPlan.requests[0];
const allKindAdaptiveRereadPlan = {
  ...adaptiveRereadPlan,
  requests: adaptiveProviderKinds.map(([kind], index) => ({
    ...adaptiveProviderBaseRequest,
    assetRefs: kind === "asset_context" ? [`asset-ref-${index}`] : [],
    budget: {
      ...adaptiveProviderBaseRequest.budget,
      hasImageInput: kind === "asset_context" || kind === "mixed_layout_context",
      hasTextInput: true,
    },
    kind,
    packetHashes: [`adaptive-packet-hash-${index}`],
    packetIds: [`adaptive-packet-${index}`],
    pageWindow: {
      endPage: 2,
      maxWindowPages: 3,
      originalPageNumbers: [1, 2],
      pageNumbers: [1, 2],
      startPage: 1,
    },
    reasons: [
      {
        ...adaptiveProviderBaseRequest.reasons[0],
        packetIds: [`adaptive-packet-${index}`],
        pageNumbers: [1, 2],
      },
    ],
    rereadRequestHash: `adaptive-reread-hash-${index}`,
    rereadRequestId: `adaptive-reread-${index}`,
  })),
};
const adaptiveRereadProviderRequestPlan =
  buildAIAdaptiveRereadProviderRequestPlanFromAdaptiveRereadPlan(
    allKindAdaptiveRereadPlan,
  );
assert.equal(
  adaptiveRereadProviderRequestPlan.version,
  "adaptive_reread_provider_request_plan_v1",
);
assert.equal(adaptiveRereadProviderRequestPlan.mode, "shadow");
assert.equal(
  adaptiveRereadProviderRequestPlan.requests.length,
  adaptiveProviderKinds.length,
);
for (const [index, [, expectedKind, expectedMode]] of adaptiveProviderKinds.entries()) {
  const request = adaptiveRereadProviderRequestPlan.requests[index];

  assert.equal(request.kind, expectedKind);
  assert.equal(request.recommendedMode, expectedMode);
  assert.equal(request.rereadRequestId, `adaptive-reread-${index}`);
  assert.equal(request.rereadRequestHash, `adaptive-reread-hash-${index}`);
  assert.deepEqual(request.packetIds, [`adaptive-packet-${index}`]);
  assert.deepEqual(request.packetHashes, [`adaptive-packet-hash-${index}`]);
  assert.equal(request.pageWindow.pageNumbers.length <= 3, true);
  assert.equal(request.safety.realCall, false);
  assert.equal(request.safety.shadowOnly, true);
  assert.equal(request.safety.noBase64, true);
  assert.equal(request.safety.noFullPdfText, true);
  assert.equal(request.safety.noImageBytes, true);
  assert.equal(request.promptContract.jsonOnly, true);
  assert.equal(request.promptContract.noMarkdown, true);
  assert.equal(request.promptContract.preservePacketIds, true);
  assert.equal(request.promptContract.preservePacketHashes, true);
  assert.equal(request.promptContract.useOnlyProvidedPages, true);
  assert.equal(request.promptContract.useOnlyProvidedAssets, true);
  assert.match(request.promptContract.systemInstruction, /Return JSON only/);
  assert.match(request.promptContract.userInstruction, /Packet IDs:/);
}
assert.ok(
  adaptiveRereadProviderRequestPlan.requests
    .filter((request) => request.recommendedMode === "review_only")
    .every((request) =>
      request.warnings.includes("adaptive_reread_provider_request_review_only"),
    ),
);
const adaptiveProviderRequestJson = JSON.stringify(adaptiveRereadProviderRequestPlan);
assert.equal(
  /data:image|;base64,|JVBERi0|iVBORw0KGgo|rawProviderResponse/i.test(
    adaptiveProviderRequestJson,
  ),
  false,
);
const adaptiveProviderRequestMergedAiPdfImport =
  mergeAIAdaptiveRereadProviderRequestPlanIntoSummary(
    adaptiveMergedAiPdfImport,
    adaptiveRereadProviderRequestPlan,
  );
assert.equal(
  adaptiveProviderRequestMergedAiPdfImport.adaptiveRereadProviderRequestPlan
    .version,
  "adaptive_reread_provider_request_plan_v1",
);
assert.equal(
  adaptiveProviderRequestMergedAiPdfImport.adaptiveRereadPlan.version,
  "adaptive_reread_plan_v1",
);
assert.equal(
  adaptiveProviderRequestMergedAiPdfImport.providerRunPlan.version,
  "provider_run_plan_v1",
);
assert.equal(
  adaptiveProviderRequestMergedAiPdfImport.providerRequestPlan.version,
  "provider_request_plan_v1",
);
assert.equal(
  adaptiveProviderRequestMergedAiPdfImport.extractionBatchPlan.version,
  "extraction_batch_plan_v1",
);
assert.equal(
  adaptiveProviderRequestMergedAiPdfImport.packetPlan.version,
  "packet_plan_v1",
);
assert.equal(
  adaptiveProviderRequestMergedAiPdfImport.preanalysis.version,
  "preanalysis_v1",
);
assert.equal(adaptiveProviderRequestMergedAiPdfImport.chunking.totalChunks, 4);
assert.equal(adaptiveProviderRequestMergedAiPdfImport.provider.id, "provider-1");
assert.deepEqual(adaptiveProviderRequestMergedAiPdfImport.warnings, [
  "keep existing warning",
]);
const missingAdaptiveRereadProviderRequestPlan =
  buildAIAdaptiveRereadProviderRequestPlanFromAdaptiveRereadPlan(null);
assert.equal(missingAdaptiveRereadProviderRequestPlan.status, "skipped");
assert.ok(
  missingAdaptiveRereadProviderRequestPlan.warnings.includes(
    "adaptive_reread_provider_request_missing_reread_plan",
  ),
);
console.log(
  "PASS AI adaptive reread provider request builder creates shadow-only bounded request drafts and preserves summary metadata",
);

const adaptiveRereadRunPlan =
  buildAIAdaptiveRereadRunPlanFromProviderRequestPlan({
    mode: "dry_run",
    providerRequestPlan: adaptiveRereadProviderRequestPlan,
  });
assert.equal(adaptiveRereadRunPlan.version, "adaptive_reread_run_plan_v1");
assert.equal(adaptiveRereadRunPlan.mode, "dry_run");
assert.ok(
  adaptiveRereadRunPlan.status === "completed" ||
    adaptiveRereadRunPlan.status === "completed_with_warnings",
);
assert.equal(
  adaptiveRereadRunPlan.requestRuns.length,
  adaptiveRereadProviderRequestPlan.requests.length,
);
for (const [index, request] of adaptiveRereadProviderRequestPlan.requests.entries()) {
  const run = adaptiveRereadRunPlan.requestRuns[index];

  assert.equal(run.requestId, request.requestId);
  assert.equal(run.requestHash, request.requestHash);
  assert.equal(run.rereadRequestId, request.rereadRequestId);
  assert.equal(run.rereadRequestHash, request.rereadRequestHash);
  assert.deepEqual(run.packetIds, request.packetIds);
  assert.deepEqual(run.packetHashes, request.packetHashes);
  assert.deepEqual(run.pageWindow.pageNumbers, request.pageWindow.pageNumbers);
  assert.equal(run.pageWindow.pageNumbers.length <= 3, true);
  assert.equal(run.provider.realCall, false);
  assert.equal(run.outputContract.jsonOnly, true);
  assert.equal(run.outputContract.preservePacketIds, true);
  assert.equal(run.outputContract.preservePacketHashes, true);
  assert.equal(run.outputContract.adaptiveRereadOnly, true);

  if (request.kind === "adaptive_review_only") {
    assert.equal(run.status, "skipped");
    assert.equal(run.dryRunResult, undefined);
    assert.ok(run.warnings.includes("adaptive_reread_run_review_only_skipped"));
  } else {
    assert.equal(run.status, "simulated");
    assert.equal(run.dryRunResult?.mergeIntent.officialMerge, false);
    assert.equal(run.dryRunResult?.mergeIntent.reviewDraftWrite, false);
    assert.equal(run.dryRunResult?.mergeIntent.adaptiveRereadOnly, true);
    assert.equal(run.dryRunResult?.resultCount, request.packetIds.length);
    assert.deepEqual(run.dryRunResult?.packetIds, request.packetIds);
    assert.equal(run.dryRunResult?.validation.valid, true);
  }
}
const lowTextRun = adaptiveRereadRunPlan.requestRuns.find(
  (run) => run.kind === "adaptive_low_text_confidence_review",
);
assert.ok(lowTextRun?.warnings.includes("adaptive_reread_run_low_text_confidence"));
const mixedRun = adaptiveRereadRunPlan.requestRuns.find(
  (run) => run.kind === "adaptive_mixed_layout_review",
);
assert.ok(
  mixedRun?.warnings.some((warning) =>
    warning.includes("adaptive_reread_run_validation_warning"),
  ),
);
const adaptiveDryRun = simulateAdaptiveRereadDryRun(
  adaptiveRereadProviderRequestPlan.requests[0],
);
assert.equal(adaptiveDryRun.mergeIntent.officialMerge, false);
assert.equal(adaptiveDryRun.mergeIntent.reviewDraftWrite, false);
assert.equal(adaptiveDryRun.mergeIntent.adaptiveRereadOnly, true);
assert.equal(adaptiveDryRun.validation.valid, true);
const badAdaptiveDryRunValidation = validateAdaptiveRereadDryRunOutput({
  packetHashes: ["expected-hash"],
  packetIds: ["expected-packet"],
  rereadRequestHash: "expected-reread-hash",
  rereadRequestId: "expected-reread-id",
  requestHash: "expected-request-hash",
  requestId: "expected-request-id",
  results: [
    {
      mergeIntent: {
        adaptiveRereadOnly: false,
        officialMerge: true,
        reviewDraftWrite: true,
      },
      packetHash: "wrong-hash",
      packetId: "expected-packet",
      question: {
        answer: "invented answer",
        explanation: "invented explanation",
      },
      rereadRequestHash: "expected-reread-hash",
      rereadRequestId: "expected-reread-id",
      requestHash: "expected-request-hash",
      requestId: "expected-request-id",
      version: "question_extract_v1",
    },
  ],
});
assert.equal(badAdaptiveDryRunValidation.valid, false);
assert.ok(
  badAdaptiveDryRunValidation.errors.includes("result_0_packet_hash_mismatch"),
);
assert.ok(
  badAdaptiveDryRunValidation.errors.includes(
    "result_0_dry_run_answer_must_be_null",
  ),
);
assert.ok(
  badAdaptiveDryRunValidation.errors.includes(
    "result_0_dry_run_explanation_must_be_null",
  ),
);
assert.ok(
  badAdaptiveDryRunValidation.errors.includes(
    "result_0_merge_intent_must_stay_shadow_only",
  ),
);
const unknownAdaptiveRereadRun = buildAdaptiveRereadRequestRun({
  mode: "dry_run",
  request: {
    ...adaptiveRereadProviderRequestPlan.requests[0],
    kind: "adaptive_unknown_kind",
    requestHash: "adaptive-unknown-request-hash",
    requestId: "adaptive-unknown-request",
  },
});
assert.equal(unknownAdaptiveRereadRun.status, "skipped");
assert.equal(unknownAdaptiveRereadRun.provider.realCall, false);
assert.ok(
  unknownAdaptiveRereadRun.warnings.includes(
    "adaptive_reread_run_unknown_request_kind",
  ),
);
const adaptiveRereadRunJson = JSON.stringify(adaptiveRereadRunPlan);
assert.equal(
  /data:image|;base64,|JVBERi0|iVBORw0KGgo|rawProviderResponse/i.test(
    adaptiveRereadRunJson,
  ),
  false,
);
const adaptiveRereadRunMergedAiPdfImport =
  mergeAIAdaptiveRereadRunPlanIntoSummary(
    adaptiveProviderRequestMergedAiPdfImport,
    adaptiveRereadRunPlan,
  );
assert.equal(
  adaptiveRereadRunMergedAiPdfImport.adaptiveRereadRunPlan.version,
  "adaptive_reread_run_plan_v1",
);
assert.equal(
  adaptiveRereadRunMergedAiPdfImport.adaptiveRereadProviderRequestPlan.version,
  "adaptive_reread_provider_request_plan_v1",
);
assert.equal(
  adaptiveRereadRunMergedAiPdfImport.adaptiveRereadPlan.version,
  "adaptive_reread_plan_v1",
);
assert.equal(
  adaptiveRereadRunMergedAiPdfImport.providerRunPlan.version,
  "provider_run_plan_v1",
);
assert.equal(
  adaptiveRereadRunMergedAiPdfImport.providerRequestPlan.version,
  "provider_request_plan_v1",
);
assert.equal(
  adaptiveRereadRunMergedAiPdfImport.extractionBatchPlan.version,
  "extraction_batch_plan_v1",
);
assert.equal(adaptiveRereadRunMergedAiPdfImport.packetPlan.version, "packet_plan_v1");
assert.equal(adaptiveRereadRunMergedAiPdfImport.preanalysis.version, "preanalysis_v1");
assert.equal(adaptiveRereadRunMergedAiPdfImport.chunking.totalChunks, 4);
assert.equal(adaptiveRereadRunMergedAiPdfImport.provider.id, "provider-1");
assert.deepEqual(adaptiveRereadRunMergedAiPdfImport.warnings, [
  "keep existing warning",
]);
const missingAdaptiveRereadRunPlan =
  buildAIAdaptiveRereadRunPlanFromProviderRequestPlan({
    providerRequestPlan: null,
  });
assert.equal(missingAdaptiveRereadRunPlan.status, "skipped");
assert.ok(
  missingAdaptiveRereadRunPlan.warnings.includes(
    "adaptive_reread_run_missing_provider_request_plan",
  ),
);
console.log(
  "PASS AI adaptive reread runner creates shadow dry-run metadata without real provider calls or merge intent",
);

const adaptiveRereadMergePlan = buildAIAdaptiveRereadMergePlanFromSummary(
  adaptiveRereadRunMergedAiPdfImport,
);
assert.equal(
  adaptiveRereadMergePlan.version,
  "adaptive_reread_merge_plan_v1",
);
assert.equal(adaptiveRereadMergePlan.mode, "planning_only");
assert.ok(
  adaptiveRereadMergePlan.status === "completed" ||
    adaptiveRereadMergePlan.status === "completed_with_warnings",
);
assert.ok(adaptiveRereadMergePlan.mergeItems.length > 0);
assert.equal(
  adaptiveRereadMergePlan.mergeItems.every(
    (item) =>
      item.mergePolicy.officialMerge === false &&
      item.mergePolicy.reviewDraftWrite === false &&
      item.mergePolicy.overwriteExistingField === false &&
      item.mergePolicy.requireHumanReview === true &&
      item.mergePolicy.preserveOriginalValue === true &&
      item.mergePolicy.attachAsSuggestionOnly === true,
  ),
  true,
);
assert.equal(
  adaptiveRereadMergePlan.mergeItems.every(
    (item) => item.packetId && item.packetHash,
  ),
  true,
);
assert.equal(
  adaptiveRereadMergePlan.mergeItems.some(
    (item) => item.rereadRequestId && item.rereadRequestHash,
  ),
  true,
);
assert.equal(
  adaptiveRereadMergePlan.mergeItems.some(
    (item) => item.requestId && item.requestHash,
  ),
  true,
);
assert.equal(
  adaptiveRereadMergePlan.mergeItems.some((item) => item.runId),
  true,
);
assert.ok(
  adaptiveRereadMergePlan.mergeItems.some(
    (item) =>
      item.action === "suggest_extend_source_pages" &&
      item.field === "sourcePages",
  ),
);
assert.ok(
  adaptiveRereadMergePlan.mergeItems.some(
    (item) =>
      item.action === "suggest_attach_asset_ref" ||
      item.field === "assetRefs",
  ),
);
assert.ok(
  adaptiveRereadMergePlan.mergeItems.some(
    (item) =>
      item.action === "flag_review_required" ||
      item.action === "skip",
  ),
);
assert.ok(
  adaptiveRereadMergePlan.mergeItems.some((item) =>
    item.warnings.includes("adaptive_reread_merge_dry_run_only"),
  ),
);
assert.equal(
  adaptiveRereadMergePlan.mergeItems.some((item) =>
    /recovered|invented|Dry run placeholder/i.test(JSON.stringify(item)),
  ),
  false,
);
const adaptiveRereadMergeItems = buildAdaptiveRereadMergeItems(
  adaptiveRereadRunMergedAiPdfImport,
);
assert.deepEqual(
  adaptiveRereadMergeItems.map((item) => item.mergeItemHash),
  adaptiveRereadMergePlan.mergeItems.map((item) => item.mergeItemHash),
);
const adaptiveRereadMergeJson = JSON.stringify(adaptiveRereadMergePlan);
assert.equal(
  /data:image|;base64,|JVBERi0|iVBORw0KGgo|rawProviderResponse|fullPdfText|imageBytes/i.test(
    adaptiveRereadMergeJson,
  ),
  false,
);
const adaptiveRereadMergeMergedAiPdfImport =
  mergeAIAdaptiveRereadMergePlanIntoSummary(
    adaptiveRereadRunMergedAiPdfImport,
    adaptiveRereadMergePlan,
  );
assert.equal(
  adaptiveRereadMergeMergedAiPdfImport.adaptiveRereadMergePlan.version,
  "adaptive_reread_merge_plan_v1",
);
assert.equal(
  adaptiveRereadMergeMergedAiPdfImport.adaptiveRereadRunPlan.version,
  "adaptive_reread_run_plan_v1",
);
assert.equal(
  adaptiveRereadMergeMergedAiPdfImport.adaptiveRereadProviderRequestPlan
    .version,
  "adaptive_reread_provider_request_plan_v1",
);
assert.equal(
  adaptiveRereadMergeMergedAiPdfImport.adaptiveRereadPlan.version,
  "adaptive_reread_plan_v1",
);
assert.equal(
  adaptiveRereadMergeMergedAiPdfImport.providerRunPlan.version,
  "provider_run_plan_v1",
);
assert.equal(
  adaptiveRereadMergeMergedAiPdfImport.providerRequestPlan.version,
  "provider_request_plan_v1",
);
assert.equal(
  adaptiveRereadMergeMergedAiPdfImport.extractionBatchPlan.version,
  "extraction_batch_plan_v1",
);
assert.equal(
  adaptiveRereadMergeMergedAiPdfImport.packetPlan.version,
  "packet_plan_v1",
);
assert.equal(
  adaptiveRereadMergeMergedAiPdfImport.preanalysis.version,
  "preanalysis_v1",
);
assert.equal(adaptiveRereadMergeMergedAiPdfImport.chunking.totalChunks, 4);
assert.equal(adaptiveRereadMergeMergedAiPdfImport.provider.id, "provider-1");
assert.deepEqual(adaptiveRereadMergeMergedAiPdfImport.warnings, [
  "keep existing warning",
]);
const missingAdaptiveRereadMergePlan =
  buildAIAdaptiveRereadMergePlanFromSummary({
    adaptiveRereadPlan,
    adaptiveRereadProviderRequestPlan,
  });
assert.equal(missingAdaptiveRereadMergePlan.status, "skipped");
assert.ok(
  missingAdaptiveRereadMergePlan.warnings.includes(
    "adaptive_reread_merge_missing_run_plan",
  ),
);
const unknownAdaptiveRereadMergePlan =
  buildAIAdaptiveRereadMergePlanFromSummary({
    adaptiveRereadPlan,
    adaptiveRereadProviderRequestPlan: {
      ...adaptiveRereadProviderRequestPlan,
      requests: [
        {
          ...adaptiveRereadProviderRequestPlan.requests[0],
          kind: "adaptive_unknown_case",
          requestHash: "adaptive-unknown-merge-request-hash",
          requestId: "adaptive-unknown-merge-request",
        },
      ],
    },
    adaptiveRereadRunPlan: {
      ...adaptiveRereadRunPlan,
      requestRuns: [
        {
          ...adaptiveRereadRunPlan.requestRuns[0],
          kind: "adaptive_unknown_case",
          requestHash: "adaptive-unknown-merge-request-hash",
          requestId: "adaptive-unknown-merge-request",
          runId: "adaptive-unknown-merge-run",
          status: "skipped",
        },
      ],
    },
  });
assert.ok(
  unknownAdaptiveRereadMergePlan.mergeItems.some(
    (item) =>
      item.action === "skip" &&
      item.reason.code === "unsupported_merge_case",
  ),
);
assert.ok(
  unknownAdaptiveRereadMergePlan.warnings.includes(
    "adaptive_reread_merge_unknown_case_skipped",
  ),
);
console.log(
  "PASS AI adaptive reread merge planner creates suggestion-only metadata and preserves prior parsing summaries",
);

const taxonomy = getControlledAITagTaxonomy();
for (const tagId of [
  "subject.math",
  "course.sat_math",
  "domain.advanced_math",
  "unit.quadratics",
  "skill.factor_quadratic",
  "subskill.difference_of_squares",
  "skill.slope_intercept",
  "skill.conditional_probability",
  "format.table_based",
  "format.image_based",
]) {
  assert.ok(
    taxonomy.some((tag) => tag.id === tagId),
    `controlled taxonomy should include ${tagId}`,
  );
}
assert.equal(findTaxonomyTagById("skill.factor_quadratic")?.level, "skill");

const taggingEvidence = [
  {
    kind: "text_snippet",
    message: "Fixture evidence.",
    packetIds: ["packet-tagging"],
    pageNumbers: [1],
    snippet: "Factor the quadratic x^2 - 9.",
  },
];
assert.equal(
  validateTagSuggestionAgainstTaxonomy({
    confidence: 0.8,
    evidence: taggingEvidence,
    reasonCodes: ["fixture"],
    source: "local_rule",
    tagId: "freeform.not_allowed",
  }).valid,
  false,
);
assert.ok(
  validateTagSuggestionAgainstTaxonomy({
    confidence: 0.9,
    evidence: taggingEvidence,
    label: "Freeform Algebra",
    level: "skill",
    parentTagIds: ["unit.quadratics"],
    reasonCodes: ["fixture"],
    reviewRequired: false,
    source: "local_rule",
    status: "suggested",
    tagId: "skill.factor_quadratic",
  }).errors.includes("unsupported_freeform_label"),
);
assert.ok(
  validateTagSuggestionAgainstTaxonomy({
    confidence: 0.9,
    evidence: taggingEvidence,
    parentTagIds: [],
    reasonCodes: ["fixture"],
    source: "local_rule",
    tagId: "skill.factor_quadratic",
  }).warnings.includes("parent_tag_context_missing"),
);
assert.equal(
  normalizeTagSuggestion({
    confidence: 1.8,
    evidence: taggingEvidence,
    reasonCodes: ["fixture"],
    source: "local_rule",
    tagId: "skill.factor_quadratic",
  }).confidence,
  1,
);

const taggingTargetBase = {
  assetRefCount: 0,
  batchIds: ["batch-tagging"],
  choiceMarkerCount: 0,
  pageClassHints: [],
  packetHash: "packet-hash-tagging",
  packetId: "packet-tagging",
  packetKind: "pdf_question_candidate",
  providerRequestIds: ["request-tagging"],
  sourceKind: "pdf",
  sourcePages: [1],
  targetId: "target-tagging",
};
const normalizedTagsFor = (target) =>
  buildRuleBasedTagSuggestionsForTarget(target).map((suggestion) =>
    normalizeTagSuggestion(suggestion),
  );
const tagIdsFor = (target) =>
  new Set(normalizedTagsFor(target).map((suggestion) => suggestion.tagId));
const quadraticTagIds = tagIdsFor({
  ...taggingTargetBase,
  choiceMarkerCount: 4,
  textPreview:
    "Factor the quadratic x^2 - 9 by using the difference of squares and identify the vertex of the parabola.",
});
assert.ok(quadraticTagIds.has("unit.quadratics"));
assert.ok(quadraticTagIds.has("skill.factor_quadratic"));
assert.ok(quadraticTagIds.has("subskill.difference_of_squares"));
assert.ok(quadraticTagIds.has("format.multiple_choice"));

const slopeTagIds = tagIdsFor({
  ...taggingTargetBase,
  textPreview: "Find the slope and y-intercept of a linear function.",
});
assert.ok(slopeTagIds.has("domain.algebra"));
assert.ok(slopeTagIds.has("skill.slope_intercept"));

const probabilityTagIds = tagIdsFor({
  ...taggingTargetBase,
  textPreview:
    "Use the two-way table to find the conditional probability given that the student chose math.",
});
assert.ok(probabilityTagIds.has("skill.conditional_probability"));
assert.ok(probabilityTagIds.has("skill.two_way_table"));
assert.ok(probabilityTagIds.has("format.table_based"));

const assetTagIds = tagIdsFor({
  ...taggingTargetBase,
  assetRefCount: 1,
  packetKind: "pdf_asset_linked",
  textPreview: "Use the diagram image to answer the question.",
});
assert.ok(assetTagIds.has("format.image_based"));
assert.ok(assetTagIds.has("format.diagram_based"));

const taggingPackets = [
  {
    ...makeExtractionPacket({ index: 20, pageNumbers: [1] }),
    packetHash: "tagging-packet-hash-quadratic",
    packetId: "tagging-packet-quadratic",
    textPreview:
      "Factor the quadratic x^2 - 9 by using the difference of squares and identify the vertex of the parabola. A. 1 B. 2",
  },
  {
    ...makeExtractionPacket({ index: 21, pageNumbers: [2] }),
    packetHash: "tagging-packet-hash-slope",
    packetId: "tagging-packet-slope",
    textPreview: "Find the slope and y-intercept of a linear function.",
  },
  {
    ...makeExtractionPacket({ index: 22, pageNumbers: [3] }),
    packetHash: "tagging-packet-hash-table",
    packetId: "tagging-packet-table",
    textPreview:
      "Use the two-way table to find the conditional probability given that the student chose math.",
  },
  {
    ...makeExtractionPacket({
      assetRefs: [{ assetHintIndex: 0, kind: "figure", pageNumber: 4 }],
      index: 23,
      kind: "pdf_asset_linked",
      pageNumbers: [4],
    }),
    packetHash: "tagging-packet-hash-asset",
    packetId: "tagging-packet-asset",
    textPreview: "Use the graph and diagram to answer the question.",
  },
  {
    ...makeExtractionPacket({ index: 24, pageNumbers: [5] }),
    packetHash: "tagging-packet-hash-generic",
    packetId: "tagging-packet-generic",
    textPreview: "Look at the item and answer.",
  },
];
const taggingAiPdfImport = {
  ...adaptiveRereadMergeMergedAiPdfImport,
  packetPlan: {
    ...pdfPacketPlan,
    packets: taggingPackets,
  },
};
const taggingPlan = buildAITaggingV2PlanFromSummary(taggingAiPdfImport);
assert.equal(taggingPlan.version, "tagging_v2_plan_v1");
assert.equal(taggingPlan.mode, "planning_only");
assert.equal(taggingPlan.taxonomyVersion, "edu_taxonomy_v1");
assert.equal(taggingPlan.sourceKind, "pdf");
assert.equal(taggingPlan.targets.length, taggingPackets.length);
assert.ok(taggingPlan.stats.suggestionCount > 0);
assert.ok(taggingPlan.stats.reviewRequiredCount > 0);
assert.ok(
  taggingPlan.targets.every((target) => target.packetId && target.packetHash),
);
assert.ok(
  taggingPlan.targets.every((target) =>
    target.suggestions.every(
      (suggestion) =>
        suggestion.status === "rejected_by_validator" ||
        Boolean(findTaxonomyTagById(suggestion.tagId)),
    ),
  ),
);
assert.ok(
  taggingPlan.targets.every((target) =>
    target.suggestions.every((suggestion) => suggestion.evidence.length > 0),
  ),
);
assert.ok(
  taggingPlan.targets.some(
    (target) =>
      target.packetId === "tagging-packet-generic" &&
      target.validation.genericOnly &&
      target.suggestions.every((suggestion) => suggestion.reviewRequired),
  ),
);
assert.ok(
  taggingPlan.targets.every((target) => {
    const tagIds = target.suggestions.map((suggestion) => suggestion.tagId);
    return tagIds.length === new Set(tagIds).size && tagIds.length <= 8;
  }),
);
assert.equal(
  /data:image|;base64,|JVBERi0|iVBORw0KGgo|rawProviderResponse|fullPdfText|imageBytes/i.test(
    JSON.stringify(taggingPlan),
  ),
  false,
);
const taggingMergedAiPdfImport = mergeAITaggingV2PlanIntoSummary(
  adaptiveRereadMergeMergedAiPdfImport,
  taggingPlan,
);
assert.equal(taggingMergedAiPdfImport.taggingV2Plan.version, "tagging_v2_plan_v1");
assert.equal(
  taggingMergedAiPdfImport.adaptiveRereadMergePlan.version,
  "adaptive_reread_merge_plan_v1",
);
assert.equal(
  taggingMergedAiPdfImport.adaptiveRereadRunPlan.version,
  "adaptive_reread_run_plan_v1",
);
assert.equal(
  taggingMergedAiPdfImport.adaptiveRereadProviderRequestPlan.version,
  "adaptive_reread_provider_request_plan_v1",
);
assert.equal(
  taggingMergedAiPdfImport.adaptiveRereadPlan.version,
  "adaptive_reread_plan_v1",
);
assert.equal(taggingMergedAiPdfImport.providerRunPlan.version, "provider_run_plan_v1");
assert.equal(
  taggingMergedAiPdfImport.providerRequestPlan.version,
  "provider_request_plan_v1",
);
assert.equal(
  taggingMergedAiPdfImport.extractionBatchPlan.version,
  "extraction_batch_plan_v1",
);
assert.equal(taggingMergedAiPdfImport.packetPlan.version, "packet_plan_v1");
assert.equal(taggingMergedAiPdfImport.preanalysis.version, "preanalysis_v1");
assert.equal(taggingMergedAiPdfImport.chunking.totalChunks, 4);
assert.equal(taggingMergedAiPdfImport.provider.id, "provider-1");
assert.deepEqual(taggingMergedAiPdfImport.warnings, ["keep existing warning"]);
console.log(
  "PASS AI tagging v2 controlled taxonomy creates evidence-based planning-only suggestions and preserves summary metadata",
);

const starterDraftPacks = buildStarterTaxonomyDraftPacks();
assert.ok(
  starterDraftPacks.some((pack) => pack.packId === "sat_math_v1_draft"),
);
assert.ok(
  starterDraftPacks.some((pack) => pack.packId === "general_math_v1_draft"),
);
assert.ok(starterDraftPacks.length >= 2);
assert.ok(
  starterDraftPacks.every(
    (pack) =>
      pack.status === "draft" ||
      pack.status === "pending_review" ||
      pack.tagDrafts.length > 0,
  ),
);
assert.ok(
  starterDraftPacks
    .flatMap((pack) => pack.tagDrafts)
    .every(
      (tag) =>
        tag.status !== "approved" &&
        tag.evidence.length > 0 &&
        tag.description &&
        tag.exampleSignals.length > 0 &&
        Array.isArray(tag.aliases) &&
        (["subject", "format", "difficulty", "cognitive_process", "error_type"].includes(
          tag.level,
        ) ||
          tag.parentTagIds.length > 0),
    ),
);
const invalidDraftValidation = validateTaxonomyDraftTag({
  draftTag: {
    aliases: [],
    evidence: [],
    label: "Algebra",
    level: "skill",
    parentTagIds: [],
    proposedOfficialId: "freeform bad id",
  },
  knownDraftIds: [],
});
assert.equal(invalidDraftValidation.valid, false);
assert.ok(invalidDraftValidation.errors.includes("invalid_id_shape"));
assert.ok(invalidDraftValidation.errors.includes("missing_parent"));
assert.ok(invalidDraftValidation.errors.includes("missing_evidence"));
const missingParentValidation = validateTaxonomyDraftTag({
  draftTag: {
    aliases: [],
    evidence: [
      {
        kind: "text_signal",
        message: "evidence",
        packetIds: ["packet-missing-parent"],
        pageNumbers: [1],
        snippet: "piecewise",
      },
    ],
    label: "Piecewise function intervals",
    level: "skill",
    parentTagIds: [],
    proposedOfficialId: "skill.piecewise_function_intervals",
  },
  knownDraftIds: [],
});
assert.equal(missingParentValidation.valid, false);
assert.ok(missingParentValidation.errors.includes("missing_parent"));

const rejectedTaggingTarget = {
  batchIds: ["batch-rejected"],
  packetHash: "tagging-packet-hash-rejected",
  packetId: "tagging-packet-rejected",
  providerRequestIds: ["request-rejected"],
  sourcePages: [6],
  suggestions: [
    {
      confidence: 0.77,
      evidence: [
        {
          kind: "text_snippet",
          message: "Rejected freeform fixture.",
          packetIds: ["tagging-packet-rejected"],
          pageNumbers: [6],
          snippet: "A rational function has an asymptote.",
        },
      ],
      label: "Rational asymptote",
      level: "skill",
      parentTagIds: [],
      reasonCodes: ["unknown_taxonomy_tag"],
      reviewRequired: true,
      source: "future_ai_ranked",
      status: "rejected_by_validator",
      tagId: "freeform.rational_asymptote",
    },
    {
      confidence: 0.5,
      evidence: [
        {
          kind: "text_snippet",
          message: "Generic subject fixture.",
          packetIds: ["tagging-packet-rejected"],
          pageNumbers: [6],
          snippet: "A rational function has an asymptote.",
        },
      ],
      label: "Math",
      level: "subject",
      parentTagIds: [],
      reasonCodes: ["generic_fixture"],
      reviewRequired: true,
      source: "local_rule",
      status: "review_required",
      tagId: "subject.math",
    },
  ],
  targetHash: "tagging-target-hash-rejected",
  targetId: "tagging-target-rejected",
  textPreview:
    "A rational function has an asymptote. It appears in a calculator active section.",
  validation: {
    errors: [],
    genericOnly: true,
    hasEvidence: true,
    hasSkillLevelTag: false,
    valid: true,
    warnings: ["tagging_v2_generic_only"],
  },
  warnings: ["tagging_v2_generic_only"],
};
const taxonomyBootstrapInput = {
  ...taggingMergedAiPdfImport,
  taggingV2Plan: {
    ...taggingPlan,
    targets: [...taggingPlan.targets, rejectedTaggingTarget],
  },
};
const taxonomyBootstrapPlan =
  buildAITaxonomyBootstrapPlanFromSummary(taxonomyBootstrapInput);
assert.equal(taxonomyBootstrapPlan.version, "taxonomy_bootstrap_plan_v1");
assert.equal(taxonomyBootstrapPlan.mode, "planning_only");
assert.equal(taxonomyBootstrapPlan.taxonomyVersion, "edu_taxonomy_v1");
assert.equal(taxonomyBootstrapPlan.sourceKind, "pdf");
assert.ok(taxonomyBootstrapPlan.draftPacks.length >= 2);
assert.ok(taxonomyBootstrapPlan.stats.draftTagCount > 0);
assert.ok(taxonomyBootstrapPlan.candidateQueue.length > 0);
assert.ok(taxonomyBootstrapPlan.aliasCandidates.length > 0);
assert.ok(taxonomyBootstrapPlan.reviewActions.length > 0);
assert.ok(
  taxonomyBootstrapPlan.warnings.includes("taxonomy_bootstrap_planning_only"),
);
assert.ok(
  taxonomyBootstrapPlan.warnings.includes("taxonomy_bootstrap_no_ai_generation"),
);
assert.ok(
  taxonomyBootstrapPlan.warnings.includes(
    "taxonomy_bootstrap_no_official_tag_write",
  ),
);
assert.ok(
  taxonomyBootstrapPlan.candidateQueue.some(
    (candidate) => candidate.source === "tagging_v2_generic_only",
  ),
);
assert.ok(
  taxonomyBootstrapPlan.candidateQueue.some(
    (candidate) => candidate.source === "tagging_v2_rejected_freeform",
  ),
);
assert.ok(
  taxonomyBootstrapPlan.candidateQueue.some((candidate) =>
    candidate.proposedLabel.includes("Rational function"),
  ),
);
assert.ok(
  taxonomyBootstrapPlan.candidateQueue.every(
    (candidate) =>
      candidate.status === "pending_review" &&
      candidate.evidence.length > 0 &&
      candidate.nearestExistingTags.length > 0,
  ),
);
assert.ok(
  taxonomyBootstrapPlan.aliasCandidates.every(
    (alias) =>
      alias.status === "pending_review" &&
      alias.evidence.length > 0 &&
      alias.targetTagId,
  ),
);
assert.ok(
  taxonomyBootstrapPlan.reviewActions.every(
    (action) => action.humanRequired === true,
  ),
);
assert.equal(
  taxonomyBootstrapPlan.candidateQueue.some(
    (candidate) => candidate.status !== "pending_review",
  ),
  false,
);
assert.equal(
  taxonomyBootstrapPlan.draftPacks
    .flatMap((pack) => pack.tagDrafts)
    .some((tag) => tag.status === "approved"),
  false,
);
assert.equal(
  /question_tags|reviewDraftTags|officialTagWrite|data:image|;base64,|JVBERi0|iVBORw0KGgo|rawProviderResponse|fullPdfText|imageBytes/i.test(
    JSON.stringify(taxonomyBootstrapPlan),
  ),
  false,
);
const taxonomyBootstrapMergedAiPdfImport =
  mergeAITaxonomyBootstrapPlanIntoSummary(
    taggingMergedAiPdfImport,
    taxonomyBootstrapPlan,
  );
assert.equal(
  taxonomyBootstrapMergedAiPdfImport.taxonomyBootstrapPlan.version,
  "taxonomy_bootstrap_plan_v1",
);
assert.equal(
  taxonomyBootstrapMergedAiPdfImport.taggingV2Plan.version,
  "tagging_v2_plan_v1",
);
assert.equal(
  taxonomyBootstrapMergedAiPdfImport.adaptiveRereadMergePlan.version,
  "adaptive_reread_merge_plan_v1",
);
assert.equal(
  taxonomyBootstrapMergedAiPdfImport.adaptiveRereadRunPlan.version,
  "adaptive_reread_run_plan_v1",
);
assert.equal(
  taxonomyBootstrapMergedAiPdfImport.adaptiveRereadProviderRequestPlan.version,
  "adaptive_reread_provider_request_plan_v1",
);
assert.equal(
  taxonomyBootstrapMergedAiPdfImport.adaptiveRereadPlan.version,
  "adaptive_reread_plan_v1",
);
assert.equal(
  taxonomyBootstrapMergedAiPdfImport.providerRunPlan.version,
  "provider_run_plan_v1",
);
assert.equal(
  taxonomyBootstrapMergedAiPdfImport.providerRequestPlan.version,
  "provider_request_plan_v1",
);
assert.equal(
  taxonomyBootstrapMergedAiPdfImport.extractionBatchPlan.version,
  "extraction_batch_plan_v1",
);
assert.equal(taxonomyBootstrapMergedAiPdfImport.packetPlan.version, "packet_plan_v1");
assert.equal(
  taxonomyBootstrapMergedAiPdfImport.preanalysis.version,
  "preanalysis_v1",
);
assert.equal(taxonomyBootstrapMergedAiPdfImport.chunking.totalChunks, 4);
assert.equal(taxonomyBootstrapMergedAiPdfImport.provider.id, "provider-1");
assert.deepEqual(taxonomyBootstrapMergedAiPdfImport.warnings, [
  "keep existing warning",
]);
console.log(
  "PASS AI taxonomy bootstrap creates draft packs, candidate queues, aliases, and human-review actions without official tag writes",
);

const taxonomyReviewPlan =
  buildAITaxonomyReviewPlanFromBootstrapPlan(taxonomyBootstrapPlan);
assert.equal(taxonomyReviewPlan.version, "taxonomy_review_plan_v1");
assert.equal(taxonomyReviewPlan.mode, "planning_only");
assert.equal(taxonomyReviewPlan.taxonomyVersion, "edu_taxonomy_v1");
assert.ok(taxonomyReviewPlan.actions.length > 0);
assert.ok(taxonomyReviewPlan.stats.actionCount > 0);
assert.ok(
  taxonomyReviewPlan.warnings.includes("taxonomy_review_planning_only"),
);
assert.ok(
  taxonomyReviewPlan.warnings.includes("taxonomy_review_no_db_mutation"),
);
assert.ok(
  taxonomyReviewPlan.warnings.includes("taxonomy_review_no_official_promotion"),
);
assert.ok(
  taxonomyReviewPlan.warnings.includes("taxonomy_review_no_question_tag_write"),
);
assert.ok(
  taxonomyReviewPlan.actions.every(
    (action) =>
      action.targetId &&
      action.actionHash &&
      action.humanReview.required === true &&
      action.humanReview.approved === false &&
      action.humanReview.executed === false,
  ),
);
assert.ok(
  taxonomyReviewPlan.actions.every(
    (action) =>
      action.safety.planningOnly === true &&
      action.safety.dbMutation === false &&
      action.safety.officialPromotion === false &&
      action.safety.officialQuestionTagWrite === false &&
      action.safety.reviewDraftTagWrite === false,
  ),
);
assert.equal(
  taxonomyReviewPlan.actions.some(
    (action) =>
      action.actionType === "merge_as_alias" &&
      Boolean(action.proposedChange.mergeTargetTagId),
  ),
  true,
);
const duplicateBootstrapPlan = {
  ...taxonomyBootstrapPlan,
  candidateQueue: taxonomyBootstrapPlan.candidateQueue.map((candidate, index) =>
    index === 0
      ? {
          ...candidate,
          warnings: [
            ...candidate.warnings,
            "taxonomy_bootstrap_duplicate_likely",
          ],
        }
      : candidate,
  ),
};
const duplicateReviewPlan =
  buildAITaxonomyReviewPlanFromBootstrapPlan(duplicateBootstrapPlan);
const duplicateRiskAction = duplicateReviewPlan.actions.find(
  (action) => action.validation.duplicateRisk,
);
assert.ok(duplicateRiskAction);
const duplicateApproveValidation = validateTaxonomyReviewAction({
  action: {
    ...duplicateRiskAction,
    actionType: "approve_as_official",
    proposedChange: {
      ...duplicateRiskAction.proposedChange,
      proposedOfficialId:
        duplicateRiskAction.proposedChange.proposedOfficialId ??
        "candidate.skill.duplicate",
    },
  },
  bootstrapPlan: duplicateBootstrapPlan,
});
assert.equal(duplicateApproveValidation.valid, false);
assert.ok(
  duplicateApproveValidation.errors.includes("approve_blocked_duplicate_risk"),
);
const parentRiskAction =
  taxonomyReviewPlan.actions.find((action) => action.validation.parentRisk) ??
  taxonomyReviewPlan.actions.find(
    (action) => action.targetType === "candidate_tag",
  );
assert.ok(parentRiskAction);
const parentApproveValidation = validateTaxonomyReviewAction({
  action: {
    ...parentRiskAction,
    actionType: "approve_as_official",
    proposedChange: {
      ...parentRiskAction.proposedChange,
      proposedOfficialId:
        parentRiskAction.proposedChange.proposedOfficialId ??
        "candidate.skill.parent_risk",
    },
  },
  bootstrapPlan: taxonomyBootstrapPlan,
});
assert.equal(parentApproveValidation.valid, false);
assert.ok(parentApproveValidation.errors.includes("approve_blocked_parent_risk"));
const mergeAction =
  taxonomyReviewPlan.actions.find(
    (action) => action.actionType === "merge_as_alias",
  ) ?? taxonomyReviewPlan.actions[0];
const missingMergeTargetValidation = validateTaxonomyReviewAction({
  action: {
    ...mergeAction,
    actionType: "merge_as_alias",
    proposedChange: {
      ...mergeAction.proposedChange,
      mergeTargetLabel: null,
      mergeTargetTagId: null,
    },
  },
  bootstrapPlan: taxonomyBootstrapPlan,
});
assert.equal(missingMergeTargetValidation.valid, false);
assert.ok(
  missingMergeTargetValidation.errors.includes("merge_alias_missing_target"),
);
const rejectAction =
  taxonomyReviewPlan.actions.find((action) => action.actionType === "reject") ??
  taxonomyReviewPlan.actions[0];
const missingRejectReasonValidation = validateTaxonomyReviewAction({
  action: {
    ...rejectAction,
    actionType: "reject",
    proposedChange: {
      ...rejectAction.proposedChange,
      rejectionReason: null,
    },
  },
  bootstrapPlan: taxonomyBootstrapPlan,
});
assert.equal(missingRejectReasonValidation.valid, false);
assert.ok(
  missingRejectReasonValidation.errors.includes("reject_missing_reason"),
);
const unsafeHumanReviewValidation = validateTaxonomyReviewAction({
  action: {
    ...taxonomyReviewPlan.actions[0],
    humanReview: {
      ...taxonomyReviewPlan.actions[0].humanReview,
      approved: true,
    },
  },
  bootstrapPlan: taxonomyBootstrapPlan,
});
assert.equal(unsafeHumanReviewValidation.valid, false);
assert.ok(
  unsafeHumanReviewValidation.errors.includes(
    "missing_human_review_requirement",
  ),
);
const unsafeMutationValidation = validateTaxonomyReviewAction({
  action: {
    ...taxonomyReviewPlan.actions[0],
    safety: {
      ...taxonomyReviewPlan.actions[0].safety,
      dbMutation: true,
    },
  },
  bootstrapPlan: taxonomyBootstrapPlan,
});
assert.equal(unsafeMutationValidation.valid, false);
assert.ok(unsafeMutationValidation.errors.includes("unsafe_action_flags"));
const patchPreview = buildTaxonomyPatchPreview(taxonomyReviewPlan.actions);
assert.equal(patchPreview.mode, "preview_only");
assert.equal(patchPreview.officialMutation, false);
assert.equal(
  patchPreview.approvedTagPreviews.every((preview) => preview.sourceActionId),
  true,
);
assert.equal(
  patchPreview.aliasMergePreviews.every((preview) => preview.sourceActionId),
  true,
);
assert.equal(
  patchPreview.rejectedTargetPreviews.every((preview) => preview.sourceActionId),
  true,
);
assert.equal(
  patchPreview.pendingTargetPreviews.every((preview) => preview.sourceActionId),
  true,
);
assert.equal(
  /question_tags|reviewDraftTags|officialTagWrite|data:image|;base64,|JVBERi0|iVBORw0KGgo|rawProviderResponse|fullPdfText|imageBytes/i.test(
    JSON.stringify(taxonomyReviewPlan),
  ),
  false,
);
const taxonomyReviewMergedAiPdfImport = mergeAITaxonomyReviewPlanIntoSummary(
  taxonomyBootstrapMergedAiPdfImport,
  taxonomyReviewPlan,
);
assert.equal(
  taxonomyReviewMergedAiPdfImport.taxonomyReviewPlan.version,
  "taxonomy_review_plan_v1",
);
assert.equal(
  taxonomyReviewMergedAiPdfImport.taxonomyBootstrapPlan.version,
  "taxonomy_bootstrap_plan_v1",
);
assert.equal(
  taxonomyReviewMergedAiPdfImport.taggingV2Plan.version,
  "tagging_v2_plan_v1",
);
assert.equal(
  taxonomyReviewMergedAiPdfImport.adaptiveRereadMergePlan.version,
  "adaptive_reread_merge_plan_v1",
);
assert.equal(
  taxonomyReviewMergedAiPdfImport.adaptiveRereadRunPlan.version,
  "adaptive_reread_run_plan_v1",
);
assert.equal(
  taxonomyReviewMergedAiPdfImport.adaptiveRereadProviderRequestPlan.version,
  "adaptive_reread_provider_request_plan_v1",
);
assert.equal(
  taxonomyReviewMergedAiPdfImport.adaptiveRereadPlan.version,
  "adaptive_reread_plan_v1",
);
assert.equal(
  taxonomyReviewMergedAiPdfImport.providerRunPlan.version,
  "provider_run_plan_v1",
);
assert.equal(
  taxonomyReviewMergedAiPdfImport.providerRequestPlan.version,
  "provider_request_plan_v1",
);
assert.equal(
  taxonomyReviewMergedAiPdfImport.extractionBatchPlan.version,
  "extraction_batch_plan_v1",
);
assert.equal(taxonomyReviewMergedAiPdfImport.packetPlan.version, "packet_plan_v1");
assert.equal(taxonomyReviewMergedAiPdfImport.preanalysis.version, "preanalysis_v1");
assert.equal(taxonomyReviewMergedAiPdfImport.chunking.totalChunks, 4);
assert.equal(taxonomyReviewMergedAiPdfImport.provider.id, "provider-1");
assert.deepEqual(taxonomyReviewMergedAiPdfImport.warnings, [
  "keep existing warning",
]);
const missingBootstrapReviewPlan =
  buildAITaxonomyReviewPlanFromBootstrapPlan(null);
assert.equal(missingBootstrapReviewPlan.status, "skipped");
assert.ok(
  missingBootstrapReviewPlan.warnings.includes(
    "taxonomy_review_missing_bootstrap_plan",
  ),
);
console.log(
  "PASS AI taxonomy review actions create human-review-required preview-only plans without DB mutation",
);

const taxonomyPersistencePlan = buildAITaxonomyPersistencePlanFromSummary(
  taxonomyReviewMergedAiPdfImport,
);
assert.equal(taxonomyPersistencePlan.version, "taxonomy_persistence_plan_v1");
assert.equal(taxonomyPersistencePlan.mode, "planning_only");
assert.equal(taxonomyPersistencePlan.taxonomyVersion, "edu_taxonomy_v1");
assert.equal(taxonomyPersistencePlan.sourcePlans.taggingV2PlanPresent, true);
assert.equal(
  taxonomyPersistencePlan.sourcePlans.taxonomyBootstrapPlanPresent,
  true,
);
assert.equal(taxonomyPersistencePlan.sourcePlans.taxonomyReviewPlanPresent, true);
assert.equal(
  taxonomyPersistencePlan.proposedStorageModel.mode,
  "proposal_only",
);
assert.equal(taxonomyPersistencePlan.proposedStorageModel.noMigrationAdded, true);
const proposedTableNames = taxonomyPersistencePlan.proposedStorageModel.tables.map(
  (table) => table.tableName,
);
for (const tableName of [
  "taxonomy_packs",
  "taxonomy_tags",
  "taxonomy_tag_aliases",
  "taxonomy_tag_edges",
  "taxonomy_review_actions",
  "taxonomy_pack_versions",
  "question_tag_assignments",
]) {
  assert.ok(proposedTableNames.includes(tableName));
}
assert.equal(
  taxonomyPersistencePlan.proposedStorageModel.tables.find(
    (table) => table.tableName === "question_tag_assignments",
  )?.requiredForPhase,
  "future_question_assignment",
);
assert.ok(taxonomyPersistencePlan.proposedStorageModel.relationships.length > 0);
assert.ok(taxonomyPersistencePlan.proposedStorageModel.indexes.length > 0);
assert.ok(taxonomyPersistencePlan.proposedStorageModel.rlsNotes.length > 0);
assert.equal(
  taxonomyPersistencePlan.proposedAdminContracts.length >= 10,
  true,
);
assert.equal(
  taxonomyPersistencePlan.proposedAdminContracts.every(
    (contract) => contract.allowedRoles.length > 0,
  ),
  true,
);
assert.equal(
  taxonomyPersistencePlan.proposedAdminContracts.every(
    (contract) => contract.producesAuditEvent === true,
  ),
  true,
);
assert.equal(
  taxonomyPersistencePlan.proposedAdminContracts.every(
    (contract) => contract.implementedNow === false,
  ),
  true,
);
assert.equal(
  taxonomyPersistencePlan.proposedMigrationPlan.mode,
  "proposal_only",
);
assert.equal(
  taxonomyPersistencePlan.proposedMigrationPlan.noMigrationAdded,
  true,
);
assert.ok(taxonomyPersistencePlan.proposedMigrationPlan.phases.length > 0);
assert.equal(
  taxonomyPersistencePlan.proposedVersioningPlan.packVersionStrategy,
  "immutable_pack_versions",
);
assert.equal(
  taxonomyPersistencePlan.proposedVersioningPlan.tagIdStability,
  "stable_official_ids",
);
assert.equal(
  taxonomyPersistencePlan.proposedVersioningPlan.deprecationStrategy,
  "soft_deprecate_do_not_delete",
);
assert.ok(taxonomyPersistencePlan.proposedAuditPlan.auditEvents.length > 0);
assert.equal(taxonomyPersistencePlan.validation.noDbMutation, true);
assert.equal(taxonomyPersistencePlan.validation.noMigrationAdded, true);
assert.equal(taxonomyPersistencePlan.validation.noOfficialPromotion, true);
assert.equal(
  taxonomyPersistencePlan.validation.adminContractsRequireRoles,
  true,
);
assert.equal(
  taxonomyPersistencePlan.validation.auditRequiredForMutations,
  true,
);
assert.equal(
  taxonomyPersistencePlan.validation.softDeleteOrDeprecationOnly,
  true,
);
const standalonePersistenceValidation = validateTaxonomyPersistencePlan({
  adminContracts: taxonomyPersistencePlan.proposedAdminContracts,
  proposedStorageModel: taxonomyPersistencePlan.proposedStorageModel,
  sourceReviewPlanPresent: true,
});
assert.equal(standalonePersistenceValidation.valid, true);
assert.ok(
  taxonomyPersistencePlan.warnings.includes(
    "taxonomy_persistence_planning_only",
  ),
);
assert.ok(
  taxonomyPersistencePlan.warnings.includes(
    "taxonomy_persistence_no_db_mutation",
  ),
);
assert.ok(
  taxonomyPersistencePlan.warnings.includes(
    "taxonomy_persistence_no_migration_added",
  ),
);
assert.ok(
  taxonomyPersistencePlan.warnings.includes(
    "taxonomy_persistence_no_official_promotion",
  ),
);
assert.ok(
  taxonomyPersistencePlan.warnings.includes(
    "taxonomy_persistence_question_assignment_proposal_only",
  ),
);
assert.equal(
  /reviewDraftTags|officialTagWrite|data:image|;base64,|JVBERi0|iVBORw0KGgo|rawProviderResponse|fullPdfText|imageBytes/i.test(
    JSON.stringify(taxonomyPersistencePlan),
  ),
  false,
);
const taxonomyPersistenceMergedAiPdfImport =
  mergeAITaxonomyPersistencePlanIntoSummary(
    taxonomyReviewMergedAiPdfImport,
    taxonomyPersistencePlan,
  );
assert.equal(
  taxonomyPersistenceMergedAiPdfImport.taxonomyPersistencePlan.version,
  "taxonomy_persistence_plan_v1",
);
assert.equal(
  taxonomyPersistenceMergedAiPdfImport.taxonomyReviewPlan.version,
  "taxonomy_review_plan_v1",
);
assert.equal(
  taxonomyPersistenceMergedAiPdfImport.taxonomyBootstrapPlan.version,
  "taxonomy_bootstrap_plan_v1",
);
assert.equal(
  taxonomyPersistenceMergedAiPdfImport.taggingV2Plan.version,
  "tagging_v2_plan_v1",
);
assert.equal(
  taxonomyPersistenceMergedAiPdfImport.adaptiveRereadMergePlan.version,
  "adaptive_reread_merge_plan_v1",
);
assert.equal(
  taxonomyPersistenceMergedAiPdfImport.adaptiveRereadRunPlan.version,
  "adaptive_reread_run_plan_v1",
);
assert.equal(
  taxonomyPersistenceMergedAiPdfImport.adaptiveRereadProviderRequestPlan.version,
  "adaptive_reread_provider_request_plan_v1",
);
assert.equal(
  taxonomyPersistenceMergedAiPdfImport.adaptiveRereadPlan.version,
  "adaptive_reread_plan_v1",
);
assert.equal(
  taxonomyPersistenceMergedAiPdfImport.providerRunPlan.version,
  "provider_run_plan_v1",
);
assert.equal(
  taxonomyPersistenceMergedAiPdfImport.providerRequestPlan.version,
  "provider_request_plan_v1",
);
assert.equal(
  taxonomyPersistenceMergedAiPdfImport.extractionBatchPlan.version,
  "extraction_batch_plan_v1",
);
assert.equal(
  taxonomyPersistenceMergedAiPdfImport.packetPlan.version,
  "packet_plan_v1",
);
assert.equal(
  taxonomyPersistenceMergedAiPdfImport.preanalysis.version,
  "preanalysis_v1",
);
assert.equal(taxonomyPersistenceMergedAiPdfImport.chunking.totalChunks, 4);
assert.equal(taxonomyPersistenceMergedAiPdfImport.provider.id, "provider-1");
assert.deepEqual(taxonomyPersistenceMergedAiPdfImport.warnings, [
  "keep existing warning",
]);
const missingReviewPersistencePlan =
  buildAITaxonomyPersistencePlanFromSummary({});
assert.equal(missingReviewPersistencePlan.status, "skipped");
assert.equal(
  missingReviewPersistencePlan.sourcePlans.taxonomyReviewPlanPresent,
  false,
);
assert.ok(
  missingReviewPersistencePlan.warnings.includes(
    "taxonomy_persistence_review_plan_missing",
  ),
);
console.log(
  "PASS AI taxonomy persistence proposes admin/storage contracts without migrations or DB mutation",
);

const fiveFacetTagTaxonomyPlan = buildAIFiveFacetTagTaxonomyPlan();
assert.equal(
  fiveFacetTagTaxonomyPlan.version,
  "five_facet_tag_taxonomy_plan_v1",
);
assert.equal(fiveFacetTagTaxonomyPlan.mode, "planning_only");
assert.equal(fiveFacetTagTaxonomyPlan.validation.valid, true);
assert.equal(fiveFacetTagTaxonomyPlan.validation.exactlyFiveCategories, true);
assert.deepEqual(Object.keys(fiveFacetTagTaxonomyPlan.taxonomy).sort(), [
  "concept",
  "curriculum",
  "form",
  "method",
  "task",
]);
assert.equal("difficulty" in fiveFacetTagTaxonomyPlan.taxonomy, false);
assert.equal("error_pattern" in fiveFacetTagTaxonomyPlan.taxonomy, false);
assert.equal(
  fiveFacetTagTaxonomyPlan.questionTagBundleContract.difficultyField
    .taxonomyCategory,
  false,
);
assert.equal(
  fiveFacetTagTaxonomyPlan.questionTagBundleContract.difficultyField.type,
  "number",
);
assert.equal(
  fiveFacetTagTaxonomyPlan.attemptDiagnosisContract
    .errorPatternLivesOnAttemptRecord,
  true,
);
assert.equal(
  fiveFacetTagTaxonomyPlan.attemptDiagnosisContract
    .questionTaxonomyIncludesErrorPattern,
  false,
);
assert.equal(
  fiveFacetTagTaxonomyPlan.validation.conceptIdsAvoidCoursePrefixes,
  true,
);
assert.equal(
  fiveFacetTagTaxonomyPlan.validation.curriculumMapsToConceptOnly,
  true,
);
assert.equal(
  fiveFacetTagTaxonomyPlan.validation.methodTagsRepresentSolvingApproach,
  true,
);
assert.equal(
  fiveFacetTagTaxonomyPlan.validation.taskTagsRepresentQuestionDemand,
  true,
);
assert.equal(
  fiveFacetTagTaxonomyPlan.validation.formTagsRepresentPresentation,
  true,
);
assert.equal(fiveFacetTagTaxonomyPlan.validation.aliasCollisionsDetected, true);
assert.ok(
  fiveFacetTagTaxonomyPlan.aliasIndex.collisions.some(
    (collision) => collision.alias === "vertex",
  ),
);
assert.ok(
  fiveFacetTagTaxonomyPlan.taxonomy.curriculum.edges.some(
    (edge) =>
      edge.edgeKind === "maps_to" &&
      edge.fromTagId ===
        "curriculum.bc.precalculus_11.quadratic_functions" &&
      edge.toTagId === "concept.algebra.functions.quadratic",
  ),
);
assert.equal(
  fiveFacetTagTaxonomyPlan.taxonomy.concept.nodes.some((node) =>
    node.parentTagIds.some((parentTagId) =>
      parentTagId.startsWith("curriculum."),
    ),
  ),
  false,
);
assert.ok(
  fiveFacetTagTaxonomyPlan.taxonomy.curriculum.nodes.some(
    (node) => node.tagId === "curriculum.ap.ap_calculus_bc",
  ),
);
assert.ok(
  fiveFacetTagTaxonomyPlan.taxonomy.concept.nodes.some(
    (node) =>
      node.tagId ===
      "concept.algebra.functions.quadratic.where_extreme_occurs",
  ),
);
assert.ok(
  fiveFacetTagTaxonomyPlan.taxonomy.method.nodes.some(
    (node) =>
      node.tagId ===
      "method.algebraic_manipulation.complete_the_square",
  ),
);
assert.ok(
  fiveFacetTagTaxonomyPlan.taxonomy.task.nodes.some(
    (node) =>
      node.tagId === "task.determine.determine_where_extreme_occurs",
  ),
);
assert.ok(
  fiveFacetTagTaxonomyPlan.taxonomy.form.nodes.some(
    (node) => node.tagId === "form.symbolic.vertex_form",
  ),
);
assert.equal(fiveFacetTagTaxonomyPlan.validation.noDbMutation, true);
assert.equal(fiveFacetTagTaxonomyPlan.validation.noProviderCall, true);
assert.equal(fiveFacetTagTaxonomyPlan.validation.noOfficialTagWrite, true);
assert.equal(fiveFacetTagTaxonomyPlan.validation.noReviewDraftTagWrite, true);
assert.equal(
  fiveFacetTagTaxonomyPlan.questionTagBundleContract.recommendedTagLimits
    .totalSuggestedMax,
  12,
);
for (const warning of [
  "five_facet_taxonomy_planning_only",
  "five_facet_taxonomy_no_db_write",
  "five_facet_taxonomy_no_official_tag_write",
  "five_facet_taxonomy_no_review_draft_write",
  "five_facet_taxonomy_alias_collision",
]) {
  assert.ok(fiveFacetTagTaxonomyPlan.warnings.includes(warning));
}
assert.equal(
  /reviewDraftTags|data:image|;base64,|JVBERi0|iVBORw0KGgo|rawProviderResponse|fullPdfText|imageBytes/i.test(
    JSON.stringify(fiveFacetTagTaxonomyPlan),
  ),
  false,
);
const fiveFacetMergedAiPdfImport = mergeAIFiveFacetTagTaxonomyPlanIntoSummary(
  taxonomyPersistenceMergedAiPdfImport,
  fiveFacetTagTaxonomyPlan,
);
assert.equal(
  fiveFacetMergedAiPdfImport.fiveFacetTagTaxonomyPlan.version,
  "five_facet_tag_taxonomy_plan_v1",
);
assert.equal(
  fiveFacetMergedAiPdfImport.taxonomyPersistencePlan.version,
  "taxonomy_persistence_plan_v1",
);
assert.equal(
  fiveFacetMergedAiPdfImport.taxonomyReviewPlan.version,
  "taxonomy_review_plan_v1",
);
assert.equal(
  fiveFacetMergedAiPdfImport.taxonomyBootstrapPlan.version,
  "taxonomy_bootstrap_plan_v1",
);
assert.equal(
  fiveFacetMergedAiPdfImport.taggingV2Plan.version,
  "tagging_v2_plan_v1",
);
assert.equal(
  fiveFacetMergedAiPdfImport.adaptiveRereadMergePlan.version,
  "adaptive_reread_merge_plan_v1",
);
assert.equal(
  fiveFacetMergedAiPdfImport.adaptiveRereadRunPlan.version,
  "adaptive_reread_run_plan_v1",
);
assert.equal(
  fiveFacetMergedAiPdfImport.adaptiveRereadProviderRequestPlan.version,
  "adaptive_reread_provider_request_plan_v1",
);
assert.equal(
  fiveFacetMergedAiPdfImport.adaptiveRereadPlan.version,
  "adaptive_reread_plan_v1",
);
assert.equal(
  fiveFacetMergedAiPdfImport.providerRunPlan.version,
  "provider_run_plan_v1",
);
assert.equal(
  fiveFacetMergedAiPdfImport.providerRequestPlan.version,
  "provider_request_plan_v1",
);
assert.equal(
  fiveFacetMergedAiPdfImport.extractionBatchPlan.version,
  "extraction_batch_plan_v1",
);
assert.equal(fiveFacetMergedAiPdfImport.packetPlan.version, "packet_plan_v1");
assert.equal(fiveFacetMergedAiPdfImport.preanalysis.version, "preanalysis_v1");
assert.equal(fiveFacetMergedAiPdfImport.chunking.totalChunks, 4);
assert.equal(fiveFacetMergedAiPdfImport.provider.id, "provider-1");
assert.deepEqual(fiveFacetMergedAiPdfImport.warnings, [
  "keep existing warning",
]);
console.log(
  "PASS AI five-facet tag taxonomy defines planning-only curriculum/concept/method/task/form foundation",
);

const coveragePreanalysisPages = Array.from({ length: 6 }, (_, index) => ({
  answerMarkerHints: [],
  assetHints: [],
  boundaryRisks: [],
  choiceMarkerHints: ["A", "B", "C", "D"],
  extractedTextLength: 120,
  extractedTextPreview: `Question-like page ${index + 1}`,
  pageClass: "question_page",
  pageNumber: index + 1,
  questionNumberHints: [`${index + 1}.`],
  textLayerAvailable: true,
}));
const coveragePackets = coveragePreanalysisPages.map((page, index) =>
  makeExtractionPacket({ index: 100 + index, pageNumbers: [page.pageNumber] }),
);
const coverageBatches = coveragePackets.map((packet, index) => ({
  batchId: `coverage-batch-${index + 1}`,
  batchIndex: index,
  batchKind: "text_question_batch",
  inputBudget: {
    estimatedChars: 300,
    estimatedTokens: 75,
    hasImageInput: false,
    hasTextInput: true,
  },
  packetRefs: [
    {
      assetRefCount: 0,
      boundaryRiskCount: 0,
      estimatedChars: 300,
      kind: packet.kind,
      packetHash: packet.packetHash,
      packetId: packet.packetId,
      pageNumbers: packet.pageNumbers,
      questionNumberHint: packet.questionNumberHint,
    },
  ],
  recommendedInputMode: "text",
  routingHints: [],
  sourceKind: "pdf",
  status: "planned",
}));
const coverageChunking = createAIPdfChunkingSummary({
  chunkSizePages: 2,
  overlapPages: 0,
  pageCount: 6,
});
const coverageSummary = {
  createdQuestions: [
    {
      id: "created-coverage-1",
      questionCode: "COVERAGE_001",
      sourcePages: [1, 2, 3],
      title: "Covered early pages",
    },
  ],
  aiPdfImport: {
    ...taxonomyPersistenceMergedAiPdfImport,
    chunking: coverageChunking,
    extractionBatchPlan: {
      batches: coverageBatches,
      generatedAt: new Date(0).toISOString(),
      sourceKind: "pdf",
      stats: {
        assetLinkedBatches: 0,
        boundaryRiskBatches: 0,
        estimatedTotalChars: 1800,
        estimatedTotalTokens: 450,
        mixedReviewBatches: 0,
        singleImageBatches: 0,
        skippedPackets: 0,
        textQuestionBatches: 6,
        totalBatches: 6,
        totalPackets: 6,
      },
      status: "completed",
      version: "extraction_batch_plan_v1",
      warnings: [],
    },
    packetPlan: {
      generatedAt: new Date(0).toISOString(),
      packets: coveragePackets,
      sourceKind: "pdf",
      stats: {
        assetLinkedPackets: 0,
        boundaryRiskPackets: 0,
        estimatedTotalChars: 1800,
        pdfQuestionCandidatePackets: 6,
        singleImagePackets: 0,
        skippedPages: 0,
        totalPackets: 6,
      },
      status: "completed",
      version: "packet_plan_v1",
      warnings: [],
    },
    pageCount: 6,
    preanalysis: {
      documentHints: {
        hasAnswerMarkers: false,
        hasChoiceMarkers: true,
        hasQuestionMarkers: true,
        likelyScannedPdf: false,
      },
      generatedAt: new Date(0).toISOString(),
      pageCount: 6,
      pages: coveragePreanalysisPages,
      sourceKind: "pdf",
      status: "completed",
      textLayerAvailable: true,
      version: "preanalysis_v1",
      warnings: [],
    },
    sourceInput: "gemini_native_pdf",
  },
};
const coverageAuditPlan =
  buildAIExtractionCoverageAuditPlanFromSummary(coverageSummary);
assert.equal(
  coverageAuditPlan.version,
  "extraction_coverage_audit_plan_v1",
);
assert.equal(coverageAuditPlan.mode, "planning_only");
assert.equal(coverageAuditPlan.sourceKind, "pdf");
assert.equal(coverageAuditPlan.strategy, "gemini_native_full_pdf");
assert.equal(coverageAuditPlan.pageCoverage.totalPages, 6);
assert.deepEqual(coverageAuditPlan.pageCoverage.extractedSourcePages, [1, 2, 3]);
assert.deepEqual(coverageAuditPlan.pageCoverage.terminalUncoveredPages, [
  4, 5, 6,
]);
assert.ok(
  coverageAuditPlan.risks.some(
    (risk) => risk.kind === "terminal_pages_missing_from_extraction",
  ),
);
assert.ok(
  coverageAuditPlan.risks.some(
    (risk) => risk.kind === "full_pdf_silent_partial_risk",
  ),
);
assert.ok(
  coverageAuditPlan.risks.some((risk) => risk.kind === "packet_coverage_low"),
);
assert.ok(
  coverageAuditPlan.risks.some((risk) => risk.kind === "batch_coverage_low"),
);
assert.ok(
  coverageAuditPlan.recommendedRecoveryWindows.some(
    (window) =>
      window.reason === "terminal_uncovered_pages" &&
      window.providerCallPlanned === false &&
      window.reviewRequired === true,
  ),
);
assert.ok(
  coverageAuditPlan.warnings.includes(
    "coverage_audit_full_pdf_silent_partial_risk",
  ),
);
assert.ok(
  coverageAuditPlan.warnings.includes(
    "coverage_audit_terminal_pages_uncovered",
  ),
);
assert.ok(
  coverageAuditPlan.warnings.includes("coverage_audit_recovery_recommended"),
);
const missingSourceCoveragePlan =
  buildAIExtractionCoverageAuditPlanFromSummary({
    ...coverageSummary,
    createdQuestions: [],
  });
assert.equal(missingSourceCoveragePlan.pageCoverage.pagesWithNoSourceRefs, true);
assert.ok(
  missingSourceCoveragePlan.warnings.includes(
    "coverage_audit_source_page_refs_missing",
  ),
);
const failedChunkCoveragePlan = buildAIExtractionCoverageAuditPlanFromSummary({
  createdQuestions: [
    {
      id: "created-coverage-2",
      questionCode: "COVERAGE_002",
      sourcePages: [1, 2, 3, 4],
      title: "Covered pages before failed chunk",
    },
  ],
  aiPdfImport: {
    ...coverageSummary.aiPdfImport,
    chunking: patchAIPdfChunkingSummary({
      chunkIndex: 2,
      pageCount: 6,
      patch: {
        errorMessage: "Provider high demand.",
        sourcePages: [5, 6],
        status: "failed",
      },
      value: coverageChunking,
    }),
    sourceInput: "page_images",
  },
});
assert.equal(failedChunkCoveragePlan.strategy, "page_images");
assert.ok(
  failedChunkCoveragePlan.risks.some(
    (risk) => risk.kind === "chunk_partial_failure",
  ),
);
assert.ok(
  failedChunkCoveragePlan.recommendedRecoveryWindows.some(
    (window) =>
      window.reason === "failed_chunk_pages" &&
      window.providerCallPlanned === false,
  ),
);
assert.equal(
  /reviewDraftTags|officialTagWrite|data:image|;base64,|JVBERi0|iVBORw0KGgo|rawProviderResponse|fullPdfText|imageBytes/i.test(
    JSON.stringify(coverageAuditPlan),
  ),
  false,
);
const coverageMergedAiPdfImport = mergeAIExtractionCoverageAuditPlanIntoSummary(
  taxonomyPersistenceMergedAiPdfImport,
  coverageAuditPlan,
);
assert.equal(
  coverageMergedAiPdfImport.extractionCoverageAuditPlan.version,
  "extraction_coverage_audit_plan_v1",
);
assert.equal(
  coverageMergedAiPdfImport.taxonomyPersistencePlan.version,
  "taxonomy_persistence_plan_v1",
);
assert.equal(
  coverageMergedAiPdfImport.taxonomyReviewPlan.version,
  "taxonomy_review_plan_v1",
);
assert.equal(
  coverageMergedAiPdfImport.taxonomyBootstrapPlan.version,
  "taxonomy_bootstrap_plan_v1",
);
assert.equal(coverageMergedAiPdfImport.taggingV2Plan.version, "tagging_v2_plan_v1");
assert.equal(
  coverageMergedAiPdfImport.adaptiveRereadMergePlan.version,
  "adaptive_reread_merge_plan_v1",
);
assert.equal(
  coverageMergedAiPdfImport.adaptiveRereadRunPlan.version,
  "adaptive_reread_run_plan_v1",
);
assert.equal(
  coverageMergedAiPdfImport.adaptiveRereadProviderRequestPlan.version,
  "adaptive_reread_provider_request_plan_v1",
);
assert.equal(
  coverageMergedAiPdfImport.adaptiveRereadPlan.version,
  "adaptive_reread_plan_v1",
);
assert.equal(
  coverageMergedAiPdfImport.providerRunPlan.version,
  "provider_run_plan_v1",
);
assert.equal(
  coverageMergedAiPdfImport.providerRequestPlan.version,
  "provider_request_plan_v1",
);
assert.equal(
  coverageMergedAiPdfImport.extractionBatchPlan.version,
  "extraction_batch_plan_v1",
);
assert.equal(coverageMergedAiPdfImport.packetPlan.version, "packet_plan_v1");
assert.equal(coverageMergedAiPdfImport.preanalysis.version, "preanalysis_v1");
assert.equal(coverageMergedAiPdfImport.chunking.totalChunks, 4);
assert.equal(coverageMergedAiPdfImport.provider.id, "provider-1");
assert.deepEqual(coverageMergedAiPdfImport.warnings, ["keep existing warning"]);
console.log(
  "PASS AI extraction coverage audit detects silent partial extraction without provider calls or recovery execution",
);

const coverageRecoveryPlan =
  buildAICoverageRecoveryPlanFromSummary(coverageMergedAiPdfImport);
assert.equal(coverageRecoveryPlan.version, "coverage_recovery_plan_v1");
assert.equal(coverageRecoveryPlan.mode, "planning_only");
assert.equal(coverageRecoveryPlan.sourceKind, "pdf");
assert.equal(coverageRecoveryPlan.sourceAuditPlanPresent, true);
assert.ok(coverageRecoveryPlan.recoveryTasks.length > 0);
assert.ok(coverageRecoveryPlan.requestDrafts.length > 0);
assert.ok(
  coverageRecoveryPlan.recoveryTasks.some(
    (task) => task.kind === "terminal_page_recovery",
  ),
);
assert.ok(
  coverageRecoveryPlan.recoveryTasks.some(
    (task) => task.kind === "uncovered_question_like_page_recovery",
  ),
);
assert.ok(
  coverageRecoveryPlan.recoveryTasks.some(
    (task) => task.kind === "low_packet_coverage_review",
  ),
);
assert.ok(
  coverageRecoveryPlan.requestDrafts.some(
    (request) => request.requestKind === "coverage_terminal_page_extraction",
  ),
);
assert.equal(
  coverageRecoveryPlan.requestDrafts.every(
    (request) =>
      request.pageNumbers.length > 0 &&
      request.promptContract.boundedPagesOnly === true &&
      request.promptContract.recoverMissingQuestionsOnly === true &&
      request.promptContract.doNotReextractCoveredPages === true &&
      request.promptContract.preserveExistingDrafts === true &&
      request.promptContract.requireSourcePageRefs === true &&
      request.promptContract.requireCompletionSentinel === true &&
      request.providerRouting.realCall === false &&
      request.providerRouting.shadowOnly === true &&
      request.safety.noProviderCall === true &&
      request.safety.noReviewDraftWrite === true &&
      request.safety.noOfficialTaxonomyWrite === true &&
      request.safety.noDbMutation === true &&
      request.safety.noRawResponseStorage === true,
  ),
  true,
);
assert.equal(
  coverageRecoveryPlan.recoveryTasks.every(
    (task) =>
      task.reviewRequired === true &&
      task.execution.providerCallPlanned === true &&
      task.execution.providerCallExecuted === false &&
      task.execution.reviewDraftWritePlanned === false &&
      task.execution.reviewDraftWriteExecuted === false &&
      task.execution.officialMergePlanned === false,
  ),
  true,
);
assert.ok(
  coverageRecoveryPlan.warnings.includes("coverage_recovery_planning_only"),
);
assert.ok(
  coverageRecoveryPlan.warnings.includes("coverage_recovery_no_provider_call"),
);
assert.ok(
  coverageRecoveryPlan.warnings.includes("coverage_recovery_no_execution"),
);
assert.ok(
  coverageRecoveryPlan.warnings.includes(
    "coverage_recovery_no_review_draft_write",
  ),
);
assert.ok(
  coverageRecoveryPlan.warnings.includes("coverage_recovery_no_db_mutation"),
);
assert.ok(
  coverageRecoveryPlan.warnings.includes(
    "coverage_recovery_terminal_pages_planned",
  ),
);
const failedChunkRecoveryPlan = buildAICoverageRecoveryPlanFromSummary({
  aiPdfImport: {
    extractionCoverageAuditPlan: failedChunkCoveragePlan,
  },
});
assert.ok(
  failedChunkRecoveryPlan.recoveryTasks.some(
    (task) => task.kind === "failed_chunk_recovery",
  ),
);
assert.ok(
  failedChunkRecoveryPlan.requestDrafts.some(
    (request) => request.requestKind === "coverage_failed_chunk_retry",
  ),
);
const missingAuditRecoveryPlan = buildAICoverageRecoveryPlanFromSummary({});
assert.equal(missingAuditRecoveryPlan.status, "skipped");
assert.equal(missingAuditRecoveryPlan.sourceAuditPlanPresent, false);
assert.ok(
  missingAuditRecoveryPlan.warnings.includes(
    "coverage_recovery_missing_coverage_audit_plan",
  ),
);
assert.equal(
  /reviewDraftTags|officialTagWrite|data:image|;base64,|JVBERi0|iVBORw0KGgo|rawProviderResponse|fullPdfText|imageBytes/i.test(
    JSON.stringify(coverageRecoveryPlan),
  ),
  false,
);
const coverageRecoveryMergedAiPdfImport = mergeAICoverageRecoveryPlanIntoSummary(
  coverageMergedAiPdfImport,
  coverageRecoveryPlan,
);
assert.equal(
  coverageRecoveryMergedAiPdfImport.coverageRecoveryPlan.version,
  "coverage_recovery_plan_v1",
);
assert.equal(
  coverageRecoveryMergedAiPdfImport.extractionCoverageAuditPlan.version,
  "extraction_coverage_audit_plan_v1",
);
assert.equal(
  coverageRecoveryMergedAiPdfImport.taxonomyPersistencePlan.version,
  "taxonomy_persistence_plan_v1",
);
assert.equal(
  coverageRecoveryMergedAiPdfImport.taxonomyReviewPlan.version,
  "taxonomy_review_plan_v1",
);
assert.equal(
  coverageRecoveryMergedAiPdfImport.taxonomyBootstrapPlan.version,
  "taxonomy_bootstrap_plan_v1",
);
assert.equal(
  coverageRecoveryMergedAiPdfImport.taggingV2Plan.version,
  "tagging_v2_plan_v1",
);
assert.equal(
  coverageRecoveryMergedAiPdfImport.adaptiveRereadMergePlan.version,
  "adaptive_reread_merge_plan_v1",
);
assert.equal(
  coverageRecoveryMergedAiPdfImport.adaptiveRereadRunPlan.version,
  "adaptive_reread_run_plan_v1",
);
assert.equal(
  coverageRecoveryMergedAiPdfImport.adaptiveRereadProviderRequestPlan.version,
  "adaptive_reread_provider_request_plan_v1",
);
assert.equal(
  coverageRecoveryMergedAiPdfImport.adaptiveRereadPlan.version,
  "adaptive_reread_plan_v1",
);
assert.equal(
  coverageRecoveryMergedAiPdfImport.providerRunPlan.version,
  "provider_run_plan_v1",
);
assert.equal(
  coverageRecoveryMergedAiPdfImport.providerRequestPlan.version,
  "provider_request_plan_v1",
);
assert.equal(
  coverageRecoveryMergedAiPdfImport.extractionBatchPlan.version,
  "extraction_batch_plan_v1",
);
assert.equal(coverageRecoveryMergedAiPdfImport.packetPlan.version, "packet_plan_v1");
assert.equal(coverageRecoveryMergedAiPdfImport.preanalysis.version, "preanalysis_v1");
assert.equal(coverageRecoveryMergedAiPdfImport.chunking.totalChunks, 4);
assert.equal(coverageRecoveryMergedAiPdfImport.provider.id, "provider-1");
assert.deepEqual(coverageRecoveryMergedAiPdfImport.warnings, [
  "keep existing warning",
]);
console.log(
  "PASS AI coverage recovery plans bounded shadow requests without provider calls or draft writes",
);

const coverageRecoveryRunPlan = buildAICoverageRecoveryRunPlanFromSummary({
  aiPdfImport: coverageRecoveryMergedAiPdfImport,
});
assert.equal(
  coverageRecoveryRunPlan.version,
  "coverage_recovery_run_plan_v1",
);
assert.equal(coverageRecoveryRunPlan.mode, "dry_run_only");
assert.equal(coverageRecoveryRunPlan.sourceKind, "pdf");
assert.equal(coverageRecoveryRunPlan.sourceRecoveryPlanPresent, true);
assert.ok(coverageRecoveryRunPlan.runItems.length > 0);
assert.equal(
  coverageRecoveryRunPlan.stats.requestDraftCount,
  coverageRecoveryPlan.requestDrafts.length,
);
assert.ok(coverageRecoveryRunPlan.stats.dryRunReadyCount > 0);
assert.ok(coverageRecoveryRunPlan.stats.terminalPageRunCount > 0);
assert.ok(coverageRecoveryRunPlan.stats.uncoveredPageRunCount > 0);
assert.equal(
  coverageRecoveryRunPlan.runItems.every(
    (item) =>
      item.status === "dry_run_ready" &&
      item.pageNumbers.length > 0 &&
      item.sourceRequestId.length > 0 &&
      item.sourceRequestHash.length > 0 &&
      item.sourceTaskId.length > 0 &&
      item.validation.valid === true &&
      item.validation.hasBoundedPages === true &&
      item.validation.realCallFalse === true &&
      item.validation.shadowOnlyTrue === true &&
      item.validation.noProviderCallTrue === true &&
      item.validation.noReviewDraftWriteTrue === true &&
      item.validation.noDbMutationTrue === true &&
      item.validation.hasSourcePageRefsRequirement === true &&
      item.validation.hasCompletionSentinelRequirement === true &&
      item.validation.preservesExistingDrafts === true &&
      item.validation.blocksCoveredPageReextraction === true &&
      item.dryRunResult.wouldRunInFuture === true &&
      item.dryRunResult.simulatedContent === null &&
      item.dryRunResult.expectedOutputContract.humanReviewRequired === true &&
      item.safety.dryRunOnly === true &&
      item.safety.realProviderCall === false &&
      item.safety.providerCallExecuted === false &&
      item.safety.reviewDraftWriteExecuted === false &&
      item.safety.officialMergeExecuted === false &&
      item.safety.dbMutationExecuted === false &&
      item.safety.rawResponseStored === false &&
      item.safety.fakeRecoveredContentGenerated === false,
  ),
  true,
);
assert.ok(
  coverageRecoveryRunPlan.runItems.some(
    (item) => item.requestKind === "coverage_terminal_page_extraction",
  ),
);
assert.ok(
  coverageRecoveryRunPlan.runItems.some(
    (item) => item.requestKind === "coverage_uncovered_page_extraction",
  ),
);
const failedChunkRecoveryRunPlan = buildAICoverageRecoveryRunPlanFromSummary({
  aiPdfImport: {
    coverageRecoveryPlan: failedChunkRecoveryPlan,
  },
});
assert.ok(
  failedChunkRecoveryRunPlan.runItems.some(
    (item) => item.requestKind === "coverage_failed_chunk_retry",
  ),
);
const invalidRecoveryRequest = {
  ...coverageRecoveryPlan.requestDrafts[0],
  pageNumbers: [],
  promptContract: {
    ...coverageRecoveryPlan.requestDrafts[0].promptContract,
    requireCompletionSentinel: false,
  },
  providerRouting: {
    ...coverageRecoveryPlan.requestDrafts[0].providerRouting,
    realCall: true,
  },
  safety: {
    ...coverageRecoveryPlan.requestDrafts[0].safety,
    noDbMutation: false,
  },
};
const invalidRecoveryValidation =
  validateCoverageRecoveryRequestDraft(invalidRecoveryRequest);
assert.equal(invalidRecoveryValidation.valid, false);
assert.ok(invalidRecoveryValidation.errors.length >= 3);
const invalidRecoveryRunItem =
  buildCoverageRecoveryRunItem(invalidRecoveryRequest);
assert.equal(invalidRecoveryRunItem.item?.status, "dry_run_blocked");
assert.equal(invalidRecoveryRunItem.skippedItem?.reason, "missing_page_numbers");
const missingRecoveryRunPlan = buildAICoverageRecoveryRunPlanFromSummary({});
assert.equal(missingRecoveryRunPlan.status, "skipped");
assert.equal(missingRecoveryRunPlan.sourceRecoveryPlanPresent, false);
assert.ok(
  missingRecoveryRunPlan.warnings.includes(
    "coverage_recovery_run_missing_recovery_plan",
  ),
);
assert.equal(
  /reviewDraftTags|officialTagWrite|data:image|;base64,|JVBERi0|iVBORw0KGgo|rawProviderResponse|fullPdfText|imageBytes|fakeRecoveredQuestion/i.test(
    JSON.stringify(coverageRecoveryRunPlan),
  ),
  false,
);
const coverageRecoveryRunMergedAiPdfImport =
  mergeAICoverageRecoveryRunPlanIntoSummary(
    coverageRecoveryMergedAiPdfImport,
    coverageRecoveryRunPlan,
  );
assert.equal(
  coverageRecoveryRunMergedAiPdfImport.coverageRecoveryRunPlan.version,
  "coverage_recovery_run_plan_v1",
);
assert.equal(
  coverageRecoveryRunMergedAiPdfImport.coverageRecoveryPlan.version,
  "coverage_recovery_plan_v1",
);
assert.equal(
  coverageRecoveryRunMergedAiPdfImport.extractionCoverageAuditPlan.version,
  "extraction_coverage_audit_plan_v1",
);
assert.equal(
  coverageRecoveryRunMergedAiPdfImport.taxonomyPersistencePlan.version,
  "taxonomy_persistence_plan_v1",
);
assert.equal(
  coverageRecoveryRunMergedAiPdfImport.taxonomyReviewPlan.version,
  "taxonomy_review_plan_v1",
);
assert.equal(
  coverageRecoveryRunMergedAiPdfImport.taxonomyBootstrapPlan.version,
  "taxonomy_bootstrap_plan_v1",
);
assert.equal(
  coverageRecoveryRunMergedAiPdfImport.taggingV2Plan.version,
  "tagging_v2_plan_v1",
);
assert.equal(
  coverageRecoveryRunMergedAiPdfImport.adaptiveRereadMergePlan.version,
  "adaptive_reread_merge_plan_v1",
);
assert.equal(
  coverageRecoveryRunMergedAiPdfImport.adaptiveRereadRunPlan.version,
  "adaptive_reread_run_plan_v1",
);
assert.equal(
  coverageRecoveryRunMergedAiPdfImport.adaptiveRereadProviderRequestPlan.version,
  "adaptive_reread_provider_request_plan_v1",
);
assert.equal(
  coverageRecoveryRunMergedAiPdfImport.adaptiveRereadPlan.version,
  "adaptive_reread_plan_v1",
);
assert.equal(
  coverageRecoveryRunMergedAiPdfImport.providerRunPlan.version,
  "provider_run_plan_v1",
);
assert.equal(
  coverageRecoveryRunMergedAiPdfImport.providerRequestPlan.version,
  "provider_request_plan_v1",
);
assert.equal(
  coverageRecoveryRunMergedAiPdfImport.extractionBatchPlan.version,
  "extraction_batch_plan_v1",
);
assert.equal(
  coverageRecoveryRunMergedAiPdfImport.packetPlan.version,
  "packet_plan_v1",
);
assert.equal(
  coverageRecoveryRunMergedAiPdfImport.preanalysis.version,
  "preanalysis_v1",
);
assert.equal(coverageRecoveryRunMergedAiPdfImport.chunking.totalChunks, 4);
assert.equal(coverageRecoveryRunMergedAiPdfImport.provider.id, "provider-1");
assert.deepEqual(coverageRecoveryRunMergedAiPdfImport.warnings, [
  "keep existing warning",
]);
console.log(
  "PASS AI coverage recovery runner creates dry-run metadata without provider calls or draft writes",
);

const coverageRecoveryMergePlan = buildAICoverageRecoveryMergePlanFromSummary({
  aiPdfImport: coverageRecoveryRunMergedAiPdfImport,
});
assert.equal(
  coverageRecoveryMergePlan.version,
  "coverage_recovery_merge_plan_v1",
);
assert.equal(coverageRecoveryMergePlan.mode, "planning_only");
assert.equal(coverageRecoveryMergePlan.sourceKind, "pdf");
assert.equal(coverageRecoveryMergePlan.sourceRecoveryRunPlanPresent, true);
assert.ok(coverageRecoveryMergePlan.mergeItems.length > 0);
assert.ok(coverageRecoveryMergePlan.duplicateGuards.length > 0);
assert.ok(coverageRecoveryMergePlan.stats.futureSuggestionCount > 0);
assert.ok(coverageRecoveryMergePlan.stats.blockedUntilRecoveryResultCount > 0);
assert.equal(
  coverageRecoveryMergePlan.mergePolicy.policyVersion,
  "coverage_recovery_merge_policy_v1",
);
assert.equal(
  coverageRecoveryMergePlan.mergePolicy.existingDraftsHandling,
  "preserve_all_existing_drafts",
);
assert.equal(
  coverageRecoveryMergePlan.mergePolicy.duplicateHandling,
  "block_or_review_on_duplicate_risk",
);
assert.equal(coverageRecoveryMergePlan.mergePolicy.sourcePageRefsRequired, true);
assert.equal(
  coverageRecoveryMergePlan.mergePolicy.completionSentinelRequired,
  true,
);
assert.equal(coverageRecoveryMergePlan.mergePolicy.humanReviewRequired, true);
assert.equal(coverageRecoveryMergePlan.mergePolicy.officialMergeAllowed, false);
assert.equal(
  coverageRecoveryMergePlan.mergePolicy.reviewDraftWriteAllowedNow,
  false,
);
assert.equal(coverageRecoveryMergePlan.mergePolicy.dbMutationAllowedNow, false);
assert.equal(
  coverageRecoveryMergePlan.mergeItems.every(
    (item) =>
      item.plannedSuggestion.contentAvailableNow === false &&
      item.plannedSuggestion.futureRecoveredContentRequired === true &&
      item.plannedSuggestion.recoveredContentPlaceholder === null &&
      item.safety.planningOnly === true &&
      item.safety.officialMerge === false &&
      item.safety.reviewDraftWrite === false &&
      item.safety.overwriteExistingDraft === false &&
      item.safety.deleteExistingDraft === false &&
      item.safety.mutateExistingQuestion === false &&
      item.safety.requireHumanReview === true &&
      item.safety.preserveExistingDrafts === true &&
      item.safety.attachAsSuggestionOnly === true &&
      item.safety.noFakeRecoveredContent === true &&
      item.review.required === true &&
      item.review.approved === false &&
      item.review.executed === false,
  ),
  true,
);
assert.ok(
  coverageRecoveryMergePlan.mergeItems.some(
    (item) =>
      item.kind === "future_recovered_question_suggestion" &&
      item.status === "blocked_until_recovery_result" &&
      item.plannedSuggestion.mergeMode === "append_as_review_suggestion",
  ),
);
assert.equal(
  coverageRecoveryMergePlan.duplicateGuards.every(
    (guard) =>
      guard.requiredBeforeExecution === true &&
      guard.currentResult === "not_run_planning_only",
  ),
  true,
);
const missingRecoveryMergePlan =
  buildAICoverageRecoveryMergePlanFromSummary({});
assert.equal(missingRecoveryMergePlan.status, "skipped");
assert.equal(missingRecoveryMergePlan.sourceRecoveryRunPlanPresent, false);
assert.ok(
  missingRecoveryMergePlan.warnings.includes(
    "coverage_recovery_merge_missing_run_plan",
  ),
);
assert.equal(
  /reviewDraftTags|officialTagWrite|data:image|;base64,|JVBERi0|iVBORw0KGgo|rawProviderResponse|fullPdfText|imageBytes|fakeRecoveredQuestion|recoveredContentPlaceholder\":\"[^n]/i.test(
    JSON.stringify(coverageRecoveryMergePlan),
  ),
  false,
);
const coverageRecoveryMergeMergedAiPdfImport =
  mergeAICoverageRecoveryMergePlanIntoSummary(
    coverageRecoveryRunMergedAiPdfImport,
    coverageRecoveryMergePlan,
  );
assert.equal(
  coverageRecoveryMergeMergedAiPdfImport.coverageRecoveryMergePlan.version,
  "coverage_recovery_merge_plan_v1",
);
assert.equal(
  coverageRecoveryMergeMergedAiPdfImport.coverageRecoveryRunPlan.version,
  "coverage_recovery_run_plan_v1",
);
assert.equal(
  coverageRecoveryMergeMergedAiPdfImport.coverageRecoveryPlan.version,
  "coverage_recovery_plan_v1",
);
assert.equal(
  coverageRecoveryMergeMergedAiPdfImport.extractionCoverageAuditPlan.version,
  "extraction_coverage_audit_plan_v1",
);
assert.equal(
  coverageRecoveryMergeMergedAiPdfImport.taxonomyPersistencePlan.version,
  "taxonomy_persistence_plan_v1",
);
assert.equal(
  coverageRecoveryMergeMergedAiPdfImport.taxonomyReviewPlan.version,
  "taxonomy_review_plan_v1",
);
assert.equal(
  coverageRecoveryMergeMergedAiPdfImport.taxonomyBootstrapPlan.version,
  "taxonomy_bootstrap_plan_v1",
);
assert.equal(
  coverageRecoveryMergeMergedAiPdfImport.taggingV2Plan.version,
  "tagging_v2_plan_v1",
);
assert.equal(
  coverageRecoveryMergeMergedAiPdfImport.adaptiveRereadMergePlan.version,
  "adaptive_reread_merge_plan_v1",
);
assert.equal(
  coverageRecoveryMergeMergedAiPdfImport.adaptiveRereadRunPlan.version,
  "adaptive_reread_run_plan_v1",
);
assert.equal(
  coverageRecoveryMergeMergedAiPdfImport.adaptiveRereadProviderRequestPlan.version,
  "adaptive_reread_provider_request_plan_v1",
);
assert.equal(
  coverageRecoveryMergeMergedAiPdfImport.adaptiveRereadPlan.version,
  "adaptive_reread_plan_v1",
);
assert.equal(
  coverageRecoveryMergeMergedAiPdfImport.providerRunPlan.version,
  "provider_run_plan_v1",
);
assert.equal(
  coverageRecoveryMergeMergedAiPdfImport.providerRequestPlan.version,
  "provider_request_plan_v1",
);
assert.equal(
  coverageRecoveryMergeMergedAiPdfImport.extractionBatchPlan.version,
  "extraction_batch_plan_v1",
);
assert.equal(
  coverageRecoveryMergeMergedAiPdfImport.packetPlan.version,
  "packet_plan_v1",
);
assert.equal(
  coverageRecoveryMergeMergedAiPdfImport.preanalysis.version,
  "preanalysis_v1",
);
assert.equal(coverageRecoveryMergeMergedAiPdfImport.chunking.totalChunks, 4);
assert.equal(coverageRecoveryMergeMergedAiPdfImport.provider.id, "provider-1");
assert.deepEqual(coverageRecoveryMergeMergedAiPdfImport.warnings, [
  "keep existing warning",
]);
console.log(
  "PASS AI coverage recovery merge planner creates suggestion-only metadata with duplicate guards",
);

let staleOverwriteChunking = createAIPdfChunkingSummary({
  chunkSizePages: 3,
  overlapPages: 1,
  pageCount: 7,
});
let staleAiPdfImport = { chunking: staleOverwriteChunking, pageCount: 7 };
for (const chunk of staleOverwriteChunking.chunks) {
  const nextChunking = patchAIPdfChunkingSummary({
    chunkIndex: chunk.chunkIndex,
    pageCount: 7,
    patch: {
      completedAt: `done-${chunk.chunkIndex}`,
      createdQuestionIds: [`question-${chunk.chunkIndex}`],
      questionCount: 1,
      status: "completed",
    },
    value: staleAiPdfImport.chunking,
  });
  staleAiPdfImport = mergeAIPdfImportChunkingSummary(staleAiPdfImport, {
    chunking: nextChunking,
    phase: `chunk_${chunk.chunkIndex}_completed`,
  });
}
assert.equal(staleAiPdfImport.chunking.completedChunks, 3);
assert.equal(staleAiPdfImport.chunking.failedChunks, 0);
assert.equal(staleAiPdfImport.chunking.mergeStatus, "ready");
assert.equal(
  staleAiPdfImport.chunking.chunks.every((chunk) => chunk.status === "completed"),
  true,
);

let sixChunkSuccess = createAIPdfChunkingSummary({
  chunkSizePages: 3,
  overlapPages: 1,
  pageCount: 13,
});
for (const chunk of sixChunkSuccess.chunks) {
  sixChunkSuccess = patchAIPdfChunkingSummary({
    chunkIndex: chunk.chunkIndex,
    pageCount: 13,
    patch: {
      completedAt: `done-${chunk.chunkIndex}`,
      createdQuestionIds: [`question-${chunk.chunkIndex}`],
      questionCount: 5,
      status: "completed",
    },
    value: sixChunkSuccess,
  });
}
assert.equal(sixChunkSuccess.totalChunks, 6);
assert.equal(sixChunkSuccess.completedChunks, 6);
assert.equal(sixChunkSuccess.failedChunks, 0);
assert.equal(sixChunkSuccess.mergeStatus, "ready");
assert.equal(sixChunkSuccess.chunks.every((chunk) => chunk.status === "completed"), true);
assert.equal(
  normalizeAIPdfChunkingSummary({
    ...sixChunkSuccess,
    completedChunks: 1,
    mergeStatus: "waiting_for_chunks",
  })?.completedChunks,
  6,
);
assert.equal(
  normalizeAIPdfChunkingSummary({
    ...sixChunkSuccess,
    completedChunks: 1,
    mergeStatus: "waiting_for_chunks",
  })?.mergeStatus,
  "ready",
);
console.log("PASS AI PDF chunking updates preserve prior chunk states and recompute final readiness");

let sharedImportDbSummary = {
  aiPdfImport: {
    chunking: createAIPdfChunkingSummary({
      chunkSizePages: 3,
      overlapPages: 1,
      pageCount: 13,
    }),
    pageCount: 13,
    phase: "queued",
  },
  createdCount: 0,
};
for (const chunk of sharedImportDbSummary.aiPdfImport.chunking.chunks) {
  const runningChunking = patchAIPdfChunkingSummary({
    chunkIndex: chunk.chunkIndex,
    pageCount: 13,
    patch: {
      status: "running",
      startedAt: `start-${chunk.chunkIndex}`,
    },
    value: sharedImportDbSummary.aiPdfImport.chunking,
  });
  sharedImportDbSummary = {
    ...sharedImportDbSummary,
    aiPdfImport: mergeAIPdfImportChunkingSummary(sharedImportDbSummary.aiPdfImport, {
      chunking: runningChunking,
      phase: "importing_questions",
    }),
  };
  const sharedImportFinalSummaryPatch = {
    batchId: "shared-import-batch",
    createdCount: chunk.chunkIndex + 1,
    createdQuestions: [`question-${chunk.chunkIndex}`],
    errorCount: 0,
    skippedCount: 0,
  };
  sharedImportDbSummary = {
    ...sharedImportDbSummary,
    ...sharedImportFinalSummaryPatch,
  };
  const completedChunking = patchAIPdfChunkingSummary({
    chunkIndex: chunk.chunkIndex,
    pageCount: 13,
    patch: {
      completedAt: `done-${chunk.chunkIndex}`,
      createdQuestionIds: [`question-${chunk.chunkIndex}`],
      questionCount: 5,
      status: "completed",
    },
    value: sharedImportDbSummary.aiPdfImport.chunking,
  });
  sharedImportDbSummary = {
    ...sharedImportDbSummary,
    aiPdfImport: mergeAIPdfImportChunkingSummary(sharedImportDbSummary.aiPdfImport, {
      chunking: completedChunking,
      phase: "cropping_assets",
    }),
  };
}
assert.equal(sharedImportDbSummary.aiPdfImport.chunking.totalChunks, 6);
assert.equal(sharedImportDbSummary.aiPdfImport.chunking.completedChunks, 6);
assert.equal(sharedImportDbSummary.aiPdfImport.chunking.failedChunks, 0);
assert.equal(sharedImportDbSummary.aiPdfImport.chunking.mergeStatus, "ready");
assert.equal(
  sharedImportDbSummary.aiPdfImport.chunking.chunks.every(
    (chunk) =>
      chunk.status === "completed" &&
      chunk.createdQuestionIds?.length === 1 &&
      chunk.questionCount === 5,
  ),
  true,
);

const batchImportServiceSource = await readFile(
  new URL("../src/lib/batch-import/service.ts", import.meta.url),
  "utf8",
);
assert.match(batchImportServiceSource, /loadImportBatchSummary/);
assert.match(batchImportServiceSource, /\.\.\.existingSummaryBeforeFinal/);
console.log(
  "PASS AI PDF shared batch import summary updates preserve all sequential chunk states",
);

assert.equal(supportsAIPdfSequentialChunkExtraction("page_images"), true);
assert.equal(supportsAIPdfSequentialChunkExtraction("gemini_native_pdf"), false);
assert.equal(supportsAIPdfSequentialChunkExtraction("openai_file"), false);
assert.equal(estimateAIPdfProviderCallCount({
  strategy: "page_images",
  totalChunks: 6,
}), 6);
assert.equal(estimateAIPdfProviderCallCount({
  strategy: "gemini_native_pdf",
  totalChunks: 6,
}), 1);
assert.equal(estimateAIPdfProviderCallCount({
  strategy: "openai_file",
  totalChunks: 6,
}), 1);

console.log(
  "PASS AI PDF full-PDF strategies stay single-pass while page images use sequential chunks",
);

let sequentialChunking = createAIPdfChunkingSummary({
  chunkSizePages: 3,
  overlapPages: 1,
  pageCount: 7,
});
const processedOrder = [];

for (const chunk of sequentialChunking.chunks.sort(
  (left, right) => left.chunkIndex - right.chunkIndex,
)) {
  processedOrder.push(chunk.chunkIndex);
  sequentialChunking = patchAIPdfChunkingSummary({
    chunkIndex: chunk.chunkIndex,
    pageCount: 7,
    patch: {
      completedAt: `done-${chunk.chunkIndex}`,
      createdQuestionIds:
        chunk.chunkIndex === 1 ? [] : [`question-${chunk.chunkIndex}`],
      errorMessage: chunk.chunkIndex === 1 ? "Provider timeout" : undefined,
      inputStrategy: "gemini_native_pdf",
      model: "gemini-2.5-flash-lite",
      provider: "gemini_native",
      questionCount: chunk.chunkIndex === 1 ? 0 : 1,
      retryCount: chunk.chunkIndex === 1 ? 0 : undefined,
      sourcePages: chunk.sourcePages,
      startedAt: `start-${chunk.chunkIndex}`,
      status: chunk.chunkIndex === 1 ? "failed" : "completed",
      warningCount: chunk.chunkIndex === 1 ? 1 : 0,
      warnings: chunk.chunkIndex === 1 ? ["Provider timeout"] : [],
    },
    value: sequentialChunking,
  });
}

assert.deepEqual(processedOrder, [0, 1, 2]);
assert.equal(sequentialChunking.completedChunks, 2);
assert.equal(sequentialChunking.failedChunks, 1);
assert.deepEqual(sequentialChunking.chunks[0].createdQuestionIds, ["question-0"]);
assert.deepEqual(sequentialChunking.chunks[2].createdQuestionIds, ["question-2"]);

const retriedChunking = patchAIPdfChunkingSummary({
  chunkIndex: 1,
  pageCount: 7,
  patch: {
    completedAt: "retry-done-1",
    createdQuestionIds: ["question-1-retry"],
    errorMessage: undefined,
    questionCount: 1,
    retryCount: 1,
    status: "completed",
    warningCount: 0,
    warnings: [],
  },
  value: sequentialChunking,
});

assert.equal(retriedChunking.completedChunks, 3);
assert.equal(retriedChunking.failedChunks, 0);
assert.equal(retriedChunking.chunks[1].retryCount, 1);
assert.deepEqual(retriedChunking.chunks[1].createdQuestionIds, [
  "question-1-retry",
]);

console.log(
  "PASS AI PDF sequential chunks preserve ordered status updates and failed chunk retry metadata",
);

const generatedQuestionCodes = new Set();
const generatedQuestionCode = generateAIPdfQuestionCodeForImport({
  batchId: "abc12345-0000-0000-0000-000000000000",
  existingQuestionCodes: new Set(["ai-abc12345-001"]),
  index: 0,
  usedQuestionCodes: generatedQuestionCodes,
});
assert.equal(generatedQuestionCode, "AI-ABC12345-001-2");
assert.equal(generatedQuestionCodes.has("ai-abc12345-001-2"), true);
assert.notEqual(visibleQuestionNumberKey("3"), visibleQuestionNumberKey("3.1"));
assert.notEqual(visibleQuestionNumberKey("3"), visibleQuestionNumberKey("3(a)"));
assert.notEqual(visibleQuestionNumberKey("3"), visibleQuestionNumberKey("FRQ 2"));
assert.equal(visibleQuestionNumberKey("3"), visibleQuestionNumberKey("3"));

console.log(
  "PASS AI PDF chunk planner and visible question numbering policy are deterministic, non-aggressive, and do not blind-concat duplicate visible numbers",
);

const validEscapesPayload = parsePossiblyMalformedJson(
  '{"value":"Line one\\nLine two with \\"quote\\", \\\\slash, and \\u03A9."}',
);
assert.equal(
  validEscapesPayload.value,
  'Line one\nLine two with "quote", \\slash, and \u03A9.',
);

const latexCommandPayload = parsePossiblyMalformedJson(
  String.raw`{"value":"\text{meters} and \theta"}`,
);
assert.equal(latexCommandPayload.value, String.raw`\text{meters} and \theta`);

const malformedAiProviderResponse = [
  "Here is the extracted JSON:",
  "",
  "```json",
  "{",
  '  "questions": [',
  "    {",
  '      "title": "Malformed LaTeX escape test",',
  '      "question_code": "AI_JSON_REPAIR_001",',
  '      "question_type": "frq",',
  '      "difficulty_rating": 500,',
  '      "status": "published",',
  String.raw`      "content_source": "Solve \$x = 2\$ and compare with $x = 2$. 293\% of $x$. A resistor is $4\,\Omega$ on a $12\,\mathrm{V}$ battery. Use \frac{1}{2}, \sqrt{x}, \left(x+1\right), \text{meters}, \le, and \ge.",`,
  String.raw`      "content_html": "<p>Solve \$x = 2\$ and use f(x) = x^2 - 5x + 6. 293\% of $x$.</p>",`,
  String.raw`      "solution_source": "Use \(x - 2\), \[x = 2\], \frac{1}{2}, \sqrt{x}, \left(x+1\right), \text{meters}, a \le b, and c \ge d.",`,
  String.raw`      "solution_html": "<p>The answer is $x = 2$ and \frac{1}{2}.</p>",`,
  '      "tag_names": [],',
  '      "tag_slugs": [],',
  '      "new_tag_names": [],',
  '      "page_refs": [1],',
  '      "asset_placeholders": []',
  "    }",
  "  ],",
  '  "warnings": ["provider wrapped JSON in prose"]',
  "}",
  "```",
  "",
  "Trailing prose from the model.",
].join("\n");

const repairedAiPayload = parsePossiblyMalformedJson(malformedAiProviderResponse);
const extraction = aiPdfExtractionSchema.parse(repairedAiPayload);
const repairedQuestion = extraction.questions[0];

assert.equal(repairedQuestion.question_code, "AI_JSON_REPAIR_001");
assert.match(repairedQuestion.content_source ?? "", /\$x = 2\$/);
assert.match(repairedQuestion.content_source ?? "", /\\\$x = 2\\\$/);
assert.match(repairedQuestion.content_source ?? "", /293\\% of \$x\$/);
assert.match(repairedQuestion.content_source ?? "", /\$4\\,\\Omega\$/);
assert.match(repairedQuestion.content_source ?? "", /\$12\\,\\mathrm\{V\}\$/);
assert.match(repairedQuestion.content_source ?? "", /\\frac\{1\}\{2\}/);
assert.match(repairedQuestion.content_source ?? "", /\\sqrt\{x\}/);
assert.match(repairedQuestion.content_source ?? "", /\\left\(x\+1\\right\)/);
assert.match(repairedQuestion.content_source ?? "", /\\text\{meters\}/);
assert.match(repairedQuestion.content_source ?? "", /\\le/);
assert.match(repairedQuestion.content_source ?? "", /\\ge/);
assert.match(repairedQuestion.solution_source ?? "", /\\\(x - 2\\\)/);
assert.match(repairedQuestion.solution_source ?? "", /\\\[x = 2\\\]/);
assert.match(repairedQuestion.content_html, /f\(x\) = x\^2 - 5x \+ 6/);
assert.equal("status" in repairedQuestion, false);

console.log(
  "PASS AI PDF provider JSON repair handles fenced prose, generalized LaTeX escapes, and strips publish status",
);

const invalidAssetPlaceholderExtraction = aiPdfExtractionSchema.parse({
  questions: [
    {
      asset_placeholders: [
        {
          alt: "usable fallback placeholder",
          bbox: { height: 0.2, width: 0.3, x: 0.1, y: 0.1 },
          page: 1,
        },
        {
          alt: "bad placeholder string",
          bbox: { height: 0.2, width: 0.3, x: 0.2, y: 0.2 },
          page: 1,
          placeholder: "not a valid placeholder!",
        },
        {
          alt: "missing bbox should not block the question",
          page: 1,
          placeholder: "{{asset:figure_4}}",
        },
      ],
      content_html: "<p>Question with {{asset:figure_3}}.</p>",
      content_source: "Question with {{asset:figure_3}}.",
      difficulty_rating: 500,
      new_tag_names: [],
      page_refs: [1],
      question_code: "AI_INVALID_ASSET_PLACEHOLDER_001",
      question_type: "frq",
      solution_html: "<p>Solution.</p>",
      solution_source: "Solution.",
      tag_names: [],
      tag_slugs: [],
      title: "Invalid asset placeholder should not fail import",
    },
    {
      asset_placeholders: "not an array",
      content_html: "<p>Text-only question should still import.</p>",
      difficulty_rating: 400,
      new_tag_names: [],
      page_refs: [2],
      question_code: "AI_INVALID_ASSET_PLACEHOLDER_002",
      question_type: "frq",
      solution_html: "<p>Solution.</p>",
      tag_names: [],
      tag_slugs: [],
      title: "Non-array asset placeholders should warn only",
    },
  ],
  warnings: [],
});

assert.equal(invalidAssetPlaceholderExtraction.questions.length, 2);
assert.equal(
  invalidAssetPlaceholderExtraction.questions[0].asset_placeholders.length,
  1,
);
assert.equal(
  invalidAssetPlaceholderExtraction.questions[0].asset_placeholders[0]
    .placeholder,
  "{{asset:figure_3}}",
);
assert.equal(
  invalidAssetPlaceholderExtraction.questions[1].asset_placeholders.length,
  0,
);
assert.equal(
  invalidAssetPlaceholderExtraction.warnings.includes(
    "Some image placeholders were ignored because they were invalid.",
  ),
  true,
);

console.log(
  "PASS AI PDF invalid asset_placeholders warn and do not block draft question parsing",
);

const aiPdfServiceSource = await readFile(
  new URL("../src/lib/ai-pdf-import/service.ts", import.meta.url),
  "utf8",
);
assert.match(
  aiPdfServiceSource,
  /generateAndStorePdfPreanalysis\(\{ input, pageCount \}\);[\s\S]*detail: "Loading AI provider profile\."/,
);
assert.match(
  aiPdfServiceSource,
  /generateAndStorePacketPlan\(\{ input, preanalysis \}\);[\s\S]*detail: "Loading AI provider profile\."/,
);
assert.match(aiPdfServiceSource, /if \(solutionHtml\.trim\(\)\) \{/);
assert.match(aiPdfServiceSource, /questionPayload\.solution_html = solutionHtml/);
assert.doesNotMatch(
  aiPdfServiceSource,
  /solution_html:\s*solutionFields\.html \|\| question\.solution_html/,
);
console.log("PASS AI PDF import payload omits null solution fields before batch import");

assert.match(
  aiPdfServiceSource,
  /loadSafeAIProviderProfileForUse[\s\S]*sourceInput: providerInput\.strategy[\s\S]*loadAIProviderProfileForUse/,
);
assert.equal(
  aiPdfInputStrategySummaryLabel("page_images", "gemini_openai"),
  "Rendered page images",
);
console.log(
  "PASS AI PDF provider metadata remains visible when saved key decrypt fails",
);

const previousEncryptionKey = process.env.AI_PROVIDER_ENCRYPTION_KEY;
process.env.AI_PROVIDER_ENCRYPTION_KEY =
  "security-smoke-test-encryption-key-for-friendly-decrypt-errors";
let decryptErrorMessage = "";
try {
  decryptSecret({
    ciphertext: Buffer.from("not the saved api key").toString("base64"),
    iv: Buffer.alloc(12).toString("base64"),
    tag: Buffer.alloc(16).toString("base64"),
  });
} catch (error) {
  decryptErrorMessage = error instanceof Error ? error.message : String(error);
} finally {
  if (previousEncryptionKey === undefined) {
    delete process.env.AI_PROVIDER_ENCRYPTION_KEY;
  } else {
    process.env.AI_PROVIDER_ENCRYPTION_KEY = previousEncryptionKey;
  }
}
assert.equal(
  decryptErrorMessage,
  "Saved API key cannot be decrypted. Re-enter and save the API key for this provider.",
);
assert.equal(/Unsupported state|authenticate data/i.test(decryptErrorMessage), false);
assert.equal(/sk-|AIza|eyJ/i.test(decryptErrorMessage), false);
console.log("PASS saved AI provider decrypt failure shows friendly safe error");

const deepSeekTextOnly = {
  base_url: "https://api.deepseek.com",
  model: "deepseek-v4-flash",
  provider: "deepseek_openai",
  supports_pdf_input: false,
  supports_vision_images: false,
};
assert.equal(inferAiProviderMode(deepSeekTextOnly), "deepseek_openai");
assert.equal(getAiProviderCapabilities(deepSeekTextOnly).supportsText, true);
assert.equal(getAiProviderCapabilities(deepSeekTextOnly).supportsJsonMode, true);
assert.equal(getAiProviderCapabilities(deepSeekTextOnly).supportsPageImages, false);
assert.equal(getAiProviderCapabilities(deepSeekTextOnly).supportsNativePdf, false);
assert.equal(selectAiPdfInputStrategy(deepSeekTextOnly), "unsupported");

const deepSeekExplicitVision = {
  ...deepSeekTextOnly,
  supports_vision_images: true,
};
assert.equal(selectAiPdfInputStrategy(deepSeekExplicitVision), "page_images");

const geminiOpenAiFullPdfAndImages = {
  base_url: "https://generativelanguage.googleapis.com/v1beta/openai",
  model: "gemini-2.5-flash",
  provider: "gemini_openai",
  supports_pdf_input: true,
  supports_vision_images: true,
};
assert.equal(inferAiProviderMode(geminiOpenAiFullPdfAndImages), "gemini_openai");
assert.equal(selectAiPdfInputStrategy(geminiOpenAiFullPdfAndImages), "page_images");

const geminiOpenAiFullPdfOnly = {
  ...geminiOpenAiFullPdfAndImages,
  supports_vision_images: false,
};
assert.equal(selectAiPdfInputStrategy(geminiOpenAiFullPdfOnly), "unsupported");

const geminiNativePdf = {
  base_url: "https://generativelanguage.googleapis.com",
  model: "gemini-2.5-pro",
  provider: "gemini_native",
  supports_pdf_input: true,
  supports_vision_images: false,
};
const geminiNativeSupport = describeAiPdfProviderInput(geminiNativePdf);
assert.equal(geminiNativeSupport.mode, "gemini_native");
assert.equal(geminiNativeSupport.strategy, "gemini_native_pdf");
assert.equal(geminiNativeSupport.supported, true);
assert.equal(geminiNativeSupport.implemented, true);
assert.equal(aiProviderModeSummaryLabel("deepseek_openai"), "DeepSeek text/json");
assert.equal(
  aiProviderModeSummaryLabel("gemini_native"),
  "Gemini Native full PDF",
);
assert.equal(aiPdfInputStrategyLabel(geminiNativeSupport.strategy), "supported");
assert.equal(
  AI_PROVIDER_MODE_OPTIONS.some((option) => option.label === "deepseek_openai"),
  false,
);
assert.equal(
  AI_PROVIDER_MODE_OPTIONS.find((option) => option.mode === "gemini_openai")
    ?.supportsVisionImages,
  true,
);
assert.equal(
  AI_PROVIDER_MODE_OPTIONS.find((option) => option.mode === "gemini_openai")
    ?.supportsPdfInput,
  false,
);

function makeGeminiNativeFetchRecorder({
  generateText = JSON.stringify({
    questions: [
      {
        asset_placeholders: [],
        content_html: "<p>Gemini native PDF test.</p>",
        content_source: "Gemini native PDF test.",
        difficulty_rating: 500,
        new_tag_names: [],
        page_refs: [1],
        question_code: "GEMINI_NATIVE_001",
        question_type: "frq",
        solution_html: "<p>Solution.</p>",
        solution_source: "Solution.",
        status: "published",
        tag_names: [],
        tag_slugs: [],
        title: "Gemini Native PDF Test",
      },
    ],
    warnings: [],
  }),
} = {}) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    const bodyText =
      typeof init.body === "string" ? init.body : init.body ? "[binary]" : "";
    calls.push({
      bodyText,
      headers: init.headers ?? {},
      method: init.method ?? "GET",
      url: String(url),
    });

    if (String(url).includes("/upload/v1beta/files")) {
      return new Response("{}", {
        headers: {
          "x-goog-upload-url": "https://upload.example.test/session",
        },
        status: 200,
      });
    }

    if (String(url) === "https://upload.example.test/session") {
      return Response.json({
        file: {
          mimeType: "application/pdf",
          name: "files/security-smoke-pdf",
          state: "PROCESSING",
          uri: "https://generativelanguage.googleapis.com/v1beta/files/security-smoke-pdf",
        },
      });
    }

    if (
      String(url) ===
        "https://generativelanguage.googleapis.com/v1beta/files/security-smoke-pdf" &&
      init.method === "GET"
    ) {
      return Response.json({
        file: {
          mimeType: "application/pdf",
          name: "files/security-smoke-pdf",
          state: "ACTIVE",
          uri: "https://generativelanguage.googleapis.com/v1beta/files/security-smoke-pdf",
        },
      });
    }

    if (String(url).includes(":generateContent")) {
      return Response.json({
        candidates: [
          {
            content: {
              parts: [{ text: generateText }],
            },
          },
        ],
      });
    }

    if (
      String(url) ===
        "https://generativelanguage.googleapis.com/v1beta/files/security-smoke-pdf" &&
      init.method === "DELETE"
    ) {
      return Response.json({});
    }

    throw new Error(`Unexpected Gemini fake fetch call: ${url}`);
  };

  return { calls, fetchImpl };
}

const {
  calls: geminiNativeTextCalls,
  fetchImpl: geminiNativeTextFetch,
} = makeGeminiNativeFetchRecorder({ generateText: "ok" });
const textTestResult = await testGeminiNativeTextConnection({
  apiKey: "fake-gemini-native-key",
  baseUrl: "https://generativelanguage.googleapis.com/v1beta",
  fetchImpl: geminiNativeTextFetch,
  model: "gemini-2.5-flash-lite",
});
assert.equal(textTestResult.message, "Gemini Native connection test passed.");
const textTestGenerateCall = geminiNativeTextCalls.find((call) =>
  call.url.includes(":generateContent"),
);
assert.ok(textTestGenerateCall);
assert.match(
  textTestGenerateCall.url,
  /https:\/\/generativelanguage\.googleapis\.com\/v1beta\/models\/gemini-2\.5-flash-lite:generateContent/,
);
assert.equal(textTestGenerateCall.bodyText.includes("Return exactly: ok"), true);
assert.equal(textTestGenerateCall.bodyText.includes("file_data"), false);
assert.equal(textTestGenerateCall.bodyText.includes("inline_data"), false);
assert.equal(
  geminiNativeTextCalls.some((call) => call.url.includes("/chat/completions")),
  false,
);

const { calls: geminiNativeCalls, fetchImpl: geminiNativeFetch } =
  makeGeminiNativeFetchRecorder();
const geminiNativeResult = await generateWithGeminiNativePdf({
  apiKey: "fake-gemini-native-key",
  fetchImpl: geminiNativeFetch,
  fileName: "security-smoke.pdf",
  maxPollAttempts: 1,
  model: "gemini-2.5-pro",
  pdfBytes: Buffer.from("%PDF-1.4 fake"),
  pollDelayMs: 0,
  prompt: "Extract JSON.",
});
assert.match(geminiNativeResult.text, /GEMINI_NATIVE_001/);
assert.equal(
  geminiNativeCalls.some((call) => call.url.includes("/chat/completions")),
  false,
);
assert.equal(
  geminiNativeCalls.some((call) => call.bodyText.includes('"type":"file"')),
  false,
);
assert.equal(
  geminiNativeCalls.some((call) => call.bodyText.includes('"file_data"')),
  true,
);
assert.equal(
  geminiNativeCalls.some((call) => call.url.includes("fake-gemini-native-key")),
  false,
);
assert.equal(
  geminiNativeCalls.some((call) =>
    JSON.stringify(call.headers).includes("fake-gemini-native-key"),
  ),
  true,
);

const geminiNativeExtraction = aiPdfExtractionSchema.parse(
  parsePossiblyMalformedJson(geminiNativeResult.text),
);
assert.equal(geminiNativeExtraction.questions[0].question_code, "GEMINI_NATIVE_001");
assert.equal("status" in geminiNativeExtraction.questions[0], false);

const chatSource = await readFile(
  new URL("../src/lib/ai-providers/chat.ts", import.meta.url),
  "utf8",
);
assert.match(chatSource, /inputStrategy === "gemini_native_pdf"/);
assert.match(chatSource, /generateWithGeminiNativePdf/);

await assert.rejects(
  generateWithGeminiNativePdf({
    apiKey: "",
    fetchImpl: async () => Response.json({}),
    fileName: "security-smoke.pdf",
    model: "gemini-2.5-pro",
    pdfBytes: Buffer.from("%PDF-1.4 fake"),
    prompt: "Extract JSON.",
  }),
  /Gemini Native provider API key is missing/,
);

await assert.rejects(
  testGeminiNativeTextConnection({
    apiKey: "fake-gemini-native-key",
    fetchImpl: async () =>
      new Response(JSON.stringify({ error: { message: "bad model" } }), {
        status: 404,
      }),
    model: "gemini-unknown",
  }),
  (error) => {
    assert.ok(error instanceof Error);
    assert.match(error.message, /Gemini Native generateContent failed \(404\)/);
    assert.equal(error.message.includes("fake-gemini-native-key"), false);
    return true;
  },
);

console.log(
  "PASS AI provider adapter routes DeepSeek, Gemini OpenAI, and Gemini Native full PDF safely",
);
