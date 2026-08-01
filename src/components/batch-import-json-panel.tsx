"use client";

import { LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { FeedbackText } from "@/components/math-content";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  countImportAssetReferences,
  extractImportAssetReferences,
  type ImportAssetReferences,
} from "@/lib/batch-import/asset-references";
import type { BatchImportPreview } from "@/lib/batch-import/json";
import type { BatchImportSummary } from "@/lib/batch-import/service";
import type {
  QuestionWorkspaceCapabilities,
  QuestionWorkspaceScope,
} from "@/lib/questions/workspace";

export type JsonImportPreviewAction = (input: {
  jsonText: string;
}) => Promise<BatchImportPreview>;

export type JsonImportCommitAction = (input: {
  jsonText: string;
}) => Promise<BatchImportSummary>;

type BatchImportJsonPanelProps = {
  capabilities: QuestionWorkspaceCapabilities;
  importAction: JsonImportCommitAction;
  previewAction: JsonImportPreviewAction;
  questionsHref: string;
  resultDescription: string;
  reviewHref: string;
  scope: QuestionWorkspaceScope;
  scopeLabel: string;
  tagIds?: string[];
};

const starterJson = JSON.stringify(
  {
    questions: [
      {
        code: "AP-CALC-IMPORT-001",
        title: "Derivative local minimum",
        type: "fill_blank",
        difficulty: 520,
        tag_ids: ["math.curriculum.ap.ap_calculus_ab"],
        content_html: "<p>If $f'(x)=1+2x-x^3$, then $f$ has a local minimum at $x=$ ____.</p>",
        solution_html: "<p>Solve $f'(x)=0$ and use the first derivative test.</p>",
        answer_spec: {
          kind: "fill_blank",
          final_answers: ["2"],
          accepted_answers: ["2", "x=2"],
          equivalence: "math",
          case_sensitive: false,
        },
      },
      {
        code: "AP-CALC-IMPORT-002",
        title: "Limit from graph",
        type: "mcq",
        difficulty: 430,
        tag_ids: ["math.curriculum.ap.ap_calculus_ab"],
        content_html: "<p>What is $\\lim_{x\\to 2} f(x)$?</p>",
        solution_html: "<p>Read the y-value approached from both sides.</p>",
        options: [
          { id: "A", label: "A", content_html: "1" },
          { id: "B", label: "B", content_html: "2" },
          { id: "C", label: "C", content_html: "Does not exist" },
        ],
        answer_spec: {
          kind: "mcq",
          correct_option_ids: ["B"],
          allow_multiple: false,
        },
      },
    ],
  },
  null,
  2,
);

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Import failed.";
}

function AssetReferenceSummary({
  refs,
  showValues = false,
}: {
  refs: ImportAssetReferences;
  showValues?: boolean;
}) {
  const counts = countImportAssetReferences(refs);

  if (!counts.total) {
    return (
      <p className="text-xs text-muted-foreground">
        No asset references included.
      </p>
    );
  }

  return (
    <div className="space-y-2 text-xs">
      <div className="grid grid-cols-3 gap-1">
        <div className="rounded-md border p-1.5">
          <p className="font-medium">{counts.imageUrls}</p>
          <p className="text-muted-foreground">Image URLs</p>
        </div>
        <div className="rounded-md border p-1.5">
          <p className="font-medium">{counts.sourceFileIds}</p>
          <p className="text-muted-foreground">Source refs</p>
        </div>
        <div className="rounded-md border p-1.5">
          <p className="font-medium">{counts.questionAssetIds}</p>
          <p className="text-muted-foreground">Asset refs</p>
        </div>
      </div>
      {showValues ? (
        <div className="space-y-1 text-muted-foreground">
          {refs.imageUrls.length ? (
            <p className="break-all">Image URLs: {refs.imageUrls.join(", ")}</p>
          ) : null}
          {refs.sourceFileIds.length ? (
            <p className="break-all">
              Source file refs: {refs.sourceFileIds.join(", ")}
            </p>
          ) : null}
          {refs.questionAssetIds.length ? (
            <p className="break-all">
              Question asset refs: {refs.questionAssetIds.join(", ")}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function firstTag(tagIds: string[], includes: string[]) {
  return tagIds.find((tagId) =>
    includes.every((part) => tagId.includes(part)),
  );
}

function completeExampleJson(tagIds: string[]) {
  const exampleTagIds = Array.from(
    new Set(
      [
        firstTag(tagIds, ["curriculum", "ap"]),
        firstTag(tagIds, ["curriculum", "sat"]),
        firstTag(tagIds, ["curriculum", "common_core"]),
        firstTag(tagIds, ["concept", "calculus"]),
        firstTag(tagIds, ["concept", "derivative"]),
        firstTag(tagIds, ["method"]),
        firstTag(tagIds, ["task"]),
        firstTag(tagIds, ["form", "fill"]),
        firstTag(tagIds, ["form"]),
      ].filter((tagId): tagId is string => Boolean(tagId)),
    ),
  ).slice(0, 9);

  return JSON.stringify(
    {
      questions: [
        {
          code: "AI-GENERATED-001",
          title: "Derivative local minimum",
          type: "fill_blank",
          difficulty: 560,
          tag_ids: exampleTagIds,
          content_html:
            "<p>If $f'(x)=1+2x-x^3$, then $f$ has a local minimum at $x=$ ____.</p>",
          solution_html:
            "<p>Set $f'(x)=0$ and use a first derivative sign test to identify the local minimum.</p>",
          answer_spec: {
            kind: "fill_blank",
            final_answers: ["2"],
            accepted_answers: ["2", "x=2"],
            equivalence: "math",
            case_sensitive: false,
          },
        },
      ],
    },
    null,
    2,
  );
}

function buildAiJsonPrompt(tagIds: string[]) {
  const tagText = tagIds.join(", ") || "(none)";

  return [
    "Role: You are an O2I question-bank authoring assistant. The user will next describe the questions they want. Generate import-ready JSON for the O2I manual JSON import tool.",
    "Return JSON only. Do not wrap it in markdown. Do not add commentary before or after the JSON.",
    "Goal: create high-quality draft questions that can be reviewed by an admin and later used by an Agent recommendation and grading system.",
    "Required output shape and examples:",
    starterJson,
    "Complete example with multi-tag coverage. This example uses tag IDs from the allowed list when matching IDs are available; imitate the coverage style, not the exact topic:",
    completeExampleJson(tagIds),
    "Required schema rules:",
    "- Output {\"questions\":[...]} only.",
    "- Use type as one of mcq, fill_blank, frq, mixed.",
    "- MCQ must include options and answer_spec.correct_option_ids. Options use {id,label,content_html}; correct_option_ids must match option IDs exactly.",
    "- Fill blank must include answer_spec.kind='fill_blank' plus final_answers or accepted_answers. Put equivalent accepted forms when useful.",
    "- For FRQ/mixed, keep JSON simple. Omit answer_spec unless the user explicitly asks for grading metadata.",
    "- Keep title short, plain text, no HTML, no Markdown, no LaTeX, and not the full question stem.",
    "- content_html and solution_html should be sanitized-friendly HTML strings. Use simple paragraphs, lists, and tables when needed.",
    "- Wrap every math variable, expression, equation, and formula in $...$ inside content_html, solution_html, and option content_html so the renderer can detect it.",
    "- Examples: write <p>Solve $x^2-4=0$.</p>, not <p>Solve x^2-4=0.</p>. Write <p>The derivative is $f'(x)$.</p>, not plain f'(x).",
    "Tagging method:",
    "- Use tag_ids only from the allowed active assignable tag_id list below. Never invent, abbreviate, rename, or output labels instead of IDs.",
    "- Tag generously but accurately. Most questions should have several tags, not just one.",
    "- Try to cover at least 4 taxonomy facets when matching tags exist: curriculum, concept, method, task, and form/difficulty.",
    "- Curriculum is especially important. Include every accurate curriculum tag from the allowed list, even when multiple systems apply to the same question, such as AP, SAT, BC, Common Core, IB, A-Level, course/unit, or exam-topic tags.",
    "- Concept tags should describe the core math idea. Method tags should describe the solving technique. Task tags should describe what the student does. Form tags should describe item format such as multiple choice, fill blank, or free response.",
    "- Prefer specific leaf tags over broad parent-like tags when both are available.",
    "- Reuse tag_ids freely. Many generated questions can share the same curriculum, concept, method, task, or form tags.",
    "- If fewer than 4 facets fit accurately, use only the accurate tags and do not force weak tags.",
    "Answer rules:",
    "- Do not invent hidden answers for FRQ. For ordinary FRQ/mixed questions, no answer_spec is needed.",
    "- For MCQ and fill_blank, include answer_spec when the answer is defined by the generated question.",
    "- For fill_blank, include common equivalent forms in accepted_answers, for example ['2','x=2','\\\\frac{4}{2}'] when those are mathematically appropriate.",
    "- Use numeric_tolerance for decimal/numeric answers where rounding is expected.",
    "Do not include asset/image/PDF fields:",
    "- Do not output image_urls, image_files, source_file_ids, source_files, question_asset_ids, video_url, embed_url, bbox, asset_placeholders, page_refs, or PDF chunk fields.",
    "Allowed active assignable tag_ids:",
    tagText,
  ].join("\n\n");
}

export function BatchImportJsonPanel({
  capabilities,
  importAction,
  previewAction,
  questionsHref,
  resultDescription,
  reviewHref,
  scope,
  scopeLabel,
  tagIds = [],
}: BatchImportJsonPanelProps) {
  const isReadOnly = !capabilities.canImport;
  const router = useRouter();
  const [jsonText, setJsonText] = useState("");
  const [preview, setPreview] = useState<BatchImportPreview | null>(null);
  const [summary, setSummary] = useState<BatchImportSummary | null>(null);
  const [showExample, setShowExample] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [importing, setImporting] = useState(false);
  const aiJsonPrompt = buildAiJsonPrompt(tagIds);

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
      const result = await previewAction({ jsonText });
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
      const result = await importAction({ jsonText });
      setSummary(result);
      setJsonText("");
      setPreview(null);
      router.refresh();
      if (result.errorCount > 0) {
        toast.error(
          `Import finished with ${result.errorCount} error(s); created ${result.createdCount}.`,
        );
      } else {
        toast.success(
          `Imported ${result.createdCount} draft question(s) successfully.`,
        );
      }
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setImporting(false);
    }
  }

  async function copyAiPrompt() {
    await navigator.clipboard.writeText(aiJsonPrompt);
    toast.success("AI JSON prompt copied.");
  }

  function downloadAiPrompt() {
    const blob = new Blob([aiJsonPrompt], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "o2i-question-json-import-prompt.txt";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="space-y-3">
        <Textarea
          disabled={isReadOnly}
          maxLength={2_000_000}
          value={jsonText}
          onChange={(event) => updateJsonText(event.target.value)}
          className="min-h-[520px] font-mono text-sm"
          placeholder='Paste JSON here. Example: { "questions": [{ "code": "AP-CALC-001", "title": "Limits FRQ", "content_html": "<p>...</p>", "tag_ids": ["math.concept.calculus.limits"] }] }'
          spellCheck={false}
        />
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            disabled={isReadOnly || previewing || !jsonText.trim()}
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
            disabled={
              isReadOnly || importing || !preview?.validCount || !jsonText.trim()
            }
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
          <Button type="button" variant="outline" onClick={copyAiPrompt}>
            Copy AI JSON prompt
          </Button>
          <Button type="button" variant="outline" onClick={downloadAiPrompt}>
            Download AI JSON prompt
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
            <li>Questions are always imported as drafts into {scopeLabel}.</li>
            <li>
              Scope: {scope.kind === "global" ? "global" : `Library · ${scope.role}`}
              {isReadOnly ? " · read-only" : ""}.
            </li>
            <li>Tags must already exist by exact tag_id.</li>
            <li>Unsafe HTML is sanitized before saving.</li>
            <li>FRQ/mixed questions can omit answer_spec.</li>
          </ul>
        </div>
        {summary ? (
          <div className="space-y-3 rounded-md border p-3 text-sm">
            <div>
              <p className="font-medium">
                {summary.errorCount > 0 ? "Import completed with errors" : "Import completed"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {resultDescription}
              </p>
            </div>
            {summary.validationErrorReasons.length ? (
              <div className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
                <p className="font-medium">Import issues</p>
                <ul className="mt-1 list-disc space-y-1 pl-4">
                  {summary.validationErrorReasons.map((reason) => (
                    <li key={reason}>
                      <FeedbackText
                        className="inline border-none bg-transparent p-0 text-xs text-amber-900"
                        compact
                        inline
                        value={reason}
                      />
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
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
                      className="space-y-2 rounded-md border px-2 py-1.5 text-xs"
                    >
                      <div>
                        <p className="font-mono">{question.questionCode}</p>
                        <p className="text-muted-foreground">{question.title}</p>
                      </div>
                      <AssetReferenceSummary refs={question.assetReferences} />
                    </div>
                  ))}
                </div>
                <Button asChild size="sm" variant="outline">
                  <Link href={questionsHref}>Open questions</Link>
                </Button>
                <Button asChild size="sm">
                  <Link href={reviewHref}>
                    Review imported drafts
                  </Link>
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
                      <div className="rounded-md bg-muted/30 p-2">
                        <p className="mb-1 font-medium text-foreground">
                          Asset references
                        </p>
                        <AssetReferenceSummary
                          refs={extractImportAssetReferences(item.normalized)}
                          showValues
                        />
                        <p className="mt-2">
                          Preserved for scoped review only. No files are
                          downloaded, uploaded, or attached by Batch Import v2.
                        </p>
                      </div>
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
