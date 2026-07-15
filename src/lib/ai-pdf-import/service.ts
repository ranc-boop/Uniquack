import { callAIPdfExtractionProvider } from "@/lib/ai-providers/chat";
import {
  generateWithGeminiNativePdf,
  type GeminiNativeUsage,
} from "@/lib/ai-providers/gemini-native";
import {
  AI_PDF_UNSUPPORTED_PROVIDER_MESSAGE,
  describeAiPdfProviderInput,
  supportsAIPdfSequentialChunkExtraction,
  type AiPdfInputStrategy,
} from "@/lib/ai-providers/adapters";
import { isMockAIProviderUrl } from "@/lib/ai-providers/mock";
import {
  listEnabledAIProviderProfilesForServerUse,
  loadAIProviderProfileForServerUse,
  loadSafeAIProviderProfileForServerUse,
} from "@/lib/ai-providers/profiles";
import {
  cropPdfPlaceholderImage,
  getPdfPageCount,
  renderPdfPages,
  type RenderedPage,
} from "@/lib/ai-pdf-import/pdf";
import { buildMaskedPdfChunk } from "@/lib/ai-pdf-import/masked-pdf";
import {
  normalizeManualSegmentationPlan,
  segmentChunkForIndex,
} from "@/lib/ai-pdf-import/segmentation";
import {
  AI_PDF_IMPORT_MAX_BYTES,
  AI_PDF_IMPORT_MAX_PAGES,
} from "@/lib/ai-pdf-import/constants";
import {
  formatAIPdfChunkPageRange,
  mergeAIPdfImportChunkingSummary,
  normalizeAIPdfChunkingSummary,
  patchAIPdfChunkingSummary,
  type AIPdfImportChunkSummary,
} from "@/lib/ai-pdf-import/chunking";
import {
  generateAIPdfQuestionCodeForImport,
  questionCodeKey,
  visibleQuestionNumberKey,
} from "@/lib/ai-pdf-import/question-code";
import {
  normalizeAIPdfExtractionResponse,
  type AIPdfAssetPlaceholder,
  type AIPdfExtraction,
  type AIPdfQuestion,
} from "@/lib/ai-pdf-import/schema";
import {
  failedPdfPreanalysis,
  generatePdfPreanalysis,
  mergeAIPreanalysisIntoSummary,
  type AIPreanalysisResult,
} from "@/lib/ai-pdf-import/preanalysis";
import type { AIPdfPreanalysisResult } from "@/lib/ai-pdf-import/preanalysis-core";
import {
  buildAIPacketPlanFromPreanalysis,
  failedPacketPlan,
  mergeAIPacketPlanIntoSummary,
  type AIPacketPlan,
} from "@/lib/ai-pdf-import/packets";
import {
  buildAIExtractionBatchPlanFromPacketPlan,
  failedAIExtractionBatchPlan,
  mergeAIExtractionBatchPlanIntoSummary,
  type AIExtractionBatchPlan,
} from "@/lib/ai-pdf-import/extraction-batches";
import {
  buildAISelectiveExecutionPlan,
  forceAISelectiveExecutionFallback,
  markAISelectiveExecutionMaterialized,
  mergeAISelectiveExecutionPlanIntoSummary,
  recordAISelectiveExecutionUsage,
  selectiveExecutionPlanToSegmentChunk,
  type AISelectiveExecutionPlan,
  type AISelectiveExecutionUsageSummary,
} from "@/lib/ai-pdf-import/selective-execution";
import {
  buildAIProviderRequestPlanFromExtractionBatchPlan,
  failedAIProviderRequestPlan,
  mergeAIProviderRequestPlanIntoSummary,
  type AIProviderRequestPlan,
} from "@/lib/ai-pdf-import/provider-requests";
import {
  buildAIProviderRunPlanFromProviderRequestPlan,
  failedAIProviderRunPlan,
  mergeAIProviderRunPlanIntoSummary,
  type AIProviderRunPlan,
} from "@/lib/ai-pdf-import/provider-runner";
import {
  buildAIAdaptiveRereadPlanFromSummary,
  failedAIAdaptiveRereadPlan,
  mergeAIAdaptiveRereadPlanIntoSummary,
  type AIAdaptiveRereadPlan,
} from "@/lib/ai-pdf-import/adaptive-reread";
import {
  buildAIAdaptiveRereadProviderRequestPlanFromAdaptiveRereadPlan,
  failedAIAdaptiveRereadProviderRequestPlan,
  mergeAIAdaptiveRereadProviderRequestPlanIntoSummary,
  type AIAdaptiveRereadProviderRequestPlan,
} from "@/lib/ai-pdf-import/adaptive-reread-provider-requests";
import {
  buildAIAdaptiveRereadRunPlanFromProviderRequestPlan,
  failedAIAdaptiveRereadRunPlan,
  mergeAIAdaptiveRereadRunPlanIntoSummary,
  type AIAdaptiveRereadRunPlan,
} from "@/lib/ai-pdf-import/adaptive-reread-runner";
import {
  buildAIAdaptiveRereadMergePlanFromSummary,
  failedAIAdaptiveRereadMergePlan,
  mergeAIAdaptiveRereadMergePlanIntoSummary,
  type AIAdaptiveRereadMergePlan,
} from "@/lib/ai-pdf-import/adaptive-reread-merge";
import {
  buildAITaggingV2PlanFromSummary,
  failedAITaggingV2Plan,
  mergeAITaggingV2PlanIntoSummary,
  taxonomyCatalogToAITagTaxonomy,
  type AITaggingV2Plan,
} from "@/lib/ai-pdf-import/tagging-v2";
import {
  buildAITaxonomyBootstrapPlanFromSummary,
  failedAITaxonomyBootstrapPlan,
  mergeAITaxonomyBootstrapPlanIntoSummary,
  type AITaxonomyBootstrapPlan,
} from "@/lib/ai-pdf-import/taxonomy-bootstrap";
import {
  buildAITaxonomyReviewPlanFromBootstrapPlan,
  failedAITaxonomyReviewPlan,
  mergeAITaxonomyReviewPlanIntoSummary,
  type AITaxonomyReviewPlan,
} from "@/lib/ai-pdf-import/taxonomy-review";
import {
  buildAITaxonomyPersistencePlanFromSummary,
  failedAITaxonomyPersistencePlan,
  mergeAITaxonomyPersistencePlanIntoSummary,
  type AITaxonomyPersistencePlan,
} from "@/lib/ai-pdf-import/taxonomy-persistence";
import {
  buildAITaxonomyTagTaxonomyPlan,
  failedAITaxonomyTagTaxonomyPlan,
  mergeAITaxonomyTagTaxonomyPlanIntoSummary,
  type AITaxonomyTagTaxonomyPlan,
} from "@/lib/ai-pdf-import/taxonomy-tag-taxonomy";
import {
  buildTaxonomyQuestionTaggingPlanFromSummary,
  failedTaxonomyQuestionTaggingPlan,
  mergeTaxonomyQuestionTaggingPlanIntoSummary,
  type AITaxonomyQuestionTaggingPlan,
} from "@/lib/ai-pdf-import/taxonomy-question-tagging";
import {
  buildTaxonomyTagReviewActionPlanFromSummary,
  failedTaxonomyTagReviewActionPlan,
  mergeTaxonomyTagReviewActionPlanIntoSummary,
  type AITaxonomyTagReviewActionPlan,
} from "@/lib/ai-pdf-import/taxonomy-tag-review-actions";
import { loadTaxonomyCatalog } from "@/lib/tags/taxonomy-db";
import {
  buildAIExtractionCoverageAuditPlanFromSummary,
  failedAIExtractionCoverageAuditPlan,
  mergeAIExtractionCoverageAuditPlanIntoSummary,
  type AIExtractionCoverageAuditPlan,
} from "@/lib/ai-pdf-import/extraction-coverage-audit";
import {
  buildAICoverageRecoveryPlanFromSummary,
  failedAICoverageRecoveryPlan,
  mergeAICoverageRecoveryPlanIntoSummary,
  type AICoverageRecoveryPlan,
} from "@/lib/ai-pdf-import/coverage-recovery";
import {
  buildAICoverageRecoveryExecutionPlan,
  classifyAICoverageRecoveryCandidate,
  type AICoverageRecoveryCandidateClassification,
} from "@/lib/ai-pdf-import/coverage-recovery-executor";
import {
  buildAICoverageRecoveryRunPlanFromSummary,
  failedAICoverageRecoveryRunPlan,
  mergeAICoverageRecoveryRunPlanIntoSummary,
  type AICoverageRecoveryRunPlan,
} from "@/lib/ai-pdf-import/coverage-recovery-runner";
import {
  buildAICoverageRecoveryMergePlanFromSummary,
  failedAICoverageRecoveryMergePlan,
  mergeAICoverageRecoveryMergePlanIntoSummary,
  type AICoverageRecoveryMergePlan,
} from "@/lib/ai-pdf-import/coverage-recovery-merge";
import {
  buildQuestionBoundaryGuardPlan,
  failedQuestionBoundaryGuardPlan,
  mergeQuestionBoundaryGuardPlanIntoSummary,
  type QuestionBoundaryGuardCandidate,
  type QuestionBoundaryGuardPlan,
} from "@/lib/ai-pdf-import/question-boundary-guard";
import {
  classifyAIProviderError,
  safeAIProviderErrorState,
  type AIProviderRetryHistoryItem,
} from "@/lib/ai-providers/errors";
import {
  runWithAIProviderRetry,
  type AIProviderRetryEvent,
} from "@/lib/ai-providers/resilience";
import {
  resolveAIProviderRoute,
  runWithAIProviderRoute,
} from "@/lib/ai-providers/routing";
import {
  buildAIBlueprintObservationPlanFromProviderResponse,
  buildAIBlueprintObservationPlanFromSummary,
  buildAIBlueprintObservationProviderPrompt,
  failedAIBlueprintObservationPlan,
  mergeAIBlueprintObservationPlanIntoSummary,
  parseAIBlueprintObservationProviderText,
  type AIBlueprintObservationPlan,
} from "@/lib/ai-pdf-import/blueprint-observation";
import {
  buildAIBlueprintObservationClusterPlan,
  buildClusteredBlueprintObservationAnalyzerPlans,
  mergeAIBlueprintObservationClusterPlanIntoSummary,
  type AIBlueprintObservationClusterPlan,
} from "@/lib/ai-pdf-import/blueprint-observation-clustering";
import {
  buildQuestionBlueprintDraftPlanFromClusteredDraftPlans,
  buildQuestionBlueprintTaxonomyCandidateList,
  executeDeepSeekQuestionBlueprintAnalyzer,
  failedQuestionBlueprintDraftPlan,
  mergeQuestionBlueprintDraftPlanIntoSummary,
  skippedQuestionBlueprintDraftPlan,
  QUESTION_BLUEPRINT_ANALYZER_MISSING_DEEPSEEK_WARNING,
  type AIQuestionBlueprintDraftPlan,
  type AIQuestionBlueprintTaxonomyCandidate,
} from "@/lib/ai-pdf-import/question-blueprint-analyzer";
import {
  buildQuestionBlueprintLibraryPersistencePlan,
  mergeQuestionBlueprintLibraryPersistencePlanIntoSummary,
  type QuestionBlueprintLibraryPersistencePlan,
} from "@/lib/blueprints/question-blueprint-library";
import {
  buildQuestionBlueprintReviewActionPlan,
  mergeQuestionBlueprintReviewPlanIntoSummary,
  type QuestionBlueprintReviewActionPlan,
} from "@/lib/blueprints/question-blueprint-review";
import {
  normalizeQuestionBlueprintModelQualityMode,
  selectQuestionBlueprintDeepSeekProfile,
} from "@/lib/blueprints/question-blueprint-model-routing";
import { importBatchImportJson } from "@/lib/batch-import/service";
import { markdownLatexToHtml } from "@/lib/markdown-latex/markdown";
import {
  QUESTION_ASSETS_BUCKET,
  QUESTION_ASSET_MAX_BYTES,
} from "@/lib/question-assets";
import { sanitizeContentHtml } from "@/lib/sanitize/html";

type SupabaseLike = {
  from: (table: string) => any;
  storage: any;
};

type ActiveTag = {
  id: string;
  facet_key: string | null;
  label?: string | null;
  description?: string | null;
  aliases?: string[];
};

export type AIPdfProcessInput = {
  batchId: string;
  chunkIndex?: number;
  fileName: string;
  jobId?: string;
  pdfBuffer: Buffer;
  profileId: string;
  providerProfileId: string;
  providerRetryMaxAttempts?: number;
  routingLeaseOwner?: string;
  routingOrganizationId?: string;
  // Only the trusted durable worker may opt into the closed-beta subset path.
  // All direct/admin/teacher server calls retain full-document handling by default.
  selectiveExecutionEnabled?: boolean;
  sourceAssetId?: string;
  sourceObjectPath: string;
  supabase: SupabaseLike;
  targetBankId?: string | null;
  onProviderUsage?: (usage: GeminiNativeUsage | null) => void;
};

export type AIPdfCoverageRecoveryProcessInput = AIPdfProcessInput & {
  originalBatchId: string;
  recoveryPlanHash: string;
  recoveryWindowIds: string[];
};

type ProcessInput = AIPdfProcessInput;

type AIPdfProgress = {
  attemptCount?: number;
  blueprintModelQualityFallbackReason?: string;
  blueprintModelQualityMode?: string;
  blueprintModelQualityRequestedMode?: string;
  detail?: string;
  error?: string;
  internalErrorReference?: string;
  maxAttempts?: number;
  nextAction?: string;
  pageCount?: number;
  phase: string;
  provider?: { id: string; model: string; name: string; provider: string };
  questionCount?: number;
  retryable?: boolean;
  safeErrorCode?: string;
  sourceInput?: AiPdfInputStrategy;
  warnings?: string[];
};

export const AI_PDF_TRANSIENT_PROVIDER_FAILURE_MESSAGE =
  "The AI service is temporarily busy. Your file and target Library are safe, and the system is retrying automatically.";

export function isTransientAIPdfProviderFailure(value: unknown) {
  return classifyAIProviderError({
    error: value,
    operation: "ai_pdf_extraction",
  }).retryable;
}

function plainObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function numberFromRecord(
  record: Record<string, unknown>,
  keys: string[],
  fallback = 0,
) {
  for (const key of keys) {
    const value = record[key];
    const numeric = Number(value);

    if (Number.isFinite(numeric)) {
      return numeric;
    }
  }

  return fallback;
}

function createdQuestionsFromSummary(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => plainObject(item))
    .filter(
      (item) =>
        typeof item.id === "string" &&
        typeof item.questionCode === "string" &&
        typeof item.title === "string",
    )
    .map((item) => ({
      assetReferenceCounts: plainObject(item.assetReferenceCounts) as {
        imageUrls: number;
        questionAssetIds: number;
        sourceFileIds: number;
        total: number;
      },
      assetReferences: item.assetReferences,
      id: String(item.id),
      questionCode: String(item.questionCode),
      title: String(item.title),
    }));
}

function questionBoundaryStringList(value: unknown) {
  return Array.isArray(value)
    ? value.map(String).map((item) => item.trim()).filter(Boolean)
    : [];
}

function questionBoundaryNumberList(value: unknown) {
  return Array.from(
    new Set(
      (Array.isArray(value) ? value : [])
        .map(Number)
        .filter((item) => Number.isFinite(item) && item > 0)
        .map((item) => Math.trunc(item)),
    ),
  ).sort((left, right) => left - right);
}

function questionBoundaryRiskPages(aiPdfImport: Record<string, unknown>) {
  const preanalysis = plainObject(aiPdfImport.preanalysis);
  const pages = Array.isArray(preanalysis.pages) ? preanalysis.pages : [];
  const adaptiveRereadPlan = plainObject(aiPdfImport.adaptiveRereadPlan);
  const adaptiveRequests = Array.isArray(adaptiveRereadPlan.requests)
    ? adaptiveRereadPlan.requests
    : [];
  const coverageRecoveryMergePlan = plainObject(
    aiPdfImport.coverageRecoveryMergePlan,
  );
  const recoveryMergeItems = Array.isArray(coverageRecoveryMergePlan.mergeItems)
    ? coverageRecoveryMergePlan.mergeItems
    : [];

  return questionBoundaryNumberList(
    [
      ...pages.flatMap((value) => {
        const page = plainObject(value);
        const risks = Array.isArray(page.boundaryRisks)
          ? page.boundaryRisks
          : [];
        return risks.length ? [page.pageNumber] : [];
      }),
      ...adaptiveRequests.flatMap((value) => {
        const request = plainObject(value);
        return questionBoundaryNumberList(
          plainObject(request.pageWindow).pageNumbers,
        );
      }),
      ...recoveryMergeItems.flatMap((value) =>
        questionBoundaryNumberList(plainObject(value).pageNumbers),
      ),
    ],
  );
}

function questionBoundaryProvenance(value: Record<string, unknown>) {
  const raw = String(
    value.recoveryProvenance ??
      value.recovery_provenance ??
      value.provenance ??
      value.source ??
      "",
  ).toLowerCase();

  if (raw.includes("recovery")) return "recovery" as const;
  if (raw.includes("original") || raw.includes("ai_pdf")) return "original" as const;
  return "unknown" as const;
}

function questionBoundaryCandidatesFromRows({
  assetRefsByQuestionId,
  rows,
  sourceAssetId,
}: {
  assetRefsByQuestionId: Map<string, string[]>;
  rows: Array<Record<string, unknown>>;
  sourceAssetId: string;
}): QuestionBoundaryGuardCandidate[] {
  return rows
    .map((row) => {
      const metadata = plainObject(row.ai_metadata);
      const chunk = plainObject(metadata.chunk);
      const placeholders = Array.isArray(metadata.asset_placeholders)
        ? metadata.asset_placeholders.map((value) => plainObject(value))
        : [];
      const pageRefs = questionBoundaryNumberList(metadata.page_refs);
      const questionId = String(row.id ?? "");
      const options = Array.isArray(row.options) ? row.options : [];

      return {
        assetPageNumbers: questionBoundaryNumberList(
          placeholders.map((placeholder) => placeholder.pageNumber),
        ),
        assetPlaceholders: placeholders.map((placeholder) => ({
          pageNumber: Number.isFinite(Number(placeholder.pageNumber))
            ? Number(placeholder.pageNumber)
            : null,
          placeholder:
            typeof placeholder.placeholder === "string"
              ? placeholder.placeholder
              : null,
        })),
        assetRefs: assetRefsByQuestionId.get(questionId) ?? [],
        chunkIndex: Number.isFinite(Number(chunk.chunk_index))
          ? Number(chunk.chunk_index)
          : null,
        contentHtml: typeof row.content_html === "string" ? row.content_html : null,
        contentSource:
          typeof row.content_source === "string" ? row.content_source : null,
        extractionBatchIds: questionBoundaryStringList(metadata.extraction_batch_ids),
        id: questionId,
        optionsCount: options.length,
        packetIds: questionBoundaryStringList(metadata.packet_ids),
        pageRefs,
        questionCode: String(row.question_code ?? ""),
        recoveryProvenance: questionBoundaryProvenance(metadata),
        solutionHtml:
          typeof row.solution_html === "string" ? row.solution_html : null,
        solutionSource:
          typeof row.solution_source === "string" ? row.solution_source : null,
        sourceAssetId,
        title: typeof row.title === "string" ? row.title : null,
        visibleQuestionNumber:
          typeof metadata.visible_question_number === "string"
            ? metadata.visible_question_number
            : null,
      } satisfies QuestionBoundaryGuardCandidate;
    })
    .filter((candidate) => candidate.id && candidate.questionCode);
}

async function loadCurrentAIPdfSummary(input: ProcessInput) {
  const { data: batch, error } = await input.supabase
    .from("import_batches")
    .select("summary")
    .eq("id", input.batchId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  const currentSummary = plainObject(batch?.summary);

  return {
    aiPdfImport: plainObject(currentSummary.aiPdfImport),
    summary: currentSummary,
  };
}

async function updateAIPdfBatchProgress(
  input: ProcessInput,
  progress: AIPdfProgress,
) {
  const current = await loadCurrentAIPdfSummary(input);
  const aiPdfImport = mergeAIPdfImportChunkingSummary(current.aiPdfImport, {
    fileName: input.fileName,
    jobId: input.jobId,
    sourceAssetId: input.sourceAssetId,
    sourceObjectPath: input.sourceObjectPath,
    updatedAt: new Date().toISOString(),
    ...progress,
  });
  const { error: updateError } = await input.supabase
    .from("import_batches")
    .update({
      status: "validating",
      summary: {
        ...current.summary,
        aiPdfImport,
      },
    })
    .eq("id", input.batchId);

  if (updateError) {
    throw new Error(updateError.message);
  }
}

export async function recordAIPdfProviderFailure({
  error,
  input,
  retryHistory,
}: {
  error: unknown;
  input: AIPdfProcessInput;
  retryHistory?: AIProviderRetryHistoryItem[];
}) {
  const failedAt = new Date().toISOString();
  const classified = classifyAIProviderError({
    error,
    operation: "ai_pdf_extraction",
  });
  const resolvedRetryHistory = retryHistory ?? classified.retryHistory ?? [];
  const safeError = safeAIProviderErrorState({
    attemptCount: classified.attemptCount ?? resolvedRetryHistory.length + 1,
    error: classified,
    maxAttempts: classified.maxAttempts ?? 4,
  });
  const current = await loadCurrentAIPdfSummary(input);
  const aiPdfImport = mergeAIPdfImportChunkingSummary(current.aiPdfImport, {
    detail: safeError.safeMessage,
    error: safeError.safeMessage,
    failureKind: safeError.safeErrorCode,
    fileName: input.fileName,
    internalErrorReference: safeError.internalErrorReference,
    jobId: input.jobId,
    maxAttempts: safeError.maxAttempts,
    nextAction: safeError.nextAction,
    phase: "provider_retry_exhausted",
    phaseFailedAt: failedAt,
    retryAttemptHistory: resolvedRetryHistory,
    retryable: safeError.retryable,
    retryRecommendation:
      safeError.nextAction === "contact_administrator"
        ? "Contact an administrator."
        : "Retry later without uploading the file again.",
    safeErrorCode: safeError.safeErrorCode,
    sourceAssetId: input.sourceAssetId,
    sourceObjectPath: input.sourceObjectPath,
    targetBankId: input.targetBankId ?? null,
    updatedAt: failedAt,
  });
  const { error: updateError } = await input.supabase
    .from("import_batches")
    .update({
      status: "failed",
      summary: {
        ...current.summary,
        aiPdfImport,
        importedFrom:
          current.summary.importedFrom ?? "teacher_bank_ai_pdf_import",
        reviewGate: current.summary.reviewGate ?? "bank_review_required",
        reviewScope: current.summary.reviewScope ?? "question_bank",
        retryable: safeError.retryable,
        targetBankId: input.targetBankId ?? current.summary.targetBankId ?? null,
      },
    })
    .eq("id", input.batchId);

  if (updateError) {
    throw new Error(updateError.message);
  }
}

export async function recordAIPdfTransientProviderFailure(input: AIPdfProcessInput) {
  return recordAIPdfProviderFailure({
    error: new Error("provider high demand"),
    input,
  });
}

async function updateAIPdfChunkProgress({
  chunk,
  input,
  pageCount,
  patch,
  progress = {},
}: {
  chunk: AIPdfImportChunkSummary;
  input: ProcessInput;
  pageCount: number;
  patch: Partial<AIPdfImportChunkSummary>;
  progress?: Partial<AIPdfProgress>;
}) {
  const current = await loadCurrentAIPdfSummary(input);
  const chunking = patchAIPdfChunkingSummary({
    chunkIndex: chunk.chunkIndex,
    pageCount,
    patch: {
      sourcePages: chunk.sourcePages,
      ...patch,
    },
    value: current.aiPdfImport.chunking,
  });
  const aiPdfImport = mergeAIPdfImportChunkingSummary(current.aiPdfImport, {
    fileName: input.fileName,
    jobId: input.jobId,
    pageCount,
    sourceAssetId: input.sourceAssetId,
    sourceObjectPath: input.sourceObjectPath,
    updatedAt: new Date().toISOString(),
    ...progress,
    chunking,
  });
  const { error } = await input.supabase
    .from("import_batches")
    .update({
      status: "validating",
      summary: {
        ...current.summary,
        aiPdfImport,
      },
    })
    .eq("id", input.batchId);

  if (error) {
    throw new Error(error.message);
  }
}

async function updateAIPdfProviderRetryProgress({
  chunk,
  input,
  pageCount,
  provider,
  sourceInput,
  retry,
}: {
  chunk?: AIPdfImportChunkSummary;
  input: ProcessInput;
  pageCount: number;
  provider: { id: string; model: string; name: string; provider: string };
  retry: AIProviderRetryEvent;
  sourceInput: AiPdfInputStrategy;
}) {
  const attemptedAt = new Date().toISOString();
  const detail = "The AI service is temporarily busy. Your work is safe, and the system is retrying.";
  const retryPatch = {
    attemptCount: retry.attemptCount,
    lastAttemptAt: attemptedAt,
    maxAttempts: retry.maxAttempts,
    nextAction: retry.error.nextAction,
    retryable: retry.error.retryable,
    safeErrorCode: retry.error.safeErrorCode,
  };

  if (chunk) {
    await updateAIPdfChunkProgress({
      chunk,
      input,
      pageCount,
      patch: {
        ...retryPatch,
        status: "retrying",
        warningCount: 0,
        warnings: [],
      },
      progress: {
        ...retryPatch,
        detail,
        pageCount,
        phase: "provider_retry_wait",
        provider,
        sourceInput,
      },
    });
    return;
  }

  await updateAIPdfBatchProgress(input, {
    ...retryPatch,
    detail,
    pageCount,
    phase: "provider_retry_wait",
    provider,
    sourceInput,
  });
}

async function updateAIPdfPreanalysis({
  input,
  preanalysis,
}: {
  input: ProcessInput;
  preanalysis: AIPreanalysisResult;
}) {
  const current = await loadCurrentAIPdfSummary(input);
  const aiPdfImport = mergeAIPreanalysisIntoSummary(
    mergeAIPdfImportChunkingSummary(current.aiPdfImport, {
      fileName: input.fileName,
      jobId: input.jobId,
      sourceAssetId: input.sourceAssetId,
      sourceObjectPath: input.sourceObjectPath,
      updatedAt: new Date().toISOString(),
    }),
    preanalysis,
  );
  const { error } = await input.supabase
    .from("import_batches")
    .update({
      status: "validating",
      summary: {
        ...current.summary,
        aiPdfImport,
      },
    })
    .eq("id", input.batchId);

  if (error) {
    throw new Error(error.message);
  }
}

async function updateAIPdfPacketPlan({
  input,
  packetPlan,
}: {
  input: ProcessInput;
  packetPlan: AIPacketPlan;
}) {
  const current = await loadCurrentAIPdfSummary(input);
  const aiPdfImport = mergeAIPacketPlanIntoSummary(
    mergeAIPdfImportChunkingSummary(current.aiPdfImport, {
      fileName: input.fileName,
      jobId: input.jobId,
      sourceAssetId: input.sourceAssetId,
      sourceObjectPath: input.sourceObjectPath,
      updatedAt: new Date().toISOString(),
    }),
    packetPlan,
  );
  const { error } = await input.supabase
    .from("import_batches")
    .update({
      status: "validating",
      summary: {
        ...current.summary,
        aiPdfImport,
      },
    })
    .eq("id", input.batchId);

  if (error) {
    throw new Error(error.message);
  }
}

async function updateAIBlueprintObservationPlan({
  input,
  blueprintObservationPlan,
}: {
  input: ProcessInput;
  blueprintObservationPlan: AIBlueprintObservationPlan;
}) {
  const current = await loadCurrentAIPdfSummary(input);
  const aiPdfImport = mergeAIBlueprintObservationPlanIntoSummary(
    mergeAIPdfImportChunkingSummary(current.aiPdfImport, {
      fileName: input.fileName,
      jobId: input.jobId,
      sourceAssetId: input.sourceAssetId,
      sourceObjectPath: input.sourceObjectPath,
      updatedAt: new Date().toISOString(),
    }),
    blueprintObservationPlan,
  );
  const { error } = await input.supabase
    .from("import_batches")
    .update({
      status: "validating",
      summary: {
        ...current.summary,
        aiPdfImport,
      },
    })
    .eq("id", input.batchId);

  if (error) {
    throw new Error(error.message);
  }
}

async function updateAIBlueprintObservationClusterPlan({
  blueprintObservationClusterPlan,
  input,
}: {
  blueprintObservationClusterPlan: AIBlueprintObservationClusterPlan;
  input: ProcessInput;
}) {
  const current = await loadCurrentAIPdfSummary(input);
  const aiPdfImport = mergeAIBlueprintObservationClusterPlanIntoSummary(
    mergeAIPdfImportChunkingSummary(current.aiPdfImport, {
      fileName: input.fileName,
      jobId: input.jobId,
      sourceAssetId: input.sourceAssetId,
      sourceObjectPath: input.sourceObjectPath,
      updatedAt: new Date().toISOString(),
    }),
    blueprintObservationClusterPlan,
  );
  const { error } = await input.supabase
    .from("import_batches")
    .update({
      status: "validating",
      summary: {
        ...current.summary,
        aiPdfImport,
      },
    })
    .eq("id", input.batchId);

  if (error) {
    throw new Error(error.message);
  }
}

async function updateAIQuestionBlueprintDraftPlan({
  input,
  questionBlueprintDraftPlan,
}: {
  input: ProcessInput;
  questionBlueprintDraftPlan: AIQuestionBlueprintDraftPlan;
}) {
  const current = await loadCurrentAIPdfSummary(input);
  const aiPdfImport = mergeQuestionBlueprintDraftPlanIntoSummary(
    mergeAIPdfImportChunkingSummary(current.aiPdfImport, {
      fileName: input.fileName,
      jobId: input.jobId,
      sourceAssetId: input.sourceAssetId,
      sourceObjectPath: input.sourceObjectPath,
      updatedAt: new Date().toISOString(),
    }),
    questionBlueprintDraftPlan,
  );
  const { error } = await input.supabase
    .from("import_batches")
    .update({
      status: "validating",
      summary: {
        ...current.summary,
        aiPdfImport,
      },
    })
    .eq("id", input.batchId);

  if (error) {
    throw new Error(error.message);
  }
}

async function updateQuestionBlueprintReviewAndLibraryPlans({
  input,
  libraryPersistencePlan,
  reviewPlan,
}: {
  input: ProcessInput;
  libraryPersistencePlan: QuestionBlueprintLibraryPersistencePlan;
  reviewPlan: QuestionBlueprintReviewActionPlan;
}) {
  const current = await loadCurrentAIPdfSummary(input);
  const aiPdfImport = mergeQuestionBlueprintLibraryPersistencePlanIntoSummary(
    mergeQuestionBlueprintReviewPlanIntoSummary(
      mergeAIPdfImportChunkingSummary(current.aiPdfImport, {
        fileName: input.fileName,
        jobId: input.jobId,
        sourceAssetId: input.sourceAssetId,
        sourceObjectPath: input.sourceObjectPath,
        updatedAt: new Date().toISOString(),
      }),
      reviewPlan,
    ),
    libraryPersistencePlan,
  );
  const { error } = await input.supabase
    .from("import_batches")
    .update({
      status: "validating",
      summary: {
        ...current.summary,
        aiPdfImport,
      },
    })
    .eq("id", input.batchId);

  if (error) {
    throw new Error(error.message);
  }
}

async function updateAIExtractionBatchPlan({
  batchPlan,
  input,
}: {
  batchPlan: AIExtractionBatchPlan;
  input: ProcessInput;
}) {
  const current = await loadCurrentAIPdfSummary(input);
  const aiPdfImport = mergeAIExtractionBatchPlanIntoSummary(
    mergeAIPdfImportChunkingSummary(current.aiPdfImport, {
      fileName: input.fileName,
      jobId: input.jobId,
      sourceAssetId: input.sourceAssetId,
      sourceObjectPath: input.sourceObjectPath,
      updatedAt: new Date().toISOString(),
    }),
    batchPlan,
  );
  const { error } = await input.supabase
    .from("import_batches")
    .update({
      status: "validating",
      summary: {
        ...current.summary,
        aiPdfImport,
      },
    })
    .eq("id", input.batchId);

  if (error) {
    throw new Error(error.message);
  }
}

async function updateAISelectiveExecutionPlan({
  input,
  selectiveExecutionPlan,
}: {
  input: ProcessInput;
  selectiveExecutionPlan: AISelectiveExecutionPlan;
}) {
  const current = await loadCurrentAIPdfSummary(input);
  const aiPdfImport = mergeAISelectiveExecutionPlanIntoSummary(
    mergeAIPdfImportChunkingSummary(current.aiPdfImport, {
      fileName: input.fileName,
      jobId: input.jobId,
      sourceAssetId: input.sourceAssetId,
      sourceObjectPath: input.sourceObjectPath,
      updatedAt: new Date().toISOString(),
    }),
    selectiveExecutionPlan,
  );
  const { error } = await input.supabase
    .from("import_batches")
    .update({
      status: "validating",
      summary: {
        ...current.summary,
        aiPdfImport,
      },
    })
    .eq("id", input.batchId);

  if (error) {
    throw new Error(error.message);
  }
}

async function updateAIProviderRequestPlan({
  input,
  requestPlan,
}: {
  input: ProcessInput;
  requestPlan: AIProviderRequestPlan;
}) {
  const current = await loadCurrentAIPdfSummary(input);
  const aiPdfImport = mergeAIProviderRequestPlanIntoSummary(
    mergeAIPdfImportChunkingSummary(current.aiPdfImport, {
      fileName: input.fileName,
      jobId: input.jobId,
      sourceAssetId: input.sourceAssetId,
      sourceObjectPath: input.sourceObjectPath,
      updatedAt: new Date().toISOString(),
    }),
    requestPlan,
  );
  const { error } = await input.supabase
    .from("import_batches")
    .update({
      status: "validating",
      summary: {
        ...current.summary,
        aiPdfImport,
      },
    })
    .eq("id", input.batchId);

  if (error) {
    throw new Error(error.message);
  }
}

async function updateAIProviderRunPlan({
  input,
  runPlan,
}: {
  input: ProcessInput;
  runPlan: AIProviderRunPlan;
}) {
  const current = await loadCurrentAIPdfSummary(input);
  const aiPdfImport = mergeAIProviderRunPlanIntoSummary(
    mergeAIPdfImportChunkingSummary(current.aiPdfImport, {
      fileName: input.fileName,
      jobId: input.jobId,
      sourceAssetId: input.sourceAssetId,
      sourceObjectPath: input.sourceObjectPath,
      updatedAt: new Date().toISOString(),
    }),
    runPlan,
  );
  const { error } = await input.supabase
    .from("import_batches")
    .update({
      status: "validating",
      summary: {
        ...current.summary,
        aiPdfImport,
      },
    })
    .eq("id", input.batchId);

  if (error) {
    throw new Error(error.message);
  }
}

async function updateAIAdaptiveRereadPlan({
  input,
  rereadPlan,
}: {
  input: ProcessInput;
  rereadPlan: AIAdaptiveRereadPlan;
}) {
  const current = await loadCurrentAIPdfSummary(input);
  const aiPdfImport = mergeAIAdaptiveRereadPlanIntoSummary(
    mergeAIPdfImportChunkingSummary(current.aiPdfImport, {
      fileName: input.fileName,
      jobId: input.jobId,
      sourceAssetId: input.sourceAssetId,
      sourceObjectPath: input.sourceObjectPath,
      updatedAt: new Date().toISOString(),
    }),
    rereadPlan,
  );
  const { error } = await input.supabase
    .from("import_batches")
    .update({
      status: "validating",
      summary: {
        ...current.summary,
        aiPdfImport,
      },
    })
    .eq("id", input.batchId);

  if (error) {
    throw new Error(error.message);
  }
}

async function updateAIAdaptiveRereadProviderRequestPlan({
  input,
  requestPlan,
}: {
  input: ProcessInput;
  requestPlan: AIAdaptiveRereadProviderRequestPlan;
}) {
  const current = await loadCurrentAIPdfSummary(input);
  const aiPdfImport = mergeAIAdaptiveRereadProviderRequestPlanIntoSummary(
    mergeAIPdfImportChunkingSummary(current.aiPdfImport, {
      fileName: input.fileName,
      jobId: input.jobId,
      sourceAssetId: input.sourceAssetId,
      sourceObjectPath: input.sourceObjectPath,
      updatedAt: new Date().toISOString(),
    }),
    requestPlan,
  );
  const { error } = await input.supabase
    .from("import_batches")
    .update({
      status: "validating",
      summary: {
        ...current.summary,
        aiPdfImport,
      },
    })
    .eq("id", input.batchId);

  if (error) {
    throw new Error(error.message);
  }
}

async function updateAIAdaptiveRereadRunPlan({
  input,
  runPlan,
}: {
  input: ProcessInput;
  runPlan: AIAdaptiveRereadRunPlan;
}) {
  const current = await loadCurrentAIPdfSummary(input);
  const aiPdfImport = mergeAIAdaptiveRereadRunPlanIntoSummary(
    mergeAIPdfImportChunkingSummary(current.aiPdfImport, {
      fileName: input.fileName,
      jobId: input.jobId,
      sourceAssetId: input.sourceAssetId,
      sourceObjectPath: input.sourceObjectPath,
      updatedAt: new Date().toISOString(),
    }),
    runPlan,
  );
  const { error } = await input.supabase
    .from("import_batches")
    .update({
      status: "validating",
      summary: {
        ...current.summary,
        aiPdfImport,
      },
    })
    .eq("id", input.batchId);

  if (error) {
    throw new Error(error.message);
  }
}

async function updateAIAdaptiveRereadMergePlan({
  input,
  mergePlan,
}: {
  input: ProcessInput;
  mergePlan: AIAdaptiveRereadMergePlan;
}) {
  const current = await loadCurrentAIPdfSummary(input);
  const aiPdfImport = mergeAIAdaptiveRereadMergePlanIntoSummary(
    mergeAIPdfImportChunkingSummary(current.aiPdfImport, {
      fileName: input.fileName,
      jobId: input.jobId,
      sourceAssetId: input.sourceAssetId,
      sourceObjectPath: input.sourceObjectPath,
      updatedAt: new Date().toISOString(),
    }),
    mergePlan,
  );
  const { error } = await input.supabase
    .from("import_batches")
    .update({
      status: "validating",
      summary: {
        ...current.summary,
        aiPdfImport,
      },
    })
    .eq("id", input.batchId);

  if (error) {
    throw new Error(error.message);
  }
}

async function updateAITaggingV2Plan({
  input,
  taggingV2Plan,
}: {
  input: ProcessInput;
  taggingV2Plan: AITaggingV2Plan;
}) {
  const current = await loadCurrentAIPdfSummary(input);
  const aiPdfImport = mergeAITaggingV2PlanIntoSummary(
    mergeAIPdfImportChunkingSummary(current.aiPdfImport, {
      fileName: input.fileName,
      jobId: input.jobId,
      sourceAssetId: input.sourceAssetId,
      sourceObjectPath: input.sourceObjectPath,
      updatedAt: new Date().toISOString(),
    }),
    taggingV2Plan,
  );
  const { error } = await input.supabase
    .from("import_batches")
    .update({
      status: "validating",
      summary: {
        ...current.summary,
        aiPdfImport,
      },
    })
    .eq("id", input.batchId);

  if (error) {
    throw new Error(error.message);
  }
}

async function updateAITaxonomyBootstrapPlan({
  input,
  taxonomyBootstrapPlan,
}: {
  input: ProcessInput;
  taxonomyBootstrapPlan: AITaxonomyBootstrapPlan;
}) {
  const current = await loadCurrentAIPdfSummary(input);
  const aiPdfImport = mergeAITaxonomyBootstrapPlanIntoSummary(
    mergeAIPdfImportChunkingSummary(current.aiPdfImport, {
      fileName: input.fileName,
      jobId: input.jobId,
      sourceAssetId: input.sourceAssetId,
      sourceObjectPath: input.sourceObjectPath,
      updatedAt: new Date().toISOString(),
    }),
    taxonomyBootstrapPlan,
  );
  const { error } = await input.supabase
    .from("import_batches")
    .update({
      status: "validating",
      summary: {
        ...current.summary,
        aiPdfImport,
      },
    })
    .eq("id", input.batchId);

  if (error) {
    throw new Error(error.message);
  }
}

async function updateAITaxonomyReviewPlan({
  input,
  taxonomyReviewPlan,
}: {
  input: ProcessInput;
  taxonomyReviewPlan: AITaxonomyReviewPlan;
}) {
  const current = await loadCurrentAIPdfSummary(input);
  const aiPdfImport = mergeAITaxonomyReviewPlanIntoSummary(
    mergeAIPdfImportChunkingSummary(current.aiPdfImport, {
      fileName: input.fileName,
      jobId: input.jobId,
      sourceAssetId: input.sourceAssetId,
      sourceObjectPath: input.sourceObjectPath,
      updatedAt: new Date().toISOString(),
    }),
    taxonomyReviewPlan,
  );
  const { error } = await input.supabase
    .from("import_batches")
    .update({
      status: "validating",
      summary: {
        ...current.summary,
        aiPdfImport,
      },
    })
    .eq("id", input.batchId);

  if (error) {
    throw new Error(error.message);
  }
}

async function updateAITaxonomyPersistencePlan({
  input,
  taxonomyPersistencePlan,
}: {
  input: ProcessInput;
  taxonomyPersistencePlan: AITaxonomyPersistencePlan;
}) {
  const current = await loadCurrentAIPdfSummary(input);
  const aiPdfImport = mergeAITaxonomyPersistencePlanIntoSummary(
    mergeAIPdfImportChunkingSummary(current.aiPdfImport, {
      fileName: input.fileName,
      jobId: input.jobId,
      sourceAssetId: input.sourceAssetId,
      sourceObjectPath: input.sourceObjectPath,
      updatedAt: new Date().toISOString(),
    }),
    taxonomyPersistencePlan,
  );
  const { error } = await input.supabase
    .from("import_batches")
    .update({
      status: "validating",
      summary: {
        ...current.summary,
        aiPdfImport,
      },
    })
    .eq("id", input.batchId);

  if (error) {
    throw new Error(error.message);
  }
}

async function updateAITaxonomyTagTaxonomyPlan({
  taxonomyTagTaxonomyPlan,
  input,
}: {
  taxonomyTagTaxonomyPlan: AITaxonomyTagTaxonomyPlan;
  input: ProcessInput;
}) {
  const current = await loadCurrentAIPdfSummary(input);
  const aiPdfImport = mergeAITaxonomyTagTaxonomyPlanIntoSummary(
    mergeAIPdfImportChunkingSummary(current.aiPdfImport, {
      fileName: input.fileName,
      jobId: input.jobId,
      sourceAssetId: input.sourceAssetId,
      sourceObjectPath: input.sourceObjectPath,
      updatedAt: new Date().toISOString(),
    }),
    taxonomyTagTaxonomyPlan,
  );
  const { error } = await input.supabase
    .from("import_batches")
    .update({
      status: "validating",
      summary: {
        ...current.summary,
        aiPdfImport,
      },
    })
    .eq("id", input.batchId);

  if (error) {
    throw new Error(error.message);
  }
}

async function generateAndStoreTaxonomyTagTaxonomyPlan({
  input,
}: {
  input: ProcessInput;
}) {
  try {
    const { catalog, errorMessage } = await loadTaxonomyCatalog(input.supabase);
    if (errorMessage) throw new Error(errorMessage);
    const taxonomyTagTaxonomyPlan = buildAITaxonomyTagTaxonomyPlan(catalog);
    await updateAITaxonomyTagTaxonomyPlan({
      taxonomyTagTaxonomyPlan,
      input,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "AI taxonomy tag taxonomy plan failed.";

    await updateAITaxonomyTagTaxonomyPlan({
      taxonomyTagTaxonomyPlan: failedAITaxonomyTagTaxonomyPlan({
        warnings: [`taxonomy tag taxonomy plan failed: ${message}`],
      }),
      input,
    });
  }

  await generateAndStoreTaxonomyQuestionTaggingPlan({ input });
}

async function updateAITaxonomyQuestionTaggingPlan({
  taxonomyQuestionTaggingPlan,
  input,
}: {
  taxonomyQuestionTaggingPlan: AITaxonomyQuestionTaggingPlan;
  input: ProcessInput;
}) {
  const current = await loadCurrentAIPdfSummary(input);
  const aiPdfImport = mergeTaxonomyQuestionTaggingPlanIntoSummary(
    mergeAIPdfImportChunkingSummary(current.aiPdfImport, {
      fileName: input.fileName,
      jobId: input.jobId,
      sourceAssetId: input.sourceAssetId,
      sourceObjectPath: input.sourceObjectPath,
      updatedAt: new Date().toISOString(),
    }),
    taxonomyQuestionTaggingPlan,
  );
  const { error } = await input.supabase
    .from("import_batches")
    .update({
      status: "validating",
      summary: {
        ...current.summary,
        aiPdfImport,
      },
    })
    .eq("id", input.batchId);

  if (error) {
    throw new Error(error.message);
  }
}

async function generateAndStoreTaxonomyQuestionTaggingPlan({
  input,
}: {
  input: ProcessInput;
}) {
  try {
    const current = await loadCurrentAIPdfSummary(input);
    const { catalog, errorMessage } = await loadTaxonomyCatalog(input.supabase);
    if (errorMessage) throw new Error(errorMessage);
    const taxonomyQuestionTaggingPlan =
      buildTaxonomyQuestionTaggingPlanFromSummary(current.summary, catalog);
    await updateAITaxonomyQuestionTaggingPlan({
      taxonomyQuestionTaggingPlan,
      input,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "AI taxonomy question tagging plan failed.";

    await updateAITaxonomyQuestionTaggingPlan({
      taxonomyQuestionTaggingPlan: failedTaxonomyQuestionTaggingPlan({
        warnings: [`taxonomy question tagging plan failed: ${message}`],
      }),
      input,
    });
  }

  await generateAndStoreTaxonomyTagReviewActionPlan({ input });
}

async function updateAITaxonomyTagReviewActionPlan({
  taxonomyTagReviewActionPlan,
  input,
}: {
  taxonomyTagReviewActionPlan: AITaxonomyTagReviewActionPlan;
  input: ProcessInput;
}) {
  const current = await loadCurrentAIPdfSummary(input);
  const aiPdfImport = mergeTaxonomyTagReviewActionPlanIntoSummary(
    mergeAIPdfImportChunkingSummary(current.aiPdfImport, {
      fileName: input.fileName,
      jobId: input.jobId,
      sourceAssetId: input.sourceAssetId,
      sourceObjectPath: input.sourceObjectPath,
      updatedAt: new Date().toISOString(),
    }),
    taxonomyTagReviewActionPlan,
  );
  const { error } = await input.supabase
    .from("import_batches")
    .update({
      status: "validating",
      summary: {
        ...current.summary,
        aiPdfImport,
      },
    })
    .eq("id", input.batchId);

  if (error) {
    throw new Error(error.message);
  }
}

async function generateAndStoreTaxonomyTagReviewActionPlan({
  input,
}: {
  input: ProcessInput;
}) {
  try {
    const current = await loadCurrentAIPdfSummary(input);
    const { catalog, errorMessage } = await loadTaxonomyCatalog(input.supabase);
    if (errorMessage) throw new Error(errorMessage);
    const taxonomyTagReviewActionPlan =
      buildTaxonomyTagReviewActionPlanFromSummary(current.summary, catalog);
    await updateAITaxonomyTagReviewActionPlan({
      taxonomyTagReviewActionPlan,
      input,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "AI taxonomy tag review action plan failed.";

    await updateAITaxonomyTagReviewActionPlan({
      taxonomyTagReviewActionPlan: failedTaxonomyTagReviewActionPlan({
        warnings: [`taxonomy tag review action plan failed: ${message}`],
      }),
      input,
    });
  }
}

async function generateAndStoreTaxonomyPersistencePlan({
  input,
}: {
  input: ProcessInput;
}) {
  try {
    const current = await loadCurrentAIPdfSummary(input);
    const taxonomyPersistencePlan =
      buildAITaxonomyPersistencePlanFromSummary(current.aiPdfImport);
    await updateAITaxonomyPersistencePlan({ input, taxonomyPersistencePlan });
    await generateAndStoreTaxonomyTagTaxonomyPlan({ input });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "AI taxonomy persistence plan failed.";

    await updateAITaxonomyPersistencePlan({
      input,
      taxonomyPersistencePlan: failedAITaxonomyPersistencePlan({
        warnings: [`taxonomy persistence plan failed: ${message}`],
      }),
    });
    await generateAndStoreTaxonomyTagTaxonomyPlan({ input });
  }
}

async function updateAIExtractionCoverageAuditPlan({
  auditPlan,
  input,
}: {
  auditPlan: AIExtractionCoverageAuditPlan;
  input: ProcessInput;
}) {
  const current = await loadCurrentAIPdfSummary(input);
  const aiPdfImport = mergeAIExtractionCoverageAuditPlanIntoSummary(
    mergeAIPdfImportChunkingSummary(current.aiPdfImport, {
      fileName: input.fileName,
      jobId: input.jobId,
      sourceAssetId: input.sourceAssetId,
      sourceObjectPath: input.sourceObjectPath,
      updatedAt: new Date().toISOString(),
    }),
    auditPlan,
  );
  const { error } = await input.supabase
    .from("import_batches")
    .update({
      summary: {
        ...current.summary,
        aiPdfImport,
      },
    })
    .eq("id", input.batchId);

  if (error) {
    throw new Error(error.message);
  }
}

async function updateAICoverageRecoveryPlan({
  input,
  recoveryPlan,
}: {
  input: ProcessInput;
  recoveryPlan: AICoverageRecoveryPlan;
}) {
  const current = await loadCurrentAIPdfSummary(input);
  const aiPdfImport = mergeAICoverageRecoveryPlanIntoSummary(
    mergeAIPdfImportChunkingSummary(current.aiPdfImport, {
      fileName: input.fileName,
      jobId: input.jobId,
      sourceAssetId: input.sourceAssetId,
      sourceObjectPath: input.sourceObjectPath,
      updatedAt: new Date().toISOString(),
    }),
    recoveryPlan,
  );
  const { error } = await input.supabase
    .from("import_batches")
    .update({
      summary: {
        ...current.summary,
        aiPdfImport,
      },
    })
    .eq("id", input.batchId);

  if (error) {
    throw new Error(error.message);
  }
}

async function updateAICoverageRecoveryRunPlan({
  input,
  runPlan,
}: {
  input: ProcessInput;
  runPlan: AICoverageRecoveryRunPlan;
}) {
  const current = await loadCurrentAIPdfSummary(input);
  const aiPdfImport = mergeAICoverageRecoveryRunPlanIntoSummary(
    mergeAIPdfImportChunkingSummary(current.aiPdfImport, {
      fileName: input.fileName,
      jobId: input.jobId,
      sourceAssetId: input.sourceAssetId,
      sourceObjectPath: input.sourceObjectPath,
      updatedAt: new Date().toISOString(),
    }),
    runPlan,
  );
  const { error } = await input.supabase
    .from("import_batches")
    .update({
      summary: {
        ...current.summary,
        aiPdfImport,
      },
    })
    .eq("id", input.batchId);

  if (error) {
    throw new Error(error.message);
  }
}

async function updateAICoverageRecoveryMergePlan({
  input,
  mergePlan,
}: {
  input: ProcessInput;
  mergePlan: AICoverageRecoveryMergePlan;
}) {
  const current = await loadCurrentAIPdfSummary(input);
  const aiPdfImport = mergeAICoverageRecoveryMergePlanIntoSummary(
    mergeAIPdfImportChunkingSummary(current.aiPdfImport, {
      fileName: input.fileName,
      jobId: input.jobId,
      sourceAssetId: input.sourceAssetId,
      sourceObjectPath: input.sourceObjectPath,
      updatedAt: new Date().toISOString(),
    }),
    mergePlan,
  );
  const { error } = await input.supabase
    .from("import_batches")
    .update({
      summary: {
        ...current.summary,
        aiPdfImport,
      },
    })
    .eq("id", input.batchId);

  if (error) {
    throw new Error(error.message);
  }
}

async function updateAIQuestionBoundaryGuardPlan({
  input,
  guardPlan,
}: {
  input: ProcessInput;
  guardPlan: QuestionBoundaryGuardPlan;
}) {
  const current = await loadCurrentAIPdfSummary(input);
  const aiPdfImport = mergeQuestionBoundaryGuardPlanIntoSummary(
    mergeAIPdfImportChunkingSummary(current.aiPdfImport, {
      fileName: input.fileName,
      jobId: input.jobId,
      sourceAssetId: input.sourceAssetId,
      sourceObjectPath: input.sourceObjectPath,
      updatedAt: new Date().toISOString(),
    }),
    guardPlan,
  );
  const { error } = await input.supabase
    .from("import_batches")
    .update({
      summary: {
        ...current.summary,
        aiPdfImport,
      },
    })
    .eq("id", input.batchId);

  if (error) {
    throw new Error(error.message);
  }
}

async function generateAndStoreQuestionBoundaryGuardPlan({
  input,
}: {
  input: ProcessInput;
}) {
  try {
    const current = await loadCurrentAIPdfSummary(input);
    const createdQuestions = createdQuestionsFromSummary(
      current.summary.createdQuestions,
    );
    const questionIds = createdQuestions.map((question) => question.id);
    let questionRows: Array<Record<string, unknown>> = [];
    let assetRefsByQuestionId = new Map<string, string[]>();

    if (questionIds.length) {
      const { data: questionData, error: questionError } = await input.supabase
        .from("questions")
        .select(
          "id, question_code, title, content_html, content_source, solution_html, solution_source, options, ai_metadata",
        )
        .in("id", questionIds);

      if (questionError) {
        throw new Error("Question candidates could not be loaded for structural review.");
      }

      questionRows = (questionData ?? []) as Array<Record<string, unknown>>;

      const { data: assetData, error: assetError } = await input.supabase
        .from("question_assets")
        .select("id, question_id, label")
        .in("question_id", questionIds);

      if (assetError) {
        throw new Error("Question asset references could not be loaded for structural review.");
      }

      assetRefsByQuestionId = new Map<string, string[]>();
      for (const asset of (assetData ?? []) as Array<Record<string, unknown>>) {
        const questionId = String(asset.question_id ?? "");
        const assetRef = String(asset.id ?? asset.label ?? "").trim();
        if (!questionId || !assetRef) continue;
        assetRefsByQuestionId.set(questionId, [
          ...(assetRefsByQuestionId.get(questionId) ?? []),
          assetRef,
        ]);
      }
    }

    const guardPlan = buildQuestionBoundaryGuardPlan({
      boundaryRiskPageNumbers: questionBoundaryRiskPages(current.aiPdfImport),
      questions: questionBoundaryCandidatesFromRows({
        assetRefsByQuestionId,
        rows: questionRows,
        sourceAssetId: input.sourceAssetId ?? "",
      }),
      sourceAssetId: input.sourceAssetId,
    });
    await updateAIQuestionBoundaryGuardPlan({ guardPlan, input });
  } catch {
    try {
      await updateAIQuestionBoundaryGuardPlan({
        guardPlan: failedQuestionBoundaryGuardPlan({
          warning:
            "Question boundary analysis was unavailable. Extraction continued and all drafts remain review-only.",
        }),
        input,
      });
    } catch {
      // Guard persistence is advisory; it must not change the extraction outcome.
    }
  }
}

async function generateAndStoreCoverageRecoveryMergePlan({
  input,
}: {
  input: ProcessInput;
}) {
  try {
    const current = await loadCurrentAIPdfSummary(input);
    const mergePlan = buildAICoverageRecoveryMergePlanFromSummary(
      current.summary,
    );
    await updateAICoverageRecoveryMergePlan({ input, mergePlan });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "AI coverage recovery merge plan failed.";

    await updateAICoverageRecoveryMergePlan({
      input,
      mergePlan: failedAICoverageRecoveryMergePlan({
        warnings: [`coverage recovery merge plan failed: ${message}`],
      }),
    });
  }
}

async function generateAndStoreCoverageRecoveryRunPlan({
  input,
}: {
  input: ProcessInput;
}) {
  try {
    const current = await loadCurrentAIPdfSummary(input);
    const runPlan = buildAICoverageRecoveryRunPlanFromSummary(current.summary);
    await updateAICoverageRecoveryRunPlan({ input, runPlan });
    await generateAndStoreCoverageRecoveryMergePlan({ input });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "AI coverage recovery dry run failed.";

    await updateAICoverageRecoveryRunPlan({
      input,
      runPlan: failedAICoverageRecoveryRunPlan({
        warnings: [`coverage recovery dry run failed: ${message}`],
      }),
    });
    await generateAndStoreCoverageRecoveryMergePlan({ input });
  }
}

async function generateAndStoreCoverageRecoveryPlan({
  input,
}: {
  input: ProcessInput;
}) {
  try {
    const current = await loadCurrentAIPdfSummary(input);
    const recoveryPlan = buildAICoverageRecoveryPlanFromSummary(
      current.summary,
    );
    await updateAICoverageRecoveryPlan({ input, recoveryPlan });
    await generateAndStoreCoverageRecoveryRunPlan({ input });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "AI coverage recovery plan failed.";

    await updateAICoverageRecoveryPlan({
      input,
      recoveryPlan: failedAICoverageRecoveryPlan({
        warnings: [`coverage recovery plan failed: ${message}`],
      }),
    });
    await generateAndStoreCoverageRecoveryRunPlan({ input });
  }
}

async function generateAndStoreExtractionCoverageAuditPlan({
  input,
}: {
  input: ProcessInput;
}) {
  try {
    const current = await loadCurrentAIPdfSummary(input);
    const auditPlan = buildAIExtractionCoverageAuditPlanFromSummary(
      current.summary,
    );
    await updateAIExtractionCoverageAuditPlan({ auditPlan, input });
    await generateAndStoreCoverageRecoveryPlan({ input });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "AI extraction coverage audit failed.";

    await updateAIExtractionCoverageAuditPlan({
      auditPlan: failedAIExtractionCoverageAuditPlan({
        warnings: [`coverage audit failed: ${message}`],
      }),
      input,
    });
    await generateAndStoreCoverageRecoveryPlan({ input });
  }
}

async function generateAndStoreTaxonomyReviewPlan({
  input,
}: {
  input: ProcessInput;
}) {
  try {
    const current = await loadCurrentAIPdfSummary(input);
    const taxonomyReviewPlan = buildAITaxonomyReviewPlanFromBootstrapPlan(
      current.aiPdfImport.taxonomyBootstrapPlan,
    );
    await updateAITaxonomyReviewPlan({ input, taxonomyReviewPlan });
    await generateAndStoreTaxonomyPersistencePlan({ input });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "AI taxonomy review plan failed.";

    await updateAITaxonomyReviewPlan({
      input,
      taxonomyReviewPlan: failedAITaxonomyReviewPlan({
        warnings: [`taxonomy review plan failed: ${message}`],
      }),
    });
    await generateAndStoreTaxonomyPersistencePlan({ input });
  }
}

async function generateAndStoreTaxonomyBootstrapPlan({
  input,
}: {
  input: ProcessInput;
}) {
  try {
    const current = await loadCurrentAIPdfSummary(input);
    const taxonomyBootstrapPlan = buildAITaxonomyBootstrapPlanFromSummary(
      current.aiPdfImport,
    );
    await updateAITaxonomyBootstrapPlan({ input, taxonomyBootstrapPlan });
    await generateAndStoreTaxonomyReviewPlan({ input });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "AI taxonomy bootstrap plan failed.";
    const current = await loadCurrentAIPdfSummary(input);
    const taggingPlan = plainObject(current.aiPdfImport.taggingV2Plan);
    const preanalysis = plainObject(current.aiPdfImport.preanalysis);
    const sourceKind =
      taggingPlan.sourceKind === "single_image" ||
      preanalysis.sourceKind === "single_image"
        ? "single_image"
        : "pdf";

    await updateAITaxonomyBootstrapPlan({
      input,
      taxonomyBootstrapPlan: failedAITaxonomyBootstrapPlan({
        sourceKind,
        warnings: [`taxonomy bootstrap plan failed: ${message}`],
      }),
    });
    await generateAndStoreTaxonomyReviewPlan({ input });
  }
}

async function generateAndStoreTaggingV2Plan({
  input,
}: {
  input: ProcessInput;
}) {
  try {
    const current = await loadCurrentAIPdfSummary(input);
    const { catalog, errorMessage } = await loadTaxonomyCatalog(input.supabase);
    if (errorMessage) throw new Error(errorMessage);
    const taggingV2Plan = buildAITaggingV2PlanFromSummary(
      current.aiPdfImport,
      taxonomyCatalogToAITagTaxonomy(catalog),
    );
    await updateAITaggingV2Plan({ input, taggingV2Plan });
    await generateAndStoreTaxonomyBootstrapPlan({ input });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "AI tagging v2 plan failed.";
    const current = await loadCurrentAIPdfSummary(input);
    const mergePlan = plainObject(current.aiPdfImport.adaptiveRereadMergePlan);
    const preanalysis = plainObject(current.aiPdfImport.preanalysis);
    const sourceKind =
      mergePlan.sourceKind === "single_image" ||
      preanalysis.sourceKind === "single_image"
        ? "single_image"
        : "pdf";

    await updateAITaggingV2Plan({
      input,
      taggingV2Plan: failedAITaggingV2Plan({
        sourceKind,
        warnings: [`tagging v2 plan failed: ${message}`],
      }),
    });
    await generateAndStoreTaxonomyBootstrapPlan({ input });
  }
}

async function generateAndStoreAdaptiveRereadMergePlan({
  input,
}: {
  input: ProcessInput;
}) {
  try {
    const current = await loadCurrentAIPdfSummary(input);
    const mergePlan = buildAIAdaptiveRereadMergePlanFromSummary(
      current.aiPdfImport,
    );
    await updateAIAdaptiveRereadMergePlan({ input, mergePlan });
    await generateAndStoreTaggingV2Plan({ input });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "AI adaptive reread merge plan failed.";
    const current = await loadCurrentAIPdfSummary(input);
    const runPlan = plainObject(current.aiPdfImport.adaptiveRereadRunPlan);
    const preanalysis = plainObject(current.aiPdfImport.preanalysis);
    const sourceKind =
      runPlan.sourceKind === "single_image" ||
      preanalysis.sourceKind === "single_image"
        ? "single_image"
        : "pdf";

    await updateAIAdaptiveRereadMergePlan({
      input,
      mergePlan: failedAIAdaptiveRereadMergePlan({
        sourceKind,
        warnings: [`adaptive reread merge plan failed: ${message}`],
      }),
    });
    await generateAndStoreTaggingV2Plan({ input });
  }
}

async function generateAndStoreAdaptiveRereadRunPlan({
  input,
}: {
  input: ProcessInput;
}) {
  try {
    const current = await loadCurrentAIPdfSummary(input);
    const runPlan = buildAIAdaptiveRereadRunPlanFromProviderRequestPlan({
      mode: "dry_run",
      providerRequestPlan: plainObject(
        current.aiPdfImport.adaptiveRereadProviderRequestPlan,
      ),
    });
    await updateAIAdaptiveRereadRunPlan({ input, runPlan });
    await generateAndStoreAdaptiveRereadMergePlan({ input });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "AI adaptive reread run plan failed.";
    const current = await loadCurrentAIPdfSummary(input);
    const requestPlan = plainObject(
      current.aiPdfImport.adaptiveRereadProviderRequestPlan,
    );
    const preanalysis = plainObject(current.aiPdfImport.preanalysis);
    const sourceKind =
      requestPlan.sourceKind === "single_image" ||
      preanalysis.sourceKind === "single_image"
        ? "single_image"
        : "pdf";

    await updateAIAdaptiveRereadRunPlan({
      input,
      runPlan: failedAIAdaptiveRereadRunPlan({
        sourceKind,
        warnings: [`adaptive reread run plan failed: ${message}`],
      }),
    });
    await generateAndStoreAdaptiveRereadMergePlan({ input });
  }
}

async function generateAndStoreAdaptiveRereadProviderRequestPlan({
  input,
}: {
  input: ProcessInput;
}) {
  try {
    const current = await loadCurrentAIPdfSummary(input);
    const requestPlan =
      buildAIAdaptiveRereadProviderRequestPlanFromAdaptiveRereadPlan(
        plainObject(current.aiPdfImport.adaptiveRereadPlan),
      );
    await updateAIAdaptiveRereadProviderRequestPlan({ input, requestPlan });
    await generateAndStoreAdaptiveRereadRunPlan({ input });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "AI adaptive reread provider request plan failed.";
    const current = await loadCurrentAIPdfSummary(input);
    const adaptiveRereadPlan = plainObject(
      current.aiPdfImport.adaptiveRereadPlan,
    );
    const preanalysis = plainObject(current.aiPdfImport.preanalysis);
    const sourceKind =
      adaptiveRereadPlan.sourceKind === "single_image" ||
      preanalysis.sourceKind === "single_image"
        ? "single_image"
        : "pdf";

    await updateAIAdaptiveRereadProviderRequestPlan({
      input,
      requestPlan: failedAIAdaptiveRereadProviderRequestPlan({
        sourceKind,
        warnings: [
          `adaptive reread provider request plan failed: ${message}`,
        ],
      }),
    });
    await generateAndStoreAdaptiveRereadRunPlan({ input });
  }
}

async function generateAndStoreAdaptiveRereadPlan({
  input,
}: {
  input: ProcessInput;
}) {
  try {
    const current = await loadCurrentAIPdfSummary(input);
    const rereadPlan = buildAIAdaptiveRereadPlanFromSummary(current.aiPdfImport);
    await updateAIAdaptiveRereadPlan({ input, rereadPlan });
    await generateAndStoreAdaptiveRereadProviderRequestPlan({ input });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "AI adaptive reread plan failed.";
    const current = await loadCurrentAIPdfSummary(input);
    const preanalysis = plainObject(current.aiPdfImport.preanalysis);
    const sourceKind =
      preanalysis.sourceKind === "single_image" ? "single_image" : "pdf";

    await updateAIAdaptiveRereadPlan({
      input,
      rereadPlan: failedAIAdaptiveRereadPlan({
        sourceKind,
        warnings: [`adaptive reread plan failed: ${message}`],
      }),
    });
    await generateAndStoreAdaptiveRereadProviderRequestPlan({ input });
  }
}

async function generateAndStoreProviderRunPlan({
  input,
  requestPlan,
}: {
  input: ProcessInput;
  requestPlan: AIProviderRequestPlan;
}) {
  try {
    const runPlan = buildAIProviderRunPlanFromProviderRequestPlan({
      mode: "dry_run",
      providerRequestPlan: requestPlan,
    });
    await updateAIProviderRunPlan({ input, runPlan });
    await generateAndStoreAdaptiveRereadPlan({ input });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "AI provider run plan failed.";
    await updateAIProviderRunPlan({
      input,
      runPlan: failedAIProviderRunPlan({
        sourceKind: requestPlan.sourceKind,
        warnings: [`provider run plan failed: ${message}`],
      }),
    });
    await generateAndStoreAdaptiveRereadPlan({ input });
  }
}

async function generateAndStoreProviderRequestPlan({
  batchPlan,
  input,
}: {
  batchPlan: AIExtractionBatchPlan;
  input: ProcessInput;
}) {
  try {
    const requestPlan =
      buildAIProviderRequestPlanFromExtractionBatchPlan(batchPlan);
    await updateAIProviderRequestPlan({ input, requestPlan });
    await generateAndStoreProviderRunPlan({ input, requestPlan });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "AI provider request plan failed.";
    const requestPlan = failedAIProviderRequestPlan({
      sourceKind: batchPlan.sourceKind,
      warnings: [`provider request plan failed: ${message}`],
    });
    await updateAIProviderRequestPlan({ input, requestPlan });
    await generateAndStoreProviderRunPlan({ input, requestPlan });
  }
}

async function generateAndStoreExtractionBatchPlan({
  input,
  packetPlan,
}: {
  input: ProcessInput;
  packetPlan: AIPacketPlan;
}) {
  try {
    const batchPlan = buildAIExtractionBatchPlanFromPacketPlan(packetPlan);
    await updateAIExtractionBatchPlan({ batchPlan, input });
    await generateAndStoreProviderRequestPlan({ batchPlan, input });
    return batchPlan;
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "AI extraction batch plan failed.";
    const batchPlan = failedAIExtractionBatchPlan({
      sourceHash: packetPlan.sourceHash,
      sourceKind: packetPlan.sourceKind,
      warnings: [`extraction batch plan failed: ${message}`],
    });
    await updateAIExtractionBatchPlan({ batchPlan, input });
    await generateAndStoreProviderRequestPlan({ batchPlan, input });
    return batchPlan;
  }
}

async function generateAndStorePacketPlan({
  input,
  preanalysis,
}: {
  input: ProcessInput;
  preanalysis: AIPreanalysisResult;
}) {
  try {
    const packetPlan = buildAIPacketPlanFromPreanalysis(preanalysis);
    await updateAIPdfPacketPlan({ input, packetPlan });
    const extractionBatchPlan = await generateAndStoreExtractionBatchPlan({
      input,
      packetPlan,
    });
    return { extractionBatchPlan, packetPlan };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "AI packet plan failed.";
    const packetPlan = failedPacketPlan({
      sourceHash: preanalysis.sourceHash,
      sourceKind: preanalysis.sourceKind,
      warnings: [`packet plan failed: ${message}`],
    });
    await updateAIPdfPacketPlan({ input, packetPlan });
    const extractionBatchPlan = await generateAndStoreExtractionBatchPlan({
      input,
      packetPlan,
    });
    return { extractionBatchPlan, packetPlan };
  }
}

async function generateAndStorePdfPreanalysis({
  input,
  pageCount,
}: {
  input: ProcessInput;
  pageCount: number;
}) {
  await updateAIPdfBatchProgress(input, {
    detail: "Analyzing PDF structure before AI extraction.",
    pageCount,
    phase: "preanalyzing_source",
  });

  try {
    const preanalysis = await generatePdfPreanalysis({
      pageCount,
      pdfBuffer: input.pdfBuffer,
    });
    await updateAIPdfPreanalysis({ input, preanalysis });
    const plans = await generateAndStorePacketPlan({ input, preanalysis });
    return { ...plans, preanalysis };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "PDF preanalysis failed.";
    const preanalysis = failedPdfPreanalysis({
      error: message,
      pageCount,
    });
    await updateAIPdfPreanalysis({ input, preanalysis });
    const plans = await generateAndStorePacketPlan({ input, preanalysis });
    return { ...plans, preanalysis };
  }
}

function stripHtml(value: string | null | undefined) {
  return value?.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim() ?? "";
}

function decodeBasicHtmlEntities(value: string) {
  return value
    .replaceAll("&nbsp;", " ")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'");
}

function simpleHtmlToMarkdownSource(value: string | null | undefined) {
  const html = value?.trim();

  if (!html) {
    return "";
  }

  const withoutSimpleBlocks = html
    .replace(/<\/p>\s*<p[^>]*>/gi, "\n\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/?(p|span|strong|b|em|i)[^>]*>/gi, "")
    .trim();

  if (/<[a-z][\s\S]*>/i.test(withoutSimpleBlocks)) {
    return "";
  }

  return decodeBasicHtmlEntities(withoutSimpleBlocks)
    .replace(/\s+\n/g, "\n")
    .replace(/\n\s+/g, "\n")
    .trim();
}

function hasLatexSignal(value: string) {
  return /(?:\$|\\sqrt|\\frac|\\begin|\\left|\\right|\\int|\\sum|\\[a-zA-Z]+|\^|_)/.test(
    value,
  );
}

function balanceInlineDollarMath(value: string) {
  const withoutBlockDelimiters = value.replace(/\$\$/g, "");
  const dollarCount = (withoutBlockDelimiters.match(/\$/g) ?? []).length;

  if (dollarCount % 2 === 0) {
    return value;
  }

  const lastDollarIndex = value.lastIndexOf("$");
  const trailing = lastDollarIndex >= 0 ? value.slice(lastDollarIndex + 1) : "";

  return /[a-zA-Z\\^_=+\-*/()]/.test(trailing) ? `${value}$` : value;
}

function normalizeLatexSource(value: string) {
  return balanceInlineDollarMath(
    value
      .replace(/\\\(([\s\S]*?)\\\)/g, "$$$1$")
      .replace(/\\\[([\s\S]*?)\\\]/g, "$$$$\n$1\n$$$$")
      .trim(),
  );
}

function normalizeAITextFields({
  html,
  source,
}: {
  html: string | null | undefined;
  source: string | null | undefined;
}) {
  const simpleHtmlSource = simpleHtmlToMarkdownSource(html);
  const trimmedSource = source?.trim() ?? "";
  const preferredSource =
    simpleHtmlSource && (hasLatexSignal(simpleHtmlSource) || !trimmedSource)
      ? simpleHtmlSource
      : trimmedSource || simpleHtmlSource;

  if (!preferredSource) {
    return {
      html: html ?? "",
      source: "",
      sourceFormat: "html" as const,
    };
  }

  const normalizedSource = normalizeLatexSource(preferredSource);

  return {
    html: markdownLatexToHtml(normalizedSource),
    source: normalizedSource,
    sourceFormat: "markdown_latex" as const,
  };
}

function escapeAttribute(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function uniqueValues(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

async function loadExistingQuestionCodeKeys(supabase: SupabaseLike) {
  const existing = new Set<string>();
  const pageSize = 1000;

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("questions")
      .select("question_code")
      .range(from, from + pageSize - 1);

    if (error) {
      throw new Error(error.message);
    }

    const rows = (data ?? []) as { question_code: string | null }[];

    for (const row of rows) {
      if (row.question_code) {
        existing.add(questionCodeKey(row.question_code));
      }
    }

    if (rows.length < pageSize) {
      break;
    }
  }

  return existing;
}

function buildPrompt({
  activeTags,
  chunk,
  fileName,
  pageMapping,
  pageCount,
  recoveryOnly = false,
  selectiveExecution = false,
}: {
  activeTags: ActiveTag[];
  chunk?: Pick<AIPdfImportChunkSummary, "pageEnd" | "pageStart">;
  fileName: string;
  pageMapping?: { chunkPage: number; sourcePage: number }[];
  pageCount: number;
  recoveryOnly?: boolean;
  selectiveExecution?: boolean;
}) {
  const tagIdsByFacet = activeTags.reduce<Record<string, string[]>>((groups, tag) => {
    const facet = tag.facet_key ?? "none";
    groups[facet] = [...(groups[facet] ?? []), tag.id];
    return groups;
  }, {});
  const compactTags = Object.entries(tagIdsByFacet)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([facet, tagIds]) => `${facet}: ${tagIds.join(", ")}`)
    .join("; ");

  return [
    "You are importing a PDF question set into a question bank.",
    "Read the entire document context in order. Questions, solutions, and figures may continue across page boundaries; do not split one question only because it crosses pages.",
    "Extract only actual questions that ask the student to answer, solve, prove, evaluate, choose, or fill in something.",
    "Do not create question records for section headings, page titles, unit titles, directions-only blocks, answer keys, or standalone labels. Use headings only as context for nearby real questions.",
    "Return ONLY valid JSON. Do not wrap it in markdown.",
    "",
    `File: ${fileName}`,
    `Original source page count: ${pageCount}`,
    recoveryOnly
      ? "This is a targeted recovery pass over only the missing source pages. Extract only genuinely new questions from the visible pages. Do not restate questions already represented elsewhere in the source, and preserve the visible source question number when present."
      : "",
    chunk
      ? pageMapping?.length
        ? [
            "",
            `This chunk covers original source pages ${chunk.pageStart}-${chunk.pageEnd}.`,
            `This chunk PDF contains ${pageMapping.length} visible page(s).`,
            "Preserve visible question numbers only as question_number.",
            "Do not invent content from adjacent chunks or hidden white regions.",
          ].join("\n")
        : [
          "",
          `Chunk page range: pages ${chunk.pageStart}-${chunk.pageEnd}.`,
          `You are extracting questions only from pages ${chunk.pageStart}-${chunk.pageEnd}.`,
          "Return questions found in this page range.",
          "Preserve visible question numbers only as question_number.",
          "Do not invent missing pages.",
          "Do not concatenate content from other chunks or guess cross-page continuations.",
          ].join("\n")
      : "",
    pageMapping?.length
      ? [
          "",
          selectiveExecution
            ? "This is a conservative selected-page PDF subset. Every included page is in original reading order; pages not included were intentionally excluded by a safe planning step."
            : "This is a non-overlapping full-PDF segment. White regions on the first or last page intentionally hide content assigned to an adjacent segment.",
          selectiveExecution
            ? "Use only visible included pages. Never infer content from source pages that are not present in this subset."
            : "Extract only visible content. Never infer or reconstruct content hidden by white regions.",
          `Chunk-page to original-source-page mapping: ${pageMapping
            .map((item) => `${item.chunkPage}->${item.sourcePage}`)
            .join(", ")}.`,
          "Return page_refs and asset placeholder page values using CHUNK page numbers; the server maps them back to original source pages.",
        ].join("\n")
      : "",
    "",
    "Allowed active assignable tag_ids by facet. Every listed candidate below is a full tag_id. Output full tag_ids exactly as written, never abbreviate or shorten them. Use only these exact IDs; do not create, rename, or suggest tags:",
    compactTags || "(none)",
    "",
    "Taxonomy tagging goal:",
    "- For every question, try to cover at least 4 of the 5 official taxonomy facets when matching tags exist in the list above.",
    "- The five facets are normally curriculum, concept, method, task, and difficulty/form. Use the facet groups above as the source of truth.",
    "- Curriculum coverage should be generous: if a question accurately belongs to multiple systems, include all matching full curriculum tag_ids, such as AP, SAT, BC, Common Core, IB, or A-Level. Do not choose only one curriculum tag when several listed curriculum IDs are accurate.",
    "- Do not force a weak or false tag. If fewer than 4 facets have an accurate existing tag, use the accurate tags only and add a warning explaining which facet was missing.",
    "- Prefer the most specific available leaf-like tag_id in each facet. Avoid broad course or parent-level IDs when a more specific child tag is listed.",
    "- Reuse tag_ids freely. Many questions can share the same curriculum, concept, method, task, or form tags.",
    "",
    "Taxonomy tagging thought process to follow silently before writing JSON:",
    "1. Identify the math topic and every relevant course/unit system from the question stem and solution.",
    "2. Choose one or more concept tags for the core idea being tested.",
    "3. Choose method tags for the technique required to solve it, such as factoring, differentiation, substitution, graph interpretation, or equation solving.",
    "4. Choose task/form tags for the student action and item format, such as evaluate, solve, prove, multiple choice, free response, or fill blank, when such tags exist.",
    "5. Choose all accurate full curriculum tag_ids across multiple systems when the listed tag_ids support them.",
    "6. Choose difficulty/form tags when the listed tag_ids support them.",
    "7. Check that selected tag_ids are full exact IDs from the allowed list and cover at least 4 facets when possible.",
    "",
    "Complete tagging examples. These examples show how to tag a typical question. In real output, use exact tag_ids from the allowed list above; if an example id is not present, choose the closest accurate allowed leaf tag_id and do not invent it:",
    JSON.stringify(
      [
        {
          extracted_question: {
            content_source:
              "If $f'(x)=1+2x-x^3$, then $f$ has a local minimum at $x=\\ ?$",
            question_type: "frq",
            solution_summary:
              "Find critical points from f'(x)=0, then use sign change or first derivative test to identify a local minimum.",
          },
          selected_tag_ids: [
            "math.curriculum.ap.ap_calculus_ab.analytical_applications_derivatives",
            "math.curriculum.ap.ap_calculus_ab.contextual_applications_derivatives",
            "math.curriculum.bc.calculus_12.derivatives",
            "math.curriculum.bc.calculus_12.applications_derivatives",
            "math.concept.calculus.derivatives.local_extrema",
            "math.concept.calculus.derivatives.critical_points",
            "math.method.calculus.first_derivative_test",
            "math.task.find_local_minimum",
            "math.form.fill_blank",
          ],
          why:
            "This includes multiple full curriculum IDs because the same derivative-extrema question can fit AP Calculus AB and BC Calculus 12. It also covers concept, method, task, and form.",
        },
        {
          extracted_question: {
            content_source:
              "A gym charges a $25 sign-up fee and $12 per class. If a student paid $109 total, how many classes did the student take?",
            question_type: "mcq",
            solution_summary:
              "Model the situation as 25+12x=109 and solve the resulting linear equation.",
          },
          selected_tag_ids: [
            "math.curriculum.sat.algebra",
            "math.curriculum.common_core.algebra",
            "math.curriculum.bc.precalculus_11.functions_relations",
            "math.concept.algebra.linear_equations",
            "math.concept.algebra.linear_models",
            "math.method.algebra.equation_solving",
            "math.task.solve",
            "math.form.multiple_choice",
          ],
          why:
            "This includes all accurate full curriculum IDs from multiple systems, then adds concept, method, task, and item form tags.",
        },
      ],
      null,
      2,
    ),
    "",
    "JSON schema:",
    JSON.stringify({
      questions: [
        {
          asset_placeholders: [
            {
              alt: "short figure alt text",
              bbox: { height: 0.2, width: 0.4, x: 0.1, y: 0.2 },
              page: 1,
              placeholder: "{{asset:figure_1}}",
            },
          ],
          content_html: "<p>Find the derivative of $y=x^2\\sin(x)$ with {{asset:figure_1}} where the image belongs.</p>",
          content_source: "Editable Markdown + LaTeX source, same meaning as content_html. Use $...$ for inline math.",
          difficulty_rating: 500,
          options: [
            { id: "A", label: "A", content_html: "$2x\\sin(x)+x^2\\cos(x)$" },
            { id: "B", label: "B", content_html: "$x^2\\sin(x)$" },
          ],
          answer_spec: {
            kind: "mcq",
            correct_option_ids: ["A"],
            allow_multiple: false,
          },
          page_refs: [1, 2],
          question_number: "Visible source number such as 3, 3.1, 3(a), or FRQ 2. Omit if missing.",
          question_type: "frq",
          solution_html: "<p>Use the product rule: $y'=2x\\sin(x)+x^2\\cos(x)$.</p>",
          solution_source: "Editable solution source.",
          tag_ids: ["math.concept.calculus.derivatives.chain_rule"],
          title: "Short plain-text title, no HTML, no LaTeX, no section heading",
        },
      ],
      warnings: ["Any uncertainty about extraction."],
    }),
    "",
    "Rules:",
    "- A question record must contain a real prompt in content_html/content_source. If a visible line is only a heading such as 'Unit 3 Review', 'Multiple Choice', 'Part A', 'Solutions', or 'Directions', skip it and do not output it as a question.",
    "- title must be a short plain-text label for the question, usually 3-10 words. Never put HTML, markdown, LaTeX delimiters, full question text, options, page headings, section headings, or answer text in title.",
    "- Good title examples: 'Derivative local minimum', 'Linear equation word problem', 'Circle tangent angle'. Bad title examples: '<p>...</p>', '$f\'(x)=...$', 'Multiple Choice', 'Chapter 2 Review'.",
    "- content_html is required and must be sanitized-friendly HTML.",
    "- For multiple-choice questions, include every visible option in options as {id,label,content_html}. Also include answer_spec.kind='mcq' and answer_spec.correct_option_ids when the correct answer is visible or clearly stated in the source.",
    "- For fill-blank questions with a visible or clearly stated final answer, set question_type='fill_blank' and include answer_spec.kind='fill_blank', final_answers, accepted_answers, equivalence, numeric_tolerance, and case_sensitive.",
    "- If the answer is not visible or not certain, leave answer_spec empty or use only {kind: question_type}; do not invent correct answers.",
    "- For every question, include solution_source and solution_html when the source shows work, an answer key, an explanation, or enough visible evidence to derive the solution safely.",
    "- If no solution or explanation is visible or reliable, leave solution_source and solution_html empty and add a warning; do not invent a fake solution.",
    "- Prefer writing content_source and solution_source as clean Markdown + LaTeX. Use $...$ for inline math and $$ blocks for display math.",
    "- Wrap every math variable, expression, equation, and formula in $...$ inside content_html, solution_html, option content_html, content_source, and solution_source so the renderer can detect it.",
    "- Examples: write <p>Find the derivative of $y=x^2\\sin(x)$.</p>, not <p>Find the derivative of y = x^2 sin(x).</p>. Write <p>The derivative is $f'(x)$.</p>, not plain f'(x).",
    "- Never leave unmatched dollar signs. For blanks such as x =, write $x =$ with a closing dollar.",
    "- Convert common math text to LaTeX in source fields: sqrt(x) -> \\sqrt{x}, pi -> \\pi when mathematical, fractions -> \\frac{...}{...}.",
    "- If a figure, chart, graph, table image, or diagram is important to the question, create one asset_placeholders entry so the system can crop it and display it in the question image gallery.",
    "- If the image must appear at an exact inline position, also put the exact placeholder string inside content_html or solution_html at that location.",
    "- Inline placeholders are optional because cropped images are also attached as question_assets and shown below the question detail.",
    "- Use placeholder strings exactly like {{asset:figure_1}}. Do not alter braces, spacing, or capitalization.",
    "- Bboxes are normalized page coordinates from top-left, all values 0..1.",
    "- Use question_number only for the visible number from the PDF. Do not invent database question_code values; the server always generates those.",
    "- Do not normalize visible numbers aggressively: 3, 3.1, 3(a), and FRQ 2 are different display values.",
    "- Assign multiple tag_ids when they accurately describe the question. A single question can and should reuse existing tags across several facets when relevant.",
    "- It is okay for many questions to reuse the same tag_id if they cover the same concept, method, task, curriculum, or difficulty signal.",
    "- Prefer specific leaf tag_ids over broad parent-like IDs. Only use tag_ids from the list above.",
    "- Only output tag_ids listed above. If no existing tag fits, leave tag_ids empty and add a warning. Do not output any alternate tag identifier fields.",
    "- Keep questions as draft-quality records for human review; do not invent answers when unsure.",
  ].join("\n");
}

function remapSegmentExtractionPages({
  extraction,
  pageMapping,
}: {
  extraction: AIPdfExtraction;
  pageMapping: { chunkPage: number; sourcePage: number }[];
}) {
  const sourcePageByChunkPage = new Map(
    pageMapping.map((item) => [item.chunkPage, item.sourcePage]),
  );
  const mapPage = (page: number) => sourcePageByChunkPage.get(page) ?? page;

  for (const question of extraction.questions) {
    question.page_refs = Array.from(new Set(question.page_refs.map(mapPage)));
    question.asset_placeholders = question.asset_placeholders.map(
      (placeholder) => ({
        ...placeholder,
        page: mapPage(placeholder.page),
      }),
    );
  }

  return extraction;
}

async function loadActiveTags(supabase: SupabaseLike) {
  const { data, error } = await supabase
    .from("taxonomy_nodes")
    .select("tag_id, facet_key")
    .eq("is_assignable", true)
    .eq("status", "active")
    .order("facet_key", { ascending: true })
    .order("tag_id", { ascending: true })
    // perf-budget-allow-large-query: AI PDF normalization validates against the bounded active leaf taxonomy catalog.
    .limit(1000);

  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as {
    facet_key: string | null;
    tag_id: string;
  }[]).map((tag) => ({
    facet_key: tag.facet_key,
    id: tag.tag_id,
  }));
}

async function loadActiveLeafTaxonomyCandidates(supabase: SupabaseLike) {
  const { catalog, errorMessage } = await loadTaxonomyCatalog(supabase);

  if (errorMessage) {
    throw new Error(errorMessage);
  }

  const parentTagIds = new Set(
    catalog.nodes.flatMap((node) => node.parent_tag_ids ?? []),
  );

  return catalog.nodes
    .filter(
      (node) =>
        node.facet_key &&
        ["curriculum", "concept", "method", "task", "form"].includes(
          node.facet_key,
        ) &&
        node.is_assignable &&
        !parentTagIds.has(node.tag_id),
    )
    .map(
      (node): AIQuestionBlueprintTaxonomyCandidate => ({
        aliases: node.aliases ?? [],
        description: node.description ?? null,
        facetKey: node.facet_key as AIQuestionBlueprintTaxonomyCandidate["facetKey"],
        label: node.label,
        tagId: node.tag_id,
      }),
    );
}

async function buildImportJson({
  activeTags,
  batchId,
  chunk,
  extraction,
  profileId,
  provider,
  questionIndexOffset = 0,
  recovery,
  supabase,
}: {
  activeTags: ActiveTag[];
  batchId: string;
  chunk?: Pick<AIPdfImportChunkSummary, "chunkIndex" | "pageEnd" | "pageStart">;
  extraction: AIPdfExtraction;
  profileId: string;
  provider: { id: string; model: string; name: string; provider: string };
  questionIndexOffset?: number;
  recovery?: {
    originalBatchId: string;
    recoveryPlanHash: string;
    sourceAssetId: string;
    windowIds: string[];
  };
  supabase: SupabaseLike;
}) {
  const activeTagIds = new Set(activeTags.map((tag) => tag.id));
  const existingQuestionCodes = await loadExistingQuestionCodeKeys(supabase);
  const usedQuestionCodes = new Set<string>();
  const usedVisibleQuestionNumbers = new Set<string>();

  const questions = [];

  for (const [index, question] of extraction.questions.entries()) {
    const globalQuestionIndex = questionIndexOffset + index;
    const tagIds = new Set<string>();

    for (const tagId of question.tag_ids) {
      const normalizedTagId = tagId.trim();
      if (activeTagIds.has(normalizedTagId)) {
        tagIds.add(normalizedTagId);
      } else if (normalizedTagId) {
        extraction.warnings.push(
          `Question ${globalQuestionIndex + 1}: unknown taxonomy tag_id "${normalizedTagId}" was ignored.`,
        );
      }
    }

    const rawAiQuestionCode = question.question_code?.trim() || "";
    const visibleQuestionNumber = (
      question.question_number?.trim() ||
      rawAiQuestionCode ||
      ""
    ).slice(0, 80);
    const visibleNumberKey = visibleQuestionNumber
      ? visibleQuestionNumberKey(visibleQuestionNumber)
      : "";
    const questionCode = generateAIPdfQuestionCodeForImport({
      batchId,
      existingQuestionCodes,
      index: globalQuestionIndex,
      usedQuestionCodes,
    });

    if (!visibleQuestionNumber) {
      extraction.warnings.push(
        `Question ${globalQuestionIndex + 1}: missing visible question number; server-generated question_code ${questionCode} was used.`,
      );
    } else if (usedVisibleQuestionNumbers.has(visibleNumberKey)) {
      extraction.warnings.push(
        `Question ${globalQuestionIndex + 1}: duplicate visible question number "${visibleQuestionNumber}" was kept for review only; server-generated question_code ${questionCode} was used.`,
      );
    } else {
      usedVisibleQuestionNumbers.add(visibleNumberKey);
    }

    question.question_code = questionCode;
    const contentFields = normalizeAITextFields({
      html: question.content_html,
      source: question.content_source,
    });
    const solutionFields = normalizeAITextFields({
      html: question.solution_html,
      source: question.solution_source,
    });

    const contentHtml = contentFields.html || question.content_html;
    const contentSource = contentFields.source || stripHtml(question.content_html);
    const solutionHtml = solutionFields.html || question.solution_html || "";
    const solutionSource =
      solutionFields.source || stripHtml(question.solution_html) || "";
    if (!solutionHtml.trim() && !solutionSource.trim()) {
      extraction.warnings.push(
        `Question ${globalQuestionIndex + 1}: missing solution/explanation; reviewer must add solution guidance before approval.`,
      );
    }
    const questionPayload: Record<string, unknown> = {
      ai_metadata: {
        asset_placeholders: question.asset_placeholders,
        chunk:
          chunk === undefined
            ? null
            : {
                chunk_index: chunk.chunkIndex,
                page_end: chunk.pageEnd,
                page_start: chunk.pageStart,
              },
        order_index: globalQuestionIndex,
        page_refs: question.page_refs,
        provider,
        raw_ai_question_code: rawAiQuestionCode || null,
        recovery: recovery
          ? {
              original_batch_id: recovery.originalBatchId,
              plan_hash: recovery.recoveryPlanHash,
              source_asset_id: recovery.sourceAssetId,
              window_ids: recovery.windowIds,
            }
          : null,
        recoveryProvenance: recovery ? "recovery" : "original",
        source: "ai_pdf_import",
        tag_decisions: {
          tag_ids: question.tag_ids,
        },
        visible_question_number: visibleQuestionNumber || null,
      },
      content_html: contentHtml,
      content_source: contentSource,
      content_source_format: contentFields.sourceFormat,
      difficulty_rating: question.difficulty_rating,
      answer_spec: question.answer_spec,
      options: question.options,
      question_code: questionCode,
      question_type: question.question_type,
      solution_source_format: solutionFields.sourceFormat,
      tag_ids: Array.from(tagIds),
      title: question.title,
    };

    if (solutionHtml.trim()) {
      questionPayload.solution_html = solutionHtml;
    }

    if (solutionSource.trim()) {
      questionPayload.solution_source = solutionSource;
    }

    questions.push(questionPayload);
  }

  return JSON.stringify({ questions });
}

async function uploadQuestionAsset({
  alt,
  image,
  placeholder,
  profileId,
  questionId,
  supabase,
}: {
  alt: string;
  image: Buffer;
  placeholder: string;
  profileId: string;
  questionId: string;
  supabase: SupabaseLike;
}) {
  if (image.length > QUESTION_ASSET_MAX_BYTES) {
    throw new Error(`Cropped image ${placeholder} exceeds image size limit.`);
  }

  const assetId = crypto.randomUUID();
  const objectPath = `questions/${questionId}/${assetId}.png`;
  const label = `${placeholder.replace(/[{}:]/g, "")}.png`;
  const { error: insertError } = await supabase.from("question_assets").insert({
    alt_text: alt || "AI imported figure",
    asset_kind: "image",
    created_by: profileId,
    display_order: 0,
    id: assetId,
    label,
    question_id: questionId,
    storage_bucket: QUESTION_ASSETS_BUCKET,
    storage_path: objectPath,
  });

  if (insertError) {
    throw new Error(insertError.message);
  }

  const { error: uploadError } = await supabase.storage
    .from(QUESTION_ASSETS_BUCKET)
    .upload(objectPath, image, {
      contentType: "image/png",
      upsert: false,
    });

  if (uploadError) {
    await supabase.from("question_assets").delete().eq("id", assetId);
    throw new Error(uploadError.message);
  }

  const { data } = supabase.storage
    .from(QUESTION_ASSETS_BUCKET)
    .getPublicUrl(objectPath);

  return {
    assetId,
    html: `<img src="${escapeAttribute(data.publicUrl)}" alt="${escapeAttribute(
      alt || "AI imported figure",
    )}" data-ai-placeholder="${escapeAttribute(placeholder)}" />`,
    publicUrl: data.publicUrl,
  };
}

function replacePlaceholder(value: string | null, placeholder: string, html: string) {
  return value?.replaceAll(placeholder, html) ?? null;
}

async function attachCroppedAssets({
  createdQuestions,
  extraction,
  pdfBuffer,
  profileId,
  renderedPages,
  supabase,
}: {
  createdQuestions: { id: string; questionCode: string }[];
  extraction: AIPdfExtraction;
  pdfBuffer: Buffer;
  profileId: string;
  renderedPages?: RenderedPage[];
  supabase: SupabaseLike;
}) {
  const byCode = new Map(
    createdQuestions.map((question) => [question.questionCode.toLowerCase(), question]),
  );
  const placeholders = extraction.questions.flatMap((question) =>
    question.asset_placeholders.map((placeholder) => ({
      placeholder,
      question,
    })),
  );
  const warnings: string[] = [];
  let uploadedCount = 0;

  if (!placeholders.length) {
    return { uploadedCount, warnings };
  }

  let pages;

  try {
    pages = renderedPages?.length ? renderedPages : await renderPdfPages(pdfBuffer);
  } catch (error) {
    return {
      uploadedCount,
      warnings: [
        `PDF page rendering for image crops failed: ${
          error instanceof Error ? error.message : "Unknown render error"
        }`,
      ],
    };
  }

  for (const { placeholder, question } of placeholders) {
    const questionCode =
      question.question_code?.trim() ||
      createdQuestions.find((created) => !byCode.has(created.questionCode))?.questionCode;
    const created = questionCode ? byCode.get(questionCode.toLowerCase()) : null;

    if (!created) {
      warnings.push(`Could not find created question for ${placeholder.placeholder}.`);
      continue;
    }

    try {
      const cropped = await cropPdfPlaceholderImage({
        pages,
        placeholder,
      });
      const uploaded = await uploadQuestionAsset({
        alt: placeholder.alt ?? "AI imported figure",
        image: cropped,
        placeholder: placeholder.placeholder,
        profileId,
        questionId: created.id,
        supabase,
      });

      const { data: questionRow, error: questionError } = await supabase
        .from("questions")
        .select("content_html, content_source, solution_html, solution_source")
        .eq("id", created.id)
        .single();

      if (questionError) {
        throw new Error(questionError.message);
      }

      const nextContentHtml = replacePlaceholder(
        questionRow.content_html,
        placeholder.placeholder,
        uploaded.html,
      );
      const nextContentSource = replacePlaceholder(
        questionRow.content_source,
        placeholder.placeholder,
        uploaded.html,
      );
      const nextSolutionHtml = replacePlaceholder(
        questionRow.solution_html,
        placeholder.placeholder,
        uploaded.html,
      );
      const nextSolutionSource = replacePlaceholder(
        questionRow.solution_source,
        placeholder.placeholder,
        uploaded.html,
      );
      const wasEmbedded =
        nextContentHtml !== questionRow.content_html ||
        nextSolutionHtml !== questionRow.solution_html;

      if (!wasEmbedded) {
        warnings.push(
          `Placeholder ${placeholder.placeholder} was not found in content_html or solution_html; crop was attached as a question asset only.`,
        );
      }

      const { error: updateError } = await supabase
        .from("questions")
        .update({
          content_html: nextContentHtml
            ? sanitizeContentHtml(nextContentHtml)
            : "",
          content_source: nextContentSource ?? "",
          solution_html: nextSolutionHtml
            ? sanitizeContentHtml(nextSolutionHtml)
            : null,
          solution_source: nextSolutionSource ?? "",
          updated_by: profileId,
        })
        .eq("id", created.id);

      if (updateError) {
        throw new Error(updateError.message);
      }

      uploadedCount += 1;
    } catch (error) {
      warnings.push(
        `Crop ${placeholder.placeholder} failed: ${
          error instanceof Error ? error.message : "Unknown crop error"
        }`,
      );
    }
  }

  return { uploadedCount, warnings };
}

function providerPreparationCopy(strategy: AiPdfInputStrategy) {
  if (strategy === "openai_file") {
    return {
      detail: "Preparing full PDF input for the model.",
      phase: "preparing_pdf_input",
    };
  }

  if (strategy === "gemini_native_pdf") {
    return {
      detail: "Preparing Gemini Native full PDF input for the model.",
      phase: "preparing_native_pdf_input",
    };
  }

  if (strategy === "page_images") {
    return {
      detail: "Rendering PDF pages as ordered images for the model.",
      phase: "rendering_page_images",
    };
  }

  return {
    detail: "Preparing mock provider input.",
    phase: "preparing_provider_input",
  };
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function mockBlueprintObservationProviderResponse(pageCount: number) {
  return {
    observationPackets: [
      {
        confidence: 0.82,
        observedQuestionBlocks: [
          {
            answerStructureHint: "manual_response_or_structured_work",
            boundedEvidenceSnippets: [
              "Mock blueprint observation evidence: visible prompt asks for mathematical reasoning.",
            ],
            cognitiveDemandHint: "reasoning_or_explanation",
            distractorPatternHint: null,
            promptVerb: "determine",
            representationHints: ["text", "symbolic"],
            stemPattern: "determine_prompt",
            styleNotes: ["mock observation mode", "bounded evidence only"],
            taxonomySignalHints: ["math_structure_signal"],
            visualDescription: null,
            warnings: [],
          },
        ],
        sourceRefs: {
          assetRefs: [],
          pageNumbers: pageCount > 0 ? [1] : [],
        },
        warnings: ["Mock blueprint observation provider response used."],
      },
    ],
    warnings: ["Mock blueprint observation provider response used."],
  };
}

async function loadDeepSeekBlueprintAnalyzerProvider(input: ProcessInput) {
  try {
    const current = await loadCurrentAIPdfSummary(input);
    const requestedMode = normalizeQuestionBlueprintModelQualityMode(
      current.aiPdfImport.blueprintModelQualityMode,
    );
    const profiles = await listEnabledAIProviderProfilesForServerUse();
    const selection = selectQuestionBlueprintDeepSeekProfile({
      profiles,
      requestedMode,
    });
    const profile = selection.profile;

    if (!profile) {
      return {
        actualMode: selection.actualMode,
        fallbackReason: selection.fallbackReason,
        provider: null,
        requestedMode: selection.requestedMode,
        warnings: [QUESTION_BLUEPRINT_ANALYZER_MISSING_DEEPSEEK_WARNING],
      };
    }

    return {
      actualMode: selection.actualMode,
      fallbackReason: selection.fallbackReason,
      provider: await loadAIProviderProfileForServerUse({
        profileId: profile.id,
      }),
      requestedMode: selection.requestedMode,
      warnings: selection.fallbackReason ? [selection.fallbackReason] : ([] as string[]),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    return {
      actualMode: "fast" as const,
      fallbackReason: null,
      provider: null,
      requestedMode: "fast" as const,
      warnings: uniqueStrings([
        QUESTION_BLUEPRINT_ANALYZER_MISSING_DEEPSEEK_WARNING,
        `DeepSeek blueprint analyzer could not be loaded: ${message}`,
      ]),
    };
  }
}

async function buildAndStoreQuestionBlueprintDraftPlan({
  blueprintObservationPlan,
  input,
  pageCount,
  providerInput,
  providerSummary,
}: {
  blueprintObservationPlan: AIBlueprintObservationPlan;
  input: ProcessInput;
  pageCount: number;
  providerInput: ReturnType<typeof describeAiPdfProviderInput>;
  providerSummary: { id: string; model: string; name: string; provider: string };
}) {
  await updateAIPdfBatchProgress(input, {
    detail:
      "Clustering observed question blocks into focused blueprint candidates.",
    pageCount,
    phase: "question_blueprint_clustering",
    provider: providerSummary,
    sourceInput: providerInput.strategy,
  });

  const blueprintObservationClusterPlan = buildAIBlueprintObservationClusterPlan({
    observationPlan: blueprintObservationPlan,
  });
  await updateAIBlueprintObservationClusterPlan({
    blueprintObservationClusterPlan,
    input,
  });
  const clusterAnalyzerPlans = buildClusteredBlueprintObservationAnalyzerPlans({
    clusterPlan: blueprintObservationClusterPlan,
    observationPlan: blueprintObservationPlan,
  });

  await updateAIPdfBatchProgress(input, {
    detail: `Running DeepSeek text-only blueprint analyzer on ${clusterAnalyzerPlans.length} observation cluster(s).`,
    pageCount,
    phase: "question_blueprint_analyzing",
    provider: providerSummary,
    sourceInput: providerInput.strategy,
    warnings: blueprintObservationClusterPlan.warnings,
  });

  const warnings: string[] = [];
  let activeTags: ActiveTag[] = [];
  let taxonomyCandidates: AIQuestionBlueprintTaxonomyCandidate[] = [];

  try {
    activeTags = await loadActiveTags(input.supabase);
  } catch {
    warnings.push("Question blueprint analyzer could not validate taxonomy IDs.");
  }
  try {
    taxonomyCandidates = await loadActiveLeafTaxonomyCandidates(input.supabase);
  } catch {
    warnings.push(
      "Question blueprint analyzer could not load active assignable leaf taxonomy candidates.",
    );
  }

  const knownTaxonomyTagIds = taxonomyCandidates.length
    ? new Set(taxonomyCandidates.map((tag) => tag.tagId))
    : activeTags.length
      ? new Set(activeTags.map((tag) => tag.id))
      : undefined;
  const analyzerRoute = input.routingOrganizationId
    ? await resolveAIProviderRoute({
        operationKind: "blueprint_analyze_text",
        organizationId: input.routingOrganizationId,
        supabase: input.supabase,
      })
    : null;
  const analyzerProvider = analyzerRoute
    ? null
    : await loadDeepSeekBlueprintAnalyzerProvider(input);
  warnings.push(...(analyzerProvider?.warnings ?? []));
  await updateAIPdfBatchProgress(input, {
    ...(analyzerProvider?.fallbackReason
      ? { blueprintModelQualityFallbackReason: analyzerProvider.fallbackReason }
      : {}),
    blueprintModelQualityMode: analyzerProvider?.actualMode ?? "admin_routed",
    blueprintModelQualityRequestedMode:
      analyzerProvider?.requestedMode ?? "admin_routed",
    detail: `Running DeepSeek text-only blueprint analyzer on ${clusterAnalyzerPlans.length} observation cluster(s).`,
    pageCount,
    phase: "question_blueprint_analyzing",
    provider: providerSummary,
    sourceInput: providerInput.strategy,
    warnings: uniqueStrings([
      ...blueprintObservationClusterPlan.warnings,
      ...warnings,
    ]),
  });

  let questionBlueprintDraftPlan: AIQuestionBlueprintDraftPlan;

  if (!clusterAnalyzerPlans.length) {
    questionBlueprintDraftPlan = skippedQuestionBlueprintDraftPlan({
      observationPlan: blueprintObservationPlan,
      warnings: uniqueStrings([
        ...warnings,
        ...blueprintObservationClusterPlan.warnings,
        "question_blueprint_analyzer_missing_clustered_inputs",
      ]),
    });
  } else if (!analyzerRoute && !analyzerProvider?.provider) {
    questionBlueprintDraftPlan = skippedQuestionBlueprintDraftPlan({
      observationPlan: blueprintObservationPlan,
      warnings: uniqueStrings([
        ...warnings,
        ...blueprintObservationClusterPlan.warnings,
      ]),
    });
  } else {
    const clusterDraftPlans: {
      cluster: (typeof clusterAnalyzerPlans)[number]["cluster"];
      draftPlan: AIQuestionBlueprintDraftPlan;
    }[] = [];
    const clusterWarnings: string[] = [];

    for (const clusterAnalyzerPlan of clusterAnalyzerPlans) {
      try {
        const executeAnalyzer = (
          provider: Awaited<ReturnType<typeof loadAIProviderProfileForServerUse>>,
          providerRetryMaxAttempts?: number,
        ) =>
          runWithAIProviderRetry({
            onRetry: (retry) =>
              updateAIPdfProviderRetryProgress({
                input,
                pageCount,
                provider: providerSummary,
                retry,
                sourceInput: providerInput.strategy,
              }),
            operation: "blueprint_generation",
            policy: providerRetryMaxAttempts
              ? { maxAttempts: providerRetryMaxAttempts }
              : undefined,
            run: () =>
              executeDeepSeekQuestionBlueprintAnalyzer({
                debugContext: {
                  batchId: input.batchId,
                  fileName: input.fileName,
                  jobId: input.jobId,
                  providerProfileId: provider.id,
                  sourceAssetId: input.sourceAssetId,
                  sourceObjectPath: input.sourceObjectPath,
                },
                knownTaxonomyTagIds,
                observationPlan: clusterAnalyzerPlan.observationPlan,
                provider,
                taxonomyCandidatesByFacet: buildQuestionBlueprintTaxonomyCandidateList({
                  candidates: taxonomyCandidates,
                  observationPlan: clusterAnalyzerPlan.observationPlan,
                }),
              }),
          });
        const draftPlan = analyzerRoute
          ? (
              await runWithAIProviderRoute({
                execute: async (provider, attemptBudget) =>
                  (await executeAnalyzer(provider, attemptBudget.maxAttempts)).value,
                leaseOwner:
                  input.routingLeaseOwner ??
                  `blueprint-analyzer:${input.batchId}`,
                route: analyzerRoute,
                supabase: input.supabase,
              })
            ).value
          : (await executeAnalyzer(analyzerProvider!.provider!)).value;

        clusterDraftPlans.push({
          cluster: clusterAnalyzerPlan.cluster,
          draftPlan,
        });
      } catch (error) {
        const safeError = safeAIProviderErrorState({
          error: classifyAIProviderError({
            error,
            operation: "blueprint_generation",
          }),
          maxAttempts: 4,
        });
        const warning = `Blueprint analyzer could not complete cluster ${clusterAnalyzerPlan.cluster.clusterId}. ${safeError.safeMessage}`;
        clusterWarnings.push(warning);
        clusterDraftPlans.push({
          cluster: clusterAnalyzerPlan.cluster,
          draftPlan: failedQuestionBlueprintDraftPlan({
            observationPlan: clusterAnalyzerPlan.observationPlan,
            warnings: uniqueStrings([
              warning,
              ...clusterAnalyzerPlan.cluster.warnings,
            ]),
          }),
        });
      }
    }

    questionBlueprintDraftPlan =
      buildQuestionBlueprintDraftPlanFromClusteredDraftPlans({
        clusterDraftPlans,
        observationPlan: blueprintObservationPlan,
        warnings: uniqueStrings([
          ...warnings,
          ...blueprintObservationClusterPlan.warnings,
          ...clusterWarnings,
        ]),
      });
  }

  await updateAIQuestionBlueprintDraftPlan({
    input,
    questionBlueprintDraftPlan,
  });
  await updateAIPdfBatchProgress(input, {
    detail:
      "Question blueprint analyzer finished. No generated questions or Review Drafts were created.",
    pageCount,
    phase: "question_blueprint_analyzed",
    provider: providerSummary,
    sourceInput: providerInput.strategy,
    warnings: uniqueStrings([
      ...blueprintObservationPlan.warnings,
      ...questionBlueprintDraftPlan.warnings,
    ]),
  });

  return questionBlueprintDraftPlan;
}

async function buildAndStoreQuestionBlueprintReviewPlans({
  input,
  pageCount,
  providerInput,
  providerSummary,
  questionBlueprintDraftPlan,
}: {
  input: ProcessInput;
  pageCount: number;
  providerInput: ReturnType<typeof describeAiPdfProviderInput>;
  providerSummary: { id: string; model: string; name: string; provider: string };
  questionBlueprintDraftPlan: AIQuestionBlueprintDraftPlan;
}) {
  await updateAIPdfBatchProgress(input, {
    detail:
      "Planning human review actions and blueprint library persistence contracts.",
    pageCount,
    phase: "question_blueprint_review_planning",
    provider: providerSummary,
    sourceInput: providerInput.strategy,
  });

  const reviewPlan = buildQuestionBlueprintReviewActionPlan({
    draftPlan: questionBlueprintDraftPlan,
  });
  const libraryPersistencePlan = buildQuestionBlueprintLibraryPersistencePlan({
    draftPlan: questionBlueprintDraftPlan,
    reviewPlan,
  });

  await updateQuestionBlueprintReviewAndLibraryPlans({
    input,
    libraryPersistencePlan,
    reviewPlan,
  });
  await updateAIPdfBatchProgress(input, {
    detail:
      "Blueprint review/library planning finished. Library persistence is planned only.",
    pageCount,
    phase: "question_blueprint_review_planned",
    provider: providerSummary,
    sourceInput: providerInput.strategy,
    warnings: uniqueStrings([
      ...questionBlueprintDraftPlan.warnings,
      ...reviewPlan.warnings,
      ...libraryPersistencePlan.warnings,
    ]),
  });

  return {
    libraryPersistencePlan,
    reviewPlan,
  };
}

async function processAIPdfBlueprintObservation({
  input,
  pageCount,
  provider,
  providerInput,
  providerSummary,
}: {
  input: ProcessInput;
  pageCount: number;
  provider: Awaited<ReturnType<typeof loadAIProviderProfileForServerUse>>;
  providerInput: ReturnType<typeof describeAiPdfProviderInput>;
  providerSummary: { id: string; model: string; name: string; provider: string };
}) {
  if (input.chunkIndex !== undefined) {
    throw new Error(
      "Blueprint observation mode runs against the full selected source, not a single extraction chunk.",
    );
  }

  const baseProgress = {
    pageCount,
    provider: providerSummary,
    sourceInput: providerInput.strategy,
  };

  await updateAIPdfBatchProgress(input, {
    ...baseProgress,
    detail:
      "Running Blueprint Observation Mode. This observes source structure and does not create questions.",
    phase: "blueprint_observation_calling_provider",
  });

  try {
    const currentBeforeProvider = await loadCurrentAIPdfSummary(input);
    const prompt = buildAIBlueprintObservationProviderPrompt({
      fileName: input.fileName,
      pageCount,
    });
    const blueprintObservationPlan = isMockAIProviderUrl(provider.base_url)
      ? buildAIBlueprintObservationPlanFromProviderResponse({
          providerResponse: mockBlueprintObservationProviderResponse(pageCount),
          summary: currentBeforeProvider.summary,
        })
      : (
          await runWithAIProviderRetry({
            onRetry: (retry) =>
              updateAIPdfProviderRetryProgress({
                input,
                pageCount,
                provider: providerSummary,
                retry,
                sourceInput: providerInput.strategy,
              }),
            operation: "ai_pdf_extraction",
            policy: input.providerRetryMaxAttempts
              ? { maxAttempts: input.providerRetryMaxAttempts }
              : undefined,
            run: async () => {
              const nativeResponse = await generateWithGeminiNativePdf({
                    apiKey: provider.apiKey,
                    baseUrl: provider.base_url,
                    debugContext: {
                      batchId: input.batchId,
                      fileName: input.fileName,
                      jobId: input.jobId,
                      mode: "blueprint_observation",
                      pageCount,
                      providerProfileId: input.providerProfileId,
                      sourceAssetId: input.sourceAssetId,
                      sourceObjectPath: input.sourceObjectPath,
                    },
                    fileName: input.fileName,
                    model: provider.model,
                    pdfBytes: input.pdfBuffer,
                    prompt,
                  });
              input.onProviderUsage?.(nativeResponse.usage);
              return parseAIBlueprintObservationProviderText({
                providerText: nativeResponse.text,
                summary: currentBeforeProvider.summary,
              });
            },
          })
        ).value;

    await updateAIBlueprintObservationPlan({
      blueprintObservationPlan,
      input,
    });
    await updateAIPdfBatchProgress(input, {
      ...baseProgress,
      detail:
        "Blueprint observation response was normalized into text-only analyzer packets.",
      phase: "blueprint_observation_normalized",
      warnings: blueprintObservationPlan.warnings,
    });
    const questionBlueprintDraftPlan = await buildAndStoreQuestionBlueprintDraftPlan({
      blueprintObservationPlan,
      input,
      pageCount,
      providerInput,
      providerSummary,
    });
    const { libraryPersistencePlan, reviewPlan } =
      await buildAndStoreQuestionBlueprintReviewPlans({
        input,
        pageCount,
        providerInput,
        providerSummary,
        questionBlueprintDraftPlan,
      });

    const currentBeforeFinal = await loadCurrentAIPdfSummary(input);
    const finalAiPdfImport = mergeQuestionBlueprintLibraryPersistencePlanIntoSummary(
      mergeQuestionBlueprintReviewPlanIntoSummary(
        mergeQuestionBlueprintDraftPlanIntoSummary(
          mergeAIBlueprintObservationPlanIntoSummary(
            mergeAIPdfImportChunkingSummary(currentBeforeFinal.aiPdfImport, {
              createdQuestionCount: 0,
              detail:
                "Blueprint Observation Mode completed. Question blueprint review/library plans were created without generating questions.",
              executionMode: "blueprint_observation",
              fileName: input.fileName,
              jobId: input.jobId,
              pageCount,
              phase: "question_blueprint_review_planned",
              provider: providerSummary,
              sourceAssetId: input.sourceAssetId,
              sourceInput: providerInput.strategy,
              sourceObjectPath: input.sourceObjectPath,
              uploadedCropCount: 0,
              warnings: uniqueStrings([
                ...blueprintObservationPlan.warnings,
                ...questionBlueprintDraftPlan.warnings,
                ...reviewPlan.warnings,
                ...libraryPersistencePlan.warnings,
              ]),
            }),
            blueprintObservationPlan,
          ),
          questionBlueprintDraftPlan,
        ),
        reviewPlan,
      ),
      libraryPersistencePlan,
    );
    const finalSummary = {
      ...currentBeforeFinal.summary,
      createdCount: 0,
      createdQuestions: [],
      duplicateCount: 0,
      errorCount: 0,
      invalidCount: 0,
      skippedCount: 0,
      unknownTagCount: 0,
      validCount: 0,
      aiPdfImport: finalAiPdfImport,
    };
    const { error } = await input.supabase
      .from("import_batches")
      .update({
        status: "ready",
        summary: finalSummary,
      })
      .eq("id", input.batchId);

    if (error) {
      throw new Error(error.message);
    }

    return finalSummary;
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Blueprint observation provider mode failed.";
    const currentBeforeFailure = await loadCurrentAIPdfSummary(input);
    const blueprintObservationPlan = failedAIBlueprintObservationPlan({
      sourceKind: "import_batch",
      warnings: [`blueprint observation failed: ${message}`],
    });
    const finalAiPdfImport = mergeAIBlueprintObservationPlanIntoSummary(
      mergeAIPdfImportChunkingSummary(currentBeforeFailure.aiPdfImport, {
        createdQuestionCount: 0,
        detail: "Blueprint Observation Mode failed before metadata could be completed.",
        error: message,
        executionMode: "blueprint_observation",
        fileName: input.fileName,
        jobId: input.jobId,
        pageCount,
        phase: "failed",
        phaseFailedAt: new Date().toISOString(),
        provider: providerSummary,
        sourceAssetId: input.sourceAssetId,
        sourceInput: providerInput.strategy,
        sourceObjectPath: input.sourceObjectPath,
        uploadedCropCount: 0,
        warnings: blueprintObservationPlan.warnings,
      }),
      blueprintObservationPlan,
    );
    const finalSummary = {
      ...currentBeforeFailure.summary,
      createdCount: 0,
      createdQuestions: [],
      aiPdfImport: finalAiPdfImport,
    };
    const { error: updateError } = await input.supabase
      .from("import_batches")
      .update({
        status: "failed",
        summary: finalSummary,
      })
      .eq("id", input.batchId);

    if (updateError) {
      throw new Error(updateError.message);
    }

    return finalSummary;
  }
}

async function processAIPdfSinglePass({
  activeTags,
  input,
  pageCount,
  provider,
  providerInput,
  providerSummary,
  selectiveInput,
}: {
  activeTags: ActiveTag[];
  input: ProcessInput;
  pageCount: number;
  provider: Awaited<ReturnType<typeof loadAIProviderProfileForServerUse>>;
  providerInput: ReturnType<typeof describeAiPdfProviderInput>;
  providerSummary: { id: string; model: string; name: string; provider: string };
  selectiveInput?: {
    fileName: string;
    pageMapping: { chunkPage: number; sourcePage: number }[];
    plan: AISelectiveExecutionPlan;
    pdfBytes: Buffer;
  };
}) {
  if (input.chunkIndex !== undefined) {
    throw new Error(
      "This provider uses full-PDF input and does not support single-chunk retry. Retry the full import after resetting generated drafts.",
    );
  }

  const prompt = buildPrompt({
    activeTags,
    fileName: input.fileName,
    pageMapping: selectiveInput?.pageMapping,
    pageCount,
    selectiveExecution: Boolean(selectiveInput),
  });

  await updateAIPdfBatchProgress(input, {
    detail: selectiveInput
      ? "Calling AI provider with selected source pages. If the first JSON is invalid, the system will ask the model once more with the validation error to repair it."
      : "Calling AI provider once with the full PDF. If the first JSON is invalid, the system will ask the model once more with the validation error to repair it.",
    pageCount,
    phase: "calling_provider",
    provider: providerSummary,
    sourceInput: providerInput.strategy,
  });
  const usageSamples: GeminiNativeUsage[] = [];
  const providerResult = await runWithAIProviderRetry({
    onRetry: (retry) =>
      updateAIPdfProviderRetryProgress({
        input,
        pageCount,
        provider: providerSummary,
        retry,
        sourceInput: providerInput.strategy,
      }),
    operation: "ai_pdf_extraction",
    run: async () =>
      normalizeAIPdfExtractionResponse(
        await callAIPdfExtractionProvider({
          debugContext: {
            batchId: input.batchId,
            chunkIndex: null,
            fileName: input.fileName,
            jobId: input.jobId,
            pageCount,
            providerProfileId: input.providerProfileId,
            selectedPageCount: selectiveInput?.plan.sentPageCount ?? null,
            selectiveExecution: Boolean(selectiveInput),
            sourceAssetId: input.sourceAssetId,
            sourceObjectPath: input.sourceObjectPath,
          },
          fileName: selectiveInput?.fileName ?? input.fileName,
          inputStrategy: providerInput.strategy,
          pageImageDataUrls: [],
          pdfBase64: (selectiveInput?.pdfBytes ?? input.pdfBuffer).toString("base64"),
          pdfBytes: selectiveInput?.pdfBytes ?? input.pdfBuffer,
          onProviderUsage: (usage) => {
            if (usage) usageSamples.push(usage);
            input.onProviderUsage?.(usage);
          },
          profile: provider,
          prompt,
        }),
      ),
  });
  const extraction = selectiveInput
    ? remapSegmentExtractionPages({
        extraction: providerResult.value,
        pageMapping: selectiveInput.pageMapping,
      })
    : providerResult.value;

  if (selectiveInput) {
    const sumUsage = (key: keyof GeminiNativeUsage) => {
      const values = usageSamples
        .map((usage) => usage[key])
        .filter((value): value is number => typeof value === "number");
      return values.length ? values.reduce((total, value) => total + value, 0) : null;
    };
    const usage: AISelectiveExecutionUsageSummary | null = usageSamples.length
      ? {
          cachedInputTokens: sumUsage("cachedInputTokens"),
          inputTokens: sumUsage("inputTokens"),
          outputTokens: sumUsage("outputTokens"),
          totalTokens: sumUsage("totalTokens"),
        }
      : null;
    await updateAISelectiveExecutionPlan({
      input,
      selectiveExecutionPlan: recordAISelectiveExecutionUsage({
        plan: selectiveInput.plan,
        usage,
      }),
    });
  }

  await updateAIPdfBatchProgress(input, {
    detail: "AI response parsed and validated.",
    pageCount,
    phase: "provider_response_validated",
    provider: providerSummary,
    questionCount: extraction.questions.length,
    sourceInput: providerInput.strategy,
    warnings: extraction.warnings,
  });

  const jsonText = await buildImportJson({
    activeTags,
    batchId: input.batchId,
    extraction,
    profileId: input.profileId,
    provider: providerSummary,
    supabase: input.supabase,
  });
  await updateAIPdfBatchProgress(input, {
    detail: "Importing generated questions.",
    pageCount,
    phase: "importing_questions",
    provider: providerSummary,
    sourceInput: providerInput.strategy,
    warnings: extraction.warnings,
  });

  const importSummary = await importBatchImportJson({
    allowDraftTags: true,
    batchId: input.batchId,
    initialSummaryExtras: {},
    jsonText,
    profileId: input.profileId,
    sourceType: "ai_pdf",
    supabase: input.supabase,
    targetBankId: input.targetBankId,
  });

  await updateAIPdfBatchProgress(input, {
    detail: "Attaching AI crop placeholders to created draft questions.",
    pageCount,
    phase: "cropping_assets",
    provider: providerSummary,
    questionCount: extraction.questions.length,
    sourceInput: providerInput.strategy,
    warnings: extraction.warnings,
  });
  const cropSummary =
    importSummary.createdCount > 0
      ? await attachCroppedAssets({
          createdQuestions: importSummary.createdQuestions,
          extraction,
          pdfBuffer: input.pdfBuffer,
          profileId: input.profileId,
          supabase: input.supabase,
        })
      : {
          uploadedCount: 0,
          warnings: ["No draft questions were created; skipped crop attachment."],
        };
  const currentBeforeFinal = await loadCurrentAIPdfSummary(input);
  const finalAiPdfImport = mergeAIPdfImportChunkingSummary(
    currentBeforeFinal.aiPdfImport,
    {
      createdQuestionCount: importSummary.createdCount,
      detail:
        importSummary.createdCount > 0
          ? `Imported ${importSummary.createdCount} draft question(s). Review failed chunks separately if needed.`
          : "AI PDF extraction finished without creating draft questions.",
      fileName: input.fileName,
      jobId: input.jobId,
      pageCount,
      phase: importSummary.createdCount > 0 ? "completed" : "failed",
      provider: providerSummary,
      sourceAssetId: input.sourceAssetId,
      sourceInput: providerInput.strategy,
      sourceObjectPath: input.sourceObjectPath,
      uploadedCropCount: cropSummary.uploadedCount,
      warnings: uniqueStrings([...extraction.warnings, ...cropSummary.warnings]),
    },
  );

  if (importSummary.createdCount > 0) {
    delete finalAiPdfImport.error;
    delete finalAiPdfImport.phaseFailedAt;
    delete finalAiPdfImport.staleLeaseDetectedAt;
  }

  const finalSummary = {
    ...importSummary,
    aiPdfImport: finalAiPdfImport,
  };
  const { error } = await input.supabase
    .from("import_batches")
    .update({
      status: importSummary.createdCount > 0 ? "imported" : "failed",
      summary: finalSummary,
    })
    .eq("id", input.batchId);

  if (error) {
    throw new Error(error.message);
  }

  await generateAndStoreExtractionCoverageAuditPlan({ input });
  await generateAndStoreQuestionBoundaryGuardPlan({ input });

  return finalSummary;
}

export async function processAIPdfImport(input: AIPdfProcessInput) {
  if (input.pdfBuffer.length > AI_PDF_IMPORT_MAX_BYTES) {
    throw new Error("PDF is larger than 50MB.");
  }

  await updateAIPdfBatchProgress(input, {
    detail: "Counting PDF pages.",
    phase: "counting_pages",
  });
  const pageCount = await getPdfPageCount(input.pdfBuffer);

  if (pageCount > AI_PDF_IMPORT_MAX_PAGES) {
    throw new Error(
      `PDF has more than ${AI_PDF_IMPORT_MAX_PAGES} pages.`,
    );
  }

  const executionPlanning = await generateAndStorePdfPreanalysis({
    input,
    pageCount,
  });

  await updateAIPdfBatchProgress(input, {
    detail: "Loading AI provider profile.",
    pageCount,
    phase: "loading_provider",
  });
  const safeProvider = await loadSafeAIProviderProfileForServerUse({
    profileId: input.providerProfileId,
  });
  const providerSummary = {
    id: safeProvider.id,
    model: safeProvider.model,
    name: safeProvider.name,
    provider: safeProvider.provider,
  };
  const providerInput = describeAiPdfProviderInput(safeProvider);
  await updateAIPdfBatchProgress(input, {
    detail: "AI provider profile selected.",
    pageCount,
    phase: "loading_provider",
    provider: providerSummary,
    sourceInput: providerInput.strategy,
  });
  const provider = await loadAIProviderProfileForServerUse({
    profileId: input.providerProfileId,
  });

  if (!providerInput.supported) {
    throw new Error(AI_PDF_UNSUPPORTED_PROVIDER_MESSAGE);
  }

  if (!providerInput.implemented) {
    throw new Error(providerInput.reason ?? AI_PDF_UNSUPPORTED_PROVIDER_MESSAGE);
  }

  const currentAfterProvider = await loadCurrentAIPdfSummary(input);
  const requestedExecutionMode = String(
    currentAfterProvider.aiPdfImport.executionMode ?? "",
  );

  if (requestedExecutionMode === "blueprint_observation") {
    if (
      providerInput.strategy !== "gemini_native_pdf" &&
      providerInput.strategy !== "mock"
    ) {
      throw new Error(
        "Blueprint observation mode requires a Gemini Native full PDF provider or the mock provider.",
      );
    }

    return processAIPdfBlueprintObservation({
      input,
      pageCount,
      provider,
      providerInput,
      providerSummary,
    });
  }

  await updateAIPdfBatchProgress(input, {
    detail: "Loading active tags for reuse.",
    pageCount,
    phase: "loading_tags",
    provider: providerSummary,
  });
  const activeTags = await loadActiveTags(input.supabase);
  const currentAfterTags = await loadCurrentAIPdfSummary(input);
  const segmentationPlan = normalizeManualSegmentationPlan(
    currentAfterTags.aiPdfImport.manualSegmentation,
  );
  const executionMode = String(
    currentAfterTags.aiPdfImport.executionMode ?? "",
  );
  const usesSegmentedFullPdf =
    executionMode === "segmented_full_pdf" &&
    segmentationPlan?.status === "confirmed" &&
    segmentationPlan.chunks.length > 1 &&
    ["gemini_native_pdf", "openai_file"].includes(providerInput.strategy);
  let selectiveExecutionPlan = buildAISelectiveExecutionPlan({
    extractionBatchPlan: executionPlanning.extractionBatchPlan,
    packetPlan: executionPlanning.packetPlan,
    preanalysis: executionPlanning.preanalysis as AIPdfPreanalysisResult,
    providerStrategy: providerInput.strategy,
  });

  if (input.selectiveExecutionEnabled !== true) {
    selectiveExecutionPlan = forceAISelectiveExecutionFallback({
      eligibility: "not_beneficial",
      plan: selectiveExecutionPlan,
      reasonCode: "selective_execution_disabled_by_operations_control",
      warning:
        "Selective source-page execution is disabled for this run, so the full document will be used safely.",
    });
  }

  if (usesSegmentedFullPdf) {
    selectiveExecutionPlan = forceAISelectiveExecutionFallback({
      eligibility: "not_beneficial",
      plan: selectiveExecutionPlan,
      reasonCode: "manual_segmented_full_pdf_execution_selected",
      warning:
        "Selective packet execution was skipped because confirmed boundary segmentation has priority for this source.",
    });
  }

  await updateAISelectiveExecutionPlan({
    input,
    selectiveExecutionPlan,
  });
  const plannedChunking =
    normalizeAIPdfChunkingSummary(currentAfterTags.aiPdfImport.chunking) ??
    patchAIPdfChunkingSummary({
      chunkIndex: 0,
      pageCount,
      patch: {},
      value: undefined,
    });
  const chunksToProcess = plannedChunking.chunks
    .filter((chunk) =>
      input.chunkIndex === undefined ? true : chunk.chunkIndex === input.chunkIndex,
    )
    .sort((left, right) => left.chunkIndex - right.chunkIndex);

  if (!chunksToProcess.length) {
    throw new Error("No matching AI PDF chunk was found to process.");
  }

  const preparation = providerPreparationCopy(providerInput.strategy);
  await updateAIPdfBatchProgress(input, {
    detail: preparation.detail,
    pageCount,
    phase: preparation.phase,
    provider: providerSummary,
    sourceInput: providerInput.strategy,
  });

  if (
    !supportsAIPdfSequentialChunkExtraction(providerInput.strategy) &&
    !usesSegmentedFullPdf
  ) {
    let selectiveInput:
      | {
          fileName: string;
          pageMapping: { chunkPage: number; sourcePage: number }[];
          plan: AISelectiveExecutionPlan;
          pdfBytes: Buffer;
        }
      | undefined;

    if (selectiveExecutionPlan.eligibility === "eligible") {
      try {
        await updateAIPdfBatchProgress(input, {
          detail: "Preparing selected source pages with their original page references.",
          pageCount,
          phase: "preparing_selective_pdf_input",
          provider: providerSummary,
          sourceInput: providerInput.strategy,
        });
        const selectiveChunk = selectiveExecutionPlanToSegmentChunk(
          selectiveExecutionPlan,
        );

        if (!selectiveChunk) {
          throw new Error("Selective execution plan did not produce a safe source-page map.");
        }

        const subsetPdf = await buildMaskedPdfChunk({
          chunk: selectiveChunk,
          pdfBuffer: input.pdfBuffer,
        });
        selectiveExecutionPlan = markAISelectiveExecutionMaterialized(
          selectiveExecutionPlan,
        );
        await updateAISelectiveExecutionPlan({
          input,
          selectiveExecutionPlan,
        });
        selectiveInput = {
          fileName: `${input.fileName.replace(/\.pdf$/i, "")}-selected-pages.pdf`,
          pageMapping: subsetPdf.pageMapping,
          plan: selectiveExecutionPlan,
          pdfBytes: subsetPdf.pdfBytes,
        };
      } catch {
        selectiveExecutionPlan = forceAISelectiveExecutionFallback({
          plan: selectiveExecutionPlan,
          reasonCode: "selective_subset_materialization_failed",
          warning:
            "Selective source preparation could not be completed, so the full document will be used safely.",
        });
        await updateAISelectiveExecutionPlan({
          input,
          selectiveExecutionPlan,
        });
      }
    }

    return processAIPdfSinglePass({
      activeTags,
      input,
      pageCount,
      provider,
      providerInput,
      providerSummary,
      selectiveInput,
    });
  }

  const startingCreatedQuestions = createdQuestionsFromSummary(
    currentAfterTags.summary.createdQuestions,
  );
  let renderedPagesCache: RenderedPage[] | undefined;
  let questionIndexOffset = 0;
  const aggregate = {
    createdCount: numberFromRecord(currentAfterTags.summary, ["createdCount"]),
    duplicateCount: numberFromRecord(currentAfterTags.summary, ["duplicateCount"]),
    errorCount: numberFromRecord(currentAfterTags.summary, ["errorCount"]),
    invalidCount: numberFromRecord(currentAfterTags.summary, ["invalidCount"]),
    skippedCount: numberFromRecord(currentAfterTags.summary, ["skippedCount"]),
    unknownTagCount: numberFromRecord(currentAfterTags.summary, [
      "unknownTagCount",
    ]),
    uploadedCropCount: numberFromRecord(currentAfterTags.aiPdfImport, [
      "uploadedCropCount",
      "uploadedCrops",
    ]),
    validCount: numberFromRecord(currentAfterTags.summary, ["validCount"]),
  };
  const createdQuestions = [...startingCreatedQuestions];
  questionIndexOffset = aggregate.createdCount;
  const allWarnings: string[] = Array.isArray(currentAfterTags.aiPdfImport.warnings)
    ? currentAfterTags.aiPdfImport.warnings.map(String)
    : [];

  for (const chunk of chunksToProcess) {
    const startedAt = new Date().toISOString();
    const retryCount =
      input.chunkIndex === undefined ? chunk.retryCount ?? 0 : (chunk.retryCount ?? 0) + 1;

    await updateAIPdfChunkProgress({
      chunk,
      input,
      pageCount,
      patch: {
        completedAt: undefined,
        errorMessage: undefined,
        inputStrategy: providerInput.strategy,
        model: provider.model,
        provider: provider.provider,
        retryCount,
        startedAt,
        status: "running",
        warningCount: 0,
        warnings: [],
      },
      progress: {
        detail: `Calling AI provider for ${formatAIPdfChunkPageRange(chunk)}.`,
        pageCount,
        phase: "calling_provider",
        provider: providerSummary,
        sourceInput: providerInput.strategy,
      },
    });

    try {
      const segmentChunk = usesSegmentedFullPdf
        ? segmentChunkForIndex(segmentationPlan!, chunk.chunkIndex)
        : null;
      const chunkPrompt = buildPrompt({
        activeTags,
        chunk,
        fileName: input.fileName,
        pageMapping: segmentChunk?.pageMapping,
        pageCount,
      });
      const pagesForVision =
        providerInput.strategy !== "page_images"
          ? []
          : (
              renderedPagesCache ??
              (renderedPagesCache = await renderPdfPages(input.pdfBuffer))
            ).filter(
              (page) => page.page >= chunk.pageStart && page.page <= chunk.pageEnd,
            );
      const segmentedPdf = segmentChunk
        ? await buildMaskedPdfChunk({
            chunk: segmentChunk,
            pdfBuffer: input.pdfBuffer,
          })
        : null;
      const providerResult = await runWithAIProviderRetry({
        onRetry: (retry) =>
          updateAIPdfProviderRetryProgress({
            chunk,
            input,
            pageCount,
            provider: providerSummary,
            retry,
            sourceInput: providerInput.strategy,
          }),
        operation: "ai_pdf_extraction",
        policy: input.providerRetryMaxAttempts
          ? { maxAttempts: input.providerRetryMaxAttempts }
          : undefined,
        run: async () =>
          normalizeAIPdfExtractionResponse(
            await callAIPdfExtractionProvider({
              debugContext: {
                batchId: input.batchId,
                chunkIndex: chunk.chunkIndex,
                fileName: input.fileName,
                jobId: input.jobId,
                pageEnd: chunk.pageEnd,
                pageStart: chunk.pageStart,
                pageCount,
                providerProfileId: input.providerProfileId,
                retryCount,
                sourceAssetId: input.sourceAssetId,
                sourceObjectPath: input.sourceObjectPath,
              },
              fileName: segmentChunk
                ? `${input.fileName.replace(/\.pdf$/i, "")}-chunk-${
                    chunk.chunkIndex + 1
                  }.pdf`
                : input.fileName,
              inputStrategy: providerInput.strategy,
              pageImageDataUrls: pagesForVision.map((page) => page.dataUrl),
              pdfBase64: (segmentedPdf?.pdfBytes ?? input.pdfBuffer).toString(
                "base64",
              ),
              pdfBytes: segmentedPdf?.pdfBytes ?? input.pdfBuffer,
              onProviderUsage: input.onProviderUsage,
              profile: provider,
              prompt: chunkPrompt,
            }),
          ),
      });
      const rawExtraction = providerResult.value;
      const extraction = segmentChunk
        ? remapSegmentExtractionPages({
            extraction: rawExtraction,
            pageMapping: segmentChunk.pageMapping,
          })
        : rawExtraction;

      await updateAIPdfChunkProgress({
        chunk,
        input,
        pageCount,
        patch: {
          inputStrategy: providerInput.strategy,
          model: provider.model,
          provider: provider.provider,
          questionCount: extraction.questions.length,
          retryCount,
          status: "running",
          warningCount: extraction.warnings.length,
          warnings: extraction.warnings,
        },
        progress: {
          detail: `AI response parsed for ${formatAIPdfChunkPageRange(chunk)}.`,
          pageCount,
          phase: "provider_response_validated",
          provider: providerSummary,
          questionCount: extraction.questions.length,
          sourceInput: providerInput.strategy,
          warnings: extraction.warnings,
        },
      });

      const jsonText = await buildImportJson({
        activeTags,
        batchId: input.batchId,
        chunk,
        extraction,
        profileId: input.profileId,
        provider: providerSummary,
        questionIndexOffset,
        supabase: input.supabase,
      });
      await updateAIPdfBatchProgress(input, {
        detail: `Importing generated questions for ${formatAIPdfChunkPageRange(chunk)}.`,
        pageCount,
        phase: "importing_questions",
        provider: providerSummary,
        sourceInput: providerInput.strategy,
        warnings: uniqueStrings([...allWarnings, ...extraction.warnings]),
      });

      const importSummary = await importBatchImportJson({
        allowDraftTags: true,
        batchId: input.batchId,
        initialSummaryExtras: {},
        itemIndexOffset: chunk.chunkIndex * 1000,
        jsonText,
        profileId: input.profileId,
        sourceType: "ai_pdf",
        supabase: input.supabase,
        targetBankId: input.targetBankId,
      });
      const cropSummary =
        importSummary.createdCount > 0
          ? await attachCroppedAssets({
              createdQuestions: importSummary.createdQuestions,
              extraction,
              pdfBuffer: input.pdfBuffer,
              profileId: input.profileId,
              renderedPages: renderedPagesCache,
              supabase: input.supabase,
            })
          : {
              uploadedCount: 0,
              warnings: [
                `No draft questions were created for ${formatAIPdfChunkPageRange(
                  chunk,
                )}; skipped crop attachment.`,
              ],
            };
      const chunkWarnings = uniqueStrings([
        ...extraction.warnings,
        ...cropSummary.warnings,
      ]);

      aggregate.createdCount += importSummary.createdCount;
      aggregate.duplicateCount += importSummary.duplicateCount;
      aggregate.errorCount += importSummary.errorCount;
      aggregate.invalidCount += importSummary.invalidCount;
      aggregate.skippedCount += importSummary.skippedCount;
      aggregate.unknownTagCount += importSummary.unknownTagCount;
      aggregate.uploadedCropCount += cropSummary.uploadedCount;
      aggregate.validCount += importSummary.validCount;
      createdQuestions.push(...importSummary.createdQuestions);
      allWarnings.push(...chunkWarnings);
      questionIndexOffset += extraction.questions.length;

      await updateAIPdfChunkProgress({
        chunk,
        input,
        pageCount,
        patch: {
          completedAt: new Date().toISOString(),
          createdQuestionIds: importSummary.createdQuestions.map(
            (question) => question.id,
          ),
          inputStrategy: providerInput.strategy,
          model: provider.model,
          provider: provider.provider,
          questionCount: importSummary.createdCount,
          retryCount,
          status: "completed",
          warningCount: chunkWarnings.length,
          warnings: chunkWarnings,
        },
        progress: {
          detail: `Completed ${formatAIPdfChunkPageRange(chunk)}.`,
          pageCount,
          phase: "cropping_assets",
          provider: providerSummary,
          questionCount: aggregate.createdCount,
          sourceInput: providerInput.strategy,
          warnings: uniqueStrings(allWarnings),
        },
      });
    } catch (error) {
      const providerError = safeAIProviderErrorState({
        error: classifyAIProviderError({
          error,
          operation: "ai_pdf_extraction",
        }),
        maxAttempts: 4,
      });
      const message = providerError.safeMessage;

      allWarnings.push(
        `${formatAIPdfChunkPageRange(chunk)} failed: ${message}`,
      );
      await updateAIPdfChunkProgress({
        chunk,
        input,
        pageCount,
        patch: {
          attemptCount: providerError.attemptCount,
          completedAt: new Date().toISOString(),
          errorMessage: message,
          inputStrategy: providerInput.strategy,
          model: provider.model,
          maxAttempts: providerError.maxAttempts,
          nextAction: providerError.nextAction,
          provider: provider.provider,
          retryCount,
          retryable: providerError.retryable,
          safeErrorCode: providerError.safeErrorCode,
          status: "failed",
          warningCount: 1,
          warnings: [message],
        },
        progress: {
          detail: `${formatAIPdfChunkPageRange(chunk)} failed; continuing remaining chunks.`,
          pageCount,
          phase: "calling_provider",
          provider: providerSummary,
          questionCount: aggregate.createdCount,
          sourceInput: providerInput.strategy,
          warnings: uniqueStrings(allWarnings),
          safeErrorCode: providerError.safeErrorCode,
        },
      });
    }
  }

  const currentBeforeFinal = await loadCurrentAIPdfSummary(input);
  const finalChunking = normalizeAIPdfChunkingSummary(
    currentBeforeFinal.aiPdfImport.chunking,
  );
  const hasFailedChunks = (finalChunking?.failedChunks ?? 0) > 0;
  const hasCreatedQuestions = aggregate.createdCount > 0;
  const finalPhase = hasCreatedQuestions
    ? hasFailedChunks
      ? "partial"
      : "completed"
    : "failed";
  const finalStatus = hasCreatedQuestions ? "imported" : "failed";
  const finalSummary = {
    ...currentBeforeFinal.summary,
    batchId: input.batchId,
    createdCount: aggregate.createdCount,
    createdQuestions,
    duplicateCount: aggregate.duplicateCount,
    errorCount: aggregate.errorCount,
    invalidCount: aggregate.invalidCount,
    skippedCount: aggregate.skippedCount,
    unknownTagCount: aggregate.unknownTagCount,
    validCount: aggregate.validCount,
    aiPdfImport: mergeAIPdfImportChunkingSummary(currentBeforeFinal.aiPdfImport, {
      createdQuestionCount: aggregate.createdCount,
      fileName: input.fileName,
      jobId: input.jobId,
      pageCount,
      phase: finalPhase,
      provider: providerSummary,
      sourceAssetId: input.sourceAssetId,
      sourceInput: providerInput.strategy,
      sourceObjectPath: input.sourceObjectPath,
      uploadedCropCount: aggregate.uploadedCropCount,
      warnings: uniqueStrings(allWarnings),
    }),
  };
  const { error } = await input.supabase
    .from("import_batches")
    .update({
      status: finalStatus,
      summary: finalSummary,
    })
    .eq("id", input.batchId);

  if (error) {
    throw new Error(error.message);
  }

  await generateAndStoreExtractionCoverageAuditPlan({ input });
  await generateAndStoreQuestionBoundaryGuardPlan({ input });

  return finalSummary;
}

function recoveryCandidateFromExtraction({
  index,
  question,
  sourceAssetId,
}: {
  index: number;
  question: AIPdfQuestion;
  sourceAssetId: string;
}): QuestionBoundaryGuardCandidate {
  return {
    assetPageNumbers: question.asset_placeholders.map((asset) => asset.page),
    assetPlaceholders: question.asset_placeholders.map((asset) => ({
      pageNumber: asset.page,
      placeholder: asset.placeholder,
    })),
    contentHtml: question.content_html,
    contentSource: question.content_source,
    id: `recovery-candidate-${index + 1}`,
    optionsCount: question.options.length,
    pageRefs: question.page_refs,
    questionCode: `recovery-candidate-${index + 1}`,
    recoveryProvenance: "recovery",
    solutionHtml: question.solution_html,
    solutionSource: question.solution_source,
    sourceAssetId,
    title: question.title,
    visibleQuestionNumber: question.question_number ?? null,
  };
}

function recoveryClassificationCounts(
  values: AICoverageRecoveryCandidateClassification[],
) {
  return values.reduce<Record<AICoverageRecoveryCandidateClassification, number>>(
    (counts, value) => {
      counts[value] += 1;
      return counts;
    },
    {
      answer_alignment_risk: 0,
      insufficient_evidence: 0,
      likely_duplicate: 0,
      new_candidate: 0,
      possible_fragment_completion: 0,
      visible_number_conflict: 0,
      visual_association_risk: 0,
    },
  );
}

async function updateCoverageRecoveryExecution({
  input,
  patch,
}: {
  input: AIPdfCoverageRecoveryProcessInput;
  patch: Record<string, unknown>;
}) {
  const current = await loadCurrentAIPdfSummary({
    ...input,
    batchId: input.originalBatchId,
  });
  const existing = plainObject(current.aiPdfImport.coverageRecoveryExecution);
  const { error } = await input.supabase
    .from("import_batches")
    .update({
      summary: {
        ...current.summary,
        aiPdfImport: {
          ...current.aiPdfImport,
          coverageRecoveryExecution: {
            ...existing,
            ...patch,
          },
        },
      },
    })
    .eq("id", input.originalBatchId);
  if (error) throw new Error(error.message);
}

export async function recordAIPdfCoverageRecoveryFailure({
  error,
  input,
}: {
  error: unknown;
  input: AIPdfCoverageRecoveryProcessInput;
}) {
  const classified = classifyAIProviderError({
    error,
    operation: "ai_pdf_extraction",
  });
  const safe = safeAIProviderErrorState({ error: classified });
  await updateCoverageRecoveryExecution({
    input,
    patch: {
      detail: classified.retryable
        ? "The AI provider is temporarily busy. Your file was not published or assigned. Please retry in a few minutes."
        : "Targeted recovery could not be completed. Your file was not published or assigned.",
      retryable: classified.retryable,
      safeErrorCode: safe.safeErrorCode,
      status: classified.retryable ? "retry_wait" : "failed",
    },
  }).catch(() => undefined);
}

/**
 * Executes only server-derived recovery windows. It never falls back to the
 * whole source PDF and does not retain the provider response after normalized
 * candidates have passed the existing review-draft import boundary.
 */
export async function processAIPdfCoverageRecovery(
  input: AIPdfCoverageRecoveryProcessInput,
) {
  const { data: originalBatch, error: originalBatchError } = await input.supabase
    .from("import_batches")
    .select("id, organization_id, status, summary, target_bank_id")
    .eq("id", input.originalBatchId)
    .eq("source_type", "ai_pdf")
    .maybeSingle();
  if (originalBatchError) throw new Error(originalBatchError.message);
  if (!originalBatch || originalBatch.target_bank_id !== input.targetBankId) {
    throw new Error("The original bank-scoped import is no longer available.");
  }

  const pageCount = await getPdfPageCount(input.pdfBuffer);
  const executionPlan = buildAICoverageRecoveryExecutionPlan({
    actorCanManageBank: true,
    bankActive: true,
    originalBatchStatus: originalBatch.status,
    sourcePageCount: pageCount,
    sourceReady: true,
    summary: originalBatch.summary,
  });
  if (
    executionPlan.status !== "eligible" ||
    executionPlan.planHash !== input.recoveryPlanHash
  ) {
    throw new Error("This recovery plan is no longer eligible for execution.");
  }

  const requestedWindows = executionPlan.windows.filter((window) =>
    input.recoveryWindowIds.includes(window.windowId),
  );
  if (!requestedWindows.length || requestedWindows.length !== executionPlan.windows.length) {
    throw new Error("The queued recovery windows no longer match the safe plan.");
  }

  const sourcePages = Array.from(
    new Set(requestedWindows.flatMap((window) => window.pageNumbers)),
  ).sort((left, right) => left - right);
  const existingRecoveryQuery = input.supabase
    .from("import_batches")
    .select("id, status, summary")
    .eq("source_type", "ai_pdf")
    .eq("target_bank_id", input.targetBankId)
    .contains("summary", {
      aiPdfImport: { coverageRecoveryExecution: { durableJobId: input.jobId } },
    })
    .limit(1);
  const { data: existingRecovery, error: existingRecoveryError } = await existingRecoveryQuery;
  if (existingRecoveryError) throw new Error(existingRecoveryError.message);
  const existingChild = existingRecovery?.[0] as
    | { id: string; status: string; summary: unknown }
    | undefined;
  if (existingChild?.status === "imported") {
    const summary = plainObject(existingChild.summary);
    return {
      createdCount: numberFromRecord(summary, ["createdCount"]),
      recoveredDraftCount: numberFromRecord(summary, ["createdCount"]),
      recoveryCandidateCount: numberFromRecord(
        plainObject(plainObject(summary.aiPdfImport).coverageRecoveryExecution),
        ["candidateCount"],
      ),
      recoveryPageCount: 0,
      recoveryWindowCount: 0,
      reviewRoute: `/teacher/banks/${input.targetBankId}/review`,
      warningCount: numberFromRecord(summary, ["errorCount", "invalidCount"]),
    };
  }
  if (existingChild) {
    throw new Error("A recovery handoff is already being reconciled for this plan.");
  }

  const safeProvider = await loadSafeAIProviderProfileForServerUse({
    profileId: input.providerProfileId,
  });
  const providerInput = describeAiPdfProviderInput(safeProvider);
  if (!providerInput.supported || !providerInput.implemented) {
    throw new Error(providerInput.reason ?? AI_PDF_UNSUPPORTED_PROVIDER_MESSAGE);
  }
  const provider = await loadAIProviderProfileForServerUse({
    profileId: input.providerProfileId,
  });
  const providerSummary = {
    id: safeProvider.id,
    model: safeProvider.model,
    name: safeProvider.name,
    provider: safeProvider.provider,
  };
  const recoveryChunk = {
    chunkIndex: 0,
    id: `coverage-recovery-${input.recoveryPlanHash.slice(0, 12)}`,
    masks: [],
    pageEnd: sourcePages[sourcePages.length - 1]!,
    pageMapping: sourcePages.map((sourcePage, index) => ({
      chunkPage: index + 1,
      sourcePage,
    })),
    pageStart: sourcePages[0]!,
    sourcePages,
  };
  const subset = await buildMaskedPdfChunk({
    chunk: recoveryChunk,
    pdfBuffer: input.pdfBuffer,
  });
  const activeTags = await loadActiveTags(input.supabase);
  const prompt = buildPrompt({
    activeTags,
    chunk: recoveryChunk,
    fileName: input.fileName,
    pageCount,
    pageMapping: subset.pageMapping,
    recoveryOnly: true,
    selectiveExecution: true,
  });
  const pagesForVision =
    providerInput.strategy === "page_images"
      ? await renderPdfPages(subset.pdfBytes)
      : [];
  await updateCoverageRecoveryExecution({
    input,
    patch: {
      detail: "The system is rechecking the missing sections.",
      pageCount,
      planHash: input.recoveryPlanHash,
      recoveredSourcePages: [],
      status: "processing",
      windowCount: requestedWindows.length,
      windowIds: input.recoveryWindowIds,
    },
  });

  const providerResult = await runWithAIProviderRetry({
    operation: "ai_pdf_extraction",
    policy: input.providerRetryMaxAttempts
      ? { maxAttempts: input.providerRetryMaxAttempts }
      : undefined,
    run: async () =>
      normalizeAIPdfExtractionResponse(
        await callAIPdfExtractionProvider({
          debugContext: {
            batchId: input.originalBatchId,
            fileName: input.fileName,
            jobId: input.jobId,
            pageCount,
            providerProfileId: input.providerProfileId,
            recoveryPlanHash: input.recoveryPlanHash,
            selectedPageCount: sourcePages.length,
            sourceAssetId: input.sourceAssetId,
          },
          fileName: `${input.fileName.replace(/\.pdf$/i, "")}-recovery.pdf`,
          inputStrategy: providerInput.strategy,
          pageImageDataUrls: pagesForVision.map((page) => page.dataUrl),
          pdfBase64: subset.pdfBytes.toString("base64"),
          pdfBytes: subset.pdfBytes,
          onProviderUsage: input.onProviderUsage,
          profile: provider,
          prompt,
        }),
      ),
  });
  const extraction = remapSegmentExtractionPages({
    extraction: providerResult.value,
    pageMapping: subset.pageMapping,
  });

  const { data: originalQuestions, error: originalQuestionsError } = await input.supabase
    .from("questions")
    .select(
      "id, question_code, title, content_html, content_source, solution_html, solution_source, options, ai_metadata",
    )
    .eq("source", `ai_pdf_import:${input.originalBatchId}`);
  if (originalQuestionsError) throw new Error(originalQuestionsError.message);
  const originalCandidates = questionBoundaryCandidatesFromRows({
    assetRefsByQuestionId: new Map(),
    rows: (originalQuestions ?? []) as Array<Record<string, unknown>>,
    sourceAssetId: input.sourceAssetId ?? "",
  });
  const recoveryCandidates = extraction.questions.map((question, index) =>
    recoveryCandidateFromExtraction({
      index,
      question,
      sourceAssetId: input.sourceAssetId ?? "",
    }),
  );
  const guardPlan = buildQuestionBoundaryGuardPlan({
    questions: [...originalCandidates, ...recoveryCandidates],
    sourceAssetId: input.sourceAssetId,
  });
  const classifications = recoveryCandidates.map((candidate) =>
    classifyAICoverageRecoveryCandidate({
      candidateId: candidate.id,
      guardPlan,
      hasSufficientEvidence: Boolean(
        (candidate.pageRefs?.length ?? 0) &&
          (candidate.contentSource?.trim() || candidate.contentHtml?.trim()),
      ),
    }),
  );
  const counts = recoveryClassificationCounts(classifications);
  const newQuestions = extraction.questions.filter(
    (_, index) => classifications[index] === "new_candidate",
  );

  if (!newQuestions.length) {
    await updateCoverageRecoveryExecution({
      input,
      patch: {
        candidateCount: extraction.questions.length,
        detail: "The missing sections were rechecked, but no additional usable drafts were found.",
        reconciliation: counts,
        recoveredDraftCount: 0,
        recheckedSourcePages: sourcePages,
        status: "completed_no_new_drafts",
      },
    });
    return {
      createdCount: 0,
      recoveredDraftCount: 0,
      recoveryCandidateCount: extraction.questions.length,
      recoveryPageCount: sourcePages.length,
      recoveryWindowCount: requestedWindows.length,
      reconciliation: counts,
      reviewRoute: `/teacher/banks/${input.targetBankId}/review`,
      warningCount: extraction.warnings.length + extraction.questions.length,
    };
  }

  const childBatchId = crypto.randomUUID();
  const childSummary = {
    aiPdfImport: {
      coverageRecoveryExecution: {
        candidateCount: extraction.questions.length,
        durableJobId: input.jobId,
        originalImportBatchId: input.originalBatchId,
        planHash: input.recoveryPlanHash,
        reconciliation: counts,
        sourceAssetId: input.sourceAssetId,
        status: "reconciling",
        windowIds: input.recoveryWindowIds,
      },
      fileName: input.fileName,
      phase: "coverage_recovery_reconciling",
      sourceAssetId: input.sourceAssetId,
      targetBankId: input.targetBankId,
    },
    reviewGate: "bank_review_required",
    reviewScope: "question_bank",
    targetBankId: input.targetBankId,
  };
  const { error: childInsertError } = await input.supabase
    .from("import_batches")
    .insert({
      created_by: input.profileId,
      id: childBatchId,
      organization_id: originalBatch.organization_id,
      source_type: "ai_pdf",
      status: "draft",
      summary: childSummary,
      target_bank_id: input.targetBankId,
    } as never);
  if (childInsertError) throw new Error(childInsertError.message);

  const importJson = await buildImportJson({
    activeTags,
    batchId: childBatchId,
    extraction: { ...extraction, questions: newQuestions },
    profileId: input.profileId,
    provider: providerSummary,
    recovery: {
      originalBatchId: input.originalBatchId,
      recoveryPlanHash: input.recoveryPlanHash,
      sourceAssetId: input.sourceAssetId ?? "",
      windowIds: input.recoveryWindowIds,
    },
    supabase: input.supabase,
  });
  const imported = await importBatchImportJson({
    batchId: childBatchId,
    initialSummaryExtras: childSummary,
    jsonText: importJson,
    profileId: input.profileId,
    sourceType: "ai_pdf",
    supabase: input.supabase,
    targetBankId: input.targetBankId,
  });
  await updateCoverageRecoveryExecution({
    input,
    patch: {
      candidateCount: extraction.questions.length,
      childImportBatchId: childBatchId,
      detail: "Additional Review Drafts were recovered for teacher review.",
      reconciliation: counts,
      recoveredDraftCount: imported.createdCount,
      recoveredSourcePages: sourcePages,
      status: "completed",
    },
  });
  await generateAndStoreExtractionCoverageAuditPlan({
    input: { ...input, batchId: input.originalBatchId },
  });

  return {
    createdCount: imported.createdCount,
    recoveredDraftCount: imported.createdCount,
    recoveryCandidateCount: extraction.questions.length,
    recoveryPageCount: sourcePages.length,
    recoveryWindowCount: requestedWindows.length,
    reconciliation: counts,
    reviewRoute: `/teacher/banks/${input.targetBankId}/review`,
    warningCount: extraction.warnings.length + extraction.questions.length - imported.createdCount,
  };
}
