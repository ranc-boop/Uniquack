import "server-only";

import { createHash, randomUUID } from "node:crypto";

import {
  AIProviderError,
  classifyAIProviderError,
  safeAIProviderErrorState,
} from "@/lib/ai-providers/errors";
import {
  createAIProviderExecutionBudget,
  type AIProviderExecutionBudget,
  type AIProviderExecutionSummary,
} from "@/lib/ai-providers/execution-budget";
import {
  resolveAIProviderRoute,
  runWithAIProviderRoute,
  type AIProviderRoutingOperationKind,
} from "@/lib/ai-providers/routing";
import { queueRetryDelayMs } from "@/lib/ai-jobs/policy";
import {
  PDF50_PROVIDER_TEST_INTERRUPTION_AFTER_CHECKPOINT,
  type TrustedAIProviderTestInterruption,
  type TrustedAIProviderTestLimits,
} from "@/lib/ai-jobs/provider-test-control";
import type { AIProviderJob } from "@/lib/ai-jobs/types";
import {
  AIProviderJobFenceLostError,
  STALE_FENCE_REJECTED,
  beginAIProviderJobPdfProcessing,
  checkpointAIProviderJobProviderResult,
  checkpointAIProviderJobStage,
  finishAIProviderJobFence,
  persistenceFenceForJob,
  heartbeatAIProviderJobFence,
  loadAIProviderJobProviderResult,
} from "@/lib/ai-jobs/checkpoint";
import {
  getAIWorkerOperationsControl,
  recordAIOperationTelemetry,
  type AIOperationExecutionMetadata,
} from "@/lib/ai-operations/telemetry";
import {
  processAIPdfCoverageRecovery,
  processAIPdfImport,
  parseAIPdfProviderResultCheckpoint,
  AI_PDF_PROVIDER_RESULT_CHECKPOINT_CONTRACT_VERSION,
  recordAIPdfCoverageRecoveryFailure,
  recordAIPdfProviderFailure,
  type AIPdfProcessInput,
} from "@/lib/ai-pdf-import/service";
import { AI_IMPORT_SOURCES_BUCKET } from "@/lib/ai-pdf-import/constants";
import { createAIPdfQualityObservatory } from "@/lib/ai-pdf-import/quality-observatory";
import { releaseAIPdfBurstAdmissionJobs } from "@/lib/ai-pdf-import/burst-admission";
import {
  getAIPdfBatchFinalizationFailure,
  getAIPdfPostPersistenceFailureStage,
} from "@/lib/ai-pdf-import/post-persistence";
import { generateTeacherBlueprintReviewDrafts } from "@/lib/teacher-blueprint-generation";
import { createServiceRoleClient } from "@/lib/supabase/server";

// The queue migration is forward-only, so keep its ungenerated RPC boundary
// narrow until database types are regenerated from the applied clean schema.
type SupabaseWorkerClient = any;

type WorkerSummary = {
  claimed: number;
  completed: number;
  failed: number;
  providerCleanupFailures: number;
  providerCleanupRequests: number;
  providerInferenceAttempts: number;
  providerInferenceRequests: number;
  providerNetworkRequests: number;
  providerPollRequests: number;
  providerUploadRequests: number;
  retryWaiting: number;
};

type WorkerJobState = {
  providerExecution: AIProviderExecutionSummary;
  status: "completed" | "failed" | "retry_wait";
};

type WorkerExecutionResult = {
  alreadyCompleted?: boolean;
  createdCount: number;
  fallbackUsed?: boolean;
  recoveryCandidateCount?: number;
  recoveryPageCount?: number;
  recoveryReconciliation?: Record<string, number>;
  recoveryWindowCount?: number;
  reviewRoute: string;
  telemetry?: AIOperationExecutionMetadata;
  warningCount?: number;
};

async function countActiveJobs(
  supabase: SupabaseWorkerClient,
  configure: (query: any) => any = (query) => query,
) {
  const result = await configure(
    supabase
      .from("ai_provider_jobs")
      .select("id", { count: "exact", head: true })
      .in("status", ["leased", "processing"]),
  );
  if (result.error) {
    throw new Error("trusted_provider_test_claim_capacity_failed");
  }
  return Number(result.count ?? 0);
}

async function claimTrustedProviderTestJob({
  jobId,
  leaseOwner,
  supabase,
}: {
  jobId: string;
  leaseOwner: string;
  supabase: SupabaseWorkerClient;
}) {
  const { data: candidateValue, error: candidateError } = await supabase
    .from("ai_provider_jobs")
    .select("*")
    .eq("id", jobId)
    .maybeSingle();
  if (candidateError) {
    throw new Error("trusted_provider_test_claim_read_failed");
  }
  if (!candidateValue) return [];

  const candidate = normalizeJob(candidateValue);
  const now = new Date();
  if (
    candidate.job_kind !== "ai_pdf_extract" ||
    !["queued", "retry_wait"].includes(candidate.status) ||
    new Date(candidate.available_at).getTime() > now.getTime() ||
    candidate.execution_attempt_count >= candidate.max_execution_attempts
  ) {
    return [];
  }

  const [activeGlobal, activePdf, activeOrganization] = await Promise.all([
    countActiveJobs(supabase),
    countActiveJobs(supabase, (query) => query.eq("job_kind", "ai_pdf_extract")),
    countActiveJobs(supabase, (query) =>
      query.eq("organization_id", candidate.organization_id),
    ),
  ]);
  if (activeGlobal > 0 || activePdf > 0 || activeOrganization > 0) return [];

  const leasedAt = now.toISOString();
  const { data: claimedValue, error: claimError } = await supabase
    .from("ai_provider_jobs")
    .update({
      available_at: candidate.available_at,
      execution_attempt_count: candidate.execution_attempt_count + 1,
      last_heartbeat_at: leasedAt,
      lease_acquired_at: leasedAt,
      lease_expires_at: new Date(now.getTime() + 900_000).toISOString(),
      lease_owner: leaseOwner,
      retryable: false,
      safe_error_code: null,
      safe_message: null,
      started_at: candidate.started_at ?? leasedAt,
      status: "leased",
    })
    .eq("id", candidate.id)
    .eq("status", candidate.status)
    .eq("execution_attempt_count", candidate.execution_attempt_count)
    .eq("available_at", candidate.available_at)
    .select("*")
    .maybeSingle();
  if (claimError) {
    throw new Error("trusted_provider_test_claim_update_failed");
  }
  if (!claimedValue) return [];

  const claimed = normalizeJob(claimedValue);
  if (
    claimed.lease_owner !== leaseOwner ||
    !claimed.execution_fence_token ||
    claimed.lease_generation <= candidate.lease_generation
  ) {
    throw new Error("trusted_provider_test_claim_fence_missing");
  }
  return [claimed];
}

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
  await heartbeatAIProviderJobFence({
    job: { ...job, lease_owner: leaseOwner },
    leaseSeconds: 900,
    supabase,
  });
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
  const result = await finishAIProviderJobFence({
    availableAt,
    job: { ...job, lease_owner: leaseOwner },
    providerAttemptCount,
    retryable: status === "retry_wait",
    safeErrorCode,
    safeMessage,
    safeResult,
    status,
    supabase,
  });
  return result === "APPLIED" || result === "NOOP_ALREADY_CHECKPOINTED";
}

function buildPdfPersistenceLineageKey({
  job,
  sourceAssetId,
}: {
  job: AIProviderJob;
  sourceAssetId: string;
}) {
  const digest = createHash("sha256")
    .update(
      [
        "ai-pdf-review-drafts",
        sourceAssetId,
        job.id,
        String(AI_PDF_PROVIDER_RESULT_CHECKPOINT_CONTRACT_VERSION),
      ].join("\u0000"),
    )
    .digest("hex");
  return `pdf50:${digest}`;
}

function checkpointPayloadSha256(payload: Record<string, unknown>) {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

class TrustedProviderCheckpointInterruptionError extends AIProviderError {
  constructor() {
    super({
      code: "provider_network_error",
      operation: "ai_pdf_extraction",
      retryable: true,
      safeMessage:
        "The trusted qualification runner interrupted after preserving the Provider result.",
    });
    this.name = "TrustedProviderCheckpointInterruptionError";
  }
}

async function runAIPdfExtractJob({
  job,
  leaseOwner,
  maxProviderCalls = 4,
  providerExecution,
  providerTestInterruption = null,
  selectiveExecutionEnabled = false,
  supabase,
}: {
  job: AIProviderJob;
  leaseOwner: string;
  maxProviderCalls?: number;
  providerExecution: AIProviderExecutionBudget;
  providerTestInterruption?: TrustedAIProviderTestInterruption | null;
  selectiveExecutionEnabled?: boolean;
  supabase: SupabaseWorkerClient;
}): Promise<WorkerExecutionResult> {
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
    await checkpointAIProviderJobStage({
      job: { ...job, lease_owner: leaseOwner },
      metadata: { recoveryClassification: "already_persisted" },
      stage: "drafts_persisted",
      supabase,
    });
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

  const fencedJob = { ...job, lease_owner: leaseOwner };
  await checkpointAIProviderJobStage({
    job: fencedJob,
    metadata: { sourceAssetReady: true, targetBankScoped: Boolean(job.target_bank_id) },
    stage: "source_validated",
    supabase,
  });

  const beginResult = await beginAIProviderJobPdfProcessing({
    job: fencedJob,
    providerProfileId: route.candidates[0]!.profile.id,
    sourceAssetId,
    supabase,
  });
  if (beginResult === "NOOP_ALREADY_PERSISTED") {
    await checkpointAIProviderJobStage({
      job: fencedJob,
      metadata: { recoveryClassification: "already_persisted" },
      stage: "drafts_persisted",
      supabase,
    });
    return {
      alreadyCompleted: true,
      createdCount: 0,
      reviewRoute: job.target_bank_id
        ? `/teacher/banks/${job.target_bank_id}/review`
        : "/admin/review",
      warningCount: 0,
    };
  }

  await checkpointAIProviderJobStage({
    job: fencedJob,
    metadata: { recoveryClassification: "provider_required" },
    stage: "provider_request_started",
    supabase,
  });

  const storedProviderCheckpoint = await loadAIProviderJobProviderResult({
    job: fencedJob,
    supabase,
  });
  const providerResultCheckpoint = storedProviderCheckpoint
    ? parseAIPdfProviderResultCheckpoint(storedProviderCheckpoint.payload)
    : undefined;
  if (storedProviderCheckpoint && !providerResultCheckpoint) {
    throw new Error("The protected provider result checkpoint is incompatible and cannot be replayed.");
  }

  const { data: sourceBlob, error: downloadError } = await supabase.storage
    .from(AI_IMPORT_SOURCES_BUCKET)
    .download(sourceAsset.object_path);
  if (downloadError) throw new Error(downloadError.message);
  const qualityObserver = createAIPdfQualityObservatory();

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
    selectiveExecutionEnabled,
    providerResultCheckpoint: providerResultCheckpoint ?? undefined,
    persistenceFence: persistenceFenceForJob(fencedJob),
    persistenceLineageKey: buildPdfPersistenceLineageKey({ job, sourceAssetId }),
    providerExecutionObserver: providerExecution,
    qualityObserver,
    onProviderResultCheckpoint: async (checkpoint) => {
      const payload = checkpoint as unknown as Record<string, unknown>;
      await checkpointAIProviderJobProviderResult({
        job: fencedJob,
        outputContractVersion: AI_PDF_PROVIDER_RESULT_CHECKPOINT_CONTRACT_VERSION,
        payload,
        payloadSha256: checkpointPayloadSha256(payload),
        supabase,
      });
      if (
        providerTestInterruption ===
        PDF50_PROVIDER_TEST_INTERRUPTION_AFTER_CHECKPOINT
      ) {
        throw new TrustedProviderCheckpointInterruptionError();
      }
    },
    onCheckpointStage: async (stage, metadata) => {
      await checkpointAIProviderJobStage({
        job: fencedJob,
        metadata: metadata ?? {},
        stage,
        supabase,
      });
    },
    sourceAssetId,
    sourceObjectPath: sourceAsset.object_path,
    supabase,
    targetBankId: job.target_bank_id,
  };
  const usageSamples: NonNullable<AIOperationExecutionMetadata["usageSamples"]> = [];
  input.onProviderUsage = (usage) => usageSamples.push(usage);

  try {
    const providerStartedAt = Date.now();
    const routed = await runWithAIProviderRoute({
      execute: (provider, attemptBudget) =>
        processAIPdfImport({
          ...input,
          providerProfileId: provider.id,
          providerRouteCandidateIndex: attemptBudget.candidateIndex,
          providerRetryMaxAttempts: attemptBudget.maxAttempts,
        }),
      leaseOwner: `${leaseOwner}:${job.id}`,
      maxTotalAttempts: maxProviderCalls,
      route,
      supabase,
    });
    const importSummary = routed.value;
    const importResult = asRecord(importSummary);
    const createdCount = numberValue(importResult.createdCount);
    const routeCandidate = route.candidates.find(
      (candidate) => candidate.profile.id === routed.profile.id,
    );
    const providerExecutionSummary = providerExecution.snapshot();
    return {
      createdCount,
      fallbackUsed: routed.fallbackUsed,
      reviewRoute: job.target_bank_id
        ? `/teacher/banks/${job.target_bank_id}/review`
        : "/admin/review",
      warningCount: numberValue(importResult.warningCount),
      telemetry: {
        circuitOutcome:
          routeCandidate?.mode === "half_open_probe"
            ? "half_open_probe"
            : routed.fallbackUsed
              ? "fallback"
              : "closed",
        fallbackUsed: routed.fallbackUsed,
        model: routed.profile.model,
        provider: routed.profile.provider,
        providerCallCount: providerExecutionSummary.providerInferenceRequests,
        providerLatencyMs: Date.now() - providerStartedAt,
        providerProfileId: routed.profile.id,
        providerRetryAttempts: Math.max(
          0,
          providerExecutionSummary.providerInferenceAttempts - 1,
        ),
        routePolicyVersion: route.policy?.policyVersion ?? null,
        routePosition: routeCandidate?.routeOrder ?? null,
        usageSamples,
      },
    };
  } catch (error) {
    // A superseded lease cannot write a batch failure after recovery has
    // started under a newer fence.
    if (
      !(error instanceof AIProviderJobFenceLostError) &&
      !(error instanceof TrustedProviderCheckpointInterruptionError) &&
      !(error instanceof Error && error.message === STALE_FENCE_REJECTED)
    ) {
      await recordAIPdfProviderFailure({ error, input });
    }
    throw error;
  }
}

async function runAIPdfCoverageRecoveryJob({
  job,
  leaseOwner,
  maxProviderCalls = 4,
  providerExecution,
  supabase,
}: {
  job: AIProviderJob;
  leaseOwner: string;
  maxProviderCalls?: number;
  providerExecution: AIProviderExecutionBudget;
  supabase: SupabaseWorkerClient;
}): Promise<WorkerExecutionResult> {
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
  await ensureBankIsActive({
    bankId: job.target_bank_id,
    profileId: job.created_by,
    supabase,
  });

  const summary = asRecord(batch.summary);
  const aiPdfImport = asRecord(summary.aiPdfImport);
  const sourceAssetId = stringValue(job.payload.sourceAssetId);
  const recoveryPlanHash = stringValue(job.payload.recoveryPlanHash);
  const recoveryWindowIds = Array.isArray(job.payload.windowIds)
    ? job.payload.windowIds.filter((value): value is string => typeof value === "string" && Boolean(value.trim()))
    : [];
  const providerProfileId = job.provider_profile_id;
  if (!sourceAssetId || !recoveryPlanHash || !recoveryWindowIds.length || !providerProfileId) {
    throw new Error("The queued coverage recovery is missing its safe execution references.");
  }

  const { data: sourceAsset, error: sourceAssetError } = await supabase
    .from("import_batch_assets")
    .select("id, batch_id, object_path, original_filename, status")
    .eq("id", sourceAssetId)
    .eq("batch_id", job.resource_id)
    .eq("asset_role", "source_pdf")
    .maybeSingle();
  if (sourceAssetError) throw new Error(sourceAssetError.message);
  if (!sourceAsset || sourceAsset.status !== "ready") {
    throw new Error("The private PDF source is no longer ready for targeted recovery.");
  }

  const fencedJob = { ...job, lease_owner: leaseOwner };
  await checkpointAIProviderJobStage({
    job: fencedJob,
    metadata: { sourceAssetReady: true, targetedRecovery: true },
    stage: "source_validated",
    supabase,
  });

  const route = await resolveAIProviderRoute({
    operationKind: "ai_pdf_extract",
    organizationId: job.organization_id,
    requestedProfileId: providerProfileId,
    supabase,
  });
  await checkpointAIProviderJobStage({
    job: fencedJob,
    metadata: { recoveryClassification: "provider_required" },
    stage: "provider_request_started",
    supabase,
  });
  const { data: sourceBlob, error: downloadError } = await supabase.storage
    .from(AI_IMPORT_SOURCES_BUCKET)
    .download(sourceAsset.object_path);
  if (downloadError) throw new Error(downloadError.message);

  const usageSamples: NonNullable<AIOperationExecutionMetadata["usageSamples"]> = [];
  const providerStartedAt = Date.now();
  const qualityObserver = createAIPdfQualityObservatory();
  const input = {
    batchId: job.resource_id,
    fileName: sourceAsset.original_filename,
    jobId: job.id,
    originalBatchId: job.resource_id,
    pdfBuffer: Buffer.from(await sourceBlob.arrayBuffer()),
    profileId: job.created_by,
    providerProfileId,
    providerExecutionObserver: providerExecution,
    qualityObserver,
    recoveryPlanHash,
    recoveryWindowIds,
    routingLeaseOwner: `${leaseOwner}:${job.id}`,
    routingOrganizationId: job.organization_id,
    sourceAssetId,
    sourceObjectPath: sourceAsset.object_path,
    supabase,
    targetBankId: job.target_bank_id,
    onProviderUsage: (usage: any) => usageSamples.push(usage),
  };

  try {
    const routed = await runWithAIProviderRoute({
      execute: (provider, attemptBudget) =>
        processAIPdfCoverageRecovery({
          ...input,
          providerProfileId: provider.id,
          providerRouteCandidateIndex: attemptBudget.candidateIndex,
          providerRetryMaxAttempts: attemptBudget.maxAttempts,
        }),
      leaseOwner: `${leaseOwner}:${job.id}`,
      maxTotalAttempts: maxProviderCalls,
      route,
      supabase,
    });
    const routeCandidate = route.candidates.find(
      (candidate) => candidate.profile.id === routed.profile.id,
    );
    const providerExecutionSummary = providerExecution.snapshot();
    await checkpointAIProviderJobStage({
      job: fencedJob,
      metadata: {
        createdDraftCount: routed.value.recoveredDraftCount,
        recoveryClassification: "coverage_recovery_persisted",
      },
      stage: "drafts_persisted",
      supabase,
    });
    return {
      createdCount: routed.value.recoveredDraftCount,
      fallbackUsed: routed.fallbackUsed,
      recoveryCandidateCount: routed.value.recoveryCandidateCount,
      recoveryPageCount: routed.value.recoveryPageCount,
      recoveryReconciliation: routed.value.reconciliation,
      recoveryWindowCount: routed.value.recoveryWindowCount,
      reviewRoute: routed.value.reviewRoute,
      warningCount: routed.value.warningCount,
      telemetry: {
        circuitOutcome:
          routeCandidate?.mode === "half_open_probe"
            ? "half_open_probe"
            : routed.fallbackUsed
              ? "fallback"
              : "closed",
        fallbackUsed: routed.fallbackUsed,
        model: routed.profile.model,
        provider: routed.profile.provider,
        providerCallCount: providerExecutionSummary.providerInferenceRequests,
        providerLatencyMs: Date.now() - providerStartedAt,
        providerProfileId: routed.profile.id,
        providerRetryAttempts: Math.max(
          0,
          providerExecutionSummary.providerInferenceAttempts - 1,
        ),
        routePolicyVersion: route.policy?.policyVersion ?? null,
        routePosition: routeCandidate?.routeOrder ?? null,
        usageSamples,
      },
    };
  } catch (error) {
    await recordAIPdfCoverageRecoveryFailure({ error, input });
    throw error;
  }
}

async function runBlueprintGenerateQuestionsJob({
  job,
  leaseOwner,
  maxProviderCalls = 4,
  providerExecution,
  supabase,
}: {
  job: AIProviderJob;
  leaseOwner: string;
  maxProviderCalls?: number;
  providerExecution: AIProviderExecutionBudget;
  supabase: SupabaseWorkerClient;
}): Promise<WorkerExecutionResult> {
  const fencedJob = { ...job, lease_owner: leaseOwner };
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
    await checkpointAIProviderJobStage({
      job: fencedJob,
      metadata: { recoveryClassification: "already_persisted" },
      stage: "drafts_persisted",
      supabase,
    });
    const generation = asRecord(asRecord(completedBatch.summary).blueprintGeneration);
    return {
      createdCount: numberValue(generation.createdDraftCount),
      reviewRoute: `/teacher/banks/${job.target_bank_id}/review`,
      warningCount: numberValue(generation.warningCount),
    };
  }

  const usageSamples: NonNullable<AIOperationExecutionMetadata["usageSamples"]> = [];
  await checkpointAIProviderJobStage({
    job: fencedJob,
    metadata: { blueprintValidated: true },
    stage: "source_validated",
    supabase,
  });
  await checkpointAIProviderJobStage({
    job: fencedJob,
    metadata: { recoveryClassification: "provider_required" },
    stage: "provider_request_started",
    supabase,
  });
  const providerStartedAt = Date.now();
  const result = await generateTeacherBlueprintReviewDrafts({
    blueprint,
    executionObserver: providerExecution,
    profileId: job.created_by,
    queueJobId: job.id,
    routingLeaseOwner: `${leaseOwner}:${job.id}`,
    routingOrganizationId: job.organization_id,
    onProviderUsage: (usage) => usageSamples.push(usage),
    providerMaxAttempts: maxProviderCalls,
    supabase,
  });

  await checkpointAIProviderJobStage({
    job: fencedJob,
    metadata: { createdDraftCount: result.createdDraftCount },
    stage: "drafts_persisted",
    supabase,
  });

  const providerExecutionSummary = providerExecution.snapshot();

  return {
    createdCount: result.createdDraftCount,
    fallbackUsed: result.fallbackUsed,
    reviewRoute: result.reviewRoute,
    warningCount: result.warningCount,
    telemetry: {
      circuitOutcome: result.fallbackUsed ? "fallback" : "closed",
      fallbackUsed: result.fallbackUsed,
      model: result.safeProviderModel ?? null,
      provider: result.providerSafeName ?? null,
      providerCallCount: providerExecutionSummary.providerInferenceRequests,
      providerLatencyMs: Date.now() - providerStartedAt,
      providerProfileId: result.safeProviderId ?? null,
      providerRetryAttempts: Math.max(
        0,
        providerExecutionSummary.providerInferenceAttempts - 1,
      ),
      routePolicyVersion: result.providerRoutePolicyVersion ?? null,
      routePosition: result.providerRoutePosition ?? null,
      usageSamples,
    },
  };
}

async function executeClaimedJob({
  job,
  leaseOwner,
  maxProviderCalls = 4,
  providerTestInterruption = null,
  providerTestLimits,
  selectiveExecutionEnabled = false,
  supabase,
}: {
  job: AIProviderJob;
  leaseOwner: string;
  maxProviderCalls?: number;
  providerTestInterruption?: TrustedAIProviderTestInterruption | null;
  providerTestLimits?: TrustedAIProviderTestLimits | null;
  selectiveExecutionEnabled?: boolean;
  supabase: SupabaseWorkerClient;
}): Promise<WorkerJobState> {
  const executionStartedAt = Date.now();
  const providerExecution = createAIProviderExecutionBudget({
    maxInferenceAttempts: Math.min(
      maxProviderCalls,
      providerTestLimits?.maxInferenceAttempts ?? maxProviderCalls,
    ),
    maxInputBytes: providerTestLimits?.maxInputBytes,
    maxNetworkRequests: providerTestLimits?.maxNetworkRequests,
    maxOutputTokens: providerTestLimits?.maxOutputTokens,
  });
  await markProcessing({ job, leaseOwner, supabase });
  const heartbeat = setInterval(() => {
    void markProcessing({ job, leaseOwner, supabase }).catch(() => undefined);
  }, 60_000);
  heartbeat.unref?.();

  try {
    const result =
      job.job_kind === "ai_pdf_extract"
        ? await runAIPdfExtractJob({
            job,
            leaseOwner,
            maxProviderCalls,
            providerExecution,
            providerTestInterruption,
            selectiveExecutionEnabled,
            supabase,
          })
        : job.job_kind === "ai_pdf_coverage_recovery"
          ? await runAIPdfCoverageRecoveryJob({
              job,
              leaseOwner,
              maxProviderCalls,
              providerExecution,
              supabase,
            })
          : await runBlueprintGenerateQuestionsJob({
              job,
              leaseOwner,
              maxProviderCalls,
              providerExecution,
              supabase,
            });

    const providerExecutionSummary = providerExecution.snapshot();

    const finished = await finishJob({
      job,
      leaseOwner,
      providerAttemptCount: providerExecutionSummary.providerInferenceAttempts,
      safeResult: {
        createdDraftCount: result.createdCount,
        fallbackUsed: result.fallbackUsed ?? false,
        recoveryCandidateCount: result.recoveryCandidateCount ?? null,
        recoveryPagesPlanned: result.recoveryPageCount ?? null,
        recoveryPagesSent: result.recoveryPageCount ?? null,
        recoveryReconciliation: result.recoveryReconciliation ?? {},
        recoveryWindowCount: result.recoveryWindowCount ?? null,
        zeroNewDrafts:
          job.job_kind === "ai_pdf_coverage_recovery" && result.createdCount === 0,
        reviewRoute: result.reviewRoute,
        providerCleanupFailures: providerExecutionSummary.providerCleanupFailures,
        providerCleanupRequests: providerExecutionSummary.providerCleanupRequests,
        providerInputBytesMax: providerExecutionSummary.providerInputBytesMax,
        providerInferenceAttempts: providerExecutionSummary.providerInferenceAttempts,
        providerInferenceRequests: providerExecutionSummary.providerInferenceRequests,
        providerNetworkRequests: providerExecutionSummary.providerNetworkRequests,
        providerPollRequests: providerExecutionSummary.providerPollRequests,
        providerUploadRequests: providerExecutionSummary.providerUploadRequests,
        warningCount: result.warningCount,
      },
      status: "completed",
      supabase,
    });

    if (!finished) {
      return { providerExecution: providerExecutionSummary, status: "failed" };
    }
    await recordAIOperationTelemetry({
      draftsCreated: result.createdCount,
      executionStartedAt,
      finalStatus: "completed",
      job,
      metadata: result.telemetry,
      supabase,
    }).catch(() => undefined);
    return { providerExecution: providerExecutionSummary, status: "completed" };
  } catch (error) {
    const providerExecutionSummary = providerExecution.snapshot();
    const postPersistenceFailureStage =
      getAIPdfPostPersistenceFailureStage(error);
    const batchFinalizationFailure = getAIPdfBatchFinalizationFailure(error);
    const classified = classifyAIProviderError({
      error,
      operation:
        job.job_kind === "ai_pdf_extract" || job.job_kind === "ai_pdf_coverage_recovery"
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
      providerAttemptCount: providerExecutionSummary.providerInferenceAttempts,
      safeErrorCode: safe.safeErrorCode,
      safeMessage: canRetry
        ? "The AI service is temporarily busy. Your work is safe and will retry automatically."
        : safeWorkerFailureMessage(),
      safeResult: {
        batchFinalizationFailureReason: batchFinalizationFailure?.reason ?? null,
        batchFinalizationSummaryBytes:
          batchFinalizationFailure?.summaryBytes ?? null,
        postPersistenceFailureStage,
        providerCleanupFailures: providerExecutionSummary.providerCleanupFailures,
        providerCleanupRequests: providerExecutionSummary.providerCleanupRequests,
        providerInputBytesMax: providerExecutionSummary.providerInputBytesMax,
        providerInferenceAttempts: providerExecutionSummary.providerInferenceAttempts,
        providerInferenceRequests: providerExecutionSummary.providerInferenceRequests,
        providerNetworkRequests: providerExecutionSummary.providerNetworkRequests,
        providerPollRequests: providerExecutionSummary.providerPollRequests,
        providerUploadRequests: providerExecutionSummary.providerUploadRequests,
      },
      status: canRetry ? "retry_wait" : "failed",
      supabase,
    });

    await recordAIOperationTelemetry({
      draftsCreated: 0,
      executionStartedAt,
      finalStatus: canRetry ? "retry_wait" : "failed",
      job,
      metadata: {
        circuitOutcome: [
          "provider_busy",
          "provider_rate_limited",
          "provider_timeout",
          "provider_network_error",
        ].includes(classified.code)
          ? "unavailable"
          : "closed",
        providerCallCount: providerExecutionSummary.providerInferenceRequests,
        providerRetryAttempts: Math.max(
          0,
          providerExecutionSummary.providerInferenceAttempts - 1,
        ),
      },
      safeErrorCode: safe.safeErrorCode,
      supabase,
    }).catch(() => undefined);

    return {
      providerExecution: providerExecutionSummary,
      status: finished ? (canRetry ? "retry_wait" : "failed") : "failed",
    };
  } finally {
    clearInterval(heartbeat);
  }
}

export async function runDurableAIProviderJobs({
  limit = 1,
  providerTestInterruption = null,
  providerTestLimits = null,
  supabase = createServiceRoleClient(),
  targetJobId = null,
  workerId = `ai-worker-${randomUUID()}`,
}: {
  limit?: number;
  providerTestInterruption?: TrustedAIProviderTestInterruption | null;
  providerTestLimits?: TrustedAIProviderTestLimits | null;
  supabase?: SupabaseWorkerClient;
  targetJobId?: string | null;
  workerId?: string;
} = {}): Promise<WorkerSummary> {
  const control = await getAIWorkerOperationsControl(supabase);
  const summary: WorkerSummary = {
    claimed: 0,
    completed: 0,
    failed: 0,
    providerCleanupFailures: 0,
    providerCleanupRequests: 0,
    providerInferenceAttempts: 0,
    providerInferenceRequests: 0,
    providerNetworkRequests: 0,
    providerPollRequests: 0,
    providerUploadRequests: 0,
    retryWaiting: 0,
  };
  if (control.pauseWorkerClaims) return summary;

  if (providerTestLimits && !targetJobId) {
    throw new Error("trusted_provider_test_target_required");
  }
  if (!providerTestLimits && targetJobId) {
    throw new Error("trusted_provider_test_target_without_limits");
  }
  if (providerTestInterruption && (!providerTestLimits || !targetJobId)) {
    throw new Error("trusted_provider_test_interruption_without_test_mode");
  }

  if (!providerTestLimits) {
    await releaseAIPdfBurstAdmissionJobs({ limit: 4, supabase });
  }

  const boundedLimit = Math.max(
    1,
    Math.min(limit, 2, control.maxJobsPerInvocation),
  );
  let jobs: AIProviderJob[];
  if (providerTestLimits && targetJobId) {
    jobs = await claimTrustedProviderTestJob({
      jobId: targetJobId,
      leaseOwner: workerId,
      supabase,
    });
  } else {
    const { data, error } = await supabase.rpc("claim_ai_provider_jobs", {
      p_lease_owner: workerId,
      p_lease_seconds: 900,
      p_limit: boundedLimit,
    });
    if (error) throw new Error(error.message);
    jobs = (Array.isArray(data) ? data : []).map(normalizeJob);
  }
  summary.claimed = jobs.length;
  const states = await Promise.all(
    jobs.map((job) =>
      executeClaimedJob({
        job,
        leaseOwner: workerId,
        maxProviderCalls: control.maxProviderCallsPerExecution,
        providerTestInterruption,
        providerTestLimits,
        selectiveExecutionEnabled: control.selectiveExecutionEnabled,
        supabase,
      }),
    ),
  );

  for (const state of states) {
    if (state.status === "completed") summary.completed += 1;
    if (state.status === "retry_wait") summary.retryWaiting += 1;
    if (state.status === "failed") summary.failed += 1;
    summary.providerCleanupFailures += state.providerExecution.providerCleanupFailures;
    summary.providerCleanupRequests += state.providerExecution.providerCleanupRequests;
    summary.providerInferenceAttempts += state.providerExecution.providerInferenceAttempts;
    summary.providerInferenceRequests += state.providerExecution.providerInferenceRequests;
    summary.providerNetworkRequests += state.providerExecution.providerNetworkRequests;
    summary.providerPollRequests += state.providerExecution.providerPollRequests;
    summary.providerUploadRequests += state.providerExecution.providerUploadRequests;
  }

  if (!providerTestLimits) {
    await releaseAIPdfBurstAdmissionJobs({ limit: 4, supabase });
  }

  return summary;
}
