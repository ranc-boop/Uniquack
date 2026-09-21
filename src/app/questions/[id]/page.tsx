import Link from "next/link";
import { notFound } from "next/navigation";

import { SupabaseConfigNotice } from "@/components/config-notice";
import {
  QuestionDetailImageGallery,
  type QuestionDetailImage,
} from "@/components/question-detail-image-gallery";
import { QuestionAnswerSummary } from "@/components/question-answer-summary";
import { QuestionPracticePanel } from "@/components/practice/question-practice-panel";
import {
  OptionText,
  QuestionText,
  SolutionText,
} from "@/components/math-content";
import {
  TaxonomyTagChips,
  type TaxonomyTagChipAssignment,
} from "@/components/tags/taxonomy-tag-chips";
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
import { htmlToPlainTextExcerpt } from "@/lib/html/excerpt";
import { normalizeQuestionOptions } from "@/lib/questions/answer-spec";
import { createClient } from "@/lib/supabase/server";
import { getQuestionAssetUrl } from "@/lib/storage/question-assets";
import { loadTaxonomyCatalog } from "@/lib/tags/taxonomy-db";
import { formatDateTime, formatNumber } from "@/lib/i18n/locale";
import { getRequestLocale } from "@/lib/i18n/server";
import { translate } from "@/lib/i18n/messages";
import type { Video } from "@/types/database";

export const dynamic = "force-dynamic";

type QuestionDetailPageProps = {
  params: Promise<{
    id: string;
  }>;
  searchParams?: Promise<{
    mode?: string;
  }>;
};

function DifficultyBadge({ rating, label }: { rating: number; label: string }) {
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
      {label} {rating}
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
  searchParams,
}: QuestionDetailPageProps) {
  const { id } = await params;
  const pageMode = (await searchParams)?.mode === "practice" ? "practice" : "browse";
  const locale = await getRequestLocale();
  const t = (key: Parameters<typeof translate>[1], values?: Parameters<typeof translate>[2]) =>
    translate(locale, key, values);

  if (!isSupabaseConfigured()) {
    return <SupabaseConfigNotice />;
  }

  const supabase = await createClient();
  const taxonomyCatalogPromise = loadTaxonomyCatalog(supabase);
  const { data: question, error: questionError } = await supabase
    .from("questions")
    .select(
      "id, question_code, title, content_html, solution_html, options, answer_spec, difficulty_rating, question_type, status, source, published_at, created_at, updated_at",
    )
    .eq("id", id)
    .eq("status", "published")
    .maybeSingle();

  if (questionError) {
    return (
      <Card className="border-destructive/30">
        <CardContent className="p-6 text-sm text-destructive">
          {t("common.requestFailed")}
        </CardContent>
      </Card>
    );
  }

  if (!question) {
    notFound();
  }

  const [
    { catalog: taxonomyCatalog },
    { data: video, error: videoError },
    { data: displayedAssets, error: displayedAssetsError },
    { data: taxonomyAssignments, error: taxonomyAssignmentsError },
  ] = await Promise.all([
    taxonomyCatalogPromise,
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
      .select("id, storage_path, label, alt_text")
      .eq("question_id", question.id)
      .eq("display_on_detail", true)
      .order("created_at", { ascending: true }),
    supabase
      .from("question_taxonomy_assignments")
      .select("tag_id, review_status")
      .eq("question_id", question.id)
      .eq("review_status", "approved"),
  ]);

  if (videoError) {
    return (
      <Card className="border-destructive/30">
        <CardContent className="p-6 text-sm text-destructive">
          {t("common.requestFailed")}
        </CardContent>
      </Card>
    );
  }

  if (displayedAssetsError) {
    return (
      <Card className="border-destructive/30">
        <CardContent className="p-6 text-sm text-destructive">
          {t("common.requestFailed")}
        </CardContent>
      </Card>
    );
  }

  const publicTaxonomyAssignments =
    taxonomyAssignmentsError &&
    /permission denied|relation .* does not exist|schema cache|taxonomy_/i.test(
      taxonomyAssignmentsError.message,
    )
      ? []
      : ((taxonomyAssignments ?? []) as TaxonomyTagChipAssignment[]);

  const questionImages: QuestionDetailImage[] = (displayedAssets ?? []).map((asset) => {
    return {
      id: asset.id,
      originalFilename:
        asset.label?.trim() ||
        asset.alt_text?.trim() ||
        asset.storage_path?.split("/").pop() ||
        "Question image",
      publicUrl: getQuestionAssetUrl(asset.id),
    };
  });
  const questionOptions = normalizeQuestionOptions(question.options);
  const practiceSolution = question.solution_html;
  const practiceQuestion = {
    contentExcerpt: htmlToPlainTextExcerpt(question.content_html),
    contentHtml: question.content_html,
    difficulty: question.difficulty_rating,
        expectedSkill: t("questionDetail.singleQuestionPractice"),
    id: question.id,
    options: questionOptions,
    questionCode: question.question_code,
    questionType: question.question_type,
    reason: t("questionDetail.openedDirectly"),
    source: question.source,
    tagIds: publicTaxonomyAssignments.map((assignment) => assignment.tag_id),
    title: question.title,
  };

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
              <DifficultyBadge rating={question.difficulty_rating} label={t("questionDetail.difficulty")} />
            </div>
            <h1 className="text-3xl font-bold tracking-tight">
              {question.title}
            </h1>
            <p className="text-sm text-muted-foreground">
              {question.question_code} | {question.question_type} | {t("questionDetail.difficulty")} {formatNumber(locale, question.difficulty_rating)}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild size="sm" variant={pageMode === "browse" ? "default" : "outline"}>
              <Link href={`/questions/${question.id}`}>{t("questionDetail.browseMode")}</Link>
            </Button>
            <Button asChild size="sm" variant={pageMode === "practice" ? "default" : "outline"}>
              <Link href={`/questions/${question.id}?mode=practice`}>{t("questionDetail.practiceMode")}</Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/questions">{t("questionDetail.backToQuestions")}</Link>
            </Button>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          {pageMode === "practice" ? (
            <QuestionPracticePanel
              answerSpec={question.answer_spec}
              question={practiceQuestion}
              solutionContent={practiceSolution}
            />
          ) : null}

          <Card>
            <CardContent className="space-y-8 p-6">
              <QuestionSection title={t("questionDetail.description")}>
                <QuestionText value={question.content_html} />
              </QuestionSection>

              {question.question_type === "mcq" && questionOptions.length ? (
                <QuestionSection title={t("questionDetail.options")}>
                  <div className="space-y-2">
                    {questionOptions.map((option) => (
                      <div
                        className="grid gap-3 rounded-md border bg-muted/20 p-3 sm:grid-cols-[2rem_1fr]"
                        key={option.id}
                      >
                        <span className="flex size-8 items-center justify-center rounded-md border bg-background font-mono text-sm font-semibold">
                          {option.label || option.id}
                        </span>
                        <OptionText
                          className="border-none bg-transparent p-0"
                          value={option.content_html}
                        />
                      </div>
                    ))}
                  </div>
                </QuestionSection>
              ) : null}

              {questionImages.length ? (
                <QuestionSection title={t("questionDetail.images")}>
                  <QuestionDetailImageGallery images={questionImages} />
                </QuestionSection>
              ) : null}

              {pageMode === "browse" ? (
                <QuestionSection title={t("questionDetail.solution")}>
                  {question.solution_html ? (
                    <Accordion type="single" collapsible>
                      <AccordionItem value="solution">
                        <AccordionTrigger>
                          <span className="text-base font-semibold">
                            {t("questionDetail.viewSolution")}
                          </span>
                        </AccordionTrigger>
                        <AccordionContent>
                          <div className="pt-2">
                            <SolutionText value={question.solution_html} />
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    </Accordion>
                  ) : (
                    <div className="rounded-md border border-dashed bg-muted/20 p-4 text-sm text-muted-foreground">
                      {t("questionDetail.noSolution")}
                    </div>
                  )}
                </QuestionSection>
              ) : (
                <QuestionSection title={t("questionDetail.solution")}>
                  <div className="rounded-md border border-dashed bg-muted/20 p-4 text-sm text-muted-foreground">
                    {t("questionDetail.hiddenDuringPractice")}
                  </div>
                </QuestionSection>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <SidebarCard>
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
              <span className="text-muted-foreground">{t("questionDetail.problemId")}</span>
              <span className="font-mono font-medium">
                {question.question_code}
              </span>
              </div>
              <div className="flex items-center justify-between">
              <span className="text-muted-foreground">{t("questionDetail.type")}</span>
              <span className="font-medium">{question.question_type}</span>
              </div>
              <div className="flex items-center justify-between">
              <span className="text-muted-foreground">{t("questionDetail.difficulty")}</span>
              <span className="font-medium">
                {question.difficulty_rating}
              </span>
              </div>
              <div className="flex items-center justify-between">
              <span className="text-muted-foreground">{t("questionDetail.status")}</span>
              <span className="font-medium">{question.status}</span>
              </div>
              {question.source ? (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">{t("questionDetail.source")}</span>
                  <span className="font-medium">{question.source}</span>
                </div>
              ) : null}
              {question.published_at ? (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">{t("questionDetail.published")}</span>
                  <span className="font-medium">
                    {question.published_at ? formatDateTime(locale, question.published_at) : null}
                  </span>
                </div>
              ) : null}
            </div>
          </SidebarCard>

          <SidebarCard title={t("questionDetail.officialTaxonomyTags")}>
            <TaxonomyTagChips
              assignments={publicTaxonomyAssignments}
              emptyLabel={t("questionDetail.noTaxonomyTags")}
              taxonomyCatalog={taxonomyCatalog}
            />
          </SidebarCard>

          {pageMode === "browse" ? (
            <SidebarCard title={t("questionDetail.answerData")}>
              <QuestionAnswerSummary
                answerSpec={question.answer_spec}
                options={question.options}
                questionType={question.question_type}
              />
            </SidebarCard>
          ) : null}

          {video ? (
            <SidebarCard title={t("questionDetail.videoExplanation")}>
              <div className="space-y-3">
                <div className="text-sm font-medium">
                  <Link
                    href={`/videos/${video.id}`}
                    className="hover:underline underline-offset-4"
                  >
                    {video.title ?? t("videos.untitled")}
                  </Link>
                </div>
                <div className="aspect-video overflow-hidden rounded-md border bg-black">
                  <VideoPlayerFrame
                    embedUrl={video.embed_url}
                    videoUrl={video.video_url}
                  />
                </div>
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/videos/${video.id}`}>{t("questionDetail.openVideo")}</Link>
                  </Button>
                  <Button asChild variant="outline" size="sm">
                    <a
                      href={video.video_url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {t("questionDetail.originalVideo")}
                    </a>
                  </Button>
                </div>
              </div>
            </SidebarCard>
          ) : (
            <SidebarCard title={t("questionDetail.videoExplanation")}>
              <div className="rounded-md border border-dashed bg-muted/20 p-4 text-sm text-muted-foreground">
                {t("questionDetail.noVideoExplanation")}
              </div>
            </SidebarCard>
          )}

        </div>
      </div>
    </div>
  );
}
