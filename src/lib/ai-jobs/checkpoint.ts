import "server-only";

import type { AIProviderJob } from "@/lib/ai-jobs/types";

type SupabaseCheckpointClient = any;

export type AIProviderJobPersistenceFence = {
  executionFenceToken: string;
  jobId: string;
  leaseOwner: string;
};

export const aiProviderJobCheckpointStages = [
  "queued",
  "claimed",
  "source_validated",
  "provider_request_started",
  "provider_result_checkpointed",
  "normalized",
  "drafts_persisted",
  "completed",
] as const;

export type AIProviderJobCheckpointStage =
  (typeof aiProviderJobCheckpointStages)[number];

export const STALE_FENCE_REJECTED = "STALE_FENCE_REJECTED";
export const AI_PROVIDER_JOB_CHECKPOINT_METADATA_MAX_BYTES = 4096;

export const AI_PROVIDER_JOB_CHECKPOINT_OPERATIONS = [
  "begin_pdf_processing",
  "checkpoint_provider_result",
  "checkpoint_stage",
  "finalize_import_batch",
  "finish_job",
  "heartbeat",
  "read_provider_result",
] as const;

export type AIProviderJobCheckpointOperation =
  (typeof AI_PROVIDER_JOB_CHECKPOINT_OPERATIONS)[number];

const AI_PROVIDER_JOB_CHECKPOINT_ERROR_BRAND = Symbol.for(
  "edustruct.ai-provider-job-checkpoint-error",
);

export type AIProviderJobCheckpointFailureDiagnostic = {
  httpClassification: "4xx" | "5xx" | "network" | "none" | "timeout";
  operation: AIProviderJobCheckpointOperation;
  reason:
    | "checkpoint_authorization"
    | "checkpoint_constraint"
    | "checkpoint_request"
    | "checkpoint_transient"
    | "checkpoint_unknown";
  retryable: boolean;
  safeErrorCode:
    | "ai_job_checkpoint_failed"
    | "ai_job_checkpoint_transient";
  sqlStateClass: string;
};

function checkpointErrorRecord(value: unknown) {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function checkpointFailureDiagnostic({
  error,
  operation,
}: {
  error: unknown;
  operation: AIProviderJobCheckpointOperation;
}): AIProviderJobCheckpointFailureDiagnostic {
  const value = checkpointErrorRecord(error);
  const code = String(value.code ?? "").toUpperCase();
  const sqlStateClass = /^[0-9A-Z]{5}$/.test(code) ? code.slice(0, 2) : "none";
  const status = Number(value.status ?? value.statusCode);
  const message = error instanceof Error
    ? error.message
    : String(value.message ?? "");
  const timeout = /\b(?:timeout|timed out|deadline exceeded)\b/i.test(message);
  const network = /\b(?:ECONNRESET|ECONNREFUSED|ENOTFOUND|fetch failed|network|unavailable)\b/i.test(
    message,
  );
  const transientSqlState = ["08", "40", "53", "55", "57", "58"].includes(
    sqlStateClass,
  );
  const retryable = timeout || network || transientSqlState || status >= 500;
  const reason = retryable
    ? "checkpoint_transient"
    : sqlStateClass === "23"
      ? "checkpoint_constraint"
      : sqlStateClass === "28"
        ? "checkpoint_authorization"
        : sqlStateClass === "22" || code.startsWith("PGRST")
          ? "checkpoint_request"
          : "checkpoint_unknown";
  const httpClassification = timeout
    ? "timeout"
    : network
      ? "network"
      : status >= 500
        ? "5xx"
        : status >= 400
          ? "4xx"
          : "none";
  return {
    httpClassification,
    operation,
    reason,
    retryable,
    safeErrorCode: retryable
      ? "ai_job_checkpoint_transient"
      : "ai_job_checkpoint_failed",
    sqlStateClass,
  };
}

export class AIProviderJobCheckpointRpcError extends Error {
  readonly [AI_PROVIDER_JOB_CHECKPOINT_ERROR_BRAND] = true;
  readonly diagnostic: AIProviderJobCheckpointFailureDiagnostic;

  constructor(operation: AIProviderJobCheckpointOperation, cause: unknown) {
    super("Durable AI job checkpoint operation failed.", { cause });
    this.name = "AIProviderJobCheckpointRpcError";
    this.diagnostic = checkpointFailureDiagnostic({ error: cause, operation });
  }
}

export function getAIProviderJobCheckpointFailureDiagnostic(error: unknown) {
  if (!(error instanceof Error)) return null;
  const value = error as Error & {
    [AI_PROVIDER_JOB_CHECKPOINT_ERROR_BRAND]?: unknown;
    diagnostic?: unknown;
  };
  if (
    !(error instanceof AIProviderJobCheckpointRpcError) &&
    value[AI_PROVIDER_JOB_CHECKPOINT_ERROR_BRAND] !== true
  ) {
    return null;
  }
  const diagnostic = checkpointErrorRecord(value.diagnostic);
  const operation = String(diagnostic.operation);
  const reason = String(diagnostic.reason);
  if (
    !AI_PROVIDER_JOB_CHECKPOINT_OPERATIONS.includes(
      operation as AIProviderJobCheckpointOperation,
    ) ||
    ![
      "checkpoint_authorization",
      "checkpoint_constraint",
      "checkpoint_request",
      "checkpoint_transient",
      "checkpoint_unknown",
    ].includes(reason)
  ) {
    return null;
  }
  return diagnostic as AIProviderJobCheckpointFailureDiagnostic;
}

export class AIProviderJobFenceLostError extends Error {
  constructor() {
    super("The trusted worker lease was superseded by a newer execution attempt.");
    this.name = "AIProviderJobFenceLostError";
  }
}

function requireFence(job: AIProviderJob) {
  if (!job.execution_fence_token || !job.lease_owner) {
    throw new AIProviderJobFenceLostError();
  }

  return {
    fenceToken: job.execution_fence_token,
    leaseOwner: job.lease_owner,
  };
}

export function persistenceFenceForJob(job: AIProviderJob): AIProviderJobPersistenceFence {
  const fence = requireFence(job);
  return {
    executionFenceToken: fence.fenceToken,
    jobId: job.id,
    leaseOwner: fence.leaseOwner,
  };
}

function isFenceRejection(value: unknown) {
  return value === STALE_FENCE_REJECTED;
}

async function callFencedRpc({
  args,
  maxAttempts = 1,
  name,
  operation,
  supabase,
}: {
  args: Record<string, unknown>;
  maxAttempts?: 1 | 2;
  name: string;
  operation: AIProviderJobCheckpointOperation;
  supabase: SupabaseCheckpointClient;
}) {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const { data, error } = await supabase.rpc(name, args);
    if (error) {
      const checkpointError = new AIProviderJobCheckpointRpcError(
        operation,
        error,
      );
      if (attempt < maxAttempts && checkpointError.diagnostic.retryable) {
        continue;
      }
      throw checkpointError;
    }
    if (isFenceRejection(data)) throw new AIProviderJobFenceLostError();
    return data as string;
  }
  throw new AIProviderJobCheckpointRpcError(operation, null);
}

export async function heartbeatAIProviderJobFence({
  job,
  leaseSeconds = 900,
  supabase,
}: {
  job: AIProviderJob;
  leaseSeconds?: number;
  supabase: SupabaseCheckpointClient;
}) {
  const fence = requireFence(job);
  return callFencedRpc({
    args: {
      p_execution_fence_token: fence.fenceToken,
      p_job_id: job.id,
      p_lease_owner: fence.leaseOwner,
      p_lease_seconds: leaseSeconds,
    },
    name: "heartbeat_ai_provider_job_fenced",
    operation: "heartbeat",
    supabase,
  });
}

export async function checkpointAIProviderJobStage({
  job,
  metadata = {},
  stage,
  supabase,
}: {
  job: AIProviderJob;
  metadata?: Record<string, unknown>;
  stage: AIProviderJobCheckpointStage;
  supabase: SupabaseCheckpointClient;
}) {
  const fence = requireFence(job);
  if (
    Buffer.byteLength(JSON.stringify(metadata), "utf8") >
    AI_PROVIDER_JOB_CHECKPOINT_METADATA_MAX_BYTES
  ) {
    throw new AIProviderJobCheckpointRpcError("checkpoint_stage", {
      code: "22023",
      message: "Checkpoint metadata exceeds its bounded contract.",
    });
  }
  return callFencedRpc({
    args: {
      p_execution_fence_token: fence.fenceToken,
      p_job_id: job.id,
      p_lease_owner: fence.leaseOwner,
      p_safe_metadata: metadata,
      p_stage: stage,
    },
    name: "checkpoint_ai_provider_job_stage",
    operation: "checkpoint_stage",
    supabase,
  });
}

export async function beginAIProviderJobPdfProcessing({
  job,
  providerProfileId,
  sourceAssetId,
  supabase,
}: {
  job: AIProviderJob;
  providerProfileId: string;
  sourceAssetId: string;
  supabase: SupabaseCheckpointClient;
}) {
  const fence = requireFence(job);
  return callFencedRpc({
    args: {
      p_execution_fence_token: fence.fenceToken,
      p_job_id: job.id,
      p_lease_owner: fence.leaseOwner,
      p_provider_profile_id: providerProfileId,
      p_source_asset_id: sourceAssetId,
    },
    name: "begin_ai_provider_job_pdf_processing_fenced",
    operation: "begin_pdf_processing",
    supabase,
  });
}

export async function checkpointAIProviderJobProviderResult({
  job,
  outputContractVersion,
  payload,
  payloadSha256,
  supabase,
}: {
  job: AIProviderJob;
  outputContractVersion: number;
  payload: Record<string, unknown>;
  payloadSha256: string;
  supabase: SupabaseCheckpointClient;
}) {
  const fence = requireFence(job);
  return callFencedRpc({
    args: {
      p_execution_fence_token: fence.fenceToken,
      p_job_id: job.id,
      p_lease_owner: fence.leaseOwner,
      p_output_contract_version: outputContractVersion,
      p_payload: payload,
      p_payload_sha256: payloadSha256,
    },
    maxAttempts: 2,
    name: "checkpoint_ai_provider_job_provider_result",
    operation: "checkpoint_provider_result",
    supabase,
  });
}

export async function loadAIProviderJobProviderResult({
  job,
  supabase,
}: {
  job: AIProviderJob;
  supabase: SupabaseCheckpointClient;
}): Promise<Record<string, unknown> | null> {
  const fence = requireFence(job);
  const { data, error } = await supabase.rpc(
    "read_ai_provider_job_provider_result_checkpoint",
    {
      p_execution_fence_token: fence.fenceToken,
      p_job_id: job.id,
      p_lease_owner: fence.leaseOwner,
    },
  );
  if (error) {
    throw new AIProviderJobCheckpointRpcError("read_provider_result", error);
  }
  if (isFenceRejection(data)) throw new AIProviderJobFenceLostError();
  return data && typeof data === "object" && !Array.isArray(data)
    ? (data as Record<string, unknown>)
    : null;
}

export async function finishAIProviderJobFence({
  availableAt = null,
  job,
  providerAttemptCount = 0,
  retryable = false,
  safeErrorCode = null,
  safeMessage = null,
  safeResult = {},
  status,
  supabase,
}: {
  availableAt?: string | null;
  job: AIProviderJob;
  providerAttemptCount?: number;
  retryable?: boolean;
  safeErrorCode?: string | null;
  safeMessage?: string | null;
  safeResult?: Record<string, unknown>;
  status: "completed" | "retry_wait" | "failed";
  supabase: SupabaseCheckpointClient;
}) {
  const fence = requireFence(job);
  return callFencedRpc({
    args: {
      p_available_at: availableAt,
      p_execution_fence_token: fence.fenceToken,
      p_job_id: job.id,
      p_lease_owner: fence.leaseOwner,
      p_provider_attempt_count: providerAttemptCount,
      p_retryable: retryable,
      p_safe_error_code: safeErrorCode,
      p_safe_message: safeMessage,
      p_safe_result: safeResult,
      p_status: status,
    },
    name: "finish_ai_provider_job_fenced",
    operation: "finish_job",
    supabase,
  });
}

export async function finalizeAIProviderJobImportBatchFence({
  job,
  persistenceLineage,
  status,
  summary,
  supabase,
}: {
  job: AIProviderJob;
  persistenceLineage: Record<string, unknown>;
  status: "failed" | "imported";
  summary: Record<string, unknown>;
  supabase: SupabaseCheckpointClient;
}) {
  const fence = requireFence(job);
  return callFencedRpc({
    args: {
      p_execution_fence_token: fence.fenceToken,
      p_job_id: job.id,
      p_lease_owner: fence.leaseOwner,
      p_persisted_output_lineage: persistenceLineage,
      p_status: status,
      p_summary: summary,
    },
    name: "finalize_ai_provider_job_import_batch_fenced",
    operation: "finalize_import_batch",
    supabase,
  });
}
