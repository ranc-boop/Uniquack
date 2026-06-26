import Link from "next/link";

import {
  archiveQuestionBlueprintFolder,
  archiveQuestionBlueprint,
  approveQuestionBlueprintReviewAction,
  createQuestionBlueprintFolder,
  createMergedQuestionBlueprintDraft,
  generateOriginalQuestionsFromApprovedBlueprint,
  markQuestionBlueprintNeedsEvidence,
  moveQuestionBlueprintToTrash,
  moveQuestionBlueprintFolder,
  moveQuestionBlueprintToFolder,
  renameQuestionBlueprintFolder,
  rejectQuestionBlueprintReviewAction,
  replaceQuestionBlueprint,
  runBlueprintCalibrationPreview,
  splitQuestionBlueprint,
  restoreQuestionBlueprintFolder,
  restoreQuestionBlueprint,
  storeBlueprintReviewActionsFromImportBatch,
  updateQuestionBlueprintFields,
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
  buildQuestionBlueprintFolderTree,
  flattenQuestionBlueprintFolderTree,
  summarizeQuestionBlueprintFolders,
  type QuestionBlueprintFolderRow,
  type QuestionBlueprintFolderTreeNode,
} from "@/lib/blueprints/question-blueprint-folders";
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
    folder?: string;
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
  difficulty_profile: unknown;
  distractor_pattern: unknown;
  folder_id: string | null;
  generation_constraints: unknown;
  generation_readiness: string;
  id: string;
  last_calibrated_at: string | null;
  last_calibration_run_id: string | null;
  originality_constraints: unknown;
  owner_scope: string;
  question_pattern: unknown;
  required_elements: unknown;
  source_refs: unknown;
  status: string;
  taxonomy_targets: unknown;
  title: string;
  updated_at: string;
  version: number;
};

type BlueprintExampleRow = {
  blueprint_id: string;
  evidence_snippets: unknown;
};

type BlueprintCalibrationRunRow = {
  adherence_summary: unknown;
  blocking_reasons: unknown;
  blueprint_id: string;
  blueprint_version: number;
  created_at: string;
  diversity_summary: unknown;
  id: string;
  model_name: string;
  originality_summary: unknown;
  readiness_result: string;
  sample_count: number;
  sample_previews: unknown;
  validation_summary: unknown;
};

type BlueprintVersionRow = {
  blueprint_id: string;
  change_reason: string;
  created_at: string;
  id: string;
  version: number;
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
    /folder_id|generation_readiness|question_blueprint|relation .* does not exist|schema cache/i.test(
      message,
    )
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

function textareaValue(value: unknown) {
  return stringList(value).join("\n");
}

function questionPatternValue(value: unknown) {
  const pattern = asRecord(value).pattern;

  return firstString(pattern, typeof value === "string" ? value : "");
}

function answerSpecKindValue(value: unknown) {
  const kind = asRecord(value).kind;

  return firstString(kind, "frq");
}

function answerSpecNotesValue(value: unknown) {
  const record = asRecord(value);

  return [
    ...stringList(record.acceptedAnswerGuidance),
    ...stringList(record.requiredAnswerFields),
    ...stringList(record.correctAnswerGuidance),
    ...stringList(record.optionGuidance),
  ].join("\n");
}

function difficultyEstimateValue(value: unknown) {
  const estimate = asRecord(value).estimatedDifficulty;

  return Number.isFinite(Number(estimate)) ? String(Math.round(Number(estimate))) : "";
}

function difficultyDriversValue(value: unknown) {
  return textareaValue(asRecord(value).difficultyDrivers);
}

function adminEvidenceNotesValue(value: unknown) {
  return textareaValue(asRecord(value).adminEvidenceNotes);
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
    <div className="grid gap-3 text-xs sm:grid-cols-2 2xl:grid-cols-5">
      {groups.map(([label, ids]) =>
        ids.length ? (
          <div
            key={label}
            className="min-w-0 space-y-2 rounded-md border bg-muted/20 p-3"
          >
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {label}
            </p>
            <div className="flex min-w-0 flex-wrap gap-2">
              {ids.map((id) => (
                <span
                  key={id}
                  className="max-w-full rounded-md border bg-background px-2.5 py-1.5"
                >
                  <span className="block font-medium leading-snug">
                    {taxonomyDisplayLabelFromId(id)}
                  </span>
                  <span
                    className="block font-mono text-[10px] leading-snug text-muted-foreground"
                    style={{ overflowWrap: "anywhere" }}
                  >
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

function calibrationLabel(value: unknown) {
  switch (value) {
    case "generation_ready":
      return "Ready";
    case "needs_edit":
      return "Needs edit";
    case "blocked":
      return "Blocked";
    case "calibrating":
      return "Calibrating";
    default:
      return "Uncalibrated";
  }
}

function scoreText(value: unknown) {
  const numeric = Number(value);

  return Number.isFinite(numeric) ? numeric.toFixed(2) : "-";
}

function CalibrationRunSummary({
  run,
}: {
  run?: BlueprintCalibrationRunRow;
}) {
  if (!run) {
    return (
      <p className="text-xs text-muted-foreground">
        No calibration preview has been run yet.
      </p>
    );
  }

  const validationSummary = asRecord(run.validation_summary);
  const adherenceSummary = asRecord(run.adherence_summary);
  const originalitySummary = asRecord(run.originality_summary);
  const diversitySummary = asRecord(run.diversity_summary);
  const samples = asArray(run.sample_previews).slice(0, 3);
  const blockers = stringList(run.blocking_reasons).slice(0, 8);
  const repairAttemptCount = Number(validationSummary.repairAttemptCount ?? 0);
  const modelQualityMode = firstString(validationSummary.modelQualityMode, "fast");
  const qualityFallbackReason = firstString(validationSummary.qualityFallbackReason);

  return (
    <div className="space-y-3 rounded-md border bg-background p-3">
      <div className="grid gap-2 text-xs sm:grid-cols-4">
        <p className="rounded-md border bg-muted/20 p-2">
          Samples: {run.sample_count}
        </p>
        <p className="rounded-md border bg-muted/20 p-2">
          Valid: {String(validationSummary.validSampleCount ?? "-")}
        </p>
        <p className="rounded-md border bg-muted/20 p-2">
          Adherence: {scoreText(adherenceSummary.score)}
        </p>
        <p className="rounded-md border bg-muted/20 p-2">
          Diversity: {scoreText(diversitySummary.score)}
        </p>
      </div>
      <p className="text-xs text-muted-foreground">
        Latest calibration: {new Date(run.created_at).toLocaleString()} | Model:{" "}
        {run.model_name} | Quality: {modelQualityMode}
      </p>
      {qualityFallbackReason ? (
        <p className="text-xs text-amber-700">{qualityFallbackReason}</p>
      ) : null}
      {repairAttemptCount > 0 ? (
        <p className="rounded-md border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
          Automatic repair attempted {repairAttemptCount} time
          {repairAttemptCount === 1 ? "" : "s"}. Repaired samples were
          revalidated locally before affecting readiness.
        </p>
      ) : null}
      {samples.length ? (
        <details className="rounded-md border bg-muted/10 px-3 py-2">
          <summary className="cursor-pointer text-xs font-medium">
            Generated sample previews
          </summary>
          <div className="mt-2 space-y-2">
            {samples.map((sample, index) => {
              const record = asRecord(sample);
              const warnings = stringList(record.warnings).slice(0, 5);
              const repairAttempt = asRecord(record.repairAttempt);
              const repairStatus = firstString(repairAttempt.status);

              return (
                <div className="rounded-md border bg-background p-2" key={`${run.id}-${index}`}>
                  <p className="text-sm font-medium">
                    {firstString(record.title, `Sample ${index + 1}`)}
                  </p>
                  {repairStatus ? (
                    <p className="text-xs text-muted-foreground">
                      Initial validation failed. Repair attempted:{" "}
                      <span className="font-medium">{repairStatus}</span>.
                    </p>
                  ) : null}
                  <MathContent
                    className="text-xs text-muted-foreground"
                    format="plain"
                    value={firstString(record.contentPreview, "No preview.")}
                  />
                  {warnings.length ? <ReasonList reasons={warnings} /> : null}
                </div>
              );
            })}
          </div>
        </details>
      ) : null}
      {blockers.length ? (
        <div className="space-y-2">
          <p className="text-xs font-medium">Readiness blockers</p>
          {repairAttemptCount > 0 ? (
            <p className="rounded-md border bg-amber-50 px-3 py-2 text-xs text-amber-900">
              The system tried to repair failed samples automatically, but
              validation blockers still remain. Edit the blueprint, add answer
              requirements, or rerun calibration with Quality mode.
            </p>
          ) : null}
          <ReasonList reasons={blockers} />
          {blockers.some((blocker) => /mcq|option|correct|distractor/i.test(blocker)) ? (
            <div className="rounded-md border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
              Suggested fixes: keep as MCQ and add option/distractor
              requirements, or edit the blueprint to FRQ if open response is
              intended, then rerun calibration using Quality mode.
            </div>
          ) : null}
        </div>
      ) : null}
      {Number(originalitySummary.tooCloseToEvidenceCount ?? 0) > 0 ? (
        <p className="text-xs text-destructive">
          Originality guard blocked at least one calibration sample.
        </p>
      ) : null}
    </div>
  );
}

function folderFilterHref(folderId: string) {
  return folderId === "all"
    ? "/admin/blueprints"
    : `/admin/blueprints?folder=${encodeURIComponent(folderId)}`;
}

function FolderSelect({
  defaultValue,
  folderOptions,
  includeRoot = false,
  includeUnfiled = false,
  name = "folder_id",
}: {
  defaultValue?: string | null;
  folderOptions: QuestionBlueprintFolderTreeNode[];
  includeRoot?: boolean;
  includeUnfiled?: boolean;
  name?: string;
}) {
  return (
    <select
      className="w-full rounded-md border bg-background px-2 py-1 text-sm"
      defaultValue={defaultValue ?? (includeRoot ? "root" : "unfiled")}
      name={name}
    >
      {includeRoot ? <option value="root">Top level</option> : null}
      {includeUnfiled ? <option value="unfiled">Unfiled</option> : null}
      {folderOptions.map((folder) => (
        <option key={folder.id} value={folder.id}>
          {"--".repeat(folder.depth)}
          {folder.depth ? " " : ""}
          {folder.name}
        </option>
      ))}
    </select>
  );
}

function BlueprintFolderTree({
  nodes,
  selectedFolderId,
}: {
  nodes: QuestionBlueprintFolderTreeNode[];
  selectedFolderId: string;
}) {
  if (!nodes.length) {
    return (
      <p className="rounded-md border border-dashed p-2 text-xs text-muted-foreground">
        No folders yet.
      </p>
    );
  }

  return (
    <ul className="space-y-1">
      {nodes.map((node) => (
        <li key={node.id}>
          <Link
            className={`block rounded-md border px-2 py-1.5 text-sm ${
              selectedFolderId === node.id
                ? "bg-primary text-primary-foreground"
                : "bg-background hover:bg-muted/40"
            }`}
            href={folderFilterHref(node.id)}
          >
            <span className="block font-medium">{node.name}</span>
            {node.description ? (
              <span className="block truncate text-xs opacity-75">
                {node.description}
              </span>
            ) : null}
          </Link>
          {node.children.length ? (
            <div className="ml-3 mt-1 border-l pl-2">
              <BlueprintFolderTree
                nodes={node.children}
                selectedFolderId={selectedFolderId}
              />
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function BlueprintFolderPanel({
  archivedFolders,
  folderOptions,
  folderSummary,
  folderTree,
  selectedFolder,
  selectedFolderId,
}: {
  archivedFolders: QuestionBlueprintFolderRow[];
  folderOptions: QuestionBlueprintFolderTreeNode[];
  folderSummary: ReturnType<typeof summarizeQuestionBlueprintFolders>;
  folderTree: QuestionBlueprintFolderTreeNode[];
  selectedFolder?: QuestionBlueprintFolderRow;
  selectedFolderId: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Blueprint folders</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <div className="grid gap-2 text-xs sm:grid-cols-4">
          <p className="rounded-md border bg-muted/20 p-2">
            Active folders: {folderSummary.activeFolderCount}
          </p>
          <p className="rounded-md border bg-muted/20 p-2">
            Filed: {folderSummary.filedBlueprintCount}
          </p>
          <p className="rounded-md border bg-muted/20 p-2">
            Unfiled: {folderSummary.unfiledBlueprintCount}
          </p>
          <p className="rounded-md border bg-muted/20 p-2">
            Archived folders: {folderSummary.archivedFolderCount}
          </p>
        </div>

        <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
          <div className="space-y-3">
            <div className="space-y-1">
              <Link
                className={`block rounded-md border px-2 py-1.5 text-sm ${
                  selectedFolderId === "all"
                    ? "bg-primary text-primary-foreground"
                    : "bg-background hover:bg-muted/40"
                }`}
                href="/admin/blueprints"
              >
                All blueprints
              </Link>
              <Link
                className={`block rounded-md border px-2 py-1.5 text-sm ${
                  selectedFolderId === "unfiled"
                    ? "bg-primary text-primary-foreground"
                    : "bg-background hover:bg-muted/40"
                }`}
                href={folderFilterHref("unfiled")}
              >
                Unfiled
              </Link>
            </div>
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Folder tree
              </p>
              <BlueprintFolderTree
                nodes={folderTree}
                selectedFolderId={selectedFolderId}
              />
            </div>
          </div>

          <div className="space-y-3">
            <details className="rounded-md border bg-muted/20 p-3" open>
              <summary className="cursor-pointer text-sm font-medium">
                Create folder
              </summary>
              <form action={createQuestionBlueprintFolder} className="mt-3 grid gap-3 md:grid-cols-2">
                <label className="space-y-1 text-xs font-medium">
                  Name
                  <input
                    className="w-full rounded-md border bg-background px-2 py-1 text-sm"
                    maxLength={120}
                    name="name"
                    placeholder="Applications of Integration"
                    required
                  />
                </label>
                <label className="space-y-1 text-xs font-medium">
                  Parent folder
                  <FolderSelect
                    folderOptions={folderOptions}
                    includeRoot
                    name="parent_id"
                  />
                </label>
                <label className="space-y-1 text-xs font-medium md:col-span-2">
                  Description
                  <input
                    className="w-full rounded-md border bg-background px-2 py-1 text-sm"
                    maxLength={500}
                    name="description"
                    placeholder="Optional note for admins"
                  />
                </label>
                <div className="md:col-span-2">
                  <FormSubmitButton pendingLabel="Creating..." size="sm">
                    Create folder
                  </FormSubmitButton>
                </div>
              </form>
            </details>

            {selectedFolder ? (
              <details className="rounded-md border bg-muted/20 p-3" open>
                <summary className="cursor-pointer text-sm font-medium">
                  Selected folder controls
                </summary>
                <div className="mt-3 grid gap-3 lg:grid-cols-2">
                  <form action={renameQuestionBlueprintFolder} className="space-y-2">
                    <input name="folder_id" type="hidden" value={selectedFolder.id} />
                    <label className="space-y-1 text-xs font-medium">
                      Rename
                      <input
                        className="w-full rounded-md border bg-background px-2 py-1 text-sm"
                        defaultValue={selectedFolder.name}
                        maxLength={120}
                        name="name"
                        required
                      />
                    </label>
                    <label className="space-y-1 text-xs font-medium">
                      Description
                      <input
                        className="w-full rounded-md border bg-background px-2 py-1 text-sm"
                        defaultValue={selectedFolder.description ?? ""}
                        maxLength={500}
                        name="description"
                      />
                    </label>
                    <FormSubmitButton pendingLabel="Saving..." size="sm" variant="outline">
                      Rename folder
                    </FormSubmitButton>
                  </form>
                  <form action={moveQuestionBlueprintFolder} className="space-y-2">
                    <input name="folder_id" type="hidden" value={selectedFolder.id} />
                    <label className="space-y-1 text-xs font-medium">
                      Move under
                      <FolderSelect
                        defaultValue={selectedFolder.parent_id ?? "root"}
                        folderOptions={folderOptions}
                        includeRoot
                        name="parent_id"
                      />
                    </label>
                    <FormSubmitButton pendingLabel="Moving..." size="sm" variant="outline">
                      Move folder
                    </FormSubmitButton>
                  </form>
                  <form action={archiveQuestionBlueprintFolder} className="lg:col-span-2">
                    <input name="folder_id" type="hidden" value={selectedFolder.id} />
                    <FormSubmitButton pendingLabel="Archiving..." size="sm" variant="destructive">
                      Archive folder
                    </FormSubmitButton>
                  </form>
                </div>
              </details>
            ) : null}

            <details className="rounded-md border bg-muted/20 p-3">
              <summary className="cursor-pointer text-sm font-medium">
                Archived folders
              </summary>
              <div className="mt-3 space-y-2">
                {archivedFolders.length ? (
                  archivedFolders.map((folder) => (
                    <form
                      action={restoreQuestionBlueprintFolder}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-background p-2"
                      key={folder.id}
                    >
                      <input name="folder_id" type="hidden" value={folder.id} />
                      <span className="text-sm">{folder.name}</span>
                      <FormSubmitButton pendingLabel="Restoring..." size="sm" variant="outline">
                        Restore folder
                      </FormSubmitButton>
                    </form>
                  ))
                ) : (
                  <p className="text-xs text-muted-foreground">
                    No archived folders.
                  </p>
                )}
              </div>
            </details>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          Archiving a folder hides it from the active folder tree. Blueprints are
          never hard-deleted by folder actions and remain available from All
          blueprints.
        </p>
      </CardContent>
    </Card>
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
    <div className="space-y-4">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Short pattern summary
        </p>
        <MathContent
          className="mt-1 text-sm text-muted-foreground"
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
      <div className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Grouped taxonomy targets
        </p>
        <TaxonomyTargets targets={draft.taxonomyTargets} />
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {requiredElements.length ? (
          <div className="rounded-md border bg-muted/20 p-3">
            <p className="text-xs font-medium">Required elements</p>
            <MathContent
              className="mt-1 text-xs text-muted-foreground"
              format="plain"
              value={requiredElements.join("; ")}
            />
          </div>
        ) : null}
        {generationConstraints.length ? (
          <div className="rounded-md border bg-muted/20 p-3">
            <p className="text-xs font-medium">Generation constraints</p>
            <MathContent
              className="mt-1 text-xs text-muted-foreground"
              format="plain"
              value={generationConstraints.join("; ")}
            />
          </div>
        ) : null}
      </div>
      {snippets.length || taxonomyTargetHints.length || specificityWarnings.length ? (
        <details className="rounded-md border bg-muted/20 px-3 py-2">
          <summary className="cursor-pointer text-xs font-medium">
            Source refs and internal notes
          </summary>
          <div className="mt-2 space-y-3 text-xs text-muted-foreground">
            {snippets.length ? (
              <div>
                <p className="font-medium text-foreground">Source example refs</p>
                <ul className="mt-1 list-disc space-y-1 pl-4">
                  {snippets.map((snippet) => (
                    <li key={snippet}>
                      <MathContent format="plain" value={snippet} />
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {taxonomyTargetHints.length ? (
              <p>Taxonomy hints: {taxonomyTargetHints.join("; ")}</p>
            ) : null}
            {specificityWarnings.length ? (
              <p>Specificity warnings: {specificityWarnings.join("; ")}</p>
            ) : null}
          </div>
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
  const draftTitle = firstString(draft.title, "Blueprint draft");

  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1 space-y-1">
            <CardTitle className="break-words text-base">
              {draftTitle}
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Review action: {action.action_kind.replaceAll("_", " ")}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">{action.status}</Badge>
            <Badge variant={canApprove ? "secondary" : "outline"}>
              {canApprove ? "Approval ready" : "Needs review"}
            </Badge>
          </div>
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
          <div className="space-y-2 rounded-md border bg-muted/20 p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Actions
            </p>
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
              Draft ID:{" "}
              <span className="font-mono">{action.blueprint_draft_id}</span>
            </div>
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

function BlueprintEditPanel({
  allBlueprints,
  blueprint,
  taxonomyCatalog,
  versionRows,
}: {
  allBlueprints: BlueprintRow[];
  blueprint: BlueprintRow;
  taxonomyCatalog: TaxonomyCatalogView;
  versionRows: BlueprintVersionRow[];
}) {
  const otherBlueprints = allBlueprints.filter(
    (candidate) => candidate.id !== blueprint.id && !candidate.deleted_at,
  );
  const targets = selectedTaxonomyTargets(blueprint.taxonomy_targets);

  return (
    <details className="rounded-md border bg-muted/20 p-3">
      <summary className="cursor-pointer text-sm font-medium">
        Edit, version, split / merge
      </summary>
      <div className="mt-3 space-y-4">
        <div className="rounded-md border bg-background p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-medium">Version history</p>
              <p className="text-xs text-muted-foreground">
                Current version: {blueprint.version}. Meaningful edits create a
                snapshot and invalidate calibration.
              </p>
            </div>
            <Badge variant="outline">{versionRows.length} snapshots</Badge>
          </div>
          {versionRows.length ? (
            <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
              {versionRows.slice(0, 3).map((row) => (
                <li key={row.id}>
                  v{row.version} - {row.change_reason} -{" "}
                  {new Date(row.created_at).toLocaleString()}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-xs text-muted-foreground">
              No version snapshots yet.
            </p>
          )}
        </div>

        <details className="rounded-md border bg-background p-3">
          <summary className="cursor-pointer text-sm font-medium">
            Edit blueprint fields
          </summary>
          <form action={updateQuestionBlueprintFields} className="mt-3 space-y-4">
            <input name="blueprint_id" type="hidden" value={blueprint.id} />
            <div className="grid gap-3 md:grid-cols-2">
              <label className="space-y-1 text-xs font-medium">
                Title
                <input
                  className="w-full rounded-md border bg-background px-2 py-1 text-sm"
                  defaultValue={blueprint.title}
                  maxLength={180}
                  name="edit_title"
                  required
                />
              </label>
              <label className="space-y-1 text-xs font-medium">
                Change reason
                <input
                  className="w-full rounded-md border bg-background px-2 py-1 text-sm"
                  maxLength={240}
                  name="change_reason"
                  placeholder="Why this blueprint changed"
                />
              </label>
            </div>

            <TaxonomyTagTreePicker
              defaultOpenFacetKeys={["concept", "method", "task", "form"]}
              namePrefix="edit_tax"
              selectable="assignable_leaf"
              selectedTagIds={targets}
              taxonomyCatalog={taxonomyCatalog}
              title="Edit taxonomy targets"
            />

            <label className="block space-y-1 text-xs font-medium">
              Question pattern
              <textarea
                className="min-h-24 w-full rounded-md border bg-background px-2 py-1 text-sm"
                defaultValue={questionPatternValue(blueprint.question_pattern)}
                maxLength={1200}
                name="edit_question_pattern"
                required
              />
            </label>

            <div className="grid gap-3 md:grid-cols-2">
              <label className="space-y-1 text-xs font-medium">
                Required elements
                <textarea
                  className="min-h-24 w-full rounded-md border bg-background px-2 py-1 text-sm"
                  defaultValue={textareaValue(blueprint.required_elements)}
                  name="edit_required_elements"
                />
              </label>
              <label className="space-y-1 text-xs font-medium">
                Generation constraints
                <textarea
                  className="min-h-24 w-full rounded-md border bg-background px-2 py-1 text-sm"
                  defaultValue={textareaValue(blueprint.generation_constraints)}
                  name="edit_generation_constraints"
                />
              </label>
              <label className="space-y-1 text-xs font-medium">
                Originality constraints
                <textarea
                  className="min-h-24 w-full rounded-md border bg-background px-2 py-1 text-sm"
                  defaultValue={textareaValue(blueprint.originality_constraints)}
                  name="edit_originality_constraints"
                />
              </label>
              <label className="space-y-1 text-xs font-medium">
                Distractor pattern
                <textarea
                  className="min-h-24 w-full rounded-md border bg-background px-2 py-1 text-sm"
                  defaultValue={textareaValue(blueprint.distractor_pattern)}
                  name="edit_distractor_pattern"
                />
              </label>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <label className="space-y-1 text-xs font-medium">
                Answer kind
                <select
                  className="w-full rounded-md border bg-background px-2 py-1 text-sm"
                  defaultValue={answerSpecKindValue(blueprint.answer_spec_pattern)}
                  name="edit_answer_spec_kind"
                >
                  <option value="frq">FRQ</option>
                  <option value="mcq">MCQ</option>
                  <option value="fill_blank">Fill blank</option>
                  <option value="mixed">Mixed</option>
                </select>
              </label>
              <label className="space-y-1 text-xs font-medium">
                Difficulty estimate
                <input
                  className="w-full rounded-md border bg-background px-2 py-1 text-sm"
                  defaultValue={difficultyEstimateValue(blueprint.difficulty_profile)}
                  max={1000}
                  min={0}
                  name="edit_difficulty_estimate"
                  type="number"
                />
              </label>
              <label className="space-y-1 text-xs font-medium">
                Difficulty drivers
                <textarea
                  className="min-h-16 w-full rounded-md border bg-background px-2 py-1 text-sm"
                  defaultValue={difficultyDriversValue(blueprint.difficulty_profile)}
                  name="edit_difficulty_drivers"
                />
              </label>
            </div>

            <label className="block space-y-1 text-xs font-medium">
              Answer structure notes
              <textarea
                className="min-h-20 w-full rounded-md border bg-background px-2 py-1 text-sm"
                defaultValue={answerSpecNotesValue(blueprint.answer_spec_pattern)}
                name="edit_answer_spec_notes"
              />
            </label>

            <label className="block space-y-1 text-xs font-medium">
              Source evidence notes / bounded refs
              <textarea
                className="min-h-20 w-full rounded-md border bg-background px-2 py-1 text-sm"
                defaultValue={adminEvidenceNotesValue(blueprint.source_refs)}
                name="edit_source_evidence_notes"
                placeholder="Short admin notes only. Do not paste raw PDFs or provider responses."
              />
            </label>

            <div className="rounded-md border bg-amber-50 p-2 text-xs text-amber-900">
              Saving a meaningful edit sets generation readiness to uncalibrated.
              Re-run calibration before generating draft questions.
            </div>

            <FormSubmitButton pendingLabel="Saving..." size="sm">
              Save blueprint edit
            </FormSubmitButton>
          </form>
        </details>

        <details className="rounded-md border bg-background p-3">
          <summary className="cursor-pointer text-sm font-medium">
            Advanced split / merge
          </summary>
          <div className="mt-3 grid gap-4 lg:grid-cols-3">
            <form action={splitQuestionBlueprint} className="space-y-2">
              <input name="blueprint_id" type="hidden" value={blueprint.id} />
              <p className="text-sm font-medium">Split blueprint</p>
              <p className="text-xs text-muted-foreground">
                Creates draft copies. The original blueprint is unchanged.
              </p>
              <textarea
                className="min-h-24 w-full rounded-md border bg-background px-2 py-1 text-sm"
                name="split_titles"
                placeholder="One new draft title per line"
              />
              <FormSubmitButton pendingLabel="Creating..." size="sm" variant="outline">
                Split blueprint
              </FormSubmitButton>
            </form>

            <form action={createMergedQuestionBlueprintDraft} className="space-y-2">
              <input name="source_blueprint_id" type="hidden" value={blueprint.id} />
              <p className="text-sm font-medium">Merge preview</p>
              <p className="text-xs text-muted-foreground">
                Creates a merged draft and keeps both source blueprints.
              </p>
              <select
                className="w-full rounded-md border bg-background px-2 py-1 text-sm"
                name="target_blueprint_id"
                required
              >
                <option value="">Choose target blueprint</option>
                {otherBlueprints.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.title}
                  </option>
                ))}
              </select>
              <FormSubmitButton pendingLabel="Creating..." size="sm" variant="outline">
                Create merged draft
              </FormSubmitButton>
            </form>

            <form action={replaceQuestionBlueprint} className="space-y-2">
              <input name="blueprint_id" type="hidden" value={blueprint.id} />
              <p className="text-sm font-medium">Deprecate and replace</p>
              <p className="text-xs text-muted-foreground">
                Links this blueprint to a replacement without deleting lineage.
              </p>
              <select
                className="w-full rounded-md border bg-background px-2 py-1 text-sm"
                name="replacement_blueprint_id"
                required
              >
                <option value="">Choose replacement blueprint</option>
                {otherBlueprints.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.title}
                  </option>
                ))}
              </select>
              <FormSubmitButton pendingLabel="Deprecating..." size="sm" variant="outline">
                Deprecate and replace
              </FormSubmitButton>
            </form>
          </div>
        </details>
      </div>
    </details>
  );
}

function LibraryCard({
  allBlueprints,
  blueprint,
  evidenceSnippets,
  folderOptions,
  knownAssignableTagIds,
  latestCalibrationRun,
  versionRows,
  taxonomyCatalog,
}: {
  allBlueprints: BlueprintRow[];
  blueprint: BlueprintRow;
  evidenceSnippets: string[];
  folderOptions: QuestionBlueprintFolderTreeNode[];
  knownAssignableTagIds: ReadonlySet<string>;
  latestCalibrationRun?: BlueprintCalibrationRunRow;
  taxonomyCatalog: TaxonomyCatalogView;
  versionRows: BlueprintVersionRow[];
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
  const calibrationReady =
    blueprint.generation_readiness === "generation_ready" &&
    latestCalibrationRun?.readiness_result === "generation_ready" &&
    Number(latestCalibrationRun.blueprint_version) === Number(blueprint.version);
  const calibrationVersionMismatch =
    latestCalibrationRun?.readiness_result === "generation_ready" &&
    Number(latestCalibrationRun.blueprint_version) !== Number(blueprint.version);
  const generationBlockingReasons = [
    ...quality.generationBlockingReasons,
    ...(calibrationVersionMismatch
      ? ["Blueprint changed after the last successful calibration. Re-run calibration for the current version."]
      : []),
    ...(calibrationReady
      ? []
      : ["Run a successful calibration preview before generating Review Draft questions."]),
  ];

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
          Owner scope: {blueprint.owner_scope} | Version {blueprint.version} | Updated{" "}
          {new Date(blueprint.updated_at).toLocaleString()}
        </p>
        <BlueprintEditPanel
          allBlueprints={allBlueprints}
          blueprint={blueprint}
          taxonomyCatalog={taxonomyCatalog}
          versionRows={versionRows}
        />
        {approved ? (
          <div className="space-y-3 rounded-md border bg-muted/20 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-medium">Calibration status</p>
              <p className="text-xs text-muted-foreground">
                Temporary calibration samples - not saved as questions and not
                sent to Review.
              </p>
              {calibrationVersionMismatch ? (
                <p className="text-xs text-amber-700">
                  The latest passing calibration belongs to an older blueprint
                  version. Re-run calibration for the current version.
                </p>
              ) : null}
            </div>
              <Badge variant={calibrationReady ? "secondary" : "outline"}>
                {calibrationLabel(blueprint.generation_readiness)}
              </Badge>
            </div>
            <CalibrationRunSummary run={latestCalibrationRun} />
            <details className="rounded-md border bg-background px-3 py-2" open={!calibrationReady}>
              <summary className="cursor-pointer text-xs font-medium">
                Run calibration preview
              </summary>
              <form
                action={runBlueprintCalibrationPreview}
                className="mt-3 grid gap-3 sm:grid-cols-2"
              >
                <input name="blueprint_id" type="hidden" value={blueprint.id} />
                <label className="space-y-1 text-xs font-medium">
                  Sample count
                  <input
                    className="w-full rounded-md border bg-background px-2 py-1 text-sm"
                    defaultValue={2}
                    max={3}
                    min={1}
                    name="sample_count"
                    type="number"
                  />
                </label>
                <label className="space-y-1 text-xs font-medium">
                  Question type
                  <select
                    className="w-full rounded-md border bg-background px-2 py-1 text-sm"
                    defaultValue="frq"
                    name="calibration_question_type"
                  >
                    <option value="frq">FRQ</option>
                    <option value="mcq">MCQ</option>
                    <option value="fill_blank">Fill blank</option>
                    <option value="mixed">Mixed</option>
                  </select>
                </label>
                <label className="space-y-1 text-xs font-medium">
                  Model quality
                  <select
                    className="w-full rounded-md border bg-background px-2 py-1 text-sm"
                    defaultValue="fast"
                    name="model_quality_mode"
                  >
                    <option value="fast">Fast</option>
                    <option value="quality">Quality</option>
                  </select>
                </label>
                <input name="repair_enabled" type="hidden" value="false" />
                <label className="flex items-start gap-2 rounded-md border bg-muted/20 px-3 py-2 text-xs">
                  <input
                    className="mt-0.5"
                    defaultChecked
                    name="repair_enabled"
                    type="checkbox"
                    value="true"
                  />
                  <span>
                    <span className="block font-medium">
                      Repair failed samples automatically
                    </span>
                    <span className="text-muted-foreground">
                      One bounded DeepSeek repair attempt, then local validators
                      decide readiness.
                    </span>
                  </span>
                </label>
                <label className="space-y-1 text-xs font-medium">
                  Difficulty target
                  <input
                    className="w-full rounded-md border bg-background px-2 py-1 text-sm"
                    max={1000}
                    min={0}
                    name="calibration_difficulty_target"
                    placeholder="Optional, 0-1000"
                    type="number"
                  />
                </label>
                <label className="space-y-1 text-xs font-medium sm:col-span-2">
                  Variation note
                  <input
                    className="w-full rounded-md border bg-background px-2 py-1 text-sm"
                    maxLength={240}
                    name="calibration_variation_note"
                    placeholder="Optional: e.g. vary context while preserving the blueprint"
                    type="text"
                  />
                </label>
                <div className="sm:col-span-2">
                  <FormSubmitButton pendingLabel="Calibrating..." size="sm" variant="outline">
                    Run calibration preview
                  </FormSubmitButton>
                </div>
              </form>
            </details>
          </div>
        ) : null}
        {approved && !blueprint.deleted_at ? (
          <div className="rounded-md border bg-muted/20 p-3">
            <p className="text-sm font-medium">Move to folder</p>
            <p className="text-xs text-muted-foreground">
              Use folders to organize approved blueprint patterns. Unfiled keeps
              the blueprint in the library without a folder.
            </p>
            <form
              action={moveQuestionBlueprintToFolder}
              className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-end"
            >
              <input name="blueprint_id" type="hidden" value={blueprint.id} />
              <label className="min-w-0 flex-1 space-y-1 text-xs font-medium">
                Destination
                <FolderSelect
                  defaultValue={blueprint.folder_id ?? "unfiled"}
                  folderOptions={folderOptions}
                  includeUnfiled
                />
              </label>
              <FormSubmitButton pendingLabel="Moving..." size="sm" variant="outline">
                Move to folder
              </FormSubmitButton>
            </form>
          </div>
        ) : null}
        <LifecycleActions blueprint={blueprint} />
        {approved && quality.generationReady && calibrationReady ? (
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
                  Model quality
                  <select
                    className="w-full rounded-md border bg-background px-2 py-1 text-sm"
                    defaultValue="fast"
                    name="model_quality_mode"
                  >
                    <option value="fast">Fast</option>
                    <option value="quality">Quality</option>
                  </select>
                </label>
                <input name="repair_enabled" type="hidden" value="false" />
                <label className="flex items-start gap-2 rounded-md border bg-muted/20 px-3 py-2 text-xs">
                  <input
                    className="mt-0.5"
                    defaultChecked
                    name="repair_enabled"
                    type="checkbox"
                    value="true"
                  />
                  <span>
                    <span className="block font-medium">
                      Repair failed drafts automatically
                    </span>
                    <span className="text-muted-foreground">
                      Invalid repaired drafts stay blocked and are not sent to
                      Review Drafts.
                    </span>
                  </span>
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
              This blueprint must pass quality gates and calibration before
              DeepSeek generation.
            </p>
            <ReasonList reasons={generationBlockingReasons} />
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
    blueprintFoldersResult,
    calibrationRunsResult,
    blueprintVersionsResult,
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
        "id, title, status, owner_scope, folder_id, taxonomy_targets, question_pattern, required_elements, answer_spec_pattern, distractor_pattern, difficulty_profile, generation_constraints, originality_constraints, source_refs, deleted_at, updated_at, version, generation_readiness, last_calibrated_at, last_calibration_run_id",
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
    (supabase as any)
      .from("question_blueprint_folders")
      .select(
        "id, owner_scope, owner_id, parent_id, name, slug, description, sort_order, deleted_at",
      )
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
    (supabase as any)
      .from("question_blueprint_calibration_runs")
      .select(
        "id, blueprint_id, blueprint_version, sample_count, sample_previews, validation_summary, adherence_summary, originality_summary, diversity_summary, readiness_result, blocking_reasons, model_name, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(100),
    (supabase as any)
      .from("question_blueprint_versions")
      .select("id, blueprint_id, version, change_reason, created_at")
      .order("created_at", { ascending: false })
      .limit(200),
    loadTaxonomyCatalog(supabase),
  ]);
  const setupNeeded =
    isMissingBlueprintTableError(reviewActionsResult.error) ||
    isMissingBlueprintTableError(blueprintsResult.error) ||
    isMissingBlueprintTableError(blueprintExamplesResult.error) ||
    isMissingBlueprintTableError(blueprintFoldersResult.error) ||
    isMissingBlueprintTableError(calibrationRunsResult.error) ||
    isMissingBlueprintTableError(blueprintVersionsResult.error);
  const reviewActions = setupNeeded
    ? []
    : ((reviewActionsResult.data ?? []) as BlueprintReviewRow[]);
  const blueprints = setupNeeded
    ? []
    : ((blueprintsResult.data ?? []) as BlueprintRow[]);
  const folders = setupNeeded
    ? []
    : ((blueprintFoldersResult.data ?? []) as QuestionBlueprintFolderRow[]);
  const calibrationRuns = setupNeeded
    ? []
    : ((calibrationRunsResult.data ?? []) as BlueprintCalibrationRunRow[]);
  const blueprintVersions = setupNeeded
    ? []
    : ((blueprintVersionsResult.data ?? []) as BlueprintVersionRow[]);
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
  const latestCalibrationByBlueprintId = new Map<string, BlueprintCalibrationRunRow>();
  const versionsByBlueprintId = new Map<string, BlueprintVersionRow[]>();

  for (const example of (blueprintExamplesResult.data ?? []) as BlueprintExampleRow[]) {
    const current = evidenceByBlueprintId.get(example.blueprint_id) ?? [];
    evidenceByBlueprintId.set(example.blueprint_id, [
      ...current,
      ...stringList(example.evidence_snippets),
    ]);
  }
  for (const run of calibrationRuns) {
    if (!latestCalibrationByBlueprintId.has(run.blueprint_id)) {
      latestCalibrationByBlueprintId.set(run.blueprint_id, run);
    }
  }
  for (const version of blueprintVersions) {
    versionsByBlueprintId.set(version.blueprint_id, [
      ...(versionsByBlueprintId.get(version.blueprint_id) ?? []),
      version,
    ]);
  }
  const activeFolders = folders.filter((folder) => !folder.deleted_at);
  const archivedFolders = folders.filter((folder) => folder.deleted_at);
  const folderTree = buildQuestionBlueprintFolderTree(folders);
  const folderOptions = flattenQuestionBlueprintFolderTree(folderTree);
  const requestedFolder = firstString(params.folder, "all");
  const selectedFolder =
    requestedFolder !== "all" && requestedFolder !== "unfiled"
      ? activeFolders.find((folder) => folder.id === requestedFolder)
      : undefined;
  const selectedFolderId =
    requestedFolder === "unfiled" || selectedFolder ? requestedFolder : "all";
  const folderSummary = summarizeQuestionBlueprintFolders({
    blueprints,
    folders,
  });
  const activeBlueprints = blueprints.filter(
    (blueprint) => !blueprint.deleted_at && blueprint.status !== "deprecated",
  );
  const filteredActiveBlueprints =
    selectedFolderId === "unfiled"
      ? activeBlueprints.filter((blueprint) => !blueprint.folder_id)
      : selectedFolder
        ? activeBlueprints.filter(
            (blueprint) => blueprint.folder_id === selectedFolder.id,
          )
        : activeBlueprints;
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
              Question Blueprint Library tables or folder columns are not applied
              yet. Apply the latest blueprint migrations before using review
              actions.
            </p>
            <div className="space-y-1 font-mono text-xs">
              <p>supabase/migrations/0015_question_blueprint_library.sql</p>
              <p>supabase/migrations/0016_question_blueprint_folders.sql</p>
              <p>supabase/migrations/0018_question_blueprint_calibration.sql</p>
              <p>supabase/migrations/0019_question_blueprint_versions.sql</p>
            </div>
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
          <div className="space-y-4">
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
          <div className="space-y-4">
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
          <div className="space-y-4">
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

      {!setupNeeded ? (
        <BlueprintFolderPanel
          archivedFolders={archivedFolders}
          folderOptions={folderOptions}
          folderSummary={folderSummary}
          folderTree={folderTree}
          selectedFolder={selectedFolder}
          selectedFolderId={selectedFolderId}
        />
      ) : null}

      <section className="space-y-3">
        <div>
          <h2 className="text-xl font-semibold">Active library</h2>
          <p className="text-sm text-muted-foreground">
            Approved blueprints can manually create original draft questions for
            Review Drafts. They are never published automatically.
          </p>
          {selectedFolderId !== "all" ? (
            <p className="mt-1 text-sm text-muted-foreground">
              Folder filter:{" "}
              {selectedFolderId === "unfiled"
                ? "Unfiled"
                : selectedFolder?.name ?? "All blueprints"}
            </p>
          ) : null}
        </div>
        {filteredActiveBlueprints.length ? (
          <div className="grid gap-4 2xl:grid-cols-2">
            {filteredActiveBlueprints.map((blueprint) => (
              <LibraryCard
                allBlueprints={blueprints}
                blueprint={blueprint}
                evidenceSnippets={evidenceByBlueprintId.get(blueprint.id) ?? []}
                folderOptions={folderOptions}
                key={blueprint.id}
                knownAssignableTagIds={knownAssignableTagIds}
                latestCalibrationRun={latestCalibrationByBlueprintId.get(blueprint.id)}
                taxonomyCatalog={taxonomyCatalog}
                versionRows={versionsByBlueprintId.get(blueprint.id) ?? []}
              />
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="pt-6 text-sm text-muted-foreground">
              {selectedFolderId === "all"
                ? "No approved blueprints yet."
                : "No blueprints in this folder yet."}
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
          <div className="grid gap-4 2xl:grid-cols-2">
            {[...archivedBlueprints, ...trashedBlueprints].map((blueprint) => (
              <LibraryCard
                allBlueprints={blueprints}
                blueprint={blueprint}
                evidenceSnippets={evidenceByBlueprintId.get(blueprint.id) ?? []}
                folderOptions={folderOptions}
                key={blueprint.id}
                knownAssignableTagIds={knownAssignableTagIds}
                latestCalibrationRun={latestCalibrationByBlueprintId.get(blueprint.id)}
                taxonomyCatalog={taxonomyCatalog}
                versionRows={versionsByBlueprintId.get(blueprint.id) ?? []}
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
