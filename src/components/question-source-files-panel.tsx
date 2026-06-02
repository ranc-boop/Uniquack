"use client";

import {
  ExternalLink,
  FileText,
  LoaderCircle,
  Trash2,
  Upload,
} from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import {
  createQuestionSourceFileSignedUrl,
  deleteQuestionSourceFile,
  ensureQuestionDraftForSourceUpload,
  finalizeQuestionSourceFileUpload,
  reserveQuestionSourceFileUpload,
  type QuestionSourceFileView,
} from "@/app/admin/questions/source-file-actions";
import { Button } from "@/components/ui/button";
import {
  formatFileSize,
  QUESTION_SOURCE_FILE_MAX_BYTES,
  QUESTION_SOURCE_FILE_MIME_TYPE,
  QUESTION_SOURCE_FILES_BUCKET,
} from "@/lib/question-source-files";
import { createClient } from "@/lib/supabase/client";

type QuestionSourceFilesPanelProps = {
  questionId?: string;
  initialSourceFiles?: QuestionSourceFileView[];
  draftInputId?: string;
  questionCodeInputId?: string;
  titleInputId?: string;
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Source file operation failed.";
}

function inputValue(id: string | undefined) {
  if (!id) {
    return "";
  }

  const input = document.getElementById(id);
  return input instanceof HTMLInputElement ? input.value.trim() : "";
}

export function QuestionSourceFilesPanel({
  questionId,
  initialSourceFiles = [],
  draftInputId,
  questionCodeInputId,
  titleInputId,
}: QuestionSourceFilesPanelProps) {
  const [currentQuestionId, setCurrentQuestionId] = useState(questionId ?? "");
  const [sourceFiles, setSourceFiles] = useState(initialSourceFiles);
  const [uploading, setUploading] = useState(false);
  const [openingId, setOpeningId] = useState("");
  const [deletingId, setDeletingId] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  async function ensureQuestionId() {
    if (currentQuestionId) {
      return currentQuestionId;
    }

    const questionCode = inputValue(questionCodeInputId);
    const title = inputValue(titleInputId);

    if (!questionCode || !title) {
      throw new Error("Fill in the question code and title before uploading PDFs.");
    }

    const draftId = inputValue(draftInputId);
    const result = await ensureQuestionDraftForSourceUpload({
      draftId: draftId || undefined,
      questionCode,
      title,
    });

    setCurrentQuestionId(result.questionId);

    if (draftInputId) {
      const draftInput = document.getElementById(draftInputId);

      if (draftInput instanceof HTMLInputElement) {
        draftInput.value = result.questionId;
      }
    }

    toast.success("Draft saved for PDF source uploads.");
    return result.questionId;
  }

  async function uploadFiles(files: FileList | null) {
    if (!files?.length) {
      return;
    }

    setUploading(true);

    try {
      const validFiles = Array.from(files).filter((file) => {
        if (file.type !== QUESTION_SOURCE_FILE_MIME_TYPE) {
          toast.error(`${file.name}: only PDF source files are supported.`);
          return false;
        }

        if (file.size > QUESTION_SOURCE_FILE_MAX_BYTES) {
          toast.error(`${file.name}: PDF exceeds the 20MB limit.`);
          return false;
        }

        return true;
      });

      if (!validFiles.length) {
        return;
      }

      const resolvedQuestionId = await ensureQuestionId();
      const supabase = createClient();

      for (const file of validFiles) {
        try {
          const reservation = await reserveQuestionSourceFileUpload({
            questionId: resolvedQuestionId,
            originalFilename: file.name,
            mimeType: file.type,
            sizeBytes: file.size,
          });
          const { error } = await supabase.storage
            .from(QUESTION_SOURCE_FILES_BUCKET)
            .uploadToSignedUrl(
              reservation.objectPath,
              reservation.token,
              file,
              { contentType: file.type },
            );

          if (error) {
            throw new Error(error.message);
          }

          const uploadedSourceFile = await finalizeQuestionSourceFileUpload({
            sourceFileId: reservation.sourceFileId,
          });

          setSourceFiles((current) => [...current, uploadedSourceFile]);
          toast.success(`${file.name} uploaded.`);
        } catch (error) {
          toast.error(`${file.name}: ${errorMessage(error)}`);
        }
      }
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setUploading(false);

      if (inputRef.current) {
        inputRef.current.value = "";
      }
    }
  }

  async function openSourceFile(sourceFile: QuestionSourceFileView) {
    setOpeningId(sourceFile.id);

    try {
      const result = await createQuestionSourceFileSignedUrl({
        sourceFileId: sourceFile.id,
      });
      window.open(result.signedUrl, "_blank", "noopener,noreferrer");
      toast.success("Signed PDF URL opened.");
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setOpeningId("");
    }
  }

  async function removeSourceFile(sourceFile: QuestionSourceFileView) {
    if (
      !window.confirm(
        `Delete ${sourceFile.originalFilename}? This removes the private PDF source file from storage.`,
      )
    ) {
      return;
    }

    setDeletingId(sourceFile.id);

    try {
      await deleteQuestionSourceFile({ sourceFileId: sourceFile.id });
      setSourceFiles((current) =>
        current.filter((item) => item.id !== sourceFile.id),
      );
      toast.success("Source file deleted.");
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setDeletingId("");
    }
  }

  return (
    <div className="space-y-3 rounded-md border bg-muted/20 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium">Question source files</p>
          <p className="text-xs text-muted-foreground">
            Admin-only PDFs for worksheets, scans, source documents, and future
            AI parsing. They are not shown on public question pages.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
        >
          {uploading ? (
            <LoaderCircle className="size-4 animate-spin" />
          ) : (
            <Upload className="size-4" />
          )}
          {uploading ? "Uploading..." : "Upload PDFs"}
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept={QUESTION_SOURCE_FILE_MIME_TYPE}
          multiple
          className="hidden"
          onChange={(event) => void uploadFiles(event.target.files)}
        />
      </div>

      {sourceFiles.length ? (
        <div className="grid gap-3 md:grid-cols-2">
          {sourceFiles.map((sourceFile) => (
            <div
              key={sourceFile.id}
              className="space-y-2 rounded-md border bg-background p-3"
            >
              <div className="flex items-start gap-2">
                <FileText className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <p
                    className="truncate text-sm font-medium"
                    title={sourceFile.originalFilename}
                  >
                    {sourceFile.originalFilename}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatFileSize(sourceFile.sizeBytes)} - {sourceFile.status}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={openingId === sourceFile.id}
                  onClick={() => void openSourceFile(sourceFile)}
                >
                  {openingId === sourceFile.id ? (
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
                  disabled={deletingId === sourceFile.id}
                  onClick={() => void removeSourceFile(sourceFile)}
                >
                  {deletingId === sourceFile.id ? (
                    <LoaderCircle className="size-4 animate-spin" />
                  ) : (
                    <Trash2 className="size-4" />
                  )}
                  Delete
                </Button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          No uploaded PDF source files yet.
        </p>
      )}
    </div>
  );
}
