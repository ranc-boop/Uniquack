import Link from "next/link";

import { SupabaseConfigNotice } from "@/components/config-notice";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { QuestionsTable } from "@/components/questions-table";
import { htmlToPlainTextExcerpt } from "@/lib/html/excerpt";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const pageSize = 25;

type QuestionsPageProps = {
  searchParams: Promise<{
    q?: string;
    tag?: string;
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
  selectedTagId,
}: {
  maxDifficulty: number;
  minDifficulty: number;
  page: number;
  search: string;
  selectedTagId: string;
}) {
  const params = new URLSearchParams();

  if (search) {
    params.set("q", search);
  }

  if (selectedTagId) {
    params.set("tag", selectedTagId);
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
  const selectedTagId = params.tag ?? "";
  const minDifficulty = parseDifficulty(params.min, 0);
  const maxDifficulty = parseDifficulty(params.max, 1000);
  const page = parsePage(params.page);

  if (!isSupabaseConfigured()) {
    return <SupabaseConfigNotice />;
  }

  const supabase = await createClient();
  const { data: publicTags, error: tagsError } = await supabase
    .from("tags")
    .select("id, name")
    .eq("status", "published")
    .order("name", { ascending: true })
    .limit(500);
  const matchingQuestionIds =
    selectedTagId && !tagsError
      ? await supabase
          .from("question_tags")
          .select("question_id")
          .eq("tag_id", selectedTagId)
          .limit(5000)
      : { data: null, error: null };
  const selectedTagQuestionIds = (matchingQuestionIds.data ?? []).map(
    (binding) => binding.question_id,
  );
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

  if (selectedTagId) {
    if (!selectedTagQuestionIds.length) {
      questionsQuery = questionsQuery.in("id", ["00000000-0000-0000-0000-000000000000"]);
    } else {
      questionsQuery = questionsQuery.in("id", selectedTagQuestionIds);
    }
  }

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const { data: questions, error, count } = await questionsQuery.range(from, to);
  const questionIds = (questions ?? []).map((question) => question.id);
  const { data: bindings, error: bindingsError } = questionIds.length
    ? await supabase
        .from("question_tags")
        .select("question_id, tag_id")
        .in("question_id", questionIds)
    : { data: [], error: null };
  const publicTagIds = Array.from(
    new Set((bindings ?? []).map((binding) => binding.tag_id)),
  );
  const { data: visibleQuestionTags, error: visibleTagsError } = publicTagIds.length
    ? await supabase
        .from("tags")
        .select("id, name")
        .eq("status", "published")
        .in("id", publicTagIds)
        .order("name", { ascending: true })
    : { data: [], error: null };
  const tagNameById = new Map(
    (visibleQuestionTags ?? []).map((tag) => [tag.id, tag.name]),
  );
  const tagsByQuestionId = new Map<string, string[]>();
  const tagIdsByQuestionId = new Map<string, Set<string>>();

  for (const binding of bindings ?? []) {
    const current = tagsByQuestionId.get(binding.question_id) ?? [];
    const currentIds = tagIdsByQuestionId.get(binding.question_id) ?? new Set();
    const tagName = tagNameById.get(binding.tag_id);

    if (tagName) {
      current.push(tagName);
      tagsByQuestionId.set(binding.question_id, current);
      currentIds.add(binding.tag_id);
      tagIdsByQuestionId.set(binding.question_id, currentIds);
    }
  }

  const tagsByQuestionIdObject = Object.fromEntries(tagsByQuestionId.entries());
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
          Published AP questions with tags and difficulty. Draft and archived
          records are excluded by query and RLS.
        </p>
      </div>
      <form className="grid gap-3 rounded-md border p-4 md:grid-cols-[1.5fr_1fr_1fr_1fr_auto]">
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
          <Label htmlFor="tag">Tag</Label>
          <select
            id="tag"
            name="tag"
            defaultValue={selectedTagId}
            className="h-10 w-full rounded-md border bg-background px-3 text-sm"
          >
            <option value="">All tags</option>
            {(publicTags ?? []).map((tag) => (
              <option key={tag.id} value={tag.id}>
                {tag.name}
              </option>
            ))}
          </select>
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
      {error || bindingsError || tagsError || visibleTagsError || matchingQuestionIds.error ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error?.message ??
            bindingsError?.message ??
            tagsError?.message ??
            visibleTagsError?.message ??
            matchingQuestionIds.error?.message}
        </p>
      ) : null}
      {questionRows.length ? (
        <QuestionsTable
          questions={questionRows}
          tagsByQuestionId={tagsByQuestionIdObject}
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
                selectedTagId,
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
                selectedTagId,
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
