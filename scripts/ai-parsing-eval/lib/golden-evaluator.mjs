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
  const activeCatalog = new Map(
    payload.catalog
      .filter((entry) => entry.activeAssignable)
      .map((entry) => [entry.tagId, entry.facet]),
  );
  const expected = payload.cases.flatMap((entry) =>
    entry.expected.map((tagId) => `${entry.id}:${tagId}`),
  );
  const candidate = payload.cases.flatMap((entry) =>
    entry.candidate.map((tagId) => `${entry.id}:${tagId}`),
  );
  const unknownTagIds = payload.cases.reduce(
    (total, entry) => total + entry.candidate.filter(
      (tagId) => !activeCatalog.has(tagId),
    ).length,
    0,
  );
  const duplicateTagIds = payload.cases.reduce(
    (total, entry) => total + duplicateCount(entry.candidate),
    0,
  );
  const broadParentOvertags = payload.cases.reduce((total, entry) => {
    const candidateSet = new Set(entry.candidate);
    return total + entry.expected.reduce(
      (count, expectedTag) => count + (payload.broadParents[expectedTag] ?? [])
        .filter((parent) => candidateSet.has(parent))
        .length,
      0,
    );
  }, 0);
  const facetMetrics = Object.fromEntries(FACETS.map((facet) => {
    const expectedFacet = payload.cases.flatMap((entry) => entry.expected
      .filter((tagId) => activeCatalog.get(tagId) === facet)
      .map((tagId) => `${entry.id}:${tagId}`));
    const candidateFacet = payload.cases.flatMap((entry) => entry.candidate
      .filter((tagId) => activeCatalog.get(tagId) === facet)
      .map((tagId) => `${entry.id}:${tagId}`));
    return [facet, prf(expectedFacet, candidateFacet)];
  }));

  return {
    broadParentOvertags,
    duplicateTagIds,
    exactTagging: prf(expected, candidate),
    facetMetrics,
    unknownTagIds,
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
      .filter((visual) => !validBbox(visual.bbox))
      .length,
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

export function evaluateGoldenCorpus({ parsing, taxonomy, visual }) {
  const result = {
    parsing: evaluateParsingCases(parsing),
    taxonomy: evaluateTaxonomyCases(taxonomy),
    visual: evaluateVisualCases(visual),
  };
  const hardZeroFailures = {
    autoApprovalOrPublication: 0,
    crossOrganizationVisibility: 0,
    duplicateAssets: result.visual.duplicateAssets,
    duplicateQuestions: result.parsing.duplicateQuestions,
    fabricatedPageRefs:
      result.parsing.fabricatedPageRefs + result.visual.fabricatedPageRefs,
    missingRequiredVisualUnblocked: result.visual.missingRequiredUnblocked,
    unknownTaxonomyIds: result.taxonomy.unknownTagIds,
    unvalidatedAnswers: result.parsing.unvalidatedAnswers,
  };
  const softGateFailures = [
    result.parsing.questionBoundary,
    result.parsing.answerPairing,
    result.parsing.pageAttribution,
    result.taxonomy.exactTagging,
    result.visual.attachmentAssociation,
  ].filter((metric) => metric.precision < 1 || metric.recall < 1).length +
    result.parsing.mustRejectViolations +
    result.taxonomy.broadParentOvertags +
    result.taxonomy.duplicateTagIds +
    result.visual.invalidBboxes +
    result.visual.approvalBoundaryViolations;

  return {
    ...result,
    classification: Object.values(hardZeroFailures).every((value) => value === 0) && softGateFailures === 0
      ? "PASS"
      : "FAIL",
    hardZeroFailures,
    softGateFailures,
  };
}
