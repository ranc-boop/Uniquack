"use client";

import {
  updateQuestion,
} from "@/app/admin/questions/actions";
import type { QuestionAssetView } from "@/app/admin/questions/asset-actions";
import type { QuestionSourceFileView } from "@/app/admin/questions/source-file-actions";
import { FormSubmitButton } from "@/components/form-submit-button";
import { QuestionAssetsPanel } from "@/components/question-assets-panel";
import { QuestionHtmlEditor } from "@/components/question-html-editor";
import { QuestionSourceFilesPanel } from "@/components/question-source-files-panel";
import { QuestionStatusSelect } from "@/components/question-status-select";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  countImportAssetReferences,
  type ImportAssetReferences,
} from "@/lib/batch-import/asset-references";
import type { QuestionSourceFormat } from "@/lib/markdown-latex/markdown";
import type { QuestionReadiness } from "@/lib/questions/readiness";
import { useState } from "react";

type EditableQuestion = {
  content_html: string;
  content_source: string | null;
  content_source_format: QuestionSourceFormat | null;
  difficulty_rating: number;
  id: string;
  question_code: string;
  question_type: string;
  solution_html: string | null;
  solution_source: string | null;
  solution_source_format: QuestionSourceFormat | null;
  status: string;
  title: string;
};

type AdminQuestionEditDetailsProps = {
  assets?: QuestionAssetView[];
  importedAssetReferences: ImportAssetReferences | null;
  question: EditableQuestion;
  readiness: QuestionReadiness;
  sourceFiles?: QuestionSourceFileView[];
};

function ImportedAssetReferencesReview({
  refs,
}: {
  refs: ImportAssetReferences;
}) {
  const counts = countImportAssetReferences(refs);

  return (
    <div className="space-y-3 rounded-md border bg-muted/20 p-3 text-sm">
      <div>
        <p className="font-medium">Imported asset references</p>
        <p className="text-xs text-muted-foreground">
          Preserved from Batch Import v2 for review only. These refs are not
          downloaded, uploaded, or automatically attached yet.
        </p>
      </div>
      <div className="grid gap-2 md:grid-cols-3">
        <div className="rounded-md border bg-background p-2">
          <p className="font-medium">{counts.imageUrls}</p>
          <p className="text-xs text-muted-foreground">Image URLs</p>
        </div>
        <div className="rounded-md border bg-background p-2">
          <p className="font-medium">{counts.sourceFileIds}</p>
          <p className="text-xs text-muted-foreground">Source file refs</p>
        </div>
        <div className="rounded-md border bg-background p-2">
          <p className="font-medium">{counts.questionAssetIds}</p>
          <p className="text-xs text-muted-foreground">Question asset refs</p>
        </div>
      </div>
      <div className="space-y-2 text-xs text-muted-foreground">
        <div>
          <p className="font-medium text-foreground">Image URLs</p>
          {refs.imageUrls.length ? (
            <ul className="mt-1 space-y-1">
              {refs.imageUrls.map((url) => (
                <li key={url} className="break-all">
                  {url}
                </li>
              ))}
            </ul>
          ) : (
            <p>None</p>
          )}
        </div>
        <div>
          <p className="font-medium text-foreground">Source file IDs</p>
          {refs.sourceFileIds.length ? (
            <ul className="mt-1 space-y-1">
              {refs.sourceFileIds.map((id) => (
                <li key={id} className="break-all font-mono">
                  {id}
                </li>
              ))}
            </ul>
          ) : (
            <p>None</p>
          )}
        </div>
        <div>
          <p className="font-medium text-foreground">Question asset IDs</p>
          {refs.questionAssetIds.length ? (
            <ul className="mt-1 space-y-1">
              {refs.questionAssetIds.map((id) => (
                <li key={id} className="break-all font-mono">
                  {id}
                </li>
              ))}
            </ul>
          ) : (
            <p>None</p>
          )}
        </div>
      </div>
    </div>
  );
}

function PublishReadinessBox({
  imageCount,
  importedAssetReferences,
  readiness,
  sourceFileCount,
}: {
  imageCount: number;
  importedAssetReferences: ImportAssetReferences | null;
  readiness: QuestionReadiness;
  sourceFileCount: number;
}) {
  const importedRefCount = importedAssetReferences
    ? countImportAssetReferences(importedAssetReferences).total
    : 0;

  return (
    <div className="space-y-3 rounded-md border bg-muted/20 p-3 text-sm">
      <div>
        <p className="font-medium">Publish readiness</p>
        <p className="text-xs text-muted-foreground">
          Soft checks only. RLS still controls real access, and publishing is not
          blocked by this warning.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Badge variant={readiness.isReady ? "secondary" : "outline"}>
          {readiness.isReady ? "Ready to publish" : "Needs review"}
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
        {readiness.hasImportedAssetRefs ? (
          <>
            <Badge variant="secondary">Has imported asset refs</Badge>
            <Badge variant="outline">Needs media review</Badge>
          </>
        ) : (
          <Badge variant="outline">No imported asset refs</Badge>
        )}
      </div>
      {readiness.missingLabels.length || readiness.warningLabels.length ? (
        <p className="text-xs text-muted-foreground">
          Review:{" "}
          {[...readiness.missingLabels, ...readiness.warningLabels].join(", ")}
          {importedRefCount ? ` (${importedRefCount} imported refs)` : ""}.
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          Basic readiness checks pass.
        </p>
      )}
    </div>
  );
}

export function AdminQuestionEditDetails({
  assets = [],
  importedAssetReferences,
  question,
  readiness,
  sourceFiles = [],
}: AdminQuestionEditDetailsProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <details onToggle={(event) => setIsOpen(event.currentTarget.open)}>
      <summary className="cursor-pointer text-sm font-medium">
        Edit question
      </summary>
      {isOpen ? (
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
            <Input name="title" defaultValue={question.title} required />
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
            <QuestionStatusSelect
              defaultValue={question.status}
              isReadyToPublish={readiness.isReady}
            />
          </div>
          <div className="lg:col-span-2">
            <PublishReadinessBox
              imageCount={assets.length}
              importedAssetReferences={importedAssetReferences}
              readiness={readiness}
              sourceFileCount={sourceFiles.length}
            />
          </div>
          <div className="space-y-1 lg:col-span-2">
            <QuestionHtmlEditor
              id={`content_html_${question.id}`}
              label="Content HTML"
              name="content_html"
              defaultSource={question.content_source}
              defaultSourceFormat={question.content_source_format}
              defaultValue={question.content_html}
              required
            />
          </div>
          <div className="space-y-1 lg:col-span-2">
            <QuestionHtmlEditor
              id={`solution_html_${question.id}`}
              label="Solution HTML"
              name="solution_html"
              defaultSource={question.solution_source}
              defaultSourceFormat={question.solution_source_format}
              defaultValue={question.solution_html ?? ""}
            />
          </div>
          {importedAssetReferences ? (
            <div className="lg:col-span-2">
              <ImportedAssetReferencesReview refs={importedAssetReferences} />
            </div>
          ) : null}
          <div className="lg:col-span-2">
            <QuestionAssetsPanel questionId={question.id} initialAssets={assets} />
          </div>
          <div className="lg:col-span-2">
            <QuestionSourceFilesPanel
              questionId={question.id}
              initialSourceFiles={sourceFiles}
            />
          </div>
          <div className="lg:col-span-2">
            <FormSubmitButton size="sm" pendingLabel="Saving...">
              Save question
            </FormSubmitButton>
          </div>
        </form>
      ) : null}
    </details>
  );
}
