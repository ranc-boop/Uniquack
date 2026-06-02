import {
  createQuestion,
  deleteQuestion,
  updateQuestion,
} from "@/app/admin/questions/actions";
import { Fragment } from "react";
import type { QuestionAssetView } from "@/app/admin/questions/asset-actions";
import { DeleteSubmitButton } from "@/components/delete-submit-button";
import { FormSubmitButton } from "@/components/form-submit-button";
import { PageFeedback } from "@/components/page-feedback";
import { QuestionAssetsPanel } from "@/components/question-assets-panel";
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
import { Textarea } from "@/components/ui/textarea";
import { requireAdmin } from "@/lib/auth/guards";
import { QUESTION_ASSETS_BUCKET } from "@/lib/question-assets";
import { createClient } from "@/lib/supabase/server";

type AdminQuestionsPageProps = {
  searchParams: Promise<{
    error?: string;
    saved?: string;
  }>;
};

export default async function AdminQuestionsPage({
  searchParams,
}: AdminQuestionsPageProps) {
  const params = await searchParams;
  await requireAdmin();
  const supabase = await createClient();
  const [
    { data: questions, error },
    { data: tags },
    { data: questionTags },
    { data: questionAssets },
  ] =
    await Promise.all([
      supabase
        .from("questions")
        .select(
          "id, question_code, title, content_html, solution_html, difficulty_rating, question_type, status",
        )
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("tags")
        .select("id, name, status")
        .order("name", { ascending: true })
        .limit(100),
      supabase.from("question_tags").select("question_id, tag_id").limit(1000),
      supabase
        .from("question_assets")
        .select(
          "id, question_id, object_path, original_filename, display_on_detail",
        )
        .eq("status", "ready")
        .limit(1000),
    ]);

  const tagNameById = new Map((tags ?? []).map((tag) => [tag.id, tag.name]));
  const tagsByQuestionId = new Map<string, string[]>();
  const assetsByQuestionId = new Map<string, QuestionAssetView[]>();

  for (const binding of questionTags ?? []) {
    const current = tagsByQuestionId.get(binding.question_id) ?? [];
    const tagName = tagNameById.get(binding.tag_id);

    if (tagName) {
      current.push(tagName);
      tagsByQuestionId.set(binding.question_id, current);
    }
  }

  for (const asset of questionAssets ?? []) {
    if (!asset.question_id) {
      continue;
    }

    const current = assetsByQuestionId.get(asset.question_id) ?? [];
    const { data } = supabase.storage
      .from(QUESTION_ASSETS_BUCKET)
      .getPublicUrl(asset.object_path);

    current.push({
      id: asset.id,
      questionId: asset.question_id,
      originalFilename: asset.original_filename,
      publicUrl: data.publicUrl,
      displayOnDetail: asset.display_on_detail,
    });
    assetsByQuestionId.set(asset.question_id, current);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Questions</h1>
        <p className="text-sm text-muted-foreground">
          CRUD skeleton for the question bank. Rich editor integration comes
          later.
        </p>
      </div>
      <PageFeedback error={params.error} saved={params.saved} />
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Create question</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            id="create-question-form"
            action={createQuestion}
            className="grid gap-4 md:grid-cols-2"
          >
            <input id="create-question-draft-id" type="hidden" name="draft_id" />
            <div className="space-y-2">
              <Label htmlFor="question_code">Code</Label>
              <Input
                id="question_code"
                name="question_code"
                placeholder="Q10042"
                required
                maxLength={80}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                name="title"
                placeholder="Newton's laws FRQ"
                required
                maxLength={240}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="difficulty_rating">Difficulty 0-1000</Label>
              <Input
                id="difficulty_rating"
                name="difficulty_rating"
                type="number"
                min="0"
                max="1000"
                defaultValue="500"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="question_type">Type</Label>
              <select
                id="question_type"
                name="question_type"
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                defaultValue="frq"
              >
                <option value="frq">FRQ</option>
                <option value="mcq">MCQ</option>
                <option value="mixed">Mixed</option>
              </select>
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
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="tag_ids">Tags</Label>
              <select
                id="tag_ids"
                name="tag_ids"
                multiple
                className="min-h-28 w-full rounded-md border bg-background px-3 py-2 text-sm"
              >
                {(tags ?? []).map((tag) => (
                  <option key={tag.id} value={tag.id}>
                    {tag.name} ({tag.status})
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="content_html">Content HTML</Label>
              <Textarea
                id="content_html"
                name="content_html"
                className="min-h-36 font-mono text-sm"
                placeholder="<p>Question stem placeholder</p>"
                required
              />
              <p className="text-xs text-muted-foreground">
                HTML is sanitized on save before public rendering.
              </p>
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="solution_html">Solution HTML</Label>
              <Textarea
                id="solution_html"
                name="solution_html"
                className="min-h-32 font-mono text-sm"
                placeholder="<p>Optional solution placeholder</p>"
              />
            </div>
            <div className="md:col-span-2">
              <QuestionAssetsPanel
                draftInputId="create-question-draft-id"
                questionCodeInputId="question_code"
                titleInputId="title"
              />
            </div>
            <div className="md:col-span-2">
              <FormSubmitButton pendingLabel="Creating question...">
                Create question
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
              <TableHead>Code</TableHead>
              <TableHead>Title</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Tags</TableHead>
              <TableHead>Difficulty</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[160px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(questions ?? []).map((question) => (
              <Fragment key={question.id}>
                <TableRow>
                  <TableCell className="font-mono text-xs">
                    {question.question_code}
                  </TableCell>
                  <TableCell>{question.title}</TableCell>
                  <TableCell>{question.question_type}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {(tagsByQuestionId.get(question.id) ?? []).map((tagName) => (
                        <Badge key={tagName} variant="outline">
                          {tagName}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>{question.difficulty_rating}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{question.status}</Badge>
                  </TableCell>
                  <TableCell>
                    <form action={deleteQuestion}>
                      <input type="hidden" name="id" value={question.id} />
                      <DeleteSubmitButton label={`question ${question.question_code}`} />
                    </form>
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell colSpan={7} className="bg-muted/20 p-3">
                    <details>
                      <summary className="cursor-pointer text-sm font-medium">
                        Edit question
                      </summary>
                      <form
                        action={updateQuestion}
                        className="mt-3 grid gap-4 rounded-md border bg-background p-4 lg:grid-cols-2"
                      >
                        <input type="hidden" name="id" value={question.id} />
                        <div className="space-y-1">
                          <Label>Code</Label>
                          <Input
                            name="question_code"
                            defaultValue={question.question_code}
                            required
                          />
                        </div>
                        <div className="space-y-1">
                          <Label>Title</Label>
                          <Input
                            name="title"
                            defaultValue={question.title}
                            required
                          />
                        </div>
                        <div className="space-y-1">
                          <Label>Difficulty</Label>
                          <Input
                            name="difficulty_rating"
                            type="number"
                            min="0"
                            max="1000"
                            defaultValue={question.difficulty_rating}
                            required
                          />
                        </div>
                        <div className="space-y-1">
                          <Label>Type</Label>
                          <select
                            name="question_type"
                            className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                            defaultValue={question.question_type}
                          >
                            <option value="frq">FRQ</option>
                            <option value="mcq">MCQ</option>
                            <option value="mixed">Mixed</option>
                          </select>
                        </div>
                        <div className="space-y-1">
                          <Label>Status</Label>
                          <select
                            name="status"
                            className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                            defaultValue={question.status}
                          >
                            <option value="draft">Draft</option>
                            <option value="published">Published</option>
                            <option value="archived">Archived</option>
                          </select>
                        </div>
                        <div className="space-y-1">
                          <Label>Tags</Label>
                          <select
                            name="tag_ids"
                            multiple
                            className="min-h-32 w-full rounded-md border bg-background px-3 py-2 text-sm"
                            defaultValue={(questionTags ?? [])
                              .filter(
                                (binding) =>
                                  binding.question_id === question.id,
                              )
                              .map((binding) => binding.tag_id)}
                          >
                            {(tags ?? []).map((tag) => (
                              <option key={tag.id} value={tag.id}>
                                {tag.name} ({tag.status})
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="space-y-1 lg:col-span-2">
                          <Label>Content HTML</Label>
                          <Textarea
                            name="content_html"
                            className="min-h-56 font-mono text-sm"
                            defaultValue={question.content_html}
                            required
                          />
                        </div>
                        <div className="space-y-1 lg:col-span-2">
                          <Label>Solution HTML</Label>
                          <Textarea
                            name="solution_html"
                            className="min-h-48 font-mono text-sm"
                            defaultValue={question.solution_html ?? ""}
                          />
                        </div>
                        <div className="lg:col-span-2">
                          <QuestionAssetsPanel
                            questionId={question.id}
                            initialAssets={assetsByQuestionId.get(question.id)}
                          />
                        </div>
                        <div className="lg:col-span-2">
                          <FormSubmitButton size="sm" pendingLabel="Saving...">
                            Save question
                          </FormSubmitButton>
                        </div>
                      </form>
                    </details>
                  </TableCell>
                </TableRow>
              </Fragment>
            ))}
            {!questions?.length ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center">
                  No questions yet. Create a draft or use demo seed data from
                  the admin dashboard.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
