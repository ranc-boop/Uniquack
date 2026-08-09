import { z } from "zod";

export const AI_PARSING_V2_CONTRACT_VERSION =
  "ai_parsing_canonical_v2" as const;
export const AI_PARSING_V2_PROPOSAL_VERSION =
  "ai_parsing_proposal_v2" as const;
export const AI_PARSING_V2_CONTEXT_VERSION =
  "ai_parsing_validation_context_v2" as const;

const boundedIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/);
const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const confidenceSchema = z.number().finite().min(0).max(1);
const boundedTextSchema = z.string().trim().min(1).max(4_000);
const boundedShortTextSchema = z.string().trim().min(1).max(500);

export const taxonomyFacetV2Schema = z.enum([
  "curriculum",
  "concept",
  "method",
  "task",
  "form",
]);
export type TaxonomyFacetV2 = z.infer<typeof taxonomyFacetV2Schema>;

export const sourceSufficiencyV2Schema = z.enum([
  "extractable",
  "no_questions",
  "insufficient_evidence",
  "unsupported_source",
]);
export type SourceSufficiencyV2 = z.infer<
  typeof sourceSufficiencyV2Schema
>;

export const sourceEvidenceRoleV2Schema = z.enum([
  "prompt",
  "option",
  "answer_key",
  "worked_solution",
  "explanation",
  "required_visual",
]);

export const sourcePrecisionV2Schema = z.enum([
  "exact",
  "page_level",
  "region_level",
  "unknown",
]);

export const sourceAssessmentFindingCodeV2Schema = z.enum([
  "incomplete_question",
  "answer_only_source",
  "missing_page",
  "missing_required_visual",
  "notes_without_question",
  "unsupported_content",
  "contradictory_source_evidence",
]);

export const sourceAssessmentFindingProposalV2Schema = z
  .object({
    code: sourceAssessmentFindingCodeV2Schema,
    evidenceSpanIds: z.array(boundedIdSchema).max(50).default([]),
  })
  .strict();

export const normalizedBoundingBoxV2Schema = z
  .object({
    height: z.number().finite().gt(0).lte(1),
    width: z.number().finite().gt(0).lte(1),
    x: z.number().finite().min(0).lte(1),
    y: z.number().finite().min(0).lte(1),
  })
  .strict()
  .superRefine((bbox, context) => {
    if (bbox.x + bbox.width > 1) {
      context.addIssue({
        code: "custom",
        message: "Bounding box exceeds the horizontal source boundary.",
        path: ["width"],
      });
    }
    if (bbox.y + bbox.height > 1) {
      context.addIssue({
        code: "custom",
        message: "Bounding box exceeds the vertical source boundary.",
        path: ["height"],
      });
    }
  });

export const sourceSpanProposalV2Schema = z
  .object({
    bbox: normalizedBoundingBoxV2Schema.nullable().default(null),
    id: boundedIdSchema,
    pageEnd: z.number().int().positive().nullable().default(null),
    pageStart: z.number().int().positive().nullable().default(null),
    precision: sourcePrecisionV2Schema,
    questionIds: z.array(boundedIdSchema).max(200).default([]),
    role: sourceEvidenceRoleV2Schema,
    sourceAssetRef: boundedIdSchema,
    textFingerprintSha256: sha256Schema.nullable().default(null),
  })
  .strict()
  .superRefine((span, context) => {
    if ((span.pageStart === null) !== (span.pageEnd === null)) {
      context.addIssue({
        code: "custom",
        message: "Source page bounds must be supplied together.",
        path: ["pageEnd"],
      });
    }
    if (
      span.pageStart !== null &&
      span.pageEnd !== null &&
      span.pageStart > span.pageEnd
    ) {
      context.addIssue({
        code: "custom",
        message: "Source page bounds are inverted.",
        path: ["pageEnd"],
      });
    }
    if (span.precision !== "unknown" && span.pageStart === null) {
      context.addIssue({
        code: "custom",
        message: "Known source precision requires page lineage.",
        path: ["pageStart"],
      });
    }
    if (span.precision === "region_level" && span.bbox === null) {
      context.addIssue({
        code: "custom",
        message: "Region precision requires a normalized bounding box.",
        path: ["bbox"],
      });
    }
    if (
      span.precision === "exact" &&
      span.textFingerprintSha256 === null
    ) {
      context.addIssue({
        code: "custom",
        message: "Exact source precision requires a text fingerprint.",
        path: ["textFingerprintSha256"],
      });
    }
  });

export const sourceSpanV2Schema = sourceSpanProposalV2Schema.extend({
  authority: z.literal("application_validated"),
  version: z.literal("source_span_v2"),
});
export type SourceSpanProposalV2 = z.infer<
  typeof sourceSpanProposalV2Schema
>;
export type SourceSpanV2 = z.infer<typeof sourceSpanV2Schema>;

export const documentAssessmentProposalV2Schema = z
  .object({
    confidence: confidenceSchema,
    evidenceSpanIds: z.array(boundedIdSchema).max(100).default([]),
    findings: z
      .array(sourceAssessmentFindingProposalV2Schema)
      .max(100)
      .default([]),
    reasonCode: z.enum([
      "questions_detected",
      "no_question_content_detected",
      "answer_or_prompt_evidence_incomplete",
      "source_format_unsupported",
    ]),
    sufficiency: sourceSufficiencyV2Schema,
  })
  .strict();

export const documentAssessmentV2Schema =
  documentAssessmentProposalV2Schema.extend({
    authority: z.literal("application_validated"),
    version: z.literal("document_assessment_v2"),
  });
export type DocumentAssessmentProposalV2 = z.infer<
  typeof documentAssessmentProposalV2Schema
>;
export type DocumentAssessmentV2 = z.infer<
  typeof documentAssessmentV2Schema
>;

export const questionBoundaryKindV2Schema = z.enum([
  "standalone",
  "multipart_parent",
  "multipart_child",
  "shared_prompt",
  "cross_page_continuation",
  "shared_visual",
  "answer_key_continuation",
  "ambiguous",
]);

export const canonicalQuestionTypeV2Schema = z.enum([
  "multiple_choice",
  "boolean",
  "numeric",
  "short_text",
  "free_response",
  "multipart",
]);

export const questionOptionProposalV2Schema = z
  .object({
    id: boundedIdSchema,
    label: z.string().trim().min(1).max(20),
    sourceSpanIds: z.array(boundedIdSchema).min(1).max(20),
    text: boundedTextSchema,
  })
  .strict();

export const questionBlockProposalV2Schema = z
  .object({
    boundaryKind: questionBoundaryKindV2Schema,
    childQuestionIds: z.array(boundedIdSchema).max(50).default([]),
    confidence: confidenceSchema,
    difficultyRating: z.number().int().min(100).max(1_000),
    id: boundedIdSchema,
    options: z.array(questionOptionProposalV2Schema).max(20).default([]),
    parentQuestionId: boundedIdSchema.nullable().default(null),
    promptText: boundedTextSchema,
    questionType: canonicalQuestionTypeV2Schema,
    requiredVisualIds: z.array(boundedIdSchema).max(20).default([]),
    sourceSpanIds: z.array(boundedIdSchema).min(1).max(100),
    visibleNumber: z.string().trim().max(80).nullable().default(null),
  })
  .strict();

export const questionBlockV2Schema = questionBlockProposalV2Schema.extend({
  authority: z.literal("application_validated"),
  version: z.literal("question_block_v2"),
});
export type QuestionBlockProposalV2 = z.infer<
  typeof questionBlockProposalV2Schema
>;
export type QuestionBlockV2 = z.infer<typeof questionBlockV2Schema>;

export const visualObjectProposalV2Schema = z
  .object({
    confidence: confidenceSchema,
    description: z.string().trim().max(1_000).nullable().default(null),
    id: boundedIdSchema,
    kind: z.enum([
      "question",
      "answer_key",
      "shared",
      "decorative",
      "missing",
      "ambiguous",
    ]),
    questionIds: z.array(boundedIdSchema).max(100).default([]),
    required: z.boolean(),
    requiredForAnswering: z.boolean(),
    requiredForUnderstanding: z.boolean(),
    sourceSpanId: boundedIdSchema.nullable().default(null),
    visualType: z.enum([
      "diagram",
      "graph",
      "table",
      "image",
      "equation",
      "other",
    ]),
  })
  .strict()
  .superRefine((visual, context) => {
    if (
      visual.required !==
      (visual.requiredForAnswering || visual.requiredForUnderstanding)
    ) {
      context.addIssue({
        code: "custom",
        message:
          "Visual required must equal required-for-understanding or required-for-answering.",
        path: ["required"],
      });
    }
  });

export const visualObjectV2Schema = visualObjectProposalV2Schema.extend({
  authority: z.literal("application_validated"),
  deterministicCropProposalKey: z.string().trim().min(1).max(1_000).nullable(),
  persistentAssetIdentity: z.null(),
  version: z.literal("visual_object_v2"),
});
export type VisualObjectProposalV2 = z.infer<
  typeof visualObjectProposalV2Schema
>;
export type VisualObjectV2 = z.infer<typeof visualObjectV2Schema>;

export const visualFactProposalV2Schema = z
  .object({
    confidence: confidenceSchema,
    factType: z.enum([
      "axis",
      "label",
      "value",
      "relationship",
      "geometry",
      "table_cell",
      "other",
    ]),
    id: boundedIdSchema,
    sourceSpanIds: z.array(boundedIdSchema).min(1).max(20),
    statement: boundedShortTextSchema,
    visualObjectId: boundedIdSchema,
  })
  .strict();

export const visualFactV2Schema = visualFactProposalV2Schema.extend({
  evidenceAuthority: z.literal("provider_proposal"),
  version: z.literal("visual_fact_v2"),
});
export type VisualFactProposalV2 = z.infer<
  typeof visualFactProposalV2Schema
>;
export type VisualFactV2 = z.infer<typeof visualFactV2Schema>;

const answerEvidenceV2Shape = {
  provenance: z.enum([
    "source_answer_key",
    "source_worked_solution",
    "source_explicit_answer",
    "model_derived",
  ]),
  sourceSpanIds: z.array(boundedIdSchema).max(50).default([]),
  support: z.enum(["source_supported", "inferred", "unsupported"]),
};

export const multipleChoiceAnswerProposalV2Schema = z
  .object({
    ...answerEvidenceV2Shape,
    allowMultiple: z.boolean().default(false),
    kind: z.literal("multiple_choice"),
    selectedOptionIds: z.array(boundedIdSchema).min(1).max(20),
  })
  .strict();

export const booleanAnswerProposalV2Schema = z
  .object({
    ...answerEvidenceV2Shape,
    kind: z.literal("boolean"),
    value: z.boolean(),
  })
  .strict();

export const numericAnswerProposalV2Schema = z
  .object({
    ...answerEvidenceV2Shape,
    acceptedFormats: z.array(z.string().trim().min(1).max(120)).max(20).default([]),
    kind: z.literal("numeric"),
    tolerance: z.number().finite().nonnegative().nullable().default(null),
    unit: z.string().trim().max(80).nullable().default(null),
    value: z.number().finite(),
  })
  .strict();

export const shortTextAnswerProposalV2Schema = z
  .object({
    ...answerEvidenceV2Shape,
    acceptedTexts: z.array(z.string().trim().min(1).max(500)).min(1).max(30),
    caseSensitive: z.boolean().default(false),
    kind: z.literal("short_text"),
  })
  .strict();

export const freeResponseAnswerProposalV2Schema = z
  .object({
    ...answerEvidenceV2Shape,
    exemplarAnswer: z.string().trim().max(4_000).nullable().default(null),
    kind: z.literal("free_response"),
    rubricPoints: z.array(boundedShortTextSchema).min(1).max(20),
  })
  .strict();

export const nonMultipartAnswerProposalV2Schema = z.discriminatedUnion("kind", [
  multipleChoiceAnswerProposalV2Schema,
  booleanAnswerProposalV2Schema,
  numericAnswerProposalV2Schema,
  shortTextAnswerProposalV2Schema,
  freeResponseAnswerProposalV2Schema,
]);

export const multipartAnswerProposalV2Schema = z
  .object({
    ...answerEvidenceV2Shape,
    kind: z.literal("multipart"),
    parts: z
      .array(
        z
          .object({
            answer: nonMultipartAnswerProposalV2Schema,
            questionId: boundedIdSchema,
          })
          .strict(),
      )
      .min(1)
      .max(50),
  })
  .strict();

export const canonicalAnswerProposalV2Schema = z.discriminatedUnion("kind", [
  multipleChoiceAnswerProposalV2Schema,
  booleanAnswerProposalV2Schema,
  numericAnswerProposalV2Schema,
  shortTextAnswerProposalV2Schema,
  freeResponseAnswerProposalV2Schema,
  multipartAnswerProposalV2Schema,
]);

export const canonicalAnswerV2Schema = z
  .object({
    authority: z.literal("application_validated"),
    proposal: canonicalAnswerProposalV2Schema,
    version: z.literal("canonical_answer_v2"),
  })
  .strict();
export type CanonicalAnswerProposalV2 = z.infer<
  typeof canonicalAnswerProposalV2Schema
>;
export type CanonicalAnswerV2 = z.infer<typeof canonicalAnswerV2Schema>;

export const solutionStepProposalV2Schema = z
  .object({
    id: boundedIdSchema,
    intermediateResult: z.string().trim().max(1_000).nullable().default(null),
    sourceSpanIds: z.array(boundedIdSchema).min(1).max(30),
    text: boundedTextSchema,
    visualFactIds: z.array(boundedIdSchema).max(30).default([]),
  })
  .strict();

export const auditableSolutionProposalV2Schema = z
  .object({
    conclusion: canonicalAnswerProposalV2Schema,
    sourceSpanIds: z.array(boundedIdSchema).min(1).max(50),
    steps: z.array(solutionStepProposalV2Schema).min(1).max(20),
    summary: boundedTextSchema,
  })
  .strict();

export const auditableSolutionV2Schema = z
  .object({
    authority: z.literal("application_validated"),
    proposal: auditableSolutionProposalV2Schema,
    version: z.literal("auditable_solution_v2"),
  })
  .strict();
export type AuditableSolutionProposalV2 = z.infer<
  typeof auditableSolutionProposalV2Schema
>;
export type AuditableSolutionV2 = z.infer<
  typeof auditableSolutionV2Schema
>;

export const taxonomyDecisionProposalV2Schema = z
  .object({
    confidence: confidenceSchema,
    decision: z.enum(["assign", "abstain"]),
    evidenceSpanIds: z.array(boundedIdSchema).max(50).default([]),
    facet: taxonomyFacetV2Schema,
    rationaleCode: z.enum([
      "exact_evidence",
      "ambiguous",
      "no_candidate",
      "insufficient_evidence",
    ]),
    tagId: boundedIdSchema.nullable().default(null),
  })
  .strict()
  .superRefine((decision, context) => {
    if (decision.decision === "assign" && decision.tagId === null) {
      context.addIssue({
        code: "custom",
        message: "Assigned taxonomy decisions require an exact tag ID.",
        path: ["tagId"],
      });
    }
    if (decision.decision === "abstain" && decision.tagId !== null) {
      context.addIssue({
        code: "custom",
        message: "Taxonomy abstention cannot include a tag ID.",
        path: ["tagId"],
      });
    }
  });

export const taxonomyDecisionV2Schema =
  taxonomyDecisionProposalV2Schema.extend({
    authority: z.literal("application_validated"),
    version: z.literal("taxonomy_decision_v2"),
  });
export type TaxonomyDecisionProposalV2 = z.infer<
  typeof taxonomyDecisionProposalV2Schema
>;
export type TaxonomyDecisionV2 = z.infer<
  typeof taxonomyDecisionV2Schema
>;

export const generationObservationProposalV2Schema = z
  .object({
    confidence: confidenceSchema,
    evidenceSpanIds: z.array(boundedIdSchema).min(1).max(50),
    recurrenceEvidenceCount: z.number().int().positive().max(100),
    value: boundedShortTextSchema,
  })
  .strict();

export const generationRelevantFeatureKeysV2 = [
  "instanceSpecificDetails",
  "parameterCandidates",
  "invariantCandidates",
  "reasoningOperators",
  "solutionSkeleton",
  "answerDerivationRelation",
  "visualGrammarObservations",
  "difficultySignals",
  "distractorObservations",
  "surfaceSpecificDetails",
] as const;

export const generationRelevantFeaturesProposalV2Schema = z
  .object({
    answerDerivationRelation: z.array(generationObservationProposalV2Schema).max(50).default([]),
    difficultySignals: z.array(generationObservationProposalV2Schema).max(50).default([]),
    distractorObservations: z.array(generationObservationProposalV2Schema).max(50).default([]),
    instanceSpecificDetails: z.array(generationObservationProposalV2Schema).max(100).default([]),
    invariantCandidates: z.array(generationObservationProposalV2Schema).max(50).default([]),
    parameterCandidates: z.array(generationObservationProposalV2Schema).max(50).default([]),
    reasoningOperators: z.array(generationObservationProposalV2Schema).max(50).default([]),
    solutionSkeleton: z.array(generationObservationProposalV2Schema).max(50).default([]),
    surfaceSpecificDetails: z.array(generationObservationProposalV2Schema).max(100).default([]),
    visualGrammarObservations: z.array(generationObservationProposalV2Schema).max(50).default([]),
  })
  .strict();

export const generationRelevantFeaturesV2Schema = z
  .object({
    authority: z.literal("provider_proposal"),
    candidateStatus: z.literal("candidate_only"),
    answerDerivationRelation: z.array(generationObservationProposalV2Schema).max(50),
    difficultySignals: z.array(generationObservationProposalV2Schema).max(50),
    distractorObservations: z.array(generationObservationProposalV2Schema).max(50),
    instanceSpecificDetails: z.array(generationObservationProposalV2Schema).max(100),
    invariantCandidates: z.array(generationObservationProposalV2Schema).max(50),
    parameterCandidates: z.array(generationObservationProposalV2Schema).max(50),
    reasoningOperators: z.array(generationObservationProposalV2Schema).max(50),
    solutionSkeleton: z.array(generationObservationProposalV2Schema).max(50),
    surfaceSpecificDetails: z.array(generationObservationProposalV2Schema).max(100),
    version: z.literal("generation_relevant_features_v2"),
    visualGrammarObservations: z.array(generationObservationProposalV2Schema).max(50),
  })
  .strict();
export type GenerationRelevantFeaturesProposalV2 = z.infer<
  typeof generationRelevantFeaturesProposalV2Schema
>;
export type GenerationRelevantFeaturesV2 = z.infer<
  typeof generationRelevantFeaturesV2Schema
>;

export const questionPackageProposalV2Schema = z
  .object({
    answer: canonicalAnswerProposalV2Schema,
    generationRelevantFeatures:
      generationRelevantFeaturesProposalV2Schema.default({
        answerDerivationRelation: [],
        difficultySignals: [],
        distractorObservations: [],
        instanceSpecificDetails: [],
        invariantCandidates: [],
        parameterCandidates: [],
        reasoningOperators: [],
        solutionSkeleton: [],
        surfaceSpecificDetails: [],
        visualGrammarObservations: [],
      }),
    questionId: boundedIdSchema,
    solution: auditableSolutionProposalV2Schema.nullable().default(null),
    taxonomyDecisions: z
      .array(taxonomyDecisionProposalV2Schema)
      .length(5),
  })
  .strict();

export const validationFindingCodeV2Schema = z.enum([
  "provider_schema_invalid",
  "source_asset_mismatch",
  "source_page_out_of_range",
  "source_fingerprint_unrecognized",
  "source_reference_missing",
  "source_question_relationship_invalid",
  "source_role_invalid",
  "question_reference_missing",
  "question_boundary_invalid",
  "question_boundary_ambiguous",
  "duplicate_identifier",
  "option_reference_invalid",
  "visual_reference_invalid",
  "required_visual_missing",
  "visual_association_ambiguous",
  "decorative_visual_marked_required",
  "visual_fact_reference_invalid",
  "answer_reference_invalid",
  "answer_source_unsupported",
  "solution_missing",
  "solution_reference_invalid",
  "solution_answer_inconsistent",
  "taxonomy_facet_missing_or_duplicate",
  "taxonomy_candidate_invalid",
  "generation_evidence_invalid",
  "assessment_inconsistent",
  "question_limit_exceeded",
  "incomplete_question",
  "answer_only_source",
  "missing_page",
  "notes_without_question",
  "unsupported_content",
  "contradictory_source_evidence",
]);

export const validationFindingV2Schema = z
  .object({
    code: validationFindingCodeV2Schema,
    relatedIds: z.array(boundedIdSchema).max(20).default([]),
    scope: z.enum(["document", "question", "source", "visual", "taxonomy"]),
    severity: z.enum(["error", "warning", "info"]),
  })
  .strict();
export type ValidationFindingV2 = z.infer<
  typeof validationFindingV2Schema
>;

export const qualityDispositionStatusV2Schema = z.enum([
  "review_ready",
  "needs_more_evidence",
  "insufficient_source",
  "invalid_provider_output",
]);

export const qualityDispositionV2Schema = z
  .object({
    authority: z.literal("application"),
    findingCodes: z.array(validationFindingCodeV2Schema),
    status: qualityDispositionStatusV2Schema,
    version: z.literal("quality_disposition_v2"),
  })
  .strict();
export type QualityDispositionV2 = z.infer<
  typeof qualityDispositionV2Schema
>;

export const canonicalQuestionPackageV2Schema = z
  .object({
    answer: canonicalAnswerV2Schema,
    authority: z.literal("application"),
    disposition: qualityDispositionV2Schema,
    generationRelevantFeatures: generationRelevantFeaturesV2Schema,
    question: questionBlockV2Schema,
    solution: auditableSolutionV2Schema.nullable(),
    sourceSpans: z.array(sourceSpanV2Schema),
    taxonomyDecisions: z.array(taxonomyDecisionV2Schema).length(5),
    version: z.literal("canonical_question_package_v2"),
    visualFacts: z.array(visualFactV2Schema),
    visualObjects: z.array(visualObjectV2Schema),
  })
  .strict();
export type CanonicalQuestionPackageV2 = z.infer<
  typeof canonicalQuestionPackageV2Schema
>;

export const documentExtractionProposalV2Schema = z
  .object({
    assessment: documentAssessmentProposalV2Schema,
    questionBlocks: z.array(questionBlockProposalV2Schema).max(200).default([]),
    questionPackages: z.array(questionPackageProposalV2Schema).max(200).default([]),
    sourceSpans: z.array(sourceSpanProposalV2Schema).max(2_000).default([]),
    version: z.literal(AI_PARSING_V2_PROPOSAL_VERSION),
    visualFacts: z.array(visualFactProposalV2Schema).max(2_000).default([]),
    visualObjects: z.array(visualObjectProposalV2Schema).max(1_000).default([]),
    warningCodes: z.array(boundedIdSchema).max(100).default([]),
  })
  .strict();
export type DocumentExtractionProposalV2 = z.infer<
  typeof documentExtractionProposalV2Schema
>;

export const extractionContractFingerprintsV2Schema = z
  .object({
    candidateSubsetSha256: sha256Schema,
    parsingContractSha256: sha256Schema,
    proposalSchemaSha256: sha256Schema,
    taxonomySnapshotSha256: sha256Schema,
  })
  .strict();

export const documentExtractionV2Schema = z
  .object({
    assessment: documentAssessmentV2Schema,
    authority: z.literal("application"),
    bankScopeKey: boundedIdSchema,
    disposition: qualityDispositionV2Schema,
    findings: z.array(validationFindingV2Schema),
    fingerprints: extractionContractFingerprintsV2Schema,
    questionPackages: z.array(canonicalQuestionPackageV2Schema).max(200),
    sourceSpans: z.array(sourceSpanV2Schema).max(2_000),
    version: z.literal(AI_PARSING_V2_CONTRACT_VERSION),
    visualFacts: z.array(visualFactV2Schema).max(2_000),
    visualObjects: z.array(visualObjectV2Schema).max(1_000),
  })
  .strict();
export type DocumentExtractionV2 = z.infer<
  typeof documentExtractionV2Schema
>;

export const validationSourceContextV2Schema = z
  .object({
    allowedTextFingerprintsSha256: z.array(sha256Schema).max(5_000).default([]),
    availablePageNumbers: z.array(z.number().int().positive()).min(1).max(5_000),
    bankScopeKey: boundedIdSchema,
    pageCount: z.number().int().positive().max(5_000),
    sourceAssetRef: boundedIdSchema,
    sourceKind: z.enum(["pdf", "image", "text", "html", "unsupported"]),
    sourceSha256: sha256Schema,
  })
  .strict();

export const validationTaxonomyNodeV2Schema = z
  .object({
    active: z.boolean(),
    assignable: z.boolean(),
    effectiveLeaf: z.boolean(),
    facet: taxonomyFacetV2Schema,
    tagId: boundedIdSchema,
  })
  .strict();

export const validationContextV2Schema = z
  .object({
    candidateSubsetSha256: sha256Schema,
    maximumQuestions: z.number().int().positive().max(200).default(200),
    parsingContractSha256: sha256Schema,
    proposalSchemaSha256: sha256Schema,
    source: validationSourceContextV2Schema,
    taxonomyCandidates: z.array(validationTaxonomyNodeV2Schema).max(2_000),
    taxonomySnapshotSha256: sha256Schema,
    version: z.literal(AI_PARSING_V2_CONTEXT_VERSION),
  })
  .strict();
export type ValidationContextV2 = z.infer<
  typeof validationContextV2Schema
>;

export const canonicalizationResultV2Schema = z
  .object({
    extraction: documentExtractionV2Schema.nullable(),
    safeIssueCodes: z.array(z.string().trim().min(1).max(100)),
    success: z.boolean(),
  })
  .strict();
export type CanonicalizationResultV2 = z.infer<
  typeof canonicalizationResultV2Schema
>;
