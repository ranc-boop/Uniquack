import Link from "next/link";

import { AIPdfImportPanel } from "@/components/ai-pdf-import-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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

  if (sourceBatchIds.length) {
    const { data } = await supabase
      .from("import_batches")
      .select("id, status, summary, created_at")
      .eq("source_type", "ai_pdf")
      .in("id", sourceBatchIds);

    sourceBatches = data ?? [];
  }

  let providers: SafeAIProviderProfile[] = [];
  let providerError: string | null = null;

  try {
    providers = await listEnabledAIProviderProfiles(supabase);
  } catch (error) {
    providerError =
      error instanceof Error ? error.message : "Could not load AI providers.";
  }
  const sourceBatchById = new Map(
    sourceBatches.map((batch) => [batch.id, batch]),
  );
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

    return {
      assetStatus: asset.status,
      batchId: asset.batch_id,
      canDelete: batch?.status !== "imported",
      createdAt: asset.created_at,
      fileName: asset.original_filename,
      pageCount,
      sizeBytes: Number(asset.size_bytes),
      sourceAssetId: asset.id,
      sourceObjectPath: asset.object_path,
      status: batch?.status ?? "draft",
    };
  });

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
          {sourceAssetsError ? (
            <p className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              AI PDF source asset table is not available yet. Apply the latest
              AI PDF import migration before uploading source PDFs.
            </p>
          ) : null}
          <AIPdfImportPanel providers={providers} sources={sourceOptions} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent AI PDF batches</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Created</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>File</TableHead>
                  <TableHead>Created questions</TableHead>
                  <TableHead>Crops</TableHead>
                  <TableHead>Phase / warnings</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(batches ?? []).map((batch) => {
                  const summary = batch.summary as any;
                  const ai = aiSummary(batch.summary);
                  const warnings = Array.isArray(ai.warnings) ? ai.warnings : [];
                  const fileName =
                    typeof ai.fileName === "string" ? ai.fileName : "-";
                  const createdQuestionCount =
                    typeof ai.createdQuestionCount === "number"
                      ? ai.createdQuestionCount
                      : summary?.createdCount ?? 0;
                  const uploadedCropCount =
                    typeof ai.uploadedCropCount === "number"
                      ? ai.uploadedCropCount
                      : 0;
                  const phase =
                    typeof ai.phase === "string"
                      ? ai.phase
                      : `${warnings.length} warnings`;

                  return (
                    <TableRow key={batch.id}>
                      <TableCell className="text-xs">
                        {new Date(batch.created_at).toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <Badge variant={batch.status === "failed" ? "outline" : "secondary"}>
                          {batch.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-56 truncate text-xs">
                        {fileName}
                      </TableCell>
                      <TableCell>{createdQuestionCount}</TableCell>
                      <TableCell>{uploadedCropCount}</TableCell>
                      <TableCell>{phase}</TableCell>
                    </TableRow>
                  );
                })}
                {!batches?.length ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center">
                      No AI PDF imports yet.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
