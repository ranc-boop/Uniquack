"use client";

import { Maximize2, Minimize2 } from "lucide-react";
import { useId, useState } from "react";

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
import { cn } from "@/lib/utils";

type EditorMode = "markdown" | "html";

type QuestionHtmlEditorProps = {
  defaultValue?: string | null;
  id?: string;
  label: string;
  minEditorHeight?: string;
  name: string;
  placeholder?: string;
  required?: boolean;
};

function normalizeInitialHtml(value: string | null | undefined) {
  return value?.trim() ?? "";
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttribute(value: string) {
  return escapeHtml(value).replaceAll("\n", " ");
}

function isSafeMarkdownUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function renderInlineMarkdown(value: string) {
  const codeTokens: string[] = [];
  const htmlTokens: string[] = [];
  let rendered = escapeHtml(value).replace(/`([^`]+)`/g, (_, code: string) => {
    const index = codeTokens.push(`<code>${code}</code>`) - 1;
    return `@@CODE_${index}@@`;
  });

  rendered = rendered
    .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_, alt: string, src: string) => {
      if (!isSafeMarkdownUrl(src)) {
        return "";
      }

      const index =
        htmlTokens.push(
          `<img src="${escapeAttribute(src)}" alt="${escapeAttribute(
            alt,
          )}" loading="lazy" decoding="async" />`,
        ) - 1;
      return `@@HTML_${index}@@`;
    })
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, text: string, href: string) => {
      if (!isSafeMarkdownUrl(href)) {
        return escapeHtml(text);
      }

      const index =
        htmlTokens.push(
          `<a href="${escapeAttribute(href)}">${escapeHtml(text)}</a>`,
        ) - 1;
      return `@@HTML_${index}@@`;
    })
    .replace(/\$\$([^$]+?)\$\$/g, (_, latex: string) => {
      const cleanLatex = escapeAttribute(latex.trim());
      return `<span data-type="inline-math" data-latex="${cleanLatex}"></span>`;
    })
    .replace(/\$([^$\n]+?)\$/g, (_, latex: string) => {
      const cleanLatex = escapeAttribute(latex.trim());
      return `<span data-type="inline-math" data-latex="${cleanLatex}"></span>`;
    })
    .replace(/\*\*([^*]+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+?)\*/g, "<em>$1</em>");

  for (const [index, token] of htmlTokens.entries()) {
    rendered = rendered.replace(`@@HTML_${index}@@`, token);
  }

  for (const [index, token] of codeTokens.entries()) {
    rendered = rendered.replace(`@@CODE_${index}@@`, token);
  }

  return rendered;
}

function renderList(items: string[], ordered: boolean) {
  const tag = ordered ? "ol" : "ul";
  return `<${tag}>${items
    .map((item) => `<li>${renderInlineMarkdown(item)}</li>`)
    .join("")}</${tag}>`;
}

function isTableDivider(line: string) {
  return /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(line);
}

function splitTableRow(line: string) {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function renderTable(headerLine: string, dividerLine: string, bodyLines: string[]) {
  if (!isTableDivider(dividerLine)) {
    return null;
  }

  const headers = splitTableRow(headerLine);
  const rows = bodyLines.map(splitTableRow).filter((row) => row.length === headers.length);

  if (!headers.length || !rows.length) {
    return null;
  }

  return [
    '<div class="rich-html-table-wrap"><table>',
    "<thead><tr>",
    ...headers.map((header) => `<th>${renderInlineMarkdown(header)}</th>`),
    "</tr></thead>",
    "<tbody>",
    ...rows.map(
      (row) =>
        `<tr>${row
          .map((cell) => `<td>${renderInlineMarkdown(cell)}</td>`)
          .join("")}</tr>`,
    ),
    "</tbody>",
    "</table></div>",
  ].join("");
}

function markdownToHtml(markdown: string) {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const blocks: string[] = [];
  let paragraph: string[] = [];
  let unorderedItems: string[] = [];
  let orderedItems: string[] = [];

  function flushParagraph() {
    if (!paragraph.length) {
      return;
    }

    blocks.push(`<p>${renderInlineMarkdown(paragraph.join(" "))}</p>`);
    paragraph = [];
  }

  function flushLists() {
    if (unorderedItems.length) {
      blocks.push(renderList(unorderedItems, false));
      unorderedItems = [];
    }

    if (orderedItems.length) {
      blocks.push(renderList(orderedItems, true));
      orderedItems = [];
    }
  }

  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index];
    const line = rawLine.trim();

    if (!line) {
      flushParagraph();
      flushLists();
      continue;
    }

    if (line === "$$") {
      flushParagraph();
      flushLists();
      const mathLines: string[] = [];

      index += 1;
      while (index < lines.length && lines[index].trim() !== "$$") {
        mathLines.push(lines[index]);
        index += 1;
      }

      const latex = escapeAttribute(mathLines.join("\n").trim());
      if (latex) {
        blocks.push(`<div data-type="block-math" data-latex="${latex}"></div>`);
      }
      continue;
    }

    if (line.startsWith(">")) {
      flushParagraph();
      flushLists();
      const quoteLines = [line.replace(/^>\s?/, "")];

      while (
        index + 1 < lines.length &&
        lines[index + 1].trim().startsWith(">")
      ) {
        index += 1;
        quoteLines.push(lines[index].trim().replace(/^>\s?/, ""));
      }

      blocks.push(`<blockquote><p>${renderInlineMarkdown(quoteLines.join(" "))}</p></blockquote>`);
      continue;
    }

    if (
      line.includes("|") &&
      index + 1 < lines.length &&
      isTableDivider(lines[index + 1].trim())
    ) {
      flushParagraph();
      flushLists();
      const bodyLines: string[] = [];
      const dividerLine = lines[index + 1].trim();
      index += 2;

      while (index < lines.length && lines[index].trim().includes("|")) {
        bodyLines.push(lines[index].trim());
        index += 1;
      }

      index -= 1;
      const tableHtml = renderTable(line, dividerLine, bodyLines);

      if (tableHtml) {
        blocks.push(tableHtml);
      }
      continue;
    }

    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) {
      flushParagraph();
      flushLists();
      const level = heading[1].length;
      blocks.push(`<h${level}>${renderInlineMarkdown(heading[2])}</h${level}>`);
      continue;
    }

    const unordered = /^[-*]\s+(.+)$/.exec(line);
    if (unordered) {
      flushParagraph();
      orderedItems = [];
      unorderedItems.push(unordered[1]);
      continue;
    }

    const ordered = /^\d+\.\s+(.+)$/.exec(line);
    if (ordered) {
      flushParagraph();
      unorderedItems = [];
      orderedItems.push(ordered[1]);
      continue;
    }

    flushLists();
    paragraph.push(line);
  }

  flushParagraph();
  flushLists();

  return blocks.join("\n");
}

export function QuestionHtmlEditor({
  defaultValue,
  id,
  label,
  minEditorHeight = "min-h-48",
  name,
  placeholder,
  required = false,
}: QuestionHtmlEditorProps) {
  const generatedId = useId();
  const fieldId = id ?? `${name}-${generatedId}`;
  const [mode, setMode] = useState<EditorMode>("markdown");
  const [htmlValue, setHtmlValue] = useState(() => normalizeInitialHtml(defaultValue));
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [markdownValue, setMarkdownValue] = useState("");

  const modeLabel = mode === "markdown" ? "Markdown + LaTeX" : "Original HTML";
  const previewHtml = htmlValue.trim()
    ? htmlValue
    : '<p class="text-muted-foreground">Nothing to preview yet.</p>';

  function renderMarkdownToHtml() {
    setHtmlValue(markdownToHtml(markdownValue));
  }

  function updateMarkdownValue(value: string) {
    setMarkdownValue(value);
    setHtmlValue(markdownToHtml(value));
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
        onClick={() => setMode("markdown")}
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
        onClick={() => setMode("html")}
      >
        Original HTML
      </button>
    </div>
  );

  const renderEditorPane = (fillHeight = false) => (
    <div className={cn("space-y-3", fillHeight && "flex h-full min-h-0 flex-col")}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">{modeLabel}</p>
          <p className="text-xs text-muted-foreground">
            Preview is always based on the HTML that will be submitted.
          </p>
        </div>
        {controls}
      </div>

      {mode === "markdown" ? (
        <div
          className={cn(
            "space-y-3",
            fillHeight && "flex min-h-0 flex-1 flex-col",
          )}
        >
          <Textarea
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
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" size="sm" onClick={renderMarkdownToHtml}>
              Refresh HTML
            </Button>
            <p className="text-xs text-muted-foreground">
              Markdown updates the saved HTML and preview as you type.
            </p>
          </div>
        </div>
      ) : (
        <Textarea
          value={htmlValue}
          onChange={(event) => setHtmlValue(event.target.value)}
          className={cn(
            "font-mono text-sm",
            fillHeight ? "min-h-[18rem] flex-1 resize-none" : minEditorHeight,
          )}
          placeholder={placeholder}
        />
      )}
    </div>
  );

  const previewPane = (fillHeight = false) => (
    <div className={cn("space-y-3", fillHeight && "flex h-full min-h-0 flex-col")}>
      <div>
        <p className="text-sm font-medium">Preview</p>
        <p className="text-xs text-muted-foreground">
          Sanitized render of the current submitted HTML.
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
                Fullscreen mode. Edit on the left and review the rendered preview on the right.
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
