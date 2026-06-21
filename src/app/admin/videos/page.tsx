import {
  createVideo,
  deleteVideo,
  updateVideo,
} from "@/app/admin/videos/actions";
import { Fragment } from "react";
import { DeleteSubmitButton } from "@/components/delete-submit-button";
import { FormSubmitButton } from "@/components/form-submit-button";
import { PageFeedback } from "@/components/page-feedback";
import {
  FiveFacetTagChips,
  type FiveFacetTagChipAssignment,
} from "@/components/tags/five-facet-tag-chips";
import { FiveFacetTagTreePicker } from "@/components/tags/five-facet-tag-tree-picker";
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
import {
  buildFiveFacetVideoBankSearchPlan,
  filterVideosByFiveFacetAssignments,
  hasFiveFacetVideoBankFilters,
  type FiveFacetVideoSearchAssignmentRow,
} from "@/lib/tags/five-facet-video-search";
import { isAllowedVideoEmbedUrl } from "@/lib/validations/video";

type AdminVideosPageProps = {
  searchParams: Promise<{
    error?: string;
    ff_concept?: string | string[];
    ff_curriculum?: string | string[];
    ff_exclude_concept?: string | string[];
    ff_exclude_curriculum?: string | string[];
    ff_exclude_form?: string | string[];
    ff_exclude_method?: string | string[];
    ff_exclude_search?: string | string[];
    ff_exclude_task?: string | string[];
    ff_form?: string | string[];
    ff_method?: string | string[];
    ff_reviewed?: string | string[];
    ff_search?: string | string[];
    ff_task?: string | string[];
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

function isMissingFiveFacetVideoTableError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const record = error as { code?: unknown; message?: unknown };
  const message = typeof record.message === "string" ? record.message : "";

  return (
    record.code === "42P01" ||
    /five_facet_video_tag_assignments|relation .* does not exist|schema cache/i.test(
      message,
    )
  );
}

export default async function AdminVideosPage({
  searchParams,
}: AdminVideosPageProps) {
  const params = await searchParams;
  await requireAdmin();
  const fiveFacetFilter = {
    exclude: {
      concept: tagIdList(params.ff_exclude_concept),
      curriculum: tagIdList(params.ff_exclude_curriculum),
      form: tagIdList(params.ff_exclude_form),
      method: tagIdList(params.ff_exclude_method),
      task: tagIdList(params.ff_exclude_task),
    },
    include: {
      concept: tagIdList(params.ff_concept),
      curriculum: tagIdList(params.ff_curriculum),
      form: tagIdList(params.ff_form),
      method: tagIdList(params.ff_method),
      task: tagIdList(params.ff_task),
    },
    requireReviewed: firstParam(params.ff_reviewed) !== "false",
  };
  const hasFiveFacetFilters = hasFiveFacetVideoBankFilters(fiveFacetFilter);
  const fiveFacetSearchPlan = buildFiveFacetVideoBankSearchPlan(fiveFacetFilter);
  const supabase = await createClient();
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
  const fiveFacetAssignmentsByVideoId = new Map<
    string,
    FiveFacetTagChipAssignment[]
  >();
  let fiveFacetAssignments: FiveFacetVideoSearchAssignmentRow[] = [];
  let fiveFacetSearchMessage: string | null = null;

  const videoIds = (videos ?? []).map((video) => video.id);
  if (videoIds.length) {
    const { data, error: fiveFacetVideoAssignmentsError } = await supabase
      .from("five_facet_video_tag_assignments")
      .select("video_id, tag_id, category, review_status")
      .in("video_id", videoIds);

    if (fiveFacetVideoAssignmentsError) {
      fiveFacetSearchMessage = isMissingFiveFacetVideoTableError(
        fiveFacetVideoAssignmentsError,
      )
        ? "Five-facet video assignments are unavailable. Apply migration 0010_five_facet_video_tag_assignments.sql to enable official video tags."
        : `Five-facet video assignments are unavailable: ${fiveFacetVideoAssignmentsError.message}`;
    } else {
      fiveFacetAssignments = (data ?? []) as FiveFacetVideoSearchAssignmentRow[];
      for (const assignment of fiveFacetAssignments) {
        const current =
          fiveFacetAssignmentsByVideoId.get(assignment.video_id) ?? [];
        current.push({
          category: assignment.category,
          review_status: assignment.review_status,
          tag_id: assignment.tag_id,
        });
        fiveFacetAssignmentsByVideoId.set(assignment.video_id, current);
      }
    }
  }

  const fiveFacetSearchResult =
    hasFiveFacetFilters && fiveFacetSearchPlan.valid && !fiveFacetSearchMessage
      ? filterVideosByFiveFacetAssignments({
          assignments: fiveFacetAssignments,
          filter: fiveFacetFilter,
          videos: videos ?? [],
        })
      : null;
  const fiveFacetMatchedIds = new Set(
    fiveFacetSearchResult?.matchedVideoIds ?? [],
  );
  const filteredVideos = fiveFacetSearchResult
    ? (videos ?? []).filter((video) => fiveFacetMatchedIds.has(video.id))
    : videos ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Videos</h1>
        <p className="text-sm text-muted-foreground">
          External video CRUD skeleton. The unique question binding is enforced
          by the database. Official five-facet tags are the visible video
          taxonomy.
        </p>
      </div>
      <PageFeedback error={params.error} saved={params.saved} />
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Official five-facet video tags</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Filter videos by the primary curriculum, concept, method, task,
              and form tag system.
            </p>
            <FiveFacetTagTreePicker
              namePrefix="ff"
              searchQuery={firstParam(params.ff_search) ?? ""}
              selectedTagIds={fiveFacetFilter.include}
              title="Include official five-facet video tags"
            />
            <details className="rounded-md border px-3 py-2">
              <summary className="cursor-pointer text-sm font-medium">
                Exclude official tags
              </summary>
              <div className="mt-3 space-y-3">
                <FiveFacetTagTreePicker
                  namePrefix="ff_exclude"
                  searchName="ff_exclude_search"
                  searchQuery={firstParam(params.ff_exclude_search) ?? ""}
                  selectedTagIds={fiveFacetFilter.exclude}
                  title="Exclude official five-facet video tags"
                />
                <div className="space-y-2">
                  <Label htmlFor="ff_reviewed">Assignments</Label>
                  <select
                    id="ff_reviewed"
                    name="ff_reviewed"
                    className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                    defaultValue={firstParam(params.ff_reviewed) ?? "true"}
                  >
                    <option value="true">Reviewed only</option>
                    <option value="false">Any review status</option>
                  </select>
                </div>
              </div>
            </details>
            {hasFiveFacetFilters ? (
              <div className="space-y-1 text-xs">
                <p className="text-muted-foreground">
                  Five-facet video search contract: curriculum tags can expand
                  to mapped concepts without hierarchy mutation.
                </p>
                {fiveFacetSearchPlan.errors.length ? (
                  <p className="text-destructive">
                    {fiveFacetSearchPlan.errors.slice(0, 3).join("; ")}
                  </p>
                ) : null}
                {fiveFacetSearchMessage ? (
                  <p className="text-amber-700">{fiveFacetSearchMessage}</p>
                ) : null}
              </div>
            ) : null}
            {!fiveFacetSearchMessage && !fiveFacetAssignments.length ? (
              <p className="rounded-md border border-dashed p-2 text-xs text-muted-foreground">
                No official five-facet video tags assigned yet.
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
                          <Label>Official five-facet video tags</Label>
                          <div className="min-h-10 rounded-md border bg-muted/20 px-3 py-2">
                            <FiveFacetTagChips
                              assignments={fiveFacetAssignmentsByVideoId.get(
                                video.id,
                              )}
                              emptyLabel="No five-facet tags assigned yet."
                            />
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Official video tag assignment writes are handled by
                            the five-facet review/admin workflow.
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
