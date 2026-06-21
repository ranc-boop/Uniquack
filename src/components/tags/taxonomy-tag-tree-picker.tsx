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
  disabled?: boolean;
  emptyLabel?: string;
  namePrefix: string;
  searchName?: string;
  searchQuery?: string;
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
  const nodesById = new Map(catalog.nodes.map((node) => [node.tag_id, node]));
  const childrenById = new Map<string, TaxonomyNodeView[]>();

  for (const node of catalog.nodes) {
    for (const parentTagId of node.parent_tag_ids ?? []) {
      childrenById.set(parentTagId, [
        ...(childrenById.get(parentTagId) ?? []),
        node,
      ]);
    }
  }

  return { childrenById, nodesById };
}

function nodeMatchesSearch(node: TaxonomyNodeView, query: string) {
  if (!query) return true;
  const haystack = [
    node.label,
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

function TreeNode({
  childrenById,
  disabled,
  facetKey,
  namePrefix,
  node,
  query,
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
  selected: Set<string>;
}) {
  const children = (childrenById.get(node.tag_id) ?? []).filter(
    (child) =>
      child.facet_key === facetKey &&
      nodeOrDescendantMatches(child, facetKey, query, childrenById),
  );
  const childTree = children.map((child) => (
    <TreeNode
      childrenById={childrenById}
      disabled={disabled}
      facetKey={facetKey}
      key={child.tag_id}
      level={level + 1}
      namePrefix={namePrefix}
      node={child}
      query={query}
      selected={selected}
    />
  ));
  const matches = nodeMatchesSearch(node, query);
  if (query && !matches && !children.length) return null;
  const aliases = node.aliases ?? [];

  return (
    <div className="space-y-1" style={{ marginLeft: `${Math.min(level, 4) * 12}px` }}>
      {matches ? (
        <label className="flex min-w-0 items-start gap-2 rounded-md border bg-background px-2 py-1.5 text-sm">
          <input
            className="mt-1"
            defaultChecked={selected.has(node.tag_id)}
            disabled={disabled}
            name={inputName(namePrefix, facetKey)}
            type="checkbox"
            value={node.tag_id}
          />
          <span className="min-w-0">
            <span className="block font-medium">{node.label}</span>
            <span className="block break-all text-[11px] text-muted-foreground">
              {node.tag_id}
            </span>
            {aliases.length ? (
              <span className="block text-[11px] text-muted-foreground">
                Aliases: {aliases.slice(0, 3).join(", ")}
              </span>
            ) : null}
          </span>
        </label>
      ) : null}
      {childTree.length ? <div className="space-y-1">{childTree}</div> : null}
    </div>
  );
}

export function TaxonomyTagTreePicker({
  disabled = false,
  emptyLabel = "No matching taxonomy tags.",
  namePrefix,
  searchName = `${namePrefix}_search`,
  searchQuery = "",
  selectedTagIds = {},
  taxonomyCatalog,
  title = "Taxonomy tag picker",
}: TaxonomyTagTreePickerProps) {
  const query = searchQuery.trim();
  const { childrenById } = buildCatalogIndex(taxonomyCatalog);
  const facets = [...taxonomyCatalog.facets].sort(
    (left, right) => (left.sort_order ?? 0) - (right.sort_order ?? 0),
  );

  return (
    <div className="space-y-3 rounded-md border p-3">
      <div className="space-y-1">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">
          Browse by facet. Search matches label, alias, and tag ID; raw IDs are
          shown only as small reference text.
        </p>
      </div>
      <label className="block space-y-1">
        <span className="text-xs font-medium text-muted-foreground">
          Search taxonomy catalog
        </span>
        <input
          className="h-9 w-full rounded-md border bg-background px-3 text-sm"
          defaultValue={searchQuery}
          disabled={disabled}
          name={searchName}
          placeholder="quadratic, vertex, chain rule..."
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
                selected={selected}
              />
            ))
            .filter(Boolean);

          return (
            <details
              className="rounded-md border p-2"
              key={facet.facet_key}
              open={Boolean(query) || Boolean(selected.size)}
            >
              <summary className="cursor-pointer text-sm font-semibold">
                {facet.label || titleCase(facet.facet_key)}
                {selected.size ? (
                  <span className="ml-2 text-xs text-muted-foreground">
                    {selected.size} selected
                  </span>
                ) : null}
              </summary>
              <div className="mt-2 max-h-[340px] space-y-1 overflow-y-auto pr-1">
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
