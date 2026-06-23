"use client";

import { useState } from "react";

import type { QuestionAssetView } from "@/app/admin/questions/asset-actions";
import type { QuestionSourceFileView } from "@/app/admin/questions/source-file-actions";
import {
  QuestionEditor,
  type EditableQuestion,
} from "@/components/question-editor";
import type { TaxonomyCatalogView } from "@/components/tags/taxonomy-tag-tree-picker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  countImportAssetReferences,
  type ImportAssetReferences,
} from "@/lib/batch-import/asset-references";
import type { QuestionReadiness } from "@/lib/questions/readiness";

type DraftReviewCardProps = {
  // Card display fields
  questionId: string;
  selectionFormId?: string;
  questionCode: string;
  title: string;
  status: string;
  questionType: string;
  difficultyRating: number;
  formattedCreatedAt: string;
  formattedImportedAt: string;
  tagNames: string[];
  draftTagCount: number;
  publishedTagCount: number;
  imageCount: number;
  sourceFileCount: number;
  importedAssetReferences: ImportAssetReferences | null;
  readiness: QuestionReadiness;
  // AI metadata (pre-computed strings/counts)
  isAiImport: boolean;
  aiProviderName: string | null;
  aiProviderModel: string | null;
  aiPageRefs: string[];
  aiCreatedTags: string[];
  aiWarnings: string[];
  aiCropCount: number;
  // QuestionEditor data
  editableQuestion: EditableQuestion;
  assets: QuestionAssetView[];
  returnTo?: string;
  selectedTaxonomyTagIds?: Partial<Record<string, string[]>>;
  sourceFiles: QuestionSourceFileView[];
  taxonomyCatalog?: TaxonomyCatalogView;
  updateAction: (formData: FormData) => void | Promise<void>;
};

function ImportedAssetReferenceBadges({
  refs,
}: {
  refs: ImportAssetReferences | null;
}) {
  if (!refs) {
    return <Badge variant="outline">No imported asset refs</Badge>;
  }

  const counts = countImportAssetReferences(refs);

  if (!counts.total) {
    return <Badge variant="outline">No imported asset refs</Badge>;
  }

  return (
    <>
      <Badge variant="secondary">Has imported asset refs</Badge>
      <Badge variant="outline">Needs media review</Badge>
      <Badge variant="outline">Image URLs: {counts.imageUrls}</Badge>
      <Badge variant="outline">PDF refs: {counts.sourceFileIds}</Badge>
      <Badge variant="outline">Asset refs: {counts.questionAssetIds}</Badge>
    </>
  );
}

export function DraftReviewCard({
  questionId,
  selectionFormId,
  questionCode,
  title,
  status,
  questionType,
  difficultyRating,
  formattedCreatedAt,
  formattedImportedAt,
  tagNames,
  draftTagCount,
  publishedTagCount,
  imageCount,
  sourceFileCount,
  importedAssetReferences,
  readiness,
  isAiImport,
  aiProviderName,
  aiProviderModel,
  aiPageRefs,
  aiCreatedTags,
  aiWarnings,
  aiCropCount,
  editableQuestion,
  assets,
  returnTo,
  selectedTaxonomyTagIds,
  sourceFiles,
  taxonomyCatalog,
  updateAction,
}: DraftReviewCardProps) {
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const hasImportedRefs =
    importedAssetReferences &&
    countImportAssetReferences(importedAssetReferences).total > 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            {selectionFormId ? (
              <input
                aria-label={`Select question ${questionCode}`}
                className="mt-1 size-4 rounded border"
                form={selectionFormId}
                name="question_id"
                type="checkbox"
                value={questionId}
              />
            ) : null}
            <div>
              <CardTitle className="text-base">{questionCode}</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">{title}</p>
            </div>
          </div>
          <Badge variant="secondary">{status}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2 text-sm md:grid-cols-4">
          <div>
            <p className="text-xs text-muted-foreground">Type</p>
            <p>{questionType}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Difficulty</p>
            <p>{difficultyRating}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Created</p>
            <p>{formattedCreatedAt}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Imported</p>
            <p>{formattedImportedAt}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-1">
          {draftTagCount ? (
            <Badge variant="outline">
              Needs tag review: {draftTagCount} draft
            </Badge>
          ) : null}
          {tagNames.length ? (
            tagNames.map((tagName) => (
              <Badge key={tagName} variant="outline">
                {tagName}
              </Badge>
            ))
          ) : (
            <Badge variant="outline">No tags</Badge>
          )}
          {publishedTagCount ? (
            <Badge variant="secondary">
              Published tags: {publishedTagCount}
            </Badge>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant={readiness.isReady ? "secondary" : "outline"}>
            {readiness.summaryLabel}
          </Badge>
          <Badge variant={readiness.hasContent ? "secondary" : "outline"}>
            {readiness.hasContent ? "Has content" : "Needs content"}
          </Badge>
          <Badge variant={readiness.hasSolution ? "secondary" : "outline"}>
            {readiness.hasSolution ? "Has solution" : "Needs solution"}
          </Badge>
          <Badge variant={readiness.hasTags ? "secondary" : "outline"}>
            {readiness.hasTags ? "Has tags" : "Needs tags"}
          </Badge>
          <Badge variant={readiness.hasDifficulty ? "secondary" : "outline"}>
            {readiness.hasDifficulty ? "Has difficulty" : "Needs difficulty"}
          </Badge>
          <Badge variant="outline">Images: {imageCount}</Badge>
          <Badge variant="outline">PDF source files: {sourceFileCount}</Badge>
          <ImportedAssetReferenceBadges refs={importedAssetReferences} />
        </div>
        {hasImportedRefs ? (
          <p className="text-xs text-muted-foreground">
            Imported asset refs need manual media review before publish.
          </p>
        ) : null}
        {isAiImport ? (
          <div className="space-y-2 rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">AI PDF import</Badge>
              <Badge variant="outline">
                {aiProviderName ?? "Unknown provider"}
              </Badge>
              <Badge variant="outline">
                {aiProviderModel ?? "Unknown model"}
              </Badge>
            </div>
            <p>
              Pages: {aiPageRefs.length ? aiPageRefs.join(", ") : "Unknown"}
              {" | "}
              Image crop refs: {aiCropCount}
            </p>
            {aiCreatedTags.length ? (
              <p>Created draft tags: {aiCreatedTags.join(", ")}</p>
            ) : null}
            {aiWarnings.length ? (
              <div className="rounded-md border border-amber-300 bg-amber-50 p-2 text-amber-900">
                <p className="font-medium">AI/import warnings</p>
                <ul className="mt-1 list-disc space-y-1 pl-4">
                  {aiWarnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}
        <div>
          <Button
            size="sm"
            variant={isEditorOpen ? "secondary" : "default"}
            onClick={() => setIsEditorOpen((open) => !open)}
          >
            {isEditorOpen ? "Close editor" : "Edit question"}
          </Button>
        </div>
        {isEditorOpen ? (
          <QuestionEditor
            action={updateAction}
            assets={assets}
            importedAssetReferences={importedAssetReferences}
            question={editableQuestion}
            readiness={readiness}
            returnTo={returnTo}
            selectedTaxonomyTagIds={selectedTaxonomyTagIds}
            sourceFiles={sourceFiles}
            taxonomyCatalog={taxonomyCatalog}
          />
        ) : null}
      </CardContent>
    </Card>
  );
}
