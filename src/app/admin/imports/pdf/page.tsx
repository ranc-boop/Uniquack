import Link from "next/link";

import { AdminCard } from "@/components/admin/admin-card";
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

export default async function AdminAIPdfImportPage() {
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
        description="Upload one private PDF, run a configured multimodal provider, and send extracted draft questions or blueprint observations into the admin review workflow."
        eyebrow="AI Parsing"
        title="AI PDF Import"
      />

      <AdminCard
        badge={<AdminStatusBadge status="info">AI Parsing</AdminStatusBadge>}
        description="Upload a private source, choose an approved provider path, and keep every output in draft or planning review until an admin approves it."
        title="AI parsing workflow"
      >
        <div className="grid gap-3 text-sm text-muted-foreground md:grid-cols-5">
          {[
            ["1", "Upload private PDF"],
            ["2", "Choose source and provider"],
            ["3", "Run extraction or blueprint observation"],
            ["4", "Review dashboard status"],
            ["5", "Open Review Drafts or Blueprint Library"],
          ].map(([step, label]) => (
            <div
              className="rounded-md border bg-muted/20 p-3 leading-6"
              key={step}
            >
              <span className="mb-2 inline-flex size-6 items-center justify-center rounded-full border bg-background text-xs font-semibold text-foreground">
                {step}
              </span>
              <p>{label}</p>
            </div>
          ))}
        </div>
      </AdminCard>

      <AdminCard
        badge={<AdminStatusBadge status="draft">Draft-only</AdminStatusBadge>}
        description="Source files stay private. Normal extraction creates draft questions; blueprint observation creates reviewable planning metadata without questions."
        title="Import PDF with AI"
      >
        <div>
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
          <p className="mb-4 rounded-md border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
            {canViewAllImports
              ? "Super admins can see all AI PDF imports. Regular admins only see imports they created."
              : "Showing only AI PDF imports uploaded by your account."}
          </p>
          <AIPdfImportPanelLoader providers={providers} sources={sourceOptions} />
        </div>
      </AdminCard>

      <AIPdfControlDashboard batches={dashboardBatches} />
    </div>
  );
}
