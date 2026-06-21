import type { TaxonomyCatalogView } from "@/components/tags/taxonomy-tag-tree-picker";

export type AITaxonomyTagCategory = string;

export interface AITagNode {
  aliases: string[];
  category: string;
  description: string;
  label: string;
  parentTagIds: string[];
  tagId: string;
}

export interface AITaxonomyTagTaxonomyPlan {
  facetCount: number;
  facets: Array<{
    facetKey: string;
    label: string;
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
  return {
    facetCount: catalog.facets.length,
    facets: catalog.facets.map((facet) => ({
      facetKey: facet.facet_key,
      label: facet.label,
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
