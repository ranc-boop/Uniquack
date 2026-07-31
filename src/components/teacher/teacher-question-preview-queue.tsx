"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";

import { TeacherQuestionPreview } from "@/components/teacher/teacher-question-preview";
import { Button } from "@/components/ui/button";
import type {
  ReviewPreviewDTO,
  TeacherQuestionPreviewDTO,
} from "@/lib/teacher-question-preview-types";

type PreviewDTO = ReviewPreviewDTO | TeacherQuestionPreviewDTO;

export function TeacherQuestionPreviewQueue({
  previews,
}: {
  previews: PreviewDTO[];
}) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const current = previews[currentIndex];

  if (!current) return null;

  return (
    <section className="space-y-4" aria-label="Selected question preview queue">
      <nav
        aria-label="Preview queue navigation"
        className="sticky top-3 z-30 flex flex-col gap-3 rounded-xl border border-sky-200 bg-white/95 p-3 shadow-md backdrop-blur sm:flex-row sm:items-center sm:justify-between"
      >
        <div>
          <p className="text-sm font-bold text-slate-950">
            Question {currentIndex + 1} of {previews.length}
          </p>
          <p className="mt-1 line-clamp-1 text-xs text-slate-600">
            {current.question.code || "Code pending"} · {current.question.title}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor="preview-queue-jump">
            Jump to selected question
          </label>
          <select
            className="min-h-11 max-w-56 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-800"
            id="preview-queue-jump"
            onChange={(event) =>
              setCurrentIndex(Number.parseInt(event.currentTarget.value, 10))
            }
            value={currentIndex}
          >
            {previews.map((preview, index) => (
              <option key={preview.question.questionId} value={index}>
                {index + 1}. {preview.question.code || preview.question.title}
              </option>
            ))}
          </select>
          <Button
            className="min-h-11"
            disabled={currentIndex === 0}
            onClick={() => setCurrentIndex((index) => Math.max(0, index - 1))}
            type="button"
            variant="outline"
          >
            <ChevronLeft aria-hidden="true" />
            Previous
          </Button>
          <Button
            className="min-h-11"
            disabled={currentIndex === previews.length - 1}
            onClick={() =>
              setCurrentIndex((index) =>
                Math.min(previews.length - 1, index + 1),
              )
            }
            type="button"
          >
            Next
            <ChevronRight aria-hidden="true" />
          </Button>
        </div>
      </nav>

      <div key={current.question.questionId}>
        <TeacherQuestionPreview preview={current} />
      </div>
    </section>
  );
}
