"use client";

import { FileUp, LoaderCircle, Upload } from "lucide-react";
import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import {
  finalizeQuestionAssetUpload,
  reserveQuestionAssetUpload,
} from "@/app/admin/questions/asset-actions";
import {
  finalizeQuestionSourceFileUpload,
  reserveQuestionSourceFileUpload,
} from "@/app/admin/questions/source-file-actions";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  BULK_ASSET_IMAGE_MIME_TYPES,
  BULK_ASSET_PDF_MIME_TYPE,
  classifyBulkAssetFile,
  type BulkAssetFileClassification,
  type BulkAssetQuestionMatch,
} from "@/lib/bulk-asset-import/matching";
import { QUESTION_ASSETS_BUCKET } from "@/lib/question-assets";
import { QUESTION_SOURCE_FILES_BUCKET } from "@/lib/question-source-files";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

type UploadState = "failed" | "idle" | "skipped" | "uploaded" | "uploading";

type BulkAssetPreviewRow = {
  classification: BulkAssetFileClassification;
  file: File;
  id: string;
  message?: string;
  uploadState: UploadState;
};

type BulkAssetSummary = {
  affectedCodes: string[];
  ambiguousFiles: number;
  failedUploads: number;
  skippedInvalidFiles: number;
  unmatchedFiles: number;
  uploadedImageAssets: number;
  uploadedPdfSourceFiles: number;
};

type BulkAssetUploadPanelProps = {
  draftQuestions: BulkAssetQuestionMatch[];
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Upload failed.";
}

function badgeVariant(status: BulkAssetFileClassification["status"]) {
  if (status === "matched") {
    return "secondary";
  }

  return "outline";
}

function classifyRows(files: File[], questions: BulkAssetQuestionMatch[]) {
  return files.map((file, index) => ({
    classification: classifyBulkAssetFile({
      fileName: file.name,
      mimeType: file.type,
      questions,
      sizeBytes: file.size,
    }),
    file,
    id: `${file.name}-${file.lastModified}-${file.size}-${index}`,
    uploadState: "idle" as const,
  }));
}

export function BulkAssetUploadPanel({
  draftQuestions,
}: BulkAssetUploadPanelProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<BulkAssetPreviewRow[]>([]);
  const [uploading, setUploading] = useState(false);
  const [summary, setSummary] = useState<BulkAssetSummary | null>(null);

  const matchedCount = rows.filter(
    (row) => row.classification.status === "matched",
  ).length;
  const previewCounts = useMemo(
    () => ({
      ambiguous: rows.filter((row) => row.classification.status === "ambiguous")
        .length,
      invalid: rows.filter((row) => row.classification.status === "invalid")
        .length,
      matched: matchedCount,
      unmatched: rows.filter((row) => row.classification.status === "unmatched")
        .length,
    }),
    [matchedCount, rows],
  );

  function handleFileSelection(files: FileList | null) {
    if (!files?.length) {
      return;
    }

    setRows(classifyRows(Array.from(files), draftQuestions));
    setSummary(null);

    if (inputRef.current) {
      inputRef.current.value = "";
    }
  }

  function updateRow(id: string, patch: Partial<BulkAssetPreviewRow>) {
    setRows((current) =>
      current.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    );
  }

  async function uploadMatchedRows() {
    if (!matchedCount) {
      return;
    }

    const supabase = createClient();
    const nextSummary: BulkAssetSummary = {
      affectedCodes: [],
      ambiguousFiles: previewCounts.ambiguous,
      failedUploads: 0,
      skippedInvalidFiles: previewCounts.invalid,
      unmatchedFiles: previewCounts.unmatched,
      uploadedImageAssets: 0,
      uploadedPdfSourceFiles: 0,
    };
    const affectedCodes = new Set<string>();

    setUploading(true);

    try {
      for (const row of rows) {
        const { classification, file } = row;

        if (
          classification.status !== "matched" ||
          !classification.matchedQuestion ||
          !classification.fileKind ||
          !classification.mimeType
        ) {
          updateRow(row.id, { uploadState: "skipped" });
          continue;
        }

        updateRow(row.id, { message: undefined, uploadState: "uploading" });

        try {
          if (classification.fileKind === "image") {
            const reservation = await reserveQuestionAssetUpload({
              questionId: classification.matchedQuestion.id,
              originalFilename: file.name,
              mimeType: classification.mimeType,
              sizeBytes: file.size,
            });
            const { error } = await supabase.storage
              .from(QUESTION_ASSETS_BUCKET)
              .uploadToSignedUrl(
                reservation.objectPath,
                reservation.token,
                file,
                { contentType: classification.mimeType },
              );

            if (error) {
              throw new Error(error.message);
            }

            await finalizeQuestionAssetUpload({ assetId: reservation.assetId });
            nextSummary.uploadedImageAssets += 1;
          } else {
            const reservation = await reserveQuestionSourceFileUpload({
              questionId: classification.matchedQuestion.id,
              originalFilename: file.name,
              mimeType: classification.mimeType,
              sizeBytes: file.size,
            });
            const { error } = await supabase.storage
              .from(QUESTION_SOURCE_FILES_BUCKET)
              .uploadToSignedUrl(
                reservation.objectPath,
                reservation.token,
                file,
                { contentType: classification.mimeType },
              );

            if (error) {
              throw new Error(error.message);
            }

            await finalizeQuestionSourceFileUpload({
              sourceFileId: reservation.sourceFileId,
            });
            nextSummary.uploadedPdfSourceFiles += 1;
          }

          affectedCodes.add(classification.matchedQuestion.questionCode);
          updateRow(row.id, { message: "Uploaded and bound.", uploadState: "uploaded" });
        } catch (error) {
          nextSummary.failedUploads += 1;
          updateRow(row.id, {
            message: errorMessage(error),
            uploadState: "failed",
          });
        }
      }

      nextSummary.affectedCodes = [...affectedCodes];
      setSummary(nextSummary);

      if (nextSummary.failedUploads) {
        toast.error("Bulk asset upload completed with errors.");
      } else {
        toast.success("Bulk asset upload completed.");
      }
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="space-y-3 rounded-md border bg-muted/20 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="max-w-3xl space-y-1">
            <p className="text-sm font-medium">Upload image and PDF files</p>
            <p className="text-xs text-muted-foreground">
              Files are matched to draft questions by question-code filename
              prefix, then uploaded only after confirmation. Examples:
              Q1001_diagram.png -&gt; Q1001, Q1002_source.pdf -&gt; Q1002.
            </p>
            <p className="text-xs text-muted-foreground">
              Image assets are hidden from public detail pages by default.
              Source PDFs remain admin-only through signed URLs.
            </p>
          </div>
          <label
            role="button"
            tabIndex={uploading ? -1 : 0}
            aria-disabled={uploading}
            className={cn(
              buttonVariants({ variant: "outline" }),
              uploading ? "pointer-events-none opacity-50" : "cursor-pointer",
            )}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                inputRef.current?.click();
              }
            }}
          >
            <FileUp className="size-4" />
            Select files
            <input
              ref={inputRef}
              type="file"
              accept={[...BULK_ASSET_IMAGE_MIME_TYPES, BULK_ASSET_PDF_MIME_TYPE].join(
                ",",
              )}
              multiple
              disabled={uploading}
              className="sr-only"
              onChange={(event) => handleFileSelection(event.target.files)}
            />
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary">Matched: {previewCounts.matched}</Badge>
          <Badge variant="outline">Unmatched: {previewCounts.unmatched}</Badge>
          <Badge variant="outline">Ambiguous: {previewCounts.ambiguous}</Badge>
          <Badge variant="outline">Invalid: {previewCounts.invalid}</Badge>
          <Badge variant="outline">Draft questions: {draftQuestions.length}</Badge>
        </div>
      </div>

      {rows.length ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-medium">Preview before upload</p>
              <p className="text-xs text-muted-foreground">
                Unmatched, ambiguous, and invalid files are skipped.
              </p>
            </div>
            <Button
              type="button"
              disabled={!matchedCount || uploading}
              onClick={() => void uploadMatchedRows()}
            >
              {uploading ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <Upload className="size-4" />
              )}
              {uploading ? "Uploading..." : "Confirm upload/import"}
            </Button>
          </div>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>File</TableHead>
                  <TableHead>Detected type</TableHead>
                  <TableHead>Matched question</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      <p className="max-w-72 truncate font-medium" title={row.file.name}>
                        {row.file.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {(row.file.size / 1024).toFixed(1)} KB
                      </p>
                    </TableCell>
                    <TableCell>
                      {row.classification.fileKind === "image"
                        ? "Image"
                        : row.classification.fileKind === "pdf"
                          ? "PDF"
                          : "Unsupported"}
                    </TableCell>
                    <TableCell>
                      {row.classification.matchedQuestion ? (
                        <div>
                          <p className="font-mono text-xs">
                            {row.classification.matchedQuestion.questionCode}
                          </p>
                          <p className="max-w-64 truncate text-xs text-muted-foreground">
                            {row.classification.matchedQuestion.title}
                          </p>
                        </div>
                      ) : row.classification.matchedQuestions.length ? (
                        <div className="space-y-1">
                          {row.classification.matchedQuestions.map((question) => (
                            <Badge key={question.id} variant="outline">
                              {question.questionCode}
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          No match
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={badgeVariant(row.classification.status)}>
                        {row.classification.actionLabel}
                      </Badge>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {row.message ?? row.classification.message}
                      </p>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          row.uploadState === "uploaded" ? "secondary" : "outline"
                        }
                      >
                        {row.uploadState}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      ) : (
        <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
          Select files to preview filename matches before upload.
        </div>
      )}

      {summary ? (
        <div className="space-y-3 rounded-md border bg-muted/20 p-4">
          <div>
            <p className="font-medium">Bulk asset upload completed</p>
            <p className="text-xs text-muted-foreground">
              Created rows use the existing question_assets and
              question_source_files RLS policies.
            </p>
          </div>
          <div className="grid gap-2 text-sm md:grid-cols-3">
            <p>Uploaded image assets: {summary.uploadedImageAssets}</p>
            <p>Uploaded PDF source files: {summary.uploadedPdfSourceFiles}</p>
            <p>Skipped invalid files: {summary.skippedInvalidFiles}</p>
            <p>Unmatched files: {summary.unmatchedFiles}</p>
            <p>Ambiguous files: {summary.ambiguousFiles}</p>
            <p>Failed uploads: {summary.failedUploads}</p>
          </div>
          {summary.affectedCodes.length ? (
            <div className="flex flex-wrap gap-2">
              {summary.affectedCodes.map((code) => (
                <Badge key={code} variant="secondary">
                  {code}
                </Badge>
              ))}
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm" variant="outline">
              <Link href="/admin/review">Review drafts</Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/admin/questions?status=draft">Admin Questions</Link>
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
