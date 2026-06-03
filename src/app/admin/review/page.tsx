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
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type ReviewPageProps = {
  searchParams: Promise<{
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

function hasText(value: string | null | undefined) {
  return Boolean(value?.replace(/<[^>]*>/g, "").trim());
}

function formatDate(value: string | null | undefined) {
  if (!value) {
    return "Unknown";
  }

  return new Date(value).toLocaleString();
}

function ReadinessBadge({
  ok,
  okLabel,
  missingLabel,
}: {
  missingLabel: string;
  ok: boolean;
  okLabel: string;
}) {
  return (
    <Badge variant={ok ? "secondary" : "outline"}>
      {ok ? okLabel : missingLabel}
    </Badge>
  );
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
  await requireAdmin();
  const search = (params.search ?? "").trim().toLowerCase();
  const supabase = await createClient();
  const { data: questions, error } = await supabase
    .from("questions")
    .select(
      "id, question_code, title, question_type, difficulty_rating, status, content_html, solution_html, created_at",
    )
    .eq("status", "draft")
    .order("created_at", { ascending: false })
    .limit(100);
  const draftQuestions = ((questions ?? []) as ReviewQuestion[]).filter(
    (question) =>
      !search ||
      question.question_code.toLowerCase().includes(search) ||
      question.title.toLowerCase().includes(search),
  );
  const questionIds = draftQuestions.map((question) => question.id);
  const [
    { data: questionTags },
    { data: tags },
    { data: questionAssets },
    { data: sourceFiles },
    { data: importItems },
  ] = questionIds.length
    ? await Promise.all([
        supabase
          .from("question_tags")
          .select("question_id, tag_id")
          .in("question_id", questionIds)
          .limit(1000),
        supabase.from("tags").select("id, name").limit(1000),
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
        supabase
          .from("import_batch_items")
          .select("created_question_id, normalized_question_json, created_at")
          .eq("status", "imported")
          .in("created_question_id", questionIds)
          .limit(1000),
      ])
    : [
        { data: [] },
        { data: [] },
        { data: [] },
        { data: [] },
        { data: [] },
      ];

  const tagNameById = new Map((tags ?? []).map((tag) => [tag.id, tag.name]));
  const tagsByQuestionId = new Map<string, string[]>();
  const imageCountByQuestionId = new Map<string, number>();
  const sourceFileCountByQuestionId = new Map<string, number>();
  const importRefsByQuestionId = new Map<string, ImportAssetReferences>();
  const importedAtByQuestionId = new Map<string, string>();

  for (const binding of questionTags ?? []) {
    const tagName = tagNameById.get(binding.tag_id);

    if (!tagName) {
      continue;
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
      </form>
      {error ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error.message}
        </p>
      ) : null}
      <div className="grid gap-4">
        {draftQuestions.map((question) => {
          const tagNames = tagsByQuestionId.get(question.id) ?? [];
          const imageCount = imageCountByQuestionId.get(question.id) ?? 0;
          const sourceFileCount = sourceFileCountByQuestionId.get(question.id) ?? 0;
          const importRefs = importRefsByQuestionId.get(question.id) ?? null;
          const importedAt = importedAtByQuestionId.get(question.id);
          const hasImportedRefs =
            importRefs && countImportAssetReferences(importRefs).total > 0;

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
                  {tagNames.length ? (
                    tagNames.map((tagName) => (
                      <Badge key={tagName} variant="outline">
                        {tagName}
                      </Badge>
                    ))
                  ) : (
                    <Badge variant="outline">No tags</Badge>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <ReadinessBadge
                    ok={hasText(question.content_html)}
                    okLabel="Has content"
                    missingLabel="Needs content"
                  />
                  <ReadinessBadge
                    ok={hasText(question.solution_html)}
                    okLabel="Has solution"
                    missingLabel="Needs solution"
                  />
                  <ReadinessBadge
                    ok={tagNames.length > 0}
                    okLabel="Has tags"
                    missingLabel="Needs tags"
                  />
                  <ReadinessBadge
                    ok={question.difficulty_rating >= 0}
                    okLabel="Has difficulty"
                    missingLabel="Needs difficulty"
                  />
                  <Badge variant="outline">Images: {imageCount}</Badge>
                  <Badge variant="outline">PDF source files: {sourceFileCount}</Badge>
                  <ImportedAssetReferenceBadges refs={importRefs} />
                </div>
                {hasImportedRefs ? (
                  <p className="text-xs text-muted-foreground">
                    Imported asset refs need manual media review before publish.
                  </p>
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
          <div className="rounded-md border p-8 text-center text-sm text-muted-foreground">
            No draft questions match this review queue.
          </div>
        ) : null}
      </div>
    </div>
  );
}
