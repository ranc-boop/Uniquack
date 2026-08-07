import "server-only";

import { createHash } from "node:crypto";

import {
  buildAIProviderUsageAccounting,
  normalizeAIProviderUsage,
  normalizeAIProviderUsageAccounting,
  type AIProviderUsage,
  type AIProviderUsageAccounting,
} from "@/lib/ai-operations/provider-usage";
import type { AiPdfInputStrategy } from "@/lib/ai-providers/adapters";
import type { AIProviderErrorCode } from "@/lib/ai-providers/errors";
import type { AIPdfVisualProposalRejectionCounts } from "@/lib/ai-pdf-import/visual-evidence";
import type { AIPdfProviderAttemptReason } from "@/lib/ai-providers/ai-pdf-attempt-state";

export const AI_PDF_PARSING_BASELINE_ANCHOR =
  "f1ce7bcb791604468693ea945401cfb157e64d97";
export const AI_PDF_PARSING_BASELINE_VERSION =
  "ai-pdf-parsing/f1ce7bc-baseline-v1";
export const AI_PDF_PARSING_TREATMENT_VERSION =
  "ai-pdf-parsing/provider-neutral-v5";
export const AI_PDF_QUALITY_OBSERVATORY_VERSION = 5;
export const AI_PDF_ATTEMPT_REASON_VERSION = 3;
export const AI_PDF_CONTEXT_ACCOUNTING_VERSION = 2;

export type AIPdfAttemptReason =
  | AIPdfProviderAttemptReason
  | "CHECKPOINT_REPLAY_ZERO_INFERENCE";

export type AIPdfAttemptFailureCategory =
  | "application_schema"
  | "non_json"
  | "response_missing"
  | "zero_importable"
  | AIProviderErrorCode;

export type AIPdfCandidateMetrics = {
  applicationValidCandidates: number;
  rawCandidates: number;
  rejectedCandidates: number;
  schemaValidCandidates: number;
  warningCount: number;
};

export type AIPdfSerializedRequestContext = {
  extractionInstructionBytes: number;
  previousResponseBytes: number;
  semanticRecoveryInstructionBytes: number;
  serializedRequestBytes: number;
  sourceInputBytes: number;
  structuralRepairInstructionBytes: number;
  structuredSchemaBytes: number;
  systemInstructionBytes: number;
  taxonomyCandidateBytes: number;
};

export type AIPdfAttemptInput = {
  context: AIPdfSerializedRequestContext;
  extractionAttempt: number;
  inferenceOrdinal: number;
  inputStrategy: AiPdfInputStrategy;
  reason: Exclude<AIPdfAttemptReason, "CHECKPOINT_REPLAY_ZERO_INFERENCE">;
  routeCandidateIndex: number;
  scope: string;
  sourceIncluded: boolean;
  sourceRepeated: boolean;
  transportAttempt: number;
};

type AIPdfAttemptCompletion = {
  failureCategory?: AIPdfAttemptFailureCategory;
  output?: AIPdfCandidateMetrics;
  outcome: "failed" | "success";
  usage?: AIProviderUsage | null;
  usageAccounting?: AIProviderUsageAccounting | null;
};

export type AIPdfAttemptRecord = AIPdfAttemptInput & {
  componentOverflowBytes: number;
  durationMs: number;
  failureCategory: AIPdfAttemptFailureCategory | null;
  fixedTransportOverheadBytes: number;
  outcome: "failed" | "success";
  output: AIPdfCandidateMetrics | null;
  usage: AIProviderUsage | null;
  usageAccounting: AIProviderUsageAccounting | null;
};

export type AIPdfVisualQualityMetrics = {
  attachedAssets: number;
  blockingMissingRequired: number;
  decorativeSkipped: number;
  duplicateProposals: number;
  invalidProposals: number;
  invalidProposalReasons: AIPdfVisualProposalRejectionCounts;
  proposedAssets: number;
  requiredQuestions: number;
  reusedAssets: number;
  validCrops: number;
};

export type AIPdfContractEvidence = {
  candidateCount: number;
  candidateSubsetBytes: number;
  candidateSubsetSha256: string;
  fullTaxonomySnapshotBytes: number;
  fullTaxonomySnapshotSha256: string;
  parsingContractSha256: string;
  promptContractVersion: string;
  repairPolicyVersion: string;
  retrievalAlgorithmVersion: string;
  schemaContractVersion: string;
  subsetToFullCatalogByteRatio: number | null;
  taxonomySnapshotSha256: string;
  taxonomySnapshotVersion: number;
};

export type AIPdfQualitySnapshot = {
  attemptHistogram: Record<AIPdfAttemptReason, number>;
  attemptReasonVersion: typeof AI_PDF_ATTEMPT_REASON_VERSION;
  attempts: AIPdfAttemptRecord[];
  attemptsPerJob: number;
  checkpointReplayCount: number;
  contextAccountingVersion: typeof AI_PDF_CONTEXT_ACCOUNTING_VERSION;
  contextComposition: {
    componentBytes: {
      extractionInstructions: number;
      fixedTransportOverhead: number;
      previousResponse: number;
      semanticRecoveryInstructions: number;
      sourceInput: number;
      structuralRepairInstructions: number;
      structuredSchema: number;
      systemInstructions: number;
      taxonomyCandidates: number;
    };
    componentOverflowBytes: number;
    nonSourceOverheadBytes: number;
    providerReportedInputTokens: number | null;
    providerReportedOutputTokens: number | null;
    repairShare: number | null;
    repeatedContextRatio: number | null;
    repeatedPreviousResponseBytes: number;
    repeatedSourceBytes: number;
    schemaShare: number | null;
    sourceBytes: number;
    sourceShare: number | null;
    taxonomyShare: number | null;
    totalSerializedRequestBytes: number;
  };
  contractEvidence: AIPdfContractEvidence | null;
  firstAttemptSuccess: boolean | null;
  observatoryVersion: typeof AI_PDF_QUALITY_OBSERVATORY_VERSION;
  output: AIPdfCandidateMetrics & {
    duplicateCount: number;
    importableReviewDrafts: number;
    outputTokensPerValidDraft: number | null;
    unknownTaxonomyIdCount: number;
    usefulOutputPerProviderInputToken: number | null;
  };
  parsingContractVersion: typeof AI_PDF_PARSING_TREATMENT_VERSION;
  usage: AIProviderUsage;
  usageAccounting: AIProviderUsageAccounting;
  visualEvidence: AIPdfVisualQualityMetrics;
};

export const AI_PDF_QUALITY_CHECKPOINT_VERSION = 1;

export type AIPdfQualityCheckpoint = {
  attemptReasonVersion: typeof AI_PDF_ATTEMPT_REASON_VERSION;
  attempts: AIPdfAttemptRecord[];
  checkpointReplayCount: number;
  contextAccountingVersion: typeof AI_PDF_CONTEXT_ACCOUNTING_VERSION;
  contractEvidence: AIPdfContractEvidence | null;
  contractVersion: typeof AI_PDF_QUALITY_CHECKPOINT_VERSION;
  observatoryVersion: typeof AI_PDF_QUALITY_OBSERVATORY_VERSION;
  parsingContractVersion: typeof AI_PDF_PARSING_TREATMENT_VERSION;
};

const MAX_ATTEMPT_RECORDS = 128;
const ATTEMPT_REASONS: AIPdfAttemptReason[] = [
  "FIRST_ATTEMPT",
  "STRUCTURAL_SCHEMA_REPAIR",
  "APPLICATION_VALIDATION_REPAIR",
  "BLANK_REQUIRED_FIELD_REPAIR",
  "ANSWER_CONSISTENCY_REPAIR",
  "SOURCE_LINEAGE_REPAIR",
  "VISUAL_ASSOCIATION_REPAIR",
  "TAXONOMY_REPAIR",
  "SOURCE_BACKED_SEMANTIC_RECOVERY",
  "PROVIDER_BUSY_RETRY",
  "RATE_LIMIT_RETRY",
  "NETWORK_RETRY",
  "TIMEOUT_RETRY",
  "CHECKPOINT_REPLAY_ZERO_INFERENCE",
];
const PROVIDER_ATTEMPT_REASONS = new Set(
  ATTEMPT_REASONS.filter(
    (reason): reason is AIPdfProviderAttemptReason =>
      reason !== "CHECKPOINT_REPLAY_ZERO_INFERENCE",
  ),
);
const INPUT_STRATEGIES = new Set<AiPdfInputStrategy>([
  "gemini_native_pdf",
  "mock",
  "openai_file",
  "page_images",
  "unsupported",
]);
const FAILURE_CATEGORIES = new Set<AIPdfAttemptFailureCategory>([
  "application_schema",
  "non_json",
  "operation_cancelled",
  "provider_busy",
  "provider_configuration_error",
  "provider_execution_budget_exhausted",
  "provider_invalid_response",
  "provider_network_error",
  "provider_permission_error",
  "provider_rate_limited",
  "provider_timeout",
  "request_invalid",
  "response_missing",
  "unknown_provider_error",
  "zero_importable",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isSha256(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

function isCandidateMetrics(value: unknown): value is AIPdfCandidateMetrics {
  if (!isRecord(value)) return false;
  return [
    "applicationValidCandidates",
    "rawCandidates",
    "rejectedCandidates",
    "schemaValidCandidates",
    "warningCount",
  ].every((key) => isNonNegativeInteger(value[key]));
}

function isUsage(value: unknown): value is AIProviderUsage {
  return normalizeAIProviderUsage(value) !== null;
}

function isSerializedContext(
  value: unknown,
): value is AIPdfSerializedRequestContext {
  if (!isRecord(value)) return false;
  return [
    "extractionInstructionBytes",
    "previousResponseBytes",
    "semanticRecoveryInstructionBytes",
    "serializedRequestBytes",
    "sourceInputBytes",
    "structuralRepairInstructionBytes",
    "structuredSchemaBytes",
    "systemInstructionBytes",
    "taxonomyCandidateBytes",
  ].every((key) => isNonNegativeInteger(value[key]));
}

function isAttemptRecord(value: unknown): value is AIPdfAttemptRecord {
  if (!isRecord(value)) return false;
  return (
    isSerializedContext(value.context) &&
    isNonNegativeInteger(value.extractionAttempt) &&
    isNonNegativeInteger(value.inferenceOrdinal) &&
    typeof value.inputStrategy === "string" &&
    INPUT_STRATEGIES.has(value.inputStrategy as AiPdfInputStrategy) &&
    typeof value.reason === "string" &&
    PROVIDER_ATTEMPT_REASONS.has(value.reason as AIPdfProviderAttemptReason) &&
    isNonNegativeInteger(value.routeCandidateIndex) &&
    typeof value.scope === "string" &&
    value.scope.length > 0 &&
    value.scope.length <= 256 &&
    typeof value.sourceIncluded === "boolean" &&
    typeof value.sourceRepeated === "boolean" &&
    isNonNegativeInteger(value.transportAttempt) &&
    isNonNegativeInteger(value.componentOverflowBytes) &&
    isNonNegativeInteger(value.durationMs) &&
    (value.failureCategory === null ||
      (typeof value.failureCategory === "string" &&
        FAILURE_CATEGORIES.has(
          value.failureCategory as AIPdfAttemptFailureCategory,
        ))) &&
    isNonNegativeInteger(value.fixedTransportOverheadBytes) &&
    (value.outcome === "failed" || value.outcome === "success") &&
    (value.output === null || isCandidateMetrics(value.output)) &&
    (value.usage === null || isUsage(value.usage)) &&
    (value.usageAccounting === undefined ||
      value.usageAccounting === null ||
      normalizeAIProviderUsageAccounting(value.usageAccounting) !== null)
  );
}

function isContractEvidence(value: unknown): value is AIPdfContractEvidence {
  if (!isRecord(value)) return false;
  return (
    isNonNegativeInteger(value.candidateCount) &&
    isNonNegativeInteger(value.candidateSubsetBytes) &&
    isSha256(value.candidateSubsetSha256) &&
    isNonNegativeInteger(value.fullTaxonomySnapshotBytes) &&
    isSha256(value.fullTaxonomySnapshotSha256) &&
    isSha256(value.parsingContractSha256) &&
    typeof value.promptContractVersion === "string" &&
    value.promptContractVersion.length > 0 &&
    typeof value.repairPolicyVersion === "string" &&
    value.repairPolicyVersion.length > 0 &&
    typeof value.retrievalAlgorithmVersion === "string" &&
    value.retrievalAlgorithmVersion.length > 0 &&
    typeof value.schemaContractVersion === "string" &&
    value.schemaContractVersion.length > 0 &&
    (value.subsetToFullCatalogByteRatio === null ||
      (typeof value.subsetToFullCatalogByteRatio === "number" &&
        Number.isFinite(value.subsetToFullCatalogByteRatio) &&
        value.subsetToFullCatalogByteRatio >= 0 &&
        value.subsetToFullCatalogByteRatio <= 1)) &&
    isSha256(value.taxonomySnapshotSha256) &&
    isNonNegativeInteger(value.taxonomySnapshotVersion)
  );
}

function cloneAttempt(attempt: AIPdfAttemptRecord): AIPdfAttemptRecord {
  return {
    componentOverflowBytes: attempt.componentOverflowBytes,
    context: {
      extractionInstructionBytes: attempt.context.extractionInstructionBytes,
      previousResponseBytes: attempt.context.previousResponseBytes,
      semanticRecoveryInstructionBytes:
        attempt.context.semanticRecoveryInstructionBytes,
      serializedRequestBytes: attempt.context.serializedRequestBytes,
      sourceInputBytes: attempt.context.sourceInputBytes,
      structuralRepairInstructionBytes:
        attempt.context.structuralRepairInstructionBytes,
      structuredSchemaBytes: attempt.context.structuredSchemaBytes,
      systemInstructionBytes: attempt.context.systemInstructionBytes,
      taxonomyCandidateBytes: attempt.context.taxonomyCandidateBytes,
    },
    durationMs: attempt.durationMs,
    extractionAttempt: attempt.extractionAttempt,
    failureCategory: attempt.failureCategory,
    fixedTransportOverheadBytes: attempt.fixedTransportOverheadBytes,
    inferenceOrdinal: attempt.inferenceOrdinal,
    inputStrategy: attempt.inputStrategy,
    outcome: attempt.outcome,
    output: attempt.output
      ? {
          applicationValidCandidates:
            attempt.output.applicationValidCandidates,
          rawCandidates: attempt.output.rawCandidates,
          rejectedCandidates: attempt.output.rejectedCandidates,
          schemaValidCandidates: attempt.output.schemaValidCandidates,
          warningCount: attempt.output.warningCount,
        }
      : null,
    reason: attempt.reason,
    routeCandidateIndex: attempt.routeCandidateIndex,
    scope: attempt.scope,
    sourceIncluded: attempt.sourceIncluded,
    sourceRepeated: attempt.sourceRepeated,
    transportAttempt: attempt.transportAttempt,
    usage: attempt.usage ? normalizeAIProviderUsage(attempt.usage) : null,
    usageAccounting: attempt.usageAccounting
      ? normalizeAIProviderUsageAccounting(attempt.usageAccounting)
      : null,
  };
}

function cloneContractEvidence(
  evidence: AIPdfContractEvidence,
): AIPdfContractEvidence {
  return {
    candidateCount: evidence.candidateCount,
    candidateSubsetBytes: evidence.candidateSubsetBytes,
    candidateSubsetSha256: evidence.candidateSubsetSha256,
    fullTaxonomySnapshotBytes: evidence.fullTaxonomySnapshotBytes,
    fullTaxonomySnapshotSha256: evidence.fullTaxonomySnapshotSha256,
    parsingContractSha256: evidence.parsingContractSha256,
    promptContractVersion: evidence.promptContractVersion,
    repairPolicyVersion: evidence.repairPolicyVersion,
    retrievalAlgorithmVersion: evidence.retrievalAlgorithmVersion,
    schemaContractVersion: evidence.schemaContractVersion,
    subsetToFullCatalogByteRatio: evidence.subsetToFullCatalogByteRatio,
    taxonomySnapshotSha256: evidence.taxonomySnapshotSha256,
    taxonomySnapshotVersion: evidence.taxonomySnapshotVersion,
  };
}

export function parseAIPdfQualityCheckpoint(
  value: unknown,
): AIPdfQualityCheckpoint | null {
  if (!isRecord(value)) return null;
  if (
    value.contractVersion !== AI_PDF_QUALITY_CHECKPOINT_VERSION ||
    value.attemptReasonVersion !== AI_PDF_ATTEMPT_REASON_VERSION ||
    value.contextAccountingVersion !== AI_PDF_CONTEXT_ACCOUNTING_VERSION ||
    value.observatoryVersion !== AI_PDF_QUALITY_OBSERVATORY_VERSION ||
    value.parsingContractVersion !== AI_PDF_PARSING_TREATMENT_VERSION ||
    !Array.isArray(value.attempts) ||
    value.attempts.length > MAX_ATTEMPT_RECORDS ||
    !value.attempts.every(isAttemptRecord) ||
    !isNonNegativeInteger(value.checkpointReplayCount) ||
    (value.contractEvidence !== null &&
      !isContractEvidence(value.contractEvidence))
  ) {
    return null;
  }

  return {
    attemptReasonVersion: AI_PDF_ATTEMPT_REASON_VERSION,
    attempts: value.attempts.map(cloneAttempt),
    checkpointReplayCount: value.checkpointReplayCount,
    contextAccountingVersion: AI_PDF_CONTEXT_ACCOUNTING_VERSION,
    contractEvidence: value.contractEvidence
      ? cloneContractEvidence(value.contractEvidence)
      : null,
    contractVersion: AI_PDF_QUALITY_CHECKPOINT_VERSION,
    observatoryVersion: AI_PDF_QUALITY_OBSERVATORY_VERSION,
    parsingContractVersion: AI_PDF_PARSING_TREATMENT_VERSION,
  };
}

function nonNegativeInteger(value: number | null | undefined) {
  return Number.isFinite(value)
    ? Math.max(0, Math.trunc(Number(value)))
    : 0;
}

function strictNullableSum(values: Array<number | null | undefined>) {
  return values.length > 0 &&
    values.every(
      (value): value is number =>
        typeof value === "number" && Number.isFinite(value),
    )
    ? values.reduce((total, value) => total + value, 0)
    : null;
}

function safeRatio(numerator: number, denominator: number) {
  return denominator > 0
    ? Number((numerator / denominator).toFixed(6))
    : null;
}

function contextComponentTotal(context: AIPdfSerializedRequestContext) {
  return nonNegativeInteger(context.extractionInstructionBytes) +
    nonNegativeInteger(context.previousResponseBytes) +
    nonNegativeInteger(context.semanticRecoveryInstructionBytes) +
    nonNegativeInteger(context.sourceInputBytes) +
    nonNegativeInteger(context.structuralRepairInstructionBytes) +
    nonNegativeInteger(context.structuredSchemaBytes) +
    nonNegativeInteger(context.systemInstructionBytes) +
    nonNegativeInteger(context.taxonomyCandidateBytes);
}

export function fingerprintAIPdfContractComponent(value: string | Buffer) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value, "utf8");

  return {
    byteLength: bytes.byteLength,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

export function fingerprintAIPdfParsingContract(
  components: Record<string, string | Buffer>,
) {
  const fingerprints = Object.fromEntries(
    Object.entries(components)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => [key, fingerprintAIPdfContractComponent(value)]),
  );
  const canonical = JSON.stringify(fingerprints);

  return {
    components: fingerprints,
    contractSha256: createHash("sha256").update(canonical).digest("hex"),
    version: AI_PDF_PARSING_TREATMENT_VERSION,
  };
}

export type AIPdfQualityObservatory = ReturnType<
  typeof createAIPdfQualityObservatory
>;

export function createAIPdfQualityObservatory(
  checkpoint?: AIPdfQualityCheckpoint | null,
) {
  const restored = checkpoint == null
    ? null
    : parseAIPdfQualityCheckpoint(checkpoint);
  if (checkpoint != null && !restored) {
    throw new Error("AI PDF quality checkpoint is incompatible.");
  }
  const attempts: AIPdfAttemptRecord[] =
    restored?.attempts.map(cloneAttempt) ?? [];
  const histogram = new Map<AIPdfAttemptReason, number>();
  for (const attempt of attempts) {
    histogram.set(attempt.reason, (histogram.get(attempt.reason) ?? 0) + 1);
  }
  let checkpointReplayCount = restored?.checkpointReplayCount ?? 0;
  if (checkpointReplayCount > 0) {
    histogram.set("CHECKPOINT_REPLAY_ZERO_INFERENCE", checkpointReplayCount);
  }
  let contractEvidence: AIPdfContractEvidence | null = restored?.contractEvidence
    ? cloneContractEvidence(restored.contractEvidence)
    : null;
  let persistence = {
    duplicateCount: 0,
    importableReviewDrafts: 0,
    unknownTaxonomyIdCount: 0,
  };
  let visualEvidence: AIPdfVisualQualityMetrics = {
    attachedAssets: 0,
    blockingMissingRequired: 0,
    decorativeSkipped: 0,
    duplicateProposals: 0,
    invalidProposals: 0,
    invalidProposalReasons: {
      decorative_required: 0,
      invalid_crop_content: 0,
      invalid_source_region: 0,
      missing_question_lineage: 0,
      page_outside_question_lineage: 0,
      source_render_unavailable: 0,
    },
    proposedAssets: 0,
    requiredQuestions: 0,
    reusedAssets: 0,
    validCrops: 0,
  };

  function beginAttempt(input: AIPdfAttemptInput) {
    const startedAt = Date.now();
    histogram.set(input.reason, (histogram.get(input.reason) ?? 0) + 1);
    let completed = false;

    return {
      complete(completion: AIPdfAttemptCompletion) {
        if (completed) return;
        completed = true;
        if (attempts.length >= MAX_ATTEMPT_RECORDS) return;
        const serializedRequestBytes = nonNegativeInteger(
          input.context.serializedRequestBytes,
        );
        const componentTotal = contextComponentTotal(input.context);
        const usageAccounting = completion.usageAccounting ??
          buildAIProviderUsageAccounting({
            localContextBytes: {
              serializedRequestBytes,
              sourceInputBytes: input.context.sourceInputBytes,
            },
            providerReportedUsage: completion.usage,
          });
        const providerReportedUsage =
          usageAccounting.providerReportedUsage?.usage ??
          normalizeAIProviderUsage(completion.usage);

        attempts.push({
          ...input,
          componentOverflowBytes: Math.max(0, componentTotal - serializedRequestBytes),
          durationMs: Math.max(0, Date.now() - startedAt),
          failureCategory: completion.failureCategory ?? null,
          fixedTransportOverheadBytes: Math.max(
            0,
            serializedRequestBytes - componentTotal,
          ),
          outcome: completion.outcome,
          output: completion.output ?? null,
          usage: providerReportedUsage,
          usageAccounting,
        });
      },
    };
  }

  function snapshot(): AIPdfQualitySnapshot {
    const component = {
      extractionInstructions: attempts.reduce(
        (total, attempt) => total + attempt.context.extractionInstructionBytes,
        0,
      ),
      fixedTransportOverhead: attempts.reduce(
        (total, attempt) => total + attempt.fixedTransportOverheadBytes,
        0,
      ),
      previousResponse: attempts.reduce(
        (total, attempt) => total + attempt.context.previousResponseBytes,
        0,
      ),
      semanticRecoveryInstructions: attempts.reduce(
        (total, attempt) => total + attempt.context.semanticRecoveryInstructionBytes,
        0,
      ),
      sourceInput: attempts.reduce(
        (total, attempt) => total + attempt.context.sourceInputBytes,
        0,
      ),
      structuralRepairInstructions: attempts.reduce(
        (total, attempt) => total + attempt.context.structuralRepairInstructionBytes,
        0,
      ),
      structuredSchema: attempts.reduce(
        (total, attempt) => total + attempt.context.structuredSchemaBytes,
        0,
      ),
      systemInstructions: attempts.reduce(
        (total, attempt) => total + attempt.context.systemInstructionBytes,
        0,
      ),
      taxonomyCandidates: attempts.reduce(
        (total, attempt) => total + attempt.context.taxonomyCandidateBytes,
        0,
      ),
    };
    const totalSerializedRequestBytes = attempts.reduce(
      (total, attempt) => total + attempt.context.serializedRequestBytes,
      0,
    );
    const repeatedSourceBytes = attempts.reduce(
      (total, attempt) =>
        total + (attempt.sourceRepeated ? attempt.context.sourceInputBytes : 0),
      0,
    );
    const repeatedPreviousResponseBytes = component.previousResponse;
    const outputMetrics = attempts.reduce<AIPdfCandidateMetrics>(
      (total, attempt) => ({
        applicationValidCandidates:
          total.applicationValidCandidates +
          (attempt.output?.applicationValidCandidates ?? 0),
        rawCandidates: total.rawCandidates + (attempt.output?.rawCandidates ?? 0),
        rejectedCandidates:
          total.rejectedCandidates + (attempt.output?.rejectedCandidates ?? 0),
        schemaValidCandidates:
          total.schemaValidCandidates +
          (attempt.output?.schemaValidCandidates ?? 0),
        warningCount: total.warningCount + (attempt.output?.warningCount ?? 0),
      }),
      {
        applicationValidCandidates: 0,
        rawCandidates: 0,
        rejectedCandidates: 0,
        schemaValidCandidates: 0,
        warningCount: 0,
      },
    );
    const usage: AIProviderUsage = {
      cachedInputTokens: strictNullableSum(
        attempts.map((attempt) => attempt.usage?.cachedInputTokens),
      ),
      candidateOutputTokens: strictNullableSum(
        attempts.map((attempt) => attempt.usage?.candidateOutputTokens),
      ),
      inputTokens: strictNullableSum(
        attempts.map((attempt) => attempt.usage?.inputTokens),
      ),
      outputTokens: strictNullableSum(
        attempts.map((attempt) => attempt.usage?.outputTokens),
      ),
      promptTokensDetails: [],
      thoughtTokens: strictNullableSum(
        attempts.map((attempt) => attempt.usage?.thoughtTokens),
      ),
      toolUseInputTokens: strictNullableSum(
        attempts.map((attempt) => attempt.usage?.toolUseInputTokens),
      ),
      totalTokens: strictNullableSum(
        attempts.map((attempt) => attempt.usage?.totalTokens),
      ),
    };
    const usageAccounting = buildAIProviderUsageAccounting({
      countTokens: {
        cachedInputTokens: strictNullableSum(
          attempts.map(
            (attempt) =>
              attempt.usageAccounting?.providerCountTokens
                ?.cachedInputTokens,
          ),
        ),
        inputTokens: strictNullableSum(
          attempts.map(
            (attempt) =>
              attempt.usageAccounting?.providerCountTokens?.inputTokens,
          ),
        ),
        promptTokensDetails: [],
      },
      localContextBytes: {
        serializedRequestBytes: totalSerializedRequestBytes,
        sourceInputBytes: component.sourceInput,
      },
      providerReportedUsage: usage,
    });
    const repairBytes = component.previousResponse +
      component.structuralRepairInstructions +
      component.semanticRecoveryInstructions;

    return {
      attemptHistogram: Object.fromEntries(
        ATTEMPT_REASONS.map((reason) => [reason, histogram.get(reason) ?? 0]),
      ) as Record<AIPdfAttemptReason, number>,
      attemptReasonVersion: AI_PDF_ATTEMPT_REASON_VERSION,
      attempts: attempts.slice(),
      attemptsPerJob: attempts.length,
      checkpointReplayCount,
      contextAccountingVersion: AI_PDF_CONTEXT_ACCOUNTING_VERSION,
      contextComposition: {
        componentBytes: component,
        componentOverflowBytes: attempts.reduce(
          (total, attempt) => total + attempt.componentOverflowBytes,
          0,
        ),
        nonSourceOverheadBytes: Math.max(
          0,
          totalSerializedRequestBytes - component.sourceInput,
        ),
        providerReportedInputTokens: usage.inputTokens,
        providerReportedOutputTokens: usage.outputTokens,
        repairShare: safeRatio(repairBytes, totalSerializedRequestBytes),
        repeatedContextRatio: safeRatio(
          repeatedSourceBytes + repeatedPreviousResponseBytes,
          totalSerializedRequestBytes,
        ),
        repeatedPreviousResponseBytes,
        repeatedSourceBytes,
        schemaShare: safeRatio(
          component.structuredSchema,
          totalSerializedRequestBytes,
        ),
        sourceBytes: component.sourceInput,
        sourceShare: safeRatio(component.sourceInput, totalSerializedRequestBytes),
        taxonomyShare: safeRatio(
          component.taxonomyCandidates,
          totalSerializedRequestBytes,
        ),
        totalSerializedRequestBytes,
      },
      contractEvidence,
      firstAttemptSuccess: attempts.length
        ? attempts[0]?.outcome === "success"
        : null,
      observatoryVersion: AI_PDF_QUALITY_OBSERVATORY_VERSION,
      output: {
        ...outputMetrics,
        ...persistence,
        outputTokensPerValidDraft:
          usage.outputTokens === null
            ? null
            : safeRatio(
                usage.outputTokens,
                persistence.importableReviewDrafts,
              ),
        usefulOutputPerProviderInputToken:
          usage.inputTokens == null
            ? null
            : safeRatio(
                persistence.importableReviewDrafts,
                usage.inputTokens,
              ),
      },
      parsingContractVersion: AI_PDF_PARSING_TREATMENT_VERSION,
      usage,
      usageAccounting,
      visualEvidence,
    };
  }

  return {
    beginAttempt,
    checkpoint(): AIPdfQualityCheckpoint {
      return {
        attemptReasonVersion: AI_PDF_ATTEMPT_REASON_VERSION,
        attempts: attempts.map(cloneAttempt),
        checkpointReplayCount,
        contextAccountingVersion: AI_PDF_CONTEXT_ACCOUNTING_VERSION,
        contractEvidence: contractEvidence
          ? cloneContractEvidence(contractEvidence)
          : null,
        contractVersion: AI_PDF_QUALITY_CHECKPOINT_VERSION,
        observatoryVersion: AI_PDF_QUALITY_OBSERVATORY_VERSION,
        parsingContractVersion: AI_PDF_PARSING_TREATMENT_VERSION,
      };
    },
    recordCheckpointReplay() {
      checkpointReplayCount += 1;
      histogram.set(
        "CHECKPOINT_REPLAY_ZERO_INFERENCE",
        (histogram.get("CHECKPOINT_REPLAY_ZERO_INFERENCE") ?? 0) + 1,
      );
    },
    recordContractEvidence(next: AIPdfContractEvidence) {
      contractEvidence = cloneContractEvidence(next);
    },
    recordPersistence(next: Partial<typeof persistence>) {
      persistence = {
        duplicateCount: nonNegativeInteger(
          next.duplicateCount ?? persistence.duplicateCount,
        ),
        importableReviewDrafts: nonNegativeInteger(
          next.importableReviewDrafts ?? persistence.importableReviewDrafts,
        ),
        unknownTaxonomyIdCount: nonNegativeInteger(
          next.unknownTaxonomyIdCount ?? persistence.unknownTaxonomyIdCount,
        ),
      };
    },
    recordVisualEvidence(next: Partial<AIPdfVisualQualityMetrics>) {
      const nextReasons: Partial<AIPdfVisualProposalRejectionCounts> =
        next.invalidProposalReasons ?? {};
      visualEvidence = {
        attachedAssets:
          visualEvidence.attachedAssets + nonNegativeInteger(next.attachedAssets),
        blockingMissingRequired:
          visualEvidence.blockingMissingRequired +
          nonNegativeInteger(next.blockingMissingRequired),
        decorativeSkipped:
          visualEvidence.decorativeSkipped +
          nonNegativeInteger(next.decorativeSkipped),
        duplicateProposals:
          visualEvidence.duplicateProposals +
          nonNegativeInteger(next.duplicateProposals),
        invalidProposals:
          visualEvidence.invalidProposals +
          nonNegativeInteger(next.invalidProposals),
        invalidProposalReasons: Object.fromEntries(
          Object.entries(visualEvidence.invalidProposalReasons).map(
            ([reason, count]) => [
              reason,
              count +
                nonNegativeInteger(
                  nextReasons[
                    reason as keyof AIPdfVisualProposalRejectionCounts
                  ],
                ),
            ],
          ),
        ) as AIPdfVisualProposalRejectionCounts,
        proposedAssets:
          visualEvidence.proposedAssets + nonNegativeInteger(next.proposedAssets),
        requiredQuestions:
          visualEvidence.requiredQuestions +
          nonNegativeInteger(next.requiredQuestions),
        reusedAssets:
          visualEvidence.reusedAssets + nonNegativeInteger(next.reusedAssets),
        validCrops:
          visualEvidence.validCrops + nonNegativeInteger(next.validCrops),
      };
    },
    snapshot,
  };
}
