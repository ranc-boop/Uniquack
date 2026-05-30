import sanitizeHtml from "sanitize-html";

export function sanitizeContentHtml(contentHtml: string) {
  return sanitizeHtml(contentHtml, {
    allowedTags: [
      "p",
      "br",
      "strong",
      "em",
      "u",
      "s",
      "blockquote",
      "code",
      "pre",
      "ul",
      "ol",
      "li",
      "h2",
      "h3",
      "h4",
      "span",
      "div",
      "math",
      "mi",
      "mn",
      "mo",
      "msup",
      "msub",
      "mfrac",
      "mrow",
      "annotation",
    ],
    allowedAttributes: {
      span: ["class", "data-type", "data-latex"],
      div: ["class", "data-type", "data-latex"],
      math: ["xmlns", "display"],
      annotation: ["encoding"],
    },
    allowedClasses: {
      span: ["katex", "katex-html", "katex-mathml", "math-inline"],
      div: ["math-display"],
    },
    disallowedTagsMode: "discard",
    allowedSchemes: ["http", "https", "mailto"],
  });
}

export function toDangerousHtml(contentHtml: string) {
  return { __html: sanitizeContentHtml(contentHtml) };
}
