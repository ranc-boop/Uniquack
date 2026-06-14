"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  AI_IMPORT_SOURCES_BUCKET,
  AI_PDF_IMPORT_MAX_BYTES,
  AI_PDF_IMPORT_MAX_PAGES,
} from "@/lib/ai-pdf-import/constants";
import {
  createAIPdfChunkingSummary,
  mergeAIPdfImportChunkingSummary,
  normalizeAIPdfChunkingSummary,
} from "@/lib/ai-pdf-import/chunking";
import {
  supportsAIPdfSequentialChunkExtraction,
  type AiPdfInputStrategy,
} from "@/lib/ai-providers/adapters";
import { getPdfPageCount } from "@/lib/ai-pdf-import/pdf";
import { processAIPdfImport } from "@/lib/ai-pdf-import/service";
import { requireAdmin, requireSuperAdmin } from "@/lib/auth/guards";
import { QUESTION_ASSETS_BUCKET } from "@/lib/question-assets";
import { createClient } from "@/lib/supabase/server";
import { uuidSchema } from "@/lib/validations/common";
import type { Json } from "@/types/database";

const extractionInputSchema = z.object({
  batchId: uuidSchema,
  providerProfileId: uuidSchema,
});

const batchInputSchema = z.object({
  batchId: uuidSchema,
});

const sourceAssetInputSchema = z.object({
  assetId: uuidSchema,
  batchId: uuidSchema,
});

const sourceAssetUploadAttemptInputSchema = sourceAssetInputSchema.extend({
  uploadAttemptId: uuidSchema,
});

const reserveSourceUploadSchema = z.object({
  mimeType: z.string().trim().min(1).max(120),
  originalFilename: z.string().trim().min(1).max(255),
  sizeBytes: z.number().int().positive().max(AI_PDF_IMPORT_MAX_BYTES),
});

const queuedExtractionInputSchema = z.object({
  batchId: uuidSchema,
  jobId: uuidSchema,
});

const retryChunkInputSchema = z.object({
  batchId: uuidSchema,
  chunkIndex: z.number().int().min(0).max(999),
  providerProfileId: uuidSchema.optional(),
});

const AI_PDF_EXTRACTION_STALE_MS = 15 * 60 * 1000;
const AI_PDF_EXTRACTION_LEASE_MS = 30 * 60 * 1000;

function safeFilename(value: string) {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120) || "ai-import.pdf";
}

function isPdfFileMetadata({
  mimeType,
  originalFilename,
}: {
  mimeType: string;
  originalFilename: string;
}) {
  return (
    mimeType === "application/pdf" ||
    originalFilename.toLowerCase().endsWith(".pdf")
  );
}

function plainObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function uniqueStrings(values: (string | null | undefined)[]) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}

function getString(value: unknown) {
  return typeof value === "string" ? value : null;
}

function getUploadAttemptId(metadata: unknown) {
  return getString(plainObject(metadata).uploadAttemptId);
}

function getAIPdfImportSummary(summary: unknown) {
  return plainObject(plainObject(summary).aiPdfImport);
}

function mergeAIPdfImportSummary(
  existingAiPdfImport: Record<string, unknown>,
  patch: Record<string, unknown> = {},
) {
  return mergeAIPdfImportChunkingSummary(existingAiPdfImport, patch);
}

export async function getAIPdfImportStatus(input: { batchId: string }) {
  await requireAdmin();
  const parsed = z.object({ batchId: uuidSchema }).parse(input);
  const supabase = await createClient();
  const [{ data: batch, error }, { data: assets, error: assetsError }] =
    await Promise.all([
      supabase
        .from("import_batches")
        .select("id, source_type, status, summary, created_at, updated_at")
        .eq("id", parsed.batchId)
        .eq("source_type", "ai_pdf")
        .single(),
      supabase
        .from("import_batch_assets")
        .select("*")
        .eq("batch_id", parsed.batchId)
        .neq("status", "deleted")
        .order("created_at", { ascending: true }),
    ]);

  if (error) {
    throw new Error(error.message);
  }

  if (assetsError) {
    throw new Error(assetsError.message);
  }

  return { assets: assets ?? [], batch };
}

async function ensureSourceAssetCanBeManaged({
  assetId,
  batchId,
  supabase,
}: {
  assetId: string;
  batchId: string;
  supabase: Awaited<ReturnType<typeof createClient>>;
}) {
  const [{ data: asset, error: assetError }, { data: batch, error: batchError }] =
    await Promise.all([
      supabase
        .from("import_batch_assets")
        .select("*")
        .eq("id", assetId)
        .eq("batch_id", batchId)
        .eq("asset_role", "source_pdf")
        .neq("status", "deleted")
        .maybeSingle(),
      supabase
        .from("import_batches")
        .select("id, source_type, status, summary")
        .eq("id", batchId)
        .eq("source_type", "ai_pdf")
        .maybeSingle(),
    ]);

  if (assetError) {
    throw new Error(assetError.message);
  }

  if (batchError) {
    throw new Error(batchError.message);
  }

  if (!asset || !batch) {
    throw new Error("AI PDF source asset was not found.");
  }

  return { asset, batch };
}

async function batchHasImportedItems({
  batchId,
  supabase,
}: {
  batchId: string;
  supabase: Awaited<ReturnType<typeof createClient>>;
}) {
  const { data, error } = await supabase
    .from("import_batch_items")
    .select("id")
    .eq("batch_id", batchId)
    .eq("status", "imported")
    .limit(1);

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).length > 0;
}

export async function createAIPdfSourceSignedUrl(input: unknown) {
  await requireAdmin();
  const parsed = sourceAssetInputSchema.parse(input);
  const supabase = await createClient();
  const { asset } = await ensureSourceAssetCanBeManaged({
    assetId: parsed.assetId,
    batchId: parsed.batchId,
    supabase,
  });

  if (asset.status !== "ready") {
    throw new Error("AI PDF source is not ready.");
  }

  const { data, error } = await supabase.storage
    .from(AI_IMPORT_SOURCES_BUCKET)
    .createSignedUrl(asset.object_path, 300);

  if (error) {
    throw new Error(error.message);
  }

  return { signedUrl: data.signedUrl };
}

export async function deleteAIPdfSource(input: unknown) {
  await requireAdmin();
  const parsed = sourceAssetInputSchema.parse(input);
  const supabase = await createClient();
  const { asset, batch } = await ensureSourceAssetCanBeManaged({
    assetId: parsed.assetId,
    batchId: parsed.batchId,
    supabase,
  });

  if (batch.status === "validating") {
    throw new Error("AI PDF import is running. Wait for it to finish before deleting the source PDF.");
  }

  const hasImportedItems = await batchHasImportedItems({
    batchId: parsed.batchId,
    supabase,
  });

  const { error: storageError } = await supabase.storage
    .from(AI_IMPORT_SOURCES_BUCKET)
    .remove([asset.object_path]);

  if (storageError) {
    throw new Error(storageError.message);
  }

  const metadata =
    asset.metadata && typeof asset.metadata === "object" && !Array.isArray(asset.metadata)
      ? asset.metadata
      : {};
  const { error: assetUpdateError } = await supabase
    .from("import_batch_assets")
    .update({
      metadata: {
        ...metadata,
        deletedAt: new Date().toISOString(),
      },
      status: "deleted",
    })
    .eq("id", asset.id);

  if (assetUpdateError) {
    throw new Error(assetUpdateError.message);
  }

  const { data: latestBatch } = await supabase
    .from("import_batches")
    .select("summary")
    .eq("id", parsed.batchId)
    .maybeSingle();

  const latestSummary = plainObject(latestBatch?.summary ?? batch.summary);
  const aiPdfImport = plainObject(latestSummary.aiPdfImport);

  const deletedSummary = {
    ...latestSummary,
    aiPdfImport: mergeAIPdfImportSummary(aiPdfImport, {
      fileName:
        "fileName" in aiPdfImport && typeof aiPdfImport.fileName === "string"
          ? aiPdfImport.fileName
          : asset.original_filename,
      sourceAssetId: asset.id,
      sourceAvailable: false,
      sourceDeletedAt: new Date().toISOString(),
      sourceObjectPath: asset.object_path,
    }),
  };
  const shouldKeepBatchStatus = batch.status === "imported" || hasImportedItems;
  const nextStatus = shouldKeepBatchStatus ? batch.status : "failed";
  const nextSummary = shouldKeepBatchStatus
    ? deletedSummary
    : {
        ...deletedSummary,
        aiPdfImport: mergeAIPdfImportSummary(
          plainObject(deletedSummary.aiPdfImport),
          {
            error: "Source PDF was deleted before extraction.",
            phase: "source_deleted",
          },
        ),
      };

  const { error: batchUpdateError } = await supabase
    .from("import_batches")
    .update({
      status: nextStatus,
      summary: nextSummary as Json,
    })
    .eq("id", parsed.batchId);

  if (batchUpdateError) {
    throw new Error(batchUpdateError.message);
  }

  revalidatePath("/admin/imports");
  revalidatePath("/admin/imports/pdf");

  return { assetId: asset.id, batchId: parsed.batchId };
}

export async function cancelAIPdfSourceUpload(input: unknown) {
  await requireAdmin();
  const parsed = sourceAssetUploadAttemptInputSchema.parse(input);
  const supabase = await createClient();
  const { asset, batch } = await ensureSourceAssetCanBeManaged({
    assetId: parsed.assetId,
    batchId: parsed.batchId,
    supabase,
  });
  const metadata = plainObject(asset.metadata);

  if (
    asset.status !== "pending" ||
    getUploadAttemptId(metadata) !== parsed.uploadAttemptId
  ) {
    return {
      assetId: asset.id,
      batchId: parsed.batchId,
      cancelled: false,
    };
  }

  const cancelledAt = new Date().toISOString();
  const { data: cancelledAsset, error: cancelError } = await supabase
    .from("import_batch_assets")
    .update({
      metadata: {
        ...metadata,
        uploadCancelledAt: cancelledAt,
        uploadState: "cancelled",
      },
      status: "deleted",
    })
    .eq("id", asset.id)
    .eq("status", "pending")
    .eq("metadata->>uploadAttemptId", parsed.uploadAttemptId)
    .select("id")
    .maybeSingle();

  if (cancelError) {
    throw new Error(cancelError.message);
  }

  if (!cancelledAsset) {
    return {
      assetId: asset.id,
      batchId: parsed.batchId,
      cancelled: false,
    };
  }

  const { error: storageError } = await supabase.storage
    .from(AI_IMPORT_SOURCES_BUCKET)
    .remove([asset.object_path]);
  const summary = plainObject(batch.summary);
  const aiPdfImport = getAIPdfImportSummary(summary);
  const nextSummary = {
    ...summary,
    aiPdfImport: mergeAIPdfImportSummary(aiPdfImport, {
      detail: "Source PDF upload was cancelled before it became ready.",
      fileName:
        getString(aiPdfImport.fileName) ??
        asset.original_filename,
      phase: "source_upload_cancelled",
      sourceAssetId: asset.id,
      sourceAvailable: false,
      sourceObjectPath: asset.object_path,
      uploadAttemptId: parsed.uploadAttemptId,
      uploadCancelledAt: cancelledAt,
      ...(storageError
        ? { warning: `Storage cleanup failed: ${storageError.message}` }
        : {}),
    }),
  };

  await supabase
    .from("import_batches")
    .update({
      status: "failed",
      summary: nextSummary as Json,
    })
    .eq("id", parsed.batchId)
    .in("status", ["draft", "failed"]);

  revalidatePath("/admin/imports");
  revalidatePath("/admin/imports/pdf");

  return {
    assetId: asset.id,
    batchId: parsed.batchId,
    cancelled: true,
    storageCleanupError: storageError?.message,
  };
}

export async function resetAIPdfImportOutputs(input: unknown) {
  await requireAdmin();
  const parsed = batchInputSchema.parse(input);
  const supabase = await createClient();
  const [
    { data: batch, error: batchError },
    { data: items, error: itemsError },
    { data: sourceAssets, error: sourceAssetsError },
  ] = await Promise.all([
    supabase
      .from("import_batches")
      .select("id, source_type, status, summary")
      .eq("id", parsed.batchId)
      .eq("source_type", "ai_pdf")
      .maybeSingle(),
    supabase
      .from("import_batch_items")
      .select("id, status, created_question_id")
      .eq("batch_id", parsed.batchId),
    supabase
      .from("import_batch_assets")
      .select("*")
      .eq("batch_id", parsed.batchId)
      .eq("asset_role", "source_pdf")
      .neq("status", "deleted")
      .order("created_at", { ascending: false })
      .limit(1),
  ]);

  if (batchError) {
    throw new Error(batchError.message);
  }

  if (itemsError) {
    throw new Error(itemsError.message);
  }

  if (sourceAssetsError) {
    throw new Error(sourceAssetsError.message);
  }

  if (!batch) {
    throw new Error("AI PDF import batch was not found.");
  }

  if (batch.status === "validating") {
    throw new Error("AI PDF extraction is running. Wait for it to finish before resetting generated drafts.");
  }

  const linkedQuestionIds = uniqueStrings(
    (items ?? []).map((item) => item.created_question_id as string | null),
  );
  let questions: {
    id: string;
    question_code: string;
    status: string;
    title: string;
  }[] = [];

  if (linkedQuestionIds.length) {
    const { data, error } = await supabase
      .from("questions")
      .select("id, question_code, status, title")
      .in("id", linkedQuestionIds);

    if (error) {
      throw new Error(error.message);
    }

    questions = data ?? [];
  }

  const nonDraftQuestions = questions.filter(
    (question) => question.status !== "draft",
  );

  if (nonDraftQuestions.length) {
    const examples = nonDraftQuestions
      .slice(0, 3)
      .map((question) => `${question.question_code} (${question.status})`)
      .join(", ");
    throw new Error(
      `Cannot reset this AI PDF import because ${nonDraftQuestions.length} generated question(s) are no longer draft: ${examples}. Archive or delete those questions manually before retrying this batch.`,
    );
  }

  const sourceAsset = sourceAssets?.[0] ?? null;
  const summary = plainObject(batch.summary);
  const aiPdfImport = plainObject(summary.aiPdfImport);
  const resetOperationId = crypto.randomUUID();
  const resetStartedAt = new Date().toISOString();
  const { data: resetLease, error: resetLeaseError } = await supabase
    .from("import_batches")
    .update({
      status: "validating",
      summary: {
        ...summary,
        aiPdfImport: mergeAIPdfImportSummary(aiPdfImport, {
          detail: "Resetting generated AI draft questions and image assets.",
          phase: "resetting_generated_drafts",
          resetOperationId,
          resetStartedAt,
        }),
      } as Json,
    })
    .eq("id", parsed.batchId)
    .eq("source_type", "ai_pdf")
    .in("status", ["draft", "failed", "imported", "ready"])
    .select("id")
    .maybeSingle();

  if (resetLeaseError) {
    throw new Error(resetLeaseError.message);
  }

  if (!resetLease) {
    throw new Error("This AI PDF batch is busy. Refresh the page before resetting generated drafts.");
  }

  try {
  const draftQuestionIds = questions.map((question) => question.id);
  let deletedAssetCount = 0;
  let storageAssetPaths: string[] = [];
  const storageWarnings: string[] = [];

  if (draftQuestionIds.length) {
    const { data: assets, error: assetsError } = await supabase
      .from("question_assets")
      .select("id, object_path")
      .in("question_id", draftQuestionIds);

    if (assetsError) {
      throw new Error(assetsError.message);
    }

    const assetIds = uniqueStrings((assets ?? []).map((asset) => asset.id));
    const assetPaths = uniqueStrings(
      (assets ?? []).map((asset) => asset.object_path),
    );
    storageAssetPaths = assetPaths;

    if (assetIds.length) {
      const { error: assetDeleteError } = await supabase
        .from("question_assets")
        .delete()
        .in("id", assetIds);

      if (assetDeleteError) {
        throw new Error(assetDeleteError.message);
      }
    }

    deletedAssetCount = assetIds.length;

    const { error: questionDeleteError } = await supabase
      .from("questions")
      .delete()
      .in("id", draftQuestionIds)
      .eq("status", "draft");

    if (questionDeleteError) {
      throw new Error(questionDeleteError.message);
    }
  }

  const { error: itemDeleteError } = await supabase
    .from("import_batch_items")
    .delete()
    .eq("batch_id", parsed.batchId);

  if (itemDeleteError) {
    throw new Error(itemDeleteError.message);
  }

  if (storageAssetPaths.length) {
    const { error: storageError } = await supabase.storage
      .from(QUESTION_ASSETS_BUCKET)
      .remove(storageAssetPaths);

    if (storageError) {
      storageWarnings.push(`Question asset storage cleanup failed: ${storageError.message}`);
    }
  }

  const now = new Date().toISOString();
  const missingLinkedCount = Math.max(
    0,
    linkedQuestionIds.length - questions.length,
  );
  const warnings = Array.isArray(aiPdfImport.warnings)
    ? aiPdfImport.warnings.filter(Boolean).map(String)
    : [];

  if (missingLinkedCount) {
    warnings.push(
      `${missingLinkedCount} linked question record(s) were already missing; stale import item links were cleared.`,
    );
  }

  warnings.push(...storageWarnings);

  const nextAiPdfImport: Record<string, unknown> = {
    createdQuestionCount: 0,
    detail: `Reset ${draftQuestionIds.length} generated draft question(s), ${deletedAssetCount} image asset(s), and ${(items ?? []).length} import item(s). Source PDF was kept.`,
    fileName:
      typeof aiPdfImport.fileName === "string"
        ? aiPdfImport.fileName
        : sourceAsset?.original_filename ?? "AI PDF source",
    phase: sourceAsset?.status === "ready" ? "source_uploaded" : "source_missing",
    resetAt: now,
    resetDeletedAssetCount: deletedAssetCount,
    resetDeletedImportItemCount: (items ?? []).length,
    resetDeletedQuestionCount: draftQuestionIds.length,
    resetOperationId,
    sourceAvailable: sourceAsset?.status === "ready",
    uploadedCropCount: 0,
  };

  if (typeof aiPdfImport.pageCount === "number") {
    nextAiPdfImport.pageCount = aiPdfImport.pageCount;
  } else {
    const metadata = plainObject(sourceAsset?.metadata);

    if (typeof metadata.pageCount === "number") {
      nextAiPdfImport.pageCount = metadata.pageCount;
    }
  }

  if (typeof aiPdfImport.providerProfileId === "string") {
    nextAiPdfImport.providerProfileId = aiPdfImport.providerProfileId;
  }

  if (aiPdfImport.provider) {
    nextAiPdfImport.provider = aiPdfImport.provider;
  }

  if (sourceAsset?.id) {
    nextAiPdfImport.sourceAssetId = sourceAsset.id;
  } else if (typeof aiPdfImport.sourceAssetId === "string") {
    nextAiPdfImport.sourceAssetId = aiPdfImport.sourceAssetId;
  }

  if (sourceAsset?.object_path) {
    nextAiPdfImport.sourceObjectPath = sourceAsset.object_path;
  } else if (typeof aiPdfImport.sourceObjectPath === "string") {
    nextAiPdfImport.sourceObjectPath = aiPdfImport.sourceObjectPath;
  }

  if (warnings.length) {
    nextAiPdfImport.warnings = warnings;
  }

  const { data: latestBatch } = await supabase
    .from("import_batches")
    .select("summary")
    .eq("id", parsed.batchId)
    .maybeSingle();

  const latestSummary = plainObject(latestBatch?.summary ?? summary);
  const latestAiPdfImport = plainObject(latestSummary.aiPdfImport ?? aiPdfImport);

  const nextSummary = {
    ...latestSummary,
    aiPdfImport: mergeAIPdfImportSummary(latestAiPdfImport, nextAiPdfImport),
    createdCount: 0,
    createdQuestions: [],
    duplicateCount: 0,
    errorCount: 0,
    invalidCount: 0,
    skippedCount: 0,
    unknownTagCount: 0,
    validCount: 0,
  };
  const nextStatus = sourceAsset?.status === "ready" ? "draft" : "failed";
  const { error: batchUpdateError } = await supabase
    .from("import_batches")
    .update({
      status: nextStatus,
      summary: nextSummary as Json,
    })
    .eq("id", parsed.batchId);

  if (batchUpdateError) {
    throw new Error(batchUpdateError.message);
  }

  revalidatePath("/admin/imports");
  revalidatePath("/admin/imports/pdf");
  revalidatePath("/admin/questions");
  revalidatePath("/admin/review");

  return {
    batchId: parsed.batchId,
    deletedAssetCount,
    deletedImportItemCount: (items ?? []).length,
    deletedQuestionCount: draftQuestionIds.length,
    sourceAsset,
    status: nextStatus,
    summary: nextSummary,
  };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "AI PDF reset failed.";

    await supabase
      .from("import_batches")
      .update({
        status: "failed",
        summary: {
          ...summary,
          aiPdfImport: mergeAIPdfImportSummary(aiPdfImport, {
            detail: "AI PDF reset failed. Some generated output may need manual review.",
            error: message,
            phase: "reset_failed",
            resetFailedAt: new Date().toISOString(),
            resetOperationId,
          }),
        } as Json,
      })
      .eq("id", parsed.batchId)
      .eq("status", "validating");

    throw new Error(message);
  }
}

export async function reserveAIPdfSourceUpload(input: unknown) {
  const profile = await requireAdmin();
  const parsed = reserveSourceUploadSchema.parse(input);

  if (!isPdfFileMetadata(parsed)) {
    throw new Error("Only PDF files can be imported.");
  }

  const supabase = await createClient();
  const { data: batch, error: batchError } = await supabase
    .from("import_batches")
    .insert({
      created_by: profile.id,
      source_type: "ai_pdf",
      status: "draft",
      summary: {
        aiPdfImport: {
          fileName: parsed.originalFilename,
          phase: "upload_reserved",
        },
      },
    })
    .select("id")
    .single();

  if (batchError) {
    throw new Error(batchError.message);
  }

  const batchId = batch.id as string;
  const assetId = crypto.randomUUID();
  const uploadAttemptId = crypto.randomUUID();
  const sourceObjectPath = `ai-pdf-imports/${batchId}/${assetId}-${safeFilename(
    parsed.originalFilename,
  )}`;

  try {
    const { data: sourceAsset, error: sourceAssetError } = await supabase
      .from("import_batch_assets")
      .insert({
        asset_role: "source_pdf",
        batch_id: batchId,
        created_by: profile.id,
        id: assetId,
        metadata: {
          uploadAttemptId,
          uploadReservedAt: new Date().toISOString(),
          uploadState: "reserved",
        },
        mime_type: "application/pdf",
        object_path: sourceObjectPath,
        original_filename: parsed.originalFilename,
        size_bytes: parsed.sizeBytes,
        status: "pending",
      })
      .select("*")
      .single();

    if (sourceAssetError) {
      throw new Error(sourceAssetError.message);
    }

    const { data: uploadUrl, error: uploadError } = await supabase.storage
      .from(AI_IMPORT_SOURCES_BUCKET)
      .createSignedUploadUrl(sourceObjectPath);

    if (uploadError) {
      throw new Error(uploadError.message);
    }

    return {
      batchId,
      objectPath: sourceObjectPath,
      sourceAsset,
      status: "draft",
      token: uploadUrl.token,
      uploadAttemptId,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "AI PDF source upload failed.";

    await supabase.from("import_batch_assets").delete().eq("id", assetId);
    await supabase.from("import_batches").delete().eq("id", batchId);

    throw new Error(message);
  }
}

export async function finalizeAIPdfSourceUpload(input: unknown) {
  await requireAdmin();
  const parsed = sourceAssetUploadAttemptInputSchema.parse(input);
  const supabase = await createClient();
  const { asset, batch } = await ensureSourceAssetCanBeManaged({
    assetId: parsed.assetId,
    batchId: parsed.batchId,
    supabase,
  });
  const metadata = plainObject(asset.metadata);

  if (getUploadAttemptId(metadata) !== parsed.uploadAttemptId) {
    throw new Error("This PDF upload attempt is stale. Select the file again to retry.");
  }

  if (asset.status === "ready") {
    const readyPageCount =
      typeof metadata.pageCount === "number" ? metadata.pageCount : undefined;
    const existingSummary = plainObject(batch.summary);
    const existingAiPdfImport = getAIPdfImportSummary(existingSummary);
    const readyPatch: Record<string, unknown> = {
      fileName: asset.original_filename,
      phase: "source_uploaded",
      sourceAssetId: asset.id,
      sourceObjectPath: asset.object_path,
      uploadAttemptId: parsed.uploadAttemptId,
    };

    if (readyPageCount) {
      readyPatch.pageCount = readyPageCount;
    }

    const summary = {
      ...existingSummary,
      aiPdfImport: mergeAIPdfImportSummary(existingAiPdfImport, readyPatch),
    };

    await supabase
      .from("import_batches")
      .update({ summary: summary as Json })
      .eq("id", parsed.batchId)
      .eq("source_type", "ai_pdf")
      .in("status", ["draft", "ready"]);

    return {
      batchId: parsed.batchId,
      sourceAsset: asset,
      status: "draft",
      summary,
    };
  }

  if (asset.status !== "pending") {
    throw new Error("This PDF upload is no longer pending. Select the file again to retry.");
  }

  const directory = asset.object_path.slice(
    0,
    asset.object_path.lastIndexOf("/"),
  );
  const filename = asset.object_path.slice(directory.length + 1);
  const { data: objects, error: listError } = await supabase.storage
    .from(AI_IMPORT_SOURCES_BUCKET)
    .list(directory, { search: filename });

  if (listError) {
    throw new Error(listError.message);
  }

  if (!objects?.some((object) => object.name === filename)) {
    throw new Error("Uploaded PDF source was not found in storage.");
  }

  const { data: sourceBlob, error: downloadError } = await supabase.storage
    .from(AI_IMPORT_SOURCES_BUCKET)
    .download(asset.object_path);

  if (downloadError) {
    throw new Error(downloadError.message);
  }

  const pageCount = await getPdfPageCount(
    Buffer.from(await sourceBlob.arrayBuffer()),
  );

  if (pageCount > AI_PDF_IMPORT_MAX_PAGES) {
    const message = "PDF has more than 50 pages. Split it before importing.";

    const { data: failedAsset, error: failedAssetError } = await supabase
      .from("import_batch_assets")
      .update({
        metadata: {
          ...metadata,
          error: message,
          pageCount,
          uploadAttemptId: parsed.uploadAttemptId,
          uploadState: "failed",
        },
        status: "failed",
      })
      .eq("id", asset.id)
      .eq("status", "pending")
      .eq("metadata->>uploadAttemptId", parsed.uploadAttemptId)
      .select("id")
      .maybeSingle();

    if (failedAssetError) {
      throw new Error(failedAssetError.message);
    }

    if (!failedAsset) {
      throw new Error("This PDF upload attempt was already changed before validation finished.");
    }

    await supabase.storage.from(AI_IMPORT_SOURCES_BUCKET).remove([
      asset.object_path,
    ]);

    await supabase
      .from("import_batches")
      .update({
        status: "failed",
        summary: {
          ...plainObject(batch.summary),
          aiPdfImport: mergeAIPdfImportSummary(getAIPdfImportSummary(batch.summary), {
            error: message,
            fileName: asset.original_filename,
            pageCount,
            phase: "source_upload_failed",
            sourceAssetId: asset.id,
            sourceObjectPath: asset.object_path,
            uploadAttemptId: parsed.uploadAttemptId,
          }),
        } as Json,
      })
      .eq("id", parsed.batchId);

    throw new Error(message);
  }

  const { data: readyAsset, error: readyAssetError } = await supabase
    .from("import_batch_assets")
    .update({
      metadata: {
        ...metadata,
        pageCount,
        uploadAttemptId: parsed.uploadAttemptId,
        uploadReadyAt: new Date().toISOString(),
        uploadState: "ready",
      },
      status: "ready",
    })
    .eq("id", asset.id)
    .eq("status", "pending")
    .eq("metadata->>uploadAttemptId", parsed.uploadAttemptId)
    .select("*")
    .maybeSingle();

  if (readyAssetError) {
    throw new Error(readyAssetError.message);
  }

  if (!readyAsset) {
    throw new Error("This PDF upload attempt was cancelled before validation finished.");
  }

  const summary = {
    ...plainObject(batch.summary),
    aiPdfImport: mergeAIPdfImportSummary(getAIPdfImportSummary(batch.summary), {
      chunking: createAIPdfChunkingSummary({ pageCount }),
      fileName: asset.original_filename,
      pageCount,
      phase: "source_uploaded",
      sourceAssetId: asset.id,
      sourceObjectPath: asset.object_path,
      uploadAttemptId: parsed.uploadAttemptId,
    }),
  };
  const { error: batchUpdateError } = await supabase
    .from("import_batches")
    .update({
      status: "draft",
      summary: summary as Json,
    })
    .eq("id", parsed.batchId);

  if (batchUpdateError) {
    throw new Error(batchUpdateError.message);
  }

  revalidatePath("/admin/imports");
  revalidatePath("/admin/imports/pdf");

  return {
    batchId: parsed.batchId,
    sourceAsset: readyAsset,
    status: "draft",
    summary,
  };
}

async function loadSourceAsset({
  batchId,
  supabase,
}: {
  batchId: string;
  supabase: Awaited<ReturnType<typeof createClient>>;
}) {
  const { data, error } = await supabase
    .from("import_batch_assets")
    .select("*")
    .eq("batch_id", batchId)
    .eq("asset_role", "source_pdf")
    .eq("status", "ready")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

async function ensureBatchCanExtract({
  batchId,
  supabase,
}: {
  batchId: string;
  supabase: Awaited<ReturnType<typeof createClient>>;
}) {
  const [{ data: batch, error }, { data: importedItems, error: itemsError }] =
    await Promise.all([
      supabase
        .from("import_batches")
        .select("id, source_type, status, summary, updated_at")
        .eq("id", batchId)
        .eq("source_type", "ai_pdf")
        .single(),
      supabase
        .from("import_batch_items")
        .select("id")
        .eq("batch_id", batchId)
        .eq("status", "imported")
        .limit(1),
    ]);

  if (error) {
    throw new Error(error.message);
  }

  if (itemsError) {
    throw new Error(itemsError.message);
  }

  if (batch.status === "validating") {
    const updatedAt = Date.parse(batch.updated_at ?? "");
    const isStale =
      Number.isFinite(updatedAt) &&
      Date.now() - updatedAt > AI_PDF_EXTRACTION_STALE_MS;

    if (!isStale) {
      throw new Error("This AI PDF batch is already extracting. Wait for it to finish before retrying.");
    }

    const summary = plainObject(batch.summary);
    const aiPdfImport = getAIPdfImportSummary(summary);
    const { error: staleError } = await supabase
      .from("import_batches")
      .update({
        status: "failed",
        summary: {
          ...summary,
          aiPdfImport: mergeAIPdfImportSummary(aiPdfImport, {
            detail: "Previous AI extraction lease expired before completion.",
            error: "Previous AI extraction lease expired before completion.",
            phase: "stale_lease",
            staleLeaseDetectedAt: new Date().toISOString(),
          }),
        } as Json,
      })
      .eq("id", batchId)
      .eq("status", "validating");

    if (staleError) {
      throw new Error(staleError.message);
    }
  }

  if (batch.status === "imported" || (importedItems ?? []).length > 0) {
    throw new Error(
      "This AI PDF batch already created draft questions. Reset generated drafts before extracting it again.",
    );
  }

  return batch;
}

async function acquireExtractionLease({
  batchId,
  providerProfileId,
  sourceAsset,
  supabase,
}: {
  batchId: string;
  providerProfileId: string;
  sourceAsset: Awaited<ReturnType<typeof loadSourceAsset>>;
  supabase: Awaited<ReturnType<typeof createClient>>;
}) {
  const batch = await ensureBatchCanExtract({ batchId, supabase });

  const jobId = crypto.randomUUID();
  const now = new Date();
  const leaseExpiresAt = new Date(
    now.getTime() + AI_PDF_EXTRACTION_LEASE_MS,
  ).toISOString();
  const existingSummary = plainObject(batch.summary);
  const existingAiPdfImport = getAIPdfImportSummary(existingSummary);
  const summary = {
    ...existingSummary,
    aiPdfImport: mergeAIPdfImportSummary(existingAiPdfImport, {
      detail: "AI extraction was queued and is waiting for the client to run the leased job.",
      fileName: sourceAsset.original_filename,
      jobId,
      leaseExpiresAt,
      phase: "queued",
      phaseStartedAt: now.toISOString(),
      providerProfileId,
      sourceAssetId: sourceAsset.id,
      sourceObjectPath: sourceAsset.object_path,
    }),
  };
  const { data: leasedBatch, error: leaseError } = await supabase
    .from("import_batches")
    .update({
      status: "validating",
      summary: summary as Json,
    })
    .eq("id", batchId)
    .eq("source_type", "ai_pdf")
    .in("status", ["draft", "failed", "ready"])
    .select("id")
    .maybeSingle();

  if (leaseError) {
    throw new Error(leaseError.message);
  }

  if (!leasedBatch) {
    throw new Error("This AI PDF batch is already extracting or no longer retryable. Refresh the page before trying again.");
  }

  return { jobId, leaseExpiresAt, summary };
}

async function clearRetryableBatchItems({
  batchId,
  supabase,
}: {
  batchId: string;
  supabase: Awaited<ReturnType<typeof createClient>>;
}) {
  const { error } = await supabase
    .from("import_batch_items")
    .delete()
    .eq("batch_id", batchId)
    .neq("status", "imported");

  if (error) {
    throw new Error(error.message);
  }
}

async function recordExtractionFailure({
  batchId,
  jobId,
  message,
  providerProfileId,
  sourceAsset,
  supabase,
}: {
  batchId: string;
  jobId: string;
  message: string;
  providerProfileId: string;
  sourceAsset: Awaited<ReturnType<typeof loadSourceAsset>>;
  supabase: Awaited<ReturnType<typeof createClient>>;
}) {
  const { data: batch, error: readError } = await supabase
    .from("import_batches")
    .select("summary")
    .eq("id", batchId)
    .maybeSingle();

  if (readError) {
    throw new Error(readError.message);
  }

  const existingSummary = plainObject(batch?.summary);
  const existingAiPdfImport = getAIPdfImportSummary(existingSummary);
  const { error: updateError } = await supabase
    .from("import_batches")
    .update({
      status: "failed",
      summary: {
        ...existingSummary,
        aiPdfImport: mergeAIPdfImportSummary(existingAiPdfImport, {
          detail: "AI PDF extraction failed. See error output.",
          error: message,
          fileName: sourceAsset.original_filename,
          jobId,
          phase: "failed",
          phaseFailedAt: new Date().toISOString(),
          providerProfileId,
          sourceAssetId: sourceAsset.id,
          sourceObjectPath: sourceAsset.object_path,
        }),
      } as Json,
    })
    .eq("id", batchId)
    .eq("status", "validating")
    .eq("summary->aiPdfImport->>jobId", jobId);

  if (updateError) {
    throw new Error(updateError.message);
  }
}

async function runAIPdfExtractionJob({
  batchId,
  jobId,
  profileId,
  providerProfileId,
  sourceAsset,
  supabase,
}: {
  batchId: string;
  jobId: string;
  profileId: string;
  providerProfileId: string;
  sourceAsset: Awaited<ReturnType<typeof loadSourceAsset>>;
  supabase: Awaited<ReturnType<typeof createClient>>;
}) {
  try {
    const { data: batch, error: readError } = await supabase
      .from("import_batches")
      .select("summary")
      .eq("id", batchId)
      .maybeSingle();

    if (readError) {
      throw new Error(readError.message);
    }

    const existingSummary = plainObject(batch?.summary);
    const existingAiPdfImport = getAIPdfImportSummary(existingSummary);
    const { error: startError } = await supabase
      .from("import_batches")
      .update({
        status: "validating",
        summary: {
          ...existingSummary,
          aiPdfImport: mergeAIPdfImportSummary(existingAiPdfImport, {
            detail: "Reading source PDF and preparing AI extraction.",
            fileName: sourceAsset.original_filename,
            jobId,
            phase: "extracting",
            phaseStartedAt: new Date().toISOString(),
            providerProfileId,
            sourceAssetId: sourceAsset.id,
            sourceObjectPath: sourceAsset.object_path,
          }),
        } as Json,
      })
      .eq("id", batchId)
      .eq("status", "validating")
      .eq("summary->aiPdfImport->>jobId", jobId);

    if (startError) {
      throw new Error(startError.message);
    }

    const { data: sourceBlob, error: downloadError } = await supabase.storage
      .from(AI_IMPORT_SOURCES_BUCKET)
      .download(sourceAsset.object_path);

    if (downloadError) {
      throw new Error(downloadError.message);
    }

    await processAIPdfImport({
      batchId,
      fileName: sourceAsset.original_filename,
      pdfBuffer: Buffer.from(await sourceBlob.arrayBuffer()),
      profileId,
      providerProfileId,
      jobId,
      sourceAssetId: sourceAsset.id,
      sourceObjectPath: sourceAsset.object_path,
      supabase,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "AI PDF import failed.";

    try {
      await recordExtractionFailure({
        batchId,
        jobId,
        message,
        providerProfileId,
        sourceAsset,
        supabase,
      });
    } catch {
      // Avoid an unhandled background rejection, because that can break the
      // dev runtime and make unrelated UI clicks look dead.
    }
  }
}

export async function startAIPdfExtraction(input: {
  batchId: string;
  providerProfileId: string;
}) {
  await requireSuperAdmin();
  const parsed = extractionInputSchema.parse(input);
  const supabase = await createClient();
  const sourceAsset = await loadSourceAsset({
    batchId: parsed.batchId,
    supabase,
  });
  const lease = await acquireExtractionLease({
    batchId: parsed.batchId,
    providerProfileId: parsed.providerProfileId,
    supabase,
    sourceAsset,
  });
  await clearRetryableBatchItems({ batchId: parsed.batchId, supabase });

  return {
    batchId: parsed.batchId,
    jobId: lease.jobId,
    leaseExpiresAt: lease.leaseExpiresAt,
    status: "validating",
    summary: lease.summary,
  };
}

export async function runQueuedAIPdfExtraction(input: unknown) {
  const profile = await requireSuperAdmin();
  const parsed = queuedExtractionInputSchema.parse(input);
  const supabase = await createClient();
  const { data: batch, error: batchError } = await supabase
    .from("import_batches")
    .select("id, status, summary")
    .eq("id", parsed.batchId)
    .eq("source_type", "ai_pdf")
    .maybeSingle();

  if (batchError) {
    throw new Error(batchError.message);
  }

  const aiPdfImport = getAIPdfImportSummary(batch?.summary);
  const leaseExpiresAt = Date.parse(getString(aiPdfImport.leaseExpiresAt) ?? "");

  if (
    !batch ||
    batch.status !== "validating" ||
    getString(aiPdfImport.jobId) !== parsed.jobId
  ) {
    throw new Error("This AI PDF extraction job is no longer active.");
  }

  if (Number.isFinite(leaseExpiresAt) && Date.now() > leaseExpiresAt) {
    await recordExtractionFailure({
      batchId: parsed.batchId,
      jobId: parsed.jobId,
      message: "AI extraction lease expired before the job started.",
      providerProfileId: getString(aiPdfImport.providerProfileId) ?? "",
      sourceAsset: await loadSourceAsset({ batchId: parsed.batchId, supabase }),
      supabase,
    });
    throw new Error("AI extraction lease expired before the job started.");
  }

  const sourceAsset = await loadSourceAsset({
    batchId: parsed.batchId,
    supabase,
  });
  const providerProfileId = getString(aiPdfImport.providerProfileId);

  if (!providerProfileId) {
    throw new Error("AI provider profile is missing from this extraction job.");
  }

  await runAIPdfExtractionJob({
    batchId: parsed.batchId,
    jobId: parsed.jobId,
    profileId: profile.id,
    providerProfileId,
    sourceAsset,
    supabase,
  });

  return getAIPdfImportStatus({ batchId: parsed.batchId });
}

export async function retryAIPdfImportChunk(input: unknown) {
  const profile = await requireSuperAdmin();
  const parsed = retryChunkInputSchema.parse(input);
  const supabase = await createClient();
  const { data: batch, error: batchError } = await supabase
    .from("import_batches")
    .select("id, status, summary")
    .eq("id", parsed.batchId)
    .eq("source_type", "ai_pdf")
    .maybeSingle();

  if (batchError) {
    throw new Error(batchError.message);
  }

  if (!batch) {
    throw new Error("AI PDF import batch was not found.");
  }

  if (batch.status === "validating") {
    throw new Error("This AI PDF batch is already extracting. Wait for it to finish before retrying a chunk.");
  }

  const summary = plainObject(batch.summary);
  const aiPdfImport = getAIPdfImportSummary(summary);
  const chunkingSummary = normalizeAIPdfChunkingSummary(aiPdfImport.chunking);
  const chunk = chunkingSummary?.chunks.find(
    (item) => item.chunkIndex === parsed.chunkIndex,
  );

  if (!chunk) {
    throw new Error("The requested AI PDF chunk was not found.");
  }

  if (chunk.status !== "failed") {
    throw new Error("Only failed AI PDF chunks can be retried.");
  }

  if (chunk.createdQuestionIds?.length) {
    throw new Error("This failed chunk already created draft questions. Reset generated drafts before retrying it.");
  }

  const inputStrategy = getString(aiPdfImport.sourceInput);

  if (
    !inputStrategy ||
    !supportsAIPdfSequentialChunkExtraction(inputStrategy as AiPdfInputStrategy)
  ) {
    throw new Error(
      "This provider uses full-PDF input and does not support single-chunk retry. Retry the full import after resetting generated drafts.",
    );
  }

  const providerProfileId =
    parsed.providerProfileId ?? getString(aiPdfImport.providerProfileId);

  if (!providerProfileId) {
    throw new Error("AI provider profile is missing from this extraction job.");
  }

  const sourceAsset = await loadSourceAsset({
    batchId: parsed.batchId,
    supabase,
  });
  const jobId = crypto.randomUUID();
  const { error: leaseError } = await supabase
    .from("import_batches")
    .update({
      status: "validating",
      summary: {
        ...summary,
        aiPdfImport: mergeAIPdfImportSummary(aiPdfImport, {
          detail: `Retrying failed chunk ${parsed.chunkIndex + 1}.`,
          jobId,
          phase: "queued",
          providerProfileId,
          retryChunkIndex: parsed.chunkIndex,
          sourceAssetId: sourceAsset.id,
          sourceObjectPath: sourceAsset.object_path,
        }),
      } as Json,
    })
    .eq("id", parsed.batchId)
    .neq("status", "validating");

  if (leaseError) {
    throw new Error(leaseError.message);
  }

  const { data: sourceBlob, error: downloadError } = await supabase.storage
    .from(AI_IMPORT_SOURCES_BUCKET)
    .download(sourceAsset.object_path);

  if (downloadError) {
    throw new Error(downloadError.message);
  }

  await processAIPdfImport({
    batchId: parsed.batchId,
    chunkIndex: parsed.chunkIndex,
    fileName: sourceAsset.original_filename,
    jobId,
    pdfBuffer: Buffer.from(await sourceBlob.arrayBuffer()),
    profileId: profile.id,
    providerProfileId,
    sourceAssetId: sourceAsset.id,
    sourceObjectPath: sourceAsset.object_path,
    supabase,
  });

  revalidatePath("/admin/imports");
  revalidatePath("/admin/imports/pdf");
  revalidatePath("/admin/review");

  return getAIPdfImportStatus({ batchId: parsed.batchId });
}
