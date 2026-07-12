import "server-only";

import { randomUUID } from "node:crypto";

import {
  classifyAIProviderError,
  safeAIProviderErrorState,
} from "@/lib/ai-providers/errors";
import {
  resolveAIProviderRoute,
  runWithAIProviderRoute,
  type AIProviderRoutingOperationKind,
} from "@/lib/ai-providers/routing";
import { queueRetryDelayMs } from "@/lib/ai-jobs/policy";
import type { AIProviderJob } from "@/lib/ai-jobs/types";
import {
  processAIPdfImport,
  recordAIPdfProviderFailure,
  type AIPdfProcessInput,
} from "@/lib/ai-pdf-import/service";
import { AI_IMPORT_SOURCES_BUCKET } from "@/lib/ai-pdf-import/constants";
import { generateTeacherBlueprintReviewDrafts } from "@/lib/teacher-blueprint-generation";
import { createServiceRoleClient } from "@/lib/supabase/server";

// The queue migration is forward-only, so keep its ungenerated RPC boundary
// narrow until database types are regenerated from the applied clean schema.
type SupabaseWorkerClient = any;

type WorkerSummary = {
  claimed: number;
  completed: number;
  failed: number;
  retryWaiting: number;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberValue(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeJob(value: unknown): AIProviderJob {
  const job = asRecord(value);
  return {
    ...job,
    payload: asRecord(job.payload),
    safe_result: asRecord(job.safe_result),
  } as AIProviderJob;
}

function safeWorkerFailureMessage() {
  return "This run could not be completed. Nothing was published or assigned. Your source and target Library were preserved.";
}

async function claimAIPdfBatchResource({
  batch,
  job,
  providerProfileId,
  sourceAssetId,
  supabase,
}: {
  batch: { id: string; status: string; summary: unknown };
  job: AIProviderJob;
  providerProfileId: string;
  sourceAssetId: string;
  supabase: SupabaseWorkerClient;
}) {
  if (batch.status === "imported") return false;

  const summary = asRecord(batch.summary);
  const aiPdfImport = asRecord(summary.aiPdfImport);
  const { data, error } = await supabase
    .from("import_batches")
    .update({
      status: "validating",
      summary: {
        ...summary,
        aiPdfImport: {
          ...aiPdfImport,
          detail: "AI processing is underway. You can leave this page.",
          durableJobId: job.id,
          jobId: job.id,
          phase: "queue_processing",
          providerProfileId,
          queueStatus: "processing",
          sourceAssetId,
          targetBankId: job.target_bank_id,
          updatedAt: new Date().toISOString(),
        },
      },
    })
    .eq("id", job.resource_id)
    .in("status", ["draft", "failed", "ready"])
    .select("id")
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) {
    throw new Error("The PDF batch is already active, cancelled, or no longer retryable.");
  }
  return true;
}

async function ensureBankIsActive({
  bankId,
  profileId,
  supabase,
}: {
  bankId: string | null;
  profileId: string;
  supabase: SupabaseWorkerClient;
}) {
  if (!bankId) throw new Error("The target Library is missing.");

  const [{ data: bank, error: bankError }, { data: profile, error: profileError }] =
    await Promise.all([
      supabase
        .from("question_banks")
        .select("id, status, organization_id")
        .eq("id", bankId)
        .maybeSingle(),
      supabase.from("profiles").select("id, role, status").eq("id", profileId).maybeSingle(),
    ]);

  if (bankError) throw new Error(bankError.message);
  if (profileError) throw new Error(profileError.message);
  if (!bank || bank.status !== "active") {
    throw new Error("The target Library is no longer active.");
  }
  if (!profile || profile.status !== "active" || !["teacher", "admin", "super_admin"].includes(profile.role)) {
    throw new Error("The original teacher account is no longer eligible to run this work.");
  }

  if (profile.role === "super_admin") return bank;

  const { data: membership, error: membershipError } = await supabase
    .from("bank_members")
    .select("id")
    .eq("bank_id", bankId)
    .eq("user_id", profileId)
    .eq("status", "active")
    .in("role", ["owner", "editor"])
    .maybeSingle();

  if (membershipError) throw new Error(membershipError.message);
  if (!membership) {
    throw new Error("The original teacher no longer has editor access to the target Library.");
  }

  return bank;
}

async function ensureAdminCreatorIsEligible({
  profileId,
  supabase,
}: {
  profileId: string;
  supabase: SupabaseWorkerClient;
}) {
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id, role, status")
    .eq("id", profileId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!profile || profile.status !== "active" || !["admin", "super_admin"].includes(profile.role)) {
    throw new Error("The original administrator account is no longer eligible to run this work.");
  }
}

async function markProcessing({
  job,
  leaseOwner,
  supabase,
}: {
  job: AIProviderJob;
  leaseOwner: string;
  supabase: SupabaseWorkerClient;
}) {
  const { data, error } = await supabase.rpc("heartbeat_ai_provider_job", {
    p_job_id: job.id,
    p_lease_owner: leaseOwner,
    p_lease_seconds: 900,
  });
  if (error) throw new Error(error.message);
  if (data !== true) throw new Error("The worker lease was lost before processing started.");
}

async function finishJob({
  job,
  leaseOwner,
  providerAttemptCount = 0,
  safeErrorCode = null,
  safeMessage = null,
  safeResult = {},
  status,
  supabase,
}: {
  job: AIProviderJob;
  leaseOwner: string;
  providerAttemptCount?: number;
  safeErrorCode?: string | null;
  safeMessage?: string | null;
  safeResult?: Record<string, unknown>;
  status: "completed" | "retry_wait" | "failed";
  supabase: SupabaseWorkerClient;
}) {
  const retryDelay = status === "retry_wait" ? queueRetryDelayMs(job.execution_attempt_count) : null;
  const availableAt = retryDelay
    ? new Date(Date.now() + retryDelay).toISOString()
    : null;
  const { data, error } = await supabase.rpc("finish_ai_provider_job", {
    p_available_at: availableAt,
    p_job_id: job.id,
    p_lease_owner: leaseOwner,
    p_provider_attempt_count: providerAttemptCount,
    p_retryable: status === "retry_wait",
    p_safe_error_code: safeErrorCode,
    p_safe_message: safeMessage,
    p_safe_result: safeResult,
    p_status: status,
  });
  if (error) throw new Error(error.message);
  return data === true;
}

async function runAIPdfExtractJob({
  job,
  leaseOwner,
  supabase,
}: {
  job: AIProviderJob;
  leaseOwner: string;
  supabase: SupabaseWorkerClient;
}) {
  const { data: batch, error: batchError } = await supabase
    .from("import_batches")
    .select("id, created_by, source_type, status, summary, target_bank_id")
    .eq("id", job.resource_id)
    .eq("source_type", "ai_pdf")
    .maybeSingle();
  if (batchError) throw new Error(batchError.message);
  if (!batch || batch.target_bank_id !== job.target_bank_id) {
    throw new Error("The original PDF import is no longer available for this Library.");
  }
  if (batch.status === "imported") {
    return { alreadyCompleted: true, createdCount: 0, reviewRoute: `/teacher/banks/${job.target_bank_id}/review` };
  }

  if (job.target_bank_id) {
    await ensureBankIsActive({
      bankId: job.target_bank_id,
      profileId: job.created_by,
      supabase,
    });
  } else {
    await ensureAdminCreatorIsEligible({ profileId: job.created_by, supabase });
  }

  const summary = asRecord(batch.summary);
  const aiPdfImport = asRecord(summary.aiPdfImport);
  const sourceAssetId = stringValue(job.payload.sourceAssetId) ?? stringValue(aiPdfImport.sourceAssetId);
  const providerProfileId = job.provider_profile_id ?? stringValue(aiPdfImport.providerProfileId);

  if (!sourceAssetId || !providerProfileId) {
    throw new Error("The queued PDF import is missing its safe source or provider reference.");
  }

  const operationKind: AIProviderRoutingOperationKind =
    aiPdfImport.executionMode === "blueprint_observation"
      ? "blueprint_observe_pdf"
      : "ai_pdf_extract";
  const route = await resolveAIProviderRoute({
    operationKind,
    organizationId: job.organization_id,
    requestedProfileId: providerProfileId,
    supabase,
  });

  const { data: sourceAsset, error: sourceAssetError } = await supabase
    .from("import_batch_assets")
    .select("id, batch_id, object_path, original_filename, status")
    .eq("id", sourceAssetId)
    .eq("batch_id", job.resource_id)
    .eq("asset_role", "source_pdf")
    .maybeSingle();
  if (sourceAssetError) throw new Error(sourceAssetError.message);
  if (!sourceAsset || sourceAsset.status !== "ready") {
    throw new Error("The private PDF source is no longer ready for extraction.");
  }

  const claimedResource = await claimAIPdfBatchResource({
    batch,
    job,
    providerProfileId: route.candidates[0]!.profile.id,
    sourceAssetId,
    supabase,
  });
  if (!claimedResource) {
    return {
      alreadyCompleted: true,
      createdCount: 0,
      reviewRoute: job.target_bank_id
        ? `/teacher/banks/${job.target_bank_id}/review`
        : "/admin/review",
      warningCount: 0,
    };
  }

  const { data: sourceBlob, error: downloadError } = await supabase.storage
    .from(AI_IMPORT_SOURCES_BUCKET)
    .download(sourceAsset.object_path);
  if (downloadError) throw new Error(downloadError.message);

  const input: AIPdfProcessInput = {
    batchId: job.resource_id,
    chunkIndex:
      typeof job.payload.chunkIndex === "number"
        ? job.payload.chunkIndex
        : undefined,
    fileName: sourceAsset.original_filename,
    jobId: job.id,
    pdfBuffer: Buffer.from(await sourceBlob.arrayBuffer()),
    profileId: job.created_by,
    providerProfileId: route.candidates[0]!.profile.id,
    routingLeaseOwner: `${leaseOwner}:${job.id}`,
    routingOrganizationId: job.organization_id,
    sourceAssetId,
    sourceObjectPath: sourceAsset.object_path,
    supabase,
    targetBankId: job.target_bank_id,
  };

  try {
    const routed = await runWithAIProviderRoute({
      execute: (provider) =>
        processAIPdfImport({
          ...input,
          providerProfileId: provider.id,
        }),
      leaseOwner: `${leaseOwner}:${job.id}`,
      route,
      supabase,
    });
    const importSummary = routed.value;
    const importResult = asRecord(importSummary);
    const createdCount = numberValue(importResult.createdCount);
    return {
      createdCount,
      fallbackUsed: routed.fallbackUsed,
      reviewRoute: job.target_bank_id
        ? `/teacher/banks/${job.target_bank_id}/review`
        : "/admin/review",
      warningCount: numberValue(importResult.warningCount),
    };
  } catch (error) {
    await recordAIPdfProviderFailure({ error, input });
    throw error;
  }
}

async function runBlueprintGenerateQuestionsJob({
  job,
  leaseOwner,
  supabase,
}: {
  job: AIProviderJob;
  leaseOwner: string;
  supabase: SupabaseWorkerClient;
}) {
  await ensureBankIsActive({
    bankId: job.target_bank_id,
    profileId: job.created_by,
    supabase,
  });

  const { data: blueprint, error } = await supabase
    .from("question_blueprints")
    .select("*")
    .eq("id", job.resource_id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!blueprint || blueprint.generation_ready !== true) {
    throw new Error("This Blueprint is no longer generation-ready.");
  }
  if (blueprint.source_bank_id !== job.target_bank_id) {
    throw new Error("This Blueprint is no longer linked to the queued target Library.");
  }

  const { data: existingBatches, error: existingBatchesError } = await supabase
    .from("import_batches")
    .select("id, status, summary")
    .eq("target_bank_id", job.target_bank_id)
    .eq("source_type", "course_builder")
    .order("created_at", { ascending: false })
    .limit(20);
  if (existingBatchesError) throw new Error(existingBatchesError.message);

  const completedBatch = (existingBatches ?? []).find((batch: any) => {
    const generation = asRecord(asRecord(batch.summary).blueprintGeneration);
    return (
      batch.status === "imported" &&
      generation.durableJobId === job.id
    );
  });

  if (completedBatch) {
    const generation = asRecord(asRecord(completedBatch.summary).blueprintGeneration);
    return {
      createdCount: numberValue(generation.createdDraftCount),
      reviewRoute: `/teacher/banks/${job.target_bank_id}/review`,
      warningCount: numberValue(generation.warningCount),
    };
  }

  const result = await generateTeacherBlueprintReviewDrafts({
    blueprint,
    profileId: job.created_by,
    queueJobId: job.id,
    routingLeaseOwner: `${leaseOwner}:${job.id}`,
    routingOrganizationId: job.organization_id,
    supabase,
  });

  return {
    createdCount: result.createdDraftCount,
    fallbackUsed: result.fallbackUsed,
    reviewRoute: result.reviewRoute,
    warningCount: result.warningCount,
  };
}

async function executeClaimedJob({
  job,
  leaseOwner,
  supabase,
}: {
  job: AIProviderJob;
  leaseOwner: string;
  supabase: SupabaseWorkerClient;
}): Promise<"completed" | "failed" | "retry_wait"> {
  await markProcessing({ job, leaseOwner, supabase });
  const heartbeat = setInterval(() => {
    void markProcessing({ job, leaseOwner, supabase }).catch(() => undefined);
  }, 60_000);
  heartbeat.unref?.();

  try {
    const result =
      job.job_kind === "ai_pdf_extract"
        ? await runAIPdfExtractJob({ job, leaseOwner, supabase })
        : await runBlueprintGenerateQuestionsJob({ job, leaseOwner, supabase });

    const finished = await finishJob({
      job,
      leaseOwner,
      safeResult: {
        createdDraftCount: result.createdCount,
        fallbackUsed: result.fallbackUsed ?? false,
        reviewRoute: result.reviewRoute,
        warningCount: result.warningCount,
      },
      status: "completed",
      supabase,
    });

    if (!finished) return "failed";
    return "completed";
  } catch (error) {
    const classified = classifyAIProviderError({
      error,
      operation:
        job.job_kind === "ai_pdf_extract"
          ? "ai_pdf_extraction"
          : "blueprint_generation",
    });
    const safe = safeAIProviderErrorState({ error: classified });
    const canRetry =
      classified.retryable &&
      job.execution_attempt_count < job.max_execution_attempts &&
      queueRetryDelayMs(job.execution_attempt_count) !== null;

    const finished = await finishJob({
      job,
      leaseOwner,
      providerAttemptCount: classified.attemptCount,
      safeErrorCode: safe.safeErrorCode,
      safeMessage: canRetry
        ? "The AI service is temporarily busy. Your work is safe and will retry automatically."
        : safeWorkerFailureMessage(),
      status: canRetry ? "retry_wait" : "failed",
      supabase,
    });

    return finished ? (canRetry ? "retry_wait" : "failed") : "failed";
  } finally {
    clearInterval(heartbeat);
  }
}

export async function runDurableAIProviderJobs({
  limit = 1,
  supabase = createServiceRoleClient(),
  workerId = `ai-worker-${randomUUID()}`,
}: {
  limit?: number;
  supabase?: SupabaseWorkerClient;
  workerId?: string;
} = {}): Promise<WorkerSummary> {
  const boundedLimit = Math.max(1, Math.min(limit, 3));
  const { data, error } = await supabase.rpc("claim_ai_provider_jobs", {
    p_lease_owner: workerId,
    p_lease_seconds: 900,
    p_limit: boundedLimit,
  });
  if (error) throw new Error(error.message);

  const jobs = (Array.isArray(data) ? data : []).map(normalizeJob);
  const summary: WorkerSummary = {
    claimed: jobs.length,
    completed: 0,
    failed: 0,
    retryWaiting: 0,
  };

  for (const job of jobs) {
    const state = await executeClaimedJob({ job, leaseOwner: workerId, supabase });
    if (state === "completed") summary.completed += 1;
    if (state === "retry_wait") summary.retryWaiting += 1;
    if (state === "failed") summary.failed += 1;
  }

  return summary;
}
