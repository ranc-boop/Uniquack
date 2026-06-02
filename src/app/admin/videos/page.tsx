import {
  createVideo,
  deleteVideo,
  updateVideo,
} from "@/app/admin/videos/actions";
import { Fragment } from "react";
import { DeleteSubmitButton } from "@/components/delete-submit-button";
import { FormSubmitButton } from "@/components/form-submit-button";
import { PageFeedback } from "@/components/page-feedback";
import { Badge } from "@/components/ui/badge";
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
import { isAllowedVideoEmbedUrl } from "@/lib/validations/video";

type AdminVideosPageProps = {
  searchParams: Promise<{
    error?: string;
    saved?: string;
  }>;
};

export default async function AdminVideosPage({
  searchParams,
}: AdminVideosPageProps) {
  const params = await searchParams;
  await requireAdmin();
  const supabase = await createClient();
  const [
    { data: videos, error },
    { data: questions },
    { data: videoTags },
    { data: tags },
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
    supabase.from("video_tags").select("video_id, tag_id").limit(1000),
    supabase.from("tags").select("id, name").limit(1000),
  ]);
  const tagNameById = new Map((tags ?? []).map((tag) => [tag.id, tag.name]));
  const boundQuestionIds = new Set((videos ?? []).map((video) => video.question_id));
  const availableQuestions = (questions ?? []).filter(
    (question) => !boundQuestionIds.has(question.id),
  );
  const tagsByVideoId = new Map<string, string[]>();

  for (const binding of videoTags ?? []) {
    const current = tagsByVideoId.get(binding.video_id) ?? [];
    const tagName = tagNameById.get(binding.tag_id);

    if (tagName) {
      current.push(tagName);
      tagsByVideoId.set(binding.video_id, current);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Videos</h1>
        <p className="text-sm text-muted-foreground">
          External video CRUD skeleton. The unique question binding is enforced
          by the database. Video tags mirror the bound question tags for MVP.
        </p>
      </div>
      <PageFeedback error={params.error} saved={params.saved} />
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
              <TableHead>Inherited tags</TableHead>
              <TableHead>Provider</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[160px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(videos ?? []).map((video) => (
              <Fragment key={video.id}>
                <TableRow>
                  <TableCell>{video.title ?? "Untitled video"}</TableCell>
                  <TableCell className="font-mono text-xs">
                    {video.question_id}
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
                          <Label>Mirrored tags</Label>
                          <div className="min-h-10 rounded-md border bg-muted/20 px-3 py-2">
                            <div className="flex flex-wrap gap-1">
                              {(tagsByVideoId.get(video.id) ?? []).length ? (
                                (tagsByVideoId.get(video.id) ?? []).map(
                                  (tagName) => (
                                    <Badge key={tagName} variant="outline">
                                      {tagName}
                                    </Badge>
                                  ),
                                )
                              ) : (
                                <span className="text-xs text-muted-foreground">
                                  No question tags to mirror.
                                </span>
                              )}
                            </div>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Edit the bound question tags to update video tags.
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
            {!videos?.length ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center">
                  No videos yet. Create a published question first, then bind a
                  video to it here.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
