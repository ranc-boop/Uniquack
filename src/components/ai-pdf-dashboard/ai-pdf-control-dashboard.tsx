import Link from "next/link";

import {
  ChunkStatusPanel,
  type LegacyAIPdfChunk,
} from "@/components/ai-pdf-dashboard/chunk-status-panel";
import { CoverageWarningCard } from "@/components/ai-pdf-dashboard/coverage-warning-card";
import { FigureReviewCard } from "@/components/ai-pdf-dashboard/figure-review-card";
import { QuestionBoundaryGuardCard } from "@/components/ai-pdf-dashboard/question-boundary-guard-card";
import { TaxonomyTagSuggestionsCard } from "@/components/ai-pdf-dashboard/taxonomy-tag-suggestions-card";
import { PipelineTimeline } from "@/components/ai-pdf-dashboard/pipeline-timeline";
import { ProviderSummaryCards } from "@/components/ai-pdf-dashboard/provider-summary-cards";
import { WarningSummary } from "@/components/ai-pdf-dashboard/warning-summary";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  deriveAIPdfBatchDisplayState,
  isAIPdfBlueprintObservationCompletePhase,
  type AiProviderMode,
} from "@/lib/ai-pdf-import/display";
import {
  createAIPdfChunkingSummary,
  normalizeAIPdfChunkingSummary,
} from "@/lib/ai-pdf-import/chunking";

type SourceAssetSummary = {
  created_at?: string | null;
  metadata?: unknown;
  original_filename?: string | null;
  size_bytes?: number | string | null;
  status?: string | null;
};

export type AIPdfControlDashboardBatch = {
  createdQuestionCount: number;
  created_at: string;
  id: string;
  sourceAsset?: SourceAssetSummary | null;
  status: string;
  summary: unknown;
};

type PipelineState = "done" | "current" | "pending";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function firstString(
  record: Record<string, unknown>,
  keys: string[],
  fallback = "",
) {
  for (const key of keys) {
    const value = record[key];

    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }

  return fallback;
}

function firstNumber(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];

    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value);

      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return undefined;
}

function stringList(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (typeof item === "string") {
        return item.trim();
      }

      if (item && typeof item === "object") {
        const record = item as Record<string, unknown>;
        const title =
          typeof record.title === "string"
            ? record.title
            : typeof record.label === "string"
              ? record.label
              : typeof record.question === "string"
                ? record.question
                : "";
        const detail =
          typeof record.detail === "string"
            ? record.detail
            : typeof record.description === "string"
              ? record.description
              : "";

        return [title, detail].filter(Boolean).join(": ");
      }

      return "";
    })
    .filter(Boolean);
}

function formatCount(value: number | undefined) {
  return typeof value === "number" ? String(value) : "-";
}

function formatFileSize(bytes: number | string | null | undefined) {
  const numeric = typeof bytes === "string" ? Number(bytes) : bytes;

  if (!numeric || !Number.isFinite(numeric) || numeric <= 0) {
    return "-";
  }

  const units = ["B", "KB", "MB", "GB"];
  let value = numeric;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function phaseRank(phase: string) {
  const ranks: Record<string, number> = {
    upload_reserved: 1,
    source_uploaded: 2,
    queued: 3,
    starting_extraction: 4,
    extracting: 4,
    counting_pages: 5,
    loading_provider: 6,
    loading_tags: 6,
    preparing_pdf_input: 7,
    preparing_native_pdf_input: 7,
    preparing_provider_input: 7,
    rendering_page_images: 7,
    blueprint_observation_calling_provider: 8,
    calling_provider: 8,
    provider_retry_wait: 8,
    question_blueprint_clustering: 8,
    question_blueprint_analyzing: 8,
    question_blueprint_review_planning: 8,
    blueprint_observation_normalized: 9,
    provider_response_validated: 9,
    building_import_json: 10,
    importing_questions: 11,
    cropping_assets: 12,
    completed: 13,
    blueprint_observation_completed: 13,
    question_blueprint_analyzed: 13,
    question_blueprint_review_planned: 13,
  };

  return ranks[phase] ?? 0;
}

function pipelineSteps({
  createdQuestionCount,
  hasProvider,
  hasSource,
  phase,
  status,
}: {
  createdQuestionCount: number;
  hasProvider: boolean;
  hasSource: boolean;
  phase: string;
  status: string;
}) {
  const rank = phaseRank(phase);
  const imported = createdQuestionCount > 0 || status === "imported";
  const complete = (condition: boolean, current: boolean): PipelineState =>
    condition ? "done" : current ? "current" : "pending";

  return [
    {
      label: "Source uploaded",
      state: complete(hasSource || rank >= 2 || imported, phase === "source_uploaded"),
    },
    {
      label: "Provider selected",
      state: complete(hasProvider || rank >= 6 || imported, phase === "loading_provider"),
    },
    {
      label: "AI request sent",
      state: complete(rank >= 8 || imported, phase === "calling_provider"),
    },
    {
      label: "AI response received",
      state: complete(rank >= 9 || imported, phase === "provider_response_validated"),
    },
    {
      label: "JSON repaired / parsed",
      state: complete(rank >= 9 || imported, phase === "provider_response_validated"),
    },
    {
      label: "Questions normalized",
      state: complete(rank >= 10 || imported, phase === "building_import_json"),
    },
    {
      label: "Drafts imported",
      state: complete(imported, phase === "importing_questions"),
    },
    {
      label: "Ready for review",
      state: complete(createdQuestionCount > 0, false),
    },
  ];
}

function getChunks(ai: Record<string, unknown>): LegacyAIPdfChunk[] {
  const chunks = ai.chunks;

  if (Array.isArray(chunks)) {
    return chunks.map((chunk, index) => {
      const record = asRecord(chunk);
      const label =
        firstString(record, ["label", "title", "range"]) || `Chunk ${index + 1}`;
      const status = firstString(record, ["status", "phase"], "planned");
      const pages = firstString(record, ["pages", "pageRange", "page_range"]);

      return { label, pages, status };
    });
  }

  return [];
}

function complexityLabel({
  pageCount,
  sizeBytes,
  strategy,
}: {
  pageCount?: number;
  sizeBytes?: number;
  strategy?: string;
}) {
  if (!pageCount && !sizeBytes) {
    return "Unknown";
  }

  if (
    (pageCount ?? 0) >= 25 ||
    (sizeBytes ?? 0) >= 30 * 1024 * 1024 ||
    (strategy === "page_images" && (pageCount ?? 0) >= 12)
  ) {
    return "High";
  }

  if ((pageCount ?? 0) >= 8 || (sizeBytes ?? 0) >= 10 * 1024 * 1024) {
    return "Medium";
  }

  return "Low";
}

function recommendedModeCopy(strategy: string, mode: AiProviderMode) {
  if (strategy === "gemini_native_pdf") {
    return "Gemini Native full PDF keeps the whole source document available to the model.";
  }

  if (strategy === "page_images") {
    return "Rendered page images are useful for scanned or visual PDFs, but may be heavier for long documents.";
  }

  if (mode === "deepseek_openai") {
    return "DeepSeek text/json is not recommended for PDF/image extraction. Use a page-image or native-PDF capable provider.";
  }

  return "Use a provider mode that matches the PDF extraction strategy before starting large imports.";
}

export function AIPdfControlDashboard({
  batches,
}: {
  batches: AIPdfControlDashboardBatch[];
}) {
  const dashboardItems = batches.map((batch) => ({
    batch,
    display: deriveAIPdfBatchDisplayState({
      createdQuestionCount: batch.createdQuestionCount,
      id: batch.id,
      sourceAsset: batch.sourceAsset,
      status: batch.status,
      summary: batch.summary,
    }),
  }));
  const reviewableItems = dashboardItems.filter(
    ({ display }) => display.canReviewDrafts,
  );
  const totalReviewDrafts = reviewableItems.reduce(
    (total, { display }) => total + display.createdQuestionCount,
    0,
  );
  const totalReviewWarnings = reviewableItems.reduce(
    (total, { display }) => total + display.warnings.visibleWarnings.length,
    0,
  );
  const latestReviewHref = reviewableItems[0]?.display.reviewHref ?? "/admin/review";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">AI Parsing Control Dashboard</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="rounded-md border bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
          AI-generated questions are draft-only and are not visible to students
          until published. Human review is required before publishing.
        </p>
        {reviewableItems.length ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-sky-200 bg-sky-50 p-3 text-sm text-sky-950">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium">Review Draft handoff</p>
                <Badge variant="outline">
                  Imports needing review: {reviewableItems.length}
                </Badge>
              </div>
              <p className="text-xs text-sky-900/80">
                {totalReviewDrafts} draft question
                {totalReviewDrafts === 1 ? "" : "s"} are ready for human
                review. Warnings to check: {totalReviewWarnings}.
              </p>
              <p className="text-xs text-sky-900/80">
                Review warnings, taxonomy, media, and solutions before any
                draft is published.
              </p>
            </div>
            <Button asChild size="sm">
              <Link href={latestReviewHref}>Review generated drafts</Link>
            </Button>
          </div>
        ) : null}
        {batches.length ? (
          <div className="space-y-4">
            {dashboardItems.map(({ batch, display }) => {
              const ai = display.ai;
              const inputStrategy = display.strategy;
              const pageCount = display.pageCount;
              const sizeBytes = display.sizeBytes;
              const createdQuestionCount = display.createdQuestionCount;
              const uploadedCropCount = display.uploadedCropCount;
              const phase = display.phase;
              const displayStatus = display.displayStatus;
              const warnings = display.warnings.debugWarnings;
              const aggregatedWarnings = display.warnings;
              const visibleWarnings = aggregatedWarnings.visibleWarnings.slice(0, 5);
              const hiddenWarningCount = Math.max(
                0,
                aggregatedWarnings.visibleWarnings.length - visibleWarnings.length,
              );
              const executionMode = firstString(ai, ["executionMode"],
                inputStrategy === "page_images"
                  ? "page_image_chunks"
                  : "single_full_pdf",
              );
              const manualSegmentation = asRecord(ai.manualSegmentation);
              const confirmedBoundaryCount = Array.isArray(
                manualSegmentation.boundaries,
              )
                ? manualSegmentation.boundaries.length
                : 0;
              const storedChunking = normalizeAIPdfChunkingSummary(ai.chunking);
              const isUnusedFullPdfFoundation =
                executionMode !== "segmented_full_pdf" &&
                ["gemini_native_pdf", "openai_file"].includes(inputStrategy) &&
                storedChunking?.mode === "foundation";
              const chunking = isUnusedFullPdfFoundation
                ? null
                : storedChunking ??
                  (pageCount && inputStrategy === "page_images"
                    ? createAIPdfChunkingSummary({ pageCount })
                    : null);
              const legacyChunks = getChunks(ai);
              const chunkCount =
                chunking?.totalChunks ??
                (legacyChunks.length ||
                  firstNumber(ai, ["chunkCount", "chunksCount"]));
              const runningChunkCount = chunking
                ? chunking.chunks.filter((chunk) =>
                    ["queued", "running"].includes(chunk.status),
                  ).length
                : 0;
              const detectedFigureCount = firstNumber(ai, [
                "detectedFigureCount",
                "detectedFiguresCount",
                "figureCount",
              ]);
              const missingImageAttachmentCount =
                firstNumber(ai, [
                  "missingImageAttachmentCount",
                  "missingFigureAttachmentCount",
                ]) ?? 0;
              const needsImageReview =
                Boolean(ai.needsImageReview || ai.needs_image_review) ||
                missingImageAttachmentCount > 0;
              const figureDescriptions = [
                ...stringList(ai.figureDescriptions),
                firstString(ai, ["figureDescription"]),
              ].filter(Boolean);
              const sourcePageRefs = stringList(ai.sourcePageRefs);
              const model = display.model;
              const providerName = display.providerName;
              const inputStrategyLabel = display.inputStrategyLabel;
              const timeline = pipelineSteps({
                createdQuestionCount,
                hasProvider: Boolean(providerName && providerName !== "Not selected"),
                hasSource: Boolean(batch.sourceAsset),
                phase,
                status: batch.status,
              });
              const complexity = complexityLabel({
                pageCount,
                sizeBytes,
                strategy: inputStrategy,
              });
              const sourceTitle = display.sourceTitle;
              const sourceFilename =
                batch.sourceAsset?.original_filename ??
                firstString(ai, ["fileName"], "-");
              const blueprintObservationPlan = asRecord(
                ai.blueprintObservationPlan,
              );
              const blueprintObservationStats = asRecord(
                blueprintObservationPlan.stats,
              );
              const hasBlueprintObservationPlan =
                blueprintObservationPlan.version ===
                "blueprint_observation_plan_v1";
              const observationPacketCount =
                firstNumber(blueprintObservationStats, [
                  "observationPacketCount",
                ]) ?? 0;
              const normalizedObservationPacketCount =
                firstNumber(blueprintObservationStats, [
                  "normalizedPacketCount",
                ]) ?? 0;
              const blueprintObservationClusterPlan = asRecord(
                ai.blueprintObservationClusterPlan,
              );
              const blueprintObservationClusterStats = asRecord(
                blueprintObservationClusterPlan.stats,
              );
              const hasBlueprintObservationClusterPlan =
                blueprintObservationClusterPlan.version ===
                "blueprint_observation_cluster_plan_v1";
              const blueprintObservationClusterCount =
                firstNumber(blueprintObservationClusterStats, [
                  "clusterCount",
                ]) ?? 0;
              const blueprintObservationSingleBlockClusterCount =
                firstNumber(blueprintObservationClusterStats, [
                  "singleBlockClusterCount",
                ]) ?? 0;
              const blueprintObservationMixedSourceWarningCount =
                firstNumber(blueprintObservationClusterStats, [
                  "mixedSourceWarningCount",
                ]) ?? 0;
              const questionBlueprintDraftPlan = asRecord(
                ai.questionBlueprintDraftPlan,
              );
              const questionBlueprintDraftStats = asRecord(
                questionBlueprintDraftPlan.stats,
              );
              const hasQuestionBlueprintDraftPlan =
                questionBlueprintDraftPlan.version ===
                "question_blueprint_draft_plan_v1";
              const questionBlueprintDraftCount =
                firstNumber(questionBlueprintDraftStats, [
                  "blueprintDraftCount",
                ]) ?? 0;
              const questionBlueprintWarningCount =
                firstNumber(questionBlueprintDraftStats, ["warningCount"]) ?? 0;
              const questionBlueprintReviewPlan = asRecord(
                ai.questionBlueprintReviewPlan,
              );
              const questionBlueprintReviewStats = asRecord(
                questionBlueprintReviewPlan.stats,
              );
              const hasQuestionBlueprintReviewPlan =
                questionBlueprintReviewPlan.version ===
                "question_blueprint_review_plan_v1";
              const pendingBlueprintReviewCount =
                firstNumber(questionBlueprintReviewStats, [
                  "pendingReviewActionCount",
                ]) ?? 0;
              const approveReadyBlueprintActionCount =
                firstNumber(questionBlueprintReviewStats, [
                  "approveReadyActionCount",
                ]) ?? 0;
              const questionBlueprintLibraryPlan = asRecord(
                ai.questionBlueprintLibraryPersistencePlan,
              );
              const hasQuestionBlueprintLibraryPlan =
                questionBlueprintLibraryPlan.version ===
                "question_blueprint_library_persistence_plan_v1";
              const hasBlueprintLibraryHandoff =
                hasBlueprintObservationPlan &&
                hasQuestionBlueprintDraftPlan &&
                hasQuestionBlueprintReviewPlan &&
                hasQuestionBlueprintLibraryPlan;
              const isBlueprintObservationComplete =
                isAIPdfBlueprintObservationCompletePhase(phase);
              const technicalError = display.warnings.technicalDetail;
              const ctaLabel = display.ctaLabel;

              return (
                <details
                  key={batch.id}
                  className="overflow-hidden rounded-md border bg-background"
                >
                  <summary className="cursor-pointer list-none px-4 py-3 transition hover:bg-muted/30">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge
                            variant={
                              displayStatus === "Failed" ||
                              displayStatus === "Partial"
                                ? "outline"
                                : "secondary"
                            }
                          >
                            {displayStatus}
                          </Badge>
                          <span className="truncate text-sm font-medium">
                            {sourceTitle}
                          </span>
                          <span className="font-mono text-xs text-muted-foreground">
                            {display.shortId}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {providerName} / {model} / {inputStrategyLabel}
                          {" | "}
                          Drafts: {createdQuestionCount}
                          {" | "}
                          Warnings: {warnings.length}
                          {" | "}
                          {new Date(batch.created_at).toLocaleString()}
                        </p>
                      </div>
                      <span className="rounded-md border px-2 py-1 text-xs text-muted-foreground">
                        Expand details
                      </span>
                    </div>
                  </summary>
                  <div className="space-y-4 border-t p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge
                            variant={
                              displayStatus === "Failed" ||
                              displayStatus === "Partial"
                                ? "outline"
                                : "secondary"
                            }
                          >
                            {displayStatus}
                          </Badge>
                          <Badge variant="outline">
                            Phase: {display.phaseLabel}
                          </Badge>
                          <Badge variant="outline">Draft only</Badge>
                        </div>
                        <h3 className="text-base font-semibold">
                          {sourceTitle}
                        </h3>
                        <p className="text-xs text-muted-foreground">
                          Created {new Date(batch.created_at).toLocaleString()}
                        </p>
                      </div>
                      {createdQuestionCount > 0 ? (
                        <div className="flex flex-wrap items-center gap-2">
                          {displayStatus === "Failed" ||
                          displayStatus === "Partial" ? (
                            <Badge variant="outline">Partial success</Badge>
                          ) : null}
                          <Button asChild size="sm" variant="outline">
                            <Link href={`/admin/review?batch=${batch.id}`}>
                              {ctaLabel}
                            </Link>
                          </Button>
                        </div>
                      ) : (
                        <Badge variant="outline">No drafts to review</Badge>
                      )}
                    </div>

                    {display.failedWithoutDrafts ? (
                      <div className="space-y-1 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                        {display.failureMessages.map((message) => (
                          <p key={message}>{message}</p>
                        ))}
                      </div>
                    ) : null}

                    <ProviderSummaryCards
                      chunkCount={chunkCount}
                      createdQuestionCount={createdQuestionCount}
                      inputStrategyLabel={inputStrategyLabel}
                      model={model}
                      pageCountLabel={formatCount(pageCount)}
                      providerModeLabel={display.providerModeLabel}
                      providerName={providerName}
                      sizeLabel={formatFileSize(sizeBytes)}
                      sourceAsset={batch.sourceAsset}
                      sourceFilename={sourceFilename}
                      uploadedCropCount={uploadedCropCount}
                      warningCount={warnings.length}
                    />

                    <QuestionBoundaryGuardCard
                      reviewHref={
                        createdQuestionCount > 0
                          ? `/admin/review?batch=${batch.id}`
                          : null
                      }
                      value={batch.summary}
                    />

                    {hasBlueprintObservationPlan ? (
                      <div
                        className={`rounded-md border p-3 text-sm ${
                          isBlueprintObservationComplete
                            ? "border-emerald-200 bg-emerald-50 text-emerald-950"
                            : "bg-muted/20"
                        }`}
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium">
                            {isBlueprintObservationComplete
                              ? "Blueprint observation completed"
                              : "Blueprint Observation Mode"}
                          </p>
                          <Badge variant="outline">
                            Status:{" "}
                            {firstString(
                              blueprintObservationPlan,
                              ["status"],
                              "unknown",
                            )}
                          </Badge>
                        </div>
                        <div className="mt-2 grid gap-2 text-xs text-muted-foreground md:grid-cols-3">
                          <p>Observation packets: {observationPacketCount}</p>
                          <p>
                            Normalized analyzer packets:{" "}
                            {normalizedObservationPacketCount}
                          </p>
                          <p>No questions were created by design.</p>
                        </div>
                        {isBlueprintObservationComplete ? (
                          <p className="mt-2 text-xs text-emerald-900/80">
                            Next step: Open Blueprint Library to review
                            extracted question blueprints.
                          </p>
                        ) : null}
                      </div>
                    ) : null}

                    {hasBlueprintObservationClusterPlan ? (
                      <div className="rounded-md border bg-muted/20 p-3 text-sm">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium">
                            Blueprint Observation Clusters
                          </p>
                          <Badge variant="outline">
                            Status:{" "}
                            {firstString(
                              blueprintObservationClusterPlan,
                              ["status"],
                              "unknown",
                            )}
                          </Badge>
                        </div>
                        <div className="mt-2 grid gap-2 text-xs text-muted-foreground md:grid-cols-4">
                          <p>Clusters: {blueprintObservationClusterCount}</p>
                          <p>
                            Single-block clusters:{" "}
                            {blueprintObservationSingleBlockClusterCount}
                          </p>
                          <p>
                            Mixed-source warnings:{" "}
                            {blueprintObservationMixedSourceWarningCount}
                          </p>
                          <p>
                            Source questions were split into separate blueprint
                            candidates before DeepSeek analysis.
                          </p>
                        </div>
                      </div>
                    ) : null}

                    {hasQuestionBlueprintDraftPlan ? (
                      <div className="rounded-md border bg-muted/20 p-3 text-sm">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium">Question Blueprint Drafts</p>
                          <Badge variant="outline">
                            Status:{" "}
                            {firstString(
                              questionBlueprintDraftPlan,
                              ["status"],
                              "unknown",
                            )}
                          </Badge>
                        </div>
                        <div className="mt-2 grid gap-2 text-xs text-muted-foreground md:grid-cols-4">
                          <p>Draft count: {questionBlueprintDraftCount}</p>
                          <p>Review required: yes</p>
                          <p>No questions generated yet.</p>
                          <p>Warnings: {questionBlueprintWarningCount}</p>
                        </div>
                      </div>
                    ) : null}

                    {hasQuestionBlueprintReviewPlan ? (
                      <div className="rounded-md border bg-muted/20 p-3 text-sm">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium">Question Blueprint Review</p>
                          <Badge variant="outline">
                            Status:{" "}
                            {firstString(
                              questionBlueprintReviewPlan,
                              ["status"],
                              "unknown",
                            )}
                          </Badge>
                        </div>
                        <div className="mt-2 grid gap-2 text-xs text-muted-foreground md:grid-cols-4">
                          <p>
                            Drafts pending review: {pendingBlueprintReviewCount}
                          </p>
                          <p>
                            Approved-ready actions:{" "}
                            {approveReadyBlueprintActionCount}
                          </p>
                          <p>
                            Library persistence:{" "}
                            {hasQuestionBlueprintLibraryPlan
                              ? "planned only"
                              : "not planned"}
                          </p>
                          <p>No questions generated yet.</p>
                        </div>
                      </div>
                    ) : null}

                    {hasBlueprintLibraryHandoff ? (
                      <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-950">
                        <div className="space-y-1">
                          <p className="font-medium">Open Blueprint Library</p>
                          <p className="text-xs text-emerald-900/80">
                            Review and approve extracted question blueprints
                            before using them to generate original questions.
                          </p>
                          <p className="text-xs text-emerald-900/80">
                            Safety notes: no generated questions, Review Draft
                            writes, or official taxonomy writes happened during
                            observation.
                          </p>
                        </div>
                        <Button asChild size="sm" variant="outline">
                          <Link href="/admin/blueprints">
                            Open Blueprint Library
                          </Link>
                        </Button>
                      </div>
                    ) : null}

                    <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
                      <div className="space-y-3">
                        <PipelineTimeline timeline={timeline} />

                        <div className="rounded-md border bg-muted/20 p-3">
                          <p className="text-sm font-medium">
                            Preflight and cost awareness
                          </p>
                          <div className="mt-2 grid gap-2 text-xs text-muted-foreground md:grid-cols-2">
                            <p>Page count: {formatCount(pageCount)}</p>
                            <p>File size: {formatFileSize(sizeBytes)}</p>
                            <p>Input strategy: {inputStrategyLabel}</p>
                            <p>
                              Execution: {executionMode.replaceAll("_", " ")}
                            </p>
                            {executionMode === "segmented_full_pdf" ? (
                              <p>
                                Confirmed masked boundaries: {confirmedBoundaryCount}
                              </p>
                            ) : null}
                            <p>Estimated complexity: {complexity}</p>
                            <p className="md:col-span-2">
                              Recommended mode:{" "}
                              {executionMode === "segmented_full_pdf"
                                ? "Confirmed boundary pages are shared with complementary white masks, then each chunk is sent as a native/full PDF."
                                : recommendedModeCopy(
                                    inputStrategy,
                                    display.providerMode,
                                  )}
                            </p>
                          </div>
                        </div>

                        <FigureReviewCard
                          detectedFigureCountLabel={formatCount(
                            detectedFigureCount,
                          )}
                          figureDescriptions={figureDescriptions}
                          missingImageAttachmentCount={
                            missingImageAttachmentCount
                          }
                          needsImageReview={needsImageReview}
                          sourcePageRefs={sourcePageRefs}
                          uploadedCropCount={uploadedCropCount}
                        />
                      </div>

                      <div className="space-y-3">
                        <ChunkStatusPanel
                          chunking={chunking}
                          executionMode={executionMode}
                          legacyChunks={legacyChunks}
                          runningChunkCount={runningChunkCount}
                        />
                      </div>
                    </div>

                    <CoverageWarningCard ai={ai} />

                    <TaxonomyTagSuggestionsCard ai={ai} />

                    <WarningSummary
                      aggregatedWarnings={aggregatedWarnings}
                      hiddenWarningCount={hiddenWarningCount}
                      technicalError={technicalError}
                      visibleWarnings={visibleWarnings}
                    />
                  </div>
                </details>
              );
            })}
          </div>
        ) : (
          <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
            No AI PDF imports yet. Upload a private source PDF to start the
            control dashboard.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
