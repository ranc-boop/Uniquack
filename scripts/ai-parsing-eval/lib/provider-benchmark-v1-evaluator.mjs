import assert from "node:assert/strict";

export const PROVIDER_BENCHMARK_V1_EVALUATOR_VERSION =
  "AI_PARSING_PROVIDER_BENCHMARK_V1_EVALUATOR_V2";

const FACETS = ["curriculum", "concept", "method", "task", "form"];

function finiteCount(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

function ratio(numerator, denominator) {
  if (!denominator) return numerator ? 0 : 1;
  return Number((numerator / denominator).toFixed(6));
}

function nullableRatio(numerator, denominator) {
  return denominator ? ratio(numerator, denominator) : null;
}

function f1(precision, recall) {
  return precision + recall
    ? Number(((2 * precision * recall) / (precision + recall)).toFixed(6))
    : 0;
}

function prf(expectedValues, candidateValues) {
  const expected = new Set(expectedValues);
  const candidate = new Set(candidateValues);
  const truePositive = [...candidate].filter((value) => expected.has(value)).length;
  const precision = ratio(truePositive, candidate.size);
  const recall = ratio(truePositive, expected.size);
  return {
    candidate: candidate.size,
    expected: expected.size,
    f1: f1(precision, recall),
    precision,
    recall,
    truePositive,
  };
}

function stripHtml(value) {
  return String(value ?? "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(?:nbsp|#160);/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizedText(value) {
  return stripHtml(value)
    .toLocaleLowerCase("en-US")
    .replace(/\\(?:left|right)/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function compactText(value) {
  return normalizedText(value).replace(/[^a-z0-9]+/g, "");
}

function normalizedQuestionNumber(value) {
  return normalizedText(value)
    .replace(/^(?:question|problem|item|frq|q)\s*/i, "")
    .replace(/parts?/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

function plainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function stringArray(value) {
  return Array.isArray(value)
    ? value.map(String).map((item) => item.trim()).filter(Boolean)
    : [];
}

function candidateQuestionText(question) {
  return normalizedText([
    question.title,
    question.content_source,
    question.content_html,
  ].join(" "));
}

function questionAnswerValues(question) {
  const spec = plainObject(question.answer_spec);
  return [
    ...stringArray(spec.correct_option_ids),
    ...stringArray(spec.final_answers),
    ...stringArray(spec.accepted_answers),
  ];
}

function questionCorrectOptionIds(question) {
  return stringArray(plainObject(question.answer_spec).correct_option_ids);
}

function candidateSolutionValues(question) {
  return [question.solution_source, question.solution_html]
    .map((value) => compactText(value))
    .filter(Boolean);
}

function answerMatches(expected, question) {
  const expectedOptionIds = stringArray(expected.correctOptionIds).map((value) =>
    compactText(value),
  );
  const candidateOptionIds = new Set(
    questionCorrectOptionIds(question).map((value) => compactText(value)),
  );
  if (expectedOptionIds.length && candidateOptionIds.size) {
    return expectedOptionIds.some((value) => candidateOptionIds.has(value));
  }

  const explicitAnswers = new Set(
    questionAnswerValues(question).map((value) => compactText(value)),
  );
  if (expectedOptionIds.some((value) => explicitAnswers.has(value))) return true;

  const solutions = candidateSolutionValues(question);
  return stringArray(expected.answerAliases).some((alias) => {
    const compact = compactText(alias);
    if (!compact) return false;
    if (compact.length === 1 && /^[a-z]$/.test(compact)) {
      return explicitAnswers.has(compact);
    }
    return solutions.some((solution) => solution.includes(compact)) ||
      explicitAnswers.has(compact);
  });
}

function solutionConsistent(expected, question) {
  const solutions = candidateSolutionValues(question);
  if (!solutions.length) return false;
  const aliases = stringArray(expected.answerAliases)
    .map((alias) => compactText(alias))
    .filter((alias) => alias.length > 1);
  return solutions.every((solution) =>
    aliases.some((alias) => solution.includes(alias)),
  );
}

function questionMatchScore(expected, question) {
  const number = normalizedQuestionNumber(question.question_number);
  const aliases = stringArray(expected.numberAliases).map(
    normalizedQuestionNumber,
  );
  const numberMatch = Boolean(number && aliases.includes(number));
  const text = candidateQuestionText(question);
  const termMatches = stringArray(expected.matchTerms).filter((term) =>
    text.includes(normalizedText(term)),
  ).length;
  if (!numberMatch && termMatches < 1) return 0;
  return (numberMatch ? 100 : 0) + termMatches * 10;
}

function matchQuestions(expectedQuestions, candidateQuestions) {
  const possibilities = [];
  for (const [expectedIndex, expected] of expectedQuestions.entries()) {
    for (const [candidateIndex, candidate] of candidateQuestions.entries()) {
      const score = questionMatchScore(expected, candidate);
      if (score > 0) possibilities.push({ candidateIndex, expectedIndex, score });
    }
  }
  possibilities.sort(
    (left, right) =>
      right.score - left.score ||
      left.expectedIndex - right.expectedIndex ||
      left.candidateIndex - right.candidateIndex,
  );
  const usedExpected = new Set();
  const usedCandidates = new Set();
  const pairs = [];
  for (const possibility of possibilities) {
    if (
      usedExpected.has(possibility.expectedIndex) ||
      usedCandidates.has(possibility.candidateIndex)
    ) {
      continue;
    }
    usedExpected.add(possibility.expectedIndex);
    usedCandidates.add(possibility.candidateIndex);
    pairs.push(possibility);
  }
  return { pairs, usedCandidates, usedExpected };
}

function validBbox(bbox) {
  const record = plainObject(bbox);
  const values = [record.x, record.y, record.width, record.height].map(Number);
  return (
    values.every(Number.isFinite) &&
    values[0] >= 0 &&
    values[1] >= 0 &&
    values[2] > 0 &&
    values[3] > 0 &&
    values[0] + values[2] <= 1 &&
    values[1] + values[3] <= 1
  );
}

function bboxArray(bbox) {
  const record = plainObject(bbox);
  return [record.x, record.y, record.width, record.height].map(Number);
}

function bboxIou(left, right) {
  const [lx, ly, lw, lh] = left;
  const [rx, ry, rw, rh] = right;
  const x1 = Math.max(lx, rx);
  const y1 = Math.max(ly, ry);
  const x2 = Math.min(lx + lw, rx + rw);
  const y2 = Math.min(ly + lh, ry + rh);
  const intersection = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const union = lw * lh + rw * rh - intersection;
  return union > 0 ? intersection / union : 0;
}

function validQuestionPages(question, pageCount) {
  return stringArray(question.page_refs)
    .map(Number)
    .filter((page) => Number.isInteger(page) && page >= 1 && page <= pageCount);
}

function visualRole(value) {
  return String(value ?? "question_figure").trim();
}

function placeholderMatchesVisual(placeholder, visual, iouFloor) {
  if (!validBbox(placeholder.bbox)) return false;
  if (Number(placeholder.page) !== Number(visual.page)) return false;
  if (visualRole(placeholder.visual_role) !== visual.role) return false;
  if (visual.expectedBbox) {
    return bboxIou(bboxArray(placeholder.bbox), visual.expectedBbox) >= iouFloor;
  }
  return true;
}

function expectedFacet(tagId) {
  return FACETS.find((facet) => String(tagId).startsWith(`math.${facet}.`)) ?? null;
}

function dispositionForQuestion({
  expectedId,
  pageCount,
  question,
  visualContract,
}) {
  const pages = validQuestionPages(question, pageCount);
  if (!pages.length) return "needs_more_evidence";
  const expectedVisuals = visualContract.filter(
    (visual) => visual.questionId === expectedId && visual.required,
  );
  for (const visual of expectedVisuals) {
    if (visual.sourceVisualMissing) return "needs_more_evidence";
    const placeholders = Array.isArray(question.asset_placeholders)
      ? question.asset_placeholders
      : [];
    if (!placeholders.some((placeholder) => placeholderMatchesVisual(
      placeholder,
      visual,
      0.15,
    ))) {
      return "needs_more_evidence";
    }
  }
  return "pending_review";
}

function sumMetrics(metrics) {
  return metrics.reduce((total, item) => total + finiteCount(item), 0);
}

export function evaluateProviderBenchmarkSource({
  activeTagFacets,
  activeTagIds,
  contract,
  extraction,
  providerOutcome,
  sourceId,
}) {
  assert.equal(contract.version, PROVIDER_BENCHMARK_V1_EVALUATOR_VERSION);
  const source = contract.sources[sourceId];
  assert(source, `missing source evaluation contract: ${sourceId}`);
  const candidateQuestions = Array.isArray(extraction?.questions)
    ? extraction.questions
    : [];
  const expectedQuestions = source.questions;
  const matches = matchQuestions(expectedQuestions, candidateQuestions);
  const expectedByCandidate = new Map(
    matches.pairs.map((pair) => [pair.candidateIndex, pair.expectedIndex]),
  );
  const candidateKeys = candidateQuestions.map((question) =>
    compactText(question.content_source || question.content_html),
  );
  const duplicateCount = candidateKeys.length - new Set(candidateKeys).size;

  const expectedQuestionKeys = expectedQuestions.map((question) => question.id);
  const candidateQuestionKeys = matches.pairs.map(
    (pair) => expectedQuestions[pair.expectedIndex].id,
  );
  for (const candidateIndex of candidateQuestions.keys()) {
    if (!matches.usedCandidates.has(candidateIndex)) {
      candidateQuestionKeys.push(`unmatched-${candidateIndex + 1}`);
    }
  }
  const questionBoundary = prf(expectedQuestionKeys, candidateQuestionKeys);

  const expectedPagePairs = [];
  const candidatePagePairs = [];
  let fabricatedPageRefs = 0;
  for (const expected of expectedQuestions) {
    for (const page of expected.pageRefs) expectedPagePairs.push(`${expected.id}:${page}`);
  }
  for (const [candidateIndex, question] of candidateQuestions.entries()) {
    const expectedIndex = expectedByCandidate.get(candidateIndex);
    const questionId = expectedIndex === undefined
      ? `unmatched-${candidateIndex + 1}`
      : expectedQuestions[expectedIndex].id;
    const rawPages = Array.isArray(question.page_refs) ? question.page_refs : [];
    for (const rawPage of rawPages) {
      const page = Number(rawPage);
      if (!Number.isInteger(page) || page < 1 || page > source.pageCount) {
        fabricatedPageRefs += 1;
      } else {
        candidatePagePairs.push(`${questionId}:${page}`);
      }
    }
  }
  const pageReferences = prf(expectedPagePairs, candidatePagePairs);

  let answersCorrect = 0;
  let answersConsistent = 0;
  let answerProvenanceCorrect = 0;
  let sourceAnswerKeyCorrect = 0;
  let sourceAnswerKeyExpected = 0;
  let unsupportedAnswers = 0;
  for (const pair of matches.pairs) {
    const expected = expectedQuestions[pair.expectedIndex];
    const candidate = candidateQuestions[pair.candidateIndex];
    const correct = answerMatches(expected, candidate);
    answersCorrect += correct ? 1 : 0;
    answersConsistent += solutionConsistent(expected, candidate) ? 1 : 0;
    const pages = new Set(validQuestionPages(candidate, source.pageCount));
    answerProvenanceCorrect += expected.answerPages.every((page) => pages.has(page))
      ? 1
      : 0;
    if (expected.answerMode === "source_answer_key") {
      sourceAnswerKeyExpected += 1;
      sourceAnswerKeyCorrect += correct ? 1 : 0;
    }
    if (!correct && questionAnswerValues(candidate).length > 0) {
      unsupportedAnswers += 1;
    }
  }
  for (const [candidateIndex, question] of candidateQuestions.entries()) {
    if (!matches.usedCandidates.has(candidateIndex) && questionAnswerValues(question).length) {
      unsupportedAnswers += 1;
    }
  }

  const expectedVisuals = source.visuals ?? [];
  const requiredVisuals = expectedVisuals.filter(
    (visual) => visual.required && !visual.sourceVisualMissing,
  );
  let requiredAssetAssociations = 0;
  let visualDescriptionCorrect = 0;
  let visualDescriptionExpected = 0;
  let decorativeSuppressionCorrect = 0;
  let decorativeSuppressionExpected = 0;
  let missingRequiredVisualCorrect = 0;
  let missingRequiredVisualExpected = 0;
  let wrongQuestionAttachments = 0;
  let invalidVisualProposals = 0;
  let fabricatedVisualProposals = 0;
  const sharedGroups = new Map();
  const dispositions = [];

  for (const pair of matches.pairs) {
    const expected = expectedQuestions[pair.expectedIndex];
    const candidate = candidateQuestions[pair.candidateIndex];
    const placeholders = Array.isArray(candidate.asset_placeholders)
      ? candidate.asset_placeholders
      : [];
    const expectedForQuestion = expectedVisuals.filter(
      (visual) => visual.questionId === expected.id,
    );
    const nonDecorative = placeholders.filter(
      (placeholder) => visualRole(placeholder.visual_role) !== "decorative",
    );
    const disposition = dispositionForQuestion({
      expectedId: expected.id,
      pageCount: source.pageCount,
      question: candidate,
      visualContract: expectedVisuals,
    });
    dispositions.push(disposition);

    for (const visual of expectedForQuestion) {
      if (visual.mustSuppress) {
        decorativeSuppressionExpected += 1;
        decorativeSuppressionCorrect += nonDecorative.length === 0 ? 1 : 0;
        continue;
      }
      if (visual.sourceVisualMissing) {
        missingRequiredVisualExpected += 1;
        const fabricated = nonDecorative.some(
          (placeholder) => Number(placeholder.page) === visual.page,
        );
        fabricatedVisualProposals += fabricated ? 1 : 0;
        missingRequiredVisualCorrect +=
          !fabricated && disposition === "needs_more_evidence" ? 1 : 0;
        continue;
      }
      const matchedPlaceholder = placeholders.find((placeholder) =>
        placeholderMatchesVisual(
          placeholder,
          visual,
          Number(contract.matching.visualAssociationIoUFloor),
        ),
      );
      if (matchedPlaceholder) {
        requiredAssetAssociations += 1;
        if (visual.descriptionTerms?.length) {
          visualDescriptionExpected += 1;
          const alt = normalizedText(matchedPlaceholder.alt);
          visualDescriptionCorrect += visual.descriptionTerms.some((term) =>
            alt.includes(normalizedText(term)),
          ) ? 1 : 0;
        }
        if (visual.sharedGroup) {
          const key = String(matchedPlaceholder.shared_group_key ?? "");
          if (!sharedGroups.has(visual.sharedGroup)) sharedGroups.set(visual.sharedGroup, []);
          sharedGroups.get(visual.sharedGroup).push(key);
        }
      }
    }

    for (const placeholder of placeholders) {
      if (!validBbox(placeholder.bbox)) invalidVisualProposals += 1;
      if (visualRole(placeholder.visual_role) === "decorative") continue;
      const belongs = expectedForQuestion.some(
        (visual) =>
          !visual.sourceVisualMissing &&
          placeholderMatchesVisual(
            placeholder,
            visual,
            Number(contract.matching.visualAssociationIoUFloor),
          ),
      );
      if (!belongs) wrongQuestionAttachments += 1;
    }
  }

  const expectedVisualQuestionIds = new Set(
    expectedVisuals
      .filter((visual) => visual.required)
      .map((visual) => visual.questionId),
  );
  const predictedVisualQuestionIds = candidateQuestions
    .map((question, candidateIndex) => {
      const nonDecorative = (Array.isArray(question.asset_placeholders)
        ? question.asset_placeholders
        : []).filter(
        (placeholder) => visualRole(placeholder.visual_role) !== "decorative",
      );
      if (!question.visual_evidence_required && !nonDecorative.length) return null;
      const expectedIndex = expectedByCandidate.get(candidateIndex);
      return expectedIndex === undefined
        ? `unmatched-${candidateIndex + 1}`
        : expectedQuestions[expectedIndex].id;
    })
    .filter(Boolean);
  const visualDependentDetection = prf(
    [...expectedVisualQuestionIds],
    predictedVisualQuestionIds,
  );
  const sharedVisualGroupsCorrect = [...sharedGroups.values()].filter(
    (values) => values.length > 1 && values.every(Boolean) && new Set(values).size === 1,
  ).length;
  const sharedVisualGroupsExpected = new Set(
    expectedVisuals.map((visual) => visual.sharedGroup).filter(Boolean),
  ).size;

  const activeIds = new Set(activeTagIds ?? []);
  const facetById = new Map(
    (activeTagFacets ?? []).map((tag) => [tag.id, tag.facetKey]),
  );
  const taxonomyContract = source.taxonomy;
  let taxonomy = {
    abstentionCorrect: 0,
    abstentionExpected: 0,
    broadParentOveruse: 0,
    candidateExpected: 0,
    candidateRetrieved: 0,
    candidateRetrievalRecall: 1,
    exactId: prf([], []),
    facetMetrics: Object.fromEntries(FACETS.map((facet) => [facet, prf([], [])])),
    invalidIdsRejected: 0,
    unknownIdCount: 0,
    wrongFacet: 0,
  };
  if (taxonomyContract) {
    const taxonomyPair = taxonomyContract.questionId
      ? matches.pairs.find(
          (pair) => expectedQuestions[pair.expectedIndex].id === taxonomyContract.questionId,
        )
      : null;
    const rawPrediction = taxonomyPair
      ? stringArray(candidateQuestions[taxonomyPair.candidateIndex].tag_ids)
      : [];
    const validPrediction = rawPrediction.filter((tagId) => activeIds.has(tagId));
    const unknown = rawPrediction.filter((tagId) => !activeIds.has(tagId));
    const expectedIds = stringArray(taxonomyContract.expectedIds);
    const candidateRetrieved = expectedIds.filter((tagId) => activeIds.has(tagId)).length;
    const expectedFacets = new Set(expectedIds.map(expectedFacet).filter(Boolean));
    const wrongFacet = validPrediction.filter((tagId) => {
      const facet = facetById.get(tagId) ?? expectedFacet(tagId);
      return facet && !expectedFacets.has(facet);
    }).length;
    const abstainFacets = stringArray(taxonomyContract.expectedAbstainFacets);
    const abstentionCorrect = abstainFacets.filter(
      (facet) => !validPrediction.some(
        (tagId) => (facetById.get(tagId) ?? expectedFacet(tagId)) === facet,
      ),
    ).length;
    taxonomy = {
      abstentionCorrect,
      abstentionExpected: abstainFacets.length,
      broadParentOveruse: rawPrediction.filter((tagId) =>
        stringArray(taxonomyContract.broadParentIds).includes(tagId),
      ).length,
      candidateExpected: expectedIds.length,
      candidateRetrieved,
      candidateRetrievalRecall: ratio(candidateRetrieved, expectedIds.length),
      exactId: prf(expectedIds, validPrediction),
      facetMetrics: Object.fromEntries(FACETS.map((facet) => [
        facet,
        prf(
          expectedIds.filter(
            (tagId) => (facetById.get(tagId) ?? expectedFacet(tagId)) === facet,
          ),
          validPrediction.filter(
            (tagId) => (facetById.get(tagId) ?? expectedFacet(tagId)) === facet,
          ),
        ),
      ])),
      invalidIdsRejected: unknown.length,
      unknownIdCount: unknown.length,
      wrongFacet,
    };
  }

  const pendingReviewDrafts = dispositions.filter(
    (value) => value === "pending_review",
  ).length;
  const needsMoreEvidenceDrafts = dispositions.filter(
    (value) => value === "needs_more_evidence",
  ).length;
  const mustRejectCorrect = source.mustReject
    ? candidateQuestions.length === 0 && providerOutcome !== "success"
    : true;
  const sourceGroundedQuestions = matches.pairs.filter((pair) =>
    validQuestionPages(candidateQuestions[pair.candidateIndex], source.pageCount).length > 0
  ).length;
  const escapedMissingVisual = missingRequiredVisualExpected - missingRequiredVisualCorrect;
  const hardBoundaryEscapes = {
    autoApprovedOrPublished: 0,
    fabricatedPageReferencesAccepted: 0,
    invalidTaxonomyIdsAccepted: 0,
    missingRequiredVisualUnblocked: Math.max(0, escapedMissingVisual),
    wrongQuestionVisualAttachmentsAccepted: 0,
  };

  return {
    answer: {
      answerCorrectness: ratio(answersCorrect, expectedQuestions.length),
      answerProvenance: ratio(answerProvenanceCorrect, expectedQuestions.length),
      answerSolutionConsistency: ratio(answersConsistent, expectedQuestions.length),
      correct: answersCorrect,
      expected: expectedQuestions.length,
      provenanceCorrect: answerProvenanceCorrect,
      solutionConsistencyCorrect: answersConsistent,
      modelDerivedAnswerCorrect: 0,
      modelDerivedAnswerExpected: 0,
      sourceAnswerKeyAccuracy: ratio(sourceAnswerKeyCorrect, sourceAnswerKeyExpected),
      sourceAnswerKeyCorrect,
      sourceAnswerKeyExpected,
      unsupportedAnswerRate: ratio(unsupportedAnswers, candidateQuestions.length),
      unsupportedAnswers,
    },
    hardBoundaryEscapes,
    parsing: {
      applicationValidity: source.mustReject ? Number(mustRejectCorrect) : extraction ? 1 : 0,
      duplicateCount,
      duplicateRate: ratio(duplicateCount, candidateQuestions.length),
      insufficientEvidenceCorrect: source.mustReject && mustRejectCorrect ? 1 : 0,
      insufficientEvidenceExpected: source.mustReject ? 1 : 0,
      pageReferences,
      questionBoundary,
      questionsExpected: expectedQuestions.length,
      questionsExtracted: candidateQuestions.length,
      schemaValidity: source.mustReject ? Number(mustRejectCorrect) : extraction ? 1 : 0,
      sourceGroundedQuestions,
      sourceGroundingAccuracy: ratio(sourceGroundedQuestions, candidateQuestions.length),
      fabricatedPageReferenceRate: ratio(
        fabricatedPageRefs,
        candidatePagePairs.length + fabricatedPageRefs,
      ),
      fabricatedPageRefs,
      validReviewDraftYield: ratio(pendingReviewDrafts, expectedQuestions.length),
      validReviewDrafts: pendingReviewDrafts,
      needsMoreEvidenceDrafts,
      reviewDrafts: dispositions.length,
    },
    providerOutcome,
    sourceId,
    taxonomy,
    visual: {
      decorativeSuppressionCorrect,
      decorativeSuppressionExpected,
      decorativeSuppressionRate: ratio(
        decorativeSuppressionCorrect,
        decorativeSuppressionExpected,
      ),
      fabricatedVisualProposals,
      invalidVisualProposals,
      missingRequiredVisualCorrect,
      missingRequiredVisualExpected,
      missingRequiredVisualRate: ratio(
        missingRequiredVisualCorrect,
        missingRequiredVisualExpected,
      ),
      requiredAssetAssociationRate: ratio(
        requiredAssetAssociations,
        requiredVisuals.length,
      ),
      requiredAssetAssociations,
      requiredAssetExpected: requiredVisuals.length,
      sharedVisualGroupsCorrect,
      sharedVisualGroupsExpected,
      visualDependentDetection,
      visualDescriptionCorrect,
      visualDescriptionExpected,
      visualDescriptionRate: ratio(
        visualDescriptionCorrect,
        visualDescriptionExpected,
      ),
      wrongQuestionAttachmentRate: ratio(
        wrongQuestionAttachments,
        candidateQuestions.reduce(
          (total, question) =>
            total + (Array.isArray(question.asset_placeholders)
              ? question.asset_placeholders.length
              : 0),
          0,
        ),
      ),
      wrongQuestionAttachments,
      placeholderCount: candidateQuestions.reduce(
        (total, question) =>
          total + (Array.isArray(question.asset_placeholders)
            ? question.asset_placeholders.length
            : 0),
        0,
      ),
    },
  };
}

export function aggregateProviderBenchmarkEvaluations(results) {
  assert.equal(Array.isArray(results) && results.length > 0, true);
  const parsing = results.map((result) => result.parsing);
  const answers = results.map((result) => result.answer);
  const visuals = results.map((result) => result.visual);
  const taxonomies = results.map((result) => result.taxonomy);
  const questionExpected = sumMetrics(parsing.map((item) => item.questionsExpected));
  const questionExtracted = sumMetrics(parsing.map((item) => item.questionsExtracted));
  const questionTruePositive = sumMetrics(
    parsing.map((item) => item.questionBoundary.truePositive),
  );
  const expectedPages = sumMetrics(parsing.map((item) => item.pageReferences.expected));
  const candidatePages = sumMetrics(parsing.map((item) => item.pageReferences.candidate));
  const pageTruePositive = sumMetrics(
    parsing.map((item) => item.pageReferences.truePositive),
  );
  const taxonomyExpected = sumMetrics(taxonomies.map((item) => item.exactId.expected));
  const taxonomyCandidate = sumMetrics(taxonomies.map((item) => item.exactId.candidate));
  const taxonomyTruePositive = sumMetrics(
    taxonomies.map((item) => item.exactId.truePositive),
  );
  const taxonomyFacetMetrics = Object.fromEntries(FACETS.map((facet) => {
    const expected = sumMetrics(
      taxonomies.map((item) => item.facetMetrics[facet].expected),
    );
    const candidate = sumMetrics(
      taxonomies.map((item) => item.facetMetrics[facet].candidate),
    );
    const truePositive = sumMetrics(
      taxonomies.map((item) => item.facetMetrics[facet].truePositive),
    );
    const precision = ratio(truePositive, candidate);
    const recall = ratio(truePositive, expected);
    return [facet, {
      candidate,
      expected,
      f1: f1(precision, recall),
      precision,
      recall,
      truePositive,
    }];
  }));
  const questionPrecision = ratio(questionTruePositive, questionExtracted);
  const questionRecall = ratio(questionTruePositive, questionExpected);
  const pagePrecision = ratio(pageTruePositive, candidatePages);
  const pageRecall = ratio(pageTruePositive, expectedPages);
  const taxonomyPrecision = ratio(taxonomyTruePositive, taxonomyCandidate);
  const taxonomyRecall = ratio(taxonomyTruePositive, taxonomyExpected);

  return {
    answer: {
      answerCorrectness: ratio(
        sumMetrics(answers.map((item) => item.correct)),
        sumMetrics(answers.map((item) => item.expected)),
      ),
      answerProvenance: ratio(
        sumMetrics(answers.map((item) => item.provenanceCorrect)),
        sumMetrics(answers.map((item) => item.expected)),
      ),
      answerSolutionConsistency: ratio(
        sumMetrics(answers.map((item) => item.solutionConsistencyCorrect)),
        sumMetrics(answers.map((item) => item.expected)),
      ),
      modelDerivedAnswerCorrect: sumMetrics(
        answers.map((item) => item.modelDerivedAnswerCorrect),
      ),
      modelDerivedAnswerCorrectness: nullableRatio(
        sumMetrics(answers.map((item) => item.modelDerivedAnswerCorrect)),
        sumMetrics(answers.map((item) => item.modelDerivedAnswerExpected)),
      ),
      modelDerivedAnswerExpected: sumMetrics(
        answers.map((item) => item.modelDerivedAnswerExpected),
      ),
      sourceAnswerKeyAccuracy: ratio(
        sumMetrics(answers.map((item) => item.sourceAnswerKeyCorrect)),
        sumMetrics(answers.map((item) => item.sourceAnswerKeyExpected)),
      ),
      unsupportedAnswerRate: ratio(
        sumMetrics(answers.map((item) => item.unsupportedAnswers)),
        questionExtracted,
      ),
    },
    hardBoundaryEscapes: Object.fromEntries(
      Object.keys(results[0].hardBoundaryEscapes).map((key) => [
        key,
        sumMetrics(results.map((result) => result.hardBoundaryEscapes[key])),
      ]),
    ),
    parsing: {
      applicationValidityRate: ratio(
        sumMetrics(parsing.map((item) => item.applicationValidity)),
        results.length,
      ),
      duplicateCount: sumMetrics(parsing.map((item) => item.duplicateCount)),
      duplicateRate: ratio(
        sumMetrics(parsing.map((item) => item.duplicateCount)),
        questionExtracted,
      ),
      fabricatedPageRefs: sumMetrics(
        parsing.map((item) => item.fabricatedPageRefs),
      ),
      fabricatedPageReferenceRate: ratio(
        sumMetrics(parsing.map((item) => item.fabricatedPageRefs)),
        candidatePages + sumMetrics(parsing.map((item) => item.fabricatedPageRefs)),
      ),
      insufficientEvidenceAccuracy: nullableRatio(
        sumMetrics(parsing.map((item) => item.insufficientEvidenceCorrect)),
        sumMetrics(parsing.map((item) => item.insufficientEvidenceExpected)),
      ),
      insufficientEvidenceCorrect: sumMetrics(
        parsing.map((item) => item.insufficientEvidenceCorrect),
      ),
      insufficientEvidenceExpected: sumMetrics(
        parsing.map((item) => item.insufficientEvidenceExpected),
      ),
      pageReferences: {
        candidate: candidatePages,
        expected: expectedPages,
        f1: f1(pagePrecision, pageRecall),
        precision: pagePrecision,
        recall: pageRecall,
        truePositive: pageTruePositive,
      },
      questionBoundary: {
        candidate: questionExtracted,
        expected: questionExpected,
        f1: f1(questionPrecision, questionRecall),
        precision: questionPrecision,
        recall: questionRecall,
        truePositive: questionTruePositive,
      },
      questionsExpected: questionExpected,
      questionsExtracted: questionExtracted,
      reviewDrafts: sumMetrics(parsing.map((item) => item.reviewDrafts)),
      schemaValidityRate: ratio(
        sumMetrics(parsing.map((item) => item.schemaValidity)),
        results.length,
      ),
      sourceGroundedQuestions: sumMetrics(
        parsing.map((item) => item.sourceGroundedQuestions),
      ),
      sourceGroundingAccuracy: ratio(
        sumMetrics(parsing.map((item) => item.sourceGroundedQuestions)),
        questionExtracted,
      ),
      validReviewDrafts: sumMetrics(
        parsing.map((item) => item.validReviewDrafts),
      ),
      validReviewDraftYield: ratio(
        sumMetrics(parsing.map((item) => item.validReviewDrafts)),
        questionExpected,
      ),
      needsMoreEvidenceDrafts: sumMetrics(
        parsing.map((item) => item.needsMoreEvidenceDrafts),
      ),
    },
    taxonomy: {
      abstentionAccuracy: ratio(
        sumMetrics(taxonomies.map((item) => item.abstentionCorrect)),
        sumMetrics(taxonomies.map((item) => item.abstentionExpected)),
      ),
      broadParentOveruse: sumMetrics(
        taxonomies.map((item) => item.broadParentOveruse),
      ),
      broadParentOveruseRate: nullableRatio(
        sumMetrics(taxonomies.map((item) => item.broadParentOveruse)),
        taxonomyCandidate,
      ),
      candidateExpected: sumMetrics(
        taxonomies.map((item) => item.candidateExpected),
      ),
      candidateRetrieved: sumMetrics(
        taxonomies.map((item) => item.candidateRetrieved),
      ),
      candidateRetrievalRecall: ratio(
        sumMetrics(taxonomies.map((item) => item.candidateRetrieved)),
        sumMetrics(taxonomies.map((item) => item.candidateExpected)),
      ),
      exactId: {
        candidate: taxonomyCandidate,
        expected: taxonomyExpected,
        f1: f1(taxonomyPrecision, taxonomyRecall),
        precision: taxonomyPrecision,
        recall: taxonomyRecall,
        truePositive: taxonomyTruePositive,
      },
      invalidIdsRejected: sumMetrics(
        taxonomies.map((item) => item.invalidIdsRejected),
      ),
      facetMetrics: taxonomyFacetMetrics,
      unknownIdCount: sumMetrics(
        taxonomies.map((item) => item.unknownIdCount),
      ),
      wrongFacet: sumMetrics(taxonomies.map((item) => item.wrongFacet)),
      wrongFacetRate: nullableRatio(
        sumMetrics(taxonomies.map((item) => item.wrongFacet)),
        taxonomyCandidate,
      ),
    },
    visual: {
      decorativeSuppressionRate: ratio(
        sumMetrics(visuals.map((item) => item.decorativeSuppressionCorrect)),
        sumMetrics(visuals.map((item) => item.decorativeSuppressionExpected)),
      ),
      missingRequiredVisualRate: ratio(
        sumMetrics(visuals.map((item) => item.missingRequiredVisualCorrect)),
        sumMetrics(visuals.map((item) => item.missingRequiredVisualExpected)),
      ),
      requiredAssetAssociationRate: ratio(
        sumMetrics(visuals.map((item) => item.requiredAssetAssociations)),
        sumMetrics(visuals.map((item) => item.requiredAssetExpected)),
      ),
      fabricatedVisualProposals: sumMetrics(
        visuals.map((item) => item.fabricatedVisualProposals),
      ),
      invalidVisualProposals: sumMetrics(
        visuals.map((item) => item.invalidVisualProposals),
      ),
      sharedVisualGroupAccuracy: nullableRatio(
        sumMetrics(visuals.map((item) => item.sharedVisualGroupsCorrect)),
        sumMetrics(visuals.map((item) => item.sharedVisualGroupsExpected)),
      ),
      visualDependentQuestionDetection: (() => {
        const expected = sumMetrics(
          visuals.map((item) => item.visualDependentDetection.expected),
        );
        const candidate = sumMetrics(
          visuals.map((item) => item.visualDependentDetection.candidate),
        );
        const truePositive = sumMetrics(
          visuals.map((item) => item.visualDependentDetection.truePositive),
        );
        const precision = ratio(truePositive, candidate);
        const recall = ratio(truePositive, expected);
        return {
          candidate,
          expected,
          f1: f1(precision, recall),
          precision,
          recall,
          truePositive,
        };
      })(),
      visualDescriptionRate: ratio(
        sumMetrics(visuals.map((item) => item.visualDescriptionCorrect)),
        sumMetrics(visuals.map((item) => item.visualDescriptionExpected)),
      ),
      wrongQuestionAttachments: sumMetrics(
        visuals.map((item) => item.wrongQuestionAttachments),
      ),
      wrongQuestionAttachmentRate: ratio(
        sumMetrics(visuals.map((item) => item.wrongQuestionAttachments)),
        sumMetrics(visuals.map((item) => item.placeholderCount)),
      ),
    },
  };
}
