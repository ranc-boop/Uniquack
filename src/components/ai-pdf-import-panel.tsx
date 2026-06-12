"use client";

import {
  ExternalLink,
  FileText,
  LoaderCircle,
  RotateCcw,
  Trash2,
  Upload,
} from "lucide-react";
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
  runQueuedAIPdfExtraction,
  startAIPdfExtraction,
} from "@/app/admin/imports/pdf/actions";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  AI_IMPORT_SOURCES_BUCKET,
  AI_PDF_IMPORT_MAX_BYTES,
} from "@/lib/ai-pdf-import/constants";
import {
  deriveAIPdfBatchDisplayState,
  deriveAIPdfPhase,
  friendlyAIPdfPhaseLabel,
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
  pageCount?: number;
  sizeBytes?: number;
  sourceAssetId?: string;
  sourceObjectPath?: string;
  status: string;
};

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

type AIPdfImportPanelProps = {
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
    pageCount: ai.pageCount,
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
          <p className="text-sm font-medium">Thinking...</p>
          <p className="truncate text-xs text-muted-foreground">
            {phaseLabel(phase)}
            {detail ? ` - ${detail}` : ""}
          </p>
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
      <div className="space-y-2 px-3 py-3 text-xs text-muted-foreground">
        <p>
          AI is reading the full PDF context, identifying question boundaries,
          matching tags, and preparing draft import records.
        </p>
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary">reasoning</Badge>
          <Badge variant="outline">{phaseLabel(phase)}</Badge>
        </div>
      </div>
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

  function isTerminalStatus(status: string | undefined) {
    return status === "failed" || status === "imported";
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

        if (isTerminalStatus(snapshot.batch?.status)) {
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
            setSelectedBatchId(nextSource.batchId);
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

    let polling = true;

    try {
      appendOperationStep(operationId, "Queueing AI extraction on the server.");
      const queuedResult = await startAIPdfExtraction({
        batchId,
        providerProfileId,
      });
      setResult(queuedResult);
      appendOperationStep(
        operationId,
        "AI extraction queued. Running leased job and watching batch status.",
      );
      const runPromise = runQueuedAIPdfExtraction({
        batchId,
        jobId: queuedResult.jobId,
      }).catch((error) => {
        appendOperationStep(
          operationId,
          `AI extraction job request ended: ${formatError(
            error,
            "AI extraction job request failed.",
          )}`,
        );
      });

      const finalSnapshot = await waitForBatchCompletion(
        batchId,
        operationId,
        () => polling,
      );

      await runPromise;

      if (!finalSnapshot) {
        return;
      }

      const nextResult = resultFromStatusSnapshot(finalSnapshot);
      const nextSourceResult = sourceResultFromStatusSnapshot(finalSnapshot);
      const aiImportSummary = getAIPdfSummary(nextResult.summary) as
        | {
            createdQuestionCount?: number;
            error?: string;
          }
        | undefined;

      setResult(nextResult);
      if (nextSourceResult?.batchId) {
        setUploadedResults((current) => [
          nextSourceResult,
          ...current.filter((result) => result?.batchId !== nextSourceResult.batchId),
        ]);
      }

      if (nextResult.status === "failed") {
        finishOperation(
          operationId,
          "failed",
          "AI extraction failed.",
          getAIPdfPhase(nextResult.summary),
          nextResult.error ?? aiImportSummary?.error,
        );
        toast.error(summarizeAIPdfError(nextResult.error));
      } else {
        finishOperation(
          operationId,
          "success",
          "AI extraction completed.",
          `Created ${aiImportSummary?.createdQuestionCount ?? 0} draft questions.`,
        );
        toast.success("AI PDF import completed.");
      }
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
      polling = false;
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
            <p className="text-sm font-medium">Step 1: Upload PDF source</p>
            <p className="text-xs text-muted-foreground">
              Choose one or more private PDF sources. Upload starts immediately
              after selection and runs sequentially to avoid blocking the UI.
            </p>
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
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          {uploading ? <LoaderCircle className="size-3 animate-spin" /> : null}
          Upload is available even when no AI provider is configured. Limits:
          50 pages / 50MB per file. If an upload times out, select the file
          again to retry.
        </p>
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
              {operation.detail ? (
                <p className="text-xs text-muted-foreground">
                  {operation.detail}
                </p>
              ) : null}
              {operation.batchId ? (
                <p className="font-mono text-xs text-muted-foreground">
                  {operation.batchId}
                </p>
              ) : null}
            </div>
            <Badge
              variant={operation.state === "failed" ? "outline" : "secondary"}
            >
              {operation.state === "running" ? "running" : operation.state}
            </Badge>
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

              return (
                <div className="space-y-3">
                  {operation.state === "running" ? (
                    <ThinkingIndicator
                      detail={ai?.detail ? String(ai.detail) : undefined}
                      phase={phase}
                    />
                  ) : null}
                  <div className="grid gap-2 rounded-md border bg-background px-3 py-2 text-xs md:grid-cols-3">
                    <p>Batch: {statusSnapshot.batch.status}</p>
                    <p>Phase: {display.phaseLabel}</p>
                    <p>Import assets: {statusSnapshot.assets?.length ?? 0}</p>
                    <p>Uploaded crops: {display.uploadedCropCount}</p>
                    <p>Input: {display.inputStrategyLabel}</p>
                    <p>
                      Questions:{" "}
                      {typeof ai.questionCount === "number"
                        ? ai.questionCount
                        : display.createdQuestionCount || "-"}
                    </p>
                    <p>Warnings: {warnings.debugWarnings.length}</p>
                    {ai.detail ? (
                      <p className="md:col-span-3">
                        Detail: {String(ai.detail)}
                      </p>
                    ) : null}
                    {display.failedWithoutDrafts ? (
                      <div className="space-y-1 text-destructive md:col-span-3">
                        {display.failureMessages.map((message) => (
                          <p key={message}>{message}</p>
                        ))}
                      </div>
                    ) : null}
                    {warnings.visibleWarnings.length ? (
                      <div className="space-y-1 md:col-span-3">
                        <p className="font-medium">Warnings</p>
                        <ul className="list-disc space-y-1 pl-4 text-muted-foreground">
                          {warnings.visibleWarnings.map((warning) => (
                            <li key={warning}>{warning}</li>
                          ))}
                        </ul>
                        {warnings.debugWarnings.length !==
                        warnings.visibleWarnings.length ? (
                          <details className="rounded-md border bg-background p-2 text-muted-foreground">
                            <summary className="cursor-pointer text-foreground">
                              Debug details
                            </summary>
                            <ul className="mt-2 list-disc space-y-1 pl-4">
                              {warnings.debugWarnings.map((warning, index) => (
                                <li key={`${warning}-${index}`}>{warning}</li>
                              ))}
                            </ul>
                          </details>
                        ) : null}
                      </div>
                    ) : null}
                    {ai.error ? (
                      <div className="space-y-2 text-destructive md:col-span-3">
                        <p>Error: {summarizeAIPdfError(ai.error)}</p>
                        <details className="rounded-md border bg-background p-2 text-muted-foreground">
                          <summary className="cursor-pointer text-foreground">
                            Technical details
                          </summary>
                          <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap">
                            {safeTechnicalDetail(ai.error)}
                          </pre>
                        </details>
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })()
          ) : null}
          {operation.state === "running" && !statusSnapshot?.batch ? (
            <ThinkingIndicator
              detail={operation.detail}
              phase={getAIPdfPhase(result?.summary)}
            />
          ) : null}
          <ol className="space-y-1 text-xs text-muted-foreground">
            {operation.steps.map((step, index) => (
              <li key={`${step}-${index}`}>{step}</li>
            ))}
          </ol>
          {operation.error ? (
            <div className="space-y-2 rounded-md border border-destructive/30 bg-background p-3 text-xs text-destructive">
              <p>{summarizeAIPdfError(operation.error)}</p>
              <details className="text-muted-foreground">
                <summary className="cursor-pointer text-foreground">
                  Technical details
                </summary>
                <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap">
                  {safeTechnicalDetail(operation.error)}
                </pre>
              </details>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="space-y-3 rounded-md border bg-muted/20 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium">Uploaded PDF sources</p>
            <p className="text-xs text-muted-foreground">
              Private import-level files stored in ai-import-sources. Use a
              source for extraction, open it with a short-lived URL, or delete
              the private source PDF when it is no longer needed.
            </p>
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
                      <p className="text-xs text-muted-foreground">
                        {formatFileSize(source.sizeBytes)}
                        {source.pageCount ? ` | ${source.pageCount} pages` : ""}
                        {source.createdAt
                          ? ` | ${new Date(source.createdAt).toLocaleString()}`
                          : ""}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs">
                    <Badge variant="secondary">
                      source: {source.assetStatus ?? "-"}
                    </Badge>
                    <Badge
                      variant={
                        source.status === "failed" ? "outline" : "secondary"
                      }
                    >
                      batch: {source.status}
                    </Badge>
                    {source.status === "imported" ? (
                      <Badge variant="outline">questions kept after delete</Badge>
                    ) : null}
                    {(source.createdQuestionCount ?? 0) > 0 ? (
                      <Badge variant="outline">
                        generated drafts: {source.createdQuestionCount}
                      </Badge>
                    ) : null}
                  </div>
                  {!extractable && resettable ? (
                    <p className="text-xs text-muted-foreground">
                      Reset generated drafts before extracting this PDF again.
                    </p>
                  ) : null}
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant={isSelected ? "default" : "outline"}
                      disabled={!extractable || extracting}
                      onClick={() => setSelectedBatchId(source.batchId)}
                    >
                      {isSelected ? "Selected" : "Use for extraction"}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
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
                      Reset generated drafts
                    </Button>
                    <Button
                      type="button"
                      size="sm"
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
                      Open PDF
                    </Button>
                    <Button
                      type="button"
                      size="sm"
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
                      Delete
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            No uploaded AI PDF sources yet.
          </p>
        )}
        <div className="rounded-md border bg-background/70 p-3 text-xs text-muted-foreground">
          <p className="font-medium text-foreground">File binding model</p>
          <p>
            Source PDFs are private import-level assets:
            import_batch_assets.source_pdf -&gt; import_batches.id. They are not
            bound to any question before extraction.
          </p>
          <p>
            After AI extraction creates draft questions, only confirmed image
            crops are uploaded as question_assets and bound to questions.id for
            preview, delete, and detail-page display.
          </p>
        </div>
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void startExtraction(new FormData(event.currentTarget));
        }}
        className="space-y-4 rounded-md border bg-muted/20 p-4"
      >
        <div className="grid gap-4 md:grid-cols-[1fr_1fr_auto]">
          <div className="space-y-2">
            <label htmlFor="source_batch_id" className="text-sm font-medium">
              PDF source
            </label>
            <select
              id="source_batch_id"
              value={selectedSource?.batchId ?? ""}
              onChange={(event) => setSelectedBatchId(event.target.value)}
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
            <label htmlFor="provider_profile_id" className="text-sm font-medium">
              Step 2: Start AI extraction
            </label>
            <select
              id="provider_profile_id"
              name="provider_profile_id"
              defaultValue={defaultProviderOption?.profile.id}
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
            {providerOptions.length && !extractableProviderOptions.length ? (
              <p className="text-xs text-destructive">
                {providerOptions[0]?.support.reason ??
                  "No enabled provider supports PDF/image extraction."}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                DeepSeek text/json providers are blocked from PDF extraction
                unless explicitly configured for page images. Gemini
                OpenAI-compatible providers use page images, not full PDF file
                input. Gemini Native providers can use full PDF input when
                native/full PDF is enabled.
              </p>
            )}
          </div>
          <div className="flex items-end">
            <Button
              type="submit"
              disabled={
                !selectedSource || !extractableProviderOptions.length || extracting
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
          <div className="rounded-md border bg-background px-3 py-2 text-xs text-muted-foreground">
            Source batch: <span className="font-mono">{selectedSource.batchId}</span>
            {" | "}
            File: {selectedSource.fileName}
            {selectedSource.pageCount ? ` | Pages: ${selectedSource.pageCount}` : ""}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            Upload a PDF source before starting AI extraction.
          </p>
        )}
        {extracting ? (
          <ThinkingIndicator detail={activeDetail} phase={activePhase} />
        ) : null}
        {!extractableProviderOptions.length ? (
          <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            PDF upload is available. AI extraction is waiting for a super admin
            to configure an enabled provider that supports page-image or native
            PDF extraction.
          </p>
        ) : null}
      </form>
    </div>
  );
}
