const SHA256_PATTERN = /^[a-f0-9]{64}$/;

export const visualEvidenceQuestionNumbers = Object.freeze(["1", "2", "3", "4"]);

export class VisualEvidenceContractError extends Error {
  constructor(predicate) {
    super(predicate);
    this.predicate = predicate;
  }
}

function requirePredicate(condition, predicate, results) {
  results.push({ predicate, result: condition ? "PASS" : "FAIL" });
  if (!condition) throw new VisualEvidenceContractError(predicate);
}

function finiteUnitBox(value) {
  return (
    value &&
    Number.isFinite(value.x) &&
    Number.isFinite(value.y) &&
    Number.isFinite(value.width) &&
    Number.isFinite(value.height) &&
    value.x >= 0 &&
    value.y >= 0 &&
    value.width > 0 &&
    value.height > 0 &&
    value.x + value.width <= 1 &&
    value.y + value.height <= 1
  );
}

function questionByNumber(observation, number) {
  return observation.questions.find(
    (question) => question.visibleQuestionNumber === number,
  );
}

function records(question) {
  return Array.isArray(question.visualEvidence?.records)
    ? question.visualEvidence.records
    : [];
}

function placeholders(question) {
  return Array.isArray(question.placeholders) ? question.placeholders : [];
}

function assets(question) {
  return Array.isArray(question.assets) ? question.assets : [];
}

function validateAttachedQuestion({
  observation,
  question,
  expectedPage,
  requireSharedGroup,
  results,
}) {
  const questionRecords = records(question);
  const questionAssets = assets(question);
  const questionPlaceholders = placeholders(question);

  requirePredicate(
    question.reviewStatus === "pending_review",
    `question_${expectedPage}_pending_review`,
    results,
  );
  requirePredicate(
    question.visualEvidence?.required === true &&
      question.visualEvidence?.status === "validated" &&
      question.visualEvidence?.sourceAssetId === observation.sourceAssetId,
    `question_${expectedPage}_visual_contract`,
    results,
  );
  requirePredicate(
    questionPlaceholders.length === 1 &&
      questionPlaceholders[0].page === expectedPage &&
      questionPlaceholders[0].required === true &&
      questionPlaceholders[0].visual_role !== "decorative",
    `question_${expectedPage}_required_proposal`,
    results,
  );
  requirePredicate(
    questionRecords.length === 1 && questionAssets.length === 1,
    `question_${expectedPage}_single_asset`,
    results,
  );

  const record = questionRecords[0];
  const asset = questionAssets[0];
  requirePredicate(
    record.assetId === asset.id &&
      asset.questionId === question.questionId &&
      record.sourceAssetId === observation.sourceAssetId &&
      record.page === expectedPage &&
      record.required === true,
    `question_${expectedPage}_exact_lineage`,
    results,
  );
  requirePredicate(
    finiteUnitBox(record.bbox) &&
      SHA256_PATTERN.test(record.contentSha256 ?? "") &&
      record.contentHashMatches === true &&
      record.deterministicIdentityMatches === true,
    `question_${expectedPage}_crop_integrity`,
    results,
  );
  requirePredicate(
    asset.bucket === "question-assets" &&
      asset.storageObjectPresent === true &&
      asset.directPublicDenied === true,
    `question_${expectedPage}_private_storage`,
    results,
  );
  requirePredicate(
    requireSharedGroup
      ? typeof record.sharedGroupKey === "string" &&
          record.sharedGroupKey.length > 0
      : record.sharedGroupKey === null,
    `question_${expectedPage}_shared_group_contract`,
    results,
  );
}

export function validateVisualEvidenceLiveObservation(observation) {
  const results = [];
  const numbers = observation.questions.map(
    (question) => question.visibleQuestionNumber,
  );
  requirePredicate(
    observation.pageCount === 4 && observation.sourceHashMatches === true,
    "authoritative_source_pdf",
    results,
  );
  requirePredicate(
    observation.questions.length === 4 &&
      visualEvidenceQuestionNumbers.every((number) => numbers.includes(number)) &&
      new Set(numbers).size === 4,
    "exact_visual_question_set",
    results,
  );
  requirePredicate(
    observation.questions.every(
      (question) =>
        question.pageRefs.length === 1 &&
        question.pageRefs[0] === Number(question.visibleQuestionNumber),
    ),
    "exact_page_lineage",
    results,
  );

  const diagram = questionByNumber(observation, "1");
  const decorative = questionByNumber(observation, "2");
  const missing = questionByNumber(observation, "3");
  const shared = questionByNumber(observation, "4");

  validateAttachedQuestion({
    expectedPage: 1,
    observation,
    question: diagram,
    requireSharedGroup: false,
    results,
  });

  const decorativePlaceholders = placeholders(decorative);
  requirePredicate(
    decorative.reviewStatus === "pending_review" &&
      (decorativePlaceholders.length === 0 ||
        decorativePlaceholders.every(
          (placeholder) =>
            placeholder.page === 2 &&
            placeholder.required === false &&
            placeholder.visual_role === "decorative",
        )) &&
      records(decorative).length === 0 &&
      assets(decorative).length === 0,
    "decorative_visual_suppressed",
    results,
  );

  requirePredicate(
    missing.reviewStatus === "needs_more_evidence" &&
      placeholders(missing).length === 0 &&
      missing.visualEvidence?.required === true &&
      missing.visualEvidence?.status === "needs_more_evidence" &&
      missing.visualEvidence?.sourceAssetId === observation.sourceAssetId &&
      records(missing).length === 0 &&
      assets(missing).length === 0 &&
      missing.hasMissingVisualWarning === true,
    "missing_required_visual_blocked",
    results,
  );

  validateAttachedQuestion({
    expectedPage: 4,
    observation,
    question: shared,
    requireSharedGroup: true,
    results,
  });

  const allAssets = observation.questions.flatMap((question) => assets(question));
  requirePredicate(
    allAssets.length === 2 &&
      new Set(allAssets.map((asset) => asset.id)).size === 2 &&
      observation.totalAssetCount === 2 &&
      observation.orphanAssetCount === 0,
    "exact_asset_cardinality",
    results,
  );
  requirePredicate(
    observation.bucketPrivate === true &&
      observation.anonymousAssetVisibilityCount === 0 &&
      observation.outsiderAssetVisibilityCount === 0 &&
      observation.crossOrganizationVisibilityCount === 0,
    "requester_first_asset_isolation",
    results,
  );
  requirePredicate(
    observation.teacherAuthorizedRouteCount === 2 &&
      observation.anonymousAuthorizedRouteCount === 0 &&
      observation.outsiderAuthorizedRouteCount === 0,
    "protected_asset_route_authorization",
    results,
  );
  requirePredicate(
    observation.ui.initialAssetCount === 2 &&
      observation.ui.reloadAssetCount === 2 &&
      observation.ui.remountAssetCount === 2 &&
      observation.ui.missingWarningVisible === true,
    "teacher_review_render_reload_remount",
    results,
  );
  requirePredicate(
    observation.bankApprovalCount === 0 &&
      observation.publicationCount === 0 &&
      observation.assignmentCount === 0,
    "review_gate_preserved",
    results,
  );
  requirePredicate(
    observation.providerInferenceAttempts === 1 &&
      observation.providerInferenceRequests === 1 &&
      observation.providerNetworkRequests <= observation.maxProviderNetworkRequests,
    "one_shot_provider_budget",
    results,
  );
  requirePredicate(
    observation.secretOrRawContentEmissionCount === 0,
    "sanitized_evidence_output",
    results,
  );

  return Object.freeze({ predicates: results, valid: true });
}
