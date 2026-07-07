import Link from "next/link";
import { notFound } from "next/navigation";

import { ArrowLeft } from "lucide-react";

import { TeacherWorkspaceShell } from "@/components/teacher/teacher-workspace-shell";
import { TeacherWorkspaceNav } from "@/components/teacher/teacher-workspace-nav";
import { Button } from "@/components/ui/button";
import { requireTeacher } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import {
  BlueprintLibrarySchemaMissingError,
  blueprintKindLabel,
  blueprintStatusLabel,
  blueprintVisibilityLabel,
  getTeacherBlueprintDetail,
  summarizeBlueprintTaxonomy,
} from "@/lib/teacher-blueprints";

import {
  BankLinkSummary,
  BlueprintBadge,
  BlueprintDetailMetric,
  BlueprintKindIcon,
  BlueprintSafetyStrip,
  BlueprintWorkflowPanel,
  DisabledBlueprintActions,
  SetupNeededState,
} from "../blueprint-library-ui";

export const dynamic = "force-dynamic";

function jsonCount(value: unknown) {
  return Array.isArray(value) ? value.length : 0;
}

function formatDate(value: string | null) {
  if (!value) return "Not yet";

  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

export default async function TeacherBlueprintDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ blueprintId: string }>;
  searchParams: Promise<{ created?: string }>;
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
          description="Blueprints are reusable planning/package assets. They organize question patterns before Review Drafts and bank approval."
        >
          <TeacherWorkspaceNav />
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
      description="Blueprints are reusable planning/package assets. They organize question patterns before Review Drafts and bank approval."
      eyebrow="Blueprint detail"
      title={blueprint.title}
    >
      <TeacherWorkspaceNav />
      <BlueprintSafetyStrip />

      {query.created ? (
        <div className="rounded-lg border border-cyan-200 bg-cyan-50 px-4 py-3 text-sm font-semibold text-cyan-900">
          Blueprint created as a review-gated teacher library asset.
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
            <BlueprintWorkflowPanel />

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
                label="Source bank"
                value={
                  blueprint.sourceBank ? (
                    <Link
                      className="text-sky-700 underline-offset-4 hover:underline"
                      href={`/teacher/banks/${blueprint.sourceBank.id}`}
                    >
                      {blueprint.sourceBank.name}
                    </Link>
                  ) : (
                    "No source bank"
                  )
                }
              />
              <BlueprintDetailMetric
                label="Created / updated"
                value={`${formatDate(blueprint.created_at)} / ${formatDate(blueprint.updated_at)}`}
              />
            </section>

            <section className="rounded-lg border border-slate-200 bg-white/80 p-5">
              <h3 className="text-lg font-bold text-slate-950">
                Source lineage and constraints
              </h3>
              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <BlueprintDetailMetric
                  label="Required elements"
                  value={`${jsonCount(blueprint.required_elements)} item${jsonCount(blueprint.required_elements) === 1 ? "" : "s"}`}
                />
                <BlueprintDetailMetric
                  label="Source refs"
                  value={`${jsonCount(blueprint.source_refs)} ref${jsonCount(blueprint.source_refs) === 1 ? "" : "s"}`}
                />
                <BlueprintDetailMetric
                  label="Generation readiness"
                  value={blueprint.generation_readiness.replace(/_/g, " ")}
                />
              </div>
              <details className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
                <summary className="cursor-pointer text-sm font-bold text-slate-700">
                  Source metadata
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
            </section>
          </div>

          <aside className="space-y-4">
            <section className="rounded-lg border border-slate-200 bg-white/80 p-5">
              <h3 className="text-lg font-bold text-slate-950">
                Coming-next actions
              </h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                These are visible product destinations, not enabled shortcuts.
                Review and bank gates stay in place.
              </p>
              <div className="mt-4">
                <DisabledBlueprintActions />
              </div>
            </section>

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
          </aside>
        </div>
      </section>
    </TeacherWorkspaceShell>
  );
}
