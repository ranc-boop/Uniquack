import Link from "next/link";

import { SupabaseConfigNotice } from "@/components/config-notice";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { QuestionsTable } from "@/components/questions-table";
import type { FiveFacetTagChipAssignment } from "@/components/tags/five-facet-tag-chips";
import { htmlToPlainTextExcerpt } from "@/lib/html/excerpt";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

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
  let questionsQuery = supabase
    .from("questions")
    .select("id, question_code, title, content_html, difficulty_rating, status", {
      count: "exact",
    })
    .eq("status", "published")
    .gte("difficulty_rating", minDifficulty)
    .lte("difficulty_rating", maxDifficulty)
    .order("created_at", { ascending: false });

  if (search) {
    const pattern = `%${search}%`;
    questionsQuery = questionsQuery.or(
      `question_code.ilike.${pattern},title.ilike.${pattern}`,
    );
  }

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const { data: questions, error, count } = await questionsQuery.range(from, to);
  const questionIds = (questions ?? []).map((question) => question.id);
  const { data: fiveFacetAssignments, error: fiveFacetAssignmentsError } = questionIds.length
    ? await supabase
        .from("five_facet_question_tag_assignments")
        .select("question_id, tag_id, category, review_status")
        .eq("review_status", "approved")
        .in("question_id", questionIds)
    : { data: [], error: null };
  const fiveFacetTagsByQuestionId = new Map<string, FiveFacetTagChipAssignment[]>();
  const publicFiveFacetAssignments =
    fiveFacetAssignmentsError &&
    /permission denied|relation .* does not exist|schema cache|five_facet_/i.test(
      fiveFacetAssignmentsError.message,
    )
      ? []
      : ((fiveFacetAssignments ?? []) as Array<
          FiveFacetTagChipAssignment & { question_id: string }
        >);

  for (const assignment of publicFiveFacetAssignments) {
    const current = fiveFacetTagsByQuestionId.get(assignment.question_id) ?? [];
    current.push({
      category: assignment.category,
      review_status: assignment.review_status,
      tag_id: assignment.tag_id,
    });
    fiveFacetTagsByQuestionId.set(assignment.question_id, current);
  }

  const fiveFacetTagsByQuestionIdObject = Object.fromEntries(
    fiveFacetTagsByQuestionId.entries(),
  );
  const questionRows = (questions ?? []).map((question) => ({
    id: question.id,
    question_code: question.question_code,
    title: question.title,
    content_excerpt: htmlToPlainTextExcerpt(question.content_html),
    difficulty_rating: question.difficulty_rating,
    status: question.status,
  }));
  const totalPages = Math.max(1, Math.ceil((count ?? 0) / pageSize));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Questions</h1>
        <p className="text-sm text-muted-foreground">
          Published AP questions with official five-facet tags and difficulty.
          Draft and archived records are excluded by query and RLS.
        </p>
      </div>
      <form className="grid gap-3 rounded-md border p-4 md:grid-cols-[1.5fr_1fr_1fr_auto]">
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
      {error ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error.message}
        </p>
      ) : null}
      {questionRows.length ? (
        <QuestionsTable
          fiveFacetTagsByQuestionId={fiveFacetTagsByQuestionIdObject}
          questions={questionRows}
        />
      ) : (
        <div className="rounded-md border">
          <div className="h-24 text-center text-sm text-muted-foreground">
            No published questions match these filters.
          </div>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
        <p>
          Showing {questionRows.length ? from + 1 : 0}-
          {from + questionRows.length} of {count ?? 0} published questions.
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
