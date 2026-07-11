export type AIPdfChunkStatus =
  | "planned"
  | "queued"
  | "running"
  | "retrying"
  | "completed"
  | "partial"
  | "failed"
  | "skipped";

export type AIPdfImportChunkSummary = {
  attemptCount?: number;
  completedAt?: string;
  chunkIndex: number;
  createdQuestionIds?: string[];
  errorMessage?: string;
  id: string;
  inputStrategy?: string;
  model?: string;
  maxAttempts?: number;
  nextAction?: string;
  overlapPages?: number[];
  pageEnd: number;
  pageStart: number;
  provider?: string;
  questionCount?: number;
  retryCount?: number;
  retryable?: boolean;
  safeErrorCode?: string;
  sourcePages?: number[];
  startedAt?: string;
  status: AIPdfChunkStatus;
  lastAttemptAt?: string;
  warningCount?: number;
  warnings?: string[];
};

export type AIPdfChunkingSummary = {
  chunkSizePages?: number;
  chunks: AIPdfImportChunkSummary[];
  completedChunks: number;
  enabled: boolean;
  failedChunks: number;
  mergeStatus?:
    | "not_started"
    | "waiting_for_chunks"
    | "ready"
    | "merged"
    | "failed";
  mergeWarnings?: string[];
  mode: "foundation" | "sequential" | "queue";
  overlapPages?: number;
  pageCount?: number;
  totalChunks: number;
};

export type AIPdfPageChunkPlan = {
  chunkIndex: number;
  id: string;
  overlapPages: number[];
  pageEnd: number;
  pageStart: number;
  sourcePages: number[];
};

const DEFAULT_CHUNK_SIZE_PAGES = 3;
const DEFAULT_OVERLAP_PAGES = 1;
const VALID_CHUNK_STATUSES = new Set<AIPdfChunkStatus>([
  "planned",
  "queued",
  "running",
  "retrying",
  "completed",
  "partial",
  "failed",
  "skipped",
]);

function intOrFallback(value: unknown, fallback: number) {
  const numeric = Number(value);

  return Number.isInteger(numeric) ? numeric : fallback;
}

function pageNumbers(start: number, end: number) {
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function numberList(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => Number(item))
    .filter((item) => Number.isInteger(item) && item >= 1);
}

function stringList(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) => String(item).trim()).filter(Boolean);
}

function firstString(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];

    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return undefined;
}

function firstNumber(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    const numeric = Number(value);

    if (Number.isFinite(numeric)) {
      return numeric;
    }
  }

  return undefined;
}

function normalizeChunkStatus(value: unknown): AIPdfChunkStatus {
  const raw = typeof value === "string" ? value.trim() : "";

  return VALID_CHUNK_STATUSES.has(raw as AIPdfChunkStatus)
    ? (raw as AIPdfChunkStatus)
    : "planned";
}

export function formatAIPdfChunkPageRange(chunk: {
  pageEnd: number;
  pageStart: number;
}) {
  return chunk.pageStart === chunk.pageEnd
    ? `Page ${chunk.pageStart}`
    : `Pages ${chunk.pageStart}-${chunk.pageEnd}`;
}

export function planAIPdfPageChunks({
  chunkSizePages = DEFAULT_CHUNK_SIZE_PAGES,
  overlapPages = DEFAULT_OVERLAP_PAGES,
  pageCount,
}: {
  chunkSizePages?: number;
  overlapPages?: number;
  pageCount: number;
}): AIPdfPageChunkPlan[] {
  if (pageCount === undefined || !Number.isInteger(pageCount) || pageCount < 1) {
    return [];
  }

  if (!Number.isInteger(chunkSizePages) || chunkSizePages < 1) {
    throw new Error("chunkSizePages must be a positive integer.");
  }

  if (!Number.isInteger(overlapPages) || overlapPages < 0) {
    throw new Error("overlapPages must be a non-negative integer.");
  }

  if (overlapPages >= chunkSizePages) {
    throw new Error("overlapPages must be smaller than chunkSizePages.");
  }

  const chunks: AIPdfPageChunkPlan[] = [];
  let pageStart = 1;
  let previousPageEnd = 0;

  while (pageStart <= pageCount) {
    const pageEnd = Math.min(pageCount, pageStart + chunkSizePages - 1);
    const overlapStart =
      previousPageEnd >= pageStart ? pageStart : Number.POSITIVE_INFINITY;
    const overlapEnd = Math.min(previousPageEnd, pageEnd);
    const sharedPages =
      Number.isFinite(overlapStart) && overlapStart <= overlapEnd
        ? pageNumbers(overlapStart, overlapEnd)
        : [];

    chunks.push({
      chunkIndex: chunks.length,
      id: `chunk-${chunks.length + 1}`,
      overlapPages: sharedPages,
      pageEnd,
      pageStart,
      sourcePages: pageNumbers(pageStart, pageEnd),
    });

    if (pageEnd >= pageCount) {
      break;
    }

    previousPageEnd = pageEnd;
    pageStart = pageEnd - overlapPages + 1;
  }

  return chunks;
}

export function createAIPdfChunkingSummary({
  chunkSizePages = DEFAULT_CHUNK_SIZE_PAGES,
  overlapPages = DEFAULT_OVERLAP_PAGES,
  pageCount,
}: {
  chunkSizePages?: number;
  overlapPages?: number;
  pageCount: number;
}): AIPdfChunkingSummary {
  const plannedChunks = planAIPdfPageChunks({
    chunkSizePages,
    overlapPages,
    pageCount,
  });

  return {
    chunkSizePages,
    chunks: plannedChunks.map((chunk) => ({
      ...chunk,
      status: "planned",
      warningCount: 0,
    })),
    completedChunks: 0,
    enabled: true,
    failedChunks: 0,
    mergeStatus: "not_started",
    mergeWarnings: [
      "Chunked extraction foundation only; cross-chunk merge has not run.",
    ],
    mode: "foundation",
    overlapPages,
    pageCount,
    totalChunks: plannedChunks.length,
  };
}

export function ensureAIPdfChunkingSummary(
  aiPdfImport: Record<string, unknown>,
) {
  if (aiPdfImport.chunking) {
    return aiPdfImport.chunking;
  }

  const pageCount = firstNumber(aiPdfImport, ["pageCount", "page_count"]);

  if (pageCount === undefined || !Number.isInteger(pageCount) || pageCount < 1) {
    return undefined;
  }

  return createAIPdfChunkingSummary({ pageCount });
}

export function mergeAIPdfImportChunkingSummary(
  existingAiPdfImport: Record<string, unknown>,
  patch: Record<string, unknown> = {},
) {
  const nextAiPdfImport = {
    ...existingAiPdfImport,
    ...patch,
  };
  const chunking =
    patch.chunking ??
    existingAiPdfImport.chunking ??
    ensureAIPdfChunkingSummary(nextAiPdfImport);

  if (chunking) {
    nextAiPdfImport.chunking = chunking;
  }

  return nextAiPdfImport;
}

function recomputeAIPdfChunkingSummary(
  current: AIPdfChunkingSummary,
): AIPdfChunkingSummary {
  const chunks = current.chunks
    .slice()
    .sort((left, right) => left.chunkIndex - right.chunkIndex);
  const completedChunks = chunks.filter(
    (chunk) => chunk.status === "completed",
  ).length;
  const failedChunks = chunks.filter((chunk) => chunk.status === "failed").length;
  const totalChunks = chunks.length || current.totalChunks;
  const hasRunningChunks = chunks.some((chunk) =>
    ["queued", "running"].includes(chunk.status),
  );
  const hasUnfinishedChunks = chunks.some((chunk) =>
    ["planned", "queued", "running"].includes(chunk.status),
  );
  const mergeStatus =
    failedChunks > 0
      ? hasUnfinishedChunks
        ? "waiting_for_chunks"
        : "failed"
      : totalChunks > 0 && completedChunks === totalChunks
        ? "ready"
        : hasRunningChunks || completedChunks > 0
          ? "waiting_for_chunks"
          : current.mergeStatus ?? "not_started";

  return {
    ...current,
    chunks,
    completedChunks,
    failedChunks,
    mergeStatus,
    totalChunks,
  };
}

export function normalizeAIPdfChunkingSummary(
  value: unknown,
): AIPdfChunkingSummary | null {
  const input = asRecord(value);
  const rawChunks = Array.isArray(input.chunks) ? input.chunks : [];

  if (!input.enabled && !rawChunks.length) {
    return null;
  }

  const chunks = rawChunks
    .map((chunk, index): AIPdfImportChunkSummary | null => {
      const record = asRecord(chunk);
      const pageStart = intOrFallback(
        record.pageStart ?? record.page_start,
        Number.NaN,
      );
      const pageEnd = intOrFallback(
        record.pageEnd ?? record.page_end,
        Number.NaN,
      );

      if (
        !Number.isInteger(pageStart) ||
        !Number.isInteger(pageEnd) ||
        pageStart < 1 ||
        pageEnd < pageStart
      ) {
        return null;
      }

      const warnings = stringList(record.warnings);

      return {
        chunkIndex: intOrFallback(record.chunkIndex ?? record.chunk_index, index),
        completedAt: firstString(record, ["completedAt", "completed_at"]),
        createdQuestionIds: stringList(
          record.createdQuestionIds ?? record.created_question_ids,
        ),
        errorMessage: firstString(record, ["errorMessage", "error"]),
        id: firstString(record, ["id"]) ?? `chunk-${index + 1}`,
        inputStrategy: firstString(record, ["inputStrategy", "input_strategy"]),
        model: firstString(record, ["model"]),
        overlapPages: numberList(record.overlapPages ?? record.overlap_pages),
        pageEnd,
        pageStart,
        provider: firstString(record, ["provider"]),
        questionCount: firstNumber(record, ["questionCount", "question_count"]),
        retryCount: firstNumber(record, ["retryCount", "retry_count"]),
        sourcePages: numberList(record.sourcePages ?? record.source_pages),
        startedAt: firstString(record, ["startedAt", "started_at"]),
        status: normalizeChunkStatus(record.status),
        warningCount:
          firstNumber(record, ["warningCount", "warning_count"]) ??
          warnings.length,
        warnings,
      };
    })
    .filter((chunk): chunk is AIPdfImportChunkSummary => Boolean(chunk))
    .sort((left, right) => left.chunkIndex - right.chunkIndex);

  const totalChunks =
    firstNumber(input, ["totalChunks", "total_chunks"]) ?? chunks.length;
  const mode =
    input.mode === "sequential" || input.mode === "queue"
      ? input.mode
      : "foundation";

  return recomputeAIPdfChunkingSummary({
    chunkSizePages: firstNumber(input, ["chunkSizePages", "chunk_size_pages"]),
    chunks,
    completedChunks: 0,
    enabled: Boolean(input.enabled ?? chunks.length),
    failedChunks: 0,
    mergeStatus:
      input.mergeStatus === "waiting_for_chunks" ||
      input.mergeStatus === "ready" ||
      input.mergeStatus === "merged" ||
      input.mergeStatus === "failed"
        ? input.mergeStatus
        : "not_started",
    mergeWarnings: stringList(input.mergeWarnings ?? input.merge_warnings),
    mode,
    overlapPages: firstNumber(input, ["overlapPages", "overlap_pages"]),
    pageCount: firstNumber(input, ["pageCount", "page_count"]),
    totalChunks,
  });
}

export function patchAIPdfChunkingSummary({
  chunkIndex,
  pageCount,
  patch,
  value,
}: {
  chunkIndex: number;
  pageCount: number;
  patch: Partial<AIPdfImportChunkSummary>;
  value: unknown;
}): AIPdfChunkingSummary {
  const current =
    normalizeAIPdfChunkingSummary(value) ??
    createAIPdfChunkingSummary({ pageCount });
  const chunks = current.chunks
    .map((chunk) =>
      chunk.chunkIndex === chunkIndex
        ? {
            ...chunk,
            ...patch,
            chunkIndex: chunk.chunkIndex,
            id: patch.id ?? chunk.id,
            pageEnd: patch.pageEnd ?? chunk.pageEnd,
            pageStart: patch.pageStart ?? chunk.pageStart,
            sourcePages: patch.sourcePages ?? chunk.sourcePages,
            warningCount:
              patch.warningCount ??
              (patch.warnings ? patch.warnings.length : chunk.warningCount),
          }
        : chunk,
    )
    .sort((left, right) => left.chunkIndex - right.chunkIndex);
  return recomputeAIPdfChunkingSummary({
    ...current,
    chunks,
    completedChunks: 0,
    failedChunks: 0,
    mode: "sequential",
    pageCount: current.pageCount ?? pageCount,
    totalChunks: chunks.length,
  });
}
