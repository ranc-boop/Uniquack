import type { AIFiveFacetTagCategory, AITagNode } from "@/lib/ai-pdf-import/five-facet-tag-taxonomy";
import {
  getFiveFacetTagCatalog,
  getFiveFacetTagChildren,
  listFiveFacetTagCategories,
  listFiveFacetTagsByCategory,
} from "@/lib/tags/five-facet-tag-catalog";

type SelectedTagMap = Partial<Record<AIFiveFacetTagCategory, string[]>>;

type FiveFacetTagTreePickerProps = {
  disabled?: boolean;
  emptyLabel?: string;
  namePrefix: string;
  searchName?: string;
  searchQuery?: string;
  selectedTagIds?: SelectedTagMap;
  title?: string;
};

function titleCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function inputName(namePrefix: string, category: AIFiveFacetTagCategory) {
  return `${namePrefix}_${category}`;
}

function aliasesForTag(tagId: string) {
  return getFiveFacetTagCatalog().aliasIndex.aliases
    .filter((alias) => alias.tagIds.includes(tagId))
    .map((alias) => alias.alias);
}

function nodeMatchesSearch(node: AITagNode, query: string) {
  if (!query) return true;
  const haystack = [
    node.label,
    node.description,
    node.tagId,
    ...aliasesForTag(node.tagId),
  ]
    .join(" ")
    .toLowerCase();

  return haystack.includes(query.toLowerCase());
}

function rootNodes(category: AIFiveFacetTagCategory) {
  const nodes = listFiveFacetTagsByCategory(category);
  const nodeIds = new Set(nodes.map((node) => node.tagId));

  return nodes.filter(
    (node) =>
      !node.parentTagIds.length ||
      !node.parentTagIds.some((parentTagId) => nodeIds.has(parentTagId)),
  );
}

function nodeOrDescendantMatches(
  node: AITagNode,
  category: AIFiveFacetTagCategory,
  query: string,
): boolean {
  if (!query || nodeMatchesSearch(node, query)) return true;

  return getFiveFacetTagChildren(node.tagId)
    .filter((child) => child.category === category)
    .some((child) => nodeOrDescendantMatches(child, category, query));
}

function TreeNode({
  category,
  disabled,
  namePrefix,
  node,
  query,
  selected,
  level = 0,
}: {
  category: AIFiveFacetTagCategory;
  disabled: boolean;
  level?: number;
  namePrefix: string;
  node: AITagNode;
  query: string;
  selected: Set<string>;
}) {
  const children = getFiveFacetTagChildren(node.tagId).filter(
    (child) =>
      child.category === category && nodeOrDescendantMatches(child, category, query),
  );
  const childTree = children.map((child) => (
    <TreeNode
      category={category}
      disabled={disabled}
      key={child.tagId}
      level={level + 1}
      namePrefix={namePrefix}
      node={child}
      query={query}
      selected={selected}
    />
  ));
  const matches = nodeMatchesSearch(node, query);
  if (query && !matches && !children.length) return null;
  const aliases = aliasesForTag(node.tagId);

  return (
    <div className="space-y-1" style={{ marginLeft: `${Math.min(level, 4) * 12}px` }}>
      {matches ? (
        <label className="flex min-w-0 items-start gap-2 rounded-md border bg-background px-2 py-1.5 text-sm">
          <input
            className="mt-1"
            defaultChecked={selected.has(node.tagId)}
            disabled={disabled}
            name={inputName(namePrefix, category)}
            type="checkbox"
            value={node.tagId}
          />
          <span className="min-w-0">
            <span className="block font-medium">{node.label}</span>
            <span className="block break-all text-[11px] text-muted-foreground">
              {node.tagId}
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

export function FiveFacetTagTreePicker({
  disabled = false,
  emptyLabel = "No matching five-facet tags.",
  namePrefix,
  searchName = `${namePrefix}_search`,
  searchQuery = "",
  selectedTagIds = {},
  title = "Five-facet tag picker",
}: FiveFacetTagTreePickerProps) {
  const query = searchQuery.trim();
  const categories = listFiveFacetTagCategories();

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
          Search five-facet catalog
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
        {categories.map((category) => {
          const selected = new Set(selectedTagIds[category] ?? []);
          const roots = rootNodes(category);
          const renderedRoots = roots
            .filter((node) => nodeOrDescendantMatches(node, category, query))
            .map((node) => (
              <TreeNode
                category={category}
                disabled={disabled}
                key={node.tagId}
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
              key={category}
              open={Boolean(query) || Boolean(selected.size)}
            >
              <summary className="cursor-pointer text-sm font-semibold">
                {titleCase(category)}
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
