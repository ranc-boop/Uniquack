"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  formatActionError,
  redirectWithError,
  redirectWithSaved,
} from "@/lib/actions/feedback";
import { requireSuperAdmin } from "@/lib/auth/guards";
import {
  copyQuestionAssetsForIndependentUse,
  type CopyableQuestionAsset,
} from "@/lib/questions/copy-assets";
import { createClient } from "@/lib/supabase/server";
import type { Json, QuestionBank } from "@/types/database";

const reviewSchema = z.object({
  decision: z.enum(["approve", "request_changes", "reject", "start_review"]),
  reason: z.string().trim().max(2000).optional().default(""),
  submissionId: z.string().uuid(),
});

const bankGovernanceSchema = z.object({
  bankId: z.string().uuid(),
  operation: z.enum([
    "set_private",
    "set_organization",
    "archive",
    "disable",
  ]),
});

function objectValue(value: Json | undefined): Record<string, Json | undefined> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, Json | undefined>)
    : {};
}

function snapshotAssets(snapshot: Json): CopyableQuestionAsset[] {
  const assets = objectValue(snapshot).assets;
  if (!Array.isArray(assets)) return [];

  return assets.map((value) => {
    const asset = objectValue(value);
    return {
      alt_text: typeof asset.altText === "string" ? asset.altText : null,
      asset_kind: typeof asset.kind === "string" ? asset.kind : "",
      display_order:
        typeof asset.displayOrder === "number" ? asset.displayOrder : 0,
      label: typeof asset.label === "string" ? asset.label : null,
      id: typeof asset.id === "string" ? asset.id : undefined,
      storage_bucket: typeof asset.bucket === "string" ? asset.bucket : "",
      storage_path: typeof asset.path === "string" ? asset.path : "",
    };
  });
}

export async function reviewPublicQuestionSubmission(formData: FormData) {
  const fallbackPath = "/admin/questions/submissions";
  let copiedAssets:
    | Awaited<ReturnType<typeof copyQuestionAssetsForIndependentUse>>
    | undefined;

  try {
    await requireSuperAdmin();
    const parsed = reviewSchema.parse(Object.fromEntries(formData));

    if (
      ["request_changes", "reject"].includes(parsed.decision) &&
      !parsed.reason
    ) {
      throw new Error("A reason is required for this decision.");
    }

    const supabase = await createClient();
    let publicAssets: Json = [];

    if (parsed.decision === "approve") {
      const { data: submission, error: submissionError } = await supabase
        .from("public_question_submissions")
        .select("id, submitted_snapshot, status")
        .eq("id", parsed.submissionId)
        .maybeSingle();

      if (submissionError) throw new Error(submissionError.message);
      if (!submission || !["pending", "in_review"].includes(submission.status)) {
        throw new Error("This public submission is no longer reviewable.");
      }

      copiedAssets = await copyQuestionAssetsForIndependentUse({
        assets: snapshotAssets(submission.submitted_snapshot),
        destinationPrefix: `public-submissions/${submission.id}`,
      });
      publicAssets = copiedAssets.assets as Json;
    }

    const { data: publishedQuestionId, error } = await supabase.rpc(
      "review_public_question_submission",
      {
        p_decision: parsed.decision,
        p_public_assets: publicAssets,
        p_reason: parsed.reason || null,
        p_submission_id: parsed.submissionId,
      },
    );

    if (error) throw new Error(error.message);

    revalidatePath("/admin/questions");
    revalidatePath("/admin/questions/submissions");
    revalidatePath("/questions");
    redirectWithSaved(
      "/admin/questions/submissions",
      parsed.decision === "approve"
        ? `Approved and published as an independent global question${publishedQuestionId ? ` (${publishedQuestionId.slice(0, 8)})` : ""}.`
        : parsed.decision === "request_changes"
          ? "Changes requested. No public question was created."
          : parsed.decision === "reject"
            ? "Submission rejected. No public question was created."
            : "Independent review started.",
    );
  } catch (error) {
    const message = formatActionError(error);
    await copiedAssets?.cleanup();
    redirectWithError(fallbackPath, message);
  }
}

export async function governLegacyPublicBank(formData: FormData) {
  const fallbackPath = "/admin/questions/banks";

  try {
    const profile = await requireSuperAdmin();
    const parsed = bankGovernanceSchema.parse(Object.fromEntries(formData));
    const supabase = await createClient();
    const patch: Partial<QuestionBank> =
      parsed.operation === "set_private"
        ? { visibility: "private" }
        : parsed.operation === "set_organization"
          ? { visibility: "organization" }
          : parsed.operation === "archive"
            ? { status: "archived" }
            : { status: "disabled" };
    const { data, error } = await supabase
      .from("question_banks")
      .update({ ...patch, updated_by: profile.id })
      .eq("id", parsed.bankId)
      .eq("visibility", "public")
      .select("id")
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) {
      throw new Error("The legacy public-review Library is no longer eligible.");
    }

    revalidatePath("/admin/questions/banks");
    redirectWithSaved(
      "/admin/questions/banks",
      "Library governance updated. No teacher question was published.",
    );
  } catch (error) {
    redirectWithError(fallbackPath, formatActionError(error));
  }
}
