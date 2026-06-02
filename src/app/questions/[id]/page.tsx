import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { SupabaseConfigNotice } from "@/components/config-notice";
import {
  QuestionDetailImageGallery,
  type QuestionDetailImage,
} from "@/components/question-detail-image-gallery";
import { VideoPlayerFrame } from "@/components/video-player-frame";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { QUESTION_ASSETS_BUCKET } from "@/lib/question-assets";
import { createClient } from "@/lib/supabase/server";
import { toDangerousHtml } from "@/lib/sanitize/html";
import type { Question, Tag, Video } from "@/types/database";

export const dynamic = "force-dynamic";

type QuestionDetailPageProps = {
  params: Promise<{
    id: string;
  }>;
};

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

function CollapsibleSection({
  title,
  meta,
  children,
  defaultOpen = false,
}: {
  title: string;
  meta?: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details
      className="overflow-hidden rounded-md border bg-background"
      open={defaultOpen}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-lg font-semibold">
        <span className="flex items-center gap-2">
          <span>{title}</span>
          <span className="text-xs font-normal text-muted-foreground">
            {meta ?? "Click to expand"}
          </span>
        </span>
        <svg
          className="collapsible-chevron h-4 w-4 shrink-0 text-muted-foreground"
          viewBox="0 0 20 20"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M6 8l4 4 4-4"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </summary>
      <div className="border-t p-4">{children}</div>
    </details>
  );
}

export default async function QuestionDetailPage({
  params,
}: QuestionDetailPageProps) {
  const { id } = await params;

  if (!isSupabaseConfigured()) {
    return <SupabaseConfigNotice />;
  }

  const supabase = await createClient();
  const { data: question, error: questionError } = await supabase
    .from("questions")
    .select(
      "id, question_code, title, content_html, solution_html, difficulty_rating, question_type, status, source, published_at, created_at, updated_at",
    )
    .eq("id", id)
    .eq("status", "published")
    .maybeSingle();

  if (questionError) {
    return <ErrorCard message={questionError.message} />;
  }

  if (!question) {
    notFound();
  }

  const [
    { data: questionTagBindings, error: questionTagError },
    { data: video, error: videoError },
    { data: displayedAssets, error: displayedAssetsError },
  ] = await Promise.all([
    supabase
      .from("question_tags")
      .select("tag_id")
      .eq("question_id", question.id),
    supabase
      .from("videos")
      .select(
        "id, title, question_id, provider, video_url, embed_url, thumbnail_url, status, published_at, created_at, updated_at",
      )
      .eq("question_id", question.id)
      .eq("status", "published")
      .maybeSingle(),
    supabase
      .from("question_assets")
      .select("id, object_path, original_filename")
      .eq("question_id", question.id)
      .eq("status", "ready")
      .eq("display_on_detail", true)
      .order("created_at", { ascending: true }),
  ]);

  if (questionTagError) {
    return <ErrorCard message={questionTagError.message} />;
  }

  const questionTagIds = Array.from(
    new Set((questionTagBindings ?? []).map((binding) => binding.tag_id)),
  );

  if (videoError) {
    return <ErrorCard message={videoError.message} />;
  }

  if (displayedAssetsError) {
    return <ErrorCard message={displayedAssetsError.message} />;
  }

  const questionImages: QuestionDetailImage[] = (displayedAssets ?? []).map(
    (asset) => {
      const { data } = supabase.storage
        .from(QUESTION_ASSETS_BUCKET)
        .getPublicUrl(asset.object_path);

      return {
        id: asset.id,
        originalFilename: asset.original_filename,
        publicUrl: data.publicUrl,
      };
    },
  );

  const questionTagsRequest = questionTagIds.length
    ? supabase
        .from("tags")
        .select("id, name")
        .eq("status", "published")
        .in("id", questionTagIds)
        .order("name", { ascending: true })
    : Promise.resolve({ data: [] as TagRow[], error: null });
  const videoTagBindingsRequest = video
    ? supabase.from("video_tags").select("tag_id").eq("video_id", video.id)
    : Promise.resolve({ data: [], error: null });
  const [
    { data: questionTags, error: tagsError },
    { data: videoTagBindings, error: videoTagError },
  ] = await Promise.all([questionTagsRequest, videoTagBindingsRequest]);

  if (tagsError) {
    return <ErrorCard message={tagsError.message} />;
  }

  if (videoTagError) {
    return <ErrorCard message={videoTagError.message} />;
  }

  let videoTags: TagRow[] = [];

  if (video) {
    const videoTagIds = Array.from(
      new Set((videoTagBindings ?? []).map((binding) => binding.tag_id)),
    );

    const { data: loadedVideoTags, error: loadedVideoTagsError } =
      videoTagIds.length
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

    videoTags = loadedVideoTags ?? [];
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-2">
          <Badge variant="secondary">Question detail</Badge>
          <h1 className="text-3xl font-semibold tracking-tight">
            {question.title}
          </h1>
          <p className="max-w-3xl text-sm text-muted-foreground">
            {question.question_code} | difficulty {question.difficulty_rating} |{" "}
            {question.question_type}
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/questions">Back to questions</Link>
        </Button>
      </div>

      <Card>
        <CardHeader className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline" className="font-mono">
              {question.question_code}
            </Badge>
            <Badge variant="secondary">{question.question_type}</Badge>
            <Badge variant="secondary">{question.status}</Badge>
            <Badge variant="outline">Difficulty {question.difficulty_rating}</Badge>
          </div>
          <CardTitle className="text-xl">{question.title}</CardTitle>
          <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
            {question.source ? <span>Source: {question.source}</span> : null}
            {formatDate(question.published_at) ? (
              <span>Published: {formatDate(question.published_at)}</span>
            ) : null}
            <span>Updated: {formatDate(question.updated_at) ?? "-"}</span>
          </div>
        </CardHeader>

        <CardContent className="space-y-8">
          <section className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">Question</h2>
              <span className="text-xs text-muted-foreground">
                Sanitized HTML render
              </span>
            </div>
            <div className="rich-html rounded-md border bg-background p-4 text-sm">
              <div dangerouslySetInnerHTML={toDangerousHtml(question.content_html)} />
            </div>
            <QuestionDetailImageGallery images={questionImages} />
          </section>

          <section className="space-y-3">
            {question.solution_html ? (
              <CollapsibleSection title="Solution" meta="Default collapsed">
                <div className="rich-html rounded-md border bg-background p-4 text-sm">
                  <div
                    dangerouslySetInnerHTML={toDangerousHtml(question.solution_html)}
                  />
                </div>
              </CollapsibleSection>
            ) : (
              <div className="rounded-md border border-dashed bg-muted/20 p-4 text-sm text-muted-foreground">
                No solution has been published yet.
              </div>
            )}
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold">Tags</h2>
            <div className="flex flex-wrap gap-2">
              {(questionTags ?? []).length ? (
                (questionTags ?? []).map((tag) => (
                  <Badge key={tag.id} variant="outline">
                    {tag.name}
                  </Badge>
                ))
              ) : (
                <span className="text-sm text-muted-foreground">
                  No tags attached.
                </span>
              )}
            </div>
          </section>

          <section className="space-y-3">
            {video ? (
              <CollapsibleSection title="Attached video" meta="Default collapsed">
                <Card>
                  <CardHeader className="space-y-3">
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="secondary">{video.status}</Badge>
                      {video.provider ? (
                        <Badge variant="outline">{video.provider}</Badge>
                      ) : null}
                    </div>
                    <CardTitle className="text-base">
                      <Link
                        href={`/videos/${video.id}`}
                        className="hover:underline underline-offset-4"
                      >
                        {video.title ?? "Untitled video"}
                      </Link>
                    </CardTitle>
                    <div className="text-sm text-muted-foreground">
                      Published: {formatDate(video.published_at) ?? "-"}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <VideoPlayerFrame
                      embedUrl={video.embed_url}
                      videoUrl={video.video_url}
                    />
                    <div className="flex flex-wrap gap-1">
                      {videoTags.length ? (
                        videoTags.map((tag) => (
                          <Badge key={tag.id} variant="outline">
                            {tag.name}
                          </Badge>
                        ))
                      ) : (
                        <span className="text-sm text-muted-foreground">
                          No inherited tags.
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button asChild variant="outline" size="sm">
                        <Link href={`/videos/${video.id}`}>Open video detail</Link>
                      </Button>
                      <Button asChild variant="outline" size="sm">
                        <a href={video.video_url} target="_blank" rel="noreferrer">
                          Open original video
                        </a>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </CollapsibleSection>
            ) : (
              <div className="rounded-md border border-dashed bg-muted/20 p-4 text-sm text-muted-foreground">
                No attached video has been published yet.
              </div>
            )}
          </section>
        </CardContent>
      </Card>
    </div>
  );
}
