import crypto from "node:crypto";

export type AIExtractionCoverageAuditPlanVersion =
  "extraction_coverage_audit_plan_v1";

export type AIExtractionCoverageAuditPlanStatus =
  | "completed"
  | "completed_with_warnings"
  | "skipped"
  | "failed";

export type AIExtractionCoverageRiskKind =
  | "terminal_pages_missing_from_extraction"
  | "question_like_page_uncovered"
  | "packet_coverage_low"
  | "batch_coverage_low"
  | "source_page_refs_missing"
  | "provider_success_but_low_coverage"
  | "full_pdf_silent_partial_risk"
  | "chunk_partial_failure"
  | "overlap_duplicate_risk"
  | "unknown";

export interface AIExtractionCoverageAuditPlan {
  batchCoverage: AIBatchCoverageAudit;
  generatedAt: string;
  mode: "planning_only";
  packetCoverage: AIPacketCoverageAudit;
  pageCoverage: AIPageCoverageAudit;
  recommendedRecoveryWindows: AICoverageRecoveryWindow[];
  risks: AIExtractionCoverageRisk[];
  sourceKind: "pdf" | "single_image";
  stats: AIExtractionCoverageAuditStats;
  status: AIExtractionCoverageAuditPlanStatus;
  strategy:
    | "gemini_native_full_pdf"
    | "openai_full_pdf"
    | "page_images"
    | "chunked"
    | "unknown";
  version: AIExtractionCoverageAuditPlanVersion;
  warnings: string[];
}

export interface AIPageCoverageAudit {
  expectedQuestionLikePages: number[];
  extractedSourcePages: number[];
  pagesWithNoSourceRefs: boolean;
  terminalUncoveredPages: number[];
  totalPages: number | null;
  uncoveredQuestionLikePages: number[];
}

export interface AIPacketCoverageAudit {
  coverageRatio: number | null;
  coveredPacketCount: number;
  expectedPacketCount: number;
  uncoveredPacketIds: string[];
}

export interface AIBatchCoverageAudit {
  coverageRatio: number | null;
  coveredBatchCount: number;
  expectedBatchCount: number;
  failedBatchCount: number;
  uncoveredBatchIds: string[];
}

export interface AIExtractionCoverageRisk {
  batchIds: string[];
  evidence: AIExtractionCoverageEvidence[];
  kind: AIExtractionCoverageRiskKind;
  message: string;
  packetIds: string[];
  pageNumbers: number[];
  recommendedAction:
    | "none"
    | "review_only"
    | "coverage_recovery_recommended"
    | "retry_failed_chunks"
    | "run_terminal_page_recovery"
    | "manual_review";
  riskId: string;
  severity: "info" | "low" | "medium" | "high";
}

export interface AIExtractionCoverageEvidence {
  batchIds: string[];
  kind:
    | "preanalysis_page_hint"
    | "packet_plan_ref"
    | "extraction_batch_ref"
    | "provider_run_ref"
    | "draft_source_page_ref"
    | "chunk_status_ref"
    | "terminal_page_gap";
  message: string;
  packetIds: string[];
  pageNumbers: number[];
}

export interface AICoverageRecoveryWindow {
  pageEnd: number;
  pageNumbers: number[];
  pageStart: number;
  packetIds: string[];
  providerCallPlanned: false;
  reason:
    | "terminal_uncovered_pages"
    | "uncovered_question_like_pages"
    | "failed_chunk_pages"
    | "low_packet_coverage";
  recommendedStrategy:
    | "page_images_recovery"
    | "adaptive_reread_recovery"
    | "text_window_recovery"
    | "manual_review";
  reviewRequired: true;
  windowId: string;
}

export interface AIExtractionCoverageAuditStats {
  coveredBatchCount: number;
  coveredPacketCount: number;
  expectedBatchCount: number;
  expectedPacketCount: number;
  expectedQuestionLikePageCount: number;
  extractedSourcePageCount: number;
  highRiskCount: number;
  recoveryWindowCount: number;
  terminalUncoveredPageCount: number;
  uncoveredQuestionLikePageCount: number;
}

type PacketMeta = {
  packetId: string;
  pageNumbers: number[];
};

type BatchMeta = {
  batchId: string;
  packetIds: string[];
  pageNumbers: number[];
  status: string;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function uniqueNumbers(values: number[]) {
  return Array.from(
    new Set(values.filter((value) => Number.isInteger(value) && value >= 1)),
  ).sort((left, right) => left - right);
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function numberValue(value: unknown, fallback = 0) {
  const numeric = Number(value);

  return Number.isFinite(numeric) ? numeric : fallback;
}

function ratio(covered: number, expected: number) {
  return expected > 0 ? Number((covered / expected).toFixed(3)) : null;
}

function stableId(prefix: string, value: unknown) {
  return `${prefix}-${crypto
    .createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex")
    .slice(0, 12)}`;
}

function aiPdfImportFromSummary(value: unknown) {
  const record = asRecord(value);
  const aiPdfImport = asRecord(record.aiPdfImport);

  return Object.keys(aiPdfImport).length ? aiPdfImport : record;
}

function fullSummaryRecord(value: unknown) {
  const record = asRecord(value);
  const aiPdfImport = asRecord(record.aiPdfImport);

  return Object.keys(aiPdfImport).length ? record : { aiPdfImport: record };
}

function sourceKindFrom(aiPdfImport: Record<string, unknown>) {
  const preanalysis = asRecord(aiPdfImport.preanalysis);
  const packetPlan = asRecord(aiPdfImport.packetPlan);

  return preanalysis.sourceKind === "single_image" ||
    packetPlan.sourceKind === "single_image"
    ? "single_image"
    : "pdf";
}

function strategyFrom(aiPdfImport: Record<string, unknown>) {
  const sourceInput = String(
    aiPdfImport.sourceInput ?? aiPdfImport.inputStrategy ?? "",
  );
  const chunking = asRecord(aiPdfImport.chunking);

  if (sourceInput === "gemini_native_pdf") {
    return "gemini_native_full_pdf" as const;
  }

  if (sourceInput === "openai_file") {
    return "openai_full_pdf" as const;
  }

  if (sourceInput === "page_images") {
    return "page_images" as const;
  }

  if (chunking.mode === "sequential") {
    return "chunked" as const;
  }

  return "unknown" as const;
}

function pageNumbersFromRecord(record: Record<string, unknown>): number[] {
  const source = asRecord(record.source);

  return uniqueNumbers([
    ...asArray(record.sourcePages).map(Number),
    ...asArray(record.source_pages).map(Number),
    ...asArray(record.pageNumbers).map(Number),
    ...asArray(record.page_numbers).map(Number),
    ...asArray(source.pageNumbers).map(Number),
    ...asArray(source.page_numbers).map(Number),
  ]);
}

function expectedPagesFromPreanalysis(aiPdfImport: Record<string, unknown>) {
  const preanalysis = asRecord(aiPdfImport.preanalysis);
  const pages = asArray(preanalysis.pages).map(asRecord);

  return uniqueNumbers(
    pages
      .filter((page) => {
        const pageClass = String(page.pageClass ?? "");
        return (
          pageClass === "question_page" ||
          pageClass === "mixed_page" ||
          asArray(page.questionNumberHints).length > 0 ||
          asArray(page.choiceMarkerHints).length > 0
        );
      })
      .map((page) => numberValue(page.pageNumber)),
  );
}

function totalPagesFrom(aiPdfImport: Record<string, unknown>) {
  const preanalysis = asRecord(aiPdfImport.preanalysis);
  const pageCount = numberValue(
    preanalysis.pageCount ?? aiPdfImport.pageCount ?? aiPdfImport.page_count,
    0,
  );

  return pageCount > 0 ? pageCount : null;
}

function packetMetas(aiPdfImport: Record<string, unknown>): PacketMeta[] {
  const packetPlan = asRecord(aiPdfImport.packetPlan);

  return asArray(packetPlan.packets)
    .map(asRecord)
    .map((packet, index) => ({
      packetId: String(packet.packetId ?? `packet-${index + 1}`),
      pageNumbers: pageNumbersFromRecord(packet),
    }));
}

function batchMetas(aiPdfImport: Record<string, unknown>): BatchMeta[] {
  const batchPlan = asRecord(aiPdfImport.extractionBatchPlan);

  return asArray(batchPlan.batches)
    .map(asRecord)
    .map((batch, index) => {
      const packetRefs = asArray(batch.packetRefs).map(asRecord);
      const pageNumbers = uniqueNumbers(
        packetRefs.flatMap((packet) => pageNumbersFromRecord(packet)),
      );

      return {
        batchId: String(batch.batchId ?? `batch-${index + 1}`),
        packetIds: uniqueStrings(
          packetRefs.map((packet) => String(packet.packetId ?? "")),
        ),
        pageNumbers,
        status: String(batch.status ?? "planned"),
      };
    });
}

function extractedSourcePagesFrom(summary: Record<string, unknown>) {
  const aiPdfImport = aiPdfImportFromSummary(summary);
  const createdQuestions = asArray(summary.createdQuestions).map(asRecord);
  const taggingPlan = asRecord(aiPdfImport.taggingV2Plan);
  const taggingTargets = asArray(taggingPlan.targets).map(asRecord);
  const explicitExtracted = asArray(aiPdfImport.extractedSourcePages).map(Number);

  return uniqueNumbers([
    ...explicitExtracted,
    ...createdQuestions.flatMap(pageNumbersFromRecord),
    ...taggingTargets.flatMap((target) =>
      asArray(target.imported === true || target.created === true ? [target] : []).flatMap(
        pageNumbersFromRecord,
      ),
    ),
  ]);
}

function pagesForPackets(packets: PacketMeta[], pageNumbers: number[]) {
  const pageSet = new Set(pageNumbers);

  return packets.filter((packet) =>
    packet.pageNumbers.some((pageNumber) => pageSet.has(pageNumber)),
  );
}

function contiguousRanges(pages: number[]) {
  const sorted = uniqueNumbers(pages);
  const ranges: number[][] = [];
  let current: number[] = [];

  for (const page of sorted) {
    const previous = current[current.length - 1];

    if (!current.length || previous + 1 === page) {
      current.push(page);
      continue;
    }

    ranges.push(current);
    current = [page];
  }

  if (current.length) {
    ranges.push(current);
  }

  return ranges;
}

export function buildPageCoverageAudit(
  summaryInput: unknown,
): AIPageCoverageAudit {
  const summary = fullSummaryRecord(summaryInput);
  const aiPdfImport = aiPdfImportFromSummary(summaryInput);
  const totalPages = totalPagesFrom(aiPdfImport);
  const expectedQuestionLikePages = expectedPagesFromPreanalysis(aiPdfImport);
  const extractedSourcePages = extractedSourcePagesFrom(summary);
  const extractedSet = new Set(extractedSourcePages);
  const uncoveredQuestionLikePages = expectedQuestionLikePages.filter(
    (page) => !extractedSet.has(page),
  );
  const terminalUncoveredPages =
    totalPages === null
      ? []
      : uncoveredQuestionLikePages.filter((page) => page >= Math.max(1, totalPages - 2));

  return {
    expectedQuestionLikePages,
    extractedSourcePages,
    pagesWithNoSourceRefs:
      expectedQuestionLikePages.length > 0 && extractedSourcePages.length === 0,
    terminalUncoveredPages,
    totalPages,
    uncoveredQuestionLikePages,
  };
}

export function buildPacketCoverageAudit(
  summaryInput: unknown,
  pageCoverage = buildPageCoverageAudit(summaryInput),
): AIPacketCoverageAudit {
  const aiPdfImport = aiPdfImportFromSummary(summaryInput);
  const packets = packetMetas(aiPdfImport);
  const extractedSet = new Set(pageCoverage.extractedSourcePages);
  const coveredPackets = packets.filter((packet) =>
    packet.pageNumbers.some((page) => extractedSet.has(page)),
  );
  const uncoveredPacketIds = packets
    .filter((packet) => !coveredPackets.includes(packet))
    .map((packet) => packet.packetId);

  return {
    coverageRatio: ratio(coveredPackets.length, packets.length),
    coveredPacketCount: coveredPackets.length,
    expectedPacketCount: packets.length,
    uncoveredPacketIds,
  };
}

export function buildBatchCoverageAudit(
  summaryInput: unknown,
  packetCoverage = buildPacketCoverageAudit(summaryInput),
): AIBatchCoverageAudit {
  const aiPdfImport = aiPdfImportFromSummary(summaryInput);
  const batches = batchMetas(aiPdfImport);
  const uncoveredPackets = new Set(packetCoverage.uncoveredPacketIds);
  const coveredBatches = batches.filter(
    (batch) =>
      batch.packetIds.length > 0 &&
      batch.packetIds.some((packetId) => !uncoveredPackets.has(packetId)),
  );
  const failedBatchCount = batches.filter((batch) => batch.status === "failed").length;
  const uncoveredBatchIds = batches
    .filter((batch) => !coveredBatches.includes(batch))
    .map((batch) => batch.batchId);

  return {
    coverageRatio: ratio(coveredBatches.length, batches.length),
    coveredBatchCount: coveredBatches.length,
    expectedBatchCount: batches.length,
    failedBatchCount,
    uncoveredBatchIds,
  };
}

function evidence({
  batchIds = [],
  kind,
  message,
  packetIds = [],
  pageNumbers = [],
}: {
  batchIds?: string[];
  kind: AIExtractionCoverageEvidence["kind"];
  message: string;
  packetIds?: string[];
  pageNumbers?: number[];
}): AIExtractionCoverageEvidence {
  return {
    batchIds: uniqueStrings(batchIds),
    kind,
    message,
    packetIds: uniqueStrings(packetIds),
    pageNumbers: uniqueNumbers(pageNumbers),
  };
}

function risk({
  batchIds = [],
  evidence: riskEvidence,
  kind,
  message,
  packetIds = [],
  pageNumbers = [],
  recommendedAction,
  severity,
}: Omit<
  AIExtractionCoverageRisk,
  "batchIds" | "packetIds" | "pageNumbers" | "riskId"
> & {
  batchIds?: string[];
  pageNumbers?: number[];
  packetIds?: string[];
}): AIExtractionCoverageRisk {
  return {
    batchIds: uniqueStrings(batchIds),
    evidence: riskEvidence,
    kind,
    message,
    packetIds: uniqueStrings(packetIds),
    pageNumbers: uniqueNumbers(pageNumbers),
    recommendedAction,
    riskId: stableId("coverage-risk", {
      batchIds,
      kind,
      packetIds,
      pageNumbers,
    }),
    severity,
  };
}

export function buildCoverageRisks({
  batchCoverage,
  pageCoverage,
  packetCoverage,
  summary,
}: {
  batchCoverage: AIBatchCoverageAudit;
  pageCoverage: AIPageCoverageAudit;
  packetCoverage: AIPacketCoverageAudit;
  summary: unknown;
}): AIExtractionCoverageRisk[] {
  const aiPdfImport = aiPdfImportFromSummary(summary);
  const strategy = strategyFrom(aiPdfImport);
  const packets = packetMetas(aiPdfImport);
  const batches = batchMetas(aiPdfImport);
  const risks: AIExtractionCoverageRisk[] = [];

  if (pageCoverage.pagesWithNoSourceRefs) {
    risks.push(
      risk({
        evidence: [
          evidence({
            kind: "draft_source_page_ref",
            message: "No extracted draft source page references were found.",
          }),
        ],
        kind: "source_page_refs_missing",
        message: "Extracted questions do not include source page references.",
        pageNumbers: pageCoverage.expectedQuestionLikePages,
        recommendedAction: "manual_review",
        severity: "medium",
      }),
    );
  }

  if (pageCoverage.uncoveredQuestionLikePages.length) {
    risks.push(
      risk({
        evidence: [
          evidence({
            kind: "preanalysis_page_hint",
            message: "Question-like pages were detected by preanalysis but not referenced by extracted drafts.",
            pageNumbers: pageCoverage.uncoveredQuestionLikePages,
          }),
        ],
        kind: "question_like_page_uncovered",
        message: "Some question-like pages appear uncovered by extracted source references.",
        pageNumbers: pageCoverage.uncoveredQuestionLikePages,
        recommendedAction: "coverage_recovery_recommended",
        severity: "medium",
      }),
    );
  }

  if (pageCoverage.terminalUncoveredPages.length) {
    const terminalPackets = pagesForPackets(packets, pageCoverage.terminalUncoveredPages);
    risks.push(
      risk({
        evidence: [
          evidence({
            kind: "terminal_page_gap",
            message: "Terminal pages appear question-like but are not referenced by extracted drafts.",
            packetIds: terminalPackets.map((packet) => packet.packetId),
            pageNumbers: pageCoverage.terminalUncoveredPages,
          }),
        ],
        kind: "terminal_pages_missing_from_extraction",
        message: "The last pages of the PDF may have been skipped by extraction.",
        packetIds: terminalPackets.map((packet) => packet.packetId),
        pageNumbers: pageCoverage.terminalUncoveredPages,
        recommendedAction: "run_terminal_page_recovery",
        severity: "high",
      }),
    );
  }

  if (
    (strategy === "gemini_native_full_pdf" || strategy === "openai_full_pdf") &&
    (pageCoverage.terminalUncoveredPages.length ||
      packetCoverage.uncoveredPacketIds.length)
  ) {
    risks.push(
      risk({
        evidence: [
          evidence({
            kind: "provider_run_ref",
            message: "Full-PDF provider strategy can succeed while later pages remain uncovered.",
            packetIds: packetCoverage.uncoveredPacketIds,
            pageNumbers: pageCoverage.uncoveredQuestionLikePages,
          }),
        ],
        kind: "full_pdf_silent_partial_risk",
        message: "Full-PDF extraction may have silently skipped later pages.",
        packetIds: packetCoverage.uncoveredPacketIds,
        pageNumbers: pageCoverage.uncoveredQuestionLikePages,
        recommendedAction: "coverage_recovery_recommended",
        severity: "high",
      }),
    );
  }

  if (
    packetCoverage.coverageRatio !== null &&
    packetCoverage.coverageRatio < 0.8 &&
    packetCoverage.expectedPacketCount > 0
  ) {
    risks.push(
      risk({
        evidence: [
          evidence({
            kind: "packet_plan_ref",
            message: "Packet coverage ratio is below threshold.",
            packetIds: packetCoverage.uncoveredPacketIds,
          }),
        ],
        kind: "packet_coverage_low",
        message: "Expected extraction packets have low source-reference coverage.",
        packetIds: packetCoverage.uncoveredPacketIds,
        recommendedAction: "coverage_recovery_recommended",
        severity: packetCoverage.coverageRatio < 0.5 ? "high" : "medium",
      }),
    );
  }

  if (
    batchCoverage.coverageRatio !== null &&
    batchCoverage.coverageRatio < 0.8 &&
    batchCoverage.expectedBatchCount > 0
  ) {
    risks.push(
      risk({
        batchIds: batchCoverage.uncoveredBatchIds,
        evidence: [
          evidence({
            batchIds: batchCoverage.uncoveredBatchIds,
            kind: "extraction_batch_ref",
            message: "Batch coverage ratio is below threshold.",
          }),
        ],
        kind: "batch_coverage_low",
        message: "Expected extraction batches have low source-reference coverage.",
        recommendedAction: "coverage_recovery_recommended",
        severity: batchCoverage.coverageRatio < 0.5 ? "high" : "medium",
      }),
    );
  }

  const chunking = asRecord(aiPdfImport.chunking);
  const failedChunks = asArray(chunking.chunks)
    .map(asRecord)
    .filter((chunk) => chunk.status === "failed");
  if (failedChunks.length) {
    risks.push(
      risk({
        evidence: failedChunks.map((chunk) =>
          evidence({
            kind: "chunk_status_ref",
            message: String(chunk.errorMessage ?? "Chunk failed."),
            pageNumbers: pageNumbersFromRecord(chunk),
          }),
        ),
        kind: "chunk_partial_failure",
        message: "One or more sequential extraction chunks failed.",
        pageNumbers: failedChunks.flatMap(pageNumbersFromRecord),
        recommendedAction: "retry_failed_chunks",
        severity: "medium",
      }),
    );
  }

  const overlapChunks = asArray(chunking.chunks)
    .map(asRecord)
    .filter((chunk) => asArray(chunk.overlapPages).length > 0);
  if (overlapChunks.length) {
    risks.push(
      risk({
        evidence: overlapChunks.map((chunk) =>
          evidence({
            kind: "chunk_status_ref",
            message: "Chunk contains overlap pages; manual duplicate review may be useful.",
            pageNumbers: uniqueNumbers(asArray(chunk.overlapPages).map(Number)),
          }),
        ),
        kind: "overlap_duplicate_risk",
        message: "Overlapping chunk windows may create duplicate extraction candidates.",
        pageNumbers: uniqueNumbers(
          overlapChunks.flatMap((chunk) => asArray(chunk.overlapPages).map(Number)),
        ),
        recommendedAction: "review_only",
        severity: "low",
      }),
    );
  }

  if (!risks.length && packets.length === 0 && batches.length === 0) {
    risks.push(
      risk({
        evidence: [],
        kind: "unknown",
        message: "Coverage audit could not find packet or batch metadata.",
        recommendedAction: "review_only",
        severity: "info",
      }),
    );
  }

  return risks;
}

export function buildRecommendedRecoveryWindows({
  pageCoverage,
  packetCoverage,
  risks,
  summary,
}: {
  pageCoverage: AIPageCoverageAudit;
  packetCoverage: AIPacketCoverageAudit;
  risks: AIExtractionCoverageRisk[];
  summary: unknown;
}): AICoverageRecoveryWindow[] {
  const packets = packetMetas(aiPdfImportFromSummary(summary));
  const windows: AICoverageRecoveryWindow[] = [];
  const addRanges = (
    pages: number[],
    reason: AICoverageRecoveryWindow["reason"],
    recommendedStrategy: AICoverageRecoveryWindow["recommendedStrategy"],
  ) => {
    for (const range of contiguousRanges(pages)) {
      const matchedPackets = pagesForPackets(packets, range);
      windows.push({
        pageEnd: range[range.length - 1],
        pageNumbers: range,
        pageStart: range[0],
        packetIds: matchedPackets.map((packet) => packet.packetId),
        providerCallPlanned: false,
        reason,
        recommendedStrategy,
        reviewRequired: true,
        windowId: stableId("coverage-window", {
          pages: range,
          reason,
        }),
      });
    }
  };

  addRanges(
    pageCoverage.terminalUncoveredPages,
    "terminal_uncovered_pages",
    "page_images_recovery",
  );
  addRanges(
    pageCoverage.uncoveredQuestionLikePages.filter(
      (page) => !pageCoverage.terminalUncoveredPages.includes(page),
    ),
    "uncovered_question_like_pages",
    "adaptive_reread_recovery",
  );

  if (
    packetCoverage.coverageRatio !== null &&
    packetCoverage.coverageRatio < 0.8 &&
    packetCoverage.uncoveredPacketIds.length
  ) {
    const packetPages = packets
      .filter((packet) => packetCoverage.uncoveredPacketIds.includes(packet.packetId))
      .flatMap((packet) => packet.pageNumbers);
    addRanges(packetPages, "low_packet_coverage", "manual_review");
  }

  for (const chunkRisk of risks.filter((item) => item.kind === "chunk_partial_failure")) {
    addRanges(chunkRisk.pageNumbers, "failed_chunk_pages", "page_images_recovery");
  }

  const seen = new Set<string>();

  return windows.filter((window) => {
    if (seen.has(window.windowId)) {
      return false;
    }
    seen.add(window.windowId);
    return true;
  });
}

function planWarnings({
  aiPdfImport,
  batchCoverage,
  pageCoverage,
  packetCoverage,
  recoveryWindows,
  risks,
}: {
  aiPdfImport: Record<string, unknown>;
  batchCoverage: AIBatchCoverageAudit;
  pageCoverage: AIPageCoverageAudit;
  packetCoverage: AIPacketCoverageAudit;
  recoveryWindows: AICoverageRecoveryWindow[];
  risks: AIExtractionCoverageRisk[];
}) {
  const warnings = [
    "coverage_audit_planning_only",
    "coverage_audit_no_provider_call",
    "coverage_audit_no_recovery_execution",
    "coverage_audit_no_review_draft_write",
    "coverage_audit_summary_limited",
  ];

  if (!aiPdfImport.preanalysis) {
    warnings.push("coverage_audit_missing_preanalysis");
  }

  if (!aiPdfImport.packetPlan) {
    warnings.push("coverage_audit_missing_packet_plan");
  }

  if (pageCoverage.pagesWithNoSourceRefs) {
    warnings.push("coverage_audit_source_page_refs_missing");
  }

  if (packetCoverage.expectedPacketCount > 0 && !pageCoverage.extractedSourcePages.length) {
    warnings.push("coverage_audit_packet_refs_missing");
  }

  if (pageCoverage.terminalUncoveredPages.length) {
    warnings.push("coverage_audit_terminal_pages_uncovered");
  }

  if (risks.some((riskItem) => riskItem.kind === "full_pdf_silent_partial_risk")) {
    warnings.push("coverage_audit_full_pdf_silent_partial_risk");
  }

  if (recoveryWindows.length) {
    warnings.push("coverage_audit_recovery_recommended");
  }

  if (batchCoverage.failedBatchCount > 0) {
    warnings.push("coverage_audit_failed_batches_detected");
  }

  return uniqueStrings(warnings);
}

function buildStats({
  batchCoverage,
  pageCoverage,
  packetCoverage,
  recoveryWindows,
  risks,
}: {
  batchCoverage: AIBatchCoverageAudit;
  pageCoverage: AIPageCoverageAudit;
  packetCoverage: AIPacketCoverageAudit;
  recoveryWindows: AICoverageRecoveryWindow[];
  risks: AIExtractionCoverageRisk[];
}): AIExtractionCoverageAuditStats {
  return {
    coveredBatchCount: batchCoverage.coveredBatchCount,
    coveredPacketCount: packetCoverage.coveredPacketCount,
    expectedBatchCount: batchCoverage.expectedBatchCount,
    expectedPacketCount: packetCoverage.expectedPacketCount,
    expectedQuestionLikePageCount: pageCoverage.expectedQuestionLikePages.length,
    extractedSourcePageCount: pageCoverage.extractedSourcePages.length,
    highRiskCount: risks.filter((riskItem) => riskItem.severity === "high").length,
    recoveryWindowCount: recoveryWindows.length,
    terminalUncoveredPageCount: pageCoverage.terminalUncoveredPages.length,
    uncoveredQuestionLikePageCount: pageCoverage.uncoveredQuestionLikePages.length,
  };
}

export function buildAIExtractionCoverageAuditPlanFromSummary(
  summaryInput: unknown,
  generatedAt = new Date().toISOString(),
): AIExtractionCoverageAuditPlan {
  const summary = fullSummaryRecord(summaryInput);
  const aiPdfImport = aiPdfImportFromSummary(summaryInput);
  const pageCoverage = buildPageCoverageAudit(summary);
  const packetCoverage = buildPacketCoverageAudit(summary, pageCoverage);
  const batchCoverage = buildBatchCoverageAudit(summary, packetCoverage);
  const risks = buildCoverageRisks({
    batchCoverage,
    pageCoverage,
    packetCoverage,
    summary,
  });
  const recommendedRecoveryWindows = buildRecommendedRecoveryWindows({
    pageCoverage,
    packetCoverage,
    risks,
    summary,
  });
  const warnings = planWarnings({
    aiPdfImport,
    batchCoverage,
    pageCoverage,
    packetCoverage,
    recoveryWindows: recommendedRecoveryWindows,
    risks,
  });
  const stats = buildStats({
    batchCoverage,
    pageCoverage,
    packetCoverage,
    recoveryWindows: recommendedRecoveryWindows,
    risks,
  });

  return {
    batchCoverage,
    generatedAt,
    mode: "planning_only",
    packetCoverage,
    pageCoverage,
    recommendedRecoveryWindows,
    risks,
    sourceKind: sourceKindFrom(aiPdfImport),
    stats,
    status:
      warnings.length > 5 || risks.some((riskItem) => riskItem.severity === "high")
        ? "completed_with_warnings"
        : "completed",
    strategy: strategyFrom(aiPdfImport),
    version: "extraction_coverage_audit_plan_v1",
    warnings,
  };
}

export function failedAIExtractionCoverageAuditPlan({
  generatedAt = new Date().toISOString(),
  warnings,
}: {
  generatedAt?: string;
  warnings: string[];
}): AIExtractionCoverageAuditPlan {
  const pageCoverage: AIPageCoverageAudit = {
    expectedQuestionLikePages: [],
    extractedSourcePages: [],
    pagesWithNoSourceRefs: false,
    terminalUncoveredPages: [],
    totalPages: null,
    uncoveredQuestionLikePages: [],
  };
  const packetCoverage: AIPacketCoverageAudit = {
    coverageRatio: null,
    coveredPacketCount: 0,
    expectedPacketCount: 0,
    uncoveredPacketIds: [],
  };
  const batchCoverage: AIBatchCoverageAudit = {
    coverageRatio: null,
    coveredBatchCount: 0,
    expectedBatchCount: 0,
    failedBatchCount: 0,
    uncoveredBatchIds: [],
  };
  const risks: AIExtractionCoverageRisk[] = [
    risk({
      evidence: [],
      kind: "unknown",
      message: "Coverage audit failed before planning could complete.",
      recommendedAction: "review_only",
      severity: "info",
    }),
  ];
  const recommendedRecoveryWindows: AICoverageRecoveryWindow[] = [];
  const finalWarnings = uniqueStrings([
    "coverage_audit_planning_only",
    "coverage_audit_no_provider_call",
    "coverage_audit_no_recovery_execution",
    ...warnings,
  ]);

  return {
    batchCoverage,
    generatedAt,
    mode: "planning_only",
    packetCoverage,
    pageCoverage,
    recommendedRecoveryWindows,
    risks,
    sourceKind: "pdf",
    stats: buildStats({
      batchCoverage,
      pageCoverage,
      packetCoverage,
      recoveryWindows: recommendedRecoveryWindows,
      risks,
    }),
    status: "failed",
    strategy: "unknown",
    version: "extraction_coverage_audit_plan_v1",
    warnings: finalWarnings,
  };
}

export function mergeAIExtractionCoverageAuditPlanIntoSummary(
  existingAiPdfImport: Record<string, unknown>,
  extractionCoverageAuditPlan: AIExtractionCoverageAuditPlan,
) {
  return {
    ...existingAiPdfImport,
    extractionCoverageAuditPlan,
  };
}
