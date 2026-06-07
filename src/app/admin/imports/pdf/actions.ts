"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  AI_IMPORT_SOURCES_BUCKET,
  AI_PDF_IMPORT_MAX_BYTES,
  AI_PDF_IMPORT_MAX_PAGES,
} from "@/lib/ai-pdf-import/constants";
import { getPdfPageCount } from "@/lib/ai-pdf-import/pdf";
import { processAIPdfImport } from "@/lib/ai-pdf-import/service";
import { requireAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { uuidSchema } from "@/lib/validations/common";

const extractionInputSchema = z.object({
  batchId: uuidSchema,
  providerProfileId: uuidSchema,
});

const sourceAssetInputSchema = z.object({
  assetId: uuidSchema,
  batchId: uuidSchema,
});

function safeFilename(value: string) {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120) || "ai-import.pdf";
}

function isPdfFile(file: File) {
  return (
    file.type === "application/pdf" ||
    file.name.toLowerCase().endsWith(".pdf")
  );
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

  if (batch.status === "imported") {
    throw new Error("Imported AI PDF batches keep their source PDF for audit.");
  }

  if (await batchHasImportedItems({ batchId: parsed.batchId, supabase })) {
    throw new Error("This AI PDF source already created draft questions.");
  }

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

  const { error: batchUpdateError } = await supabase
    .from("import_batches")
    .update({
      status: "failed",
      summary: {
        aiPdfImport: {
          error: "Source PDF was deleted before extraction.",
          fileName: asset.original_filename,
          phase: "source_deleted",
          sourceAssetId: asset.id,
          sourceObjectPath: asset.object_path,
        },
      },
    })
    .eq("id", parsed.batchId);

  if (batchUpdateError) {
    throw new Error(batchUpdateError.message);
  }

  revalidatePath("/admin/imports");
  revalidatePath("/admin/imports/pdf");

  return { assetId: asset.id, batchId: parsed.batchId };
}

export async function uploadAIPdfSource(formData: FormData) {
  const profile = await requireAdmin();
  const file = formData.get("pdf_file");

  if (!(file instanceof File)) {
    throw new Error("Select a PDF file.");
  }

  if (!isPdfFile(file)) {
    throw new Error("Only PDF files can be imported.");
  }

  if (file.size <= 0 || file.size > AI_PDF_IMPORT_MAX_BYTES) {
    throw new Error("PDF must be between 1 byte and 50MB.");
  }

  const pdfBuffer = Buffer.from(await file.arrayBuffer());
  const pageCount = await getPdfPageCount(pdfBuffer);

  if (pageCount > AI_PDF_IMPORT_MAX_PAGES) {
    throw new Error("PDF has more than 50 pages. Split it before importing.");
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
          fileName: file.name,
          pageCount,
          phase: "uploading",
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
  const sourceObjectPath = `ai-pdf-imports/${batchId}/${assetId}-${safeFilename(
    file.name,
  )}`;

  try {
    const { data: sourceAsset, error: sourceAssetError } = await supabase
      .from("import_batch_assets")
      .insert({
        asset_role: "source_pdf",
        batch_id: batchId,
        created_by: profile.id,
        id: assetId,
        metadata: { pageCount },
        mime_type: "application/pdf",
        object_path: sourceObjectPath,
        original_filename: file.name,
        size_bytes: file.size,
        status: "pending",
      })
      .select("*")
      .single();

    if (sourceAssetError) {
      throw new Error(sourceAssetError.message);
    }

    const { error: uploadError } = await supabase.storage
      .from(AI_IMPORT_SOURCES_BUCKET)
      .upload(sourceObjectPath, pdfBuffer, {
        contentType: "application/pdf",
        upsert: false,
      });

    if (uploadError) {
      throw new Error(uploadError.message);
    }

    const { data: readyAsset, error: readyAssetError } = await supabase
      .from("import_batch_assets")
      .update({ status: "ready" })
      .eq("id", assetId)
      .select("*")
      .single();

    if (readyAssetError) {
      throw new Error(readyAssetError.message);
    }

    const summary = {
      aiPdfImport: {
        fileName: file.name,
        pageCount,
        phase: "source_uploaded",
        sourceAssetId: assetId,
        sourceObjectPath,
      },
    };
    const { error: batchUpdateError } = await supabase
      .from("import_batches")
      .update({
        status: "draft",
        summary,
      })
      .eq("id", batchId);

    if (batchUpdateError) {
      throw new Error(batchUpdateError.message);
    }

    revalidatePath("/admin/imports");
    revalidatePath("/admin/imports/pdf");

    return {
      batchId,
      sourceAsset: readyAsset ?? sourceAsset,
      status: "draft",
      summary,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "AI PDF source upload failed.";

    await supabase
      .from("import_batch_assets")
      .update({ metadata: { error: message, pageCount }, status: "failed" })
      .eq("id", assetId);
    await supabase
      .from("import_batches")
      .update({
        status: "failed",
        summary: {
          aiPdfImport: {
            error: message,
            fileName: file.name,
            pageCount,
            phase: "source_upload_failed",
            sourceAssetId: assetId,
            sourceObjectPath,
          },
        },
      })
      .eq("id", batchId);

    throw new Error(message);
  }
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
        .select("id, source_type, status, summary")
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

  if (batch.status === "imported" || (importedItems ?? []).length > 0) {
    throw new Error(
      "This AI PDF batch already created draft questions and cannot be extracted again.",
    );
  }

  return batch;
}

export async function startAIPdfExtraction(input: {
  batchId: string;
  providerProfileId: string;
}) {
  const profile = await requireAdmin();
  const parsed = extractionInputSchema.parse(input);
  const supabase = await createClient();

  await ensureBatchCanExtract({ batchId: parsed.batchId, supabase });
  const sourceAsset = await loadSourceAsset({
    batchId: parsed.batchId,
    supabase,
  });
  const { data: sourceBlob, error: downloadError } = await supabase.storage
    .from(AI_IMPORT_SOURCES_BUCKET)
    .download(sourceAsset.object_path);

  if (downloadError) {
    throw new Error(downloadError.message);
  }

  const pdfBuffer = Buffer.from(await sourceBlob.arrayBuffer());

  try {
    await supabase
      .from("import_batches")
      .update({
        status: "validating",
        summary: {
          aiPdfImport: {
            fileName: sourceAsset.original_filename,
            phase: "extracting",
            providerProfileId: parsed.providerProfileId,
            sourceAssetId: sourceAsset.id,
            sourceObjectPath: sourceAsset.object_path,
          },
        },
      })
      .eq("id", parsed.batchId);

    const summary = await processAIPdfImport({
      batchId: parsed.batchId,
      fileName: sourceAsset.original_filename,
      pdfBuffer,
      profileId: profile.id,
      providerProfileId: parsed.providerProfileId,
      sourceAssetId: sourceAsset.id,
      sourceObjectPath: sourceAsset.object_path,
      supabase,
    });

    revalidatePath("/admin/imports");
    revalidatePath("/admin/imports/pdf");
    revalidatePath("/admin/review");
    revalidatePath("/admin/questions");

    return {
      batchId: parsed.batchId,
      status: "imported",
      summary,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI PDF import failed.";
    const { error: updateError } = await supabase
      .from("import_batches")
      .update({
        status: "failed",
        summary: {
          aiPdfImport: {
            error: message,
            fileName: sourceAsset.original_filename,
            phase: "failed",
            providerProfileId: parsed.providerProfileId,
            sourceAssetId: sourceAsset.id,
            sourceObjectPath: sourceAsset.object_path,
          },
        },
      })
      .eq("id", parsed.batchId);

    if (updateError) {
      throw new Error(updateError.message);
    }

    revalidatePath("/admin/imports");
    revalidatePath("/admin/imports/pdf");

    return {
      batchId: parsed.batchId,
      error: message,
      status: "failed",
    };
  }
}
