import Link from "next/link";

import { bulkUpdateQuestions, updateQuestion } from "@/app/admin/questions/actions";
import { AdminActionGroup } from "@/components/admin/admin-action-group";
import { AdminCard } from "@/components/admin/admin-card";
import { AdminDangerZone } from "@/components/admin/admin-danger-zone";
import { AdminEmptyState } from "@/components/admin/admin-empty-state";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminStatusBadge } from "@/components/admin/admin-status-badge";
import type { QuestionAssetView } from "@/app/admin/questions/asset-actions";
import type { QuestionSourceFileView } from "@/app/admin/questions/source-file-actions";
import { AdminReviewBulkSelection } from "@/components/admin-review-bulk-selection";
import { DraftReviewCard } from "@/components/draft-review-card";
import { FormSubmitButton } from "@/components/form-submit-button";
import { PageFeedback } from "@/components/page-feedback";
import type { EditableQuestion } from "@/components/question-editor";
import { Button } from "@/components/ui/button";
import { requireAdmin } from "@/lib/auth/guards";
import {
  countImportAssetReferences,
  extractImportAssetReferences,
  type ImportAssetReferences,
} from "@/lib/batch-import/asset-references";
import { QUESTION_ASSETS_BUCKET } from "@/lib/question-assets";
import { getQuestionReadiness } from "@/lib/questions/readiness";
import { createClient } from "@/lib/supabase/server";
import { loadTaxonomyCatalog } from "@/lib/tags/taxonomy-db";

export const dynamic = "force-dynamic";

type ReviewPageProps = {
  searchParams: Promise<{
    batch?: string;
    error?: string;
    page?: string;
    saved?: string;
    search?: string;
  }>;
};

const REVIEW_PAGE_SIZE = 50;
const REVIEW_RELATED_ROW_LIMIT = REVIEW_PAGE_SIZE * 8;

type ReviewQuestion = {
  answer_spec: unknown;
  content_html: string | null;
  content_source: string | null;
  content_source_format: string | null;
  created_at: string;
  difficulty_rating: number;
  id: string;
  options: unknown;
  question_code: string;
  question_type: string;
  solution_html: string | null;
  solution_source: string | null;
  solution_source_format: string | null;
  status: string;
  title: string;
};

type AIReviewMetadata = {
  asset_placeholders?: unknown[];
  page_refs?: unknown[];
  provider?: {
    model?: string;
    name?: string;
    provider?: string;
  };
  source?: string;
  tag_decisions?: {
    tag_ids?: unknown[];
  };
  warnings?: unknown[];
};

function formatDate(value: string | null | undefined) {
  if (!value) {
    return "Unknown";
  }

  return new Date(value).toLocaleString();
}

function shortId(value: string) {
  return value.slice(0, 8);
}

function parsePage(value: string | undefined) {
  const parsed = Number(value);

  return Number.isFinite(parsed) && parsed >= 1 ? Math.trunc(parsed) : 1;
}

function postgrestLikePattern(value: string) {
  return value.replace(/[,%_]/g, " ").trim();
}

function reviewPath({
  batch,
  page,
  search,
}: {
  batch?: string;
  page?: number;
  search?: string;
}) {
  const query = new URLSearchParams();
  if (batch) query.set("batch", batch);
  if (search) query.set("search", search);
  if (page && page > 1) query.set("page", String(page));
  const serialized = query.toString();

  return serialized ? `/admin/review?${serialized}` : "/admin/review";
}

function getAIReviewMetadata(value: unknown): AIReviewMetadata | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const metadata = (value as { ai_metadata?: unknown }).ai_metadata;

  if (!metadata || typeof metadata !== "object") {
    return null;
  }

  const candidate = metadata as AIReviewMetadata;

  return candidate.source === "ai_pdf_import" ? candidate : null;
}

function stringList(values: unknown) {
  if (!Array.isArray(values)) {
    return [];
  }

  return values
    .map((value) => String(value).trim())
    .filter(Boolean);
}

export default async function AdminReviewPage({
  searchParams,
}: ReviewPageProps) {
  const params = await searchParams;
  const profile = await requireAdmin();
  const search = (params.search ?? "").trim().toLowerCase();
  const batchId = (params.batch ?? "").trim();
  const page = parsePage(params.page);
  const pageFrom = (page - 1) * REVIEW_PAGE_SIZE;
  const pageTo = pageFrom + REVIEW_PAGE_SIZE - 1;
  const currentPath = reviewPath({
    batch: params.batch,
    page,
    search: params.search,
  });
  const supabase = await createClient();
  const { catalog: taxonomyCatalog } = await loadTaxonomyCatalog(supabase);
  let batchFilter:
    | {
        createdAt: string | null;
        id: string;
        sourceType: string | null;
      }
    | null = null;
  let batchQuestionIds: string[] | null = null;
  let batchFilterMissing = false;
  let totalDraftQuestions = 0;

  if (batchId) {
    let batchQuery = supabase
      .from("import_batches")
      .select("id, source_type, created_at, created_by")
      .eq("id", batchId);

    if (profile.role !== "super_admin") {
      batchQuery = batchQuery.eq("created_by", profile.id);
    }

    const { data: batch } = await batchQuery.maybeSingle();

    if (batch) {
      batchFilter = {
        createdAt: batch.created_at,
        id: batch.id,
        sourceType: batch.source_type,
      };

      const { count: batchItemCount, data: batchItems } = await supabase
        .from("import_batch_items")
        .select("created_question_id", { count: "exact" })
        .eq("batch_id", batch.id)
        .eq("status", "imported")
        .not("created_question_id", "is", null)
        .order("created_at", { ascending: false })
        .range(pageFrom, pageTo);

      batchQuestionIds = Array.from(
        new Set(
          (batchItems ?? [])
            .map((item) => item.created_question_id)
            .filter((id): id is string => Boolean(id)),
        ),
      );
      totalDraftQuestions = batchItemCount ?? 0;
    } else {
      batchQuestionIds = [];
      batchFilterMissing = true;
    }
  }

  let questions: ReviewQuestion[] = [];
  let error: { message: string } | null = null;

  if (!batchQuestionIds || batchQuestionIds.length) {
    let questionsQuery = supabase
      .from("questions")
      .select(
        "id, question_code, title, question_type, difficulty_rating, status, answer_spec, options, content_html, content_source, content_source_format, solution_html, solution_source, solution_source_format, created_at",
        { count: "exact" },
      )
      .eq("status", "draft")
      .order("created_at", { ascending: false });

    if (batchQuestionIds) {
      questionsQuery = questionsQuery.in("id", batchQuestionIds);
    } else {
      questionsQuery = questionsQuery.range(pageFrom, pageTo);
    }

    const searchPattern = postgrestLikePattern(search);
    if (searchPattern) {
      questionsQuery = questionsQuery.or(
        `question_code.ilike.%${searchPattern}%,title.ilike.%${searchPattern}%`,
      );
    }

    const result = await questionsQuery;
    questions = (result.data ?? []) as ReviewQuestion[];
    error = result.error;
    if (!batchFilter) {
      totalDraftQuestions = result.count ?? 0;
    }
  }

  const draftQuestions = ((questions ?? []) as ReviewQuestion[]).filter(
    (question) =>
      !search ||
      question.question_code.toLowerCase().includes(search) ||
      question.title.toLowerCase().includes(search),
  );
  const questionIds = draftQuestions.map((question) => question.id);
  const relatedRowLimit = Math.max(
    REVIEW_PAGE_SIZE,
    Math.min(REVIEW_RELATED_ROW_LIMIT, questionIds.length * 8),
  );
  let importItemsQuery = supabase
    .from("import_batch_items")
    .select(
      "created_question_id, normalized_question_json, validation_errors, created_at",
    )
    .eq("status", "imported")
    .in("created_question_id", questionIds)
    .limit(relatedRowLimit);

  if (batchFilter) {
    importItemsQuery = importItemsQuery.eq("batch_id", batchFilter.id);
  }

  const [
    { data: questionTags },
    { data: questionAssets },
    { data: sourceFiles },
    { data: importItems },
  ] = questionIds.length
    ? await Promise.all([
        supabase
          .from("question_taxonomy_assignments")
          .select("question_id, tag_id, review_status")
          .in("question_id", questionIds)
          .limit(relatedRowLimit),
        supabase
          .from("question_assets")
          .select(
            "question_id, id, object_path, original_filename, display_on_detail",
          )
          .in("question_id", questionIds)
          .eq("status", "ready")
          .limit(relatedRowLimit),
        supabase
          .from("question_source_files")
          .select(
            "question_id, id, original_filename, mime_type, size_bytes, status",
          )
          .in("question_id", questionIds)
          .neq("status", "deleted")
          .limit(relatedRowLimit),
        importItemsQuery,
      ])
    : [
        { data: [] },
        { data: [] },
        { data: [] },
        { data: [] },
      ];
  const totalPages = Math.max(1, Math.ceil(totalDraftQuestions / REVIEW_PAGE_SIZE));

  const activeTagIds = new Set(
    taxonomyCatalog.nodes.map((node) => node.tag_id),
  );
  const facetByTagId = new Map(
    taxonomyCatalog.nodes.map((node) => [node.tag_id, node.facet_key]),
  );
  const tagStatusById = new Map(
    (questionTags ?? []).map((tag) => [
      `${tag.question_id}:${tag.tag_id}`,
      tag.review_status,
    ]),
  );
  const tagsByQuestionId = new Map<string, string[]>();
  const draftTagCountByQuestionId = new Map<string, number>();
  const publishedTagCountByQuestionId = new Map<string, number>();
  const selectedTaxonomyTagIdsByQuestionId = new Map<
    string,
    Partial<Record<string, string[]>>
  >();
  const assetsByQuestionId = new Map<string, QuestionAssetView[]>();
  const sourceFilesByQuestionId = new Map<string, QuestionSourceFileView[]>();
  const aiMetadataByQuestionId = new Map<string, AIReviewMetadata>();
  const importWarningsByQuestionId = new Map<string, string[]>();
  const importRefsByQuestionId = new Map<string, ImportAssetReferences>();
  const importedAtByQuestionId = new Map<string, string>();

  for (const binding of questionTags ?? []) {
    const tagStatus = tagStatusById.get(
      `${binding.question_id}:${binding.tag_id}`,
    );

    if (!activeTagIds.has(binding.tag_id)) {
      continue;
    }

    if (tagStatus === "pending_review" || tagStatus === "needs_review") {
      draftTagCountByQuestionId.set(
        binding.question_id,
        (draftTagCountByQuestionId.get(binding.question_id) ?? 0) + 1,
      );
    } else if (tagStatus === "approved") {
      publishedTagCountByQuestionId.set(
        binding.question_id,
        (publishedTagCountByQuestionId.get(binding.question_id) ?? 0) + 1,
      );
    }

    tagsByQuestionId.set(binding.question_id, [
      ...(tagsByQuestionId.get(binding.question_id) ?? []),
      binding.tag_id,
    ]);

    const facetKey = facetByTagId.get(binding.tag_id);
    if (facetKey) {
      const selected =
        selectedTaxonomyTagIdsByQuestionId.get(binding.question_id) ?? {};
      selected[facetKey] = [...(selected[facetKey] ?? []), binding.tag_id];
      selectedTaxonomyTagIdsByQuestionId.set(binding.question_id, selected);
    }
  }

  for (const asset of questionAssets ?? []) {
    if (!asset.question_id || !asset.object_path) {
      continue;
    }

    const { data } = supabase.storage
      .from(QUESTION_ASSETS_BUCKET)
      .getPublicUrl(asset.object_path);

    const current = assetsByQuestionId.get(asset.question_id) ?? [];
    current.push({
      id: asset.id,
      questionId: asset.question_id,
      originalFilename: asset.original_filename,
      publicUrl: data.publicUrl,
      displayOnDetail: asset.display_on_detail,
    });
    assetsByQuestionId.set(asset.question_id, current);
  }

  for (const sourceFile of sourceFiles ?? []) {
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
      status: sourceFile.status as QuestionSourceFileView["status"],
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
    importedAtByQuestionId.set(item.created_question_id, item.created_at);
    importWarningsByQuestionId.set(
      item.created_question_id,
      stringList(item.validation_errors),
    );

    const aiMetadata = getAIReviewMetadata(item.normalized_question_json);

    if (aiMetadata) {
      aiMetadataByQuestionId.set(item.created_question_id, aiMetadata);
    }
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        description="Review draft questions, fix readiness blockers, then publish only when an admin explicitly approves the draft."
        eyebrow="Review queue"
        title="Review Drafts"
      />
      <PageFeedback error={params.error} saved={params.saved} />
      <AdminCard
        compact
        title="Review workflow"
        description="Imported or generated drafts stay private until a teacher reviews, edits, and explicitly publishes them."
      >
        <div className="grid gap-3 text-sm md:grid-cols-3">
          {[
            ["1", "Draft imported/generated", "AI import, package import, or generation creates private draft questions."],
            ["2", "Teacher reviews", "Fix readiness blockers, taxonomy, media, and solution quality before publishing."],
            ["3", "Publish or reject", "Publishing is explicit. Reject and delete actions stay separated from the primary path."],
          ].map(([step, title, description]) => (
            <div className="rounded-md border bg-background p-3" key={step}>
              <div className="mb-2 flex items-center gap-2">
                <span className="flex size-6 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                  {step}
                </span>
                <p className="font-medium">{title}</p>
              </div>
              <p className="text-muted-foreground">{description}</p>
            </div>
          ))}
        </div>
      </AdminCard>
      <AdminCard
        compact
        title="Find draft questions"
        description="Filter the private review queue by question code, title, or a selected import batch."
      >
        <form className="flex flex-wrap items-end gap-2">
          <div className="min-w-64 flex-1 space-y-1">
            <label htmlFor="search" className="text-sm font-medium">
              Search drafts
            </label>
            <input
              id="search"
              name="search"
              defaultValue={params.search ?? ""}
              placeholder="Code or title"
              className="h-10 w-full rounded-md border bg-background px-3 text-sm"
            />
          </div>
          <Button type="submit">Filter</Button>
          <Button asChild type="button" variant="outline">
            <Link href="/admin/review">Reset</Link>
          </Button>
          {batchFilter ? (
            <input type="hidden" name="batch" value={batchFilter.id} />
          ) : null}
        </form>
      </AdminCard>
      {batchFilter ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-muted/20 px-3 py-2 text-sm">
          <span>
            Showing drafts from AI PDF import{" "}
            <span className="font-mono">{shortId(batchFilter.id)}</span>
            {batchFilter.createdAt
              ? ` created ${formatDate(batchFilter.createdAt)}`
              : ""}
          </span>
          <Button asChild size="sm" variant="outline">
            <Link href="/admin/review">Clear batch filter</Link>
          </Button>
        </div>
      ) : null}
      {batchFilterMissing ? (
        <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          This import batch was not found or is not visible to your account.
        </p>
      ) : null}
      {error ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error.message}
        </p>
      ) : null}
      {totalDraftQuestions > REVIEW_PAGE_SIZE || page > 1 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-card px-3 py-2 text-sm text-muted-foreground">
          <p>
            Showing {draftQuestions.length ? pageFrom + 1 : 0}-
            {pageFrom + draftQuestions.length} of {totalDraftQuestions} draft
            questions.
          </p>
          <div className="flex items-center gap-2">
            <Button asChild size="sm" variant="outline" disabled={page <= 1}>
              <Link
                aria-disabled={page <= 1}
                href={reviewPath({
                  batch: params.batch,
                  page: Math.max(1, page - 1),
                  search: params.search,
                })}
              >
                Previous
              </Link>
            </Button>
            <span>
              Page {Math.min(page, totalPages)} of {totalPages}
            </span>
            <Button
              asChild
              size="sm"
              variant="outline"
              disabled={page >= totalPages}
            >
              <Link
                aria-disabled={page >= totalPages}
                href={reviewPath({
                  batch: params.batch,
                  page: Math.min(totalPages, page + 1),
                  search: params.search,
                })}
              >
                Next
              </Link>
            </Button>
          </div>
        </div>
      ) : null}
      <form
        id="admin-review-bulk-form"
        action={bulkUpdateQuestions}
        className="rounded-md border bg-card p-3 text-sm"
      >
        <input type="hidden" name="return_to" value={currentPath} />
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <AdminStatusBadge status="pending_review">Review selected drafts</AdminStatusBadge>
          <span className="text-xs text-muted-foreground">
            Select draft cards below before applying a bulk action.
          </span>
        </div>
        <AdminActionGroup
          secondary={
            <>
              <AdminReviewBulkSelection formId="admin-review-bulk-form" />
              <select
                name="status"
                className="h-9 rounded-md border bg-background px-2 text-sm"
                defaultValue="published"
              >
                <option value="draft">Draft</option>
                <option value="published">Published</option>
                <option value="archived">Archived</option>
              </select>
            </>
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
            <AdminDangerZone compact title="Delete selected drafts">
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
      <div className="grid gap-4">
        {draftQuestions.map((question) => {
          const tagNames = tagsByQuestionId.get(question.id) ?? [];
          const draftTagCount = draftTagCountByQuestionId.get(question.id) ?? 0;
          const publishedTagCount =
            publishedTagCountByQuestionId.get(question.id) ?? 0;
          const assets = assetsByQuestionId.get(question.id) ?? [];
          const questionSourceFiles =
            sourceFilesByQuestionId.get(question.id) ?? [];
          const imageCount = assets.length;
          const sourceFileCount = questionSourceFiles.length;
          const aiMetadata = aiMetadataByQuestionId.get(question.id);
          const aiPageRefs = stringList(aiMetadata?.page_refs);
          const aiCreatedTags = stringList(
            aiMetadata?.tag_decisions?.tag_ids,
          );
          const aiWarnings = [
            ...stringList(aiMetadata?.warnings),
            ...(importWarningsByQuestionId.get(question.id) ?? []),
          ];
          const aiCropCount = aiMetadata?.asset_placeholders?.length ?? 0;
          const importRefs = importRefsByQuestionId.get(question.id) ?? null;
          const importedAt = importedAtByQuestionId.get(question.id);
          const readiness = getQuestionReadiness({
            contentHtml: question.content_html,
            difficultyRating: question.difficulty_rating,
            imageCount,
            importedAssetReferences: importRefs,
            solutionHtml: question.solution_html,
            sourceFileCount,
            tagCount: publishedTagCount,
          });

          const editableQuestion: EditableQuestion = {
            answer_spec: question.answer_spec,
            content_html: question.content_html ?? "",
            content_source: question.content_source,
            content_source_format:
              question.content_source_format as EditableQuestion["content_source_format"],
            difficulty_rating: question.difficulty_rating,
            id: question.id,
            options: question.options,
            question_code: question.question_code,
            question_type: question.question_type,
            solution_html: question.solution_html,
            solution_source: question.solution_source,
            solution_source_format:
              question.solution_source_format as EditableQuestion["solution_source_format"],
            status: question.status,
            title: question.title,
          };

          return (
            <DraftReviewCard
              key={question.id}
              questionId={question.id}
              selectionFormId="admin-review-bulk-form"
              questionCode={question.question_code}
              title={question.title}
              status={question.status}
              questionType={question.question_type}
              difficultyRating={question.difficulty_rating}
              formattedCreatedAt={formatDate(question.created_at)}
              formattedImportedAt={formatDate(importedAt)}
              tagNames={tagNames}
              draftTagCount={draftTagCount}
              publishedTagCount={publishedTagCount}
              imageCount={imageCount}
              sourceFileCount={sourceFileCount}
              importedAssetReferences={importRefs}
              readiness={readiness}
              isAiImport={Boolean(aiMetadata)}
              aiProviderName={aiMetadata?.provider?.name ?? null}
              aiProviderModel={aiMetadata?.provider?.model ?? null}
              aiPageRefs={aiPageRefs}
              aiCreatedTags={aiCreatedTags}
              aiWarnings={aiWarnings}
              aiCropCount={aiCropCount}
              editableQuestion={editableQuestion}
              assets={assets}
              returnTo={currentPath}
              selectedTaxonomyTagIds={
                selectedTaxonomyTagIdsByQuestionId.get(question.id) ?? {}
              }
              sourceFiles={questionSourceFiles}
              taxonomyCatalog={taxonomyCatalog}
              updateAction={updateQuestion}
            />
          );
        })}
        {!draftQuestions.length ? (
          <AdminEmptyState
            title={
              batchFilter
                ? "No drafts found for this batch yet."
                : "No draft questions match this review queue."
            }
            description={
              batchFilter ? (
                <p>
                  Extraction may still be running or no usable questions were
                  created.
                </p>
              ) : (
                <p>
                  Import, generate, or create drafts, then return here for
                  explicit teacher review before publishing.
                </p>
              )
            }
            actions={
              batchFilter ? (
                <Button asChild size="sm" variant="outline">
                  <Link href="/admin/review">Clear filter</Link>
                </Button>
              ) : null
            }
          />
        ) : null}
      </div>
    </div>
  );
}
