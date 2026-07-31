"use client";

import { useEffect, useState } from "react";

import {
  LazyTeacherQuestionPreview,
  loadTeacherQuestionPreviews,
} from "@/components/teacher/lazy-teacher-question-preview";
import { Button } from "@/components/ui/button";
import type { TeacherPreviewKind } from "@/lib/teacher-question-preview-types";

export function AssignmentSelectionSummary({
  bankId,
  formId,
  helperText = "Choose at least one published question before saving or assigning.",
  inputName = "questionIds",
  totalLabel = "published question(s) available in this view.",
  totalQuestions,
  previewKind = "assignment-selection",
}: {
  bankId?: string;
  formId: string;
  helperText?: string;
  inputName?: string;
  totalLabel?: string;
  totalQuestions: number;
  previewKind?: TeacherPreviewKind;
}) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [previewOpen, setPreviewOpen] = useState(false);

  useEffect(() => {
    const form = document.getElementById(formId);
    if (!form) return;

    const updateSelectedCount = () => {
      const checked = form.querySelectorAll<HTMLInputElement>(
        `input[name="${inputName}"]:checked`,
      );
      setSelectedIds(Array.from(checked, (input) => input.value));
    };

    updateSelectedCount();
    form.addEventListener("change", updateSelectedCount);

    return () => {
      form.removeEventListener("change", updateSelectedCount);
    };
  }, [formId, inputName]);

  const selectedCount = selectedIds.length;
  const safePreviewIndex = Math.min(
    previewIndex,
    Math.max(0, selectedIds.length - 1),
  );
  const previewId = selectedIds[safePreviewIndex];
  const nextPreviewId = selectedIds[safePreviewIndex + 1];

  useEffect(() => {
    if (!previewOpen || !bankId || !nextPreviewId) return;

    const controller = new AbortController();
    void loadTeacherQuestionPreviews({
      bankId,
      ids: [nextPreviewId],
      kind: previewKind,
      signal: controller.signal,
    }).catch(() => {
      // Prefetch failures stay silent; the visible preview owns Retry UI.
    });

    return () => controller.abort();
  }, [bankId, nextPreviewId, previewKind, previewOpen]);

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-950" aria-live="polite">
            {selectedCount} selected
          </p>
          <p className="mt-1 text-sm text-slate-600">
            {selectedCount ? `${totalQuestions} ${totalLabel}` : helperText}
          </p>
        </div>
        {bankId && selectedCount ? (
          <Button
            onClick={() => {
              setPreviewIndex(0);
              setPreviewOpen((open) => !open);
            }}
            type="button"
            variant="outline"
          >
            {previewOpen ? "Close preview" : "Preview selected"}
          </Button>
        ) : null}
      </div>

      {previewOpen && bankId && previewId ? (
        <div className="mt-4 border-t border-slate-200 pt-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm font-medium text-slate-600">
              Question {safePreviewIndex + 1} of {selectedCount}
            </span>
            <div className="flex gap-2">
              <Button
                disabled={safePreviewIndex === 0}
                onClick={() =>
                  setPreviewIndex((index) => Math.max(0, index - 1))
                }
                size="sm"
                type="button"
                variant="outline"
              >
                Previous
              </Button>
              <Button
                disabled={safePreviewIndex >= selectedCount - 1}
                onClick={() =>
                  setPreviewIndex((index) =>
                    Math.min(selectedCount - 1, index + 1),
                  )
                }
                size="sm"
                type="button"
                variant="outline"
              >
                Next
              </Button>
            </div>
          </div>
          <LazyTeacherQuestionPreview
            bankId={bankId}
            defaultExpanded
            id={previewId}
            key={previewId}
            kind={previewKind}
          />
        </div>
      ) : null}
    </div>
  );
}
