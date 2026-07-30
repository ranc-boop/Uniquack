import { AlertTriangle, CheckCircle2, FileQuestion, Tags } from "lucide-react";

import { QuestionText, SolutionText } from "@/components/math-content";
import { QuestionAnswerSummary } from "@/components/question-answer-summary";
import { QuestionDetailImageGallery } from "@/components/question-detail-image-gallery";
import { BankBadge } from "@/app/teacher/banks/bank-ui";
import type {
  ReviewPreviewDTO,
  TeacherQuestionPreviewDTO,
} from "@/lib/teacher-focus-preview";

type PreviewDTO = ReviewPreviewDTO | TeacherQuestionPreviewDTO;

function sourceKindLabel(value: string) {
  const labels: Record<string, string> = {
    course_builder: "Course Builder",
    import: "Imported",
    manual: "Manual",
    public_pull: "Public Library copy",
    review_draft: "Review Draft",
  };

  return labels[value] ?? "Source recorded";
}

function accessLabel(preview: PreviewDTO) {
  if (preview.bank.role) {
    return `${preview.bank.role} member`;
  }

  if (preview.bank.accessSource === "platform_admin") {
    return "Platform administrator";
  }

  if (preview.bank.organizationRole) {
    return `Organization ${preview.bank.organizationRole}`;
  }

  return "Read access";
}

export function TeacherQuestionPreview({ preview }: { preview: PreviewDTO }) {
  const { question } = preview;
  const review = preview.kind === "review-preview" ? preview.review : null;
  const reviewWarnings = review
    ? [
        ...(review.lineageStatus === "missing"
          ? [
              "The question-to-review lineage is incomplete. Approval must stay blocked until it is repaired.",
            ]
          : []),
        ...review.warnings,
      ]
    : [];

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <section className="space-y-5 rounded-lg border border-slate-200/80 bg-white/95 p-5 shadow-[0_18px_48px_-40px_rgba(15,23,42,0.7)] ring-1 ring-slate-950/5">
        <div className="flex flex-wrap items-center gap-2">
          <BankBadge tone="sky">{question.type}</BankBadge>
          <BankBadge tone="slate">Difficulty {question.difficulty}</BankBadge>
          <BankBadge tone="indigo">{question.status}</BankBadge>
          {review ? (
            <BankBadge tone="amber">{review.status}</BankBadge>
          ) : null}
        </div>

        <section aria-labelledby="preview-question-heading">
          <div className="flex items-center gap-2">
            <FileQuestion aria-hidden="true" className="h-5 w-5 text-sky-700" />
            <h2
              className="text-lg font-bold text-slate-950"
              id="preview-question-heading"
            >
              Question
            </h2>
          </div>
          <p className="mt-2 text-sm font-semibold text-slate-700">
            {question.code || "Question code pending"} · {question.title}
          </p>
          <QuestionText
            className="mt-3 border-slate-200 bg-slate-50/70 text-slate-900"
            value={question.contentHtml}
          />
        </section>

        {preview.assets.length ? (
          <section aria-labelledby="preview-images-heading">
            <h2
              className="mb-3 text-lg font-bold text-slate-950"
              id="preview-images-heading"
            >
              Question images
            </h2>
            <QuestionDetailImageGallery
              images={preview.assets.map((asset) => ({
                id: asset.id,
                originalFilename: asset.altText || asset.label,
                publicUrl: asset.url,
              }))}
            />
          </section>
        ) : null}

        <section aria-labelledby="preview-answer-heading">
          <h2
            className="mb-3 text-lg font-bold text-slate-950"
            id="preview-answer-heading"
          >
            Answer
          </h2>
          <QuestionAnswerSummary
            answerSpec={question.answerSpec}
            options={question.options}
            questionType={question.type}
          />
        </section>

        <section aria-labelledby="preview-solution-heading">
          <h2
            className="mb-3 text-lg font-bold text-slate-950"
            id="preview-solution-heading"
          >
            Solution or explanation
          </h2>
          {question.solutionHtml?.trim() ? (
            <SolutionText
              className="border-slate-200 bg-slate-50/70 text-slate-900"
              value={question.solutionHtml}
            />
          ) : (
            <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
              No solution or explanation is attached yet.
            </p>
          )}
        </section>
      </section>

      <aside className="space-y-4">
        <section className="rounded-lg border border-slate-200 bg-white/95 p-4">
          <div className="flex items-center gap-2">
            <CheckCircle2
              aria-hidden="true"
              className="h-5 w-5 text-emerald-700"
            />
            <h2 className="font-bold text-slate-950">Library boundary</h2>
          </div>
          <dl className="mt-3 space-y-3 text-sm">
            <div>
              <dt className="text-slate-500">Library</dt>
              <dd className="font-semibold text-slate-900">
                {preview.bank.name}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Your access</dt>
              <dd className="font-semibold text-slate-900">
                {accessLabel(preview)}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Library capability</dt>
              <dd className="font-semibold text-slate-900">
                {preview.bank.canManage
                  ? "Can manage content"
                  : "Read-only access"}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Source</dt>
              <dd className="font-semibold text-slate-900">
                {sourceKindLabel(preview.provenance.sourceKind)}
              </dd>
            </div>
          </dl>
          <p className="mt-4 text-xs leading-5 text-slate-500">
            This preview does not grant access to an origin Library or private
            source file.
          </p>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white/95 p-4">
          <div className="flex items-center gap-2">
            <Tags aria-hidden="true" className="h-5 w-5 text-sky-700" />
            <h2 className="font-bold text-slate-950">Taxonomy</h2>
          </div>
          {preview.taxonomy.length ? (
            <ul className="mt-3 space-y-2">
              {preview.taxonomy.map((tag) => (
                <li
                  className="rounded-lg border border-sky-100 bg-sky-50/60 px-3 py-2 text-sm"
                  key={tag.tagId}
                >
                  <span className="font-semibold text-slate-900">
                    {tag.label}
                  </span>
                  <span className="mt-0.5 block text-xs text-slate-500">
                    {tag.facetKey ?? "Unclassified facet"} · {tag.reviewStatus}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm leading-6 text-slate-600">
              No taxonomy tags are attached.
            </p>
          )}
        </section>

        {review ? (
          <section
            className={
              reviewWarnings.length
                ? "rounded-lg border border-amber-200 bg-amber-50 p-4"
                : "rounded-lg border border-emerald-200 bg-emerald-50 p-4"
            }
          >
            <div className="flex items-center gap-2">
              <AlertTriangle
                aria-hidden="true"
                className={
                  reviewWarnings.length
                    ? "h-5 w-5 text-amber-700"
                    : "h-5 w-5 text-emerald-700"
                }
              />
              <h2 className="font-bold text-slate-950">Review checks</h2>
            </div>
            {reviewWarnings.length ? (
              <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-amber-950">
                {reviewWarnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-emerald-900">
                No stored validation warnings.
              </p>
            )}
            <p className="mt-3 text-xs leading-5 text-slate-600">
              Source excerpts stay unavailable until their source object passes
              a separate read check.
            </p>
          </section>
        ) : null}
      </aside>
    </div>
  );
}
