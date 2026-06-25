import Link from "next/link";

import {
  approveQuestionBlueprintReviewAction,
  generateOriginalQuestionsFromApprovedBlueprint,
  markQuestionBlueprintNeedsEvidence,
  rejectQuestionBlueprintReviewAction,
  storeBlueprintReviewActionsFromImportBatch,
} from "@/app/admin/blueprints/actions";
import { FormSubmitButton } from "@/components/form-submit-button";
import { MathContent } from "@/components/math-content";
import { PageFeedback } from "@/components/page-feedback";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireAdmin } from "@/lib/auth/guards";
import {
  buildQuestionBlueprintLibrarySeedPlan,
  summarizeQuestionBlueprintLibrary,
} from "@/lib/blueprints/question-blueprint-persistence";
import { createClient } from "@/lib/supabase/server";
import { taxonomyDisplayLabelFromId } from "@/lib/tags/taxonomy-display";

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
  id: string;
  owner_scope: string;
  question_pattern: unknown;
  required_elements: unknown;
  source_refs: unknown;
  status: string;
  taxonomy_targets: unknown;
  title: string;
  updated_at: string;
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

function DraftSnapshotSummary({ snapshot }: { snapshot: unknown }) {
  const draft = asRecord(snapshot);
  const evidence = asRecord(draft.evidence);
  const snippets = stringList(evidence.boundedSnippets).slice(0, 3);
  const requiredElements = stringList(draft.requiredElements).slice(0, 6);
  const generationConstraints = stringList(draft.generationConstraints).slice(0, 5);

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
      <TaxonomyTargets targets={draft.taxonomyTargets} />
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

function ReviewActionCard({ action }: { action: BlueprintReviewRow }) {
  const isApproveReady = action.action_kind === "approve_blueprint";

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
          value={action.reason}
        />
        <DraftSnapshotSummary snapshot={action.draft_snapshot} />
        <div className="flex flex-wrap gap-2">
          {isApproveReady ? (
            <form action={approveQuestionBlueprintReviewAction}>
              <input name="id" type="hidden" value={action.id} />
              <FormSubmitButton pendingLabel="Approving..." size="sm">
                Approve blueprint
              </FormSubmitButton>
            </form>
          ) : (
            <Badge variant="outline">Needs edit before approval</Badge>
          )}
          <form action={markQuestionBlueprintNeedsEvidence}>
            <input name="id" type="hidden" value={action.id} />
            <FormSubmitButton pendingLabel="Marking..." size="sm" variant="outline">
              Needs more evidence
            </FormSubmitButton>
          </form>
          <form action={rejectQuestionBlueprintReviewAction}>
            <input name="id" type="hidden" value={action.id} />
            <FormSubmitButton pendingLabel="Rejecting..." size="sm" variant="destructive">
              Reject
            </FormSubmitButton>
          </form>
        </div>
      </CardContent>
    </Card>
  );
}

function LibraryCard({ blueprint }: { blueprint: BlueprintRow }) {
  const questionPattern = asRecord(blueprint.question_pattern);
  const requiredElements = stringList(blueprint.required_elements).slice(0, 6);
  const approved = blueprint.status === "approved";

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
        {approved ? (
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
  ] = await Promise.all([
    (supabase as any)
      .from("question_blueprint_review_actions")
      .select(
        "id, action_id, blueprint_draft_id, action_kind, status, reason, evidence, draft_snapshot, import_batch_id, created_at",
      )
      .eq("status", "pending_review")
      .order("created_at", { ascending: false })
      .limit(20),
    (supabase as any)
      .from("question_blueprints")
      .select(
        "id, title, status, owner_scope, taxonomy_targets, question_pattern, required_elements, source_refs, updated_at",
      )
      .order("updated_at", { ascending: false })
      .limit(20),
    supabase
      .from("import_batches")
      .select("id, status, summary, created_at")
      .order("created_at", { ascending: false })
      .limit(20),
  ]);
  const setupNeeded =
    isMissingBlueprintTableError(reviewActionsResult.error) ||
    isMissingBlueprintTableError(blueprintsResult.error);
  const reviewActions = setupNeeded
    ? []
    : ((reviewActionsResult.data ?? []) as BlueprintReviewRow[]);
  const blueprints = setupNeeded
    ? []
    : ((blueprintsResult.data ?? []) as BlueprintRow[]);
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
      (blueprint) => blueprint.status === "approved",
    ).length,
    pendingReviewActionCount: reviewActions.length,
    rejectedReviewActionCount: 0,
  });
  const seedPlan = buildQuestionBlueprintLibrarySeedPlan({
    existingBlueprintCount: blueprints.length,
    pendingReviewActionCount: reviewActions.length,
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
            <p className="text-xs text-muted-foreground">Approved library</p>
            <p className="text-2xl font-semibold">
              {summary.approvedBlueprintCount}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground">Import plans found</p>
            <p className="text-2xl font-semibold">
              {seedPlan.sourceImportBatchCount}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground">Safety</p>
            <p className="text-sm font-medium">Manual generation only</p>
            <p className="text-xs text-muted-foreground">
              Review Drafts required before publishing
            </p>
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
        {reviewActions.length ? (
          <div className="grid gap-4 xl:grid-cols-2">
            {reviewActions.map((action) => (
              <ReviewActionCard action={action} key={action.id} />
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
          <h2 className="text-xl font-semibold">Approved blueprint library</h2>
          <p className="text-sm text-muted-foreground">
            Approved blueprints can manually create original draft questions for
            Review Drafts. They are never published automatically.
          </p>
        </div>
        {blueprints.length ? (
          <div className="grid gap-4 xl:grid-cols-2">
            {blueprints.map((blueprint) => (
              <LibraryCard blueprint={blueprint} key={blueprint.id} />
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
    </main>
  );
}
