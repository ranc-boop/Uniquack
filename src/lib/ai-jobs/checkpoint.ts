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
  name,
  supabase,
}: {
  args: Record<string, unknown>;
  name: string;
  supabase: SupabaseCheckpointClient;
}) {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw new Error(error.message);
  if (isFenceRejection(data)) throw new AIProviderJobFenceLostError();
  return data as string;
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
  return callFencedRpc({
    args: {
      p_execution_fence_token: fence.fenceToken,
      p_job_id: job.id,
      p_lease_owner: fence.leaseOwner,
      p_safe_metadata: metadata,
      p_stage: stage,
    },
    name: "checkpoint_ai_provider_job_stage",
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
    name: "checkpoint_ai_provider_job_provider_result",
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
  if (error) throw new Error(error.message);
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
    supabase,
  });
}
