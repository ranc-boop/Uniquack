import {
  createQuestion,
  deleteQuestion,
} from "@/app/admin/questions/actions";
import { Fragment } from "react";
import Link from "next/link";
import type { QuestionAssetView } from "@/app/admin/questions/asset-actions";
import type { QuestionSourceFileView } from "@/app/admin/questions/source-file-actions";
import { AdminQuestionEditDetails } from "@/components/admin-question-edit-details";
import { DeleteSubmitButton } from "@/components/delete-submit-button";
import { FormSubmitButton } from "@/components/form-submit-button";
import { PageFeedback } from "@/components/page-feedback";
import { QuestionHtmlEditor } from "@/components/question-html-editor";
import { QuestionAssetsPanel } from "@/components/question-assets-panel";
import { QuestionSourceFilesPanel } from "@/components/question-source-files-panel";
import { TagCheckboxList } from "@/components/tag-checkbox-list";
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
import {
  extractImportAssetReferences,
  type ImportAssetReferences,
} from "@/lib/batch-import/asset-references";
import { QUESTION_ASSETS_BUCKET } from "@/lib/question-assets";
import { getQuestionReadiness } from "@/lib/questions/readiness";
import { createClient } from "@/lib/supabase/server";

type AdminQuestionsPageProps = {
  searchParams: Promise<{
    error?: string;
    q?: string;
    saved?: string;
    status?: string;
    tag?: string;
  }>;
};

const questionStatuses = ["draft", "published", "archived"] as const;

function safeStatusFilter(value: string | undefined) {
  return questionStatuses.find((status) => status === value) ?? "";
}

export default async function AdminQuestionsPage({
  searchParams,
}: AdminQuestionsPageProps) {
  const params = await searchParams;
  await requireAdmin();
  const supabase = await createClient();
  const search = (params.q ?? "").trim().toLowerCase();
  const selectedStatus = safeStatusFilter(params.status);
  const selectedTagId = params.tag ?? "";
  const [
    { data: questions, error },
    { data: tags },
    { data: questionTags },
    { data: questionAssets },
    { data: questionSourceFiles },
  ] =
    await Promise.all([
      supabase
        .from("questions")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200),
      supabase
        .from("tags")
        .select("id, name, status, tag_type")
        .order("name", { ascending: true })
        .limit(1000),
      supabase.from("question_tags").select("question_id, tag_id").limit(1000),
      supabase
        .from("question_assets")
        .select(
          "id, question_id, object_path, original_filename, display_on_detail",
        )
        .eq("status", "ready")
        .limit(1000),
      supabase
        .from("question_source_files")
        .select(
          "id, question_id, original_filename, mime_type, size_bytes, status",
        )
        .neq("status", "deleted")
        .limit(1000),
    ]);

  const tagNameById = new Map((tags ?? []).map((tag) => [tag.id, tag.name]));
  const questionIds = (questions ?? []).map((question) => question.id);
  const tagsByQuestionId = new Map<string, string[]>();
  const tagIdsByQuestionId = new Map<string, Set<string>>();
  const assetsByQuestionId = new Map<string, QuestionAssetView[]>();
  const sourceFilesByQuestionId = new Map<string, QuestionSourceFileView[]>();
  const importRefsByQuestionId = new Map<string, ImportAssetReferences>();
  const { data: importItems } = questionIds.length
    ? await supabase
        .from("import_batch_items")
        .select("created_question_id, normalized_question_json")
        .eq("status", "imported")
        .in("created_question_id", questionIds)
    : { data: [] };

  for (const binding of questionTags ?? []) {
    const current = tagsByQuestionId.get(binding.question_id) ?? [];
    const currentIds = tagIdsByQuestionId.get(binding.question_id) ?? new Set();
    const tagName = tagNameById.get(binding.tag_id);

    if (tagName) {
      current.push(tagName);
      tagsByQuestionId.set(binding.question_id, current);
      currentIds.add(binding.tag_id);
      tagIdsByQuestionId.set(binding.question_id, currentIds);
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

  for (const sourceFile of questionSourceFiles ?? []) {
    if (!sourceFile.question_id) {
      continue;
    }

    const current = sourceFilesByQuestionId.get(sourceFile.question_id) ?? [];

    current.push({
      id: sourceFile.id,
      questionId: sourceFile.question_id,
      originalFilename: sourceFile.original_filename,
      mimeType: sourceFile.mime_type,
      sizeBytes: sourceFile.size_bytes,
      status: sourceFile.status,
    });
    sourceFilesByQuestionId.set(sourceFile.question_id, current);
  }

  for (const item of importItems ?? []) {
    if (!item.created_question_id) {
      continue;
    }

    importRefsByQuestionId.set(
      item.created_question_id,
      extractImportAssetReferences(item.normalized_question_json),
    );
  }

  const filteredQuestions = (questions ?? []).filter((question) => {
    const searchMatches =
      !search ||
      question.question_code.toLowerCase().includes(search) ||
      question.title.toLowerCase().includes(search);
    const statusMatches = !selectedStatus || question.status === selectedStatus;
    const tagMatches =
      !selectedTagId ||
      (tagIdsByQuestionId.get(question.id)?.has(selectedTagId) ?? false);

    return searchMatches && statusMatches && tagMatches;
  });

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
              <Label>Tags</Label>
              <TagCheckboxList tags={tags ?? []} />
            </div>
            <div className="space-y-2 md:col-span-2">
              <QuestionHtmlEditor
                id="content_html"
                label="Content HTML"
                name="content_html"
                placeholder="<p>Question stem placeholder</p>"
                required
              />
              <p className="text-xs text-muted-foreground">
                HTML is sanitized on save before public rendering.
              </p>
            </div>
            <div className="space-y-2 md:col-span-2">
              <QuestionHtmlEditor
                id="solution_html"
                label="Solution HTML"
                name="solution_html"
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
              <QuestionSourceFilesPanel
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
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Find questions</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="grid gap-3 md:grid-cols-[1.5fr_1fr_1fr_auto]">
            <div className="space-y-2">
              <Label htmlFor="q">Search</Label>
              <Input
                id="q"
                name="q"
                defaultValue={params.q ?? ""}
                placeholder="Question code or title"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="status_filter">Status</Label>
              <select
                id="status_filter"
                name="status"
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                defaultValue={selectedStatus}
              >
                <option value="">All statuses</option>
                {questionStatuses.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="tag_filter">Tag</Label>
              <select
                id="tag_filter"
                name="tag"
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                defaultValue={selectedTagId}
              >
                <option value="">All tags</option>
                {(tags ?? []).map((tag) => (
                  <option key={tag.id} value={tag.id}>
                    {tag.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-end gap-2">
              <Button type="submit">Filter</Button>
              <Button asChild variant="outline" type="button">
                <Link href="/admin/questions">Reset</Link>
              </Button>
            </div>
          </form>
          <p className="mt-3 text-xs text-muted-foreground">
            Showing {filteredQuestions.length} of {(questions ?? []).length}
            questions.
          </p>
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
            {filteredQuestions.map((question) => {
              const questionTagNames = tagsByQuestionId.get(question.id) ?? [];
              const importedAssetReferences =
                importRefsByQuestionId.get(question.id) ?? null;
              const imageCount =
                assetsByQuestionId.get(question.id)?.length ?? 0;
              const sourceFileCount =
                sourceFilesByQuestionId.get(question.id)?.length ?? 0;
              const readiness = getQuestionReadiness({
                contentHtml: question.content_html,
                difficultyRating: question.difficulty_rating,
                imageCount,
                importedAssetReferences,
                solutionHtml: question.solution_html,
                sourceFileCount,
                tagCount: questionTagNames.length,
              });

              return (
                <Fragment key={question.id}>
                  <TableRow>
                    <TableCell className="font-mono text-xs">
                      {question.question_code}
                    </TableCell>
                    <TableCell>{question.title}</TableCell>
                    <TableCell>{question.question_type}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {questionTagNames.map((tagName) => (
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
                        <DeleteSubmitButton
                          label={`question ${question.question_code}`}
                        />
                      </form>
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell colSpan={7} className="bg-muted/20 p-3">
                      <AdminQuestionEditDetails
                        assets={assetsByQuestionId.get(question.id)}
                        importedAssetReferences={importedAssetReferences}
                        question={question}
                        readiness={readiness}
                        selectedTagIds={Array.from(
                          tagIdsByQuestionId.get(question.id) ?? [],
                        )}
                        sourceFiles={sourceFilesByQuestionId.get(question.id)}
                        tags={tags ?? []}
                      />
                    </TableCell>
                  </TableRow>
                </Fragment>
              );
            })}
            {!filteredQuestions.length ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center">
                  {(questions ?? []).length
                    ? "No questions match these filters."
                    : "No questions yet. Create a draft or use demo seed data from the admin dashboard."}
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
