import crypto from "node:crypto";

export type AIAdaptiveRereadPlanVersion = "adaptive_reread_plan_v1";

export type AIAdaptiveRereadPlanStatus =
  | "completed"
  | "completed_with_warnings"
  | "skipped"
  | "failed";

export type AIAdaptiveRereadRequestKind =
  | "cross_page_question_context"
  | "answer_key_context"
  | "asset_context"
  | "low_text_confidence_context"
  | "mixed_layout_context"
  | "review_only";

export type AIAdaptiveRereadReasonCode =
  | "question_near_page_boundary"
  | "answer_marker_on_adjacent_page"
  | "choice_marker_split_across_pages"
  | "diagram_or_table_nearby"
  | "low_text_layer_confidence"
  | "possible_two_column_layout"
  | "provider_request_boundary_review"
  | "provider_run_validation_warning"
  | "unknown_boundary_risk";

export interface AIAdaptiveRereadPlan {
  generatedAt: string;
  mode: "planning_only";
  requests: AIAdaptiveRereadRequest[];
  sourceKind: "pdf" | "single_image";
  stats: AIAdaptiveRereadPlanStats;
  status: AIAdaptiveRereadPlanStatus;
  version: AIAdaptiveRereadPlanVersion;
  warnings: string[];
}

export interface AIAdaptiveRereadRequest {
  assetRefs: string[];
  batchIds: string[];
  budget: {
    estimatedChars: number;
    estimatedTokens?: number;
    hasImageInput: boolean;
    hasTextInput: boolean;
    packetCount: number;
    pageCount: number;
  };
  kind: AIAdaptiveRereadRequestKind;
  packetHashes: string[];
  packetIds: string[];
  pageWindow: {
    endPage: number;
    maxWindowPages: number;
    originalPageNumbers: number[];
    pageNumbers: number[];
    startPage: number;
  };
  priority: "low" | "medium" | "high";
  providerRequestIds: string[];
  providerRunIds: string[];
  reasons: AIAdaptiveRereadReason[];
  rereadRequestHash: string;
  rereadRequestId: string;
  safety: {
    boundedPageWindow: true;
    noBase64: true;
    noFullPdfText: true;
    noImageBytes: true;
    planningOnly: true;
    realCall: false;
  };
  warnings: string[];
}

export interface AIAdaptiveRereadReason {
  code: AIAdaptiveRereadReasonCode;
  confidence: number;
  message: string;
  packetIds: string[];
  pageNumbers: number[];
}

export interface AIAdaptiveRereadPlanStats {
  estimatedTotalChars: number;
  estimatedTotalTokens?: number;
  highPriorityCount: number;
  lowPriorityCount: number;
  mediumPriorityCount: number;
  requestCount: number;
  skippedRiskCount: number;
  totalPacketCount: number;
  totalPageWindowCount: number;
}

type PageMeta = {
  answerMarkerHints: string[];
  assetHints: Array<Record<string, unknown>>;
  boundaryRisks: Array<Record<string, unknown>>;
  choiceMarkerHints: string[];
  extractedTextLength: number;
  pageClass: string;
  pageNumber: number;
  questionNumberHints: string[];
  textLayerAvailable: boolean;
};

type PacketMeta = {
  assetRefs: Array<Record<string, unknown>>;
  boundaryRiskRefs: Array<Record<string, unknown>>;
  inputBudget: {
    estimatedChars: number;
    hasImageInput: boolean;
    hasTextInput: boolean;
  };
  kind: string;
  packetHash: string;
  packetId: string;
  pageNumbers: number[];
  reviewHints: {
    likelyNeedsBoundaryReread: boolean;
    likelyNeedsVision: boolean;
    reasonCodes: string[];
  };
};

type BatchMeta = {
  batchId: string;
  batchKind: string;
  inputBudget: {
    estimatedChars: number;
    hasImageInput: boolean;
    hasTextInput: boolean;
  };
  packetRefs: Array<{
    assetRefCount: number;
    boundaryRiskCount: number;
    estimatedChars: number;
    packetHash: string;
    packetId: string;
    pageNumbers: number[];
  }>;
};

type ProviderRequestMeta = {
  batchId: string;
  inputRefs: { assetRefs: string[]; pageNumbers: number[] };
  kind: string;
  packetHashes: string[];
  packetIds: string[];
  requestId: string;
};

type ProviderRunMeta = {
  dryRunResult?: {
    validation?: {
      warnings?: string[];
    };
  };
  kind: string;
  packetHashes: string[];
  packetIds: string[];
  requestId: string;
  runId: string;
  warnings: string[];
};

type CandidateInput = {
  assetRefs?: string[];
  batchIds?: string[];
  confidence?: number;
  estimatedChars?: number;
  hasImageInput?: boolean;
  hasTextInput?: boolean;
  kind: AIAdaptiveRereadRequestKind;
  message: string;
  packetHashes?: string[];
  packetIds?: string[];
  pageNumbers: number[];
  priority?: AIAdaptiveRereadRequest["priority"];
  providerRequestIds?: string[];
  providerRunIds?: string[];
  reasonCode: AIAdaptiveRereadReasonCode;
};

const DEFAULT_MAX_WINDOW_PAGES = 3;
const MAX_REREAD_REQUESTS = 40;
const LARGE_PLAN_WARNING_THRESHOLD = 30;
const ESTIMATED_CHARS_PER_PAGE = 1200;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function numberValue(value: unknown, fallback = 0) {
  const numeric = Number(value);

  return Number.isFinite(numeric) ? numeric : fallback;
}

function booleanValue(value: unknown) {
  return value === true;
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function uniqueNumbers(values: number[]) {
  return Array.from(
    new Set(values.filter((value) => Number.isInteger(value) && value >= 1)),
  ).sort((left, right) => left - right);
}

function stableHash(value: unknown) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function estimatedTokens(chars: number) {
  return Math.ceil(chars / 4);
}

function sourceKindFromSummary(aiPdfImport: Record<string, unknown>) {
  const sourceKind =
    stringValue(asRecord(aiPdfImport.preanalysis).sourceKind) ||
    stringValue(asRecord(aiPdfImport.packetPlan).sourceKind) ||
    stringValue(asRecord(aiPdfImport.providerRequestPlan).sourceKind) ||
    stringValue(asRecord(aiPdfImport.providerRunPlan).sourceKind);

  return sourceKind === "single_image" ? "single_image" : "pdf";
}

function pageCountFromSummary(aiPdfImport: Record<string, unknown>) {
  const preanalysis = asRecord(aiPdfImport.preanalysis);
  const pageCount = numberValue(preanalysis.pageCount || aiPdfImport.pageCount, 0);

  return Math.max(0, Math.floor(pageCount));
}

function normalizePages(aiPdfImport: Record<string, unknown>): PageMeta[] {
  return asArray(asRecord(aiPdfImport.preanalysis).pages)
    .map((item) => {
      const page = asRecord(item);

      return {
        answerMarkerHints: asArray(page.answerMarkerHints).map(String),
        assetHints: asArray(page.assetHints).map(asRecord),
        boundaryRisks: asArray(page.boundaryRisks).map(asRecord),
        choiceMarkerHints: asArray(page.choiceMarkerHints).map(String),
        extractedTextLength: numberValue(page.extractedTextLength, 0),
        pageClass: stringValue(page.pageClass),
        pageNumber: numberValue(page.pageNumber, 0),
        questionNumberHints: asArray(page.questionNumberHints).map(String),
        textLayerAvailable: page.textLayerAvailable !== false,
      };
    })
    .filter((page) => page.pageNumber >= 1);
}

function normalizePackets(aiPdfImport: Record<string, unknown>): PacketMeta[] {
  return asArray(asRecord(aiPdfImport.packetPlan).packets)
    .map((item) => {
      const packet = asRecord(item);
      const inputBudget = asRecord(packet.inputBudget);
      const reviewHints = asRecord(packet.reviewHints);

      return {
        assetRefs: asArray(packet.assetRefs).map(asRecord),
        boundaryRiskRefs: asArray(packet.boundaryRiskRefs).map(asRecord),
        inputBudget: {
          estimatedChars: numberValue(inputBudget.estimatedChars, 0),
          hasImageInput: booleanValue(inputBudget.hasImageInput),
          hasTextInput: booleanValue(inputBudget.hasTextInput),
        },
        kind: stringValue(packet.kind),
        packetHash: stringValue(packet.packetHash),
        packetId: stringValue(packet.packetId),
        pageNumbers: uniqueNumbers(asArray(packet.pageNumbers).map(Number)),
        reviewHints: {
          likelyNeedsBoundaryReread: booleanValue(
            reviewHints.likelyNeedsBoundaryReread,
          ),
          likelyNeedsVision: booleanValue(reviewHints.likelyNeedsVision),
          reasonCodes: asArray(reviewHints.reasonCodes).map(String),
        },
      };
    })
    .filter((packet) => packet.packetId && packet.packetHash);
}

function normalizeBatches(aiPdfImport: Record<string, unknown>): BatchMeta[] {
  return asArray(asRecord(aiPdfImport.extractionBatchPlan).batches)
    .map((item) => {
      const batch = asRecord(item);
      const inputBudget = asRecord(batch.inputBudget);

      return {
        batchId: stringValue(batch.batchId),
        batchKind: stringValue(batch.batchKind),
        inputBudget: {
          estimatedChars: numberValue(inputBudget.estimatedChars, 0),
          hasImageInput: booleanValue(inputBudget.hasImageInput),
          hasTextInput: booleanValue(inputBudget.hasTextInput),
        },
        packetRefs: asArray(batch.packetRefs).map((packetRef) => {
          const packet = asRecord(packetRef);

          return {
            assetRefCount: numberValue(packet.assetRefCount, 0),
            boundaryRiskCount: numberValue(packet.boundaryRiskCount, 0),
            estimatedChars: numberValue(packet.estimatedChars, 0),
            packetHash: stringValue(packet.packetHash),
            packetId: stringValue(packet.packetId),
            pageNumbers: uniqueNumbers(asArray(packet.pageNumbers).map(Number)),
          };
        }),
      };
    })
    .filter((batch) => batch.batchId);
}

function normalizeProviderRequests(
  aiPdfImport: Record<string, unknown>,
): ProviderRequestMeta[] {
  return asArray(asRecord(aiPdfImport.providerRequestPlan).requests)
    .map((item) => {
      const request = asRecord(item);
      const inputRefs = asRecord(request.inputRefs);

      return {
        batchId: stringValue(request.batchId),
        inputRefs: {
          assetRefs: asArray(inputRefs.assetRefs).map(String),
          pageNumbers: uniqueNumbers(asArray(inputRefs.pageNumbers).map(Number)),
        },
        kind: stringValue(request.kind),
        packetHashes: asArray(request.packetHashes).map(String),
        packetIds: asArray(request.packetIds).map(String),
        requestId: stringValue(request.requestId),
      };
    })
    .filter((request) => request.requestId);
}

function normalizeProviderRuns(aiPdfImport: Record<string, unknown>): ProviderRunMeta[] {
  return asArray(asRecord(aiPdfImport.providerRunPlan).requestRuns)
    .map((item) => {
      const run = asRecord(item);

      return {
        dryRunResult: asRecord(run.dryRunResult) as ProviderRunMeta["dryRunResult"],
        kind: stringValue(run.kind),
        packetHashes: asArray(run.packetHashes).map(String),
        packetIds: asArray(run.packetIds).map(String),
        requestId: stringValue(run.requestId),
        runId: stringValue(run.runId),
        warnings: asArray(run.warnings).map(String),
      };
    })
    .filter((run) => run.runId || run.requestId);
}

function boundedWindow({
  maxWindowPages = DEFAULT_MAX_WINDOW_PAGES,
  pageCount,
  pageNumbers,
}: {
  maxWindowPages?: number;
  pageCount: number;
  pageNumbers: number[];
}) {
  const originalPageNumbers = uniqueNumbers(pageNumbers);
  const anchor = originalPageNumbers[0] ?? 1;
  const safePageCount = Math.max(pageCount, anchor);
  const windowSize = Math.min(maxWindowPages, safePageCount);
  let startPage = Math.max(1, anchor - 1);
  let endPage = Math.min(safePageCount, startPage + windowSize - 1);

  if (endPage - startPage + 1 < windowSize) {
    startPage = Math.max(1, endPage - windowSize + 1);
  }

  const pageWindowNumbers = Array.from(
    { length: endPage - startPage + 1 },
    (_, index) => startPage + index,
  );

  return {
    endPage,
    maxWindowPages,
    originalPageNumbers,
    pageNumbers: pageWindowNumbers,
    startPage,
  };
}

function packetsForPages(packets: PacketMeta[], pageNumbers: number[]) {
  const pages = new Set(pageNumbers);

  return packets.filter((packet) =>
    packet.pageNumbers.some((page) => pages.has(page)),
  );
}

function batchesForPackets(batches: BatchMeta[], packetIds: string[]) {
  const ids = new Set(packetIds);

  return batches.filter((batch) =>
    batch.packetRefs.some((packet) => ids.has(packet.packetId)),
  );
}

function providerRequestsForPackets(
  providerRequests: ProviderRequestMeta[],
  packetIds: string[],
) {
  const ids = new Set(packetIds);

  return providerRequests.filter((request) =>
    request.packetIds.some((packetId) => ids.has(packetId)),
  );
}

function providerRunsForPackets(providerRuns: ProviderRunMeta[], packetIds: string[]) {
  const ids = new Set(packetIds);

  return providerRuns.filter((run) =>
    run.packetIds.some((packetId) => ids.has(packetId)),
  );
}

function priorityFromReason(
  reasonCode: AIAdaptiveRereadReasonCode,
): AIAdaptiveRereadRequest["priority"] {
  if (
    reasonCode === "question_near_page_boundary" ||
    reasonCode === "provider_request_boundary_review" ||
    reasonCode === "provider_run_validation_warning"
  ) {
    return "high";
  }

  if (
    reasonCode === "choice_marker_split_across_pages" ||
    reasonCode === "answer_marker_on_adjacent_page" ||
    reasonCode === "possible_two_column_layout"
  ) {
    return "medium";
  }

  return "low";
}

function kindFromReason(
  reasonCode: AIAdaptiveRereadReasonCode,
): AIAdaptiveRereadRequestKind {
  if (reasonCode === "answer_marker_on_adjacent_page") {
    return "answer_key_context";
  }

  if (reasonCode === "diagram_or_table_nearby") {
    return "asset_context";
  }

  if (reasonCode === "low_text_layer_confidence") {
    return "low_text_confidence_context";
  }

  if (reasonCode === "possible_two_column_layout") {
    return "mixed_layout_context";
  }

  if (reasonCode === "unknown_boundary_risk") {
    return "review_only";
  }

  return "cross_page_question_context";
}

function buildAdaptiveRereadRequest({
  batches,
  candidate,
  pageCount,
  packets,
  providerRequests,
  providerRuns,
}: {
  batches: BatchMeta[];
  candidate: CandidateInput;
  pageCount: number;
  packets: PacketMeta[];
  providerRequests: ProviderRequestMeta[];
  providerRuns: ProviderRunMeta[];
}): AIAdaptiveRereadRequest | null {
  const pageWindow = boundedWindow({
    pageCount,
    pageNumbers: candidate.pageNumbers,
  });

  if (!pageWindow.pageNumbers.length) {
    return null;
  }

  const pagePackets = packetsForPages(packets, pageWindow.pageNumbers);
  const packetIds = uniqueStrings([
    ...(candidate.packetIds ?? []),
    ...pagePackets.map((packet) => packet.packetId),
  ]);
  const packetHashes = uniqueStrings([
    ...(candidate.packetHashes ?? []),
    ...pagePackets.map((packet) => packet.packetHash),
  ]);
  const matchedBatches = batchesForPackets(batches, packetIds);
  const matchedProviderRequests = providerRequestsForPackets(
    providerRequests,
    packetIds,
  );
  const matchedProviderRuns = providerRunsForPackets(providerRuns, packetIds);
  const batchIds = uniqueStrings([
    ...(candidate.batchIds ?? []),
    ...matchedBatches.map((batch) => batch.batchId),
  ]);
  const providerRequestIds = uniqueStrings([
    ...(candidate.providerRequestIds ?? []),
    ...matchedProviderRequests.map((request) => request.requestId),
  ]);
  const providerRunIds = uniqueStrings([
    ...(candidate.providerRunIds ?? []),
    ...matchedProviderRuns.map((run) => run.runId),
  ]);
  const assetRefs = uniqueStrings([
    ...(candidate.assetRefs ?? []),
    ...matchedProviderRequests.flatMap((request) => request.inputRefs.assetRefs),
  ]);
  const estimatedChars =
    candidate.estimatedChars ??
    (matchedBatches.reduce(
      (sum, batch) => sum + batch.inputBudget.estimatedChars,
      0,
    ) ||
      pageWindow.pageNumbers.length * ESTIMATED_CHARS_PER_PAGE);
  const hasImageInput =
    candidate.hasImageInput ??
    (matchedBatches.some((batch) => batch.inputBudget.hasImageInput) ||
      assetRefs.length > 0);
  const hasTextInput =
    candidate.hasTextInput ??
    (matchedBatches.some((batch) => batch.inputBudget.hasTextInput) ||
      pageWindow.pageNumbers.length > 0);
  const reason: AIAdaptiveRereadReason = {
    code: candidate.reasonCode,
    confidence: Math.max(0, Math.min(1, candidate.confidence ?? 0.7)),
    message: candidate.message,
    packetIds,
    pageNumbers: pageWindow.originalPageNumbers,
  };
  const hashSeed = {
    kind: candidate.kind,
    packetHashes,
    packetIds,
    pageWindow,
    reasonCode: candidate.reasonCode,
  };
  const rereadRequestHash = stableHash(hashSeed);

  return {
    assetRefs,
    batchIds,
    budget: {
      estimatedChars,
      estimatedTokens: estimatedTokens(estimatedChars),
      hasImageInput,
      hasTextInput,
      packetCount: packetIds.length,
      pageCount: pageWindow.pageNumbers.length,
    },
    kind: candidate.kind,
    packetHashes,
    packetIds,
    pageWindow,
    priority: candidate.priority ?? priorityFromReason(candidate.reasonCode),
    providerRequestIds,
    providerRunIds,
    reasons: [reason],
    rereadRequestHash,
    rereadRequestId: `adaptive-reread-${rereadRequestHash.slice(0, 12)}`,
    safety: {
      boundedPageWindow: true,
      noBase64: true,
      noFullPdfText: true,
      noImageBytes: true,
      planningOnly: true,
      realCall: false,
    },
    warnings: ["adaptive_reread_planning_only", "adaptive_reread_no_provider_call"],
  };
}

function mergeDuplicateRequests(requests: AIAdaptiveRereadRequest[]) {
  const byHash = new Map<string, AIAdaptiveRereadRequest>();

  for (const request of requests) {
    const existing = byHash.get(request.rereadRequestHash);

    if (!existing) {
      byHash.set(request.rereadRequestHash, request);
      continue;
    }

    existing.assetRefs = uniqueStrings([...existing.assetRefs, ...request.assetRefs]);
    existing.batchIds = uniqueStrings([...existing.batchIds, ...request.batchIds]);
    existing.packetHashes = uniqueStrings([
      ...existing.packetHashes,
      ...request.packetHashes,
    ]);
    existing.packetIds = uniqueStrings([...existing.packetIds, ...request.packetIds]);
    existing.providerRequestIds = uniqueStrings([
      ...existing.providerRequestIds,
      ...request.providerRequestIds,
    ]);
    existing.providerRunIds = uniqueStrings([
      ...existing.providerRunIds,
      ...request.providerRunIds,
    ]);
    existing.reasons.push(...request.reasons);
    existing.warnings = uniqueStrings([...existing.warnings, ...request.warnings]);
  }

  return Array.from(byHash.values());
}

function pushCandidate(candidates: CandidateInput[], candidate: CandidateInput) {
  if (candidate.pageNumbers.length > 0) {
    candidates.push(candidate);
  }
}

function candidatesFromPreanalysis({
  documentHints,
  pages,
}: {
  documentHints: Record<string, unknown>;
  pages: PageMeta[];
}) {
  const candidates: CandidateInput[] = [];

  for (const page of pages) {
    for (const risk of page.boundaryRisks) {
      const riskType = stringValue(risk.type);
      const confidence = numberValue(risk.confidence, 0.7);
      const reasonCode: AIAdaptiveRereadReasonCode =
        riskType === "may_start_with_choices"
          ? "choice_marker_split_across_pages"
          : riskType === "may_continue_previous_question" ||
              riskType === "may_end_mid_question"
            ? "question_near_page_boundary"
            : riskType === "may_have_cross_page_figure"
              ? "diagram_or_table_nearby"
              : "unknown_boundary_risk";

      pushCandidate(candidates, {
        confidence,
        kind: kindFromReason(reasonCode),
        message: `Preanalysis boundary risk ${riskType || "unknown"} on page ${page.pageNumber}.`,
        pageNumbers: [page.pageNumber],
        reasonCode,
      });
    }

    if (page.answerMarkerHints.length > 0 && page.pageNumber > 1) {
      pushCandidate(candidates, {
        confidence: 0.65,
        kind: "answer_key_context",
        message: `Answer marker appeared near page ${page.pageNumber}.`,
        pageNumbers: [page.pageNumber - 1, page.pageNumber],
        reasonCode: "answer_marker_on_adjacent_page",
      });
    }

    if (!page.textLayerAvailable || page.extractedTextLength < 20) {
      pushCandidate(candidates, {
        confidence: 0.55,
        kind: "low_text_confidence_context",
        message: `Page ${page.pageNumber} has weak or missing text-layer metadata.`,
        pageNumbers: [page.pageNumber],
        reasonCode: "low_text_layer_confidence",
      });
    }

    if (page.pageClass === "mixed_page") {
      pushCandidate(candidates, {
        confidence: 0.6,
        kind: "mixed_layout_context",
        message: `Page ${page.pageNumber} is classified as mixed layout.`,
        pageNumbers: [page.pageNumber],
        reasonCode: "possible_two_column_layout",
      });
    }
  }

  if (documentHints.likelyTwoColumnLayout === true) {
    for (const page of pages.filter((page) => page.pageClass === "mixed_page").slice(0, 8)) {
      pushCandidate(candidates, {
        confidence: 0.6,
        kind: "mixed_layout_context",
        message: `Two-column layout hint affects page ${page.pageNumber}.`,
        pageNumbers: [page.pageNumber],
        reasonCode: "possible_two_column_layout",
      });
    }
  }

  return candidates;
}

function candidatesFromPackets(packets: PacketMeta[]) {
  const candidates: CandidateInput[] = [];

  for (const packet of packets) {
    if (packet.kind === "pdf_boundary_risk" || packet.reviewHints.likelyNeedsBoundaryReread) {
      pushCandidate(candidates, {
        estimatedChars: packet.inputBudget.estimatedChars,
        hasImageInput: packet.inputBudget.hasImageInput,
        hasTextInput: packet.inputBudget.hasTextInput,
        kind: "cross_page_question_context",
        message: `Packet ${packet.packetId} is marked for boundary review.`,
        packetHashes: [packet.packetHash],
        packetIds: [packet.packetId],
        pageNumbers: packet.pageNumbers,
        reasonCode: "question_near_page_boundary",
      });
    }

    if (packet.assetRefs.length > 0 || packet.reviewHints.likelyNeedsVision) {
      pushCandidate(candidates, {
        assetRefs: packet.assetRefs.map((asset, index) => {
          const page = numberValue(asset.pageNumber, packet.pageNumbers[0] ?? 0);
          return `${packet.packetId}:page:${page || "source"}:asset:${index}`;
        }),
        estimatedChars: packet.inputBudget.estimatedChars,
        hasImageInput: true,
        hasTextInput: packet.inputBudget.hasTextInput,
        kind: "asset_context",
        message: `Packet ${packet.packetId} has nearby diagram/table/image context.`,
        packetHashes: [packet.packetHash],
        packetIds: [packet.packetId],
        pageNumbers: packet.pageNumbers,
        reasonCode: "diagram_or_table_nearby",
      });
    }
  }

  return candidates;
}

function candidatesFromBatches(batches: BatchMeta[]) {
  const candidates: CandidateInput[] = [];

  for (const batch of batches) {
    if (batch.batchKind !== "boundary_risk_batch") {
      continue;
    }

    pushCandidate(candidates, {
      batchIds: [batch.batchId],
      estimatedChars: batch.inputBudget.estimatedChars,
      hasImageInput: batch.inputBudget.hasImageInput,
      hasTextInput: batch.inputBudget.hasTextInput,
      kind: "cross_page_question_context",
      message: `Extraction batch ${batch.batchId} is boundary-risk related.`,
      packetHashes: batch.packetRefs.map((packet) => packet.packetHash),
      packetIds: batch.packetRefs.map((packet) => packet.packetId),
      pageNumbers: uniqueNumbers(batch.packetRefs.flatMap((packet) => packet.pageNumbers)),
      reasonCode: "question_near_page_boundary",
    });
  }

  return candidates;
}

function candidatesFromProviderRequests(providerRequests: ProviderRequestMeta[]) {
  const candidates: CandidateInput[] = [];

  for (const request of providerRequests) {
    if (request.kind !== "schema_boundary_review") {
      continue;
    }

    pushCandidate(candidates, {
      kind: "cross_page_question_context",
      message: `Provider request ${request.requestId} is a boundary review request.`,
      packetHashes: request.packetHashes,
      packetIds: request.packetIds,
      pageNumbers: request.inputRefs.pageNumbers,
      providerRequestIds: [request.requestId],
      reasonCode: "provider_request_boundary_review",
    });
  }

  return candidates;
}

function candidatesFromProviderRuns({
  packets,
  providerRuns,
}: {
  packets: PacketMeta[];
  providerRuns: ProviderRunMeta[];
}) {
  const candidates: CandidateInput[] = [];

  for (const run of providerRuns) {
    const validationWarnings = asArray(run.dryRunResult?.validation?.warnings).map(
      String,
    );
    const warnings = uniqueStrings([...run.warnings, ...validationWarnings]).filter(
      (warning) => warning.includes("validation"),
    );

    if (!warnings.length) {
      continue;
    }

    const packetPages = packets
      .filter((packet) => run.packetIds.includes(packet.packetId))
      .flatMap((packet) => packet.pageNumbers);

    pushCandidate(candidates, {
      kind: "review_only",
      message: `Provider run ${run.runId || run.requestId} has validation warnings.`,
      packetHashes: run.packetHashes,
      packetIds: run.packetIds,
      pageNumbers: uniqueNumbers(packetPages),
      providerRequestIds: run.requestId ? [run.requestId] : [],
      providerRunIds: run.runId ? [run.runId] : [],
      reasonCode: "provider_run_validation_warning",
    });
  }

  return candidates;
}

function planStats({
  requests,
  skippedRiskCount,
}: {
  requests: AIAdaptiveRereadRequest[];
  skippedRiskCount: number;
}): AIAdaptiveRereadPlanStats {
  const estimatedTotalChars = requests.reduce(
    (sum, request) => sum + request.budget.estimatedChars,
    0,
  );

  return {
    estimatedTotalChars,
    estimatedTotalTokens: estimatedTokens(estimatedTotalChars),
    highPriorityCount: requests.filter((request) => request.priority === "high")
      .length,
    lowPriorityCount: requests.filter((request) => request.priority === "low")
      .length,
    mediumPriorityCount: requests.filter((request) => request.priority === "medium")
      .length,
    requestCount: requests.length,
    skippedRiskCount,
    totalPacketCount: new Set(requests.flatMap((request) => request.packetIds)).size,
    totalPageWindowCount: requests.reduce(
      (sum, request) => sum + request.pageWindow.pageNumbers.length,
      0,
    ),
  };
}

export function buildAIAdaptiveRereadPlanFromSummary(
  aiPdfImport: Record<string, unknown>,
): AIAdaptiveRereadPlan {
  const warnings = [
    "adaptive_reread_planning_only",
    "adaptive_reread_no_provider_call",
  ];
  const sourceKind = sourceKindFromSummary(aiPdfImport);
  const pageCount = pageCountFromSummary(aiPdfImport);
  const preanalysis = asRecord(aiPdfImport.preanalysis);
  const documentHints = asRecord(preanalysis.documentHints);
  const pages = normalizePages(aiPdfImport);
  const packets = normalizePackets(aiPdfImport);
  const batches = normalizeBatches(aiPdfImport);
  const providerRequests = normalizeProviderRequests(aiPdfImport);
  const providerRuns = normalizeProviderRuns(aiPdfImport);

  if (!providerRequests.length) {
    warnings.push("adaptive_reread_missing_provider_request_plan");
  }

  if (!providerRuns.length) {
    warnings.push("adaptive_reread_missing_provider_run_plan");
  }

  const candidates = [
    ...candidatesFromPreanalysis({ documentHints, pages }),
    ...candidatesFromPackets(packets),
    ...candidatesFromBatches(batches),
    ...candidatesFromProviderRequests(providerRequests),
    ...candidatesFromProviderRuns({ packets, providerRuns }),
  ];
  const builtRequests: AIAdaptiveRereadRequest[] = [];
  let skippedRiskCount = 0;

  for (const candidate of candidates) {
    const request = buildAdaptiveRereadRequest({
      batches,
      candidate,
      pageCount,
      packets,
      providerRequests,
      providerRuns,
    });

    if (!request) {
      skippedRiskCount += 1;
      continue;
    }

    builtRequests.push(request);
  }

  let requests = mergeDuplicateRequests(builtRequests).sort((left, right) => {
    const priorityRank = { high: 0, medium: 1, low: 2 };
    const priorityDelta = priorityRank[left.priority] - priorityRank[right.priority];

    if (priorityDelta !== 0) {
      return priorityDelta;
    }

    return left.pageWindow.startPage - right.pageWindow.startPage;
  });

  if (requests.length > MAX_REREAD_REQUESTS) {
    skippedRiskCount += requests.length - MAX_REREAD_REQUESTS;
    requests = requests.slice(0, MAX_REREAD_REQUESTS);
    warnings.push("adaptive_reread_large_plan_limited");
  }

  if (requests.length > LARGE_PLAN_WARNING_THRESHOLD) {
    warnings.push("adaptive_reread_summary_limited");
  }

  if (!requests.length && candidates.length > 0) {
    warnings.push("adaptive_reread_request_skipped_unknown_risk");
  }

  const stats = planStats({ requests, skippedRiskCount });

  return {
    generatedAt: new Date().toISOString(),
    mode: "planning_only",
    requests,
    sourceKind,
    stats,
    status:
      requests.length === 0
        ? candidates.length > 0
          ? "completed_with_warnings"
          : "skipped"
        : warnings.length > 2 || skippedRiskCount > 0
          ? "completed_with_warnings"
          : "completed",
    version: "adaptive_reread_plan_v1",
    warnings: uniqueStrings(warnings),
  };
}

export function failedAIAdaptiveRereadPlan({
  generatedAt = new Date().toISOString(),
  sourceKind = "pdf",
  warnings,
}: {
  generatedAt?: string;
  sourceKind?: "pdf" | "single_image";
  warnings: string[];
}): AIAdaptiveRereadPlan {
  return {
    generatedAt,
    mode: "planning_only",
    requests: [],
    sourceKind,
    stats: {
      estimatedTotalChars: 0,
      estimatedTotalTokens: 0,
      highPriorityCount: 0,
      lowPriorityCount: 0,
      mediumPriorityCount: 0,
      requestCount: 0,
      skippedRiskCount: 0,
      totalPacketCount: 0,
      totalPageWindowCount: 0,
    },
    status: "failed",
    version: "adaptive_reread_plan_v1",
    warnings,
  };
}

export function mergeAIAdaptiveRereadPlanIntoSummary(
  existingAiPdfImport: Record<string, unknown>,
  adaptiveRereadPlan: AIAdaptiveRereadPlan,
) {
  return {
    ...existingAiPdfImport,
    adaptiveRereadPlan,
  };
}
