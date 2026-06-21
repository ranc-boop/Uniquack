import {
  approveTaxonomyReviewAction,
  createTaxonomyNode,
  deleteTaxonomyNode,
  rejectTaxonomyReviewAction,
} from "@/app/admin/tags/actions";
import { FormSubmitButton } from "@/components/form-submit-button";
import { PageFeedback } from "@/components/page-feedback";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requireAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";

type AdminTagsPageProps = {
  searchParams: Promise<{
    error?: string;
    q?: string;
    saved?: string;
  }>;
};

type TaxonomyNode = {
  description: string | null;
  facet_key: string | null;
  is_assignable: boolean;
  label: string;
  node_kind: string;
  sort_order: number;
  status: string;
  tag_id: string;
};

type TaxonomyEdge = {
  edge_kind: string;
  from_tag_id: string;
  status: string;
  to_tag_id: string;
};

type TaxonomyFacet = {
  facet_key: string;
  label: string;
  root_tag_id: string;
  sort_order: number;
};

type ReviewAction = {
  action_id: string;
  id: string;
  proposed_tag_ids: string[];
  question_id: string | null;
  reason: string;
  review_status: string;
};

function isMissingTaxonomyTableError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const record = error as { code?: unknown; message?: unknown };
  const message = typeof record.message === "string" ? record.message : "";

  return (
    record.code === "42P01" ||
    /taxonomy_|relation .* does not exist|schema cache/i.test(message)
  );
}

function pathForNode(
  node: TaxonomyNode,
  nodesById: Map<string, TaxonomyNode>,
  parentByChild: Map<string, string>,
) {
  const path: TaxonomyNode[] = [];
  const seen = new Set<string>();
  let current: TaxonomyNode | undefined = node;

  while (current && !seen.has(current.tag_id)) {
    seen.add(current.tag_id);
    path.unshift(current);
    const parentId = parentByChild.get(current.tag_id);
    current = parentId ? nodesById.get(parentId) : undefined;
  }

  return path;
}

function TreeRow({
  childrenByParent,
  level = 0,
  node,
  query,
}: {
  childrenByParent: Map<string, TaxonomyNode[]>;
  level?: number;
  node: TaxonomyNode;
  query: string;
}) {
  const children = childrenByParent.get(node.tag_id) ?? [];
  const haystack = `${node.tag_id} ${node.label} ${node.description ?? ""}`.toLowerCase();
  const selfMatches = !query || haystack.includes(query);
  const renderedChildren = children.map((child) => (
    <TreeRow
      childrenByParent={childrenByParent}
      key={child.tag_id}
      level={level + 1}
      node={child}
      query={query}
    />
  ));

  if (!selfMatches && !renderedChildren.some(Boolean)) {
    return null;
  }

  return (
    <div className="space-y-1">
      {selfMatches ? (
        <div
          className="grid gap-2 rounded-md border bg-background px-3 py-2 text-sm md:grid-cols-[1fr_auto]"
          style={{ marginLeft: `${Math.min(level, 6) * 14}px` }}
        >
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{node.label}</span>
              <Badge variant="outline">{node.facet_key ?? node.node_kind}</Badge>
              {node.is_assignable ? (
                <Badge variant="secondary">assignable</Badge>
              ) : null}
            </div>
            <p className="break-all font-mono text-[11px] text-muted-foreground">
              {node.tag_id}
            </p>
            {node.description ? (
              <p className="mt-1 text-xs text-muted-foreground">
                {node.description}
              </p>
            ) : null}
          </div>
          {node.node_kind === "tag" ? (
            <form action={deleteTaxonomyNode}>
              <input name="tag_id" type="hidden" value={node.tag_id} />
              <FormSubmitButton
                pendingLabel="Deleting..."
                size="sm"
                variant="destructive"
              >
                Delete
              </FormSubmitButton>
            </form>
          ) : null}
        </div>
      ) : null}
      {renderedChildren.length ? <div className="space-y-1">{renderedChildren}</div> : null}
    </div>
  );
}

export default async function AdminTagsPage({ searchParams }: AdminTagsPageProps) {
  const params = await searchParams;
  await requireAdmin();
  const query = (params.q ?? "").trim().toLowerCase();
  const supabase = await createClient();
  const [
    { data: facets, error: facetsError },
    { data: nodes, error: nodesError },
    { data: edges, error: edgesError },
    { data: reviewActions, error: reviewActionsError },
  ] = await Promise.all([
    supabase
      .from("taxonomy_facets")
      .select("facet_key, label, root_tag_id, sort_order")
      .eq("status", "active")
      .order("sort_order", { ascending: true }),
    supabase
      .from("taxonomy_nodes")
      .select(
        "tag_id, label, description, node_kind, facet_key, is_assignable, status, sort_order",
      )
      .eq("status", "active")
      .order("sort_order", { ascending: true })
      .limit(2000),
    supabase
      .from("taxonomy_edges")
      .select("from_tag_id, to_tag_id, edge_kind, status")
      .eq("edge_kind", "parent_child")
      .eq("status", "active")
      .limit(4000),
    supabase
      .from("taxonomy_review_actions")
      .select("id, action_id, question_id, proposed_tag_ids, reason, review_status")
      .in("review_status", ["pending_review", "needs_review"])
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  const setupError = [facetsError, nodesError, edgesError, reviewActionsError].find(Boolean);
  const nodesById = new Map(
    ((nodes ?? []) as TaxonomyNode[]).map((node) => [node.tag_id, node]),
  );
  const parentByChild = new Map<string, string>();
  const childrenByParent = new Map<string, TaxonomyNode[]>();

  for (const edge of (edges ?? []) as TaxonomyEdge[]) {
    parentByChild.set(edge.to_tag_id, edge.from_tag_id);
    const child = nodesById.get(edge.to_tag_id);
    if (!child) continue;
    childrenByParent.set(edge.from_tag_id, [
      ...(childrenByParent.get(edge.from_tag_id) ?? []),
      child,
    ]);
  }

  for (const children of childrenByParent.values()) {
    children.sort((a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label));
  }

  const subjectRoot = nodesById.get("subject.math");
  const assignableNodes = ((nodes ?? []) as TaxonomyNode[]).filter(
    (node) => node.is_assignable,
  );
  const facetRows = (facets ?? []) as TaxonomyFacet[];
  const pendingActions = (reviewActions ?? []) as ReviewAction[];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Taxonomy</h1>
        <p className="text-sm text-muted-foreground">
          Database-backed mathematics taxonomy rooted at subject.math.
        </p>
      </div>
      <PageFeedback error={params.error} saved={params.saved} />
      {setupError ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {isMissingTaxonomyTableError(setupError)
            ? "Taxonomy tables are not available yet. Apply migration 0011_math_taxonomy_source_of_truth.sql, then reload this page."
            : setupError.message}
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Create taxonomy node</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={createTaxonomyNode} className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="tag_id">Tag ID</Label>
              <Input id="tag_id" name="tag_id" placeholder="concept.calculus.derivatives.chain_rule" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="label">Label</Label>
              <Input id="label" name="label" placeholder="Chain rule" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="facet_key">Facet</Label>
              <select
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                id="facet_key"
                name="facet_key"
              >
                {facetRows.map((facet) => (
                  <option key={facet.facet_key} value={facet.facet_key}>
                    {facet.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="parent_tag_id">Parent tag ID</Label>
              <Input
                id="parent_tag_id"
                name="parent_tag_id"
                placeholder="concept.calculus.derivatives"
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="description">Description</Label>
              <Input id="description" name="description" placeholder="Optional short description" />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input defaultChecked name="is_assignable" type="checkbox" />
              Assignable to questions
            </label>
            <div className="md:col-span-2">
              <FormSubmitButton pendingLabel="Creating...">
                Create node
              </FormSubmitButton>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Browse and search</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <form className="flex flex-wrap items-end gap-2">
            <div className="min-w-72 flex-1 space-y-2">
              <Label htmlFor="q">Search taxonomy</Label>
              <Input
                id="q"
                name="q"
                defaultValue={params.q ?? ""}
                placeholder="derivative, AP Calculus, graph..."
              />
            </div>
            <Button type="submit">Search</Button>
            <Button asChild type="button" variant="outline">
              <a href="/admin/tags">Reset</a>
            </Button>
          </form>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-md border px-3 py-2">
              <p className="text-xs text-muted-foreground">Facets</p>
              <p className="text-lg font-semibold">{facetRows.length}</p>
            </div>
            <div className="rounded-md border px-3 py-2">
              <p className="text-xs text-muted-foreground">Active nodes</p>
              <p className="text-lg font-semibold">{nodesById.size}</p>
            </div>
            <div className="rounded-md border px-3 py-2">
              <p className="text-xs text-muted-foreground">Assignable nodes</p>
              <p className="text-lg font-semibold">{assignableNodes.length}</p>
            </div>
          </div>
          {subjectRoot ? (
            <TreeRow
              childrenByParent={childrenByParent}
              node={subjectRoot}
              query={query}
            />
          ) : (
            <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
              subject.math is not available.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pending taxonomy approvals</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {pendingActions.map((action) => (
            <div className="rounded-md border p-3" key={action.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <p className="font-mono text-xs text-muted-foreground">
                    {action.action_id}
                  </p>
                  <p className="text-sm">{action.reason || "No reason provided."}</p>
                  <div className="flex flex-wrap gap-1">
                    {action.proposed_tag_ids.map((tagId) => {
                      const node = nodesById.get(tagId);
                      const path = node
                        ? pathForNode(node, nodesById, parentByChild)
                            .map((item) => item.label)
                            .join(" > ")
                        : tagId;
                      return (
                        <Badge key={tagId} variant="outline" title={tagId}>
                          {path}
                        </Badge>
                      );
                    })}
                  </div>
                </div>
                <div className="flex gap-2">
                  <form action={approveTaxonomyReviewAction}>
                    <input name="id" type="hidden" value={action.id} />
                    <FormSubmitButton pendingLabel="Approving..." size="sm">
                      Approve
                    </FormSubmitButton>
                  </form>
                  <form action={rejectTaxonomyReviewAction}>
                    <input name="id" type="hidden" value={action.id} />
                    <FormSubmitButton
                      pendingLabel="Rejecting..."
                      size="sm"
                      variant="outline"
                    >
                      Reject
                    </FormSubmitButton>
                  </form>
                </div>
              </div>
            </div>
          ))}
          {!pendingActions.length ? (
            <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
              No pending taxonomy suggestions.
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
