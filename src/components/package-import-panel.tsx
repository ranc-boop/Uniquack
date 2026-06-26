"use client";

import { FileArchive, LoaderCircle, Upload } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";
import { toast } from "sonner";

import {
  importPackageDraftQuestions,
  previewPackageImportQuestions,
} from "@/app/admin/imports/package/actions";
import {
  finalizeQuestionAssetUpload,
  reserveQuestionAssetUpload,
} from "@/app/admin/questions/asset-actions";
import {
  finalizeQuestionSourceFileUpload,
  reserveQuestionSourceFileUpload,
} from "@/app/admin/questions/source-file-actions";
import { AdminEmptyState } from "@/components/admin/admin-empty-state";
import { AdminInfoTip } from "@/components/admin/admin-info-tip";
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
import type { BatchImportPreview } from "@/lib/batch-import/json";
import {
  inferBulkAssetMimeType,
  type BulkAssetFileKind,
} from "@/lib/bulk-asset-import/matching";
import {
  normalizePackagePath,
  parsePackageQuestionsJson,
  planPackageImport,
  type PackageAssetPlan,
  type PackagePlan,
} from "@/lib/package-import/package";
import { readZipEntries, type ZipEntryData, zipEntryText } from "@/lib/package-import/zip";
import { QUESTION_ASSETS_BUCKET } from "@/lib/question-assets";
import { QUESTION_SOURCE_FILES_BUCKET } from "@/lib/question-source-files";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

type PackagePreviewState = {
  entriesByPath: Map<string, ZipEntryData>;
  fileName: string;
  plan: PackagePlan;
  questionPreview: BatchImportPreview | null;
};

type PackageImportSummary = {
  ambiguousFiles: number;
  createdDraftQuestions: number;
  duplicateAssetsSkipped: number;
  failedUploads: number;
  missingReferencedFiles: number;
  skippedDuplicateQuestions: number;
  skippedInvalidFiles: number;
  uploadedImageAssets: number;
  uploadedPdfSourceFiles: number;
  unusedFiles: number;
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Package import failed.";
}

function basename(path: string) {
  return path.split("/").filter(Boolean).at(-1) ?? path;
}

function fileBlobPart(data: Uint8Array) {
  const copy = new Uint8Array(data.byteLength);

  copy.set(data);
  return copy.buffer as ArrayBuffer;
}

function badgeVariant(status: PackageAssetPlan["status"]) {
  if (status === "matched") {
    return "secondary";
  }

  return "outline";
}

function isZipFile(file: File) {
  return (
    file.name.toLowerCase().endsWith(".zip") ||
    file.type === "application/zip" ||
    file.type === "application/x-zip-compressed"
  );
}

function assetPlanUploadable(plan: PackageAssetPlan) {
  return plan.status === "matched" && Boolean(plan.questionCode) && plan.fileKind;
}

export function PackageImportPanel() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [importing, setImporting] = useState(false);
  const [previewState, setPreviewState] = useState<PackagePreviewState | null>(
    null,
  );
  const [fatalError, setFatalError] = useState("");
  const [summary, setSummary] = useState<PackageImportSummary | null>(null);

  async function previewPackage(file: File) {
    setLoadingPreview(true);
    setFatalError("");
    setPreviewState(null);
    setSummary(null);

    try {
      if (!isZipFile(file)) {
        throw new Error("Only one .zip package can be uploaded.");
      }

      const entries = await readZipEntries(await file.arrayBuffer());
      const entriesByPath = new Map(
        entries.map((entry) => [normalizePackagePath(entry.path), entry]),
      );
      const questionEntry = entriesByPath.get("questions.json") ?? null;
      const questionJsonText = questionEntry ? zipEntryText(questionEntry) : null;

      if (!questionJsonText) {
        const plan = planPackageImport({
          entries,
          questionJsonText: null,
          rawQuestions: [],
        });
        setPreviewState({
          entriesByPath,
          fileName: file.name,
          plan,
          questionPreview: null,
        });
        return;
      }

      let rawQuestions: unknown[] = [];

      try {
        rawQuestions = parsePackageQuestionsJson(questionJsonText);
      } catch (error) {
        throw new Error(`Invalid questions.json: ${errorMessage(error)}`);
      }

      const [plan, questionPreview] = await Promise.all([
        Promise.resolve(
          planPackageImport({
            entries,
            questionJsonText,
            rawQuestions,
          }),
        ),
        previewPackageImportQuestions({ jsonText: questionJsonText }),
      ]);

      setPreviewState({
        entriesByPath,
        fileName: file.name,
        plan,
        questionPreview,
      });
    } catch (error) {
      setFatalError(errorMessage(error));
    } finally {
      setLoadingPreview(false);

      if (inputRef.current) {
        inputRef.current.value = "";
      }
    }
  }

  async function uploadPackageAsset({
    entry,
    fileKind,
    questionId,
  }: {
    entry: ZipEntryData;
    fileKind: BulkAssetFileKind;
    questionId: string;
  }) {
    const mimeType = inferBulkAssetMimeType(entry.path);

    if (!mimeType) {
      throw new Error("Unsupported file type.");
    }

    const fileName = basename(normalizePackagePath(entry.path));
    const uploadFile = new File([fileBlobPart(entry.data)], fileName, {
      type: mimeType,
    });
    const supabase = createClient();

    if (fileKind === "image") {
      const reservation = await reserveQuestionAssetUpload({
        questionId,
        originalFilename: fileName,
        mimeType,
        sizeBytes: uploadFile.size,
      });
      const { error } = await supabase.storage
        .from(QUESTION_ASSETS_BUCKET)
        .uploadToSignedUrl(reservation.objectPath, reservation.token, uploadFile, {
          contentType: mimeType,
        });

      if (error) {
        throw new Error(error.message);
      }

      await finalizeQuestionAssetUpload({ assetId: reservation.assetId });
      return "image" as const;
    }

    const reservation = await reserveQuestionSourceFileUpload({
      questionId,
      originalFilename: fileName,
      mimeType,
      sizeBytes: uploadFile.size,
    });
    const { error } = await supabase.storage
      .from(QUESTION_SOURCE_FILES_BUCKET)
      .uploadToSignedUrl(reservation.objectPath, reservation.token, uploadFile, {
        contentType: mimeType,
      });

    if (error) {
      throw new Error(error.message);
    }

    await finalizeQuestionSourceFileUpload({
      sourceFileId: reservation.sourceFileId,
    });
    return "pdf" as const;
  }

  async function confirmPackageImport() {
    if (!previewState?.plan.questionJsonText) {
      return;
    }

    setImporting(true);
    setSummary(null);

    try {
      const importSummary = await importPackageDraftQuestions({
        jsonText: previewState.plan.questionJsonText,
      });
      const createdByCode = new Map(
        importSummary.createdQuestions.map((question) => [
          question.questionCode.toLowerCase(),
          question.id,
        ]),
      );
      const nextSummary: PackageImportSummary = {
        ambiguousFiles: 0,
        createdDraftQuestions: importSummary.createdCount,
        duplicateAssetsSkipped: previewState.plan.counts.duplicateAssets,
        failedUploads: 0,
        missingReferencedFiles: previewState.plan.counts.missingReferencedFiles,
        skippedDuplicateQuestions: importSummary.duplicateCount,
        skippedInvalidFiles: previewState.plan.counts.invalidFiles,
        uploadedImageAssets: 0,
        uploadedPdfSourceFiles: 0,
        unusedFiles: previewState.plan.counts.unusedFiles,
      };

      for (const plan of previewState.plan.assetPlans) {
        if (!assetPlanUploadable(plan) || !plan.questionCode || !plan.fileKind) {
          continue;
        }

        const questionId = createdByCode.get(plan.questionCode.toLowerCase());

        if (!questionId) {
          continue;
        }

        const entry = previewState.entriesByPath.get(plan.path);

        if (!entry) {
          continue;
        }

        try {
          const uploadedKind = await uploadPackageAsset({
            entry,
            fileKind: plan.fileKind,
            questionId,
          });

          if (uploadedKind === "image") {
            nextSummary.uploadedImageAssets += 1;
          } else {
            nextSummary.uploadedPdfSourceFiles += 1;
          }
        } catch {
          nextSummary.failedUploads += 1;
        }
      }

      setSummary(nextSummary);
      toast.success("Package import completed.");
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setImporting(false);
    }
  }

  const canConfirm = Boolean(
    previewState?.plan.questionJsonText &&
      !previewState.plan.errors.length &&
      previewState.questionPreview?.validCount,
  );

  return (
    <div className="space-y-5">
      <div className="space-y-3 rounded-md border bg-muted/20 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="max-w-3xl space-y-1">
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium">Select package for preview</p>
              <AdminInfoTip label="Package preview details">
                Required: questions.json. Optional: images/* and pdfs/*. Asset
                files must be referenced explicitly by image_files and
                source_files in questions.json.
              </AdminInfoTip>
            </div>
            <p className="text-xs text-muted-foreground">Validate before import.</p>
          </div>
          <label
            role="button"
            tabIndex={loadingPreview || importing ? -1 : 0}
            aria-disabled={loadingPreview || importing}
            className={cn(
              buttonVariants({ variant: "outline" }),
              loadingPreview || importing
                ? "pointer-events-none opacity-50"
                : "cursor-pointer",
            )}
          >
            {loadingPreview ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <FileArchive className="size-4" />
            )}
            {loadingPreview ? "Reading..." : "Select ZIP"}
            <input
              ref={inputRef}
              type="file"
              accept=".zip,application/zip,application/x-zip-compressed"
              disabled={loadingPreview || importing}
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];

                if (file) {
                  void previewPackage(file);
                }
              }}
            />
          </label>
        </div>
      </div>

      {fatalError ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {fatalError}
        </p>
      ) : null}

      {previewState ? (
        <div className="space-y-4">
          <div className="rounded-md border p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-medium">Package preview</p>
                <p className="text-xs text-muted-foreground">
                  {previewState.fileName}
                </p>
              </div>
              <Button
                type="button"
                disabled={!canConfirm || importing}
                onClick={() => void confirmPackageImport()}
              >
                {importing ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : (
                  <Upload className="size-4" />
                )}
                {importing ? "Importing..." : "Confirm package import"}
              </Button>
            </div>

            {previewState.plan.errors.length ? (
              <div className="mt-3 space-y-1 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                {previewState.plan.errors.map((error) => (
                  <p key={error}>{error}</p>
                ))}
              </div>
            ) : null}

            <div className="mt-4 grid gap-2 text-sm md:grid-cols-4">
              <p>Total questions: {previewState.plan.questions.length}</p>
              <p>Valid questions: {previewState.questionPreview?.validCount ?? 0}</p>
              <p>
                Invalid questions: {previewState.questionPreview?.invalidCount ?? 0}
              </p>
              <p>
                Duplicate question codes:{" "}
                {previewState.questionPreview?.duplicateCount ?? 0}
              </p>
              <p>Unknown tags: {previewState.questionPreview?.unknownTagCount ?? 0}</p>
              <p>Image files found: {previewState.plan.counts.imageFiles}</p>
              <p>PDF files found: {previewState.plan.counts.pdfFiles}</p>
              <p>Matched images: {previewState.plan.counts.matchedImages}</p>
              <p>Matched PDFs: {previewState.plan.counts.matchedPdfs}</p>
              <p>Missing refs: {previewState.plan.counts.missingReferencedFiles}</p>
              <p>Unused files: {previewState.plan.counts.unusedFiles}</p>
              <p>Invalid files: {previewState.plan.counts.invalidFiles}</p>
              <p>Duplicate files: {previewState.plan.counts.duplicateAssets}</p>
            </div>
          </div>

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Question</TableHead>
                  <TableHead>Tags</TableHead>
                  <TableHead>Content</TableHead>
                  <TableHead>Assets</TableHead>
                  <TableHead>Warnings</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {previewState.plan.questions.map((question, index) => {
                  const previewItem = previewState.questionPreview?.items[index];
                  const messages = [
                    ...(previewItem?.errors ?? []),
                    ...(previewItem?.warnings ?? []),
                  ];

                  return (
                    <TableRow key={`${question.code}-${index}`}>
                      <TableCell>
                        <p className="font-mono text-xs">{question.code || "No code"}</p>
                        <p className="max-w-64 truncate text-xs text-muted-foreground">
                          {question.title || "No title"}
                        </p>
                      </TableCell>
                      <TableCell className="text-xs">
                        {question.tagIds.join(", ") || "No tags"}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          <Badge
                            variant={
                              question.contentHtmlPresent ? "secondary" : "outline"
                            }
                          >
                            {question.contentHtmlPresent
                              ? "Has content"
                              : "Missing content"}
                          </Badge>
                          <Badge
                            variant={
                              question.solutionHtmlPresent ? "secondary" : "outline"
                            }
                          >
                            {question.solutionHtmlPresent
                              ? "Has solution"
                              : "Missing solution"}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs">
                        <p>Images: {question.imageFiles.length}</p>
                        <p>PDFs: {question.sourceFiles.length}</p>
                      </TableCell>
                      <TableCell className="max-w-80 text-xs">
                        {messages.length ? messages.join(" | ") : "Ready"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Asset file</TableHead>
                  <TableHead>Question</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Message</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {previewState.plan.assetPlans.map((asset, index) => (
                  <TableRow key={`${asset.path}-${index}`}>
                    <TableCell className="font-mono text-xs">{asset.path}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {asset.questionCode ?? "-"}
                    </TableCell>
                    <TableCell>{asset.fileKind ?? "unknown"}</TableCell>
                    <TableCell>
                      <Badge variant={badgeVariant(asset.status)}>
                        {asset.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {asset.message}
                    </TableCell>
                  </TableRow>
                ))}
                {!previewState.plan.assetPlans.length ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-20 text-center">
                      No image or PDF files in this package.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
        </div>
      ) : (
        <AdminEmptyState
          description="Choose one ZIP package to validate questions.json, preview asset references, and confirm draft import only after review."
          title="No package selected"
        />
      )}

      {summary ? (
        <div className="space-y-3 rounded-md border bg-muted/20 p-4">
          <div>
            <p className="font-medium">Package import completed</p>
            <p className="text-xs text-muted-foreground">
              Draft questions and assets now flow into the existing review queue.
            </p>
          </div>
          <div className="grid gap-2 text-sm md:grid-cols-3">
            <p>Created draft questions: {summary.createdDraftQuestions}</p>
            <p>Skipped duplicate questions: {summary.skippedDuplicateQuestions}</p>
            <p>Uploaded image assets: {summary.uploadedImageAssets}</p>
            <p>Uploaded PDF source files: {summary.uploadedPdfSourceFiles}</p>
            <p>Skipped invalid files: {summary.skippedInvalidFiles}</p>
            <p>Missing referenced files: {summary.missingReferencedFiles}</p>
            <p>Unused files: {summary.unusedFiles}</p>
            <p>Duplicate files skipped: {summary.duplicateAssetsSkipped}</p>
            <p>Failed uploads: {summary.failedUploads}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm" variant="outline">
              <Link href="/admin/review">Review imported drafts</Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/admin/questions?status=draft">Admin Questions</Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/admin/imports">Back to JSON Import</Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/admin/imports/assets">Back to Bulk Asset Upload</Link>
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
