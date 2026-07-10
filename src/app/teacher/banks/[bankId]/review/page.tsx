import Link from "next/link";
import { notFound } from "next/navigation";

import { AlertTriangle, ClipboardCheck, FileText, Pencil, Upload } from "lucide-react";

import { FormSubmitButton } from "@/components/form-submit-button";
import {
  OptionText,
  QuestionText,
  SolutionText,
} from "@/components/math-content";
import { QuestionAnswerSummary } from "@/components/question-answer-summary";
import { Button } from "@/components/ui/button";
import { TeacherWorkspaceNav } from "@/components/teacher/teacher-workspace-nav";
import { requireTeacher } from "@/lib/auth/guards";
import {
  bankMemberRoleLabel,
  canManageBankContent,
  getTeacherQuestionBankDetail,
  listBankReviewDraftQuestions,
  QuestionBankSchemaMissingError,
  questionBankVisibilityLabel,
  type BankReviewDraftQuestion,
} from "@/lib/question-banks";
import {
  normalizeAnswerSpec,
  normalizeQuestionOptions,
} from "@/lib/questions/answer-spec";
import { createClient } from "@/lib/supabase/server";

import {
  approveBankReviewQuestion,
  editBankReviewDraftQuestion,
  markBankReviewDraftNeedsFix,
  rejectBankReviewDraftQuestion,
} from "../../actions";
import {
  BankBadge,
  BankHeroPanel,
  BankMetricCard,
  BankQuickAction,
  BankRouteTabs,
  BankSectionHeader,
  BankWorkbenchPage,
} from "../../bank-ui";

export const dynamic = "force-dynamic";

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleString() : "Unknown";
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function reviewPanelClass(hasIssue: boolean) {
  return [
    "rounded-xl border p-4",
    hasIssue
      ? "border-rose-200 bg-rose-50/70 ring-1 ring-rose-100"
      : "border-slate-200 bg-slate-50/80",
  ].join(" ");
}

function stripHtmlForTextarea(value: string | null | undefined) {
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

function draftSourceValue({
  html,
  source,
}: {
  html: string | null | undefined;
  source: string | null | undefined;
}) {
  return source?.trim() || stripHtmlForTextarea(html);
}

function reviewItemStatusBadge(status: BankReviewDraftQuestion["reviewItemStatus"]) {
  if (status === "needs_more_evidence") {
    return <BankBadge tone="amber">Needs fix</BankBadge>;
  }

  if (status === "pending_review") {
    return <BankBadge tone="amber">Pending review</BankBadge>;
  }

  return null;
}

function buildDraftReviewSignals(question: BankReviewDraftQuestion) {
  const options = normalizeQuestionOptions(question.options);
  const answerSpec = normalizeAnswerSpec(question.answer_spec);
  const correctOptionIds = new Set(answerSpec.correct_option_ids ?? []);
  const contentMissing = !question.content_html?.trim();
  const solutionMissing = !question.solution_html?.trim();
  const taxonomyMissing = question.tagSummaries.length === 0;
  const mcqAnswerIssue =
    question.question_type === "mcq" &&
    (!options.length ||
      answerSpec.kind !== "mcq" ||
      !(answerSpec.correct_option_ids ?? []).length);
  const fillBlankAnswerIssue =
    question.question_type === "fill_blank" &&
    answerSpec.kind === "fill_blank" &&
    !(answerSpec.final_answers ?? []).length &&
    !(answerSpec.accepted_answers ?? []).length;
  const answerIssue =
    mcqAnswerIssue ||
    fillBlankAnswerIssue ||
    (question.question_type === "fill_blank" && answerSpec.kind !== "fill_blank");
  const derivedWarnings = [
    contentMissing ? "Question prompt is missing." : "",
    solutionMissing ? "Solution or explanation is missing." : "",
    taxonomyMissing ? "No taxonomy suggestions are attached yet." : "",
    question.reviewItemStatus === "needs_more_evidence"
      ? "This draft was marked needs fix by a reviewer."
      : "",
    mcqAnswerIssue
      ? "MCQ needs options and a reliable correct option before approval."
      : "",
    fillBlankAnswerIssue
      ? "Fill-blank question needs final or accepted answers before approval."
      : "",
  ];

  return {
    answerIssue,
    answerSpec,
    contentMissing,
    correctOptionIds,
    options,
    solutionMissing,
    taxonomyMissing,
    warnings: uniqueStrings([
      ...question.warningMessages,
      ...derivedWarnings,
    ]),
  };
}

function SetupNeededState() {
  return (
    <BankWorkbenchPage>
      <section className="rounded-lg border border-slate-200/80 bg-white/90 p-6 shadow-sm">
        <p className="student-eyebrow">Setup needed</p>
        <h1 className="mt-2 text-2xl font-bold text-slate-950">
          Bank Review Draft scope is not available yet.
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
          Apply clean migration 0027 before approving drafts into a bank.
        </p>
        <Button asChild className="mt-5" variant="outline">
          <Link href="/teacher/banks">Back to Banks / Library</Link>
        </Button>
      </section>
    </BankWorkbenchPage>
  );
}

export default async function TeacherBankReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ bankId: string }>;
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const profile = await requireTeacher();
  const { bankId } = await params;
  const query = await searchParams;
  const supabase = await createClient();
  let detail;
  let draftQuestions = [];

  try {
    detail = await getTeacherQuestionBankDetail({
      bankId,
      profileId: profile.id,
      supabase,
    });
    draftQuestions = await listBankReviewDraftQuestions({ bankId, supabase });
  } catch (error) {
    if (error instanceof QuestionBankSchemaMissingError) {
      return <SetupNeededState />;
    }

    throw error;
  }

  if (!detail) {
    notFound();
  }

  const { bank, currentUserRole } = detail;
  const canApprove = canManageBankContent(currentUserRole);
  const warningCount = draftQuestions.reduce(
    (sum, question) => sum + question.warningCount,
    0,
  );

  return (
    <BankWorkbenchPage>
      <BankHeroPanel
        actions={
          <>
            <Button asChild variant="outline">
              <Link href={`/teacher/banks/${bank.id}`}>Back to bank</Link>
            </Button>
            <BankQuickAction
              href={`/teacher/banks/${bank.id}/imports`}
              icon={Upload}
            >
              Import material
            </BankQuickAction>
          </>
        }
        badges={
          <>
            <BankBadge tone="sky">
              {questionBankVisibilityLabel(bank.visibility)}
            </BankBadge>
            <BankBadge tone="blue">
              {bankMemberRoleLabel(currentUserRole ?? "viewer")}
            </BankBadge>
          </>
        }
        eyebrow="Teacher QA queue"
        title={`Review Drafts for ${bank.name}`}
      >
        <p>
          Approve drafts into this bank. This does not publish them to the
          public library.
        </p>
        <p className="mt-2 text-sm text-slate-600">
          Approval adds reviewed content to this bank only and does not create
          an assignment.
        </p>
      </BankHeroPanel>

      <TeacherWorkspaceNav />
      <BankRouteTabs bankId={bank.id} />

      {query.saved ? (
        <section className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">
          {query.saved}
        </section>
      ) : null}
      {query.error ? (
        <section className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-800">
          {query.error}
        </section>
      ) : null}

      <section className="grid gap-3 md:grid-cols-3">
        <BankMetricCard
          description="Draft questions scoped to this bank."
          icon={ClipboardCheck}
          label="Pending drafts"
          value={draftQuestions.length}
        />
        <BankMetricCard
          description="Warnings to inspect before approval."
          icon={AlertTriangle}
          label="Warnings"
          value={warningCount}
        />
        <BankMetricCard
          description="Only owners and editors can approve into a bank."
          icon={FileText}
          label="Review role"
          value={canApprove ? "Can approve" : "Read-only"}
        />
      </section>

      <section className="rounded-lg border border-slate-200/80 bg-white/85 shadow-[0_18px_48px_-40px_rgba(15,23,42,0.7)] ring-1 ring-slate-950/5 backdrop-blur">
        <BankSectionHeader
          description="Source lineage, taxonomy suggestions, and validation warnings remain attached for bank-level review."
          title="Pending private drafts"
        />
        <div className="divide-y divide-slate-100">
          {draftQuestions.length ? (
            draftQuestions.map((question) => {
              const signals = buildDraftReviewSignals(question);
              const warningTotal = signals.warnings.length || question.warningCount;
              const editPanelId = `edit-${question.id}`;
              const contentSource = draftSourceValue({
                html: question.content_html,
                source: question.content_source,
              });
              const solutionSource = draftSourceValue({
                html: question.solution_html,
                source: question.solution_source,
              });
              const lineagePayload = asRecord(question.reviewItemPayload);
              const blueprintTitle = stringValue(lineagePayload.blueprintTitle);
              const blueprintId = stringValue(lineagePayload.blueprintId);
              const sourceQuestionCount = stringValue(lineagePayload.sourceQuestionCount);
              const generatedFromBlueprint =
                question.source_kind === "blueprint_generation" ||
                stringValue(lineagePayload.source) === "blueprint_generation";

              return (
                <article className="space-y-4 p-5" key={question.id}>
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <BankBadge tone="amber">Review required</BankBadge>
                        {reviewItemStatusBadge(question.reviewItemStatus)}
                        <BankBadge>{question.question_type}</BankBadge>
                        <BankBadge tone="slate">
                          Difficulty {question.difficulty_rating}
                        </BankBadge>
                        {warningTotal ? (
                          <BankBadge tone="rose">
                            {warningTotal} warning
                            {warningTotal === 1 ? "" : "s"}
                          </BankBadge>
                        ) : (
                          <BankBadge tone="cyan">No warnings</BankBadge>
                        )}
                      </div>
                      <h3 className="text-lg font-bold text-slate-950">
                        {question.title}
                      </h3>
                      <p className="text-xs text-slate-500">
                        {question.question_code || "Code pending"} -{" "}
                        {formatDate(question.created_at)}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {canApprove ? (
                        <Button asChild variant="outline">
                          <a href={`#${editPanelId}`}>
                            <Pencil aria-hidden="true" className="h-4 w-4" />
                            Edit draft
                          </a>
                        </Button>
                      ) : null}
                      {canApprove ? (
                        <form action={approveBankReviewQuestion}>
                          <input name="bankId" type="hidden" value={bank.id} />
                          <input
                            name="questionId"
                            type="hidden"
                            value={question.id}
                          />
                          <FormSubmitButton pendingLabel="Approving...">
                            Approve into bank
                          </FormSubmitButton>
                        </form>
                      ) : null}
                    </div>
                  </div>

                  {canApprove ? (
                    <details
                      className="group rounded-xl border border-sky-200 bg-sky-50/60 shadow-sm"
                      id={editPanelId}
                    >
                      <summary className="flex min-h-12 cursor-pointer list-none flex-wrap items-center justify-between gap-3 rounded-xl px-4 py-3 text-sm font-bold text-slate-950 transition hover:bg-sky-50">
                        <span>Edit Review Draft before approval</span>
                        <span className="text-xs font-semibold text-slate-500 group-open:hidden">
                          Draft-only changes
                        </span>
                        <span className="hidden text-xs font-semibold text-slate-500 group-open:inline">
                          Hide edit form
                        </span>
                      </summary>
                      <div className="space-y-4 border-t border-sky-100 p-4">
                        <p className="text-sm leading-6 text-slate-700">
                          Edit changes this private draft only. Approval still
                          moves the reviewed draft into the bank; students never
                          see Review Drafts.
                        </p>
                        <form
                          action={editBankReviewDraftQuestion}
                          className="grid gap-4 lg:grid-cols-2"
                        >
                          <input name="bankId" type="hidden" value={bank.id} />
                          <input
                            name="questionId"
                            type="hidden"
                            value={question.id}
                          />
                          <label className="space-y-1 text-sm font-semibold text-slate-800 lg:col-span-2">
                            <span>Title</span>
                            <input
                              className="min-h-11 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-950 shadow-sm focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100"
                              defaultValue={question.title}
                              name="title"
                              required
                            />
                          </label>
                          <label className="space-y-1 text-sm font-semibold text-slate-800">
                            <span>Question prompt</span>
                            <textarea
                              className="min-h-44 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm leading-6 text-slate-900 shadow-sm focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100"
                              defaultValue={contentSource}
                              name="contentSource"
                              required
                            />
                            <span className="block text-xs font-normal leading-5 text-slate-500">
                              Plain text, Markdown, and LaTeX are accepted.
                            </span>
                          </label>
                          <label className="space-y-1 text-sm font-semibold text-slate-800">
                            <span>Solution / explanation</span>
                            <textarea
                              className="min-h-44 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm leading-6 text-slate-900 shadow-sm focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100"
                              defaultValue={solutionSource}
                              name="solutionSource"
                            />
                            <span className="block text-xs font-normal leading-5 text-slate-500">
                              Missing solution guidance will remain a warning.
                            </span>
                          </label>
                          <label className="space-y-1 text-sm font-semibold text-slate-800">
                            <span>Difficulty</span>
                            <input
                              className="min-h-11 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-950 shadow-sm focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100"
                              defaultValue={question.difficulty_rating}
                              max={1000}
                              min={0}
                              name="difficultyRating"
                              required
                              type="number"
                            />
                          </label>
                          <div className="flex items-end justify-start lg:justify-end">
                            <FormSubmitButton pendingLabel="Saving draft...">
                              Save draft changes
                            </FormSubmitButton>
                          </div>
                        </form>

                        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                          <p className="text-sm font-bold text-amber-950">
                            Need more work or reject the draft?
                          </p>
                          <p className="mt-1 text-sm leading-6 text-amber-900">
                            Needs-fix and reject actions do not publish
                            anything. Needs-fix keeps the draft private for
                            editing. Reject archives the draft and removes it
                            from this pending queue.
                          </p>
                          <div className="mt-4 grid gap-3 xl:grid-cols-2">
                            <form
                              action={markBankReviewDraftNeedsFix}
                              className="space-y-2 rounded-lg border border-amber-200 bg-white/80 p-3"
                            >
                              <input
                                name="bankId"
                                type="hidden"
                                value={bank.id}
                              />
                              <input
                                name="questionId"
                                type="hidden"
                                value={question.id}
                              />
                              <label className="space-y-1 text-xs font-semibold text-slate-700">
                                <span>Fix note</span>
                                <textarea
                                  className="min-h-20 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-100"
                                  name="reason"
                                  placeholder="What needs to be corrected before approval?"
                                />
                              </label>
                              <FormSubmitButton
                                pendingLabel="Marking..."
                                variant="outline"
                              >
                                Mark needs fix
                              </FormSubmitButton>
                            </form>
                            <form
                              action={rejectBankReviewDraftQuestion}
                              className="space-y-2 rounded-lg border border-rose-200 bg-white/80 p-3"
                            >
                              <input
                                name="bankId"
                                type="hidden"
                                value={bank.id}
                              />
                              <input
                                name="questionId"
                                type="hidden"
                                value={question.id}
                              />
                              <label className="space-y-1 text-xs font-semibold text-slate-700">
                                <span>Reject reason</span>
                                <textarea
                                  className="min-h-20 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-100"
                                  name="reason"
                                  placeholder="Why should this draft be archived?"
                                />
                              </label>
                              <FormSubmitButton
                                pendingLabel="Rejecting..."
                                variant="destructive"
                              >
                                Reject and archive
                              </FormSubmitButton>
                            </form>
                          </div>
                        </div>
                      </div>
                    </details>
                  ) : (
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-700">
                      You can inspect this draft, but only bank owners and
                      editors can edit, reject, or approve Review Drafts.
                    </div>
                  )}

                  <details
                    className="group rounded-xl border border-slate-200 bg-white shadow-sm"
                    open={Boolean(warningTotal)}
                  >
                    <summary className="flex min-h-12 cursor-pointer list-none flex-wrap items-center justify-between gap-3 rounded-xl px-4 py-3 text-sm font-bold text-slate-950 transition hover:bg-slate-50">
                      <span>
                        Open question review
                        {warningTotal ? (
                          <span className="ml-2 rounded-full bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-700 ring-1 ring-rose-100">
                            inspect warnings
                          </span>
                        ) : null}
                      </span>
                      <span className="text-xs font-semibold text-slate-500 group-open:hidden">
                        View prompt, answer, warnings
                      </span>
                      <span className="hidden text-xs font-semibold text-slate-500 group-open:inline">
                        Hide details
                      </span>
                    </summary>

                    <div className="space-y-4 border-t border-slate-100 p-4">
                      {signals.warnings.length ? (
                        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm leading-6 text-rose-900">
                          <div className="flex items-start gap-2">
                            <AlertTriangle
                              aria-hidden="true"
                              className="mt-0.5 h-4 w-4 shrink-0"
                            />
                            <div>
                              <p className="font-bold">
                                Check these before approval
                              </p>
                              <ul className="mt-2 list-disc space-y-1 pl-5">
                                {signals.warnings.map((warning) => (
                                  <li key={warning}>{warning}</li>
                                ))}
                              </ul>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">
                          No validation warnings are attached to this draft.
                        </div>
                      )}

                      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
                        <div className={reviewPanelClass(signals.contentMissing)}>
                          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                            <h4 className="text-sm font-bold text-slate-950">
                              Question prompt
                            </h4>
                            {signals.contentMissing ? (
                              <BankBadge tone="rose">Missing prompt</BankBadge>
                            ) : null}
                          </div>
                          {question.content_html ? (
                            <QuestionText value={question.content_html} />
                          ) : (
                            <p className="text-sm font-semibold text-rose-800">
                              No prompt content was stored for this draft.
                            </p>
                          )}
                        </div>

                        <div className={reviewPanelClass(signals.answerIssue)}>
                          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                            <h4 className="text-sm font-bold text-slate-950">
                              Answer and options
                            </h4>
                            {signals.answerIssue ? (
                              <BankBadge tone="rose">Needs answer review</BankBadge>
                            ) : null}
                          </div>
                          {signals.options.length ? (
                            <ol className="space-y-2">
                              {signals.options.map((option) => {
                                const correct =
                                  signals.correctOptionIds.has(option.id);

                                return (
                                  <li
                                    className={[
                                      "rounded-lg border bg-white p-3 text-sm",
                                      correct
                                        ? "border-emerald-200 ring-1 ring-emerald-100"
                                        : "border-slate-200",
                                    ].join(" ")}
                                    key={option.id}
                                  >
                                    <div className="flex items-start gap-2">
                                      <span
                                        className={[
                                          "flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                                          correct
                                            ? "bg-emerald-100 text-emerald-800"
                                            : "bg-slate-100 text-slate-700",
                                        ].join(" ")}
                                      >
                                        {option.label || option.id}
                                      </span>
                                      <div className="min-w-0 flex-1">
                                        <OptionText
                                          className="border-none bg-transparent p-0"
                                          value={
                                            option.content_source ??
                                            option.content_html
                                          }
                                        />
                                        {correct ? (
                                          <p className="mt-1 text-xs font-semibold text-emerald-700">
                                            Marked correct
                                          </p>
                                        ) : null}
                                      </div>
                                    </div>
                                  </li>
                                );
                              })}
                            </ol>
                          ) : (
                            <p className="text-sm font-semibold text-rose-800">
                              No options are stored for this draft.
                            </p>
                          )}
                          <div className="mt-3">
                            <QuestionAnswerSummary
                              answerSpec={question.answer_spec}
                              options={question.options}
                              questionType={question.question_type}
                            />
                          </div>
                        </div>

                        <div className={reviewPanelClass(signals.solutionMissing)}>
                          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                            <h4 className="text-sm font-bold text-slate-950">
                              Solution / explanation
                            </h4>
                            {signals.solutionMissing ? (
                              <BankBadge tone="rose">Missing solution</BankBadge>
                            ) : null}
                          </div>
                          {question.solution_html ? (
                            <SolutionText value={question.solution_html} />
                          ) : (
                            <p className="text-sm font-semibold text-rose-800">
                              No solution or explanation was stored for this
                              draft.
                            </p>
                          )}
                        </div>

                        <div className={reviewPanelClass(signals.taxonomyMissing)}>
                          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                            <h4 className="text-sm font-bold text-slate-950">
                              Taxonomy suggestions
                            </h4>
                            {signals.taxonomyMissing ? (
                              <BankBadge tone="amber">No taxonomy</BankBadge>
                            ) : null}
                          </div>
                          {question.tagSummaries.length ? (
                            <div className="flex flex-wrap gap-2">
                              {question.tagSummaries.slice(0, 12).map((tag) => (
                                <span
                                  className="max-w-full rounded-full bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-800 ring-1 ring-sky-100"
                                  key={tag.tag_id}
                                  title={tag.tag_id}
                                >
                                  {tag.facet_key ? `${tag.facet_key}: ` : ""}
                                  {tag.label || tag.tag_id}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <p className="text-sm font-semibold text-amber-900">
                              No taxonomy suggestion is attached yet.
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  </details>

                  <div className="grid gap-3 lg:grid-cols-[1fr_0.8fr]">
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
                      Approval adds this question to {bank.name}. It stays
                      bank-scoped and is not globally published.
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-700">
                      {generatedFromBlueprint ? (
                        <>
                          <div className="flex flex-wrap items-center gap-2">
                            <BankBadge tone="sky">Generated from Blueprint</BankBadge>
                            {blueprintTitle ? (
                              <span className="font-semibold text-slate-950">
                                {blueprintTitle}
                              </span>
                            ) : null}
                          </div>
                          <p className="mt-2">
                            Target Bank: <span className="font-semibold">{bank.name}</span>
                            {sourceQuestionCount ? (
                              <>
                                {" "}
                                / Source examples:{" "}
                                <span className="font-semibold">
                                  {sourceQuestionCount}
                                </span>
                              </>
                            ) : null}
                          </p>
                          {blueprintId ? (
                            <Link
                              className="mt-1 inline-flex text-xs font-semibold text-sky-700 underline-offset-4 hover:underline"
                              href={`/teacher/blueprints/${blueprintId}`}
                            >
                              Open source Blueprint
                            </Link>
                          ) : null}
                        </>
                      ) : (
                        <>
                          Source lineage:{" "}
                          <span className="font-semibold">
                            {question.source_kind || question.source || "import"}
                          </span>
                        </>
                      )}
                      {question.source_review_item_id ? (
                        <span className="mt-1 block break-all text-xs text-slate-500">
                          Review item {question.source_review_item_id}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </article>
              );
            })
          ) : (
            <div className="p-8 text-center">
              <p className="teacher-eyebrow">No pending drafts</p>
              <h3 className="mt-2 text-xl font-bold text-slate-950">
                This bank has no private Review Drafts waiting.
              </h3>
              <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                Import material into the bank to create review-gated draft
                questions.
              </p>
              <Button asChild className="mt-5" variant="outline">
                <Link href={`/teacher/banks/${bank.id}/imports`}>
                  Import material
                </Link>
              </Button>
            </div>
          )}
        </div>
      </section>
    </BankWorkbenchPage>
  );
}
