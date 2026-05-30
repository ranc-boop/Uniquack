import Link from "next/link";

import { SupabaseConfigNotice } from "@/components/config-notice";
import { Badge } from "@/components/ui/badge";
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
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { toDangerousHtml } from "@/lib/sanitize/html";

export const dynamic = "force-dynamic";

type QuestionsPageProps = {
  searchParams: Promise<{
    q?: string;
    tag?: string;
    min?: string;
    max?: string;
  }>;
};

function parseDifficulty(value: string | undefined, fallback: number) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(1000, Math.max(0, Math.trunc(parsed)));
}

export default async function QuestionsPage({ searchParams }: QuestionsPageProps) {
  const params = await searchParams;
  const search = (params.q ?? "").trim().toLowerCase();
  const selectedTagId = params.tag ?? "";
  const minDifficulty = parseDifficulty(params.min, 0);
  const maxDifficulty = parseDifficulty(params.max, 1000);

  if (!isSupabaseConfigured()) {
    return <SupabaseConfigNotice />;
  }

  const supabase = await createClient();
  const [{ data: questions, error }, { data: publicTags }] = await Promise.all([
    supabase
      .from("questions")
      .select("id, question_code, title, content_html, difficulty_rating, status")
      .eq("status", "published")
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("tags")
      .select("id, name")
      .eq("status", "published")
      .order("name", { ascending: true })
      .limit(100),
  ]);
  const questionIds = (questions ?? []).map((question) => question.id);
  const { data: bindings } = questionIds.length
    ? await supabase
        .from("question_tags")
        .select("question_id, tag_id")
        .in("question_id", questionIds)
    : { data: [] };
  const tagNameById = new Map(
    (publicTags ?? []).map((tag) => [tag.id, tag.name]),
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

  const filteredQuestions = (questions ?? []).filter((question) => {
    const difficultyMatches =
      question.difficulty_rating >= minDifficulty &&
      question.difficulty_rating <= maxDifficulty;
    const searchMatches =
      !search ||
      question.title.toLowerCase().includes(search) ||
      question.question_code.toLowerCase().includes(search);
    const tagMatches =
      !selectedTagId ||
      tagIdsByQuestionId.get(question.id)?.has(selectedTagId);

    return difficultyMatches && searchMatches && tagMatches;
  });

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
            defaultValue={params.q ?? ""}
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
      {error ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error.message}
        </p>
      ) : null}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Title</TableHead>
              <TableHead>Content</TableHead>
              <TableHead>Tags</TableHead>
              <TableHead>Difficulty</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredQuestions.map((question) => (
              <TableRow key={question.id}>
                <TableCell className="font-mono text-xs">
                  {question.question_code}
                </TableCell>
                <TableCell>{question.title}</TableCell>
                <TableCell className="max-w-md">
                  <div
                    className="line-clamp-3 text-sm text-muted-foreground"
                    dangerouslySetInnerHTML={toDangerousHtml(
                      question.content_html,
                    )}
                  />
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {(tagsByQuestionId.get(question.id) ?? []).map((tagName) => (
                      <Badge key={tagName} variant="outline">
                        {tagName}
                      </Badge>
                    ))}
                  </div>
                </TableCell>
                <TableCell>{question.difficulty_rating}</TableCell>
                <TableCell>
                  <Badge variant="secondary">{question.status}</Badge>
                </TableCell>
              </TableRow>
            ))}
            {!filteredQuestions.length ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center">
                  No published questions match these filters.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
