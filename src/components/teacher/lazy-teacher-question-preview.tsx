"use client";

import { ChevronDown, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";

import { TeacherQuestionPreview } from "@/components/teacher/teacher-question-preview";
import type {
  TeacherPreviewDTO,
  TeacherPreviewKind,
  TeacherPreviewResponse,
} from "@/lib/teacher-question-preview-types";
import { cn } from "@/lib/utils";

const previewCache = new Map<string, TeacherPreviewDTO>();
const requestQueue: Array<() => void> = [];
let activeRequestCount = 0;

function cacheKey({
  bankId,
  id,
  kind,
  version,
}: {
  bankId: string;
  id: string;
  kind: TeacherPreviewKind;
  version?: string;
}) {
  return `${bankId}:${kind}:${id}:${version ?? "current"}`;
}

function scheduleRequest<T>(request: () => Promise<T>) {
  return new Promise<T>((resolve, reject) => {
    const run = () => {
      activeRequestCount += 1;
      request()
        .then(resolve, reject)
        .finally(() => {
          activeRequestCount -= 1;
          requestQueue.shift()?.();
        });
    };

    if (activeRequestCount < 2) {
      run();
    } else {
      requestQueue.push(run);
    }
  });
}

function isPreviewDTO(value: unknown): value is TeacherPreviewDTO {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const preview = value as Record<string, unknown>;
  const question =
    preview.question && typeof preview.question === "object"
      ? (preview.question as Record<string, unknown>)
      : null;

  return (
    (preview.kind === "review-preview" ||
      preview.kind === "teacher-question-preview") &&
    Boolean(question) &&
    typeof question?.questionId === "string" &&
    typeof question?.contentHtml === "string"
  );
}

export async function loadTeacherQuestionPreviews({
  bankId,
  ids,
  kind,
  signal,
  versions = {},
}: {
  bankId: string;
  ids: string[];
  kind: TeacherPreviewKind;
  signal?: AbortSignal;
  versions?: Record<string, string | undefined>;
}) {
  const uniqueIds = Array.from(new Set(ids));
  if (!uniqueIds.length || uniqueIds.length > 5 || uniqueIds.length !== ids.length) {
    throw new Error("Choose between one and five unique questions.");
  }

  const cachedById = new Map<string, TeacherPreviewDTO>();
  const missingIds: string[] = [];

  for (const id of ids) {
    const cached = previewCache.get(
      cacheKey({ bankId, id, kind, version: versions[id] }),
    );
    if (cached) {
      cachedById.set(id, cached);
    } else {
      missingIds.push(id);
    }
  }

  if (missingIds.length) {
    const loaded = await scheduleRequest(async () => {
      const response = await fetch(
        `/api/teacher/banks/${encodeURIComponent(bankId)}/previews`,
        {
          body: JSON.stringify({ ids: missingIds, kind }),
          cache: "no-store",
          credentials: "same-origin",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          method: "POST",
          referrerPolicy: "no-referrer",
          signal,
        },
      );

      if (!response.ok) {
        throw new Error(
          response.status === 404
            ? "This preview is no longer available."
            : "Could not load the preview.",
        );
      }

      const payload = (await response.json()) as Partial<TeacherPreviewResponse>;
      if (
        !Array.isArray(payload.previews) ||
        payload.previews.length !== missingIds.length ||
        payload.previews.some((preview) => !isPreviewDTO(preview))
      ) {
        throw new Error("The preview response was incomplete.");
      }

      payload.previews.forEach((preview, index) => {
        previewCache.set(
          cacheKey({
            bankId,
            id: missingIds[index],
            kind,
            version: versions[missingIds[index]],
          }),
          preview,
        );
      });

      return payload.previews;
    });

    missingIds.forEach((id, index) => {
      cachedById.set(id, loaded[index]);
    });
  }

  return ids.map((id) => {
    const preview =
      cachedById.get(id) ??
      previewCache.get(
        cacheKey({ bankId, id, kind, version: versions[id] }),
      );
    if (!preview) {
      throw new Error("The preview response was incomplete.");
    }
    return preview;
  });
}

export function LazyTeacherQuestionPreview({
  bankId,
  className,
  defaultExpanded = false,
  id,
  kind,
  label = "Preview",
  version,
}: {
  bankId: string;
  className?: string;
  defaultExpanded?: boolean;
  id: string;
  kind: TeacherPreviewKind;
  label?: string;
  version?: string;
}) {
  const panelId = useId();
  const abortRef = useRef<AbortController | null>(null);
  const loadingRef = useRef(false);
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [preview, setPreview] = useState<TeacherPreviewDTO | null>(
    () =>
      previewCache.get(cacheKey({ bankId, id, kind, version })) ?? null,
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (preview || loadingRef.current) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    loadingRef.current = true;
    setError(null);
    setLoading(true);

    try {
      const [loaded] = await loadTeacherQuestionPreviews({
        bankId,
        ids: [id],
        kind,
        signal: controller.signal,
        versions: { [id]: version },
      });
      if (!controller.signal.aborted) {
        setPreview(loaded);
      }
    } catch (loadError) {
      if (!controller.signal.aborted) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Could not load the preview.",
        );
      }
    } finally {
      if (abortRef.current === controller) {
        loadingRef.current = false;
      }
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, [bankId, id, kind, preview, version]);

  useEffect(() => {
    const loadTimer = defaultExpanded
      ? window.setTimeout(() => void load(), 0)
      : null;
    return () => {
      if (loadTimer !== null) window.clearTimeout(loadTimer);
    };
  }, [defaultExpanded, load]);

  useEffect(
    () => () => {
      abortRef.current?.abort();
    },
    [],
  );

  const toggle = () => {
    const nextExpanded = !expanded;
    setExpanded(nextExpanded);

    if (nextExpanded) {
      void load();
    } else if (loading) {
      abortRef.current?.abort();
      loadingRef.current = false;
      setLoading(false);
    }
  };

  return (
    <div className={cn("min-w-0", className)}>
      <button
        aria-controls={panelId}
        aria-expanded={expanded}
        className="inline-flex min-h-10 items-center gap-1.5 rounded-md px-3 text-sm font-medium text-slate-700 hover:bg-slate-100 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
        onClick={toggle}
        type="button"
      >
        {expanded ? "Hide preview" : label}
        <ChevronDown
          aria-hidden="true"
          className={cn(
            "h-4 w-4 transition-transform motion-reduce:transition-none",
            expanded && "rotate-180",
          )}
        />
      </button>

      {expanded ? (
        <div className="mt-2 min-w-0" id={panelId}>
          {loading ? (
            <div
              aria-live="polite"
              className="space-y-3 border-t border-slate-200 py-4"
            >
              <span className="sr-only">Loading question preview</span>
              <div className="h-4 w-1/3 animate-pulse rounded bg-slate-200 motion-reduce:animate-none" />
              <div className="h-20 animate-pulse rounded bg-slate-100 motion-reduce:animate-none" />
            </div>
          ) : null}

          {error ? (
            <div
              aria-live="polite"
              className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 py-4"
              role="status"
            >
              <p className="text-sm text-red-700">{error}</p>
              <button
                className="inline-flex min-h-10 items-center gap-2 rounded-md border border-slate-300 px-3 text-sm font-medium text-slate-800 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
                onClick={() => void load()}
                type="button"
              >
                <RotateCcw aria-hidden="true" className="h-4 w-4" />
                Retry
              </button>
            </div>
          ) : null}

          {preview ? (
            <TeacherQuestionPreview preview={preview} showHeader={false} />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
