import { callAIPdfExtractionProvider } from "@/lib/ai-providers/chat";
import type { AIProviderExecutionObserver } from "@/lib/ai-providers/execution-budget";
import { AI_GENERATION_UNTRUSTED_DATA_BOUNDARY } from "@/lib/ai-providers/prompt-safety";
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
  createAIPdfProviderAttemptLedger,
  parseAIPdfProviderAttemptLedger,
  recordAIPdfCheckpointReplay,
  type AIPdfProviderAttemptLedger,
} from "@/lib/ai-providers/ai-pdf-attempt-state";
import {
  listEnabledAIProviderProfilesForServerUse,
  loadAIProviderProfileForServerUse,
  loadSafeAIProviderProfileForServerUse,
} from "@/lib/ai-providers/profiles";
import {
  cropPdfPlaceholderImage,
  getPdfPageCount,
  inspectQuestionVisualCrop,
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
  AIPdfBatchFinalizationContractError,
  isAIPdfPostPersistenceError,
  runAIPdfPostPersistenceStage,
} from "@/lib/ai-pdf-import/post-persistence";
import {
  AI_PDF_FENCED_SUMMARY_MAX_BYTES,
  compactAIPdfTerminalSummary,
} from "@/lib/ai-pdf-import/terminal-summary";
import {
  formatAIPdfChunkPageRange,
  mergeAIPdfImportChunkingSummary,
  normalizeAIPdfChunkingSummary,
  patchAIPdfChunkingSummary,
  type AIPdfImportChunkSummary,
} from "@/lib/ai-pdf-import/chunking";
import {
  deterministicAIPdfQuestionCode,
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
  AI_PDF_PARSING_TREATMENT_VERSION,
  createAIPdfQualityObservatory,
  fingerprintAIPdfParsingContract,
  parseAIPdfQualityCheckpoint,
  type AIPdfQualityCheckpoint,
  type AIPdfQualityObservatory,
} from "@/lib/ai-pdf-import/quality-observatory";
import {
  buildRuntimeTaxonomyCandidateSubset,
  buildRuntimeTaxonomySnapshot,
  RUNTIME_TAXONOMY_FACETS,
  serializeRuntimeTaxonomyCandidates,
  type RuntimeTaxonomySnapshot,
} from "@/lib/tags/runtime-taxonomy-snapshot";
import { GEMINI_AI_PDF_EXTRACTION_OUTPUT_CONTRACT } from "@/lib/ai-providers/gemini-structured-output";
import {
  AI_PDF_VISUAL_EVIDENCE_CONTRACT_VERSION,
  AI_PDF_VISUAL_MISSING_WARNING,
  contentSha256,
  deterministicQuestionAssetId,
  emptyAIPdfVisualProposalRejectionCounts,
  questionRequiresVisualEvidence,
  safeQuestionVisualAlt,
  validateAIPdfVisualProposal,
  visualEvidenceRecord,
  visualProposalKey,
} from "@/lib/ai-pdf-import/visual-evidence";
import { ensureSinglePageExtractionLineage } from "@/lib/ai-pdf-import/source-lineage";
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
import { getQuestionAssetUrl } from "@/lib/storage/question-assets";

type SupabaseLike = {
  from: (table: string) => any;
  // 0051 is not applied in this source-only branch, so generated types do not
  // include its service-role-only fencing RPCs yet.
  rpc?: any;
  storage: any;
};

type ActiveTag = {
  id: string;
  facet_key: string | null;
  label?: string | null;
  description?: string | null;
  aliases?: string[];
};

const AI_PDF_RUNTIME_TAXONOMY_FACETS = new Set<string>(RUNTIME_TAXONOMY_FACETS);

const AI_PDF_PROMPT_CONTRACT_VERSION = "ai-pdf-extraction-prompt-v4";
const AI_PDF_SCHEMA_CONTRACT_VERSION = "gemini-ai-pdf-extraction-schema-v3";
const AI_PDF_REPAIR_POLICY_VERSION =
  "source-free-structural-single-source-semantic-v2";

type AIPdfRuntimeTaxonomyContext = {
  activeTags: ActiveTag[];
  candidatePayload: string;
  candidateSubset: ReturnType<typeof buildRuntimeTaxonomyCandidateSubset>;
  parsingContractSha256: string;
  snapshot: RuntimeTaxonomySnapshot;
};

export const AI_PDF_PROVIDER_RESULT_CHECKPOINT_CONTRACT_VERSION = 1;

export type AIPdfProviderResultCheckpoint = {
  attemptLedger?: AIPdfProviderAttemptLedger;
  contractVersion: typeof AI_PDF_PROVIDER_RESULT_CHECKPOINT_CONTRACT_VERSION;
  extractions: Record<string, AIPdfExtraction>;
  qualityCheckpoint?: AIPdfQualityCheckpoint;
};

type AIPdfCheckpointStage = "normalized" | "drafts_persisted";

function isAIPdfExtraction(value: unknown): value is AIPdfExtraction {
  return Boolean(
    value &&
      typeof value === "object" &&
      Array.isArray((value as { questions?: unknown }).questions) &&
      Array.isArray((value as { warnings?: unknown }).warnings),
  );
}

export function parseAIPdfProviderResultCheckpoint(
  value: unknown,
): AIPdfProviderResultCheckpoint | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (record.contractVersion !== AI_PDF_PROVIDER_RESULT_CHECKPOINT_CONTRACT_VERSION) {
    return null;
  }
  if (!record.extractions || typeof record.extractions !== "object" || Array.isArray(record.extractions)) {
    return null;
  }

  const extractions = Object.entries(record.extractions).reduce<
    Record<string, AIPdfExtraction>
  >((result, [key, extraction]) => {
    if (!/^single$|^chunk:\d+$/.test(key) || !isAIPdfExtraction(extraction)) {
      return result;
    }
    result[key] = extraction;
    return result;
  }, {});
  const attemptLedger = record.attemptLedger == null
    ? undefined
    : parseAIPdfProviderAttemptLedger(record.attemptLedger);
  if (record.attemptLedger != null && !attemptLedger) return null;
  const qualityCheckpoint = record.qualityCheckpoint == null
    ? undefined
    : parseAIPdfQualityCheckpoint(record.qualityCheckpoint);
  if (record.qualityCheckpoint != null && !qualityCheckpoint) return null;

  return Object.keys(extractions).length || Object.keys(record.extractions).length === 0
    ? {
        ...(attemptLedger ? { attemptLedger } : {}),
        contractVersion: AI_PDF_PROVIDER_RESULT_CHECKPOINT_CONTRACT_VERSION,
        extractions,
        ...(qualityCheckpoint ? { qualityCheckpoint } : {}),
      }
    : null;
}

function appendAIPdfProviderResultCheckpoint({
  checkpoint,
  extraction,
  key,
  qualityCheckpoint,
}: {
  checkpoint: AIPdfProviderResultCheckpoint | undefined;
  extraction: AIPdfExtraction;
  key: string;
  qualityCheckpoint?: AIPdfQualityCheckpoint;
}): AIPdfProviderResultCheckpoint {
  return {
    ...(checkpoint?.attemptLedger
      ? { attemptLedger: checkpoint.attemptLedger }
      : {}),
    contractVersion: AI_PDF_PROVIDER_RESULT_CHECKPOINT_CONTRACT_VERSION,
    extractions: {
      ...(checkpoint?.extractions ?? {}),
      [key]: extraction,
    },
    ...((qualityCheckpoint ?? checkpoint?.qualityCheckpoint)
      ? {
          qualityCheckpoint:
            qualityCheckpoint ?? checkpoint?.qualityCheckpoint,
        }
      : {}),
  };
}

export type AIPdfProcessInput = {
  batchId: string;
  chunkIndex?: number;
  fileName: string;
  jobId?: string;
  pdfBuffer: Buffer;
  profileId: string;
  providerProfileId: string;
  providerExecutionObserver?: AIProviderExecutionObserver;
  providerAttemptLedger?: AIPdfProviderAttemptLedger;
  providerRouteCandidateIndex?: number;
  providerRetryMaxAttempts?: number;
  qualityObserver?: AIPdfQualityObservatory;
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
  // Durable workers may provide a protected, already-normalized provider
  // result. Direct/admin imports never set these hooks.
  providerResultCheckpoint?: AIPdfProviderResultCheckpoint;
  onProviderResultCheckpoint?: (
    checkpoint: AIPdfProviderResultCheckpoint,
  ) => Promise<void>;
  onProviderAttemptCheckpoint?: (
    checkpoint: AIPdfProviderResultCheckpoint,
  ) => Promise<void>;
  onCheckpointStage?: (
    stage: AIPdfCheckpointStage,
    metadata?: Record<string, unknown>,
  ) => Promise<void>;
  persistenceFence?: import("@/lib/ai-jobs/checkpoint").AIProviderJobPersistenceFence;
  persistenceLineageKey?: string;
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
          placeholders.map(
            (placeholder) => placeholder.page ?? placeholder.pageNumber,
          ),
        ),
        assetPlaceholders: placeholders.map((placeholder) => ({
          pageNumber: Number.isFinite(
            Number(placeholder.page ?? placeholder.pageNumber),
          )
            ? Number(placeholder.page ?? placeholder.pageNumber)
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

async function updateAIPdfBatchProgressBestEffort(
  input: ProcessInput,
  progress: AIPdfProgress,
) {
  try {
    await updateAIPdfBatchProgress(input, progress);
  } catch {
    // The durable checkpoint is authoritative after Provider output validates.
  }
}

async function finalizeAIPdfImportBatch({
  input,
  status,
  summary,
}: {
  input: AIPdfProcessInput;
  status: "failed" | "imported";
  summary: Record<string, unknown>;
}) {
  if (input.persistenceFence) {
    const summaryBytes = Buffer.byteLength(JSON.stringify(summary), "utf8");
    if (summaryBytes > AI_PDF_FENCED_SUMMARY_MAX_BYTES) {
      throw new AIPdfBatchFinalizationContractError({
        reason: "summary_too_large",
        summaryBytes,
      });
    }
    if (!input.supabase.rpc) {
      throw new AIPdfBatchFinalizationContractError({
        reason: "rpc_rejected",
        summaryBytes,
      });
    }
    const { data, error } = await input.supabase.rpc(
      "finalize_ai_provider_job_import_batch_fenced",
      {
        p_execution_fence_token: input.persistenceFence.executionFenceToken,
        p_job_id: input.persistenceFence.jobId,
        p_lease_owner: input.persistenceFence.leaseOwner,
        p_persisted_output_lineage: {
          contractVersion: AI_PDF_PROVIDER_RESULT_CHECKPOINT_CONTRACT_VERSION,
          persistenceLineageKey: input.persistenceLineageKey ?? null,
          stage: "drafts_persisted",
        },
        p_status: status,
        p_summary: summary,
      },
    );
    if (error) {
      throw new AIPdfBatchFinalizationContractError({
        cause: error,
        reason: "rpc_rejected",
        summaryBytes,
      });
    }
    if (data === "STALE_FENCE_REJECTED") {
      throw new AIPdfBatchFinalizationContractError({
        reason: "stale_fence",
        summaryBytes,
      });
    }
    if (data !== "APPLIED" && data !== "NOOP_ALREADY_CHECKPOINTED") {
      throw new AIPdfBatchFinalizationContractError({
        reason: "unexpected_outcome",
        summaryBytes,
      });
    }
    return;
  }

  const { error } = await input.supabase
    .from("import_batches")
    .update({ status, summary })
    .eq("id", input.batchId);
  if (error) throw new Error(error.message);
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
    qualityObservatory: input.qualityObserver?.snapshot(),
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
          "id, question_code, title, content_html, content_source, solution_html, solution_source, options",
        )
        .in("id", questionIds);

      if (questionError) {
        throw new Error("Question candidates could not be loaded for structural review.");
      }

      const { data: importItemData, error: importItemError } = await input.supabase
        .from("import_batch_items")
        .select("created_question_id, normalized_question_json")
        .eq("batch_id", input.batchId)
        .in("created_question_id", questionIds);
      if (importItemError) {
        throw new Error("Question source metadata could not be loaded for structural review.");
      }
      const metadataByQuestionId = new Map(
        (importItemData ?? []).map((item: Record<string, unknown>) => [
          String(item.created_question_id ?? ""),
          plainObject(plainObject(item.normalized_question_json).ai_metadata),
        ]),
      );
      questionRows = ((questionData ?? []) as Array<Record<string, unknown>>).map(
        (row) => ({
          ...row,
          ai_metadata: metadataByQuestionId.get(String(row.id ?? "")) ?? {},
        }),
      );

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

async function generateAndStorePostPersistenceReviewPlans({
  input,
}: {
  input: ProcessInput;
}) {
  // These plans annotate already-persisted, review-gated drafts. Their
  // availability must not turn successful extraction into a Provider failure.
  await generateAndStoreExtractionCoverageAuditPlan({ input }).catch(
    () => undefined,
  );
  await generateAndStoreQuestionBoundaryGuardPlan({ input });
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
  chunk,
  fileName,
  pageMapping,
  pageCount,
  recoveryOnly = false,
  runtimeTaxonomy,
  selectiveExecution = false,
}: {
  chunk?: Pick<AIPdfImportChunkSummary, "pageEnd" | "pageStart">;
  fileName: string;
  pageMapping?: { chunkPage: number; sourcePage: number }[];
  pageCount: number;
  recoveryOnly?: boolean;
  runtimeTaxonomy: AIPdfRuntimeTaxonomyContext;
  selectiveExecution?: boolean;
}) {
  const taxonomyCandidates = runtimeTaxonomy.candidatePayload || "(none)";
  const prompt = [
    "You are importing a PDF question set into a question bank.",
    AI_GENERATION_UNTRUSTED_DATA_BOUNDARY,
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
    taxonomyCandidates,
    "",
    `Parsing contract version: ${AI_PDF_PARSING_TREATMENT_VERSION}.`,
    `Parsing contract SHA-256: ${runtimeTaxonomy.parsingContractSha256}.`,
    `Full authoritative taxonomy snapshot SHA-256: ${runtimeTaxonomy.snapshot.sha256}.`,
    `Taxonomy candidate-subset SHA-256: ${runtimeTaxonomy.candidateSubset.sha256}.`,
    `Taxonomy retrieval algorithm: ${runtimeTaxonomy.candidateSubset.version}.`,
    `Prompt contract: ${AI_PDF_PROMPT_CONTRACT_VERSION}.`,
    `Schema contract: ${AI_PDF_SCHEMA_CONTRACT_VERSION}.`,
    `Repair policy: ${AI_PDF_REPAIR_POLICY_VERSION}.`,
    "Taxonomy tagging contract:",
    "- The five canonical facets are curriculum, concept, method, task, and form.",
    "- Select a tag only when the visible source directly supports that exact active assignable tag_id.",
    "- Prefer a specific supported tag over a broad parent, but never infer a narrower tag from the label alone.",
    "- Do not fill a facet merely for coverage. An empty facet is safer than an inaccurate assignment.",
    "- Use multiple curriculum tags only when the source itself establishes each curriculum alignment.",
    "- If no listed exact ID is adequately supported, leave that facet untagged and add a concise warning.",
    "- Never output labels, aliases, shortened IDs, parent guesses, or planning-only taxonomy identifiers as tag_ids.",
    "",
    "JSON schema:",
    JSON.stringify({
      questions: [
        {
          asset_placeholders: [
            {
              alt: "short figure alt text",
              bbox: { height: 0.2, width: 0.4, x: 0.1, y: 0.2 },
              confidence: 0.9,
              page: 1,
              placeholder: "{{asset:figure_1}}",
              required: true,
              shared_group_key: "question_1_shared_figure",
              subquestion_ref: "a",
              visual_role: "diagram",
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
    "- If a figure, chart, graph, table image, or diagram is important to the question, create one asset_placeholders entry so the system can crop it from the authoritative PDF and display it in the question image gallery.",
    "- For each visual proposal, identify visual_role, whether it is required, the owning subquestion when present, and a shared_group_key when the same figure supports multiple subquestions.",
    "- page_refs is required and must contain every visible source page used by the question. Never return an empty page_refs array for a visible question.",
    "- Every asset placeholder page must also appear in that question's page_refs. Never attach a crop from another question's page.",
    "- Use confidence only for the visual association. Put any crop or ownership ambiguity in ambiguity; never invent a page or bounding region.",
    "- Decorative logos, headers, watermarks, and page furniture must not be attached as question evidence.",
    "- If the image must appear at an exact inline position, also put the exact placeholder string inside content_html or solution_html at that location.",
    "- Inline placeholders are optional because cropped images are also attached as question_assets and shown below the question detail.",
    "- Use placeholder strings exactly like {{asset:figure_1}}. Do not alter braces, spacing, or capitalization.",
    "- Bboxes are normalized page coordinates from top-left. Use a tight box around the actual visual with only a small margin; do not return a whole-page or mostly blank crop.",
    "- Every bbox value is 0..1, width and height are positive, x + width must be <= 1, and y + height must be <= 1.",
    "- Use question_number only for the visible number from the PDF. Do not invent database question_code values; the server always generates those.",
    "- Do not normalize visible numbers aggressively: 3, 3.1, 3(a), and FRQ 2 are different display values.",
    "- Assign multiple tag_ids when they accurately describe the question. A single question can and should reuse existing tags across several facets when relevant.",
    "- It is okay for many questions to reuse the same tag_id if they cover the same concept, method, task, curriculum, or difficulty signal.",
    "- Prefer specific leaf tag_ids over broad parent-like IDs. Only use tag_ids from the list above.",
    "- Only output tag_ids listed above. If no existing tag fits, leave tag_ids empty and add a warning. Do not output any alternate tag identifier fields.",
    "- Keep questions as draft-quality records for human review; do not invent answers when unsure.",
  ].join("\n");
  const schemaPrefix = "JSON schema:\n";
  const schemaStart = prompt.indexOf(schemaPrefix) + schemaPrefix.length;
  const schemaEnd = prompt.indexOf("\n\nRules:", schemaStart);
  const schemaText = schemaStart >= schemaPrefix.length && schemaEnd > schemaStart
    ? prompt.slice(schemaStart, schemaEnd)
    : "";
  const promptBytes = Buffer.byteLength(prompt, "utf8");
  const taxonomyCandidateBytes = Buffer.byteLength(taxonomyCandidates, "utf8");
  const structuredSchemaBytes = Buffer.byteLength(schemaText, "utf8");

  return {
    context: {
      extractionInstructionBytes: Math.max(
        0,
        promptBytes - taxonomyCandidateBytes - structuredSchemaBytes,
      ),
      structuredSchemaBytes,
      taxonomyCandidateBytes,
    },
    parsingContractSha256: runtimeTaxonomy.parsingContractSha256,
    taxonomySnapshotSha256: runtimeTaxonomy.snapshot.sha256,
    text: prompt,
  };
}

async function persistAIPdfProviderAttemptLedger(
  input: AIPdfProcessInput,
  ledger: AIPdfProviderAttemptLedger,
) {
  input.providerAttemptLedger = ledger;
  input.providerResultCheckpoint = {
    attemptLedger: ledger,
    contractVersion: AI_PDF_PROVIDER_RESULT_CHECKPOINT_CONTRACT_VERSION,
    extractions: input.providerResultCheckpoint?.extractions ?? {},
    ...(input.qualityObserver
      ? { qualityCheckpoint: input.qualityObserver.checkpoint() }
      : input.providerResultCheckpoint?.qualityCheckpoint
        ? { qualityCheckpoint: input.providerResultCheckpoint.qualityCheckpoint }
        : {}),
  };
  await input.onProviderAttemptCheckpoint?.(input.providerResultCheckpoint);
}

function unknownTaxonomyIdCount({
  activeTags,
  extraction,
}: {
  activeTags: ActiveTag[];
  extraction: AIPdfExtraction;
}) {
  const activeTagIds = new Set(activeTags.map((tag) => tag.id));

  return extraction.questions.reduce(
    (count, question) =>
      count +
      question.tag_ids.filter(
        (tagId) => tagId.trim() && !activeTagIds.has(tagId.trim()),
      ).length,
    0,
  );
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

async function loadActiveTags(
  supabase: SupabaseLike,
): Promise<AIPdfRuntimeTaxonomyContext> {
  const loaded = await loadTaxonomyCatalog(supabase, { includeAllEdges: true });
  if (loaded.errorMessage) throw new Error(loaded.errorMessage);

  const snapshot = buildRuntimeTaxonomySnapshot({
    ...loaded.catalog,
    edges: loaded.edges,
  });
  if (!snapshot.valid) {
    throw new Error("The runtime taxonomy graph failed canonical validation.");
  }
  const candidateSubset = buildRuntimeTaxonomyCandidateSubset(snapshot.candidates);
  const candidatePayload = serializeRuntimeTaxonomyCandidates(
    candidateSubset.candidates,
  );
  const parsingContract = fingerprintAIPdfParsingContract({
    candidateSubset: candidateSubset.canonicalJson,
    outputContract: JSON.stringify(GEMINI_AI_PDF_EXTRACTION_OUTPUT_CONTRACT),
    promptContractVersion: AI_PDF_PROMPT_CONTRACT_VERSION,
    repairPolicyVersion: AI_PDF_REPAIR_POLICY_VERSION,
    retrievalAlgorithmVersion: candidateSubset.version,
    schemaContractVersion: AI_PDF_SCHEMA_CONTRACT_VERSION,
    taxonomyCandidates: candidatePayload,
    fullTaxonomySnapshot: snapshot.canonicalJson,
    treatmentVersion: AI_PDF_PARSING_TREATMENT_VERSION,
  });
  const activeTags = candidateSubset.candidates
    .filter((tag) => AI_PDF_RUNTIME_TAXONOMY_FACETS.has(tag.facet))
    .map((tag) => ({
      aliases: tag.aliases,
      facet_key: tag.facet,
      id: tag.tagId,
      label: tag.label,
    }));

  if (
    snapshot.facetKeys.length !== RUNTIME_TAXONOMY_FACETS.length ||
    !RUNTIME_TAXONOMY_FACETS.every(
      (facet, index) => snapshot.facetKeys[index] === facet,
    )
  ) {
    throw new Error("The runtime taxonomy does not contain the exact five-facet contract.");
  }

  return {
    activeTags,
    candidatePayload,
    candidateSubset,
    parsingContractSha256: parsingContract.contractSha256,
    snapshot,
  };
}

async function loadActiveLeafTaxonomyCandidates(supabase: SupabaseLike) {
  const runtimeTaxonomy = await loadActiveTags(supabase);

  return runtimeTaxonomy.snapshot.candidates.map(
    (node): AIQuestionBlueprintTaxonomyCandidate => ({
      aliases: node.aliases,
      description: null,
      facetKey: node.facet,
      label: node.label,
      tagId: node.tagId,
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
  persistenceLineageKey,
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
  persistenceLineageKey?: string;
  recovery?: {
    originalBatchId: string;
    recoveryPlanHash: string;
    sourceAssetId: string;
    windowIds: string[];
  };
  supabase: SupabaseLike;
}) {
  const activeTagIds = new Set(activeTags.map((tag) => tag.id));
  // Durable imports derive question codes from their exact persistence
  // lineage, so a global code scan is both unnecessary and a transient read
  // dependency after Provider output has already been checkpointed.
  const existingQuestionCodes = persistenceLineageKey
    ? new Set<string>()
    : await loadExistingQuestionCodeKeys(supabase);
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
    const questionCode = persistenceLineageKey
      ? deterministicAIPdfQuestionCode(batchId, globalQuestionIndex)
      : generateAIPdfQuestionCodeForImport({
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
    const visualRequired = questionRequiresVisualEvidence({
      contentHtml,
      contentSource,
    }) || question.visual_evidence_required;
    if (visualRequired && !question.asset_placeholders.length) {
      extraction.warnings.push(
        `Question ${globalQuestionIndex + 1}: ${AI_PDF_VISUAL_MISSING_WARNING}`,
      );
    }
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
        visual_evidence: {
          contract_version: AI_PDF_VISUAL_EVIDENCE_CONTRACT_VERSION,
          proposal_count: question.asset_placeholders.length,
          required: visualRequired,
        },
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

class QuestionAssetPersistenceError extends Error {
  readonly cleanupTarget?: { assetId: string; objectPath: string };

  constructor(
    message: string,
    cleanupTarget?: { assetId: string; objectPath: string },
  ) {
    super(message);
    this.name = "QuestionAssetPersistenceError";
    this.cleanupTarget = cleanupTarget;
  }
}

async function uploadQuestionAsset({
  alt,
  contentHash,
  displayOrder,
  image,
  profileId,
  questionId,
  sourceAssetId,
  supabase,
}: {
  alt: string;
  contentHash: string;
  displayOrder: number;
  image: Buffer;
  profileId: string;
  questionId: string;
  sourceAssetId: string;
  supabase: SupabaseLike;
}) {
  if (image.length > QUESTION_ASSET_MAX_BYTES) {
    throw new Error("Cropped question image exceeds the image size limit.");
  }

  const assetId = deterministicQuestionAssetId({
    contentHash,
    questionId,
    sourceAssetId,
  });
  const objectPath = `questions/${questionId}/ai-pdf/${assetId}.png`;
  const label = `AI imported figure ${displayOrder + 1}`;
  const { data: existingAsset, error: existingError } = await supabase
    .from("question_assets")
    .select("id, question_id, storage_bucket, storage_path")
    .eq("id", assetId)
    .maybeSingle();

  if (existingError) {
    throw new QuestionAssetPersistenceError(
      "Question image metadata lookup failed.",
    );
  }
  if (
    existingAsset &&
    (existingAsset.question_id !== questionId ||
      existingAsset.storage_bucket !== QUESTION_ASSETS_BUCKET ||
      existingAsset.storage_path !== objectPath)
  ) {
    throw new QuestionAssetPersistenceError(
      "Deterministic question image identity is already in use.",
    );
  }

  const publicUrl = getQuestionAssetUrl(assetId);
  const result = {
    assetId,
    html: `<img src="${escapeAttribute(publicUrl)}" alt="${escapeAttribute(
      alt,
    )}" data-ai-visual-contract="${AI_PDF_VISUAL_EVIDENCE_CONTRACT_VERSION}" />`,
    objectPath,
    publicUrl,
  };

  if (existingAsset) {
    return { ...result, created: false };
  }

  const { error: uploadError } = await supabase.storage
    .from(QUESTION_ASSETS_BUCKET)
    .upload(objectPath, image, {
      contentType: "image/png",
      upsert: false,
    });

  if (uploadError) {
    throw new QuestionAssetPersistenceError("Question image upload failed.");
  }

  const { error: insertError } = await supabase.from("question_assets").insert({
    alt_text: alt,
    asset_kind: "image",
    created_by: profileId,
    display_order: displayOrder,
    id: assetId,
    label,
    question_id: questionId,
    storage_bucket: QUESTION_ASSETS_BUCKET,
    storage_path: objectPath,
  });

  if (insertError) {
    let storageCleaned = false;
    for (let cleanupAttempt = 1; cleanupAttempt <= 2; cleanupAttempt += 1) {
      const { error: cleanupError } = await supabase.storage
        .from(QUESTION_ASSETS_BUCKET)
        .remove([objectPath]);
      if (!cleanupError) {
        storageCleaned = true;
        break;
      }
    }

    throw new QuestionAssetPersistenceError(
      storageCleaned
        ? "Question image metadata persistence failed."
        : "Question image metadata persistence and exact cleanup failed.",
      storageCleaned ? undefined : { assetId, objectPath },
    );
  }

  return { ...result, created: true };
}

async function cleanupCreatedQuestionAsset({
  assetId,
  objectPath,
  supabase,
}: {
  assetId: string;
  objectPath: string;
  supabase: SupabaseLike;
}) {
  const { error: storageError } = await supabase.storage
    .from(QUESTION_ASSETS_BUCKET)
    .remove([objectPath]);
  if (storageError) {
    throw new Error("Exact question image Storage cleanup failed.");
  }

  const { error: rowError } = await supabase
    .from("question_assets")
    .delete()
    .eq("id", assetId);

  if (rowError) {
    throw new Error("Exact question image row cleanup failed.");
  }
}

function replacePlaceholder(value: string | null, placeholder: string, html: string) {
  return value?.replaceAll(placeholder, html) ?? null;
}

async function attachCroppedAssets({
  batchId,
  createdQuestions,
  extraction,
  pdfBuffer,
  profileId,
  qualityObserver,
  renderedPages,
  sourceAssetId,
  sourceBatchId,
  supabase,
  targetBankId,
}: {
  batchId: string;
  createdQuestions: { id: string; questionCode: string }[];
  extraction: AIPdfExtraction;
  pdfBuffer: Buffer;
  profileId: string;
  qualityObserver?: AIPdfQualityObservatory;
  renderedPages?: RenderedPage[];
  sourceAssetId: string;
  sourceBatchId: string;
  supabase: SupabaseLike;
  targetBankId: string | null;
}) {
  const byCode = new Map(
    createdQuestions.map((question) => [question.questionCode.toLowerCase(), question]),
  );
  const warnings: string[] = [];
  let uploadedCount = 0;
  const visualEvidence = {
    attachedAssets: 0,
    blockingMissingRequired: 0,
    decorativeSkipped: 0,
    duplicateProposals: 0,
    invalidProposals: 0,
    invalidProposalReasons: emptyAIPdfVisualProposalRejectionCounts(),
    proposedAssets: extraction.questions.reduce(
      (total, question) => total + question.asset_placeholders.length,
      0,
    ),
    requiredQuestions: 0,
    reusedAssets: 0,
    validCrops: 0,
  };
  let pages: RenderedPage[] = [];
  let renderFailure = false;
  const hasLineageBoundVisualWork = extraction.questions.some(
    (question) =>
      question.visual_evidence_required ||
      questionRequiresVisualEvidence({
        contentHtml: question.content_html,
        contentSource: question.content_source,
      }) ||
      question.asset_placeholders.some(
        (placeholder) =>
          placeholder.visual_role !== "decorative" || placeholder.required,
      ),
  );

  if (!hasLineageBoundVisualWork) {
    visualEvidence.decorativeSkipped = visualEvidence.proposedAssets;
    qualityObserver?.recordVisualEvidence(visualEvidence);
    return { uploadedCount, visualEvidence, warnings };
  }
  if (!sourceAssetId || !sourceBatchId) {
    throw new Error("Question visual source lineage is missing.");
  }

  const { data: sourceAsset, error: sourceAssetError } = await supabase
    .from("import_batch_assets")
    .select("id")
    .eq("id", sourceAssetId)
    .eq("batch_id", sourceBatchId)
    .eq("asset_role", "source_pdf")
    .eq("status", "ready")
    .maybeSingle();
  if (sourceAssetError || !sourceAsset) {
    throw new Error("Question visual source lineage could not be validated.");
  }

  if (visualEvidence.proposedAssets > 0) {
    try {
      pages = renderedPages?.length ? renderedPages : await renderPdfPages(pdfBuffer);
    } catch (error) {
      renderFailure = true;
      warnings.push("PDF page rendering for visual evidence failed.");
    }
  }

  for (const question of extraction.questions) {
    const requiresVisual =
      questionRequiresVisualEvidence({
        contentHtml: question.content_html,
        contentSource: question.content_source,
      }) || question.visual_evidence_required;
    if (requiresVisual) visualEvidence.requiredQuestions += 1;

    if (!requiresVisual && question.asset_placeholders.length === 0) {
      continue;
    }
    if (
      !requiresVisual &&
      question.asset_placeholders.every(
        (placeholder) =>
          placeholder.visual_role === "decorative" && !placeholder.required,
      )
    ) {
      visualEvidence.decorativeSkipped += question.asset_placeholders.length;
      continue;
    }

    const questionCode =
      question.question_code?.trim() ||
      createdQuestions.find((created) => !byCode.has(created.questionCode))?.questionCode;
    const created = questionCode ? byCode.get(questionCode.toLowerCase()) : null;

    if (!created) {
      warnings.push("A visual proposal could not be matched to its created Draft.");
      continue;
    }

    const { data: questionRow, error: questionError } = await supabase
      .from("questions")
      .select(
        "content_html, content_source, owner_bank_id, solution_html, solution_source, source, source_review_item_id, updated_by",
      )
      .eq("id", created.id)
      .single();

    if (questionError) throw new Error(questionError.message);
    if (
      questionRow.source !== `ai_pdf_import:${batchId}` ||
      (targetBankId && questionRow.owner_bank_id !== targetBankId)
    ) {
      throw new Error("Question visual source or Library lineage did not match.");
    }
    if (!questionRow.source_review_item_id) {
      throw new Error("Question visual Review lineage is missing.");
    }
    const { data: reviewItem, error: reviewError } = await supabase
      .from("review_draft_items")
      .select("id, draft_payload, status, validation_warnings")
      .eq("id", questionRow.source_review_item_id)
      .eq("created_question_id", created.id)
      .maybeSingle();
    if (reviewError) throw new Error(reviewError.message);
    if (!reviewItem) {
      throw new Error("Question visual Review lineage is missing.");
    }
    if (
      reviewItem.status !== "pending_review" &&
      reviewItem.status !== "needs_more_evidence"
    ) {
      throw new Error("Question visual Review Draft is no longer editable.");
    }

    const existingWarnings: string[] = Array.isArray(
      reviewItem.validation_warnings,
    )
      ? reviewItem.validation_warnings.filter(
          (value: unknown): value is string => typeof value === "string",
        )
      : [];
    const persistenceLockWarning =
      "Visual evidence persistence is incomplete; approval remains blocked.";
    const finalExistingWarnings = existingWarnings.filter(
      (warning: string) =>
        warning !== persistenceLockWarning &&
        warning !== AI_PDF_VISUAL_MISSING_WARNING,
    );
    const canClearExistingVisualBlock =
      reviewItem.status === "needs_more_evidence" &&
      existingWarnings.some(
        (warning: string) =>
          warning === persistenceLockWarning ||
          warning === AI_PDF_VISUAL_MISSING_WARNING,
      ) &&
      finalExistingWarnings.length === 0;
    const { error: reviewLockError } = await supabase
      .from("review_draft_items")
      .update({
        status: "needs_more_evidence",
        validation_warnings: uniqueStrings([
          ...existingWarnings,
          persistenceLockWarning,
        ]),
      })
      .eq("id", reviewItem.id);
    if (reviewLockError) {
      throw new Error("Question visual Review lock could not be established.");
    }

    const proposalKeys = new Set<string>();
    const evidenceRecords: Array<Record<string, unknown>> = [];
    const createdAssets: Array<{ assetId: string; objectPath: string }> = [];
    const questionWarnings: string[] = [];
    let nextContentHtml = questionRow.content_html;
    let nextContentSource = questionRow.content_source;
    let nextSolutionHtml = questionRow.solution_html;
    let nextSolutionSource = questionRow.solution_source;
    let attachedForQuestion = 0;
    let persistenceFailure: unknown = null;
    let requiredProposalFailed = false;

    for (const [proposalIndex, placeholder] of question.asset_placeholders.entries()) {
      const proposalKey = visualProposalKey(placeholder);
      if (proposalKeys.has(proposalKey)) {
        visualEvidence.duplicateProposals += 1;
        continue;
      }
      proposalKeys.add(proposalKey);

      if (placeholder.visual_role === "decorative") {
        if (placeholder.required) {
          visualEvidence.invalidProposals += 1;
          visualEvidence.invalidProposalReasons.decorative_required += 1;
          requiredProposalFailed = true;
          questionWarnings.push(
            "A visual proposal was both decorative and required; approval remains blocked.",
          );
        } else {
          visualEvidence.decorativeSkipped += 1;
        }
        continue;
      }

      const proposalValidation = validateAIPdfVisualProposal({
        availablePageNumbers: pages.map((page) => page.page),
        pageCount: pages.length,
        placeholder,
        questionPageRefs: question.page_refs,
      });
      if (renderFailure || !proposalValidation.valid) {
        visualEvidence.invalidProposals += 1;
        if (renderFailure) {
          visualEvidence.invalidProposalReasons.source_render_unavailable += 1;
        } else if (proposalValidation.reason) {
          visualEvidence.invalidProposalReasons[proposalValidation.reason] += 1;
        }
        requiredProposalFailed ||= placeholder.required;
        questionWarnings.push("A visual crop proposal could not be validated.");
        continue;
      }

      let cropped: Buffer;
      try {
        cropped = await cropPdfPlaceholderImage({
          pages,
          placeholder,
        });
        await inspectQuestionVisualCrop(cropped);
      } catch {
        visualEvidence.invalidProposals += 1;
        visualEvidence.invalidProposalReasons.invalid_crop_content += 1;
        requiredProposalFailed ||= placeholder.required;
        questionWarnings.push("A visual crop proposal could not be validated.");
        continue;
      }

      try {
        const contentHash = contentSha256(cropped);
        const uploaded = await uploadQuestionAsset({
          alt: safeQuestionVisualAlt(placeholder),
          contentHash,
          displayOrder: proposalIndex,
          image: cropped,
          profileId,
          questionId: created.id,
          sourceAssetId,
          supabase,
        });
        if (uploaded.created) {
          createdAssets.push({
            assetId: uploaded.assetId,
            objectPath: uploaded.objectPath,
          });
        } else {
          visualEvidence.reusedAssets += 1;
        }

        const replacedContentHtml = replacePlaceholder(
          nextContentHtml,
          placeholder.placeholder,
          uploaded.html,
        );
        const replacedContentSource = replacePlaceholder(
          nextContentSource,
          placeholder.placeholder,
          uploaded.html,
        );
        const replacedSolutionHtml = replacePlaceholder(
          nextSolutionHtml,
          placeholder.placeholder,
          uploaded.html,
        );
        const replacedSolutionSource = replacePlaceholder(
          nextSolutionSource,
          placeholder.placeholder,
          uploaded.html,
        );
        const wasEmbedded =
          replacedContentHtml !== nextContentHtml ||
          replacedSolutionHtml !== nextSolutionHtml;

        nextContentHtml = replacedContentHtml;
        nextContentSource = replacedContentSource;
        nextSolutionHtml = replacedSolutionHtml;
        nextSolutionSource = replacedSolutionSource;

        if (!wasEmbedded) {
          questionWarnings.push(
            "A validated crop was attached in the question image gallery.",
          );
        }
        evidenceRecords.push(
          visualEvidenceRecord({
            assetId: uploaded.assetId,
            contentHash,
            placeholder,
            sourceAssetId,
          }),
        );
        attachedForQuestion += 1;
        uploadedCount += 1;
        visualEvidence.attachedAssets += 1;
        visualEvidence.validCrops += 1;
      } catch (error) {
        if (
          error instanceof QuestionAssetPersistenceError &&
          error.cleanupTarget
        ) {
          createdAssets.push(error.cleanupTarget);
        }
        persistenceFailure = error;
        break;
      }
    }

    const missingRequiredVisual =
      requiresVisual && (attachedForQuestion === 0 || requiredProposalFailed);
    if (missingRequiredVisual) {
      visualEvidence.blockingMissingRequired += 1;
      questionWarnings.push(AI_PDF_VISUAL_MISSING_WARNING);
    }

    let questionUpdated = false;
    try {
      if (persistenceFailure) throw persistenceFailure;

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
      if (updateError) throw new Error(updateError.message);
      questionUpdated = true;

      const { error: reviewUpdateError } = await supabase
        .from("review_draft_items")
        .update({
          draft_payload: {
            ...plainObject(reviewItem.draft_payload),
            visualEvidence: {
              contractVersion: AI_PDF_VISUAL_EVIDENCE_CONTRACT_VERSION,
              records: evidenceRecords,
              required: requiresVisual,
              sourceAssetId,
              status: missingRequiredVisual ? "needs_more_evidence" : "validated",
            },
          },
          status: missingRequiredVisual
            ? "needs_more_evidence"
            : canClearExistingVisualBlock
              ? "pending_review"
              : reviewItem.status,
          validation_warnings: uniqueStrings([
            ...finalExistingWarnings,
            ...questionWarnings,
          ]),
        })
        .eq("id", reviewItem.id);
      if (reviewUpdateError) throw new Error(reviewUpdateError.message);
    } catch (error) {
      const compensationFailures: string[] = [];
      let canRemoveAssets = !questionUpdated;
      const { data: currentQuestion, error: currentQuestionError } = await supabase
        .from("questions")
        .select("content_html, content_source, solution_html, solution_source")
        .eq("id", created.id)
        .maybeSingle();
      if (currentQuestionError || !currentQuestion) {
        canRemoveAssets = false;
        compensationFailures.push("question_state_check");
      } else {
        const currentQuestionText = [
          currentQuestion.content_html,
          currentQuestion.content_source,
          currentQuestion.solution_html,
          currentQuestion.solution_source,
        ].join(" ");
        const referencesCreatedAsset = createdAssets.some((asset) =>
          currentQuestionText.includes(asset.assetId),
        );
        canRemoveAssets = !questionUpdated && !referencesCreatedAsset;
      }

      if (!canRemoveAssets) {
        const { error: questionRestoreError } = await supabase
          .from("questions")
          .update({
            content_html: questionRow.content_html,
            content_source: questionRow.content_source,
            solution_html: questionRow.solution_html,
            solution_source: questionRow.solution_source,
            updated_by: questionRow.updated_by,
          })
          .eq("id", created.id);
        if (questionRestoreError) {
          compensationFailures.push("question_restore");
        } else {
          const { data: restoredQuestion, error: restoredQuestionError } =
            await supabase
              .from("questions")
              .select("content_html, content_source, solution_html, solution_source")
              .eq("id", created.id)
              .maybeSingle();
          canRemoveAssets =
            !restoredQuestionError &&
            restoredQuestion?.content_html === questionRow.content_html &&
            restoredQuestion?.content_source === questionRow.content_source &&
            restoredQuestion?.solution_html === questionRow.solution_html &&
            restoredQuestion?.solution_source === questionRow.solution_source;
          if (!canRemoveAssets) compensationFailures.push("question_restore_verify");
        }
      }

      if (canRemoveAssets) {
        for (const asset of createdAssets) {
          let cleaned = false;
          for (let cleanupAttempt = 1; cleanupAttempt <= 2; cleanupAttempt += 1) {
            try {
              await cleanupCreatedQuestionAsset({
                assetId: asset.assetId,
                objectPath: asset.objectPath,
                supabase,
              });
              cleaned = true;
              break;
            } catch {
              // The retry remains bound to this exact deterministic asset.
            }
          }
          if (!cleaned) compensationFailures.push("asset_cleanup");
        }
      }

      if (compensationFailures.length > 0) {
        throw new Error(
          `Question visual persistence compensation failed: ${uniqueStrings(compensationFailures).join(", ")}.`,
        );
      }
      throw error;
    }

    warnings.push(...questionWarnings);
  }

  qualityObserver?.recordVisualEvidence(visualEvidence);

  return {
    uploadedCount,
    visualEvidence,
    warnings: uniqueStrings(warnings),
  };
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
    activeTags = (await loadActiveTags(input.supabase)).activeTags;
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
                executionObserver: input.providerExecutionObserver,
                onProviderUsage: input.onProviderUsage,
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
                    executionObserver: input.providerExecutionObserver,
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
  runtimeTaxonomy,
  selectiveInput,
}: {
  activeTags: ActiveTag[];
  input: ProcessInput;
  pageCount: number;
  provider: Awaited<ReturnType<typeof loadAIProviderProfileForServerUse>>;
  providerInput: ReturnType<typeof describeAiPdfProviderInput>;
  providerSummary: { id: string; model: string; name: string; provider: string };
  runtimeTaxonomy: AIPdfRuntimeTaxonomyContext;
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
    fileName: input.fileName,
    pageMapping: selectiveInput?.pageMapping,
    pageCount,
    runtimeTaxonomy,
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
  const recoveredExtraction = input.providerResultCheckpoint?.extractions.single;
  const providerResult = recoveredExtraction
    ? { value: recoveredExtraction }
    : {
        value: normalizeAIPdfExtractionResponse(
          await callAIPdfExtractionProvider({
            attemptLedger: input.providerAttemptLedger,
            attemptScope: "single",
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
            executionObserver: input.providerExecutionObserver,
            inputStrategy: providerInput.strategy,
            pageImageDataUrls: [],
            pdfBase64: (selectiveInput?.pdfBytes ?? input.pdfBuffer).toString(
              "base64",
            ),
            pdfBytes: selectiveInput?.pdfBytes ?? input.pdfBuffer,
            onProviderUsage: (usage) => {
              if (usage) usageSamples.push(usage);
              input.onProviderUsage?.(usage);
            },
            onAttemptLedgerCheckpoint: (ledger) =>
              persistAIPdfProviderAttemptLedger(input, ledger),
            onProviderRetry: (retry) =>
              updateAIPdfProviderRetryProgress({
                input,
                pageCount,
                provider: providerSummary,
                retry,
                sourceInput: providerInput.strategy,
              }),
            profile: provider,
            prompt: prompt.text,
            promptContext: prompt.context,
            providerRetryMaxAttempts: input.providerRetryMaxAttempts,
            qualityObserver: input.qualityObserver,
            routeCandidateIndex: input.providerRouteCandidateIndex,
          }),
        ),
      };
  const providerExtraction = ensureSinglePageExtractionLineage({
    extraction: providerResult.value,
    suppliedPageCount: selectiveInput?.pageMapping.length ?? pageCount,
  });
  const extraction = selectiveInput
    ? remapSegmentExtractionPages({
        extraction: providerExtraction,
        pageMapping: selectiveInput.pageMapping,
      })
    : providerExtraction;

  if (!recoveredExtraction && input.onProviderResultCheckpoint) {
    input.providerResultCheckpoint = appendAIPdfProviderResultCheckpoint({
      checkpoint: input.providerResultCheckpoint,
      extraction,
      key: "single",
      qualityCheckpoint: input.qualityObserver?.checkpoint(),
    });
    await input.onProviderResultCheckpoint(input.providerResultCheckpoint);
  } else if (recoveredExtraction) {
    input.qualityObserver?.recordCheckpointReplay();
    if (input.providerAttemptLedger) {
      recordAIPdfCheckpointReplay(input.providerAttemptLedger, "single");
      await persistAIPdfProviderAttemptLedger(
        input,
        input.providerAttemptLedger,
      );
    }
  }

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

  await updateAIPdfBatchProgressBestEffort(input, {
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
    persistenceLineageKey: input.persistenceLineageKey,
    supabase: input.supabase,
  });
  await input.onCheckpointStage?.("normalized", {
    providerResultReused: Boolean(recoveredExtraction),
    questionCount: extraction.questions.length,
  });
  await updateAIPdfBatchProgressBestEffort(input, {
    detail: "Importing generated questions.",
    pageCount,
    phase: "importing_questions",
    provider: providerSummary,
    sourceInput: providerInput.strategy,
    warnings: extraction.warnings,
  });

  const importSummary = await runAIPdfPostPersistenceStage({
    operation: () => importBatchImportJson({
      allowDraftTags: true,
      batchId: input.batchId,
      deferFinalization: Boolean(input.persistenceFence),
      initialSummaryExtras: {},
      jsonText,
      profileId: input.profileId,
      sourceType: "ai_pdf",
      supabase: input.supabase,
      targetBankId: input.targetBankId,
      persistenceFence: input.persistenceFence,
      persistenceLineageKey: input.persistenceLineageKey,
    }),
    stage: "draft_persistence",
  });
  input.qualityObserver?.recordPersistence({
    duplicateCount: importSummary.duplicateCount,
    importableReviewDrafts: importSummary.createdCount,
    unknownTaxonomyIdCount: unknownTaxonomyIdCount({
      activeTags,
      extraction,
    }),
  });
  await input.onCheckpointStage?.("drafts_persisted", {
    createdDraftCount: importSummary.createdCount,
    persistenceLineageKey: input.persistenceLineageKey ?? null,
  });

  const cropSummary = await runAIPdfPostPersistenceStage({
    operation: async () => {
      await updateAIPdfBatchProgress(input, {
        detail: "Attaching AI crop placeholders to created draft questions.",
        pageCount,
        phase: "cropping_assets",
        provider: providerSummary,
        questionCount: extraction.questions.length,
        sourceInput: providerInput.strategy,
        warnings: extraction.warnings,
      });
      return importSummary.createdCount > 0
        ? attachCroppedAssets({
            batchId: input.batchId,
            createdQuestions: importSummary.createdQuestions,
            extraction,
            pdfBuffer: input.pdfBuffer,
            profileId: input.profileId,
            qualityObserver: input.qualityObserver,
            sourceAssetId: input.sourceAssetId ?? "",
            sourceBatchId: input.batchId,
            supabase: input.supabase,
            targetBankId: input.targetBankId ?? null,
          })
        : {
            uploadedCount: 0,
            visualEvidence: {
              attachedAssets: 0,
              blockingMissingRequired: 0,
              decorativeSkipped: 0,
              duplicateProposals: 0,
              invalidProposals: 0,
              invalidProposalReasons: emptyAIPdfVisualProposalRejectionCounts(),
              proposedAssets: 0,
              requiredQuestions: 0,
              reusedAssets: 0,
              validCrops: 0,
            },
            warnings: ["No draft questions were created; skipped crop attachment."],
          };
    },
    stage: "asset_attachment",
  });
  await runAIPdfPostPersistenceStage({
    operation: () => generateAndStorePostPersistenceReviewPlans({ input }),
    stage: "review_plans",
  });
  const currentBeforeFinal = await runAIPdfPostPersistenceStage({
    operation: () => loadCurrentAIPdfSummary(input),
    stage: "summary_preparation",
  });
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
      qualityObservatory: input.qualityObserver?.snapshot(),
      visualEvidence: cropSummary.visualEvidence,
      warnings: uniqueStrings([...extraction.warnings, ...cropSummary.warnings]),
    },
  );

  if (importSummary.createdCount > 0) {
    delete finalAiPdfImport.error;
    delete finalAiPdfImport.phaseFailedAt;
    delete finalAiPdfImport.staleLeaseDetectedAt;
  }

  const finalSummary = compactAIPdfTerminalSummary({
    ...currentBeforeFinal.summary,
    ...importSummary,
    aiPdfImport: finalAiPdfImport,
  });
  await runAIPdfPostPersistenceStage({
    operation: () =>
      finalizeAIPdfImportBatch({
        input,
        status: importSummary.createdCount > 0 ? "imported" : "failed",
        summary: finalSummary,
      }),
    stage: "batch_finalization",
  });

  return finalSummary;
}

export async function processAIPdfImport(input: AIPdfProcessInput) {
  input.qualityObserver ??= createAIPdfQualityObservatory();
  input.providerAttemptLedger ??=
    input.providerResultCheckpoint?.attemptLedger ??
    createAIPdfProviderAttemptLedger();

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
  const runtimeTaxonomy = await loadActiveTags(input.supabase);
  const activeTags = runtimeTaxonomy.activeTags;
  input.qualityObserver?.recordContractEvidence({
    candidateCount: runtimeTaxonomy.candidateSubset.candidates.length,
    candidateSubsetBytes: Buffer.byteLength(
      runtimeTaxonomy.candidateSubset.canonicalJson,
      "utf8",
    ),
    candidateSubsetSha256: runtimeTaxonomy.candidateSubset.sha256,
    fullTaxonomySnapshotBytes: Buffer.byteLength(
      runtimeTaxonomy.snapshot.canonicalJson,
      "utf8",
    ),
    fullTaxonomySnapshotSha256: runtimeTaxonomy.snapshot.sha256,
    parsingContractSha256: runtimeTaxonomy.parsingContractSha256,
    promptContractVersion: AI_PDF_PROMPT_CONTRACT_VERSION,
    repairPolicyVersion: AI_PDF_REPAIR_POLICY_VERSION,
    retrievalAlgorithmVersion: runtimeTaxonomy.candidateSubset.version,
    schemaContractVersion: AI_PDF_SCHEMA_CONTRACT_VERSION,
    subsetToFullCatalogByteRatio:
      runtimeTaxonomy.snapshot.canonicalJson.length > 0
        ? Number((
          Buffer.byteLength(runtimeTaxonomy.candidateSubset.canonicalJson, "utf8") /
          Buffer.byteLength(runtimeTaxonomy.snapshot.canonicalJson, "utf8")
        ).toFixed(6))
        : null,
    taxonomySnapshotSha256: runtimeTaxonomy.snapshot.sha256,
    taxonomySnapshotVersion: runtimeTaxonomy.snapshot.version,
  });
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
      runtimeTaxonomy,
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
        chunk,
        fileName: input.fileName,
        pageMapping: segmentChunk?.pageMapping,
        pageCount,
        runtimeTaxonomy,
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
      const checkpointKey = `chunk:${chunk.chunkIndex}`;
      const checkpointedExtraction = input.providerResultCheckpoint?.extractions[checkpointKey];
      const providerResult = checkpointedExtraction
        ? { value: checkpointedExtraction }
        : {
            value: normalizeAIPdfExtractionResponse(
              await callAIPdfExtractionProvider({
                attemptLedger: input.providerAttemptLedger,
                attemptScope: checkpointKey,
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
                executionObserver: input.providerExecutionObserver,
                inputStrategy: providerInput.strategy,
                pageImageDataUrls: pagesForVision.map((page) => page.dataUrl),
                pdfBase64: (segmentedPdf?.pdfBytes ?? input.pdfBuffer).toString(
                  "base64",
                ),
                pdfBytes: segmentedPdf?.pdfBytes ?? input.pdfBuffer,
                onProviderUsage: input.onProviderUsage,
                onAttemptLedgerCheckpoint: (ledger) =>
                  persistAIPdfProviderAttemptLedger(input, ledger),
                onProviderRetry: (retry) =>
                  updateAIPdfProviderRetryProgress({
                    chunk,
                    input,
                    pageCount,
                    provider: providerSummary,
                    retry,
                    sourceInput: providerInput.strategy,
                  }),
                profile: provider,
                prompt: chunkPrompt.text,
                promptContext: chunkPrompt.context,
                providerRetryMaxAttempts: input.providerRetryMaxAttempts,
                qualityObserver: input.qualityObserver,
                routeCandidateIndex: input.providerRouteCandidateIndex,
              }),
            ),
          };
      const rawExtraction = ensureSinglePageExtractionLineage({
        extraction: providerResult.value,
        suppliedPageCount:
          segmentChunk?.pageMapping.length ?? chunk.pageEnd - chunk.pageStart + 1,
      });
      const extraction = segmentChunk
        ? remapSegmentExtractionPages({
            extraction: rawExtraction,
            pageMapping: segmentChunk.pageMapping,
          })
        : rawExtraction;

      if (!checkpointedExtraction && input.onProviderResultCheckpoint) {
        input.providerResultCheckpoint = appendAIPdfProviderResultCheckpoint({
          checkpoint: input.providerResultCheckpoint,
          extraction,
          key: checkpointKey,
          qualityCheckpoint: input.qualityObserver?.checkpoint(),
        });
        await input.onProviderResultCheckpoint(input.providerResultCheckpoint);
      } else if (checkpointedExtraction) {
        input.qualityObserver?.recordCheckpointReplay();
        if (input.providerAttemptLedger) {
          recordAIPdfCheckpointReplay(input.providerAttemptLedger, checkpointKey);
          await persistAIPdfProviderAttemptLedger(
            input,
            input.providerAttemptLedger,
          );
        }
      }

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
        persistenceLineageKey: input.persistenceLineageKey
          ? `${input.persistenceLineageKey}:chunk:${chunk.chunkIndex}`
          : undefined,
        supabase: input.supabase,
      });
      await input.onCheckpointStage?.("normalized", {
        chunkIndex: chunk.chunkIndex,
        providerResultReused: Boolean(checkpointedExtraction),
        questionCount: extraction.questions.length,
      });
      await updateAIPdfBatchProgressBestEffort(input, {
        detail: `Importing generated questions for ${formatAIPdfChunkPageRange(chunk)}.`,
        pageCount,
        phase: "importing_questions",
        provider: providerSummary,
        sourceInput: providerInput.strategy,
        warnings: uniqueStrings([...allWarnings, ...extraction.warnings]),
      });

      const importSummary = await runAIPdfPostPersistenceStage({
        operation: () => importBatchImportJson({
          allowDraftTags: true,
          batchId: input.batchId,
          deferFinalization: Boolean(input.persistenceFence),
          initialSummaryExtras: {},
          itemIndexOffset: chunk.chunkIndex * 1000,
          jsonText,
          profileId: input.profileId,
          sourceType: "ai_pdf",
          supabase: input.supabase,
          targetBankId: input.targetBankId,
          persistenceFence: input.persistenceFence,
          persistenceLineageKey: input.persistenceLineageKey
            ? `${input.persistenceLineageKey}:chunk:${chunk.chunkIndex}`
            : undefined,
        }),
        stage: "draft_persistence",
      });
      input.qualityObserver?.recordPersistence({
        duplicateCount: aggregate.duplicateCount + importSummary.duplicateCount,
        importableReviewDrafts: aggregate.createdCount + importSummary.createdCount,
        unknownTaxonomyIdCount:
          aggregate.unknownTagCount +
          unknownTaxonomyIdCount({ activeTags, extraction }),
      });
      const cropSummary =
        importSummary.createdCount > 0
          ? await attachCroppedAssets({
              batchId: input.batchId,
              createdQuestions: importSummary.createdQuestions,
              extraction,
              pdfBuffer: input.pdfBuffer,
              profileId: input.profileId,
              qualityObserver: input.qualityObserver,
              renderedPages: renderedPagesCache,
              sourceAssetId: input.sourceAssetId ?? "",
              sourceBatchId: input.batchId,
              supabase: input.supabase,
              targetBankId: input.targetBankId ?? null,
            })
          : {
              uploadedCount: 0,
              visualEvidence: {
                attachedAssets: 0,
                blockingMissingRequired: 0,
                decorativeSkipped: 0,
                duplicateProposals: 0,
                invalidProposals: 0,
                invalidProposalReasons: emptyAIPdfVisualProposalRejectionCounts(),
                proposedAssets: 0,
                requiredQuestions: 0,
                reusedAssets: 0,
                validCrops: 0,
              },
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
      // Draft persistence and later stages are durable-job failures, not
      // provider chunk failures. Preserve their bounded error identity so the
      // worker can retry or stop without issuing another inference request.
      if (isAIPdfPostPersistenceError(error)) throw error;

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

  await runAIPdfPostPersistenceStage({
    operation: () => generateAndStorePostPersistenceReviewPlans({ input }),
    stage: "review_plans",
  });
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
  const finalSummary = compactAIPdfTerminalSummary({
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
      qualityObservatory: input.qualityObserver?.snapshot(),
      visualEvidence: input.qualityObserver?.snapshot().visualEvidence,
      warnings: uniqueStrings(allWarnings),
    }),
  });
  await runAIPdfPostPersistenceStage({
    operation: () =>
      finalizeAIPdfImportBatch({
        input,
        status: finalStatus,
        summary: finalSummary,
      }),
    stage: "batch_finalization",
  });

  await input.onCheckpointStage?.("drafts_persisted", {
    createdDraftCount: aggregate.createdCount,
    persistenceLineageKey: input.persistenceLineageKey ?? null,
  });

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
      qualityObservatory: input.qualityObserver?.snapshot(),
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
  input.qualityObserver ??= createAIPdfQualityObservatory();
  input.providerAttemptLedger ??=
    input.providerResultCheckpoint?.attemptLedger ??
    createAIPdfProviderAttemptLedger();

  const { data: originalBatch, error: originalBatchError } = await input.supabase
    .from("import_batches")
    .select("id, organization_id, status, summary, target_bank_id")
    .eq("id", input.originalBatchId)
    .eq("source_type", "ai_pdf")
    .maybeSingle();
  if (originalBatchError) throw new Error(originalBatchError.message);
  if (!originalBatch || originalBatch.target_bank_id !== input.targetBankId) {
    throw new Error("The original Library-scoped import is no longer available.");
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
  const runtimeTaxonomy = await loadActiveTags(input.supabase);
  const activeTags = runtimeTaxonomy.activeTags;
  input.qualityObserver?.recordContractEvidence({
    candidateCount: runtimeTaxonomy.candidateSubset.candidates.length,
    candidateSubsetBytes: Buffer.byteLength(
      runtimeTaxonomy.candidateSubset.canonicalJson,
      "utf8",
    ),
    candidateSubsetSha256: runtimeTaxonomy.candidateSubset.sha256,
    fullTaxonomySnapshotBytes: Buffer.byteLength(
      runtimeTaxonomy.snapshot.canonicalJson,
      "utf8",
    ),
    fullTaxonomySnapshotSha256: runtimeTaxonomy.snapshot.sha256,
    parsingContractSha256: runtimeTaxonomy.parsingContractSha256,
    promptContractVersion: AI_PDF_PROMPT_CONTRACT_VERSION,
    repairPolicyVersion: AI_PDF_REPAIR_POLICY_VERSION,
    retrievalAlgorithmVersion: runtimeTaxonomy.candidateSubset.version,
    schemaContractVersion: AI_PDF_SCHEMA_CONTRACT_VERSION,
    subsetToFullCatalogByteRatio:
      runtimeTaxonomy.snapshot.canonicalJson.length > 0
        ? Number((
          Buffer.byteLength(runtimeTaxonomy.candidateSubset.canonicalJson, "utf8") /
          Buffer.byteLength(runtimeTaxonomy.snapshot.canonicalJson, "utf8")
        ).toFixed(6))
        : null,
    taxonomySnapshotSha256: runtimeTaxonomy.snapshot.sha256,
    taxonomySnapshotVersion: runtimeTaxonomy.snapshot.version,
  });
  const prompt = buildPrompt({
    chunk: recoveryChunk,
    fileName: input.fileName,
    pageCount,
    pageMapping: subset.pageMapping,
    recoveryOnly: true,
    runtimeTaxonomy,
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

  const providerResult = {
    value: normalizeAIPdfExtractionResponse(
      await callAIPdfExtractionProvider({
        attemptLedger: input.providerAttemptLedger,
        attemptScope: `recovery:${input.recoveryPlanHash}`,
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
        executionObserver: input.providerExecutionObserver,
        inputStrategy: providerInput.strategy,
        pageImageDataUrls: pagesForVision.map((page) => page.dataUrl),
        pdfBase64: subset.pdfBytes.toString("base64"),
        pdfBytes: subset.pdfBytes,
        onProviderUsage: input.onProviderUsage,
        onAttemptLedgerCheckpoint: (ledger) =>
          persistAIPdfProviderAttemptLedger(input, ledger),
        onProviderRetry: (retry) =>
          updateAIPdfProviderRetryProgress({
            input,
            pageCount,
            provider: providerSummary,
            retry,
            sourceInput: providerInput.strategy,
          }),
        profile: provider,
        prompt: prompt.text,
        promptContext: prompt.context,
        providerRetryMaxAttempts: input.providerRetryMaxAttempts,
        qualityObserver: input.qualityObserver,
        routeCandidateIndex: input.providerRouteCandidateIndex,
      }),
    ),
  };
  const extraction = remapSegmentExtractionPages({
    extraction: ensureSinglePageExtractionLineage({
      extraction: providerResult.value,
      suppliedPageCount: subset.pageMapping.length,
    }),
    pageMapping: subset.pageMapping,
  });

  const { data: originalQuestions, error: originalQuestionsError } = await input.supabase
    .from("questions")
    .select(
      "id, question_code, title, content_html, content_source, solution_html, solution_source, options",
    )
    .eq("source", `ai_pdf_import:${input.originalBatchId}`);
  if (originalQuestionsError) throw new Error(originalQuestionsError.message);
  const originalQuestionIds = (originalQuestions ?? []).map(
    (question: Record<string, unknown>) => String(question.id ?? ""),
  );
  const { data: originalItems, error: originalItemsError } = originalQuestionIds.length
    ? await input.supabase
        .from("import_batch_items")
        .select("created_question_id, normalized_question_json")
        .eq("batch_id", input.originalBatchId)
        .in("created_question_id", originalQuestionIds)
    : { data: [], error: null };
  if (originalItemsError) throw new Error(originalItemsError.message);
  const originalMetadataByQuestionId = new Map(
    (originalItems ?? []).map((item: Record<string, unknown>) => [
      String(item.created_question_id ?? ""),
      plainObject(plainObject(item.normalized_question_json).ai_metadata),
    ]),
  );
  const originalCandidates = questionBoundaryCandidatesFromRows({
    assetRefsByQuestionId: new Map(),
    rows: ((originalQuestions ?? []) as Array<Record<string, unknown>>).map(
      (row) => ({
        ...row,
        ai_metadata:
          originalMetadataByQuestionId.get(String(row.id ?? "")) ?? {},
      }),
    ),
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
    input.qualityObserver?.recordPersistence({
      importableReviewDrafts: 0,
      unknownTaxonomyIdCount: unknownTaxonomyIdCount({
        activeTags,
        extraction,
      }),
    });
    await updateCoverageRecoveryExecution({
      input,
      patch: {
        candidateCount: extraction.questions.length,
        detail: "The missing sections were rechecked, but no additional usable drafts were found.",
        reconciliation: counts,
        recoveredDraftCount: 0,
        recheckedSourcePages: sourcePages,
        qualityObservatory: input.qualityObserver?.snapshot(),
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

  const recoveryExtraction = { ...extraction, questions: newQuestions };
  const importJson = await buildImportJson({
    activeTags,
    batchId: childBatchId,
    extraction: recoveryExtraction,
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
  input.qualityObserver?.recordPersistence({
    duplicateCount: imported.duplicateCount,
    importableReviewDrafts: imported.createdCount,
    unknownTaxonomyIdCount: unknownTaxonomyIdCount({
      activeTags,
      extraction: recoveryExtraction,
    }),
  });
  const recoveryRenderedPages = recoveryExtraction.questions.some(
    (question) => question.asset_placeholders.length > 0,
  )
    ? (pagesForVision.length
        ? pagesForVision
        : await renderPdfPages(subset.pdfBytes)
      ).map((page) => ({
        ...page,
        page:
          subset.pageMapping.find((item) => item.chunkPage === page.page)
            ?.sourcePage ?? page.page,
      }))
    : [];
  const cropSummary = imported.createdCount > 0
    ? await attachCroppedAssets({
        batchId: childBatchId,
        createdQuestions: imported.createdQuestions,
        extraction: recoveryExtraction,
        pdfBuffer: subset.pdfBytes,
        profileId: input.profileId,
        qualityObserver: input.qualityObserver,
        renderedPages: recoveryRenderedPages,
        sourceAssetId: input.sourceAssetId ?? "",
        sourceBatchId: input.batchId,
        supabase: input.supabase,
        targetBankId: input.targetBankId ?? null,
      })
    : {
        uploadedCount: 0,
        warnings: [] as string[],
      };
  await updateCoverageRecoveryExecution({
    input,
    patch: {
      candidateCount: extraction.questions.length,
      childImportBatchId: childBatchId,
      detail: "Additional Review Drafts were recovered for teacher review.",
      reconciliation: counts,
      recoveredDraftCount: imported.createdCount,
      recoveredSourcePages: sourcePages,
      qualityObservatory: input.qualityObserver?.snapshot(),
      status: "completed",
      visualWarningCount: cropSummary.warnings.length,
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
