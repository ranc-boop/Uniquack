import type { TaxonomyCatalogView } from "@/components/tags/taxonomy-tag-tree-picker";

export type AITaxonomyTagCategory = string;

export interface AITaxonomyTagTaxonomyPlan {
  allowedLeafTagIds: string[];
  allowedLeafTagIdsByFacet: Record<string, string[]>;
  facetCount: number;
  facets: Array<{
    facetKey: string;
    leafAssignableNodeCount: number;
    nodeCount: number;
    rootTagId: string;
  }>;
  generatedAt: string;
  mode: "database_snapshot";
  nodeCount: number;
  status: "completed" | "failed";
  version: "taxonomy_database_snapshot_v1";
  warnings: string[];
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

export function buildAITaxonomyTagTaxonomyPlan(
  catalog: TaxonomyCatalogView,
  { generatedAt = new Date().toISOString() }: { generatedAt?: string } = {},
): AITaxonomyTagTaxonomyPlan {
  const parentTagIds = new Set(
    catalog.nodes.flatMap((node) => node.parent_tag_ids ?? []),
  );
  const allowedLeafNodes = catalog.nodes.filter(
    (node) =>
      node.facet_key && node.is_assignable && !parentTagIds.has(node.tag_id),
  );
  const allowedLeafTagIds = allowedLeafNodes
    .map((node) => node.tag_id)
    .sort();
  const allowedLeafTagIdsByFacet = Object.fromEntries(
    catalog.facets.map((facet) => [
      facet.facet_key,
      allowedLeafNodes
        .filter((node) => node.facet_key === facet.facet_key)
        .map((node) => node.tag_id)
        .sort(),
    ]),
  );

  return {
    allowedLeafTagIds,
    allowedLeafTagIdsByFacet,
    facetCount: catalog.facets.length,
    facets: catalog.facets.map((facet) => ({
      facetKey: facet.facet_key,
      leafAssignableNodeCount:
        allowedLeafTagIdsByFacet[facet.facet_key]?.length ?? 0,
      nodeCount: catalog.nodes.filter(
        (node) => node.facet_key === facet.facet_key,
      ).length,
      rootTagId: facet.root_tag_id,
    })),
    generatedAt,
    mode: "database_snapshot",
    nodeCount: catalog.nodes.length,
    status: "completed",
    version: "taxonomy_database_snapshot_v1",
    warnings: catalog.nodes.length ? [] : ["taxonomy_database_catalog_empty"],
  };
}

export function failedAITaxonomyTagTaxonomyPlan({
  generatedAt = new Date().toISOString(),
  warnings,
}: {
  generatedAt?: string;
  warnings: string[];
}): AITaxonomyTagTaxonomyPlan {
  return {
    allowedLeafTagIds: [],
    allowedLeafTagIdsByFacet: {},
    facetCount: 0,
    facets: [],
    generatedAt,
    mode: "database_snapshot",
    nodeCount: 0,
    status: "failed",
    version: "taxonomy_database_snapshot_v1",
    warnings: uniqueStrings(warnings),
  };
}

export function mergeAITaxonomyTagTaxonomyPlanIntoSummary(
  existingAiPdfImport: Record<string, unknown>,
  taxonomyTagTaxonomyPlan: AITaxonomyTagTaxonomyPlan,
) {
  return {
    ...existingAiPdfImport,
    taxonomyTagTaxonomyPlan,
  };
}
