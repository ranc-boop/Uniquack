import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { Upload } from "lucide-react";

import { FocusTaskLink } from "@/components/teacher/focus-task-link";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireTeacher } from "@/lib/auth/guards";
import {
  getTeacherQuestionBankAccess,
  listBankQuestionsPage,
  QuestionBankSchemaMissingError,
  teacherQuestionBankAccessLabel,
} from "@/lib/question-banks";
import { createClient } from "@/lib/supabase/server";
import {
  buildFocusHref,
  sanitizeTeacherBankReturnTo,
} from "@/lib/teacher-focus-workspace";
import { cn } from "@/lib/utils";
import type { BankQuestion } from "@/types/database";

import {
  createBankQuestionRevisionDraft,
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

function formatDate(value: string | null) {
  if (!value) return "Unknown";

  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

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
    page?: string;
    public?: string;
    publicPage?: string;
    publicQ?: string;
    q?: string;
    readiness?: string;
    source?: string;
    taxonomy?: string;
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
  const accessLabel = teacherQuestionBankAccessLabel(access);
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
  }> = [];
  const publicPageSize = 25;
  const publicPage = Math.max(
    1,
    Number.parseInt(query.publicPage ?? "1", 10) || 1,
  );
  let publicTotal = 0;

  if (showPublicCatalog && canManage && governanceAvailable) {
    let publicQuestionQuery = supabase
      .from("questions")
      .select("id, question_code, title, question_type, difficulty_rating", {
        count: "exact",
      })
      .is("owner_bank_id", null)
      .eq("status", "published")
      .eq("visibility", "public")
      .is("deleted_at", null)
      .order("updated_at", { ascending: false })
      .range(
        (publicPage - 1) * publicPageSize,
        publicPage * publicPageSize - 1,
      );

    const publicSearch = (query.publicQ ?? "").trim().replaceAll(",", " ");
    if (publicSearch) {
      publicQuestionQuery = publicQuestionQuery.or(
        `question_code.ilike.*${publicSearch}*,title.ilike.*${publicSearch}*`,
      );
    }

    const { count, data, error } = await publicQuestionQuery;

    if (error) throw new Error(error.message);
    publicQuestions = data ?? [];
    publicTotal = count ?? 0;
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

  return (
    <BankWorkbenchPage>
      <section className="rounded-lg border bg-white shadow-sm">
        <BankSectionHeader
          action={
          <>
            <Button asChild variant="outline">
              <Link href={`/teacher/banks/${bank.id}`}>Back to Library</Link>
            </Button>
          </>
        }
          description={`Access: ${accessLabel}. These assignment-ready Library questions are not public/global questions.`}
          eyebrow="Question database · Library / Questions"
          title={`Reviewed content in ${bank.name}`}
        />
      </section>

      <BankRouteTabs
        bankId={bank.id}
        currentUserRole={access.currentUserRole}
      />

      {!governanceAvailable ? (
        <section className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          Revision, public submission, and Public Library copy features need
          clean migration 0055. Existing Library questions and Assignments are
          unchanged.
        </section>
      ) : null}

      {showPublicCatalog && governanceAvailable ? (
        <section className="overflow-hidden rounded-lg border border-sky-200 bg-white shadow-sm">
          <BankSectionHeader
            action={
              <Button asChild variant="outline">
                <Link href={`/teacher/banks/${bank.id}/questions`}>
                  Close public catalog
                </Link>
              </Button>
            }
            description="Each selection becomes an independent Library-owned copy. Later changes in the Central Public Library cannot change your copy or existing Assignments."
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
              <div className="overflow-x-auto">
                <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Code</TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Difficulty</TableHead>
                    <TableHead>Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {publicQuestions.map((question) => (
                    <TableRow key={question.id}>
                      <TableCell className="font-mono text-xs">
                        {question.question_code}
                      </TableCell>
                      <TableCell className="font-semibold">
                        {question.title}
                      </TableCell>
                      <TableCell>{question.question_type}</TableCell>
                      <TableCell>{question.difficulty_rating}</TableCell>
                      <TableCell>
                        <form action={pullPublicQuestionIntoBank}>
                          <input name="bankId" type="hidden" value={bank.id} />
                          <input
                            name="publicQuestionId"
                            type="hidden"
                            value={question.id}
                          />
                          <FormSubmitButton
                            pendingLabel="Copying…"
                            size="sm"
                            variant="outline"
                          >
                            Add independent copy
                          </FormSubmitButton>
                        </form>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                </Table>
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
        <section className="rounded-lg border border-slate-200/80 bg-white/85 shadow-[0_18px_48px_-40px_rgba(15,23,42,0.7)] ring-1 ring-slate-950/5 backdrop-blur">
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
              description="Source lineage, taxonomy status, and assignment readiness stay visible before classroom delivery."
              focusId="library-question-results-focus"
              title={
                readiness === "active"
                  ? "Assignment-ready Library questions"
                  : "Archived Library questions"
              }
          />
        <form className="grid gap-3 border-b border-slate-200 p-4 md:grid-cols-2 xl:grid-cols-[minmax(16rem,1fr)_12rem_12rem_12rem_auto]">
          <div className="space-y-2">
            <Label htmlFor="library-question-search">Search</Label>
            <Input
              defaultValue={query.q ?? ""}
              id="library-question-search"
              name="q"
              placeholder="Question code or title"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="library-question-readiness">Readiness</Label>
            <select
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              defaultValue={readiness}
              id="library-question-readiness"
              name="readiness"
            >
              <option value="active">Ready for assignment</option>
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
              <option value="review_draft">Reviewed draft</option>
              <option value="import">JSON / AI import</option>
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
          <div className="flex items-end gap-2">
            <Button type="submit">Filter</Button>
            <Button asChild type="button" variant="outline">
              <Link href={`/teacher/banks/${bank.id}/questions`}>Reset</Link>
            </Button>
          </div>
        </form>
        <div>
          {questionPage?.total ? (
            <>
              {canManage ? (
                <div className="flex min-h-12 items-center gap-2 border-y border-slate-200 px-3 text-sm font-semibold text-slate-700 md:hidden">
                  <BulkSelectAllCheckbox
                    label={`Select all ${questionBulkItems.filter((item) => item.eligible).length} eligible questions on this page`}
                  />
                  <span>
                    Select eligible questions on this page
                  </span>
                </div>
              ) : null}
              <div>
                <Table className="block md:table">
                  <TableHeader className="hidden md:table-header-group">
                    <TableRow>
                      {canManage ? (
                        <TableHead className="w-14">
                          <BulkSelectAllCheckbox
                            label={`Select all ${questionBulkItems.filter((item) => item.eligible).length} eligible questions on this page`}
                          />
                        </TableHead>
                      ) : null}
                      <TableHead>Question</TableHead>
                      <TableHead>Readiness</TableHead>
                      <TableHead>Taxonomy</TableHead>
                      <TableHead className="w-40">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="block md:table-row-group">
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
                      return (
                        <TableRow
                          className={cn(
                            "grid min-w-0 grid-cols-[3rem_minmax(0,1fr)] py-3 md:table-row md:py-0",
                            canManage ? "" : "grid-cols-1",
                          )}
                          key={row.bank_question_id}
                        >
                          {canManage ? (
                            <TableCell className="p-2 md:p-4">
                              <BulkRowCheckbox itemId={row.bank_question_id} />
                            </TableCell>
                          ) : null}
                          <TableCell className="min-w-0 break-words p-2 font-semibold [overflow-wrap:anywhere] md:min-w-56 md:p-4">
                            {question?.title ?? "Question unavailable"}
                            <p className="mt-1 font-mono text-xs font-normal text-muted-foreground">
                              {question?.question_code ?? "Code unavailable"} ·{" "}
                              {question?.question_type ?? "Type unavailable"}
                            </p>
                            {isSuperseded ? (
                              <p className="mt-2 text-xs font-semibold leading-5 text-amber-800">
                                Superseded by an approved revision · restore is
                                unavailable
                              </p>
                            ) : null}
                          </TableCell>
                          <TableCell className="hidden min-w-44 md:table-cell">
                            <BankBadge tone={row.status === "active" ? "indigo" : "amber"}>
                              {row.status === "active"
                                ? "Ready for assignment"
                                : "Archived"}
                            </BankBadge>
                            <p className="mt-2 text-xs text-muted-foreground">
                              Difficulty {question?.difficulty_rating ?? "not set"}
                            </p>
                          </TableCell>
                          <TableCell className="hidden min-w-48 md:table-cell">
                            <div className="flex flex-wrap gap-1">
                              {row.tagSummaries.length ? (
                                row.tagSummaries.slice(0, 2).map((tag) => (
                                  <BankBadge key={tag.tag_id} tone="sky">
                                    {tag.label ?? tag.tag_id}
                                  </BankBadge>
                                ))
                              ) : (
                                <span className="text-xs text-muted-foreground">
                                  Not tagged
                                </span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell
                            className={cn(
                              "min-w-0 p-2 pt-0 md:table-cell md:p-4",
                              canManage ? "col-start-2" : "",
                            )}
                          >
                            <div className="flex flex-wrap gap-2">
                              <FocusTaskLink
                                className={cn(
                                  buttonVariants({
                                    size: "sm",
                                    variant: "outline",
                                  }),
                                  "h-auto min-h-11 whitespace-normal",
                                )}
                                href={`/teacher/banks/${bank.id}/questions/${row.bank_question_id}/preview`}
                                returnTo={questionPreviewReturnTo}
                                taskKind="question-preview"
                                triggerId={`question-preview-${row.bank_question_id}`}
                              >
                                Preview
                              </FocusTaskLink>
                              <details className="relative min-w-0">
                                <summary className="inline-flex min-h-11 cursor-pointer list-none items-center rounded-md px-3 text-sm font-semibold text-slate-700 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500">
                                  More
                                </summary>
                                <div className="mt-1 min-w-0 space-y-2 rounded-lg border border-slate-200 bg-white p-2 shadow-lg md:absolute md:right-0 md:z-20 md:min-w-52">
                                  <a
                                    className="flex min-h-11 items-center rounded-md px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
                                    href={buildFocusHref({
                                      href: `/teacher/banks/${bank.id}/questions/${row.bank_question_id}/preview`,
                                      returnTo: questionPreviewReturnTo,
                                    })}
                                    referrerPolicy="no-referrer"
                                    rel="noopener noreferrer"
                                    target="_blank"
                                  >
                                    Open preview in new tab
                                  </a>
                                  <p className="px-3 text-xs leading-5 text-slate-500">
                                    Added {formatDate(row.added_at)} · {row.source_kind}
                                  </p>
                                  <div className="space-y-2 border-t border-slate-100 px-3 pt-2 text-xs text-slate-600 md:hidden">
                                    <p>
                                      {row.status === "active"
                                        ? "Ready for assignment"
                                        : "Archived"}{" "}
                                      · Difficulty{" "}
                                      {question?.difficulty_rating ?? "not set"}
                                    </p>
                                    <p>
                                      {row.tagSummaries.length
                                        ? row.tagSummaries
                                            .slice(0, 2)
                                            .map((tag) => tag.label ?? tag.tag_id)
                                            .join(" · ")
                                        : "Not tagged"}
                                    </p>
                                  </div>
                                  {canManage && governanceAvailable && question ? (
                                    <form action={createBankQuestionRevisionDraft}>
                                      <input name="bankId" type="hidden" value={bank.id} />
                                      <input name="questionId" type="hidden" value={question.id} />
                                      <FormSubmitButton
                                        className="min-h-11 w-full"
                                        pendingLabel="Creating…"
                                        size="sm"
                                        variant="outline"
                                      >
                                        Create revision draft
                                      </FormSubmitButton>
                                    </form>
                                  ) : null}
                                </div>
                              </details>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {!questions.length ? (
                      <TableRow>
                        <TableCell
                          className="h-24 text-center"
                          colSpan={canManage ? 5 : 4}
                        >
                              No questions match these filters.
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                </Table>
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
            <div className="p-8 text-center">
              <p className="teacher-eyebrow">
                {hasQuestionFilters ? "No matching questions" : "Empty Library"}
              </p>
              <h3 className="mt-2 text-xl font-bold text-slate-950">
                {hasQuestionFilters
                  ? "No Library questions match these filters."
                  : "No reviewed questions in this Library yet."}
              </h3>
              <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                {hasQuestionFilters
                  ? "Change or reset the filters to see other Library questions."
                  : "Import private material, review the drafts, then approve questions into this Library."}
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
