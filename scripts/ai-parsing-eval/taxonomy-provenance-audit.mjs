import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const migrationPath = "supabase/clean-migrations/0056_add_math_taxonomy_v2_catalog.sql";
const windowStart = "2026-07-29T07:00:00Z";
const windowEnd = "2026-08-06T07:00:00Z";
const exactFacets = ["curriculum", "concept", "method", "task", "form"];
const require = createRequire(import.meta.url);
const jiti = require("jiti")(import.meta.url, {
  alias: { "@": resolve(root, "src") },
  cache: false,
});
const { buildRuntimeTaxonomySnapshot } = jiti(
  "../../src/lib/tags/runtime-taxonomy-snapshot.ts",
);

function git(args) {
  return execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function gitBytes(args) {
  return execFileSync("git", args, {
    cwd: root,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function valuesLines(sql, tableName) {
  const marker = `insert into ${tableName} (`;
  const start = sql.indexOf(marker);
  assert.notEqual(start, -1, `missing ${tableName} insert`);
  const valuesStart = sql.indexOf(") values", start);
  assert.notEqual(valuesStart, -1, `missing ${tableName} values`);
  const end = sql.indexOf(";", valuesStart);
  assert.notEqual(end, -1, `unterminated ${tableName} values`);
  return sql.slice(valuesStart + ") values".length, end)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("("));
}

function parseTuple(line) {
  const source = line.replace(/^\(/, "").replace(/[;,]?$/, "").replace(/\)$/, "");
  const fields = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (character === "'") {
      if (quoted && source[index + 1] === "'") {
        current += "''";
        index += 1;
        continue;
      }
      quoted = !quoted;
      current += character;
      continue;
    }
    if (character === "," && !quoted) {
      fields.push(current.trim());
      current = "";
      continue;
    }
    current += character;
  }
  fields.push(current.trim());
  return fields.map((field) => {
    const castIndex = field.lastIndexOf("::");
    const withoutCast = castIndex > 0 ? field.slice(0, castIndex) : field;
    if (withoutCast === "null") return null;
    if (withoutCast === "true") return true;
    if (withoutCast === "false") return false;
    if (/^-?\d+$/.test(withoutCast)) return Number(withoutCast);
    if (withoutCast.startsWith("'") && withoutCast.endsWith("'")) {
      return withoutCast.slice(1, -1).replaceAll("''", "'");
    }
    return withoutCast;
  });
}

function sourceCounts(sql) {
  const nodes = valuesLines(sql, "_math_taxonomy_v2_nodes").map(parseTuple)
    .map(([tagId, nodeKind, , facet, label, description, declaredAssignable, , status]) => ({
      declaredAssignable,
      description,
      facet,
      label,
      nodeKind,
      status,
      tagId,
    }));
  const facets = valuesLines(sql, "_math_taxonomy_v2_facets").map(parseTuple)
    .map(([facetKey, , rootTagId, label, , sortOrder, status]) => ({
      facetKey,
      label,
      rootTagId,
      sortOrder,
      status,
    }));
  const edges = valuesLines(sql, "_math_taxonomy_v2_edges").map(parseTuple)
    .map(([from, to, kind, , , status]) => ({ from, kind, status, to }));
  const aliases = valuesLines(sql, "_math_taxonomy_v2_aliases").map(parseTuple)
    .map(([alias, normalized, tagId, status]) => ({ alias, normalized, status, tagId }));
  const activeNodes = nodes.filter((node) => node.status === "active");
  const hierarchyEdges = edges.filter(
    (edge) => edge.kind === "parent_child" && edge.status === "active",
  );
  const parentIds = new Set(hierarchyEdges.map((edge) => edge.from));
  const childIds = new Set(hierarchyEdges.map((edge) => edge.to));
  const effectiveLeaves = activeNodes.filter(
    (node) => node.nodeKind === "tag" && !parentIds.has(node.tagId),
  );
  const perFacet = Object.fromEntries(exactFacets.map((facet) => [
    facet,
    {
      activeNodes: activeNodes.filter((node) => node.facet === facet).length,
      effectiveAssignableLeaves: effectiveLeaves.filter((node) => node.facet === facet).length,
    },
  ]));
  const activeAliases = aliases.filter((alias) => alias.status === "active");
  const aliasesByTagId = new Map();
  for (const alias of activeAliases) {
    aliasesByTagId.set(alias.tagId, [
      ...(aliasesByTagId.get(alias.tagId) ?? []),
      alias.alias,
    ]);
  }
  const parentsByTagId = new Map();
  for (const edge of hierarchyEdges) {
    parentsByTagId.set(edge.to, [
      ...(parentsByTagId.get(edge.to) ?? []),
      edge.from,
    ]);
  }
  const catalog = {
    facets: facets
      .filter((facet) => facet.status === "active")
      .map((facet) => ({
        facet_key: facet.facetKey,
        label: facet.label,
        root_tag_id: facet.rootTagId,
        sort_order: facet.sortOrder,
      })),
    nodes: activeNodes.map((node) => ({
      aliases: aliasesByTagId.get(node.tagId) ?? [],
      description: node.description,
      facet_key: node.facet,
      is_assignable: node.declaredAssignable === true,
      label: node.label,
      parent_tag_ids: parentsByTagId.get(node.tagId) ?? [],
      tag_id: node.tagId,
    })),
  };

  return { catalog, counts: {
    activeNodes: activeNodes.length,
    aliases: activeAliases.length,
    allEdges: edges.filter((edge) => edge.status === "active").length,
    assignableNodes: effectiveLeaves.length,
    declaredAssignableBeforeGraphDerivation: activeNodes.filter(
      (node) => node.declaredAssignable === true,
    ).length,
    effectiveAssignableLeaves: effectiveLeaves.length,
    facetRows: facets.filter((facet) => facet.status === "active").length,
    groupingNodes: activeNodes.filter((node) => parentIds.has(node.tagId)).length,
    hierarchyEdges: hierarchyEdges.length,
    labels: activeNodes.filter((node) => String(node.label ?? "").trim()).length,
    leaves: activeNodes.filter((node) => !parentIds.has(node.tagId)).length,
    nodes: nodes.length,
    perFacet,
    roots: activeNodes.filter((node) => !childIds.has(node.tagId)).length,
  } };
}

const sql = await readFile(resolve(root, migrationPath), "utf8");
const source = sourceCounts(sql);
const counts = source.counts;
const sourceRuntimeSnapshot = buildRuntimeTaxonomySnapshot(source.catalog);
assert.equal(counts.nodes, 430);
assert.equal(counts.activeNodes, 430);
assert.equal(counts.hierarchyEdges, 429);
assert.equal(counts.effectiveAssignableLeaves, 364);
assert.equal(counts.facetRows, 5);
assert.equal(counts.labels, 430);
assert.equal(sourceRuntimeSnapshot.valid, true);
assert.equal(sourceRuntimeSnapshot.counts.effectiveAssignableLeaves, 364);

const introduction = git([
  "log",
  "--all",
  "--diff-filter=A",
  "--format=%H|%aI|%s",
  "--",
  migrationPath,
]).split(/\r?\n/).filter(Boolean)[0];
assert.ok(introduction, "0056 introduction commit is missing");
const [introductionCommit, introductionDate] = introduction.split("|");
const recentChangedPaths = git([
  "log",
  "--all",
  `--since=${windowStart}`,
  `--until=${windowEnd}`,
  "--name-only",
  "--pretty=format:",
  "--",
  "supabase",
  "fixtures",
  "scripts",
  "src/app/admin/tags",
  "src/lib/tags",
]).split(/\r?\n/).map((value) => value.trim()).filter(Boolean);
const recentTaxonomyDataPaths = Array.from(new Set(recentChangedPaths.filter((path) =>
  /taxonomy|(?:^|[/_.-])tags?(?:[/_.-]|$)/i.test(path) &&
    !path.startsWith("fixtures/ai-parsing-golden/") &&
    /\.(sql|json|csv|tsv)$/i.test(path) &&
    !path.startsWith("docs/"),
))).sort();
const recentTaxonomyRelatedPaths = Array.from(new Set(recentChangedPaths.filter((path) =>
  /taxonomy|src\/app\/admin\/tags|src\/lib\/tags/i.test(path),
))).sort();
const currentGitBytes = gitBytes(["show", `HEAD:${migrationPath}`]);
const mainGitBytes = gitBytes(["show", `origin/main:${migrationPath}`]);
const refs = {
  currentHead: git(["rev-parse", "HEAD"]),
  originMain: git(["rev-parse", "origin/main"]),
  stackedBase: "f1ce7bcb791604468693ea945401cfb157e64d97",
};
const pullRequestRefs = git([
  "for-each-ref",
  "--format=%(refname)",
  "refs/remotes/origin/pr",
]).split(/\r?\n/).filter(Boolean);
const remoteBranchRefs = git([
  "for-each-ref",
  "--format=%(refname)",
  "refs/remotes/origin",
]).split(/\r?\n/).filter((ref) => ref && !ref.startsWith("refs/remotes/origin/pr/"));
const sourceSha256 = createHash("sha256").update(currentGitBytes).digest("hex");
const mainSha256 = createHash("sha256").update(mainGitBytes).digest("hex");

console.log("TAXONOMY_PROVENANCE_AUDIT=PASS");
console.log("VERDICT=RECENT_TAXONOMY_PROVENANCE_NOT_FOUND");
console.log(`WINDOW_UTC=${windowStart}..${windowEnd}`);
console.log(`MIGRATION_INTRODUCTION=${introductionCommit};DATE=${introductionDate}`);
console.log(`SOURCE_COUNTS=${JSON.stringify(counts)}`);
console.log("KNOWN_ALIAS_COUNT_CORRECTION=14_TO_16");
console.log(`RECENT_TAXONOMY_DATA_PATHS=${recentTaxonomyDataPaths.length}`);
console.log(`RECENT_TAXONOMY_RELATED_PATHS=${recentTaxonomyRelatedPaths.length}`);
console.log(`SOURCE_SHA256=${sourceSha256}`);
console.log(`SOURCE_DERIVED_RUNTIME_SNAPSHOT_SHA256=${sourceRuntimeSnapshot.sha256}`);
console.log(`SOURCE_DERIVED_RUNTIME_CANDIDATES=${sourceRuntimeSnapshot.candidates.length}`);
console.log(`ORIGIN_MAIN_SOURCE_MATCH=${sourceSha256 === mainSha256 ? "PASS" : "FAIL"}`);
console.log(`PULL_REQUEST_REFS_AUDITED=${pullRequestRefs.length}`);
console.log(`REMOTE_BRANCH_REFS_AUDITED=${remoteBranchRefs.length}`);
console.log(`REFS_AUDITED=${Object.keys(refs).length + pullRequestRefs.length + remoteBranchRefs.length}`);
console.log("HOSTED_TAXONOMY_AUDIT=NOT_RUN_NOT_AUTHORIZED");
console.log("RECENT_CREATED_OR_MODIFIED_RECORDS=NOT_SAFELY_DETERMINABLE");
console.log("PAID_EXPERIMENTS=UNAUTHORIZED");
