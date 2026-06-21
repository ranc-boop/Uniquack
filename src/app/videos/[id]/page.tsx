import Link from "next/link";
import { notFound } from "next/navigation";

import { SupabaseConfigNotice } from "@/components/config-notice";
import { RichHtml } from "@/components/rich-html";
import {
  FiveFacetTagChips,
  type FiveFacetTagChipAssignment,
} from "@/components/tags/five-facet-tag-chips";
import { VideoPlayerFrame } from "@/components/video-player-frame";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import type { Question, Tag, Video } from "@/types/database";

export const dynamic = "force-dynamic";

type VideoDetailPageProps = {
  params: Promise<{
    id: string;
  }>;
};

type VideoDetailRow = Pick<
  Video,
  | "id"
  | "title"
  | "question_id"
  | "provider"
  | "video_url"
  | "embed_url"
  | "thumbnail_url"
  | "status"
  | "published_at"
  | "created_at"
  | "updated_at"
>;

type RelatedQuestionRow = Pick<
  Question,
  | "id"
  | "question_code"
  | "title"
  | "content_html"
  | "solution_html"
  | "difficulty_rating"
  | "question_type"
  | "status"
  | "source"
  | "published_at"
  | "created_at"
  | "updated_at"
>;

type TagRow = Pick<Tag, "id" | "name">;

function formatDate(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function ErrorCard({ message }: { message: string }) {
  return (
    <Card className="border-destructive/30">
      <CardContent className="p-6 text-sm text-destructive">{message}</CardContent>
    </Card>
  );
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

export default async function VideoDetailPage({ params }: VideoDetailPageProps) {
  const { id } = await params;

  if (!isSupabaseConfigured()) {
    return <SupabaseConfigNotice />;
  }

  const supabase = await createClient();
  const { data: video, error: videoError } = await supabase
    .from("videos")
    .select(
      "id, title, question_id, provider, video_url, embed_url, thumbnail_url, status, published_at, created_at, updated_at",
    )
    .eq("id", id)
    .eq("status", "published")
    .maybeSingle();

  if (videoError) {
    return <ErrorCard message={videoError.message} />;
  }

  if (!video) {
    notFound();
  }

  const { data: question, error: questionError } = await supabase
    .from("questions")
    .select(
      "id, question_code, title, content_html, solution_html, difficulty_rating, question_type, status, source, published_at, created_at, updated_at",
    )
    .eq("id", video.question_id)
    .eq("status", "published")
    .maybeSingle();

  if (questionError) {
    return <ErrorCard message={questionError.message} />;
  }

  if (!question) {
    notFound();
  }

  const { data: videoTagBindings, error: videoTagError } = await supabase
    .from("video_tags")
    .select("tag_id")
    .eq("video_id", video.id);

  if (videoTagError) {
    return <ErrorCard message={videoTagError.message} />;
  }

  const videoTagIds = Array.from(
    new Set((videoTagBindings ?? []).map((binding) => binding.tag_id)),
  );

  const { data: videoTags, error: loadedVideoTagsError } = videoTagIds.length
    ? await supabase
        .from("tags")
        .select("id, name")
        .eq("status", "published")
        .in("id", videoTagIds)
        .order("name", { ascending: true })
    : { data: [] as TagRow[], error: null };

  if (loadedVideoTagsError) {
    return <ErrorCard message={loadedVideoTagsError.message} />;
  }

  const { data: fiveFacetVideoAssignments, error: fiveFacetVideoAssignmentsError } =
    await supabase
      .from("five_facet_video_tag_assignments")
      .select("tag_id, category, review_status")
      .eq("video_id", video.id)
      .eq("review_status", "approved");

  const officialFiveFacetVideoAssignments =
    fiveFacetVideoAssignmentsError &&
    isMissingFiveFacetVideoTableError(fiveFacetVideoAssignmentsError)
      ? []
      : ((fiveFacetVideoAssignments ?? []) as FiveFacetTagChipAssignment[]);

  const { data: questionTagBindings, error: questionTagError } = await supabase
    .from("question_tags")
    .select("tag_id")
    .eq("question_id", question.id);

  if (questionTagError) {
    return <ErrorCard message={questionTagError.message} />;
  }

  const questionTagIds = Array.from(
    new Set((questionTagBindings ?? []).map((binding) => binding.tag_id)),
  );

  const { data: questionTags, error: loadedQuestionTagsError } =
    questionTagIds.length
      ? await supabase
          .from("tags")
          .select("id, name")
          .eq("status", "published")
          .in("id", questionTagIds)
          .order("name", { ascending: true })
      : { data: [] as TagRow[], error: null };

  if (loadedQuestionTagsError) {
    return <ErrorCard message={loadedQuestionTagsError.message} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-2">
          <Badge variant="secondary">Video detail</Badge>
          <h1 className="text-3xl font-semibold tracking-tight">
            {video.title ?? "Untitled video"}
          </h1>
          <p className="max-w-3xl text-sm text-muted-foreground">
            {question.question_code} · difficulty {question.difficulty_rating} ·{" "}
            {video.provider ?? "External"}
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/videos">Back to videos</Link>
        </Button>
      </div>

      <Card>
        <CardHeader className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">{video.status}</Badge>
            {video.provider ? <Badge variant="outline">{video.provider}</Badge> : null}
            <Badge variant="outline" className="font-mono">
              {question.question_code}
            </Badge>
          </div>
          <CardTitle className="text-xl">{video.title ?? "Untitled video"}</CardTitle>
          <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
            <span>Published: {formatDate(video.published_at) ?? "-"}</span>
            <span>Updated: {formatDate(video.updated_at) ?? "-"}</span>
          </div>
        </CardHeader>
        <CardContent className="space-y-8">
          <section className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">Player</h2>
              <span className="text-xs text-muted-foreground">
                Validated embed URL
              </span>
            </div>
            <VideoPlayerFrame embedUrl={video.embed_url} videoUrl={video.video_url} />
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline" size="sm">
                <a href={video.video_url} target="_blank" rel="noreferrer">
                  Open original video
                </a>
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link href={`/questions/${question.id}`}>Open question detail</Link>
              </Button>
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold">Official five-facet video tags</h2>
            <FiveFacetTagChips assignments={officialFiveFacetVideoAssignments} />
            <div className="space-y-2 rounded-md border p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Legacy / deprecated video tags
              </p>
              <p className="text-xs text-muted-foreground">
                Compatibility-only tags mirrored from the old tag system.
              </p>
              <div className="flex flex-wrap gap-2">
                {(videoTags ?? []).length ? (
                  (videoTags ?? []).map((tag) => (
                    <Badge key={tag.id} variant="outline">
                      {tag.name}
                    </Badge>
                  ))
                ) : (
                  <span className="text-sm text-muted-foreground">
                    No legacy video tags attached.
                  </span>
                )}
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">Linked question</h2>
              <span className="text-xs text-muted-foreground">
                Question detail and solution entry
              </span>
            </div>
            <Card>
              <CardHeader className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline" className="font-mono">
                    {question.question_code}
                  </Badge>
                  <Badge variant="secondary">{question.question_type}</Badge>
                  <Badge variant="secondary">{question.status}</Badge>
                  <Badge variant="outline">
                    Difficulty {question.difficulty_rating}
                  </Badge>
                </div>
                <CardTitle className="text-base">
                  <Link
                    href={`/questions/${question.id}`}
                    className="hover:underline underline-offset-4"
                  >
                    {question.title}
                  </Link>
                </CardTitle>
                <div className="text-sm text-muted-foreground">
                  {question.source ? <span>Source: {question.source}</span> : null}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <RichHtml html={question.content_html} className="rich-html--compact" />
                <div className="flex flex-wrap gap-2">
                  {(questionTags ?? []).length ? (
                    (questionTags ?? []).map((tag) => (
                      <Badge key={tag.id} variant="outline">
                        {tag.name}
                      </Badge>
                    ))
                  ) : (
                    <span className="text-sm text-muted-foreground">
                      No question tags.
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/questions/${question.id}`}>
                      Open question detail
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </section>
        </CardContent>
      </Card>
    </div>
  );
}
