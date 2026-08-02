import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { MoreHorizontal } from "lucide-react";

import { FormSubmitButton } from "@/components/form-submit-button";
import { LazyTeacherQuestionPreview } from "@/components/teacher/lazy-teacher-question-preview";
import {
  BulkRowCheckbox,
  BulkSelectAllCheckbox,
  CurrentPageSelectionProvider,
  ReviewBulkActionBar,
  type TeacherBulkSelectionItem,
} from "@/components/teacher/teacher-bulk-selection";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requireTeacher } from "@/lib/auth/guards";
import {
  getTeacherQuestionBankAccess,
  listBankReviewQuestionSummaries,
  QuestionBankSchemaMissingError,
} from "@/lib/question-banks";
import { createClient } from "@/lib/supabase/server";
import {
  sanitizeTeacherBankReturnTo,
} from "@/lib/teacher-focus-workspace";
import { cn } from "@/lib/utils";

import {
  approveBankReviewQuestion,
  approveBankReviewQuestions,
  approveCurrentBankReviewPage,
  markBankReviewDraftNeedsFix,
  rejectBankReviewDraftQuestion,
} from "../../actions";
import {
  BankBadge,
  BankRouteTabs,
  BankWorkbenchPage,
} from "../../bank-ui";

export const dynamic = "force-dynamic";

function SetupNeededState() {
  return (
    <BankWorkbenchPage>
      <header className="teacher-page-header">
        <h1 className="text-3xl font-bold tracking-tight text-slate-950">
          Review
        </h1>
      </header>
      <section className="border-y border-slate-200 bg-white py-10 text-center">
        <p className="font-semibold text-slate-900">
          Library setup is not available.
        </p>
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
  const pageSize = 25;
  const page = Math.max(1, Number.parseInt(query.page ?? "1", 10) || 1);
  const reviewStatus =
    query.status === "needs_more_evidence" ||
    query.status === "pending_review"
      ? query.status
      : undefined;
  let detail;
  let draftPage;

  try {
    [detail, draftPage] = await Promise.all([
      getTeacherQuestionBankAccess({
        bankId,
        profileId: profile.id,
        supabase,
      }),
      listBankReviewQuestionSummaries({
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

  if (!detail) notFound();

  const { bank } = detail;
  const canApprove = detail.canManage;
  const totalPages = Math.max(1, Math.ceil(draftPage.total / pageSize));
  const pageHref = (nextPage: number) => {
    const nextQuery = new URLSearchParams();
    if (query.q?.trim()) nextQuery.set("q", query.q.trim());
    if (reviewStatus) nextQuery.set("status", reviewStatus);
    if (nextPage > 1) nextQuery.set("page", String(nextPage));
    const suffix = nextQuery.toString();
    return `/teacher/banks/${bank.id}/review${suffix ? `?${suffix}` : ""}`;
  };

  if (page > totalPages) redirect(pageHref(totalPages));

  const returnTo = sanitizeTeacherBankReturnTo({
    bankId: bank.id,
    rawReturnTo: pageHref(page),
    surface: "review",
  });
  const selectionItems: TeacherBulkSelectionItem[] = draftPage.items.map(
    (question) => ({
      disabledReason: question.publishable
        ? undefined
        : question.hardErrors[0] ?? "Fix this question before approval.",
      eligible: canApprove && question.publishable,
      id: question.id,
      label: `${question.questionCode} · ${question.title}`,
      previewId: question.reviewItemId ?? undefined,
    }),
  );
  const publishableQuestions = draftPage.items.filter(
    (question) => canApprove && question.publishable,
  );
  const blockedCount = draftPage.items.length - publishableQuestions.length;
  const scopeKey = [
    bank.id,
    "review",
    page,
    reviewStatus ?? "all",
    query.q?.trim() ?? "",
  ].join(":");

  return (
    <BankWorkbenchPage>
      <header className="teacher-page-header">
        <div>
          <h1 className="text-3xl font-semibold tracking-[-0.03em] text-[#1D1D1F]">
            Review
          </h1>
          <p className="mt-1 text-sm font-medium text-[#6E6E73]">{bank.name}</p>
        </div>
      </header>

      <BankRouteTabs
        bankId={bank.id}
        currentUserRole={detail.currentUserRole}
      />

      {query.saved ? (
        <p
          className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900"
          role="status"
        >
          {query.saved}
        </p>
      ) : null}
      {query.error ? (
        <p
          className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-900"
          role="alert"
        >
          {query.error}
        </p>
      ) : null}

      <CurrentPageSelectionProvider
        action={approveBankReviewQuestions}
        bankId={bank.id}
        checkboxName="questionIds"
        fallbackFocusId="review-results"
        formId="review-bulk-form"
        items={selectionItems}
        key={scopeKey}
        returnTo={returnTo}
        scopeKey={scopeKey}
        totalResults={draftPage.total}
      >
        <section
          className="min-w-0 overflow-visible rounded-[18px] border border-[#D2D2D7] bg-white"
          id="review-results"
          tabIndex={-1}
        >
          <div className="flex flex-col gap-3 border-b border-[#D2D2D7] p-4 lg:flex-row lg:items-center lg:justify-between">
            <form className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <Label className="sr-only" htmlFor="review-search">Search</Label>
                <Input
                  defaultValue={query.q ?? ""}
                  id="review-search"
                  name="q"
                  placeholder="Question code or title"
                />
              </div>
              <details className="group relative">
                <summary
                  className={cn(
                    buttonVariants({ variant: "outline" }),
                    "min-h-10 cursor-pointer list-none",
                  )}
                >
                  Filters
                </summary>
                <div className="mt-2 w-full space-y-3 rounded-md border border-slate-200 bg-white p-4 shadow-lg sm:absolute sm:right-0 sm:z-20 sm:w-72">
                  <div className="space-y-2">
                    <Label htmlFor="review-status">Status</Label>
                    <select
                      className="min-h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                      defaultValue={reviewStatus ?? ""}
                      id="review-status"
                      name="status"
                    >
                      <option value="">All Drafts</option>
                      <option value="pending_review">Ready to review</option>
                      <option value="needs_more_evidence">Needs attention</option>
                    </select>
                  </div>
                  <div className="flex gap-2">
                    <Button type="submit">Apply</Button>
                    <Button asChild type="button" variant="outline">
                      <Link href={`/teacher/banks/${bank.id}/review`}>Reset</Link>
                    </Button>
                  </div>
                </div>
              </details>
              <Button type="submit">Search</Button>
            </form>

            {canApprove && publishableQuestions.length ? (
              <form action={approveCurrentBankReviewPage} className="max-w-sm">
                <input name="bankId" type="hidden" value={bank.id} />
                <input name="operation" type="hidden" value="approve" />
                {publishableQuestions.map((question) => (
                  <input
                    key={question.id}
                    name="questionIds"
                    type="hidden"
                    value={question.id}
                  />
                ))}
                <FormSubmitButton
                  className="w-full"
                  pendingLabel="Approving…"
                >
                  Approve current page · {publishableQuestions.length}
                </FormSubmitButton>
                <p className="mt-2 text-xs leading-5 text-slate-600">
                  Approval confirms these questions for this Library. Content
                  you did not preview remains your responsibility.
                </p>
                {blockedCount ? (
                  <p className="mt-1 text-xs font-medium text-rose-700">
                    {blockedCount} blocked excluded
                  </p>
                ) : null}
              </form>
            ) : null}
          </div>

          {draftPage.items.length ? (
            <>
              {canApprove ? (
                <div className="flex min-h-12 items-center gap-3 border-b border-slate-200 px-4 text-sm font-semibold text-slate-700">
                  <BulkSelectAllCheckbox
                    label={`Select all ${publishableQuestions.length} approvable questions on this page`}
                  />
                  Select page
                </div>
              ) : null}

              <div className="divide-y divide-slate-200">
                {draftPage.items.map((question) => {
                  const status = question.hardErrors.length
                    ? {
                        label: "Blocked",
                        tone: "rose" as const,
                      }
                    : question.softWarnings.length
                      ? {
                          label: `${question.softWarnings.length} warning${question.softWarnings.length === 1 ? "" : "s"}`,
                          tone: "amber" as const,
                        }
                      : {
                          label: "Ready",
                          tone: "sky" as const,
                        };
                  const editHref = question.reviewItemId
                    ? `/teacher/banks/${bank.id}/review/${question.reviewItemId}/edit?returnTo=${encodeURIComponent(returnTo)}`
                    : null;

                  return (
                    <article className="px-4 py-4" key={question.id}>
                      <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-center">
                        {canApprove ? (
                          <BulkRowCheckbox itemId={question.id} />
                        ) : null}
                        <div className="min-w-0 flex-1">
                          <h2 className="truncate text-base font-semibold text-slate-950">
                            {question.title}
                          </h2>
                          <p className="mt-1 text-sm text-slate-600">
                            {question.questionCode} · {question.questionType}
                          </p>
                        </div>
                        <BankBadge tone={status.tone}>{status.label}</BankBadge>
                        <div className="flex flex-wrap items-center gap-2">
                          {canApprove && question.publishable ? (
                            <form action={approveBankReviewQuestion}>
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
                              <FormSubmitButton
                                pendingLabel="Approving…"
                                size="sm"
                              >
                                Approve
                              </FormSubmitButton>
                            </form>
                          ) : editHref ? (
                            <Button asChild size="sm">
                              <Link href={editHref}>Edit</Link>
                            </Button>
                          ) : null}
                          {canApprove ? (
                            <details className="group relative">
                              <summary
                                aria-label={`More actions for ${question.title}`}
                                className="inline-flex min-h-10 min-w-10 cursor-pointer list-none items-center justify-center rounded-md text-slate-600 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                              >
                                <MoreHorizontal
                                  aria-hidden="true"
                                  className="h-5 w-5"
                                />
                              </summary>
                              <div className="mt-1 w-52 space-y-2 rounded-md border border-slate-200 bg-white p-2 shadow-lg lg:absolute lg:right-0 lg:z-20">
                                {editHref ? (
                                  <Link
                                    className="flex min-h-10 items-center rounded-md px-3 text-sm font-medium hover:bg-slate-50"
                                    href={editHref}
                                  >
                                    Edit
                                  </Link>
                                ) : null}
                                <form action={markBankReviewDraftNeedsFix}>
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
                                  <input name="reason" type="hidden" value="" />
                                  <FormSubmitButton
                                    className="w-full justify-start"
                                    pendingLabel="Updating…"
                                    size="sm"
                                    variant="ghost"
                                  >
                                    Needs fix
                                  </FormSubmitButton>
                                </form>
                                <form action={rejectBankReviewDraftQuestion}>
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
                                  <input name="reason" type="hidden" value="" />
                                  <FormSubmitButton
                                    className="w-full justify-start text-rose-700"
                                    pendingLabel="Rejecting…"
                                    size="sm"
                                    variant="ghost"
                                  >
                                    Reject
                                  </FormSubmitButton>
                                </form>
                              </div>
                            </details>
                          ) : null}
                        </div>
                      </div>

                      {question.reviewItemId ? (
                        <LazyTeacherQuestionPreview
                          bankId={bank.id}
                          className="mt-2"
                          id={question.reviewItemId}
                          key={`${question.reviewItemId}:${question.updatedAt}`}
                          kind="review"
                          version={question.updatedAt}
                        />
                      ) : null}

                      {question.hardErrors.length ? (
                        <p className="mt-3 text-sm font-medium text-rose-700">
                          {question.hardErrors[0]}
                        </p>
                      ) : question.softWarnings.length ? (
                        <p className="mt-3 text-sm text-amber-800">
                          {question.softWarnings.join(" · ")}
                        </p>
                      ) : null}
                    </article>
                  );
                })}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-4 text-sm">
                <span>
                  {draftPage.total} results · Page {page} of {totalPages}
                </span>
                <div className="flex gap-2">
                  <Button
                    asChild
                    disabled={page <= 1}
                    size="sm"
                    variant="outline"
                  >
                    <Link href={pageHref(Math.max(1, page - 1))}>Previous</Link>
                  </Button>
                  <Button
                    asChild
                    disabled={page >= totalPages}
                    size="sm"
                    variant="outline"
                  >
                    <Link href={pageHref(Math.min(totalPages, page + 1))}>
                      Next
                    </Link>
                  </Button>
                </div>
              </div>
              {canApprove ? (
                <ReviewBulkActionBar
                  bankId={bank.id}
                  returnTo={returnTo}
                />
              ) : null}
            </>
          ) : (
            <div className="px-4 py-12 text-center">
              <p className="font-semibold text-[#1D1D1F]">No drafts</p>
              {canApprove ? (
                <Button asChild className="mt-5" variant="outline">
                  <Link href={`/teacher/banks/${bank.id}/imports`}>Import</Link>
                </Button>
              ) : null}
            </div>
          )}
        </section>
      </CurrentPageSelectionProvider>
    </BankWorkbenchPage>
  );
}
