import type { AiPdfInputStrategy } from "@/lib/ai-providers/adapters";
import type { AIExtractionBatchPlan } from "./extraction-batches";
import type { AIPacketPlan, AIWorkPacket } from "./packets";
import type { AIPdfPreanalysisResult } from "./preanalysis-core";
import type { AIPdfSegmentChunk } from "./segmentation";

export type AISelectiveExecutionPlanVersion = "ai_pdf_selective_execution_v1";

export type AISelectiveExecutionMode =
  | "full_document"
  | "selective_packets"
  | "selective_with_context"
  | "full_document_fallback";

export type AISelectiveExecutionEligibility =
  | "eligible"
  | "not_beneficial"
  | "insufficient_confidence"
  | "unsupported_provider"
  | "boundary_risk"
  | "dense_document"
  | "failed";

export type AISelectiveExecutionWindowStatus =
  | "planned"
  | "materialized"
  | "provider_completed"
  | "fallback";

export type AISelectiveExecutionPageMap = {
  localPage: number;
  originalPage: number;
};

export type AISelectiveExecutionUsageSummary = {
  cachedInputTokens: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
};

export type AISelectiveExecutionWindow = {
  boundaryRiskRefs: Array<{ confidence: number; pageNumber: number; type: string }>;
  contextHaloPages: number[];
  executionStatus: AISelectiveExecutionWindowStatus;
  expectedContentKinds: string[];
  originalPageEnd: number;
  originalPageStart: number;
  originalToLocalPageMap: AISelectiveExecutionPageMap[];
  providerUsageSummary?: AISelectiveExecutionUsageSummary | null;
  selectedPacketIds: string[];
  selectedPages: number[];
  sourcePages: number[];
  sourceReasonCodes: string[];
  windowId: string;
};

export type AISelectiveExecutionPlan = {
  contextPageCount: number;
  eligibility: AISelectiveExecutionEligibility;
  estimatedPageReductionRatio: number;
  generatedAt: string;
  mode: AISelectiveExecutionMode;
  mergedWindowCount: number;
  originalPageMap: AISelectiveExecutionPageMap[];
  packetCount: number;
  reasonCodes: string[];
  selectedPageCount: number;
  sentPageCount: number;
  totalPageCount: number;
  version: AISelectiveExecutionPlanVersion;
  warnings: string[];
  windows: AISelectiveExecutionWindow[];
};

type BuildSelectiveExecutionInput = {
  extractionBatchPlan: AIExtractionBatchPlan;
  generatedAt?: string;
  packetPlan: AIPacketPlan;
  preanalysis: AIPdfPreanalysisResult;
  providerStrategy: AiPdfInputStrategy;
};

const MIN_SOURCE_PAGES = 6;
const MIN_EXPECTED_PAGE_REDUCTION_RATIO = 0.25;
const MAX_SENT_PAGE_RATIO = 0.75;
const MAX_MERGED_WINDOWS = 3;
const CONTEXT_HALO_PAGES = 1;
const MAX_BOUNDARY_RISK_CONFIDENCE = 0.65;

function uniqueSortedPages(values: number[]) {
  return Array.from(
    new Set(values.filter((value) => Number.isInteger(value) && value > 0)),
  ).sort((left, right) => left - right);
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function pageMap(pages: number[]) {
  return pages.map((originalPage, index) => ({
    localPage: index + 1,
    originalPage,
  }));
}

function allPages(pageCount: number) {
  return Array.from({ length: Math.max(0, pageCount) }, (_, index) => index + 1);
}

function windowRanges(pages: number[]) {
  const ranges: Array<{ end: number; start: number }> = [];

  for (const page of uniqueSortedPages(pages)) {
    const current = ranges[ranges.length - 1];

    if (!current || page > current.end + 1) {
      ranges.push({ end: page, start: page });
      continue;
    }

    current.end = page;
  }

  return ranges;
}

function pagesForRange(start: number, end: number) {
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

function nativeSubsetSupported(strategy: AiPdfInputStrategy) {
  return strategy === "gemini_native_pdf" || strategy === "openai_file";
}

function packetReasonCodes(packet: AIWorkPacket) {
  return packet.reviewHints.reasonCodes.map((value) => `packet_${value}`);
}

function expectedKindsForPages({
  pages,
  preanalysis,
}: {
  pages: number[];
  preanalysis: AIPdfPreanalysisResult;
}) {
  const byPage = new Map(preanalysis.pages.map((page) => [page.pageNumber, page]));
  const kinds = new Set<string>();

  for (const pageNumber of pages) {
    const page = byPage.get(pageNumber);
    if (!page) continue;
    if (page.pageClass === "question_page" || page.pageClass === "mixed_page") {
      kinds.add("question_or_prompt");
    }
    if (page.pageClass === "answer_page" || page.answerMarkerHints.length > 0) {
      kinds.add("answer_or_solution_context");
    }
    if (page.assetHints.length > 0) {
      kinds.add("visual_or_table_context");
    }
    if (page.boundaryRisks.length > 0) {
      kinds.add("page_boundary_context");
    }
  }

  return Array.from(kinds).sort();
}

function fallbackPlan({
  eligibility,
  generatedAt,
  packetCount,
  reasonCodes,
  totalPageCount,
  warnings,
}: {
  eligibility: Exclude<AISelectiveExecutionEligibility, "eligible">;
  generatedAt: string;
  packetCount: number;
  reasonCodes: string[];
  totalPageCount: number;
  warnings: string[];
}): AISelectiveExecutionPlan {
  const sourcePages = allPages(totalPageCount);
  const originalPageMap = pageMap(sourcePages);

  return {
    contextPageCount: 0,
    eligibility,
    estimatedPageReductionRatio: 0,
    generatedAt,
    mode: "full_document_fallback",
    mergedWindowCount: 1,
    originalPageMap,
    packetCount,
    reasonCodes: uniqueStrings(reasonCodes),
    selectedPageCount: totalPageCount,
    sentPageCount: totalPageCount,
    totalPageCount,
    version: "ai_pdf_selective_execution_v1",
    warnings: uniqueStrings(warnings),
    windows: [
      {
        boundaryRiskRefs: [],
        contextHaloPages: [],
        executionStatus: "fallback",
        expectedContentKinds: ["full_document_context"],
        originalPageEnd: totalPageCount,
        originalPageStart: totalPageCount > 0 ? 1 : 0,
        originalToLocalPageMap: originalPageMap,
        selectedPacketIds: [],
        selectedPages: sourcePages,
        sourcePages,
        sourceReasonCodes: uniqueStrings(reasonCodes),
        windowId: "full-document-fallback",
      },
    ],
  };
}

export function forceAISelectiveExecutionFallback({
  plan,
  eligibility = "failed",
  reasonCode,
  warning,
}: {
  plan: AISelectiveExecutionPlan;
  eligibility?: Exclude<AISelectiveExecutionEligibility, "eligible">;
  reasonCode: string;
  warning: string;
}) {
  return fallbackPlan({
    eligibility,
    generatedAt: plan.generatedAt,
    packetCount: plan.packetCount,
    reasonCodes: [...plan.reasonCodes, reasonCode],
    totalPageCount: plan.totalPageCount,
    warnings: [...plan.warnings, warning],
  });
}

function relevantPacket(packet: AIWorkPacket) {
  return (
    packet.kind === "pdf_question_candidate" ||
    packet.kind === "pdf_boundary_risk" ||
    packet.kind === "pdf_asset_linked"
  );
}

export function buildAISelectiveExecutionPlan({
  extractionBatchPlan,
  generatedAt = new Date().toISOString(),
  packetPlan,
  preanalysis,
  providerStrategy,
}: BuildSelectiveExecutionInput): AISelectiveExecutionPlan {
  const totalPageCount = preanalysis.pageCount;
  const packetCount = packetPlan.packets.length;

  if (preanalysis.status !== "completed") {
    return fallbackPlan({
      eligibility: "insufficient_confidence",
      generatedAt,
      packetCount,
      reasonCodes: ["preanalysis_not_completed"],
      totalPageCount,
      warnings: ["Selective execution was skipped because PDF preanalysis did not complete."],
    });
  }

  if (
    packetPlan.status !== "completed" ||
    extractionBatchPlan.status !== "completed"
  ) {
    return fallbackPlan({
      eligibility: "insufficient_confidence",
      generatedAt,
      packetCount,
      reasonCodes: ["packet_or_batch_plan_not_completed"],
      totalPageCount,
      warnings: ["Selective execution was skipped because packet planning did not complete."],
    });
  }

  if (!nativeSubsetSupported(providerStrategy)) {
    return fallbackPlan({
      eligibility: "unsupported_provider",
      generatedAt,
      packetCount,
      reasonCodes: ["provider_subset_pdf_not_supported"],
      totalPageCount,
      warnings: ["Selective execution is unavailable for this provider input strategy; the full document will be used."],
    });
  }

  if (totalPageCount < MIN_SOURCE_PAGES) {
    return fallbackPlan({
      eligibility: "dense_document",
      generatedAt,
      packetCount,
      reasonCodes: ["source_below_selective_minimum_pages"],
      totalPageCount,
      warnings: ["Selective execution was skipped because the source is too short for a safe meaningful reduction."],
    });
  }

  if (preanalysis.documentHints.likelyScannedPdf) {
    return fallbackPlan({
      eligibility: "insufficient_confidence",
      generatedAt,
      packetCount,
      reasonCodes: ["scanned_pdf_requires_full_visual_context"],
      totalPageCount,
      warnings: ["Selective execution was skipped because the source needs full visual context."],
    });
  }

  const contentUnknownPages = preanalysis.pages.filter(
    (page) =>
      page.pageClass === "unknown" &&
      (page.extractedTextLength ?? 0) > 0,
  );
  if (contentUnknownPages.length > 0) {
    return fallbackPlan({
      eligibility: "insufficient_confidence",
      generatedAt,
      packetCount,
      reasonCodes: ["unknown_content_pages"],
      totalPageCount,
      warnings: ["Selective execution was skipped because one or more content pages could not be classified safely."],
    });
  }

  const highBoundaryRisks = preanalysis.pages.flatMap((page) =>
    page.boundaryRisks
      .filter((risk) => risk.confidence > MAX_BOUNDARY_RISK_CONFIDENCE)
      .map((risk) => ({ ...risk, pageNumber: risk.pageNumber ?? page.pageNumber })),
  );
  if (highBoundaryRisks.length > 0) {
    return fallbackPlan({
      eligibility: "boundary_risk",
      generatedAt,
      packetCount,
      reasonCodes: ["high_confidence_cross_page_boundary_risk"],
      totalPageCount,
      warnings: ["Selective execution was skipped because cross-page boundaries need full-document context."],
    });
  }

  const packetById = new Map(packetPlan.packets.map((packet) => [packet.packetId, packet]));
  const plannedPacketIds = new Set(
    extractionBatchPlan.batches
      .filter((batch) => batch.status === "planned")
      .flatMap((batch) => batch.packetRefs.map((packet) => packet.packetId)),
  );
  const packets = Array.from(plannedPacketIds)
    .map((packetId) => packetById.get(packetId))
    .filter((packet): packet is AIWorkPacket => Boolean(packet))
    .filter(relevantPacket);

  const selectedPages = new Set<number>();
  const pageReasons = new Map<number, string[]>();
  const addPage = (page: number, reason: string) => {
    if (page < 1 || page > totalPageCount) return;
    selectedPages.add(page);
    pageReasons.set(page, [...(pageReasons.get(page) ?? []), reason]);
  };

  for (const packet of packets) {
    for (const page of packet.pageNumbers) {
      for (const reason of packetReasonCodes(packet)) addPage(page, reason);
    }
  }

  for (const page of preanalysis.pages) {
    if (
      page.pageClass === "question_page" ||
      page.pageClass === "mixed_page" ||
      page.pageClass === "answer_page" ||
      page.questionNumberHints.length > 0 ||
      page.answerMarkerHints.length > 0 ||
      page.assetHints.length > 0
    ) {
      addPage(page.pageNumber, `preanalysis_${page.pageClass}`);
    }
    for (const risk of page.boundaryRisks) {
      addPage(risk.pageNumber ?? page.pageNumber, `boundary_${risk.type}`);
    }
  }

  const selected = uniqueSortedPages([...selectedPages]);
  if (!selected.length) {
    return fallbackPlan({
      eligibility: "insufficient_confidence",
      generatedAt,
      packetCount,
      reasonCodes: ["no_safe_packet_pages"],
      totalPageCount,
      warnings: ["Selective execution was skipped because no safe source-page selection was available."],
    });
  }

  if (
    preanalysis.documentHints.hasAnswerMarkers &&
    !preanalysis.pages.some(
      (page) => page.answerMarkerHints.length > 0 || page.pageClass === "answer_page",
    )
  ) {
    return fallbackPlan({
      eligibility: "insufficient_confidence",
      generatedAt,
      packetCount,
      reasonCodes: ["answer_context_unresolved"],
      totalPageCount,
      warnings: ["Selective execution was skipped because answer-key relationships could not be located safely."],
    });
  }

  const haloPages = uniqueSortedPages(
    selected.flatMap((page) => [page - CONTEXT_HALO_PAGES, page, page + CONTEXT_HALO_PAGES]),
  ).filter((page) => page >= 1 && page <= totalPageCount);
  const ranges = windowRanges(haloPages);

  if (ranges.length > MAX_MERGED_WINDOWS) {
    return fallbackPlan({
      eligibility: "not_beneficial",
      generatedAt,
      packetCount,
      reasonCodes: ["too_many_selective_windows"],
      totalPageCount,
      warnings: ["Selective execution was skipped because the source would require too many isolated page windows."],
    });
  }

  const sourcePages = ranges.flatMap((range) => pagesForRange(range.start, range.end));
  const sentPageCount = sourcePages.length;
  const reduction = totalPageCount > 0 ? 1 - sentPageCount / totalPageCount : 0;

  if (
    sentPageCount / totalPageCount > MAX_SENT_PAGE_RATIO ||
    reduction < MIN_EXPECTED_PAGE_REDUCTION_RATIO
  ) {
    return fallbackPlan({
      eligibility: "not_beneficial",
      generatedAt,
      packetCount,
      reasonCodes: ["estimated_page_savings_below_threshold"],
      totalPageCount,
      warnings: ["Selective execution was skipped because the expected page reduction is too small to justify additional processing."],
    });
  }

  let localOffset = 0;
  const windows = ranges.map((range, index) => {
    const pages = pagesForRange(range.start, range.end);
    const selectedInWindow = selected.filter((page) => pages.includes(page));
    const contextHaloPages = pages.filter((page) => !selectedInWindow.includes(page));
    const map = pages.map((originalPage, pageIndex) => ({
      localPage: localOffset + pageIndex + 1,
      originalPage,
    }));
    localOffset += pages.length;
    const selectedPacketIds = packets
      .filter((packet) => packet.pageNumbers.some((page) => pages.includes(page)))
      .map((packet) => packet.packetId);
    const boundaryRiskRefs = preanalysis.pages
      .filter((page) => pages.includes(page.pageNumber))
      .flatMap((page) =>
        page.boundaryRisks.map((risk) => ({
          confidence: risk.confidence,
          pageNumber: risk.pageNumber ?? page.pageNumber,
          type: risk.type,
        })),
      );

    return {
      boundaryRiskRefs,
      contextHaloPages,
      executionStatus: "planned" as const,
      expectedContentKinds: expectedKindsForPages({ pages, preanalysis }),
      originalPageEnd: range.end,
      originalPageStart: range.start,
      originalToLocalPageMap: map,
      selectedPacketIds,
      selectedPages: selectedInWindow,
      sourcePages: pages,
      sourceReasonCodes: uniqueStrings(
        pages.flatMap((page) => pageReasons.get(page) ?? []),
      ),
      windowId: `selective-window-${index + 1}-${range.start}-${range.end}`,
    };
  });

  return {
    contextPageCount: sentPageCount - selected.length,
    eligibility: "eligible",
    estimatedPageReductionRatio: Number(reduction.toFixed(4)),
    generatedAt,
    mode: ranges.length > 1 ? "selective_with_context" : "selective_packets",
    mergedWindowCount: windows.length,
    originalPageMap: pageMap(sourcePages),
    packetCount: packets.length,
    reasonCodes: uniqueStrings([
      "packet_plan_completed",
      "extraction_batch_plan_completed",
      "native_subset_pdf_supported",
      "context_halo_applied",
    ]),
    selectedPageCount: selected.length,
    sentPageCount,
    totalPageCount,
    version: "ai_pdf_selective_execution_v1",
    warnings: [],
    windows,
  };
}

export function selectiveExecutionPlanToSegmentChunk(plan: AISelectiveExecutionPlan): AIPdfSegmentChunk | null {
  if (
    plan.eligibility !== "eligible" ||
    !["selective_packets", "selective_with_context"].includes(plan.mode) ||
    !plan.originalPageMap.length
  ) {
    return null;
  }

  const sourcePages = plan.originalPageMap.map((item) => item.originalPage);

  return {
    chunkIndex: 0,
    id: "selective-packet-execution",
    masks: [],
    pageEnd: sourcePages[sourcePages.length - 1] ?? 0,
    pageMapping: plan.originalPageMap.map((item) => ({
      chunkPage: item.localPage,
      sourcePage: item.originalPage,
    })),
    pageStart: sourcePages[0] ?? 0,
    sourcePages,
  };
}

export function markAISelectiveExecutionMaterialized(plan: AISelectiveExecutionPlan) {
  if (plan.eligibility !== "eligible") return plan;

  return {
    ...plan,
    windows: plan.windows.map((window) => ({
      ...window,
      executionStatus: "materialized" as const,
    })),
  };
}

export function recordAISelectiveExecutionUsage({
  plan,
  usage,
}: {
  plan: AISelectiveExecutionPlan;
  usage: AISelectiveExecutionUsageSummary | null;
}) {
  if (plan.eligibility !== "eligible") return plan;

  return {
    ...plan,
    windows: plan.windows.map((window) => ({
      ...window,
      executionStatus: "provider_completed" as const,
      providerUsageSummary: usage,
    })),
  };
}

export function mergeAISelectiveExecutionPlanIntoSummary(
  existingAiPdfImport: Record<string, unknown>,
  selectiveExecutionPlan: AISelectiveExecutionPlan,
) {
  return {
    ...existingAiPdfImport,
    selectiveExecutionPlan,
  };
}
