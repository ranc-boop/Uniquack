import sharp from "sharp";

import { renderPdfPageNumbers, type RenderedPage } from "./pdf";
import type { AIPdfSegmentChunk, AIPdfSegmentMask } from "./segmentation";

type RasterPdfPage = {
  height: number;
  imageHeight: number;
  imageWidth: number;
  jpeg: Buffer;
  width: number;
};

function maskForPage(masks: AIPdfSegmentMask[], sourcePage: number) {
  return masks.filter((mask) => mask.sourcePage === sourcePage);
}

async function maskedRgbPage(
  renderedPage: RenderedPage,
  masks: AIPdfSegmentMask[],
): Promise<RasterPdfPage> {
  let image = sharp(renderedPage.png).removeAlpha();

  for (const mask of masks) {
    const splitRow = Math.max(
      1,
      Math.min(
        renderedPage.height - 1,
        Math.round(mask.splitY * renderedPage.height),
      ),
    );
    const top = mask.type === "white_above" ? 0 : splitRow;
    const height =
      mask.type === "white_above"
        ? splitRow
        : renderedPage.height - splitRow;

    image = image.composite([
      {
        input: {
          create: {
            background: { alpha: 1, b: 255, g: 255, r: 255 },
            channels: 3,
            height,
            width: renderedPage.width,
          },
        },
        left: 0,
        top,
      },
    ]);
  }

  const { data, info } = await image
    .flatten({ background: "#ffffff" })
    .jpeg({ chromaSubsampling: "4:4:4", quality: 94 })
    .toBuffer({ resolveWithObject: true });

  return {
    height: renderedPage.pdfHeight,
    imageHeight: info.height,
    imageWidth: info.width,
    jpeg: data,
    width: renderedPage.pdfWidth,
  };
}

function pdfObject(id: number, body: Buffer | string) {
  return Buffer.concat([
    Buffer.from(`${id} 0 obj\n`, "binary"),
    typeof body === "string" ? Buffer.from(body, "binary") : body,
    Buffer.from("\nendobj\n", "binary"),
  ]);
}

function streamObject(dictionary: string, stream: Buffer) {
  return Buffer.concat([
    Buffer.from(`<< ${dictionary} /Length ${stream.length} >>\nstream\n`, "binary"),
    stream,
    Buffer.from("\nendstream", "binary"),
  ]);
}

function writeRasterPdf(pages: RasterPdfPage[]) {
  const pageObjectIds = pages.map((_, index) => 3 + index * 3);
  const objects: { id: number; value: Buffer }[] = [];

  objects.push({
    id: 1,
    value: pdfObject(1, "<< /Type /Catalog /Pages 2 0 R >>"),
  });
  objects.push({
    id: 2,
    value: pdfObject(
      2,
      `<< /Type /Pages /Count ${pages.length} /Kids [${pageObjectIds
        .map((id) => `${id} 0 R`)
        .join(" ")}] >>`,
    ),
  });

  pages.forEach((page, index) => {
    const pageId = pageObjectIds[index];
    const contentId = pageId + 1;
    const imageId = pageId + 2;
    const content = Buffer.from(
      `q\n${page.width} 0 0 ${page.height} 0 0 cm\n/Im0 Do\nQ`,
      "binary",
    );

    objects.push({
      id: pageId,
      value: pdfObject(
        pageId,
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${page.width} ${page.height}] /Resources << /XObject << /Im0 ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>`,
      ),
    });
    objects.push({
      id: contentId,
      value: pdfObject(contentId, streamObject("", content)),
    });
    objects.push({
      id: imageId,
      value: pdfObject(
        imageId,
        streamObject(
          `/Type /XObject /Subtype /Image /Width ${page.imageWidth} /Height ${page.imageHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode`,
          page.jpeg,
        ),
      ),
    });
  });

  objects.sort((left, right) => left.id - right.id);
  const header = Buffer.from("%PDF-1.7\n%\xE2\xE3\xCF\xD3\n", "binary");
  const chunks: Buffer[] = [header];
  const offsets = new Array(objects.length + 1).fill(0);
  let offset = header.length;

  for (const object of objects) {
    offsets[object.id] = offset;
    chunks.push(object.value);
    offset += object.value.length;
  }

  const xrefOffset = offset;
  const xrefRows = [
    `xref\n0 ${objects.length + 1}`,
    "0000000000 65535 f ",
    ...offsets.slice(1).map((value) => `${String(value).padStart(10, "0")} 00000 n `),
  ];
  chunks.push(
    Buffer.from(
      `${xrefRows.join("\n")}\ntrailer\n<< /Size ${
        objects.length + 1
      } /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`,
      "binary",
    ),
  );

  return Buffer.concat(chunks);
}

export async function buildMaskedPdfChunk({
  chunk,
  pdfBuffer,
  renderedPages,
}: {
  chunk: AIPdfSegmentChunk;
  pdfBuffer: Buffer;
  renderedPages?: RenderedPage[];
}) {
  const pages =
    renderedPages ??
    (await renderPdfPageNumbers(pdfBuffer, chunk.sourcePages, 2.2));
  const byPage = new Map(pages.map((page) => [page.page, page]));
  const rasterPages: RasterPdfPage[] = [];

  for (const sourcePage of chunk.sourcePages) {
    const renderedPage = byPage.get(sourcePage);

    if (!renderedPage) {
      throw new Error(`Could not render source page ${sourcePage} for segmented PDF.`);
    }

    rasterPages.push(
      await maskedRgbPage(renderedPage, maskForPage(chunk.masks, sourcePage)),
    );
  }

  return {
    pageMapping: chunk.pageMapping,
    pdfBytes: writeRasterPdf(rasterPages),
  };
}

export async function buildBoundaryPreview({
  pdfBuffer,
  sourcePage,
}: {
  pdfBuffer: Buffer;
  sourcePage: number;
}) {
  const [page] = await renderPdfPageNumbers(pdfBuffer, [sourcePage], 1.15);

  if (!page) {
    throw new Error(`Could not render source page ${sourcePage}.`);
  }

  return buildBoundaryPreviewFromRenderedPage(page);
}

export async function buildBoundaryPreviewFromRenderedPage(
  page: RenderedPage,
) {

  const { data, info } = await sharp(page.png)
    .grayscale()
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const rowDensity: number[] = [];

  for (let y = 0; y < info.height; y += 1) {
    let dark = 0;

    for (let x = 0; x < info.width; x += 2) {
      if (data[y * info.width + x] < 235) {
        dark += 1;
      }
    }

    rowDensity.push(dark / Math.ceil(info.width / 2));
  }

  const windowRadius = Math.max(4, Math.round(info.height * 0.008));
  let bestRow = Math.round(info.height * 0.5);
  let bestScore = Number.POSITIVE_INFINITY;

  for (
    let y = Math.round(info.height * 0.12);
    y < Math.round(info.height * 0.88);
    y += 1
  ) {
    let score = 0;

    for (let offset = -windowRadius; offset <= windowRadius; offset += 1) {
      score += rowDensity[y + offset] ?? 1;
    }

    score += Math.abs(y / info.height - 0.5) * 0.03;

    if (score < bestScore) {
      bestScore = score;
      bestRow = y;
    }
  }

  const preview = await sharp(page.png)
    .jpeg({ quality: 82 })
    .toBuffer();

  return {
    height: page.height,
    imageDataUrl: `data:image/jpeg;base64,${preview.toString("base64")}`,
    sourcePage: page.page,
    suggestedSplitY: bestRow / info.height,
    width: page.width,
  };
}
