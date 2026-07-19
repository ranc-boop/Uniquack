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
    return <Badge title="No imported files or media references" variant="outline">No media refs</Badge>;
  }

  const counts = countImportAssetReferences(refs);

  if (!counts.total) {
    return <Badge title="No imported files or media references" variant="outline">No media refs</Badge>;
  }

  const title = [
    `${counts.total} imported media reference${counts.total === 1 ? "" : "s"}`,
    `image URLs ${counts.imageUrls}`,
    `PDF refs ${counts.sourceFileIds}`,
    `asset refs ${counts.questionAssetIds}`,
  ].join(" · ");

  return <Badge title={title} variant="outline">Media review · {counts.total}</Badge>;
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
                <AdminStatusBadge compact={false} status={status} />
              </div>
              <CardTitle className="text-base leading-6">{title}</CardTitle>
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
        <div className="flex flex-wrap items-center gap-2" aria-label="Question metadata">
          <Badge title="Question type" variant="outline">{questionType}</Badge>
          <Badge title="Difficulty rating" variant="outline">Difficulty {difficultyRating}</Badge>
          <Badge title={`Created ${formattedCreatedAt}`} variant="outline">Created</Badge>
          <Badge title={`Imported ${formattedImportedAt}`} variant="outline">Imported</Badge>
        </div>
        {isAiImport ? (
          <div className="space-y-2 rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm text-sky-950">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-medium">AI import</p>
              <span className="sr-only">AI import provenance</span>
              <span className="sr-only">Generated drafts stay private until reviewed.</span>
              <AdminStatusBadge status="draft" />
              {aiWarnings.length ? (
                <Badge title="Open import metadata to review warning details" variant="outline">Warnings {aiWarnings.length}</Badge>
              ) : null}
              {aiImportBatchId ? (
                <Link
                  className="ml-auto text-xs font-medium underline underline-offset-2"
                  href={`/admin/review?batch=${aiImportBatchId}`}
                >
                  Batch {shortId(aiImportBatchId)}
                </Link>
              ) : null}
            </div>
            <details className="rounded-md border border-sky-200/80 bg-white/50 px-2 py-1.5">
              <summary className="cursor-pointer text-xs font-medium text-sky-900">
                Import metadata
              </summary>
              <div className="mt-2 grid gap-2 text-xs text-sky-900/80 sm:grid-cols-3">
                <span title="Configured AI provider">{aiProviderName ?? "Unknown provider"}</span>
                <span title="Configured model">{aiProviderModel ?? "Unknown model"}</span>
                <span title="Image crop references">{aiCropCount} crop refs</span>
              </div>
              {aiWarnings.length ? (
                <div className="mt-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
                  <p className="font-medium">Warnings to review</p>
                  <ul className="mt-1 list-disc space-y-1 pl-4">
                    {aiWarnings.map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </details>
          </div>
        ) : null}
        <section className="space-y-2 rounded-lg border p-3" aria-labelledby={`taxonomy-${questionId}`}>
          <h3 id={`taxonomy-${questionId}`} className="text-sm font-medium">Taxonomy</h3>
          <span className="sr-only">Taxonomy review</span>
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
        </section>
        <section className="space-y-2 rounded-lg border bg-muted/10 p-3" aria-labelledby={`readiness-${questionId}`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 id={`readiness-${questionId}`} className="text-sm font-medium">Publish readiness</h3>
            <Badge title={readiness.summaryLabel} variant={readiness.isReady ? "secondary" : "outline"}>
              {readiness.isReady ? "Ready" : "Needs review"}
            </Badge>
          </div>
          <details>
            <summary className="cursor-pointer text-xs font-medium text-muted-foreground">Readiness checks</summary>
            <div className="mt-2 flex flex-wrap gap-2">
              <Badge variant={readiness.hasContent ? "secondary" : "outline"}>{readiness.hasContent ? "Content" : "Needs content"}</Badge>
              <Badge variant={readiness.hasSolution ? "secondary" : "outline"}>{readiness.hasSolution ? "Solution" : "Needs solution"}</Badge>
              <Badge variant={readiness.hasTags ? "secondary" : "outline"}>{readiness.hasTags ? "Tags" : "Needs tags"}</Badge>
              <Badge variant={readiness.hasDifficulty ? "secondary" : "outline"}>{readiness.hasDifficulty ? "Difficulty" : "Needs difficulty"}</Badge>
              <Badge title="Question images" variant="outline">Images {imageCount}</Badge>
              <Badge title="PDF source files" variant="outline">PDF {sourceFileCount}</Badge>
              <ImportedAssetReferenceBadges refs={importedAssetReferences} />
            </div>
          </details>
        </section>
        {isAiImport ? (
          <AdminDebugDisclosure
            title="Source and AI import details"
          >
            <div className="space-y-3 text-muted-foreground">
              <p>
                Pages: {aiPageRefs.length ? aiPageRefs.join(", ") : "Unknown"}
                {" | "}
                Image crop refs: {aiCropCount}
              </p>
              {aiCreatedTags.length ? (
                <p>Created draft tags: {aiCreatedTags.join(", ")}</p>
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
