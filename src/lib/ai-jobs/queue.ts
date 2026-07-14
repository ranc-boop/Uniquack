import "server-only";

import { safeAIProviderJobStatus } from "@/lib/ai-jobs/policy";
import type {
  AIProviderJob,
  AIProviderJobKind,
  AIProviderJobSafeStatus,
  AIProviderJobResourceType,
} from "@/lib/ai-jobs/types";

// The generated database contract intentionally lags forward clean migrations
// until they are applied. Queue RPCs are cast at this narrow server boundary.
type SupabaseQueueClient = any;

export class AIProviderJobQueueSchemaMissingError extends Error {
  constructor(message = "The durable AI job queue has not been applied yet.") {
    super(message);
    this.name = "AIProviderJobQueueSchemaMissingError";
  }
}

function assertQueueSchema(error: { code?: string; message?: string } | null) {
  const message = error?.message?.toLowerCase() ?? "";
  if (
    error?.code === "42P01" ||
    error?.code === "PGRST204" ||
    error?.code === "PGRST205" ||
    message.includes("ai_provider_jobs") ||
    message.includes("enqueue_ai_provider_job")
  ) {
    throw new AIProviderJobQueueSchemaMissingError();
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function normalizeJob(value: unknown): AIProviderJob {
  const job = asRecord(value);

  return {
    ...job,
    payload: asRecord(job.payload),
    safe_result: asRecord(job.safe_result),
  } as AIProviderJob;
}

function assertUUID(value: string, label: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error(`${label} is invalid.`);
  }
}

export function buildAIPdfJobIdempotencyKey({
  batchId,
  sourceAssetId,
  retryGeneration = 0,
}: {
  batchId: string;
  sourceAssetId: string;
  retryGeneration?: number;
}) {
  assertUUID(batchId, "Import batch");
  assertUUID(sourceAssetId, "Source PDF");
  return `ai_pdf_extract:${batchId}:${sourceAssetId}:v1:retry:${retryGeneration}`;
}

export function buildAIPdfCoverageRecoveryJobIdempotencyKey({
  batchId,
  planHash,
  sourceAssetId,
}: {
  batchId: string;
  planHash: string;
  sourceAssetId: string;
}) {
  assertUUID(batchId, "Original import batch");
  assertUUID(sourceAssetId, "Source PDF");
  const normalizedPlanHash = planHash.trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(normalizedPlanHash)) {
    throw new Error("Coverage recovery plan is invalid.");
  }
  return `ai_pdf_coverage_recovery:${batchId}:${sourceAssetId}:plan:${normalizedPlanHash}`;
}

export function buildBlueprintGenerationJobIdempotencyKey({
  blueprintId,
  blueprintVersion,
  targetBankId,
  retryGeneration = 0,
}: {
  blueprintId: string;
  blueprintVersion: number;
  targetBankId: string;
  retryGeneration?: number;
}) {
  assertUUID(blueprintId, "Blueprint");
  assertUUID(targetBankId, "Target Library");
  return `blueprint_generate:${blueprintId}:v${Math.max(1, Math.trunc(blueprintVersion))}:${targetBankId}:retry:${retryGeneration}`;
}

export async function enqueueAIProviderJob({
  idempotencyKey,
  jobKind,
  payload = {},
  providerProfileId = null,
  resourceId,
  resourceType,
  supabase,
  targetBankId,
}: {
  idempotencyKey: string;
  jobKind: AIProviderJobKind;
  payload?: Record<string, unknown>;
  providerProfileId?: string | null;
  resourceId: string;
  resourceType: AIProviderJobResourceType;
  supabase: SupabaseQueueClient;
  targetBankId: string | null;
}) {
  assertUUID(resourceId, "AI resource");
  if (targetBankId) assertUUID(targetBankId, "Target Library");
  if (providerProfileId) assertUUID(providerProfileId, "Provider profile");

  const { data, error } = await supabase.rpc("enqueue_ai_provider_job", {
    p_idempotency_key: idempotencyKey,
    p_job_kind: jobKind,
    p_payload: payload,
    p_provider_profile_id: providerProfileId,
    p_resource_id: resourceId,
    p_resource_type: resourceType,
    p_target_bank_id: targetBankId,
  });

  assertQueueSchema(error);
  if (error) throw new Error(error.message);

  return normalizeJob(Array.isArray(data) ? data[0] : data);
}

export async function listAIProviderJobsForResource({
  limit = 6,
  resourceId,
  supabase,
}: {
  limit?: number;
  resourceId: string;
  supabase: SupabaseQueueClient;
}): Promise<AIProviderJobSafeStatus[]> {
  const { data, error } = await supabase
    .from("ai_provider_jobs")
    .select(
      "id, job_kind, resource_id, target_bank_id, status, safe_result, safe_error_code, safe_message, retryable, execution_attempt_count, max_execution_attempts, available_at, created_at, updated_at, completed_at",
    )
    .eq("resource_id", resourceId)
    .order("created_at", { ascending: false })
    .limit(Math.max(1, Math.min(limit, 12)));

  assertQueueSchema(error);
  if (error) throw new Error(error.message);
  return (data ?? []).map((job: unknown) => safeAIProviderJobStatus(normalizeJob(job)));
}

export async function listAIProviderJobsForBank({
  bankId,
  limit = 8,
  supabase,
}: {
  bankId: string;
  limit?: number;
  supabase: SupabaseQueueClient;
}): Promise<AIProviderJobSafeStatus[]> {
  const { data, error } = await supabase
    .from("ai_provider_jobs")
    .select(
      "id, job_kind, resource_id, target_bank_id, status, safe_result, safe_error_code, safe_message, retryable, execution_attempt_count, max_execution_attempts, available_at, created_at, updated_at, completed_at",
    )
    .eq("target_bank_id", bankId)
    .order("created_at", { ascending: false })
    .limit(Math.max(1, Math.min(limit, 12)));

  assertQueueSchema(error);
  if (error) throw new Error(error.message);
  return (data ?? []).map((job: unknown) => safeAIProviderJobStatus(normalizeJob(job)));
}

export async function cancelAIProviderJob({
  jobId,
  supabase,
}: {
  jobId: string;
  supabase: SupabaseQueueClient;
}) {
  assertUUID(jobId, "AI job");
  const { data, error } = await supabase.rpc("cancel_ai_provider_job", {
    p_job_id: jobId,
  });
  assertQueueSchema(error);
  if (error) throw new Error(error.message);
  return data === true;
}
