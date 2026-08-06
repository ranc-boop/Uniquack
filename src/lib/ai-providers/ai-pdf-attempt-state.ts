import type { AIProviderErrorCode } from "@/lib/ai-providers/errors";

export const AI_PDF_PROVIDER_ATTEMPT_LEDGER_VERSION = 2;
const LEGACY_AI_PDF_PROVIDER_ATTEMPT_LEDGER_VERSION = 1;
const MAX_RECORDED_PROVIDER_ATTEMPTS = 128;

export type AIPdfProviderAttemptReason =
  | "FIRST_ATTEMPT"
  | "STRUCTURAL_SCHEMA_REPAIR"
  | "APPLICATION_VALIDATION_REPAIR"
  | "BLANK_REQUIRED_FIELD_REPAIR"
  | "ANSWER_CONSISTENCY_REPAIR"
  | "SOURCE_LINEAGE_REPAIR"
  | "VISUAL_ASSOCIATION_REPAIR"
  | "TAXONOMY_REPAIR"
  | "SOURCE_BACKED_SEMANTIC_RECOVERY"
  | "PROVIDER_BUSY_RETRY"
  | "RATE_LIMIT_RETRY"
  | "NETWORK_RETRY"
  | "TIMEOUT_RETRY";

export type AIPdfProviderAttemptLedger = {
  attempts: Array<{
    ordinal: number;
    primaryReason: AIPdfProviderAttemptReason;
    routeCandidateIndex: number;
    scope: string;
    sourceIncluded: boolean;
    transportAttempt: number;
  }>;
  checkpointReplayCount: number;
  checkpointReplays: Array<{
    ordinal: number;
    primaryReason: "CHECKPOINT_REPLAY_ZERO_INFERENCE";
    scope: string;
  }>;
  contractVersion: typeof AI_PDF_PROVIDER_ATTEMPT_LEDGER_VERSION;
  providerInferenceCount: number;
  sourceInferenceCount: number;
  sourceRecoveryScope: string | null;
  sourceRecoveryUsed: boolean;
  structuralRepairScopes: string[];
};

function nonNegativeInteger(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.trunc(value))
    : 0;
}

function normalizeAttemptReason(
  value: unknown,
): AIPdfProviderAttemptReason | null {
  if (value === "STRUCTURAL_REPAIR_SOURCE_FREE") {
    return "STRUCTURAL_SCHEMA_REPAIR";
  }
  const reason = String(value);
  return [
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
  ].includes(reason)
    ? (reason as AIPdfProviderAttemptReason)
    : null;
}

export function createAIPdfProviderAttemptLedger(): AIPdfProviderAttemptLedger {
  return {
    attempts: [],
    checkpointReplayCount: 0,
    checkpointReplays: [],
    contractVersion: AI_PDF_PROVIDER_ATTEMPT_LEDGER_VERSION,
    providerInferenceCount: 0,
    sourceInferenceCount: 0,
    sourceRecoveryScope: null,
    sourceRecoveryUsed: false,
    structuralRepairScopes: [],
  };
}

export function parseAIPdfProviderAttemptLedger(
  value: unknown,
): AIPdfProviderAttemptLedger | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (
    record.contractVersion !== AI_PDF_PROVIDER_ATTEMPT_LEDGER_VERSION &&
    record.contractVersion !== LEGACY_AI_PDF_PROVIDER_ATTEMPT_LEDGER_VERSION
  ) {
    return null;
  }

  const attempts = Array.isArray(record.attempts)
    ? record.attempts.flatMap((entry) => {
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
        const attempt = entry as Record<string, unknown>;
        const primaryReason = normalizeAttemptReason(attempt.primaryReason);
        if (
          !primaryReason ||
          typeof attempt.scope !== "string" ||
          typeof attempt.sourceIncluded !== "boolean"
        ) {
          return [];
        }
        return [{
          ordinal: nonNegativeInteger(attempt.ordinal),
          primaryReason,
          routeCandidateIndex: nonNegativeInteger(attempt.routeCandidateIndex),
          scope: attempt.scope,
          sourceIncluded: attempt.sourceIncluded,
          transportAttempt: Math.max(1, nonNegativeInteger(attempt.transportAttempt)),
        }];
      })
    : [];
  const structuralRepairScopes = Array.isArray(record.structuralRepairScopes)
    ? Array.from(new Set(record.structuralRepairScopes.filter(
        (scope): scope is string => typeof scope === "string" && scope.length > 0,
      ))).sort()
    : [];
  const checkpointReplays = Array.isArray(record.checkpointReplays)
    ? record.checkpointReplays.flatMap((entry) => {
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
        const replay = entry as Record<string, unknown>;
        if (
          replay.primaryReason !== "CHECKPOINT_REPLAY_ZERO_INFERENCE" ||
          typeof replay.scope !== "string"
        ) {
          return [];
        }
        return [{
          ordinal: nonNegativeInteger(replay.ordinal),
          primaryReason: "CHECKPOINT_REPLAY_ZERO_INFERENCE" as const,
          scope: replay.scope,
        }];
      })
    : [];

  return {
    attempts: attempts.slice(-MAX_RECORDED_PROVIDER_ATTEMPTS),
    checkpointReplayCount: nonNegativeInteger(record.checkpointReplayCount),
    checkpointReplays: checkpointReplays.slice(-MAX_RECORDED_PROVIDER_ATTEMPTS),
    contractVersion: AI_PDF_PROVIDER_ATTEMPT_LEDGER_VERSION,
    providerInferenceCount: nonNegativeInteger(record.providerInferenceCount),
    sourceInferenceCount: nonNegativeInteger(record.sourceInferenceCount),
    sourceRecoveryScope:
      typeof record.sourceRecoveryScope === "string"
        ? record.sourceRecoveryScope
        : null,
    sourceRecoveryUsed: record.sourceRecoveryUsed === true,
    structuralRepairScopes,
  };
}

export function reserveAIPdfStructuralRepair(
  ledger: AIPdfProviderAttemptLedger,
  scope: string,
) {
  if (ledger.structuralRepairScopes.includes(scope)) return false;
  ledger.structuralRepairScopes = [...ledger.structuralRepairScopes, scope].sort();
  return true;
}

export function reserveAIPdfSourceRecovery(
  ledger: AIPdfProviderAttemptLedger,
  scope: string,
) {
  if (ledger.sourceRecoveryUsed) return false;
  ledger.sourceRecoveryUsed = true;
  ledger.sourceRecoveryScope = scope;
  return true;
}

export function recordAIPdfProviderInference(
  ledger: AIPdfProviderAttemptLedger,
  attempt: Omit<AIPdfProviderAttemptLedger["attempts"][number], "ordinal">,
) {
  ledger.providerInferenceCount += 1;
  if (attempt.sourceIncluded) ledger.sourceInferenceCount += 1;
  ledger.attempts.push({
    ...attempt,
    ordinal: ledger.providerInferenceCount,
  });
  if (ledger.attempts.length > MAX_RECORDED_PROVIDER_ATTEMPTS) {
    ledger.attempts.splice(
      0,
      ledger.attempts.length - MAX_RECORDED_PROVIDER_ATTEMPTS,
    );
  }
  return ledger.providerInferenceCount;
}

export function recordAIPdfCheckpointReplay(
  ledger: AIPdfProviderAttemptLedger,
  scope: string,
) {
  ledger.checkpointReplayCount += 1;
  ledger.checkpointReplays.push({
    ordinal: ledger.checkpointReplayCount,
    primaryReason: "CHECKPOINT_REPLAY_ZERO_INFERENCE",
    scope,
  });
  if (ledger.checkpointReplays.length > MAX_RECORDED_PROVIDER_ATTEMPTS) {
    ledger.checkpointReplays.splice(
      0,
      ledger.checkpointReplays.length - MAX_RECORDED_PROVIDER_ATTEMPTS,
    );
  }
}

export function aiPdfProviderRetryReason(
  code: AIProviderErrorCode,
): AIPdfProviderAttemptReason {
  switch (code) {
    case "provider_busy":
      return "PROVIDER_BUSY_RETRY";
    case "provider_rate_limited":
      return "RATE_LIMIT_RETRY";
    case "provider_timeout":
      return "TIMEOUT_RETRY";
    case "provider_network_error":
      return "NETWORK_RETRY";
    default:
      return "NETWORK_RETRY";
  }
}
