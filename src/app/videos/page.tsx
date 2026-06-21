import Link from "next/link";

import { SupabaseConfigNotice } from "@/components/config-notice";
import {
  FiveFacetTagChips,
  type FiveFacetTagChipAssignment,
} from "@/components/tags/five-facet-tag-chips";
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

function isMissingFiveFacetVideoTableError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const record = error as { code?: unknown; message?: unknown };
  const message = typeof record.message === "string" ? record.message : "";

  return (
    record.code === "42P01" ||
    /five_facet_video_tag_assignments|permission denied|relation .* does not exist|schema cache/i.test(
      message,
    )
  );
}

export default async function VideosPage({ searchParams }: VideosPageProps) {
  const params = await searchParams;
  const search = (params.q ?? "").trim().toLowerCase();
  const minDifficulty = parseDifficulty(params.min, 0);
  const maxDifficulty = parseDifficulty(params.max, 1000);

  if (!isSupabaseConfigured()) {
    return <SupabaseConfigNotice />;
  }

  const supabase = await createClient();
  const { data: videos, error } = await supabase
    .from("videos")
    .select("id, title, question_id, provider, embed_url, status")
    .eq("status", "published")
    .order("created_at", { ascending: false })
    .limit(100);
  const videoIds = (videos ?? []).map((video) => video.id);
  const questionIds = (videos ?? []).map((video) => video.question_id);
  const { data: questions, error: questionsError } = questionIds.length
    ? await supabase
        .from("questions")
        .select("id, question_code, title, difficulty_rating")
        .eq("status", "published")
        .in("id", Array.from(new Set(questionIds)))
    : { data: [], error: null };
  const { data: fiveFacetVideoAssignments, error: fiveFacetVideoAssignmentsError } =
    videoIds.length
      ? await supabase
          .from("five_facet_video_tag_assignments")
          .select("video_id, tag_id, category, review_status")
          .eq("review_status", "approved")
          .in("video_id", videoIds)
      : { data: [], error: null };
  const questionById = new Map(
    (questions ?? []).map((question) => [question.id, question]),
  );
  const fiveFacetAssignmentsByVideoId = new Map<
    string,
    FiveFacetTagChipAssignment[]
  >();

  const publicFiveFacetVideoAssignments =
    fiveFacetVideoAssignmentsError &&
    isMissingFiveFacetVideoTableError(fiveFacetVideoAssignmentsError)
      ? []
      : ((fiveFacetVideoAssignments ?? []) as Array<
          FiveFacetTagChipAssignment & { video_id: string }
        >);

  for (const assignment of publicFiveFacetVideoAssignments) {
    const current = fiveFacetAssignmentsByVideoId.get(assignment.video_id) ?? [];
    current.push(assignment);
    fiveFacetAssignmentsByVideoId.set(assignment.video_id, current);
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

    return difficultyMatches && searchMatches;
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Videos</h1>
        <p className="text-sm text-muted-foreground">
          Published video explanations with their linked question, official
          five-facet tags, and difficulty.
        </p>
      </div>
      <form className="grid gap-3 rounded-md border p-4 md:grid-cols-[1.5fr_1fr_1fr_auto]">
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
      {error || questionsError ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error?.message ??
            questionsError?.message}
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
              <TableHead>Open</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredVideos.map((video) => (
              <TableRow key={video.id}>
                <TableCell>
                  <Link
                    href={`/videos/${video.id}`}
                    className="font-medium hover:underline underline-offset-4"
                  >
                    {video.title ?? "Untitled video"}
                  </Link>
                </TableCell>
                <TableCell>
                  <div className="space-y-1">
                    <div className="font-mono text-xs">
                      <Link
                        href={`/questions/${video.question_id}`}
                        className="hover:underline underline-offset-4"
                      >
                        {questionById.get(video.question_id)?.question_code ??
                          video.question_id}
                      </Link>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      <Link
                        href={`/questions/${video.question_id}`}
                        className="hover:underline underline-offset-4"
                      >
                        {questionById.get(video.question_id)?.title}
                      </Link>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="space-y-2">
                    <div className="space-y-1">
                      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                        Official five-facet tags
                      </p>
                      <FiveFacetTagChips
                        assignments={fiveFacetAssignmentsByVideoId.get(video.id)}
                        emptyLabel="No five-facet tags assigned yet."
                        showCategoryHeadings={false}
                      />
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  {questionById.get(video.question_id)?.difficulty_rating ?? "-"}
                </TableCell>
                <TableCell>{video.provider ?? "External"}</TableCell>
                <TableCell>
                  <Badge variant="secondary">{video.status}</Badge>
                </TableCell>
                <TableCell>
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/videos/${video.id}`}>Open</Link>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {!filteredVideos.length ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center">
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
