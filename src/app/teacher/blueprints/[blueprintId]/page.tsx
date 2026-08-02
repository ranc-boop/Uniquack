import Link from "next/link";
import { notFound } from "next/navigation";

import { AlertTriangle, ArrowLeft, CheckCircle2, PencilLine, Sparkles } from "lucide-react";

import { AIJobStatusPanel } from "@/components/ai-jobs/ai-job-status-panel";
import { FormSubmitButton } from "@/components/form-submit-button";
import { TeacherWorkspaceShell } from "@/components/teacher/teacher-workspace-shell";
import { Button } from "@/components/ui/button";
import { requireTeacher } from "@/lib/auth/guards";
import {
  AIProviderJobQueueSchemaMissingError,
  listAIProviderJobsForResource,
} from "@/lib/ai-jobs/queue";
import type { AIProviderJobSafeStatus } from "@/lib/ai-jobs/types";
import { listBankImportBatches } from "@/lib/question-banks";
import { createClient } from "@/lib/supabase/server";
import { TEACHER_BLUEPRINT_INPUT_LIMITS } from "@/lib/teacher-blueprint-builder";
import {
  buildTeacherBlueprintGenerationGate,
  listTeacherBlueprintGenerationProviderStatus,
} from "@/lib/teacher-blueprint-generation";
import {
  displayTextFromPattern,
  readinessChecklist,
  readinessWarnings,
  selectedSourceQuestionTitles,
  sourceExampleCount,
} from "@/lib/teacher-blueprint-builder";
import {
  BlueprintLibrarySchemaMissingError,
  blueprintKindLabel,
  blueprintStatusLabel,
  blueprintVisibilityLabel,
  getTeacherBlueprintDetail,
  summarizeBlueprintTaxonomy,
} from "@/lib/teacher-blueprints";

import {
  updateTeacherBlueprintPlan,
  generateTeacherBlueprintReviewDraftsAction,
} from "../actions";
import {
  cancelTeacherAIProviderJob,
  retryTeacherAIProviderJob,
} from "../../ai-jobs/actions";

import {
  BankLinkSummary,
  BlueprintBadge,
  BlueprintDetailMetric,
  BlueprintKindIcon,
  SetupNeededState,
} from "../blueprint-library-ui";

export const dynamic = "force-dynamic";

function jsonCount(value: unknown) {
  return Array.isArray(value) ? value.length : 0;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function textAreaList(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => (typeof item === "string" ? item : "")).filter(Boolean).join("\n")
    : "";
}

function nestedText(value: unknown, key: string, nestedKey = "teacherMix") {
  return stringValue(asRecord(asRecord(value)[key])[nestedKey]);
}

function formatDate(value: string | null) {
  if (!value) return "Not yet";

  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function blueprintGenerationSummary(value: unknown) {
  const summary = asRecord(value);
  const generation = asRecord(summary.blueprintGeneration);

  return generation;
}

function isBlueprintGenerationBatch(value: unknown, blueprintId: string) {
  return stringValue(blueprintGenerationSummary(value).blueprintId) === blueprintId;
}

export default async function TeacherBlueprintDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ blueprintId: string }>;
  searchParams: Promise<{
    created?: string;
    error?: string;
    generationBatch?: string;
    job?: string;
    saved?: string;
  }>;
}) {
  await requireTeacher();
  const { blueprintId } = await params;
  const query = await searchParams;
  const supabase = await createClient();
  let detail;

  try {
    detail = await getTeacherBlueprintDetail({ blueprintId, supabase });
  } catch (error) {
    if (error instanceof BlueprintLibrarySchemaMissingError) {
      return (
        <TeacherWorkspaceShell
          title="Blueprint Library"
          description="Blueprints are reusable planning/package assets. They organize question patterns before Review Drafts and Library approval."
        >
          <SetupNeededState />
        </TeacherWorkspaceShell>
      );
    }

    throw error;
  }

  if (!detail) {
    notFound();
  }

  const { bankLinks, blueprint } = detail;
  const checklist = readinessChecklist(blueprint);
  const warnings = readinessWarnings(blueprint);
  const generationConstraints = asRecord(blueprint.generation_constraints);
  const expectedQuestionCount = generationConstraints.expectedQuestionCount;
  const sourceTitles = selectedSourceQuestionTitles(blueprint);
  const providerStatus = await listTeacherBlueprintGenerationProviderStatus(supabase);
  const targetBankId = blueprint.source_bank_id ?? bankLinks[0]?.bank_id ?? null;
  const generationGate = buildTeacherBlueprintGenerationGate({
    blueprint,
    providerAvailable: providerStatus.available,
    targetBankId,
  });
  const generationHistory = targetBankId
    ? (await listBankImportBatches({ bankId: targetBankId, supabase }))
        .filter((batch) => isBlueprintGenerationBatch(batch.summary, blueprint.id))
        .slice(0, 4)
    : [];
  let queueJobs: AIProviderJobSafeStatus[] = [];
  let queueSetupNeeded = false;

  try {
    queueJobs = await listAIProviderJobsForResource({
      resourceId: blueprint.id,
      supabase,
    });
  } catch (error) {
    if (error instanceof AIProviderJobQueueSchemaMissingError) {
      queueSetupNeeded = true;
    } else {
      throw error;
    }
  }

  return (
    <TeacherWorkspaceShell
      actions={
        <Button asChild variant="outline">
          <Link href="/teacher/blueprints">
            <ArrowLeft aria-hidden="true" className="h-4 w-4" />
            Back to Blueprint Library
          </Link>
        </Button>
      }
      description="Blueprints are reusable planning/package assets. They organize question patterns before Review Drafts and Library approval."
      eyebrow="Blueprint detail"
      title={blueprint.title}
    >
      {query.created ? (
        <div className="rounded-lg border border-cyan-200 bg-cyan-50 px-4 py-3 text-sm font-semibold text-cyan-900">
          Blueprint created as a review-gated teacher library asset.
        </div>
      ) : null}
      {query.saved ? (
        <div className="rounded-lg border border-cyan-200 bg-cyan-50 px-4 py-3 text-sm font-semibold text-cyan-900">
          {query.saved === "1"
            ? "Blueprint planning fields saved. Generation still creates Review Drafts only."
            : query.saved}
        </div>
      ) : null}
      {query.error ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
          {query.error === "required-element-too-long"
            ? `Use at most ${TEACHER_BLUEPRINT_INPUT_LIMITS.REQUIRED_ELEMENT_ITEMS} required elements, with ${TEACHER_BLUEPRINT_INPUT_LIMITS.REQUIRED_ELEMENT_CHARS} characters per element.`
            : query.error}
        </div>
      ) : null}

      <section className="teacher-panel overflow-hidden">
        <div className="border-b border-slate-200 bg-white/70 p-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="min-w-0 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <BlueprintBadge>{blueprintVisibilityLabel(blueprint.visibility)}</BlueprintBadge>
                <BlueprintBadge>{blueprintStatusLabel(blueprint.status)}</BlueprintBadge>
                <BlueprintBadge>{blueprintKindLabel(blueprint.blueprint_kind)}</BlueprintBadge>
              </div>
              <div>
                <h2 className="text-2xl font-bold text-slate-950">
                  {blueprint.title}
                </h2>
                <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-600">
                  {blueprint.description ||
                    "Reusable planning structure for source-grounded question patterns."}
                </p>
              </div>
            </div>
            <BlueprintKindIcon />
          </div>
        </div>

        <div className="grid gap-5 p-5 xl:grid-cols-[1fr_0.42fr]">
          <div className="space-y-5">
            <section className="grid gap-3 md:grid-cols-2">
              <BlueprintDetailMetric
                label="Taxonomy summary"
                value={summarizeBlueprintTaxonomy(blueprint.taxonomy_targets)}
              />
              <BlueprintDetailMetric
                label="Folder"
                value={blueprint.folder?.name ?? "Unfiled"}
              />
              <BlueprintDetailMetric
                label="Source Library"
                value={
                  blueprint.sourceBank ? (
                    <Link
                      className="text-sky-700 underline-offset-4 hover:underline"
                      href={`/teacher/banks/${blueprint.sourceBank.id}`}
                    >
                      {blueprint.sourceBank.name}
                    </Link>
                  ) : (
                    "No source Library"
                  )
                }
              />
              <BlueprintDetailMetric
                label="Created / updated"
                value={`${formatDate(blueprint.created_at)} / ${formatDate(blueprint.updated_at)}`}
              />
            </section>

            <form action={updateTeacherBlueprintPlan} className="rounded-lg border border-slate-200 bg-white/80">
              <input name="blueprintId" type="hidden" value={blueprint.id} />
              <div className="border-b border-slate-200 bg-white/70 p-5">
                <div className="flex items-start gap-3">
                  <PencilLine aria-hidden="true" className="mt-1 h-5 w-5 text-sky-700" />
                  <div>
                    <h3 className="text-lg font-bold text-slate-950">
                      Structured Blueprint editor
                    </h3>
                  </div>
                </div>
              </div>
              <div className="grid gap-4 p-5">
                <label className="grid gap-1 text-sm font-semibold text-slate-700">
                  Title
                  <input
                    className="min-h-11 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-950"
                    defaultValue={blueprint.title}
                    maxLength={160}
                    name="title"
                    required
                  />
                </label>
                <label className="grid gap-1 text-sm font-semibold text-slate-700">
                  Purpose / description
                  <textarea
                    className="min-h-28 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950"
                    defaultValue={blueprint.description ?? ""}
                    maxLength={2000}
                    name="description"
                  />
                </label>
                <div className="grid gap-4 md:grid-cols-3">
                  <label className="grid gap-1 text-sm font-semibold text-slate-700">
                    Expected question count
                    <input
                      className="min-h-11 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-950"
                      defaultValue={
                        typeof expectedQuestionCount === "number" || typeof expectedQuestionCount === "string"
                          ? String(expectedQuestionCount)
                          : ""
                      }
                      min={1}
                      name="expectedQuestionCount"
                      type="number"
                    />
                  </label>
                  <label className="grid gap-1 text-sm font-semibold text-slate-700 md:col-span-2">
                    Question type mix
                    <input
                      className="min-h-11 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-950"
                      defaultValue={nestedText(blueprint.generation_constraints, "questionTypeMix")}
                      name="questionTypeMix"
                      placeholder="MCQ 60%, FRQ 40%"
                    />
                  </label>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="grid gap-1 text-sm font-semibold text-slate-700">
                    Difficulty mix
                    <textarea
                      className="min-h-24 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950"
                      defaultValue={displayTextFromPattern(blueprint.difficulty_profile, "teacherMix")}
                      name="difficultyMix"
                    />
                  </label>
                  <label className="grid gap-1 text-sm font-semibold text-slate-700">
                    Required concepts / elements
                    <textarea
                      className="min-h-24 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950"
                      defaultValue={textAreaList(blueprint.required_elements)}
                      maxLength={TEACHER_BLUEPRINT_INPUT_LIMITS.REQUIRED_ELEMENTS_INPUT_CHARS}
                      name="requiredElements"
                      placeholder="One required element per line"
                    />
                  </label>
                  <label className="grid gap-1 text-sm font-semibold text-slate-700">
                    Answer pattern
                    <textarea
                      className="min-h-24 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950"
                      defaultValue={displayTextFromPattern(blueprint.answer_spec_pattern, "guidance")}
                      name="answerPattern"
                    />
                  </label>
                  <label className="grid gap-1 text-sm font-semibold text-slate-700">
                    Distractor pattern
                    <textarea
                      className="min-h-24 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950"
                      defaultValue={displayTextFromPattern(blueprint.distractor_pattern, "guidance")}
                      name="distractorPattern"
                    />
                  </label>
                  <label className="grid gap-1 text-sm font-semibold text-slate-700">
                    Originality / variation constraints
                    <textarea
                      className="min-h-24 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950"
                      defaultValue={displayTextFromPattern(blueprint.originality_constraints, "guidance")}
                      name="originalityConstraints"
                    />
                  </label>
                  <label className="grid gap-1 text-sm font-semibold text-slate-700">
                    Teacher notes
                    <textarea
                      className="min-h-24 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950"
                      defaultValue={stringValue(asRecord(blueprint.metadata).teacherNotes)}
                      name="teacherNotes"
                    />
                  </label>
                </div>
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
                  Saving a meaningful edit sets generation readiness back to
                  uncalibrated. Later generation must still create Review
                  Drafts before Library approval.
                </div>
                <div>
                  <FormSubmitButton pendingLabel="Saving Blueprint plan...">
                    Save Blueprint plan
                  </FormSubmitButton>
                </div>
              </div>
            </form>
          </div>

          <aside className="space-y-4">
            <section className="rounded-lg border border-slate-200 bg-white/80 p-5">
              <h3 className="text-lg font-bold text-slate-950">Blueprint preview</h3>
              <div className="mt-4 grid gap-3">
                <BlueprintDetailMetric
                  label="Source examples"
                  value={`${sourceExampleCount(blueprint)} selected`}
                />
                <BlueprintDetailMetric
                  label="Question type mix"
                  value={nestedText(blueprint.generation_constraints, "questionTypeMix") || "Inferred from source examples"}
                />
                <BlueprintDetailMetric
                  label="Difficulty mix"
                  value={displayTextFromPattern(blueprint.difficulty_profile, "teacherMix") || "Inferred from source examples"}
                />
              </div>
              {sourceTitles.length ? (
                <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Source/example questions
                  </p>
                  <ul className="mt-2 space-y-1 text-sm text-slate-700">
                    {sourceTitles.map((title) => (
                      <li className="line-clamp-2" key={title}>
                        {title}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </section>

            <section className="rounded-lg border border-slate-200 bg-white/80 p-5">
              <h3 className="text-lg font-bold text-slate-950">
                Readiness checklist
              </h3>
              <div className="mt-3 space-y-2">
                {checklist.map((item) => (
                  <div
                    className="flex gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3"
                    key={item.label}
                  >
                    {item.passed ? (
                      <CheckCircle2 aria-hidden="true" className="mt-0.5 h-4 w-4 text-cyan-700" />
                    ) : (
                      <AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 text-amber-700" />
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-950">{item.label}</p>
                      <p className="mt-1 break-words text-xs leading-5 text-slate-600">{item.value}</p>
                    </div>
                  </div>
                ))}
              </div>
              {warnings.length ? (
                <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3">
                  <p className="text-sm font-bold text-amber-950">
                    Warnings for missing fields
                  </p>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-amber-900">
                    {warnings.map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </section>

            <section className="rounded-lg border border-slate-200 bg-white/80 p-5">
              <div className="flex items-start gap-3">
                <Sparkles aria-hidden="true" className="mt-1 h-5 w-5 text-sky-700" />
                <div>
                  <h3 className="text-lg font-bold text-slate-950">
                    Generate Review Drafts
                  </h3>
                  <p className="mt-1 text-sm leading-6 text-slate-600">
                    Generation creates private Review Drafts in the linked Bank.
                    Nothing is published or assigned until reviewed.
                  </p>
                </div>
              </div>

              <div className="mt-4 rounded-lg border border-sky-100 bg-sky-50 p-3 text-sm leading-6 text-sky-950">
                Shared provider status:{" "}
                <span className="font-bold">
                  {providerStatus.available ? "enabled" : "not enabled"}
                </span>
                . Target drafts:{" "}
                <span className="font-bold">
                  {generationGate.expectedDraftCount}
                </span>
                .
              </div>

              {generationGate.blockingReasons.length ? (
                <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3">
                  <p className="text-sm font-bold text-amber-950">
                    Generation is blocked
                  </p>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-amber-900">
                    {generationGate.blockingReasons.map((reason) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <form action={generateTeacherBlueprintReviewDraftsAction} className="mt-4">
                <input name="blueprintId" type="hidden" value={blueprint.id} />
                {generationGate.ready ? (
                  <FormSubmitButton pendingLabel="Queueing Review Draft generation...">
                    <Sparkles aria-hidden="true" className="h-4 w-4" />
                    Queue private Review Drafts
                  </FormSubmitButton>
                ) : (
                  <Button disabled type="button" variant="outline">
                    Generate Review Drafts unavailable
                  </Button>
                )}
              </form>

              <p className="mt-3 text-xs leading-5 text-slate-500">
                Provider choice, model, and credentials stay admin-only and are
                resolved on the server.
              </p>
              {queueSetupNeeded ? (
                <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-900">
                  Durable AI queue setup is needed before new Blueprint generation runs can start.
                </p>
              ) : null}
              <div className="mt-4">
                <AIJobStatusPanel
                  cancelAction={cancelTeacherAIProviderJob}
                  jobs={queueJobs}
                  retryAction={retryTeacherAIProviderJob}
                  returnTo={`/teacher/blueprints/${blueprint.id}`}
                  reviewHref={targetBankId ? `/teacher/banks/${targetBankId}/review` : undefined}
                  title="Blueprint generation status"
                />
              </div>
            </section>

            {generationHistory.length ? (
              <section className="rounded-lg border border-slate-200 bg-white/80 p-5">
                <h3 className="text-lg font-bold text-slate-950">
                  Recent generation history
                </h3>
                <div className="mt-3 space-y-2">
                  {generationHistory.map((batch) => {
                    const generation = blueprintGenerationSummary(batch.summary);
                    const createdDraftCount =
                      Number(generation.createdDraftCount ?? generation.createdCount ?? 0) || 0;
                    const warningCount =
                      Number(generation.warningCount ?? 0) || 0;

                    return (
                      <div
                        className="rounded-lg border border-slate-200 bg-slate-50 p-3"
                        key={batch.id}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <BlueprintBadge>
                            {batch.status}
                          </BlueprintBadge>
                          <span className="text-xs font-semibold text-slate-500">
                            {formatDate(batch.created_at)}
                          </span>
                        </div>
                        <p className="mt-2 text-sm font-semibold text-slate-900">
                          {createdDraftCount} draft
                          {createdDraftCount === 1 ? "" : "s"} / {warningCount} warning
                          {warningCount === 1 ? "" : "s"}
                        </p>
                        <Link
                          className="mt-2 inline-flex text-sm font-semibold text-sky-700 underline-offset-4 hover:underline"
                          href={`/teacher/banks/${targetBankId}/review?generationBatch=${batch.id}`}
                        >
                          Open Review Drafts
                        </Link>
                      </div>
                    );
                  })}
                </div>
              </section>
            ) : null}

            <section className="rounded-lg border border-slate-200 bg-white/80 p-5">
              <h3 className="text-lg font-bold text-slate-950">
                Linked banks
              </h3>
              <div className="mt-3 space-y-2">
                {bankLinks.length ? (
                  bankLinks.map((link) =>
                    link.bank ? (
                      <BankLinkSummary
                        bankName={link.bank.name}
                        key={link.id}
                        relationKind={link.relation_kind}
                      />
                    ) : null,
                  )
                ) : (
                  <p className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                    No bank links yet.
                  </p>
                )}
              </div>
            </section>

            <details className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <summary className="cursor-pointer text-sm font-bold text-slate-700">
                Source lineage and constraints
              </summary>
              <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap break-words text-xs leading-5 text-slate-600">
                {JSON.stringify(
                  {
                    metadata: blueprint.metadata,
                    sourceKind: blueprint.source_kind,
                    sourceRecordId: blueprint.source_record_id,
                    sourceRefs: blueprint.source_refs,
                  },
                  null,
                  2,
                )}
              </pre>
            </details>
          </aside>
        </div>
      </section>
    </TeacherWorkspaceShell>
  );
}
