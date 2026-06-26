import {
  createVideo,
  deleteVideo,
  updateVideo,
} from "@/app/admin/videos/actions";
import { Fragment } from "react";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { DeleteSubmitButton } from "@/components/delete-submit-button";
import { FormSubmitButton } from "@/components/form-submit-button";
import { PageFeedback } from "@/components/page-feedback";
import {
  TaxonomyTagChips,
  type TaxonomyTagChipAssignment,
} from "@/components/tags/taxonomy-tag-chips";
import { TaxonomyTagTreePicker } from "@/components/tags/taxonomy-tag-tree-picker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { requireAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { loadTaxonomyCatalog } from "@/lib/tags/taxonomy-db";
import { isAllowedVideoEmbedUrl } from "@/lib/validations/video";

type AdminVideosPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined> & {
    error?: string;
    tax_exclude_search?: string | string[];
    tax_reviewed?: string | string[];
    tax_search?: string | string[];
    saved?: string;
  }>;
};

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function tagIdList(value: string | string[] | undefined) {
  return (Array.isArray(value) ? value : value ? [value] : [])
    .flatMap((entry) => entry.split(","))
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function selectedTagsForFacets({
  facets,
  params,
  prefix,
}: {
  facets: { facet_key: string }[];
  params: Record<string, string | string[] | undefined>;
  prefix: string;
}) {
  return Object.fromEntries(
    facets.map((facet) => [
      facet.facet_key,
      tagIdList(params[`${prefix}_${facet.facet_key}`]),
    ]),
  ) as Record<string, string[]>;
}

function isMissingTaxonomyVideoTableError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const record = error as { code?: unknown; message?: unknown };
  const message = typeof record.message === "string" ? record.message : "";

  return (
    record.code === "42P01" ||
    /question_taxonomy_assignments|relation .* does not exist|schema cache/i.test(
      message,
    )
  );
}

export default async function AdminVideosPage({
  searchParams,
}: AdminVideosPageProps) {
  const params = await searchParams;
  await requireAdmin();
  const supabase = await createClient();
  const { catalog: taxonomyCatalog, errorMessage: taxonomyCatalogError } =
    await loadTaxonomyCatalog(supabase);
  const taxonomyFilter = {
    exclude: selectedTagsForFacets({
      facets: taxonomyCatalog.facets,
      params,
      prefix: "tax_exclude",
    }),
    include: selectedTagsForFacets({
      facets: taxonomyCatalog.facets,
      params,
      prefix: "tax",
    }),
    requireReviewed: firstParam(params.tax_reviewed) !== "false",
  };
  const { data: matchingQuestionRows, error: taxonomyRpcError } =
    await supabase.rpc("search_questions_by_taxonomy", {
      assignment_review_status: taxonomyFilter.requireReviewed
        ? "approved"
        : null,
      exclude_tag_ids: Object.values(taxonomyFilter.exclude).flat(),
      include_tag_ids: Object.values(taxonomyFilter.include).flat(),
      page_limit: 100,
      page_offset: 0,
      question_status: "published",
    });
  const matchingQuestionIds = new Set(
    (matchingQuestionRows ?? []).map((row) => row.question_id),
  );
  const [
    { data: videos, error },
    { data: questions },
  ] = await Promise.all([
    supabase
      .from("videos")
      .select(
        "id, title, question_id, provider, video_url, embed_url, thumbnail_url, status",
      )
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("questions")
      .select("id, question_code, title, status")
      .eq("status", "published")
      .order("created_at", { ascending: false })
      .limit(100),
  ]);
  const boundQuestionIds = new Set((videos ?? []).map((video) => video.question_id));
  const availableQuestions = (questions ?? []).filter(
    (question) => !boundQuestionIds.has(question.id),
  );
  const taxonomyAssignmentsByVideoId = new Map<
    string,
    TaxonomyTagChipAssignment[]
  >();
  let taxonomySearchMessage: string | null = taxonomyRpcError
    ? isMissingTaxonomyVideoTableError(taxonomyRpcError)
      ? "Taxonomy search RPC is unavailable. Apply migrations 0011 and 0012."
      : `Taxonomy search is unavailable: ${taxonomyRpcError.message}`
    : null;

  const videoByQuestionId = new Map(
    (videos ?? []).map((video) => [video.question_id, video]),
  );
  const videoQuestionIds = Array.from(videoByQuestionId.keys());
  if (videoQuestionIds.length) {
    const { data, error: taxonomyAssignmentsError } = await supabase
      .from("question_taxonomy_assignments")
      .select("question_id, tag_id, review_status")
      .in("question_id", videoQuestionIds);

    if (taxonomyAssignmentsError) {
      taxonomySearchMessage = isMissingTaxonomyVideoTableError(
        taxonomyAssignmentsError,
      )
        ? "Taxonomy assignments are unavailable. Apply migration 0011_math_taxonomy_source_of_truth.sql to enable official tags."
        : `Taxonomy assignments are unavailable: ${taxonomyAssignmentsError.message}`;
    } else {
      for (const assignment of data ?? []) {
        const video = videoByQuestionId.get(assignment.question_id);
        if (!video) continue;
        const current =
          taxonomyAssignmentsByVideoId.get(video.id) ?? [];
        current.push({
          review_status: assignment.review_status,
          tag_id: assignment.tag_id,
        });
        taxonomyAssignmentsByVideoId.set(video.id, current);
      }
    }
  }

  const filteredVideos = taxonomyRpcError
    ? []
    : (videos ?? []).filter((video) =>
        matchingQuestionIds.has(video.question_id),
      );

  return (
    <div className="space-y-6">
      <AdminPageHeader
        description="Manage linked video content."
        eyebrow="Content management"
        help="Manage external video links and their question bindings. Videos inherit official taxonomy visibility through linked questions."
        helpLabel="Videos admin details"
        title="Videos"
      />
      <PageFeedback error={params.error} saved={params.saved} />
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Linked question taxonomy filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Filter videos by the primary curriculum, concept, method, task,
              and form tag system.
            </p>
            <TaxonomyTagTreePicker
              namePrefix="tax"
              searchQuery={firstParam(params.tax_search) ?? ""}
              selectedTagIds={taxonomyFilter.include}
              taxonomyCatalog={taxonomyCatalog}
              title="Include linked question taxonomy"
            />
            <details className="rounded-md border px-3 py-2">
              <summary className="cursor-pointer text-sm font-medium">
                Exclude official tags
              </summary>
              <div className="mt-3 space-y-3">
                <TaxonomyTagTreePicker
                  namePrefix="tax_exclude"
                  searchName="tax_exclude_search"
                  searchQuery={firstParam(params.tax_exclude_search) ?? ""}
                  selectedTagIds={taxonomyFilter.exclude}
                  taxonomyCatalog={taxonomyCatalog}
                  title="Exclude linked question taxonomy"
                />
                <div className="space-y-2">
                  <Label htmlFor="tax_reviewed">Assignments</Label>
                  <select
                    id="tax_reviewed"
                    name="tax_reviewed"
                    className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                    defaultValue={firstParam(params.tax_reviewed) ?? "true"}
                  >
                    <option value="true">Reviewed only</option>
                    <option value="false">Any review status</option>
                  </select>
                </div>
              </div>
            </details>
            {taxonomySearchMessage || taxonomyCatalogError ? (
              <div className="space-y-1 text-xs">
                {taxonomySearchMessage ? (
                  <p className="text-amber-700">{taxonomySearchMessage}</p>
                ) : null}
                {taxonomyCatalogError ? (
                  <p className="text-amber-700">{taxonomyCatalogError}</p>
                ) : null}
              </div>
            ) : null}
            {!taxonomySearchMessage &&
            taxonomyAssignmentsByVideoId.size === 0 ? (
              <p className="rounded-md border border-dashed p-2 text-xs text-muted-foreground">
                No linked question taxonomy tags assigned yet.
              </p>
            ) : null}
            <div className="flex gap-2">
              <Button type="submit">Filter videos</Button>
              <Button asChild type="button" variant="outline">
                <a href="/admin/videos">Reset</a>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Create video</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={createVideo} className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="question_id">Bound question</Label>
              <select
                id="question_id"
                name="question_id"
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                required
              >
                <option value="">Select a question</option>
                {availableQuestions.map((question) => (
                  <option key={question.id} value={question.id}>
                    {question.question_code} - {question.title}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">
                Only questions without an existing video appear here. The
                database also enforces one video per question.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="title">Title</Label>
              <Input id="title" name="title" placeholder="Video title" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="video_url">Video URL</Label>
              <Input id="video_url" name="video_url" type="url" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="embed_url">Embed URL</Label>
              <Input
                id="embed_url"
                name="embed_url"
                type="url"
                placeholder="https://www.youtube.com/embed/..."
                required
              />
              <p className="text-xs text-muted-foreground">
                Use a YouTube /embed/ URL or player.bilibili.com URL. Do not
                paste iframe HTML.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="thumbnail_url">Thumbnail URL</Label>
              <Input id="thumbnail_url" name="thumbnail_url" type="url" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="provider">Provider</Label>
              <Input id="provider" name="provider" placeholder="YouTube" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <select
                id="status"
                name="status"
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                defaultValue="draft"
              >
                <option value="draft">Draft</option>
                <option value="published">Published</option>
                <option value="archived">Archived</option>
              </select>
            </div>
            <div className="flex items-end">
              <FormSubmitButton pendingLabel="Creating video...">
                Create video
              </FormSubmitButton>
            </div>
          </form>
        </CardContent>
      </Card>
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
              <TableHead>Provider</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[160px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredVideos.map((video) => (
              <Fragment key={video.id}>
                <TableRow>
                  <TableCell>{video.title ?? "Untitled video"}</TableCell>
                  <TableCell className="font-mono text-xs">
                    {video.question_id}
                  </TableCell>
                  <TableCell>
                    <div className="space-y-2">
                      <div className="space-y-1">
                        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                          Official taxonomy tags
                        </p>
                        <TaxonomyTagChips
                          assignments={taxonomyAssignmentsByVideoId.get(video.id)}
                          emptyLabel="No taxonomy tags assigned yet."
                          showCategoryHeadings={false}
                          taxonomyCatalog={taxonomyCatalog}
                        />
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>{video.provider ?? "External"}</TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <Badge variant="secondary">{video.status}</Badge>
                      {!isAllowedVideoEmbedUrl(video.embed_url) ? (
                        <Badge variant="outline">Review embed URL</Badge>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell>
                    <form action={deleteVideo}>
                      <input type="hidden" name="id" value={video.id} />
                      <DeleteSubmitButton label={`video ${video.title ?? video.id}`} />
                    </form>
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell colSpan={6} className="bg-muted/20 p-3">
                    <details>
                      <summary className="cursor-pointer text-sm font-medium">
                        Edit video
                      </summary>
                      <form
                        action={updateVideo}
                        className="mt-3 grid gap-4 rounded-md border bg-background p-4 lg:grid-cols-2"
                      >
                        <input type="hidden" name="id" value={video.id} />
                        <div className="space-y-1">
                          <Label>Question</Label>
                          <select
                            name="question_id"
                            className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                            defaultValue={video.question_id}
                          >
                            {(questions ?? [])
                              .filter(
                                (question) =>
                                  question.id === video.question_id ||
                                  !boundQuestionIds.has(question.id),
                              )
                              .map((question) => (
                                <option key={question.id} value={question.id}>
                                  {question.question_code} - {question.title}
                                </option>
                              ))}
                          </select>
                        </div>
                        <div className="space-y-1">
                          <Label>Title</Label>
                          <Input name="title" defaultValue={video.title ?? ""} />
                        </div>
                        <div className="space-y-1">
                          <Label>Video URL</Label>
                          <Input
                            name="video_url"
                            type="url"
                            defaultValue={video.video_url}
                            required
                          />
                        </div>
                        <div className="space-y-1">
                          <Label>Embed URL</Label>
                          <Input
                            name="embed_url"
                            type="url"
                            defaultValue={video.embed_url}
                            required
                          />
                        </div>
                        <div className="space-y-1">
                          <Label>Thumbnail URL</Label>
                          <Input
                            name="thumbnail_url"
                            type="url"
                            defaultValue={video.thumbnail_url ?? ""}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label>Provider</Label>
                          <Input
                            name="provider"
                            defaultValue={video.provider ?? ""}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label>Status</Label>
                          <select
                            name="status"
                            className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                            defaultValue={video.status}
                          >
                            <option value="draft">Draft</option>
                            <option value="published">Published</option>
                            <option value="archived">Archived</option>
                          </select>
                        </div>
                        <div className="space-y-1">
                          <Label>Linked question taxonomy</Label>
                          <div className="min-h-10 rounded-md border bg-muted/20 px-3 py-2">
                            <TaxonomyTagChips
                              assignments={taxonomyAssignmentsByVideoId.get(
                                video.id,
                              )}
                              emptyLabel="No taxonomy tags assigned yet."
                              taxonomyCatalog={taxonomyCatalog}
                            />
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Videos inherit taxonomy through their linked
                            question.
                          </p>
                        </div>
                        <div className="lg:col-span-2">
                          <FormSubmitButton size="sm" pendingLabel="Saving...">
                            Save video
                          </FormSubmitButton>
                        </div>
                      </form>
                    </details>
                  </TableCell>
                </TableRow>
              </Fragment>
            ))}
            {!filteredVideos.length ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center">
                  {(videos ?? []).length
                    ? "No videos match these filters."
                    : "No videos yet. Create a published question first, then bind a video to it here."}
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
