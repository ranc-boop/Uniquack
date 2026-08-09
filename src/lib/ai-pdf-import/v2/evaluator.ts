import { z } from "zod";

import {
  canonicalAnswerProposalV2Schema,
  documentExtractionV2Schema,
  generationRelevantFeatureKeysV2,
  qualityDispositionStatusV2Schema,
  questionBoundaryKindV2Schema,
  sourceEvidenceRoleV2Schema,
  sourcePrecisionV2Schema,
  sourceSufficiencyV2Schema,
  taxonomyFacetV2Schema,
  type CanonicalAnswerProposalV2,
  type DocumentExtractionV2,
} from "./contracts";
import { sha256CanonicalJsonV2 } from "./fingerprint";

export const AI_PARSING_V2_EVALUATOR_VERSION =
  "ai_parsing_v2_evaluator_v1" as const;

const evaluationGoldQuestionV2Schema = z
  .object({
    answer: canonicalAnswerProposalV2Schema,
    boundaryKind: questionBoundaryKindV2Schema,
    expectedDisposition: qualityDispositionStatusV2Schema.default("review_ready"),
    generationObservations: z.array(z.string().trim().min(1).max(600)).default([]),
    id: z.string().trim().min(1).max(128),
    parentQuestionId: z.string().trim().min(1).max(128).nullable().default(null),
    missingRequiredVisualExpected: z.boolean().default(false),
    sourceReferences: z
      .array(
        z
          .object({
            id: z.string().trim().min(1).max(128),
            pageEnd: z.number().int().positive().nullable(),
            pageStart: z.number().int().positive().nullable(),
            precision: sourcePrecisionV2Schema,
            questionIds: z.array(z.string().trim().min(1).max(128)).default([]),
            role: sourceEvidenceRoleV2Schema,
            sourceAssetRef: z.string().trim().min(1).max(128),
          })
          .strict(),
      )
      .default([]),
    sourceSpanIds: z.array(z.string().trim().min(1).max(128)).default([]),
    taxonomyDecisions: z
      .array(
        z
          .object({
            decision: z.enum(["assign", "abstain"]),
            facet: taxonomyFacetV2Schema,
            tagId: z.string().trim().min(1).max(128).nullable().default(null),
          })
          .strict(),
      )
      .length(5),
    visualObjectIds: z.array(z.string().trim().min(1).max(128)).default([]),
    visualDependencyExpected: z.boolean().default(false),
    visualFacts: z
      .array(
        z
          .object({
            factType: z.string().trim().min(1).max(100),
            statement: z.string().trim().min(1).max(500),
            visualObjectId: z.string().trim().min(1).max(128),
          })
          .strict(),
      )
      .default([]),
  })
  .strict();

export const evaluationGoldV2Schema = z
  .object({
    allowedBankScopeKey: z.string().trim().min(1).max(128),
    allowedSourceAssetRef: z.string().trim().min(1).max(128),
    allowedTaxonomyTagIds: z.array(z.string().trim().min(1).max(128)),
    questions: z.array(evaluationGoldQuestionV2Schema).max(200),
    sufficiency: sourceSufficiencyV2Schema,
    version: z.literal("ai_parsing_v2_evaluation_gold_v1"),
  })
  .strict();
export type EvaluationGoldV2 = z.infer<typeof evaluationGoldV2Schema>;

export type PrecisionRecallF1V2 = {
  f1: number;
  falseNegative: number;
  falsePositive: number;
  precision: number;
  recall: number;
  truePositive: number;
};

function boundedRatio(numerator: number, denominator: number) {
  return denominator === 0 ? 1 : numerator / denominator;
}

function setMetric(actualValues: Iterable<string>, expectedValues: Iterable<string>) {
  const actual = new Set(actualValues);
  const expected = new Set(expectedValues);
  let truePositive = 0;
  for (const value of actual) {
    if (expected.has(value)) truePositive += 1;
  }
  const falsePositive = actual.size - truePositive;
  const falseNegative = expected.size - truePositive;
  const precision = boundedRatio(truePositive, truePositive + falsePositive);
  const recall = boundedRatio(truePositive, truePositive + falseNegative);
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);

  return {
    f1,
    falseNegative,
    falsePositive,
    precision,
    recall,
    truePositive,
  } satisfies PrecisionRecallF1V2;
}

function normalizedAnswerValue(answer: CanonicalAnswerProposalV2): unknown {
  switch (answer.kind) {
    case "multiple_choice":
      return {
        allowMultiple: answer.allowMultiple,
        kind: answer.kind,
        selectedOptionIds: [...answer.selectedOptionIds].sort(),
      };
    case "boolean":
      return { kind: answer.kind, value: answer.value };
    case "numeric":
      return {
        kind: answer.kind,
        tolerance: answer.tolerance,
        unit: answer.unit?.trim().toLocaleLowerCase("en-US") ?? null,
        value: answer.value,
      };
    case "short_text":
      return {
        acceptedTexts: answer.acceptedTexts
          .map((value) =>
            answer.caseSensitive
              ? value.trim()
              : value.trim().toLocaleLowerCase("en-US"),
          )
          .sort(),
        caseSensitive: answer.caseSensitive,
        kind: answer.kind,
      };
    case "free_response":
      return {
        kind: answer.kind,
        rubricPoints: answer.rubricPoints
          .map((value) => value.trim().toLocaleLowerCase("en-US"))
          .sort(),
      };
    case "multipart":
      return {
        kind: answer.kind,
        parts: answer.parts
          .map((part) => ({
            answer: normalizedAnswerValue(part.answer),
            questionId: part.questionId,
          }))
          .sort((left, right) => left.questionId.localeCompare(right.questionId)),
      };
  }
}

export function answerValueFingerprintV2(answer: CanonicalAnswerProposalV2) {
  return sha256CanonicalJsonV2(normalizedAnswerValue(answer));
}

function forbiddenKeyCount(value: unknown, forbidden: Set<string>): number {
  if (Array.isArray(value)) {
    return value.reduce(
      (total, item) => total + forbiddenKeyCount(item, forbidden),
      0,
    );
  }
  if (!value || typeof value !== "object") return 0;

  let count = 0;
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (forbidden.has(key)) count += 1;
    count += forbiddenKeyCount(item, forbidden);
  }
  return count;
}

export function evaluateDocumentExtractionV2({
  extraction: rawExtraction,
  gold: rawGold,
}: {
  extraction: DocumentExtractionV2;
  gold: EvaluationGoldV2;
}) {
  const extraction = documentExtractionV2Schema.parse(rawExtraction);
  const gold = evaluationGoldV2Schema.parse(rawGold);
  const packagesById = new Map(
    extraction.questionPackages.map((item) => [item.question.id, item]),
  );
  const goldById = new Map(gold.questions.map((item) => [item.id, item]));

  const questionDetection = setMetric(
    extraction.questionPackages.map((item) => item.question.id),
    gold.questions.map((item) => item.id),
  );
  const boundaries = setMetric(
    extraction.questionPackages.map(
      (item) =>
        `${item.question.id}:${item.question.boundaryKind}:${item.question.parentQuestionId ?? "root"}`,
    ),
    gold.questions.map(
      (item) =>
        `${item.id}:${item.boundaryKind}:${item.parentQuestionId ?? "root"}`,
    ),
  );
  const sourceLineage = setMetric(
    extraction.questionPackages.flatMap((item) =>
      item.sourceSpans.map((span) => `${item.question.id}:${span.id}`),
    ),
    gold.questions.flatMap((item) =>
      item.sourceSpanIds.map((spanId) => `${item.id}:${spanId}`),
    ),
  );
  const sourceReferences = setMetric(
    extraction.questionPackages.flatMap((item) =>
      item.sourceSpans.map(
        (span) =>
          `${item.question.id}:${span.id}:${span.sourceAssetRef}:${span.role}:${span.precision}:${span.pageStart ?? "unknown"}:${span.pageEnd ?? "unknown"}:${[...span.questionIds].sort().join(",")}`,
      ),
    ),
    gold.questions.flatMap((item) =>
      item.sourceReferences.map(
        (span) =>
          `${item.id}:${span.id}:${span.sourceAssetRef}:${span.role}:${span.precision}:${span.pageStart ?? "unknown"}:${span.pageEnd ?? "unknown"}:${[...span.questionIds].sort().join(",")}`,
      ),
    ),
  );
  const visualAssociations = setMetric(
    extraction.questionPackages.flatMap((item) =>
      item.visualObjects.map((visual) => `${item.question.id}:${visual.id}`),
    ),
    gold.questions.flatMap((item) =>
      item.visualObjectIds.map((visualId) => `${item.id}:${visualId}`),
    ),
  );
  const taxonomyExactIds = setMetric(
    extraction.questionPackages.flatMap((item) =>
      item.taxonomyDecisions
        .filter((decision) => decision.decision === "assign" && decision.tagId)
        .map((decision) => `${item.question.id}:${decision.facet}:${decision.tagId}`),
    ),
    gold.questions.flatMap((item) =>
      item.taxonomyDecisions
        .filter((decision) => decision.decision === "assign" && decision.tagId)
        .map((decision) => `${item.id}:${decision.facet}:${decision.tagId}`),
    ),
  );
  const generationEvidence = setMetric(
    extraction.questionPackages.flatMap((item) =>
      generationRelevantFeatureKeysV2.flatMap((key) =>
        item.generationRelevantFeatures[key].map(
          (observation) => `${item.question.id}:${key}:${observation.value}`,
        ),
      ),
    ),
    gold.questions.flatMap((item) =>
      item.generationObservations.map((value) => `${item.id}:${value}`),
    ),
  );
  const visualFactCorrectness = setMetric(
    extraction.questionPackages.flatMap((item) =>
      item.visualFacts.map(
        (fact) =>
          `${item.question.id}:${fact.visualObjectId}:${fact.factType}:${fact.statement}`,
      ),
    ),
    gold.questions.flatMap((item) =>
      item.visualFacts.map(
        (fact) =>
          `${item.id}:${fact.visualObjectId}:${fact.factType}:${fact.statement}`,
      ),
    ),
  );
  const visualDependentDetection = setMetric(
    extraction.questionPackages
      .filter((item) => item.visualObjects.some((visual) => visual.required))
      .map((item) => item.question.id),
    gold.questions.filter((item) => item.visualDependencyExpected).map((item) => item.id),
  );
  const expectedQuestionsByVisual = new Map<string, string[]>();
  for (const question of gold.questions) {
    for (const visualId of question.visualObjectIds) {
      expectedQuestionsByVisual.set(visualId, [
        ...(expectedQuestionsByVisual.get(visualId) ?? []),
        question.id,
      ]);
    }
  }
  const sharedVisualHandling = setMetric(
    extraction.visualObjects
      .filter((visual) => visual.questionIds.length > 1)
      .map(
        (visual) =>
          `${visual.id}:${[...visual.questionIds].sort().join(",")}`,
      ),
    Array.from(expectedQuestionsByVisual.entries())
      .filter(([, questionIds]) => questionIds.length > 1)
      .map(
        ([visualId, questionIds]) =>
          `${visualId}:${[...questionIds].sort().join(",")}`,
      ),
  );
  const missingRequiredVisualHandling = setMetric(
    extraction.questionPackages
      .filter(
        (item) =>
          item.disposition.status === "needs_more_evidence" &&
          item.disposition.findingCodes.includes("required_visual_missing"),
      )
      .map((item) => item.question.id),
    gold.questions
      .filter(
        (item) =>
          item.expectedDisposition === "needs_more_evidence" &&
          item.missingRequiredVisualExpected,
      )
      .map((item) => item.id),
  );

  let correctAnswers = 0;
  let answerProvenanceMatches = 0;
  let supportedAnswerProvenance = 0;
  let consistentSolutions = 0;
  let taxonomyAbstentionMatches = 0;
  let taxonomyAbstentionTotal = 0;
  let dispositionMatches = 0;
  for (const expected of gold.questions) {
    const actual = packagesById.get(expected.id);
    if (!actual) continue;
    if (
      answerValueFingerprintV2(actual.answer.proposal) ===
      answerValueFingerprintV2(expected.answer)
    ) {
      correctAnswers += 1;
    }
    if (
      actual.answer.proposal.provenance === expected.answer.provenance &&
      actual.answer.proposal.support === expected.answer.support &&
      [...actual.answer.proposal.sourceSpanIds].sort().join("\u0000") ===
        [...expected.answer.sourceSpanIds].sort().join("\u0000")
    ) {
      answerProvenanceMatches += 1;
    }
    if (
      actual.answer.proposal.support === "source_supported" &&
      actual.answer.proposal.sourceSpanIds.length > 0
    ) {
      supportedAnswerProvenance += 1;
    }
    if (
      actual.solution &&
      !actual.disposition.findingCodes.includes("solution_answer_inconsistent")
    ) {
      consistentSolutions += 1;
    }
    if (actual.disposition.status === expected.expectedDisposition) {
      dispositionMatches += 1;
    }

    for (const expectedDecision of expected.taxonomyDecisions) {
      if (expectedDecision.decision !== "abstain") continue;
      taxonomyAbstentionTotal += 1;
      const actualDecision = actual.taxonomyDecisions.find(
        (decision) => decision.facet === expectedDecision.facet,
      );
      if (actualDecision?.decision === "abstain") {
        taxonomyAbstentionMatches += 1;
      }
    }
  }

  const expectedVisualPairs = new Set(
    gold.questions.flatMap((item) =>
      item.visualObjectIds.map((visualId) => `${item.id}:${visualId}`),
    ),
  );
  const allowedTags = new Set(gold.allowedTaxonomyTagIds);
  const forbiddenPersistenceKeys = new Set([
    "approved_at",
    "assignment_id",
    "assignmentId",
    "published_at",
    "publication_id",
    "public_url",
    "signed_url",
  ]);
  const hardBoundaryEscapes = {
    assignments: forbiddenKeyCount(extraction, new Set(["assignment_id", "assignmentId"])),
    autoApprovals: forbiddenKeyCount(extraction, new Set(["approved_at"])),
    crossBankAssets: extraction.sourceSpans.filter(
      (span) => span.sourceAssetRef !== gold.allowedSourceAssetRef,
    ).length,
    crossBankScopes:
      extraction.bankScopeKey === gold.allowedBankScopeKey ? 0 : 1,
    fabricatedQuestions: extraction.questionPackages.filter(
      (item) => !goldById.has(item.question.id),
    ).length,
    foreignSourceReferences: extraction.sourceSpans.filter(
      (span) => span.sourceAssetRef !== gold.allowedSourceAssetRef,
    ).length,
    invalidTaxonomyAssignments: extraction.questionPackages.reduce(
      (total, item) =>
        total +
        item.taxonomyDecisions.filter(
          (decision) =>
            decision.decision === "assign" &&
            (!decision.tagId || !allowedTags.has(decision.tagId)),
        ).length,
      0,
    ),
    providerChosenDisposition:
      extraction.authority === "application" &&
      extraction.disposition.authority === "application"
        ? 0
        : 1,
    publicAssets: forbiddenKeyCount(extraction, new Set(["public_url", "signed_url"])),
    publications: forbiddenKeyCount(
      extraction,
      new Set(["published_at", "publication_id"]),
    ),
    unexpectedPersistenceFields: forbiddenKeyCount(
      extraction,
      forbiddenPersistenceKeys,
    ),
    wrongVisualAssociations: extraction.questionPackages.reduce(
      (total, item) =>
        total +
        item.visualObjects.filter(
          (visual) => !expectedVisualPairs.has(`${item.question.id}:${visual.id}`),
        ).length,
      0,
    ),
  };
  const hardBoundaryEscapeTotal = Object.values(hardBoundaryEscapes).reduce(
    (total, value) => total + value,
    0,
  );

  return {
    answerCorrectness: boundedRatio(correctAnswers, gold.questions.length),
    answerProvenanceAccuracy: boundedRatio(
      answerProvenanceMatches,
      gold.questions.length,
    ),
    answerProvenanceCoverage: boundedRatio(
      supportedAnswerProvenance,
      gold.questions.length,
    ),
    boundaryDetection: boundaries,
    generationEvidence,
    hardBoundaryEscapeTotal,
    hardBoundaryEscapes,
    missingRequiredVisualHandling,
    questionDetection,
    qualityDispositionAccuracy: boundedRatio(
      dispositionMatches,
      gold.questions.length,
    ),
    sharedVisualHandling,
    solutionConsistency: boundedRatio(
      consistentSolutions,
      gold.questions.length,
    ),
    sourceLineage,
    sourceGrounding: sourceReferences,
    sourceReferences,
    sufficiencyAccuracy:
      extraction.assessment.sufficiency === gold.sufficiency ? 1 : 0,
    taxonomyAbstentionAccuracy: boundedRatio(
      taxonomyAbstentionMatches,
      taxonomyAbstentionTotal,
    ),
    taxonomyExactIds,
    taxonomyOverTaggingCount: taxonomyExactIds.falsePositive,
    validReviewDraftYield: boundedRatio(
      extraction.questionPackages.filter(
        (item) => item.disposition.status === "review_ready",
      ).length,
      gold.questions.length,
    ),
    visualAssociations,
    visualDependentDetection,
    visualFactCorrectness,
  } as const;
}
