import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";

import {
  buildTaxonomyCatalogFromRows,
  loadAuthoritativeTaxonomySourceInventory,
} from "./lib/taxonomy-source-inventory.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const requiredEnvironment = "AUTHORIZED_CURRENT_CLEAN_TAXONOMY_READONLY";
const requiredConfirmation = "NO_WRITES_NO_PROVIDER";
const require = createRequire(import.meta.url);
const jiti = require("jiti")(import.meta.url, {
  alias: { "@": resolve(root, "src") },
  cache: false,
});
const { buildRuntimeTaxonomySnapshot } = jiti(
  "../../src/lib/tags/runtime-taxonomy-snapshot.ts",
);

function required(name) {
  const value = process.env[name]?.trim();
  assert.ok(value, `${name.toLowerCase()}_missing`);
  return value;
}

function projectRefFromUrl(value) {
  const parsed = new URL(value);
  assert.equal(parsed.protocol, "https:", "supabase_url_contract_failed");
  const match = /^([a-z0-9]+)\.supabase\.co$/i.exec(parsed.hostname);
  assert.ok(match, "supabase_url_contract_failed");
  return match[1].toLowerCase();
}

async function selectAll(queryFactory, label) {
  const rows = [];
  const pageSize = 500;
  for (let start = 0; ; start += pageSize) {
    const { data, error } = await queryFactory().range(start, start + pageSize - 1);
    assert.equal(error, null, `${label}_read_failed`);
    rows.push(...(data ?? []));
    if ((data ?? []).length < pageSize) break;
  }
  return rows;
}

const url = required("NEXT_PUBLIC_SUPABASE_URL");
const anonKey = required("NEXT_PUBLIC_SUPABASE_ANON_KEY");
const expectedProjectRef = required("PDF50_E2E_EXPECTED_PROJECT_REF");
assert.equal(
  process.env.AI_PARSING_TAXONOMY_READONLY_ENVIRONMENT,
  requiredEnvironment,
  "readonly_environment_contract_failed",
);
assert.equal(
  process.env.AI_PARSING_TAXONOMY_READONLY_CONFIRMATION,
  requiredConfirmation,
  "readonly_confirmation_contract_failed",
);
assert.match(expectedProjectRef, /^[a-z0-9]+$/i, "expected_project_ref_contract_failed");
assert.equal(
  projectRefFromUrl(url),
  expectedProjectRef.toLowerCase(),
  "expected_project_identity_mismatch",
);

const client = createClient(url, anonKey, {
  auth: {
    autoRefreshToken: false,
    detectSessionInUrl: false,
    persistSession: false,
  },
});

const [nodes, facets, edges, aliases, source] = await Promise.all([
  selectAll(
    () => client
      .from("taxonomy_nodes")
      .select("tag_id,node_kind,subject_tag_id,facet_key,label,description,is_assignable,sort_order,status")
      .eq("status", "active")
      .order("tag_id", { ascending: true }),
    "taxonomy_nodes",
  ),
  selectAll(
    () => client
      .from("taxonomy_facets")
      .select("facet_key,subject_tag_id,root_tag_id,label,description,sort_order,status")
      .eq("status", "active")
      .order("facet_key", { ascending: true }),
    "taxonomy_facets",
  ),
  selectAll(
    () => client
      .from("taxonomy_edges")
      .select("from_tag_id,to_tag_id,edge_kind,is_primary,sort_order,status")
      .eq("status", "active")
      .order("from_tag_id", { ascending: true }),
    "taxonomy_edges",
  ),
  selectAll(
    () => client
      .from("taxonomy_aliases")
      .select("alias_text,normalized_alias,tag_id,status")
      .eq("status", "active")
      .order("normalized_alias", { ascending: true }),
    "taxonomy_aliases",
  ),
  loadAuthoritativeTaxonomySourceInventory(root),
]);

const hosted = buildTaxonomyCatalogFromRows({ aliases, edges, facets, nodes });
const sourceSnapshot = buildRuntimeTaxonomySnapshot({
  ...source.catalog,
  edges: source.edges,
});
const hostedSnapshot = buildRuntimeTaxonomySnapshot({
  ...hosted.catalog,
  edges: hosted.edges,
});
assert.equal(sourceSnapshot.valid, true, "source_taxonomy_snapshot_invalid");
assert.equal(hostedSnapshot.valid, true, "hosted_taxonomy_snapshot_invalid");

const sourceNodeIds = new Set(source.rows.nodes.map((row) => row.tag_id));
const hostedNodeIds = new Set(hosted.rows.nodes.map((row) => row.tag_id));
const sourceIsSubset = [...sourceNodeIds].every((tagId) => hostedNodeIds.has(tagId));
const parity = sourceSnapshot.canonicalJson === hostedSnapshot.canonicalJson;
const hostedNewer =
  !parity &&
  sourceIsSubset &&
  hostedSnapshot.counts.activeNodes > sourceSnapshot.counts.activeNodes;
const classification = parity
  ? "AUTHORITATIVE_RECENT_TAXONOMY_CONFIRMED"
  : hostedNewer
    ? "HOSTED_TAXONOMY_NEWER_THAN_SOURCE_REQUIRES_CANONICALIZATION"
    : "SOURCE_HOSTED_TAXONOMY_DRIFT_REQUIRES_REVIEW";

console.log("HOSTED_TAXONOMY_READONLY_AUDIT=COMPLETE");
console.log(`SOURCE_COUNTS=${JSON.stringify(sourceSnapshot.counts)}`);
console.log(`HOSTED_COUNTS=${JSON.stringify(hostedSnapshot.counts)}`);
console.log(`SOURCE_SNAPSHOT_SHA256=${sourceSnapshot.sha256}`);
console.log(`HOSTED_SNAPSHOT_SHA256=${hostedSnapshot.sha256}`);
console.log(`SOURCE_HOSTED_PARITY=${parity ? "PASS" : "FAIL"}`);
console.log("HOSTED_WRITES=0");
console.log("PROVIDER_CALLS=0");
console.log(`CLASSIFICATION=${classification}`);
process.exitCode = parity ? 0 : hostedNewer ? 2 : 3;
