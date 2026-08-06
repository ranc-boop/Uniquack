import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { evaluateGoldenCorpus } from "./lib/golden-evaluator.mjs";
import { loadAuthoritativeTaxonomyGoldenPayload } from "./lib/taxonomy-golden-fixture.mjs";
import { buildQuestionAssetAuthorizationEvidence } from "./question-asset-authorization-evidence.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

async function load(name) {
  return JSON.parse(await readFile(
    resolve(root, "fixtures", "ai-parsing-golden", name),
    "utf8",
  ));
}

const [manifest, parsing, runStateFixture, taxonomy, visual] = await Promise.all([
  load("manifest.json"),
  load("parsing-cases.json"),
  load("run-state-cases.json"),
  loadAuthoritativeTaxonomyGoldenPayload(root),
  load("visual-cases.json"),
]);
const runState = {
  ...runStateFixture,
  assetAuthorizationResults: await buildQuestionAssetAuthorizationEvidence(
    runStateFixture.assetAuthorizationScenarios,
  ),
};
const result = evaluateGoldenCorpus({ parsing, runState, taxonomy, visual });

assert.equal(manifest.version, 3);
assert.equal(manifest.evidenceClass, "SYNTHETIC_EVALUATOR_SANITY_BASELINE_ONLY");
assert.deepEqual(manifest.taxonomyContract.facets, [
  "curriculum",
  "concept",
  "method",
  "task",
  "form",
]);
assert.equal(result.classification, "PASS", JSON.stringify(result, null, 2));
assert.equal(result.evidenceClass, "SYNTHETIC_EVALUATOR_SANITY_BASELINE_ONLY");
assert.equal(result.taxonomy.candidateRetrievalRecall, 1);
assert.equal(result.taxonomy.exactIdClassification.f1, 1);
assert.equal(result.taxonomy.aliasResolution.value, 1);
assert.equal(result.taxonomy.seedOnlyCoverage.candidateRecall, 1);
assert.equal(result.taxonomy.seedOnlyCoverage.exactIdClassification.f1, 1);
assert.equal(result.taxonomy.pr214ExpansionCoverage.candidateRecall, 1);
assert.equal(result.taxonomy.pr214ExpansionCoverage.exactIdClassification.f1, 1);
assert.equal(result.taxonomy.abstentionAccuracy.value, 1);
assert.equal(result.taxonomy.wrongFacet.violations, 0);
assert.equal(result.taxonomy.inactiveUnknownIdRejection.value, 1);
assert.equal(result.runState.crossOrganizationVisibility, 0);
assert.equal(result.runState.autoApprovedOrPublished, 0);
assert.equal(result.runState.assignmentsCreated, 0);
assert(result.runState.authorizationEvidenceCount >= 2);

console.log("AI_PARSING_GOLDEN_CORPUS=PASS");
console.log(`EVIDENCE_CLASS=${result.evidenceClass}`);
console.log(`PARSING_CASES=${parsing.length}`);
console.log(`TAXONOMY_CASES=${taxonomy.cases.length}`);
console.log(`LEGACY_SANITY_CASES=${taxonomy.cases.filter((entry) => entry.categories.includes("legacy_sanity")).length}`);
console.log(`ALIAS_RESOLUTION=${result.taxonomy.aliasResolution.correct}/${result.taxonomy.aliasResolution.total}`);
console.log(`SEED_ONLY_UNIQUE_EXPECTED_IDS=${result.taxonomy.seedOnlyCoverage.uniqueExpectedIds}`);
console.log(`PR214_EXPANSION_UNIQUE_EXPECTED_IDS=${result.taxonomy.pr214ExpansionCoverage.uniqueExpectedIds}`);
console.log(`VISUAL_CASES=${visual.length}`);
console.log("HARD_ZERO_FAILURES=0");
console.log("CROSS_ORG_ASSET_ROUTE_RUNTIME_NEGATIVE=PASS");
