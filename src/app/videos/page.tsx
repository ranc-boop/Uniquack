import Link from "next/link";

import { SupabaseConfigNotice } from "@/components/config-notice";
import {
  TaxonomyTagChips,
  type TaxonomyTagChipAssignment,
} from "@/components/tags/taxonomy-tag-chips";
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
import { formatNumber } from "@/lib/i18n/locale";
import { translate } from "@/lib/i18n/messages";
import { getRequestLocale } from "@/lib/i18n/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { loadTaxonomyCatalog } from "@/lib/tags/taxonomy-db";

export const dynamic = "force-dynamic";

type VideosPageProps = {
  searchParams: Promise<{
    q?: string;
    min?: string;
    max?: string;
    page?: string;
  }>;
};

const VIDEOS_PAGE_SIZE = 25;
const VIDEO_QUESTION_PREFILTER_LIMIT = 500;
const VIDEO_SEARCH_QUESTION_LIMIT = 100;

function parseDifficulty(value: string | undefined, fallback: number) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(1000, Math.max(0, Math.trunc(parsed)));
}

function parsePage(value: string | undefined) {
  const parsed = Number(value);

  return Number.isFinite(parsed) && parsed >= 1 ? Math.trunc(parsed) : 1;
}

function postgrestLikePattern(value: string) {
  return value.replace(/[,%_]/g, " ").trim();
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

  if (search) params.set("q", search);
  if (minDifficulty !== 0) params.set("min", String(minDifficulty));
  if (maxDifficulty !== 1000) params.set("max", String(maxDifficulty));
  if (page > 1) params.set("page", String(page));

  const query = params.toString();
  return query ? `/videos?${query}` : "/videos";
}

function isMissingTaxonomyTableError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const record = error as { code?: unknown; message?: unknown };
  const message = typeof record.message === "string" ? record.message : "";

  return (
    record.code === "42P01" ||
    /question_taxonomy_assignments|permission denied|relation .* does not exist|schema cache/i.test(
      message,
    )
  );
}

export default async function VideosPage({ searchParams }: VideosPageProps) {
  const [params, locale] = await Promise.all([searchParams, getRequestLocale()]);
  const search = (params.q ?? "").trim().toLowerCase();
  const minDifficulty = parseDifficulty(params.min, 0);
  const maxDifficulty = parseDifficulty(params.max, 1000);
  const page = parsePage(params.page);
  const from = (page - 1) * VIDEOS_PAGE_SIZE;
  const to = from + VIDEOS_PAGE_SIZE - 1;

  if (!isSupabaseConfigured()) {
    return <SupabaseConfigNotice />;
  }

  const supabase = await createClient();
  const searchPattern = postgrestLikePattern(search);
  const difficultyFiltered = minDifficulty !== 0 || maxDifficulty !== 1000;
  const difficultyQuestionsPromise = difficultyFiltered
    ? supabase
        .from("questions")
        .select("id")
        .eq("status", "published")
        .gte("difficulty_rating", minDifficulty)
        .lte("difficulty_rating", maxDifficulty)
        .limit(VIDEO_QUESTION_PREFILTER_LIMIT)
    : Promise.resolve({ data: null });
  const searchQuestionsPromise = searchPattern
    ? supabase
        .from("questions")
        .select("id")
        .eq("status", "published")
        .or(
          `question_code.ilike.%${searchPattern}%,title.ilike.%${searchPattern}%`,
        )
        .limit(VIDEO_SEARCH_QUESTION_LIMIT)
    : Promise.resolve({ data: null });
  const [taxonomyResult, difficultyResult, searchResult] = await Promise.all([
    loadTaxonomyCatalog(supabase),
    difficultyQuestionsPromise,
    searchQuestionsPromise,
  ]);
  const { catalog: taxonomyCatalog } = taxonomyResult;
  const difficultyQuestionIds = (difficultyResult.data ?? []).map(
    (question) => question.id,
  );
  const searchQuestions = searchResult.data;
  const searchQuestionIds = (searchQuestions ?? []).map(
    (question) => question.id,
  );
  let videosQuery = supabase
    .from("videos")
    .select("id, title, question_id, provider, embed_url, status", {
      count: "exact",
    })
    .eq("status", "published")
    .order("created_at", { ascending: false });

  if (difficultyFiltered) {
    videosQuery = difficultyQuestionIds.length
      ? videosQuery.in("question_id", difficultyQuestionIds)
      : videosQuery.eq("question_id", "00000000-0000-0000-0000-000000000000");
  }

  if (searchPattern) {
    const orParts = [
      `title.ilike.%${searchPattern}%`,
      `provider.ilike.%${searchPattern}%`,
      ...(
        searchQuestionIds.length
          ? [`question_id.in.(${searchQuestionIds.join(",")})`]
          : []
      ),
    ];
    videosQuery = videosQuery.or(orParts.join(","));
  }

  const { count: totalVideos, data: videos, error } = await videosQuery.range(
    from,
    to,
  );
  const questionIds = Array.from(
    new Set((videos ?? []).map((video) => video.question_id)),
  );
  const questionsPromise = questionIds.length
    ? supabase
        .from("questions")
        .select("id, question_code, title, difficulty_rating")
        .eq("status", "published")
        .in("id", questionIds)
    : Promise.resolve({ data: [], error: null });
  const taxonomyAssignmentsPromise = questionIds.length
    ? supabase
        .from("question_taxonomy_assignments")
        .select("question_id, tag_id, review_status")
        .eq("review_status", "approved")
        .in("question_id", questionIds)
    : Promise.resolve({ data: [], error: null });
  const [questionsResult, taxonomyAssignmentsResult] = await Promise.all([
    questionsPromise,
    taxonomyAssignmentsPromise,
  ]);
  const { data: questions, error: questionsError } = questionsResult;
  const {
    data: taxonomyAssignments,
    error: taxonomyAssignmentsError,
  } = taxonomyAssignmentsResult;
  const questionById = new Map(
    (questions ?? []).map((question) => [question.id, question]),
  );
  const taxonomyAssignmentsByQuestionId = new Map<
    string,
    TaxonomyTagChipAssignment[]
  >();

  const publicTaxonomyAssignments =
    taxonomyAssignmentsError &&
    isMissingTaxonomyTableError(taxonomyAssignmentsError)
      ? []
      : ((taxonomyAssignments ?? []) as Array<
          TaxonomyTagChipAssignment & { question_id: string }
        >);

  for (const assignment of publicTaxonomyAssignments) {
    const current =
      taxonomyAssignmentsByQuestionId.get(assignment.question_id) ?? [];
    current.push(assignment);
    taxonomyAssignmentsByQuestionId.set(assignment.question_id, current);
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
  const totalPages = Math.max(
    1,
    Math.ceil((totalVideos ?? filteredVideos.length) / VIDEOS_PAGE_SIZE),
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{translate(locale, "videos.title")}</h1>
        <p className="text-sm text-muted-foreground">
          {translate(locale, "videos.description")}
        </p>
      </div>
      <form className="grid gap-3 rounded-md border p-4 md:grid-cols-[1.5fr_1fr_1fr_auto]">
        <div className="space-y-2">
          <Label htmlFor="q">{translate(locale, "common.search")}</Label>
          <Input
            id="q"
            name="q"
            defaultValue={params.q ?? ""}
            placeholder={translate(locale, "videos.searchPlaceholder")}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="min">{translate(locale, "library.minDifficulty")}</Label>
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
          <Label htmlFor="max">{translate(locale, "library.maxDifficulty")}</Label>
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
          <Button type="submit">{translate(locale, "library.filter")}</Button>
          <Button asChild type="button" variant="outline">
            <Link href="/videos">{translate(locale, "library.reset")}</Link>
          </Button>
        </div>
      </form>
      {error || questionsError ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {translate(locale, "common.requestFailed")}
        </p>
      ) : null}
      {difficultyFiltered &&
      difficultyQuestionIds.length === VIDEO_QUESTION_PREFILTER_LIMIT ? (
        <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {translate(locale, "videos.difficultyLimitWarning", { count: formatNumber(locale, VIDEO_QUESTION_PREFILTER_LIMIT) })}
        </p>
      ) : null}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{translate(locale, "videos.columnTitle")}</TableHead>
              <TableHead>{translate(locale, "videos.columnQuestion")}</TableHead>
              <TableHead>{translate(locale, "videos.columnTags")}</TableHead>
              <TableHead>{translate(locale, "videos.columnDifficulty")}</TableHead>
              <TableHead>{translate(locale, "videos.columnProvider")}</TableHead>
              <TableHead>{translate(locale, "videos.columnStatus")}</TableHead>
              <TableHead>{translate(locale, "common.open")}</TableHead>
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
                    {video.title ?? translate(locale, "videos.untitled")}
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
                        {translate(locale, "videos.officialTags")}
                      </p>
                      <TaxonomyTagChips
                        assignments={taxonomyAssignmentsByQuestionId.get(
                          video.question_id,
                        )}
                        emptyLabel={translate(locale, "videos.noTags")}
                        showCategoryHeadings={false}
                        taxonomyCatalog={taxonomyCatalog}
                      />
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  {questionById.get(video.question_id)?.difficulty_rating === undefined ? "-" : formatNumber(locale, questionById.get(video.question_id)?.difficulty_rating ?? 0)}
                </TableCell>
                <TableCell>{video.provider ?? translate(locale, "videos.external")}</TableCell>
                <TableCell>
                  <Badge variant="secondary">{video.status}</Badge>
                </TableCell>
                <TableCell>
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/videos/${video.id}`}>{translate(locale, "common.open")}</Link>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {!filteredVideos.length ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center">
                  {translate(locale, "videos.empty")}
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
        <p>
          {translate(locale, "videos.resultsSummary", {
            from: formatNumber(locale, filteredVideos.length ? from + 1 : 0),
            to: formatNumber(locale, from + filteredVideos.length),
            total: formatNumber(locale, totalVideos ?? filteredVideos.length),
          })}
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
              {translate(locale, "library.previous")}
            </Link>
          </Button>
          <span>
            {translate(locale, "library.pageOf", {
              page: formatNumber(locale, Math.min(page, totalPages)),
              total: formatNumber(locale, totalPages),
            })}
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
              {translate(locale, "library.next")}
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
