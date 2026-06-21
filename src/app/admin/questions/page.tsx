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
import {
  extractImportAssetReferences,
  type ImportAssetReferences,
} from "@/lib/batch-import/asset-references";
import { QUESTION_ASSETS_BUCKET } from "@/lib/question-assets";
import { getQuestionReadiness } from "@/lib/questions/readiness";
import { createClient } from "@/lib/supabase/server";
import {
  buildFiveFacetQuestionBankSearchPlan,
  filterQuestionsByFiveFacetAssignments,
  hasFiveFacetQuestionBankFilters,
  type FiveFacetQuestionSearchAssignmentRow,
} from "@/lib/tags/five-facet-question-search";

type AdminQuestionsPageProps = {
  searchParams: Promise<{
    error?: string;
    ff_concept?: string | string[];
    ff_curriculum?: string | string[];
    ff_difficulty_max?: string | string[];
    ff_difficulty_min?: string | string[];
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
    q?: string;
    saved?: string;
    status?: string;
  }>;
};

const questionStatuses = ["draft", "published", "archived"] as const;

function safeStatusFilter(value: string | undefined) {
  return questionStatuses.find((status) => status === value) ?? "";
}

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function tagIdList(value: string | string[] | undefined) {
  const values = Array.isArray(value) ? value : [value ?? ""];
  return values
    .flatMap((item) => item.split(/[,\s]+/))
    .map((item) => item.trim())
    .filter(Boolean);
}

function numericParam(value: string | string[] | undefined) {
  const first = firstParam(value);
  if (first === undefined || first.trim() === "") return undefined;
  const numeric = Number(first);
  return Number.isFinite(numeric) ? numeric : Number.NaN;
}

function isMissingFiveFacetTableError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const record = error as { code?: unknown; message?: unknown };
  const message = typeof record.message === "string" ? record.message : "";

  return (
    record.code === "42P01" ||
    /five_facet_|relation .* does not exist|schema cache/i.test(message)
  );
}

export default async function AdminQuestionsPage({
  searchParams,
}: AdminQuestionsPageProps) {
  const params = await searchParams;
  await requireAdmin();
  const supabase = await createClient();
  const search = (params.q ?? "").trim().toLowerCase();
  const selectedStatus = safeStatusFilter(params.status);
  const fiveFacetFilter = {
    difficulty: {
      max: numericParam(params.ff_difficulty_max),
      min: numericParam(params.ff_difficulty_min),
    },
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
  const selectedFiveFacetInclude = fiveFacetFilter.include;
  const selectedFiveFacetExclude = fiveFacetFilter.exclude;
  const hasFiveFacetFilters = hasFiveFacetQuestionBankFilters(fiveFacetFilter);
  const fiveFacetSearchPlan = buildFiveFacetQuestionBankSearchPlan(fiveFacetFilter);
  const [
    { data: questions, error },
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

  const questionIds = (questions ?? []).map((question) => question.id);
  const assetsByQuestionId = new Map<string, QuestionAssetView[]>();
  const sourceFilesByQuestionId = new Map<string, QuestionSourceFileView[]>();
  const importRefsByQuestionId = new Map<string, ImportAssetReferences>();
  let fiveFacetAssignments: FiveFacetQuestionSearchAssignmentRow[] = [];
  const fiveFacetAssignmentsByQuestionId = new Map<
    string,
    FiveFacetTagChipAssignment[]
  >();
  let fiveFacetSearchMessage: string | null = null;
  const { data: importItems } = questionIds.length
    ? await supabase
        .from("import_batch_items")
        .select("created_question_id, normalized_question_json")
        .eq("status", "imported")
        .in("created_question_id", questionIds)
    : { data: [] };
  if (questionIds.length) {
    const { data, error: fiveFacetAssignmentsError } = await supabase
      .from("five_facet_question_tag_assignments")
      .select("question_id, tag_id, category, review_status")
      .in("question_id", questionIds);

    if (fiveFacetAssignmentsError) {
      fiveFacetSearchMessage = isMissingFiveFacetTableError(fiveFacetAssignmentsError)
        ? "Five-facet assignment tables are not available yet. Apply migration 0009_five_facet_tag_persistence.sql to enable these filters."
        : `Five-facet filters are unavailable: ${fiveFacetAssignmentsError.message}`;
    } else {
      fiveFacetAssignments = (data ?? []) as FiveFacetQuestionSearchAssignmentRow[];
      for (const assignment of fiveFacetAssignments) {
        const current =
          fiveFacetAssignmentsByQuestionId.get(assignment.question_id) ?? [];
        current.push({
          category: assignment.category,
          review_status: assignment.review_status,
          tag_id: assignment.tag_id,
        });
        fiveFacetAssignmentsByQuestionId.set(assignment.question_id, current);
      }
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

  const baseFilteredQuestions = (questions ?? []).filter((question) => {
    const searchMatches =
      !search ||
      question.question_code.toLowerCase().includes(search) ||
      question.title.toLowerCase().includes(search);
    const statusMatches = !selectedStatus || question.status === selectedStatus;

    return searchMatches && statusMatches;
  });
  const fiveFacetSearchResult =
    hasFiveFacetFilters && fiveFacetSearchPlan.valid && !fiveFacetSearchMessage
      ? filterQuestionsByFiveFacetAssignments({
          assignments: fiveFacetAssignments,
          filter: fiveFacetFilter,
          questions: baseFilteredQuestions.map((question) => ({
            difficulty_rating: question.difficulty_rating,
            id: question.id,
          })),
        })
      : null;
  const fiveFacetMatchedIds = new Set(
    fiveFacetSearchResult?.matchedQuestionIds ?? [],
  );
  const filteredQuestions = fiveFacetSearchResult
    ? baseFilteredQuestions.filter((question) => fiveFacetMatchedIds.has(question.id))
    : baseFilteredQuestions;

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
          <form className="grid gap-3 md:grid-cols-[1.5fr_1fr_auto]">
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
            <div className="flex items-end gap-2">
              <Button type="submit">Filter</Button>
              <Button asChild variant="outline" type="button">
                <Link href="/admin/questions">Reset</Link>
              </Button>
            </div>
            <div className="space-y-3 rounded-md border p-3 md:col-span-3">
              <div className="space-y-1">
                <p className="text-sm font-medium">Five-facet tags</p>
                <p className="text-xs text-muted-foreground">
                  Filter by official curriculum, concept, method, task, and form
                  assignments.
                </p>
              </div>
              <FiveFacetTagTreePicker
                namePrefix="ff"
                searchQuery={firstParam(params.ff_search) ?? ""}
                selectedTagIds={selectedFiveFacetInclude}
                title="Include official five-facet tags"
              />
              <details className="rounded-md border px-3 py-2">
                <summary className="cursor-pointer text-sm font-medium">
                  Exclude tags and difficulty
                </summary>
                <div className="mt-3 space-y-3">
                  <FiveFacetTagTreePicker
                    namePrefix="ff_exclude"
                    searchName="ff_exclude_search"
                    searchQuery={firstParam(params.ff_exclude_search) ?? ""}
                    selectedTagIds={selectedFiveFacetExclude}
                    title="Exclude official five-facet tags"
                  />
                  <div className="grid gap-3 md:grid-cols-3">
                  <Input
                    name="ff_difficulty_min"
                    defaultValue={firstParam(params.ff_difficulty_min) ?? ""}
                    placeholder="Difficulty min"
                    aria-label="Five-facet difficulty minimum"
                    type="number"
                  />
                  <Input
                    name="ff_difficulty_max"
                    defaultValue={firstParam(params.ff_difficulty_max) ?? ""}
                    placeholder="Difficulty max"
                    aria-label="Five-facet difficulty maximum"
                    type="number"
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
                </div>
              </details>
              {hasFiveFacetFilters ? (
                <div className="space-y-1 text-xs">
                  <p className="text-muted-foreground">
                    Five-facet search contract: reviewed-only assignments use
                    explicit curriculum-to-concept expansion without hierarchy
                    mutation.
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
              {!fiveFacetSearchMessage &&
              fiveFacetAssignments.length === 0 ? (
                <p className="rounded-md border border-dashed p-2 text-xs text-muted-foreground">
                  No official five-facet tag assignments yet. Seed the catalog
                  and persist approved assignments from /admin/tags.
                </p>
              ) : null}
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
                tagCount:
                  fiveFacetAssignmentsByQuestionId.get(question.id)?.length ?? 0,
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
                      <FiveFacetTagChips
                        assignments={fiveFacetAssignmentsByQuestionId.get(
                          question.id,
                        )}
                        emptyLabel="No five-facet tags assigned yet."
                        showCategoryHeadings={false}
                      />
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
                      <div className="mb-3 rounded-md border bg-background p-3">
                        <p className="mb-2 text-sm font-medium">
                          Official five-facet tags
                        </p>
                        <FiveFacetTagChips
                          assignments={fiveFacetAssignmentsByQuestionId.get(
                            question.id,
                          )}
                        />
                      </div>
                      <AdminQuestionEditDetails
                        assets={assetsByQuestionId.get(question.id)}
                        importedAssetReferences={importedAssetReferences}
                        question={question}
                        readiness={readiness}
                        sourceFiles={sourceFilesByQuestionId.get(question.id)}
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
