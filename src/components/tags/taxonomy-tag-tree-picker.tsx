"use client";

import { useMemo, useState } from "react";

import { taxonomyDisplayLabelFromId } from "@/lib/tags/taxonomy-display";

export type TaxonomyFacetView = {
  facet_key: string;
  label: string;
  root_tag_id: string;
  sort_order?: number | null;
};

export type TaxonomyNodeView = {
  aliases?: string[];
  description?: string | null;
  facet_key?: string | null;
  is_assignable?: boolean;
  label: string;
  parent_tag_ids?: string[];
  tag_id: string;
};

export type TaxonomyCatalogView = {
  facets: TaxonomyFacetView[];
  nodes: TaxonomyNodeView[];
};

type SelectedTagMap = Partial<Record<string, string[]>>;

type TaxonomyTagTreePickerProps = {
  defaultOpenFacetKeys?: string[];
  disabled?: boolean;
  emptyLabel?: string;
  namePrefix: string;
  searchName?: string;
  searchQuery?: string;
  selectable?: "all" | "assignable" | "assignable_leaf";
  selectedTagIds?: SelectedTagMap;
  taxonomyCatalog: TaxonomyCatalogView;
  title?: string;
};

function titleCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function inputName(namePrefix: string, facetKey: string) {
  return `${namePrefix}_${facetKey}`;
}

function buildCatalogIndex(catalog: TaxonomyCatalogView) {
  const childrenById = new Map<string, TaxonomyNodeView[]>();

  for (const node of catalog.nodes) {
    for (const parentTagId of node.parent_tag_ids ?? []) {
      childrenById.set(parentTagId, [
        ...(childrenById.get(parentTagId) ?? []),
        node,
      ]);
    }
  }

  for (const children of childrenById.values()) {
    children.sort((left, right) => left.tag_id.localeCompare(right.tag_id));
  }

  return { childrenById };
}

function nodeLabel(node: TaxonomyNodeView) {
  return taxonomyDisplayLabelFromId(node.tag_id);
}

function nodeMatchesSearch(node: TaxonomyNodeView, query: string) {
  if (!query) return true;
  const haystack = [
    nodeLabel(node),
    node.description,
    node.tag_id,
    ...(node.aliases ?? []),
  ]
    .join(" ")
    .toLowerCase();

  return haystack.includes(query.toLowerCase());
}

function rootNodes({
  catalog,
  facetKey,
  rootTagId,
}: {
  catalog: TaxonomyCatalogView;
  facetKey: string;
  rootTagId: string;
}) {
  const nodes = catalog.nodes.filter((node) => node.facet_key === facetKey);
  const nodeIds = new Set(nodes.map((node) => node.tag_id));
  const explicitRoot = nodes.find((node) => node.tag_id === rootTagId);
  if (explicitRoot) return [explicitRoot];

  return nodes.filter(
    (node) =>
      !(node.parent_tag_ids ?? []).length ||
      !(node.parent_tag_ids ?? []).some((parentTagId) => nodeIds.has(parentTagId)),
  );
}

function nodeOrDescendantMatches(
  node: TaxonomyNodeView,
  facetKey: string,
  query: string,
  childrenById: Map<string, TaxonomyNodeView[]>,
): boolean {
  if (!query || nodeMatchesSearch(node, query)) return true;

  return (childrenById.get(node.tag_id) ?? [])
    .filter((child) => child.facet_key === facetKey)
    .some((child) =>
      nodeOrDescendantMatches(child, facetKey, query, childrenById),
    );
}

function hasSelectedDescendant(
  node: TaxonomyNodeView,
  selected: Set<string>,
  childrenById: Map<string, TaxonomyNodeView[]>,
): boolean {
  return (childrenById.get(node.tag_id) ?? []).some(
    (child) =>
      selected.has(child.tag_id) ||
      hasSelectedDescendant(child, selected, childrenById),
  );
}

function TreeNode({
  childrenById,
  disabled,
  facetKey,
  namePrefix,
  node,
  query,
  selectable,
  selected,
  level = 0,
}: {
  childrenById: Map<string, TaxonomyNodeView[]>;
  disabled: boolean;
  facetKey: string;
  level?: number;
  namePrefix: string;
  node: TaxonomyNodeView;
  query: string;
  selectable: "all" | "assignable" | "assignable_leaf";
  selected: Set<string>;
}) {
  const children = (childrenById.get(node.tag_id) ?? []).filter(
    (child) =>
      child.facet_key === facetKey &&
      nodeOrDescendantMatches(child, facetKey, query, childrenById),
  );
  const matches = nodeMatchesSearch(node, query);
  if (query && !matches && !children.length) return null;

  const aliases = node.aliases ?? [];
  const isSelected = selected.has(node.tag_id);
  const canSelect =
    selectable === "all" ||
    (node.is_assignable !== false &&
      (selectable !== "assignable_leaf" || children.length === 0));
  const shouldOpen =
    Boolean(query) ||
    (level > 0 &&
      (isSelected || hasSelectedDescendant(node, selected, childrenById)));

  return (
    <details className="group min-w-0" open={shouldOpen}>
      <summary
        className="flex min-w-0 cursor-pointer list-none items-start gap-2 rounded-md border bg-background px-2 py-1.5 text-sm transition hover:bg-muted/40"
        style={{ marginLeft: `${level * 14}px` }}
      >
        <span className="mt-0.5 w-3 text-xs text-muted-foreground group-open:hidden">
          ▸
        </span>
        <span className="mt-0.5 hidden w-3 text-xs text-muted-foreground group-open:inline">
          ▾
        </span>
        <input
          className="mt-1"
          defaultChecked={isSelected}
          disabled={disabled || !canSelect}
          name={inputName(namePrefix, facetKey)}
          onClick={(event) => event.stopPropagation()}
          type="checkbox"
          value={node.tag_id}
        />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{nodeLabel(node)}</span>
            {!canSelect ? (
              <span className="rounded border px-1.5 py-0.5 text-[10px] text-muted-foreground">
                group
              </span>
            ) : null}
            {children.length ? (
              <span className="text-[11px] text-muted-foreground">
                {children.length} children
              </span>
            ) : null}
          </span>
          <span
            className="block font-mono text-[11px] text-muted-foreground"
            style={{ overflowWrap: "anywhere" }}
          >
            {node.tag_id}
          </span>
          {aliases.length ? (
            <span className="block text-[11px] text-muted-foreground">
              Aliases: {aliases.slice(0, 3).join(", ")}
            </span>
          ) : null}
        </span>
      </summary>
      {children.length ? (
        <div className="ml-4 mt-1 space-y-1 border-l pl-2">
          {children.map((child) => (
            <TreeNode
              childrenById={childrenById}
              disabled={disabled}
              facetKey={facetKey}
              key={child.tag_id}
              level={level + 1}
              namePrefix={namePrefix}
              node={child}
              query={query}
              selectable={selectable}
              selected={selected}
            />
          ))}
        </div>
      ) : null}
    </details>
  );
}

export function TaxonomyTagTreePicker({
  defaultOpenFacetKeys = [],
  disabled = false,
  emptyLabel = "No matching taxonomy tags.",
  namePrefix,
  searchName = `${namePrefix}_search`,
  searchQuery = "",
  selectable = "all",
  selectedTagIds = {},
  taxonomyCatalog,
  title = "Taxonomy tag picker",
}: TaxonomyTagTreePickerProps) {
  const [query, setQuery] = useState(searchQuery.trim());
  const { childrenById } = useMemo(
    () => buildCatalogIndex(taxonomyCatalog),
    [taxonomyCatalog],
  );
  const facets = useMemo(
    () =>
      [...taxonomyCatalog.facets].sort(
        (left, right) => (left.sort_order ?? 0) - (right.sort_order ?? 0),
      ),
    [taxonomyCatalog.facets],
  );
  const defaultOpenFacets = new Set(defaultOpenFacetKeys);

  return (
    <div className="space-y-3 rounded-md border p-3">
      <div className="space-y-1">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">
          Expand a facet, then choose existing tag IDs. Display names are derived
          from the final ID segment.
        </p>
      </div>
      <label className="block space-y-1">
        <span className="text-xs font-medium text-muted-foreground">
          Filter visible IDs
        </span>
        <input
          className="h-9 w-full rounded-md border bg-background px-3 text-sm"
          defaultValue={searchQuery}
          disabled={disabled}
          name={searchName}
          onChange={(event) => setQuery(event.currentTarget.value.trim())}
          placeholder="math.concept.calculus, chain_rule..."
          type="search"
        />
      </label>
      <div className="grid gap-3 lg:grid-cols-2">
        {facets.map((facet) => {
          const selected = new Set(selectedTagIds[facet.facet_key] ?? []);
          const roots = rootNodes({
            catalog: taxonomyCatalog,
            facetKey: facet.facet_key,
            rootTagId: facet.root_tag_id,
          });
          const renderedRoots = roots
            .filter((node) =>
              nodeOrDescendantMatches(
                node,
                facet.facet_key,
                query,
                childrenById,
              ),
            )
            .map((node) => (
              <TreeNode
                childrenById={childrenById}
                disabled={disabled}
                facetKey={facet.facet_key}
                key={node.tag_id}
                namePrefix={namePrefix}
                node={node}
                query={query}
                selectable={selectable}
                selected={selected}
              />
            ))
            .filter(Boolean);

          return (
            <details
              className="rounded-md border p-2"
              key={facet.facet_key}
              open={
                Boolean(query) ||
                Boolean(selected.size) ||
                defaultOpenFacets.has(facet.facet_key)
              }
            >
              <summary className="cursor-pointer text-sm font-semibold">
                {facet.label || titleCase(facet.facet_key)}
                {selected.size ? (
                  <span className="ml-2 text-xs text-muted-foreground">
                    {selected.size} selected
                  </span>
                ) : null}
              </summary>
              <div className="mt-2 max-h-[360px] space-y-1 overflow-y-auto pr-1">
                {renderedRoots.length ? (
                  renderedRoots
                ) : (
                  <p className="rounded-md border border-dashed p-2 text-xs text-muted-foreground">
                    {emptyLabel}
                  </p>
                )}
              </div>
            </details>
          );
        })}
      </div>
    </div>
  );
}
