"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
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
import type { TeacherAIPdfParsingProfile } from "@/lib/ai-pdf-import/teacher-parsing-profiles";
import { runWithConcurrency } from "@/lib/async-concurrency";
import { createClient } from "@/lib/supabase/client";
import { AIJobStatusPoller } from "@/components/ai-jobs/ai-job-status-poller";
import { Button } from "@/components/ui/button";

type LocalStatus =
  | "reserved"
  | "selected"
  | "reserving"
  | "uploading"
  | "finalizing"
  | "admission_ready"
  | "queued"
  | "processing"
  | "completed"
  | "failed"
  | "cancelled";

type SelectedPdf = {
  clientItemKey: string;
  file: File;
  safeErrorCode: string | null;
  status: LocalStatus;
};

const statusLabel: Record<LocalStatus, string> = {
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

const statusProgress: Record<LocalStatus, number> = {
  selected: 0,
  reserving: 1,
  reserved: 2,
  uploading: 3,
  finalizing: 4,
  admission_ready: 5,
  queued: 6,
  processing: 7,
  completed: 8,
  failed: 9,
  cancelled: 9,
};

function isPdf(file: File) {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

function statusTone(status: LocalStatus) {
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

  const displayedSelected = useMemo(
    () =>
      selected.map((item) => {
        const serverItem = serverItemsByClientKey.get(item.clientItemKey);
        if (
          !serverItem ||
          statusProgress[serverItem.status] < statusProgress[item.status]
        ) {
          return item;
        }
        return {
          ...item,
          safeErrorCode: serverItem.safeErrorCode,
          status: serverItem.status,
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
    displayedSelected.some((item) =>
      [
        "reserving",
        "uploading",
        "finalizing",
        "admission_ready",
        "queued",
        "processing",
      ].includes(item.status),
    );

  const counts = useMemo(() => {
    const count = (statuses: LocalStatus[]) =>
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
        file,
        safeErrorCode: null,
        status: "selected",
      })),
    );
  }

  async function startUpload() {
    if (!selected.length || running || !canUpload || !schemaAvailable) return;
    setError(null);
    setRunning(true);
    setSelected((current) =>
      current.map((item) => ({ ...item, safeErrorCode: null, status: "reserving" })),
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
              safeErrorCode: "upload_failed",
              status: "failed",
            });
            return;
          }

          if (item.status !== "reserved") {
            updateItem(selectedItem.clientItemKey, {
              status: item.status as LocalStatus,
            });
            return;
          }
          if (!item.token) {
            updateItem(selectedItem.clientItemKey, {
              safeErrorCode: "upload_failed",
              status: "failed",
            });
            return;
          }

          try {
            updateItem(selectedItem.clientItemKey, { status: "uploading" });
            const { error: uploadError } = await supabase.storage
              .from(AI_IMPORT_SOURCES_BUCKET)
              .uploadToSignedUrl(item.objectPath, item.token, selectedItem.file, {
                contentType: "application/pdf",
                upsert: false,
              });
            if (uploadError) throw new Error("upload_failed");

            updateItem(selectedItem.clientItemKey, { status: "finalizing" });
            const finalized = await finalizeTeacherAIPdfBurstItem({
              burstId: reservation.burstId,
              itemId: item.itemId,
              uploadAttemptId: item.uploadAttemptId,
            });
            updateItem(selectedItem.clientItemKey, {
              safeErrorCode: finalized.safeErrorCode,
              status: finalized.status as LocalStatus,
            });
          } catch {
            updateItem(selectedItem.clientItemKey, {
              safeErrorCode: "upload_failed",
              status: "failed",
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
          item.status === "reserving"
            ? { ...item, safeErrorCode: "upload_failed", status: "failed" }
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
    try {
      await cancelTeacherAIPdfBurst({ burstId: activeBurstId });
      setSelected((current) =>
        current.map((item) =>
          ["selected", "reserving", "admission_ready", "queued"].includes(item.status)
            ? { ...item, status: "cancelled" }
            : item,
        ),
      );
      router.refresh();
    } catch {
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
