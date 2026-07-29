import Link from "next/link";

import { AdminActionGroup } from "@/components/admin/admin-action-group";
import { AdminCard } from "@/components/admin/admin-card";
import { AdminDebugDisclosure } from "@/components/admin/admin-debug-disclosure";
import { AdminEmptyState } from "@/components/admin/admin-empty-state";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminStatusBadge } from "@/components/admin/admin-status-badge";
import { BatchImportJsonPanelLoader } from "@/components/batch-import-json-panel-loader";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireAdmin } from "@/lib/auth/guards";
import { globalQuestionWorkspaceCapabilities } from "@/lib/questions/workspace";
import { createClient } from "@/lib/supabase/server";
import { loadTaxonomyCatalog } from "@/lib/tags/taxonomy-db";

import {
  importManualJsonDrafts,
  previewManualJsonImport,
} from "./actions";

export const dynamic = "force-dynamic";

type AdminImportsPageProps = {
  searchParams: Promise<{ view?: string }>;
};

export default async function AdminImportsPage({
  searchParams,
}: AdminImportsPageProps) {
  const [params, , supabase] = await Promise.all([
    searchParams,
    requireAdmin(),
    createClient(),
  ]);
  const showImport = params.view === "new";
  const batchesPromise = showImport
    ? Promise.resolve({ data: [], error: null })
    : supabase
        .from("import_batches")
        .select("id, source_type, status, summary, created_at")
        .order("created_at", { ascending: false })
        .limit(10);
  const taxonomyPromise = showImport
    ? loadTaxonomyCatalog(supabase)
    : Promise.resolve({
        catalog: { facets: [], nodes: [] },
        errorMessage: null,
      });
  const [
    { data: batches, error },
    { catalog: taxonomyCatalog },
  ] = await Promise.all([
    batchesPromise,
    taxonomyPromise,
  ]);
  const parentTagIds = new Set(
    taxonomyCatalog.nodes.flatMap((node) => node.parent_tag_ids ?? []),
  );
  const importPromptTagIds = taxonomyCatalog.nodes
    .filter(
      (node) =>
        node.is_assignable &&
        !parentTagIds.has(node.tag_id),
    )
    .map((node) => node.tag_id)
    .sort();

  return (
    <div className="space-y-6">
      <AdminPageHeader
        actions={
          <>
            {showImport ? (
              <Button asChild variant="outline">
                <Link href="/admin/imports">Back to import tools</Link>
              </Button>
            ) : (
              <Button asChild>
                <Link href="/admin/imports?view=new">New JSON import</Link>
              </Button>
            )}
            {!showImport ? (
              <>
                <Button asChild variant="outline">
                  <Link href="/admin/imports/pdf">AI PDF import</Link>
                </Button>
                <Button asChild variant="outline">
                  <Link href="/admin/imports/assets">Bulk asset upload</Link>
                </Button>
              </>
            ) : null}
          </>
        }
        eyebrow="Import tools"
        help={
          <p>
            Every import path creates private draft review work first. Nothing
            is published automatically.
          </p>
        }
        helpLabel="Import workflow details"
        title="Import Tools"
      />

      {!showImport ? <div className="grid gap-3 md:grid-cols-4">
        <AdminCard
          actions={
            <AdminActionGroup
              secondary={
                <Button asChild size="sm" variant="outline">
                  <Link href="/admin/imports?view=new">Open JSON Import</Link>
                </Button>
              }
            />
          }
          compact
          badge={<AdminStatusBadge status="draft">Draft-only</AdminStatusBadge>}
          help="Use this for validated structured question data pasted from a trusted tool."
          helpLabel="Manual JSON Import details"
          title="Manual JSON Import"
        />
        <AdminCard
          actions={
            <AdminActionGroup
              secondary={
                <Button asChild size="sm" variant="outline">
                  <Link href="/admin/imports/assets">Open Bulk Asset Upload</Link>
                </Button>
              }
            />
          }
          compact
          badge={<AdminStatusBadge status="pending">Review matches</AdminStatusBadge>}
          help="Use this after drafts exist and files can be matched by question-code filename prefix."
          helpLabel="Bulk Asset Matching details"
          title="Bulk Asset Matching"
        />
        <AdminCard
          actions={
            <AdminActionGroup
              secondary={
                <Button asChild size="sm" variant="outline">
                  <Link href="/admin/imports/package">Open Package Import</Link>
                </Button>
              }
            />
          }
          compact
          badge={<AdminStatusBadge status="pending_review">Preview first</AdminStatusBadge>}
          help="Use this for one ZIP containing questions.json plus referenced image and PDF files."
          helpLabel="Package Import details"
          title="Package Import"
        />
        <AdminCard
          actions={
            <AdminActionGroup
              secondary={
                <Button asChild size="sm" variant="outline">
                  <Link href="/admin/imports/pdf">Open AI PDF Import</Link>
                </Button>
              }
            />
          }
          compact
          badge={<AdminStatusBadge status="info">AI Parsing</AdminStatusBadge>}
          help="Use this for private PDFs or images that need AI extraction or blueprint observation."
          helpLabel="AI PDF and image parsing details"
          title="AI PDF / Image Parsing"
        />
      </div> : null}

      {showImport ? (
        <AdminCard
          title="Manual JSON import"
          help="Only valid items are imported, and they are saved as private draft questions for Review Drafts."
          helpLabel="Manual JSON draft behavior"
        >
          <BatchImportJsonPanelLoader
            capabilities={globalQuestionWorkspaceCapabilities}
            importAction={importManualJsonDrafts}
            previewAction={previewManualJsonImport}
            questionsHref="/admin/questions"
            resultDescription="All imported questions are saved as global Drafts and must pass Global Review before publication."
            reviewHref="/admin/review"
            scope={{ kind: "global" }}
            scopeLabel="the Central Public Library review queue"
            tagIds={importPromptTagIds}
          />
        </AdminCard>
      ) : null}

      {!showImport ? <AdminCard title="Recent import batches">
        {error ? (
          <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error.message}
          </p>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Created</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Summary</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(batches ?? []).map((batch) => (
                  <TableRow key={batch.id}>
                    <TableCell className="text-sm">
                      {new Date(batch.created_at).toLocaleString()}
                    </TableCell>
                    <TableCell>{batch.source_type}</TableCell>
                    <TableCell>
                      <AdminStatusBadge status={batch.status} />
                    </TableCell>
                    <TableCell className="min-w-64">
                      <AdminDebugDisclosure title="Batch summary">
                        <pre className="whitespace-pre-wrap break-words">
                          {JSON.stringify(batch.summary, null, 2)}
                        </pre>
                      </AdminDebugDisclosure>
                    </TableCell>
                  </TableRow>
                ))}
                {!batches?.length ? (
                  <TableRow>
                    <TableCell colSpan={4} className="h-24 text-center">
                      <AdminEmptyState
                        className="border-0 bg-transparent p-4"
                        description="Run a JSON, package, asset, or AI PDF import to create draft review work."
                        title="No import batches yet."
                      />
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
        )}
      </AdminCard> : null}
    </div>
  );
}
