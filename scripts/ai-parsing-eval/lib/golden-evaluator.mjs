const FACETS = ["curriculum", "concept", "method", "task", "form"];

function ratio(numerator, denominator) {
  return denominator === 0 ? 1 : numerator / denominator;
}

function prf(expectedValues, candidateValues) {
  const expected = new Set(expectedValues);
  const candidate = new Set(candidateValues);
  const truePositive = [...candidate].filter((value) => expected.has(value)).length;
  const precision = ratio(truePositive, candidate.size);
  const recall = ratio(truePositive, expected.size);

  return {
    f1: precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall),
    precision,
    recall,
    truePositive,
  };
}

function duplicateCount(values) {
  return values.length - new Set(values).size;
}

function normalizedAlias(value) {
  return String(value).trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");
}

function sourceCoverage(payload, catalog, provenance) {
  const expected = payload.cases.flatMap((entry) =>
    entry.goldExpectedIds
      .filter((tagId) => catalog.get(tagId)?.provenance === provenance)
      .map((tagId) => `${entry.id}:${tagId}`),
  );
  const retrieved = payload.cases.flatMap((entry) => {
    const pool = new Set(entry.candidatePool);
    return entry.goldExpectedIds
      .filter(
        (tagId) =>
          catalog.get(tagId)?.provenance === provenance && pool.has(tagId),
      )
      .map((tagId) => `${entry.id}:${tagId}`);
  });
  const predicted = payload.cases.flatMap((entry) =>
    entry.prediction
      .filter((tagId) => catalog.get(tagId)?.provenance === provenance)
      .map((tagId) => `${entry.id}:${tagId}`),
  );

  return {
    candidateRecall: ratio(retrieved.length, expected.length),
    exactIdClassification: prf(expected, predicted),
    expected: expected.length,
    uniqueExpectedIds: new Set(expected.map((value) => value.slice(value.indexOf(":") + 1))).size,
  };
}

function pagePairs(value) {
  return Object.entries(value).flatMap(([questionId, pages]) =>
    pages.map((page) => `${questionId}:${page}`),
  );
}

function answerPairs(value) {
  return Object.entries(value).map(
    ([questionId, answer]) => `${questionId}:${String(answer).trim()}`,
  );
}

export function evaluateParsingCases(cases) {
  const expectedQuestions = cases.flatMap((entry) =>
    entry.expected.questionIds.map((questionId) => `${entry.id}:${questionId}`),
  );
  const candidateQuestions = cases.flatMap((entry) =>
    entry.candidate.questionIds.map((questionId) => `${entry.id}:${questionId}`),
  );
  const expectedPages = cases.flatMap((entry) =>
    pagePairs(entry.expected.pageRefs).map((value) => `${entry.id}:${value}`),
  );
  const candidatePages = cases.flatMap((entry) =>
    pagePairs(entry.candidate.pageRefs).map((value) => `${entry.id}:${value}`),
  );
  const expectedAnswers = cases.flatMap((entry) =>
    answerPairs(entry.expected.answers).map((value) => `${entry.id}:${value}`),
  );
  const candidateAnswers = cases.flatMap((entry) =>
    answerPairs(entry.candidate.answers).map((value) => `${entry.id}:${value}`),
  );
  const candidateQuestionKeys = cases.flatMap((entry) =>
    entry.candidate.questionIds.map((questionId) => `${entry.id}:${questionId}`),
  );
  const fabricatedPageRefs = cases.reduce(
    (total, entry) => total + Object.values(entry.candidate.pageRefs)
      .flat()
      .filter((page) => !Number.isInteger(page) || page < 1 || page > entry.pageCount)
      .length,
    0,
  );
  const unvalidatedAnswers = cases.reduce((total, entry) => {
    const expectedIds = new Set(entry.expected.questionIds);
    return total + Object.keys(entry.candidate.answers)
      .filter((questionId) => !expectedIds.has(questionId))
      .length;
  }, 0);
  const mustRejectViolations = cases.filter(
    (entry) => entry.expected.mustReject !== entry.candidate.rejected,
  ).length;

  return {
    answerPairing: prf(expectedAnswers, candidateAnswers),
    duplicateQuestions: duplicateCount(candidateQuestionKeys),
    fabricatedPageRefs,
    mustRejectViolations,
    pageAttribution: prf(expectedPages, candidatePages),
    questionBoundary: prf(expectedQuestions, candidateQuestions),
    unvalidatedAnswers,
  };
}

export function evaluateTaxonomyCases(payload) {
  const catalog = new Map(payload.catalog.map((entry) => [entry.tagId, entry]));
  const eligible = (tagId) => {
    const entry = catalog.get(tagId);
    return Boolean(entry?.active && entry?.assignable && entry?.effectiveLeaf);
  };
  const expected = payload.cases.flatMap((entry) =>
    entry.goldExpectedIds.map((tagId) => `${entry.id}:${tagId}`),
  );
  const predictions = payload.cases.flatMap((entry) =>
    entry.prediction.map((tagId) => `${entry.id}:${tagId}`),
  );
  const expectedRetrieved = payload.cases.flatMap((entry) => {
    const pool = new Set(entry.candidatePool);
    return entry.goldExpectedIds
      .filter((tagId) => pool.has(tagId))
      .map((tagId) => `${entry.id}:${tagId}`);
  });
  const invalidPredictions = payload.cases.flatMap((entry) =>
    entry.prediction.filter((tagId) => !eligible(tagId)),
  );
  const challengeIds = payload.cases.flatMap((entry) =>
    entry.distractorIds.filter((tagId) => !eligible(tagId)),
  );
  const predictedInvalidChallenges = payload.cases.flatMap((entry) => {
    const prediction = new Set(entry.prediction);
    return entry.distractorIds
      .filter((tagId) => !eligible(tagId) && prediction.has(tagId));
  });
  const duplicateTagIds = payload.cases.reduce(
    (total, entry) => total + duplicateCount(entry.prediction),
    0,
  );
  const broadParentOvertags = payload.cases.reduce((total, entry) => {
    const prediction = new Set(entry.prediction);
    return total + entry.goldExpectedIds.reduce(
      (count, expectedTag) => count + (payload.broadParents[expectedTag] ?? [])
        .filter((parent) => prediction.has(parent)).length,
      0,
    );
  }, 0);
  const wrongFacetPredictions = payload.cases.reduce((total, entry) => {
    const expectedFacets = new Set(entry.goldExpectedIds
      .map((tagId) => catalog.get(tagId)?.facet)
      .filter(Boolean));
    return total + entry.prediction.filter((tagId) => {
      const facet = catalog.get(tagId)?.facet;
      return eligible(tagId) && facet && !expectedFacets.has(facet);
    }).length;
  }, 0);
  const eligiblePredictionCount = payload.cases.reduce(
    (total, entry) => total + entry.prediction.filter(eligible).length,
    0,
  );
  const abstentionCases = payload.cases.filter((entry) => entry.acceptableAbstention);
  const correctAbstentions = abstentionCases.filter(
    (entry) => entry.prediction.length === 0,
  ).length;
  const facetMetrics = Object.fromEntries(FACETS.map((facet) => {
    const expectedFacet = payload.cases.flatMap((entry) => entry.goldExpectedIds
      .filter((tagId) => catalog.get(tagId)?.facet === facet)
      .map((tagId) => `${entry.id}:${tagId}`));
    const predictedFacet = payload.cases.flatMap((entry) => entry.prediction
      .filter((tagId) => catalog.get(tagId)?.facet === facet)
      .map((tagId) => `${entry.id}:${tagId}`));
    return [facet, prf(expectedFacet, predictedFacet)];
  }));
  const aliasExpectations = payload.cases.flatMap((entry) =>
    (entry.aliasExpectations ?? []).map((expectation) => ({
      ...expectation,
      caseId: entry.id,
      candidatePool: new Set(entry.candidatePool),
      prediction: new Set(entry.prediction),
    })),
  );
  const correctAliasResolutions = aliasExpectations.filter((expectation) => {
    const target = catalog.get(expectation.tagId);
    return Boolean(
      target &&
      target.aliases.map(normalizedAlias).includes(normalizedAlias(expectation.input)) &&
      expectation.candidatePool.has(expectation.tagId) &&
      expectation.prediction.has(expectation.tagId),
    );
  }).length;

  return {
    aliasResolution: {
      correct: correctAliasResolutions,
      total: aliasExpectations.length,
      value: ratio(correctAliasResolutions, aliasExpectations.length),
    },
    abstentionAccuracy: {
      correct: correctAbstentions,
      total: abstentionCases.length,
      value: ratio(correctAbstentions, abstentionCases.length),
    },
    broadParentOvertags,
    candidateRetrievalRecall: ratio(expectedRetrieved.length, expected.length),
    duplicateTagIds,
    exactIdClassification: prf(expected, predictions),
    facetMetrics,
    inactiveUnknownIdRejection: {
      challenged: challengeIds.length,
      rejected: challengeIds.length - predictedInvalidChallenges.length,
      value: ratio(
        challengeIds.length - predictedInvalidChallenges.length,
        challengeIds.length,
      ),
    },
    invalidPredictions: invalidPredictions.length,
    pr214ExpansionCoverage: sourceCoverage(
      payload,
      catalog,
      "migration_0056",
    ),
    seedOnlyCoverage: sourceCoverage(payload, catalog, "seed_only"),
    wrongFacet: {
      rate: ratio(wrongFacetPredictions, eligiblePredictionCount),
      violations: wrongFacetPredictions,
    },
  };
}

function validBbox([x, y, width, height]) {
  return [x, y, width, height].every(Number.isFinite) &&
    x >= 0 && y >= 0 && width > 0 && height > 0 &&
    x + width <= 1 && y + height <= 1;
}

function visualSignature(entry, visual) {
  return [
    entry.id,
    visual.key,
    visual.questionId,
    visual.page,
    visual.role,
    visual.bbox.map((value) => Number(value).toFixed(4)).join(","),
    visual.sharedGroupKey ?? "",
  ].join(":");
}

export function evaluateVisualCases(cases) {
  const attachableCases = cases.filter((entry) => !entry.expected.approvalBlocked);
  const expected = attachableCases.flatMap((entry) =>
    entry.expected.visuals.map((visual) => visualSignature(entry, visual)),
  );
  const candidate = attachableCases.flatMap((entry) =>
    entry.candidate.visuals.map((visual) => visualSignature(entry, visual)),
  );
  const invalidBboxes = cases.reduce(
    (total, entry) => total + entry.candidate.visuals
      .filter((visual) => !validBbox(visual.bbox)).length,
    0,
  );
  const fabricatedPageRefs = cases.reduce(
    (total, entry) => total + entry.candidate.visuals
      .filter((visual) => !Number.isInteger(visual.page) || visual.page < 1 || visual.page > entry.pageCount)
      .length,
    0,
  );
  const duplicateAssets = cases.reduce((total, entry) => {
    const identities = entry.candidate.visuals.map(
      (visual) => `${visual.key}:${visual.questionId}:${visual.page}`,
    );
    return total + duplicateCount(identities);
  }, 0);
  const approvalBoundaryViolations = cases.filter(
    (entry) => entry.expected.approvalBlocked !== entry.candidate.approvalBlocked,
  ).length;
  const missingRequiredUnblocked = cases.filter((entry) => {
    if (!entry.expected.approvalBlocked) return false;
    const required = entry.expected.visuals.some((visual) => visual.required);
    return required && entry.candidate.visuals.length === 0 && !entry.candidate.approvalBlocked;
  }).length;

  return {
    approvalBoundaryViolations,
    attachmentAssociation: prf(expected, candidate),
    duplicateAssets,
    fabricatedPageRefs,
    invalidBboxes,
    missingRequiredUnblocked,
  };
}

export function evaluateRunState(runState) {
  const crossOrganizationVisibility = runState.assetAuthorizationResults.filter(
    (result) => result.requesterOrganization !== result.ownerOrganization && result.allowed,
  ).length;
  const nonReviewDrafts = runState.reviewDrafts.filter(
    (draft) => draft.status !== "pending_review" || draft.published === true,
  ).length;

  return {
    authorizationEvidenceCount: runState.assetAuthorizationResults.filter(
      (result) => result.authorizationEvidence === "question_asset_route_runtime_negative",
    ).length,
    assignmentsCreated: runState.assignments.length,
    autoApprovedOrPublished: nonReviewDrafts + runState.publications.length,
    crossOrganizationVisibility,
    pendingReviewDrafts: runState.reviewDrafts.filter(
      (draft) => draft.status === "pending_review" && draft.published === false,
    ).length,
    publicationsCreated: runState.publications.length,
  };
}

export function evaluateGoldenCorpus({ parsing, runState, taxonomy, visual }) {
  const result = {
    parsing: evaluateParsingCases(parsing),
    runState: evaluateRunState(runState),
    taxonomy: evaluateTaxonomyCases(taxonomy),
    visual: evaluateVisualCases(visual),
  };
  const hardZeroFailures = {
    assignmentSideEffects: result.runState.assignmentsCreated,
    autoApprovalOrPublication: result.runState.autoApprovedOrPublished,
    crossOrganizationVisibility: result.runState.crossOrganizationVisibility,
    duplicateAssets: result.visual.duplicateAssets,
    duplicateQuestions: result.parsing.duplicateQuestions,
    fabricatedPageRefs:
      result.parsing.fabricatedPageRefs + result.visual.fabricatedPageRefs,
    invalidTaxonomyPredictions: result.taxonomy.invalidPredictions,
    missingRequiredVisualUnblocked: result.visual.missingRequiredUnblocked,
    unvalidatedAnswers: result.parsing.unvalidatedAnswers,
  };
  const softGateFailures = [
    result.parsing.questionBoundary,
    result.parsing.answerPairing,
    result.parsing.pageAttribution,
    result.taxonomy.exactIdClassification,
    result.visual.attachmentAssociation,
  ].filter((metric) => metric.precision < 1 || metric.recall < 1).length +
    (result.taxonomy.candidateRetrievalRecall < 1 ? 1 : 0) +
    (result.taxonomy.aliasResolution.value < 1 ? 1 : 0) +
    (result.taxonomy.abstentionAccuracy.value < 1 ? 1 : 0) +
    (result.taxonomy.inactiveUnknownIdRejection.value < 1 ? 1 : 0) +
    (result.taxonomy.seedOnlyCoverage.candidateRecall < 1 ? 1 : 0) +
    (result.taxonomy.seedOnlyCoverage.exactIdClassification.f1 < 1 ? 1 : 0) +
    (result.taxonomy.pr214ExpansionCoverage.candidateRecall < 1 ? 1 : 0) +
    (result.taxonomy.pr214ExpansionCoverage.exactIdClassification.f1 < 1 ? 1 : 0) +
    result.parsing.mustRejectViolations +
    result.taxonomy.broadParentOvertags +
    result.taxonomy.duplicateTagIds +
    result.taxonomy.wrongFacet.violations +
    result.visual.invalidBboxes +
    result.visual.approvalBoundaryViolations;

  return {
    ...result,
    classification: Object.values(hardZeroFailures).every((value) => value === 0) && softGateFailures === 0
      ? "PASS"
      : "FAIL",
    evidenceClass: "SYNTHETIC_EVALUATOR_SANITY_BASELINE_ONLY",
    hardZeroFailures,
    softGateFailures,
  };
}
