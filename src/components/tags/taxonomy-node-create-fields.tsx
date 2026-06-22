"use client";

import { useMemo, useState } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  taxonomyDisplayLabelFromId,
  taxonomyJoinTagId,
  taxonomySuffixFromLabel,
} from "@/lib/tags/taxonomy-display";

type CreateNodeOption = {
  facet_key: string | null;
  is_assignable: boolean;
  label: string;
  node_kind: string;
  parent_tag_ids?: string[];
  tag_id: string;
};

type FacetOption = {
  facet_key: string;
  label: string;
  root_tag_id: string;
};

type TaxonomyNodeCreateFieldsProps = {
  facets: FacetOption[];
  nodes: CreateNodeOption[];
};

function buildChildrenByParent(nodes: CreateNodeOption[]) {
  const childrenByParent = new Map<string, CreateNodeOption[]>();
  for (const node of nodes) {
    for (const parentTagId of node.parent_tag_ids ?? []) {
      childrenByParent.set(parentTagId, [
        ...(childrenByParent.get(parentTagId) ?? []),
        node,
      ]);
    }
  }
  for (const children of childrenByParent.values()) {
    children.sort((left, right) => left.tag_id.localeCompare(right.tag_id));
  }
  return childrenByParent;
}

function defaultParentId({ facets, nodes }: TaxonomyNodeCreateFieldsProps) {
  const facetRoot = facets
    .map((facet) => nodes.find((node) => node.tag_id === facet.root_tag_id))
    .find(Boolean);
  return facetRoot?.tag_id ?? nodes.find((node) => node.tag_id === "math")?.tag_id ?? "";
}

function nodeMatches(node: CreateNodeOption, query: string) {
  if (!query) return true;
  return `${taxonomyDisplayLabelFromId(node.tag_id)} ${node.tag_id}`
    .toLowerCase()
    .includes(query.toLowerCase());
}

function descendantMatches(
  node: CreateNodeOption,
  query: string,
  childrenByParent: Map<string, CreateNodeOption[]>,
): boolean {
  return (childrenByParent.get(node.tag_id) ?? []).some(
    (child) => nodeMatches(child, query) || descendantMatches(child, query, childrenByParent),
  );
}

function hasSelectedDescendant(
  node: CreateNodeOption,
  selectedParentId: string,
  childrenByParent: Map<string, CreateNodeOption[]>,
): boolean {
  return (childrenByParent.get(node.tag_id) ?? []).some(
    (child) =>
      child.tag_id === selectedParentId ||
      hasSelectedDescendant(child, selectedParentId, childrenByParent),
  );
}

function ParentRow({
  childrenByParent,
  level = 0,
  node,
  onSelect,
  query,
  selectedParentId,
}: {
  childrenByParent: Map<string, CreateNodeOption[]>;
  level?: number;
  node: CreateNodeOption;
  onSelect: (node: CreateNodeOption) => void;
  query: string;
  selectedParentId: string;
}) {
  const children = (childrenByParent.get(node.tag_id) ?? []).filter(
    (child) => !query || nodeMatches(child, query) || descendantMatches(child, query, childrenByParent),
  );
  const matches = nodeMatches(node, query);
  const isSelected = selectedParentId === node.tag_id;
  const canSelect = node.node_kind !== "subject";
  if (query && !matches && !children.length) return null;

  return (
    <details
      className="group"
      open={
        Boolean(query) ||
        isSelected ||
        hasSelectedDescendant(node, selectedParentId, childrenByParent) ||
        level === 0
      }
    >
      <summary
        className="flex cursor-pointer list-none items-start gap-2 rounded-md border bg-background px-2 py-1.5 text-sm transition hover:bg-muted/40"
        style={{ marginLeft: `${level * 14}px` }}
      >
        <span className="mt-0.5 w-3 text-xs text-muted-foreground group-open:hidden">▸</span>
        <span className="mt-0.5 hidden w-3 text-xs text-muted-foreground group-open:inline">▾</span>
        <input
          checked={isSelected}
          className="mt-1"
          disabled={!canSelect}
          name="parent-node-radio-preview"
          onChange={() => {
            if (canSelect) onSelect(node);
          }}
          onClick={(event) => event.stopPropagation()}
          type="radio"
        />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{taxonomyDisplayLabelFromId(node.tag_id)}</span>
            <span className="rounded border px-1.5 py-0.5 text-[10px] text-muted-foreground">
              {node.facet_key ?? node.node_kind}
            </span>
            {children.length ? (
              <span className="text-[11px] text-muted-foreground">{children.length} children</span>
            ) : null}
          </span>
          <span className="block break-all text-[11px] text-muted-foreground">{node.tag_id}</span>
        </span>
      </summary>
      {children.length ? (
        <div className="ml-4 mt-1 space-y-1 border-l pl-2">
          {children.map((child) => (
            <ParentRow
              childrenByParent={childrenByParent}
              key={child.tag_id}
              level={level + 1}
              node={child}
              onSelect={onSelect}
              query={query}
              selectedParentId={selectedParentId}
            />
          ))}
        </div>
      ) : null}
    </details>
  );
}

export function TaxonomyNodeCreateFields({ facets, nodes }: TaxonomyNodeCreateFieldsProps) {
  const childrenByParent = useMemo(() => buildChildrenByParent(nodes), [nodes]);
  const nodesById = useMemo(() => new Map(nodes.map((node) => [node.tag_id, node])), [nodes]);
  const [parentId, setParentId] = useState(() => defaultParentId({ facets, nodes }));
  const [manualFacetKey, setManualFacetKey] = useState(facets[0]?.facet_key ?? "");
  const [query, setQuery] = useState("");
  const [label, setLabel] = useState("");
  const selectedParent = nodesById.get(parentId);
  const facetKey = selectedParent?.facet_key ?? manualFacetKey;
  const computedSuffix = taxonomySuffixFromLabel(label);
  const computedTagId = taxonomyJoinTagId(parentId, computedSuffix);
  const canCreateNode = Boolean(
    selectedParent &&
      selectedParent.node_kind !== "subject" &&
      facetKey &&
      computedSuffix &&
      computedTagId &&
      computedTagId !== parentId,
  );
  const rootNode = nodes.find((node) => node.tag_id === "math");
  const rootNodes = rootNode
    ? [rootNode]
    : nodes.filter((node) => !(node.parent_tag_ids ?? []).length);

  return (
    <div className="grid gap-3 md:grid-cols-2">
      <input name="parent_tag_id" type="hidden" value={parentId} />
      <input name="facet_key" type="hidden" value={facetKey ?? ""} />
      <input name="tag_id" type="hidden" value={canCreateNode ? computedTagId : ""} />
      <input
        name="label"
        type="hidden"
        value={canCreateNode ? taxonomyDisplayLabelFromId(computedTagId) : ""}
      />

      <div className="space-y-2 md:col-span-2">
        <Label>Parent node</Label>
        <input
          className="h-9 w-full rounded-md border bg-background px-3 text-sm"
          onChange={(event) => setQuery(event.currentTarget.value)}
          placeholder="Filter parent tree: math.concept.calculus, derivatives..."
          type="search"
          value={query}
        />
        <div className="max-h-[360px] overflow-y-auto rounded-md border p-2">
          <div className="space-y-1">
            {rootNodes.map((node) => (
              <ParentRow
                childrenByParent={childrenByParent}
                key={node.tag_id}
                node={node}
                onSelect={(nextNode) => {
                  setParentId(nextNode.tag_id);
                  if (nextNode.facet_key) setManualFacetKey(nextNode.facet_key);
                }}
                query={query.trim()}
                selectedParentId={parentId}
              />
            ))}
          </div>
        </div>
      </div>

      {!selectedParent?.facet_key ? (
        <div className="space-y-2">
          <Label htmlFor="fallback_facet_key">Facet</Label>
          <select
            className="h-10 w-full rounded-md border bg-background px-3 text-sm"
            id="fallback_facet_key"
            onChange={(event) => setManualFacetKey(event.currentTarget.value)}
            value={manualFacetKey}
          >
            {facets.map((facet) => (
              <option key={facet.facet_key} value={facet.facet_key}>
                {facet.label}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="display_label">Display tag</Label>
        <Input
          id="display_label"
          onChange={(event) => setLabel(event.currentTarget.value)}
          placeholder="Chain rule"
          required
          value={label}
        />
        <p className="text-xs text-muted-foreground">
          Enter the human-readable tag name. The ID suffix is generated automatically.
        </p>
      </div>
      <div className="space-y-2">
        <Label>Generated suffix preview</Label>
        <div className="flex rounded-md border bg-muted text-sm">
          <span className="max-w-[60%] truncate border-r px-3 py-2 text-muted-foreground">
            {parentId ? `${parentId}.` : "choose parent first"}
          </span>
          <span className="min-w-0 flex-1 bg-transparent px-3 py-2 font-mono text-muted-foreground">
            {computedSuffix || "generated_from_display_tag"}
          </span>
        </div>
        <p className="break-all rounded-md bg-muted px-2 py-1 font-mono text-[11px] text-muted-foreground">
          Full tag ID: {computedTagId || "choose a parent and display tag"}
        </p>
        {!canCreateNode ? (
          <p className="text-xs text-destructive" role="status">
            Choose a facet/tag parent and enter a display tag to create a child tag.
          </p>
        ) : null}
      </div>
      <div className="space-y-2 md:col-span-2">
        <Label htmlFor="description">Description</Label>
        <Input id="description" name="description" placeholder="Optional short description" />
      </div>
      <label className="flex items-center gap-2 text-sm md:col-span-2">
        <input name="is_assignable" type="hidden" value="false" />
        <input defaultChecked name="is_assignable" type="checkbox" value="true" />
        Assignable to questions
      </label>
    </div>
  );
}
