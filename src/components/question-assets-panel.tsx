"use client";

import { Copy, Eye, EyeOff, LoaderCircle, Trash2, Upload } from "lucide-react";
import { useId, useRef, useState } from "react";
import { toast } from "sonner";

import {
  deleteQuestionAsset,
  ensureQuestionDraftForUpload,
  finalizeQuestionAssetUpload,
  reserveQuestionAssetUpload,
  updateQuestionAssetDisplay,
} from "@/app/admin/questions/asset-actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  QUESTION_ASSET_MAX_BYTES,
  QUESTION_ASSET_MIME_TYPES,
} from "@/lib/question-assets";
import { createClient } from "@/lib/supabase/client";
import type {
  QuestionAssetView,
  QuestionAssetWorkspaceActions,
} from "@/lib/questions/media-workspace";
import { cn } from "@/lib/utils";

type QuestionAssetsPanelProps = {
  actions?: QuestionAssetWorkspaceActions;
  questionId?: string;
  initialAssets?: QuestionAssetView[];
  draftInputId?: string;
  questionCodeInputId?: string;
  titleInputId?: string;
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Image operation failed.";
}

function inputValue(id: string | undefined) {
  if (!id) {
    return "";
  }

  const input = document.getElementById(id);
  return input instanceof HTMLInputElement ? input.value.trim() : "";
}

export function QuestionAssetsPanel({
  actions,
  questionId,
  initialAssets = [],
  draftInputId,
  questionCodeInputId,
  titleInputId,
}: QuestionAssetsPanelProps) {
  const workspaceActions = actions ?? {
    deleteAsset: deleteQuestionAsset,
    ensureDraft: ensureQuestionDraftForUpload,
    finalizeUpload: finalizeQuestionAssetUpload,
    reserveUpload: reserveQuestionAssetUpload,
    updateDisplay: updateQuestionAssetDisplay,
  };
  const fileInputId = useId();
  const [currentQuestionId, setCurrentQuestionId] = useState(questionId ?? "");
  const [assets, setAssets] = useState(initialAssets);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState("");
  const [updatingDisplayId, setUpdatingDisplayId] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  async function ensureQuestionId() {
    if (currentQuestionId) {
      return currentQuestionId;
    }

    const questionCode = inputValue(questionCodeInputId);
    const title = inputValue(titleInputId);

    if (!questionCode || !title) {
      throw new Error("Fill in the question code and title before uploading images.");
    }

    const draftId = inputValue(draftInputId);
    const result = await workspaceActions.ensureDraft({
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

    toast.success("Draft saved for image uploads.");
    return result.questionId;
  }

  async function uploadFiles(files: FileList | null) {
    if (!files?.length) {
      return;
    }

    setUploading(true);

    try {
      const validFiles = Array.from(files).filter((file) => {
        if (
          !QUESTION_ASSET_MIME_TYPES.includes(
            file.type as (typeof QUESTION_ASSET_MIME_TYPES)[number],
          )
        ) {
          toast.error(`${file.name}: unsupported image type.`);
          return false;
        }

        if (file.size > QUESTION_ASSET_MAX_BYTES) {
          toast.error(`${file.name}: image exceeds the 6MB limit.`);
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
          const reservation = await workspaceActions.reserveUpload({
            questionId: resolvedQuestionId,
            originalFilename: file.name,
            mimeType: file.type,
            sizeBytes: file.size,
          });
          const { error } = await supabase.storage
            .from("question-assets")
            .uploadToSignedUrl(
              reservation.objectPath,
              reservation.token,
              file,
              { contentType: file.type },
            );

          if (error) {
            throw new Error(error.message);
          }

          const uploadedAsset = await workspaceActions.finalizeUpload({
            assetId: reservation.assetId,
          });

          setAssets((current) => [...current, uploadedAsset]);
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

  async function copyUrl(publicUrl: string) {
    try {
      await navigator.clipboard.writeText(publicUrl);
      toast.success("Image URL copied.");
    } catch {
      toast.error("Could not copy the image URL.");
    }
  }

  async function removeAsset(asset: QuestionAssetView) {
    if (
      !window.confirm(
        `Delete ${asset.originalFilename}? Any copied URL will stop working.`,
      )
    ) {
      return;
    }

    setDeletingId(asset.id);

    try {
      await workspaceActions.deleteAsset({ assetId: asset.id });
      setAssets((current) => current.filter((item) => item.id !== asset.id));
      toast.success("Image deleted.");
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setDeletingId("");
    }
  }

  async function toggleDisplay(asset: QuestionAssetView) {
    setUpdatingDisplayId(asset.id);

    try {
      const result = await workspaceActions.updateDisplay({
        assetId: asset.id,
        displayOnDetail: !asset.displayOnDetail,
      });

      setAssets((current) =>
        current.map((item) =>
          item.id === result.assetId
            ? { ...item, displayOnDetail: result.displayOnDetail }
            : item,
        ),
      );
      toast.success(
        result.displayOnDetail
          ? "Image will appear on the question detail page."
          : "Image hidden from the question detail page.",
      );
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setUpdatingDisplayId("");
    }
  }

  return (
    <div className="space-y-3 rounded-md border bg-muted/20 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium">Question images</p>
          <p className="text-xs text-muted-foreground">
            Upload an image, preview it, then copy its public URL into your HTML.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Images inserted directly in Content HTML are separate from uploaded
            image assets and must be removed from Content HTML manually.
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
            uploading
              ? "pointer-events-none opacity-50"
              : "cursor-pointer",
          )}
        >
          {uploading ? (
            <LoaderCircle className="size-4 animate-spin" />
          ) : (
            <Upload className="size-4" />
          )}
          {uploading ? "Uploading..." : "Upload images"}
        </label>
        <input
          id={fileInputId}
          ref={inputRef}
          type="file"
          accept={QUESTION_ASSET_MIME_TYPES.join(",")}
          multiple
          disabled={uploading}
          className="sr-only"
          onChange={(event) => void uploadFiles(event.target.files)}
        />
      </div>

      {assets.length ? (
        <div className="grid gap-3 md:grid-cols-2">
          {assets.map((asset) => (
            <div key={asset.id} className="space-y-2 rounded-md border bg-background p-2">
              {/* Storage URLs are dynamic and this admin preview should show the raw asset. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={asset.publicUrl}
                alt={asset.originalFilename}
                className="h-32 w-full rounded border object-contain"
              />
              <p className="truncate text-xs font-medium" title={asset.originalFilename}>
                {asset.originalFilename}
              </p>
              <p className="text-xs text-muted-foreground">
                Detail page: {asset.displayOnDetail ? "visible" : "hidden"}
              </p>
              <Input
                value={asset.publicUrl}
                readOnly
                aria-label={`${asset.originalFilename} public URL`}
                className="h-8 text-xs"
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={asset.displayOnDetail ? "secondary" : "outline"}
                  disabled={updatingDisplayId === asset.id}
                  onClick={() => void toggleDisplay(asset)}
                >
                  {updatingDisplayId === asset.id ? (
                    <LoaderCircle className="size-4 animate-spin" />
                  ) : asset.displayOnDetail ? (
                    <EyeOff className="size-4" />
                  ) : (
                    <Eye className="size-4" />
                  )}
                  {asset.displayOnDetail ? "Hide from detail" : "Show on detail"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => void copyUrl(asset.publicUrl)}
                >
                  <Copy className="size-4" />
                  Copy URL
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  disabled={deletingId === asset.id}
                  onClick={() => void removeAsset(asset)}
                >
                  {deletingId === asset.id ? (
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
        <p className="text-xs text-muted-foreground">No uploaded images yet.</p>
      )}
    </div>
  );
}
