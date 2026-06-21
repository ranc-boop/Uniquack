import {
  persistApprovedFiveFacetTagAssignments,
  seedOfficialFiveFacetCatalog,
} from "@/app/admin/tags/actions";
import { FormSubmitButton } from "@/components/form-submit-button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type {
  ApprovedTagAssignmentWritePlan,
  FiveFacetAdminPersistenceSummary,
  FiveFacetCatalogSyncPlan,
} from "@/lib/tags/five-facet-tag-admin-persistence";

type FiveFacetTagAdminPanelProps = {
  assignmentPlan: ApprovedTagAssignmentWritePlan;
  catalogPlan: FiveFacetCatalogSyncPlan;
  setupError?: string;
  summary: FiveFacetAdminPersistenceSummary;
};

function CountItem({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function PlanStatus({
  errors,
  valid,
  warnings,
}: {
  errors: string[];
  valid: boolean;
  warnings: string[];
}) {
  return (
    <div className="space-y-2 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={valid ? "secondary" : "destructive"}>
          {valid ? "Valid preview" : "Needs setup or review"}
        </Badge>
        {warnings.length ? (
          <Badge variant="outline">{warnings.length} warnings</Badge>
        ) : null}
        {errors.length ? (
          <Badge variant="destructive">{errors.length} errors</Badge>
        ) : null}
      </div>
      {errors.length ? (
        <p className="text-xs text-destructive">{errors.slice(0, 2).join("; ")}</p>
      ) : null}
      {warnings.length ? (
        <p className="text-xs text-muted-foreground">
          {warnings.slice(0, 2).join("; ")}
        </p>
      ) : null}
    </div>
  );
}

export function FiveFacetTagAdminPanel({
  assignmentPlan,
  catalogPlan,
  setupError,
  summary,
}: FiveFacetTagAdminPanelProps) {
  const canExecute = !setupError;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Five-facet official tag system</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">
            Preview and execute admin-only catalog syncs and approved assignment
            writes. AI import suggestions are never written automatically.
          </p>
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">Admin-only</Badge>
            <Badge variant="outline">Server-only</Badge>
            <Badge variant="outline">No provider calls</Badge>
            <Badge variant="outline">No Review Draft mutation</Badge>
          </div>
        </div>

        {setupError ? (
          <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {setupError}
          </p>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <CountItem label="Catalog nodes" value={summary.nodeCount} />
          <CountItem label="Edges" value={summary.edgeCount} />
          <CountItem label="Aliases" value={summary.aliasCount} />
          <CountItem
            label="Curriculum maps"
            value={summary.curriculumConceptMappingCount}
          />
          <CountItem
            label="Approved assignments"
            value={summary.assignmentRowCount}
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <section className="space-y-3 rounded-md border p-4">
            <div className="space-y-1">
              <h2 className="text-sm font-semibold">Catalog seed preview</h2>
              <p className="text-xs text-muted-foreground">
                Uses upsert-style keys for tag nodes, edges, aliases, and
                curriculum concept mappings.
              </p>
            </div>
            <PlanStatus
              errors={catalogPlan.validation.errors}
              valid={catalogPlan.validation.valid}
              warnings={catalogPlan.validation.warnings}
            />
            {canExecute ? (
              <form action={seedOfficialFiveFacetCatalog}>
                <FormSubmitButton pendingLabel="Syncing catalog...">
                  Seed official catalog
                </FormSubmitButton>
              </form>
            ) : (
              <p className="text-xs text-muted-foreground">
                Catalog seed is disabled until the five-facet persistence tables
                are available.
              </p>
            )}
          </section>

          <section className="space-y-3 rounded-md border p-4">
            <div className="space-y-1">
              <h2 className="text-sm font-semibold">
                Approved assignment write preview
              </h2>
              <p className="text-xs text-muted-foreground">
                Only approved review actions can produce official assignment
                rows.
              </p>
            </div>
            <PlanStatus
              errors={assignmentPlan.errors}
              valid={assignmentPlan.valid}
              warnings={assignmentPlan.warnings}
            />
            {assignmentPlan.assignmentRows.length ? (
              <p className="text-xs text-muted-foreground">
                Ready to persist {assignmentPlan.assignmentRows.length} approved
                assignment rows.
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                No approved five-facet review actions are ready to persist.
              </p>
            )}
            {canExecute ? (
              <form action={persistApprovedFiveFacetTagAssignments}>
                <FormSubmitButton
                  pendingLabel="Persisting assignments..."
                  variant="secondary"
                >
                  Persist approved assignments
                </FormSubmitButton>
              </form>
            ) : (
              <p className="text-xs text-muted-foreground">
                Assignment writes are disabled until setup is complete.
              </p>
            )}
          </section>
        </div>
      </CardContent>
    </Card>
  );
}
