import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { Upload } from "lucide-react";

import { LazyTeacherQuestionPreview } from "@/components/teacher/lazy-teacher-question-preview";
import {
  QuestionManagementWorkbench,
  type QuestionWorkbenchItem,
  type WorkbenchApprovalStatus,
} from "@/components/questions/question-management-workbench";
import { DeleteLibraryQuestionButton } from "@/components/teacher/delete-library-question-button";
import {
  BulkRowCheckbox,
  BulkSelectAllCheckbox,
  CurrentPageSelectionProvider,
  QuestionBulkActionBar,
  type TeacherBulkSelectionItem,
} from "@/components/teacher/teacher-bulk-selection";
import { Button, buttonVariants } from "@/components/ui/button";
import { FormSubmitButton } from "@/components/form-submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requireTeacher } from "@/lib/auth/guards";
import {
  getTeacherQuestionBankAccess,
  listBankQuestionsPage,
  QuestionBankSchemaMissingError,
} from "@/lib/question-banks";
import { createClient } from "@/lib/supabase/server";
import { sanitizeTeacherBankReturnTo } from "@/lib/teacher-focus-workspace";
import { cn } from "@/lib/utils";
import type { BankQuestion } from "@/types/database";

import {
  createBankQuestionRevisionDraft,
  deleteBankQuestion,
  manageSelectedBankQuestions,
  pullPublicQuestionIntoBank,
} from "../../actions";

import {
  BankBadge,
  BankQuickAction,
  BankRouteTabs,
  BankSectionHeader,
  BankWorkbenchPage,
} from "../../bank-ui";

export const dynamic = "force-dynamic";

function SetupNeededState() {
  return (
    <BankWorkbenchPage>
      <section className="rounded-lg border border-slate-200/80 bg-white/90 p-6 shadow-sm">
        <p className="student-eyebrow">Setup needed</p>
        <h1 className="mt-2 text-2xl font-bold text-slate-950">
          Library questions are not available yet.
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
          Apply clean migrations 0025 and 0027 before using Library questions.
        </p>
        <Button asChild className="mt-5" variant="outline">
          <Link href="/teacher/banks">Back to Libraries</Link>
        </Button>
      </section>
    </BankWorkbenchPage>
  );
}

export default async function TeacherBankQuestionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ bankId: string }>;
  searchParams: Promise<{
    error?: string;
    page?: string;
    public?: string;
    publicPage?: string;
    publicQ?: string;
    q?: string;
    readiness?: string;
    selected?: string;
    saved?: string;
    source?: string;
    status?: string;
    taxonomy?: string;
    view?: string;
  }>;
}) {
  const [profile, { bankId }, query, supabase] = await Promise.all([
    requireTeacher(),
    params,
    searchParams,
    createClient(),
  ]);
  let access;
  const requestedPage = Math.max(1, Number.parseInt(query.page ?? "1", 10) || 1);
  const pageSize = 25;
  const readiness = query.readiness === "archived" ? "archived" : "active";
  const workbenchApprovalStatus: WorkbenchApprovalStatus =
    query.status === "approved" ? "approved" : "pending";
  const allowedSourceKinds: BankQuestion["source_kind"][] = [
    "manual",
    "review_draft",
    "import",
    "public_pull",
    "course_builder",
  ];
  const sourceKind = allowedSourceKinds.includes(
    query.source as BankQuestion["source_kind"],
  )
    ? (query.source as BankQuestion["source_kind"])
    : undefined;
  const showPublicCatalog = query.public === "1";
  let questionPage;

  try {
    [access, questionPage] = await Promise.all([
      getTeacherQuestionBankAccess({
        bankId,
        profileId: profile.id,
        supabase,
      }),
      showPublicCatalog
        ? Promise.resolve(null)
         : listBankQuestionsPage({
            approvalStatus:
              query.view === "classic" ? undefined : workbenchApprovalStatus,
            bankId,
            page: requestedPage,
            pageSize,
            query: query.q,
            readiness,
            sourceKind,
            supabase,
            taxonomyTagId: query.taxonomy,
          }),
    ]);
  } catch (error) {
    if (error instanceof QuestionBankSchemaMissingError) {
      return <SetupNeededState />;
    }

    throw error;
  }

  if (!access) {
    notFound();
  }

  const questions = questionPage?.items ?? [];
  const { bank } = access;
  const canManage = access.canManage;
  // search_bank_question_rows is installed by the same forward migration as
  // revision/public governance. A successful page result is the capability
  // check, so avoid a separate schema-probe query on every filter/page change.
  const governanceAvailable = true;
  let publicQuestions: Array<{
    difficulty_rating: number;
    id: string;
    question_code: string;
    question_type: string;
    title: string;
    updated_at: string;
  }> = [];
  const publicPageSize = 25;
  const publicPage = Math.max(
    1,
    Number.parseInt(query.publicPage ?? "1", 10) || 1,
  );
  let publicTotal = 0;

  if (showPublicCatalog && canManage && governanceAvailable) {
    const publicSearch = (query.publicQ ?? "").trim().replaceAll(",", " ");
    const { data, error } = await supabase.rpc(
      "search_official_public_questions_v2",
      {
        difficulty_max: null,
        difficulty_min: null,
        page_limit: publicPageSize,
        page_offset: (publicPage - 1) * publicPageSize,
        query_text: publicSearch || null,
      },
    );

    if (error) throw new Error(error.message);
    publicQuestions = (data ?? []).map((row) => ({
      difficulty_rating: row.difficulty_rating,
      id: row.question_id,
      question_code: row.question_code,
      question_type: row.question_type,
      title: row.title,
      updated_at: row.question_id,
    }));
    publicTotal = Number(data?.[0]?.total_count ?? 0);
  }
  const publicTotalPages = Math.max(
    1,
    Math.ceil(publicTotal / publicPageSize),
  );
  const publicPageHref = (nextPage: number) => {
    const params = new URLSearchParams({ public: "1" });
    if (query.publicQ?.trim()) params.set("publicQ", query.publicQ.trim());
    if (nextPage > 1) params.set("publicPage", String(nextPage));
    return `/teacher/banks/${bank.id}/questions?${params.toString()}`;
  };
  if (publicPage > publicTotalPages) {
    redirect(publicPageHref(publicTotalPages));
  }
  const totalPages = Math.max(
    1,
    Math.ceil((questionPage?.total ?? 0) / pageSize),
  );
  const page = requestedPage;
  const pageHref = (nextPage: number) => {
    const params = new URLSearchParams();
    if (query.q?.trim()) params.set("q", query.q.trim());
    if (readiness === "archived") params.set("readiness", "archived");
    if (sourceKind) params.set("source", sourceKind);
    if (query.taxonomy?.trim()) params.set("taxonomy", query.taxonomy.trim());
    if (query.view === "classic") params.set("view", "classic");
    else params.set("status", workbenchApprovalStatus);
    if (nextPage > 1) params.set("page", String(nextPage));
    const suffix = params.toString();
    return `/teacher/banks/${bank.id}/questions${suffix ? `?${suffix}` : ""}`;
  };
  if (!showPublicCatalog && page > totalPages) {
    redirect(pageHref(totalPages));
  }
  const questionPreviewReturnTo = sanitizeTeacherBankReturnTo({
    bankId: bank.id,
    rawReturnTo: `/teacher/banks/${bank.id}/questions${
      page > 1 ||
      readiness === "archived" ||
      Boolean(sourceKind) ||
      Boolean(query.taxonomy?.trim()) ||
      Boolean(query.q?.trim())
        ? `?${new URLSearchParams({
            ...(page > 1 ? { page: String(page) } : {}),
            ...(readiness === "archived" ? { readiness: "archived" } : {}),
            ...(sourceKind ? { source: sourceKind } : {}),
            ...(query.taxonomy?.trim()
              ? { taxonomy: query.taxonomy.trim() }
              : {}),
            ...(query.q?.trim() ? { q: query.q.trim() } : {}),
          }).toString()}`
        : ""
    }`,
    surface: "questions",
  });
  const hasQuestionFilters = Boolean(
    query.q?.trim() ||
      query.taxonomy?.trim() ||
      sourceKind ||
      readiness === "archived",
  );
  const questionBulkItems: TeacherBulkSelectionItem[] = questions.map((row) => {
    const question = row.question;
    const metadata =
      row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
        ? (row.metadata as Record<string, unknown>)
        : {};
    const superseded =
      readiness === "archived" &&
      typeof metadata.replacedByQuestionId === "string";
    const eligible = canManage && Boolean(question) && !superseded;

    return {
      disabledReason: eligible
        ? undefined
        : superseded
          ? "This archived question was replaced by an approved revision and cannot be restored."
          : question
          ? "Viewer access cannot change Library questions."
          : "This Library question is unavailable.",
      eligible,
      id: row.bank_question_id,
      label: `${question?.question_code ?? "Code unavailable"} · ${question?.title ?? "Question unavailable"}`,
    };
  });
  const questionBulkScopeKey = [
    bank.id,
    "questions",
    page,
    readiness,
    sourceKind ?? "all",
    query.taxonomy?.trim() ?? "",
    query.q?.trim() ?? "",
  ].join(":");

  if (!showPublicCatalog && query.view !== "classic") {
    const questionIds = questions
      .map((row) => row.question?.id)
      .filter((id): id is string => Boolean(id));
    const { data: questionDetails, error: detailError } = questionIds.length
      ? await supabase
          .from("questions")
          .select(
            "id, approval_status, answer_spec, content_html, solution_html",
          )
          .in("id", questionIds)
      : { data: [], error: null };
    if (detailError) throw new Error(detailError.message);
    const detailById = new Map(
      (questionDetails ?? []).map((detail) => [detail.id, detail]),
    );
    const workbenchItems: QuestionWorkbenchItem[] = questions.flatMap((row) => {
      const question = row.question;
      if (!question) return [];
      const detail = detailById.get(question.id);
      const itemStatus =
        detail?.approval_status === "approved" ? "approved" : "pending";
      if (itemStatus !== workbenchApprovalStatus) return [];
      const deterministic =
        question.question_type === "mcq" ||
        question.question_type === "fill_blank";
      return [{
        actionHref: question.source_review_item_id
          ? `/teacher/banks/${bank.id}/review/${question.source_review_item_id}`
          : `/teacher/banks/${bank.id}/questions/${row.bank_question_id}/preview`,
        actionLabel: itemStatus === "pending" ? "Edit and approve" : "View and manage",
        approvalStatus: itemStatus,
        contentHtml: detail?.content_html ?? "",
        gradingCapability: deterministic
          ? "deterministic"
          : detail?.solution_html
            ? "ai_review"
            : "needs_configuration",
        id: question.id,
        questionCode: question.question_code,
        questionType: question.question_type,
        solutionHtml: detail?.solution_html,
        sourceLabel: row.source_kind,
        taxonomyReady: row.tagSummaries.every(
          (tag) => tag.review_status === "approved",
        ),
        title: question.title,
      }];
    });

    return (
      <BankWorkbenchPage>
        <BankRouteTabs
          bankId={bank.id}
          currentUserRole={access.currentUserRole}
        />
        {query.saved ? (
          <p className="rounded-[14px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900" role="status">
            {query.saved}
          </p>
        ) : null}
        <QuestionManagementWorkbench
          activeStatus={workbenchApprovalStatus}
          baseHref={`/teacher/banks/${bank.id}/questions`}
          canCreate={canManage}
          createHref={`/teacher/banks/${bank.id}/imports#manual-question`}
          currentPage={page}
          emptyDescription={
            workbenchApprovalStatus === "pending"
              ? "Imported and newly created questions wait here for readiness checks."
              : "Approved questions are ready for new Assignments."
          }
          items={workbenchItems}
          libraryName={bank.name}
          mode="teacher"
          pageSize={pageSize}
          query={query.q}
          selectedId={query.selected}
          totalCount={questionPage?.total ?? 0}
        />
        <div className="flex justify-end">
          <Button asChild size="sm" variant="ghost">
            <Link href={`/teacher/banks/${bank.id}/questions?view=classic`}>
              Bulk manage
            </Link>
          </Button>
        </div>
      </BankWorkbenchPage>
    );
  }

  return (
    <BankWorkbenchPage>
      <header className="teacher-page-header">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-950 md:text-4xl">
            Questions
          </h1>
          <p className="mt-1 text-base font-medium text-slate-600">
            {bank.name}
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href={`/teacher/banks/${bank.id}`}>Back</Link>
        </Button>
      </header>

      <BankRouteTabs
        bankId={bank.id}
        currentUserRole={access.currentUserRole}
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

      {!governanceAvailable ? (
        <section className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          Revision, public submission, and Public Library copy features need
          clean migration 0055. Existing Library questions and Assignments are
          unchanged.
        </section>
      ) : null}

      {showPublicCatalog && governanceAvailable ? (
        <section className="border-y border-slate-200 bg-white">
          <BankSectionHeader
            action={
              <Button asChild variant="outline">
                <Link href={`/teacher/banks/${bank.id}/questions`}>
                  Close public catalog
                </Link>
              </Button>
            }
            eyebrow="Central Public Library"
            title="Add approved public questions"
          />
          {canManage ? (
            <form className="grid gap-3 border-y border-sky-100 p-4 sm:grid-cols-[minmax(12rem,1fr)_auto]">
              <div className="space-y-2">
                <Label htmlFor="public-library-search">Search public questions</Label>
                <Input
                  defaultValue={query.publicQ ?? ""}
                  id="public-library-search"
                  name="publicQ"
                  placeholder="Question code or title"
                />
                <input name="public" type="hidden" value="1" />
              </div>
              <div className="flex items-end gap-2">
                <Button type="submit">Search</Button>
                <Button asChild type="button" variant="outline">
                  <Link href={`/teacher/banks/${bank.id}/questions?public=1`}>
                    Reset
                  </Link>
                </Button>
              </div>
            </form>
          ) : null}
          {!canManage ? (
            <p className="p-6 text-sm text-muted-foreground">
              Viewer access is read-only. Only Library owners and editors can
              add public questions.
            </p>
          ) : publicQuestions.length ? (
            <>
              <div className="divide-y divide-slate-200">
                {publicQuestions.map((question) => (
                  <article className="px-4 py-4" key={question.id}>
                    <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-center">
                      <div className="min-w-0 flex-1">
                        <h2 className="text-base font-semibold text-slate-950">
                          {question.title}
                        </h2>
                        <p className="mt-1 text-sm text-slate-600">
                          {question.question_code} · {question.question_type}
                        </p>
                      </div>
                      <form action={pullPublicQuestionIntoBank}>
                        <input name="bankId" type="hidden" value={bank.id} />
                        <input
                          name="publicQuestionId"
                          type="hidden"
                          value={question.id}
                        />
                        <FormSubmitButton
                          pendingLabel="Adding…"
                          size="sm"
                        >
                          Add
                        </FormSubmitButton>
                      </form>
                    </div>
                    <LazyTeacherQuestionPreview
                      bankId={bank.id}
                      className="mt-2 flex w-full flex-col items-start [&>div]:w-full lg:items-end"
                      id={question.id}
                      key={`${question.id}:${question.updated_at}`}
                      kind="public-question"
                      version={question.updated_at}
                    />
                  </article>
                ))}
              </div>
              <div className="flex items-center justify-between border-t border-sky-100 p-4 text-sm">
                <span>
                  {publicTotal} result{publicTotal === 1 ? "" : "s"} · Page{" "}
                  {publicPage} of {publicTotalPages}
                </span>
                <div className="flex gap-2">
                  <Button
                    asChild
                    disabled={publicPage <= 1}
                    size="sm"
                    variant="outline"
                  >
                    <Link href={publicPageHref(Math.max(1, publicPage - 1))}>
                      Previous
                    </Link>
                  </Button>
                  <Button
                    asChild
                    disabled={publicPage >= publicTotalPages}
                    size="sm"
                    variant="outline"
                  >
                    <Link
                      href={publicPageHref(
                        Math.min(publicTotalPages, publicPage + 1),
                      )}
                    >
                      Next
                    </Link>
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <p className="p-6 text-sm text-muted-foreground">
              No approved public questions are available.
            </p>
          )}
        </section>
      ) : null}

      {!showPublicCatalog ? (
        <CurrentPageSelectionProvider
          action={manageSelectedBankQuestions}
          bankId={bank.id}
          checkboxName="bankQuestionIds"
          fallbackFocusId="library-question-results-focus"
          formId="question-bulk-management-form"
          items={questionBulkItems}
          key={questionBulkScopeKey}
          returnTo={questionPreviewReturnTo}
          scopeKey={questionBulkScopeKey}
          totalResults={questionPage?.total ?? 0}
        >
        <section className="border-y border-slate-200 bg-white">
          <BankSectionHeader
              action={
                <div className="flex flex-wrap gap-2">
                  {canManage && governanceAvailable ? (
                    <Button asChild variant="outline">
                      <Link href={`/teacher/banks/${bank.id}/questions?public=1`}>
                        Add from Public Library
                      </Link>
                    </Button>
                  ) : null}
                  {canManage ? (
                    <BankQuickAction
                      href={`/teacher/banks/${bank.id}/imports`}
                      icon={Upload}
                    >
                      Import material
                    </BankQuickAction>
                  ) : null}
                </div>
              }
              focusId="library-question-results-focus"
              title={
                readiness === "active"
                  ? "Ready"
                  : "Archived"
              }
          />
        <form className="flex flex-col gap-3 border-b border-slate-200 p-4 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1 space-y-2">
            <Label htmlFor="library-question-search">Search</Label>
            <Input
              defaultValue={query.q ?? ""}
              id="library-question-search"
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
            <div className="mt-2 w-full space-y-4 rounded-md border border-slate-200 bg-white p-4 shadow-lg sm:absolute sm:right-0 sm:z-20 sm:w-80">
              <div className="space-y-2">
                <Label htmlFor="library-question-readiness">State</Label>
                <select
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  defaultValue={readiness}
                  id="library-question-readiness"
                  name="readiness"
                >
                  <option value="active">Ready</option>
                  <option value="archived">Archived</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="library-question-source">Source</Label>
                <select
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  defaultValue={sourceKind ?? ""}
                  id="library-question-source"
                  name="source"
                >
                  <option value="">All sources</option>
                  <option value="manual">Manual</option>
                  <option value="review_draft">Reviewed Draft</option>
                  <option value="import">Import</option>
                  <option value="public_pull">Public Library</option>
                  <option value="course_builder">Course Builder</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="library-question-taxonomy">Taxonomy tag</Label>
                <Input
                  defaultValue={query.taxonomy ?? ""}
                  id="library-question-taxonomy"
                  name="taxonomy"
                  placeholder="Exact tag ID"
                />
              </div>
              <Button asChild type="button" variant="outline">
                <Link href={`/teacher/banks/${bank.id}/questions`}>Reset</Link>
              </Button>
            </div>
          </details>
          <Button type="submit">Search</Button>
        </form>
        <div>
          {questionPage?.total ? (
            <>
              {canManage ? (
                <div className="flex min-h-12 items-center gap-3 border-b border-slate-200 px-4 text-sm font-semibold text-slate-700">
                  <BulkSelectAllCheckbox
                    label={`Select all ${questionBulkItems.filter((item) => item.eligible).length} eligible questions on this page`}
                  />
                  Select page
                </div>
              ) : null}
              <div className="divide-y divide-slate-200">
                {questions.map((row) => {
                  const question = row.question;
                  const rowMetadata =
                    row.metadata &&
                    typeof row.metadata === "object" &&
                    !Array.isArray(row.metadata)
                      ? (row.metadata as Record<string, unknown>)
                      : {};
                  const isSuperseded =
                    readiness === "archived" &&
                    typeof rowMetadata.replacedByQuestionId === "string";
                  const focusHref = `/teacher/banks/${bank.id}/questions/${row.bank_question_id}/preview?returnTo=${encodeURIComponent(questionPreviewReturnTo)}`;

                  return (
                    <article className="px-4 py-4" key={row.bank_question_id}>
                      <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-center">
                        {canManage ? (
                          <BulkRowCheckbox itemId={row.bank_question_id} />
                        ) : null}
                        <div className="min-w-0 flex-1">
                          <h2 className="truncate text-base font-semibold text-slate-950">
                            {question?.title ?? "Question unavailable"}
                          </h2>
                          <p className="mt-1 text-sm text-slate-600">
                            {question?.question_code ?? "Code unavailable"} ·{" "}
                            {question?.question_type ?? "Type unavailable"}
                          </p>
                          {isSuperseded ? (
                            <p className="mt-2 text-sm font-medium text-amber-800">
                              Replaced by a newer version
                            </p>
                          ) : null}
                        </div>
                        <BankBadge
                          tone={row.status === "active" ? "indigo" : "amber"}
                        >
                          {row.status === "active" ? "Ready" : "Archived"}
                        </BankBadge>
                        {canManage &&
                        governanceAvailable &&
                        question &&
                        row.status === "active" ? (
                          <form action={createBankQuestionRevisionDraft}>
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
                              pendingLabel="Opening…"
                              size="sm"
                              variant="outline"
                            >
                              Edit
                            </FormSubmitButton>
                          </form>
                        ) : null}
                        <details className="group relative">
                          <summary className="inline-flex min-h-10 cursor-pointer list-none items-center rounded-md px-3 text-sm font-medium text-slate-700 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600">
                            More
                          </summary>
                          <div className="mt-1 w-52 rounded-md border border-slate-200 bg-white p-2 shadow-lg lg:absolute lg:right-0 lg:z-20">
                            <a
                              className="flex min-h-10 items-center rounded-md px-3 text-sm font-medium hover:bg-slate-50"
                              href={focusHref}
                              referrerPolicy="no-referrer"
                              rel="noopener noreferrer"
                              target="_blank"
                            >
                              Open in new tab
                            </a>
                            {!isSuperseded ? (
                              <form action={deleteBankQuestion}>
                                <input
                                  name="bankId"
                                  type="hidden"
                                  value={bank.id}
                                />
                                <input
                                  name="bankQuestionId"
                                  type="hidden"
                                  value={row.bank_question_id}
                                />
                                <DeleteLibraryQuestionButton
                                  questionTitle={
                                    question?.title ?? "this question"
                                  }
                                />
                              </form>
                            ) : null}
                          </div>
                        </details>
                      </div>
                      <LazyTeacherQuestionPreview
                        bankId={bank.id}
                        className="mt-2"
                        id={row.bank_question_id}
                        key={`${row.bank_question_id}:${row.question?.updated_at ?? row.added_at}`}
                        kind="question"
                        version={row.question?.updated_at ?? row.added_at}
                      />
                    </article>
                  );
                })}
              </div>
              <div className="flex items-center justify-between border-t border-slate-200 p-4 text-sm">
                <span>
                  {questionPage.total} result
                  {questionPage.total === 1 ? "" : "s"} · Page {page} of{" "}
                  {totalPages}
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
              {canManage ? (
                <QuestionBulkActionBar
                  bankId={bank.id}
                  readiness={readiness}
                  returnTo={questionPreviewReturnTo}
                />
              ) : null}
            </>
          ) : (
            <div className="p-10 text-center">
              <p className="font-semibold text-slate-900">
                {hasQuestionFilters
                  ? "No questions match these filters."
                  : "This Library has no Ready questions."}
              </p>
              {canManage ? (
                <Button asChild className="mt-5" variant="outline">
                  <Link href={`/teacher/banks/${bank.id}/imports`}>
                    Import material
                  </Link>
                </Button>
              ) : null}
            </div>
          )}
        </div>
        </section>
        </CurrentPageSelectionProvider>
      ) : null}
    </BankWorkbenchPage>
  );
}
