"use client";

import katex from "katex";
import { memo, useEffect, useMemo, useRef, type RefObject } from "react";

import { markdownLatexToHtml } from "@/lib/markdown-latex/markdown";
import { toDangerousHtml } from "@/lib/sanitize/html";
import { cn } from "@/lib/utils";

export type MathContentFormat = "auto" | "html" | "markdown_latex" | "plain";

export type MathContentProps = {
  className?: string;
  compact?: boolean;
  format?: MathContentFormat;
  inline?: boolean;
  value: string | null | undefined;
};

function looksLikeHtml(value: string) {
  return /<[a-z][\s\S]*>/i.test(value);
}

function htmlFromValue(value: string, format: MathContentFormat) {
  if (!value.trim()) {
    return "";
  }

  if (format === "html" || (format === "auto" && looksLikeHtml(value))) {
    return value;
  }

  return markdownLatexToHtml(value);
}

function inlineHtmlFromValue(value: string, format: MathContentFormat) {
  return htmlFromValue(value, format).replace(/^<p>([\s\S]*)<\/p>$/, "$1");
}

function hasHydratableMath(value: string) {
  return (
    value.includes("$") ||
    value.includes("\\(") ||
    value.includes("\\[") ||
    value.includes('data-type="inline-math"') ||
    value.includes("data-type='inline-math'") ||
    value.includes('data-type="block-math"') ||
    value.includes("data-type='block-math'")
  );
}

function shouldSkipRawMath(parent: ParentNode | null) {
  return (
    parent instanceof HTMLElement &&
    Boolean(
      parent.closest(
        '[data-type="inline-math"], [data-type="block-math"], .katex, code, pre, textarea, script, style',
      ),
    )
  );
}

function decodeLatexHtmlEntities(value: string) {
  const textarea = document.createElement("textarea");
  let decoded = value;

  for (let pass = 0; pass < 2; pass += 1) {
    textarea.innerHTML = decoded;
    const next = textarea.value;

    if (next === decoded) {
      break;
    }

    decoded = next;
  }

  return decoded;
}

function balanceLikelyTrailingInlineMath(value: string) {
  const withoutBlockDelimiters = value.replace(/\$\$/g, "");
  const dollarCount = (withoutBlockDelimiters.match(/\$/g) ?? []).length;

  if (dollarCount % 2 === 0) {
    return value;
  }

  const lastDollarIndex = value.lastIndexOf("$");
  const trailing = lastDollarIndex >= 0 ? value.slice(lastDollarIndex + 1) : "";

  return /[a-zA-Z\\^_=+\-*/()]/.test(trailing) ? `${value}$` : value;
}

type RawMathMatch = {
  displayMode: boolean;
  end: number;
  latex: string;
  raw: string;
  start: number;
};

function findRawMath(source: string) {
  const matches: RawMathMatch[] = [];
  const pattern =
    /\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\\\(([\s\S]+?)\\\)|\$([^$\n]+?)\$/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(source))) {
    const latex = match[1] ?? match[2] ?? match[3] ?? match[4] ?? "";
    const displayMode = Boolean(match[1] ?? match[2]);

    if (!latex.trim()) {
      continue;
    }

    matches.push({
      displayMode,
      end: match.index + match[0].length,
      latex: latex.trim(),
      raw: match[0],
      start: match.index,
    });
  }

  return matches;
}

function hydrateRawMath(root: HTMLElement) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  let current = walker.nextNode();

  while (current) {
    if (
      current instanceof Text &&
      /\$|\\[([]/.test(current.textContent ?? "") &&
      !shouldSkipRawMath(current.parentNode)
    ) {
      textNodes.push(current);
    }

    current = walker.nextNode();
  }

  for (const node of textNodes) {
    const source = balanceLikelyTrailingInlineMath(node.textContent ?? "");
    const matches = findRawMath(source);

    if (!matches.length) {
      continue;
    }

    const fragment = document.createDocumentFragment();
    let cursor = 0;

    for (const match of matches) {
      if (match.start > cursor) {
        fragment.append(document.createTextNode(source.slice(cursor, match.start)));
      }

      const element = document.createElement("span");
      element.dataset.type = match.displayMode ? "block-math" : "inline-math";
      element.dataset.latex = match.latex;
      element.textContent = match.latex;
      fragment.append(element);
      cursor = match.end;
    }

    if (cursor < source.length) {
      fragment.append(document.createTextNode(source.slice(cursor)));
    }

    node.replaceWith(fragment);
  }
}

function renderKatexNodes(root: HTMLElement) {
  const mathNodes = root.querySelectorAll<HTMLElement>(
    '[data-type="inline-math"], [data-type="block-math"]',
  );

  mathNodes.forEach((node) => {
    if (node.dataset.rendered === "katex") {
      return;
    }

    const encodedLatex = node.dataset.latex || node.textContent?.trim();

    if (!encodedLatex) {
      return;
    }

    const latex = decodeLatexHtmlEntities(encodedLatex);

    try {
      node.textContent = latex;
      katex.render(latex, node, {
        displayMode: node.dataset.type === "block-math",
        throwOnError: false,
      });
      node.dataset.rendered = "katex";
    } catch {
      node.textContent = latex;
    }
  });
}

function MathContentComponent({
  className,
  compact = false,
  format = "auto",
  inline = false,
  value,
}: MathContentProps) {
  const ref = useRef<HTMLElement>(null);
  const html = useMemo(
    () =>
      inline
        ? inlineHtmlFromValue(String(value ?? ""), format)
        : htmlFromValue(String(value ?? ""), format),
    [format, inline, value],
  );
  const shouldHydrateMath = useMemo(() => hasHydratableMath(html), [html]);

  useEffect(() => {
    if (!shouldHydrateMath) {
      return;
    }

    const root = ref.current;

    if (!root) {
      return;
    }

    let timeoutId: number | null = null;
    let cancelled = false;

    const hydrate = () => {
      if (cancelled) {
        return;
      }

      hydrateRawMath(root);
      renderKatexNodes(root);
    };

    const scheduleHydrate = () => {
      if (compact) {
        timeoutId = window.setTimeout(hydrate, 1);
        return;
      }

      hydrate();
    };

    if (compact && "IntersectionObserver" in window) {
      const observer = new IntersectionObserver((entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          observer.disconnect();
          scheduleHydrate();
        }
      });

      observer.observe(root);

      return () => {
        cancelled = true;
        observer.disconnect();
        if (timeoutId !== null) {
          window.clearTimeout(timeoutId);
        }
      };
    }

    scheduleHydrate();

    return () => {
      cancelled = true;
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [compact, html, shouldHydrateMath]);

  const sharedProps = {
    className: cn(
      "rich-html min-w-0 text-sm",
      !inline && "rounded-md border bg-background p-4",
      compact && "rich-html--compact",
      className,
    ),
    dangerouslySetInnerHTML: toDangerousHtml(html),
  };

  if (inline) {
    return (
      <span
        ref={ref as RefObject<HTMLSpanElement>}
        {...sharedProps}
      />
    );
  }

  return (
    <div
      ref={ref as RefObject<HTMLDivElement>}
      {...sharedProps}
    />
  );
}

export const MathContent = memo(MathContentComponent);

export function QuestionText(props: Omit<MathContentProps, "format">) {
  return <MathContent format="auto" {...props} />;
}

export function OptionText(props: Omit<MathContentProps, "format">) {
  return <MathContent format="auto" {...props} />;
}

export function SolutionText(props: Omit<MathContentProps, "format">) {
  return <MathContent format="auto" {...props} />;
}

export function FeedbackText(props: Omit<MathContentProps, "format">) {
  return <MathContent format="auto" {...props} />;
}

export function InlineMathText(props: Omit<MathContentProps, "inline">) {
  return <MathContent inline {...props} />;
}
