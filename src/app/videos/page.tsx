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

export const dynamic = "force-dynamic";

type VideosPageProps = {
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

export default async function VideosPage({ searchParams }: VideosPageProps) {
  const params = await searchParams;
  const search = (params.q ?? "").trim().toLowerCase();
  const selectedTagId = params.tag ?? "";
  const minDifficulty = parseDifficulty(params.min, 0);
  const maxDifficulty = parseDifficulty(params.max, 1000);

  if (!isSupabaseConfigured()) {
    return <SupabaseConfigNotice />;
  }

  const supabase = await createClient();
  const [{ data: videos, error }, { data: publicTags }] = await Promise.all([
    supabase
      .from("videos")
      .select("id, title, question_id, provider, embed_url, status")
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
  const videoIds = (videos ?? []).map((video) => video.id);
  const questionIds = (videos ?? []).map((video) => video.question_id);
  const { data: bindings } = videoIds.length
    ? await supabase
        .from("video_tags")
        .select("video_id, tag_id")
        .in("video_id", videoIds)
    : { data: [] };
  const { data: questions } = questionIds.length
    ? await supabase
        .from("questions")
        .select("id, question_code, title, difficulty_rating")
        .eq("status", "published")
        .in("id", questionIds)
    : { data: [] };
  const tagNameById = new Map(
    (publicTags ?? []).map((tag) => [tag.id, tag.name]),
  );
  const questionById = new Map(
    (questions ?? []).map((question) => [question.id, question]),
  );
  const tagsByVideoId = new Map<string, string[]>();
  const tagIdsByVideoId = new Map<string, Set<string>>();

  for (const binding of bindings ?? []) {
    const current = tagsByVideoId.get(binding.video_id) ?? [];
    const currentIds = tagIdsByVideoId.get(binding.video_id) ?? new Set();
    const tagName = tagNameById.get(binding.tag_id);

    if (tagName) {
      current.push(tagName);
      tagsByVideoId.set(binding.video_id, current);
      currentIds.add(binding.tag_id);
      tagIdsByVideoId.set(binding.video_id, currentIds);
    }
  }

  const filteredVideos = (videos ?? []).filter((video) => {
    const question = questionById.get(video.question_id);
    const difficulty = question?.difficulty_rating;
    const difficultyMatches =
      typeof difficulty === "number" &&
      difficulty >= minDifficulty &&
      difficulty <= maxDifficulty;
    const searchable = [
      video.title ?? "",
      video.provider ?? "",
      question?.question_code ?? "",
      question?.title ?? "",
    ]
      .join(" ")
      .toLowerCase();
    const searchMatches = !search || searchable.includes(search);
    const tagMatches =
      !selectedTagId || tagIdsByVideoId.get(video.id)?.has(selectedTagId);

    return difficultyMatches && searchMatches && tagMatches;
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Videos</h1>
        <p className="text-sm text-muted-foreground">
          Published video explanations with their linked question, inherited
          tags, and difficulty.
        </p>
      </div>
      <form className="grid gap-3 rounded-md border p-4 md:grid-cols-[1.5fr_1fr_1fr_1fr_auto]">
        <div className="space-y-2">
          <Label htmlFor="q">Search</Label>
          <Input
            id="q"
            name="q"
            defaultValue={params.q ?? ""}
            placeholder="Video, provider, or question"
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
            <Link href="/videos">Reset</Link>
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
              <TableHead>Title</TableHead>
              <TableHead>Question</TableHead>
              <TableHead>Tags</TableHead>
              <TableHead>Difficulty</TableHead>
              <TableHead>Provider</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredVideos.map((video) => (
              <TableRow key={video.id}>
                <TableCell>{video.title ?? "Untitled video"}</TableCell>
                <TableCell>
                  <div className="space-y-1">
                    <div className="font-mono text-xs">
                      {questionById.get(video.question_id)?.question_code ??
                        video.question_id}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {questionById.get(video.question_id)?.title}
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {(tagsByVideoId.get(video.id) ?? []).map((tagName) => (
                      <Badge key={tagName} variant="outline">
                        {tagName}
                      </Badge>
                    ))}
                  </div>
                </TableCell>
                <TableCell>
                  {questionById.get(video.question_id)?.difficulty_rating ?? "-"}
                </TableCell>
                <TableCell>{video.provider ?? "External"}</TableCell>
                <TableCell>
                  <Badge variant="secondary">{video.status}</Badge>
                </TableCell>
              </TableRow>
            ))}
            {!filteredVideos.length ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center">
                  No published videos match these filters.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
