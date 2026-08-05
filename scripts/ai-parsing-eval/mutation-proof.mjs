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

const original = {
  parsing: await load("parsing-cases.json"),
  taxonomy: await load("taxonomy-cases.json"),
  visual: await load("visual-cases.json"),
};

function clone() {
  return structuredClone(original);
}

const mutations = [
  ["duplicate_question", (value) => value.parsing[0].candidate.questionIds.push("q1")],
  ["fabricated_page", (value) => value.parsing[0].candidate.pageRefs.q1 = [99]],
  ["wrong_answer", (value) => value.parsing[0].candidate.answers.q1 = "7"],
  ["unvalidated_answer", (value) => value.parsing[0].candidate.answers.injected = "unsafe"],
  ["unknown_taxonomy", (value) => value.taxonomy.cases[0].candidate.push("math.concept.invented")],
  ["broad_parent", (value) => value.taxonomy.cases[0].candidate.push("math.concept.calculus.derivatives")],
  ["missing_visual_unblocked", (value) => value.visual.find((entry) => entry.id === "missing-required-figure").candidate.approvalBlocked = false],
  ["wrong_visual_association", (value) => value.visual[0].candidate.visuals[0].questionId = "q2"],
  ["invalid_bbox", (value) => value.visual[0].candidate.visuals[0].bbox = [0.8, 0.2, 0.4, 0.4]],
  ["decorative_visual_attached", (value) => value.visual.find((entry) => entry.id === "decorative-image-ignored").candidate.visuals.push({
    bbox: [0.05, 0.05, 0.2, 0.1],
    key: "logo",
    page: 1,
    questionId: "q1",
    required: false,
    role: "decorative",
  })],
];

for (const [name, mutate] of mutations) {
  const value = clone();
  mutate(value);
  const result = evaluateGoldenCorpus(value);
  assert.equal(result.classification, "FAIL", `${name} mutation escaped evaluation`);
}

const reordered = clone();
reordered.parsing.reverse();
reordered.taxonomy.cases.reverse();
reordered.visual.reverse();
assert.equal(evaluateGoldenCorpus(reordered).classification, "PASS");

console.log(`AI_PARSING_MUTATION_PROOFS=PASS;COUNT=${mutations.length}`);
console.log("ORDER_INVARIANCE=PASS");
