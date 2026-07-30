import Link from "next/link";
import Image from "next/image";
import { notFound, redirect } from "next/navigation";

import { AlertTriangle, Pencil, Upload } from "lucide-react";

import { FormSubmitButton } from "@/components/form-submit-button";
import {
  InlineMathText,
  OptionText,
  QuestionText,
  SolutionText,
} from "@/components/math-content";
import { QuestionAnswerSummary } from "@/components/question-answer-summary";
import { QuestionAssetsPanel } from "@/components/question-assets-panel";
import { QuestionSourceFilesPanel } from "@/components/question-source-files-panel";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FocusTaskLink } from "@/components/teacher/focus-task-link";
import {
  BulkRowCheckbox,
  BulkSelectAllCheckbox,
  CurrentPageSelectionProvider,
  ReviewBulkActionBar,
  type TeacherBulkSelectionItem,
} from "@/components/teacher/teacher-bulk-selection";
import { requireTeacher } from "@/lib/auth/guards";
import {
  getTeacherQuestionBankAccess,
  listBankReviewDraftQuestions,
  QuestionBankSchemaMissingError,
  teacherQuestionBankAccessLabel,
  type BankReviewDraftQuestion,
} from "@/lib/question-banks";
import {
  normalizeAnswerSpec,
  normalizeQuestionOptions,
} from "@/lib/questions/answer-spec";
import { createClient } from "@/lib/supabase/server";
import {
  sanitizeTeacherBankReturnTo,
} from "@/lib/teacher-focus-workspace";
import { cn } from "@/lib/utils";

import {
  approveBankReviewQuestion,
  approveBankReviewQuestions,
  editBankReviewDraftQuestion,
  markBankReviewDraftNeedsFix,
  rejectBankReviewDraftQuestion,
} from "../../actions";
import {
  cancelBankQuestionSourceFileUpload,
  createBankQuestionSourceFileSignedUrl,
  deleteBankQuestionAsset,
  deleteBankQuestionSourceFile,
  ensureBankQuestionDraftForSourceUpload,
  ensureBankQuestionDraftForUpload,
  finalizeBankQuestionAssetUpload,
  finalizeBankQuestionSourceFileUpload,
  reserveBankQuestionAssetUpload,
  reserveBankQuestionSourceFileUpload,
  updateBankQuestionAssetDisplay,
} from "../../bank-media-actions";
import {
  BankBadge,
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

function boundaryFindingLabel(kind: string) {
  const labels: Record<string, string> = {
    answer_alignment: "Check answer alignment",
    choices_only_fragment: "Check page boundary",
    cross_page_fragment: "Check page boundary",
    likely_duplicate: "Possible duplicate",
    packet_chunk_boundary_split: "Check page boundary",
    question_number_conflict: "Check question number",
    recovery_duplicate: "Possible duplicate",
    solution_only_fragment: "Check answer alignment",
    visual_association: "Check visual association",
  };

  return labels[kind] ?? "Structural review";
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
  const boundaryIssue = question.boundaryFindings.length > 0;
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
    ...question.boundaryFindings.map((finding) => finding.explanation),
  ];

  return {
    answerIssue,
    answerSpec,
    contentMissing,
    correctOptionIds,
    options,
    boundaryIssue,
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
          Library Review Draft scope is not available yet.
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
          Apply clean migration 0027 before approving drafts into a Library.
        </p>
        <Button asChild className="mt-5" variant="outline">
          <Link href="/teacher/banks">Back to Libraries</Link>
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
  searchParams: Promise<{
    error?: string;
    page?: string;
    q?: string;
    saved?: string;
    status?: string;
  }>;
}) {
  const profile = await requireTeacher();
  const { bankId } = await params;
  const query = await searchParams;
  const supabase = await createClient();
  let detail;
  const pageSize = 25;
  const page = Math.max(1, Number.parseInt(query.page ?? "1", 10) || 1);
  const reviewStatus =
    query.status === "needs_more_evidence" ||
    query.status === "pending_review"
      ? query.status
      : undefined;
  let draftPage;

  try {
    [detail, draftPage] = await Promise.all([
      getTeacherQuestionBankAccess({
        bankId,
        profileId: profile.id,
        supabase,
      }),
      listBankReviewDraftQuestions({
        bankId,
        page,
        pageSize,
        query: query.q,
        reviewStatus,
        supabase,
      }),
    ]);
  } catch (error) {
    if (error instanceof QuestionBankSchemaMissingError) {
      return <SetupNeededState />;
    }

    throw error;
  }

  if (!detail) {
    notFound();
  }

  const draftQuestions = draftPage.items;
  const totalPages = Math.max(1, Math.ceil(draftPage.total / pageSize));
  const { bank } = detail;
  const canApprove = detail.canManage;
  const accessLabel = teacherQuestionBankAccessLabel(detail);
  const assetActions = {
    deleteAsset: deleteBankQuestionAsset.bind(null, bank.id),
    ensureDraft: ensureBankQuestionDraftForUpload.bind(null, bank.id),
    finalizeUpload: finalizeBankQuestionAssetUpload.bind(null, bank.id),
    reserveUpload: reserveBankQuestionAssetUpload.bind(null, bank.id),
    updateDisplay: updateBankQuestionAssetDisplay.bind(null, bank.id),
  };
  const sourceFileActions = {
    cancelUpload: cancelBankQuestionSourceFileUpload.bind(null, bank.id),
    createSignedUrl: createBankQuestionSourceFileSignedUrl.bind(null, bank.id),
    deleteSourceFile: deleteBankQuestionSourceFile.bind(null, bank.id),
    ensureDraft: ensureBankQuestionDraftForSourceUpload.bind(null, bank.id),
    finalizeUpload: finalizeBankQuestionSourceFileUpload.bind(null, bank.id),
    reserveUpload: reserveBankQuestionSourceFileUpload.bind(null, bank.id),
  };
  const pageHref = (nextPage: number) => {
    const nextQuery = new URLSearchParams();
    if (query.q?.trim()) nextQuery.set("q", query.q.trim());
    if (reviewStatus) nextQuery.set("status", reviewStatus);
    if (nextPage > 1) nextQuery.set("page", String(nextPage));
    const suffix = nextQuery.toString();
    return `/teacher/banks/${bank.id}/review${suffix ? `?${suffix}` : ""}`;
  };
  if (page > totalPages) {
    redirect(pageHref(totalPages));
  }
  const reviewPreviewReturnTo = sanitizeTeacherBankReturnTo({
    bankId: bank.id,
    rawReturnTo: `/teacher/banks/${bank.id}/review${
      page > 1 || reviewStatus || Boolean(query.q?.trim())
        ? `?${new URLSearchParams({
            ...(page > 1 ? { page: String(page) } : {}),
            ...(reviewStatus ? { status: reviewStatus } : {}),
            ...(query.q?.trim() ? { q: query.q.trim() } : {}),
          }).toString()}`
        : ""
    }`,
    surface: "review",
  });
  const reviewBulkItems: TeacherBulkSelectionItem[] = draftQuestions.map(
    (question) => {
      const eligible =
        canApprove &&
        question.status === "draft" &&
        question.reviewItemStatus === "pending_review" &&
        question.lineageLinked &&
        Boolean(question.reviewItemId);

      return {
        disabledReason: eligible
          ? undefined
          : question.reviewItemStatus === "needs_more_evidence"
            ? "This draft is marked Needs fix and cannot be approved."
            : !question.lineageLinked
              ? "This draft requires lineage repair before approval."
              : "This draft is no longer pending approval.",
        eligible,
        id: question.id,
        label: `${question.question_code || "Code pending"} · ${question.title}`,
        previewId: question.reviewItemId ?? undefined,
      };
    },
  );
  const reviewBulkScopeKey = [
    bank.id,
    "review",
    page,
    reviewStatus ?? "all",
    query.q?.trim() ?? "",
  ].join(":");
  const approvableDraftCount = reviewBulkItems.filter(
    (item) => item.eligible,
  ).length;

  return (
    <BankWorkbenchPage>
      <section className="rounded-lg border bg-white shadow-sm">
        <BankSectionHeader
          action={
          <>
            <Button asChild variant="outline">
              <Link href={`/teacher/banks/${bank.id}`}>Back to Library</Link>
            </Button>
            {canApprove ? (
              <BankQuickAction
                href={`/teacher/banks/${bank.id}/imports`}
                icon={Upload}
              >
                Import material
              </BankQuickAction>
            ) : null}
          </>
        }
          description={`Access: ${accessLabel}. Approve drafts into this Library. This does not publish them to the public library or create an Assignment.`}
          eyebrow="Teacher QA queue · Library / Review"
          title={`Review Drafts for ${bank.name}`}
        />
      </section>

      <BankRouteTabs
        bankId={bank.id}
        currentUserRole={detail.currentUserRole}
      />

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

      <CurrentPageSelectionProvider
        action={approveBankReviewQuestions}
        bankId={bank.id}
        checkboxName="questionIds"
        fallbackFocusId="review-draft-results-focus"
        formId="review-bulk-approve-form"
        items={reviewBulkItems}
        key={reviewBulkScopeKey}
        returnTo={reviewPreviewReturnTo}
        scopeKey={reviewBulkScopeKey}
        totalResults={draftPage.total}
      >
      <section className="rounded-lg border border-slate-200/80 bg-white/85 shadow-[0_18px_48px_-40px_rgba(15,23,42,0.7)] ring-1 ring-slate-950/5 backdrop-blur">
        <BankSectionHeader
          description="Source lineage, taxonomy suggestions, and validation warnings remain attached for Library review."
          focusId="review-draft-results-focus"
          title="Pending private drafts"
        />
        <form className="grid gap-3 border-y border-slate-200 p-4 md:grid-cols-[minmax(14rem,1fr)_14rem_auto]">
          <div className="space-y-2">
            <Label htmlFor="review-draft-search">Search drafts</Label>
            <Input
              defaultValue={query.q ?? ""}
              id="review-draft-search"
              name="q"
              placeholder="Question code or title"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="review-draft-status">Review state</Label>
            <select
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              defaultValue={reviewStatus ?? ""}
              id="review-draft-status"
              name="status"
            >
              <option value="">All pending drafts</option>
              <option value="pending_review">Pending review</option>
              <option value="needs_more_evidence">Needs fix</option>
            </select>
          </div>
          <div className="flex items-end gap-2">
            <Button type="submit">Filter</Button>
            <Button asChild type="button" variant="outline">
              <Link href={`/teacher/banks/${bank.id}/review`}>Reset</Link>
            </Button>
          </div>
        </form>
        {canApprove && draftQuestions.length ? (
          <div className="flex min-h-12 items-center gap-2 border-b border-slate-200 px-4 py-1 text-sm font-semibold text-slate-700">
            <BulkSelectAllCheckbox
              label={`Select all ${approvableDraftCount} approvable Review Drafts on this page`}
            />
            <span>
              Select all {approvableDraftCount} approvable draft
              {approvableDraftCount === 1 ? "" : "s"} on this page
            </span>
          </div>
        ) : null}
        <div className="divide-y divide-slate-100">
          {draftQuestions.length ? (
            draftQuestions.map((question) => {
              const signals = buildDraftReviewSignals(question);
              const warningTotal = signals.warnings.length || question.warningCount;
              const canApproveQuestion =
                canApprove &&
                question.status === "draft" &&
                question.reviewItemStatus === "pending_review" &&
                question.lineageLinked;
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
                <article
                  className="relative space-y-4 p-5 pl-16"
                  key={question.id}
                >
                  {canApprove ? (
                    <div className="absolute left-3 top-4">
                      <BulkRowCheckbox itemId={question.id} />
                    </div>
                  ) : null}
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        {reviewItemStatusBadge(question.reviewItemStatus) ?? (
                          <BankBadge tone="amber">Review required</BankBadge>
                        )}
                        {warningTotal ? (
                          <BankBadge tone="rose">
                            {warningTotal} warning
                            {warningTotal === 1 ? "" : "s"}
                          </BankBadge>
                        ) : (
                          <BankBadge tone="cyan">No warnings</BankBadge>
                        )}
                        {!question.lineageLinked ? (
                          <BankBadge tone="rose">
                            Lineage repair required
                          </BankBadge>
                        ) : null}
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
                      {question.reviewItemId ? (
                        <>
                          <FocusTaskLink
                            className={cn(
                              buttonVariants({
                                size: "sm",
                                variant: "outline",
                              }),
                              "h-auto min-h-11 whitespace-normal",
                            )}
                            fallbackFocusId="review-draft-results-focus"
                            href={`/teacher/banks/${bank.id}/review/${question.reviewItemId}`}
                            newTabLabel="Open Review Draft preview in new tab"
                            returnTo={reviewPreviewReturnTo}
                            taskKind="review-preview"
                            triggerId={`review-preview-${question.reviewItemId}`}
                          >
                            Preview
                          </FocusTaskLink>
                        </>
                      ) : null}
                    </div>
                  </div>

                  <details className="group rounded-xl border border-slate-200 bg-white shadow-sm">
                    <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-xl px-4 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-50">
                      <Pencil aria-hidden="true" className="h-4 w-4" />
                      More review actions and supporting details
                    </summary>
                    <div className="space-y-4 border-t border-slate-100 p-4">
                      {canApproveQuestion ? (
                        <form
                          action={approveBankReviewQuestion}
                          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3"
                        >
                          <input name="bankId" type="hidden" value={bank.id} />
                          <input
                            name="questionId"
                            type="hidden"
                            value={question.id}
                          />
                          <p className="text-sm leading-6 text-emerald-900">
                            Approval adds this reviewed draft to the Library. It
                            does not publish or assign it.
                          </p>
                          <FormSubmitButton pendingLabel="Approving...">
                            Approve into Library
                          </FormSubmitButton>
                        </form>
                      ) : null}
                      {canApprove && !question.lineageLinked ? (
                        <p className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm font-semibold leading-6 text-rose-800">
                          Approval is blocked until this draft is relinked to
                          its Review item.
                        </p>
                      ) : null}

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
                      You can inspect this draft, but only Library owners and
                      editors can edit, reject, or approve Review Drafts.
                    </div>
                  )}

                  <details
                    className="group rounded-xl border border-slate-200 bg-white shadow-sm"
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

                      {question.boundaryFindings.length ? (
                        <div className={reviewPanelClass(signals.boundaryIssue)}>
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <h4 className="text-sm font-bold text-slate-950">
                              Structural source checks
                            </h4>
                            <BankBadge tone="amber">
                              Source review recommended
                            </BankBadge>
                          </div>
                          <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-700">
                            {question.boundaryFindings.map((finding) => (
                              <li key={finding.findingId}>
                                <p className="font-semibold text-slate-950">
                                  {boundaryFindingLabel(finding.issueKind)}
                                </p>
                                <InlineMathText
                                  className="mt-1 leading-6"
                                  compact
                                  value={finding.explanation}
                                />
                                <p className="text-xs text-slate-500">
                                  {finding.visibleQuestionNumbers.length
                                    ? `Question ${finding.visibleQuestionNumbers.join(", ")}`
                                    : "Question number unavailable"}
                                  {finding.pageRefs.length
                                    ? ` | Pages ${finding.pageRefs.join(", ")}`
                                    : ""}
                                </p>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}

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

                  <details className="group rounded-xl border border-slate-200 bg-white shadow-sm">
                    <summary className="flex min-h-12 cursor-pointer list-none flex-wrap items-center justify-between gap-3 rounded-xl px-4 py-3 text-sm font-bold text-slate-950 transition hover:bg-slate-50">
                      <span>Source, images, and provenance</span>
                      <span className="text-xs font-semibold text-slate-500 group-open:hidden">
                        Open only when needed
                      </span>
                      <span className="hidden text-xs font-semibold text-slate-500 group-open:inline">
                        Hide supporting details
                      </span>
                    </summary>
                  <div className="space-y-4 border-t border-slate-100 p-4">
                  <section className="grid gap-3 lg:grid-cols-2">
                    {canApprove ? (
                      <>
                        <QuestionAssetsPanel
                          actions={assetActions}
                          initialAssets={question.assets}
                          questionId={question.id}
                        />
                        <QuestionSourceFilesPanel
                          actions={sourceFileActions}
                          initialSourceFiles={question.sourceFiles}
                          questionId={question.id}
                        />
                      </>
                    ) : (
                      <>
                        <div className="space-y-3 rounded-md border bg-muted/20 p-3 text-sm">
                          <p className="font-medium">
                            Reviewed images: {question.assets.length}
                          </p>
                          {question.assets.length ? (
                            <div className="grid grid-cols-2 gap-2">
                              {question.assets.map((asset) => (
                                <figure
                                  className="overflow-hidden rounded border bg-white"
                                  key={asset.id}
                                >
                                  <Image
                                    alt={asset.originalFilename}
                                    className="h-24 w-full object-contain"
                                    height={96}
                                    src={asset.publicUrl}
                                    width={160}
                                  />
                                  <figcaption className="truncate border-t px-2 py-1 text-xs">
                                    {asset.originalFilename}
                                  </figcaption>
                                </figure>
                              ))}
                            </div>
                          ) : null}
                          <p className="mt-1 text-xs text-muted-foreground">
                            Viewer access can inspect the draft but cannot
                            upload, hide, or delete images.
                          </p>
                        </div>
                        <div className="space-y-2 rounded-md border bg-muted/20 p-3 text-sm">
                          <p className="font-medium">
                            Private source files: {question.sourceFiles.length}
                          </p>
                          {question.sourceFiles.length ? (
                            <ul className="space-y-1 text-xs">
                              {question.sourceFiles.map((sourceFile) => (
                                <li
                                  className="truncate rounded border bg-white px-2 py-1.5"
                                  key={sourceFile.id}
                                >
                                  {sourceFile.originalFilename}
                                </li>
                              ))}
                            </ul>
                          ) : null}
                          <p className="mt-1 text-xs text-muted-foreground">
                            Source-file download and mutation require an owner
                            or editor capability.
                          </p>
                        </div>
                      </>
                    )}
                  </section>

                  <div className="grid gap-3 lg:grid-cols-[1fr_0.8fr]">
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
                      Approval adds this question to {bank.name}. It stays
                      private to this Library and is not globally published.
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
                            Target Library: <span className="font-semibold">{bank.name}</span>
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
                  </div>
                  </details>
                    </div>
                  </details>
                </article>
              );
            })
          ) : (
            <div className="p-8 text-center">
              <p className="teacher-eyebrow">No pending drafts</p>
              <h3 className="mt-2 text-xl font-bold text-slate-950">
                This Library has no private Review Drafts waiting.
              </h3>
              <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                Import material into the Library to create review-gated draft
                questions.
              </p>
              {canApprove ? (
                <Button asChild className="mt-5" variant="outline">
                  <Link href={`/teacher/banks/${bank.id}/imports`}>
                    Import material
                  </Link>
                </Button>
              ) : null}
            </div>
          )}
        </div>
        {draftPage.total ? (
          <div className="flex items-center justify-between border-t border-slate-200 p-4 text-sm">
            <span>
              {draftPage.total} result{draftPage.total === 1 ? "" : "s"} · Page{" "}
              {page} of {totalPages}
            </span>
            <div className="flex gap-2">
              <Button asChild disabled={page <= 1} size="sm" variant="outline">
                <Link href={pageHref(Math.max(1, page - 1))}>Previous</Link>
              </Button>
              <Button
                asChild
                disabled={page >= totalPages}
                size="sm"
                variant="outline"
              >
                <Link href={pageHref(Math.min(totalPages, page + 1))}>Next</Link>
              </Button>
            </div>
          </div>
        ) : null}
        {canApprove ? (
          <ReviewBulkActionBar
            bankId={bank.id}
            returnTo={reviewPreviewReturnTo}
          />
        ) : null}
      </section>
      </CurrentPageSelectionProvider>
    </BankWorkbenchPage>
  );
}
