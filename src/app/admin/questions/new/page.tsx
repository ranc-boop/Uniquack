import Link from "next/link";

import { createQuestion } from "@/app/admin/questions/actions";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminQuestionLibraryNav } from "@/components/admin/admin-question-library-nav";
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

export const dynamic = "force-dynamic";

export default async function AdminQuestionCreatePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const [params, profile, supabase] = await Promise.all([
    searchParams,
    requireAdmin(),
    createClient(),
  ]);
  const { catalog: taxonomyCatalog } = await loadTaxonomyCatalog(supabase);

  return (
    <div className="space-y-6">
      <AdminPageHeader
        actions={
          <Button asChild variant="outline">
            <Link href="/admin/questions">Back to questions</Link>
          </Button>
        }
        eyebrow="Content management"
        help="Create one private Global Review Draft. It remains unavailable to learners until Global Review approval."
        helpLabel="Manual question creation details"
        title="Create question"
      />
      <AdminQuestionLibraryNav role={profile.role} />
      <PageFeedback error={params.error} />

      <section className="rounded-lg border bg-card p-5 shadow-sm">
        <form
          action={createQuestion}
          className="grid gap-4 md:grid-cols-2"
          id="create-question-form"
        >
          <input id="create-question-draft-id" name="draft_id" type="hidden" />
          <div className="space-y-2">
            <Label htmlFor="question_code">Code</Label>
            <Input
              id="question_code"
              maxLength={80}
              name="question_code"
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
              placeholder="Newton's laws FRQ"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="difficulty_rating">Difficulty 0-1000</Label>
            <Input
              defaultValue="500"
              id="difficulty_rating"
              max="1000"
              min="0"
              name="difficulty_rating"
              required
              type="number"
            />
          </div>
          <QuestionAnswerFields defaultQuestionType="frq" />
          <input name="status" type="hidden" value="draft" />
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
            Manual authoring creates a private Global Review Draft.
            Publication is available only after review.
          </div>
          <div className="space-y-2 md:col-span-2">
            <QuestionHtmlEditor
              id="content_html"
              label="Content HTML"
              name="content_html"
              placeholder="<p>Question stem placeholder</p>"
              required
            />
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
            <TaxonomyTagTreePicker
              namePrefix="question_tax"
              selectable="assignable"
              taxonomyCatalog={taxonomyCatalog}
              title="Question taxonomy tags"
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
              Create Review Draft
            </FormSubmitButton>
          </div>
        </form>
      </section>
    </div>
  );
}
