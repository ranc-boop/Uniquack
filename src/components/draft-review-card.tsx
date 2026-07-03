"use client";

import Link from "next/link";
import { useState } from "react";

import type { QuestionAssetView } from "@/app/admin/questions/asset-actions";
import type { QuestionSourceFileView } from "@/app/admin/questions/source-file-actions";
import {
  QuestionEditor,
  type EditableQuestion,
} from "@/components/question-editor";
import { AdminDebugDisclosure } from "@/components/admin/admin-debug-disclosure";
import { AdminStatusBadge } from "@/components/admin/admin-status-badge";
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
  aiImportBatchId?: string | null;
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

function shortId(value: string) {
  return value.slice(0, 8);
}

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
  aiImportBatchId,
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
    <Card className="overflow-hidden">
      <CardHeader className="border-b bg-muted/10">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            {selectionFormId ? (
              <input
                aria-label={`Select question ${questionCode}`}
                className="mt-1 size-4 shrink-0 rounded border"
                form={selectionFormId}
                name="question_id"
                type="checkbox"
                value={questionId}
              />
            ) : null}
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="font-mono" variant="outline">
                  {questionCode}
                </Badge>
                <AdminStatusBadge status={status} />
              </div>
              <CardTitle className="text-base leading-6">{title}</CardTitle>
              <p className="text-xs text-muted-foreground">
                Draft stays private until review; edit, publish, or reject
                explicitly.
              </p>
            </div>
          </div>
          <Button
            size="sm"
            variant={isEditorOpen ? "secondary" : "default"}
            onClick={() => setIsEditorOpen((open) => !open)}
          >
            {isEditorOpen ? "Close editor" : "Edit / Review"}
          </Button>
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
        {isAiImport ? (
          <div className="space-y-3 rounded-md border border-sky-200 bg-sky-50 p-3 text-sm text-sky-950">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-medium">AI import provenance</p>
              <Badge variant="outline">Draft-only</Badge>
              {aiWarnings.length ? (
                <Badge variant="outline">Warnings: {aiWarnings.length}</Badge>
              ) : null}
            </div>
            <div className="grid gap-2 text-xs text-sky-900/80 md:grid-cols-4">
              <p>Provider: {aiProviderName ?? "Unknown provider"}</p>
              <p>Model: {aiProviderModel ?? "Unknown model"}</p>
              <p>
                Source batch:{" "}
                {aiImportBatchId ? (
                  <Link
                    className="font-mono underline underline-offset-2"
                    href={`/admin/review?batch=${aiImportBatchId}`}
                  >
                    {shortId(aiImportBatchId)}
                  </Link>
                ) : (
                  "Unknown"
                )}
              </p>
              <p>Image crop refs: {aiCropCount}</p>
            </div>
            <p className="text-xs text-sky-900/80">
              Generated drafts stay private until readiness, taxonomy, media,
              and solution quality are checked.
            </p>
            {aiWarnings.length ? (
              <div className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
                <p className="font-medium">Warnings to review</p>
                <ul className="mt-1 list-disc space-y-1 pl-4">
                  {aiWarnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Taxonomy review
          </p>
          <div className="flex min-w-0 flex-wrap gap-1.5">
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
        </div>
        <div className="space-y-2 rounded-md border bg-muted/10 p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Publish readiness
          </p>
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
        </div>
        {hasImportedRefs ? (
          <p className="text-xs text-muted-foreground">
            Imported asset refs need manual media review before publish.
          </p>
        ) : null}
        {isAiImport ? (
          <AdminDebugDisclosure
            title="Source and AI import details"
            description="Provider, page, and import warning details are kept secondary so review actions stay primary."
          >
            <div className="space-y-3 text-muted-foreground">
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
          </AdminDebugDisclosure>
        ) : null}
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
