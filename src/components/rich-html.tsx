"use client";

import { MathContent } from "@/components/math-content";

type RichHtmlProps = {
  className?: string;
  html: string;
};

export function RichHtml({ className, html }: RichHtmlProps) {
  return <MathContent className={className} format="html" value={html} />;
}
