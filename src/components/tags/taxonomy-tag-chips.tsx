import { Badge } from "@/components/ui/badge";
import type {
  TaxonomyCatalogView,
  TaxonomyNodeView,
} from "@/components/tags/taxonomy-tag-tree-picker";
import { taxonomyDisplayLabelFromId } from "@/lib/tags/taxonomy-display";

export type TaxonomyTagChipAssignment = {
  category?: string | null;
  facet_key?: string | null;
  review_status?: string | null;
  tag_id: string;
};

type TaxonomyTagChipsProps = {
  assignments?: TaxonomyTagChipAssignment[];
  emptyLabel?: string;
  showCategoryHeadings?: boolean;
  tagIds?: string[];
  taxonomyCatalog?: TaxonomyCatalogView;
};

function titleCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function buildCatalogIndex(catalog: TaxonomyCatalogView) {
  return new Map(catalog.nodes.map((node) => [node.tag_id, node]));
}

function breadcrumb({
  node,
  nodesById,
}: {
  node: TaxonomyNodeView;
  nodesById: Map<string, TaxonomyNodeView>;
}) {
  const labels: string[] = [];
  const seen = new Set<string>();
  let current = node;

  while (current.parent_tag_ids?.[0] && !seen.has(current.parent_tag_ids[0])) {
    const parent = nodesById.get(current.parent_tag_ids[0]);
    if (!parent) break;
    seen.add(parent.tag_id);
    labels.unshift(parent.label);
    current = parent;
  }

  return labels.join(" > ");
}

function normalizeAssignments({
  assignments,
  nodesById,
  tagIds,
}: Pick<TaxonomyTagChipsProps, "assignments" | "tagIds"> & {
  nodesById: Map<string, TaxonomyNodeView>;
}) {
  const seen = new Set<string>();
  const rows: TaxonomyTagChipAssignment[] = [
    ...(assignments ?? []),
    ...(tagIds ?? []).map((tagId) => ({ tag_id: tagId })),
  ];

  return rows.filter((row) => {
    if (!row.tag_id || seen.has(row.tag_id)) return false;
    seen.add(row.tag_id);
    return Boolean(nodesById.get(row.tag_id));
  });
}

export function TaxonomyTagChips({
  assignments,
  emptyLabel = "No official taxonomy tags assigned yet",
  showCategoryHeadings = true,
  tagIds,
  taxonomyCatalog = { facets: [], nodes: [] },
}: TaxonomyTagChipsProps) {
  const nodesById = buildCatalogIndex(taxonomyCatalog);
  const normalized = normalizeAssignments({ assignments, nodesById, tagIds });
  const facets = [...taxonomyCatalog.facets].sort(
    (left, right) => (left.sort_order ?? 0) - (right.sort_order ?? 0),
  );
  const byFacet = new Map<string, TaxonomyTagChipAssignment[]>(
    facets.map((facet) => [facet.facet_key, []]),
  );

  for (const row of normalized) {
    const node = nodesById.get(row.tag_id);
    if (!node) continue;
    const facetKey = node.facet_key ?? row.facet_key ?? row.category ?? "other";
    byFacet.set(facetKey, [...(byFacet.get(facetKey) ?? []), row]);
  }

  if (!normalized.length) {
    return <p className="text-xs text-muted-foreground">{emptyLabel}</p>;
  }

  return (
    <div className="space-y-2">
      {facets.map((facet) => {
        const rows = byFacet.get(facet.facet_key) ?? [];
        if (!rows.length) return null;

        return (
          <div className="space-y-1" key={facet.facet_key}>
            {showCategoryHeadings ? (
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                {facet.label || titleCase(facet.facet_key)}
              </p>
            ) : null}
            <div className="flex min-w-0 flex-wrap gap-1.5">
              {rows.map((row) => {
                const node = nodesById.get(row.tag_id);
                if (!node) return null;
                const path = breadcrumb({ node, nodesById });
                const status =
                  row.review_status && row.review_status !== "approved"
                    ? row.review_status
                    : "";

                return (
                  <Badge
                    className="max-w-full whitespace-normal text-left leading-relaxed"
                    key={row.tag_id}
                    title={`${path ? `${path} > ` : ""}${taxonomyDisplayLabelFromId(node.tag_id)} (${row.tag_id})`}
                    variant="outline"
                  >
                    <span className="min-w-0">
                      <span>{taxonomyDisplayLabelFromId(node.tag_id)}</span>
                      {path ? (
                        <span className="ml-1 text-[10px] text-muted-foreground">
                          {path} &gt;
                        </span>
                      ) : null}
                      {status ? (
                        <span className="ml-1 text-[10px] text-muted-foreground">
                          {status}
                        </span>
                      ) : null}
                    </span>
                  </Badge>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
