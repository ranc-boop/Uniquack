import Link from "next/link";

import {
  archiveQuestionBlueprint,
  approveQuestionBlueprintReviewAction,
  generateOriginalQuestionsFromApprovedBlueprint,
  markQuestionBlueprintNeedsEvidence,
  moveQuestionBlueprintToTrash,
  rejectQuestionBlueprintReviewAction,
  restoreQuestionBlueprint,
  storeBlueprintReviewActionsFromImportBatch,
  updateBlueprintReviewActionTaxonomyTargets,
} from "@/app/admin/blueprints/actions";
import { FormSubmitButton } from "@/components/form-submit-button";
import { MathContent } from "@/components/math-content";
import {
  TaxonomyTagTreePicker,
  type TaxonomyCatalogView,
} from "@/components/tags/taxonomy-tag-tree-picker";
import { PageFeedback } from "@/components/page-feedback";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireAdmin } from "@/lib/auth/guards";
import {
  buildQuestionBlueprintLibrarySeedPlan,
  getQuestionBlueprintApprovalReadinessFromReviewAction,
  summarizeQuestionBlueprintLibrary,
} from "@/lib/blueprints/question-blueprint-persistence";
import { validateQuestionBlueprintQuality } from "@/lib/blueprints/question-blueprint-quality";
import { createClient } from "@/lib/supabase/server";
import { taxonomyDisplayLabelFromId } from "@/lib/tags/taxonomy-display";
import { loadTaxonomyCatalog } from "@/lib/tags/taxonomy-db";

type AdminBlueprintsPageProps = {
  searchParams: Promise<{
    blocked?: string;
    error?: string;
    generated?: string;
    reviewBatch?: string;
    saved?: string;
    warnings?: string;
  }>;
};

type BlueprintReviewRow = {
  action_id: string;
  action_kind: string;
  blueprint_draft_id: string;
  created_at: string;
  draft_snapshot: unknown;
  evidence: unknown;
  id: string;
  import_batch_id: string | null;
  reason: string;
  status: string;
};

type BlueprintRow = {
  answer_spec_pattern: unknown;
  deleted_at: string | null;
  distractor_pattern: unknown;
  generation_constraints: unknown;
  id: string;
  originality_constraints: unknown;
  owner_scope: string;
  question_pattern: unknown;
  required_elements: unknown;
  source_refs: unknown;
  status: string;
  taxonomy_targets: unknown;
  title: string;
  updated_at: string;
};

type BlueprintExampleRow = {
  blueprint_id: string;
  evidence_snippets: unknown;
};

type ImportBatchRow = {
  created_at: string;
  id: string;
  status: string;
  summary: unknown;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringList(value: unknown) {
  return asArray(value)
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
}

function firstString(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function isMissingBlueprintTableError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const record = error as { code?: unknown; message?: unknown };
  const message = typeof record.message === "string" ? record.message : "";

  return (
    record.code === "42P01" ||
    /question_blueprint|relation .* does not exist|schema cache/i.test(message)
  );
}

function blueprintReviewActionCount(summary: unknown) {
  const aiPdfImport = asRecord(asRecord(summary).aiPdfImport);
  const reviewPlan = asRecord(aiPdfImport.questionBlueprintReviewPlan);

  return asArray(reviewPlan.actions).length;
}

function blueprintDraftCount(summary: unknown) {
  const aiPdfImport = asRecord(asRecord(summary).aiPdfImport);
  const draftPlan = asRecord(aiPdfImport.questionBlueprintDraftPlan);

  return asArray(draftPlan.blueprintDrafts).length;
}

function taxonomyGroups(value: unknown) {
  const targets = asRecord(value);

  return [
    ["Curriculum", stringList(targets.curriculum)],
    ["Concept", stringList(targets.concept)],
    ["Method", stringList(targets.method)],
    ["Task", stringList(targets.task)],
    ["Form", stringList(targets.form)],
  ] as const;
}

function selectedTaxonomyTargets(value: unknown) {
  const targets = asRecord(value);

  return {
    concept: stringList(targets.concept),
    curriculum: stringList(targets.curriculum),
    form: stringList(targets.form),
    method: stringList(targets.method),
    task: stringList(targets.task),
  };
}

function leafAssignableTagIds(catalog: TaxonomyCatalogView) {
  const parentTagIds = new Set(
    catalog.nodes.flatMap((node) => node.parent_tag_ids ?? []),
  );

  return new Set(
    catalog.nodes
      .filter(
        (node) =>
          node.facet_key &&
          node.is_assignable &&
          !parentTagIds.has(node.tag_id),
      )
      .map((node) => node.tag_id),
  );
}

function readableReviewReason(action: BlueprintReviewRow) {
  const draft = asRecord(action.draft_snapshot);
  const status = firstString(draft.taxonomyGroundingStatus, "unresolved");
  const sourcePacketIds = stringList(draft.sourcePacketIds);
  const clusterIndex = sourcePacketIds.findIndex((id) =>
    id.includes("blueprint-observation-cluster-"),
  );

  if (status !== "grounded" || draft.taxonomyUnresolved === true) {
    return clusterIndex >= 0
      ? `This blueprint came from observation cluster ${clusterIndex + 1} and needs taxonomy mapping before approval.`
      : "This blueprint needs taxonomy mapping before approval.";
  }

  if (/question_blueprint_analyzer_cluster_source:/i.test(action.reason)) {
    return "This blueprint came from a focused observation cluster and is ready for human review.";
  }

  return action.reason;
}

function TaxonomyTargets({ targets }: { targets: unknown }) {
  const groups = taxonomyGroups(targets);

  if (!groups.some(([, ids]) => ids.length)) {
    return <p className="text-xs text-muted-foreground">No taxonomy targets.</p>;
  }

  return (
    <div className="grid gap-2 text-xs md:grid-cols-2">
      {groups.map(([label, ids]) =>
        ids.length ? (
          <div key={label} className="space-y-1">
            <p className="font-medium">{label}</p>
            <div className="flex flex-wrap gap-1">
              {ids.map((id) => (
                <span key={id} className="rounded-md border px-2 py-1">
                  {taxonomyDisplayLabelFromId(id)}
                  <span className="ml-1 font-mono text-[10px] text-muted-foreground">
                    {id}
                  </span>
                </span>
              ))}
            </div>
          </div>
        ) : null,
      )}
    </div>
  );
}

function ReasonList({ reasons }: { reasons: string[] }) {
  if (!reasons.length) return null;

  return (
    <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-950">
      <p className="font-medium">Quality gate blockers</p>
      <ul className="mt-1 list-disc space-y-1 pl-4">
        {reasons.map((reason) => (
          <li key={reason}>{reason}</li>
        ))}
      </ul>
    </div>
  );
}

function DraftSnapshotSummary({ snapshot }: { snapshot: unknown }) {
  const draft = asRecord(snapshot);
  const evidence = asRecord(draft.evidence);
  const snippets = stringList(evidence.boundedSnippets).slice(0, 3);
  const requiredElements = stringList(draft.requiredElements).slice(0, 6);
  const generationConstraints = stringList(draft.generationConstraints).slice(0, 5);
  const taxonomyTargetHints = stringList(draft.taxonomyTargetHints).slice(0, 8);
  const specificityWarnings = stringList(draft.specificityWarnings).slice(0, 4);

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-medium">
          {firstString(draft.title, "Blueprint draft")}
        </p>
        <MathContent
          className="mt-1 text-xs text-muted-foreground"
          format="plain"
          value={firstString(draft.questionPattern, "No reusable pattern summary.")}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Badge variant="outline">
          Taxonomy grounding:{" "}
          {firstString(draft.taxonomyGroundingStatus, "unresolved").replaceAll(
            "_",
            " ",
          )}
        </Badge>
        <Badge variant="outline">
          Specificity:{" "}
          {Number.isFinite(Number(draft.specificityScore))
            ? Number(draft.specificityScore).toFixed(2)
            : "0.50"}
        </Badge>
      </div>
      <TaxonomyTargets targets={draft.taxonomyTargets} />
      {taxonomyTargetHints.length ? (
        <div>
          <p className="text-xs font-medium">Taxonomy target hints</p>
          <p className="text-xs text-muted-foreground">
            {taxonomyTargetHints.join("; ")}
          </p>
        </div>
      ) : null}
      {specificityWarnings.length ? (
        <div>
          <p className="text-xs font-medium">Specificity warnings</p>
          <p className="text-xs text-muted-foreground">
            {specificityWarnings.join("; ")}
          </p>
        </div>
      ) : null}
      {requiredElements.length ? (
        <div>
          <p className="text-xs font-medium">Required elements</p>
          <MathContent
            className="text-xs text-muted-foreground"
            format="plain"
            value={requiredElements.join("; ")}
          />
        </div>
      ) : null}
      {generationConstraints.length ? (
        <div>
          <p className="text-xs font-medium">Generation constraints</p>
          <MathContent
            className="text-xs text-muted-foreground"
            format="plain"
            value={generationConstraints.join("; ")}
          />
        </div>
      ) : null}
      {snippets.length ? (
        <details className="rounded-md border bg-muted/20 px-3 py-2">
          <summary className="cursor-pointer text-xs font-medium">
            Source example refs
          </summary>
          <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-muted-foreground">
            {snippets.map((snippet) => (
              <li key={snippet}>
                <MathContent format="plain" value={snippet} />
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

function ReviewActionCard({
  action,
  knownAssignableTagIds,
  taxonomyCatalog,
}: {
  action: BlueprintReviewRow;
  knownAssignableTagIds: ReadonlySet<string>;
  taxonomyCatalog: TaxonomyCatalogView;
}) {
  const readiness = getQuestionBlueprintApprovalReadinessFromReviewAction(
    action,
    knownAssignableTagIds,
  );
  const canApprove = action.status === "pending_review" && readiness.approvalReady;
  const draft = asRecord(action.draft_snapshot);
  const selectedTagIds = selectedTaxonomyTargets(draft.taxonomyTargets);
  const rawWarnings = stringList(draft.warnings);
  const canEdit = action.status === "pending_review" || action.status === "needs_more_evidence";

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">
              {action.action_kind.replaceAll("_", " ")}
            </CardTitle>
            <p className="mt-1 font-mono text-xs text-muted-foreground">
              {action.blueprint_draft_id}
            </p>
          </div>
          <Badge variant="outline">{action.status}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <MathContent
          className="text-sm text-muted-foreground"
          format="plain"
          value={readableReviewReason(action)}
        />
        <DraftSnapshotSummary snapshot={action.draft_snapshot} />
        {canEdit ? (
          <details className="rounded-md border bg-muted/20 p-3">
            <summary className="cursor-pointer text-sm font-medium">
              Edit taxonomy targets
            </summary>
            <form action={updateBlueprintReviewActionTaxonomyTargets} className="mt-3 space-y-3">
              <input name="id" type="hidden" value={action.id} />
              <TaxonomyTagTreePicker
                defaultOpenFacetKeys={["concept", "method", "task", "form"]}
                namePrefix="blueprint_tax"
                selectable="assignable_leaf"
                selectedTagIds={selectedTagIds}
                taxonomyCatalog={taxonomyCatalog}
                title="Edit taxonomy targets"
              />
              <p className="text-xs text-muted-foreground">
                Parent taxonomy nodes cannot be used directly. Choose a specific
                assignable leaf tag.
              </p>
              <FormSubmitButton pendingLabel="Updating..." size="sm" variant="outline">
                Save taxonomy targets
              </FormSubmitButton>
            </form>
          </details>
        ) : null}
        {action.status !== "rejected" ? (
        <div className="flex flex-wrap gap-2">
          {canApprove ? (
            <form action={approveQuestionBlueprintReviewAction}>
              <input name="id" type="hidden" value={action.id} />
              <FormSubmitButton pendingLabel="Approving..." size="sm">
                Approve blueprint
              </FormSubmitButton>
            </form>
          ) : (
            <Badge variant="outline">Needs more evidence before approval</Badge>
          )}
          {action.status === "pending_review" ? (
            <form action={markQuestionBlueprintNeedsEvidence}>
              <input name="id" type="hidden" value={action.id} />
              <FormSubmitButton pendingLabel="Marking..." size="sm" variant="outline">
                Needs more evidence
              </FormSubmitButton>
            </form>
          ) : null}
          <form action={rejectQuestionBlueprintReviewAction}>
            <input name="id" type="hidden" value={action.id} />
            <FormSubmitButton pendingLabel="Rejecting..." size="sm" variant="destructive">
              Reject
            </FormSubmitButton>
          </form>
        </div>
        ) : null}
        {!canApprove ? (
          <ReasonList reasons={readiness.approvalBlockingReasons} />
        ) : null}
        <details className="rounded-md border bg-muted/10 px-3 py-2">
          <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
            Debug details
          </summary>
          <div className="mt-2 space-y-1 text-xs text-muted-foreground">
            <div className="break-all">
              Raw reason:{" "}
              <MathContent format="plain" value={action.reason} />
            </div>
            {rawWarnings.length ? (
              <div className="break-all">
                Raw warnings:{" "}
                <MathContent format="plain" value={rawWarnings.join("; ")} />
              </div>
            ) : null}
          </div>
        </details>
      </CardContent>
    </Card>
  );
}

function LifecycleActions({
  blueprint,
}: {
  blueprint: BlueprintRow;
}) {
  const trashed = Boolean(blueprint.deleted_at);
  const archived = blueprint.status === "deprecated" && !trashed;

  return (
    <div className="flex flex-wrap gap-2">
      {trashed || archived ? (
        <form action={restoreQuestionBlueprint}>
          <input name="blueprint_id" type="hidden" value={blueprint.id} />
          <FormSubmitButton pendingLabel="Restoring..." size="sm" variant="outline">
            Restore
          </FormSubmitButton>
        </form>
      ) : (
        <form action={archiveQuestionBlueprint}>
          <input name="blueprint_id" type="hidden" value={blueprint.id} />
          <FormSubmitButton pendingLabel="Archiving..." size="sm" variant="outline">
            Deprecate
          </FormSubmitButton>
        </form>
      )}
      {!trashed ? (
        <form action={moveQuestionBlueprintToTrash}>
          <input name="blueprint_id" type="hidden" value={blueprint.id} />
          <FormSubmitButton pendingLabel="Moving..." size="sm" variant="destructive">
            Move to trash
          </FormSubmitButton>
        </form>
      ) : null}
    </div>
  );
}

function LibraryCard({
  blueprint,
  evidenceSnippets,
  knownAssignableTagIds,
}: {
  blueprint: BlueprintRow;
  evidenceSnippets: string[];
  knownAssignableTagIds: ReadonlySet<string>;
}) {
  const questionPattern = asRecord(blueprint.question_pattern);
  const requiredElements = stringList(blueprint.required_elements).slice(0, 6);
  const approved = blueprint.status === "approved" && !blueprint.deleted_at;
  const quality = validateQuestionBlueprintQuality({
    blueprint: {
      answer_spec_pattern: asRecord(blueprint.answer_spec_pattern),
      deleted_at: blueprint.deleted_at,
      distractor_pattern: stringList(blueprint.distractor_pattern),
      originality_constraints: stringList(blueprint.originality_constraints),
      question_pattern: asRecord(blueprint.question_pattern),
      required_elements: stringList(blueprint.required_elements),
      status: blueprint.status as "draft" | "approved" | "deprecated",
      taxonomy_targets: asRecord(blueprint.taxonomy_targets) as Record<string, string[]>,
    },
    evidenceSnippets,
    knownAssignableTagIds,
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <CardTitle className="text-base">{blueprint.title}</CardTitle>
          <Badge variant={blueprint.status === "approved" ? "secondary" : "outline"}>
            {blueprint.status}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <MathContent
          className="text-muted-foreground"
          format="plain"
          value={firstString(questionPattern.pattern, "No question pattern summary.")}
        />
        <TaxonomyTargets targets={blueprint.taxonomy_targets} />
        {requiredElements.length ? (
          <MathContent
            className="text-xs text-muted-foreground"
            format="plain"
            value={`Required: ${requiredElements.join("; ")}`}
          />
        ) : null}
        <p className="text-xs text-muted-foreground">
          Owner scope: {blueprint.owner_scope} | Updated{" "}
          {new Date(blueprint.updated_at).toLocaleString()}
        </p>
        <LifecycleActions blueprint={blueprint} />
        {approved && quality.generationReady ? (
          <div className="rounded-md border bg-muted/20 p-3">
            <div className="space-y-1">
              <p className="text-sm font-medium">
                Generate original draft questions
              </p>
              <p className="text-xs text-muted-foreground">
                Manual DeepSeek call. Generated questions are draft-only and
                require Review Drafts approval before publishing.
              </p>
            </div>
            <form
              action={generateOriginalQuestionsFromApprovedBlueprint}
              className="mt-3 grid gap-3 sm:grid-cols-2"
            >
              <input name="blueprint_id" type="hidden" value={blueprint.id} />
              <label className="space-y-1 text-xs font-medium">
                Count
                <input
                  className="w-full rounded-md border bg-background px-2 py-1 text-sm"
                  defaultValue={1}
                  max={10}
                  min={1}
                  name="count"
                  type="number"
                />
              </label>
              <label className="space-y-1 text-xs font-medium">
                Question type
                <select
                  className="w-full rounded-md border bg-background px-2 py-1 text-sm"
                  defaultValue="frq"
                  name="question_type"
                >
                  <option value="frq">FRQ</option>
                  <option value="mcq">MCQ</option>
                  <option value="fill_blank">Fill blank</option>
                  <option value="mixed">Mixed</option>
                </select>
              </label>
              <label className="space-y-1 text-xs font-medium">
                Difficulty target
                <input
                  className="w-full rounded-md border bg-background px-2 py-1 text-sm"
                  max={1000}
                  min={0}
                  name="difficulty_target"
                  placeholder="Optional, 0-1000"
                  type="number"
                />
              </label>
              <label className="space-y-1 text-xs font-medium sm:col-span-2">
                Variation note
                <input
                  className="w-full rounded-md border bg-background px-2 py-1 text-sm"
                  maxLength={240}
                  name="variation_note"
                  placeholder="Optional: e.g. use a different scenario"
                  type="text"
                />
              </label>
              <div className="sm:col-span-2">
                <FormSubmitButton pendingLabel="Generating..." size="sm">
                  Generate original draft questions
                </FormSubmitButton>
              </div>
            </form>
          </div>
        ) : approved ? (
          <div className="rounded-md border bg-muted/20 p-3">
            <p className="text-sm font-medium">Generation disabled</p>
            <p className="text-xs text-muted-foreground">
              This blueprint must pass quality gates before DeepSeek generation.
            </p>
            <ReasonList reasons={quality.generationBlockingReasons} />
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

export default async function AdminBlueprintsPage({
  searchParams,
}: AdminBlueprintsPageProps) {
  const params = await searchParams;
  await requireAdmin();
  const supabase = await createClient();

  const [
    reviewActionsResult,
    blueprintsResult,
    importBatchesResult,
    blueprintExamplesResult,
    taxonomyCatalogResult,
  ] = await Promise.all([
    (supabase as any)
      .from("question_blueprint_review_actions")
      .select(
        "id, action_id, blueprint_draft_id, action_kind, status, reason, evidence, draft_snapshot, import_batch_id, created_at",
      )
      .in("status", ["pending_review", "needs_more_evidence", "rejected"])
      .order("created_at", { ascending: false })
      .limit(60),
    (supabase as any)
      .from("question_blueprints")
      .select(
        "id, title, status, owner_scope, taxonomy_targets, question_pattern, required_elements, answer_spec_pattern, distractor_pattern, generation_constraints, originality_constraints, source_refs, deleted_at, updated_at",
      )
      .order("updated_at", { ascending: false })
      .limit(50),
    supabase
      .from("import_batches")
      .select("id, status, summary, created_at")
      .order("created_at", { ascending: false })
      .limit(20),
    (supabase as any)
      .from("question_blueprint_examples")
      .select("blueprint_id, evidence_snippets")
      .limit(200),
    loadTaxonomyCatalog(supabase),
  ]);
  const setupNeeded =
    isMissingBlueprintTableError(reviewActionsResult.error) ||
    isMissingBlueprintTableError(blueprintsResult.error) ||
    isMissingBlueprintTableError(blueprintExamplesResult.error);
  const reviewActions = setupNeeded
    ? []
    : ((reviewActionsResult.data ?? []) as BlueprintReviewRow[]);
  const blueprints = setupNeeded
    ? []
    : ((blueprintsResult.data ?? []) as BlueprintRow[]);
  const taxonomyCatalog = taxonomyCatalogResult.catalog;
  const knownAssignableTagIds = leafAssignableTagIds(taxonomyCatalog);
  const pendingReviewActions = reviewActions.filter(
    (action) => action.status === "pending_review",
  );
  const needsMoreEvidenceActions = reviewActions.filter(
    (action) => action.status === "needs_more_evidence",
  );
  const rejectedReviewActions = reviewActions.filter(
    (action) => action.status === "rejected",
  );
  const evidenceByBlueprintId = new Map<string, string[]>();

  for (const example of (blueprintExamplesResult.data ?? []) as BlueprintExampleRow[]) {
    const current = evidenceByBlueprintId.get(example.blueprint_id) ?? [];
    evidenceByBlueprintId.set(example.blueprint_id, [
      ...current,
      ...stringList(example.evidence_snippets),
    ]);
  }
  const activeBlueprints = blueprints.filter(
    (blueprint) => !blueprint.deleted_at && blueprint.status !== "deprecated",
  );
  const archivedBlueprints = blueprints.filter(
    (blueprint) => !blueprint.deleted_at && blueprint.status === "deprecated",
  );
  const trashedBlueprints = blueprints.filter((blueprint) => blueprint.deleted_at);
  const importBatches = ((importBatchesResult.data ?? []) as ImportBatchRow[])
    .map((batch) => ({
      ...batch,
      blueprintDraftCount: blueprintDraftCount(batch.summary),
      reviewActionCount: blueprintReviewActionCount(batch.summary),
    }))
    .filter((batch) => batch.reviewActionCount > 0)
    .slice(0, 5);
  const summary = summarizeQuestionBlueprintLibrary({
    approvedBlueprintCount: blueprints.filter(
      (blueprint) => blueprint.status === "approved" && !blueprint.deleted_at,
    ).length,
    pendingReviewActionCount: pendingReviewActions.length,
    rejectedReviewActionCount: rejectedReviewActions.length,
  });
  const seedPlan = buildQuestionBlueprintLibrarySeedPlan({
    existingBlueprintCount: blueprints.length,
    pendingReviewActionCount: pendingReviewActions.length,
    sourceImportBatchCount: importBatches.length,
  });

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8">
      <section className="space-y-2">
        <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Admin tools
        </p>
        <h1 className="text-3xl font-semibold">Question Blueprint Library</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Extract and review reusable assessment patterns from source questions.
          Approved blueprints can later generate original draft questions with
          the same assessment structure.
        </p>
      </section>

      <PageFeedback error={params.error} saved={params.saved} />

      {params.reviewBatch ? (
        <Card className="border-emerald-300 bg-emerald-50">
          <CardHeader>
            <CardTitle className="text-base">
              Generated drafts sent to Review
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-emerald-950">
            <p>
              Generated drafts: {params.generated ?? "0"} | Blocked drafts:{" "}
              {params.blocked ?? "0"} | Warnings: {params.warnings ?? "0"}
            </p>
            <p className="font-mono text-xs">Batch: {params.reviewBatch}</p>
            <Link
              className="inline-flex rounded-md border border-emerald-700 px-3 py-1 text-sm font-medium"
              href={`/admin/review?batch=${params.reviewBatch}`}
            >
              Open Review Drafts
            </Link>
          </CardContent>
        </Card>
      ) : null}

      {setupNeeded ? (
        <Card className="border-amber-300 bg-amber-50">
          <CardHeader>
            <CardTitle className="text-base">Setup needed</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-amber-900">
            <p>
              Question Blueprint Library tables are not applied yet. Apply the
              BP5 migration before using review actions.
            </p>
            <p className="font-mono text-xs">
              supabase/migrations/0015_question_blueprint_library.sql
            </p>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-3 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground">Pending review</p>
            <p className="text-2xl font-semibold">
              {summary.pendingReviewActionCount}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground">Needs more evidence</p>
            <p className="text-2xl font-semibold">
              {needsMoreEvidenceActions.length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground">Approved library</p>
            <p className="text-2xl font-semibold">
              {summary.approvedBlueprintCount}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground">Rejected</p>
            <p className="text-2xl font-semibold">{rejectedReviewActions.length}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">AI import blueprint plans</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {importBatches.length ? (
            importBatches.map((batch) => (
              <div
                key={batch.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm"
              >
                <div>
                  <p className="font-medium">
                    {batch.reviewActionCount} review actions from{" "}
                    {batch.blueprintDraftCount} blueprint drafts
                  </p>
                  <p className="font-mono text-xs text-muted-foreground">
                    {batch.id} | {new Date(batch.created_at).toLocaleString()}
                  </p>
                </div>
                {!setupNeeded ? (
                  <form action={storeBlueprintReviewActionsFromImportBatch}>
                    <input name="import_batch_id" type="hidden" value={batch.id} />
                    <FormSubmitButton pendingLabel="Storing..." size="sm">
                      Store review actions
                    </FormSubmitButton>
                  </form>
                ) : (
                  <Badge variant="outline">Apply migration first</Badge>
                )}
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">
              No AI import blueprint review plans found yet.
            </p>
          )}
        </CardContent>
      </Card>

      <section className="space-y-3">
        <div>
          <h2 className="text-xl font-semibold">Pending blueprint review actions</h2>
          <p className="text-sm text-muted-foreground">
            Approve only reusable assessment patterns. Rejections and evidence
            requests do not generate questions.
          </p>
        </div>
        {pendingReviewActions.length ? (
          <div className="grid gap-4 xl:grid-cols-2">
            {pendingReviewActions.map((action) => (
              <ReviewActionCard
                action={action}
                key={action.id}
                knownAssignableTagIds={knownAssignableTagIds}
                taxonomyCatalog={taxonomyCatalog}
              />
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="pt-6 text-sm text-muted-foreground">
              No pending blueprint review actions.
            </CardContent>
          </Card>
        )}
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-xl font-semibold">Needs more evidence</h2>
          <p className="text-sm text-muted-foreground">
            These blueprint drafts are preserved for follow-up. Add taxonomy
            targets or gather stronger source evidence, then save edits to move
            them back to pending review.
          </p>
        </div>
        {needsMoreEvidenceActions.length ? (
          <div className="grid gap-4 xl:grid-cols-2">
            {needsMoreEvidenceActions.map((action) => (
              <ReviewActionCard
                action={action}
                key={action.id}
                knownAssignableTagIds={knownAssignableTagIds}
                taxonomyCatalog={taxonomyCatalog}
              />
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="pt-6 text-sm text-muted-foreground">
              No blueprint drafts currently need more evidence.
            </CardContent>
          </Card>
        )}
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-xl font-semibold">Rejected</h2>
          <p className="text-sm text-muted-foreground">
            Rejected blueprint drafts remain visible for audit and comparison.
          </p>
        </div>
        {rejectedReviewActions.length ? (
          <div className="grid gap-4 xl:grid-cols-2">
            {rejectedReviewActions.map((action) => (
              <ReviewActionCard
                action={action}
                key={action.id}
                knownAssignableTagIds={knownAssignableTagIds}
                taxonomyCatalog={taxonomyCatalog}
              />
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="pt-6 text-sm text-muted-foreground">
              No rejected blueprint drafts.
            </CardContent>
          </Card>
        )}
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-xl font-semibold">Active library</h2>
          <p className="text-sm text-muted-foreground">
            Approved blueprints can manually create original draft questions for
            Review Drafts. They are never published automatically.
          </p>
        </div>
        {activeBlueprints.length ? (
          <div className="grid gap-4 xl:grid-cols-2">
            {activeBlueprints.map((blueprint) => (
              <LibraryCard
                blueprint={blueprint}
                evidenceSnippets={evidenceByBlueprintId.get(blueprint.id) ?? []}
                key={blueprint.id}
                knownAssignableTagIds={knownAssignableTagIds}
              />
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="pt-6 text-sm text-muted-foreground">
              No approved blueprints yet.
            </CardContent>
          </Card>
        )}
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-xl font-semibold">Archived / Trash</h2>
          <p className="text-sm text-muted-foreground">
            Deprecated and trashed blueprints are preserved for lineage. Permanent
            hard delete is intentionally deferred.
          </p>
        </div>
        {archivedBlueprints.length || trashedBlueprints.length ? (
          <div className="grid gap-4 xl:grid-cols-2">
            {[...archivedBlueprints, ...trashedBlueprints].map((blueprint) => (
              <LibraryCard
                blueprint={blueprint}
                evidenceSnippets={evidenceByBlueprintId.get(blueprint.id) ?? []}
                key={blueprint.id}
                knownAssignableTagIds={knownAssignableTagIds}
              />
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="pt-6 text-sm text-muted-foreground">
              No archived or trashed blueprints.
            </CardContent>
          </Card>
        )}
      </section>
    </main>
  );
}
