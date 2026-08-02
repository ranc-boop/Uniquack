import { createQuestion } from "@/app/admin/questions/actions";
import { AdminPendingLink } from "@/components/admin/admin-pending-link";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { FormSubmitButton } from "@/components/form-submit-button";
import { PageFeedback } from "@/components/page-feedback";
import { QuestionAnswerFields } from "@/components/question-answer-fields";
import { QuestionAssetsPanel } from "@/components/question-assets-panel";
import { QuestionHtmlEditor } from "@/components/question-html-editor";
import { QuestionSourceFilesPanel } from "@/components/question-source-files-panel";
import { TaxonomyTagTreePicker } from "@/components/tags/taxonomy-tag-tree-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requireAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { loadTaxonomyCatalog } from "@/lib/tags/taxonomy-db";
import { uuidSchema } from "@/lib/validations/common";

export const dynamic = "force-dynamic";

export default async function AdminQuestionCreatePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; source?: string }>;
}) {
  const [params, , supabase] = await Promise.all([
    searchParams,
    requireAdmin(),
    createClient(),
  ]);
  const { catalog: taxonomyCatalog } = await loadTaxonomyCatalog(supabase);
  const sourceId = uuidSchema.safeParse(params.source);
  const { data: revisionSource } = sourceId.success
    ? await supabase
        .from("questions")
        .select(
          "id, approval_status, question_code, title, question_type, difficulty_rating, content_html, content_source, content_source_format, solution_html, solution_source, solution_source_format, options, answer_spec",
        )
        .eq("id", sourceId.data)
        .eq("approval_status", "approved")
        .is("owner_bank_id", null)
        .maybeSingle()
    : { data: null };
  const revisionCode = revisionSource
    ? `${revisionSource.question_code.slice(0, 62)}-REV-${revisionSource.id.slice(0, 8).toUpperCase()}`
    : "";

  return (
    <div className="space-y-6">
      <AdminPageHeader
        actions={
          <Button asChild variant="outline">
            <AdminPendingLink href="/admin/questions" pendingLabel="Public Library">Back to questions</AdminPendingLink>
          </Button>
        }
        title={revisionSource ? "Create revision" : "Create question"}
      />
      <PageFeedback error={params.error} />

      <section className="rounded-lg border bg-card p-5 shadow-sm">
        <form
          action={createQuestion}
          className="grid gap-4 md:grid-cols-2"
          id="create-question-form"
        >
          <input id="create-question-draft-id" name="draft_id" type="hidden" />
          {revisionSource ? (
            <input name="revision_of_question_id" type="hidden" value={revisionSource.id} />
          ) : null}
          <div className="space-y-2">
            <Label htmlFor="question_code">Code</Label>
            <Input
              id="question_code"
              maxLength={80}
              name="question_code"
              defaultValue={revisionCode}
              placeholder="Q10042"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              maxLength={240}
              name="title"
              defaultValue={revisionSource ? `${revisionSource.title} (Revision)` : ""}
              placeholder="Newton's laws FRQ"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="difficulty_rating">Difficulty 0-1000</Label>
            <Input
              defaultValue={revisionSource?.difficulty_rating ?? 500}
              id="difficulty_rating"
              max="1000"
              min="0"
              name="difficulty_rating"
              required
              type="number"
            />
          </div>
          <QuestionAnswerFields
            answerSpec={revisionSource?.answer_spec}
            defaultQuestionType={revisionSource?.question_type ?? "frq"}
            options={revisionSource?.options}
          />
          <input name="status" type="hidden" value="draft" />
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
            Manual authoring creates a private Global Review Draft.
            Publication is available only after review.
          </div>
          <div className="space-y-2 md:col-span-2">
            <QuestionHtmlEditor
              id="content_html"
              defaultSource={revisionSource?.content_source}
              defaultSourceFormat={revisionSource?.content_source_format}
              defaultValue={revisionSource?.content_html}
              label="Content HTML"
              name="content_html"
              placeholder="<p>Question stem placeholder</p>"
              required
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <QuestionHtmlEditor
              id="solution_html"
              defaultSource={revisionSource?.solution_source}
              defaultSourceFormat={revisionSource?.solution_source_format}
              defaultValue={revisionSource?.solution_html}
              label="Solution HTML"
              name="solution_html"
              placeholder="<p>Optional solution placeholder</p>"
            />
          </div>
          <div className="md:col-span-2">
            <TaxonomyTagTreePicker
              namePrefix="question_tax"
              selectable="assignable"
              taxonomyCatalog={taxonomyCatalog}
              title="Question taxonomy tags"
            />
          </div>
          <div className="md:col-span-2">
            {revisionSource ? (
              <p className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-950">
                Existing official images will be copied into this pending revision when you submit it.
              </p>
            ) : (
              <QuestionAssetsPanel
                draftInputId="create-question-draft-id"
                questionCodeInputId="question_code"
                titleInputId="title"
              />
            )}
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
              Create Review Draft
            </FormSubmitButton>
          </div>
        </form>
      </section>
    </div>
  );
}
