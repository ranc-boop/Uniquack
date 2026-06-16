import type { AIPacketPlan, AIWorkPacket } from "./packets";

export type AIExtractionBatchPlanVersion = "extraction_batch_plan_v1";

export type AIExtractionBatchKind =
  | "text_question_batch"
  | "boundary_risk_batch"
  | "asset_linked_batch"
  | "single_image_batch"
  | "mixed_review_batch";

export type AIExtractionBatchStatus = "planned" | "skipped" | "failed";

export interface AIExtractionBatchPacketRef {
  assetRefCount: number;
  boundaryRiskCount: number;
  estimatedChars: number;
  kind: AIWorkPacket["kind"];
  packetHash: string;
  packetId: string;
  pageNumbers: number[];
  questionNumberHint?: string | null;
}

export interface AIExtractionBatch {
  batchId: string;
  batchIndex: number;
  batchKind: AIExtractionBatchKind;
  inputBudget: {
    estimatedChars: number;
    estimatedTokens?: number;
    hasImageInput: boolean;
    hasTextInput: boolean;
  };
  packetRefs: AIExtractionBatchPacketRef[];
  recommendedInputMode: "text" | "vision" | "mixed";
  routingHints: string[];
  sourceKind: AIPacketPlan["sourceKind"];
  status: AIExtractionBatchStatus;
}

export interface AIExtractionBatchPlanStats {
  assetLinkedBatches: number;
  boundaryRiskBatches: number;
  estimatedTotalChars: number;
  estimatedTotalTokens?: number;
  mixedReviewBatches: number;
  singleImageBatches: number;
  skippedPackets: number;
  textQuestionBatches: number;
  totalBatches: number;
  totalPackets: number;
}

export interface AIExtractionBatchPlan {
  batches: AIExtractionBatch[];
  generatedAt: string;
  sourceHash?: string | null;
  sourceKind: AIPacketPlan["sourceKind"];
  stats: AIExtractionBatchPlanStats;
  status: "completed" | "failed" | "skipped";
  version: AIExtractionBatchPlanVersion;
  warnings: string[];
}

const TEXT_BATCH_MAX_PACKETS = 8;
const TEXT_BATCH_MIN_PACKETS = 3;
const TEXT_BATCH_MAX_CHARS = 9000;
const TEXT_BATCH_SOFT_CHARS = 6000;
const REVIEW_BATCH_MAX_PACKETS = 3;

function estimatedTokens(chars: number) {
  return Math.ceil(chars / 4);
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function pageDistance(left: AIWorkPacket, right: AIWorkPacket) {
  const leftLast = left.pageNumbers[left.pageNumbers.length - 1] ?? 0;
  const rightFirst = right.pageNumbers[0] ?? 0;

  return Math.abs(rightFirst - leftLast);
}

function packetRef(packet: AIWorkPacket): AIExtractionBatchPacketRef {
  return {
    assetRefCount: packet.assetRefs.length,
    boundaryRiskCount: packet.boundaryRiskRefs.length,
    estimatedChars: packet.inputBudget.estimatedChars,
    kind: packet.kind,
    packetHash: packet.packetHash,
    packetId: packet.packetId,
    pageNumbers: packet.pageNumbers,
    questionNumberHint: packet.questionNumberHint ?? null,
  };
}

function budgetForPackets(packets: AIWorkPacket[]) {
  const estimatedChars = packets.reduce(
    (sum, packet) => sum + packet.inputBudget.estimatedChars,
    0,
  );

  return {
    estimatedChars,
    estimatedTokens: estimatedTokens(estimatedChars),
    hasImageInput: packets.some((packet) => packet.inputBudget.hasImageInput),
    hasTextInput: packets.some((packet) => packet.inputBudget.hasTextInput),
  };
}

function makeBatch({
  batchIndex,
  batchKind,
  packets,
  recommendedInputMode,
  routingHints,
  sourceKind,
}: {
  batchIndex: number;
  batchKind: AIExtractionBatchKind;
  packets: AIWorkPacket[];
  recommendedInputMode: AIExtractionBatch["recommendedInputMode"];
  routingHints: string[];
  sourceKind: AIPacketPlan["sourceKind"];
}): AIExtractionBatch {
  const firstPacket = packets[0];

  return {
    batchId: `extract-${batchIndex + 1}-${firstPacket?.packetHash.slice(0, 10) ?? "empty"}`,
    batchIndex,
    batchKind,
    inputBudget: budgetForPackets(packets),
    packetRefs: packets.map(packetRef),
    recommendedInputMode,
    routingHints: uniqueStrings(routingHints),
    sourceKind,
    status: packets.length > 0 ? "planned" : "skipped",
  };
}

function sortByPacketOrder(packets: AIWorkPacket[]) {
  return [...packets].sort((left, right) => {
    const leftPage = left.pageNumbers[0] ?? Number.MAX_SAFE_INTEGER;
    const rightPage = right.pageNumbers[0] ?? Number.MAX_SAFE_INTEGER;

    if (leftPage !== rightPage) {
      return leftPage - rightPage;
    }

    return left.packetId.localeCompare(right.packetId);
  });
}

function groupTextPackets(packets: AIWorkPacket[]) {
  const groups: AIWorkPacket[][] = [];
  let current: AIWorkPacket[] = [];
  let currentChars = 0;

  for (const packet of sortByPacketOrder(packets)) {
    const wouldExceedHardBudget =
      current.length > 0 &&
      currentChars + packet.inputBudget.estimatedChars > TEXT_BATCH_MAX_CHARS;
    const wouldExceedPacketLimit = current.length >= TEXT_BATCH_MAX_PACKETS;
    const wouldCrossFarPages =
      current.length >= TEXT_BATCH_MIN_PACKETS &&
      pageDistance(current[current.length - 1], packet) > 2;
    const wouldExceedSoftBudget =
      current.length >= TEXT_BATCH_MIN_PACKETS &&
      currentChars + packet.inputBudget.estimatedChars > TEXT_BATCH_SOFT_CHARS;

    if (
      wouldExceedHardBudget ||
      wouldExceedPacketLimit ||
      wouldCrossFarPages ||
      wouldExceedSoftBudget
    ) {
      groups.push(current);
      current = [];
      currentChars = 0;
    }

    current.push(packet);
    currentChars += packet.inputBudget.estimatedChars;
  }

  if (current.length > 0) {
    groups.push(current);
  }

  return groups;
}

function chunkPackets(packets: AIWorkPacket[], size: number) {
  const groups: AIWorkPacket[][] = [];

  for (let index = 0; index < packets.length; index += size) {
    groups.push(packets.slice(index, index + size));
  }

  return groups;
}

function planStats({
  batches,
  skippedPackets,
}: {
  batches: AIExtractionBatch[];
  skippedPackets: number;
}): AIExtractionBatchPlanStats {
  const estimatedTotalChars = batches.reduce(
    (sum, batch) => sum + batch.inputBudget.estimatedChars,
    0,
  );
  const totalPackets = batches.reduce(
    (sum, batch) => sum + batch.packetRefs.length,
    0,
  );

  return {
    assetLinkedBatches: batches.filter(
      (batch) => batch.batchKind === "asset_linked_batch",
    ).length,
    boundaryRiskBatches: batches.filter(
      (batch) => batch.batchKind === "boundary_risk_batch",
    ).length,
    estimatedTotalChars,
    estimatedTotalTokens: estimatedTokens(estimatedTotalChars),
    mixedReviewBatches: batches.filter(
      (batch) => batch.batchKind === "mixed_review_batch",
    ).length,
    singleImageBatches: batches.filter(
      (batch) => batch.batchKind === "single_image_batch",
    ).length,
    skippedPackets,
    textQuestionBatches: batches.filter(
      (batch) => batch.batchKind === "text_question_batch",
    ).length,
    totalBatches: batches.length,
    totalPackets,
  };
}

function packetCategory(packet: AIWorkPacket): AIExtractionBatchKind | "skip" {
  if (packet.status !== "planned") {
    return "skip";
  }

  if (packet.kind === "single_image_question") {
    return "single_image_batch";
  }

  if (packet.kind === "pdf_boundary_risk" || packet.reviewHints.likelyNeedsBoundaryReread) {
    return "boundary_risk_batch";
  }

  if (packet.kind === "pdf_asset_linked" || packet.assetRefs.length > 0) {
    return "asset_linked_batch";
  }

  if (
    packet.kind === "pdf_question_candidate" ||
    packet.kind === "pdf_page_window"
  ) {
    return "text_question_batch";
  }

  return "mixed_review_batch";
}

export function buildAIExtractionBatchPlanFromPacketPlan(
  packetPlan: AIPacketPlan,
): AIExtractionBatchPlan {
  const warnings = [...packetPlan.warnings];

  if (packetPlan.status !== "completed") {
    return failedAIExtractionBatchPlan({
      generatedAt: new Date().toISOString(),
      sourceHash: packetPlan.sourceHash,
      sourceKind: packetPlan.sourceKind,
      warnings: [
        ...warnings,
        "Extraction batch plan skipped because packet plan did not complete.",
      ],
    });
  }

  const groups = {
    asset: [] as AIWorkPacket[],
    boundary: [] as AIWorkPacket[],
    mixed: [] as AIWorkPacket[],
    singleImage: [] as AIWorkPacket[],
    text: [] as AIWorkPacket[],
  };
  let skippedPackets = 0;

  for (const packet of packetPlan.packets) {
    const category = packetCategory(packet);

    if (category === "skip") {
      skippedPackets += 1;
      continue;
    }

    if (category === "text_question_batch") {
      groups.text.push(packet);
    } else if (category === "boundary_risk_batch") {
      groups.boundary.push(packet);
    } else if (category === "asset_linked_batch") {
      groups.asset.push(packet);
    } else if (category === "single_image_batch") {
      groups.singleImage.push(packet);
    } else {
      groups.mixed.push(packet);
    }
  }

  const batches: AIExtractionBatch[] = [];
  const addBatch = (
    batchKind: AIExtractionBatchKind,
    packets: AIWorkPacket[],
    recommendedInputMode: AIExtractionBatch["recommendedInputMode"],
    routingHints: string[],
  ) => {
    batches.push(
      makeBatch({
        batchIndex: batches.length,
        batchKind,
        packets,
        recommendedInputMode,
        routingHints,
        sourceKind: packetPlan.sourceKind,
      }),
    );
  };

  for (const packets of groupTextPackets(groups.text)) {
    addBatch("text_question_batch", packets, "text", [
      "schema_first_text_extraction",
      "nearby_page_grouping",
    ]);
  }

  for (const packets of chunkPackets(sortByPacketOrder(groups.boundary), REVIEW_BATCH_MAX_PACKETS)) {
    addBatch("boundary_risk_batch", packets, "mixed", [
      "boundary_review_required",
      "do_not_blind_concat",
    ]);
  }

  for (const packets of chunkPackets(sortByPacketOrder(groups.asset), REVIEW_BATCH_MAX_PACKETS)) {
    addBatch("asset_linked_batch", packets, "mixed", [
      "asset_reference_review",
      "vision_or_text_plus_asset_context",
    ]);
  }

  for (const packet of sortByPacketOrder(groups.singleImage)) {
    addBatch("single_image_batch", [packet], "vision", [
      "single_image_one_packet_per_batch",
    ]);
  }

  for (const packets of chunkPackets(sortByPacketOrder(groups.mixed), REVIEW_BATCH_MAX_PACKETS)) {
    addBatch("mixed_review_batch", packets, "mixed", [
      "unknown_packet_review",
    ]);
  }

  if (batches.length === 0) {
    warnings.push("No extraction batches were planned from packet plan.");
  }

  return {
    batches,
    generatedAt: new Date().toISOString(),
    sourceHash: packetPlan.sourceHash,
    sourceKind: packetPlan.sourceKind,
    stats: planStats({ batches, skippedPackets }),
    status: batches.length > 0 ? "completed" : "skipped",
    version: "extraction_batch_plan_v1",
    warnings: uniqueStrings(warnings),
  };
}

export function failedAIExtractionBatchPlan({
  generatedAt = new Date().toISOString(),
  sourceHash = null,
  sourceKind,
  warnings,
}: {
  generatedAt?: string;
  sourceHash?: string | null;
  sourceKind: AIPacketPlan["sourceKind"];
  warnings: string[];
}): AIExtractionBatchPlan {
  return {
    batches: [],
    generatedAt,
    sourceHash,
    sourceKind,
    stats: {
      assetLinkedBatches: 0,
      boundaryRiskBatches: 0,
      estimatedTotalChars: 0,
      estimatedTotalTokens: 0,
      mixedReviewBatches: 0,
      singleImageBatches: 0,
      skippedPackets: 0,
      textQuestionBatches: 0,
      totalBatches: 0,
      totalPackets: 0,
    },
    status: "failed",
    version: "extraction_batch_plan_v1",
    warnings,
  };
}

export function mergeAIExtractionBatchPlanIntoSummary(
  existingAiPdfImport: Record<string, unknown>,
  extractionBatchPlan: AIExtractionBatchPlan,
) {
  return {
    ...existingAiPdfImport,
    extractionBatchPlan,
  };
}
