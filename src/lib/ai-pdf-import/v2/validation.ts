import {
  AI_PARSING_V2_CONTRACT_VERSION,
  canonicalizationResultV2Schema,
  documentExtractionProposalV2Schema,
  documentExtractionV2Schema,
  generationRelevantFeatureKeysV2,
  qualityDispositionV2Schema,
  taxonomyFacetV2Schema,
  validationContextV2Schema,
  type ApplicationEvidenceStateV2,
  type ApplicationQuestionEvidenceV2,
  type ApplicationVisualEvidenceV2,
  type CanonicalAnswerProposalV2,
  type CanonicalQuestionPackageV2,
  type CanonicalizationResultV2,
  type DocumentExtractionProposalV2,
  type DocumentExtractionV2,
  type QualityDispositionV2,
  type QuestionBlockProposalV2,
  type SourceSpanProposalV2,
  type TaxonomyDecisionProposalV2,
  type ValidationContextV2,
  type ValidationFindingV2,
  type VisualFactProposalV2,
  type VisualObjectProposalV2,
} from "./contracts";
import { validateV2VisualWithMatureKernel } from "./visual-adapter";

const INVALID_PROVIDER_CODES = new Set<ValidationFindingV2["code"]>([
  "provider_schema_invalid",
  "source_asset_mismatch",
  "source_page_out_of_range",
  "source_fingerprint_unrecognized",
  "source_reference_missing",
  "source_question_relationship_invalid",
  "source_role_invalid",
  "question_reference_missing",
  "question_boundary_invalid",
  "duplicate_identifier",
  "option_reference_invalid",
  "visual_reference_invalid",
  "decorative_visual_marked_required",
  "visual_fact_reference_invalid",
  "answer_reference_invalid",
  "solution_reference_invalid",
  "solution_answer_inconsistent",
  "taxonomy_facet_missing_or_duplicate",
  "taxonomy_candidate_invalid",
  "generation_evidence_invalid",
  "assessment_inconsistent",
  "application_source_evidence_contradiction",
  "question_application_evidence_invalid",
  "visual_application_evidence_invalid",
  "question_limit_exceeded",
]);

const NEEDS_EVIDENCE_CODES = new Set<ValidationFindingV2["code"]>([
  "answer_only_source",
  "contradictory_source_evidence",
  "incomplete_question",
  "missing_page",
  "question_boundary_ambiguous",
  "required_visual_missing",
  "visual_association_ambiguous",
  "answer_source_unsupported",
  "solution_missing",
  "application_source_evidence_ambiguous",
]);

function finding(
  code: ValidationFindingV2["code"],
  scope: ValidationFindingV2["scope"],
  severity: ValidationFindingV2["severity"],
  relatedIds: string[] = [],
): ValidationFindingV2 {
  return {
    code,
    relatedIds: Array.from(new Set(relatedIds)).slice(0, 20),
    scope,
    severity,
  };
}

function duplicateIds<T>(items: T[], readId: (item: T) => string) {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const item of items) {
    const id = readId(item);
    if (seen.has(id)) duplicates.add(id);
    seen.add(id);
  }
  return duplicates;
}

function addDuplicateFindings<T>(
  findings: ValidationFindingV2[],
  items: T[],
  readId: (item: T) => string,
  scope: ValidationFindingV2["scope"],
) {
  for (const id of duplicateIds(items, readId)) {
    findings.push(finding("duplicate_identifier", scope, "error", [id]));
  }
}

function sourceSpanFindings(
  span: SourceSpanProposalV2,
  context: ValidationContextV2,
) {
  const findings: ValidationFindingV2[] = [];
  const pages = new Set(context.source.availablePageNumbers);

  if (span.sourceAssetRef !== context.source.sourceAssetRef) {
    findings.push(
      finding("source_asset_mismatch", "source", "error", [span.id]),
    );
  }

  if (
    span.pageStart !== null &&
    span.pageEnd !== null &&
    (!pages.has(span.pageStart) ||
      !pages.has(span.pageEnd) ||
      span.pageEnd > context.source.pageCount)
  ) {
    findings.push(
      finding("source_page_out_of_range", "source", "error", [span.id]),
    );
  }

  if (
    span.precision === "exact" &&
    span.textFingerprintSha256 !== null &&
    !context.source.allowedTextFingerprintsSha256.includes(
      span.textFingerprintSha256,
    )
  ) {
    findings.push(
      finding("source_fingerprint_unrecognized", "source", "error", [
        span.id,
      ]),
    );
  }

  return findings;
}

type ApplicationAssessment = {
  evidenceState: ApplicationEvidenceStateV2;
  sufficiency: DocumentExtractionProposalV2["assessment"]["sufficiency"];
};

function deriveApplicationAssessment(
  context: ValidationContextV2,
): ApplicationAssessment {
  const evidence = context.applicationEvidence;
  const kinds = new Set(evidence.questionEvidence.map((item) => item.kind));

  if (
    evidence.coverage === "unsupported" ||
    context.source.sourceKind === "unsupported"
  ) {
    return {
      evidenceState: "unsupported_source",
      sufficiency: "unsupported_source",
    };
  }
  if (
    evidence.coverage === "partial" ||
    evidence.coverage === "ambiguous" ||
    kinds.has("ambiguous") ||
    (kinds.has("question") &&
      (kinds.has("incomplete_question") || kinds.has("answer_only")))
  ) {
    return {
      evidenceState: "ambiguous",
      sufficiency: "insufficient_evidence",
    };
  }
  if (kinds.has("question")) {
    return { evidenceState: "extractable", sufficiency: "extractable" };
  }
  if (kinds.has("incomplete_question") || kinds.has("answer_only")) {
    return {
      evidenceState: "insufficient_evidence",
      sufficiency: "insufficient_evidence",
    };
  }
  return { evidenceState: "no_questions", sufficiency: "no_questions" };
}

function questionEvidenceMatchesSpan(
  evidence: ApplicationQuestionEvidenceV2,
  span: SourceSpanProposalV2,
) {
  return (
    span.pageStart === evidence.pageStart &&
    span.pageEnd === evidence.pageEnd &&
    (evidence.textFingerprintSha256 === null ||
      span.textFingerprintSha256 === evidence.textFingerprintSha256)
  );
}

function applicationQuestionEvidenceFindings({
  context,
  questions,
  spansById,
}: {
  context: ValidationContextV2;
  questions: QuestionBlockProposalV2[];
  spansById: Map<string, SourceSpanProposalV2>;
}) {
  const findings: ValidationFindingV2[] = [];
  const evidenceIdsByQuestion = new Map<string, string[]>();
  const questionsByEvidenceId = new Map<string, QuestionBlockProposalV2[]>();
  const evidenceById = new Map(
    context.applicationEvidence.questionEvidence.map((item) => [item.id, item]),
  );

  for (const question of questions) {
    const promptSpans = question.sourceSpanIds
      .map((spanId) => spansById.get(spanId))
      .filter((span): span is SourceSpanProposalV2 => Boolean(span));
    const matched = context.applicationEvidence.questionEvidence.filter(
      (evidence) =>
        promptSpans.some((span) => questionEvidenceMatchesSpan(evidence, span)),
    );
    const matchedIds = Array.from(new Set(matched.map((item) => item.id)));
    evidenceIdsByQuestion.set(question.id, matchedIds);

    for (const id of matchedIds) {
      const values = questionsByEvidenceId.get(id) ?? [];
      values.push(question);
      questionsByEvidenceId.set(id, values);
    }

    const hasQuestionEvidence = matched.some((item) => item.kind === "question");
    const hasAmbiguousEvidence = matched.some(
      (item) => item.kind === "ambiguous",
    );
    if (
      context.applicationEvidence.coverage === "ambiguous" ||
      context.applicationEvidence.coverage === "partial" ||
      hasAmbiguousEvidence
    ) {
      findings.push(
        matchedIds.length > 0
          ? finding(
              "application_source_evidence_ambiguous",
              "question",
              "warning",
              [question.id, ...matchedIds],
            )
          : finding(
              "question_application_evidence_invalid",
              "question",
              "error",
              [question.id],
            ),
      );
    } else if (!hasQuestionEvidence) {
      findings.push(
        finding(
          "question_application_evidence_invalid",
          "question",
          "error",
          [question.id, ...matchedIds],
        ),
      );
    }
  }

  for (const [evidenceId, relatedQuestions] of questionsByEvidenceId) {
    const evidence = evidenceById.get(evidenceId);
    if (!evidence || relatedQuestions.length <= 1) continue;

    const validSharedPrompt =
      evidence.relationship === "shared_prompt" &&
      relatedQuestions.every(
        (question) => question.boundaryKind === "shared_prompt",
      );
    const parent = relatedQuestions.find(
      (question) => question.boundaryKind === "multipart_parent",
    );
    const validMultipart =
      evidence.relationship === "multipart" &&
      parent !== undefined &&
      relatedQuestions.every(
        (question) =>
          question.id === parent.id ||
          (question.boundaryKind === "multipart_child" &&
            question.parentQuestionId === parent.id &&
            parent.childQuestionIds.includes(question.id)),
      );
    if (!validSharedPrompt && !validMultipart) {
      findings.push(
        finding(
          "question_application_evidence_invalid",
          "question",
          "error",
          [evidenceId, ...relatedQuestions.map((question) => question.id)],
        ),
      );
    }
  }

  return { evidenceIdsByQuestion, findings };
}

function bboxMatches(
  left: SourceSpanProposalV2["bbox"],
  right: ApplicationVisualEvidenceV2["bbox"],
) {
  if (!left) return false;
  return (["height", "width", "x", "y"] as const).every(
    (key) => Math.abs(left[key] - right[key]) <= 0.000001,
  );
}

function matchingApplicationVisualEvidence(
  sourceSpan: SourceSpanProposalV2 | null,
  context: ValidationContextV2,
) {
  if (
    !sourceSpan ||
    sourceSpan.pageStart === null ||
    sourceSpan.pageEnd !== sourceSpan.pageStart
  ) {
    return null;
  }
  const matches = context.applicationEvidence.visualEvidence.filter(
    (evidence) =>
      evidence.page === sourceSpan.pageStart &&
      bboxMatches(sourceSpan.bbox, evidence.bbox),
  );
  return matches.length === 1 ? matches[0]! : null;
}

function applicationVisualSupportsQuestions({
  applicationVisualEvidence,
  evidenceIdsByQuestion,
  visual,
}: {
  applicationVisualEvidence: ApplicationVisualEvidenceV2 | null;
  evidenceIdsByQuestion: Map<string, string[]>;
  visual: VisualObjectProposalV2;
}) {
  if (!applicationVisualEvidence) return false;
  if (visual.kind === "decorative") return true;
  return visual.questionIds.every((questionId) =>
    (evidenceIdsByQuestion.get(questionId) ?? []).some((evidenceId) =>
      applicationVisualEvidence.questionEvidenceIds.includes(evidenceId),
    ),
  );
}

function questionPageRefsForVisual({
  applicationVisualEvidence,
  questionsById,
  sourceSpansById,
  visual,
}: {
  applicationVisualEvidence: ApplicationVisualEvidenceV2 | null;
  questionsById: Map<string, QuestionBlockProposalV2>;
  sourceSpansById: Map<string, SourceSpanProposalV2>;
  visual: VisualObjectProposalV2;
}) {
  return Array.from(
    new Set([
      ...visual.questionIds.flatMap((questionId) => {
        const question = questionsById.get(questionId);
        return question
          ? question.sourceSpanIds.flatMap((spanId) => {
              const span = sourceSpansById.get(spanId);
              if (span?.pageStart === null || span?.pageStart === undefined) {
                return [];
              }
              const pageEnd = span.pageEnd ?? span.pageStart;
              return Array.from(
                { length: pageEnd - span.pageStart + 1 },
                (_, index) => span.pageStart! + index,
              );
            })
          : [];
      }),
      ...(applicationVisualEvidence ? [applicationVisualEvidence.page] : []),
    ]),
  );
}

function questionBoundaryFindings(
  question: QuestionBlockProposalV2,
  questionsById: Map<string, QuestionBlockProposalV2>,
) {
  const findings: ValidationFindingV2[] = [];
  const parent = question.parentQuestionId
    ? questionsById.get(question.parentQuestionId)
    : null;

  if (question.parentQuestionId && !parent) {
    findings.push(
      finding("question_reference_missing", "question", "error", [
        question.id,
        question.parentQuestionId,
      ]),
    );
  }

  for (const childId of question.childQuestionIds) {
    const child = questionsById.get(childId);
    if (!child) {
      findings.push(
        finding("question_reference_missing", "question", "error", [
          question.id,
          childId,
        ]),
      );
      continue;
    }
    if (child.parentQuestionId !== question.id) {
      findings.push(
        finding("question_boundary_invalid", "question", "error", [
          question.id,
          childId,
        ]),
      );
    }
  }

  const parentShapeValid =
    question.boundaryKind === "multipart_parent" &&
    question.questionType === "multipart" &&
    question.parentQuestionId === null &&
    question.childQuestionIds.length > 0;
  const childShapeValid =
    question.boundaryKind === "multipart_child" &&
    question.questionType !== "multipart" &&
    question.parentQuestionId !== null &&
    question.childQuestionIds.length === 0;

  if (
    (question.boundaryKind === "multipart_parent" && !parentShapeValid) ||
    (question.boundaryKind === "multipart_child" && !childShapeValid) ||
    (question.questionType === "multipart" && !parentShapeValid) ||
    (question.parentQuestionId !== null &&
      question.boundaryKind !== "multipart_child")
  ) {
    findings.push(
      finding("question_boundary_invalid", "question", "error", [question.id]),
    );
  }

  if (question.boundaryKind === "ambiguous") {
    findings.push(
      finding("question_boundary_ambiguous", "question", "warning", [
        question.id,
      ]),
    );
  }

  if (
    parent &&
    (!parent.childQuestionIds.includes(question.id) ||
      parent.boundaryKind !== "multipart_parent")
  ) {
    findings.push(
      finding("question_boundary_invalid", "question", "error", [
        question.id,
        parent.id,
      ]),
    );
  }

  return findings;
}

function answerKindMatchesQuestion(
  answer: CanonicalAnswerProposalV2,
  question: QuestionBlockProposalV2,
) {
  return answer.kind === question.questionType;
}

function answerValueEqual(
  left: CanonicalAnswerProposalV2,
  right: CanonicalAnswerProposalV2,
): boolean {
  if (left.kind !== right.kind) return false;

  switch (left.kind) {
    case "multiple_choice": {
      if (right.kind !== "multiple_choice") return false;
      const leftIds = [...left.selectedOptionIds].sort();
      const rightIds = [...right.selectedOptionIds].sort();
      return (
        left.allowMultiple === right.allowMultiple &&
        leftIds.length === rightIds.length &&
        leftIds.every((value, index) => value === rightIds[index])
      );
    }
    case "boolean":
      return right.kind === "boolean" && left.value === right.value;
    case "numeric": {
      if (right.kind !== "numeric") return false;
      const tolerance = Math.max(left.tolerance ?? 0, right.tolerance ?? 0);
      return (
        Math.abs(left.value - right.value) <= tolerance &&
        (left.unit ?? "").trim().toLocaleLowerCase("en-US") ===
          (right.unit ?? "").trim().toLocaleLowerCase("en-US")
      );
    }
    case "short_text": {
      if (right.kind !== "short_text") return false;
      const normalize = (value: string, caseSensitive: boolean) =>
        caseSensitive
          ? value.trim()
          : value.trim().toLocaleLowerCase("en-US");
      const leftValues = left.acceptedTexts
        .map((value) => normalize(value, left.caseSensitive))
        .sort();
      const rightValues = right.acceptedTexts
        .map((value) => normalize(value, right.caseSensitive))
        .sort();
      return (
        left.caseSensitive === right.caseSensitive &&
        leftValues.length === rightValues.length &&
        leftValues.every((value, index) => value === rightValues[index])
      );
    }
    case "free_response": {
      if (right.kind !== "free_response") return false;
      const normalize = (values: string[]) =>
        values
          .map((value) => value.trim().toLocaleLowerCase("en-US"))
          .sort();
      const leftRubric = normalize(left.rubricPoints);
      const rightRubric = normalize(right.rubricPoints);
      return (
        leftRubric.length === rightRubric.length &&
        leftRubric.every((value, index) => value === rightRubric[index])
      );
    }
    case "multipart": {
      if (right.kind !== "multipart") return false;
      const rightByQuestion = new Map(
        right.parts.map((part) => [part.questionId, part.answer]),
      );
      return (
        left.parts.length === right.parts.length &&
        left.parts.every((part) => {
          const comparison = rightByQuestion.get(part.questionId);
          return comparison
            ? answerValueEqual(part.answer, comparison)
            : false;
        })
      );
    }
  }
}

function answerFindings({
  answer,
  question,
  questionsById,
  spansById,
}: {
  answer: CanonicalAnswerProposalV2;
  question: QuestionBlockProposalV2;
  questionsById: Map<string, QuestionBlockProposalV2>;
  spansById: Map<string, SourceSpanProposalV2>;
}) {
  const findings: ValidationFindingV2[] = [];

  if (!answerKindMatchesQuestion(answer, question)) {
    findings.push(
      finding("answer_reference_invalid", "question", "error", [question.id]),
    );
  }

  if (
    answer.support === "source_supported" &&
    answer.sourceSpanIds.length === 0
  ) {
    findings.push(
      finding("answer_reference_invalid", "question", "error", [question.id]),
    );
  }
  if (answer.support !== "source_supported") {
    findings.push(
      finding("answer_source_unsupported", "question", "warning", [
        question.id,
      ]),
    );
  }
  const expectedSupport =
    answer.provenance === "model_derived"
      ? "inferred"
      : "source_supported";
  if (answer.support !== expectedSupport) {
    findings.push(
      finding("answer_reference_invalid", "question", "error", [question.id]),
    );
  }
  const allowedRolesByProvenance = {
    model_derived: ["prompt", "explanation", "worked_solution"],
    source_answer_key: ["answer_key"],
    source_explicit_answer: ["answer_key", "explanation"],
    source_worked_solution: ["worked_solution"],
  } as const;
  for (const spanId of answer.sourceSpanIds) {
    const span = spansById.get(spanId);
    if (
      !span ||
      !(allowedRolesByProvenance[answer.provenance] as readonly string[]).includes(
        span.role,
      )
    ) {
      findings.push(
        finding("answer_reference_invalid", "question", "error", [
          question.id,
          spanId,
        ]),
      );
    }
    if (span && !span.questionIds.includes(question.id)) {
      findings.push(
        finding(
          "source_question_relationship_invalid",
          "question",
          "error",
          [question.id, spanId],
        ),
      );
    }
  }

  if (answer.kind === "multiple_choice") {
    const optionIds = new Set(question.options.map((option) => option.id));
    if (
      answer.selectedOptionIds.some((optionId) => !optionIds.has(optionId)) ||
      (!answer.allowMultiple && answer.selectedOptionIds.length !== 1)
    ) {
      findings.push(
        finding("option_reference_invalid", "question", "error", [question.id]),
      );
    }
  }

  if (answer.kind === "multipart") {
    const expectedChildren = new Set(question.childQuestionIds);
    const seenParts = new Set<string>();
    for (const part of answer.parts) {
      const child = questionsById.get(part.questionId);
      if (
        seenParts.has(part.questionId) ||
        !expectedChildren.has(part.questionId) ||
        !child ||
        !answerKindMatchesQuestion(part.answer, child)
      ) {
        findings.push(
          finding("answer_reference_invalid", "question", "error", [
            question.id,
            part.questionId,
          ]),
        );
      }
      seenParts.add(part.questionId);
      if (child) {
        findings.push(
          ...answerFindings({
            answer: part.answer,
            question: child,
            questionsById,
            spansById,
          }),
        );
      }
    }
    if (seenParts.size !== expectedChildren.size) {
      findings.push(
        finding("answer_reference_invalid", "question", "error", [question.id]),
      );
    }
  }

  return findings;
}

function taxonomyFindings(
  questionId: string,
  decisions: TaxonomyDecisionProposalV2[],
  context: ValidationContextV2,
) {
  const findings: ValidationFindingV2[] = [];
  const expectedFacets = taxonomyFacetV2Schema.options;
  const facetCounts = new Map<string, number>();
  const candidates = new Map(
    context.taxonomyCandidates.map((candidate) => [candidate.tagId, candidate]),
  );

  for (const decision of decisions) {
    facetCounts.set(decision.facet, (facetCounts.get(decision.facet) ?? 0) + 1);
    if (decision.decision === "assign" && decision.tagId) {
      const candidate = candidates.get(decision.tagId);
      if (
        !candidate ||
        candidate.facet !== decision.facet ||
        !candidate.active ||
        !candidate.assignable ||
        !candidate.effectiveLeaf
      ) {
        findings.push(
          finding("taxonomy_candidate_invalid", "taxonomy", "error", [
            questionId,
            decision.tagId,
          ]),
        );
      }
    }
  }

  if (
    decisions.length !== expectedFacets.length ||
    expectedFacets.some((facet) => facetCounts.get(facet) !== 1)
  ) {
    findings.push(
      finding(
        "taxonomy_facet_missing_or_duplicate",
        "taxonomy",
        "error",
        [questionId],
      ),
    );
  }

  return findings;
}

function dispositionFromFindings({
  evidenceState,
  findings,
}: {
  evidenceState: ApplicationEvidenceStateV2;
  findings: ValidationFindingV2[];
}): QualityDispositionV2 {
  const codes = Array.from(new Set(findings.map((item) => item.code)));
  let status: QualityDispositionV2["status"] = "review_ready";

  if (findings.some((item) => INVALID_PROVIDER_CODES.has(item.code))) {
    status = "invalid_provider_output";
  } else if (evidenceState === "ambiguous") {
    status = "needs_more_evidence";
  } else if (evidenceState !== "extractable") {
    status = "insufficient_source";
  } else if (findings.some((item) => NEEDS_EVIDENCE_CODES.has(item.code))) {
    status = "needs_more_evidence";
  }

  return qualityDispositionV2Schema.parse({
    authority: "application",
    findingCodes: codes,
    status,
    version: "quality_disposition_v2",
  });
}

function safeSchemaIssues(error: { issues: Array<{ path: PropertyKey[] }> }) {
  return Array.from(
    new Set(
      error.issues.slice(0, 20).map((issue) => {
        const safePath = issue.path
          .map((segment) =>
            typeof segment === "number" ? "index" : String(segment),
          )
          .join(".");
        return `provider_schema_invalid:${safePath || "root"}`.slice(0, 100);
      }),
    ),
  );
}

function canonicalVisualObject(
  visual: VisualObjectProposalV2,
  sourceSpansById: Map<string, SourceSpanProposalV2>,
  questionsById: Map<string, QuestionBlockProposalV2>,
  context: ValidationContextV2,
) {
  const sourceSpan = visual.sourceSpanId
    ? (sourceSpansById.get(visual.sourceSpanId) ?? null)
    : null;
  const applicationVisualEvidence = matchingApplicationVisualEvidence(
    sourceSpan,
    context,
  );
  const questionPageRefs = questionPageRefsForVisual({
    applicationVisualEvidence,
    questionsById,
    sourceSpansById,
    visual,
  });
  const adapter = validateV2VisualWithMatureKernel({
    availablePageNumbers: context.source.availablePageNumbers,
    pageCount: context.source.pageCount,
    questionPageRefs,
    sourceSpan: sourceSpan ?? null,
    visual,
  });

  return {
    ...visual,
    applicationEvidenceId: applicationVisualEvidence?.id ?? null,
    authority: "application_validated" as const,
    deterministicCropProposalKey: adapter.deterministicCropProposalKey,
    persistentAssetIdentity: null,
    version: "visual_object_v2" as const,
  };
}

function questionRelatedFindings(
  findings: ValidationFindingV2[],
  question: QuestionBlockProposalV2,
) {
  const related = new Set([
    question.id,
    ...question.sourceSpanIds,
    ...question.requiredVisualIds,
    ...question.options.flatMap((option) => [option.id, ...option.sourceSpanIds]),
  ]);
  return findings.filter((item) =>
    item.relatedIds.some((id) => related.has(id)),
  );
}

function validateProposal(
  proposal: DocumentExtractionProposalV2,
  context: ValidationContextV2,
) {
  const findings: ValidationFindingV2[] = [];

  addDuplicateFindings(findings, proposal.sourceSpans, (item) => item.id, "source");
  addDuplicateFindings(
    findings,
    proposal.questionBlocks,
    (item) => item.id,
    "question",
  );
  addDuplicateFindings(
    findings,
    proposal.visualObjects,
    (item) => item.id,
    "visual",
  );
  addDuplicateFindings(
    findings,
    proposal.visualFacts,
    (item) => item.id,
    "visual",
  );
  addDuplicateFindings(
    findings,
    proposal.questionPackages,
    (item) => item.questionId,
    "question",
  );

  if (proposal.questionBlocks.length > context.maximumQuestions) {
    findings.push(finding("question_limit_exceeded", "document", "error"));
  }

  const rawSpansById = new Map(proposal.sourceSpans.map((span) => [span.id, span]));
  const invalidSpanIds = new Set<string>();
  for (const span of proposal.sourceSpans) {
    const spanFindings = sourceSpanFindings(span, context);
    if (spanFindings.length) invalidSpanIds.add(span.id);
    findings.push(...spanFindings);
  }
  for (const spanId of proposal.assessment.evidenceSpanIds) {
    if (!rawSpansById.has(spanId) || invalidSpanIds.has(spanId)) {
      findings.push(
        finding("source_reference_missing", "document", "error", [spanId]),
      );
    }
  }
  for (const assessmentFinding of proposal.assessment.findings) {
    for (const spanId of assessmentFinding.evidenceSpanIds) {
      if (!rawSpansById.has(spanId) || invalidSpanIds.has(spanId)) {
        findings.push(
          finding("source_reference_missing", "document", "error", [spanId]),
        );
      }
    }
    const mappedCode =
      assessmentFinding.code === "missing_required_visual"
        ? "required_visual_missing"
        : assessmentFinding.code;
    findings.push(
      finding(
        mappedCode,
        "document",
        assessmentFinding.code === "missing_required_visual"
          ? "warning"
          : "info",
        assessmentFinding.evidenceSpanIds,
      ),
    );
  }

  const validSpans = proposal.sourceSpans.filter(
    (span) => !invalidSpanIds.has(span.id),
  );
  const validSpansById = new Map(validSpans.map((span) => [span.id, span]));
  const questionsById = new Map(
    proposal.questionBlocks.map((question) => [question.id, question]),
  );
  const applicationAssessment = deriveApplicationAssessment(context);
  const applicationQuestionValidation =
    applicationQuestionEvidenceFindings({
      context,
      questions: proposal.questionBlocks,
      spansById: validSpansById,
    });
  findings.push(...applicationQuestionValidation.findings);

  for (const question of proposal.questionBlocks) {
    addDuplicateFindings(
      findings,
      question.options,
      (option) => option.id,
      "question",
    );
    findings.push(...questionBoundaryFindings(question, questionsById));
    for (const spanId of question.sourceSpanIds) {
      if (!validSpansById.has(spanId)) {
        findings.push(
          finding("source_reference_missing", "question", "error", [
            question.id,
            spanId,
          ]),
        );
      } else if (validSpansById.get(spanId)?.role !== "prompt") {
        findings.push(
          finding("source_role_invalid", "question", "error", [
            question.id,
            spanId,
          ]),
        );
      } else if (!validSpansById.get(spanId)?.questionIds.includes(question.id)) {
        findings.push(
          finding(
            "source_question_relationship_invalid",
            "question",
            "error",
            [question.id, spanId],
          ),
        );
      }
    }
    for (const option of question.options) {
      for (const spanId of option.sourceSpanIds) {
        if (!validSpansById.has(spanId)) {
          findings.push(
            finding("source_reference_missing", "question", "error", [
              question.id,
              option.id,
              spanId,
            ]),
          );
        } else if (validSpansById.get(spanId)?.role !== "option") {
          findings.push(
            finding("source_role_invalid", "question", "error", [
              question.id,
              option.id,
              spanId,
            ]),
          );
        } else if (
          !validSpansById.get(spanId)?.questionIds.includes(question.id)
        ) {
          findings.push(
            finding(
              "source_question_relationship_invalid",
              "question",
              "error",
              [question.id, option.id, spanId],
            ),
          );
        }
      }
    }
  }

  const visualObjectsById = new Map(
    proposal.visualObjects.map((visual) => [visual.id, visual]),
  );
  const invalidVisualIds = new Set<string>();
  for (const visual of proposal.visualObjects) {
    const visualFindings: ValidationFindingV2[] = [];
    const sourceSpan = visual.sourceSpanId
      ? (validSpansById.get(visual.sourceSpanId) ?? null)
      : null;
    const applicationVisualEvidence = matchingApplicationVisualEvidence(
      sourceSpan,
      context,
    );
    const applicationAssociationValid = applicationVisualSupportsQuestions({
      applicationVisualEvidence,
      evidenceIdsByQuestion:
        applicationQuestionValidation.evidenceIdsByQuestion,
      visual,
    });
    if (
      visual.sourceSpanId !== null &&
      !validSpansById.has(visual.sourceSpanId)
    ) {
      visualFindings.push(
        finding("visual_reference_invalid", "visual", "error", [
          visual.id,
          ...visual.questionIds,
        ]),
      );
    }
    if (
      visual.sourceSpanId !== null &&
      validSpansById.get(visual.sourceSpanId)?.role !== "required_visual"
    ) {
      visualFindings.push(
        finding("source_role_invalid", "visual", "error", [
          visual.id,
          visual.sourceSpanId,
          ...visual.questionIds,
        ]),
      );
    }
    if (
      visual.sourceSpanId !== null &&
      visual.questionIds.some(
        (questionId) =>
          !validSpansById
            .get(visual.sourceSpanId!)
            ?.questionIds.includes(questionId),
      )
    ) {
      visualFindings.push(
        finding(
          "source_question_relationship_invalid",
          "visual",
          "error",
          [visual.id, visual.sourceSpanId, ...visual.questionIds],
        ),
      );
    }
    if (visual.kind === "missing" && visual.sourceSpanId !== null) {
      visualFindings.push(
        finding("visual_reference_invalid", "visual", "error", [
          visual.id,
          ...visual.questionIds,
        ]),
      );
    }
    if (visual.kind === "decorative" && visual.required) {
      visualFindings.push(
        finding(
          "decorative_visual_marked_required",
          "visual",
          "error",
          [visual.id, ...visual.questionIds],
        ),
      );
    }
    if (visual.kind === "missing" && visual.required) {
      visualFindings.push(
        finding("required_visual_missing", "visual", "warning", [
          visual.id,
          ...visual.questionIds,
        ]),
      );
    }
    if (visual.kind === "ambiguous" && visual.required) {
      visualFindings.push(
        finding(
          "visual_association_ambiguous",
          "visual",
          "warning",
          [visual.id, ...visual.questionIds],
        ),
      );
    }
    if (visual.kind !== "missing" && applicationVisualEvidence === null) {
      visualFindings.push(
        finding(
          "visual_application_evidence_invalid",
          "visual",
          "error",
          [visual.id, ...visual.questionIds],
        ),
      );
    }
    if (applicationVisualEvidence) {
      const kindMatches =
        visual.kind === "ambiguous" ||
        applicationVisualEvidence.kind === "ambiguous" ||
        visual.kind === applicationVisualEvidence.kind;
      if (!kindMatches) {
        visualFindings.push(
          finding(
            "visual_application_evidence_invalid",
            "visual",
            "error",
            [visual.id, applicationVisualEvidence.id, ...visual.questionIds],
          ),
        );
      } else if (
        visual.kind === "ambiguous" ||
        applicationVisualEvidence.kind === "ambiguous"
      ) {
        visualFindings.push(
          finding(
            "visual_association_ambiguous",
            "visual",
            "warning",
            [visual.id, applicationVisualEvidence.id, ...visual.questionIds],
          ),
        );
      }

      if (!applicationAssociationValid) {
        visualFindings.push(
          finding(
            "visual_application_evidence_invalid",
            "visual",
            "error",
            [visual.id, applicationVisualEvidence.id, ...visual.questionIds],
          ),
        );
      }
    }
    for (const questionId of visual.questionIds) {
      if (!questionsById.has(questionId)) {
        visualFindings.push(
          finding("question_reference_missing", "visual", "error", [
            visual.id,
            questionId,
          ]),
        );
      }
    }
    const matureValidation = validateV2VisualWithMatureKernel({
      availablePageNumbers: context.source.availablePageNumbers,
      pageCount: context.source.pageCount,
      questionPageRefs: questionPageRefsForVisual({
        applicationVisualEvidence: applicationAssociationValid
          ? applicationVisualEvidence
          : null,
        questionsById,
        sourceSpansById: validSpansById,
        visual,
      }),
      sourceSpan,
      visual,
    });
    if (!matureValidation.valid) {
      visualFindings.push(
        finding("visual_reference_invalid", "visual", "error", [
          visual.id,
          ...visual.questionIds,
        ]),
      );
    }
    if (visualFindings.some((item) => item.severity === "error")) {
      invalidVisualIds.add(visual.id);
    }
    findings.push(...visualFindings);
  }

  for (const question of proposal.questionBlocks) {
    for (const visualId of question.requiredVisualIds) {
      const visual = visualObjectsById.get(visualId);
      if (
        !visual ||
        invalidVisualIds.has(visualId) ||
        !visual.questionIds.includes(question.id) ||
        !visual.required
      ) {
        findings.push(
          finding("visual_reference_invalid", "question", "error", [
            question.id,
            visualId,
          ]),
        );
      }
      if (visual?.kind === "missing") {
        findings.push(
          finding("required_visual_missing", "question", "warning", [
            question.id,
            visualId,
          ]),
        );
      }
    }
  }

  const visualFactsById = new Map(
    proposal.visualFacts.map((fact) => [fact.id, fact]),
  );
  const invalidVisualFactIds = new Set<string>();
  for (const fact of proposal.visualFacts) {
    const factVisual = visualObjectsById.get(fact.visualObjectId);
    if (
      !factVisual ||
      invalidVisualIds.has(fact.visualObjectId) ||
      fact.sourceSpanIds.some(
        (spanId) =>
          !validSpansById.has(spanId) ||
          validSpansById.get(spanId)?.role !== "required_visual" ||
          factVisual.questionIds.some(
            (questionId) =>
              !validSpansById.get(spanId)?.questionIds.includes(questionId),
          ),
      )
    ) {
      invalidVisualFactIds.add(fact.id);
      findings.push(
        finding("visual_fact_reference_invalid", "visual", "error", [
          fact.id,
          fact.visualObjectId,
        ]),
      );
    }
  }

  const proposalPackagesByQuestion = new Map(
    proposal.questionPackages.map((item) => [item.questionId, item]),
  );
  for (const question of proposal.questionBlocks) {
    if (!proposalPackagesByQuestion.has(question.id)) {
      findings.push(
        finding("question_reference_missing", "question", "error", [question.id]),
      );
    }
  }

  for (const item of proposal.questionPackages) {
    const question = questionsById.get(item.questionId);
    if (!question) {
      findings.push(
        finding("question_reference_missing", "question", "error", [
          item.questionId,
        ]),
      );
      continue;
    }

    findings.push(
      ...answerFindings({
        answer: item.answer,
        question,
        questionsById,
        spansById: validSpansById,
      }),
    );
    findings.push(...taxonomyFindings(question.id, item.taxonomyDecisions, context));

    if (!item.solution) {
      findings.push(
        finding("solution_missing", "question", "warning", [question.id]),
      );
    } else {
      const invalidSource = [
        ...item.solution.sourceSpanIds,
        ...item.solution.steps.flatMap((step) => step.sourceSpanIds),
      ].some((spanId) => {
        const span = validSpansById.get(spanId);
        const allowedRoles =
          item.solution?.conclusion.provenance === "model_derived"
            ? ["prompt", "worked_solution", "explanation"]
            : ["worked_solution", "explanation"];
        return (
          !span ||
          !allowedRoles.includes(span.role) ||
          !span.questionIds.includes(question.id)
        );
      });
      const invalidFact = item.solution.steps.some((step) =>
        step.visualFactIds.some((factId) => {
          const fact = visualFactsById.get(factId);
          const visual = fact
            ? visualObjectsById.get(fact.visualObjectId)
            : null;
          return (
            !fact ||
            invalidVisualFactIds.has(factId) ||
            !visual ||
            invalidVisualIds.has(visual.id) ||
            !visual.questionIds.includes(question.id)
          );
        }),
      );
      if (invalidSource || invalidFact) {
        findings.push(
          finding("solution_reference_invalid", "question", "error", [
            question.id,
          ]),
        );
      }
      if (!answerValueEqual(item.answer, item.solution.conclusion)) {
        findings.push(
          finding("solution_answer_inconsistent", "question", "error", [
            question.id,
          ]),
        );
      }
    }

    for (const observation of generationRelevantFeatureKeysV2.flatMap(
      (key) => item.generationRelevantFeatures[key],
    )) {
      if (
        observation.evidenceSpanIds.some(
          (spanId) =>
            !validSpansById.has(spanId) ||
            !validSpansById.get(spanId)?.questionIds.includes(question.id),
        )
      ) {
        findings.push(
          finding("generation_evidence_invalid", "question", "error", [
            question.id,
          ]),
        );
      }
    }
    for (const decision of item.taxonomyDecisions) {
      if (
        decision.evidenceSpanIds.some(
          (spanId) =>
            !validSpansById.has(spanId) ||
            !validSpansById.get(spanId)?.questionIds.includes(question.id),
        )
      ) {
        findings.push(
          finding(
            "source_question_relationship_invalid",
            "taxonomy",
            "error",
            [question.id, ...decision.evidenceSpanIds],
          ),
        );
      }
    }
  }

  const hasQuestions = proposal.questionBlocks.length > 0;
  const hasPackages = proposal.questionPackages.length > 0;
  const providerAssessmentInconsistent =
    (proposal.assessment.sufficiency === "extractable" &&
      (!hasQuestions || !hasPackages)) ||
    (proposal.assessment.sufficiency !== "extractable" &&
      (hasQuestions || hasPackages)) ||
    (proposal.assessment.sufficiency === "unsupported_source" &&
      context.source.sourceKind !== "unsupported") ||
    (context.source.sourceKind === "unsupported" &&
      proposal.assessment.sufficiency !== "unsupported_source");
  if (providerAssessmentInconsistent) {
    findings.push(finding("assessment_inconsistent", "document", "error"));
  }

  const applicationAssessmentContradicted =
    (applicationAssessment.evidenceState === "extractable" &&
      (proposal.assessment.sufficiency !== "extractable" ||
        !hasQuestions ||
        !hasPackages)) ||
    (applicationAssessment.evidenceState === "no_questions" &&
      (proposal.assessment.sufficiency !== "no_questions" ||
        hasQuestions ||
        hasPackages)) ||
    (applicationAssessment.evidenceState === "insufficient_evidence" &&
      (proposal.assessment.sufficiency !== "insufficient_evidence" ||
        hasQuestions ||
        hasPackages)) ||
    (applicationAssessment.evidenceState === "unsupported_source" &&
      (proposal.assessment.sufficiency !== "unsupported_source" ||
        hasQuestions ||
        hasPackages)) ||
    (applicationAssessment.evidenceState === "ambiguous" &&
      proposal.assessment.sufficiency === "unsupported_source");
  if (applicationAssessmentContradicted) {
    findings.push(
      finding(
        "application_source_evidence_contradiction",
        "document",
        "error",
      ),
    );
  } else if (applicationAssessment.evidenceState === "ambiguous") {
    findings.push(
      finding(
        "application_source_evidence_ambiguous",
        "document",
        "warning",
      ),
    );
  }

  return {
    findings,
    applicationAssessment,
    applicationEvidenceIdsByQuestion:
      applicationQuestionValidation.evidenceIdsByQuestion,
    invalidVisualFactIds,
    invalidVisualIds,
    proposalPackagesByQuestion,
    questionsById,
    validSpans,
    validSpansById,
    visualObjectsById,
  };
}

function buildCanonicalExtraction(
  proposal: DocumentExtractionProposalV2,
  context: ValidationContextV2,
): DocumentExtractionV2 {
  const validation = validateProposal(proposal, context);
  const {
    applicationAssessment,
    applicationEvidenceIdsByQuestion,
    findings,
    invalidVisualFactIds,
    invalidVisualIds,
    questionsById,
    validSpans,
    validSpansById,
    visualObjectsById,
  } = validation;

  const canonicalSpans = validSpans.map((span) => ({
    ...span,
    authority: "application_validated" as const,
    version: "source_span_v2" as const,
  }));
  const canonicalVisuals = proposal.visualObjects
    .filter((visual) => !invalidVisualIds.has(visual.id))
    .map((visual) =>
      canonicalVisualObject(visual, validSpansById, questionsById, context),
    );
  const canonicalVisualFacts = proposal.visualFacts
    .filter((fact) => !invalidVisualFactIds.has(fact.id))
    .map((fact) => ({
      ...fact,
      evidenceAuthority: "provider_proposal" as const,
      version: "visual_fact_v2" as const,
    }));

  const canonicalPackages: CanonicalQuestionPackageV2[] = [];
  for (const item of proposal.questionPackages) {
    const question = questionsById.get(item.questionId);
    if (!question) continue;

    const packageFindings = questionRelatedFindings(findings, question);
    const disposition = dispositionFromFindings({
      evidenceState: applicationAssessment.evidenceState,
      findings: packageFindings,
    });
    if (disposition.status === "invalid_provider_output") continue;

    const questionSpanIds = new Set([
      ...question.sourceSpanIds,
      ...question.options.flatMap((option) => option.sourceSpanIds),
      ...item.answer.sourceSpanIds,
      ...(item.solution?.sourceSpanIds ?? []),
      ...(item.solution?.steps.flatMap((step) => step.sourceSpanIds) ?? []),
      ...item.taxonomyDecisions.flatMap((decision) => decision.evidenceSpanIds),
      ...generationRelevantFeatureKeysV2.flatMap((key) =>
        item.generationRelevantFeatures[key].flatMap(
          (observation) => observation.evidenceSpanIds,
        ),
      ),
    ]);
    const packageVisualIds = new Set([
      ...question.requiredVisualIds,
      ...canonicalVisuals
        .filter((visual) => visual.questionIds.includes(question.id))
        .map((visual) => visual.id),
    ]);
    const packageVisualFacts = canonicalVisualFacts.filter((fact) =>
      packageVisualIds.has(fact.visualObjectId),
    );

    canonicalPackages.push({
      answer: {
        authority: "application_validated",
        proposal: item.answer,
        version: "canonical_answer_v2",
      },
      authority: "application",
      disposition,
      generationRelevantFeatures: {
        ...item.generationRelevantFeatures,
        authority: "provider_proposal",
        candidateStatus: "candidate_only",
        version: "generation_relevant_features_v2",
      },
      question: {
        ...question,
        applicationEvidenceIds:
          applicationEvidenceIdsByQuestion.get(question.id) ?? [],
        authority: "application_validated",
        version: "question_block_v2",
      },
      solution: item.solution
        ? {
            authority: "application_validated",
            proposal: item.solution,
            version: "auditable_solution_v2",
          }
        : null,
      sourceSpans: canonicalSpans.filter((span) => questionSpanIds.has(span.id)),
      taxonomyDecisions: item.taxonomyDecisions.map((decision) => ({
        ...decision,
        authority: "application_validated",
        version: "taxonomy_decision_v2",
      })),
      version: "canonical_question_package_v2",
      visualFacts: packageVisualFacts,
      visualObjects: canonicalVisuals.filter((visual) =>
        packageVisualIds.has(visual.id),
      ),
    });
  }

  if (
    applicationAssessment.evidenceState === "extractable" &&
    canonicalPackages.length === 0
  ) {
    findings.push(finding("assessment_inconsistent", "document", "error"));
  }

  const documentDisposition = dispositionFromFindings({
    evidenceState: applicationAssessment.evidenceState,
    findings: findings.filter(
      (item) =>
        item.scope === "document" ||
        item.scope === "source" ||
        INVALID_PROVIDER_CODES.has(item.code) ||
        item.code === "duplicate_identifier" ||
        item.code === "question_limit_exceeded",
    ),
  });
  const effectiveDocumentDisposition =
    documentDisposition.status === "review_ready" &&
    canonicalPackages.length > 0 &&
    canonicalPackages.every(
      (item) => item.disposition.status === "needs_more_evidence",
    )
      ? dispositionFromFindings({
          evidenceState: applicationAssessment.evidenceState,
          findings: [finding("required_visual_missing", "document", "warning")],
        })
      : documentDisposition;

  return documentExtractionV2Schema.parse({
    assessment: {
      authority: "application",
      evidenceState: applicationAssessment.evidenceState,
      providerProposal: proposal.assessment,
      sufficiency: applicationAssessment.sufficiency,
      version: "document_assessment_v2",
    },
    authority: "application",
    bankScopeKey: context.source.bankScopeKey,
    disposition: effectiveDocumentDisposition,
    findings,
    fingerprints: {
      candidateSubsetSha256: context.candidateSubsetSha256,
      parsingContractSha256: context.parsingContractSha256,
      proposalSchemaSha256: context.proposalSchemaSha256,
      taxonomySnapshotSha256: context.taxonomySnapshotSha256,
    },
    questionPackages: canonicalPackages,
    sourceSpans: canonicalSpans,
    version: AI_PARSING_V2_CONTRACT_VERSION,
    visualFacts: canonicalVisualFacts,
    visualObjects: canonicalVisuals,
  });
}

export function canonicalizeDocumentExtractionV2({
  context: rawContext,
  proposal: rawProposal,
}: {
  context: unknown;
  proposal: unknown;
}): CanonicalizationResultV2 {
  const contextResult = validationContextV2Schema.safeParse(rawContext);
  if (!contextResult.success) {
    return canonicalizationResultV2Schema.parse({
      extraction: null,
      safeIssueCodes: ["validation_context_invalid"],
      success: false,
    });
  }

  const proposalResult = documentExtractionProposalV2Schema.safeParse(rawProposal);
  if (!proposalResult.success) {
    return canonicalizationResultV2Schema.parse({
      extraction: null,
      safeIssueCodes: safeSchemaIssues(proposalResult.error),
      success: false,
    });
  }

  const extraction = buildCanonicalExtraction(
    proposalResult.data,
    contextResult.data,
  );
  const success = extraction.disposition.status !== "invalid_provider_output";

  return canonicalizationResultV2Schema.parse({
    extraction,
    safeIssueCodes: Array.from(
      new Set(extraction.findings.map((item) => item.code)),
    ),
    success,
  });
}

export function toSafeCanonicalizationSummaryV2(
  result: CanonicalizationResultV2,
) {
  return Object.freeze({
    documentDisposition: result.extraction?.disposition.status ?? null,
    questionPackageCount: result.extraction?.questionPackages.length ?? 0,
    safeIssueCodes: Object.freeze([...result.safeIssueCodes]),
    success: result.success,
    version: "ai_parsing_v2_safe_diagnostics_v1" as const,
  });
}

export function documentExtractionV2HasWritableProjection(
  extraction: DocumentExtractionV2,
) {
  return (
    extraction.disposition.status !== "invalid_provider_output" &&
    extraction.disposition.status !== "insufficient_source" &&
    extraction.questionPackages.some(
      (item) =>
        item.disposition.status === "review_ready" ||
        item.disposition.status === "needs_more_evidence",
    )
  );
}

export function visualFactBelongsToQuestionV2({
  fact,
  questionId,
  visual,
}: {
  fact: VisualFactProposalV2;
  questionId: string;
  visual: VisualObjectProposalV2;
}) {
  return fact.visualObjectId === visual.id && visual.questionIds.includes(questionId);
}
