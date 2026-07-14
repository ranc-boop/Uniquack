import type { AIProviderJob, AIProviderJobSafeStatus } from "@/lib/ai-jobs/types";

export const AI_PROVIDER_JOB_POLICY = {
  globalActiveLimit: 3,
  maxExecutionAttempts: 4,
  maxOrganizationActiveJobs: 1,
  maxOrganizationQueuedJobs: 12,
  maxUserActiveOrQueuedJobs: 5,
  perKindActiveLimit: {
    ai_pdf_extract: 1,
    ai_pdf_coverage_recovery: 1,
    blueprint_generate_questions: 2,
  },
  workerBatchLimit: 3,
  workerLeaseSeconds: 900,
  workerMaxLeaseSeconds: 1800,
} as const;

export const AI_PROVIDER_JOB_STATUS_COPY: Record<
  AIProviderJobSafeStatus["status"],
  string
> = {
  queued: "Waiting for available AI capacity.",
  leased: "AI processing is underway. You can leave this page.",
  processing: "AI processing is underway. You can leave this page.",
  retry_wait:
    "The AI service is temporarily busy. Your work is safe and will retry automatically.",
  completed: "This run completed. Review Drafts are ready for review.",
  failed:
    "This run could not be completed. Nothing was published or assigned. Your source and target Library were preserved.",
  cancelled: "This queued run was cancelled. Your source and target Library were preserved.",
};

export function queueRetryDelayMs(
  executionAttemptCount: number,
  random: () => number = Math.random,
) {
  const baseDelayMs = [30_000, 120_000, 300_000][executionAttemptCount - 1];

  if (!baseDelayMs) return null;

  // Full jitter prevents a cohort of provider failures from retrying together.
  return Math.round(baseDelayMs * (0.5 + Math.max(0, Math.min(1, random())) * 0.5));
}

export function safeAIProviderJobStatus(job: AIProviderJob): AIProviderJobSafeStatus {
  return {
    id: job.id,
    job_kind: job.job_kind,
    resource_id: job.resource_id,
    target_bank_id: job.target_bank_id,
    status: job.status,
    safe_result: job.safe_result,
    safe_error_code: job.safe_error_code,
    safe_message: job.safe_message,
    retryable: job.retryable,
    execution_attempt_count: job.execution_attempt_count,
    max_execution_attempts: job.max_execution_attempts,
    available_at: job.available_at,
    created_at: job.created_at,
    updated_at: job.updated_at,
    completed_at: job.completed_at,
  };
}

export function jobStatusCopy(job: AIProviderJobSafeStatus) {
  return job.safe_message || AI_PROVIDER_JOB_STATUS_COPY[job.status];
}

export function isActiveAIProviderJob(job: Pick<AIProviderJob, "status">) {
  return ["queued", "leased", "processing", "retry_wait"].includes(job.status);
}
