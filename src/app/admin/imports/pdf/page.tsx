import Link from "next/link";

import {
  AIPdfControlDashboard,
  type AIPdfControlDashboardBatch,
} from "@/components/ai-pdf-control-dashboard";
import { AIPdfImportPanel } from "@/components/ai-pdf-import-panel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireAdmin } from "@/lib/auth/guards";
import {
  listEnabledAIProviderProfiles,
  type SafeAIProviderProfile,
} from "@/lib/ai-providers/profiles";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function aiSummary(summary: unknown) {
  return summary && typeof summary === "object"
    ? (summary as { aiPdfImport?: Record<string, unknown> }).aiPdfImport ?? {}
    : {};
}

export default async function AdminAIPdfImportPage() {
  const profile = await requireAdmin();
  const supabase = await createClient();
  const { data: batches } = await supabase
    .from("import_batches")
    .select("id, status, summary, created_at")
    .eq("source_type", "ai_pdf")
    .order("created_at", { ascending: false })
    .limit(10);
  const { data: sourceAssets, error: sourceAssetsError } = await supabase
    .from("import_batch_assets")
    .select(
      "id, batch_id, object_path, mime_type, size_bytes, original_filename, status, metadata, created_at",
    )
    .eq("asset_role", "source_pdf")
    .neq("status", "deleted")
    .order("created_at", { ascending: false })
    .limit(25);
  const sourceBatchIds = Array.from(
    new Set((sourceAssets ?? []).map((asset) => asset.batch_id)),
  );
  let sourceBatches: NonNullable<typeof batches> = [];
  let sourceBatchItems: {
    batch_id: string;
    created_question_id: string | null;
    status: string;
  }[] = [];

  if (sourceBatchIds.length) {
    const [{ data: loadedBatches }, { data: loadedItems }] = await Promise.all([
      supabase
        .from("import_batches")
        .select("id, status, summary, created_at")
        .eq("source_type", "ai_pdf")
        .in("id", sourceBatchIds),
      supabase
        .from("import_batch_items")
        .select("batch_id, status, created_question_id")
        .in("batch_id", sourceBatchIds)
        .not("created_question_id", "is", null),
    ]);

    sourceBatches = loadedBatches ?? [];
    sourceBatchItems = loadedItems ?? [];
  }

  let providers: SafeAIProviderProfile[] = [];
  let providerError: string | null = null;

  if (profile.role === "super_admin") {
    try {
      providers = await listEnabledAIProviderProfiles(supabase);
    } catch (error) {
      providerError =
        error instanceof Error ? error.message : "Could not load AI providers.";
    }
  }
  const sourceBatchById = new Map(
    sourceBatches.map((batch) => [batch.id, batch]),
  );
  const sourceAssetByBatchId = new Map(
    (sourceAssets ?? []).map((asset) => [asset.batch_id, asset]),
  );
  const createdQuestionCountByBatchId = new Map<string, number>();

  for (const item of sourceBatchItems) {
    createdQuestionCountByBatchId.set(
      item.batch_id,
      (createdQuestionCountByBatchId.get(item.batch_id) ?? 0) + 1,
    );
  }

  const sourceOptions = (sourceAssets ?? []).map((asset) => {
    const batch = sourceBatchById.get(asset.batch_id);
    const ai = aiSummary(batch?.summary);
    const metadata =
      asset.metadata &&
      typeof asset.metadata === "object" &&
      !Array.isArray(asset.metadata)
        ? asset.metadata
        : {};
    const pageCount =
      typeof metadata.pageCount === "number"
        ? metadata.pageCount
        : typeof ai.pageCount === "number"
          ? ai.pageCount
          : undefined;
    const summaryQuestionCount =
      typeof ai.createdQuestionCount === "number"
        ? ai.createdQuestionCount
        : typeof (batch?.summary as any)?.createdCount === "number"
          ? (batch?.summary as any).createdCount
          : 0;
    const createdQuestionCount = Math.max(
      summaryQuestionCount,
      createdQuestionCountByBatchId.get(asset.batch_id) ?? 0,
    );

    return {
      assetStatus: asset.status,
      batchId: asset.batch_id,
      canDelete: batch?.status !== "validating",
      createdAt: asset.created_at,
      createdQuestionCount,
      fileName: asset.original_filename,
      pageCount,
      sizeBytes: Number(asset.size_bytes),
      sourceAssetId: asset.id,
      sourceObjectPath: asset.object_path,
      status: batch?.status ?? "draft",
    };
  });
  const dashboardBatches: AIPdfControlDashboardBatch[] = (batches ?? []).map(
    (batch) => {
      const ai = aiSummary(batch.summary);
      const summary = batch.summary as any;
      const summaryQuestionCount =
        typeof ai.createdQuestionCount === "number"
          ? ai.createdQuestionCount
          : typeof summary?.createdCount === "number"
            ? summary.createdCount
            : 0;

      return {
        createdQuestionCount: Math.max(
          summaryQuestionCount,
          createdQuestionCountByBatchId.get(batch.id) ?? 0,
        ),
        created_at: batch.created_at,
        id: batch.id,
        sourceAsset: sourceAssetByBatchId.get(batch.id) ?? null,
        status: batch.status,
        summary: batch.summary,
      };
    },
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">AI PDF Import</h1>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Upload one PDF, let a configured multimodal model extract draft
            questions, create initial tags, crop figures, and send everything
            into the existing review queue.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href="/admin/imports">Back to imports</Link>
          </Button>
          {profile.role === "super_admin" ? (
            <Button asChild variant="outline">
              <Link href="/admin/ai-settings">AI settings</Link>
            </Button>
          ) : null}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Import PDF with AI</CardTitle>
        </CardHeader>
        <CardContent>
          {providerError ? (
            <p className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              AI provider configuration is not available yet. Apply the AI PDF
              import migration and configure a provider in AI Settings.
            </p>
          ) : null}
          {profile.role !== "super_admin" ? (
            <p className="mb-4 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              Admins can upload private PDF sources here, but starting AI
              extraction requires a super admin so provider API keys remain
              server-side and token use is explicitly controlled.
            </p>
          ) : null}
          {sourceAssetsError ? (
            <p className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              AI PDF source asset table is not available yet. Apply the latest
              AI PDF import migration before uploading source PDFs.
            </p>
          ) : null}
          <AIPdfImportPanel providers={providers} sources={sourceOptions} />
        </CardContent>
      </Card>

      <AIPdfControlDashboard batches={dashboardBatches} />
    </div>
  );
}
