import sharp from "sharp";
import path from "node:path";
import { pathToFileURL } from "node:url";

import type { AIPdfAssetPlaceholder } from "@/lib/ai-pdf-import/schema";

type RenderedPage = {
  dataUrl: string;
  height: number;
  page: number;
  png: Buffer;
  width: number;
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

export async function renderPdfPages(pdfBuffer: Buffer): Promise<RenderedPage[]> {
  const { createCanvas } = await import("@napi-rs/canvas");
  const document = await loadPdfDocument(new Uint8Array(pdfBuffer));
  const pages: RenderedPage[] = [];

  try {
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const viewport = page.getViewport({ scale: renderScale });
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
