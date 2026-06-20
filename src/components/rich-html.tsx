"use client";

import katex from "katex";
import { useLayoutEffect, useRef } from "react";

import { cn } from "@/lib/utils";
import { toDangerousHtml } from "@/lib/sanitize/html";

type RichHtmlProps = {
  html: string;
  className?: string;
};

function shouldSkipRawMath(parent: ParentNode | null) {
  return (
    parent instanceof HTMLElement &&
    Boolean(
      parent.closest(
        '[data-type="inline-math"], [data-type="block-math"], code, pre, textarea, script, style',
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

function hydrateRawDollarMath(root: HTMLElement) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  let current = walker.nextNode();

  while (current) {
    if (
      current instanceof Text &&
      current.textContent?.includes("$") &&
      !shouldSkipRawMath(current.parentNode)
    ) {
      textNodes.push(current);
    }

    current = walker.nextNode();
  }

  for (const node of textNodes) {
    const source = balanceLikelyTrailingInlineMath(node.textContent ?? "");
    const matches = Array.from(source.matchAll(/\$([^$\n]+?)\$/g));

    if (!matches.length) {
      continue;
    }

    const fragment = document.createDocumentFragment();
    let cursor = 0;

    for (const match of matches) {
      const matchIndex = match.index ?? 0;
      const latex = match[1]?.trim();

      if (matchIndex > cursor) {
        fragment.append(document.createTextNode(source.slice(cursor, matchIndex)));
      }

      if (latex) {
        const span = document.createElement("span");
        span.dataset.type = "inline-math";
        span.dataset.latex = latex;
        span.textContent = latex;
        fragment.append(span);
      } else {
        fragment.append(document.createTextNode(match[0]));
      }

      cursor = matchIndex + match[0].length;
    }

    if (cursor < source.length) {
      fragment.append(document.createTextNode(source.slice(cursor)));
    }

    node.replaceWith(fragment);
  }
}

export function RichHtml({ html, className }: RichHtmlProps) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const root = ref.current;

    if (!root) {
      return;
    }

    hydrateRawDollarMath(root);

    const mathNodes = root.querySelectorAll<HTMLElement>(
      '[data-type="inline-math"], [data-type="block-math"]',
    );

    mathNodes.forEach((node) => {
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
      } catch {
        node.textContent = latex;
      }
    });
  });

  return (
    <div
      ref={ref}
      className={cn("rich-html rounded-md border bg-background p-4 text-sm", className)}
      dangerouslySetInnerHTML={toDangerousHtml(html)}
    />
  );
}
