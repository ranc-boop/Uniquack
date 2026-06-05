"use client";

import katex from "katex";
import { useEffect, useRef } from "react";

import { cn } from "@/lib/utils";
import { toDangerousHtml } from "@/lib/sanitize/html";

type RichHtmlProps = {
  html: string;
  className?: string;
};

export function RichHtml({ html, className }: RichHtmlProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = ref.current;

    if (!root) {
      return;
    }

    const mathNodes = root.querySelectorAll<HTMLElement>(
      '[data-type="inline-math"], [data-type="block-math"]',
    );

    mathNodes.forEach((node) => {
      const latex = node.dataset.latex || node.textContent?.trim();

      if (!latex) {
        return;
      }

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
  }, [html]);

  return (
    <div
      ref={ref}
      className={cn("rich-html rounded-md border bg-background p-4 text-sm", className)}
      dangerouslySetInnerHTML={toDangerousHtml(html)}
    />
  );
}
