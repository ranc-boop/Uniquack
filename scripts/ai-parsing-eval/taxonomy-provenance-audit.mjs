import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  loadAuthoritativeTaxonomySourceInventory,
  provenanceCounts,
  TAXONOMY_EXPANSION_PATH,
  TAXONOMY_SEED_PATH,
} from "./lib/taxonomy-source-inventory.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const authoritativePr = 214;
const decisiveCommit = "bfb789c58780a885a9bcf6fba54e96741fe710f9";
const historicalIncompleteHash =
  "e557cdb3519f29601b74bc6551a207d19b3ba81ab439029e526fecad9d20211e";
const historicalExpectation = {
  activeNodes: 439,
  aliases: 20,
  allEdges: 460,
  declaredAssignable: 372,
  effectiveLeaves: 372,
  facets: 5,
};
const require = createRequire(import.meta.url);
const jiti = require("jiti")(import.meta.url, {
  alias: { "@": resolve(root, "src") },
  cache: false,
});
const { buildRuntimeTaxonomySnapshot } = jiti(
  "../../src/lib/tags/runtime-taxonomy-snapshot.ts",
);

function git(args, encoding = "utf8") {
  return execFileSync("git", args, {
    cwd: root,
    encoding,
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function gitBytes(revision, path) {
  return execFileSync("git", ["show", `${revision}:${path}`], {
    cwd: root,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function commitContainsPath(commit, path) {
  return git(["diff-tree", "--no-commit-id", "--name-only", "-r", commit])
    .split(/\r?\n/)
    .includes(path);
}

function canonicalProvenance(provenance) {
  return Object.fromEntries(
    Object.entries(provenance).map(([kind, entries]) => [
      kind,
      [...entries.entries()].sort(([left], [right]) => left.localeCompare(right)),
    ]),
  );
}

const inventory = await loadAuthoritativeTaxonomySourceInventory(root);
const snapshot = buildRuntimeTaxonomySnapshot({
  ...inventory.catalog,
  edges: inventory.edges,
});
assert.equal(snapshot.valid, true, JSON.stringify(snapshot.diagnostics));

const sourceCounts = {
  activeNodes: inventory.rows.nodes.length,
  aliases: inventory.rows.aliases.length,
  allEdges: inventory.rows.edges.length,
  declaredAssignable: inventory.rows.nodes.filter(
    (node) => node.is_assignable === true,
  ).length,
  effectiveLeaves: snapshot.counts.effectiveAssignableLeaves,
  facets: inventory.rows.facets.length,
  hierarchyEdges: snapshot.counts.hierarchyEdges,
  perFacet: snapshot.perFacet,
};
assert.deepEqual(
  {
    activeNodes: sourceCounts.activeNodes,
    aliases: sourceCounts.aliases,
    allEdges: sourceCounts.allEdges,
    declaredAssignable: sourceCounts.declaredAssignable,
    effectiveLeaves: sourceCounts.effectiveLeaves,
    facets: sourceCounts.facets,
  },
  historicalExpectation,
  "replayed source catalog differs from the independently recorded PR #214 expectation",
);

const sourceContribution = provenanceCounts(inventory.provenance);
assert.equal(sourceContribution.nodes.seed_only, 9);
assert.equal(sourceContribution.nodes.seed_preserved_0056_compatible, 9);
assert.equal(sourceContribution.nodes.migration_0056, 421);
assert.equal(sourceContribution.edges.seed_only, 11);
assert.equal(sourceContribution.edges.seed_preserved_0056_compatible, 8);
assert.equal(sourceContribution.edges.migration_0056, 441);
assert.equal(sourceContribution.aliases.seed_only, 4);
assert.equal(sourceContribution.aliases.migration_0056, 16);

const resolvedDecisiveCommit = git(["rev-parse", `${decisiveCommit}^{commit}`]);
assert.equal(resolvedDecisiveCommit, decisiveCommit);
assert.equal(
  git(["merge-base", "--is-ancestor", decisiveCommit, "HEAD"]) === "",
  true,
  "PR #214 decisive commit is not in the current branch history",
);
assert.equal(commitContainsPath(decisiveCommit, TAXONOMY_EXPANSION_PATH), true);
assert.ok(gitBytes(decisiveCommit, TAXONOMY_EXPANSION_PATH).byteLength > 0);
assert.ok(gitBytes("HEAD", TAXONOMY_SEED_PATH).byteLength > 0);

const migrationHeadSha = sha256(gitBytes("HEAD", TAXONOMY_EXPANSION_PATH));
const migrationMainSha = sha256(gitBytes("origin/main", TAXONOMY_EXPANSION_PATH));
const seedHeadSha = sha256(gitBytes("HEAD", TAXONOMY_SEED_PATH));
const sourceReconciliationSha = sha256(Buffer.from(JSON.stringify({
  migrationSourceSha256: migrationHeadSha,
  provenance: canonicalProvenance(inventory.provenance),
  runtimeSnapshotSha256: snapshot.sha256,
  seedSourceSha256: seedHeadSha,
}), "utf8"));
assert.equal(migrationHeadSha, migrationMainSha);
assert.notEqual(
  snapshot.sha256,
  historicalIncompleteHash,
  "the complete catalog must not retain the 0056-only snapshot hash",
);

console.log("TAXONOMY_PROVENANCE_AUDIT=PASS");
console.log("VERDICT=AUTHORITATIVE_RECENT_TAXONOMY_SOURCE_RECONCILED");
console.log(`AUTHORITATIVE_PR=${authoritativePr}`);
console.log(`DECISIVE_COMMIT=${decisiveCommit}`);
console.log(`SOURCE_FULL_COUNTS=${JSON.stringify(sourceCounts)}`);
console.log(`SOURCE_PROVENANCE_COUNTS=${JSON.stringify(sourceContribution)}`);
console.log(`SOURCE_FULL_SNAPSHOT_SHA256=${snapshot.sha256}`);
console.log(`SOURCE_RECONCILIATION_SHA256=${sourceReconciliationSha}`);
console.log(`SOURCE_FULL_CANDIDATES=${snapshot.candidates.length}`);
console.log(`MIGRATION_SOURCE_SHA256=${migrationHeadSha}`);
console.log(`SEED_SOURCE_SHA256=${seedHeadSha}`);
console.log("ORIGIN_MAIN_MIGRATION_SOURCE_MATCH=PASS");
console.log(
  `PREVIOUS_INCOMPLETE_HASH=${historicalIncompleteHash};DISPOSITION=STATIC_0056_PAYLOAD_ONLY_NONAUTHORITATIVE`,
);
console.log("HOSTED_TAXONOMY_AUDIT=NOT_RUN_PREPAID_GATE");
console.log("PAID_EXPERIMENTS=INACTIVE_UNTIL_HOSTED_PARITY");
