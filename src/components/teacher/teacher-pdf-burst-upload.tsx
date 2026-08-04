"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  LoaderCircle,
  Upload,
  XCircle,
} from "lucide-react";

import {
  cancelTeacherAIPdfBurst,
  finalizeTeacherAIPdfBurstItem,
  reserveTeacherAIPdfBurst,
} from "@/app/teacher/banks/pdf-burst-actions";
import {
  AI_PDF_BURST_MAX_FILES,
  AI_PDF_BURST_UPLOAD_CONCURRENCY,
  type AIPdfBurstSafeSummary,
} from "@/lib/ai-pdf-import/burst-contract";
import {
  AI_IMPORT_SOURCES_BUCKET,
  AI_PDF_IMPORT_MAX_BYTES,
} from "@/lib/ai-pdf-import/constants";
import {
  markPdfBurstCancellationRequestFailed,
  markPdfBurstCancellationRequested,
  mergePdfBurstDurableSnapshot,
  mergePdfBurstDurableSnapshotsByClientKey,
  reconcilePdfBurstDisplayState,
  type PdfBurstDisplayStatus,
  type PdfBurstDurableSnapshot,
  type PdfBurstLocalPhase,
  type PdfBurstLocalRequestState,
} from "@/lib/ai-pdf-import/burst-status-reconciliation";
import type { TeacherAIPdfParsingProfile } from "@/lib/ai-pdf-import/teacher-parsing-profiles";
import { runWithConcurrency } from "@/lib/async-concurrency";
import { createClient } from "@/lib/supabase/client";
import { AIJobStatusPoller } from "@/components/ai-jobs/ai-job-status-poller";
import { Button } from "@/components/ui/button";

type SelectedPdf = {
  clientItemKey: string;
  durableSnapshot: PdfBurstDurableSnapshot | null;
  file: File;
  localPhase: PdfBurstLocalPhase;
  localRequestState: PdfBurstLocalRequestState;
  localWarningCode: string | null;
};

const statusLabel: Record<PdfBurstDisplayStatus, string> = {
  admission_ready: "Awaiting trusted worker capacity",
  cancelled: "Cancelled",
  completed: "Completed",
  failed: "Needs attention",
  finalizing: "Validating",
  processing: "Processing",
  queued: "Queued for trusted worker",
  reserved: "Reserved",
  reserving: "Reserving private upload",
  selected: "Ready to upload",
  uploading: "Uploading",
};

const safeErrorCopy: Record<string, string> = {
  admission_temporarily_blocked: "Waiting for current AI jobs to finish.",
  finalize_temporarily_unavailable: "Validation is temporarily unavailable.",
  invalid_pdf: "The uploaded file is not a valid PDF.",
  page_limit: "The PDF exceeds the 300-page limit.",
  size_mismatch: "The uploaded file size did not match the reservation.",
  upload_failed: "The private upload did not complete.",
  upload_missing: "The uploaded PDF could not be found.",
};

const localWarningCopy: Record<string, string> = {
  cancellation_request_failed:
    "The cancellation response was interrupted. Durable status will continue to refresh.",
  finalize_response_interrupted:
    "The finalization response was interrupted. Durable status will continue to refresh.",
  reservation_failed: "The private upload reservation did not complete.",
  upload_failed: "The private upload did not complete.",
};

function isPdf(file: File) {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

function statusTone(status: PdfBurstDisplayStatus) {
  if (status === "failed") return "border-rose-200 bg-rose-50 text-rose-800";
  if (status === "completed") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (status === "cancelled") return "border-slate-200 bg-slate-100 text-slate-600";
  if (["uploading", "finalizing", "processing"].includes(status)) {
    return "border-sky-200 bg-sky-50 text-sky-800";
  }
  return "border-amber-200 bg-amber-50 text-amber-900";
}

export function TeacherPdfBurstUpload({
  bankId,
  bankName,
  canUpload,
  initialBursts,
  parsingProfile,
  schemaAvailable,
}: {
  bankId: string;
  bankName: string;
  canUpload: boolean;
  initialBursts: AIPdfBurstSafeSummary[];
  parsingProfile: TeacherAIPdfParsingProfile;
  schemaAvailable: boolean;
}) {
  const router = useRouter();
  const requestKeyRef = useRef<string | null>(null);
  const [activeBurstId, setActiveBurstId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [selected, setSelected] = useState<SelectedPdf[]>([]);

  const serverItemsByClientKey = useMemo(() => {
    const activeBurst = initialBursts.find((burst) => burst.id === activeBurstId);
    return new Map(
      (activeBurst?.items ?? []).map((item) => [item.clientItemKey, item]),
    );
  }, [activeBurstId, initialBursts]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setSelected((current) =>
        mergePdfBurstDurableSnapshotsByClientKey(
          current,
          serverItemsByClientKey,
        ),
      );
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [serverItemsByClientKey]);

  const displayedSelected = useMemo(
    () =>
      selected.map((item) => {
        const durableSnapshot = mergePdfBurstDurableSnapshot(
          item.durableSnapshot,
          serverItemsByClientKey.get(item.clientItemKey),
        );
        const display = reconcilePdfBurstDisplayState({
          durable: durableSnapshot,
          localPhase: item.localPhase,
          localRequestState: item.localRequestState,
          localWarningCode: item.localWarningCode,
        });
        return {
          ...item,
          ...display,
          durableSnapshot,
        };
      }),
    [selected, serverItemsByClientKey],
  );

  const hasActiveBurst =
    initialBursts.some((burst) =>
      ["reserved", "uploading", "admission_wait", "queued", "processing"].includes(
        burst.status,
      ),
    ) ||
    displayedSelected.some((item) => item.shouldPoll);

  const counts = useMemo(() => {
    const count = (statuses: PdfBurstDisplayStatus[]) =>
      displayedSelected.filter((item) => statuses.includes(item.status)).length;
    return {
      completed: count(["completed"]),
      failed: count(["failed"]),
      finalized: count(["admission_ready", "queued", "processing", "completed"]),
      processing: count(["processing"]),
      queued: count(["admission_ready", "queued"]),
      uploading: count(["reserving", "uploading", "finalizing"]),
    };
  }, [displayedSelected]);

  function updateItem(clientItemKey: string, patch: Partial<SelectedPdf>) {
    setSelected((current) =>
      current.map((item) =>
        item.clientItemKey === clientItemKey ? { ...item, ...patch } : item,
      ),
    );
  }

  function selectFiles(fileList: FileList | null) {
    const files = Array.from(fileList ?? []);
    setError(null);
    setActiveBurstId(null);
    requestKeyRef.current = null;

    if (files.length > AI_PDF_BURST_MAX_FILES) {
      setSelected([]);
      setError(`Choose no more than ${AI_PDF_BURST_MAX_FILES} PDFs at once.`);
      return;
    }

    const invalid = files.find(
      (file) => !isPdf(file) || file.size < 1 || file.size > AI_PDF_IMPORT_MAX_BYTES,
    );
    if (invalid) {
      setSelected([]);
      setError(`${invalid.name} must be a PDF between 1 byte and 50MB.`);
      return;
    }

    setSelected(
      files.map((file) => ({
        clientItemKey: crypto.randomUUID(),
        durableSnapshot: null,
        file,
        localPhase: "selected",
        localRequestState: null,
        localWarningCode: null,
      })),
    );
  }

  async function startUpload() {
    if (!selected.length || running || !canUpload || !schemaAvailable) return;
    setError(null);
    setRunning(true);
    setSelected((current) =>
      current.map((item) => ({
        ...item,
        localPhase: "reserving",
        localWarningCode: null,
      })),
    );

    try {
      requestKeyRef.current ??= crypto.randomUUID();
      const reservation = await reserveTeacherAIPdfBurst({
        bankId,
        clientRequestKey: requestKeyRef.current,
        items: selected.map((item) => ({
          clientItemKey: item.clientItemKey,
          mimeType: "application/pdf" as const,
          originalFilename: item.file.name,
          sizeBytes: item.file.size,
        })),
        parsingProfile,
      });
      setActiveBurstId(reservation.burstId);

      const reservations = new Map(
        reservation.items.map((item) => [item.clientItemKey, item]),
      );
      const supabase = createClient();

      await runWithConcurrency(
        selected,
        AI_PDF_BURST_UPLOAD_CONCURRENCY,
        async (selectedItem) => {
          const item = reservations.get(selectedItem.clientItemKey);
          if (!item) {
            updateItem(selectedItem.clientItemKey, {
              localPhase: "failed",
              localWarningCode: "reservation_failed",
            });
            return;
          }

          if (item.status !== "reserved") {
            updateItem(selectedItem.clientItemKey, {
              durableSnapshot: {
                safeErrorCode: null,
                status: item.status,
              },
              localPhase: "reserved",
            });
            return;
          }
          if (!item.token) {
            updateItem(selectedItem.clientItemKey, {
              durableSnapshot: {
                safeErrorCode: null,
                status: "reserved",
              },
              localPhase: "failed",
              localWarningCode: "upload_failed",
            });
            return;
          }

          updateItem(selectedItem.clientItemKey, {
            durableSnapshot: {
              safeErrorCode: null,
              status: "reserved",
            },
            localPhase: "uploading",
          });
          try {
            const { error: uploadError } = await supabase.storage
              .from(AI_IMPORT_SOURCES_BUCKET)
              .uploadToSignedUrl(item.objectPath, item.token, selectedItem.file, {
                contentType: "application/pdf",
                upsert: false,
              });
            if (uploadError) throw new Error("upload_failed");
          } catch {
            updateItem(selectedItem.clientItemKey, {
              localPhase: "failed",
              localWarningCode: "upload_failed",
            });
            return;
          }

          updateItem(selectedItem.clientItemKey, {
            localPhase: "finalizing",
            localWarningCode: null,
          });
          try {
            const finalized = await finalizeTeacherAIPdfBurstItem({
              burstId: reservation.burstId,
              itemId: item.itemId,
              uploadAttemptId: item.uploadAttemptId,
            });
            updateItem(selectedItem.clientItemKey, {
              durableSnapshot: {
                safeErrorCode: finalized.safeErrorCode,
                status: finalized.status,
              },
              localWarningCode: null,
            });
          } catch {
            updateItem(selectedItem.clientItemKey, {
              localPhase: "finalizing",
              localWarningCode: "finalize_response_interrupted",
            });
          }
        },
      );
      router.refresh();
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "Could not reserve this private PDF batch.",
      );
      setSelected((current) =>
        current.map((item) =>
          item.localPhase === "reserving"
            ? {
                ...item,
                localPhase: "failed",
                localWarningCode: "reservation_failed",
              }
            : item,
        ),
      );
    } finally {
      setRunning(false);
    }
  }

  async function cancelRemaining() {
    if (!activeBurstId || running) return;
    setRunning(true);
    setError(null);
    setSelected((current) => markPdfBurstCancellationRequested(current));
    try {
      await cancelTeacherAIPdfBurst({ burstId: activeBurstId });
      router.refresh();
    } catch {
      setSelected((current) =>
        markPdfBurstCancellationRequestFailed(current),
      );
      setError("Could not cancel the remaining unstarted PDFs.");
    } finally {
      setRunning(false);
    }
  }

  return (
    <section className="border-t border-slate-200 bg-white p-5">
      <AIJobStatusPoller active={hasActiveBurst} />
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-950">Private PDFs</p>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              Select up to 50 files for {bankName}. Uploads go directly to private storage.
            </p>
          </div>
          <p className="text-xs font-semibold text-slate-500">
            Up to {AI_PDF_BURST_UPLOAD_CONCURRENCY} uploads at once
          </p>
        </div>

        {!schemaAvailable ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            PDF batch upload setup is not applied yet. Existing single-file imports are unchanged.
          </div>
        ) : null}

        <label className="block rounded-md border border-dashed border-slate-300 bg-slate-50 p-4">
          <span className="text-sm font-semibold text-slate-900">
            Choose PDF files
          </span>
          <input
            accept="application/pdf,.pdf"
            className="mt-3 block w-full text-sm text-slate-700 file:mr-3 file:rounded-md file:border-0 file:bg-sky-50 file:px-3 file:py-2 file:font-semibold file:text-sky-800"
            disabled={!canUpload || !schemaAvailable || running}
            multiple
            onChange={(event) => selectFiles(event.target.files)}
            type="file"
          />
        </label>

        {error ? (
          <p className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-800">
            {error}
          </p>
        ) : null}

        {selected.length ? (
          <>
            <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-7">
              {[
                ["Selected", displayedSelected.length],
                ["Uploading", counts.uploading],
                ["Finalized", counts.finalized],
                ["Queued", counts.queued],
                ["Processing", counts.processing],
                ["Completed", counts.completed],
                ["Failed", counts.failed],
              ].map(([label, value]) => (
                <div className="min-w-0 rounded-md border border-slate-200 bg-slate-50 p-3" key={label}>
                  <p className="text-xs font-semibold text-slate-500">{label}</p>
                  <p className="mt-1 text-lg font-bold text-slate-950">{value}</p>
                </div>
              ))}
            </div>

            <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
              {displayedSelected.map((item) => (
                <div
                  className="flex min-w-0 items-start justify-between gap-3 rounded-md border border-slate-200 p-3"
                  key={item.clientItemKey}
                >
                  <div className="flex min-w-0 gap-2">
                    <FileText aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
                    <div className="min-w-0">
                      <p className="break-words text-sm font-semibold text-slate-900">
                        {item.file.name}
                      </p>
                      {item.localWarningCode ? (
                        <p className="mt-1 text-xs text-amber-700">
                          {localWarningCopy[item.localWarningCode] ??
                            "The local response was interrupted; durable status remains authoritative."}
                        </p>
                      ) : null}
                      {item.localRequestState === "cancellation_requested" ? (
                        <p className="mt-1 text-xs text-sky-700">
                          Cancellation requested. Waiting for authoritative server status.
                        </p>
                      ) : null}
                      {item.safeErrorCode ? (
                        <p className="mt-1 text-xs text-rose-700">
                          {safeErrorCopy[item.safeErrorCode] ?? "This file needs attention."}
                        </p>
                      ) : null}
                    </div>
                  </div>
                  <span className={`shrink-0 rounded border px-2 py-1 text-xs font-semibold ${statusTone(item.status)}`}>
                    {statusLabel[item.status]}
                  </span>
                </div>
              ))}
            </div>
          </>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button
            disabled={!selected.length || !canUpload || !schemaAvailable || running}
            onClick={startUpload}
            type="button"
          >
            {running ? (
              <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin" />
            ) : (
              <Upload aria-hidden="true" className="h-4 w-4" />
            )}
            Reserve and upload
          </Button>
          {activeBurstId ? (
            <Button disabled={running} onClick={cancelRemaining} type="button" variant="outline">
              <XCircle aria-hidden="true" className="h-4 w-4" />
              Cancel unstarted
            </Button>
          ) : null}
          <Button asChild variant="outline">
            <Link href={`/teacher/banks/${bankId}/review`}>
              <CheckCircle2 aria-hidden="true" className="h-4 w-4" />
              Review Drafts
            </Link>
          </Button>
        </div>
      </div>

      {initialBursts.length ? (
        <div className="mt-6 border-t border-slate-200 pt-5">
          <h3 className="text-sm font-bold text-slate-950">Recent PDF batches</h3>
          <div className="mt-3 space-y-3">
            {initialBursts.map((burst) => (
              <div className="rounded-md border border-slate-200 bg-slate-50 p-3" key={burst.id}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-900">
                    {burst.itemCount} PDFs
                  </p>
                  <span className="text-xs font-semibold uppercase text-slate-500">
                    {burst.status.replaceAll("_", " ")}
                  </span>
                </div>
                <p className="mt-2 text-xs leading-5 text-slate-600">
                  Reserved {burst.reservedCount} / Waiting {burst.admissionReadyCount} / Queued {burst.queuedCount} / Processing {burst.processingCount} / Completed {burst.completedCount} / Failed {burst.failedCount} / Cancelled {burst.cancelledCount}
                </p>
                {burst.failedCount ? (
                  <p className="mt-2 flex items-center gap-2 text-xs font-semibold text-rose-700">
                    <AlertTriangle aria-hidden="true" className="h-4 w-4" />
                    Failed files remain independent; completed files are unchanged.
                  </p>
                ) : null}
                <details className="mt-3 border-t border-slate-200 pt-3">
                  <summary className="cursor-pointer text-xs font-semibold text-sky-800">
                    View file status
                  </summary>
                  <div className="mt-3 space-y-2">
                    {burst.items.map((item) => (
                      <div
                        className="flex min-w-0 items-start justify-between gap-3 rounded border border-slate-200 bg-white px-3 py-2"
                        key={item.clientItemKey}
                      >
                        <div className="min-w-0">
                          <p className="break-words text-xs font-semibold text-slate-800">
                            {item.originalFilename}
                          </p>
                          {item.safeErrorCode ? (
                            <p className="mt-1 text-xs text-rose-700">
                              {safeErrorCopy[item.safeErrorCode] ?? "This file needs attention."}
                            </p>
                          ) : null}
                        </div>
                        <span className="shrink-0 text-xs font-semibold text-slate-600">
                          {statusLabel[item.status]}
                        </span>
                      </div>
                    ))}
                  </div>
                </details>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
