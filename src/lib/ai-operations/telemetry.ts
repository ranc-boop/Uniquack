import "server-only";

import {
  estimateAIProviderCost,
  sumAIProviderUsage,
  type AIProviderUsage,
} from "@/lib/ai-operations/cost-catalog";
import type { AIProviderJob } from "@/lib/ai-jobs/types";

type SupabaseWorkerClient = any;

export type AIOperationExecutionMetadata = {
  circuitOutcome?: "closed" | "fallback" | "half_open_probe" | "open" | "unavailable";
  fallbackUsed?: boolean;
  model?: string | null;
  provider?: string | null;
  providerCallCount?: number;
  providerLatencyMs?: number | null;
  providerProfileId?: string | null;
  providerRetryAttempts?: number;
  routePolicyVersion?: number | null;
  routePosition?: number | null;
  usageSamples?: Array<AIProviderUsage | null>;
};

function elapsedMs(start: string | null, end: number) {
  const timestamp = start ? Date.parse(start) : NaN;
  return Number.isFinite(timestamp) ? Math.max(0, Math.round(end - timestamp)) : null;
}

function nullableInteger(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.trunc(value))
    : null;
}

export async function recordAIOperationTelemetry({
  draftsCreated,
  executionStartedAt,
  finalStatus,
  job,
  metadata = {},
  safeErrorCode = null,
  supabase,
}: {
  draftsCreated: number;
  executionStartedAt: number;
  finalStatus: "completed" | "retry_wait" | "failed" | "cancelled" | "skipped";
  job: AIProviderJob;
  metadata?: AIOperationExecutionMetadata;
  safeErrorCode?: string | null;
  supabase: SupabaseWorkerClient;
}) {
  const operationKind = job.job_kind;
  const usage = sumAIProviderUsage(metadata.usageSamples ?? []);
  const cost = estimateAIProviderCost({
    model: metadata.model ?? null,
    provider: metadata.provider,
    usage,
  });
  const now = Date.now();
  const { error } = await supabase.rpc("record_ai_operation_telemetry", {
    p_actual_cached_input_tokens: nullableInteger(usage?.cachedInputTokens),
    p_actual_input_tokens: nullableInteger(usage?.inputTokens),
    p_actual_output_tokens: nullableInteger(usage?.outputTokens),
    p_actual_total_tokens: nullableInteger(usage?.totalTokens),
    p_circuit_outcome: metadata.circuitOutcome ?? (metadata.fallbackUsed ? "fallback" : "closed"),
    p_drafts_created: Math.max(0, Math.trunc(draftsCreated)),
    p_estimated_cached_input_cost_micros: cost.cachedInputCostMicros,
    p_estimated_input_cost_micros: cost.inputCostMicros,
    p_estimated_input_tokens: nullableInteger(usage?.inputTokens),
    p_estimated_output_cost_micros: cost.outputCostMicros,
    p_estimated_output_tokens: nullableInteger(usage?.outputTokens),
    p_estimated_total_cost_micros: cost.totalCostMicros,
    p_estimated_total_tokens: nullableInteger(usage?.totalTokens),
    p_execution_latency_ms: Math.max(0, Math.round(now - executionStartedAt)),
    p_fallback_used: metadata.fallbackUsed ?? false,
    p_final_status: finalStatus,
    p_model: metadata.model ?? null,
    p_operation_kind: operationKind,
    p_organization_id: job.organization_id,
    p_provider: metadata.provider ?? null,
    p_provider_call_count: Math.max(0, Math.trunc(metadata.providerCallCount ?? 0)),
    p_provider_latency_ms: nullableInteger(metadata.providerLatencyMs),
    p_provider_profile_id: metadata.providerProfileId ?? job.provider_profile_id,
    p_provider_retry_attempts: Math.max(0, Math.trunc(metadata.providerRetryAttempts ?? 0)),
    p_queue_execution_attempt: job.execution_attempt_count,
    p_queue_job_id: job.id,
    p_queue_wait_ms: elapsedMs(job.created_at, Date.parse(job.lease_acquired_at ?? job.started_at ?? job.created_at)),
    p_route_policy_version: metadata.routePolicyVersion ?? null,
    p_route_position: metadata.routePosition ?? null,
    p_safe_error_code: safeErrorCode,
  });

  if (error) throw new Error(error.message);
}

export async function getAIWorkerOperationsControl(supabase: SupabaseWorkerClient) {
  const { data, error } = await supabase.rpc("get_ai_operations_worker_control");
  if (error) {
    const message = error.message?.toLowerCase() ?? "";
    if (error.code === "PGRST202" || message.includes("get_ai_operations_worker_control")) {
      return {
        maxJobsPerInvocation: 2,
        maxProviderCallsPerExecution: 4,
        pauseWorkerClaims: false,
        schemaReady: false,
      };
    }
    throw new Error(error.message);
  }
  const row = Array.isArray(data) ? data[0] : data;
  return {
    maxJobsPerInvocation: Math.max(1, Math.min(2, Number(row?.max_jobs_per_invocation) || 2)),
    maxProviderCallsPerExecution: Math.max(1, Math.min(4, Number(row?.max_provider_calls_per_execution) || 4)),
    pauseWorkerClaims: row?.pause_worker_claims === true,
    schemaReady: true,
  };
}
