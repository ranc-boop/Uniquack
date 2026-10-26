const aiProviderJobKinds = [
  "ai_pdf_extract",
  "ai_pdf_coverage_recovery",
  "blueprint_generate_questions",
] as const;

export type AIProviderJobKind = (typeof aiProviderJobKinds)[number];

const aiProviderJobStatuses = [
  "queued",
  "leased",
  "processing",
  "retry_wait",
  "completed",
  "failed",
  "cancelled",
] as const;

export type AIProviderJobStatus = (typeof aiProviderJobStatuses)[number];

export type AIProviderJobResourceType =
  | "import_batch"
  | "question_blueprint";

export type AIProviderJob = {
  id: string;
  organization_id: string;
  created_by: string;
  job_kind: AIProviderJobKind;
  resource_type: AIProviderJobResourceType;
  resource_id: string;
  target_bank_id: string | null;
  provider_profile_id: string | null;
  status: AIProviderJobStatus;
  priority: number;
  fairness_key: string;
  idempotency_key: string;
  retry_generation: number;
  payload: Record<string, unknown>;
  safe_result: Record<string, unknown>;
  safe_error_code: string | null;
  safe_message: string | null;
  retryable: boolean;
  provider_attempt_count: number;
  execution_attempt_count: number;
  max_execution_attempts: number;
  available_at: string;
  lease_owner: string | null;
  execution_fence_token: string | null;
  lease_generation: number;
  checkpoint_stage: string;
  checkpoint_version: number;
  checkpointed_at: string | null;
  lease_acquired_at: string | null;
  lease_expires_at: string | null;
  last_heartbeat_at: string | null;
  cancellation_requested_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  failed_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
};

export type AIProviderJobSafeStatus = Pick<
  AIProviderJob,
  | "id"
  | "job_kind"
  | "resource_id"
  | "target_bank_id"
  | "status"
  | "safe_result"
  | "safe_error_code"
  | "safe_message"
  | "retryable"
  | "execution_attempt_count"
  | "max_execution_attempts"
  | "available_at"
  | "created_at"
  | "updated_at"
  | "completed_at"
>;

export function isAIProviderJobKind(value: unknown): value is AIProviderJobKind {
  return typeof value === "string" && aiProviderJobKinds.includes(value as AIProviderJobKind);
}

export function isAIProviderJobStatus(value: unknown): value is AIProviderJobStatus {
  return typeof value === "string" && aiProviderJobStatuses.includes(value as AIProviderJobStatus);
}
