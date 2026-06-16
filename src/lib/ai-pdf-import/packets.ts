import crypto from "node:crypto";

import type {
  AIImagePreanalysisResult,
  AIPdfPreanalysisPage,
  AIPdfPreanalysisResult,
  AIPreanalysisAssetHint,
  AIPreanalysisBoundaryRisk,
  AIPreanalysisResult,
} from "./preanalysis-core";

export type AIPacketPlanVersion = "packet_plan_v1";

export type AIPacketSourceKind = "pdf" | "single_image";

export type AIPacketKind =
  | "pdf_question_candidate"
  | "pdf_boundary_risk"
  | "pdf_page_window"
  | "pdf_asset_linked"
  | "single_image_question"
  | "unknown";

export type AIPacketStatus = "planned" | "skipped";

export interface AIPacketPlan {
  generatedAt: string;
  packets: AIWorkPacket[];
  sourceHash?: string | null;
  sourceKind: AIPacketSourceKind;
  stats: AIPacketPlanStats;
  status: "completed" | "failed" | "skipped";
  version: AIPacketPlanVersion;
  warnings: string[];
}

export interface AIWorkPacket {
  assetRefs: AIPacketAssetRef[];
  boundaryRiskRefs: AIPacketBoundaryRiskRef[];
  inputBudget: {
    estimatedChars: number;
    estimatedTokens?: number;
    hasImageInput: boolean;
    hasTextInput: boolean;
  };
  kind: AIPacketKind;
  markerHints: {
    answers: string[];
    choices: string[];
    questionNumbers: string[];
  };
  packetHash: string;
  packetId: string;
  pageNumbers: number[];
  pageSpan?: {
    endPage: number;
    startPage: number;
  } | null;
  questionNumberHint?: string | null;
  reviewHints: {
    likelyNeedsAI: boolean;
    likelyNeedsBoundaryReread: boolean;
    likelyNeedsVision: boolean;
    reasonCodes: string[];
  };
  sourceHash?: string | null;
  sourceKind: AIPacketSourceKind;
  status: AIPacketStatus;
  textLength?: number;
  textPreview?: string | null;
}

export interface AIPacketAssetRef {
  assetHintIndex?: number;
  kind: "image" | "figure" | "table" | "unknown";
  note?: string | null;
  pageNumber?: number;
}

export interface AIPacketBoundaryRiskRef {
  confidence: number;
  evidence?: string | null;
  pageNumber?: number;
  type: string;
}

export interface AIPacketPlanStats {
  assetLinkedPackets: number;
  boundaryRiskPackets: number;
  estimatedTotalChars: number;
  estimatedTotalTokens?: number;
  pdfQuestionCandidatePackets: number;
  singleImagePackets: number;
  skippedPages: number;
  totalPackets: number;
}

const PACKET_TEXT_PREVIEW_MAX_LENGTH = 1200;

function hashStableJson(value: unknown) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex");
}

function boundedPreview(value: string | null | undefined) {
  const normalized = value?.replace(/\s+/g, " ").trim() ?? "";

  return normalized ? normalized.slice(0, PACKET_TEXT_PREVIEW_MAX_LENGTH) : null;
}

function estimatedTokens(chars: number) {
  return Math.ceil(chars / 4);
}

function pageNumbersFromSpan(startPage: number, endPage: number) {
  return Array.from(
    { length: endPage - startPage + 1 },
    (_, index) => startPage + index,
  );
}

function clampPageSpan({
  endPage,
  pageCount,
  startPage,
}: {
  endPage: number;
  pageCount: number;
  startPage: number;
}) {
  const clampedStart = Math.max(1, startPage);
  const clampedEnd = Math.min(pageCount, endPage);

  if (clampedStart > clampedEnd) {
    return null;
  }

  return {
    endPage: clampedEnd,
    startPage: clampedStart,
  };
}

function assetRefsFromPage(page: AIPdfPreanalysisPage) {
  return page.assetHints.map((asset, index) => ({
    assetHintIndex: index,
    kind: asset.kind,
    note: asset.note ?? null,
    pageNumber: asset.pageNumber ?? page.pageNumber,
  }));
}

function boundaryRiskRefsFromPage(page: AIPdfPreanalysisPage) {
  return page.boundaryRisks.map((risk) => ({
    confidence: risk.confidence,
    evidence: risk.evidence ?? null,
    pageNumber: risk.pageNumber ?? page.pageNumber,
    type: risk.type,
  }));
}

function inputBudget({
  assetRefs,
  textPreview,
}: {
  assetRefs: AIPacketAssetRef[];
  textPreview: string | null;
}) {
  const estimatedChars = textPreview?.length ?? 0;

  return {
    estimatedChars,
    estimatedTokens: estimatedTokens(estimatedChars),
    hasImageInput: assetRefs.length > 0,
    hasTextInput: estimatedChars > 0,
  };
}

function createPacket({
  assetRefs = [],
  boundaryRiskRefs = [],
  index,
  kind,
  markerHints,
  pageNumbers,
  pageSpan,
  questionNumberHint = null,
  reasonCodes,
  sourceHash,
  sourceKind,
  textLength,
  textPreview,
}: {
  assetRefs?: AIPacketAssetRef[];
  boundaryRiskRefs?: AIPacketBoundaryRiskRef[];
  index: number;
  kind: AIPacketKind;
  markerHints: AIWorkPacket["markerHints"];
  pageNumbers: number[];
  pageSpan?: AIWorkPacket["pageSpan"];
  questionNumberHint?: string | null;
  reasonCodes: string[];
  sourceHash?: string | null;
  sourceKind: AIPacketSourceKind;
  textLength?: number;
  textPreview?: string | null;
}): AIWorkPacket {
  const preview = boundedPreview(textPreview);
  const budget = inputBudget({ assetRefs, textPreview: preview });
  const stableInput = {
    assetRefs,
    boundaryRiskRefs,
    kind,
    markerHints,
    pageNumbers,
    pageSpan,
    preview,
    questionNumberHint,
    sourceHash,
    sourceKind,
  };
  const packetHash = hashStableJson(stableInput);

  return {
    assetRefs,
    boundaryRiskRefs,
    inputBudget: budget,
    kind,
    markerHints,
    packetHash,
    packetId: `${sourceKind}-${kind}-${pageNumbers.join("-") || "source"}-${index}-${packetHash.slice(0, 10)}`,
    pageNumbers,
    pageSpan,
    questionNumberHint,
    reviewHints: {
      likelyNeedsAI: true,
      likelyNeedsBoundaryReread:
        kind === "pdf_boundary_risk" || boundaryRiskRefs.length > 0,
      likelyNeedsVision: assetRefs.length > 0 || kind === "single_image_question",
      reasonCodes,
    },
    sourceHash,
    sourceKind,
    status: "planned",
    textLength,
    textPreview: preview,
  };
}

function markerHintsFromPage(page: AIPdfPreanalysisPage) {
  return {
    answers: page.answerMarkerHints,
    choices: page.choiceMarkerHints,
    questionNumbers: page.questionNumberHints,
  };
}

function packetStats({
  packets,
  skippedPages,
}: {
  packets: AIWorkPacket[];
  skippedPages: number;
}): AIPacketPlanStats {
  const estimatedTotalChars = packets.reduce(
    (sum, packet) => sum + packet.inputBudget.estimatedChars,
    0,
  );

  return {
    assetLinkedPackets: packets.filter(
      (packet) =>
        packet.kind === "pdf_asset_linked" || packet.assetRefs.length > 0,
    ).length,
    boundaryRiskPackets: packets.filter(
      (packet) => packet.kind === "pdf_boundary_risk",
    ).length,
    estimatedTotalChars,
    estimatedTotalTokens: estimatedTokens(estimatedTotalChars),
    pdfQuestionCandidatePackets: packets.filter(
      (packet) => packet.kind === "pdf_question_candidate",
    ).length,
    singleImagePackets: packets.filter(
      (packet) => packet.kind === "single_image_question",
    ).length,
    skippedPages,
    totalPackets: packets.length,
  };
}

function boundarySpanForRisk({
  pageCount,
  risk,
}: {
  pageCount: number;
  risk: AIPreanalysisBoundaryRisk;
}) {
  const pageNumber = risk.pageNumber ?? 1;

  if (
    risk.type === "may_start_with_choices" ||
    risk.type === "may_continue_previous_question"
  ) {
    return clampPageSpan({
      endPage: pageNumber,
      pageCount,
      startPage: pageNumber - 1,
    });
  }

  if (
    risk.type === "may_end_mid_question" ||
    risk.type === "may_have_cross_page_figure"
  ) {
    return clampPageSpan({
      endPage: pageNumber + 1,
      pageCount,
      startPage: pageNumber,
    });
  }

  return clampPageSpan({
    endPage: pageNumber,
    pageCount,
    startPage: pageNumber,
  });
}

function pageReasonCodes(page: AIPdfPreanalysisPage) {
  const reasonCodes: string[] = [];

  if (page.pageClass === "unknown") {
    reasonCodes.push("unknown_page");
  }

  if (page.pageClass === "answer_page") {
    reasonCodes.push("answer_context_page");
  }

  if (!page.questionNumberHints.length && page.pageClass === "question_page") {
    reasonCodes.push("question_page_without_number_hint");
  }

  if (page.assetHints.length > 0) {
    reasonCodes.push("asset_hints_present");
  }

  if (page.boundaryRisks.length > 0) {
    reasonCodes.push("boundary_risk_present");
  }

  return reasonCodes;
}

function makePdfPagePacket({
  index,
  kind,
  page,
  questionNumberHint = null,
  reasonCodes = [],
  sourceHash,
}: {
  index: number;
  kind: AIPacketKind;
  page: AIPdfPreanalysisPage;
  questionNumberHint?: string | null;
  reasonCodes?: string[];
  sourceHash?: string | null;
}) {
  return createPacket({
    assetRefs: assetRefsFromPage(page),
    boundaryRiskRefs: boundaryRiskRefsFromPage(page),
    index,
    kind,
    markerHints: markerHintsFromPage(page),
    pageNumbers: [page.pageNumber],
    pageSpan: {
      endPage: page.pageNumber,
      startPage: page.pageNumber,
    },
    questionNumberHint,
    reasonCodes: Array.from(new Set(reasonCodes)),
    sourceHash,
    sourceKind: "pdf",
    textLength: page.extractedTextLength,
    textPreview: page.extractedTextPreview,
  });
}

function buildPdfBoundaryPackets({
  nextIndex,
  page,
  pageCount,
  sourceHash,
  warnings,
}: {
  nextIndex: () => number;
  page: AIPdfPreanalysisPage;
  pageCount: number;
  sourceHash?: string | null;
  warnings: string[];
}) {
  const packets: AIWorkPacket[] = [];

  for (const risk of page.boundaryRisks) {
    const pageSpan = boundarySpanForRisk({ pageCount, risk });

    if (!pageSpan) {
      warnings.push(
        `Skipped boundary packet for page ${page.pageNumber}: invalid page window.`,
      );
      continue;
    }

    packets.push(
      createPacket({
        boundaryRiskRefs: [
          {
            confidence: risk.confidence,
            evidence: risk.evidence ?? null,
            pageNumber: risk.pageNumber ?? page.pageNumber,
            type: risk.type,
          },
        ],
        index: nextIndex(),
        kind: "pdf_boundary_risk",
        markerHints: markerHintsFromPage(page),
        pageNumbers: pageNumbersFromSpan(pageSpan.startPage, pageSpan.endPage),
        pageSpan,
        reasonCodes: [`boundary_${risk.type}`],
        sourceHash,
        sourceKind: "pdf",
        textLength: risk.evidence?.length ?? 0,
        textPreview: risk.evidence ?? page.extractedTextPreview,
      }),
    );
  }

  return packets;
}

export function buildPdfPacketPlan(
  preanalysis: AIPdfPreanalysisResult,
): AIPacketPlan {
  const warnings = [...preanalysis.warnings];
  const packets: AIWorkPacket[] = [];
  let skippedPages = 0;
  let packetIndex = 0;
  const nextIndex = () => {
    const current = packetIndex;
    packetIndex += 1;
    return current;
  };

  if (preanalysis.status !== "completed") {
    return failedPacketPlan({
      generatedAt: new Date().toISOString(),
      sourceHash: preanalysis.sourceHash,
      sourceKind: "pdf",
      warnings: [
        ...warnings,
        "Packet plan skipped because preanalysis did not complete.",
      ],
    });
  }

  for (const page of preanalysis.pages) {
    packets.push(
      ...buildPdfBoundaryPackets({
        nextIndex,
        page,
        pageCount: preanalysis.pageCount,
        sourceHash: preanalysis.sourceHash,
        warnings,
      }),
    );

    const reasonCodes = pageReasonCodes(page);
    const hasAssetHints = page.assetHints.length > 0;
    const hasQuestionHints = page.questionNumberHints.length > 0;

    if (
      (page.pageClass === "blank_page" || page.pageClass === "cover_page") &&
      !hasQuestionHints &&
      !hasAssetHints &&
      !page.boundaryRisks.length
    ) {
      skippedPages += 1;
      continue;
    }

    if (
      (page.pageClass === "question_page" || page.pageClass === "mixed_page") &&
      hasQuestionHints
    ) {
      const questionHints = page.questionNumberHints.slice(0, 4);

      if (page.questionNumberHints.length > questionHints.length) {
        warnings.push(
          `Page ${page.pageNumber} has many question number hints; only the first ${questionHints.length} were planned as packets.`,
        );
      }

      for (const questionHint of questionHints) {
        packets.push(
          makePdfPagePacket({
            index: nextIndex(),
            kind: "pdf_question_candidate",
            page,
            questionNumberHint: questionHint,
            reasonCodes: ["question_marker_detected", ...reasonCodes],
            sourceHash: preanalysis.sourceHash,
          }),
        );
      }

      continue;
    }

    if (hasAssetHints && page.extractedTextLength === 0) {
      packets.push(
        makePdfPagePacket({
          index: nextIndex(),
          kind: "pdf_asset_linked",
          page,
          reasonCodes: ["asset_hints_present", ...reasonCodes],
          sourceHash: preanalysis.sourceHash,
        }),
      );
      continue;
    }

    packets.push(
      makePdfPagePacket({
        index: nextIndex(),
        kind: "pdf_page_window",
        page,
        reasonCodes,
        sourceHash: preanalysis.sourceHash,
      }),
    );
  }

  if (preanalysis.pageCount > 25 || packets.length > 80) {
    warnings.push("packet_plan_large_pdf_summary_limited");
  }

  return {
    generatedAt: new Date().toISOString(),
    packets,
    sourceHash: preanalysis.sourceHash,
    sourceKind: "pdf",
    stats: packetStats({ packets, skippedPages }),
    status: "completed",
    version: "packet_plan_v1",
    warnings: Array.from(new Set(warnings)),
  };
}

export function buildImagePacketPlan(
  preanalysis: AIImagePreanalysisResult,
): AIPacketPlan {
  if (preanalysis.status !== "completed") {
    return failedPacketPlan({
      generatedAt: new Date().toISOString(),
      sourceHash: preanalysis.sourceHash,
      sourceKind: "single_image",
      warnings: [
        ...preanalysis.warnings,
        "Packet plan skipped because image preanalysis did not complete.",
      ],
    });
  }

  const reasonCodes = [
    ...(preanalysis.image.qualityHints.includes("too_small")
      ? ["image_too_small"]
      : []),
    ...(preanalysis.image.qualityHints.includes("likely_photo")
      ? ["likely_photo"]
      : []),
    ...(preanalysis.image.qualityHints.includes("likely_screenshot")
      ? ["likely_screenshot"]
      : []),
    ...(preanalysis.textHints.ocrTextAvailable ? ["ocr_text_available"] : []),
    ...(!preanalysis.textHints.ocrTextAvailable ? ["ocr_text_missing"] : []),
  ];
  const packet = createPacket({
    index: 0,
    kind: "single_image_question",
    markerHints: {
      answers: [],
      choices: [],
      questionNumbers: [],
    },
    pageNumbers: [],
    pageSpan: null,
    reasonCodes,
    sourceHash: preanalysis.sourceHash,
    sourceKind: "single_image",
    textLength: preanalysis.textHints.extractedTextLength,
    textPreview: preanalysis.textHints.extractedTextPreview,
  });

  return {
    generatedAt: new Date().toISOString(),
    packets: [
      {
        ...packet,
        reviewHints: {
          ...packet.reviewHints,
          likelyNeedsVision: !preanalysis.textHints.ocrTextAvailable,
        },
      },
    ],
    sourceHash: preanalysis.sourceHash,
    sourceKind: "single_image",
    stats: packetStats({ packets: [packet], skippedPages: 0 }),
    status: "completed",
    version: "packet_plan_v1",
    warnings: preanalysis.warnings,
  };
}

export function buildAIPacketPlanFromPreanalysis(
  preanalysis: AIPreanalysisResult,
) {
  if (preanalysis.sourceKind === "pdf") {
    return buildPdfPacketPlan(preanalysis);
  }

  return buildImagePacketPlan(preanalysis);
}

export function failedPacketPlan({
  generatedAt = new Date().toISOString(),
  sourceHash = null,
  sourceKind,
  warnings,
}: {
  generatedAt?: string;
  sourceHash?: string | null;
  sourceKind: AIPacketSourceKind;
  warnings: string[];
}): AIPacketPlan {
  return {
    generatedAt,
    packets: [],
    sourceHash,
    sourceKind,
    stats: {
      assetLinkedPackets: 0,
      boundaryRiskPackets: 0,
      estimatedTotalChars: 0,
      estimatedTotalTokens: 0,
      pdfQuestionCandidatePackets: 0,
      singleImagePackets: 0,
      skippedPages: 0,
      totalPackets: 0,
    },
    status: "failed",
    version: "packet_plan_v1",
    warnings,
  };
}

export function mergeAIPacketPlanIntoSummary(
  existingAiPdfImport: Record<string, unknown>,
  packetPlan: AIPacketPlan,
) {
  return {
    ...existingAiPdfImport,
    packetPlan,
  };
}
