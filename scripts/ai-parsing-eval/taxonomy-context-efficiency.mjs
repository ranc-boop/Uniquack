import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { loadAuthoritativeTaxonomyGoldenPayload } from "./lib/taxonomy-golden-fixture.mjs";
import { loadAuthoritativeTaxonomySourceInventory } from "./lib/taxonomy-source-inventory.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const require = createRequire(import.meta.url);
const jiti = require("jiti")(import.meta.url, {
  alias: { "@": resolve(root, "src") },
  cache: false,
});
const {
  buildRuntimeTaxonomyCandidateSubset,
  buildRuntimeTaxonomySnapshot,
  serializeRuntimeTaxonomyCandidates,
} = jiti("../../src/lib/tags/runtime-taxonomy-snapshot.ts");

function byteLength(value) {
  return Buffer.byteLength(value, "utf8");
}

function ratio(numerator, denominator) {
  return denominator === 0 ? 1 : numerator / denominator;
}

function aggregate(values) {
  const sorted = values.slice().sort((left, right) => left - right);
  return {
    average: values.reduce((total, value) => total + value, 0) / values.length,
    maximum: sorted.at(-1),
    median: sorted[Math.floor(sorted.length / 2)],
    minimum: sorted[0],
  };
}

const [inventory, golden] = await Promise.all([
  loadAuthoritativeTaxonomySourceInventory(root),
  loadAuthoritativeTaxonomyGoldenPayload(root),
]);
const snapshot = buildRuntimeTaxonomySnapshot({
  ...inventory.catalog,
  edges: inventory.edges,
});
assert.equal(snapshot.valid, true, "authoritative taxonomy snapshot is invalid");

const fullCandidateSubset = buildRuntimeTaxonomyCandidateSubset(snapshot.candidates);
const fullCandidatePrompt = serializeRuntimeTaxonomyCandidates(snapshot.candidates);
const noAliasPrompt = serializeRuntimeTaxonomyCandidates(
  snapshot.candidates.map((candidate) => ({ ...candidate, aliases: [] })),
);
const candidatesById = new Map(
  snapshot.candidates.map((candidate) => [candidate.tagId, candidate]),
);
const catalogById = new Map(golden.catalog.map((entry) => [entry.tagId, entry]));

let expectedCount = 0;
let retrievedCount = 0;
let seedExpected = 0;
let seedRetrieved = 0;
let expansionExpected = 0;
let expansionRetrieved = 0;
let broadParentCandidatesFiltered = 0;
const controlledCounts = [];
const controlledBytes = [];

for (const entry of golden.cases) {
  const pool = new Set(entry.candidatePool);
  const eligibleCandidates = entry.candidatePool.flatMap((tagId) => {
    const candidate = candidatesById.get(tagId);
    if (candidate) return [candidate];
    if (golden.broadParents[tagId]?.length || catalogById.has(tagId)) {
      broadParentCandidatesFiltered += 1;
    }
    return [];
  });
  const subset = buildRuntimeTaxonomyCandidateSubset(eligibleCandidates);
  controlledCounts.push(subset.candidates.length);
  controlledBytes.push(byteLength(subset.canonicalJson));

  for (const tagId of entry.goldExpectedIds) {
    expectedCount += 1;
    const retrieved = pool.has(tagId);
    if (retrieved) retrievedCount += 1;
    const provenance = catalogById.get(tagId)?.provenance;
    if (provenance === "seed_only") {
      seedExpected += 1;
      if (retrieved) seedRetrieved += 1;
    }
    if (provenance === "migration_0056") {
      expansionExpected += 1;
      if (retrieved) expansionRetrieved += 1;
    }
  }
}

const metrics = {
  authoritativeCatalog: {
    aliases: snapshot.counts.aliases,
    bytes: byteLength(snapshot.canonicalJson),
    edges: snapshot.counts.allEdges,
    effectiveLeaves: snapshot.counts.effectiveAssignableLeaves,
    nodes: snapshot.counts.activeNodes,
    sha256: snapshot.sha256,
  },
  coarseToFine: {
    status: "NOT_ACTIVATED_IN_RUNTIME",
    reason: "No source-neutral coarse-to-fine retriever has independent live recall evidence.",
  },
  controlledGoldenCandidatePools: {
    broadParentOrIneligibleEntriesFiltered: broadParentCandidatesFiltered,
    candidateBytes: aggregate(controlledBytes),
    candidateCounts: aggregate(controlledCounts),
    goldCandidateRecall: ratio(retrievedCount, expectedCount),
    pr214ExpansionCandidateRecall: ratio(expansionRetrieved, expansionExpected),
    seedOnlyCandidateRecall: ratio(seedRetrieved, seedExpected),
  },
  productionEffectiveLeafSubset: {
    aliasRepresentationBytes:
      byteLength(fullCandidatePrompt) - byteLength(noAliasPrompt),
    canonicalBytes: byteLength(fullCandidateSubset.canonicalJson),
    candidateCount: fullCandidateSubset.candidates.length,
    promptBytes: byteLength(fullCandidatePrompt),
    retrievalVersion: fullCandidateSubset.version,
    sha256: fullCandidateSubset.sha256,
    subsetToFullCatalogByteRatio: ratio(
      byteLength(fullCandidateSubset.canonicalJson),
      byteLength(snapshot.canonicalJson),
    ),
  },
  providerTokenShare: "NOT_AVAILABLE_UNTIL_MATCHED_PROVIDER_RUN",
};

assert.equal(metrics.controlledGoldenCandidatePools.goldCandidateRecall, 1);
assert.equal(metrics.controlledGoldenCandidatePools.seedOnlyCandidateRecall, 1);
assert.equal(metrics.controlledGoldenCandidatePools.pr214ExpansionCandidateRecall, 1);
assert.equal(
  metrics.productionEffectiveLeafSubset.candidateCount,
  snapshot.counts.effectiveAssignableLeaves,
);
assert.equal(
  snapshot.candidates.some((candidate) =>
    snapshot.canonicalNodes.find((node) => node.tagId === candidate.tagId)
      ?.activeChildTagIds.length > 0),
  false,
  "broad parent entered the production candidate subset",
);

console.log("AI_PARSING_TAXONOMY_CONTEXT_EFFICIENCY=PASS");
console.log(`METRICS=${JSON.stringify(metrics)}`);
