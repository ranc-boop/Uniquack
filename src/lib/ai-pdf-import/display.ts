import {
  aiPdfInputStrategySummaryLabel,
  aiProviderModeSummaryLabel,
  inferAiProviderMode,
  type AiPdfInputStrategy,
  type AiProviderMode,
} from "@/lib/ai-providers/adapters";

export type { AiProviderMode } from "@/lib/ai-providers/adapters";

const TECHNICAL_DETAIL_LIMIT = 1200;

type SourceAssetDisplay = {
  metadata?: unknown;
  original_filename?: string | null;
  size_bytes?: number | string | null;
};

export function asAIPdfRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function getAIPdfSummary(summary: unknown) {
  return asAIPdfRecord(asAIPdfRecord(summary).aiPdfImport);
}

export function firstAIPdfString(
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

export function firstAIPdfNumber(
  record: Record<string, unknown>,
  keys: string[],
) {
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

export function stringAIPdfList(value: unknown) {
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

export function friendlyAIPdfPhaseLabel(phase: string) {
  const labels: Record<string, string> = {
    building_import_json: "Normalizing questions",
    calling_provider: "AI request sent",
    completed: "Completed",
    counting_pages: "Counting pages",
    cropping_assets: "Attaching image crops",
    extracting: "Extracting",
    failed: "Extraction failed",
    importing_questions: "Importing draft questions",
    loading_provider: "Provider selected",
    loading_tags: "Loading tag context",
    partial: "Partial",
    preparing_native_pdf_input: "Preparing Gemini Native full PDF",
    preparing_pdf_input: "Preparing full PDF input",
    preparing_provider_input: "Preparing provider input",
    provider_response_validated: "AI response received",
    queued: "Queued",
    rendering_page_images: "Rendering page images",
    segmentation_confirmed: "Masked boundaries confirmed",
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

export function isFailedAIPdfStatus(status: unknown) {
  const normalized = typeof status === "string" ? status.trim().toLowerCase() : "";

  return (
    normalized === "failed" ||
    normalized === "error" ||
    normalized.endsWith("_failed") ||
    normalized.includes("failed")
  );
}

export function deriveAIPdfPhase(status: unknown, reportedPhase: string) {
  if (isFailedAIPdfStatus(status)) {
    return "failed";
  }

  return reportedPhase === "completed" && status !== "imported"
    ? "failed"
    : reportedPhase;
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
  if (isFailedAIPdfStatus(status) && createdQuestionCount > 0) {
    return "Partial";
  }

  if (phase === "partial" && createdQuestionCount > 0) {
    return "Partial";
  }

  if (isFailedAIPdfStatus(status) || phase === "failed") {
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
      "segmentation_confirmed",
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

export function sanitizeAIPdfErrorForDisplay(value: unknown) {
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
    .replace(
      /https?:\/\/\S*(?:ai-import-sources|X-Amz-Signature|token=)\S*/gi,
      "[private source URL redacted]",
    )
    .replace(/\bsk-[A-Za-z0-9_-]+/g, "[api key redacted]")
    .replace(/\bAIza[A-Za-z0-9_-]+/g, "[api key redacted]")
    .replace(
      /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
      "[jwt redacted]",
    )
    .replace(/\bAI_PROVIDER_[A-Z0-9_]+\b/g, "[server provider setting redacted]")
    .replace(/\bSUPABASE_SERVICE_ROLE[A-Z0-9_]*\b/g, "[server setting redacted]")
    .slice(0, TECHNICAL_DETAIL_LIMIT);
}

export function summarizeAIPdfError(value: unknown) {
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

export function summarizeAIPdfWarnings({
  ai,
  status,
}: {
  ai: Record<string, unknown>;
  status: string;
}) {
  const rawWarnings = [
    ...stringAIPdfList(ai.warnings),
    ...stringAIPdfList(ai.parserWarnings),
    ...stringAIPdfList(ai.missingQuestionNumbers).map(
      (value) => `Missing question number: ${value}`,
    ),
    ...stringAIPdfList(ai.duplicateQuestionNumbers).map(
      (value) => `Duplicate question number: ${value}`,
    ),
    ...stringAIPdfList(ai.crossPageContinuations).map(
      (value) => `Cross-page continuation: ${value}`,
    ),
  ];
  const rawError = firstAIPdfString(ai, ["error"]);
  const unsupported = firstAIPdfString(ai, [
    "unsupportedProviderCapability",
    "unsupportedProviderReason",
  ]);
  const hasAssetPlaceholderProblem =
    rawWarnings.some((warning) => warning.includes("{{asset:figure_")) ||
    rawWarnings.some((warning) =>
      warning.toLowerCase().includes("asset placeholder"),
    ) ||
    rawError.toLowerCase().includes("asset_placeholders") ||
    rawError.toLowerCase().includes("placeholder: invalid input");

  if (rawError) {
    rawWarnings.push(...summarizeAIPdfError(rawError));
  }

  if (unsupported) {
    rawWarnings.push(`Unsupported provider capability: ${unsupported}`);
  }

  if (isFailedAIPdfStatus(status) && !rawWarnings.length) {
    rawWarnings.push("Provider or parser failure. Check the latest extraction error.");
  }

  const figurePlaceholderPattern =
    /^Could not find created question for \{\{asset:figure_(\d+)\}\}\.?$/;
  const figurePlaceholderWarnings = rawWarnings.filter((warning) =>
    figurePlaceholderPattern.test(warning),
  );
  const otherWarnings = rawWarnings.filter(
    (warning) => !figurePlaceholderPattern.test(warning),
  );
  const visibleWarnings =
    figurePlaceholderWarnings.length > 1
      ? [
          ...otherWarnings,
          `${figurePlaceholderWarnings.length} figure placeholders could not be attached because no matching draft questions were created.`,
        ]
      : rawWarnings;

  return {
    debugWarnings: Array.from(new Set(rawWarnings)),
    hasAssetPlaceholderProblem,
    technicalDetail: sanitizeAIPdfErrorForDisplay(rawError),
    visibleWarnings: Array.from(new Set(visibleWarnings)),
  };
}

export function formatAIPdfInputStrategy(
  strategy: string | undefined,
  providerMode?: AiProviderMode | string,
) {
  return aiPdfInputStrategySummaryLabel(
    strategy as AiPdfInputStrategy | undefined,
    providerMode,
  );
}

export function shortAIPdfBatchId(value: string) {
  return value.slice(0, 8);
}

export function deriveAIPdfBatchDisplayState({
  createdQuestionCount = 0,
  id,
  sourceAsset,
  status,
  summary,
}: {
  createdQuestionCount?: number;
  id: string;
  sourceAsset?: SourceAssetDisplay | null;
  status: string;
  summary: unknown;
}) {
  const summaryRecord = asAIPdfRecord(summary);
  const ai = getAIPdfSummary(summary);
  const provider = asAIPdfRecord(ai.provider);
  const providerValue = firstAIPdfString(provider, ["provider"]);
  const providerMode = inferAiProviderMode({
    base_url: "",
    provider: providerValue,
  });
  const providerModeLabel = aiProviderModeSummaryLabel(providerMode);
  const sourceMetadata = asAIPdfRecord(sourceAsset?.metadata);
  const pageCount =
    firstAIPdfNumber(ai, ["pagesProcessed", "processedPageCount", "pageCount"]) ??
    firstAIPdfNumber(sourceMetadata, ["pageCount"]);
  const sizeBytes =
    firstAIPdfNumber(ai, ["fileSizeBytes", "sizeBytes"]) ??
    firstAIPdfNumber({ value: sourceAsset?.size_bytes }, ["value"]);
  const finalCreatedQuestionCount = Math.max(
    createdQuestionCount,
    firstAIPdfNumber(ai, ["createdQuestionCount"]) ??
      firstAIPdfNumber(summaryRecord, ["createdCount"]) ??
      0,
  );
  const uploadedCropCount =
    firstAIPdfNumber(ai, ["uploadedCropCount", "uploadedCrops"]) ?? 0;
  const inputStrategy = firstAIPdfString(ai, [
    "sourceInput",
    "inputStrategy",
  ]);
  const reportedPhase = firstAIPdfString(ai, ["phase"], "source_uploaded");
  const phase = deriveAIPdfPhase(status, reportedPhase);
  const displayStatus = statusLabel({
    createdQuestionCount: finalCreatedQuestionCount,
    phase,
    status,
  });
  const warnings = summarizeAIPdfWarnings({ ai, status });
  const providerName = firstAIPdfString(provider, ["name"], "Not selected");
  const model = firstAIPdfString(provider, ["model"], "-");
  const inputStrategyLabel = formatAIPdfInputStrategy(
    inputStrategy,
    providerMode,
  );
  const sourceTitle =
    firstAIPdfString(ai, ["fileName"]) ||
    sourceAsset?.original_filename ||
    "AI PDF import";
  const hasNoDrafts = finalCreatedQuestionCount === 0;
  const failedWithoutDrafts = displayStatus === "Failed" && hasNoDrafts;
  const validationErrorReasons = Array.from(
    new Set(
      (Array.isArray(summaryRecord.validationErrorReasons)
        ? summaryRecord.validationErrorReasons
        : []
      )
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter(Boolean),
    ),
  ).slice(0, 4);
  const failureMessages = failedWithoutDrafts
    ? [
        "No drafts were created.",
        validationErrorReasons.length
          ? `Import validation failed: ${validationErrorReasons.join("; ")}`
          : "The extraction failed before questions could be imported.",
        ...(warnings.hasAssetPlaceholderProblem
          ? [
              "Some image placeholders could not be attached, but this should not block text-only drafts in future retries.",
            ]
          : []),
        "Retry the import or upload the PDF again after parser fixes.",
      ]
    : [];

  return {
    ai,
    canReviewDrafts: finalCreatedQuestionCount > 0,
    createdQuestionCount: finalCreatedQuestionCount,
    ctaLabel:
      displayStatus === "Failed" || displayStatus === "Partial"
        ? "Review created drafts"
        : "Review generated drafts",
    displayStatus,
    failedWithoutDrafts,
    failureMessages,
    id,
    inputStrategyLabel,
    model,
    pageCount,
    phase,
    phaseLabel: friendlyAIPdfPhaseLabel(phase),
    provider,
    providerMode,
    providerModeLabel,
    providerName,
    reviewHref: `/admin/review?batch=${id}`,
    shortId: shortAIPdfBatchId(id),
    sizeBytes,
    sourceAssetCount: sourceAsset ? 1 : 0,
    sourceTitle,
    strategy: inputStrategy,
    uploadedCropCount,
    warnings,
  };
}
