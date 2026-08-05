import "server-only";

import { createHash } from "node:crypto";

import type { GeminiNativeUsage } from "@/lib/ai-providers/gemini-native";
import type { AiPdfInputStrategy } from "@/lib/ai-providers/adapters";
import type { AIProviderErrorCode } from "@/lib/ai-providers/errors";

export const AI_PDF_PARSING_BASELINE_ANCHOR =
  "f1ce7bcb791604468693ea945401cfb157e64d97";
export const AI_PDF_PARSING_BASELINE_VERSION =
  "ai-pdf-parsing/f1ce7bc-baseline-v1";
export const AI_PDF_PARSING_TREATMENT_VERSION =
  "ai-pdf-parsing/provider-neutral-v2";
export const AI_PDF_QUALITY_OBSERVATORY_VERSION = 1;
export const AI_PDF_ATTEMPT_REASON_VERSION = 1;

export type AIPdfAttemptReason =
  | "initial_extraction"
  | "transport_retry"
  | "fallback_initial"
  | "fallback_transport_retry"
  | "schema_repair"
  | "application_repair"
  | "source_recovery";

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

type AIPdfAttemptInput = {
  extractionAttempt: number;
  inputStrategy: AiPdfInputStrategy;
  promptBytes: number;
  reason: AIPdfAttemptReason;
  repairContextBytes: number;
  routeCandidateIndex: number;
  schemaBytes: number;
  sourceBytes: number;
  sourceIncluded: boolean;
  taxonomyCatalogBytes: number;
  transportAttempt: number;
};

type AIPdfAttemptCompletion = {
  failureCategory?: AIPdfAttemptFailureCategory;
  output?: AIPdfCandidateMetrics;
  outcome: "failed" | "success";
  usage?: GeminiNativeUsage | null;
};

type AIPdfAttemptRecord = AIPdfAttemptInput & {
  durationMs: number;
  failureCategory: AIPdfAttemptFailureCategory | null;
  inputBytesEstimated: number;
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

export type AIPdfQualitySnapshot = {
  attemptHistogram: Record<AIPdfAttemptReason, number>;
  attemptReasonVersion: typeof AI_PDF_ATTEMPT_REASON_VERSION;
  attempts: AIPdfAttemptRecord[];
  attemptsPerJob: number;
  checkpointReplayCount: number;
  contextComposition: {
    contextOverheadRatio: number | null;
    estimatedInputBytes: number;
    estimatedInputTokens: number;
    promptBytes: number;
    repairContextBytes: number;
    repeatedContextRatio: number | null;
    repeatedSourceBytes: number;
    schemaBytes: number;
    sourceBytes: number;
    taxonomyCatalogBytes: number;
  };
  firstAttemptSuccess: boolean | null;
  observatoryVersion: typeof AI_PDF_QUALITY_OBSERVATORY_VERSION;
  output: AIPdfCandidateMetrics & {
    duplicateCount: number;
    importableReviewDrafts: number;
    unknownTaxonomyIdCount: number;
    usefulOutputPerEstimatedInputToken: number | null;
    outputTokensPerValidDraft: number | null;
  };
  parsingContractVersion: typeof AI_PDF_PARSING_TREATMENT_VERSION;
  usage: GeminiNativeUsage;
  visualEvidence: AIPdfVisualQualityMetrics;
};

const MAX_ATTEMPT_RECORDS = 64;

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

        attempts.push({
          ...input,
          durationMs: Math.max(0, Date.now() - startedAt),
          failureCategory: completion.failureCategory ?? null,
          inputBytesEstimated:
            nonNegativeInteger(input.sourceBytes) +
            nonNegativeInteger(input.promptBytes) +
            nonNegativeInteger(input.schemaBytes),
          outcome: completion.outcome,
          output: completion.output ?? null,
          usage: completion.usage ?? null,
        });
      },
    };
  }

  function snapshot(): AIPdfQualitySnapshot {
    const promptBytes = attempts.reduce(
      (total, attempt) => total + attempt.promptBytes,
      0,
    );
    const repairContextBytes = attempts.reduce(
      (total, attempt) => total + attempt.repairContextBytes,
      0,
    );
    const schemaBytes = attempts.reduce(
      (total, attempt) => total + attempt.schemaBytes,
      0,
    );
    const sourceBytes = attempts.reduce(
      (total, attempt) => total + attempt.sourceBytes,
      0,
    );
    const repeatedSourceBytes = attempts
      .slice(1)
      .reduce((total, attempt) => total + attempt.sourceBytes, 0);
    const taxonomyCatalogBytes = attempts.reduce(
      (total, attempt) => total + attempt.taxonomyCatalogBytes,
      0,
    );
    const estimatedInputBytes = sourceBytes + promptBytes + schemaBytes;
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
    const estimatedInputTokens = Math.ceil(estimatedInputBytes / 4);

    return {
      attemptHistogram: Object.fromEntries(
        [
          "initial_extraction",
          "transport_retry",
          "fallback_initial",
          "fallback_transport_retry",
          "schema_repair",
          "application_repair",
          "source_recovery",
        ].map((reason) => [reason, histogram.get(reason as AIPdfAttemptReason) ?? 0]),
      ) as Record<AIPdfAttemptReason, number>,
      attemptReasonVersion: AI_PDF_ATTEMPT_REASON_VERSION,
      attempts: attempts.slice(),
      attemptsPerJob: attempts.length,
      checkpointReplayCount,
      contextComposition: {
        contextOverheadRatio: safeRatio(
          promptBytes + schemaBytes,
          estimatedInputBytes,
        ),
        estimatedInputBytes,
        estimatedInputTokens,
        promptBytes,
        repairContextBytes,
        repeatedContextRatio: safeRatio(
          repeatedSourceBytes + repairContextBytes,
          estimatedInputBytes,
        ),
        repeatedSourceBytes,
        schemaBytes,
        sourceBytes,
        taxonomyCatalogBytes,
      },
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
        usefulOutputPerEstimatedInputToken: safeRatio(
          persistence.importableReviewDrafts,
          estimatedInputTokens,
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
