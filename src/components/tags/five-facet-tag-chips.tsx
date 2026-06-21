import { Badge } from "@/components/ui/badge";
import type { AIFiveFacetTagCategory } from "@/lib/ai-pdf-import/five-facet-tag-taxonomy";
import {
  getFiveFacetTagAncestors,
  getFiveFacetTagNode,
  listFiveFacetTagCategories,
} from "@/lib/tags/five-facet-tag-catalog";

export type FiveFacetTagChipAssignment = {
  category?: string | null;
  review_status?: string | null;
  tag_id: string;
};

type FiveFacetTagChipsProps = {
  assignments?: FiveFacetTagChipAssignment[];
  emptyLabel?: string;
  showCategoryHeadings?: boolean;
  tagIds?: string[];
};

function titleCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function breadcrumb(tagId: string) {
  return getFiveFacetTagAncestors(tagId)
    .map((ancestor) => ancestor.label)
    .join(" > ");
}

function normalizeAssignments({
  assignments,
  tagIds,
}: Pick<FiveFacetTagChipsProps, "assignments" | "tagIds">) {
  const seen = new Set<string>();
  const rows: FiveFacetTagChipAssignment[] = [
    ...(assignments ?? []),
    ...(tagIds ?? []).map((tagId) => ({ tag_id: tagId })),
  ];

  return rows.filter((row) => {
    if (!row.tag_id || seen.has(row.tag_id)) return false;
    seen.add(row.tag_id);
    return Boolean(getFiveFacetTagNode(row.tag_id));
  });
}

export function FiveFacetTagChips({
  assignments,
  emptyLabel = "No official five-facet tags assigned yet",
  showCategoryHeadings = true,
  tagIds,
}: FiveFacetTagChipsProps) {
  const normalized = normalizeAssignments({ assignments, tagIds });
  const categories = listFiveFacetTagCategories();
  const byCategory = new Map<AIFiveFacetTagCategory, FiveFacetTagChipAssignment[]>(
    categories.map((category) => [category, []]),
  );

  for (const row of normalized) {
    const node = getFiveFacetTagNode(row.tag_id);
    if (!node) continue;
    byCategory.set(node.category, [...(byCategory.get(node.category) ?? []), row]);
  }

  if (!normalized.length) {
    return <p className="text-xs text-muted-foreground">{emptyLabel}</p>;
  }

  return (
    <div className="space-y-2">
      {categories.map((category) => {
        const rows = byCategory.get(category) ?? [];
        if (!rows.length) return null;

        return (
          <div className="space-y-1" key={category}>
            {showCategoryHeadings ? (
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                {titleCase(category)}
              </p>
            ) : null}
            <div className="flex min-w-0 flex-wrap gap-1.5">
              {rows.map((row) => {
                const node = getFiveFacetTagNode(row.tag_id);
                if (!node) return null;
                const path = breadcrumb(row.tag_id);
                const status =
                  row.review_status && row.review_status !== "approved"
                    ? row.review_status
                    : "";

                return (
                  <Badge
                    className="max-w-full whitespace-normal text-left leading-relaxed"
                    key={row.tag_id}
                    title={`${path ? `${path} > ` : ""}${node.label} (${row.tag_id})`}
                    variant="outline"
                  >
                    <span className="min-w-0">
                      <span>{node.label}</span>
                      {path ? (
                        <span className="ml-1 text-[10px] text-muted-foreground">
                          {path}
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
