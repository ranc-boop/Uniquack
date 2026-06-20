export type QuestionSourceFormat = "markdown_latex" | "html";

export const questionSourceFormats = ["markdown_latex", "html"] as const;

/**
 * Lightweight MVP Markdown + LaTeX renderer.
 *
 * Supported syntax:
 * - #, ##, ### headings
 * - paragraphs
 * - **bold**, *italic*, and `inline code`
 * - http/https links and images
 * - unordered and ordered lists
 * - blockquotes
 * - pipe tables
 * - inline math with $...$
 * - block math with lines wrapped by $$
 *
 * This intentionally emits a small HTML subset that is sanitized again before
 * persistence/rendering. It is not a complete CommonMark implementation.
 */
export function markdownLatexToHtml(markdown: string) {
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

      const latex = mathLines.join("\n").trim();
      if (latex) {
        blocks.push(renderBlockMath(latex));
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

      blocks.push(
        `<blockquote><p>${renderInlineMarkdown(quoteLines.join(" "))}</p></blockquote>`,
      );
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

function getWrappedInlineMathSource(value: string) {
  const trimmed = value.trim();
  const doubleDollar = /^\$\$([^$]+?)\$\$$/.exec(trimmed);

  if (doubleDollar) {
    return doubleDollar[1].trim();
  }

  const singleDollar = /^\$([^$\n]+?)\$$/.exec(trimmed);
  return singleDollar?.[1]?.trim() || null;
}

function renderInlineMath(latex: string) {
  const cleanLatex = latex.trim();

  if (!cleanLatex) {
    return "";
  }

  return `<span data-type="inline-math" data-latex="${escapeAttribute(
    cleanLatex,
  )}">${escapeHtml(cleanLatex)}</span>`;
}

function renderBlockMath(latex: string) {
  const cleanLatex = latex.trim();

  if (!cleanLatex) {
    return "";
  }

  return `<div data-type="block-math" data-latex="${escapeAttribute(
    cleanLatex,
  )}">${escapeHtml(cleanLatex)}</div>`;
}

function isSafeMarkdownUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function isSafeMarkdownImageUrl(value: string) {
  try {
    const url = new URL(value);
    const path = url.pathname.toLowerCase();
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      !path.endsWith(".svg")
    );
  } catch {
    return false;
  }
}

function renderInlineMarkdown(value: string) {
  const codeTokens: string[] = [];
  const htmlTokens: string[] = [];
  let rendered = value.replace(/`([^`]+)`/g, (_, code: string) => {
    const mathSource = getWrappedInlineMathSource(code);

    if (mathSource) {
      const index = htmlTokens.push(renderInlineMath(mathSource)) - 1;
      return `@@HTML_${index}@@`;
    }

    const index = codeTokens.push(`<code>${escapeHtml(code)}</code>`) - 1;
    return `@@CODE_${index}@@`;
  });

  rendered = rendered.replace(
    /\$\$([^$]+?)\$\$|\$([^$\n]+?)\$/g,
    (_, blockLatex: string | undefined, inlineLatex: string | undefined) => {
      const latex = blockLatex ?? inlineLatex ?? "";
      const index = htmlTokens.push(renderInlineMath(latex)) - 1;
      return `@@HTML_${index}@@`;
    },
  );

  rendered = escapeHtml(rendered);

  rendered = rendered
    .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_, alt: string, src: string) => {
      if (!isSafeMarkdownImageUrl(src)) {
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
  const rows = bodyLines
    .map(splitTableRow)
    .filter((row) => row.length === headers.length);

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
