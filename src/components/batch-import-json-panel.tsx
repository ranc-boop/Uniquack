"use client";

import { LoaderCircle } from "lucide-react";
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
  const [jsonText, setJsonText] = useState(starterJson);
  const [preview, setPreview] = useState<BatchImportPreview | null>(null);
  const [summary, setSummary] = useState<BatchImportSummary | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [importing, setImporting] = useState(false);

  async function previewImport() {
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
    setImporting(true);

    try {
      const result = await importManualJsonDrafts({ jsonText });
      setSummary(result);
      toast.success(`${result.createdCount} draft question(s) imported.`);
      const refreshedPreview = await previewManualJsonImport({ jsonText });
      setPreview(refreshedPreview);
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
          onChange={(event) => setJsonText(event.target.value)}
          className="min-h-[520px] font-mono text-sm"
          spellCheck={false}
        />
        <div className="flex flex-wrap gap-2">
          <Button type="button" disabled={previewing} onClick={previewImport}>
            {previewing ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : null}
            Validate preview
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={importing || !preview?.validCount}
            onClick={importDrafts}
          >
            {importing ? <LoaderCircle className="size-4 animate-spin" /> : null}
            Import valid drafts
          </Button>
        </div>
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

        {summary ? (
          <div className="space-y-2 rounded-md border p-3 text-sm">
            <p className="font-medium">Import summary</p>
            <p>Created: {summary.createdCount}</p>
            <p>Skipped: {summary.skippedCount}</p>
            <p>Errors: {summary.errorCount}</p>
            <p>Batch: {summary.batchId}</p>
          </div>
        ) : null}
      </aside>
    </div>
  );
}
