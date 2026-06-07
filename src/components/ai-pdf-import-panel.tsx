"use client";

import {
  ExternalLink,
  FileText,
  LoaderCircle,
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
  createAIPdfSourceSignedUrl,
  deleteAIPdfSource,
  startAIPdfExtraction,
  uploadAIPdfSource,
} from "@/app/admin/imports/pdf/actions";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import type { SafeAIProviderProfile } from "@/lib/ai-providers/profiles";
import { cn } from "@/lib/utils";

type AIPdfSourceOption = {
  batchId: string;
  createdAt?: string;
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
      status: string;
      summary?: any;
    }
  | null;

type SourceUploadResult =
  | {
      batchId: string;
      sourceAsset?: {
        id?: string;
        object_path?: string;
        original_filename?: string;
        size_bytes?: number;
        status?: string;
      };
      status: string;
      summary?: any;
    }
  | null;

type AIPdfImportPanelProps = {
  providers: SafeAIProviderProfile[];
  sources?: AIPdfSourceOption[];
};

function warningList(summary: any) {
  const warnings = summary?.aiPdfImport?.warnings;

  return Array.isArray(warnings) ? warnings.filter(Boolean) : [];
}

function canExtractSource(source: AIPdfSourceOption) {
  return source.assetStatus === "ready" && source.status !== "imported";
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

  const ai = result.summary?.aiPdfImport ?? {};

  return {
    batchId: result.batchId,
    assetStatus: result.sourceAsset?.status,
    canDelete: result.status !== "imported",
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

export function AIPdfImportPanel({
  providers,
  sources = [],
}: AIPdfImportPanelProps) {
  const fileInputId = useId();
  const uploadFormRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [openingSourceId, setOpeningSourceId] = useState("");
  const [deletingSourceId, setDeletingSourceId] = useState("");
  const [removedSourceIds, setRemovedSourceIds] = useState<string[]>([]);
  const [uploadResult, setUploadResult] = useState<SourceUploadResult>(null);
  const [selectedBatchId, setSelectedBatchId] = useState(
    sources.find(canExtractSource)?.batchId ?? "",
  );
  const [result, setResult] = useState<ImportResult>(null);

  const enabledProviders = providers.filter((provider) => provider.enabled);
  const defaultProvider =
    enabledProviders.find((provider) => provider.is_default) ??
    enabledProviders[0];
  const uploadedSource = sourceFromUpload(uploadResult);
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

    if (
      uploadedSource &&
      (!uploadedSource.sourceAssetId ||
        !removedSourceIds.includes(uploadedSource.sourceAssetId))
    ) {
      byBatchId.set(uploadedSource.batchId, uploadedSource);
    }

    return Array.from(byBatchId.values());
  }, [sources, uploadedSource, removedSourceIds]);
  const extractableSources = sourceChoices.filter(canExtractSource);
  const selectedSource =
    extractableSources.find((source) => source.batchId === selectedBatchId) ??
    extractableSources[0] ??
    null;
  const summary = result?.summary;
  const warnings = warningList(summary);

  async function uploadSource(formData: FormData) {
    setUploading(true);
    setResult(null);

    try {
      const nextResult = await uploadAIPdfSource(formData);
      const nextSource = sourceFromUpload(nextResult);

      setUploadResult(nextResult);

      if (nextSource) {
        setSelectedBatchId(nextSource.batchId);
      }

      uploadFormRef.current?.reset();
      toast.success("PDF source uploaded.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "PDF source upload failed.";
      toast.error(message);
    } finally {
      setUploading(false);

      if (inputRef.current) {
        inputRef.current.value = "";
      }
    }
  }

  function uploadFile(file: File | null | undefined) {
    if (!file) {
      return;
    }

    const formData = new FormData();
    formData.set("pdf_file", file);
    void uploadSource(formData);
  }

  function uploadSelectedFile(event: ChangeEvent<HTMLInputElement>) {
    if (!event.currentTarget.files?.length) {
      return;
    }

    uploadFile(event.currentTarget.files[0]);
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
        `Delete ${source.fileName}? This removes the private PDF source file from import storage.`,
      )
    ) {
      return;
    }

    setDeletingSourceId(source.sourceAssetId);

    try {
      await deleteAIPdfSource({
        assetId: source.sourceAssetId,
        batchId: source.batchId,
      });

      setRemovedSourceIds((current) => [...current, source.sourceAssetId!]);
      setUploadResult((current) =>
        current?.batchId === source.batchId ? null : current,
      );

      if (selectedBatchId === source.batchId) {
        const nextSource = extractableSources.find(
          (candidate) => candidate.batchId !== source.batchId,
        );
        setSelectedBatchId(nextSource?.batchId ?? "");
      }

      toast.success("PDF source deleted.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not delete PDF source.";
      toast.error(message);
    } finally {
      setDeletingSourceId("");
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

    setExtracting(true);
    setResult(null);

    try {
      const nextResult = await startAIPdfExtraction({
        batchId,
        providerProfileId,
      });
      setResult(nextResult);

      if (nextResult.status === "failed") {
        toast.error(nextResult.error ?? "AI PDF import failed.");
      } else {
        toast.success("AI PDF import completed.");
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "AI PDF import failed.";
      setResult({
        batchId,
        error: message,
        status: "failed",
      });
      toast.error(message);
    } finally {
      setExtracting(false);
    }
  }

  return (
    <div className="space-y-5">
      <form
        ref={uploadFormRef}
        onSubmit={(event) => event.preventDefault()}
        className="space-y-3 rounded-md border bg-muted/20 p-3"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-medium">Step 1: Upload PDF source</p>
            <p className="text-xs text-muted-foreground">
              Upload one private PDF source. It is stored as an import-level
              asset and is not attached to a question until AI extraction runs.
            </p>
          </div>
          <label
            htmlFor={fileInputId}
            role="button"
            tabIndex={uploading ? -1 : 0}
            aria-disabled={uploading}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                inputRef.current?.click();
              }
            }}
            className={cn(
              buttonVariants({ variant: "outline", size: "sm" }),
              uploading ? "pointer-events-none opacity-50" : "cursor-pointer",
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
            disabled={uploading}
            className="sr-only"
            onChange={uploadSelectedFile}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Upload is available even when no AI provider is configured. Limits: 50
          pages / 50MB.
        </p>
      </form>

      <div className="space-y-3 rounded-md border bg-muted/20 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium">Uploaded PDF sources</p>
            <p className="text-xs text-muted-foreground">
              Private import-level files stored in ai-import-sources. Use a
              source for extraction, open it with a short-lived URL, or delete
              it before it creates draft questions.
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
                    {!source.canDelete ? (
                      <Badge variant="outline">locked after import</Badge>
                    ) : null}
                  </div>
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
                      disabled={!source.canDelete || deletingSourceId === sourceId}
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
      </div>

      <form
        action={startExtraction}
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
                <option value="">Upload a PDF source first</option>
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
              defaultValue={defaultProvider?.id}
              disabled={!enabledProviders.length || extracting}
              required
              className="h-10 w-full rounded-md border bg-background px-3 text-sm"
            >
              {!enabledProviders.length ? (
                <option value="">No enabled provider</option>
              ) : null}
              {enabledProviders.map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {provider.name} / {provider.model}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <Button
              type="submit"
              disabled={
                !selectedSource || !enabledProviders.length || extracting
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
        {!enabledProviders.length ? (
          <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            PDF upload is available. AI extraction is waiting for a super admin
            to configure an enabled provider with an API key.
          </p>
        ) : null}
      </form>

      {result ? (
        <div className="space-y-3 rounded-md border p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-medium">Latest AI PDF extraction</p>
              <p className="font-mono text-xs text-muted-foreground">
                {result.batchId || "No batch selected"}
              </p>
            </div>
            <Badge variant={result.status === "failed" ? "outline" : "secondary"}>
              {result.status}
            </Badge>
          </div>
          {result.error ? (
            <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {result.error}
            </p>
          ) : null}
          {summary?.aiPdfImport ? (
            <div className="grid gap-2 text-sm md:grid-cols-3">
              <p>Created questions: {summary.aiPdfImport.createdQuestionCount ?? 0}</p>
              <p>Uploaded crops: {summary.aiPdfImport.uploadedCropCount ?? 0}</p>
              <p>Pages: {summary.aiPdfImport.pageCount ?? "-"}</p>
              <p>Provider: {summary.aiPdfImport.provider?.name ?? "-"}</p>
              <p>Model: {summary.aiPdfImport.provider?.model ?? "-"}</p>
              <p>Warnings: {warnings.length}</p>
            </div>
          ) : null}
          {warnings.length ? (
            <div className="space-y-1 rounded-md border bg-muted/20 p-3 text-xs text-muted-foreground">
              {warnings.map((warning: string) => (
                <p key={warning}>{warning}</p>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
