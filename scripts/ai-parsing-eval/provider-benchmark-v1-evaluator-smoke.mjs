import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  aggregateProviderBenchmarkEvaluations,
  evaluateProviderBenchmarkSource,
} from "./lib/provider-benchmark-v1-evaluator.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const contract = JSON.parse(await readFile(resolve(
  root,
  "fixtures",
  "ai-parsing-provider-benchmark-v1",
  "evaluation-contract.json",
), "utf8"));
const taxonomyIds = [
  "math.concept.algebra.equations.linear_equations",
  "math.task.rewrite.solve_for_variable",
  "math.form.symbolic.equation",
];
const activeTagFacets = taxonomyIds.map((id) => ({
  facetKey: id.split(".")[1],
  id,
}));

function question({
  answer,
  number,
  pages,
  prompt,
  tags = [],
  placeholders = [],
  visualRequired = false,
}) {
  const optionAnswer = /^[A-D]$/.test(answer) ? [answer] : [];
  return {
    answer_spec: {
      accepted_answers: optionAnswer.length ? [] : [answer],
      correct_option_ids: optionAnswer,
    },
    asset_placeholders: placeholders,
    content_html: `<p>${prompt}</p>`,
    content_source: prompt,
    page_refs: pages,
    question_number: number,
    solution_html: `<p>${answer}</p>`,
    solution_source: answer,
    tag_ids: tags,
    title: prompt,
    visual_evidence_required: visualRequired,
  };
}

const perfectExtractions = {
  "text-free-response": {
    questions: [question({
      answer: "6 counters because 2 + 4 = 6",
      number: "1",
      pages: [1],
      prompt: "How many counters are in the box?",
    })],
  },
  "answer-key": {
    questions: [
      question({ answer: "B; x = 4", number: "1", pages: [1, 4], prompt: "Solve 3x + 2 = 14" }),
      question({ answer: "D; y = 8", number: "2", pages: [2, 4], prompt: "If y = 2x + 2 and x = 3" }),
    ],
  },
  equation: {
    questions: [
      question({ answer: "2x", number: "1", pages: [1], prompt: "Differentiate x^2" }),
      question({ answer: "ln |x| + C", number: "2", pages: [1], prompt: "Find the integral of 1/x" }),
    ],
  },
  "visual-evidence": {
    questions: [
      question({
        answer: "B; slope = 2",
        number: "1",
        pages: [1],
        prompt: "Find the slope on the coordinate graph",
        visualRequired: true,
        placeholders: [{
          alt: "coordinate graph of a line",
          bbox: { x: 0.245098, y: 0.337121, width: 0.490196, height: 0.391414 },
          page: 1,
          required: true,
          visual_role: "graph",
        }],
      }),
      question({ answer: "C; 3x^2", number: "2", pages: [2], prompt: "Find the derivative of x^3" }),
      question({
        answer: "D; insufficient evidence",
        number: "3",
        pages: [3],
        prompt: "Use the missing diagram to find the shaded area",
        visualRequired: true,
      }),
      question({
        answer: "rate = 2",
        number: "4(a)",
        pages: [4],
        prompt: "Use the table to find the constant rate for part a",
        visualRequired: true,
        placeholders: [{
          alt: "data table",
          bbox: { x: 0.212418, y: 0.375, width: 0.575163, height: 0.315657 },
          page: 4,
          required: true,
          shared_group_key: "shared-q4",
          visual_role: "table",
        }],
      }),
      question({
        answer: "f(4) = 9",
        number: "4(b)",
        pages: [4],
        prompt: "Use the table to find f(4) for part b",
        visualRequired: true,
        placeholders: [{
          alt: "data table",
          bbox: { x: 0.212418, y: 0.375, width: 0.575163, height: 0.315657 },
          page: 4,
          required: true,
          shared_group_key: "shared-q4",
          visual_role: "table",
        }],
      }),
    ],
  },
  "taxonomy-ambiguous": {
    questions: [question({
      answer: "x = 5",
      number: "1",
      pages: [1],
      prompt: "Solve x + 7 = 12 using an inverse operation",
      tags: taxonomyIds,
    })],
  },
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function evaluateAll(extractions = perfectExtractions) {
  return Object.keys(contract.sources).map((sourceId) =>
    evaluateProviderBenchmarkSource({
      activeTagFacets,
      activeTagIds: taxonomyIds,
      contract,
      extraction: extractions[sourceId] ?? null,
      providerOutcome:
        sourceId === "insufficient-evidence"
          ? "model_quality_rejection"
          : "success",
      sourceId,
    }),
  );
}

const perfect = aggregateProviderBenchmarkEvaluations(evaluateAll());
assert.equal(perfect.parsing.questionBoundary.f1, 1);
assert.equal(perfect.parsing.pageReferences.f1, 1);
assert.equal(perfect.parsing.schemaValidityRate, 1);
assert.equal(perfect.parsing.applicationValidityRate, 1);
assert.equal(perfect.parsing.sourceGroundingAccuracy, 1);
assert.equal(perfect.parsing.insufficientEvidenceAccuracy, 1);
assert.equal(perfect.parsing.validReviewDraftYield, 0.909091);
assert.equal(perfect.answer.answerCorrectness, 1);
assert.equal(perfect.answer.sourceAnswerKeyAccuracy, 1);
assert.equal(perfect.answer.modelDerivedAnswerCorrectness, null);
assert.equal(perfect.taxonomy.exactId.f1, 1);
assert.equal(perfect.taxonomy.abstentionAccuracy, 1);
assert.equal(perfect.taxonomy.candidateRetrievalRecall, 1);
assert.equal(perfect.taxonomy.facetMetrics.concept.f1, 1);
assert.equal(perfect.visual.requiredAssetAssociationRate, 1);
assert.equal(perfect.visual.decorativeSuppressionRate, 1);
assert.equal(perfect.visual.missingRequiredVisualRate, 1);
assert.equal(perfect.visual.visualDependentQuestionDetection.f1, 1);
assert.equal(perfect.visual.sharedVisualGroupAccuracy, 1);
assert.equal(perfect.visual.wrongQuestionAttachments, 0);
assert.deepEqual(Object.values(perfect.hardBoundaryEscapes), [0, 0, 0, 0, 0]);

const answerMutation = clone(perfectExtractions);
answerMutation["answer-key"].questions[1].answer_spec.correct_option_ids = ["C"];
answerMutation["answer-key"].questions[1].solution_source = "C; y = 7";
assert(aggregateProviderBenchmarkEvaluations(evaluateAll(answerMutation)).answer.answerCorrectness < 1);

const duplicateMutation = clone(perfectExtractions);
duplicateMutation.equation.questions.push(clone(duplicateMutation.equation.questions[0]));
assert(aggregateProviderBenchmarkEvaluations(evaluateAll(duplicateMutation)).parsing.duplicateCount > 0);

const pageMutation = clone(perfectExtractions);
pageMutation["text-free-response"].questions[0].page_refs = [99];
assert(aggregateProviderBenchmarkEvaluations(evaluateAll(pageMutation)).parsing.fabricatedPageRefs > 0);

const taxonomyMutation = clone(perfectExtractions);
taxonomyMutation["taxonomy-ambiguous"].questions[0].tag_ids.push("math.unknown.invented");
const taxonomyResult = aggregateProviderBenchmarkEvaluations(evaluateAll(taxonomyMutation));
assert.equal(taxonomyResult.taxonomy.unknownIdCount, 1);
assert.equal(taxonomyResult.taxonomy.invalidIdsRejected, 1);

const visualMutation = clone(perfectExtractions);
visualMutation["visual-evidence"].questions[1].asset_placeholders = [{
  alt: "unrelated graph",
  bbox: { x: 0.1, y: 0.1, width: 0.2, height: 0.2 },
  page: 2,
  required: true,
  visual_role: "graph",
}];
const visualResult = aggregateProviderBenchmarkEvaluations(evaluateAll(visualMutation));
assert(visualResult.visual.decorativeSuppressionRate < 1);
assert(visualResult.visual.wrongQuestionAttachments > 0);

console.log("AI_PARSING_PROVIDER_BENCHMARK_V1_EVALUATOR=PASS");
console.log("SOURCE_EXACT_ANSWER_TAXONOMY_VISUAL_MUTATIONS=PASS");
console.log("PROVIDER_CALLS=0");
