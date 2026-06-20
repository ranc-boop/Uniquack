import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import katex from "katex";
import ts from "typescript";

const outDir = resolve(".tools/markdown-latex-editor-smoke");
mkdirSync(outDir, { recursive: true });

function compileTs(sourcePath, outFile) {
  const source = readFileSync(sourcePath, "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2020,
    },
  });
  const outPath = resolve(outDir, outFile);
  writeFileSync(outPath, outputText);
  return outPath;
}

const markdownPath = compileTs(
  "src/lib/markdown-latex/markdown.ts",
  "markdown.mjs",
);
const sanitizerPath = compileTs("src/lib/sanitize/html.ts", "sanitize.mjs");

const markdown = await import(`file://${markdownPath.replaceAll("\\", "/")}`);
const sanitizer = await import(`file://${sanitizerPath.replaceAll("\\", "/")}`);

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }

  console.log(`PASS ${message}`);
}

const markdownSource = [
  "## Newton Review",
  "",
  "A **bold** and *italic* paragraph with `code`, [safe link](https://example.com), and $F=ma$.",
  "A resistor with resistance $4\\,\\Omega$ is connected to a $12\\,\\mathrm{V}$ battery.",
  "",
  "![diagram](https://example.com/diagram.png)",
  "",
  "- force",
  "- mass",
  "",
  "1. identify values",
  "2. solve",
  "",
  "> Review the units.",
  "",
  "| Quantity | Value |",
  "| --- | --- |",
  "| Voltage | `$12\\,\\mathrm{V}$` |",
  "| Resistance | `$4\\,\\Omega$` |",
  "",
  "$$",
  "a = \\frac{F}{m}",
  "$$",
].join("\n");

const rendered = markdown.markdownLatexToHtml(markdownSource);
const derivativeRendered = markdown.markdownLatexToHtml(
  String.raw`If $f'(x) = 1 + 2x - x^3 - \sqrt{x^4 + 1}$, then $f$ has a local minimum at $x = $?`,
);

assert(rendered.includes("<h2>Newton Review</h2>"), "heading renders");
assert(rendered.includes("<strong>bold</strong>"), "bold renders");
assert(rendered.includes("<em>italic</em>"), "italic renders");
assert(rendered.includes("<code>code</code>"), "inline code renders");
assert(
  rendered.includes('<a href="https://example.com">safe link</a>'),
  "safe link renders",
);
assert(
  rendered.includes('<img src="https://example.com/diagram.png"'),
  "safe image renders",
);
assert(rendered.includes("<ul>") && rendered.includes("<ol>"), "lists render");
assert(rendered.includes("<blockquote>"), "blockquote renders");
assert(rendered.includes("rich-html-table-wrap"), "pipe table renders");
assert(
  rendered.includes('data-type="inline-math"') &&
    rendered.includes('data-latex="F=ma"'),
  "inline math renders as safe marker",
);
assert(
  derivativeRendered.includes('data-latex="f&#39;(x) = 1 + 2x - x^3 - \\sqrt{x^4 + 1}"') &&
    !derivativeRendered.includes("&amp;#39;"),
  "derivative apostrophe is escaped once without corrupting LaTeX",
);
assert(
  rendered.includes('data-latex="4\\,\\Omega"') &&
    rendered.includes(">4\\,\\Omega</span>"),
  "inline Ohm math keeps fallback text",
);
assert(
  rendered.includes('data-latex="12\\,\\mathrm{V}"') &&
    rendered.includes(">12\\,\\mathrm{V}</span>"),
  "inline voltage math keeps fallback text",
);
assert(
  rendered.includes("<td>") &&
    rendered.includes('data-latex="12\\,\\mathrm{V}"') &&
    rendered.includes('data-latex="4\\,\\Omega"'),
  "inline math inside pipe table renders as safe marker",
);
assert(
  rendered.includes('data-type="block-math"') &&
    rendered.includes('data-latex="a = \\frac{F}{m}"') &&
    rendered.includes(">a = \\frac{F}{m}</div>"),
  "block math renders as safe marker",
);

const unsafeRendered = markdown.markdownLatexToHtml(
  "[bad](javascript:alert(1)) ![bad](javascript:alert(1)) ![svg](https://example.com/bad.svg)",
);
assert(!unsafeRendered.includes("javascript:"), "unsafe markdown URLs are blocked");
assert(!unsafeRendered.includes(".svg"), "unsafe markdown SVG images are blocked");
assert(unsafeRendered.includes("bad"), "unsafe markdown link keeps text");

const sanitized = sanitizer.sanitizeContentHtml(
  '<script>alert(1)</script><p onclick="alert(1)">ok</p><a href="javascript:alert(1)">bad</a><img src="javascript:alert(1)" alt="x"><img src="https://example.com/bad.svg" srcset="https://example.com/bad.svg 2x" alt="svg"><a href="https://example.com">good</a>',
);
assert(!sanitized.includes("<script"), "script tags are removed");
assert(!sanitized.includes("onclick"), "event handlers are removed");
assert(!sanitized.includes("javascript:"), "javascript URLs are removed");
assert(!sanitized.includes(".svg"), "SVG image URLs are removed");
assert(!sanitized.includes("srcset"), "image srcset is not allowed");
assert(sanitized.includes("bad"), "unsafe anchor is unwrapped to text");
assert(
  sanitized.includes('href="https://example.com"') &&
    sanitized.includes('rel="noopener noreferrer"'),
  "safe links keep noopener noreferrer",
);

const sanitizedMath = sanitizer.sanitizeContentHtml(
  '<p>A <span data-type="inline-math" data-latex="4\\,\\Omega">4\\,\\Omega</span></p><div data-type="block-math" data-latex="I = \\frac{V}{R}">I = \\frac{V}{R}</div>',
);
assert(
  sanitizedMath.includes('data-type="inline-math"') &&
    sanitizedMath.includes('data-latex="4\\,\\Omega"') &&
    sanitizedMath.includes("4\\,\\Omega"),
  "sanitizer preserves inline math marker and fallback",
);
assert(
  sanitizedMath.includes('data-type="block-math"') &&
    sanitizedMath.includes('data-latex="I = \\frac{V}{R}"') &&
    sanitizedMath.includes("I = \\frac{V}{R}"),
  "sanitizer preserves block math marker and fallback",
);

const htmlSource = '<h2>HTML mode</h2><p>Original HTML fallback</p>';
assert(
  sanitizer.sanitizeContentHtml(htmlSource).includes("Original HTML fallback"),
  "Original HTML fallback still sanitizes and renders",
);

katex.renderToString("\\notacommand{", { throwOnError: false });
assert(true, "KaTeX throwOnError false does not crash on invalid input");

console.log("Markdown LaTeX editor smoke completed.");
