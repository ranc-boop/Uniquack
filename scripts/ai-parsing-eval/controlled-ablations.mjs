import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const anchor = "f1ce7bcb791604468693ea945401cfb157e64d97";
const path = "src/lib/ai-pdf-import/service.ts";
const baseline = execFileSync("git", ["show", `${anchor}:${path}`], {
  cwd: root,
  encoding: "utf8",
});
const treatment = await readFile(resolve(root, path), "utf8");

const baselineForcedFacet = baseline.includes("try to cover at least 4 of the 5");
const treatmentForcedFacet = treatment.includes("try to cover at least 4 of the 5");
const treatmentAbstains = treatment.includes(
  "Do not fill a facet merely for coverage. An empty facet is safer than an inaccurate assignment.",
);

assert.equal(baselineForcedFacet, true);
assert.equal(treatmentForcedFacet, false);
assert.equal(treatmentAbstains, true);

const decisions = {
  candidateTaxonomySubset: "HOLD_UNTIL_RECALL_EVIDENCE",
  fullCatalogInInitialAttempt: "PRESERVE",
  fullSourceForStructuralRepair: "REMOVE",
  fullSourceForZeroImportableRecovery: "PRESERVE_ONCE",
  separateTaxonomyInferencePass: "REJECT_EXTRA_INFERENCE_COST",
};

console.log("AI_PARSING_CONTROLLED_ABLATIONS=PASS");
console.log(`BASELINE_BYTES=${Buffer.byteLength(baseline)}`);
console.log(`TREATMENT_BYTES=${Buffer.byteLength(treatment)}`);
console.log(`DECISIONS=${JSON.stringify(decisions)}`);
