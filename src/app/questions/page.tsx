import Link from "next/link";

import { SupabaseConfigNotice } from "@/components/config-notice";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { QuestionBankClient } from "@/components/question-bank-client";
import type { TaxonomyTagChipAssignment } from "@/components/tags/taxonomy-tag-chips";
import { htmlToPlainTextExcerpt } from "@/lib/html/excerpt";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { loadTaxonomyCatalog } from "@/lib/tags/taxonomy-db";

export const dynamic = "force-dynamic";

const pageSize = 25;

type QuestionsPageProps = {
  searchParams: Promise<{
    q?: string;
    min?: string;
    max?: string;
    page?: string;
  }>;
};

function parseDifficulty(value: string | undefined, fallback: number) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(1000, Math.max(0, Math.trunc(parsed)));
}

function parsePage(value: string | undefined) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed < 1) {
    return 1;
  }

  return Math.trunc(parsed);
}

function normalizeSearch(value: string | undefined) {
  return (value ?? "").trim().replaceAll(",", " ").slice(0, 80);
}

function pageHref({
  maxDifficulty,
  minDifficulty,
  page,
  search,
}: {
  maxDifficulty: number;
  minDifficulty: number;
  page: number;
  search: string;
}) {
  const params = new URLSearchParams();

  if (search) {
    params.set("q", search);
  }

  if (minDifficulty !== 0) {
    params.set("min", String(minDifficulty));
  }

  if (maxDifficulty !== 1000) {
    params.set("max", String(maxDifficulty));
  }

  if (page > 1) {
    params.set("page", String(page));
  }

  const query = params.toString();
  return query ? `/questions?${query}` : "/questions";
}

export default async function QuestionsPage({ searchParams }: QuestionsPageProps) {
  const params = await searchParams;
  const search = normalizeSearch(params.q);
  const minDifficulty = parseDifficulty(params.min, 0);
  const maxDifficulty = parseDifficulty(params.max, 1000);
  const page = parsePage(params.page);

  if (!isSupabaseConfigured()) {
    return <SupabaseConfigNotice />;
  }

  const supabase = await createClient();
  const { catalog: taxonomyCatalog } = await loadTaxonomyCatalog(supabase);
  const from = (page - 1) * pageSize;
  const taxonomySearchArgs = {
    assignment_review_status: "approved",
    difficulty_max: maxDifficulty,
    difficulty_min: minDifficulty,
    exclude_tag_ids: [],
    include_tag_ids: [],
    page_limit: pageSize,
    page_offset: from,
    query_text: search || null,
    question_status: "published",
  };
  const { data: taxonomySearchRows, error } = await supabase.rpc(
    "search_questions_by_taxonomy",
    taxonomySearchArgs,
  );
  let fallbackTotalCount = 0;
  if (!error && page > 1 && !taxonomySearchRows?.length) {
    const { data: firstPageRows } = await supabase.rpc(
      "search_questions_by_taxonomy",
      {
        ...taxonomySearchArgs,
        page_limit: 1,
        page_offset: 0,
      },
    );
    fallbackTotalCount = Number(firstPageRows?.[0]?.total_count ?? 0);
  }
  const orderedQuestionIds = (taxonomySearchRows ?? []).map(
    (row) => row.question_id,
  );
  const questionOrder = new Map(
    orderedQuestionIds.map((questionId, index) => [questionId, index]),
  );
  const { data: questions, error: questionsError } = orderedQuestionIds.length
    ? await supabase
        .from("questions")
        .select("id, question_code, title, content_html, difficulty_rating, status")
        .in("id", orderedQuestionIds)
    : { data: [], error: null };
  const sortedQuestions = [...(questions ?? [])].sort(
    (left, right) =>
      (questionOrder.get(left.id) ?? Number.MAX_SAFE_INTEGER) -
      (questionOrder.get(right.id) ?? Number.MAX_SAFE_INTEGER),
  );
  const totalCount = Number(taxonomySearchRows?.[0]?.total_count ?? fallbackTotalCount);
  const taxonomyTagsByQuestionId = new Map<string, TaxonomyTagChipAssignment[]>();

  for (const row of taxonomySearchRows ?? []) {
    taxonomyTagsByQuestionId.set(
      row.question_id,
      (row.matched_tag_ids ?? []).map((tagId) => ({
        review_status: "approved",
        tag_id: tagId,
      })),
    );
  }
  const taxonomyTagsByQuestionIdObject = Object.fromEntries(
    taxonomyTagsByQuestionId.entries(),
  );
  const questionRows = sortedQuestions.map((question) => ({
    id: question.id,
    question_code: question.question_code,
    title: question.title,
    content_excerpt: htmlToPlainTextExcerpt(question.content_html),
    difficulty_rating: question.difficulty_rating,
    status: question.status,
  }));
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  return (
    <div className="space-y-5">
      <div className="rounded-md border bg-muted/20 p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Question Bank
            </p>
            <h1 className="text-2xl font-semibold tracking-tight">Build your next practice round</h1>
            <p className="max-w-2xl text-sm text-muted-foreground">
              Search published questions, add a focused basket, or open one question for detail-first practice.
            </p>
          </div>
          <Button asChild variant="outline">
            <Link href="/mistakes">Review mistakes</Link>
          </Button>
        </div>
      </div>
      <form className="grid gap-3 rounded-md border bg-background p-4 md:grid-cols-[minmax(0,1.5fr)_10rem_10rem_auto]">
        <div className="space-y-2">
          <Label htmlFor="q">Search</Label>
          <Input
            id="q"
            name="q"
            defaultValue={search}
            placeholder="Title or code"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="min">Min difficulty</Label>
          <Input
            id="min"
            name="min"
            type="number"
            min="0"
            max="1000"
            defaultValue={minDifficulty}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="max">Max difficulty</Label>
          <Input
            id="max"
            name="max"
            type="number"
            min="0"
            max="1000"
            defaultValue={maxDifficulty}
          />
        </div>
        <div className="flex items-end gap-2">
          <Button type="submit">Filter</Button>
          <Button asChild type="button" variant="outline">
            <Link href="/questions">Reset</Link>
          </Button>
        </div>
      </form>
      {error || questionsError ? (
        <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error?.message ?? questionsError?.message}
        </p>
      ) : null}
      {questionRows.length ? (
        <QuestionBankClient
          taxonomyTagsByQuestionId={taxonomyTagsByQuestionIdObject}
          taxonomyCatalog={taxonomyCatalog}
          questions={questionRows}
          totalCount={totalCount}
        />
      ) : (
        <div className="rounded-md border">
          <div className="flex h-24 items-center justify-center text-center text-sm text-muted-foreground">
            No published questions match these filters.
          </div>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
        <p>
          Showing {questionRows.length ? from + 1 : 0}-
          {from + questionRows.length} of {totalCount} published questions.
        </p>
        <div className="flex items-center gap-2">
          <Button asChild size="sm" variant="outline" disabled={page <= 1}>
            <Link
              aria-disabled={page <= 1}
              href={pageHref({
                maxDifficulty,
                minDifficulty,
                page: Math.max(1, page - 1),
                search,
              })}
            >
              Previous
            </Link>
          </Button>
          <span>
            Page {Math.min(page, totalPages)} of {totalPages}
          </span>
          <Button asChild size="sm" variant="outline" disabled={page >= totalPages}>
            <Link
              aria-disabled={page >= totalPages}
              href={pageHref({
                maxDifficulty,
                minDifficulty,
                page: Math.min(totalPages, page + 1),
                search,
              })}
            >
              Next
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
