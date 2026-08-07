import "server-only";

import type {
  TaxonomyCatalogView,
  TaxonomyNodeView,
} from "@/components/tags/taxonomy-tag-tree-picker";

type TaxonomySupabaseLike = {
  from: (table: string) => any;
  rpc?: any;
};

export type TaxonomyEdgeView = {
  edge_kind: string;
  from_tag_id: string;
  is_primary: boolean;
  to_tag_id: string;
};

type FacetRow = TaxonomyCatalogView["facets"][number];
type NodeRow = Omit<TaxonomyNodeView, "aliases" | "parent_tag_ids" | "label"> & {
  is_assignable: boolean;
  label: string;
  sort_order?: number | null;
};
type EdgeRow = TaxonomyEdgeView;
type AliasRow = {
  alias_text: string;
  tag_id: string;
};

export type TaxonomyDbLoadResult = {
  catalog: TaxonomyCatalogView;
  edges: TaxonomyEdgeView[];
  errorMessage: string | null;
};

type TaxonomyDbLoadOptions = {
  includeAllEdges?: boolean;
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

function isMissingCatalogRpcError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const record = error as { code?: unknown; message?: unknown };
  const message = typeof record.message === "string" ? record.message : "";

  return (
    record.code === "42883" ||
    record.code === "PGRST202" ||
    /get_active_taxonomy_catalog_v1|schema cache/i.test(message)
  );
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function stringList(value: unknown) {
  return Array.isArray(value)
    ? value.map(String).filter(Boolean)
    : [];
}

function catalogFromRpcValue(value: unknown): TaxonomyCatalogView | null {
  const payload = asRecord(value);
  if (!payload || !Array.isArray(payload.facets) || !Array.isArray(payload.nodes)) {
    return null;
  }

  const facets = payload.facets.flatMap((value): FacetRow[] => {
    const facet = asRecord(value);
    if (
      !facet ||
      typeof facet.facet_key !== "string" ||
      typeof facet.label !== "string" ||
      typeof facet.root_tag_id !== "string"
    ) {
      return [];
    }

    return [{
      facet_key: facet.facet_key,
      label: facet.label,
      root_tag_id: facet.root_tag_id,
      sort_order:
        typeof facet.sort_order === "number" ? facet.sort_order : null,
    }];
  });
  const nodes = payload.nodes.flatMap((value): TaxonomyNodeView[] => {
    const node = asRecord(value);
    if (
      !node ||
      typeof node.tag_id !== "string" ||
      (typeof node.facet_key !== "string" && node.facet_key !== null)
    ) {
      return [];
    }

    return [{
      aliases: stringList(node.aliases),
      description:
        typeof node.description === "string" ? node.description : null,
      facet_key:
        typeof node.facet_key === "string" ? node.facet_key : null,
      is_assignable: node.is_assignable === true,
      label:
        typeof node.label === "string" && node.label.trim()
          ? node.label.trim()
          : node.tag_id,
      parent_tag_ids: stringList(node.parent_tag_ids),
      tag_id: node.tag_id,
    }];
  });

  return { facets, nodes };
}

export async function loadTaxonomyCatalog(
  supabase: TaxonomySupabaseLike,
  options: TaxonomyDbLoadOptions = {},
): Promise<TaxonomyDbLoadResult> {
  if (supabase.rpc) {
    const catalogResult = await supabase.rpc("get_active_taxonomy_catalog_v1");
    if (!catalogResult.error) {
      const catalog = catalogFromRpcValue(catalogResult.data);
      if (catalog) {
        if (!options.includeAllEdges) {
          return {
            catalog,
            edges: catalog.nodes.flatMap((node) =>
              (node.parent_tag_ids ?? []).map((parentTagId) => ({
                edge_kind: "parent_child",
                from_tag_id: parentTagId,
                is_primary: true,
                to_tag_id: node.tag_id,
              }))),
            errorMessage: null,
          };
        }

        const { data: edges, error: edgesError } = await supabase
          .from("taxonomy_edges")
          .select("from_tag_id,to_tag_id,edge_kind,is_primary")
          .eq("status", "active")
          .order("sort_order", { ascending: true });
        if (edgesError) {
          return {
            catalog: { facets: [], nodes: [] },
            edges: [],
            errorMessage: `Taxonomy edge catalog is unavailable: ${edgesError.message}`,
          };
        }

        return {
          catalog,
          edges: (edges ?? []) as TaxonomyEdgeView[],
          errorMessage: null,
        };
      }

      return {
        catalog: { facets: [], nodes: [] },
        edges: [],
        errorMessage: "Taxonomy catalog returned an invalid read-model payload.",
      };
    }

    if (!isMissingCatalogRpcError(catalogResult.error)) {
      return {
        catalog: { facets: [], nodes: [] },
        edges: [],
        errorMessage: `Taxonomy catalog is unavailable: ${catalogResult.error.message}`,
      };
    }
  }

  let edgesQuery = supabase
    .from("taxonomy_edges")
    .select("from_tag_id,to_tag_id,edge_kind,is_primary,sort_order")
    .eq("status", "active");
  if (!options.includeAllEdges) {
    edgesQuery = edgesQuery.eq("edge_kind", "parent_child");
  }

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
    edgesQuery.order("sort_order", { ascending: true }),
    supabase
      .from("taxonomy_aliases")
      .select("tag_id,alias_text")
      .eq("status", "active"),
  ]);

  const firstError = facetsError ?? nodesError ?? edgesError ?? aliasesError;
  if (firstError) {
    return {
      catalog: { facets: [], nodes: [] },
      edges: [],
      errorMessage: isMissingTaxonomyError(firstError)
        ? "Taxonomy tables are not available yet. Apply migration 0011_math_taxonomy_source_of_truth.sql to enable taxonomy UI."
        : `Taxonomy catalog is unavailable: ${firstError.message}`,
    };
  }

  const aliasesByTagId = new Map<string, string[]>();
  for (const alias of (aliases ?? []) as AliasRow[]) {
    aliasesByTagId.set(alias.tag_id, [
      ...(aliasesByTagId.get(alias.tag_id) ?? []),
      alias.alias_text,
    ]);
  }

  const parentsByTagId = new Map<string, string[]>();
  for (const edge of (edges ?? []) as EdgeRow[]) {
    if (edge.edge_kind !== "parent_child") continue;
    parentsByTagId.set(edge.to_tag_id, [
      ...(parentsByTagId.get(edge.to_tag_id) ?? []),
      edge.from_tag_id,
    ]);
  }

  const catalogNodes: TaxonomyNodeView[] = ((nodes ?? []) as NodeRow[])
    .map((node) => ({
      aliases: aliasesByTagId.get(node.tag_id) ?? [],
      description: node.description,
      facet_key: node.facet_key,
      is_assignable: node.is_assignable,
      label:
        typeof node.label === "string" && node.label.trim()
          ? node.label.trim()
          : node.tag_id,
      parent_tag_ids: parentsByTagId.get(node.tag_id) ?? [],
      tag_id: node.tag_id,
    }));

  return {
    catalog: {
      facets: (facets ?? []) as FacetRow[],
      nodes: catalogNodes,
    },
    edges: (edges ?? []) as TaxonomyEdgeView[],
    errorMessage: null,
  };
}
