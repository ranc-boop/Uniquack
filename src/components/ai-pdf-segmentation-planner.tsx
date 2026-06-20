"use client";

import {
  Check,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  GripHorizontal,
  LoaderCircle,
  ScanLine,
  Trash2,
} from "lucide-react";
import { useState, type PointerEvent } from "react";
import { toast } from "sonner";

import {
  confirmAIPdfSegmentation,
  prepareAIPdfSegmentation,
  previewAIPdfBoundaryPage,
} from "@/app/admin/imports/pdf/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DEFAULT_SEGMENT_TARGET_PAGES } from "@/lib/ai-pdf-import/segmentation";

type BoundaryPreview = {
  height: number;
  id: string;
  imageDataUrl: string;
  sourcePage: number;
  splitY: number;
  width: number;
};

export function AIPdfSegmentationPlanner({
  batchId,
  disabled,
  initiallyConfirmed = false,
  onConfirmationChange,
  onConfirmed,
  pageCount,
}: {
  batchId: string;
  disabled?: boolean;
  initiallyConfirmed?: boolean;
  onConfirmationChange?: (confirmed: boolean) => void;
  onConfirmed?: (summary: unknown) => void;
  pageCount: number;
}) {
  const maxTargetPages = Math.max(1, Math.min(100, pageCount - 1));
  const [targetPages, setTargetPages] = useState(
    Math.min(DEFAULT_SEGMENT_TARGET_PAGES, maxTargetPages),
  );
  const [preparing, setPreparing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [previews, setPreviews] = useState<BoundaryPreview[]>([]);
  const [confirmed, setConfirmed] = useState(initiallyConfirmed);

  async function prepare() {
    setPreparing(true);
    setConfirmed(false);
    onConfirmationChange?.(false);

    try {
      const result = await prepareAIPdfSegmentation({
        batchId,
        targetPages,
      });
      setPreviews(
        result.previews.map((preview, index) => ({
          ...preview,
          id: `boundary-${index + 1}`,
          splitY: preview.suggestedSplitY,
        })),
      );

      if (!result.previews.length) {
        toast.info("This PDF fits in one request and does not need splitting.");
      } else {
        toast.success(`Prepared ${result.previews.length} boundary preview(s).`);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not prepare boundary previews.");
    } finally {
      setPreparing(false);
    }
  }

  function setSplitY(id: string, splitY: number) {
    setConfirmed(false);
    onConfirmationChange?.(false);
    setPreviews((current) =>
      current.map((preview) =>
        preview.id === id
          ? { ...preview, splitY: Math.max(0.05, Math.min(0.95, splitY)) }
          : preview,
      ),
    );
  }

  function dragLine(id: string, event: PointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    setSplitY(id, (event.clientY - rect.top) / rect.height);
  }

  async function replaceBoundaryPage(id: string, sourcePage: number) {
    if (sourcePage < 1 || sourcePage >= pageCount) {
      return;
    }

    if (
      previews.some(
        (preview) => preview.id !== id && preview.sourcePage === sourcePage,
      )
    ) {
      toast.error("Another boundary already uses that source page.");
      return;
    }

    setPreparing(true);
    setConfirmed(false);
    onConfirmationChange?.(false);

    try {
      const preview = await previewAIPdfBoundaryPage({ batchId, sourcePage });
      setPreviews((current) =>
        current
          .map((item) =>
            item.id === id
              ? {
                  ...preview,
                  id,
                  splitY: preview.suggestedSplitY,
                }
              : item,
          )
          .sort((left, right) => left.sourcePage - right.sourcePage),
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not render that boundary page.");
    } finally {
      setPreparing(false);
    }
  }

  async function confirm() {
    setConfirming(true);

    try {
      const result = await confirmAIPdfSegmentation({
        batchId,
        boundaries: previews.map((preview) => ({
          id: preview.id,
          sourcePage: preview.sourcePage,
          splitY: preview.splitY,
        })),
        targetPages,
      });
      setConfirmed(true);
      onConfirmationChange?.(true);
      onConfirmed?.(result.summary);
      toast.success("Split plan saved. Generated PDFs are ready to open.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not confirm segmentation.");
    } finally {
      setConfirming(false);
    }
  }

  return (
    <div className="space-y-4 rounded-xl border border-blue-200 bg-blue-50/40 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <ScanLine className="size-4 text-blue-700" />
            <p className="text-sm font-semibold">Masked full-PDF segmentation</p>
            {confirmed ? <Badge variant="secondary">Confirmed</Badge> : null}
          </div>
          <p className="mt-1 max-w-3xl text-xs text-muted-foreground">
            A split page is included in both neighboring chunks, but masking
            ensures each question remains visible in only one chunk. Place every
            blue line in a clear gap between questions.
          </p>
        </div>
        <div className="flex items-end gap-2">
          <label className="space-y-1 text-xs">
            <span className="block font-medium">Pages per chunk</span>
            <input
              className="h-9 w-24 rounded-md border bg-background px-3"
              disabled={disabled || preparing}
              max={maxTargetPages}
              onChange={(event) => {
                setTargetPages(Number(event.target.value));
                setConfirmed(false);
                onConfirmationChange?.(false);
              }}
              onBlur={() =>
                setTargetPages((current) =>
                  Math.max(1, Math.min(maxTargetPages, current || 1)),
                )
              }
              type="number"
              value={targetPages}
            />
          </label>
          <Button
            disabled={disabled || preparing || targetPages < 1}
            onClick={() => void prepare()}
            size="sm"
            type="button"
            variant="outline"
          >
            {preparing ? <LoaderCircle className="size-4 animate-spin" /> : <ScanLine className="size-4" />}
            Preview suggested splits
          </Button>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Change this one number to control the split count. A smaller value
        creates more chunks; a larger value creates fewer. The default is 50
        pages per chunk.
      </p>

      {previews.length ? (
        <div className="grid gap-4 xl:grid-cols-2">
          {previews.map((preview, index) => (
            <div key={preview.id} className="overflow-hidden rounded-lg border bg-background shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2">
                <div>
                  <p className="text-sm font-medium">Split {index + 1} · source page {preview.sourcePage}</p>
                  <p className="text-xs text-muted-foreground">
                    Split at {(preview.splitY * 100).toFixed(1)}% · content above → chunk {index + 1}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    disabled={preparing || preview.sourcePage <= 1}
                    onClick={() => void replaceBoundaryPage(preview.id, preview.sourcePage - 1)}
                    size="icon"
                    title="Move split to previous page"
                    type="button"
                    variant="ghost"
                  >
                    <ChevronLeft className="size-4" />
                  </Button>
                  <Button
                    disabled={preparing || preview.sourcePage >= pageCount - 1}
                    onClick={() => void replaceBoundaryPage(preview.id, preview.sourcePage + 1)}
                    size="icon"
                    title="Move split to next page"
                    type="button"
                    variant="ghost"
                  >
                    <ChevronRight className="size-4" />
                  </Button>
                  <Button
                    onClick={() => {
                      setConfirmed(false);
                      onConfirmationChange?.(false);
                      setPreviews((current) => current.filter((item) => item.id !== preview.id));
                    }}
                    size="icon"
                    title="Remove split"
                    type="button"
                    variant="ghost"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>

              <div
                className="relative mx-auto max-h-[620px] w-fit touch-none cursor-row-resize overflow-hidden bg-white"
                onPointerDown={(event) => {
                  event.currentTarget.setPointerCapture(event.pointerId);
                  dragLine(preview.id, event);
                }}
                onPointerMove={(event) => {
                  if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                    dragLine(preview.id, event);
                  }
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  alt={`PDF source page ${preview.sourcePage}`}
                  className="block max-h-[620px] max-w-full select-none"
                  draggable={false}
                  src={preview.imageDataUrl}
                />
                <div
                  className="pointer-events-none absolute inset-x-0 border-t-2 border-blue-600 shadow-[0_0_0_1px_rgba(255,255,255,0.9)]"
                  style={{ top: `${preview.splitY * 100}%` }}
                >
                  <span className="absolute left-1/2 top-0 flex -translate-x-1/2 -translate-y-1/2 items-center gap-1 rounded-full bg-blue-600 px-2 py-1 text-[10px] font-medium text-white shadow">
                    <GripHorizontal className="size-3" /> drag split line
                  </span>
                </div>
                <div className="pointer-events-none absolute inset-x-0 top-0 bg-blue-500/5" style={{ height: `${preview.splitY * 100}%` }} />
                <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-emerald-500/5" style={{ height: `${(1 - preview.splitY) * 100}%` }} />
              </div>

              <div className="grid grid-cols-2 gap-2 border-t bg-muted/20 p-3 text-xs">
                <div className="relative overflow-hidden rounded border bg-white">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img alt="Previous chunk preview" className="block w-full" src={preview.imageDataUrl} />
                  <div className="absolute inset-x-0 bottom-0 bg-white" style={{ height: `${(1 - preview.splitY) * 100}%` }} />
                  <Badge className="absolute left-2 top-2">Previous chunk</Badge>
                </div>
                <div className="relative overflow-hidden rounded border bg-white">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img alt="Next chunk preview" className="block w-full" src={preview.imageDataUrl} />
                  <div className="absolute inset-x-0 top-0 bg-white" style={{ height: `${preview.splitY * 100}%` }} />
                  <Badge className="absolute left-2 top-2" variant="secondary">Next chunk</Badge>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-md border border-dashed bg-background/70 px-4 py-6 text-center text-xs text-muted-foreground">
          {confirmed
            ? "A confirmed boundary plan is saved for this PDF. Generate boundaries only if you want to replace it."
            : "Set the approximate pages per chunk, then preview the suggested splits."}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
        <p className="text-xs text-muted-foreground">
          {previews.length + 1} output PDF chunk(s) · no duplicated visible content · split pages are masked before extraction.
        </p>
        <Button
          disabled={disabled || confirming || !previews.length}
          onClick={() => void confirm()}
          type="button"
        >
          {confirming ? <LoaderCircle className="size-4 animate-spin" /> : <Check className="size-4" />}
          {confirmed ? "Splits confirmed" : "Confirm all splits"}
        </Button>
      </div>

      {confirmed && previews.length ? (
        <div className="flex flex-wrap items-center gap-2 rounded-md border bg-background p-3">
          <span className="text-xs font-medium">Open generated PDF:</span>
          {Array.from({ length: previews.length + 1 }, (_, chunkIndex) => (
            <Button
              key={chunkIndex}
              onClick={() =>
                window.open(
                  `/api/admin/imports/pdf/segment-preview/${batchId}/${chunkIndex}`,
                  "_blank",
                  "noopener,noreferrer",
                )
              }
              size="sm"
              type="button"
              variant="outline"
            >
              <ExternalLink className="size-4" /> Chunk {chunkIndex + 1}
            </Button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
