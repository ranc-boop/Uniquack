"use client";

import { ChevronLeft, ChevronRight, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { loadTeacherQuestionPreviews } from "@/components/teacher/lazy-teacher-question-preview";
import { TeacherQuestionPreview } from "@/components/teacher/teacher-question-preview";
import { Button } from "@/components/ui/button";
import type {
  TeacherPreviewDTO,
  TeacherPreviewKind,
} from "@/lib/teacher-question-preview-types";

export function TeacherQuestionPreviewQueue({
  bankId,
  ids,
  kind,
}: {
  bankId: string;
  ids: string[];
  kind: TeacherPreviewKind;
}) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState<TeacherPreviewDTO | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const versionsRef = useRef<Record<string, string>>({});
  const currentId = ids[currentIndex];

  useEffect(() => {
    if (!currentId) return;

    const controller = new AbortController();
    const requestIds = ids.slice(currentIndex, currentIndex + 2);
    const versions = Object.fromEntries(
      requestIds
        .filter((id) => versionsRef.current[id])
        .map((id) => [id, versionsRef.current[id]]),
    );

    void loadTeacherQuestionPreviews({
      bankId,
      bypassUnversionedCache: true,
      ids: requestIds,
      kind,
      signal: controller.signal,
      versions,
    })
      .then((loaded) => {
        loaded.forEach((item, index) => {
          versionsRef.current[requestIds[index]] = item.question.updatedAt;
        });
        const [current] = loaded;
        if (!controller.signal.aborted) setPreview(current);
      })
      .catch((loadError) => {
        if (!controller.signal.aborted) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Could not load the preview.",
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [bankId, currentId, currentIndex, ids, kind, retryKey]);

  if (!currentId) return null;

  function selectIndex(nextIndex: number) {
    setError(null);
    setLoading(true);
    setPreview(null);
    setCurrentIndex(nextIndex);
  }

  return (
    <section aria-label="Selected question preview queue" className="space-y-4">
      <nav
        aria-label="Preview queue navigation"
        className="sticky top-3 z-30 flex flex-col gap-3 rounded-xl border border-sky-200 bg-white/95 p-3 shadow-md backdrop-blur sm:flex-row sm:items-center sm:justify-between"
      >
        <div>
          <p className="text-sm font-bold text-slate-950">
            Question {currentIndex + 1} of {ids.length}
          </p>
          {preview ? (
            <p className="mt-1 line-clamp-1 text-xs text-slate-600">
              {preview.question.code || "Code pending"} · {preview.question.title}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor="preview-queue-jump">
            Jump to selected question
          </label>
          <select
            className="min-h-11 max-w-56 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-800"
            id="preview-queue-jump"
            onChange={(event) =>
              selectIndex(Number.parseInt(event.currentTarget.value, 10))
            }
            value={currentIndex}
          >
            {ids.map((id, index) => (
              <option key={id} value={index}>
                Question {index + 1}
              </option>
            ))}
          </select>
          <Button
            className="min-h-11"
            disabled={currentIndex === 0}
            onClick={() => selectIndex(Math.max(0, currentIndex - 1))}
            type="button"
            variant="outline"
          >
            <ChevronLeft aria-hidden="true" />
            Previous
          </Button>
          <Button
            className="min-h-11"
            disabled={currentIndex === ids.length - 1}
            onClick={() =>
              selectIndex(Math.min(ids.length - 1, currentIndex + 1))
            }
            type="button"
          >
            Next
            <ChevronRight aria-hidden="true" />
          </Button>
        </div>
      </nav>

      {loading ? (
        <div aria-live="polite" className="space-y-3 py-4">
          <span className="sr-only">Loading question preview</span>
          <div className="h-4 w-1/3 animate-pulse rounded bg-slate-200 motion-reduce:animate-none" />
          <div className="h-24 animate-pulse rounded bg-slate-100 motion-reduce:animate-none" />
        </div>
      ) : null}

      {error ? (
        <div
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 p-4"
          role="alert"
        >
          <p className="text-sm text-red-700">{error}</p>
          <Button
            onClick={() => {
              setError(null);
              setLoading(true);
              setRetryKey((value) => value + 1);
            }}
            type="button"
            variant="outline"
          >
            <RotateCcw aria-hidden="true" />
            Retry
          </Button>
        </div>
      ) : null}

      {preview ? (
        <div key={preview.question.questionId}>
          <TeacherQuestionPreview preview={preview} />
        </div>
      ) : null}
    </section>
  );
}
