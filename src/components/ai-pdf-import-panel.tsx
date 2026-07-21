"use client";

import {
  ExternalLink,
  FileText,
  LoaderCircle,
  RotateCcw,
  Trash2,
  Upload,
} from "lucide-react";
import Link from "next/link";
import {
  useId,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import { toast } from "sonner";

import {
  cancelAIPdfSourceUpload,
  createAIPdfSourceSignedUrl,
  deleteAIPdfSource,
  finalizeAIPdfSourceUpload,
  getAIPdfImportStatus,
  reserveAIPdfSourceUpload,
  resetAIPdfImportOutputs,
  startAIPdfExtraction,
} from "@/app/admin/imports/pdf/actions";
import { AdminEmptyState } from "@/components/admin/admin-empty-state";
import { AdminInfoTip } from "@/components/admin/admin-info-tip";
import { AdminCompactNotice } from "@/components/admin/admin-compact-notice";
import { AdminStatusBadge } from "@/components/admin/admin-status-badge";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { AIPdfSegmentationPlanner } from "@/components/ai-pdf-segmentation-planner";
import {
  AI_IMPORT_SOURCES_BUCKET,
  AI_PDF_IMPORT_MAX_BYTES,
  AI_PDF_IMPORT_MAX_PAGES,
} from "@/lib/ai-pdf-import/constants";
import {
  deriveAIPdfBatchDisplayState,
  deriveAIPdfPhase,
  friendlyAIPdfPhaseLabel,
  isAIPdfBlueprintObservationCompletePhase,
  sanitizeAIPdfErrorForDisplay,
  summarizeAIPdfError as summarizeSharedAIPdfError,
} from "@/lib/ai-pdf-import/display";
import {
  aiPdfInputStrategySummaryLabel,
  describeAiPdfProviderInput,
} from "@/lib/ai-providers/adapters";
import type { SafeAIProviderProfile } from "@/lib/ai-providers/profiles";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

type AIPdfSourceOption = {
  batchId: string;
  createdAt?: string;
  createdQuestionCount?: number;
  assetStatus?: string;
  canDelete?: boolean;
  fileName: string;
  executionMode?: AIPdfExecutionMode;
  pageCount?: number;
  segmentationConfirmed?: boolean;
  sizeBytes?: number;
  sourceAssetId?: string;
  sourceObjectPath?: string;
  status: string;
};

type AIPdfExecutionMode =
  | "single_full_pdf"
  | "segmented_full_pdf"
  | "page_image_chunks"
  | "blueprint_observation";

type ImportResult =
  | {
      batchId: string;
      error?: string;
      jobId?: string;
      leaseExpiresAt?: string;
      status: string;
      summary?: any;
    }
  | null;

type SourceUploadResult =
  | {
      batchId: string;
      objectPath?: string;
      sourceAsset?: {
        id?: string;
        object_path?: string;
        original_filename?: string;
        size_bytes?: number;
        status?: string;
      };
      status: string;
      summary?: any;
      token?: string;
      uploadAttemptId?: string;
    }
  | null;

const AI_PDF_STATUS_POLL_TIMEOUT_MS = 15 * 60 * 1000;

function currentTimeMs() {
  return Date.now();
}

type OperationState = {
  batchId?: string;
  detail?: string;
  error?: string;
  id: string;
  state: "running" | "success" | "failed";
  steps: string[];
  title: string;
};

export type AIPdfImportPanelProps = {
  providers: SafeAIProviderProfile[];
  sources?: AIPdfSourceOption[];
};

const AI_PDF_RESERVE_TIMEOUT_MS = 30_000;
const AI_PDF_STORAGE_UPLOAD_TIMEOUT_MS = 180_000;
const AI_PDF_FINALIZE_TIMEOUT_MS = 90_000;
const AI_PDF_CLEANUP_TIMEOUT_MS = 20_000;
const PDF_MIME_TYPE = "application/pdf";

class ClientTimeoutError extends Error {
  isClientTimeout = true;
}

function isClientTimeoutError(error: unknown) {
  return error instanceof ClientTimeoutError;
}

function formatError(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function summarizeAIPdfError(value: unknown) {
  return (
    summarizeSharedAIPdfError(value).join(" ") ||
    "AI extraction failed before draft questions could be imported."
  );
}

function safeTechnicalDetail(value: unknown) {
  return sanitizeAIPdfErrorForDisplay(value);
}

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string,
) {
  let timeoutId: number | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = window.setTimeout(() => {
      reject(
        new ClientTimeoutError(
          `${label} timed out after ${Math.round(timeoutMs / 1000)}s.`,
        ),
      );
    }, timeoutMs);
  });

  return Promise.race([promise, timeout]).finally(() => {
    if (timeoutId) {
      window.clearTimeout(timeoutId);
    }
  });
}

function getAIPdfSummary(summary: any) {
  if (!summary || typeof summary !== "object" || Array.isArray(summary)) {
    return null;
  }

  const aiPdfImport = summary.aiPdfImport;

  return aiPdfImport && typeof aiPdfImport === "object" && !Array.isArray(aiPdfImport)
    ? aiPdfImport
    : null;
}

function getAIPdfPhase(summary: any) {
  const aiPdfImport = getAIPdfSummary(summary);

  return aiPdfImport?.phase ? String(aiPdfImport.phase) : "pending";
}

function isFailedBatchStatus(status: unknown) {
  const normalized = typeof status === "string" ? status.toLowerCase() : "";

  return (
    normalized === "failed" ||
    normalized === "error" ||
    normalized.endsWith("_failed") ||
    normalized.includes("failed")
  );
}

function effectiveAIPdfPhase(status: unknown, phase: string) {
  return deriveAIPdfPhase(status, phase);
}

function canExtractSource(source: AIPdfSourceOption) {
  return (
    source.assetStatus === "ready" &&
    source.status !== "imported" &&
    source.status !== "validating" &&
    (source.createdQuestionCount ?? 0) === 0
  );
}

function canResetGeneratedOutputs(source: AIPdfSourceOption) {
  return (source.createdQuestionCount ?? 0) > 0 && source.status !== "validating";
}

function isPdfFile(file: File) {
  return file.type === PDF_MIME_TYPE || file.name.toLowerCase().endsWith(".pdf");
}

function canonicalPdfMimeType(file: File) {
  return isPdfFile(file) ? PDF_MIME_TYPE : file.type;
}

function formatFileSize(bytes: number | undefined) {
  if (!bytes || bytes <= 0) {
    return "-";
  }

  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function sourceFromUpload(result: SourceUploadResult): AIPdfSourceOption | null {
  if (!result) {
    return null;
  }

  const ai = getAIPdfSummary(result.summary) ?? {};

  return {
    batchId: result.batchId,
    assetStatus: result.sourceAsset?.status,
    canDelete: result.status !== "validating",
    createdQuestionCount:
      typeof ai.createdQuestionCount === "number"
        ? ai.createdQuestionCount
        : typeof result.summary?.createdCount === "number"
          ? result.summary.createdCount
          : 0,
    fileName:
      ai.fileName ??
      result.sourceAsset?.original_filename ??
      "Uploaded PDF source",
    executionMode:
      ai.executionMode === "segmented_full_pdf" ||
      ai.executionMode === "page_image_chunks" ||
      ai.executionMode === "blueprint_observation"
        ? ai.executionMode
        : "single_full_pdf",
    pageCount: ai.pageCount,
    segmentationConfirmed:
      ai.manualSegmentation?.status === "confirmed",
    sizeBytes: result.sourceAsset?.size_bytes,
    sourceAssetId: ai.sourceAssetId ?? result.sourceAsset?.id,
    sourceObjectPath: ai.sourceObjectPath ?? result.sourceAsset?.object_path,
    status: result.status,
  };
}

function sourceResultFromStatusSnapshot(snapshot: any): SourceUploadResult {
  const sourceAsset =
    Array.isArray(snapshot?.assets) && snapshot.assets.length
      ? snapshot.assets.find((asset: any) => asset?.asset_role === "source_pdf") ??
        snapshot.assets[0]
      : undefined;

  return {
    batchId: snapshot?.batch?.id ?? "",
    sourceAsset,
    status: snapshot?.batch?.status ?? "failed",
    summary: snapshot?.batch?.summary,
  };
}

function phaseLabel(phase: string) {
  return friendlyAIPdfPhaseLabel(phase);
}

function ThinkingIndicator({
  detail,
  phase,
}: {
  detail?: string;
  phase: string;
}) {
  return (
    <div className="overflow-hidden rounded-md border bg-background">
      <div className="flex items-center gap-3 border-b px-3 py-2">
        <div className="relative flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
          <span className="absolute size-8 animate-ping rounded-full bg-primary/20" />
          <LoaderCircle className="relative size-4 animate-spin text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">Processing</p>
          <span className="sr-only">
            {phaseLabel(phase)}{detail ? ` - ${detail}` : ""}
          </span>
        </div>
        <div className="flex items-end gap-1" aria-hidden="true">
          {[0, 1, 2].map((index) => (
            <span
              key={index}
              className="h-3 w-1 animate-pulse rounded-full bg-primary/70"
              style={{
                animationDelay: `${index * 180}ms`,
                height: `${12 + index * 4}px`,
              }}
            />
          ))}
        </div>
      </div>
      <div className="flex items-center gap-2 px-3 py-3">
        <AdminStatusBadge compact status="pending" />
        <AdminInfoTip label="AI processing details">
          <p>{phaseLabel(phase)}{detail ? ` · ${detail}` : ""}</p>
          <p className="mt-2">AI is reading the PDF and preparing draft import records.</p>
        </AdminInfoTip>
      </div>
    </div>
  );
}

function BlueprintObservationCompletionCallout() {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-950">
      <p className="font-medium">Blueprint ready</p>
      <Button asChild className="w-fit" size="sm" variant="outline">
        <Link href="/admin/blueprints">
          Open Blueprint Library
          <ExternalLink className="size-4" />
        </Link>
      </Button>
      <AdminInfoTip label="Blueprint safety details" panelClassName="w-80">
        No questions were created by design. Review Draft writes and official taxonomy writes are also blocked during observation.
      </AdminInfoTip>
    </div>
  );
}

function ReviewDraftHandoffCallout({
  batchId,
  createdQuestionCount,
  model,
  providerName,
  sourceTitle,
  warningCount,
}: {
  batchId: string;
  createdQuestionCount: number;
  model: string;
  providerName: string;
  sourceTitle: string;
  warningCount: number;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 rounded-md border border-sky-200 bg-sky-50 p-3 text-sm text-sky-950">
      <div className="min-w-0 space-y-1">
        <p className="font-medium">Review Drafts are ready · {createdQuestionCount}</p>
        <AdminInfoTip label="Generated draft details" panelClassName="w-80">
          {sourceTitle} · {providerName} / {model} · {warningCount} warnings. AI-generated questions are private drafts until an admin reviews and publishes them.
        </AdminInfoTip>
      </div>
      <Button asChild className="shrink-0" size="sm">
        <Link href={`/admin/review?batch=${batchId}`}>
          Review generated drafts
          <ExternalLink className="size-4" />
        </Link>
      </Button>
    </div>
  );
}

export function AIPdfImportPanel({
  providers,
  sources = [],
}: AIPdfImportPanelProps) {
  const fileInputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [activeUploadCount, setActiveUploadCount] = useState(0);
  const [extracting, setExtracting] = useState(false);
  const [openingSourceId, setOpeningSourceId] = useState("");
  const [deletingSourceId, setDeletingSourceId] = useState("");
  const [resettingBatchId, setResettingBatchId] = useState("");
  const [removedSourceIds, setRemovedSourceIds] = useState<string[]>([]);
  const [uploadedResults, setUploadedResults] = useState<SourceUploadResult[]>([]);
  const [operation, setOperation] = useState<OperationState | null>(null);
  const [statusSnapshot, setStatusSnapshot] = useState<any>(null);
  const [selectedBatchId, setSelectedBatchId] = useState(
    sources.find(canExtractSource)?.batchId ?? "",
  );
  const [result, setResult] = useState<ImportResult>(null);

  const enabledProviders = providers.filter((provider) => provider.enabled);
  const providerOptions = enabledProviders.map((provider) => ({
    profile: provider,
    support: describeAiPdfProviderInput(provider),
  }));
  const extractableProviderOptions = providerOptions.filter(
    (option) => option.support.supported && option.support.implemented,
  );
  const defaultProviderOption =
    extractableProviderOptions.find((option) => option.profile.is_default) ??
    extractableProviderOptions[0];
  const [providerProfileId, setProviderProfileId] = useState(
    defaultProviderOption?.profile.id ?? "",
  );
  const [executionMode, setExecutionMode] = useState<AIPdfExecutionMode>(
    sources.find(canExtractSource)?.executionMode ?? "single_full_pdf",
  );
  const [blueprintModelQualityMode, setBlueprintModelQualityMode] = useState<
    "fast" | "quality"
  >("fast");
  const [segmentationConfirmed, setSegmentationConfirmed] = useState(
    sources.find(canExtractSource)?.segmentationConfirmed ?? false,
  );
  const uploadedSources = useMemo(
    () =>
      uploadedResults
        .map(sourceFromUpload)
        .filter((source): source is AIPdfSourceOption => Boolean(source)),
    [uploadedResults],
  );
  const sourceChoices = useMemo(() => {
    const byBatchId = new Map<string, AIPdfSourceOption>();

    for (const source of sources) {
      if (
        source.sourceAssetId &&
        removedSourceIds.includes(source.sourceAssetId)
      ) {
        continue;
      }

      byBatchId.set(source.batchId, source);
    }

    for (const uploadedSource of uploadedSources) {
      if (
        uploadedSource.sourceAssetId &&
        removedSourceIds.includes(uploadedSource.sourceAssetId)
      ) {
        continue;
      }

      byBatchId.set(uploadedSource.batchId, uploadedSource);
    }

    return Array.from(byBatchId.values());
  }, [sources, uploadedSources, removedSourceIds]);
  const extractableSources = sourceChoices.filter(canExtractSource);
  const selectedSource =
    extractableSources.find((source) => source.batchId === selectedBatchId) ??
    extractableSources[0] ??
    null;
  const selectedProviderOption = providerOptions.find(
    (option) => option.profile.id === providerProfileId,
  );
  const selectedProviderUsesFullPdf = [
    "gemini_native_pdf",
    "openai_file",
  ].includes(selectedProviderOption?.support.strategy ?? "");
  const uploading = activeUploadCount > 0;
  const activeStatusSummary = statusSnapshot?.batch?.summary ?? result?.summary;
  const activeAiSummary = getAIPdfSummary(activeStatusSummary);
  const activePhase = effectiveAIPdfPhase(
    statusSnapshot?.batch?.status ?? result?.status,
    getAIPdfPhase(activeStatusSummary),
  );
  const activeDetail =
    activeAiSummary?.detail !== undefined
      ? String(activeAiSummary.detail)
      : operation?.detail;

  function selectSource(source: AIPdfSourceOption) {
    setSelectedBatchId(source.batchId);
    setExecutionMode(source.executionMode ?? "single_full_pdf");
    setSegmentationConfirmed(source.segmentationConfirmed ?? false);
    setResult(null);
    setStatusSnapshot(null);
  }

  function startOperation(input: Omit<OperationState, "id" | "steps"> & { step: string }) {
    const id = crypto.randomUUID();

    setOperation({
      batchId: input.batchId,
      detail: input.detail,
      error: input.error,
      id,
      state: input.state,
      steps: [input.step],
      title: input.title,
    });

    return id;
  }

  function appendOperationStep(operationId: string, step: string, detail?: string) {
    setOperation((current) =>
      current?.id === operationId
        ? {
            ...current,
            detail: detail ?? current.detail,
            steps: [...current.steps.slice(-7), step],
          }
        : current,
    );
  }

  function finishOperation(
    operationId: string,
    state: "success" | "failed",
    step: string,
    detail?: string,
    error?: string,
  ) {
    setOperation((current) =>
      current?.id === operationId
        ? {
            ...current,
            detail: detail ?? current.detail,
            error,
            state,
            steps: [...current.steps.slice(-7), step],
          }
        : current,
    );
  }

  function isTerminalStatus(status: string | undefined, phase: string) {
    return (
      status === "failed" ||
      status === "imported" ||
      isAIPdfBlueprintObservationCompletePhase(phase)
    );
  }

  function resultFromStatusSnapshot(snapshot: any): NonNullable<ImportResult> {
    const ai = getAIPdfSummary(snapshot.batch?.summary);

    return {
      batchId: snapshot.batch?.id ?? "",
      error: ai?.error ? String(ai.error) : undefined,
      status: snapshot.batch?.status ?? "failed",
      summary: snapshot.batch?.summary,
    };
  }

  async function waitForBatchCompletion(
    batchId: string,
    operationId: string,
    isActive: () => boolean,
  ) {
    let lastStatus = "";
    const deadline = currentTimeMs() + AI_PDF_STATUS_POLL_TIMEOUT_MS;

    while (isActive()) {
      try {
        const snapshot = await getAIPdfImportStatus({ batchId });
        const ai = getAIPdfSummary(snapshot.batch?.summary);
        const phase = getAIPdfPhase(snapshot.batch?.summary);
        const statusKey = `${snapshot.batch?.status ?? "unknown"}:${phase}`;

        setOperation((current) => {
          if (current?.id === operationId) {
            setStatusSnapshot(snapshot);
          }

          return current;
        });

        if (ai?.error) {
          setOperation((current) =>
            current?.id === operationId
              ? {
                  ...current,
                  error: String(ai.error),
                }
              : current,
          );
        }

        if (statusKey !== lastStatus) {
          lastStatus = statusKey;
          appendOperationStep(
            operationId,
            `Batch status: ${snapshot.batch?.status ?? "unknown"} / ${phase}`,
            ai?.detail
              ? String(ai.detail)
              : `Last update: ${snapshot.batch?.updated_at ?? "-"}`,
          );
        }

        if (isTerminalStatus(snapshot.batch?.status, phase)) {
          return snapshot;
        }

        if (currentTimeMs() > deadline) {
          throw new Error(
            "AI extraction is still running after 15 minutes. The batch will keep its latest database status; reload this page to check it later.",
          );
        }
      } catch (error) {
        appendOperationStep(
          operationId,
          `Status polling failed: ${formatError(
            error,
            "Could not fetch import status.",
          )}`,
        );

        if (currentTimeMs() > deadline) {
          throw error;
        }
      }

      await new Promise((resolve) => setTimeout(resolve, 2500));
    }

    return null;
  }

  function validatePdfFile(file: File) {
    if (!isPdfFile(file)) {
      return `${file.name}: only PDF files can be imported.`;
    }

    if (file.size <= 0 || file.size > AI_PDF_IMPORT_MAX_BYTES) {
      return `${file.name}: PDF must be between 1 byte and 50MB.`;
    }

    return null;
  }

  async function uploadOneFile(file: File, operationId: string) {
    appendOperationStep(operationId, `Creating import batch for ${file.name}.`);
    let reservation:
      | Awaited<ReturnType<typeof reserveAIPdfSourceUpload>>
      | null = null;

    try {
      const mimeType = canonicalPdfMimeType(file);
      reservation = await withTimeout(
        reserveAIPdfSourceUpload({
          mimeType,
          originalFilename: file.name,
          sizeBytes: file.size,
        }),
        AI_PDF_RESERVE_TIMEOUT_MS,
        "Creating AI PDF upload reservation",
      );

      appendOperationStep(operationId, `Uploading ${file.name} to private storage.`);
      const supabase = createClient();
      const { error } = await withTimeout(
        supabase.storage
          .from(AI_IMPORT_SOURCES_BUCKET)
          .uploadToSignedUrl(reservation.objectPath, reservation.token, file, {
            contentType: mimeType,
          }),
        AI_PDF_STORAGE_UPLOAD_TIMEOUT_MS,
        "Uploading AI PDF source",
      );

      if (error) {
        throw new Error(error.message);
      }

      appendOperationStep(operationId, `Validating ${file.name}.`);
      return await withTimeout(
        finalizeAIPdfSourceUpload({
          assetId: reservation.sourceAsset.id,
          batchId: reservation.batchId,
          uploadAttemptId: reservation.uploadAttemptId,
        }),
        AI_PDF_FINALIZE_TIMEOUT_MS,
        "Finalizing AI PDF source",
      );
    } catch (error) {
      if (reservation?.uploadAttemptId) {
        void withTimeout(
          cancelAIPdfSourceUpload({
            assetId: reservation.sourceAsset.id,
            batchId: reservation.batchId,
            uploadAttemptId: reservation.uploadAttemptId,
          }),
          AI_PDF_CLEANUP_TIMEOUT_MS,
          "Cancelling failed AI PDF source upload",
        ).catch((cleanupError) => {
          appendOperationStep(
            operationId,
            `${file.name}: cleanup/cancel failed: ${formatError(
              cleanupError,
              "Could not cancel failed upload.",
            )}`,
          );
        });
      }

      throw error;
    }
  }

  async function uploadFiles(fileList: FileList | File[] | null | undefined) {
    const files = Array.from(fileList ?? []);

    if (!files.length) {
      return;
    }

    setActiveUploadCount((current) => current + 1);
    setResult(null);
    setStatusSnapshot(null);
    const operationId = startOperation({
      detail:
        files.length === 1
          ? `${files[0].name} / ${formatFileSize(files[0].size)}`
          : `${files.length} PDF files selected.`,
      state: "running",
      step:
        files.length === 1
          ? `Selected ${files[0].name}.`
          : `Selected ${files.length} files.`,
      title: files.length === 1 ? "Uploading PDF source" : "Uploading PDF sources",
    });

    let uploadedCount = 0;
    const failures: string[] = [];

    try {
      for (const file of files) {
        const validationError = validatePdfFile(file);

        if (validationError) {
          failures.push(validationError);
          appendOperationStep(operationId, validationError);
          continue;
        }

        try {
          const nextResult = await uploadOneFile(file, operationId);
          const nextSource = sourceFromUpload(nextResult);

          setUploadedResults((current) => [
            nextResult,
            ...current.filter((result) => result?.batchId !== nextResult.batchId),
          ]);

          if (nextSource) {
            selectSource(nextSource);
          }

          uploadedCount += 1;
          appendOperationStep(operationId, `${file.name} is ready for AI extraction.`);
        } catch (error) {
          const message = `${file.name}: ${formatError(
            error,
            "PDF source upload failed.",
          )}`;
          failures.push(message);
          appendOperationStep(operationId, message);
        }
      }

      if (uploadedCount > 0) {
        finishOperation(
          operationId,
          "success",
          `Uploaded ${uploadedCount} PDF source${uploadedCount === 1 ? "" : "s"}.`,
          failures.length ? `${failures.length} file(s) failed.` : undefined,
          failures.length ? failures.join("\n") : undefined,
        );
        toast.success(
          `Uploaded ${uploadedCount} PDF source${uploadedCount === 1 ? "" : "s"}.`,
        );
      } else {
        const message = failures.join("\n") || "PDF source upload failed.";
        finishOperation(operationId, "failed", "No PDF sources were uploaded.", undefined, message);
        toast.error("No PDF sources were uploaded.");
      }
    } finally {
      setActiveUploadCount((current) => Math.max(0, current - 1));

      if (inputRef.current) {
        inputRef.current.value = "";
      }
    }
  }

  function uploadSelectedFile(event: ChangeEvent<HTMLInputElement>) {
    if (!event.currentTarget.files?.length) {
      return;
    }

    void uploadFiles(event.currentTarget.files);
  }

  async function openSource(source: AIPdfSourceOption) {
    if (!source.sourceAssetId) {
      toast.error("PDF source asset is missing.");
      return;
    }

    setOpeningSourceId(source.sourceAssetId);

    try {
      const { signedUrl } = await createAIPdfSourceSignedUrl({
        assetId: source.sourceAssetId,
        batchId: source.batchId,
      });

      window.open(signedUrl, "_blank", "noopener,noreferrer");
      toast.success("Signed PDF URL opened.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not open PDF source.";
      toast.error(message);
    } finally {
      setOpeningSourceId("");
    }
  }

  async function removeSource(source: AIPdfSourceOption) {
    if (!source.sourceAssetId) {
      toast.error("PDF source asset is missing.");
      return;
    }

    if (
      !window.confirm(
        `Delete ${source.fileName}? This removes only the private source PDF. Existing draft questions and cropped question images will remain.`,
      )
    ) {
      return;
    }

    setDeletingSourceId(source.sourceAssetId);
    const operationId = startOperation({
      batchId: source.batchId,
      detail: source.fileName,
      state: "running",
      step: "Deleting private source PDF and marking the import asset deleted.",
      title: "Deleting PDF source",
    });

    try {
      await deleteAIPdfSource({
        assetId: source.sourceAssetId,
        batchId: source.batchId,
      });

      setRemovedSourceIds((current) => [...current, source.sourceAssetId!]);
      setUploadedResults((current) =>
        current.filter((result) => result?.batchId !== source.batchId),
      );

      if (selectedBatchId === source.batchId) {
        const nextSource = extractableSources.find(
          (candidate) => candidate.batchId !== source.batchId,
        );
        setSelectedBatchId(nextSource?.batchId ?? "");
      }

      finishOperation(operationId, "success", "PDF source deleted.");
      toast.success("PDF source deleted.");
    } catch (error) {
      const message = formatError(error, "Could not delete PDF source.");
      finishOperation(operationId, "failed", "Could not delete PDF source.", undefined, message);
      toast.error(message);
    } finally {
      setDeletingSourceId("");
    }
  }

  async function resetGeneratedOutputs(source: AIPdfSourceOption) {
    const generatedCount = source.createdQuestionCount ?? 0;

    if (!generatedCount) {
      toast.error("This AI PDF batch has no generated drafts to reset.");
      return;
    }

    if (
      !window.confirm(
        `Reset ${generatedCount} generated draft question(s) from ${source.fileName}? The private source PDF will be kept so you can run extraction again. Published questions are never deleted automatically.`,
      )
    ) {
      return;
    }

    setResettingBatchId(source.batchId);
    setResult(null);
    setStatusSnapshot(null);
    const operationId = startOperation({
      batchId: source.batchId,
      detail: source.fileName,
      state: "running",
      step: "Resetting generated draft questions and image assets for this AI PDF batch.",
      title: "Resetting AI PDF output",
    });

    try {
      const resetResult = await resetAIPdfImportOutputs({
        batchId: source.batchId,
      });

      setUploadedResults((current) => [
        resetResult,
        ...current.filter((result) => result?.batchId !== source.batchId),
      ]);
      setSelectedBatchId(source.batchId);
      setResult(resetResult);
      setOperation((current) => {
        if (current?.id === operationId) {
          setStatusSnapshot({
            assets: resetResult.sourceAsset ? [resetResult.sourceAsset] : [],
            batch: {
              id: resetResult.batchId,
              status: resetResult.status,
              summary: resetResult.summary,
            },
          });
        }

        return current;
      });
      finishOperation(
        operationId,
        "success",
        `Reset ${resetResult.deletedQuestionCount} draft question(s), ${resetResult.deletedAssetCount} image asset(s), and ${resetResult.deletedImportItemCount} import item(s).`,
        "Source PDF kept. You can start extraction again.",
      );
      toast.success("AI PDF generated drafts reset.");
    } catch (error) {
      const message = formatError(
        error,
        "Could not reset AI PDF generated drafts.",
      );
      finishOperation(
        operationId,
        "failed",
        "Could not reset AI PDF generated drafts.",
        undefined,
        message,
      );
      toast.error(message);
    } finally {
      setResettingBatchId("");
    }
  }

  async function startExtraction(formData: FormData) {
    const providerProfileId = String(formData.get("provider_profile_id") ?? "");
    const batchId = selectedSource?.batchId;

    if (!batchId) {
      toast.error("Upload or select a PDF source before starting extraction.");
      return;
    }

    if (!providerProfileId) {
      toast.error("Select an AI provider before starting extraction.");
      return;
    }

    const providerOption = providerOptions.find(
      (option) => option.profile.id === providerProfileId,
    );

    if (
      !providerOption?.support.supported ||
      !providerOption.support.implemented
    ) {
      toast.error(
        providerOption?.support.reason ??
          "This provider is not available for AI PDF extraction.",
      );
      return;
    }

    const resolvedExecutionMode =
      providerOption.support.strategy === "page_images"
        ? "page_image_chunks"
        : executionMode;

    if (
      resolvedExecutionMode === "segmented_full_pdf" &&
      !segmentationConfirmed
    ) {
      toast.error("Confirm every masked PDF boundary before starting segmented extraction.");
      return;
    }

    setExtracting(true);
    setStatusSnapshot(null);
    setResult({
      batchId,
      status: "validating",
      summary: {
        aiPdfImport: {
          phase: "starting_extraction",
        },
      },
    });
    const operationId = startOperation({
      batchId,
      detail: selectedSource.fileName,
      state: "running",
      step: "Starting AI extraction request.",
      title: "AI PDF extraction",
    });

    try {
      appendOperationStep(operationId, "Queueing AI extraction on the server.");
      const queuedResult = await startAIPdfExtraction({
        batchId,
        blueprintModelQualityMode:
          resolvedExecutionMode === "blueprint_observation"
            ? blueprintModelQualityMode
            : undefined,
        executionMode: resolvedExecutionMode,
        providerProfileId,
      });
      setResult(queuedResult);
      appendOperationStep(
        operationId,
        "AI extraction queued. A trusted worker will continue it even if this browser closes.",
      );
      finishOperation(
        operationId,
        "success",
        "AI extraction queued.",
        "AI processing continues on the server. You can leave this page and refresh later.",
      );
      toast.success("AI PDF import queued.");
    } catch (error) {
      const message = formatError(error, "AI PDF import failed.");
      setResult({
        batchId,
        error: message,
        status: "failed",
      });
      finishOperation(operationId, "failed", "AI extraction failed.", undefined, message);
      toast.error(summarizeAIPdfError(message));
    } finally {
      setExtracting(false);
    }
  }

  return (
    <div className="space-y-5">
      <form
        onSubmit={(event) => event.preventDefault()}
        className="space-y-3 rounded-md border bg-muted/20 p-3"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium">Upload private PDF source</p>
              <AdminInfoTip label="Upload private PDF source details">
                Choose one or more private PDF sources. Upload starts
                immediately after selection and runs sequentially to avoid
                blocking the UI.
              </AdminInfoTip>
            </div>
          </div>
          <label
            htmlFor={fileInputId}
            role="button"
            tabIndex={0}
            aria-busy={uploading}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                inputRef.current?.click();
              }
            }}
            className={cn(
              buttonVariants({ variant: "outline", size: "sm" }),
              "cursor-pointer",
            )}
          >
            {uploading ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <Upload className="size-4" />
            )}
            {uploading ? "Uploading..." : "Upload PDF source"}
          </label>
          <input
            id={fileInputId}
            ref={inputRef}
            type="file"
            accept="application/pdf,.pdf"
            multiple
            className="sr-only"
            onChange={uploadSelectedFile}
          />
        </div>
        <AdminInfoTip label="Upload limits" panelClassName="w-80">
          Upload is available before provider setup. Limit: {AI_PDF_IMPORT_MAX_PAGES} pages / 50MB.
        </AdminInfoTip>
      </form>

      {operation ? (
        <div
          className={cn(
            "space-y-3 rounded-md border p-4 text-sm",
            operation.state === "failed"
              ? "border-destructive/30 bg-destructive/10"
              : operation.state === "success"
                ? "border-emerald-200 bg-emerald-50"
                : "bg-muted/20",
          )}
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-medium">{operation.title}</p>
              {operation.detail || operation.batchId ? (
                <AdminInfoTip label="Operation details" panelClassName="w-96">
                  <div className="space-y-1">
                    {operation.detail ? <p>{operation.detail}</p> : null}
                    {operation.batchId ? <p className="font-mono break-all">{operation.batchId}</p> : null}
                  </div>
                </AdminInfoTip>
              ) : null}
            </div>
            <AdminStatusBadge status={operation.state} />
          </div>
          {statusSnapshot?.batch ? (
            (() => {
              const display = deriveAIPdfBatchDisplayState({
                createdQuestionCount: 0,
                id: statusSnapshot.batch.id ?? operation.batchId ?? "",
                sourceAsset:
                  sourceResultFromStatusSnapshot(statusSnapshot)?.sourceAsset,
                status: statusSnapshot.batch.status ?? "failed",
                summary: statusSnapshot.batch.summary,
              });
              const ai = display.ai;
              const phase = display.phase;
              const warnings = display.warnings;
              const isBlueprintObservationComplete =
                isAIPdfBlueprintObservationCompletePhase(phase);

              return (
                <div className="space-y-3">
                  {operation.state === "running" &&
                  !isBlueprintObservationComplete ? (
                    <ThinkingIndicator
                      detail={ai?.detail ? String(ai.detail) : undefined}
                      phase={phase}
                    />
                  ) : null}
                  {isBlueprintObservationComplete ? (
                    <BlueprintObservationCompletionCallout />
                  ) : null}
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm">
                      <AdminStatusBadge compact status={statusSnapshot.batch.status} />
                      <AdminInfoTip label={`Phase: ${display.phaseLabel}`}>
                        <p>{display.phaseLabel}</p>
                      </AdminInfoTip>
                      {typeof ai.questionCount === "number" || display.createdQuestionCount > 0 ? (
                        <span className="text-muted-foreground">
                          {typeof ai.questionCount === "number" ? ai.questionCount : display.createdQuestionCount} drafts
                        </span>
                      ) : null}
                      {warnings.visibleWarnings.length ? (
                        <AdminStatusBadge compact status="warning" />
                      ) : null}
                      <AdminInfoTip label="Run details" panelClassName="w-96">
                        <div className="space-y-1">
                          <p>Batch: {statusSnapshot.batch.status}</p>
                          <p>Assets: {statusSnapshot.assets?.length ?? 0} · Crops: {display.uploadedCropCount}</p>
                          <p>Input: {display.inputStrategyLabel}</p>
                          <p>Warnings: {warnings.debugWarnings.length}</p>
                          {ai.detail ? <p>{String(ai.detail)}</p> : null}
                        </div>
                      </AdminInfoTip>
                    </div>
                    {display.failedWithoutDrafts ? (
                      <div className="space-y-1 text-destructive md:col-span-3">
                        {display.failureMessages.map((message) => (
                          <p key={message}>{message}</p>
                        ))}
                      </div>
                    ) : null}
                    {display.canReviewDrafts ? (
                      <div className="md:col-span-3">
                        <ReviewDraftHandoffCallout
                          batchId={display.id}
                          createdQuestionCount={display.createdQuestionCount}
                          model={display.model}
                          providerName={display.providerName}
                          sourceTitle={display.sourceTitle}
                          warningCount={warnings.visibleWarnings.length}
                        />
                      </div>
                    ) : null}
                    {warnings.visibleWarnings.length ? (
                      <div className="md:col-span-3">
                        <AdminCompactNotice label={`${warnings.visibleWarnings.length} warnings`} tone="warning">
                          <ul className="list-disc space-y-1 pl-4">
                            {warnings.visibleWarnings.map((warning) => <li key={warning}>{warning}</li>)}
                            {warnings.debugWarnings.length !== warnings.visibleWarnings.length
                              ? warnings.debugWarnings.slice(warnings.visibleWarnings.length).map((warning, index) => <li key={`${warning}-${index}`}>{warning}</li>)
                              : null}
                          </ul>
                        </AdminCompactNotice>
                      </div>
                    ) : null}
                    {ai.error ? (
                      <div className="md:col-span-3">
                        <AdminCompactNotice label="Import failed" tone="error">
                          <p>{summarizeAIPdfError(ai.error)}</p>
                          <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap">{safeTechnicalDetail(ai.error)}</pre>
                        </AdminCompactNotice>
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })()
          ) : null}
          {operation.state === "running" &&
          !statusSnapshot?.batch &&
          !isAIPdfBlueprintObservationCompletePhase(getAIPdfPhase(result?.summary)) ? (
            <ThinkingIndicator
              detail={operation.detail}
              phase={getAIPdfPhase(result?.summary)}
            />
          ) : null}
          <AdminInfoTip label="Activity">
            <ol className="space-y-1 pl-4">
              {operation.steps.map((step, index) => <li key={`${step}-${index}`}>{step}</li>)}
            </ol>
          </AdminInfoTip>
          {operation.error ? (
            <AdminCompactNotice label="Operation failed" tone="error">
              <p>{summarizeAIPdfError(operation.error)}</p>
              <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap">{safeTechnicalDetail(operation.error)}</pre>
            </AdminCompactNotice>
          ) : null}
        </div>
      ) : null}

      <div className="space-y-3 rounded-md border bg-muted/20 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium">Choose uploaded source</p>
              <AdminInfoTip label="Uploaded source actions">
                Private import-level files are stored in ai-import-sources. Use
                a source for extraction, open it with a short-lived URL, or
                delete the private source PDF when it is no longer needed.
              </AdminInfoTip>
            </div>
          </div>
          <Badge variant="secondary">{sourceChoices.length} files</Badge>
        </div>
        {sourceChoices.length ? (
          <div className="grid gap-3 lg:grid-cols-2">
            {sourceChoices.map((source) => {
              const sourceId = source.sourceAssetId ?? source.batchId;
              const isSelected = selectedSource?.batchId === source.batchId;
              const extractable = canExtractSource(source);
              const resettable = canResetGeneratedOutputs(source);

              return (
                <div
                  key={sourceId}
                  className="space-y-3 rounded-md border bg-background p-3"
                >
                  <div className="flex items-start gap-2">
                    <FileText className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <p
                        className="truncate text-sm font-medium"
                        title={source.fileName}
                      >
                        {source.fileName}
                      </p>
                      <AdminInfoTip label="Source file details" panelClassName="w-80">
                        <div className="space-y-1">
                          <p>{formatFileSize(source.sizeBytes)}{source.pageCount ? ` · ${source.pageCount} pages` : ""}</p>
                          {source.createdAt ? <p>{new Date(source.createdAt).toLocaleString()}</p> : null}
                          <p className="font-mono break-all">Batch: {source.batchId}</p>
                        </div>
                      </AdminInfoTip>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <AdminStatusBadge compact status={source.assetStatus} />
                    <AdminStatusBadge compact status={source.status} />
                    {source.status === "imported" ? (
                      <AdminInfoTip label="Questions retained">
                        Existing generated questions stay after the private source is deleted.
                      </AdminInfoTip>
                    ) : null}
                    {(source.createdQuestionCount ?? 0) > 0 ? (
                      <Badge
                        aria-label={`${source.createdQuestionCount} generated drafts`}
                        className="size-7 justify-center rounded-full p-0"
                        title={`${source.createdQuestionCount} generated drafts`}
                        variant="outline"
                      >
                        <FileText aria-hidden="true" className="size-3.5" />
                        <span className="sr-only">{source.createdQuestionCount} drafts</span>
                      </Badge>
                    ) : null}
                  </div>
                  {!extractable && resettable ? (
                    <AdminInfoTip label="Extraction unavailable">
                      Reset generated drafts before extracting this PDF again.
                    </AdminInfoTip>
                  ) : null}
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      aria-label={isSelected ? "Selected source" : "Use for extraction"}
                      variant={isSelected ? "default" : "outline"}
                      disabled={!extractable || extracting}
                      onClick={() => selectSource(source)}
                    >
                      {isSelected ? "Selected" : "Use for extraction"}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      aria-label="Reset generated drafts"
                      title="Reset generated drafts"
                      variant="outline"
                      disabled={
                        !resettable ||
                        extracting ||
                        resettingBatchId === source.batchId
                      }
                      onClick={() => void resetGeneratedOutputs(source)}
                    >
                      {resettingBatchId === source.batchId ? (
                        <LoaderCircle className="size-4 animate-spin" />
                      ) : (
                        <RotateCcw className="size-4" />
                      )}
                      <span className="sr-only">Reset generated drafts</span>
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      aria-label="Open PDF"
                      title="Open PDF"
                      variant="outline"
                      disabled={
                        source.assetStatus !== "ready" ||
                        openingSourceId === sourceId
                      }
                      onClick={() => void openSource(source)}
                    >
                      {openingSourceId === sourceId ? (
                        <LoaderCircle className="size-4 animate-spin" />
                      ) : (
                        <ExternalLink className="size-4" />
                      )}
                      <span className="sr-only">Open PDF</span>
                    </Button>
                    <Button
                      type="button"
                      aria-label="Delete private source"
                      size="sm"
                      title="Delete private source"
                      variant="destructive"
                      disabled={
                        !source.canDelete ||
                        extracting ||
                        resettingBatchId === source.batchId ||
                        deletingSourceId === sourceId
                      }
                      onClick={() => void removeSource(source)}
                    >
                      {deletingSourceId === sourceId ? (
                        <LoaderCircle className="size-4 animate-spin" />
                      ) : (
                        <Trash2 className="size-4" />
                      )}
                      <span className="sr-only">Delete</span>
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <AdminEmptyState
            className="p-6"
            description="Upload a private PDF source first. It will appear here with its status, page count, and extraction actions."
            title="No uploaded AI PDF sources yet"
          />
        )}
        <AdminInfoTip label="File binding model" panelClassName="w-96">
          <p>
            Source PDFs are private import-level assets and are not bound to a question before extraction.
          </p>
          <p className="mt-2">
            After extraction, confirmed image crops are stored as question assets for previews and detail pages.
          </p>
        </AdminInfoTip>
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void startExtraction(new FormData(event.currentTarget));
        }}
        className="space-y-4 rounded-md border bg-muted/20 p-4"
      >
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium">Choose mode and run</p>
            <AdminInfoTip label="AI extraction mode details">
              Normal extraction creates draft questions for review. Blueprint
              observation creates reviewable blueprint metadata without
              creating questions.
            </AdminInfoTip>
          </div>
        </div>
        <div className="grid gap-4 xl:grid-cols-[1fr_1fr_0.9fr_auto]">
          <div className="space-y-2">
            <label htmlFor="source_batch_id" className="text-sm font-medium">
              PDF source
            </label>
            <select
              id="source_batch_id"
              value={selectedSource?.batchId ?? ""}
              onChange={(event) => {
                const nextBatchId = event.target.value;
                const nextSource = extractableSources.find(
                  (source) => source.batchId === nextBatchId,
                );

                if (nextSource) {
                  selectSource(nextSource);
                }
              }}
              disabled={!extractableSources.length || extracting}
              className="h-10 w-full rounded-md border bg-background px-3 text-sm"
            >
              {!extractableSources.length ? (
                <option value="">Upload or reset a PDF source first</option>
              ) : null}
              {extractableSources.map((source) => (
                <option key={source.batchId} value={source.batchId}>
                  {source.fileName} / {source.status}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <label htmlFor="provider_profile_id" className="text-sm font-medium">
                Provider profile
              </label>
              <AdminInfoTip label="Provider strategy details">
                DeepSeek text/json providers are blocked from PDF extraction
                unless explicitly configured for page images. Gemini
                OpenAI-compatible providers use page images, not full PDF file
                input. Gemini Native providers can use full PDF input when
                native/full PDF is enabled.
              </AdminInfoTip>
            </div>
            <select
              id="provider_profile_id"
              name="provider_profile_id"
              value={providerProfileId}
              onChange={(event) => {
                const nextId = event.target.value;
                const nextProvider = providerOptions.find(
                  (option) => option.profile.id === nextId,
                );
                setProviderProfileId(nextId);
                if (nextProvider?.support.strategy === "page_images") {
                  setExecutionMode("page_image_chunks");
                } else if (executionMode === "page_image_chunks") {
                  setExecutionMode("single_full_pdf");
                }
              }}
              disabled={!extractableProviderOptions.length || extracting}
              required
              className="h-10 w-full rounded-md border bg-background px-3 text-sm"
            >
              {!providerOptions.length ? (
                <option value="">No enabled provider</option>
              ) : null}
              {providerOptions.map((option) => (
                <option
                  key={option.profile.id}
                  value={option.profile.id}
                  disabled={
                    !option.support.supported || !option.support.implemented
                  }
                >
                  {option.profile.name} / {option.profile.model} -{" "}
                  {aiPdfInputStrategySummaryLabel(
                    option.support.strategy,
                    option.support.mode,
                  )}
                </option>
              ))}
            </select>
            <AdminInfoTip label="Provider availability">
              {providerOptions.length && !extractableProviderOptions.length
                ? providerOptions[0]?.support.reason ?? "No enabled provider supports PDF/image extraction."
                : "Only supported PDF/image providers are enabled."}
            </AdminInfoTip>
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <label htmlFor="execution_mode" className="text-sm font-medium">
                Execution mode
              </label>
              <AdminInfoTip label="Execution mode details">
                {selectedProviderUsesFullPdf
                  ? "Split mode imports draft questions from masked chunks. Blueprint observation only stores safe structure/style metadata and creates no questions."
                  : "This provider receives rendered page images using the existing overlap workflow."}
              </AdminInfoTip>
            </div>
            <select
              id="execution_mode"
              className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              disabled={!selectedProviderOption || extracting}
              onChange={(event) => {
                setExecutionMode(
                  event.target.value as
                    AIPdfExecutionMode,
                );
              }}
              value={
                selectedProviderOption?.support.strategy === "page_images"
                  ? "page_image_chunks"
                  : executionMode
              }
            >
              {selectedProviderUsesFullPdf ? (
                <>
                  <option value="single_full_pdf">Single full PDF</option>
                  <option value="segmented_full_pdf">
                    Split into masked PDF chunks
                  </option>
                  <option value="blueprint_observation">
                    Blueprint observation only
                  </option>
                </>
              ) : (
                <option value="page_image_chunks">Page-image chunks</option>
              )}
            </select>
          </div>
          {selectedProviderUsesFullPdf && executionMode === "blueprint_observation" ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <label
                  htmlFor="blueprint_model_quality_mode"
                  className="text-sm font-medium"
                >
                  Blueprint AI quality mode
                </label>
                <AdminInfoTip label="Blueprint AI quality mode details">
                  Affects DeepSeek blueprint analysis only. Gemini still
                  performs the same PDF observation step. If no Quality model is
                  configured, the server falls back to Fast.
                </AdminInfoTip>
              </div>
              <select
                id="blueprint_model_quality_mode"
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                disabled={extracting}
                onChange={(event) =>
                  setBlueprintModelQualityMode(
                    event.target.value === "quality" ? "quality" : "fast",
                  )
                }
                value={blueprintModelQualityMode}
              >
                <option value="fast">Fast</option>
                <option value="quality">Quality</option>
              </select>
              <AdminInfoTip label="Analysis model details">
                Analysis model only.
              </AdminInfoTip>
            </div>
          ) : null}
          <div className="flex items-end">
            <Button
              type="submit"
              disabled={
                !selectedSource ||
                !extractableProviderOptions.length ||
                extracting ||
                (selectedProviderUsesFullPdf &&
                  executionMode === "segmented_full_pdf" &&
                  !segmentationConfirmed)
              }
            >
              {extracting ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <FileText className="size-4" />
              )}
              {extracting ? "Extracting..." : "Start AI extraction"}
            </Button>
          </div>
        </div>
        {selectedSource ? (
          <AdminInfoTip label="Selected source details" panelClassName="w-96">
            <div className="space-y-1">
              <p>{selectedSource.fileName}{selectedSource.pageCount ? ` · ${selectedSource.pageCount} pages` : ""}</p>
              <p className="font-mono break-all">{selectedSource.batchId}</p>
            </div>
          </AdminInfoTip>
        ) : (
          <AdminInfoTip label="Source required">
            Upload a PDF source before starting AI extraction.
          </AdminInfoTip>
        )}
        {selectedSource?.pageCount &&
        selectedProviderUsesFullPdf &&
        executionMode === "segmented_full_pdf" ? (
          <AIPdfSegmentationPlanner
            batchId={selectedSource.batchId}
            disabled={extracting}
            initiallyConfirmed={segmentationConfirmed}
            key={selectedSource.batchId}
            onConfirmationChange={setSegmentationConfirmed}
            onConfirmed={(summary) => {
              setSegmentationConfirmed(true);
              setStatusSnapshot((current: any) => ({
                ...(current ?? {}),
                batch: {
                  ...(current?.batch ?? {}),
                  id: selectedSource.batchId,
                  status: selectedSource.status,
                  summary,
                },
              }));
            }}
            pageCount={selectedSource.pageCount}
          />
        ) : null}
        {extracting && !isAIPdfBlueprintObservationCompletePhase(activePhase) ? (
          <ThinkingIndicator detail={activeDetail} phase={activePhase} />
        ) : null}
        {!extractableProviderOptions.length ? (
          <AdminCompactNotice label="No extraction provider" tone="warning">
            PDF upload is available. A super admin must configure an enabled provider that supports page-image or native PDF extraction.
          </AdminCompactNotice>
        ) : null}
      </form>
    </div>
  );
}
