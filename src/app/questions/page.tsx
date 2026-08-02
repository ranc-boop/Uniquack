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
  const from = (page - 1) * pageSize;
  const officialSearchArgs = {
    difficulty_max: maxDifficulty,
    difficulty_min: minDifficulty,
    page_limit: pageSize,
    page_offset: from,
    query_text: search || null,
  };
  const [taxonomyResult, officialSearchResult] = await Promise.all([
    loadTaxonomyCatalog(supabase),
    supabase.rpc("search_official_public_questions_v2", officialSearchArgs),
  ]);
  const { catalog: taxonomyCatalog } = taxonomyResult;
  const { data: officialSearchRows, error } = officialSearchResult;
  let fallbackTotalCount = 0;
  if (!error && page > 1 && !officialSearchRows?.length) {
    const { data: firstPageRows } = await supabase.rpc(
      "search_official_public_questions_v2",
      {
        ...officialSearchArgs,
        page_limit: 1,
        page_offset: 0,
      },
    );
    fallbackTotalCount = Number(firstPageRows?.[0]?.total_count ?? 0);
  }
  const orderedQuestionIds = (officialSearchRows ?? []).map(
    (row) => row.question_id,
  );
  const { data: taxonomyAssignments, error: taxonomyError } = orderedQuestionIds.length
    ? await supabase
        .from("question_taxonomy_assignments")
        .select("question_id, tag_id, review_status")
        .in("question_id", orderedQuestionIds)
        .eq("review_status", "approved")
    : { data: [], error: null };
  const totalCount = Number(officialSearchRows?.[0]?.total_count ?? fallbackTotalCount);
  const taxonomyTagsByQuestionId = new Map<string, TaxonomyTagChipAssignment[]>();

  for (const assignment of taxonomyAssignments ?? []) {
    const current = taxonomyTagsByQuestionId.get(assignment.question_id) ?? [];
    current.push({
      review_status: assignment.review_status,
      tag_id: assignment.tag_id,
    });
    taxonomyTagsByQuestionId.set(assignment.question_id, current);
  }
  const taxonomyTagsByQuestionIdObject = Object.fromEntries(
    taxonomyTagsByQuestionId.entries(),
  );
  const questionRows = (officialSearchRows ?? []).map((question) => ({
    id: question.question_id,
    question_code: question.question_code,
    title: question.title,
    content_excerpt: htmlToPlainTextExcerpt(question.content_html),
    difficulty_rating: question.difficulty_rating,
    status: "published" as const,
  }));
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  return (
    <div className="space-y-5">
      <div className="student-hero">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <h1 className="text-3xl font-bold tracking-tight text-slate-950">Public Library</h1>
          <Button asChild variant="outline">
            <Link href="/mistakes">Review mistakes</Link>
          </Button>
        </div>
      </div>
      <form className="student-panel space-y-4 p-4">
        <div className="grid gap-4 md:grid-cols-[minmax(0,1.5fr)_10rem_10rem_auto]">
        <div className="space-y-2">
          <Label className="font-bold text-slate-800" htmlFor="q">Search</Label>
          <Input
            className="h-11 border-slate-200 bg-white shadow-sm"
            id="q"
            name="q"
            defaultValue={search}
            placeholder="Title or code"
          />
        </div>
        <div className="space-y-2">
          <Label className="font-bold text-slate-800" htmlFor="min">Min difficulty</Label>
          <Input
            className="h-11 border-slate-200 bg-white shadow-sm"
            id="min"
            name="min"
            type="number"
            min="0"
            max="1000"
            defaultValue={minDifficulty}
          />
        </div>
        <div className="space-y-2">
          <Label className="font-bold text-slate-800" htmlFor="max">Max difficulty</Label>
          <Input
            className="h-11 border-slate-200 bg-white shadow-sm"
            id="max"
            name="max"
            type="number"
            min="0"
            max="1000"
            defaultValue={maxDifficulty}
          />
        </div>
        <div className="flex items-end gap-2">
          <Button className="h-11" type="submit">Filter</Button>
          <Button asChild type="button" variant="outline">
            <Link href="/questions">Reset</Link>
          </Button>
        </div>
        </div>
      </form>
      {error || taxonomyError ? (
        <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error?.message ?? taxonomyError?.message}
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
        <div className="student-panel border-dashed">
          <div className="flex min-h-40 items-center justify-center p-6 text-center">
            <div className="max-w-md space-y-2">
              <h2 className="text-base font-bold text-slate-950">
                No questions found
              </h2>
            </div>
          </div>
        </div>
      )}
      <div className="student-panel flex flex-wrap items-center justify-between gap-3 p-3 text-sm text-slate-600">
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
