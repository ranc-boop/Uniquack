import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  deriveAIPdfBatchDisplayState,
  type AiProviderMode,
} from "@/lib/ai-pdf-import/display";

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
const TECHNICAL_DETAIL_LIMIT = 1200;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function aiSummary(summary: unknown) {
  return asRecord(asRecord(summary).aiPdfImport);
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

function shortId(value: string) {
  return value.slice(0, 8);
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

function friendlyPhaseLabel(phase: string) {
  const labels: Record<string, string> = {
    building_import_json: "Normalizing questions",
    calling_provider: "AI request sent",
    completed: "Completed",
    counting_pages: "Counting pages",
    cropping_assets: "Attaching image crops",
    extracting: "Extracting",
    failed: "Failed",
    importing_questions: "Importing draft questions",
    loading_provider: "Provider selected",
    loading_tags: "Loading tag context",
    preparing_native_pdf_input: "Preparing Gemini Native full PDF",
    preparing_pdf_input: "Preparing full PDF input",
    preparing_provider_input: "Preparing provider input",
    provider_response_validated: "AI response received",
    queued: "Queued",
    rendering_page_images: "Rendering page images",
    resetting_generated_drafts: "Resetting generated drafts",
    source_deleted: "Source deleted",
    source_missing: "Source missing",
    source_upload_cancelled: "Source upload cancelled",
    source_upload_failed: "Source upload failed",
    source_uploaded: "Source uploaded",
    starting_extraction: "Starting extraction",
    upload_reserved: "Upload reserved",
  };

  return labels[phase] ?? phase.replaceAll("_", " ");
}

function isFailedStatus(status: string) {
  const normalized = status.trim().toLowerCase();

  return (
    normalized === "failed" ||
    normalized === "error" ||
    normalized.endsWith("_failed") ||
    normalized.includes("failed")
  );
}

function effectivePhase(status: string, phase: string) {
  if (isFailedStatus(status)) {
    return "failed";
  }

  return phase === "completed" && status !== "imported" ? "failed" : phase;
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
    calling_provider: 8,
    provider_response_validated: 9,
    building_import_json: 10,
    importing_questions: 11,
    cropping_assets: 12,
    completed: 13,
  };

  return ranks[phase] ?? 0;
}

function statusLabel({
  createdQuestionCount,
  phase,
  status,
}: {
  createdQuestionCount: number;
  phase: string;
  status: string;
}) {
  if (isFailedStatus(status) && createdQuestionCount > 0) {
    return "Partial";
  }

  if (isFailedStatus(status) || phase === "failed") {
    return "Failed";
  }

  if (status === "imported" || phase === "completed") {
    return "Imported to Review Drafts";
  }

  if (phase === "queued") {
    return "Queued";
  }

  if (
    status === "validating" ||
    [
      "starting_extraction",
      "extracting",
      "counting_pages",
      "loading_provider",
      "loading_tags",
      "preparing_pdf_input",
      "preparing_native_pdf_input",
      "preparing_provider_input",
      "rendering_page_images",
      "calling_provider",
      "provider_response_validated",
      "building_import_json",
      "importing_questions",
      "cropping_assets",
    ].includes(phase)
  ) {
    return "Running";
  }

  return "Uploaded";
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

function getWarnings(ai: Record<string, unknown>, batchStatus: string) {
  const warnings = [
    ...stringList(ai.warnings),
    ...stringList(ai.parserWarnings),
    ...stringList(ai.missingQuestionNumbers).map(
      (value) => `Missing question number: ${value}`,
    ),
    ...stringList(ai.duplicateQuestionNumbers).map(
      (value) => `Duplicate question number: ${value}`,
    ),
    ...stringList(ai.crossPageContinuations).map(
      (value) => `Cross-page continuation: ${value}`,
    ),
  ];
  const error = firstString(ai, ["error"]);
  const unsupported = firstString(ai, [
    "unsupportedProviderCapability",
    "unsupportedProviderReason",
  ]);

  if (error) {
    warnings.push(...summarizeAIPdfError(error));
  }

  if (unsupported) {
    warnings.push(`Unsupported provider capability: ${unsupported}`);
  }

  if (batchStatus === "failed" && !warnings.length) {
    warnings.push("Provider or parser failure. Check the latest extraction error.");
  }

  return warnings;
}

function summarizeAIPdfError(value: unknown) {
  const raw = typeof value === "string" ? value : "";

  if (!raw.trim()) {
    return [];
  }

  const normalized = raw.toLowerCase();
  const summaries = new Set<string>();

  if (
    normalized.includes("asset_placeholders") ||
    normalized.includes("placeholder: invalid input")
  ) {
    summaries.add(
      "The AI returned invalid image placeholder metadata. This should be treated as a warning instead of blocking all questions.",
    );
    summaries.add("Some image placeholders were invalid and could not be attached.");
  }

  if (
    normalized.includes("expected import schema") ||
    normalized.includes("json did not match") ||
    normalized.includes("invalid input") ||
    normalized.includes("zod")
  ) {
    summaries.add(
      "No draft questions were created because the AI response did not match the expected question schema.",
    );
  }

  if (!summaries.size) {
    summaries.add("AI extraction failed before draft questions could be imported.");
  }

  summaries.add("Please retry with a smaller PDF or a different extraction mode.");

  return Array.from(summaries);
}

function safeTechnicalDetail(value: unknown) {
  const raw =
    typeof value === "string"
      ? value
      : value === undefined || value === null
        ? ""
        : JSON.stringify(value, null, 2);

  if (!raw.trim()) {
    return "";
  }

  return raw
    .replace(/https?:\/\/\S*(?:ai-import-sources|X-Amz-Signature|token=)\S*/gi, "[private source URL redacted]")
    .replace(/\bsk-[A-Za-z0-9_-]+/g, "[api key redacted]")
    .replace(/\bAIza[A-Za-z0-9_-]+/g, "[api key redacted]")
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[jwt redacted]")
    .slice(0, TECHNICAL_DETAIL_LIMIT);
}

function aggregateWarnings(warnings: string[]) {
  const figurePlaceholderPattern =
    /^Could not find created question for \{\{asset:figure_(\d+)\}\}\.?$/;
  const figurePlaceholderWarnings = warnings.filter((warning) =>
    figurePlaceholderPattern.test(warning),
  );
  const otherWarnings = warnings.filter(
    (warning) => !figurePlaceholderPattern.test(warning),
  );

  if (figurePlaceholderWarnings.length <= 1) {
    return {
      debugWarnings: warnings,
      visibleWarnings: warnings,
    };
  }

  return {
    debugWarnings: warnings,
    visibleWarnings: [
      ...otherWarnings,
      `${figurePlaceholderWarnings.length} figure placeholders could not be attached because no matching draft questions were created.`,
    ],
  };
}

function getChunks(ai: Record<string, unknown>) {
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

function stateClass(state: PipelineState) {
  if (state === "done") {
    return "border-emerald-200 bg-emerald-50 text-emerald-900";
  }

  if (state === "current") {
    return "border-amber-200 bg-amber-50 text-amber-900";
  }

  return "border-muted bg-muted/30 text-muted-foreground";
}

export function AIPdfControlDashboard({
  batches,
}: {
  batches: AIPdfControlDashboardBatch[];
}) {
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
        {batches.length ? (
          <div className="space-y-4">
            {batches.map((batch) => {
              const display = deriveAIPdfBatchDisplayState({
                createdQuestionCount: batch.createdQuestionCount,
                id: batch.id,
                sourceAsset: batch.sourceAsset,
                status: batch.status,
                summary: batch.summary,
              });
              const ai = display.ai;
              const strategy = display.strategy;
              const pageCount = display.pageCount;
              const sizeBytes = display.sizeBytes;
              const createdQuestionCount = display.createdQuestionCount;
              const uploadedCropCount = display.uploadedCropCount;
              const phase = display.phase;
              const displayStatus = display.displayStatus;
              const warnings = display.warnings.debugWarnings;
              const aggregatedWarnings = display.warnings;
              const chunks = getChunks(ai);
              const chunkCount =
                chunks.length || firstNumber(ai, ["chunkCount", "chunksCount"]);
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
                strategy,
              });
              const sourceTitle = display.sourceTitle;
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
                            displayStatus === "Failed" || displayStatus === "Partial"
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

                  <div className="grid gap-3 text-sm md:grid-cols-2 xl:grid-cols-4">
                    <div className="rounded-md border bg-muted/20 p-3">
                      <p className="text-xs text-muted-foreground">Provider</p>
                      <p className="font-medium">{providerName}</p>
                      <p className="text-xs text-muted-foreground">
                        {display.providerModeLabel}
                      </p>
                    </div>
                    <div className="rounded-md border bg-muted/20 p-3">
                      <p className="text-xs text-muted-foreground">Model</p>
                      <p className="font-medium">{model}</p>
                      <p className="text-xs text-muted-foreground">
                        Input: {inputStrategyLabel}
                      </p>
                    </div>
                    <div className="rounded-md border bg-muted/20 p-3">
                      <p className="text-xs text-muted-foreground">
                        Source / pages
                      </p>
                      <p className="font-medium">
                        {batch.sourceAsset?.original_filename ??
                          firstString(ai, ["fileName"], "-")}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Pages processed: {formatCount(pageCount)} /{" "}
                        {formatFileSize(sizeBytes)}
                      </p>
                    </div>
                    <div className="rounded-md border bg-muted/20 p-3">
                      <p className="text-xs text-muted-foreground">Outputs</p>
                      <p className="font-medium">
                        Drafts: {createdQuestionCount}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Source assets: {batch.sourceAsset ? 1 : 0} / Question
                        assets: {uploadedCropCount}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Uploaded crops: {uploadedCropCount} / Warnings:{" "}
                        {warnings.length} / Chunks:{" "}
                        {chunkCount !== undefined ? chunkCount : "-"}
                      </p>
                    </div>
                  </div>

                  <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
                    <div className="space-y-3">
                      <div>
                        <p className="mb-2 text-sm font-medium">
                          Pipeline timeline
                        </p>
                        <div className="grid gap-2 md:grid-cols-2">
                          {timeline.map((step) => (
                            <div
                              key={step.label}
                              className={`rounded-md border px-3 py-2 text-xs ${stateClass(
                                step.state,
                              )}`}
                            >
                              <span className="font-medium">{step.label}</span>
                              <span className="ml-2 uppercase">
                                {step.state}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="rounded-md border bg-muted/20 p-3">
                        <p className="text-sm font-medium">
                          Preflight and cost awareness
                        </p>
                        <div className="mt-2 grid gap-2 text-xs text-muted-foreground md:grid-cols-2">
                          <p>Page count: {formatCount(pageCount)}</p>
                          <p>File size: {formatFileSize(sizeBytes)}</p>
                          <p>Input strategy: {inputStrategyLabel}</p>
                          <p>Estimated complexity: {complexity}</p>
                          <p className="md:col-span-2">
                            Recommended mode:{" "}
                            {recommendedModeCopy(strategy, display.providerMode)}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="rounded-md border bg-muted/20 p-3">
                        <p className="text-sm font-medium">
                          Long PDF / chunks
                        </p>
                        {chunks.length ? (
                          <div className="mt-2 space-y-2 text-xs">
                            {chunks.slice(0, 5).map((chunk) => (
                              <div
                                key={`${chunk.label}-${chunk.pages}-${chunk.status}`}
                                className="rounded border bg-background p-2"
                              >
                                <p className="font-medium">{chunk.label}</p>
                                <p className="text-muted-foreground">
                                  {chunk.pages ? `${chunk.pages} / ` : ""}
                                  {chunk.status}
                                </p>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="mt-2 text-xs text-muted-foreground">
                            Chunk details are not available for this import yet.
                          </p>
                        )}
                      </div>

                      <div className="rounded-md border bg-muted/20 p-3">
                        <p className="text-sm font-medium">
                          Figure and image review
                        </p>
                        <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                          <p>
                            Questions may need diagrams/images before publishing.
                          </p>
                          <p>
                            Detected figures: {formatCount(detectedFigureCount)}
                          </p>
                          <p>Uploaded crops: {uploadedCropCount}</p>
                          <p>
                            Missing figure attachments:{" "}
                            {missingImageAttachmentCount}
                          </p>
                          {needsImageReview ? (
                            <Badge variant="outline">Needs media review</Badge>
                          ) : null}
                          {sourcePageRefs.length ? (
                            <p>Source page refs: {sourcePageRefs.join(", ")}</p>
                          ) : null}
                          {figureDescriptions.length ? (
                            <ul className="list-disc space-y-1 pl-4">
                              {figureDescriptions.slice(0, 3).map((description) => (
                                <li key={description}>{description}</li>
                              ))}
                            </ul>
                          ) : null}
                        </div>
                      </div>

                      <div className="rounded-md border bg-muted/20 p-3">
                        <p className="text-sm font-medium">Warnings</p>
                        {aggregatedWarnings.visibleWarnings.length ? (
                          <>
                            <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-muted-foreground">
                              {aggregatedWarnings.visibleWarnings
                                .slice(0, 8)
                                .map((warning) => (
                                  <li key={warning}>{warning}</li>
                                ))}
                            </ul>
                            {aggregatedWarnings.debugWarnings.length !==
                            aggregatedWarnings.visibleWarnings.length ? (
                              <details className="mt-3 rounded-md border bg-background p-2 text-xs text-muted-foreground">
                                <summary className="cursor-pointer font-medium text-foreground">
                                  Debug details (
                                  {aggregatedWarnings.debugWarnings.length} raw
                                  warnings)
                                </summary>
                                <ul className="mt-2 list-disc space-y-1 pl-4">
                                  {aggregatedWarnings.debugWarnings.map(
                                    (warning, index) => (
                                      <li key={`${warning}-${index}`}>
                                        {warning}
                                      </li>
                                    ),
                                  )}
                                </ul>
                              </details>
                            ) : null}
                            {technicalError ? (
                              <details className="mt-3 rounded-md border bg-background p-2 text-xs text-muted-foreground">
                                <summary className="cursor-pointer font-medium text-foreground">
                                  Technical details
                                </summary>
                                <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap">
                                  {technicalError}
                                </pre>
                              </details>
                            ) : null}
                          </>
                        ) : (
                          <>
                            <p className="mt-2 text-xs text-muted-foreground">
                              No warnings reported for this import.
                            </p>
                            {technicalError ? (
                              <details className="mt-3 rounded-md border bg-background p-2 text-xs text-muted-foreground">
                                <summary className="cursor-pointer font-medium text-foreground">
                                  Technical details
                                </summary>
                                <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap">
                                  {technicalError}
                                </pre>
                              </details>
                            ) : null}
                          </>
                        )}
                      </div>
                    </div>
                  </div>
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
