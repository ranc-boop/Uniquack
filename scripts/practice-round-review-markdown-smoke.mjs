import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import ts from "typescript";

const root = process.cwd();
const markdownSource = await readFile(
  resolve(root, "src/lib/markdown-latex/markdown.ts"),
  "utf8",
);
const reviewRoute = await readFile(
  resolve(root, "src/app/api/practice/review/route.ts"),
  "utf8",
);
const reviewPanel = await readFile(
  resolve(root, "src/components/practice/practice-round-review-panel.tsx"),
  "utf8",
);
const mathContent = await readFile(
  resolve(root, "src/components/math-content.tsx"),
  "utf8",
);

const transpiled = ts.transpileModule(markdownSource, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
  fileName: "markdown.ts",
}).outputText;
const markdown = await import(
  `data:text/javascript;base64,${Buffer.from(transpiled).toString("base64")}`
);

const rendered = markdown.markdownLatexToHtml(
  [
    "**Stable:** derivatives",
    "**Next:**",
    "- check the sign",
    "- verify the domain",
  ].join("\n"),
  { preserveSoftBreaks: true },
);

assert.match(
  rendered,
  /<strong>Stable:<\/strong> derivatives<br\s*\/?>\s*<strong>Next:<\/strong>/,
  "Round Review must preserve meaningful single newlines inside Markdown prose",
);
assert.match(
  rendered,
  /<ul><li>check the sign<\/li><li>verify the domain<\/li><\/ul>/,
  "Round Review must continue to render Markdown lists",
);
assert(
  mathContent.includes("preserveSoftBreaks?: boolean") &&
    reviewPanel.includes("preserveSoftBreaks"),
  "Round Review must opt into soft-break rendering without changing question content globally",
);
assert(
  reviewRoute.includes("boundedRoundReviewMarkdown") &&
    !reviewRoute
      .slice(
        reviewRoute.indexOf("function normalizeRoundReviewSummary"),
        reviewRoute.indexOf("function answerText"),
      )
      .includes("compactText("),
  "Round Review normalization must preserve Markdown and newlines instead of compacting all whitespace",
);

console.log("PASS practice round review Markdown and soft-line-break rendering");
