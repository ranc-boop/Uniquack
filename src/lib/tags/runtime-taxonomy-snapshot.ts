import { createHash } from "node:crypto";

export const RUNTIME_TAXONOMY_SNAPSHOT_VERSION = 2;
export const RUNTIME_TAXONOMY_RETRIEVAL_VERSION =
  "full-effective-leaves-v1";
export const RUNTIME_TAXONOMY_FACETS = [
  "curriculum",
  "concept",
  "method",
  "task",
  "form",
] as const;

type RuntimeTaxonomyFacet = {
  facet_key: string;
  label: string;
  root_tag_id: string;
  sort_order?: number | null;
};

type RuntimeTaxonomyNode = {
  aliases?: string[];
  facet_key?: string | null;
  is_assignable?: boolean;
  label: string;
  parent_tag_ids?: string[];
  tag_id: string;
};

export type RuntimeTaxonomyEdge = {
  edge_kind: string;
  from_tag_id: string;
  is_primary?: boolean;
  to_tag_id: string;
};

type NormalizedRuntimeTaxonomyNode = Omit<
  RuntimeTaxonomyNode,
  "facet_key" | "is_assignable"
> & {
  facet_key: string;
  is_assignable: boolean;
};

export type RuntimeTaxonomyCandidate = {
  aliases: string[];
  facet: (typeof RUNTIME_TAXONOMY_FACETS)[number];
  label: string;
  tagId: string;
};

export type RuntimeTaxonomySnapshot = ReturnType<
  typeof buildRuntimeTaxonomySnapshot
>;

function normalizedText(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function normalizedAliases(values: string[] | undefined) {
  return Array.from(
    new Set(
      (values ?? [])
        .map((value) => normalizedText(String(value)).toLocaleLowerCase("en-US"))
        .filter(Boolean),
    ),
  ).sort((left, right) => left.localeCompare(right));
}

function sortedUnique(values: string[] | undefined) {
  return Array.from(
    new Set((values ?? []).map((value) => normalizedText(String(value))).filter(Boolean)),
  ).sort((left, right) => left.localeCompare(right));
}

export function serializeRuntimeTaxonomyCandidates(
  candidates: RuntimeTaxonomyCandidate[],
) {
  const byFacet = new Map<string, RuntimeTaxonomyCandidate[]>();
  for (const candidate of candidates) {
    byFacet.set(candidate.facet, [
      ...(byFacet.get(candidate.facet) ?? []),
      candidate,
    ]);
  }

  return RUNTIME_TAXONOMY_FACETS.map((facet) => {
    const entries = (byFacet.get(facet) ?? [])
      .slice()
      .sort((left, right) => left.tagId.localeCompare(right.tagId))
      .map((candidate) => ({
        aliases: candidate.aliases,
        id: candidate.tagId,
        label: candidate.label,
      }));
    return `${facet}: ${JSON.stringify(entries)}`;
  }).join("\n");
}

export function buildRuntimeTaxonomyCandidateSubset(
  candidates: RuntimeTaxonomyCandidate[],
) {
  const selected = candidates
    .slice()
    .sort((left, right) => left.tagId.localeCompare(right.tagId));
  const canonicalJson = JSON.stringify({
    candidates: selected.map((candidate) => ({
      aliases: normalizedAliases(candidate.aliases),
      facet: candidate.facet,
      label: normalizedText(candidate.label),
      tagId: normalizedText(candidate.tagId),
    })),
    retrievalVersion: RUNTIME_TAXONOMY_RETRIEVAL_VERSION,
  });

  return {
    candidates: selected,
    canonicalJson,
    sha256: createHash("sha256").update(canonicalJson).digest("hex"),
    version: RUNTIME_TAXONOMY_RETRIEVAL_VERSION,
  };
}

export function buildRuntimeTaxonomySnapshot({
  edges,
  facets,
  nodes,
}: {
  edges?: RuntimeTaxonomyEdge[];
  facets: RuntimeTaxonomyFacet[];
  nodes: RuntimeTaxonomyNode[];
}) {
  const expectedFacets = new Set<string>(RUNTIME_TAXONOMY_FACETS);
  const duplicateNodeIds = new Set<string>();
  const nodesById = new Map<string, NormalizedRuntimeTaxonomyNode>();
  for (const node of nodes) {
    const tagId = normalizedText(node.tag_id);
    if (!tagId) continue;
    if (nodesById.has(tagId)) duplicateNodeIds.add(tagId);
    nodesById.set(tagId, {
      ...node,
      facet_key: normalizedText(String(node.facet_key ?? "")),
      is_assignable: node.is_assignable === true,
      label: normalizedText(String(node.label ?? "")),
      tag_id: tagId,
    });
  }

  const canonicalFacets = facets
    .filter((facet) => expectedFacets.has(facet.facet_key))
    .map((facet) => ({
      facet: facet.facet_key,
      label: normalizedText(facet.label),
      rootTagId: normalizedText(facet.root_tag_id),
    }))
    .sort(
      (left, right) =>
        RUNTIME_TAXONOMY_FACETS.indexOf(left.facet as never) -
          RUNTIME_TAXONOMY_FACETS.indexOf(right.facet as never) ||
        left.rootTagId.localeCompare(right.rootTagId),
    );
  const facetKeys = canonicalFacets.map((facet) => facet.facet);
  const exactFacetContract =
    canonicalFacets.length === RUNTIME_TAXONOMY_FACETS.length &&
    new Set(facetKeys).size === RUNTIME_TAXONOMY_FACETS.length &&
    RUNTIME_TAXONOMY_FACETS.every((facet) => facetKeys.includes(facet));
  const rootByFacet = new Map(
    canonicalFacets.map((facet) => [facet.facet, facet.rootTagId]),
  );
  const rootIds = new Set(canonicalFacets.map((facet) => facet.rootTagId));
  const subjectRootIds = new Set(
    canonicalFacets.flatMap((facet) => {
      const facetRoot = nodesById.get(facet.rootTagId);
      return sortedUnique(facetRoot?.parent_tag_ids).filter((parentId) => {
        const parent = nodesById.get(parentId);
        return parent && !parent.facet_key;
      });
    }),
  );

  const duplicateEdgeKeys = new Set<string>();
  const edgeEndpointMissingKeys = new Set<string>();
  const canonicalEdgesByKey = new Map<string, {
    edgeKind: string;
    fromTagId: string;
    isPrimary: boolean;
    toTagId: string;
  }>();
  const suppliedEdges = edges ?? nodes.flatMap((node) =>
    sortedUnique(node.parent_tag_ids).map((parentTagId) => ({
      edge_kind: "parent_child",
      from_tag_id: parentTagId,
      is_primary: true,
      to_tag_id: node.tag_id,
    }))
  );
  for (const edge of suppliedEdges) {
    const normalized = {
      edgeKind: normalizedText(String(edge.edge_kind ?? "")),
      fromTagId: normalizedText(String(edge.from_tag_id ?? "")),
      isPrimary: edge.is_primary !== false,
      toTagId: normalizedText(String(edge.to_tag_id ?? "")),
    };
    if (!normalized.edgeKind || !normalized.fromTagId || !normalized.toTagId) {
      continue;
    }
    const key = `${normalized.fromTagId}>${normalized.toTagId}:${normalized.edgeKind}`;
    if (canonicalEdgesByKey.has(key)) duplicateEdgeKeys.add(key);
    canonicalEdgesByKey.set(key, normalized);
    if (
      !nodesById.has(normalized.fromTagId) ||
      !nodesById.has(normalized.toTagId)
    ) {
      edgeEndpointMissingKeys.add(key);
    }
  }
  const canonicalEdges = Array.from(canonicalEdgesByKey.values()).sort(
    (left, right) =>
      left.fromTagId.localeCompare(right.fromTagId) ||
      left.toTagId.localeCompare(right.toTagId) ||
      left.edgeKind.localeCompare(right.edgeKind),
  );
  const parentIdsByTagId = new Map<string, string[]>();
  const childrenById = new Map<string, Set<string>>();
  for (const edge of canonicalEdges) {
    if (edge.edgeKind !== "parent_child") continue;
    parentIdsByTagId.set(edge.toTagId, [
      ...(parentIdsByTagId.get(edge.toTagId) ?? []),
      edge.fromTagId,
    ]);
    if (!nodesById.has(edge.fromTagId) || !nodesById.has(edge.toTagId)) continue;
    const children = childrenById.get(edge.fromTagId) ?? new Set<string>();
    children.add(edge.toTagId);
    childrenById.set(edge.fromTagId, children);
  }
  const parentRelationshipMismatchNodeIds = new Set<string>();
  if (edges) {
    for (const node of nodesById.values()) {
      const suppliedParentIds = sortedUnique(node.parent_tag_ids);
      const edgeParentIds = sortedUnique(parentIdsByTagId.get(node.tag_id));
      if (JSON.stringify(suppliedParentIds) !== JSON.stringify(edgeParentIds)) {
        parentRelationshipMismatchNodeIds.add(node.tag_id);
      }
    }
  }

  const orphanNodeIds = new Set<string>();
  const cycleNodeIds = new Set<string>();
  const crossFacetNodeIds = new Set<string>();
  const invalidFacetNodeIds = new Set<string>();
  const reachability = new Map<string, boolean>();

  function isReachable(tagId: string, path: string[] = []): boolean {
    if (reachability.has(tagId)) return reachability.get(tagId) === true;
    const node = nodesById.get(tagId);
    if (node && subjectRootIds.has(tagId)) {
      reachability.set(tagId, true);
      return true;
    }
    if (!node || !expectedFacets.has(node.facet_key)) {
      if (node) invalidFacetNodeIds.add(tagId);
      reachability.set(tagId, false);
      return false;
    }

    const cycleStart = path.indexOf(tagId);
    if (cycleStart >= 0) {
      for (const cycleId of path.slice(cycleStart)) cycleNodeIds.add(cycleId);
      cycleNodeIds.add(tagId);
      return false;
    }

    const rootTagId = rootByFacet.get(node.facet_key);
    if (!rootTagId) {
      orphanNodeIds.add(tagId);
      reachability.set(tagId, false);
      return false;
    }
    if (tagId === rootTagId) {
      reachability.set(tagId, true);
      return true;
    }

    const parents = sortedUnique(parentIdsByTagId.get(node.tag_id));
    if (parents.length === 0) {
      orphanNodeIds.add(tagId);
      reachability.set(tagId, false);
      return false;
    }

    const valid = parents.every((parentId) => {
      const parent = nodesById.get(parentId);
      if (!parent) {
        orphanNodeIds.add(tagId);
        return false;
      }
      if (parent.facet_key !== node.facet_key) {
        crossFacetNodeIds.add(tagId);
        return false;
      }
      return isReachable(parentId, [...path, tagId]);
    });
    reachability.set(tagId, valid);
    return valid;
  }

  for (const tagId of nodesById.keys()) isReachable(tagId);
  for (const tagId of cycleNodeIds) reachability.set(tagId, false);

  const canonicalNodes = Array.from(nodesById.values())
    .map((node) => {
      const activeChildren = Array.from(childrenById.get(node.tag_id) ?? []).sort(
        (left, right) => left.localeCompare(right),
      );
      const reachable = reachability.get(node.tag_id) === true;
      const effectiveLeaf =
        exactFacetContract &&
        reachable &&
        !rootIds.has(node.tag_id) &&
        node.is_assignable === true &&
        activeChildren.length === 0 &&
        !duplicateNodeIds.has(node.tag_id);

      return {
        active: true as const,
        activeChildTagIds: activeChildren,
        aliases: normalizedAliases(node.aliases),
        assignablePolicy: node.is_assignable === true,
        effectiveLeaf,
        facet: node.facet_key,
        label: normalizedText(node.label),
        parentTagIds: sortedUnique(parentIdsByTagId.get(node.tag_id)),
        reachable,
        tagId: node.tag_id,
      };
    })
    .sort((left, right) => left.tagId.localeCompare(right.tagId));
  const candidates = canonicalNodes
    .filter(
      (node): node is typeof node & {
        facet: (typeof RUNTIME_TAXONOMY_FACETS)[number];
      } => node.effectiveLeaf && expectedFacets.has(node.facet),
    )
    .map((node) => ({
      aliases: node.aliases,
      facet: node.facet,
      label: node.label,
      tagId: node.tagId,
    }));
  const canonicalJson = JSON.stringify({
    edges: canonicalEdges,
    facets: canonicalFacets,
    nodes: canonicalNodes.map((node) => ({
      active: node.active,
      aliases: node.aliases,
      assignablePolicy: node.assignablePolicy,
      effectiveLeaf: node.effectiveLeaf,
      facet: node.facet,
      label: node.label,
      parentTagIds: node.parentTagIds,
      tagId: node.tagId,
    })),
    version: RUNTIME_TAXONOMY_SNAPSHOT_VERSION,
  });
  const perFacet = Object.fromEntries(
    RUNTIME_TAXONOMY_FACETS.map((facet) => [
      facet,
      {
        candidates: candidates.filter((node) => node.facet === facet).length,
        nodes: canonicalNodes.filter((node) => node.facet === facet).length,
      },
    ]),
  );

  return {
    candidates,
    canonicalJson,
    canonicalNodes,
    counts: {
      activeNodes: canonicalNodes.length,
      aliases: canonicalNodes.reduce((total, node) => total + node.aliases.length, 0),
      allEdges: canonicalEdges.length,
      assignablePolicyNodes: canonicalNodes.filter((node) => node.assignablePolicy).length,
      edges: canonicalEdges.length,
      effectiveAssignableLeaves: candidates.length,
      groupingNodes: canonicalNodes.filter((node) => node.activeChildTagIds.length > 0).length,
      hierarchyEdges: canonicalEdges.filter((edge) => edge.edgeKind === "parent_child").length,
      labels: canonicalNodes.filter((node) => node.label.length > 0).length,
      leaves: canonicalNodes.filter((node) => node.activeChildTagIds.length === 0).length,
      nodes: canonicalNodes.length,
      roots: rootIds.size,
    },
    diagnostics: {
      crossFacetNodeIds: Array.from(crossFacetNodeIds).sort(),
      cycleNodeIds: Array.from(cycleNodeIds).sort(),
      duplicateEdgeKeys: Array.from(duplicateEdgeKeys).sort(),
      duplicateNodeIds: Array.from(duplicateNodeIds).sort(),
      edgeEndpointMissingKeys: Array.from(edgeEndpointMissingKeys).sort(),
      invalidFacetNodeIds: Array.from(invalidFacetNodeIds).sort(),
      orphanNodeIds: Array.from(orphanNodeIds).sort(),
      parentRelationshipMismatchNodeIds: Array.from(
        parentRelationshipMismatchNodeIds,
      ).sort(),
    },
    facetKeys: canonicalFacets.map((facet) => facet.facet),
    perFacet,
    sha256: createHash("sha256").update(canonicalJson).digest("hex"),
    valid:
      exactFacetContract &&
      duplicateNodeIds.size === 0 &&
      duplicateEdgeKeys.size === 0 &&
      edgeEndpointMissingKeys.size === 0 &&
      cycleNodeIds.size === 0 &&
      crossFacetNodeIds.size === 0 &&
      invalidFacetNodeIds.size === 0 &&
      orphanNodeIds.size === 0 &&
      parentRelationshipMismatchNodeIds.size === 0,
    version: RUNTIME_TAXONOMY_SNAPSHOT_VERSION,
  };
}
