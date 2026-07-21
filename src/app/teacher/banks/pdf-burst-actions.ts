"use server";

import { Buffer } from "node:buffer";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  AI_IMPORT_SOURCES_BUCKET,
  AI_PDF_IMPORT_MAX_BYTES,
  AI_PDF_IMPORT_MAX_PAGES,
} from "@/lib/ai-pdf-import/constants";
import { createAIPdfChunkingSummary } from "@/lib/ai-pdf-import/chunking";
import {
  AI_PDF_BURST_MAX_FILES,
  AI_PDF_BURST_UPLOAD_CONCURRENCY,
  type AIPdfBurstItemSafeStatus,
} from "@/lib/ai-pdf-import/burst-contract";
import { releaseAIPdfBurstAdmissionJobs } from "@/lib/ai-pdf-import/burst-admission";
import { getPdfPageCount } from "@/lib/ai-pdf-import/pdf";
import {
  resolveTeacherAIPdfProviderProfile,
  TEACHER_AI_PDF_PARSING_PROFILES,
} from "@/lib/ai-pdf-import/teacher-parsing-profiles";
import { requireTeacher } from "@/lib/auth/guards";
import {
  canManageBankContent,
  getTeacherQuestionBankDetail,
} from "@/lib/question-banks";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database";

const reserveBurstSchema = z.object({
  bankId: z.string().uuid(),
  clientRequestKey: z.string().uuid(),
  items: z
    .array(
      z.object({
        clientItemKey: z.string().uuid(),
        mimeType: z.literal("application/pdf"),
        originalFilename: z.string().trim().min(1).max(255),
        sizeBytes: z.number().int().positive().max(AI_PDF_IMPORT_MAX_BYTES),
      }),
    )
    .min(1)
    .max(AI_PDF_BURST_MAX_FILES),
  parsingProfile: z.enum(TEACHER_AI_PDF_PARSING_PROFILES).default("standard"),
});

const finalizeBurstItemSchema = z.object({
  burstId: z.string().uuid(),
  itemId: z.string().uuid(),
  uploadAttemptId: z.string().uuid(),
});

const cancelBurstSchema = z.object({
  burstId: z.string().uuid(),
});

type BurstReservationRow = {
  burst_id: string;
  client_item_key: string;
  expected_mime_type: string;
  expected_size_bytes: number;
  import_batch_id: string;
  item_id: string;
  item_index: number;
  item_status: AIPdfBurstItemSafeStatus;
  object_path: string;
  original_filename: string;
  source_asset_id: string;
  upload_attempt_id: string;
};

type BurstItemRow = {
  burst_id: string;
  expected_size_bytes: number;
  import_batch_id: string;
  original_filename: string;
  object_path: string;
  page_count: number | null;
  safe_error_code: string | null;
  source_asset_id: string;
  status: AIPdfBurstItemSafeStatus;
  upload_attempt_id: string;
};

function plainObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function hasPdfSignature(buffer: Buffer) {
  return buffer.length >= 5 && buffer.subarray(0, 5).toString("ascii") === "%PDF-";
}

async function mapWithConcurrency<T, R>(
  values: T[],
  limit: number,
  mapValue: (value: T) => Promise<R>,
) {
  const results = new Array<R>(values.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapValue(values[index]!);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, values.length) }, () => worker()),
  );
  return results;
}

async function requireManagedBank(bankId: string) {
  const profile = await requireTeacher();
  const supabase = await createClient();
  const detail = await getTeacherQuestionBankDetail({
    bankId,
    profileId: profile.id,
    supabase,
  });

  if (!detail || !canManageBankContent(detail.currentUserRole)) {
    throw new Error("Only Bank owners or editors can manage PDF uploads.");
  }
  if (detail.bank.status !== "active") {
    throw new Error("Only active Banks can receive PDF imports.");
  }

  return { detail, profile, supabase };
}

export async function reserveTeacherAIPdfBurst(input: unknown) {
  const parsed = reserveBurstSchema.parse(input);
  const { detail, profile, supabase } = await requireManagedBank(parsed.bankId);
  const provider = await resolveTeacherAIPdfProviderProfile({
    parsingProfile: parsed.parsingProfile,
    supabase,
  });
  const service = createServiceRoleClient() as any;
  const { data, error } = await service.rpc("reserve_ai_pdf_upload_burst", {
    p_client_request_key: parsed.clientRequestKey,
    p_created_by: profile.id,
    p_items: parsed.items,
    p_parsing_profile: parsed.parsingProfile,
    p_provider_profile_id: provider.id,
    p_target_bank_id: detail.bank.id,
  });

  if (error || !Array.isArray(data) || data.length !== parsed.items.length) {
    throw new Error(
      "Could not reserve this PDF batch. Check the files and try again.",
    );
  }

  const rows = data as BurstReservationRow[];
  const grants = await mapWithConcurrency(
    rows,
    AI_PDF_BURST_UPLOAD_CONCURRENCY,
    async (row) => {
      if (row.item_status !== "reserved") {
        return { row, token: null as string | null };
      }

      const { data: signed, error: signedError } = await service.storage
        .from(AI_IMPORT_SOURCES_BUCKET)
        .createSignedUploadUrl(row.object_path, { upsert: false });
      if (signedError || !signed?.token) {
        throw new Error("Could not create a private upload grant.");
      }
      return { row, token: signed.token as string | null };
    },
  );

  return {
    burstId: rows[0]!.burst_id,
    items: grants.map(({ row, token }) => ({
      clientItemKey: row.client_item_key,
      itemId: row.item_id,
      objectPath: row.object_path,
      originalFilename: row.original_filename,
      sizeBytes: Number(row.expected_size_bytes),
      status: row.item_status,
      token,
      uploadAttemptId: row.upload_attempt_id,
    })),
    maximumBatchSize: AI_PDF_BURST_MAX_FILES,
    targetBankId: detail.bank.id,
    uploadConcurrency: AI_PDF_BURST_UPLOAD_CONCURRENCY,
  };
}

async function markBurstItemFailed({
  batchId,
  burstId,
  itemId,
  safeErrorCode,
  sourceAssetId,
  service,
}: {
  batchId: string;
  burstId: string;
  itemId: string;
  safeErrorCode: string;
  sourceAssetId: string;
  service: any;
}) {
  await service
    .from("import_batch_assets")
    .update({
      metadata: { uploadState: "failed", safeErrorCode },
      status: "failed",
    })
    .eq("id", sourceAssetId);
  await service
    .from("import_batches")
    .update({
      status: "failed",
      summary: {
        aiPdfImport: {
          phase: "source_upload_failed",
          safeErrorCode,
        },
        reviewGate: "bank_review_required",
      } as Json,
    })
    .eq("id", batchId);
  await service
    .from("ai_pdf_upload_burst_items")
    .update({ safe_error_code: safeErrorCode, status: "failed" })
    .eq("id", itemId)
    .eq("burst_id", burstId)
    .eq("status", "finalizing");
}

function safeFinalizeResult(item: BurstItemRow) {
  return {
    originalFilename: item.original_filename,
    pageCount: item.page_count,
    safeErrorCode: item.safe_error_code,
    status: item.status,
  };
}

export async function finalizeTeacherAIPdfBurstItem(input: unknown) {
  const parsed = finalizeBurstItemSchema.parse(input);
  const service = createServiceRoleClient() as any;
  const { data: burst, error: burstError } = await service
    .from("ai_pdf_upload_bursts")
    .select("id, target_bank_id")
    .eq("id", parsed.burstId)
    .maybeSingle();
  if (burstError || !burst) throw new Error("PDF upload batch was not found.");

  await requireManagedBank(burst.target_bank_id as string);

  const { data: initialItem, error: itemError } = await service
    .from("ai_pdf_upload_burst_items")
    .select(
      "burst_id, expected_size_bytes, import_batch_id, original_filename, object_path, page_count, safe_error_code, source_asset_id, status, upload_attempt_id",
    )
    .eq("id", parsed.itemId)
    .eq("burst_id", parsed.burstId)
    .eq("upload_attempt_id", parsed.uploadAttemptId)
    .maybeSingle();
  if (itemError || !initialItem) throw new Error("PDF upload item was not found.");

  const item = initialItem as BurstItemRow;
  if (item.status !== "reserved") {
    if (item.status === "admission_ready") {
      await releaseAIPdfBurstAdmissionJobs({
        burstId: parsed.burstId,
        limit: 4,
        supabase: service,
      });
      const { data: refreshed } = await service
        .from("ai_pdf_upload_burst_items")
        .select(
          "burst_id, expected_size_bytes, import_batch_id, original_filename, object_path, page_count, safe_error_code, source_asset_id, status, upload_attempt_id",
        )
        .eq("id", parsed.itemId)
        .maybeSingle();
      if (refreshed) return safeFinalizeResult(refreshed as BurstItemRow);
    }
    return safeFinalizeResult(item);
  }

  const { data: claimed, error: claimError } = await service
    .from("ai_pdf_upload_burst_items")
    .update({ safe_error_code: null, status: "finalizing" })
    .eq("id", parsed.itemId)
    .eq("burst_id", parsed.burstId)
    .eq("status", "reserved")
    .select("id")
    .maybeSingle();
  if (claimError) throw new Error("Could not begin PDF validation.");
  if (!claimed) return { ...safeFinalizeResult(item), status: "finalizing" as const };

  try {
    const directory = item.object_path.slice(0, item.object_path.lastIndexOf("/"));
    const filename = item.object_path.slice(directory.length + 1);
    const { data: objects, error: listError } = await service.storage
      .from(AI_IMPORT_SOURCES_BUCKET)
      .list(directory, { search: filename });
    if (listError || !objects?.some((object: { name: string }) => object.name === filename)) {
      await markBurstItemFailed({
        batchId: item.import_batch_id,
        burstId: parsed.burstId,
        itemId: parsed.itemId,
        safeErrorCode: "upload_missing",
        service,
        sourceAssetId: item.source_asset_id,
      });
      return { ...safeFinalizeResult(item), safeErrorCode: "upload_missing", status: "failed" as const };
    }

    const { data: sourceBlob, error: downloadError } = await service.storage
      .from(AI_IMPORT_SOURCES_BUCKET)
      .download(item.object_path);
    if (downloadError || !sourceBlob) throw new Error("temporary_storage_failure");

    const pdfBuffer = Buffer.from(await sourceBlob.arrayBuffer());
    if (
      pdfBuffer.length !== Number(item.expected_size_bytes) ||
      pdfBuffer.length < 1 ||
      pdfBuffer.length > AI_PDF_IMPORT_MAX_BYTES
    ) {
      await markBurstItemFailed({
        batchId: item.import_batch_id,
        burstId: parsed.burstId,
        itemId: parsed.itemId,
        safeErrorCode: "size_mismatch",
        service,
        sourceAssetId: item.source_asset_id,
      });
      return { ...safeFinalizeResult(item), safeErrorCode: "size_mismatch", status: "failed" as const };
    }

    if ((sourceBlob.type && sourceBlob.type !== "application/pdf") || !hasPdfSignature(pdfBuffer)) {
      await markBurstItemFailed({
        batchId: item.import_batch_id,
        burstId: parsed.burstId,
        itemId: parsed.itemId,
        safeErrorCode: "invalid_pdf",
        service,
        sourceAssetId: item.source_asset_id,
      });
      return { ...safeFinalizeResult(item), safeErrorCode: "invalid_pdf", status: "failed" as const };
    }

    let pageCount: number;
    try {
      pageCount = await getPdfPageCount(pdfBuffer);
    } catch {
      await markBurstItemFailed({
        batchId: item.import_batch_id,
        burstId: parsed.burstId,
        itemId: parsed.itemId,
        safeErrorCode: "invalid_pdf",
        service,
        sourceAssetId: item.source_asset_id,
      });
      return { ...safeFinalizeResult(item), safeErrorCode: "invalid_pdf", status: "failed" as const };
    }

    if (pageCount < 1 || pageCount > AI_PDF_IMPORT_MAX_PAGES) {
      await markBurstItemFailed({
        batchId: item.import_batch_id,
        burstId: parsed.burstId,
        itemId: parsed.itemId,
        safeErrorCode: "page_limit",
        service,
        sourceAssetId: item.source_asset_id,
      });
      return { ...safeFinalizeResult(item), safeErrorCode: "page_limit", status: "failed" as const };
    }

    const now = new Date().toISOString();
    const { data: sourceAsset } = await service
      .from("import_batch_assets")
      .select("metadata")
      .eq("id", item.source_asset_id)
      .maybeSingle();
    const { error: assetUpdateError } = await service
      .from("import_batch_assets")
      .update({
        metadata: {
          ...plainObject(sourceAsset?.metadata),
          pageCount,
          uploadReadyAt: now,
          uploadState: "ready",
        },
        mime_type: "application/pdf",
        size_bytes: pdfBuffer.length,
        status: "ready",
      })
      .eq("id", item.source_asset_id)
      .eq("status", "pending");
    if (assetUpdateError) throw new Error("temporary_metadata_failure");

    const { data: importBatch } = await service
      .from("import_batches")
      .select("summary")
      .eq("id", item.import_batch_id)
      .maybeSingle();
    const existingSummary = plainObject(importBatch?.summary);
    const existingAiPdfImport = plainObject(existingSummary.aiPdfImport);
    const { error: batchUpdateError } = await service
      .from("import_batches")
      .update({
        status: "draft",
        summary: {
          ...existingSummary,
          aiPdfImport: {
            ...existingAiPdfImport,
            chunking: createAIPdfChunkingSummary({ pageCount }),
            fileName: item.original_filename,
            pageCount,
            phase: "source_uploaded",
            sourceAssetId: item.source_asset_id,
          },
          reviewGate: "bank_review_required",
        } as Json,
      })
      .eq("id", item.import_batch_id);
    if (batchUpdateError) throw new Error("temporary_metadata_failure");

    const { error: itemUpdateError } = await service
      .from("ai_pdf_upload_burst_items")
      .update({
        finalized_at: now,
        page_count: pageCount,
        safe_error_code: null,
        status: "admission_ready",
        verified_mime_type: "application/pdf",
        verified_size_bytes: pdfBuffer.length,
      })
      .eq("id", parsed.itemId)
      .eq("status", "finalizing");
    if (itemUpdateError) throw new Error("temporary_metadata_failure");

    await releaseAIPdfBurstAdmissionJobs({
      burstId: parsed.burstId,
      limit: 4,
      supabase: service,
    });

    const { data: finalItem } = await service
      .from("ai_pdf_upload_burst_items")
      .select(
        "burst_id, expected_size_bytes, import_batch_id, original_filename, object_path, page_count, safe_error_code, source_asset_id, status, upload_attempt_id",
      )
      .eq("id", parsed.itemId)
      .maybeSingle();

    revalidatePath(`/teacher/banks/${burst.target_bank_id}/imports`);
    revalidatePath(`/teacher/banks/${burst.target_bank_id}/review`);
    return safeFinalizeResult((finalItem ?? { ...item, page_count: pageCount, status: "admission_ready" }) as BurstItemRow);
  } catch {
    await service
      .from("ai_pdf_upload_burst_items")
      .update({
        safe_error_code: "finalize_temporarily_unavailable",
        status: "reserved",
      })
      .eq("id", parsed.itemId)
      .eq("status", "finalizing");
    throw new Error("PDF validation is temporarily unavailable. Retry this item.");
  }
}

export async function cancelTeacherAIPdfBurst(input: unknown) {
  const parsed = cancelBurstSchema.parse(input);
  const profile = await requireTeacher();
  const service = createServiceRoleClient() as any;
  const { data: burst, error } = await service
    .from("ai_pdf_upload_bursts")
    .select("id, target_bank_id")
    .eq("id", parsed.burstId)
    .maybeSingle();
  if (error || !burst) throw new Error("PDF upload batch was not found.");

  await requireManagedBank(burst.target_bank_id as string);
  const { data: cancelled, error: cancelError } = await service.rpc(
    "cancel_ai_pdf_upload_burst_items",
    { p_actor_id: profile.id, p_burst_id: parsed.burstId },
  );
  if (cancelError) throw new Error("Could not cancel remaining PDF items.");

  revalidatePath(`/teacher/banks/${burst.target_bank_id}/imports`);
  return { cancelledCount: Number(cancelled ?? 0) };
}
