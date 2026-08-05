import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { evaluateGoldenCorpus } from "./lib/golden-evaluator.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

async function load(name) {
  return JSON.parse(await readFile(
    resolve(root, "fixtures", "ai-parsing-golden", name),
    "utf8",
  ));
}

const [manifest, parsing, taxonomy, visual] = await Promise.all([
  load("manifest.json"),
  load("parsing-cases.json"),
  load("taxonomy-cases.json"),
  load("visual-cases.json"),
]);
const result = evaluateGoldenCorpus({ parsing, taxonomy, visual });

assert.equal(manifest.version, 1);
assert.deepEqual(manifest.taxonomyContract.facets, [
  "curriculum",
  "concept",
  "method",
  "task",
  "form",
]);
assert.equal(result.classification, "PASS", JSON.stringify(result, null, 2));

console.log("AI_PARSING_GOLDEN_CORPUS=PASS");
console.log(`PARSING_CASES=${parsing.length}`);
console.log(`TAXONOMY_CASES=${taxonomy.cases.length}`);
console.log(`VISUAL_CASES=${visual.length}`);
console.log("HARD_ZERO_FAILURES=0");
