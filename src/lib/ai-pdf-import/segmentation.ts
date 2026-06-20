import type {
  AIPdfChunkingSummary,
  AIPdfImportChunkSummary,
} from "./chunking";

export type AIPdfExecutionMode =
  | "single_full_pdf"
  | "segmented_full_pdf"
  | "page_image_chunks";

export const DEFAULT_SEGMENT_TARGET_PAGES = 50;

export type AIPdfManualBoundary = {
  confirmedAt?: string;
  confirmedBy?: string;
  id: string;
  sourcePage: number;
  splitY: number;
  status: "suggested" | "confirmed";
};

export type AIPdfSegmentMask = {
  sourcePage: number;
  splitY: number;
  type: "white_above" | "white_below";
};

export type AIPdfSegmentChunk = {
  chunkIndex: number;
  id: string;
  masks: AIPdfSegmentMask[];
  pageEnd: number;
  pageMapping: { chunkPage: number; sourcePage: number }[];
  pageStart: number;
  sourcePages: number[];
};

export type AIPdfManualSegmentationPlan = {
  boundaries: AIPdfManualBoundary[];
  chunks: AIPdfSegmentChunk[];
  confirmedAt?: string;
  mode: "segmented_full_pdf";
  pageCount: number;
  status: "draft" | "confirmed";
  targetPages: number;
  version: "masked_boundaries_v1";
};

function clampSplitY(value: number) {
  return Math.max(0.05, Math.min(0.95, value));
}

function sourcePages(start: number, end: number) {
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

export function suggestedBoundaryPages({
  pageCount,
  targetPages,
}: {
  pageCount: number;
  targetPages: number;
}) {
  const chunkCount = Math.max(1, Math.ceil(pageCount / targetPages));

  if (chunkCount === 1) {
    return [];
  }

  return Array.from({ length: chunkCount - 1 }, (_, index) =>
    Math.max(
      1,
      Math.min(pageCount - 1, Math.round(((index + 1) * pageCount) / chunkCount)),
    ),
  );
}

export function buildManualSegmentationPlan({
  boundaries,
  confirmedAt,
  pageCount,
  status,
  targetPages,
}: {
  boundaries: AIPdfManualBoundary[];
  confirmedAt?: string;
  pageCount: number;
  status: "draft" | "confirmed";
  targetPages: number;
}): AIPdfManualSegmentationPlan {
  const normalizedBoundaries = boundaries
    .map((boundary, index) => ({
      ...boundary,
      id: boundary.id || `boundary-${index + 1}`,
      sourcePage: Math.max(1, Math.min(pageCount, Math.round(boundary.sourcePage))),
      splitY: clampSplitY(Number(boundary.splitY)),
      status: status === "confirmed" ? ("confirmed" as const) : boundary.status,
    }))
    .filter((boundary) => boundary.sourcePage < pageCount)
    .sort((left, right) => left.sourcePage - right.sourcePage)
    .filter(
      (boundary, index, list) =>
        index === 0 || boundary.sourcePage !== list[index - 1].sourcePage,
    );
  const chunks: AIPdfSegmentChunk[] = [];

  for (let index = 0; index <= normalizedBoundaries.length; index += 1) {
    const previousBoundary = normalizedBoundaries[index - 1];
    const nextBoundary = normalizedBoundaries[index];
    const pageStart = previousBoundary?.sourcePage ?? 1;
    const pageEnd = nextBoundary?.sourcePage ?? pageCount;
    const pages = sourcePages(pageStart, pageEnd);
    const masks: AIPdfSegmentMask[] = [];

    if (previousBoundary) {
      masks.push({
        sourcePage: previousBoundary.sourcePage,
        splitY: previousBoundary.splitY,
        type: "white_above",
      });
    }

    if (nextBoundary) {
      masks.push({
        sourcePage: nextBoundary.sourcePage,
        splitY: nextBoundary.splitY,
        type: "white_below",
      });
    }

    chunks.push({
      chunkIndex: index,
      id: `segment-${index + 1}`,
      masks,
      pageEnd,
      pageMapping: pages.map((sourcePage, pageIndex) => ({
        chunkPage: pageIndex + 1,
        sourcePage,
      })),
      pageStart,
      sourcePages: pages,
    });
  }

  return {
    boundaries: normalizedBoundaries,
    chunks,
    confirmedAt,
    mode: "segmented_full_pdf",
    pageCount,
    status,
    targetPages,
    version: "masked_boundaries_v1",
  };
}

export function normalizeManualSegmentationPlan(
  value: unknown,
): AIPdfManualSegmentationPlan | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const input = value as Record<string, unknown>;
  const pageCount = Number(input.pageCount);
  const targetPages = Number(input.targetPages);
  const rawBoundaries = Array.isArray(input.boundaries) ? input.boundaries : [];

  if (!Number.isInteger(pageCount) || pageCount < 1) {
    return null;
  }

  const boundaries = rawBoundaries.flatMap((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return [];
    }

    const boundary = item as Record<string, unknown>;
    const sourcePage = Number(boundary.sourcePage);
    const splitY = Number(boundary.splitY);

    if (
      !Number.isInteger(sourcePage) ||
      sourcePage < 1 ||
      sourcePage >= pageCount ||
      !Number.isFinite(splitY)
    ) {
      return [];
    }

    return [
      {
        confirmedAt:
          typeof boundary.confirmedAt === "string"
            ? boundary.confirmedAt
            : undefined,
        confirmedBy:
          typeof boundary.confirmedBy === "string"
            ? boundary.confirmedBy
            : undefined,
        id:
          typeof boundary.id === "string" && boundary.id
            ? boundary.id
            : `boundary-${index + 1}`,
        sourcePage,
        splitY: clampSplitY(splitY),
        status:
          boundary.status === "confirmed"
            ? ("confirmed" as const)
            : ("suggested" as const),
      },
    ];
  });
  const status = input.status === "confirmed" ? "confirmed" : "draft";

  return buildManualSegmentationPlan({
    boundaries,
    confirmedAt:
      typeof input.confirmedAt === "string" ? input.confirmedAt : undefined,
    pageCount,
    status,
    targetPages:
      Number.isInteger(targetPages) && targetPages >= 1 && targetPages <= 100
        ? targetPages
        : DEFAULT_SEGMENT_TARGET_PAGES,
  });
}

export function chunkingSummaryFromSegmentationPlan(
  plan: AIPdfManualSegmentationPlan,
): AIPdfChunkingSummary {
  const chunks: AIPdfImportChunkSummary[] = plan.chunks.map((chunk) => ({
    chunkIndex: chunk.chunkIndex,
    id: chunk.id,
    overlapPages: [],
    pageEnd: chunk.pageEnd,
    pageStart: chunk.pageStart,
    sourcePages: chunk.sourcePages,
    status: "planned",
    warningCount: 0,
  }));

  return {
    chunkSizePages: plan.targetPages,
    chunks,
    completedChunks: 0,
    enabled: true,
    failedChunks: 0,
    mergeStatus: "not_started",
    mergeWarnings: [],
    mode: "sequential",
    overlapPages: 0,
    pageCount: plan.pageCount,
    totalChunks: chunks.length,
  };
}

export function segmentChunkForIndex(
  plan: AIPdfManualSegmentationPlan,
  chunkIndex: number,
) {
  return plan.chunks.find((chunk) => chunk.chunkIndex === chunkIndex) ?? null;
}
