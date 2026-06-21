import { callAIPdfExtractionProvider } from "@/lib/ai-providers/chat";
import {
  AI_PDF_UNSUPPORTED_PROVIDER_MESSAGE,
  describeAiPdfProviderInput,
  supportsAIPdfSequentialChunkExtraction,
  type AiPdfInputStrategy,
} from "@/lib/ai-providers/adapters";
import {
  loadAIProviderProfileForUse,
  loadSafeAIProviderProfileForUse,
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
  type AIPdfSegmentChunk,
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
  name: string;
  slug: string;
  status: string;
  facet_key: string | null;
};

type ProcessInput = {
  batchId: string;
  chunkIndex?: number;
  fileName: string;
  jobId?: string;
  pdfBuffer: Buffer;
  profileId: string;
  providerProfileId: string;
  sourceAssetId?: string;
  sourceObjectPath: string;
  supabase: SupabaseLike;
};

type AIPdfProgress = {
  detail?: string;
  error?: string;
  pageCount?: number;
  phase: string;
  provider?: { id: string; model: string; name: string; provider: string };
  questionCount?: number;
  sourceInput?: AiPdfInputStrategy;
  warnings?: string[];
};

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
    const taggingV2Plan = buildAITaggingV2PlanFromSummary(current.aiPdfImport);
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
    await generateAndStoreExtractionBatchPlan({ input, packetPlan });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "AI packet plan failed.";
    const packetPlan = failedPacketPlan({
      sourceHash: preanalysis.sourceHash,
      sourceKind: preanalysis.sourceKind,
      warnings: [`packet plan failed: ${message}`],
    });
    await updateAIPdfPacketPlan({ input, packetPlan });
    await generateAndStoreExtractionBatchPlan({ input, packetPlan });
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
    await generateAndStorePacketPlan({ input, preanalysis });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "PDF preanalysis failed.";
    const preanalysis = failedPdfPreanalysis({
      error: message,
      pageCount,
    });
    await updateAIPdfPreanalysis({ input, preanalysis });
    await generateAndStorePacketPlan({ input, preanalysis });
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

function slugify(value: string) {
  const slug = value
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

  return slug || `ai-tag-${crypto.randomUUID().slice(0, 8)}`;
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
}: {
  activeTags: ActiveTag[];
  chunk?: Pick<AIPdfImportChunkSummary, "pageEnd" | "pageStart">;
  fileName: string;
  pageMapping?: { chunkPage: number; sourcePage: number }[];
  pageCount: number;
}) {
  const tags = activeTags
    .map(
      (tag) =>
        `- ${tag.name} | tag_id=${tag.slug} | facet=${tag.facet_key ?? "none"} | status=${tag.status}`,
    )
    .join("\n");

  return [
    "You are importing a PDF question set into a question bank.",
    "Read the entire document context in order. Questions, solutions, and figures may continue across page boundaries; do not split one question only because it crosses pages.",
    "Return ONLY valid JSON. Do not wrap it in markdown.",
    "",
    `File: ${fileName}`,
    `Original source page count: ${pageCount}`,
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
          "This is a non-overlapping full-PDF segment. White regions on the first or last page intentionally hide content assigned to an adjacent segment.",
          "Extract only visible content. Never infer or reconstruct content hidden by white regions.",
          `Chunk-page to original-source-page mapping: ${pageMapping
            .map((item) => `${item.chunkPage}->${item.sourcePage}`)
            .join(", ")}.`,
          "Return page_refs and asset placeholder page values using CHUNK page numbers; the server maps them back to original source pages.",
        ].join("\n")
      : "",
    "",
    "Existing active tags. Reuse these by tag_slugs or tag_names when they are semantically appropriate. Create new tags only when none fit:",
    tags || "(none)",
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
          content_html: "<p>Question stem with {{asset:figure_1}} where the image belongs.</p>",
          content_source: "Editable Markdown + LaTeX source, same meaning as content_html. Use $...$ for inline math.",
          difficulty_rating: 500,
          new_tag_names: ["Only if no existing tag fits"],
          page_refs: [1, 2],
          question_number: "Visible source number such as 3, 3.1, 3(a), or FRQ 2. Omit if missing.",
          question_type: "frq",
          solution_html: "<p>Solution or explanation.</p>",
          solution_source: "Editable solution source.",
          tag_names: ["Existing tag name"],
          tag_slugs: ["existing-tag-slug"],
          title: "Short question title",
        },
      ],
      warnings: ["Any uncertainty about extraction."],
    }),
    "",
    "Rules:",
    "- content_html is required and must be sanitized-friendly HTML.",
    "- Prefer writing content_source and solution_source as clean Markdown + LaTeX. Use $...$ for inline math and $$ blocks for display math.",
    "- Do not put raw dollar-delimited math directly in content_html. If content_html contains math, use <span data-type=\"inline-math\" data-latex=\"x^2\">x^2</span> or <div data-type=\"block-math\" data-latex=\"x^2\">x^2</div>.",
    "- Never leave unmatched dollar signs. For blanks such as x =, write $x =$ with a closing dollar.",
    "- Convert common math text to LaTeX in source fields: sqrt(x) -> \\sqrt{x}, pi -> \\pi when mathematical, fractions -> \\frac{...}{...}.",
    "- If a figure, chart, graph, table image, or diagram is important to the question, create one asset_placeholders entry so the system can crop it and display it in the question image gallery.",
    "- If the image must appear at an exact inline position, also put the exact placeholder string inside content_html or solution_html at that location.",
    "- Inline placeholders are optional because cropped images are also attached as question_assets and shown below the question detail.",
    "- Use placeholder strings exactly like {{asset:figure_1}}. Do not alter braces, spacing, or capitalization.",
    "- Bboxes are normalized page coordinates from top-left, all values 0..1.",
    "- Use question_number only for the visible number from the PDF. Do not invent database question_code values; the server always generates those.",
    "- Do not normalize visible numbers aggressively: 3, 3.1, 3(a), and FRQ 2 are different display values.",
    "- Keep questions as draft-quality records for human review; do not invent answers when unsure.",
  ].join("\n");
}

function remapSegmentExtractionPages({
  chunk,
  extraction,
}: {
  chunk: AIPdfSegmentChunk;
  extraction: AIPdfExtraction;
}) {
  const sourcePageByChunkPage = new Map(
    chunk.pageMapping.map((item) => [item.chunkPage, item.sourcePage]),
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
    .select("tag_id, label, status, facet_key")
    .eq("is_assignable", true)
    .eq("status", "active")
    .order("sort_order", { ascending: true })
    .order("label", { ascending: true })
    .limit(1000);

  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as {
    facet_key: string | null;
    label: string;
    status: string;
    tag_id: string;
  }[]).map((tag) => ({
    facet_key: tag.facet_key,
    id: tag.tag_id,
    name: tag.label,
    slug: tag.tag_id,
    status: tag.status,
  }));
}

async function buildImportJson({
  activeTags,
  batchId,
  chunk,
  extraction,
  profileId,
  provider,
  questionIndexOffset = 0,
  supabase,
}: {
  activeTags: ActiveTag[];
  batchId: string;
  chunk?: Pick<AIPdfImportChunkSummary, "chunkIndex" | "pageEnd" | "pageStart">;
  extraction: AIPdfExtraction;
  profileId: string;
  provider: { id: string; model: string; name: string; provider: string };
  questionIndexOffset?: number;
  supabase: SupabaseLike;
}) {
  const bySlug = new Map(
    activeTags.map((tag) => [tag.slug.trim().toLowerCase(), tag]),
  );
  const byName = new Map(
    activeTags.map((tag) => [tag.name.trim().toLowerCase(), tag]),
  );
  const existingQuestionCodes = await loadExistingQuestionCodeKeys(supabase);
  const usedQuestionCodes = new Set<string>();
  const usedVisibleQuestionNumbers = new Set<string>();

  const questions = [];

  for (const [index, question] of extraction.questions.entries()) {
    const globalQuestionIndex = questionIndexOffset + index;
    const tagSlugs = new Set<string>();

    for (const slug of question.tag_slugs) {
      const tag = bySlug.get(slug.trim().toLowerCase());

      if (tag) {
        tagSlugs.add(tag.slug);
      }
    }

    for (const name of question.tag_names) {
      const tag = byName.get(name.trim().toLowerCase());

      if (tag) {
        tagSlugs.add(tag.slug);
      }
    }

    if (question.new_tag_names.length) {
      extraction.warnings.push(
        `Question ${globalQuestionIndex + 1}: AI suggested new taxonomy tags (${question.new_tag_names.join(", ")}); suggestions were preserved in metadata and not written to the official taxonomy.`,
      );
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
        source: "ai_pdf_import",
        tag_decisions: {
          new_tag_names: question.new_tag_names,
          tag_names: question.tag_names,
          tag_slugs: question.tag_slugs,
        },
        visible_question_number: visibleQuestionNumber || null,
      },
      content_html: contentHtml,
      content_source: contentSource,
      content_source_format: contentFields.sourceFormat,
      difficulty_rating: question.difficulty_rating,
      question_code: questionCode,
      question_type: question.question_type,
      solution_source_format: solutionFields.sourceFormat,
      tag_slugs: Array.from(tagSlugs),
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
  const { error: insertError } = await supabase.from("question_assets").insert({
    created_by: profileId,
    display_on_detail: true,
    id: assetId,
    mime_type: "image/png",
    object_path: objectPath,
    original_filename: `${placeholder.replace(/[{}:]/g, "")}.png`,
    question_id: questionId,
    size_bytes: image.length,
    status: "pending",
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

  const { error: updateError } = await supabase
    .from("question_assets")
    .update({ status: "ready" })
    .eq("id", assetId);

  if (updateError) {
    throw new Error(updateError.message);
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
          content_source: nextContentSource,
          solution_html: nextSolutionHtml
            ? sanitizeContentHtml(nextSolutionHtml)
            : null,
          solution_source: nextSolutionSource,
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

async function processAIPdfSinglePass({
  activeTags,
  input,
  pageCount,
  provider,
  providerInput,
  providerSummary,
}: {
  activeTags: ActiveTag[];
  input: ProcessInput;
  pageCount: number;
  provider: Awaited<ReturnType<typeof loadAIProviderProfileForUse>>;
  providerInput: ReturnType<typeof describeAiPdfProviderInput>;
  providerSummary: { id: string; model: string; name: string; provider: string };
}) {
  if (input.chunkIndex !== undefined) {
    throw new Error(
      "This provider uses full-PDF input and does not support single-chunk retry. Retry the full import after resetting generated drafts.",
    );
  }

  const prompt = buildPrompt({
    activeTags,
    fileName: input.fileName,
    pageCount,
  });

  await updateAIPdfBatchProgress(input, {
    detail:
      "Calling AI provider once with the full PDF. If the first JSON is invalid, the system will ask the model once more with the validation error to repair it.",
    pageCount,
    phase: "calling_provider",
    provider: providerSummary,
    sourceInput: providerInput.strategy,
  });
  const extraction = normalizeAIPdfExtractionResponse(
    await callAIPdfExtractionProvider({
      fileName: input.fileName,
      inputStrategy: providerInput.strategy,
      pageImageDataUrls: [],
      pdfBase64: input.pdfBuffer.toString("base64"),
      pdfBytes: input.pdfBuffer,
      profile: provider,
      prompt,
    }),
  );

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

  return finalSummary;
}

export async function processAIPdfImport(input: ProcessInput) {
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

  await generateAndStorePdfPreanalysis({ input, pageCount });

  await updateAIPdfBatchProgress(input, {
    detail: "Loading AI provider profile.",
    pageCount,
    phase: "loading_provider",
  });
  const safeProvider = await loadSafeAIProviderProfileForUse({
    profileId: input.providerProfileId,
    supabase: input.supabase,
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
  const provider = await loadAIProviderProfileForUse({
    profileId: input.providerProfileId,
    supabase: input.supabase,
  });

  if (!providerInput.supported) {
    throw new Error(AI_PDF_UNSUPPORTED_PROVIDER_MESSAGE);
  }

  if (!providerInput.implemented) {
    throw new Error(providerInput.reason ?? AI_PDF_UNSUPPORTED_PROVIDER_MESSAGE);
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
    return processAIPdfSinglePass({
      activeTags,
      input,
      pageCount,
      provider,
      providerInput,
      providerSummary,
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
      const rawExtraction = normalizeAIPdfExtractionResponse(
        await callAIPdfExtractionProvider({
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
          profile: provider,
          prompt: chunkPrompt,
        }),
      );
      const extraction = segmentChunk
        ? remapSegmentExtractionPages({
            chunk: segmentChunk,
            extraction: rawExtraction,
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
      const message =
        error instanceof Error ? error.message : "AI PDF chunk extraction failed.";

      allWarnings.push(
        `${formatAIPdfChunkPageRange(chunk)} failed: ${message}`,
      );
      await updateAIPdfChunkProgress({
        chunk,
        input,
        pageCount,
        patch: {
          completedAt: new Date().toISOString(),
          errorMessage: message,
          inputStrategy: providerInput.strategy,
          model: provider.model,
          provider: provider.provider,
          retryCount,
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

  return finalSummary;
}
