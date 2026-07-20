import "server-only";

import type {
  AIPdfBurstItemSafeStatus,
  AIPdfBurstSafeItem,
  AIPdfBurstSafeStatus,
  AIPdfBurstSafeSummary,
} from "@/lib/ai-pdf-import/burst-contract";

export type { AIPdfBurstSafeSummary } from "@/lib/ai-pdf-import/burst-contract";

type SupabaseLike = any;

function isMissingBurstSchema(error: { code?: string; message?: string } | null) {
  const message = error?.message?.toLowerCase() ?? "";
  return (
    error?.code === "42P01" ||
    error?.code === "42883" ||
    error?.code === "PGRST202" ||
    error?.code === "PGRST204" ||
    error?.code === "PGRST205" ||
    message.includes("ai_pdf_upload_burst") ||
    message.includes("release_ai_pdf_burst_admission_jobs")
  );
}

function numberValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0;
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function normalizeItem(row: Record<string, unknown>): AIPdfBurstSafeItem {
  return {
    clientItemKey: stringValue(row.client_item_key),
    itemIndex: numberValue(row.item_index),
    originalFilename: stringValue(row.original_filename) || "Private PDF",
    pageCount: row.page_count == null ? null : numberValue(row.page_count),
    safeErrorCode: stringValue(row.safe_error_code) || null,
    status: stringValue(row.status) as AIPdfBurstItemSafeStatus,
  };
}

export async function listAIPdfBurstsForBank({
  bankId,
  limit = 8,
  supabase,
}: {
  bankId: string;
  limit?: number;
  supabase: SupabaseLike;
}): Promise<{ available: boolean; bursts: AIPdfBurstSafeSummary[] }> {
  const { data: burstRows, error: burstError } = await supabase
    .from("ai_pdf_upload_bursts")
    .select(
      "id, target_bank_id, status, item_count, reserved_count, admission_ready_count, queued_count, processing_count, completed_count, failed_count, cancelled_count, created_at",
    )
    .eq("target_bank_id", bankId)
    .order("created_at", { ascending: false })
    .limit(Math.max(1, Math.min(limit, 20)));

  if (isMissingBurstSchema(burstError)) {
    return { available: false, bursts: [] };
  }
  if (burstError) throw new Error("Could not load PDF upload batches.");

  const burstIds = (burstRows ?? []).map((row: { id: string }) => row.id);
  let itemRows: Record<string, unknown>[] = [];
  if (burstIds.length) {
    const { data, error } = await supabase
      .from("ai_pdf_upload_burst_items")
      .select(
        "burst_id, client_item_key, item_index, original_filename, page_count, safe_error_code, status",
      )
      .in("burst_id", burstIds)
      .order("item_index", { ascending: true });
    if (error) throw new Error("Could not load PDF upload item status.");
    itemRows = data ?? [];
  }

  return {
    available: true,
    bursts: (burstRows ?? []).map((row: Record<string, unknown>) => ({
      admissionReadyCount: numberValue(row.admission_ready_count),
      cancelledCount: numberValue(row.cancelled_count),
      completedCount: numberValue(row.completed_count),
      createdAt: stringValue(row.created_at),
      failedCount: numberValue(row.failed_count),
      id: stringValue(row.id),
      itemCount: numberValue(row.item_count),
      items: itemRows
        .filter((item) => item.burst_id === row.id)
        .map(normalizeItem),
      processingCount: numberValue(row.processing_count),
      queuedCount: numberValue(row.queued_count),
      reservedCount: numberValue(row.reserved_count),
      status: stringValue(row.status) as AIPdfBurstSafeStatus,
      targetBankId: stringValue(row.target_bank_id),
    })),
  };
}

export async function releaseAIPdfBurstAdmissionJobs({
  burstId = null,
  limit = 4,
  supabase,
}: {
  burstId?: string | null;
  limit?: number;
  supabase: SupabaseLike;
}) {
  const { data, error } = await supabase.rpc(
    "release_ai_pdf_burst_admission_jobs",
    {
      p_burst_id: burstId,
      p_limit: Math.max(1, Math.min(limit, 12)),
    },
  );

  if (isMissingBurstSchema(error)) {
    return { available: false, releasedCount: 0, waitingCount: 0 };
  }
  if (error) {
    return { available: true, releasedCount: 0, waitingCount: 0 };
  }

  const row = Array.isArray(data) ? data[0] : data;
  return {
    available: true,
    releasedCount: numberValue(row?.released_count),
    waitingCount: numberValue(row?.waiting_count),
  };
}
