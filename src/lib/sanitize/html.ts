import sanitizeHtml from "sanitize-html";

const allowedTags = Array.from(
  new Set([
    ...sanitizeHtml.defaults.allowedTags,
    "div",
    "span",
    "img",
    "picture",
    "video",
    "audio",
    "source",
    "track",
    "iframe",
    "details",
    "summary",
    "dialog",
    "map",
    "area",
    "meter",
    "progress",
    "math",
    "mi",
    "mn",
    "mo",
    "msup",
    "msub",
    "mfrac",
    "mrow",
    "annotation",
  ]),
);

const noUrlCss = [/^(?!.*url\s*\().+$/i];

const allowedStyles = {
  "*": {
    color: noUrlCss,
    "background-color": noUrlCss,
    "font-family": noUrlCss,
    "font-size": noUrlCss,
    "font-style": noUrlCss,
    "font-weight": noUrlCss,
    "font-stretch": noUrlCss,
    "font-variant": noUrlCss,
    "font-variant-caps": noUrlCss,
    "font-variation-settings": noUrlCss,
    "line-height": noUrlCss,
    "letter-spacing": noUrlCss,
    "word-spacing": noUrlCss,
    "text-align": noUrlCss,
    "text-decoration": noUrlCss,
    "text-decoration-color": noUrlCss,
    "text-decoration-line": noUrlCss,
    "text-decoration-style": noUrlCss,
    "text-decoration-thickness": noUrlCss,
    "text-transform": noUrlCss,
    "text-indent": noUrlCss,
    "text-overflow": noUrlCss,
    "white-space": noUrlCss,
    "word-break": noUrlCss,
    "overflow-wrap": noUrlCss,
    direction: noUrlCss,
    "unicode-bidi": noUrlCss,
    "vertical-align": noUrlCss,
    "list-style": noUrlCss,
    "list-style-image": noUrlCss,
    "list-style-position": noUrlCss,
    "list-style-type": noUrlCss,
    display: noUrlCss,
    visibility: noUrlCss,
    float: noUrlCss,
    clear: noUrlCss,
    overflow: noUrlCss,
    "overflow-x": noUrlCss,
    "overflow-y": noUrlCss,
    width: noUrlCss,
    "min-width": noUrlCss,
    "max-width": noUrlCss,
    height: noUrlCss,
    "min-height": noUrlCss,
    "max-height": noUrlCss,
    margin: noUrlCss,
    "margin-top": noUrlCss,
    "margin-right": noUrlCss,
    "margin-bottom": noUrlCss,
    "margin-left": noUrlCss,
    padding: noUrlCss,
    "padding-top": noUrlCss,
    "padding-right": noUrlCss,
    "padding-bottom": noUrlCss,
    "padding-left": noUrlCss,
    border: noUrlCss,
    "border-top": noUrlCss,
    "border-right": noUrlCss,
    "border-bottom": noUrlCss,
    "border-left": noUrlCss,
    "border-width": noUrlCss,
    "border-style": noUrlCss,
    "border-color": noUrlCss,
    "border-radius": noUrlCss,
    outline: noUrlCss,
    "outline-color": noUrlCss,
    "outline-style": noUrlCss,
    "outline-width": noUrlCss,
    "box-sizing": noUrlCss,
    "box-shadow": noUrlCss,
    "text-shadow": noUrlCss,
    opacity: noUrlCss,
    "object-fit": noUrlCss,
    "object-position": noUrlCss,
    gap: noUrlCss,
    "row-gap": noUrlCss,
    "column-gap": noUrlCss,
    flex: noUrlCss,
    "flex-direction": noUrlCss,
    "flex-wrap": noUrlCss,
    "flex-grow": noUrlCss,
    "flex-shrink": noUrlCss,
    "flex-basis": noUrlCss,
    "align-items": noUrlCss,
    "align-content": noUrlCss,
    "align-self": noUrlCss,
    "justify-content": noUrlCss,
    "justify-items": noUrlCss,
    "justify-self": noUrlCss,
    "grid-template-columns": noUrlCss,
    "grid-template-rows": noUrlCss,
    "grid-auto-flow": noUrlCss,
    "grid-column": noUrlCss,
    "grid-row": noUrlCss,
    "grid-column-start": noUrlCss,
    "grid-column-end": noUrlCss,
    "grid-row-start": noUrlCss,
    "grid-row-end": noUrlCss,
    transform: noUrlCss,
    "transform-origin": noUrlCss,
    filter: noUrlCss,
    "backdrop-filter": noUrlCss,
    "clip-path": noUrlCss,
    cursor: noUrlCss,
    "pointer-events": noUrlCss,
    "user-select": noUrlCss,
    resize: noUrlCss,
    "aspect-ratio": noUrlCss,
  },
};

const allowedAttributes = {
  ...sanitizeHtml.defaults.allowedAttributes,
  "*": [
    "class",
    "id",
    "style",
    "title",
    "lang",
    "dir",
    "role",
    "tabindex",
    "hidden",
    "translate",
    "aria-*",
    "data-*",
    "itemid",
    "itemprop",
    "itemref",
    "itemscope",
    "itemtype",
  ],
  a: ["href", "name", "target", "rel", "download", "hreflang", "referrerpolicy"],
  img: [
    "src",
    "sizes",
    "alt",
    "title",
    "width",
    "height",
    "loading",
    "decoding",
    "referrerpolicy",
    "usemap",
  ],
  video: [
    "src",
    "poster",
    "controls",
    "autoplay",
    "muted",
    "loop",
    "playsinline",
    "preload",
    "width",
    "height",
    "controlslist",
    "crossorigin",
  ],
  audio: [
    "src",
    "controls",
    "autoplay",
    "muted",
    "loop",
    "preload",
    "crossorigin",
  ],
  source: ["src", "sizes", "type", "media"],
  track: ["src", "kind", "srclang", "label", "default"],
  iframe: [
    "src",
    "title",
    "width",
    "height",
    "allow",
    "allowfullscreen",
    "referrerpolicy",
    "loading",
  ],
  map: ["name"],
  area: ["alt", "coords", "shape", "href", "target", "rel", "download"],
  math: ["xmlns", "display"],
  annotation: ["encoding"],
  table: ["border", "cellpadding", "cellspacing", "summary", "width", "height"],
  colgroup: ["span", "width"],
  col: ["span", "width"],
  th: ["colspan", "rowspan", "scope", "headers", "abbr", "width", "height"],
  td: ["colspan", "rowspan", "headers", "abbr", "width", "height"],
  ol: ["start", "type", "reversed"],
  ul: ["type"],
  li: ["value"],
  hr: ["align", "size", "width"],
  details: ["open"],
  dialog: ["open"],
};

const mergeRelTokens = (existingRel?: string) => {
  const tokens = new Set(
    (existingRel || "")
      .split(/\s+/)
      .map((token) => token.trim())
      .filter(Boolean),
  );
  tokens.add("noopener");
  tokens.add("noreferrer");
  return Array.from(tokens).join(" ");
};

const isSafeAnchorHref = (href?: string) => {
  if (!href) {
    return false;
  }

  try {
    const url = new URL(href);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
};

const isSafeImageSrc = (src?: string) => {
  if (!src) {
    return false;
  }

  try {
    const url = new URL(src);
    const path = url.pathname.toLowerCase();
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      !path.endsWith(".svg")
    );
  } catch {
    return false;
  }
};

export function sanitizeContentHtml(contentHtml: string) {
  return sanitizeHtml(contentHtml, {
    allowedTags,
    allowedAttributes,
    allowedStyles,
    allowedIframeHostnames: [
      "www.youtube.com",
      "youtube.com",
      "www.youtube-nocookie.com",
      "player.bilibili.com",
      "player.vimeo.com",
    ],
    allowedSchemes: ["http", "https", "ftp", "mailto", "tel"],
    allowedSchemesByTag: {
      a: ["http", "https"],
      area: ["http", "https"],
      img: ["http", "https", "ftp"],
      source: ["http", "https", "ftp"],
      video: ["http", "https", "ftp"],
      audio: ["http", "https", "ftp"],
      iframe: ["http", "https"],
    },
    allowProtocolRelative: false,
    transformTags: {
      a: (tagName, attribs) => ({
        tagName,
        attribs: {
          ...attribs,
          target: attribs.target || "_blank",
          rel: mergeRelTokens(attribs.rel),
        },
      }),
    },
    exclusiveFilter: (frame) => {
      if (frame.tag === "a" && !isSafeAnchorHref(frame.attribs.href)) {
        return "excludeTag";
      }

      if (frame.tag === "img" && !isSafeImageSrc(frame.attribs.src)) {
        return "excludeTag";
      }

      return false;
    },
    disallowedTagsMode: "discard",
  });
}

export function toDangerousHtml(contentHtml: string) {
  return { __html: sanitizeContentHtml(contentHtml) };
}
