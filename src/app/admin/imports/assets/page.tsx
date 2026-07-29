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
    .is("owner_bank_id", null)
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
        eyebrow="Import tools"
        help="Upload images and PDF source files after draft questions exist. Files are matched by question-code filename prefix before anything is uploaded."
        helpLabel="Bulk asset upload details"
        title="Bulk asset upload"
      />

      <AdminCard
        badge={<AdminStatusBadge status="pending">Review matches</AdminStatusBadge>}
        help="Use this after draft questions exist. The tool previews filename matches first so skipped or ambiguous files can be reviewed before upload."
        helpLabel="Bulk asset matching workflow details"
        title="Bulk asset matching workflow"
      >
        <ol className="grid gap-2 text-sm md:grid-cols-4">
          {[
            "Select files",
            "Match codes",
            "Review",
            "Confirm",
          ].map((label) => (
            <li className="rounded-md border bg-muted/20 px-3 py-2 font-medium" key={label}>
              {label}
            </li>
          ))}
        </ol>
      </AdminCard>

      <AdminCard
        badge={<AdminStatusBadge status="info">Filename rules</AdminStatusBadge>}
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
      />

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
