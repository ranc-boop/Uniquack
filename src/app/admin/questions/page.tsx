import {
  bulkUpdateQuestions,
  createQuestion,
  deleteQuestion,
} from "@/app/admin/questions/actions";
import { Fragment } from "react";
import Link from "next/link";
import { AdminActionGroup } from "@/components/admin/admin-action-group";
import { AdminCard } from "@/components/admin/admin-card";
import { AdminDangerZone } from "@/components/admin/admin-danger-zone";
import { AdminEmptyState } from "@/components/admin/admin-empty-state";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminStatusBadge } from "@/components/admin/admin-status-badge";
import type { QuestionAssetView } from "@/app/admin/questions/asset-actions";
import type { QuestionSourceFileView } from "@/app/admin/questions/source-file-actions";
import { AdminQuestionEditDetails } from "@/components/admin-question-edit-details";
import { DeleteSubmitButton } from "@/components/delete-submit-button";
import { FormSubmitButton } from "@/components/form-submit-button";
import { PageFeedback } from "@/components/page-feedback";
import { QuestionAnswerFields } from "@/components/question-answer-fields";
import { QuestionHtmlEditor } from "@/components/question-html-editor";
import { QuestionAssetsPanel } from "@/components/question-assets-panel";
import { QuestionSourceFilesPanel } from "@/components/question-source-files-panel";
import {
  TaxonomyTagChips,
  type TaxonomyTagChipAssignment,
} from "@/components/tags/taxonomy-tag-chips";
import { TaxonomyTagTreePicker } from "@/components/tags/taxonomy-tag-tree-picker";
import { Button } from "@/components/ui/button";
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
import { requireAdmin } from "@/lib/auth/guards";
import {
  extractImportAssetReferences,
  type ImportAssetReferences,
} from "@/lib/batch-import/asset-references";
import { QUESTION_ASSETS_BUCKET } from "@/lib/question-assets";
import { getQuestionReadiness } from "@/lib/questions/readiness";
import { createClient } from "@/lib/supabase/server";
import { loadTaxonomyCatalog } from "@/lib/tags/taxonomy-db";
import type { Database } from "@/types/database";

type AdminQuestionsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined> & {
    error?: string;
    tax_difficulty_max?: string | string[];
    tax_difficulty_min?: string | string[];
    tax_exclude_search?: string | string[];
    tax_reviewed?: string | string[];
    tax_search?: string | string[];
    edit?: string;
    q?: string;
    page?: string;
    return_to?: string | string[];
    saved?: string;
    status?: string;
  }>;
};

const questionStatuses = ["draft", "published", "archived"] as const;
type QuestionRow = Database["public"]["Tables"]["questions"]["Row"];
type AdminQuestionSummaryRow = Pick<
  QuestionRow,
  | "created_at"
  | "difficulty_rating"
  | "id"
  | "question_code"
  | "question_type"
  | "status"
  | "title"
  | "updated_at"
>;
type AdminQuestionDetailRow = Pick<
  QuestionRow,
  | "answer_spec"
  | "content_html"
  | "content_source"
  | "content_source_format"
  | "difficulty_rating"
  | "id"
  | "options"
  | "question_code"
  | "question_type"
  | "solution_html"
  | "solution_source"
  | "solution_source_format"
  | "status"
  | "title"
>;
type AdminQuestionRow = AdminQuestionSummaryRow | AdminQuestionDetailRow;
const ADMIN_QUESTION_PAGE_SIZE = 50;
const ADMIN_QUESTION_SUMMARY_SELECT =
  "id, question_code, title, question_type, difficulty_rating, status, created_at, updated_at";
const ADMIN_QUESTION_DETAIL_SELECT =
  "id, question_code, title, question_type, difficulty_rating, status, answer_spec, options, content_html, content_source, content_source_format, solution_html, solution_source, solution_source_format";
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function safeStatusFilter(value: string | undefined) {
  return questionStatuses.find((status) => status === value) ?? "";
}

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function tagIdList(value: string | string[] | undefined) {
  const values = Array.isArray(value) ? value : [value ?? ""];
  return values
    .flatMap((item) => item.split(/[,\s]+/))
    .map((item) => item.trim())
    .filter(Boolean);
}

function parsePage(value: string | string[] | undefined) {
  const parsed = Number(firstParam(value));
  return Number.isFinite(parsed) && parsed >= 1 ? Math.trunc(parsed) : 1;
}

function pageHref(
  params: Record<string, string | string[] | undefined>,
  page: number,
) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (key === "page" || key === "error" || key === "saved") continue;
    for (const item of Array.isArray(value) ? value : value ? [value] : []) {
      query.append(key, item);
    }
  }
  if (page > 1) query.set("page", String(page));
  const serialized = query.toString();
  return serialized ? `/admin/questions?${serialized}` : "/admin/questions";
}

function selectedTagsForFacets({
  facets,
  params,
  prefix,
}: {
  facets: { facet_key: string }[];
  params: Record<string, string | string[] | undefined>;
  prefix: string;
}) {
  return Object.fromEntries(
    facets.map((facet) => [
      facet.facet_key,
      tagIdList(params[`${prefix}_${facet.facet_key}`]),
    ]),
  ) as Record<string, string[]>;
}


function selectedTaxonomyTagMapFromAssignments(
  assignments: TaxonomyTagChipAssignment[] | undefined,
) {
  const selected: Record<string, string[]> = {};

  for (const assignment of assignments ?? []) {
    const facetKey = assignment.facet_key ?? assignment.category;
    if (!facetKey) continue;
    selected[facetKey] = [...(selected[facetKey] ?? []), assignment.tag_id];
  }

  return selected;
}

function numericParam(value: string | string[] | undefined) {
  const first = firstParam(value);
  if (first === undefined || first.trim() === "") return undefined;
  const numeric = Number(first);
  return Number.isFinite(numeric) ? numeric : Number.NaN;
}

function postgrestLikePattern(value: string) {
  return value.replace(/[,%_]/g, " ").trim();
}

function isMissingTaxonomyTableError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const record = error as { code?: unknown; message?: unknown };
  const message = typeof record.message === "string" ? record.message : "";

  return (
    record.code === "42P01" ||
    /taxonomy_|relation .* does not exist|schema cache/i.test(message)
  );
}

function hasQuestionDetailFields(
  question: AdminQuestionRow,
): question is AdminQuestionDetailRow {
  return "content_html" in question && "solution_html" in question;
}

export default async function AdminQuestionsPage({
  searchParams,
}: AdminQuestionsPageProps) {
  const params = await searchParams;
  await requireAdmin();
  const supabase = await createClient();
  const search = (params.q ?? "").trim().toLowerCase();
  const focusedQuestionId = uuidPattern.test(firstParam(params.edit) ?? "")
    ? firstParam(params.edit)!.trim()
    : "";
  const editReturnTo = firstParam(params.return_to) ?? "";
  const selectedStatus = safeStatusFilter(params.status);
  const { catalog: taxonomyCatalog, errorMessage: taxonomyCatalogError } =
    await loadTaxonomyCatalog(supabase);
  const taxonomyFilter = {
    difficulty: {
      max: numericParam(params.tax_difficulty_max),
      min: numericParam(params.tax_difficulty_min),
    },
    exclude: selectedTagsForFacets({
      facets: taxonomyCatalog.facets,
      params,
      prefix: "tax_exclude",
    }),
    include: selectedTagsForFacets({
      facets: taxonomyCatalog.facets,
      params,
      prefix: "tax",
    }),
    requireReviewed: firstParam(params.tax_reviewed) !== "false",
  };
  const selectedTaxonomyInclude = taxonomyFilter.include;
  const selectedTaxonomyExclude = taxonomyFilter.exclude;
  const page = parsePage(params.page);
  const currentPath = pageHref(params, page);
  const pageSize = ADMIN_QUESTION_PAGE_SIZE;
  const includeTagIds = Object.values(taxonomyFilter.include).flat();
  const excludeTagIds = Object.values(taxonomyFilter.exclude).flat();
  const difficultyMin = Number.isFinite(taxonomyFilter.difficulty.min)
    ? taxonomyFilter.difficulty.min
    : null;
  const difficultyMax = Number.isFinite(taxonomyFilter.difficulty.max)
    ? taxonomyFilter.difficulty.max
    : null;
  const facetByTagId = new Map(
    taxonomyCatalog.nodes.map((node) => [node.tag_id, node.facet_key]),
  );
  const taxonomySearchArgs = {
    assignment_review_status: taxonomyFilter.requireReviewed
      ? "approved"
      : null,
    difficulty_max: difficultyMax,
    difficulty_min: difficultyMin,
    exclude_tag_ids: excludeTagIds,
    include_tag_ids: includeTagIds,
    page_limit: pageSize,
    page_offset: (page - 1) * pageSize,
    query_text: search || null,
    question_status: selectedStatus || null,
  };
  const {
    data: taxonomySearchRows,
    error: taxonomyRpcError,
  } = focusedQuestionId
    ? {
        data: [{ question_id: focusedQuestionId, total_count: 1 }],
        error: null,
      }
    : await supabase.rpc("search_questions_by_taxonomy", taxonomySearchArgs);
  let fallbackTotalQuestions = 0;
  if (!taxonomyRpcError && page > 1 && !taxonomySearchRows?.length) {
    const { data: firstPageRows } = await supabase.rpc(
      "search_questions_by_taxonomy",
      {
        ...taxonomySearchArgs,
        page_limit: 1,
        page_offset: 0,
      },
    );
    fallbackTotalQuestions = Number(firstPageRows?.[0]?.total_count ?? 0);
  }
  let orderedQuestionIds = (taxonomySearchRows ?? []).map(
    (row) => row.question_id,
  );
  let totalQuestions = Number(
    taxonomySearchRows?.[0]?.total_count ?? fallbackTotalQuestions,
  );
  let fallbackQuestionsResult: {
    count: number | null;
    data: AdminQuestionRow[] | null;
    error: { message?: string } | null;
  } | null = null;
  if (taxonomyRpcError) {
    let fallbackQuery = focusedQuestionId
      ? supabase
          .from("questions")
          .select(ADMIN_QUESTION_DETAIL_SELECT, { count: "exact" })
      : supabase
          .from("questions")
          .select(ADMIN_QUESTION_SUMMARY_SELECT, { count: "exact" });

    if (selectedStatus) {
      fallbackQuery = fallbackQuery.eq("status", selectedStatus);
    }

    if (difficultyMin !== null) {
      fallbackQuery = fallbackQuery.gte("difficulty_rating", difficultyMin);
    }

    if (difficultyMax !== null) {
      fallbackQuery = fallbackQuery.lte("difficulty_rating", difficultyMax);
    }

    const fallbackSearch = postgrestLikePattern(search);
    if (fallbackSearch) {
      fallbackQuery = fallbackQuery.or(
        `question_code.ilike.%${fallbackSearch}%,title.ilike.%${fallbackSearch}%`,
      );
    }

    fallbackQuestionsResult = await fallbackQuery
      .order("created_at", { ascending: false })
      .range((page - 1) * pageSize, page * pageSize - 1);
    orderedQuestionIds = (fallbackQuestionsResult.data ?? []).map(
      (question) => question.id,
    );
    totalQuestions = fallbackQuestionsResult.count ?? 0;
  }

  const questionOrder = new Map(
    orderedQuestionIds.map((questionId, index) => [questionId, index]),
  );
  const [
    { data: questions, error },
    { data: questionAssets },
    { data: questionSourceFiles },
  ] =
    await Promise.all([
      fallbackQuestionsResult
        ? Promise.resolve(fallbackQuestionsResult)
        : orderedQuestionIds.length
          ? focusedQuestionId
            ? supabase
                .from("questions")
                .select(ADMIN_QUESTION_DETAIL_SELECT)
                .in("id", orderedQuestionIds)
            : supabase
                .from("questions")
                .select(ADMIN_QUESTION_SUMMARY_SELECT)
                .in("id", orderedQuestionIds)
          : Promise.resolve({ data: [], error: null }),
      focusedQuestionId && orderedQuestionIds.length
        ? supabase
            .from("question_assets")
            .select(
              "id, question_id, object_path, original_filename, display_on_detail",
            )
            .eq("status", "ready")
            .in("question_id", orderedQuestionIds)
        : Promise.resolve({ data: [], error: null }),
      focusedQuestionId && orderedQuestionIds.length
        ? supabase
            .from("question_source_files")
            .select(
              "id, question_id, original_filename, mime_type, size_bytes, status",
            )
            .neq("status", "deleted")
            .in("question_id", orderedQuestionIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

  const filteredQuestions = [...(questions ?? [])].sort(
    (left, right) =>
      (questionOrder.get(left.id) ?? Number.MAX_SAFE_INTEGER) -
      (questionOrder.get(right.id) ?? Number.MAX_SAFE_INTEGER),
  );
  const questionIds = filteredQuestions.map((question) => question.id);
  const assetsByQuestionId = new Map<string, QuestionAssetView[]>();
  const sourceFilesByQuestionId = new Map<string, QuestionSourceFileView[]>();
  const importRefsByQuestionId = new Map<string, ImportAssetReferences>();
  const taxonomyAssignmentsByQuestionId = new Map<
    string,
    TaxonomyTagChipAssignment[]
  >();
  let taxonomySearchMessage: string | null = taxonomyRpcError
    ? isMissingTaxonomyTableError(taxonomyRpcError)
      ? "Taxonomy search RPC is unavailable. Apply migrations 0011 and 0012."
      : `Taxonomy search is unavailable: ${taxonomyRpcError.message}`
    : null;
  const { data: importItems } = focusedQuestionId && questionIds.length
    ? await supabase
        .from("import_batch_items")
        .select("created_question_id, normalized_question_json")
        .eq("status", "imported")
        .in("created_question_id", questionIds)
    : { data: [] };
  if (questionIds.length) {
    const { data, error: taxonomyAssignmentsError } = await supabase
      .from("question_taxonomy_assignments")
      .select("question_id, tag_id, review_status")
      .in("question_id", questionIds);

    if (taxonomyAssignmentsError) {
      taxonomySearchMessage = isMissingTaxonomyTableError(taxonomyAssignmentsError)
        ? "Taxonomy assignment tables are not available yet. Apply migration 0011_math_taxonomy_source_of_truth.sql to enable these filters."
        : `Taxonomy filters are unavailable: ${taxonomyAssignmentsError.message}`;
    } else {
      for (const assignment of data ?? []) {
        const current =
          taxonomyAssignmentsByQuestionId.get(assignment.question_id) ?? [];
        current.push({
          facet_key: facetByTagId.get(assignment.tag_id),
          review_status: assignment.review_status,
          tag_id: assignment.tag_id,
        });
        taxonomyAssignmentsByQuestionId.set(assignment.question_id, current);
      }
    }
  }

  for (const asset of questionAssets ?? []) {
    if (!asset.question_id) {
      continue;
    }

    const current = assetsByQuestionId.get(asset.question_id) ?? [];
    const { data } = supabase.storage
      .from(QUESTION_ASSETS_BUCKET)
      .getPublicUrl(asset.object_path);

    current.push({
      id: asset.id,
      questionId: asset.question_id,
      originalFilename: asset.original_filename,
      publicUrl: data.publicUrl,
      displayOnDetail: asset.display_on_detail,
    });
    assetsByQuestionId.set(asset.question_id, current);
  }

  for (const sourceFile of questionSourceFiles ?? []) {
    if (!sourceFile.question_id) {
      continue;
    }

    const current = sourceFilesByQuestionId.get(sourceFile.question_id) ?? [];

    current.push({
      id: sourceFile.id,
      questionId: sourceFile.question_id,
      originalFilename: sourceFile.original_filename,
      mimeType: sourceFile.mime_type,
      sizeBytes: sourceFile.size_bytes,
      status: sourceFile.status,
    });
    sourceFilesByQuestionId.set(sourceFile.question_id, current);
  }

  for (const item of importItems ?? []) {
    if (!item.created_question_id) {
      continue;
    }

    importRefsByQuestionId.set(
      item.created_question_id,
      extractImportAssetReferences(item.normalized_question_json),
    );
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        description="Search, filter, edit, and maintain the official question bank. Publishing still flows through explicit admin review."
        eyebrow="Content management"
        title="Questions"
      />
      <PageFeedback error={params.error} saved={params.saved} />
      {!focusedQuestionId ? (
      <details className="rounded-lg border bg-card p-5 shadow-sm">
        <summary className="cursor-pointer list-none">
          <div className="space-y-1">
            <p className="text-base font-semibold">Create question</p>
            <p className="text-sm text-muted-foreground">
              Open this panel only when adding a new manual question.
            </p>
          </div>
        </summary>
        <div className="mt-4 rounded-md border bg-background p-4">
          <form
            id="create-question-form"
            action={createQuestion}
            className="grid gap-4 md:grid-cols-2"
          >
            <input id="create-question-draft-id" type="hidden" name="draft_id" />
            <div className="space-y-2">
              <Label htmlFor="question_code">Code</Label>
              <Input
                id="question_code"
                name="question_code"
                placeholder="Q10042"
                required
                maxLength={80}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                name="title"
                placeholder="Newton's laws FRQ"
                required
                maxLength={240}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="difficulty_rating">Difficulty 0-1000</Label>
              <Input
                id="difficulty_rating"
                name="difficulty_rating"
                type="number"
                min="0"
                max="1000"
                defaultValue="500"
                required
              />
            </div>
            <QuestionAnswerFields defaultQuestionType="frq" />
            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <select
                id="status"
                name="status"
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                defaultValue="draft"
              >
                <option value="draft">Draft</option>
                <option value="published">Published</option>
                <option value="archived">Archived</option>
              </select>
            </div>
            <div className="space-y-2 md:col-span-2">
              <QuestionHtmlEditor
                id="content_html"
                label="Content HTML"
                name="content_html"
                placeholder="<p>Question stem placeholder</p>"
                required
              />
              <p className="text-xs text-muted-foreground">
                HTML is sanitized on save before public rendering.
              </p>
            </div>
            <div className="space-y-2 md:col-span-2">
              <QuestionHtmlEditor
                id="solution_html"
                label="Solution HTML"
                name="solution_html"
                placeholder="<p>Optional solution placeholder</p>"
              />
            </div>
            <div className="md:col-span-2">
              <TaxonomyTagTreePicker
                namePrefix="question_tax"
                selectable="assignable"
                taxonomyCatalog={taxonomyCatalog}
                title="Question taxonomy tags"
              />
            </div>
            <div className="md:col-span-2">
              <QuestionAssetsPanel
                draftInputId="create-question-draft-id"
                questionCodeInputId="question_code"
                titleInputId="title"
              />
            </div>
            <div className="md:col-span-2">
              <QuestionSourceFilesPanel
                draftInputId="create-question-draft-id"
                questionCodeInputId="question_code"
                titleInputId="title"
              />
            </div>
            <div className="md:col-span-2">
              <FormSubmitButton pendingLabel="Creating question...">
                Create question
              </FormSubmitButton>
            </div>
          </form>
        </div>
      </details>
      ) : null}
      {!focusedQuestionId ? (
      <AdminCard
        compact
        title="Content library filters"
        description="Search the official question bank without loading full question bodies until you open edit mode."
      >
          <form className="grid gap-3 md:grid-cols-[1.5fr_1fr_auto]">
            <div className="space-y-2">
              <Label htmlFor="q">Search</Label>
              <Input
                id="q"
                name="q"
                defaultValue={params.q ?? ""}
                placeholder="Question code or title"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="status_filter">Status</Label>
              <select
                id="status_filter"
                name="status"
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                defaultValue={selectedStatus}
              >
                <option value="">All statuses</option>
                {questionStatuses.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-end gap-2">
              <Button type="submit">Filter</Button>
              <Button asChild variant="outline" type="button">
                <Link href="/admin/questions">Reset</Link>
              </Button>
            </div>
            <div className="space-y-3 rounded-md border p-3 md:col-span-3">
              <div className="space-y-1">
                <p className="text-sm font-medium">Taxonomy tags</p>
                <p className="text-xs text-muted-foreground">
                  Filter by official curriculum, concept, method, task, and form
                  assignments.
                </p>
              </div>
              <TaxonomyTagTreePicker
                namePrefix="tax"
                searchQuery={firstParam(params.tax_search) ?? ""}
                selectedTagIds={selectedTaxonomyInclude}
                taxonomyCatalog={taxonomyCatalog}
                title="Include official taxonomy tags"
              />
              <details className="rounded-md border px-3 py-2">
                <summary className="cursor-pointer text-sm font-medium">
                  Exclude tags and difficulty
                </summary>
                <div className="mt-3 space-y-3">
                  <TaxonomyTagTreePicker
                    namePrefix="tax_exclude"
                    searchName="tax_exclude_search"
                    searchQuery={firstParam(params.tax_exclude_search) ?? ""}
                    selectedTagIds={selectedTaxonomyExclude}
                    taxonomyCatalog={taxonomyCatalog}
                    title="Exclude official taxonomy tags"
                  />
                  <div className="grid gap-3 md:grid-cols-3">
                  <Input
                    name="tax_difficulty_min"
                    defaultValue={firstParam(params.tax_difficulty_min) ?? ""}
                    placeholder="Difficulty min"
                    aria-label="Taxonomy difficulty minimum"
                    type="number"
                  />
                  <Input
                    name="tax_difficulty_max"
                    defaultValue={firstParam(params.tax_difficulty_max) ?? ""}
                    placeholder="Difficulty max"
                    aria-label="Taxonomy difficulty maximum"
                    type="number"
                  />
                  <div className="space-y-2">
                    <Label htmlFor="tax_reviewed">Assignments</Label>
                    <select
                      id="tax_reviewed"
                      name="tax_reviewed"
                      className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                      defaultValue={firstParam(params.tax_reviewed) ?? "true"}
                    >
                      <option value="true">Reviewed only</option>
                      <option value="false">Any review status</option>
                    </select>
                  </div>
                  </div>
                </div>
              </details>
              {taxonomySearchMessage || taxonomyCatalogError ? (
                <div className="space-y-1 text-xs">
                  {taxonomySearchMessage ? (
                    <p className="text-amber-700">{taxonomySearchMessage}</p>
                  ) : null}
                  {taxonomyCatalogError ? (
                    <p className="text-amber-700">{taxonomyCatalogError}</p>
                  ) : null}
                </div>
              ) : null}
              {!taxonomySearchMessage &&
              taxonomyAssignmentsByQuestionId.size === 0 ? (
                <p className="rounded-md border border-dashed p-2 text-xs text-muted-foreground">
                  No taxonomy assignments are present on this result page.
                </p>
              ) : null}
            </div>
          </form>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
            <p>
              Showing {filteredQuestions.length} questions from a page size of{" "}
              {ADMIN_QUESTION_PAGE_SIZE}. Use search, filters, or the next page
              to find more. Total matching questions: {totalQuestions}.
            </p>
            <div className="flex items-center gap-2">
              <Button asChild disabled={page <= 1} size="sm" variant="outline">
                <Link href={pageHref(params, Math.max(1, page - 1))}>
                  Previous
                </Link>
              </Button>
              <span>Page {page}</span>
              <Button
                asChild
                disabled={page * pageSize >= totalQuestions}
                size="sm"
                variant="outline"
              >
                <Link href={pageHref(params, page + 1)}>Next</Link>
              </Button>
            </div>
          </div>
      </AdminCard>
      ) : null}
      {error ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error.message}
        </p>
      ) : null}
      {focusedQuestionId ? (
        <div className="space-y-4">
          {filteredQuestions.map((question) => {
            if (!hasQuestionDetailFields(question)) {
              return null;
            }
            const importedAssetReferences =
              importRefsByQuestionId.get(question.id) ?? null;
            const imageCount = assetsByQuestionId.get(question.id)?.length ?? 0;
            const sourceFileCount =
              sourceFilesByQuestionId.get(question.id)?.length ?? 0;
            const readiness = getQuestionReadiness({
              contentHtml: question.content_html,
              difficultyRating: question.difficulty_rating,
              imageCount,
              importedAssetReferences,
              solutionHtml: question.solution_html,
              sourceFileCount,
              tagCount:
                taxonomyAssignmentsByQuestionId.get(question.id)?.length ?? 0,
            });

            return (
              <AdminQuestionEditDetails
                key={question.id}
                assets={assetsByQuestionId.get(question.id)}
                defaultOpen
                importedAssetReferences={importedAssetReferences}
                question={question}
                readiness={readiness}
                returnTo={editReturnTo}
                selectedTaxonomyTagIds={selectedTaxonomyTagMapFromAssignments(
                  taxonomyAssignmentsByQuestionId.get(question.id),
                )}
                sourceFiles={sourceFilesByQuestionId.get(question.id)}
                taxonomyCatalog={taxonomyCatalog}
              />
            );
          })}
          {!filteredQuestions.length ? (
            <div className="rounded-md border p-8 text-center text-sm text-muted-foreground">
              Question not found or not visible to your account.
            </div>
          ) : null}
        </div>
      ) : (
      <AdminCard
        title="Question library"
        description="Manage matching questions in bounded pages. Open edit mode for full content, taxonomy, assets, and source files."
        badge={<AdminStatusBadge status="info">{totalQuestions} matching</AdminStatusBadge>}
        contentClassName="p-0"
      >
        <form
          id="admin-questions-bulk-form"
          action={bulkUpdateQuestions}
          className="border-b p-3 text-sm"
        >
          <input type="hidden" name="return_to" value={currentPath} />
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <AdminStatusBadge status="pending">Bulk actions</AdminStatusBadge>
            <span className="text-xs text-muted-foreground">
              Select rows below before applying a status update or delete action.
            </span>
          </div>
          <AdminActionGroup
            secondary={
              <select
                name="status"
                className="h-9 rounded-md border bg-background px-2 text-sm"
                defaultValue="draft"
              >
                <option value="draft">Draft</option>
                <option value="published">Published</option>
                <option value="archived">Archived</option>
              </select>
            }
            primary={
              <FormSubmitButton
                name="bulk_action"
                value="status"
                size="sm"
                variant="outline"
                pendingLabel="Updating..."
              >
                Update selected status
              </FormSubmitButton>
            }
            destructive={
              <AdminDangerZone compact title="Delete selected questions">
                <FormSubmitButton
                  name="bulk_action"
                  value="delete"
                  size="sm"
                  variant="destructive"
                  pendingLabel="Deleting..."
                >
                  Delete selected
                </FormSubmitButton>
              </AdminDangerZone>
            }
          />
        </form>
        <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <span className="sr-only">Select</span>
              </TableHead>
              <TableHead>Code</TableHead>
              <TableHead>Title</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Tags</TableHead>
              <TableHead>Difficulty</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[160px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredQuestions.map((question) => {
              return (
                <Fragment key={question.id}>
                  <TableRow>
                    <TableCell>
                      <input
                        aria-label={`Select question ${question.question_code}`}
                        className="size-4 rounded border"
                        form="admin-questions-bulk-form"
                        name="question_id"
                        type="checkbox"
                        value={question.id}
                      />
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {question.question_code}
                    </TableCell>
                    <TableCell>{question.title}</TableCell>
                    <TableCell>{question.question_type}</TableCell>
                    <TableCell>
                      <TaxonomyTagChips
                        assignments={taxonomyAssignmentsByQuestionId.get(
                          question.id,
                        )}
                        emptyLabel="No taxonomy tags assigned yet."
                        maxVisibleTags={3}
                        showCategoryHeadings={false}
                        taxonomyCatalog={taxonomyCatalog}
                      />
                    </TableCell>
                    <TableCell>{question.difficulty_rating}</TableCell>
                    <TableCell>
                      <AdminStatusBadge status={question.status} />
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-2">
                        <Button asChild size="sm" variant="outline">
                          <Link
                            href={`/admin/questions?edit=${question.id}&return_to=${encodeURIComponent(
                              currentPath,
                            )}`}
                          >
                            Edit
                          </Link>
                        </Button>
                        <form action={deleteQuestion}>
                          <input type="hidden" name="id" value={question.id} />
                          <DeleteSubmitButton
                            label={`question ${question.question_code}`}
                          />
                        </form>
                      </div>
                    </TableCell>
                  </TableRow>
                </Fragment>
              );
            })}
            {!filteredQuestions.length ? (
              <TableRow>
                <TableCell colSpan={8} className="h-24 text-center">
                  <AdminEmptyState
                    title={
                      (questions ?? []).length
                        ? "No questions match these filters."
                        : "No questions yet."
                    }
                    description={
                      (questions ?? []).length
                        ? "Adjust search, status, taxonomy, or difficulty filters to broaden the question library."
                        : "Create a draft, import questions, or use demo seed data from the admin dashboard."
                    }
                  />
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
        </div>
      </AdminCard>
      )}
    </div>
  );
}
