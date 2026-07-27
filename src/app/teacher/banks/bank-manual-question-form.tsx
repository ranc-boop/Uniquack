import { FormSubmitButton } from "@/components/form-submit-button";
import { QuestionAnswerFields } from "@/components/question-answer-fields";
import { QuestionAssetsPanel } from "@/components/question-assets-panel";
import { QuestionHtmlEditor } from "@/components/question-html-editor";
import { QuestionSourceFilesPanel } from "@/components/question-source-files-panel";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  TaxonomyTagTreePicker,
  type TaxonomyCatalogView,
} from "@/components/tags/taxonomy-tag-tree-picker";

import { createBankManualQuestionDraft } from "./actions";
import {
  cancelBankQuestionSourceFileUpload,
  createBankQuestionSourceFileSignedUrl,
  deleteBankQuestionAsset,
  deleteBankQuestionSourceFile,
  ensureBankQuestionDraftForSourceUpload,
  ensureBankQuestionDraftForUpload,
  finalizeBankQuestionAssetUpload,
  finalizeBankQuestionSourceFileUpload,
  reserveBankQuestionAssetUpload,
  reserveBankQuestionSourceFileUpload,
  updateBankQuestionAssetDisplay,
} from "./bank-media-actions";

export function BankManualQuestionForm({
  bankId,
  canImport,
  taxonomyCatalog,
}: {
  bankId: string;
  canImport: boolean;
  taxonomyCatalog: TaxonomyCatalogView;
}) {
  if (!canImport) {
    return (
      <div className="rounded-md border bg-muted/20 p-5 text-sm text-muted-foreground">
        This Library is read-only for your account. Only owners and editors can
        create manual drafts.
      </div>
    );
  }

  const draftInputId = `bank-manual-draft-${bankId}`;
  const codeInputId = `bank-manual-code-${bankId}`;
  const titleInputId = `bank-manual-title-${bankId}`;
  const assetActions = {
    deleteAsset: deleteBankQuestionAsset.bind(null, bankId),
    ensureDraft: ensureBankQuestionDraftForUpload.bind(null, bankId),
    finalizeUpload: finalizeBankQuestionAssetUpload.bind(null, bankId),
    reserveUpload: reserveBankQuestionAssetUpload.bind(null, bankId),
    updateDisplay: updateBankQuestionAssetDisplay.bind(null, bankId),
  };
  const sourceFileActions = {
    cancelUpload: cancelBankQuestionSourceFileUpload.bind(null, bankId),
    createSignedUrl: createBankQuestionSourceFileSignedUrl.bind(null, bankId),
    deleteSourceFile: deleteBankQuestionSourceFile.bind(null, bankId),
    ensureDraft: ensureBankQuestionDraftForSourceUpload.bind(null, bankId),
    finalizeUpload: finalizeBankQuestionSourceFileUpload.bind(null, bankId),
    reserveUpload: reserveBankQuestionSourceFileUpload.bind(null, bankId),
  };

  return (
    <form action={createBankManualQuestionDraft} className="grid gap-4 md:grid-cols-2">
      <input name="bankId" type="hidden" value={bankId} />
      <input id={draftInputId} name="draft_id" type="hidden" />
      <input name="content_source" type="hidden" value="" />
      <input name="content_source_format" type="hidden" value="html" />
      <input name="solution_source" type="hidden" value="" />
      <input name="solution_source_format" type="hidden" value="html" />

      <div className="space-y-2">
        <Label htmlFor={codeInputId}>Code</Label>
        <Input
          id={codeInputId}
          maxLength={80}
          name="question_code"
          placeholder="LIB-Q-001"
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={titleInputId}>Title</Label>
        <Input
          id={titleInputId}
          maxLength={240}
          name="title"
          placeholder="Derivative practice"
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="bank-manual-difficulty">Difficulty 0–1000</Label>
        <Input
          defaultValue={500}
          id="bank-manual-difficulty"
          max={1000}
          min={0}
          name="difficulty_rating"
          required
          type="number"
        />
      </div>
      <QuestionAnswerFields defaultQuestionType="frq" />
      <div className="md:col-span-2">
        <QuestionHtmlEditor
          id="bank-manual-content"
          label="Question content"
          name="content_html"
          placeholder="<p>Write the question stem.</p>"
          required
        />
      </div>
      <div className="md:col-span-2">
        <QuestionHtmlEditor
          id="bank-manual-solution"
          label="Solution"
          name="solution_html"
          placeholder="<p>Write the worked solution.</p>"
        />
      </div>
      <div className="md:col-span-2">
        <TaxonomyTagTreePicker
          namePrefix="question_tax"
          selectable="assignable"
          taxonomyCatalog={taxonomyCatalog}
          title="Taxonomy tags"
        />
      </div>
      <div className="md:col-span-2">
        <QuestionAssetsPanel
          actions={assetActions}
          draftInputId={draftInputId}
          questionCodeInputId={codeInputId}
          titleInputId={titleInputId}
        />
      </div>
      <div className="md:col-span-2">
        <QuestionSourceFilesPanel
          actions={sourceFileActions}
          draftInputId={draftInputId}
          questionCodeInputId={codeInputId}
          titleInputId={titleInputId}
        />
      </div>
      <div className="md:col-span-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
        Saving creates a private Review Draft in this Library. It cannot be
        assigned until an owner or editor approves it.
      </div>
      <div className="md:col-span-2">
        <FormSubmitButton pendingLabel="Creating draft…">
          Create Review Draft
        </FormSubmitButton>
      </div>
    </form>
  );
}
