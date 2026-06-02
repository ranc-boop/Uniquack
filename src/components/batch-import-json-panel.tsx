"use client";

import { LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import {
  importManualJsonDrafts,
  previewManualJsonImport,
} from "@/app/admin/imports/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { BatchImportPreview } from "@/lib/batch-import/json";
import type { BatchImportSummary } from "@/lib/batch-import/service";

const starterJson = JSON.stringify(
  {
    questions: [
      {
        code: "AP-PHYS-IMPORT-001",
        title: "Imported draft FRQ",
        type: "frq",
        difficulty: 520,
        tag_names: ["AP Physics"],
        content_html: "<p>Question stem goes here.</p>",
        solution_html: "<p>Solution notes go here.</p>",
        image_urls: [],
        source_file_ids: [],
        question_asset_ids: [],
        video_url: "",
        embed_url: "",
      },
    ],
  },
  null,
  2,
);

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Import failed.";
}

export function BatchImportJsonPanel() {
  const router = useRouter();
  const [jsonText, setJsonText] = useState("");
  const [preview, setPreview] = useState<BatchImportPreview | null>(null);
  const [summary, setSummary] = useState<BatchImportSummary | null>(null);
  const [showExample, setShowExample] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [importing, setImporting] = useState(false);

  function updateJsonText(value: string) {
    setJsonText(value);
    setSummary(null);
  }

  async function previewImport() {
    if (!jsonText.trim()) {
      toast.error("Paste JSON before validating.");
      return;
    }

    setPreviewing(true);
    setSummary(null);

    try {
      const result = await previewManualJsonImport({ jsonText });
      setPreview(result);
      toast.success("Import preview ready.");
    } catch (error) {
      setPreview(null);
      toast.error(errorMessage(error));
    } finally {
      setPreviewing(false);
    }
  }

  async function importDrafts() {
    if (!jsonText.trim()) {
      toast.error("Paste JSON before importing.");
      return;
    }

    setImporting(true);

    try {
      const result = await importManualJsonDrafts({ jsonText });
      setSummary(result);
      setJsonText("");
      setPreview(null);
      router.refresh();
      toast.success(
        `Imported ${result.createdCount} draft question(s) successfully.`,
      );
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="space-y-3">
        <Textarea
          value={jsonText}
          onChange={(event) => updateJsonText(event.target.value)}
          className="min-h-[520px] font-mono text-sm"
          placeholder='Paste JSON here. Example: { "questions": [{ "code": "AP-CALC-001", "title": "Limits FRQ", "content_html": "<p>...</p>", "tag_names": ["AP Calculus"] }] }'
          spellCheck={false}
        />
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            disabled={previewing || !jsonText.trim()}
            onClick={previewImport}
          >
            {previewing ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : null}
            Validate preview
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={importing || !preview?.validCount || !jsonText.trim()}
            onClick={importDrafts}
          >
            {importing ? <LoaderCircle className="size-4 animate-spin" /> : null}
            Import valid drafts
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => setShowExample((current) => !current)}
          >
            {showExample ? "Hide example JSON" : "Show example JSON"}
          </Button>
        </div>
        {showExample ? (
          <div className="rounded-md border bg-muted/20 p-3">
            <p className="text-sm font-medium">Example format</p>
            <pre className="mt-2 max-h-80 overflow-auto rounded-md bg-background p-3 text-xs">
              {starterJson}
            </pre>
          </div>
        ) : null}
      </div>

      <aside className="space-y-4">
        <div className="rounded-md border p-3">
          <p className="text-sm font-medium">Rules</p>
          <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
            <li>Questions are always imported as drafts.</li>
            <li>Tags must already exist by slug or name.</li>
            <li>Unsafe HTML is sanitized before saving.</li>
            <li>Image and video URL fields are preserved for review only.</li>
          </ul>
        </div>
        <div className="rounded-md border p-3">
          <p className="text-sm font-medium">Future asset path</p>
          <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
            <li>Batch Import v1 accepts structured JSON only.</li>
            <li>Binary uploads stay in the image and source-file panels.</li>
            <li>
              Reserved fields: image_urls, source_file_ids, question_asset_ids.
            </li>
            <li>
              Future AI/package imports can produce normalized JSON for this
              same preview and draft-review flow.
            </li>
          </ul>
        </div>

        {summary ? (
          <div className="space-y-3 rounded-md border p-3 text-sm">
            <div>
              <p className="font-medium">Import completed</p>
              <p className="mt-1 text-xs text-muted-foreground">
                All imported questions are saved as Draft and can be reviewed in
                Admin Questions.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div className="rounded-md border p-2">
                <p className="font-medium">{summary.createdCount}</p>
                <p className="text-muted-foreground">Created</p>
              </div>
              <div className="rounded-md border p-2">
                <p className="font-medium">{summary.skippedCount}</p>
                <p className="text-muted-foreground">Skipped</p>
              </div>
              <div className="rounded-md border p-2">
                <p className="font-medium">{summary.errorCount}</p>
                <p className="text-muted-foreground">Errors</p>
              </div>
            </div>
            {summary.createdQuestions.length ? (
              <div className="space-y-2">
                <p className="text-xs font-medium">Created drafts</p>
                <div className="space-y-1">
                  {summary.createdQuestions.map((question) => (
                    <div
                      key={question.id}
                      className="rounded-md border px-2 py-1 text-xs"
                    >
                      <p className="font-mono">{question.questionCode}</p>
                      <p className="text-muted-foreground">{question.title}</p>
                    </div>
                  ))}
                </div>
                <Button asChild size="sm" variant="outline">
                  <Link href="/admin/questions">Review in Questions</Link>
                </Button>
              </div>
            ) : null}
            <p className="break-all text-xs text-muted-foreground">
              Batch: {summary.batchId}
            </p>
          </div>
        ) : null}

        {preview ? (
          <div className="space-y-3 rounded-md border p-3">
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">{preview.validCount} valid</Badge>
              <Badge variant="outline">{preview.invalidCount} invalid</Badge>
              <Badge variant="outline">{preview.duplicateCount} duplicate</Badge>
              <Badge variant="outline">{preview.unknownTagCount} unknown tag</Badge>
            </div>
            <div className="max-h-[420px] space-y-2 overflow-auto">
              {preview.items.map((item) => (
                <div key={item.index} className="rounded-md border p-2 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">Item {item.index + 1}</span>
                    <Badge variant={item.normalized ? "secondary" : "outline"}>
                      {item.normalized ? "valid" : "invalid"}
                    </Badge>
                  </div>
                  {item.normalized ? (
                    <div className="mt-2 space-y-1 text-muted-foreground">
                      <p>{item.normalized.question_code}</p>
                      <p>{item.normalized.title}</p>
                      <p>Tags: {item.normalized.tag_ids.length}</p>
                    </div>
                  ) : null}
                  {item.errors.length ? (
                    <ul className="mt-2 space-y-1 text-destructive">
                      {item.errors.map((error) => (
                        <li key={error}>{error}</li>
                      ))}
                    </ul>
                  ) : null}
                  {item.warnings.length ? (
                    <ul className="mt-2 space-y-1 text-muted-foreground">
                      {item.warnings.map((warning) => (
                        <li key={warning}>{warning}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </aside>
    </div>
  );
}
