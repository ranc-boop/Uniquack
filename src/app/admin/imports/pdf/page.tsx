import Link from "next/link";

import { AdminCard } from "@/components/admin/admin-card";
import { AdminCompactNotice } from "@/components/admin/admin-compact-notice";
import { AdminInfoTip } from "@/components/admin/admin-info-tip";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminStatusBadge } from "@/components/admin/admin-status-badge";
import {
  AIPdfControlDashboard,
  type AIPdfControlDashboardBatch,
} from "@/components/ai-pdf-control-dashboard";
import { AIPdfImportPanelLoader } from "@/components/ai-pdf-import-panel-loader";
import { Button } from "@/components/ui/button";
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

type AdminAIPdfImportPageProps = {
  searchParams: Promise<{ view?: string }>;
};

export default async function AdminAIPdfImportPage({
  searchParams,
}: AdminAIPdfImportPageProps) {
  const params = await searchParams;
  const showImport = params.view === "new";
  const profile = await requireAdmin();
  const supabase = await createClient();
  const canViewAllImports = profile.role === "super_admin";
  let batchesQuery = supabase
    .from("import_batches")
    .select("id, status, summary, created_at, created_by")
    .eq("source_type", "ai_pdf")
    .order("created_at", { ascending: false })
    .limit(10);
  let sourceAssetsQuery = supabase
    .from("import_batch_assets")
    .select(
      "id, batch_id, object_path, mime_type, size_bytes, original_filename, status, metadata, created_at, created_by",
    )
    .eq("asset_role", "source_pdf")
    .neq("status", "deleted")
    .order("created_at", { ascending: false })
    .limit(25);

  if (!canViewAllImports) {
    batchesQuery = batchesQuery.eq("created_by", profile.id);
    sourceAssetsQuery = sourceAssetsQuery.eq("created_by", profile.id);
  }

  const { data: batches } = await batchesQuery;
  const { data: sourceAssets, error: sourceAssetsError } =
    await sourceAssetsQuery;
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
    let loadedBatchesQuery = supabase
        .from("import_batches")
        .select("id, status, summary, created_at, created_by")
        .eq("source_type", "ai_pdf")
        .in("id", sourceBatchIds);
    const loadedItemsQuery = supabase
        .from("import_batch_items")
        .select("batch_id, status, created_question_id")
        .in("batch_id", sourceBatchIds)
        .not("created_question_id", "is", null);

    if (!canViewAllImports) {
      loadedBatchesQuery = loadedBatchesQuery.eq("created_by", profile.id);
    }

    const [{ data: loadedBatches }, { data: loadedItems }] = await Promise.all([
      loadedBatchesQuery,
      loadedItemsQuery,
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
    const executionMode:
      | "single_full_pdf"
      | "segmented_full_pdf"
      | "page_image_chunks"
      | "blueprint_observation" =
      ai.executionMode === "segmented_full_pdf" ||
      ai.executionMode === "page_image_chunks" ||
      ai.executionMode === "blueprint_observation"
        ? ai.executionMode
        : "single_full_pdf";

    return {
      assetStatus: asset.status,
      batchId: asset.batch_id,
      canDelete: batch?.status !== "validating",
      createdAt: asset.created_at,
      createdQuestionCount,
      fileName: asset.original_filename,
      executionMode,
      pageCount,
      segmentationConfirmed:
        (ai.manualSegmentation as any)?.status === "confirmed",
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
      <AdminPageHeader
        actions={
          <>
          <Button asChild>
            <Link href={showImport ? "/admin/imports/pdf" : "/admin/imports/pdf?view=new"}>
              {showImport ? "Run history" : "New import"}
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/admin/imports">Back to imports</Link>
          </Button>
          {profile.role === "super_admin" ? (
            <Button asChild variant="outline">
              <Link href="/admin/ai-settings">AI settings</Link>
            </Button>
          ) : null}
          </>
        }
        eyebrow="AI Parsing"
        help="Run configured multimodal providers against private source PDFs. Normal extraction creates draft questions, while blueprint observation creates reviewable blueprint metadata."
        helpLabel="AI PDF Import details"
        title="AI PDF Import"
      />

      <AdminCard
        badge={<AdminStatusBadge compact status="info" />}
        help="The import remains private and draft-safe. Normal extraction creates draft questions; blueprint observation creates reviewable planning metadata without questions."
        helpLabel="AI parsing workflow details"
        title={showImport ? "New AI import" : "AI parsing workflow"}
      >
        {showImport ? (
          <div>
          {providerError ? (
            <AdminCompactNotice className="mb-4" label="Provider unavailable" tone="error">
              AI provider configuration is not available yet. Configure an enabled provider in AI Settings.
            </AdminCompactNotice>
          ) : null}
          {profile.role !== "super_admin" ? (
            <AdminCompactNotice className="mb-4" label="Super admin required to run" tone="warning">
              Admins can upload private sources, but only a super admin can start extraction so provider keys remain server-side.
            </AdminCompactNotice>
          ) : null}
          {sourceAssetsError ? (
            <AdminCompactNotice className="mb-4" label="Source storage unavailable" tone="error">
              The source asset table is unavailable. Contact an administrator before uploading.
            </AdminCompactNotice>
          ) : null}
          <div className="mb-4 flex items-center gap-2">
            <AdminStatusBadge compact status="info" />
            <AdminInfoTip label={canViewAllImports ? "All imports" : "Your imports"}>
              <p>{canViewAllImports ? "Showing all AI PDF imports." : "Showing only your AI PDF imports."}</p>
            </AdminInfoTip>
          </div>
          <AIPdfImportPanelLoader providers={providers} sources={sourceOptions} />
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-3">
            <Button asChild className="justify-start" variant="outline">
              <Link href="/admin/imports/pdf?view=new">Upload source</Link>
            </Button>
            <Button asChild className="justify-start" variant="outline">
              <Link href="/admin/review">Review drafts</Link>
            </Button>
            <Button asChild className="justify-start" variant="outline">
              <Link href="/admin/blueprints">Blueprint Library</Link>
            </Button>
          </div>
        )}
      </AdminCard>

      {!showImport ? (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold tracking-tight">Recent AI runs</h2>
            <AdminInfoTip label="Recent AI runs">
              <p>Open a run to inspect its review handoff, pipeline, and warnings.</p>
            </AdminInfoTip>
          </div>
          <AIPdfControlDashboard batches={dashboardBatches} />
        </section>
      ) : null}
    </div>
  );
}
