import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

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
