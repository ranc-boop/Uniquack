import Link from "next/link";

import { BulkAssetUploadPanelLoader } from "@/components/bulk-asset-upload-panel-loader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireAdmin } from "@/lib/auth/guards";
import {
  buildBulkAssetExistingFileIndex,
  type BulkAssetExistingFileRecord,
  type BulkAssetQuestionMatch,
} from "@/lib/bulk-asset-import/matching";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const BULK_ASSET_DRAFT_QUESTION_LIMIT = 250;

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
            .select("question_id, original_filename, object_path")
            .in("question_id", questionIds)
            .limit(2000),
          supabase
            .from("question_source_files")
            .select("question_id, original_filename, object_path")
            .in("question_id", questionIds)
            .neq("status", "deleted")
            .limit(2000),
        ])
      : [{ data: [] }, { data: [] }];
  const existingFileRecords: BulkAssetExistingFileRecord[] = [
    ...(existingAssets ?? [])
      .filter((asset) => asset.question_id)
      .map((asset) => ({
        fileKind: "image" as const,
        objectPath: asset.object_path,
        originalFilename: asset.original_filename,
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
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">
            Bulk asset upload
          </h1>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Upload images and PDF source files after Batch Import creates draft
            questions. Files are matched by question-code filename prefix before
            anything is uploaded.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/admin/imports">Back to imports</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filename matching rules</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            This MVP matches against draft question codes only. If a file has no
            draft match or more than one possible match, it is skipped for manual
            review.
          </p>
          {typeof totalDraftQuestions === "number" &&
          totalDraftQuestions > BULK_ASSET_DRAFT_QUESTION_LIMIT ? (
            <p>
              Performance note: matching is limited to the first{" "}
              {BULK_ASSET_DRAFT_QUESTION_LIMIT} draft questions by question
              code. Use Review Drafts or Question Bank filters to narrow older
              drafts before uploading large asset batches.
            </p>
          ) : null}
          <p>
            Supported files: PNG, JPEG, WebP, GIF, and PDF. SVG and other file
            types are rejected. Existing Storage size limits still apply.
          </p>
          <p className="font-mono text-xs">
            Q1001_diagram.png -&gt; Q1001, Q1002_source.pdf -&gt; Q1002,
            ASSET_MULTI_101_cart.png -&gt; ASSET_MULTI_101
          </p>
        </CardContent>
      </Card>

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
