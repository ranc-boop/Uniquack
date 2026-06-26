import {
  approveTaxonomyReviewAction,
  createTaxonomyNode,
  deleteTaxonomyNode,
  rejectTaxonomyReviewAction,
} from "@/app/admin/tags/actions";
import { FormSubmitButton } from "@/components/form-submit-button";
import { TaxonomyNodeCreateFields } from "@/components/tags/taxonomy-node-create-fields";
import { PageFeedback } from "@/components/page-feedback";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requireAdmin } from "@/lib/auth/guards";
import { taxonomyDisplayLabelFromId } from "@/lib/tags/taxonomy-display";
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

function nodeMatchesQuery(node: TaxonomyNode, query: string) {
  if (!query) return true;
  const haystack = `${node.tag_id} ${taxonomyDisplayLabelFromId(node.tag_id)} ${node.description ?? ""}`.toLowerCase();
  return haystack.includes(query);
}

function hasMatchingDescendant({
  childrenByParent,
  node,
  query,
}: {
  childrenByParent: Map<string, TaxonomyNode[]>;
  node: TaxonomyNode;
  query: string;
}): boolean {
  return (childrenByParent.get(node.tag_id) ?? []).some(
    (child) =>
      nodeMatchesQuery(child, query) ||
      hasMatchingDescendant({ childrenByParent, node: child, query }),
  );
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
  const displayLabel = taxonomyDisplayLabelFromId(node.tag_id);
  const selfMatches = nodeMatchesQuery(node, query);
  const descendantMatches = hasMatchingDescendant({
    childrenByParent,
    node,
    query,
  });
  const visibleChildren = children.filter(
    (child) =>
      !query ||
      nodeMatchesQuery(child, query) ||
      hasMatchingDescendant({ childrenByParent, node: child, query }),
  );

  if (query && !selfMatches && !descendantMatches) {
    return null;
  }

  const shouldOpen = Boolean(query) || level === 0;

  return (
    <details className="group" open={shouldOpen}>
      <summary
        className="grid cursor-pointer list-none gap-2 rounded-md border bg-background px-3 py-2 text-sm transition hover:bg-muted/40 md:grid-cols-[1fr_auto]"
        style={{ marginLeft: `${level * 18}px` }}
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground group-open:hidden">▸</span>
            <span className="hidden text-xs text-muted-foreground group-open:inline">▾</span>
            <span className="font-medium">{displayLabel}</span>
            <Badge variant="outline">{node.facet_key ?? node.node_kind}</Badge>
            {node.is_assignable ? <Badge variant="secondary">assignable</Badge> : null}
            {children.length ? (
              <span className="text-[11px] text-muted-foreground">
                {children.length} children
              </span>
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
            <FormSubmitButton pendingLabel="Deleting..." size="sm" variant="destructive">
              Delete subtree
            </FormSubmitButton>
          </form>
        ) : null}
      </summary>
      {visibleChildren.length ? (
        <div className="ml-[18px] mt-1 space-y-1 border-l pl-2">
          {visibleChildren.map((child) => (
            <TreeRow
              childrenByParent={childrenByParent}
              key={child.tag_id}
              level={level + 1}
              node={child}
              query={query}
            />
          ))}
        </div>
      ) : null}
    </details>
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
      // perf-budget-allow-large-query: admin taxonomy management intentionally loads the bounded active taxonomy tree.
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
    children.sort((a, b) => a.sort_order - b.sort_order || taxonomyDisplayLabelFromId(a.tag_id).localeCompare(taxonomyDisplayLabelFromId(b.tag_id)));
  }

  const subjectRoot = nodesById.get("math");
  const assignableNodes = ((nodes ?? []) as TaxonomyNode[]).filter(
    (node) => node.is_assignable,
  );
  const facetRows = (facets ?? []) as TaxonomyFacet[];
  const pendingActions = (reviewActions ?? []) as ReviewAction[];
  const detachedNodes = ((nodes ?? []) as TaxonomyNode[])
    .filter((node) => node.node_kind === "tag" && !parentByChild.has(node.tag_id))
    .filter((node) => !query || nodeMatchesQuery(node, query))
    .sort((left, right) => left.tag_id.localeCompare(right.tag_id));
  const parentOptions = ((nodes ?? []) as TaxonomyNode[])
    .filter((node) => node.status === "active")
    .sort((left, right) => {
      const leftPath = pathForNode(left, nodesById, parentByChild)
        .map((item) => item.tag_id)
        .join(".");
      const rightPath = pathForNode(right, nodesById, parentByChild)
        .map((item) => item.tag_id)
        .join(".");
      return leftPath.localeCompare(rightPath);
    });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Taxonomy</h1>
        <p className="text-sm text-muted-foreground">
          Database-backed mathematics taxonomy rooted at math.
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
          <form action={createTaxonomyNode} className="space-y-4">
            <p className="text-xs text-muted-foreground">
              Select a parent node, then enter a display tag. The suffix preview and final ID are generated automatically.
            </p>
            <TaxonomyNodeCreateFields
              facets={facetRows}
              nodes={parentOptions.map((node) => ({
                facet_key: node.facet_key,
                is_assignable: node.is_assignable,
                label: taxonomyDisplayLabelFromId(node.tag_id),
                node_kind: node.node_kind,
                parent_tag_ids: parentByChild.has(node.tag_id)
                  ? [parentByChild.get(node.tag_id)!]
                  : [],
                tag_id: node.tag_id,
              }))}
            />
            <FormSubmitButton pendingLabel="Creating...">
              Create node
            </FormSubmitButton>
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
              math root is not available.
            </p>
          )}
          {detachedNodes.length ? (
            <div className="space-y-2 rounded-md border border-amber-200 bg-amber-50 p-3">
              <div>
                <p className="text-sm font-medium text-amber-950">
                  Detached taxonomy nodes
                </p>
                <p className="text-xs text-amber-900">
                  These tag nodes have no active parent edge. Delete them if they were left behind by an older subtree delete.
                </p>
              </div>
              <div className="space-y-2">
                {detachedNodes.map((node) => (
                  <div
                    className="grid gap-2 rounded-md border bg-background px-3 py-2 text-sm md:grid-cols-[1fr_auto]"
                    key={node.tag_id}
                  >
                    <div className="min-w-0">
                      <p className="font-medium">
                        {taxonomyDisplayLabelFromId(node.tag_id)}
                      </p>
                      <p className="break-all font-mono text-[11px] text-muted-foreground">
                        {node.tag_id}
                      </p>
                    </div>
                    <form action={deleteTaxonomyNode}>
                      <input name="tag_id" type="hidden" value={node.tag_id} />
                      <FormSubmitButton
                        pendingLabel="Deleting..."
                        size="sm"
                        variant="destructive"
                      >
                        Delete subtree
                      </FormSubmitButton>
                    </form>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
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
                            .map((item) => taxonomyDisplayLabelFromId(item.tag_id))
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
