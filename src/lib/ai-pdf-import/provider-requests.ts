import crypto from "node:crypto";

import type { AIExtractionSchemaVersion } from "./extraction-schema";
import type {
  AIExtractionBatch,
  AIExtractionBatchPlan,
} from "./extraction-batches";

type AIProviderRequestPlanVersion = "provider_request_plan_v1";

export type AIProviderRequestKind =
  | "schema_text_extraction"
  | "schema_mixed_extraction"
  | "schema_vision_extraction"
  | "schema_boundary_review"
  | "schema_single_image_extraction";

export interface AIProviderRequestPlan {
  generatedAt: string;
  requests: AIProviderRequestDraft[];
  sourceKind: AIExtractionBatchPlan["sourceKind"];
  stats: AIProviderRequestPlanStats;
  status: "completed" | "failed" | "skipped";
  version: AIProviderRequestPlanVersion;
  warnings: string[];
}

export interface AIProviderRequestDraft {
  batchHash: string;
  batchId: string;
  budget: {
    estimatedChars: number;
    estimatedTokens?: number;
    hasImageInput: boolean;
    hasTextInput: boolean;
    packetCount: number;
  };
  inputRefs: {
    assetRefs: string[];
    pageNumbers: number[];
  };
  kind: AIProviderRequestKind;
  packetHashes: string[];
  packetIds: string[];
  prompt: {
    expectedSchemaVersion: AIExtractionSchemaVersion;
    systemInstruction: string;
    userInstruction: string;
  };
  recommendedMode: "text" | "vision" | "mixed" | "review_only";
  requestHash: string;
  requestId: string;
  safety: {
    jsonOnly: true;
    noMarkdown: true;
    preservePacketHashes: true;
    preservePacketIds: true;
    useOnlyProvidedAssets: true;
    useOnlyProvidedPages: true;
  };
}

interface AIProviderRequestPlanStats {
  boundaryReviewRequests: number;
  estimatedTotalChars: number;
  estimatedTotalTokens?: number;
  mixedRequests: number;
  singleImageRequests: number;
  skippedBatches: number;
  textRequests: number;
  totalPacketsCovered: number;
  totalRequests: number;
  visionRequests: number;
}

const USER_INSTRUCTION_MAX_LENGTH = 6000;
const PLAN_WARNING_REQUEST_COUNT = 60;
const PLAN_WARNING_CHAR_BUDGET = 120000;

function stableHash(value: unknown) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function estimatedTokens(chars: number) {
  return Math.ceil(chars / 4);
}

function requestKindForBatch(batch: AIExtractionBatch): AIProviderRequestKind | null {
  if (batch.status !== "planned") {
    return null;
  }

  if (batch.batchKind === "text_question_batch") {
    return "schema_text_extraction";
  }

  if (batch.batchKind === "boundary_risk_batch") {
    return "schema_boundary_review";
  }

  if (batch.batchKind === "asset_linked_batch") {
    return batch.recommendedInputMode === "vision"
      ? "schema_vision_extraction"
      : "schema_mixed_extraction";
  }

  if (batch.batchKind === "single_image_batch") {
    return "schema_single_image_extraction";
  }

  return null;
}

function recommendedModeForRequest(
  kind: AIProviderRequestKind,
  batch: AIExtractionBatch,
): AIProviderRequestDraft["recommendedMode"] {
  if (kind === "schema_boundary_review") {
    return "review_only";
  }

  if (kind === "schema_single_image_extraction") {
    return "vision";
  }

  return batch.recommendedInputMode;
}

function collectPageNumbers(batch: AIExtractionBatch) {
  return Array.from(
    new Set(batch.packetRefs.flatMap((packet) => packet.pageNumbers)),
  ).sort((left, right) => left - right);
}

function collectAssetRefs(batch: AIExtractionBatch) {
  return batch.packetRefs.flatMap((packet) =>
    Array.from({ length: packet.assetRefCount }, (_, index) => {
      const page = packet.pageNumbers[0] ?? "source";
      return `${packet.packetId}:page:${page}:asset:${index}`;
    }),
  );
}

function boundedUserInstruction(instruction: string) {
  if (instruction.length <= USER_INSTRUCTION_MAX_LENGTH) {
    return instruction;
  }

  return `${instruction.slice(0, USER_INSTRUCTION_MAX_LENGTH)}\n[provider_request_prompt_truncated_for_summary]`;
}

function systemInstructionForKind(kind: AIProviderRequestKind) {
  const base = [
    "You extract AP-style question data from planned import work packets.",
    "Return JSON only.",
    "Do not use markdown.",
    "Return one extraction result per packet.",
    "Preserve packetId and packetHash exactly.",
    "Use only provided page numbers and asset references.",
  ];

  if (kind === "schema_boundary_review") {
    base.push(
      "This is boundary review only: identify whether content may cross pages, but do not merge packets in this PR.",
    );
  }

  if (
    kind === "schema_vision_extraction" ||
    kind === "schema_single_image_extraction"
  ) {
    base.push(
      "Vision input may be needed later, but this request draft stores only references, never image bytes.",
    );
  }

  return base.join(" ");
}

function buildProviderRequestUserInstruction(batch: AIExtractionBatch) {
  return [
    "You are extracting structured question data from pre-planned work packets.",
    "Return JSON only.",
    "Do not use markdown.",
    "Return exactly one result per packet.",
    "Each result must use version question_extract_v1.",
    "Preserve each packetId and packetHash exactly.",
    "Missing answer or explanation values must be null.",
    "Do not invent answers, assets, page numbers, packet IDs, or packet hashes.",
    "Use only provided asset references and page numbers.",
    "If unsure, lower confidence and set review.reviewRequired true with a reason.",
    "Do not merge packets unless this is a boundary review request.",
    "Do not output extra commentary.",
    "",
    `Batch: ${batch.batchId}`,
    `Batch kind: ${batch.batchKind}`,
    "Expected JSON shape:",
    JSON.stringify({
      results: batch.packetRefs.map((packet) => ({
        confidence: 0.75,
        packetHash: packet.packetHash,
        packetId: packet.packetId,
        question: {
          answer: null,
          assets: [],
          explanation: null,
          format: "unknown",
          options: [],
          questionNumber: packet.questionNumberHint ?? null,
          source: { pageNumbers: packet.pageNumbers },
          stem: "",
        },
        review: { reasonCodes: ["uncertain"], reviewRequired: true },
        status: "partial",
        version: "question_extract_v1",
        warnings: [],
      })),
    }),
  ].join("\n");
}

function makeProviderRequest({
  batch,
  kind,
  requestIndex,
}: {
  batch: AIExtractionBatch;
  kind: AIProviderRequestKind;
  requestIndex: number;
}): AIProviderRequestDraft {
  const packetIds = batch.packetRefs.map((packet) => packet.packetId);
  const packetHashes = batch.packetRefs.map((packet) => packet.packetHash);
  const batchHash = stableHash({
    batchId: batch.batchId,
    batchKind: batch.batchKind,
    packetHashes,
    packetIds,
  });
  const userInstruction = boundedUserInstruction(
    buildProviderRequestUserInstruction(batch),
  );
  const requestSeed = {
    batchHash,
    kind,
    packetHashes,
    packetIds,
    prompt: userInstruction,
  };
  const requestHash = stableHash(requestSeed);

  return {
    batchHash,
    batchId: batch.batchId,
    budget: {
      estimatedChars: batch.inputBudget.estimatedChars,
      estimatedTokens:
        batch.inputBudget.estimatedTokens ??
        estimatedTokens(batch.inputBudget.estimatedChars),
      hasImageInput: batch.inputBudget.hasImageInput,
      hasTextInput: batch.inputBudget.hasTextInput,
      packetCount: batch.packetRefs.length,
    },
    inputRefs: {
      assetRefs: collectAssetRefs(batch),
      pageNumbers: collectPageNumbers(batch),
    },
    kind,
    packetHashes,
    packetIds,
    prompt: {
      expectedSchemaVersion: "question_extract_v1",
      systemInstruction: systemInstructionForKind(kind),
      userInstruction,
    },
    recommendedMode: recommendedModeForRequest(kind, batch),
    requestHash,
    requestId: `provider-request-${requestIndex + 1}-${requestHash.slice(0, 10)}`,
    safety: {
      jsonOnly: true,
      noMarkdown: true,
      preservePacketHashes: true,
      preservePacketIds: true,
      useOnlyProvidedAssets: true,
      useOnlyProvidedPages: true,
    },
  };
}

function requestStats({
  requests,
  skippedBatches,
}: {
  requests: AIProviderRequestDraft[];
  skippedBatches: number;
}): AIProviderRequestPlanStats {
  const estimatedTotalChars = requests.reduce(
    (sum, request) => sum + request.budget.estimatedChars,
    0,
  );

  return {
    boundaryReviewRequests: requests.filter(
      (request) => request.kind === "schema_boundary_review",
    ).length,
    estimatedTotalChars,
    estimatedTotalTokens: estimatedTokens(estimatedTotalChars),
    mixedRequests: requests.filter(
      (request) => request.kind === "schema_mixed_extraction",
    ).length,
    singleImageRequests: requests.filter(
      (request) => request.kind === "schema_single_image_extraction",
    ).length,
    skippedBatches,
    textRequests: requests.filter(
      (request) => request.kind === "schema_text_extraction",
    ).length,
    totalPacketsCovered: requests.reduce(
      (sum, request) => sum + request.packetIds.length,
      0,
    ),
    totalRequests: requests.length,
    visionRequests: requests.filter(
      (request) => request.kind === "schema_vision_extraction",
    ).length,
  };
}

export function buildAIProviderRequestPlanFromExtractionBatchPlan(
  extractionBatchPlan: AIExtractionBatchPlan,
): AIProviderRequestPlan {
  const warnings = [...extractionBatchPlan.warnings];

  if (extractionBatchPlan.status !== "completed") {
    return failedAIProviderRequestPlan({
      generatedAt: new Date().toISOString(),
      sourceKind: extractionBatchPlan.sourceKind,
      warnings: [
        ...warnings,
        "Provider request plan skipped because extraction batch plan did not complete.",
      ],
    });
  }

  const requests: AIProviderRequestDraft[] = [];
  let skippedBatches = 0;

  for (const batch of extractionBatchPlan.batches) {
    const kind = requestKindForBatch(batch);

    if (!kind) {
      skippedBatches += 1;
      continue;
    }

    requests.push(
      makeProviderRequest({
        batch,
        kind,
        requestIndex: requests.length,
      }),
    );
  }

  const stats = requestStats({ requests, skippedBatches });

  if (
    stats.totalRequests > PLAN_WARNING_REQUEST_COUNT ||
    stats.estimatedTotalChars > PLAN_WARNING_CHAR_BUDGET
  ) {
    warnings.push("provider_request_plan_summary_limited");
  }

  if (requests.length === 0) {
    warnings.push("No provider request drafts were planned.");
  }

  return {
    generatedAt: new Date().toISOString(),
    requests,
    sourceKind: extractionBatchPlan.sourceKind,
    stats,
    status: requests.length > 0 ? "completed" : "skipped",
    version: "provider_request_plan_v1",
    warnings: uniqueStrings(warnings),
  };
}

export function failedAIProviderRequestPlan({
  generatedAt = new Date().toISOString(),
  sourceKind,
  warnings,
}: {
  generatedAt?: string;
  sourceKind: AIExtractionBatchPlan["sourceKind"];
  warnings: string[];
}): AIProviderRequestPlan {
  return {
    generatedAt,
    requests: [],
    sourceKind,
    stats: {
      boundaryReviewRequests: 0,
      estimatedTotalChars: 0,
      estimatedTotalTokens: 0,
      mixedRequests: 0,
      singleImageRequests: 0,
      skippedBatches: 0,
      textRequests: 0,
      totalPacketsCovered: 0,
      totalRequests: 0,
      visionRequests: 0,
    },
    status: "failed",
    version: "provider_request_plan_v1",
    warnings,
  };
}

export function mergeAIProviderRequestPlanIntoSummary(
  existingAiPdfImport: Record<string, unknown>,
  providerRequestPlan: AIProviderRequestPlan,
) {
  return {
    ...existingAiPdfImport,
    providerRequestPlan,
  };
}
