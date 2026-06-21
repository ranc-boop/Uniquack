import { FiveFacetTagAdminPanel } from "@/components/admin/five-facet-tags/five-facet-tag-admin-panel";
import { PageFeedback } from "@/components/page-feedback";
import { requireAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import {
  buildApprovedTagAssignmentWritePlanFromRows,
  buildFiveFacetCatalogSyncPlan,
  summarizeFiveFacetAdminPersistencePlan,
  type FiveFacetReviewActionRowInput,
} from "@/lib/tags/five-facet-tag-admin-persistence";

type AdminTagsPageProps = {
  searchParams: Promise<{
    error?: string;
    saved?: string;
  }>;
};

function isMissingFiveFacetTableError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const record = error as { code?: unknown; message?: unknown };
  const message = typeof record.message === "string" ? record.message : "";

  return (
    record.code === "42P01" ||
    /five_facet_|relation .* does not exist|schema cache/i.test(message)
  );
}

function fiveFacetSetupMessage() {
  return "Five-facet tag tables are not available yet. Apply migration 0009_five_facet_tag_persistence.sql, then retry.";
}

export default async function AdminTagsPage({ searchParams }: AdminTagsPageProps) {
  const params = await searchParams;
  await requireAdmin();
  const supabase = await createClient();
  const catalogPlan = buildFiveFacetCatalogSyncPlan();
  let fiveFacetSetupError: string | undefined;
  let approvedReviewActionRows: FiveFacetReviewActionRowInput[] = [];
  const { data: approvedRows, error: approvedRowsError } = await supabase
    .from("five_facet_tag_review_actions")
    .select(
      "action_id, question_id, question_ref, action_kind, target_facet, target_tag_ids, proposed_tag_ids, reason, confidence, evidence, review_status",
    )
    .eq("review_status", "approved")
    .limit(250);

  if (approvedRowsError) {
    fiveFacetSetupError = isMissingFiveFacetTableError(approvedRowsError)
      ? fiveFacetSetupMessage()
      : `Five-facet approved assignment preview is unavailable: ${approvedRowsError.message}`;
  } else {
    approvedReviewActionRows = (approvedRows ?? []) as FiveFacetReviewActionRowInput[];
  }

  const assignmentPlan =
    buildApprovedTagAssignmentWritePlanFromRows(approvedReviewActionRows);
  const fiveFacetSummary = summarizeFiveFacetAdminPersistencePlan({
    assignmentWritePlan: assignmentPlan,
    catalogSyncPlan: catalogPlan,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Tags</h1>
        <p className="text-sm text-muted-foreground">
          Official five-facet tags are the primary tag system for curriculum,
          concept, method, task, and form.
        </p>
      </div>
      <PageFeedback error={params.error} saved={params.saved} />
      <FiveFacetTagAdminPanel
        assignmentPlan={assignmentPlan}
        catalogPlan={catalogPlan}
        setupError={fiveFacetSetupError}
        summary={fiveFacetSummary}
      />
    </div>
  );
}
