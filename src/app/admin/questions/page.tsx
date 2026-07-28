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
import { AdminQuestionLibraryNav } from "@/components/admin/admin-question-library-nav";
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
import { getQuestionReadiness } from "@/lib/questions/readiness";
import { createClient } from "@/lib/supabase/server";
import { getQuestionAssetUrl } from "@/lib/storage/question-assets";
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
  | "difficulty_rating"
  | "id"
  | "question_code"
  | "question_type"
  | "status"
  | "title"
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
type AdminQuestionSearchRow =
  Database["public"]["Functions"]["search_questions_by_taxonomy"]["Returns"][number];
type AdminQuestionEditBundle = AdminQuestionDetailRow & {
  import_batch_items?: Array<{
    created_question_id: string | null;
    normalized_question_json: Parameters<typeof extractImportAssetReferences>[0];
  }> | null;
  question_assets?: Array<{
    alt_text: string | null;
    id: string;
    label: string | null;
    question_id: string | null;
    storage_path: string;
  }> | null;
  question_source_files?: Array<{
    id: string;
    mime_type: string;
    original_filename: string;
    question_id: string | null;
    size_bytes: number;
    status: QuestionSourceFileView["status"];
  }> | null;
  question_taxonomy_assignments?: Array<{
    question_id: string;
    review_status: string;
    tag_id: string;
  }> | null;
};
const ADMIN_QUESTION_PAGE_SIZE = 50;
const ADMIN_QUESTION_SUMMARY_SELECT =
  "id, question_code, title, question_type, difficulty_rating, status, created_at, updated_at";
const ADMIN_QUESTION_DETAIL_SELECT =
  "id, question_code, title, question_type, difficulty_rating, status, answer_spec, options, content_html, content_source, content_source_format, solution_html, solution_source, solution_source_format";
const ADMIN_QUESTION_EDIT_SELECT =
  `${ADMIN_QUESTION_DETAIL_SELECT}, question_assets(id, question_id, storage_path, label, alt_text), question_source_files(id, question_id, original_filename, mime_type, size_bytes, status), import_batch_items(created_question_id, normalized_question_json), question_taxonomy_assignments(question_id, tag_id, review_status)`;
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

function selectedTaxonomyTagIdsForSearch(
  params: Record<string, string | string[] | undefined>,
  kind: "exclude" | "include",
) {
  const tagIds: string[] = [];

  for (const [key, value] of Object.entries(params)) {
    const isMatch =
      kind === "exclude"
        ? key.startsWith("tax_exclude_") && key !== "tax_exclude_search"
        : key.startsWith("tax_") &&
          !key.startsWith("tax_exclude_") &&
          ![
            "tax_difficulty_max",
            "tax_difficulty_min",
            "tax_reviewed",
            "tax_search",
          ].includes(key);

    if (isMatch) {
      tagIds.push(...tagIdList(value));
    }
  }

  return Array.from(new Set(tagIds));
}

function taxonomyAssignmentsFromRpcValue(
  value: Database["public"]["Functions"]["search_questions_by_taxonomy"]["Returns"][number]["matched_tags"],
) {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item): TaxonomyTagChipAssignment[] => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const tagId = item.tag_id;
    if (typeof tagId !== "string") return [];

    return [{
      facet_key:
        typeof item.facet_key === "string" ? item.facet_key : undefined,
      review_status:
        typeof item.review_status === "string" ? item.review_status : undefined,
      tag_id: tagId,
    }];
  });
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
  const [params, , supabase] = await Promise.all([
    searchParams,
    requireAdmin(),
    createClient(),
  ]);
  const search = (params.q ?? "").trim().toLowerCase();
  const focusedQuestionId = uuidPattern.test(firstParam(params.edit) ?? "")
    ? firstParam(params.edit)!.trim()
    : "";
  const editReturnTo = firstParam(params.return_to) ?? "";
  const selectedStatus = safeStatusFilter(params.status);
  const page = parsePage(params.page);
  const pageSize = ADMIN_QUESTION_PAGE_SIZE;
  const difficultyMinValue = numericParam(params.tax_difficulty_min);
  const difficultyMaxValue = numericParam(params.tax_difficulty_max);
  const difficultyMin = Number.isFinite(difficultyMinValue)
    ? difficultyMinValue
    : null;
  const difficultyMax = Number.isFinite(difficultyMaxValue)
    ? difficultyMaxValue
    : null;
  const taxonomySearchArgs = {
    assignment_review_status:
      firstParam(params.tax_reviewed) !== "false" ? "approved" : null,
    difficulty_max: difficultyMax,
    difficulty_min: difficultyMin,
    exclude_tag_ids: selectedTaxonomyTagIdsForSearch(params, "exclude"),
    include_tag_ids: selectedTaxonomyTagIdsForSearch(params, "include"),
    page_limit: pageSize,
    page_offset: (page - 1) * pageSize,
    query_text: search || null,
    question_status: selectedStatus || null,
  };
  const taxonomyCatalogPromise = loadTaxonomyCatalog(supabase);
  const focusedQuestionBundlePromise = focusedQuestionId
    ? supabase
        .from("questions")
        .select(ADMIN_QUESTION_EDIT_SELECT)
        .eq("id", focusedQuestionId)
        .is("owner_bank_id", null)
        .neq("question_source_files.status", "deleted")
        .eq("import_batch_items.status", "imported")
        .maybeSingle()
    : Promise.resolve({ data: null, error: null });
  const taxonomySearchPromise = focusedQuestionId
    ? Promise.resolve({
        data: null as AdminQuestionSearchRow[] | null,
        error: null,
      })
    : supabase.rpc("search_questions_by_taxonomy", taxonomySearchArgs);
  const [
    { catalog: taxonomyCatalog, errorMessage: taxonomyCatalogError },
    focusedQuestionBundleResult,
    { data: taxonomySearchRows, error: taxonomyRpcError },
  ] = await Promise.all([
    taxonomyCatalogPromise,
    focusedQuestionBundlePromise,
    taxonomySearchPromise,
  ]);
  const focusedQuestionBundle =
    focusedQuestionBundleResult.data as AdminQuestionEditBundle | null;
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
  const currentPath = pageHref(params, page);
  const facetByTagId = new Map(
    taxonomyCatalog.nodes.map((node) => [node.tag_id, node.facet_key]),
  );
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
    fallbackQuery = fallbackQuery.is("owner_bank_id", null);

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
    totalQuestions = fallbackQuestionsResult.count ?? 0;
  }

  const rpcQuestions = taxonomyRpcError || focusedQuestionId
    ? []
    : (taxonomySearchRows ?? []).map((row): AdminQuestionSummaryRow => ({
        difficulty_rating: row.difficulty_rating,
        id: row.question_id,
        question_code: row.question_code,
        question_type: row.question_type as QuestionRow["question_type"],
        status: row.status as QuestionRow["status"],
        title: row.title,
      }));
  const [
    { data: questions, error },
    { data: questionAssets },
    { data: questionSourceFiles },
  ] =
    await Promise.all([
      focusedQuestionId
        ? Promise.resolve({
            data: focusedQuestionBundle
              ? [focusedQuestionBundle as AdminQuestionDetailRow]
              : [],
            error: focusedQuestionBundleResult.error,
          })
        : fallbackQuestionsResult
        ? Promise.resolve(fallbackQuestionsResult)
        : Promise.resolve({ data: rpcQuestions, error: null }),
      focusedQuestionId
        ? Promise.resolve({ data: focusedQuestionBundle?.question_assets ?? [] })
        : Promise.resolve({ data: [], error: null }),
      focusedQuestionId
        ? Promise.resolve({ data: focusedQuestionBundle?.question_source_files ?? [] })
        : Promise.resolve({ data: [], error: null }),
    ]);

  const filteredQuestions = [...(questions ?? [])];
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
  if (!taxonomyRpcError && !focusedQuestionId) {
    for (const row of taxonomySearchRows ?? []) {
      taxonomyAssignmentsByQuestionId.set(
        row.question_id,
        taxonomyAssignmentsFromRpcValue(row.matched_tags),
      );
    }
  }
  const [
    { data: importItems },
    { data: taxonomyAssignments, error: taxonomyAssignmentsError },
  ] = await Promise.all([
    focusedQuestionId
      ? Promise.resolve({ data: focusedQuestionBundle?.import_batch_items ?? [] })
      : Promise.resolve({ data: [] }),
    focusedQuestionId
      ? Promise.resolve({
          data: focusedQuestionBundle?.question_taxonomy_assignments ?? [],
          error: focusedQuestionBundleResult.error,
        })
      : !taxonomyRpcError
      ? Promise.resolve({ data: [], error: null })
      : questionIds.length
      ? supabase
          .from("question_taxonomy_assignments")
          .select("question_id, tag_id, review_status")
          .in("question_id", questionIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (questionIds.length) {
    if (taxonomyAssignmentsError) {
      taxonomySearchMessage = isMissingTaxonomyTableError(taxonomyAssignmentsError)
        ? "Taxonomy assignment tables are not available yet. Apply migration 0011_math_taxonomy_source_of_truth.sql to enable these filters."
        : `Taxonomy filters are unavailable: ${taxonomyAssignmentsError.message}`;
    } else {
      for (const assignment of taxonomyAssignments ?? []) {
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

    current.push({
      id: asset.id,
      questionId: asset.question_id,
      originalFilename:
        asset.label?.trim() ||
        asset.alt_text?.trim() ||
        asset.storage_path?.split("/").pop() ||
        "Question image",
      publicUrl: getQuestionAssetUrl(asset.id),
      displayOnDetail: true,
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
        eyebrow="Content management"
        help="Search, filter, edit, and maintain global questions. Teacher-owned Library questions are governed separately and never appear in this workspace."
        helpLabel="Central Public Library details"
        title="Central Public Library"
      />
      <AdminQuestionLibraryNav />
      <PageFeedback error={params.error} saved={params.saved} />
      {!focusedQuestionId ? (
      <details className="rounded-lg border bg-card p-5 shadow-sm">
        <summary className="cursor-pointer list-none">
          <p className="text-base font-semibold">Create question</p>
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
            <input name="status" type="hidden" value="draft" />
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
              Manual authoring creates a private Global Review Draft.
              Publication is available only after review.
            </div>
            <div className="space-y-2 md:col-span-2">
              <QuestionHtmlEditor
                id="content_html"
                label="Content HTML"
                name="content_html"
                placeholder="<p>Question stem placeholder</p>"
                required
              />
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
            </div>
          </form>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/20 px-3 py-2 text-sm">
            <p className="font-medium">{totalQuestions} results</p>
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
                    <TableCell className="font-mono text-sm">
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
