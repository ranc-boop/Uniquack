"use client";

import { AlertTriangle } from "lucide-react";
import { useId } from "react";

import {
  InlineMathText,
  OptionText,
  QuestionText,
  SolutionText,
} from "@/components/math-content";
import { QuestionDetailImageGallery } from "@/components/question-detail-image-gallery";
import {
  normalizeAnswerSpec,
  normalizeQuestionOptions,
} from "@/lib/questions/answer-spec";
import type { TeacherPreviewDTO } from "@/lib/teacher-question-preview-types";

function sourceKindLabel(value: string) {
  const labels: Record<string, string> = {
    course_builder: "Course Builder",
    import: "Imported",
    manual: "Manual",
    public_pull: "Public Library copy",
    review_draft: "Library draft",
  };

  return labels[value] ?? value;
}

function CompactAnswer({ preview }: { preview: TeacherPreviewDTO }) {
  const answer = normalizeAnswerSpec(preview.question.answerSpec);
  const options = normalizeQuestionOptions(preview.question.options);
  const compactOptions = options.every(
    (option) =>
      (option.content_source ?? option.content_html)
        .replace(/<[^>]+>/g, " ")
        .trim().length <= 120,
  );

  return (
    <div className="space-y-3">
      {options.length ? (
        <ol
          className={
            compactOptions ? "grid gap-2 md:grid-cols-2" : "grid gap-2"
          }
        >
          {options.map((option) => (
            <li
              className="flex min-w-0 gap-3 rounded-md border border-slate-200 px-3 py-2.5"
              key={option.id}
            >
              <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-slate-100 px-1.5 text-xs font-semibold text-slate-700">
                {option.label || option.id}
              </span>
              <OptionText
                className="min-w-0 flex-1 border-0 bg-transparent p-0 text-slate-900"
                compact
                value={option.content_source ?? option.content_html}
              />
            </li>
          ))}
        </ol>
      ) : null}

      {answer.kind === "mcq" ? (
        <p className="text-sm text-slate-700">
          <span className="font-semibold text-slate-950">Correct answer</span>{" "}
          {answer.correct_option_ids?.join(", ") || "Not set"}
        </p>
      ) : null}

      {answer.kind === "fill_blank" ? (
        <div className="space-y-1 text-sm text-slate-700">
          <p>
            <span className="font-semibold text-slate-950">Final answer</span>{" "}
            <InlineMathText
              value={answer.final_answers?.join(", ") || "Not set"}
            />
          </p>
          {answer.accepted_answers?.length ? (
            <p>
              <span className="font-semibold text-slate-950">
                Accepted answers
              </span>{" "}
              <InlineMathText value={answer.accepted_answers.join(", ")} />
            </p>
          ) : null}
        </div>
      ) : null}

      {answer.kind === "frq" || answer.kind === "mixed" ? (
        <p className="text-sm text-slate-700">Manual or AI-assisted grading</p>
      ) : null}
    </div>
  );
}

export function TeacherQuestionPreview({
  preview,
  showHeader = true,
}: {
  preview: TeacherPreviewDTO;
  showHeader?: boolean;
}) {
  const headingPrefix = useId();
  const { question } = preview;
  const review = preview.kind === "review-preview" ? preview.review : null;
  const hardErrors = review?.hardErrors ?? [];
  const warnings = review?.warnings ?? [];

  return (
    <article className="min-w-0 divide-y divide-slate-200 border-t border-slate-200 bg-white">
      {showHeader ? (
        <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-3">
          <h2
            className="min-w-0 text-base font-semibold text-slate-950"
            id={`${headingPrefix}-title`}
          >
            {question.title}
          </h2>
          <p className="text-sm text-slate-500">
            {[question.code, question.type, question.status]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </header>
      ) : null}

      {hardErrors.length ? (
        <section
          aria-labelledby={`${headingPrefix}-errors`}
          className="py-3"
        >
          <div className="flex gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-950">
            <AlertTriangle
              aria-hidden="true"
              className="mt-0.5 h-4 w-4 shrink-0"
            />
            <div>
              <h3 className="font-semibold" id={`${headingPrefix}-errors`}>
                Must be fixed
              </h3>
              <ul className="mt-1 list-disc space-y-1 pl-4">
                {hardErrors.map((error) => (
                  <li key={error}>{error}</li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      ) : null}

      {warnings.length ? (
        <section
          aria-labelledby={`${headingPrefix}-warnings`}
          className="py-3"
        >
          <div className="flex gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-950">
            <AlertTriangle
              aria-hidden="true"
              className="mt-0.5 h-4 w-4 shrink-0"
            />
            <div>
              <h3 className="font-semibold" id={`${headingPrefix}-warnings`}>
                Review warnings
              </h3>
              <ul className="mt-1 list-disc space-y-1 pl-4">
                {warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      ) : null}

      <section
        aria-labelledby={`${headingPrefix}-question`}
        className="space-y-3 py-4"
      >
        <h3
          className="text-sm font-semibold text-slate-950"
          id={`${headingPrefix}-question`}
        >
          Question
        </h3>
        <QuestionText
          className="border-0 bg-transparent p-0 text-slate-900"
          compact
          value={question.contentHtml}
        />
        {preview.assets.length ? (
          <QuestionDetailImageGallery
            images={preview.assets.map((asset) => ({
              id: asset.id,
              originalFilename: asset.altText || asset.label,
              publicUrl: asset.url,
            }))}
          />
        ) : null}
      </section>

      <section
        aria-labelledby={`${headingPrefix}-answer`}
        className="space-y-3 py-4"
      >
        <h3
          className="text-sm font-semibold text-slate-950"
          id={`${headingPrefix}-answer`}
        >
          Answer
        </h3>
        <CompactAnswer preview={preview} />
      </section>

      <section
        aria-labelledby={`${headingPrefix}-solution`}
        className="space-y-3 py-4"
      >
        <h3
          className="text-sm font-semibold text-slate-950"
          id={`${headingPrefix}-solution`}
        >
          Solution
        </h3>
        {question.solutionHtml?.trim() ? (
          <SolutionText
            className="border-0 bg-transparent p-0 text-slate-900"
            compact
            value={question.solutionHtml}
          />
        ) : (
          <p className="text-sm text-amber-800">No solution provided.</p>
        )}
      </section>

      <details className="py-3 text-sm">
        <summary className="cursor-pointer font-medium text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2">
          Details
        </summary>
        <dl className="mt-3 grid gap-x-8 gap-y-2 text-slate-600 sm:grid-cols-2">
          <div>
            <dt className="inline font-medium text-slate-900">Library:</dt>{" "}
            <dd className="inline">{preview.bank.name}</dd>
          </div>
          <div>
            <dt className="inline font-medium text-slate-900">Source:</dt>{" "}
            <dd className="inline">
              {sourceKindLabel(preview.provenance.sourceKind)}
            </dd>
          </div>
          <div>
            <dt className="inline font-medium text-slate-900">Lineage:</dt>{" "}
            <dd className="inline">
              {preview.provenance.hasReviewLineage ? "Linked" : "Missing"}
            </dd>
          </div>
          <div>
            <dt className="inline font-medium text-slate-900">Updated:</dt>{" "}
            <dd className="inline">{question.updatedAt.slice(0, 10)}</dd>
          </div>
        </dl>
        {preview.taxonomy.length ? (
          <ul className="mt-3 flex flex-wrap gap-2">
            {preview.taxonomy.map((tag) => (
              <li
                className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-700"
                key={tag.tagId}
              >
                {tag.label}
              </li>
            ))}
          </ul>
        ) : null}
      </details>
    </article>
  );
}
