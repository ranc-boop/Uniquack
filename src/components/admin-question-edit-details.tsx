import { updateQuestion } from "@/app/admin/questions/actions";
import type { QuestionAssetView } from "@/app/admin/questions/asset-actions";
import type { QuestionSourceFileView } from "@/app/admin/questions/source-file-actions";
import {
  QuestionEditor,
  type EditableQuestion,
} from "@/components/question-editor";
import type { TaxonomyCatalogView } from "@/components/tags/taxonomy-tag-tree-picker";
import type { ImportAssetReferences } from "@/lib/batch-import/asset-references";
import type { QuestionReadiness } from "@/lib/questions/readiness";

type SelectedTaxonomyTagMap = Partial<Record<string, string[]>>;

type AdminQuestionEditDetailsProps = {
  assets?: QuestionAssetView[];
  defaultOpen?: boolean;
  importedAssetReferences: ImportAssetReferences | null;
  question: EditableQuestion;
  readiness: QuestionReadiness;
  returnTo?: string;
  selectedTaxonomyTagIds?: SelectedTaxonomyTagMap;
  sourceFiles?: QuestionSourceFileView[];
  taxonomyCatalog: TaxonomyCatalogView;
};

export function AdminQuestionEditDetails({
  assets,
  defaultOpen = false,
  importedAssetReferences,
  question,
  readiness,
  returnTo,
  selectedTaxonomyTagIds = {},
  sourceFiles,
  taxonomyCatalog,
}: AdminQuestionEditDetailsProps) {
  return (
    <QuestionEditor
      action={updateQuestion}
      assets={assets}
      defaultOpen={defaultOpen}
      importedAssetReferences={importedAssetReferences}
      question={question}
      readiness={readiness}
      returnTo={returnTo}
      selectedTaxonomyTagIds={selectedTaxonomyTagIds}
      sourceFiles={sourceFiles}
      taxonomyCatalog={taxonomyCatalog}
    />
  );
}
