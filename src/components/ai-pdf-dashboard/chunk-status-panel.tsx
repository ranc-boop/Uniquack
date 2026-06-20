import { Badge } from "@/components/ui/badge";
import {
  type AIPdfChunkingSummary,
  formatAIPdfChunkPageRange,
  type AIPdfImportChunkSummary,
} from "@/lib/ai-pdf-import/chunking";

const TECHNICAL_DETAIL_LIMIT = 1200;

export type LegacyAIPdfChunk = {
  label: string;
  pages: string;
  status: string;
};

function safeTechnicalDetail(value: unknown) {
  const raw =
    typeof value === "string"
      ? value
      : value === undefined || value === null
        ? ""
        : JSON.stringify(value, null, 2);

  if (!raw.trim()) {
    return "";
  }

  return raw
    .replace(
      /https?:\/\/\S*(?:ai-import-sources|X-Amz-Signature|token=)\S*/gi,
      "[private source URL redacted]",
    )
    .replace(/\bsk-[A-Za-z0-9_-]+/g, "[api key redacted]")
    .replace(/\bAIza[A-Za-z0-9_-]+/g, "[api key redacted]")
    .replace(
      /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
      "[jwt redacted]",
    )
    .replace(/\bAI_PROVIDER_[A-Z0-9_]+\b/g, "[server provider setting redacted]")
    .replace(/\bSUPABASE_SERVICE_ROLE[A-Z0-9_]*\b/g, "[server setting redacted]")
    .slice(0, TECHNICAL_DETAIL_LIMIT);
}

function chunkStatusClass(status: string) {
  if (status === "completed") {
    return "border-emerald-200 bg-emerald-50 text-emerald-900";
  }

  if (status === "failed") {
    return "border-destructive/30 bg-destructive/10 text-destructive";
  }

  if (status === "running" || status === "queued") {
    return "border-amber-200 bg-amber-50 text-amber-900";
  }

  if (status === "partial") {
    return "border-blue-200 bg-blue-50 text-blue-900";
  }

  return "border-muted bg-background text-muted-foreground";
}

function chunkDebugLine(chunk: AIPdfImportChunkSummary) {
  const parts = [
    chunk.provider,
    chunk.model,
    chunk.inputStrategy,
    chunk.createdQuestionIds?.length
      ? `created ${chunk.createdQuestionIds.length}`
      : "",
  ].filter(Boolean);

  return parts.join(" / ");
}

function conciseChunkError(value: unknown) {
  const detail = safeTechnicalDetail(value);

  if (!detail) {
    return "";
  }

  if (/503|high demand|UNAVAILABLE/i.test(detail)) {
    return "Provider temporarily unavailable (503): model is experiencing high demand. Retry this chunk later.";
  }

  if (/timeout|timed out|524/i.test(detail)) {
    return "Provider timed out. Retry this chunk later or use a smaller page range.";
  }

  if (/invalid json|non-json|json/i.test(detail)) {
    return "Provider returned invalid JSON for this chunk. Retry may succeed.";
  }

  return detail
    .replace(/Provider response:[\s\S]*$/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240);
}

export function ChunkStatusPanel({
  chunking,
  executionMode,
  legacyChunks,
  runningChunkCount,
}: {
  chunking: AIPdfChunkingSummary | null;
  executionMode?: string;
  legacyChunks: LegacyAIPdfChunk[];
  runningChunkCount: number;
}) {
  return (
    <div className="rounded-md border bg-muted/20 p-3">
      <p className="text-sm font-medium">
        {executionMode === "segmented_full_pdf"
          ? "Masked full-PDF segments"
          : "Long PDF / chunks"}
      </p>
      {executionMode === "segmented_full_pdf" ? (
        <p className="mt-1 text-xs text-muted-foreground">
          Boundary pages appear in adjacent segments with complementary white
          masks. Visible source content does not overlap.
        </p>
      ) : null}
      {chunking ? (
        <div className="mt-2 space-y-2 text-xs">
          <div className="grid gap-2 sm:grid-cols-2">
            <p className="rounded border bg-background p-2">
              Total chunks: {chunking.totalChunks}
            </p>
            <p className="rounded border bg-background p-2">
              Completed: {chunking.completedChunks} / Failed:{" "}
              {chunking.failedChunks}
            </p>
            <p className="rounded border bg-background p-2">
              Running or queued: {runningChunkCount}
            </p>
            <p className="rounded border bg-background p-2">
              Mode: {chunking.mode}
            </p>
          </div>
          {chunking.chunkSizePages || chunking.overlapPages ? (
            <p className="text-muted-foreground">
              Chunk size: {chunking.chunkSizePages ?? "-"} pages
              {" | "}
              Overlap: {chunking.overlapPages ?? 0} pages
            </p>
          ) : null}
          <div className="space-y-2">
            {chunking.chunks.slice(0, 8).map((chunk) => (
              <div
                key={chunk.id}
                className={`rounded border p-2 ${chunkStatusClass(
                  chunk.status,
                )}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium">Chunk {chunk.chunkIndex + 1}</p>
                  <Badge variant="outline">{chunk.status}</Badge>
                </div>
                <p>
                  {formatAIPdfChunkPageRange(chunk)}
                  {chunk.overlapPages?.length
                    ? ` / overlap ${chunk.overlapPages.join(", ")}`
                    : ""}
                </p>
                <p>
                  Questions: {chunk.questionCount ?? "-"}
                  {" | "}
                  Warnings: {chunk.warningCount ?? 0}
                  {" | "}
                  Retries: {chunk.retryCount ?? 0}
                </p>
                {chunkDebugLine(chunk) ? <p>{chunkDebugLine(chunk)}</p> : null}
                {chunk.status === "failed" ? (
                  <div className="space-y-1">
                    {conciseChunkError(chunk.errorMessage) ? (
                      <p>Error: {conciseChunkError(chunk.errorMessage)}</p>
                    ) : null}
                    <p>
                      {executionMode === "segmented_full_pdf"
                        ? "Super admins can retry this failed full-PDF segment without rerunning completed segments."
                        : "Failed chunk retry is available to super admins through the retry action foundation."}
                    </p>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
          {chunking.chunks.length > 8 ? (
            <p className="text-muted-foreground">
              {chunking.chunks.length - 8} more chunks hidden from this compact
              preview.
            </p>
          ) : null}
          {chunking.mergeStatus ? (
            <p className="text-muted-foreground">
              Merge status: {chunking.mergeStatus}
            </p>
          ) : null}
        </div>
      ) : executionMode === "single_full_pdf" ? (
        <p className="mt-2 text-xs text-muted-foreground">
          This import used one full-PDF provider request. No chunk jobs were
          scheduled.
        </p>
      ) : legacyChunks.length ? (
        <div className="mt-2 space-y-2 text-xs">
          {legacyChunks.slice(0, 5).map((chunk) => (
            <div
              key={`${chunk.label}-${chunk.pages}-${chunk.status}`}
              className="rounded border bg-background p-2"
            >
              <p className="font-medium">{chunk.label}</p>
              <p className="text-muted-foreground">
                {chunk.pages ? `${chunk.pages} / ` : ""}
                {chunk.status}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-2 text-xs text-muted-foreground">
          Chunk details are not available for this import yet.
        </p>
      )}
    </div>
  );
}
