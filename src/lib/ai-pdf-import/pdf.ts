import sharp from "sharp";
import path from "node:path";
import { pathToFileURL } from "node:url";

import type { AIPdfAssetPlaceholder } from "./schema";

export type RenderedPage = {
  dataUrl: string;
  height: number;
  page: number;
  pdfHeight: number;
  pdfWidth: number;
  png: Buffer;
  width: number;
};

export type PdfPageText = {
  extractedTextLength: number;
  extractedTextPreview: string | null;
  pageNumber: number;
  text: string;
  textLayerAvailable: boolean;
};

type PdfDocumentProxy = {
  destroy?: () => Promise<void>;
  getPage: (pageNumber: number) => Promise<any>;
  numPages: number;
};

const renderScale = 1.5;

async function loadPdfDocument(pdfBytes: Uint8Array): Promise<PdfDocumentProxy> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(
    path.join(
      process.cwd(),
      "node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",
    ),
  ).toString();
  const loadingTask = pdfjs.getDocument({
    data: pdfBytes,
    disableFontFace: true,
    useWorkerFetch: false,
  });

  return loadingTask.promise as unknown as Promise<PdfDocumentProxy>;
}

async function destroyPdfDocument(document: PdfDocumentProxy) {
  if (document.destroy) {
    await document.destroy();
  }
}

export async function getPdfPageCount(pdfBuffer: Buffer) {
  const document = await loadPdfDocument(new Uint8Array(pdfBuffer));

  try {
    return document.numPages;
  } finally {
    await destroyPdfDocument(document);
  }
}

function normalizePdfText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function previewPdfText(value: string) {
  const normalized = normalizePdfText(value);

  return normalized ? normalized.slice(0, 800) : null;
}

export async function extractPdfPageTexts(
  pdfBuffer: Buffer,
): Promise<PdfPageText[]> {
  const document = await loadPdfDocument(new Uint8Array(pdfBuffer));
  const pages: PdfPageText[] = [];

  try {
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const textContent = await page.getTextContent();
      const text = normalizePdfText(
        (textContent.items ?? [])
          .map((item: { str?: unknown }) =>
            typeof item.str === "string" ? item.str : "",
          )
          .join(" "),
      );

      pages.push({
        extractedTextLength: text.length,
        extractedTextPreview: previewPdfText(text),
        pageNumber,
        text,
        textLayerAvailable: text.length > 0,
      });
    }
  } finally {
    await destroyPdfDocument(document);
  }

  return pages;
}

export async function renderPdfPages(pdfBuffer: Buffer): Promise<RenderedPage[]> {
  return renderPdfPageNumbers(pdfBuffer);
}

export async function renderPdfPageNumbers(
  pdfBuffer: Buffer,
  requestedPageNumbers?: number[],
  scale = renderScale,
): Promise<RenderedPage[]> {
  const { createCanvas } = await import("@napi-rs/canvas");
  const document = await loadPdfDocument(new Uint8Array(pdfBuffer));
  const pages: RenderedPage[] = [];

  try {
    const pageNumbers = requestedPageNumbers?.length
      ? Array.from(
          new Set(
            requestedPageNumbers.filter(
              (pageNumber) =>
                Number.isInteger(pageNumber) &&
                pageNumber >= 1 &&
                pageNumber <= document.numPages,
            ),
          ),
        ).sort((left, right) => left - right)
      : Array.from({ length: document.numPages }, (_, index) => index + 1);

    for (const pageNumber of pageNumbers) {
      const page = await document.getPage(pageNumber);
      const viewport = page.getViewport({ scale });
      const pdfViewport = page.getViewport({ scale: 1 });
      const canvas = createCanvas(
        Math.ceil(viewport.width),
        Math.ceil(viewport.height),
      );
      const context = canvas.getContext("2d");

      await page.render({
        canvas,
        canvasContext: context,
        viewport,
      }).promise;

      const png = canvas.toBuffer("image/png");
      pages.push({
        dataUrl: `data:image/png;base64,${png.toString("base64")}`,
        height: canvas.height,
        page: pageNumber,
        pdfHeight: pdfViewport.height,
        pdfWidth: pdfViewport.width,
        png,
        width: canvas.width,
      });
    }
  } finally {
    await destroyPdfDocument(document);
  }

  return pages;
}

export async function cropPdfPlaceholderImage({
  pages,
  placeholder,
}: {
  pages: RenderedPage[];
  placeholder: AIPdfAssetPlaceholder;
}) {
  const page = pages.find((item) => item.page === placeholder.page);

  if (!page) {
    throw new Error(`Crop page ${placeholder.page} was not rendered.`);
  }

  const left = Math.max(0, Math.floor(placeholder.bbox.x * page.width));
  const top = Math.max(0, Math.floor(placeholder.bbox.y * page.height));
  const width = Math.max(1, Math.floor(placeholder.bbox.width * page.width));
  const height = Math.max(1, Math.floor(placeholder.bbox.height * page.height));
  const safeWidth = Math.min(width, page.width - left);
  const safeHeight = Math.min(height, page.height - top);

  if (safeWidth < 1 || safeHeight < 1) {
    throw new Error("Crop region does not intersect the rendered source page.");
  }

  return sharp(page.png)
    .extract({
      height: safeHeight,
      left,
      top,
      width: safeWidth,
    })
    .png()
    .toBuffer();
}

export async function inspectQuestionVisualCrop(image: Buffer) {
  const [metadata, stats] = await Promise.all([
    sharp(image, { failOn: "error" }).metadata(),
    sharp(image, { failOn: "error" }).stats(),
  ]);
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  const entropy = Math.max(0, stats.entropy ?? 0);

  if (metadata.format !== "png") {
    throw new Error("Question visual crop must be a PNG.");
  }
  if (width < 8 || height < 8 || width > 4096 || height > 4096) {
    throw new Error("Question visual crop dimensions are outside safe bounds.");
  }
  if (entropy < 0.01) {
    throw new Error("Question visual crop does not contain readable source variation.");
  }

  return { entropy, height, mimeType: "image/png" as const, width };
}
