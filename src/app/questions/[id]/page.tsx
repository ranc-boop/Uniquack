import Link from "next/link";
import { notFound } from "next/navigation";

import { SupabaseConfigNotice } from "@/components/config-notice";
import {
  QuestionDetailImageGallery,
  type QuestionDetailImage,
} from "@/components/question-detail-image-gallery";
import { RichHtml } from "@/components/rich-html";
import {
  FiveFacetTagChips,
  type FiveFacetTagChipAssignment,
} from "@/components/tags/five-facet-tag-chips";
import { VideoPlayerFrame } from "@/components/video-player-frame";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { QUESTION_ASSETS_BUCKET } from "@/lib/question-assets";
import { createClient } from "@/lib/supabase/server";
import type { Tag, Video } from "@/types/database";

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

function DifficultyBadge({ rating }: { rating: number }) {
  let color = "bg-green-100 text-green-800 hover:bg-green-100";

  if (rating >= 400) {
    color = "bg-red-100 text-red-800 hover:bg-red-100";
  } else if (rating >= 250) {
    color = "bg-orange-100 text-orange-800 hover:bg-orange-100";
  } else if (rating >= 100) {
    color = "bg-blue-100 text-blue-800 hover:bg-blue-100";
  }

  return (
    <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ${color}`}>
      Difficulty {rating}
    </span>
  );
}

function QuestionSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h2 className="border-b pb-2 text-lg font-semibold">{title}</h2>
      <div className="text-sm leading-relaxed">{children}</div>
    </section>
  );
}

function SidebarCard({
  title,
  children,
}: {
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      {title ? (
        <CardHeader className="border-b pb-3">
          <h3 className="text-sm font-semibold">{title}</h3>
        </CardHeader>
      ) : null}
      <CardContent className="space-y-3 p-4">{children}</CardContent>
    </Card>
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
    return (
      <Card className="border-destructive/30">
        <CardContent className="p-6 text-sm text-destructive">
          {questionError.message}
        </CardContent>
      </Card>
    );
  }

  if (!question) {
    notFound();
  }

  const [
    { data: questionTagBindings, error: questionTagError },
    { data: video, error: videoError },
    { data: displayedAssets, error: displayedAssetsError },
    { data: fiveFacetAssignments, error: fiveFacetAssignmentsError },
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
    supabase
      .from("five_facet_question_tag_assignments")
      .select("tag_id, category, review_status")
      .eq("question_id", question.id)
      .eq("review_status", "approved"),
  ]);

  if (questionTagError) {
    return (
      <Card className="border-destructive/30">
        <CardContent className="p-6 text-sm text-destructive">
          {questionTagError.message}
        </CardContent>
      </Card>
    );
  }

  const questionTagIds = Array.from(
    new Set((questionTagBindings ?? []).map((binding) => binding.tag_id)),
  );

  if (videoError) {
    return (
      <Card className="border-destructive/30">
        <CardContent className="p-6 text-sm text-destructive">
          {videoError.message}
        </CardContent>
      </Card>
    );
  }

  if (displayedAssetsError) {
    return (
      <Card className="border-destructive/30">
        <CardContent className="p-6 text-sm text-destructive">
          {displayedAssetsError.message}
        </CardContent>
      </Card>
    );
  }

  const publicFiveFacetAssignments =
    fiveFacetAssignmentsError &&
    /permission denied|relation .* does not exist|schema cache|five_facet_/i.test(
      fiveFacetAssignmentsError.message,
    )
      ? []
      : ((fiveFacetAssignments ?? []) as FiveFacetTagChipAssignment[]);

  const questionImages: QuestionDetailImage[] = (displayedAssets ?? []).map((asset) => {
    const { data } = supabase.storage
      .from(QUESTION_ASSETS_BUCKET)
      .getPublicUrl(asset.object_path);

    return {
      id: asset.id,
      originalFilename: asset.original_filename,
      publicUrl: data.publicUrl,
    };
  });

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
  const [{ data: questionTags, error: tagsError }, { data: videoTagBindings, error: videoTagError }] =
    await Promise.all([questionTagsRequest, videoTagBindingsRequest]);

  if (tagsError) {
    return (
      <Card className="border-destructive/30">
        <CardContent className="p-6 text-sm text-destructive">
          {tagsError.message}
        </CardContent>
      </Card>
    );
  }

  if (videoTagError) {
    return (
      <Card className="border-destructive/30">
        <CardContent className="p-6 text-sm text-destructive">
          {videoTagError.message}
        </CardContent>
      </Card>
    );
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
      return (
        <Card className="border-destructive/30">
          <CardContent className="p-6 text-sm text-destructive">
            {loadedVideoTagsError.message}
          </CardContent>
        </Card>
      );
    }

    videoTags = loadedVideoTags ?? [];
  }

  return (
    <div className="space-y-6">
      <div className="rounded-md border bg-gradient-to-r from-muted/40 to-background">
        <div className="flex flex-wrap items-end justify-between gap-4 p-6">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="font-mono">
                {question.question_code}
              </Badge>
              <Badge variant="secondary">{question.question_type}</Badge>
              <DifficultyBadge rating={question.difficulty_rating} />
            </div>
            <h1 className="text-3xl font-bold tracking-tight">
              {question.title}
            </h1>
            <p className="text-sm text-muted-foreground">
              {question.question_code} | {question.question_type} | difficulty{" "}
              {question.difficulty_rating}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild size="sm">
              <Link href="/questions">Back to questions</Link>
            </Button>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <Card>
            <CardContent className="space-y-8 p-6">
              <QuestionSection title="Description">
                <RichHtml html={question.content_html} />
              </QuestionSection>

              {questionImages.length ? (
                <QuestionSection title="Images">
                  <QuestionDetailImageGallery images={questionImages} />
                </QuestionSection>
              ) : null}

              <QuestionSection title="Solution">
                {question.solution_html ? (
                  <Accordion type="single" collapsible>
                    <AccordionItem value="solution">
                      <AccordionTrigger>
                        <span className="text-base font-semibold">
                          View solution
                        </span>
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="pt-2">
                          <RichHtml html={question.solution_html} />
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                ) : (
                  <div className="rounded-md border border-dashed bg-muted/20 p-4 text-sm text-muted-foreground">
                    No solution content available.
                  </div>
                )}
              </QuestionSection>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <SidebarCard>
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Problem ID</span>
              <span className="font-mono font-medium">
                {question.question_code}
              </span>
              </div>
              <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Type</span>
              <span className="font-medium">{question.question_type}</span>
              </div>
              <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Difficulty</span>
              <span className="font-medium">
                {question.difficulty_rating}
              </span>
              </div>
              <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Status</span>
              <span className="font-medium">{question.status}</span>
              </div>
              {question.source ? (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Source</span>
                  <span className="font-medium">{question.source}</span>
                </div>
              ) : null}
              {formatDate(question.published_at) ? (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Published</span>
                  <span className="font-medium">
                    {formatDate(question.published_at)}
                  </span>
                </div>
              ) : null}
            </div>
          </SidebarCard>

          <SidebarCard title="Tags">
            {(questionTags ?? []).length ? (
              <div className="flex flex-wrap gap-2">
                {(questionTags ?? []).map((tag) => (
                  <Badge key={tag.id} variant="outline">
                    {tag.name}
                  </Badge>
                ))}
              </div>
            ) : (
              <span className="text-sm text-muted-foreground">
                No tags
              </span>
            )}
          </SidebarCard>

          <SidebarCard title="Official five-facet tags">
            <FiveFacetTagChips assignments={publicFiveFacetAssignments} />
          </SidebarCard>

          {video ? (
            <SidebarCard title="Video explanation">
              <div className="space-y-3">
                <div className="text-sm font-medium">
                  <Link
                    href={`/videos/${video.id}`}
                    className="hover:underline underline-offset-4"
                  >
                    {video.title ?? "Untitled video"}
                  </Link>
                </div>
                <div className="aspect-video overflow-hidden rounded-md border bg-black">
                  <VideoPlayerFrame
                    embedUrl={video.embed_url}
                    videoUrl={video.video_url}
                  />
                </div>
                {videoTags.length ? (
                  <div className="flex flex-wrap gap-1">
                    {videoTags.map((tag) => (
                      <Badge key={tag.id} variant="secondary" className="text-xs">
                        {tag.name}
                      </Badge>
                    ))}
                  </div>
                ) : null}
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/videos/${video.id}`}>Open video</Link>
                  </Button>
                  <Button asChild variant="outline" size="sm">
                    <a
                      href={video.video_url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Original video
                    </a>
                  </Button>
                </div>
              </div>
            </SidebarCard>
          ) : (
            <SidebarCard title="Video explanation">
              <div className="rounded-md border border-dashed bg-muted/20 p-4 text-sm text-muted-foreground">
                No video explanation available.
              </div>
            </SidebarCard>
          )}

          <SidebarCard title="Recommended problems">
            <div className="rounded-md border border-dashed bg-muted/20 p-4 text-sm text-muted-foreground">
              Recommended problems coming soon.
            </div>
          </SidebarCard>
        </div>
      </div>
    </div>
  );
}
