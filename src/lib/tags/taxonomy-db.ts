import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  TaxonomyCatalogView,
  TaxonomyNodeView,
} from "@/components/tags/taxonomy-tag-tree-picker";
import type { Database } from "@/types/database";

export type TaxonomyDbLoadResult = {
  catalog: TaxonomyCatalogView;
  errorMessage: string | null;
};

function isMissingTaxonomyError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const record = error as { code?: unknown; message?: unknown };
  const message = typeof record.message === "string" ? record.message : "";

  return (
    record.code === "42P01" ||
    /taxonomy_|relation .* does not exist|schema cache/i.test(message)
  );
}

export async function loadTaxonomyCatalog(
  supabase: SupabaseClient<Database>,
): Promise<TaxonomyDbLoadResult> {
  const [
    { data: facets, error: facetsError },
    { data: nodes, error: nodesError },
    { data: edges, error: edgesError },
    { data: aliases, error: aliasesError },
  ] = await Promise.all([
    supabase
      .from("taxonomy_facets")
      .select("facet_key,label,root_tag_id,sort_order")
      .eq("status", "active")
      .order("sort_order", { ascending: true }),
    supabase
      .from("taxonomy_nodes")
      .select("tag_id,facet_key,label,description,is_assignable,sort_order")
      .eq("status", "active")
      .order("sort_order", { ascending: true }),
    supabase
      .from("taxonomy_edges")
      .select("from_tag_id,to_tag_id,edge_kind,sort_order")
      .eq("status", "active")
      .eq("edge_kind", "parent_child")
      .order("sort_order", { ascending: true }),
    supabase
      .from("taxonomy_aliases")
      .select("tag_id,alias_text")
      .eq("status", "active"),
  ]);

  const firstError = facetsError ?? nodesError ?? edgesError ?? aliasesError;
  if (firstError) {
    return {
      catalog: { facets: [], nodes: [] },
      errorMessage: isMissingTaxonomyError(firstError)
        ? "Taxonomy tables are not available yet. Apply migration 0011_math_taxonomy_source_of_truth.sql to enable taxonomy UI."
        : `Taxonomy catalog is unavailable: ${firstError.message}`,
    };
  }

  const aliasesByTagId = new Map<string, string[]>();
  for (const alias of aliases ?? []) {
    aliasesByTagId.set(alias.tag_id, [
      ...(aliasesByTagId.get(alias.tag_id) ?? []),
      alias.alias_text,
    ]);
  }

  const parentsByTagId = new Map<string, string[]>();
  for (const edge of edges ?? []) {
    parentsByTagId.set(edge.to_tag_id, [
      ...(parentsByTagId.get(edge.to_tag_id) ?? []),
      edge.from_tag_id,
    ]);
  }

  const catalogNodes: TaxonomyNodeView[] = (nodes ?? [])
    .filter((node) => node.is_assignable || node.tag_id === node.facet_key)
    .map((node) => ({
      aliases: aliasesByTagId.get(node.tag_id) ?? [],
      description: node.description,
      facet_key: node.facet_key,
      label: node.label,
      parent_tag_ids: parentsByTagId.get(node.tag_id) ?? [],
      tag_id: node.tag_id,
    }));

  return {
    catalog: {
      facets: facets ?? [],
      nodes: catalogNodes,
    },
    errorMessage: null,
  };
}

