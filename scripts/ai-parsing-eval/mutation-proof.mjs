import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { evaluateGoldenCorpus } from "./lib/golden-evaluator.mjs";
import { buildQuestionAssetAuthorizationEvidence } from "./question-asset-authorization-evidence.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

async function load(name) {
  return JSON.parse(await readFile(
    resolve(root, "fixtures", "ai-parsing-golden", name),
    "utf8",
  ));
}

const original = {
  parsing: await load("parsing-cases.json"),
  runState: await load("run-state-cases.json"),
  taxonomy: await load("taxonomy-cases.json"),
  visual: await load("visual-cases.json"),
};
original.runState.assetAuthorizationResults =
  await buildQuestionAssetAuthorizationEvidence(
    original.runState.assetAuthorizationScenarios,
  );

function clone() {
  return structuredClone(original);
}

const mutations = [
  ["duplicate_question", (value) => value.parsing[0].candidate.questionIds.push("q1")],
  ["fabricated_page_reference", (value) => value.parsing[0].candidate.pageRefs.q1 = [99]],
  ["inconsistent_answer", (value) => value.parsing[0].candidate.answers.q1 = "7"],
  ["unvalidated_answer", (value) => value.parsing[0].candidate.answers.injected = "unsafe"],
  ["invalid_taxonomy_id", (value) => value.taxonomy.cases[0].prediction.push("math.unknown.invented")],
  ["broad_parent_substitution", (value) => {
    const prediction = value.taxonomy.cases[0].prediction;
    prediction.splice(prediction.indexOf("math.concept.calculus.derivatives.chain_rule"), 1, "math.concept.calculus.derivatives");
  }],
  ["wrong_facet_substitution", (value) => value.taxonomy.cases.find((entry) => entry.id === "data-table-form-only").prediction.push("math.concept.functions.linear.slope")],
  ["missing_required_visual", (value) => value.visual.find((entry) => entry.id === "missing-required-figure").candidate.approvalBlocked = false],
  ["wrong_question_asset_attachment", (value) => value.visual[0].candidate.visuals[0].questionId = "q2"],
  ["invalid_crop_coordinates", (value) => value.visual[0].candidate.visuals[0].bbox = [0.8, 0.2, 0.4, 0.4]],
  ["cross_organization_asset_request", (value) => value.runState.assetAuthorizationResults.find((entry) => entry.caseId === "cross_org_asset_denied").allowed = true],
  ["attempted_publication_side_effect", (value) => value.runState.publications.push({ caseId: "unexpected_publication" })],
  ["attempted_assignment_side_effect", (value) => value.runState.assignments.push({ caseId: "unexpected_assignment" })],
  ["auto_approved_review_draft", (value) => value.runState.reviewDrafts[0].status = "approved"],
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
reordered.runState.assetAuthorizationResults.reverse();
assert.equal(evaluateGoldenCorpus(reordered).classification, "PASS");

console.log(`AI_PARSING_MUTATION_PROOFS=PASS;COUNT=${mutations.length}`);
console.log("ORDER_INVARIANCE=PASS");
