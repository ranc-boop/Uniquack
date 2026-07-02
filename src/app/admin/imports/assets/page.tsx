import Link from "next/link";

import { AdminCard } from "@/components/admin/admin-card";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminStatusBadge } from "@/components/admin/admin-status-badge";
import { BulkAssetUploadPanelLoader } from "@/components/bulk-asset-upload-panel-loader";
import { Button } from "@/components/ui/button";
import { requireAdmin } from "@/lib/auth/guards";
import {
  buildBulkAssetExistingFileIndex,
  type BulkAssetExistingFileRecord,
  type BulkAssetQuestionMatch,
} from "@/lib/bulk-asset-import/matching";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const BULK_ASSET_DRAFT_QUESTION_LIMIT = 250;
const BULK_ASSET_EXISTING_FILE_LIMIT = BULK_ASSET_DRAFT_QUESTION_LIMIT * 4;

export default async function AdminImportAssetsPage() {
  await requireAdmin();
  const supabase = await createClient();
  const { count: totalDraftQuestions, data: questions, error } = await supabase
    .from("questions")
    .select("id, question_code, title", { count: "exact" })
    .eq("status", "draft")
    .order("question_code", { ascending: true })
    .limit(BULK_ASSET_DRAFT_QUESTION_LIMIT);
  const draftQuestions: BulkAssetQuestionMatch[] = (questions ?? []).map(
    (question) => ({
      id: question.id,
      questionCode: question.question_code,
      title: question.title,
    }),
  );
  const questionIds = draftQuestions.map((question) => question.id);
  const [{ data: existingAssets }, { data: existingSourceFiles }] =
    questionIds.length
      ? await Promise.all([
          supabase
            .from("question_assets")
            .select("question_id, label, alt_text, storage_path")
            .in("question_id", questionIds)
            .limit(BULK_ASSET_EXISTING_FILE_LIMIT),
          supabase
            .from("question_source_files")
            .select("question_id, original_filename, object_path")
            .in("question_id", questionIds)
            .neq("status", "deleted")
            .limit(BULK_ASSET_EXISTING_FILE_LIMIT),
        ])
      : [{ data: [] }, { data: [] }];
  const existingFileRecords: BulkAssetExistingFileRecord[] = [
    ...(existingAssets ?? [])
      .filter((asset) => asset.question_id)
      .map((asset) => ({
        fileKind: "image" as const,
        objectPath: asset.storage_path,
        originalFilename:
          asset.label?.trim() ||
          asset.alt_text?.trim() ||
          asset.storage_path?.split("/").pop() ||
          "Question image",
        questionId: asset.question_id as string,
      })),
    ...(existingSourceFiles ?? [])
      .filter((sourceFile) => sourceFile.question_id)
      .map((sourceFile) => ({
        fileKind: "pdf" as const,
        objectPath: sourceFile.object_path,
        originalFilename: sourceFile.original_filename,
        questionId: sourceFile.question_id as string,
      })),
  ];
  const existingFilesByQuestionId =
    buildBulkAssetExistingFileIndex(existingFileRecords);

  return (
    <div className="space-y-6">
      <AdminPageHeader
        actions={
          <Button asChild variant="outline">
            <Link href="/admin/imports">Back to imports</Link>
          </Button>
        }
        description="Attach assets to draft questions."
        eyebrow="Import tools"
        help="Upload images and PDF source files after draft questions exist. Files are matched by question-code filename prefix before anything is uploaded."
        helpLabel="Bulk asset upload details"
        title="Bulk asset upload"
      />

      <AdminCard
        badge={<AdminStatusBadge status="pending">Review matches</AdminStatusBadge>}
        description="Preview matches before upload."
        help="Use this after draft questions exist. The tool previews filename matches first so skipped or ambiguous files can be reviewed before upload."
        helpLabel="Bulk asset matching workflow details"
        title="Bulk asset matching workflow"
      >
        <div className="grid gap-3 text-sm text-muted-foreground md:grid-cols-4">
          {[
            ["1", "Select image or PDF assets"],
            ["2", "Match by question-code prefix"],
            ["3", "Review skipped and duplicate matches"],
            ["4", "Confirm upload and apply links"],
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
        badge={<AdminStatusBadge status="info">Filename rules</AdminStatusBadge>}
        description="Match by question-code prefix."
        help={
          <>
            <p>
              Only files that match a draft question code are attached.
              Everything else remains skipped for manual review.
            </p>
            {typeof totalDraftQuestions === "number" &&
            totalDraftQuestions > BULK_ASSET_DRAFT_QUESTION_LIMIT ? (
              <p className="mt-2">
                Matching is limited to the first{" "}
                {BULK_ASSET_DRAFT_QUESTION_LIMIT} draft questions by question
                code, and existing file checks are bounded to{" "}
                {BULK_ASSET_EXISTING_FILE_LIMIT} records.
              </p>
            ) : null}
          </>
        }
        helpLabel="Filename matching details"
        title="Matching rules"
      >
        <div className="space-y-2 text-sm text-muted-foreground">
          <p>
            Supported: PNG, JPEG, WebP, GIF, and PDF.
          </p>
          <p className="font-mono text-xs">
            Q1001_diagram.png -&gt; Q1001, Q1002_source.pdf -&gt; Q1002,
            ASSET_MULTI_101_cart.png -&gt; ASSET_MULTI_101
          </p>
        </div>
      </AdminCard>

      {error ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error.message}
        </p>
      ) : (
        <BulkAssetUploadPanelLoader
          draftQuestions={draftQuestions}
          existingFilesByQuestionId={existingFilesByQuestionId}
        />
      )}
    </div>
  );
}
