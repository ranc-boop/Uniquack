import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

export const TAXONOMY_SEED_PATH =
  "supabase/clean-seeds/0002_local_taxonomy_seed.sql";
export const TAXONOMY_EXPANSION_PATH =
  "supabase/clean-migrations/0056_add_math_taxonomy_v2_catalog.sql";

function escapedPattern(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseSqlValue(rawValue) {
  const value = rawValue.trim().replace(/::[a-z_][a-z0-9_.]*(?:\[\])?$/i, "");
  if (value === "null") return null;
  if (value === "true") return true;
  if (value === "false") return false;
  if (/^-?\d+(?:\.\d+)?$/.test(value)) return Number(value);
  if (value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1).replaceAll("''", "'");
  }
  return value;
}

function splitTuple(tuple) {
  const values = [];
  let current = "";
  let depth = 0;
  let quoted = false;
  for (let index = 0; index < tuple.length; index += 1) {
    const character = tuple[index];
    if (character === "'") {
      current += character;
      if (quoted && tuple[index + 1] === "'") {
        current += tuple[index + 1];
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (!quoted && character === "(") depth += 1;
    if (!quoted && character === ")") depth -= 1;
    if (!quoted && depth === 0 && character === ",") {
      values.push(parseSqlValue(current));
      current = "";
      continue;
    }
    current += character;
  }
  values.push(parseSqlValue(current));
  return values;
}

function readValueTuples(sql, startIndex) {
  const tuples = [];
  let index = startIndex;
  while (index < sql.length) {
    while (/\s|,/.test(sql[index] ?? "")) index += 1;
    if (/^on\s+conflict\b/i.test(sql.slice(index))) break;
    if (sql[index] === ";") break;
    assert.equal(sql[index], "(", "expected SQL VALUES tuple");
    const tupleStart = index + 1;
    let depth = 1;
    let quoted = false;
    index += 1;
    while (index < sql.length && depth > 0) {
      const character = sql[index];
      if (character === "'") {
        if (quoted && sql[index + 1] === "'") {
          index += 2;
          continue;
        }
        quoted = !quoted;
      } else if (!quoted && character === "(") {
        depth += 1;
      } else if (!quoted && character === ")") {
        depth -= 1;
      }
      index += 1;
    }
    assert.equal(depth, 0, "unterminated SQL VALUES tuple");
    tuples.push(sql.slice(tupleStart, index - 1));
  }
  return tuples;
}

export function parseSqlValueInserts(sql, tableName) {
  const pattern = new RegExp(
    `insert\\s+into\\s+${escapedPattern(tableName)}\\s*\\(([^)]*)\\)\\s*values`,
    "gi",
  );
  const rows = [];
  for (let match = pattern.exec(sql); match; match = pattern.exec(sql)) {
    const columns = match[1]
      .split(",")
      .map((column) => column.trim())
      .filter(Boolean);
    for (const tuple of readValueTuples(sql, pattern.lastIndex)) {
      const values = splitTuple(tuple);
      assert.equal(
        values.length,
        columns.length,
        `${tableName} tuple does not match its column list`,
      );
      rows.push(Object.fromEntries(columns.map((column, index) => [
        column,
        values[index],
      ])));
    }
  }
  return rows;
}

function edgeKey(edge) {
  return `${edge.from_tag_id}>${edge.to_tag_id}:${edge.edge_kind}`;
}

function aliasKey(alias) {
  return `${alias.normalized_alias}>${alias.tag_id}`;
}

function insertMissing(target, rows, keyOf, provenance, sourceCategory) {
  for (const row of rows) {
    const key = keyOf(row);
    if (!target.has(key)) {
      target.set(key, { ...row });
      provenance.set(key, sourceCategory);
    } else if (sourceCategory === "migration_0056") {
      provenance.set(key, "seed_preserved_0056_compatible");
    }
  }
}

function assertCompatible(existing, incoming, fields, label) {
  for (const field of fields) {
    assert.deepEqual(
      existing[field],
      incoming[field],
      `${label} has an incompatible ${field}`,
    );
  }
}

function validateOverlaps(target, rows, keyOf, fields, label) {
  for (const row of rows) {
    const existing = target.get(keyOf(row));
    if (existing) assertCompatible(existing, row, fields, label);
  }
}

function rowsByTable(sql, names) {
  return {
    aliases: parseSqlValueInserts(sql, names.aliases),
    edges: parseSqlValueInserts(sql, names.edges),
    facets: parseSqlValueInserts(sql, names.facets),
    nodes: parseSqlValueInserts(sql, names.nodes),
  };
}

function canonicalSourceCatalog({ aliases, edges, facets, nodes }) {
  const activeNodes = [...nodes.values()].filter((node) => node.status === "active");
  const activeNodeIds = new Set(activeNodes.map((node) => node.tag_id));
  const activeEdges = [...edges.values()].filter(
    (edge) =>
      edge.status === "active" &&
      activeNodeIds.has(edge.from_tag_id) &&
      activeNodeIds.has(edge.to_tag_id),
  );
  const activeAliases = [...aliases.values()].filter(
    (alias) => alias.status === "active" && activeNodeIds.has(alias.tag_id),
  );
  const aliasesByTagId = new Map();
  for (const alias of activeAliases) {
    aliasesByTagId.set(alias.tag_id, [
      ...(aliasesByTagId.get(alias.tag_id) ?? []),
      alias.alias_text,
    ]);
  }
  const parentsByTagId = new Map();
  for (const edge of activeEdges) {
    if (edge.edge_kind !== "parent_child") continue;
    parentsByTagId.set(edge.to_tag_id, [
      ...(parentsByTagId.get(edge.to_tag_id) ?? []),
      edge.from_tag_id,
    ]);
  }

  return {
    catalog: {
      facets: [...facets.values()]
        .filter((facet) => facet.status === "active")
        .map((facet) => ({
          facet_key: facet.facet_key,
          label: facet.label,
          root_tag_id: facet.root_tag_id,
          sort_order: facet.sort_order,
        })),
      nodes: activeNodes.map((node) => ({
        aliases: aliasesByTagId.get(node.tag_id) ?? [],
        description: node.description,
        facet_key: node.facet_key,
        is_assignable: node.is_assignable === true,
        label: node.label,
        parent_tag_ids: parentsByTagId.get(node.tag_id) ?? [],
        tag_id: node.tag_id,
      })),
    },
    edges: activeEdges.map((edge) => ({
      edge_kind: edge.edge_kind,
      from_tag_id: edge.from_tag_id,
      is_primary: edge.is_primary === true,
      to_tag_id: edge.to_tag_id,
    })),
    rows: {
      aliases: activeAliases,
      edges: activeEdges,
      facets: [...facets.values()].filter((facet) => facet.status === "active"),
      nodes: activeNodes,
    },
  };
}

export function buildTaxonomyCatalogFromRows({ aliases, edges, facets, nodes }) {
  return canonicalSourceCatalog({
    aliases: new Map(aliases.map((row) => [aliasKey(row), { ...row }])),
    edges: new Map(edges.map((row) => [edgeKey(row), { ...row }])),
    facets: new Map(facets.map((row) => [row.facet_key, { ...row }])),
    nodes: new Map(nodes.map((row) => [row.tag_id, { ...row }])),
  });
}

export async function loadAuthoritativeTaxonomySourceInventory(root) {
  const [seedSql, migrationSql] = await Promise.all([
    readFile(resolve(root, TAXONOMY_SEED_PATH), "utf8"),
    readFile(resolve(root, TAXONOMY_EXPANSION_PATH), "utf8"),
  ]);
  const seed = rowsByTable(seedSql, {
    aliases: "public.taxonomy_aliases",
    edges: "public.taxonomy_edges",
    facets: "public.taxonomy_facets",
    nodes: "public.taxonomy_nodes",
  });
  const stage = rowsByTable(migrationSql, {
    aliases: "_math_taxonomy_v2_aliases",
    edges: "_math_taxonomy_v2_edges",
    facets: "_math_taxonomy_v2_facets",
    nodes: "_math_taxonomy_v2_nodes",
  });
  const nodes = new Map();
  const facets = new Map();
  const edges = new Map();
  const aliases = new Map();
  const provenance = {
    aliases: new Map(),
    edges: new Map(),
    facets: new Map(),
    nodes: new Map(),
  };

  insertMissing(nodes, seed.nodes, (row) => row.tag_id, provenance.nodes, "seed_only");
  insertMissing(facets, seed.facets, (row) => row.facet_key, provenance.facets, "seed_only");
  insertMissing(edges, seed.edges, edgeKey, provenance.edges, "seed_only");
  insertMissing(aliases, seed.aliases, aliasKey, provenance.aliases, "seed_only");

  validateOverlaps(
    nodes,
    stage.nodes,
    (row) => row.tag_id,
    ["node_kind", "subject_tag_id", "facet_key", "status"],
    "0056 taxonomy node overlap",
  );
  validateOverlaps(
    facets,
    stage.facets,
    (row) => row.facet_key,
    ["subject_tag_id", "root_tag_id", "status"],
    "0056 taxonomy facet overlap",
  );
  validateOverlaps(
    edges,
    stage.edges,
    edgeKey,
    ["is_primary", "status"],
    "0056 taxonomy edge overlap",
  );
  validateOverlaps(
    aliases,
    stage.aliases,
    aliasKey,
    ["status"],
    "0056 taxonomy alias overlap",
  );

  insertMissing(nodes, stage.nodes, (row) => row.tag_id, provenance.nodes, "migration_0056");
  insertMissing(facets, stage.facets, (row) => row.facet_key, provenance.facets, "migration_0056");
  insertMissing(edges, stage.edges, edgeKey, provenance.edges, "migration_0056");
  insertMissing(aliases, stage.aliases, aliasKey, provenance.aliases, "migration_0056");

  const activeHierarchyParents = new Set(
    [...edges.values()]
      .filter((edge) => edge.status === "active" && edge.edge_kind === "parent_child")
      .map((edge) => edge.from_tag_id),
  );
  for (const stagedNode of stage.nodes) {
    const liveNode = nodes.get(stagedNode.tag_id);
    assert.ok(liveNode, "0056 taxonomy node was not inserted");
    liveNode.is_assignable =
      liveNode.node_kind === "tag" &&
      liveNode.status === "active" &&
      !activeHierarchyParents.has(liveNode.tag_id);
  }

  const canonical = canonicalSourceCatalog({ aliases, edges, facets, nodes });
  return {
    ...canonical,
    provenance,
    source: {
      migration: stage,
      seed,
    },
  };
}

export function provenanceCounts(provenance) {
  const countMap = (map) => Object.fromEntries(
    [...map.values()].reduce((counts, value) => {
      counts.set(value, (counts.get(value) ?? 0) + 1);
      return counts;
    }, new Map()),
  );
  return {
    aliases: countMap(provenance.aliases),
    edges: countMap(provenance.edges),
    facets: countMap(provenance.facets),
    nodes: countMap(provenance.nodes),
  };
}
