import "server-only";

import { createHash } from "node:crypto";

import type { AiPdfInputStrategy } from "@/lib/ai-providers/adapters";
import type { AIProviderErrorCode } from "@/lib/ai-providers/errors";
import type { GeminiNativeUsage } from "@/lib/ai-providers/gemini-native";
import type { AIPdfProviderAttemptReason } from "@/lib/ai-providers/ai-pdf-attempt-state";

export const AI_PDF_PARSING_BASELINE_ANCHOR =
  "f1ce7bcb791604468693ea945401cfb157e64d97";
export const AI_PDF_PARSING_BASELINE_VERSION =
  "ai-pdf-parsing/f1ce7bc-baseline-v1";
export const AI_PDF_PARSING_TREATMENT_VERSION =
  "ai-pdf-parsing/provider-neutral-v2";
export const AI_PDF_QUALITY_OBSERVATORY_VERSION = 2;
export const AI_PDF_ATTEMPT_REASON_VERSION = 2;
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
  usage?: GeminiNativeUsage | null;
};

type AIPdfAttemptRecord = AIPdfAttemptInput & {
  componentOverflowBytes: number;
  durationMs: number;
  failureCategory: AIPdfAttemptFailureCategory | null;
  fixedTransportOverheadBytes: number;
  outcome: "failed" | "success";
  output: AIPdfCandidateMetrics | null;
  usage: GeminiNativeUsage | null;
};

export type AIPdfVisualQualityMetrics = {
  attachedAssets: number;
  blockingMissingRequired: number;
  decorativeSkipped: number;
  duplicateProposals: number;
  invalidProposals: number;
  proposedAssets: number;
  requiredQuestions: number;
  reusedAssets: number;
  validCrops: number;
};

export type AIPdfContractEvidence = {
  candidateCount: number;
  parsingContractSha256: string;
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
  usage: GeminiNativeUsage;
  visualEvidence: AIPdfVisualQualityMetrics;
};

const MAX_ATTEMPT_RECORDS = 128;
const ATTEMPT_REASONS: AIPdfAttemptReason[] = [
  "FIRST_ATTEMPT",
  "STRUCTURAL_REPAIR_SOURCE_FREE",
  "SOURCE_BACKED_SEMANTIC_RECOVERY",
  "PROVIDER_BUSY_RETRY",
  "RATE_LIMIT_RETRY",
  "NETWORK_RETRY",
  "TIMEOUT_RETRY",
  "CHECKPOINT_REPLAY_ZERO_INFERENCE",
];

function nonNegativeInteger(value: number | null | undefined) {
  return Number.isFinite(value)
    ? Math.max(0, Math.trunc(Number(value)))
    : 0;
}

function nullableSum(values: Array<number | null | undefined>) {
  const present = values.filter(
    (value): value is number => typeof value === "number" && Number.isFinite(value),
  );
  return present.length
    ? present.reduce((total, value) => total + value, 0)
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

export function createAIPdfQualityObservatory() {
  const attempts: AIPdfAttemptRecord[] = [];
  const histogram = new Map<AIPdfAttemptReason, number>();
  let checkpointReplayCount = 0;
  let contractEvidence: AIPdfContractEvidence | null = null;
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
          usage: completion.usage ?? null,
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
    const usage: GeminiNativeUsage = {
      cachedInputTokens: nullableSum(
        attempts.map((attempt) => attempt.usage?.cachedInputTokens),
      ),
      candidateOutputTokens: nullableSum(
        attempts.map((attempt) => attempt.usage?.candidateOutputTokens),
      ),
      inputTokens: nullableSum(
        attempts.map((attempt) => attempt.usage?.inputTokens),
      ),
      outputTokens: nullableSum(
        attempts.map((attempt) => attempt.usage?.outputTokens),
      ),
      thoughtTokens: nullableSum(
        attempts.map((attempt) => attempt.usage?.thoughtTokens),
      ),
      totalTokens: nullableSum(
        attempts.map((attempt) => attempt.usage?.totalTokens),
      ),
    };
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
        outputTokensPerValidDraft: safeRatio(
          usage.outputTokens ?? 0,
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
      visualEvidence,
    };
  }

  return {
    beginAttempt,
    recordCheckpointReplay() {
      checkpointReplayCount += 1;
      histogram.set(
        "CHECKPOINT_REPLAY_ZERO_INFERENCE",
        (histogram.get("CHECKPOINT_REPLAY_ZERO_INFERENCE") ?? 0) + 1,
      );
    },
    recordContractEvidence(next: AIPdfContractEvidence) {
      contractEvidence = { ...next };
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
      visualEvidence = Object.fromEntries(
        Object.entries(visualEvidence).map(([key, value]) => [
          key,
          value +
            nonNegativeInteger(
              next[key as keyof AIPdfVisualQualityMetrics],
            ),
        ]),
      ) as AIPdfVisualQualityMetrics;
    },
    snapshot,
  };
}
