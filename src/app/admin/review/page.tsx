import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireAdmin } from "@/lib/auth/guards";
import {
  countImportAssetReferences,
  extractImportAssetReferences,
  type ImportAssetReferences,
} from "@/lib/batch-import/asset-references";
import { getQuestionReadiness } from "@/lib/questions/readiness";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type ReviewPageProps = {
  searchParams: Promise<{
    batch?: string;
    search?: string;
  }>;
};

type ReviewQuestion = {
  content_html: string | null;
  created_at: string;
  difficulty_rating: number;
  id: string;
  question_code: string;
  question_type: string;
  solution_html: string | null;
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
    new_tag_names?: unknown[];
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

function ImportedAssetReferenceBadges({
  refs,
}: {
  refs: ImportAssetReferences | null;
}) {
  if (!refs) {
    return <Badge variant="outline">No imported asset refs</Badge>;
  }

  const counts = countImportAssetReferences(refs);

  if (!counts.total) {
    return <Badge variant="outline">No imported asset refs</Badge>;
  }

  return (
    <>
      <Badge variant="secondary">Has imported asset refs</Badge>
      <Badge variant="outline">Needs media review</Badge>
      <Badge variant="outline">Image URLs: {counts.imageUrls}</Badge>
      <Badge variant="outline">PDF refs: {counts.sourceFileIds}</Badge>
      <Badge variant="outline">Asset refs: {counts.questionAssetIds}</Badge>
    </>
  );
}

export default async function AdminReviewPage({
  searchParams,
}: ReviewPageProps) {
  const params = await searchParams;
  const profile = await requireAdmin();
  const search = (params.search ?? "").trim().toLowerCase();
  const batchId = (params.batch ?? "").trim();
  const supabase = await createClient();
  let batchFilter:
    | {
        createdAt: string | null;
        id: string;
        sourceType: string | null;
      }
    | null = null;
  let batchQuestionIds: string[] | null = null;
  let batchFilterMissing = false;

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

      const { data: batchItems } = await supabase
        .from("import_batch_items")
        .select("created_question_id")
        .eq("batch_id", batch.id)
        .eq("status", "imported")
        .not("created_question_id", "is", null)
        .limit(1000);

      batchQuestionIds = Array.from(
        new Set(
          (batchItems ?? [])
            .map((item) => item.created_question_id)
            .filter((id): id is string => Boolean(id)),
        ),
      );
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
        "id, question_code, title, question_type, difficulty_rating, status, content_html, solution_html, created_at",
      )
      .eq("status", "draft")
      .order("created_at", { ascending: false })
      .limit(100);

    if (batchQuestionIds) {
      questionsQuery = questionsQuery.in("id", batchQuestionIds);
    }

    const result = await questionsQuery;
    questions = (result.data ?? []) as ReviewQuestion[];
    error = result.error;
  }

  const draftQuestions = ((questions ?? []) as ReviewQuestion[]).filter(
    (question) =>
      !search ||
      question.question_code.toLowerCase().includes(search) ||
      question.title.toLowerCase().includes(search),
  );
  const questionIds = draftQuestions.map((question) => question.id);
  let importItemsQuery = supabase
    .from("import_batch_items")
    .select(
      "created_question_id, normalized_question_json, validation_errors, created_at",
    )
    .eq("status", "imported")
    .in("created_question_id", questionIds)
    .limit(1000);

  if (batchFilter) {
    importItemsQuery = importItemsQuery.eq("batch_id", batchFilter.id);
  }

  const [
    { data: questionTags },
    { data: tags },
    { data: questionAssets },
    { data: sourceFiles },
    { data: importItems },
  ] = questionIds.length
    ? await Promise.all([
        supabase
          .from("question_taxonomy_assignments")
          .select("question_id, tag_id, review_status")
          .in("question_id", questionIds)
          .limit(1000),
        supabase
          .from("taxonomy_nodes")
          .select("tag_id, label, status")
          .eq("status", "active")
          .limit(1000),
        supabase
          .from("question_assets")
          .select("question_id, id")
          .in("question_id", questionIds)
          .eq("status", "ready")
          .limit(1000),
        supabase
          .from("question_source_files")
          .select("question_id, id")
          .in("question_id", questionIds)
          .neq("status", "deleted")
          .limit(1000),
        importItemsQuery,
      ])
    : [
        { data: [] },
        { data: [] },
        { data: [] },
        { data: [] },
        { data: [] },
      ];

  const tagNameById = new Map((tags ?? []).map((tag) => [tag.tag_id, tag.label]));
  const tagStatusById = new Map(
    (questionTags ?? []).map((tag) => [
      `${tag.question_id}:${tag.tag_id}`,
      tag.review_status,
    ]),
  );
  const tagsByQuestionId = new Map<string, string[]>();
  const pendingTagCountByQuestionId = new Map<string, number>();
  const approvedTagCountByQuestionId = new Map<string, number>();
  const imageCountByQuestionId = new Map<string, number>();
  const sourceFileCountByQuestionId = new Map<string, number>();
  const aiMetadataByQuestionId = new Map<string, AIReviewMetadata>();
  const importWarningsByQuestionId = new Map<string, string[]>();
  const importRefsByQuestionId = new Map<string, ImportAssetReferences>();
  const importedAtByQuestionId = new Map<string, string>();

  for (const binding of questionTags ?? []) {
    const tagName = tagNameById.get(binding.tag_id);
    const tagStatus = tagStatusById.get(`${binding.question_id}:${binding.tag_id}`);

    if (!tagName) {
      continue;
    }

    if (tagStatus === "pending_review" || tagStatus === "needs_review") {
      pendingTagCountByQuestionId.set(
        binding.question_id,
        (pendingTagCountByQuestionId.get(binding.question_id) ?? 0) + 1,
      );
    } else if (tagStatus === "approved") {
      approvedTagCountByQuestionId.set(
        binding.question_id,
        (approvedTagCountByQuestionId.get(binding.question_id) ?? 0) + 1,
      );
    }

    tagsByQuestionId.set(binding.question_id, [
      ...(tagsByQuestionId.get(binding.question_id) ?? []),
      tagName,
    ]);
  }

  for (const asset of questionAssets ?? []) {
    if (!asset.question_id) {
      continue;
    }

    imageCountByQuestionId.set(
      asset.question_id,
      (imageCountByQuestionId.get(asset.question_id) ?? 0) + 1,
    );
  }

  for (const sourceFile of sourceFiles ?? []) {
    if (!sourceFile.question_id) {
      continue;
    }

    sourceFileCountByQuestionId.set(
      sourceFile.question_id,
      (sourceFileCountByQuestionId.get(sourceFile.question_id) ?? 0) + 1,
    );
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
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Review Drafts</h1>
        <p className="text-sm text-muted-foreground">
          Lightweight queue for tutor/admin review before publishing. AI and
          reviewer roles are intentionally out of scope for this phase.
        </p>
      </div>
      <form className="flex flex-wrap items-end gap-2 rounded-md border p-3">
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
      <div className="grid gap-4">
        {draftQuestions.map((question) => {
          const tagNames = tagsByQuestionId.get(question.id) ?? [];
          const pendingTagCount = pendingTagCountByQuestionId.get(question.id) ?? 0;
          const approvedTagCount =
            approvedTagCountByQuestionId.get(question.id) ?? 0;
          const imageCount = imageCountByQuestionId.get(question.id) ?? 0;
          const sourceFileCount = sourceFileCountByQuestionId.get(question.id) ?? 0;
          const aiMetadata = aiMetadataByQuestionId.get(question.id);
          const aiPageRefs = stringList(aiMetadata?.page_refs);
          const aiCreatedTags = stringList(
            aiMetadata?.tag_decisions?.new_tag_names,
          );
          const aiWarnings = [
            ...stringList(aiMetadata?.warnings),
            ...(importWarningsByQuestionId.get(question.id) ?? []),
          ];
          const aiCropCount = aiMetadata?.asset_placeholders?.length ?? 0;
          const importRefs = importRefsByQuestionId.get(question.id) ?? null;
          const importedAt = importedAtByQuestionId.get(question.id);
          const hasImportedRefs =
            importRefs && countImportAssetReferences(importRefs).total > 0;
          const readiness = getQuestionReadiness({
            contentHtml: question.content_html,
            difficultyRating: question.difficulty_rating,
            imageCount,
            importedAssetReferences: importRefs,
            solutionHtml: question.solution_html,
            sourceFileCount,
            tagCount: approvedTagCount,
          });

          return (
            <Card key={question.id}>
              <CardHeader>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-base">
                      {question.question_code}
                    </CardTitle>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {question.title}
                    </p>
                  </div>
                  <Badge variant="secondary">{question.status}</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-2 text-sm md:grid-cols-4">
                  <div>
                    <p className="text-xs text-muted-foreground">Type</p>
                    <p>{question.question_type}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Difficulty</p>
                    <p>{question.difficulty_rating}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Created</p>
                    <p>{formatDate(question.created_at)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Imported</p>
                    <p>{formatDate(importedAt)}</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1">
                  {pendingTagCount ? (
                    <Badge variant="outline">
                      Needs taxonomy review: {pendingTagCount}
                    </Badge>
                  ) : null}
                  {tagNames.length ? (
                    tagNames.map((tagName) => (
                      <Badge key={tagName} variant="outline">
                        {tagName}
                      </Badge>
                    ))
                  ) : (
                    <Badge variant="outline">No taxonomy tags</Badge>
                  )}
                  {approvedTagCount ? (
                    <Badge variant="secondary">
                      Approved taxonomy tags: {approvedTagCount}
                    </Badge>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant={readiness.isReady ? "secondary" : "outline"}>
                    {readiness.summaryLabel}
                  </Badge>
                  <Badge variant={readiness.hasContent ? "secondary" : "outline"}>
                    {readiness.hasContent ? "Has content" : "Needs content"}
                  </Badge>
                  <Badge variant={readiness.hasSolution ? "secondary" : "outline"}>
                    {readiness.hasSolution ? "Has solution" : "Needs solution"}
                  </Badge>
                  <Badge variant={readiness.hasTags ? "secondary" : "outline"}>
                    {readiness.hasTags ? "Has tags" : "Needs tags"}
                  </Badge>
                  <Badge
                    variant={readiness.hasDifficulty ? "secondary" : "outline"}
                  >
                    {readiness.hasDifficulty
                      ? "Has difficulty"
                      : "Needs difficulty"}
                  </Badge>
                  <Badge variant="outline">Images: {imageCount}</Badge>
                  <Badge variant="outline">PDF source files: {sourceFileCount}</Badge>
                  <ImportedAssetReferenceBadges refs={importRefs} />
                </div>
                {hasImportedRefs ? (
                  <p className="text-xs text-muted-foreground">
                    Imported asset refs need manual media review before publish.
                  </p>
                ) : null}
                {aiMetadata ? (
                  <div className="space-y-2 rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="secondary">AI PDF import</Badge>
                      <Badge variant="outline">
                        {aiMetadata.provider?.name ?? "Unknown provider"}
                      </Badge>
                      <Badge variant="outline">
                        {aiMetadata.provider?.model ?? "Unknown model"}
                      </Badge>
                    </div>
                    <p>
                      Pages: {aiPageRefs.length ? aiPageRefs.join(", ") : "Unknown"}
                      {" | "}
                      Image crop refs: {aiCropCount}
                    </p>
                    {aiCreatedTags.length ? (
                      <p>Created draft tags: {aiCreatedTags.join(", ")}</p>
                    ) : null}
                    {aiWarnings.length ? (
                      <div className="rounded-md border border-amber-300 bg-amber-50 p-2 text-amber-900">
                        <p className="font-medium">AI/import warnings</p>
                        <ul className="mt-1 list-disc space-y-1 pl-4">
                          {aiWarnings.map((warning) => (
                            <li key={warning}>{warning}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </div>
                ) : null}
                <Button asChild size="sm">
                  <Link
                    href={`/admin/questions?status=draft&q=${encodeURIComponent(
                      question.question_code,
                    )}`}
                  >
                    Edit question
                  </Link>
                </Button>
              </CardContent>
            </Card>
          );
        })}
        {!draftQuestions.length ? (
          <div className="space-y-3 rounded-md border p-8 text-center text-sm text-muted-foreground">
            {batchFilter ? (
              <>
                <p className="font-medium text-foreground">
                  No drafts found for this batch yet.
                </p>
                <p>
                  Extraction may still be running or no usable questions were
                  created.
                </p>
                <Button asChild size="sm" variant="outline">
                  <Link href="/admin/review">Clear filter</Link>
                </Button>
              </>
            ) : (
              <p>No draft questions match this review queue.</p>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
