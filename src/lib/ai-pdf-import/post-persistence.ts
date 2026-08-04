export const AI_PDF_POST_PERSISTENCE_STAGES = [
  "asset_attachment",
  "summary_preparation",
  "batch_finalization",
  "review_plans",
] as const;

export type AIPdfPostPersistenceStage =
  (typeof AI_PDF_POST_PERSISTENCE_STAGES)[number];

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
  readonly stage: AIPdfPostPersistenceStage;

  constructor(stage: AIPdfPostPersistenceStage, cause: unknown) {
    super("AI PDF post-persistence processing failed.", { cause });
    this.name = "AIPdfPostPersistenceError";
    this.stage = stage;
  }
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
  return error instanceof AIPdfPostPersistenceError ? error.stage : null;
}

export function getAIPdfBatchFinalizationFailure(error: unknown) {
  const cause =
    error instanceof AIPdfPostPersistenceError ? error.cause : error;
  return cause instanceof AIPdfBatchFinalizationContractError
    ? { reason: cause.reason, summaryBytes: cause.summaryBytes }
    : null;
}
