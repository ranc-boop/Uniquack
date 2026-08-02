import { notFound } from "next/navigation";

import { BankBadge } from "@/app/teacher/banks/bank-ui";
import { FormSubmitButton } from "@/components/form-submit-button";
import { FocusWorkspaceShell } from "@/components/teacher/focus-workspace-shell";
import { LazyTeacherQuestionPreview } from "@/components/teacher/lazy-teacher-question-preview";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requireTeacher } from "@/lib/auth/guards";
import {
  normalizeAnswerSpec,
  normalizeQuestionOptions,
} from "@/lib/questions/answer-spec";
import { createClient } from "@/lib/supabase/server";
import { getReviewPreviewDTO } from "@/lib/teacher-focus-preview";
import {
  isDatabaseUuid,
  sanitizeTeacherBankReturnTo,
} from "@/lib/teacher-focus-workspace";

import {
  editBankReviewDraftQuestion,
  publishBankReviewDraftChanges,
} from "../../../../actions";

export const dynamic = "force-dynamic";

function stripHtml(value: string | null | undefined) {
  return String(value ?? "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

export default async function TeacherReviewEditPage({
  params,
  searchParams,
}: {
  params: Promise<{ bankId: string; reviewItemId: string }>;
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const [profile, routeParams, query, supabase] = await Promise.all([
    requireTeacher(),
    params,
    searchParams,
    createClient(),
  ]);
  const { bankId, reviewItemId } = routeParams;

  if (!isDatabaseUuid(bankId) || !isDatabaseUuid(reviewItemId)) notFound();

  const preview = await getReviewPreviewDTO({
    bankId,
    profileId: profile.id,
    reviewItemId,
    supabase,
  });
  if (!preview || !preview.bank.canManage) notFound();

  const { data: question, error } = await supabase
    .from("questions")
    .select(
      "id, content_source, content_html, solution_source, solution_html, options, answer_spec, question_type, difficulty_rating, title, updated_at",
    )
    .eq("id", preview.question.questionId)
    .eq("owner_bank_id", bankId)
    .eq("status", "draft")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!question) notFound();

  const options = normalizeQuestionOptions(question.options);
  const answerSpec = normalizeAnswerSpec(question.answer_spec);
  const returnHref = sanitizeTeacherBankReturnTo({
    bankId,
    rawReturnTo: query.returnTo,
    surface: "review",
  });

  return (
    <FocusWorkspaceShell
      badges={
        <>
          <BankBadge tone="sky">{preview.bank.name}</BankBadge>
          <BankBadge tone="amber">Draft changes</BankBadge>
        </>
      }
      description=""
      eyebrow=""
      returnHref={returnHref}
      returnSurfaceLabel="Review"
      title="Edit question"
    >
      <form className="space-y-7" id="review-question-editor">
        <input name="bankId" type="hidden" value={bankId} />
        <input
          name="questionId"
          type="hidden"
          value={preview.question.questionId}
        />

        <section className="grid gap-5 border-b border-slate-200 pb-7 md:grid-cols-[minmax(0,1fr)_11rem]">
          <div className="space-y-2">
            <Label htmlFor="review-edit-title">Title</Label>
            <Input
              defaultValue={question.title}
              id="review-edit-title"
              maxLength={240}
              name="title"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="review-edit-difficulty">Difficulty</Label>
            <Input
              defaultValue={question.difficulty_rating}
              id="review-edit-difficulty"
              max={1000}
              min={0}
              name="difficultyRating"
              required
              type="number"
            />
          </div>
        </section>

        <section className="space-y-2 border-b border-slate-200 pb-7">
          <Label htmlFor="review-edit-type">Question type</Label>
          <select
            className="min-h-11 w-full max-w-sm rounded-md border border-input bg-background px-3 text-sm"
            defaultValue={question.question_type}
            id="review-edit-type"
            name="question_type"
          >
            <option value="mcq">Multiple choice</option>
            <option value="fill_blank">Fill in the blank</option>
            <option value="frq">Free response</option>
            <option value="mixed">Mixed</option>
          </select>
        </section>

        <section className="space-y-2 border-b border-slate-200 pb-7">
          <Label htmlFor="review-edit-content">Question</Label>
          <textarea
            className="min-h-52 w-full rounded-md border border-input bg-background px-3 py-3 text-sm leading-6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
            defaultValue={
              question.content_source || stripHtml(question.content_html)
            }
            id="review-edit-content"
            maxLength={20000}
            name="contentSource"
            required
          />
        </section>

        {question.question_type === "mcq" ? (
          <section className="grid gap-5 border-b border-slate-200 pb-7 lg:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="review-edit-options">Options</Label>
              <textarea
                className="min-h-40 w-full rounded-md border border-input bg-background px-3 py-3 font-mono text-sm leading-6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                defaultValue={options
                  .map(
                    (option) =>
                      `${option.id}|${option.content_source ?? stripHtml(option.content_html)}`,
                  )
                  .join("\n")}
                id="review-edit-options"
                name="options_text"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="review-edit-correct">Correct option IDs</Label>
              <Input
                defaultValue={(answerSpec.correct_option_ids ?? []).join(", ")}
                id="review-edit-correct"
                name="correct_option_ids"
                required
              />
            </div>
          </section>
        ) : null}

        {question.question_type === "fill_blank" ? (
          <section className="grid gap-5 border-b border-slate-200 pb-7 lg:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="review-edit-final-answers">Final answers</Label>
              <textarea
                className="min-h-32 w-full rounded-md border border-input bg-background px-3 py-3 text-sm leading-6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                defaultValue={(answerSpec.final_answers ?? []).join("\n")}
                id="review-edit-final-answers"
                name="final_answers"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="review-edit-accepted-answers">
                Accepted answers
              </Label>
              <textarea
                className="min-h-32 w-full rounded-md border border-input bg-background px-3 py-3 text-sm leading-6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                defaultValue={(answerSpec.accepted_answers ?? []).join("\n")}
                id="review-edit-accepted-answers"
                name="accepted_answers"
              />
            </div>
          </section>
        ) : null}

        <section className="space-y-2 border-b border-slate-200 pb-7">
          <Label htmlFor="review-edit-solution">Explanation</Label>
          <textarea
            className="min-h-40 w-full rounded-md border border-input bg-background px-3 py-3 text-sm leading-6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
            defaultValue={
              question.solution_source || stripHtml(question.solution_html)
            }
            id="review-edit-solution"
            maxLength={20000}
            name="solutionSource"
          />
        </section>

        <LazyTeacherQuestionPreview
          bankId={bankId}
          id={reviewItemId}
          key={`${reviewItemId}:${question.updated_at}`}
          kind="review"
          label="Preview saved version"
          version={question.updated_at}
        />

        <div className="flex flex-wrap justify-end gap-3 border-t border-slate-200 pt-5">
          <FormSubmitButton
            formAction={editBankReviewDraftQuestion}
            pendingLabel="Saving…"
            variant="outline"
          >
            Save draft
          </FormSubmitButton>
          <FormSubmitButton
            formAction={publishBankReviewDraftChanges}
            pendingLabel="Publishing…"
          >
            Publish changes
          </FormSubmitButton>
        </div>
      </form>
    </FocusWorkspaceShell>
  );
}
