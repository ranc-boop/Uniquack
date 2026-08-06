import { createHash } from "node:crypto";

export const AI_PDF_POST_PERSISTENCE_STAGES = [
  "draft_persistence",
  "asset_attachment",
  "summary_preparation",
  "batch_finalization",
  "review_plans",
] as const;

export type AIPdfPostPersistenceStage =
  (typeof AI_PDF_POST_PERSISTENCE_STAGES)[number];

const AI_PDF_POST_PERSISTENCE_ERROR_BRAND = Symbol.for(
  "edustruct.ai-pdf-post-persistence-error",
);

export const AI_PDF_BATCH_FINALIZATION_FAILURE_REASONS = [
  "summary_too_large",
  "rpc_rejected",
  "stale_fence",
  "unexpected_outcome",
] as const;

export type AIPdfBatchFinalizationFailureReason =
  (typeof AI_PDF_BATCH_FINALIZATION_FAILURE_REASONS)[number];

export class AIPdfBatchFinalizationContractError extends Error {
  readonly reason: AIPdfBatchFinalizationFailureReason;
  readonly summaryBytes: number;

  constructor({
    cause,
    reason,
    summaryBytes,
  }: {
    cause?: unknown;
    reason: AIPdfBatchFinalizationFailureReason;
    summaryBytes: number;
  }) {
    super("AI PDF fenced batch finalization failed.", { cause });
    this.name = "AIPdfBatchFinalizationContractError";
    this.reason = reason;
    this.summaryBytes = Math.max(0, Math.min(Math.trunc(summaryBytes), 999_999));
  }
}

export class AIPdfPostPersistenceError extends Error {
  readonly [AI_PDF_POST_PERSISTENCE_ERROR_BRAND] = true;
  readonly stage: AIPdfPostPersistenceStage;

  constructor(stage: AIPdfPostPersistenceStage, cause: unknown) {
    super("AI PDF post-persistence processing failed.", { cause });
    this.name = "AIPdfPostPersistenceError";
    this.stage = stage;
  }
}

export function isAIPdfPostPersistenceError(
  error: unknown,
): error is AIPdfPostPersistenceError {
  if (!(error instanceof Error)) return false;
  const value = error as Error & {
    [AI_PDF_POST_PERSISTENCE_ERROR_BRAND]?: unknown;
    stage?: unknown;
  };
  return (
    (error instanceof AIPdfPostPersistenceError ||
      value[AI_PDF_POST_PERSISTENCE_ERROR_BRAND] === true) &&
    AI_PDF_POST_PERSISTENCE_STAGES.includes(
      value.stage as AIPdfPostPersistenceStage,
    )
  );
}

export const AI_PDF_POST_PERSISTENCE_FAILURE_REASONS = [
  "batch_finalization_contract",
  "post_persistence_authorization",
  "post_persistence_constraint",
  "post_persistence_request",
  "post_persistence_transient",
  "post_persistence_unknown",
  "stale_fence",
] as const;

export type AIPdfPostPersistenceFailureReason =
  (typeof AI_PDF_POST_PERSISTENCE_FAILURE_REASONS)[number];

export type AIPdfPostPersistenceFailureDiagnostic = {
  attemptNumber: number;
  evidenceFingerprint: string;
  httpClassification: "4xx" | "5xx" | "network" | "none" | "timeout";
  phase: AIPdfPostPersistenceStage;
  reason: AIPdfPostPersistenceFailureReason;
  retryable: boolean;
  safeErrorCode:
    | "ai_pdf_post_persistence_failed"
    | "ai_pdf_post_persistence_transient";
  sqlStateClass: string;
  validationCategory:
    | "authorization"
    | "constraint"
    | "none"
    | "request"
    | "unknown";
};

type BoundedPostPersistenceDiagnostic = Pick<
  AIPdfPostPersistenceFailureDiagnostic,
  | "httpClassification"
  | "reason"
  | "retryable"
  | "sqlStateClass"
  | "validationCategory"
>;

function safeRecord(value: unknown) {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function boundedAttempt(value: unknown) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1
    ? Math.min(parsed, 20)
    : 1;
}

function boundedDiagnosticFromCause(
  cause: unknown,
): BoundedPostPersistenceDiagnostic | null {
  const value = safeRecord(cause);
  const diagnostic = safeRecord(value.diagnostic);
  const knownReason = String(diagnostic.reason ?? "");
  const reasonMap: Record<string, AIPdfPostPersistenceFailureReason> = {
    rpc_authorization: "post_persistence_authorization",
    rpc_constraint: "post_persistence_constraint",
    rpc_request: "post_persistence_request",
    rpc_transient: "post_persistence_transient",
    rpc_unknown: "post_persistence_unknown",
  };
  const mappedReason = reasonMap[knownReason];
  if (value.name === "FencedImportPersistenceError" && mappedReason) {
    const retryable = diagnostic.retryable === true;
    return {
      httpClassification: ["4xx", "5xx", "network", "none", "timeout"].includes(
        String(diagnostic.httpClassification),
      )
        ? (String(
            diagnostic.httpClassification,
          ) as BoundedPostPersistenceDiagnostic["httpClassification"])
        : "none",
      reason: mappedReason,
      retryable,
      sqlStateClass: /^[0-9A-Z]{2}$/.test(String(diagnostic.sqlStateClass))
        ? String(diagnostic.sqlStateClass)
        : "none",
      validationCategory: [
        "authorization",
        "constraint",
        "none",
        "request",
        "unknown",
      ].includes(String(diagnostic.validationCategory))
        ? (String(
            diagnostic.validationCategory,
          ) as BoundedPostPersistenceDiagnostic["validationCategory"])
        : "unknown",
    };
  }
  return null;
}

export function getAIPdfPostPersistenceFailureDiagnostic({
  attemptNumber,
  error,
}: {
  attemptNumber?: number;
  error: unknown;
}): AIPdfPostPersistenceFailureDiagnostic | null {
  if (!isAIPdfPostPersistenceError(error)) return null;
  const cause = error.cause;
  const fenced = boundedDiagnosticFromCause(cause);
  let bounded: BoundedPostPersistenceDiagnostic | null = fenced;

  if (!bounded && cause instanceof AIPdfBatchFinalizationContractError) {
    const reason =
      cause.reason === "stale_fence"
        ? "stale_fence"
        : "batch_finalization_contract";
    bounded = {
      httpClassification: "none",
      reason,
      retryable: false,
      sqlStateClass: "none",
      validationCategory:
        cause.reason === "stale_fence" ? "authorization" : "unknown",
    };
  }

  bounded ??= {
    httpClassification: "none",
    reason: "post_persistence_unknown",
    retryable: false,
    sqlStateClass: "none",
    validationCategory: "unknown",
  };
  const safe = {
    attemptNumber: boundedAttempt(attemptNumber),
    httpClassification: bounded.httpClassification,
    phase: error.stage,
    reason: bounded.reason,
    retryable: bounded.retryable,
    safeErrorCode: bounded.retryable
      ? "ai_pdf_post_persistence_transient"
      : "ai_pdf_post_persistence_failed",
    sqlStateClass: bounded.sqlStateClass,
    validationCategory: bounded.validationCategory,
  } as const;
  return {
    ...safe,
    evidenceFingerprint: createHash("sha256")
      .update(JSON.stringify(safe))
      .digest("hex"),
  };
}

export async function runAIPdfPostPersistenceStage<T>({
  operation,
  stage,
}: {
  operation: () => Promise<T>;
  stage: AIPdfPostPersistenceStage;
}) {
  try {
    return await operation();
  } catch (error) {
    throw new AIPdfPostPersistenceError(stage, error);
  }
}

export function getAIPdfPostPersistenceFailureStage(error: unknown) {
  return isAIPdfPostPersistenceError(error) ? error.stage : null;
}

export function getAIPdfBatchFinalizationFailure(error: unknown) {
  const cause = isAIPdfPostPersistenceError(error) ? error.cause : error;
  return cause instanceof AIPdfBatchFinalizationContractError
    ? { reason: cause.reason, summaryBytes: cause.summaryBytes }
    : null;
}
