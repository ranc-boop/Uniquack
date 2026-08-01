"use client";

import { Maximize2, Minimize2 } from "lucide-react";
import { useId, useMemo, useState } from "react";

import { RichHtml } from "@/components/rich-html";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AI_INPUT_LIMITS } from "@/lib/ai-input-limits";
import {
  markdownLatexToHtml,
  type QuestionSourceFormat,
} from "@/lib/markdown-latex/markdown";
import { cn } from "@/lib/utils";

type EditorMode = "markdown" | "html";

type QuestionHtmlEditorProps = {
  defaultSource?: string | null;
  defaultSourceFormat?: QuestionSourceFormat | null;
  defaultValue?: string | null;
  id?: string;
  label: string;
  maxLength?: number;
  minEditorHeight?: string;
  name: string;
  placeholder?: string;
  required?: boolean;
  sourceFormatName?: string;
  sourceName?: string;
};

function normalizeInitialValue(value: string | null | undefined) {
  return value?.trim() ?? "";
}

function inferSourceFieldNames(htmlFieldName: string) {
  if (htmlFieldName === "content_html") {
    return {
      sourceName: "content_source",
      sourceFormatName: "content_source_format",
    };
  }

  if (htmlFieldName === "solution_html") {
    return {
      sourceName: "solution_source",
      sourceFormatName: "solution_source_format",
    };
  }

  return {
    sourceName: `${htmlFieldName}_source`,
    sourceFormatName: `${htmlFieldName}_source_format`,
  };
}

function initialModeFor({
  defaultSource,
  defaultSourceFormat,
  defaultValue,
}: {
  defaultSource?: string | null;
  defaultSourceFormat?: QuestionSourceFormat | null;
  defaultValue?: string | null;
}): EditorMode {
  const normalizedSource = normalizeInitialValue(defaultSource);
  const normalizedHtml = normalizeInitialValue(defaultValue);

  if (defaultSourceFormat === "markdown_latex" && normalizedSource) {
    return "markdown";
  }

  if (defaultSourceFormat === "html") {
    return "html";
  }

  return normalizedHtml ? "html" : "markdown";
}

export function QuestionHtmlEditor({
  defaultSource,
  defaultSourceFormat,
  defaultValue,
  id,
  label,
  maxLength = AI_INPUT_LIMITS.QUESTION_SOURCE_CHARS,
  minEditorHeight = "min-h-48",
  name,
  placeholder,
  required = false,
  sourceFormatName,
  sourceName,
}: QuestionHtmlEditorProps) {
  const generatedId = useId();
  const fieldId = id ?? `${name}-${generatedId}`;
  const inferredSourceFields = useMemo(() => inferSourceFieldNames(name), [name]);
  const sourceFieldName = sourceName ?? inferredSourceFields.sourceName;
  const sourceFormatFieldName =
    sourceFormatName ?? inferredSourceFields.sourceFormatName;
  const initialMode = initialModeFor({
    defaultSource,
    defaultSourceFormat,
    defaultValue,
  });
  const initialHtml = normalizeInitialValue(defaultValue);
  const initialSource = normalizeInitialValue(defaultSource);
  const [mode, setMode] = useState<EditorMode>(initialMode);
  const [markdownValue, setMarkdownValue] = useState(
    initialMode === "markdown" ? initialSource : "",
  );
  const [htmlSourceValue, setHtmlSourceValue] = useState(
    initialMode === "html" ? initialSource || initialHtml : initialHtml,
  );
  const [htmlValue, setHtmlValue] = useState(() => {
    if (initialHtml) {
      return initialHtml;
    }

    return initialMode === "markdown" ? markdownLatexToHtml(initialSource) : "";
  });
  const [isFullscreen, setIsFullscreen] = useState(false);

  const sourceFormat: QuestionSourceFormat =
    mode === "markdown" ? "markdown_latex" : "html";
  const sourceValue = mode === "markdown" ? markdownValue : htmlSourceValue;
  const modeLabel =
    mode === "markdown" ? "Markdown + LaTeX" : "Advanced HTML fallback";
  const previewHtml = htmlValue.trim()
    ? htmlValue
    : '<p class="text-muted-foreground">Nothing to preview yet.</p>';

  function updateMarkdownValue(value: string) {
    setMarkdownValue(value);
    setHtmlValue(markdownLatexToHtml(value));
  }

  function updateHtmlSourceValue(value: string) {
    setHtmlSourceValue(value);
    setHtmlValue(value);
  }

  function switchMode(nextMode: EditorMode) {
    setMode(nextMode);

    if (nextMode === "html") {
      const nextHtmlSource = htmlValue || htmlSourceValue;
      setHtmlSourceValue(nextHtmlSource);
      setHtmlValue(nextHtmlSource);
      return;
    }

    setHtmlValue(markdownLatexToHtml(markdownValue));
  }

  const controls = (
    <div
      aria-label={`${label} editor mode`}
      className="inline-flex rounded-full bg-muted p-1"
      role="group"
    >
      <button
        type="button"
        className={cn(
          "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
          mode === "markdown"
            ? "bg-background text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground",
        )}
        onClick={() => switchMode("markdown")}
      >
        Markdown + LaTeX
      </button>
      <button
        type="button"
        className={cn(
          "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
          mode === "html"
            ? "bg-background text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground",
        )}
        onClick={() => switchMode("html")}
      >
        Advanced HTML
      </button>
    </div>
  );

  const renderEditorPane = (fillHeight = false) => (
    <div className={cn("space-y-3", fillHeight && "flex h-full min-h-0 flex-col")}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">{modeLabel}</p>
          <p className="text-xs text-muted-foreground">
            {mode === "markdown"
              ? "Recommended for tutors. Use inline math with $...$ and block math with $$...$$. \\(...\\) math is not supported yet. The original Markdown source and sanitized HTML render output are saved separately."
              : "Advanced/developer fallback for legacy or complex HTML. Use Markdown + LaTeX for normal tutor authoring."}
          </p>
        </div>
        {controls}
      </div>

      {mode === "markdown" ? (
        <Textarea
          maxLength={maxLength}
          value={markdownValue}
          onChange={(event) => updateMarkdownValue(event.target.value)}
          className={cn(
            "font-mono text-sm",
            fillHeight ? "min-h-[18rem] flex-1 resize-none" : minEditorHeight,
          )}
          placeholder={[
            "## Analysis",
            "Use **Markdown** and inline math like $F=ma$.",
            "",
            "$$",
            "\\Delta x = v_0t + \\frac{1}{2}at^2",
            "$$",
          ].join("\n")}
        />
      ) : (
        <div className="space-y-3 rounded-md border border-dashed bg-muted/20 p-3">
          <div>
            <p className="text-sm font-medium">Advanced HTML fallback</p>
            <p className="text-xs text-muted-foreground">
              HTML source is preserved for legacy content and developer/admin
              debugging. It is sanitized before preview and public display.
            </p>
          </div>
          <Textarea
            maxLength={maxLength}
            value={htmlSourceValue}
            onChange={(event) => updateHtmlSourceValue(event.target.value)}
            className={cn(
              "font-mono text-sm",
              fillHeight ? "min-h-[18rem] flex-1 resize-none" : minEditorHeight,
            )}
            placeholder={placeholder}
          />
        </div>
      )}
    </div>
  );

  const previewPane = (fillHeight = false) => (
    <div className={cn("space-y-3", fillHeight && "flex h-full min-h-0 flex-col")}>
      <div>
        <p className="text-sm font-medium">Preview</p>
        <p className="text-xs text-muted-foreground">
          Sanitized render of the HTML that will be displayed publicly.
        </p>
      </div>
      <RichHtml
        html={previewHtml}
        className={cn(fillHeight ? "min-h-[18rem] flex-1 overflow-auto" : "min-h-32")}
      />
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Label htmlFor={fieldId}>
          {label}
          {required ? <span className="text-destructive"> *</span> : null}
        </Label>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setIsFullscreen(true)}
          aria-label={`Expand ${label} editor`}
        >
          <Maximize2 className="h-4 w-4" />
          Expand editor
        </Button>
      </div>

      <textarea
        id={fieldId}
        name={name}
        value={htmlValue}
        onChange={(event) => setHtmlValue(event.target.value)}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        required={required}
      />
      <textarea
        name={sourceFieldName}
        value={sourceValue}
        readOnly
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
      />
      <input
        type="hidden"
        name={sourceFormatFieldName}
        value={sourceFormat}
        readOnly
      />

      <div className="grid items-stretch gap-4 xl:grid-cols-2">
        {isFullscreen ? (
          <div className="rounded-md border border-dashed bg-muted/20 p-4 text-sm text-muted-foreground">
            Fullscreen mode is active. Use the expanded editor window.
          </div>
        ) : (
          renderEditorPane(true)
        )}
        {previewPane(true)}
      </div>

      <Dialog open={isFullscreen} onOpenChange={setIsFullscreen}>
        <DialogContent className="h-[92vh] max-w-[96vw] grid-rows-[auto_1fr] overflow-hidden p-4">
          <div className="flex items-start justify-between gap-4 pr-8">
            <div>
              <DialogTitle>{label}</DialogTitle>
              <DialogDescription>
                Fullscreen mode. Edit on the left and review the rendered
                preview on the right.
              </DialogDescription>
            </div>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => setIsFullscreen(false)}
            >
              <Minimize2 className="h-4 w-4" />
              Shrink editor
            </Button>
          </div>
          <div className="grid min-h-0 gap-4 overflow-hidden lg:grid-cols-2">
            <div className="min-h-0 overflow-auto rounded-md border p-4">
              {renderEditorPane(true)}
            </div>
            <div className="min-h-0 overflow-auto rounded-md border p-4">
              {previewPane(true)}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
