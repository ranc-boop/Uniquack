import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { MoreHorizontal } from "lucide-react";

import { FormSubmitButton } from "@/components/form-submit-button";
import { LazyTeacherQuestionPreview } from "@/components/teacher/lazy-teacher-question-preview";
import { TeacherReviewGuidance } from "@/components/teacher/teacher-review-guidance";
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
import { formatNumber } from "@/lib/i18n/locale";
import { getRequestLocale } from "@/lib/i18n/server";
import { translate } from "@/lib/i18n/messages";

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

function SetupNeededState({ locale }: { locale: Parameters<typeof translate>[0] }) {
  return (
    <BankWorkbenchPage>
      <header className="teacher-page-header">
        <h1 className="text-3xl font-bold tracking-tight text-slate-950">
          {translate(locale, "teacherLibrary.review")}
        </h1>
      </header>
      <section className="border-y border-slate-200 bg-white py-10 text-center">
        <p className="font-semibold text-slate-900">
          {translate(locale, "teacherLibrary.librarySetupUnavailable")}
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
  const locale = await getRequestLocale();
  const t = (key: Parameters<typeof translate>[1], values?: Parameters<typeof translate>[2]) => translate(locale, key, values);
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
      return <SetupNeededState locale={locale} />;
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
        : question.hardErrors[0] ?? t("teacherLibrary.fixBeforeApproval"),
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
            {t("teacherLibrary.review")}
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
          {t("common.saved")}
        </p>
      ) : null}
      {query.error ? (
        <p
          className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-900"
          role="alert"
        >
          {t("common.requestFailed")}
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
                <Label className="sr-only" htmlFor="review-search">{t("teacherLibrary.search")}</Label>
                <Input
                  defaultValue={query.q ?? ""}
                  id="review-search"
                  name="q"
                  placeholder={t("teacherLibrary.questionCodeOrTitle")}
                />
              </div>
              <details className="group relative">
                <summary
                  className={cn(
                    buttonVariants({ variant: "outline" }),
                    "min-h-10 cursor-pointer list-none",
                  )}
                >
                  {t("teacherLibrary.filters")}
                </summary>
                <div className="mt-2 w-full space-y-3 rounded-md border border-slate-200 bg-white p-4 shadow-lg sm:absolute sm:right-0 sm:z-20 sm:w-72">
                  <div className="space-y-2">
                    <Label htmlFor="review-status">{t("teacherLibrary.status")}</Label>
                    <select
                      className="min-h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                      defaultValue={reviewStatus ?? ""}
                      id="review-status"
                      name="status"
                    >
                      <option value="">{t("teacherLibrary.allDrafts")}</option>
                      <option value="pending_review">{t("teacherLibrary.readyToReview")}</option>
                      <option value="needs_more_evidence">{t("teacherLibrary.needsAttention")}</option>
                    </select>
                  </div>
                  <div className="flex gap-2">
                    <Button type="submit">{t("teacherLibrary.apply")}</Button>
                    <Button asChild type="button" variant="outline">
                      <Link href={`/teacher/banks/${bank.id}/review`}>{t("teacherLibrary.reset")}</Link>
                    </Button>
                  </div>
                </div>
              </details>
              <Button type="submit">{t("teacherLibrary.search")}</Button>
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
                  pendingLabel={t("teacherLibrary.approving")}
                >
                  {t("teacherLibrary.approveCurrentPage", {
                    count: formatNumber(locale, publishableQuestions.length),
                  })}
                </FormSubmitButton>
                <p className="mt-2 text-xs leading-5 text-slate-600">
                  {t("teacherLibrary.approvalResponsibility")}
                </p>
                {blockedCount ? (
                  <p className="mt-1 text-xs font-medium text-rose-700">
                    {t("teacherLibrary.blockedExcluded", {
                      count: formatNumber(locale, blockedCount),
                    })}
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
                    label={t("teacherLibrary.selectAllApprovable", {
                      count: formatNumber(locale, publishableQuestions.length),
                    })}
                  />
                  {t("teacherLibrary.selectPage")}
                </div>
              ) : null}

              <div className="divide-y divide-slate-200">
                {draftPage.items.map((question) => {
                  const status = question.hardErrors.length
                    ? {
                        label: t("teacherLibrary.blocked"),
                        tone: "rose" as const,
                      }
                    : question.softWarnings.length
                      ? {
                          label: t("teacherLibrary.warningCount", {
                            count: formatNumber(locale, question.softWarnings.length),
                          }),
                          tone: "amber" as const,
                        }
                      : {
                          label: t("teacherLibrary.ready"),
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
                                pendingLabel={t("teacherLibrary.approving")}
                                size="sm"
                              >
                                {t("teacherLibrary.approve")}
                              </FormSubmitButton>
                            </form>
                          ) : editHref ? (
                            <Button asChild size="sm">
                              <Link href={editHref}>{t("teacherLibrary.edit")}</Link>
                            </Button>
                          ) : null}
                          {canApprove ? (
                            <details className="group relative">
                              <summary
                                aria-label={t("teacherLibrary.moreActionsFor", {
                                  title: question.title,
                                })}
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
                                    {t("teacherLibrary.edit")}
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
                                    pendingLabel={t("teacherLibrary.updating")}
                                    size="sm"
                                    variant="ghost"
                                  >
                                    {t("teacherLibrary.needsFix")}
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
                                    pendingLabel={t("teacherLibrary.rejecting")}
                                    size="sm"
                                    variant="ghost"
                                  >
                                    {t("teacherLibrary.reject")}
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

                      <TeacherReviewGuidance findings={question.reviewGuidance} />

                      {question.hardErrors.length ? (
                        <p className="mt-3 text-sm font-medium text-rose-700">
                          {question.hardErrors[0]}
                        </p>
                      ) : null}
                    </article>
                  );
                })}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-4 text-sm">
                <span>
                  {t("teacherLibrary.resultsPage", {
                    page: formatNumber(locale, page),
                    total: formatNumber(locale, draftPage.total),
                    totalPages: formatNumber(locale, totalPages),
                  })}
                </span>
                <div className="flex gap-2">
                  <Button
                    asChild
                    disabled={page <= 1}
                    size="sm"
                    variant="outline"
                  >
                    <Link href={pageHref(Math.max(1, page - 1))}>{t("teacherLibrary.previous")}</Link>
                  </Button>
                  <Button
                    asChild
                    disabled={page >= totalPages}
                    size="sm"
                    variant="outline"
                  >
                    <Link href={pageHref(Math.min(totalPages, page + 1))}>
                      {t("teacherLibrary.next")}
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
              <p className="font-semibold text-[#1D1D1F]">{t("teacherLibrary.noDrafts")}</p>
              {canApprove ? (
                <Button asChild className="mt-5" variant="outline">
                  <Link href={`/teacher/banks/${bank.id}/imports`}>{t("teacherLibrary.import")}</Link>
                </Button>
              ) : null}
            </div>
          )}
        </section>
      </CurrentPageSelectionProvider>
    </BankWorkbenchPage>
  );
}
