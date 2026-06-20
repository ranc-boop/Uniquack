import { NextResponse } from "next/server";

import { AI_IMPORT_SOURCES_BUCKET } from "@/lib/ai-pdf-import/constants";
import { buildMaskedPdfChunk } from "@/lib/ai-pdf-import/masked-pdf";
import {
  normalizeManualSegmentationPlan,
  segmentChunkForIndex,
} from "@/lib/ai-pdf-import/segmentation";
import { requireAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  _request: Request,
  context: {
    params: Promise<{ batchId: string; chunkIndex: string }>;
  },
) {
  try {
    await requireAdmin();
    const { batchId, chunkIndex: chunkIndexText } = await context.params;
    const chunkIndex = Number(chunkIndexText);

    if (!Number.isInteger(chunkIndex) || chunkIndex < 0) {
      return NextResponse.json({ error: "Invalid chunk index." }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: batch, error: batchError } = await supabase
      .from("import_batches")
      .select("summary")
      .eq("id", batchId)
      .eq("source_type", "ai_pdf")
      .maybeSingle();

    if (batchError) {
      throw new Error(batchError.message);
    }

    const summary =
      batch?.summary && typeof batch.summary === "object" && !Array.isArray(batch.summary)
        ? batch.summary
        : null;
    const aiPdfImport =
      summary?.aiPdfImport &&
      typeof summary.aiPdfImport === "object" &&
      !Array.isArray(summary.aiPdfImport)
        ? summary.aiPdfImport
        : null;
    const plan = normalizeManualSegmentationPlan(
      aiPdfImport?.manualSegmentation,
    );

    if (!plan || plan.status !== "confirmed") {
      return NextResponse.json(
        { error: "A confirmed split plan was not found." },
        { status: 404 },
      );
    }

    const chunk = segmentChunkForIndex(plan, chunkIndex);

    if (!chunk) {
      return NextResponse.json({ error: "Chunk was not found." }, { status: 404 });
    }

    const { data: sourceAsset, error: assetError } = await supabase
      .from("import_batch_assets")
      .select("object_path")
      .eq("batch_id", batchId)
      .eq("asset_role", "source_pdf")
      .eq("status", "ready")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (assetError) {
      throw new Error(assetError.message);
    }

    if (!sourceAsset) {
      return NextResponse.json({ error: "Source PDF was not found." }, { status: 404 });
    }

    const { data: sourceBlob, error: downloadError } = await supabase.storage
      .from(AI_IMPORT_SOURCES_BUCKET)
      .download(sourceAsset.object_path);

    if (downloadError) {
      throw new Error(downloadError.message);
    }

    const result = await buildMaskedPdfChunk({
      chunk,
      pdfBuffer: Buffer.from(await sourceBlob.arrayBuffer()),
    });
    const fileName = `chunk-${chunkIndex + 1}-pages-${chunk.pageStart}-${chunk.pageEnd}.pdf`;

    return new Response(new Uint8Array(result.pdfBytes), {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition": `inline; filename="${fileName}"`,
        "Content-Type": "application/pdf",
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not generate PDF preview.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
