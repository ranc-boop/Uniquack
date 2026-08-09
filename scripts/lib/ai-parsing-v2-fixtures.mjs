import {
  AI_PARSING_V2_CONTEXT_VERSION,
  AI_PARSING_V2_PROPOSAL_VERSION,
} from "../../src/lib/ai-pdf-import/v2/contracts.ts";
import {
  AI_PARSING_V2_PROMPT_FINGERPRINTS,
} from "../../src/lib/ai-pdf-import/v2/prompt-contract.ts";
import { sha256CanonicalJsonV2 } from "../../src/lib/ai-pdf-import/v2/fingerprint.ts";

export const FIXTURE_HASHES = Object.freeze({
  answer: "2".repeat(64),
  candidate: "c".repeat(64),
  parsing: "d".repeat(64),
  prompt: "1".repeat(64),
  solution: "3".repeat(64),
  source: "a".repeat(64),
  taxonomy: "b".repeat(64),
  visual: "4".repeat(64),
});

const FORM_TAG_BY_TYPE = {
  boolean: "form.boolean",
  free_response: "form.free_response",
  multiple_choice: "form.multiple_choice",
  multipart: "form.multipart",
  numeric: "form.numeric",
  short_text: "form.short_text",
};

const TAXONOMY_CANDIDATES = [
  ["curriculum.calculus", "curriculum"],
  ["concept.derivative", "concept"],
  ["method.differentiate", "method"],
  ["task.compute", "task"],
  ["form.multiple_choice", "form"],
  ["form.boolean", "form"],
  ["form.numeric", "form"],
  ["form.short_text", "form"],
  ["form.free_response", "form"],
  ["form.multipart", "form"],
].map(([tagId, facet]) => ({
  active: true,
  assignable: true,
  effectiveLeaf: true,
  facet,
  tagId,
}));

export function buildFixtureContext({ sourceKind = "pdf" } = {}) {
  return {
    candidateSubsetSha256: FIXTURE_HASHES.candidate,
    maximumQuestions: 200,
    parsingContractSha256: FIXTURE_HASHES.parsing,
    proposalSchemaSha256:
      AI_PARSING_V2_PROMPT_FINGERPRINTS.proposalSchemaSha256,
    source: {
      allowedTextFingerprintsSha256: [
        FIXTURE_HASHES.prompt,
        FIXTURE_HASHES.answer,
        FIXTURE_HASHES.solution,
        FIXTURE_HASHES.visual,
      ],
      availablePageNumbers: [1, 2, 3, 4],
      bankScopeKey: "bank:development",
      pageCount: 4,
      sourceAssetRef: "source:development",
      sourceKind,
      sourceSha256: FIXTURE_HASHES.source,
    },
    taxonomyCandidates: TAXONOMY_CANDIDATES,
    taxonomySnapshotSha256: FIXTURE_HASHES.taxonomy,
    version: AI_PARSING_V2_CONTEXT_VERSION,
  };
}

function sourceSpans() {
  return [
    {
      bbox: null,
      id: "span-prompt",
      pageEnd: 1,
      pageStart: 1,
      precision: "exact",
      questionIds: ["q1"],
      role: "prompt",
      sourceAssetRef: "source:development",
      textFingerprintSha256: FIXTURE_HASHES.prompt,
    },
    ...["A", "B", "C", "D"].map((label, index) => ({
      bbox: {
        height: 0.08,
        width: 0.7,
        x: 0.1,
        y: 0.35 + index * 0.1,
      },
      id: `span-option-${label.toLocaleLowerCase("en-US")}`,
      pageEnd: 1,
      pageStart: 1,
      precision: "region_level",
      questionIds: ["q1"],
      role: "option",
      sourceAssetRef: "source:development",
      textFingerprintSha256: null,
    })),
    {
      bbox: null,
      id: "span-answer",
      pageEnd: 3,
      pageStart: 3,
      precision: "exact",
      questionIds: ["q1"],
      role: "answer_key",
      sourceAssetRef: "source:development",
      textFingerprintSha256: FIXTURE_HASHES.answer,
    },
    {
      bbox: null,
      id: "span-solution",
      pageEnd: 3,
      pageStart: 3,
      precision: "exact",
      questionIds: ["q1"],
      role: "worked_solution",
      sourceAssetRef: "source:development",
      textFingerprintSha256: FIXTURE_HASHES.solution,
    },
    {
      bbox: { height: 0.4, width: 0.6, x: 0.2, y: 0.2 },
      id: "span-visual",
      pageEnd: 2,
      pageStart: 2,
      precision: "region_level",
      questionIds: ["q1"],
      role: "required_visual",
      sourceAssetRef: "source:development",
      textFingerprintSha256: null,
    },
  ];
}

function options(questionId = "q1") {
  return ["A", "B", "C", "D"].map((label, index) => ({
    id: `${questionId}-option-${label.toLocaleLowerCase("en-US")}`,
    label,
    sourceSpanIds: [`span-option-${label.toLocaleLowerCase("en-US")}`],
    text: ["2x", "x", "x squared", "2"][index],
  }));
}

function answerForType(questionType, questionId = "q1") {
  const evidence = {
    provenance: "source_answer_key",
    sourceSpanIds: ["span-answer"],
    support: "source_supported",
  };
  switch (questionType) {
    case "multiple_choice":
      return {
        ...evidence,
        allowMultiple: false,
        kind: "multiple_choice",
        selectedOptionIds: [`${questionId}-option-a`],
      };
    case "boolean":
      return { ...evidence, kind: "boolean", value: true };
    case "numeric":
      return {
        ...evidence,
        acceptedFormats: ["2.0"],
        kind: "numeric",
        tolerance: 0.001,
        unit: null,
        value: 2,
      };
    case "short_text":
      return {
        ...evidence,
        acceptedTexts: ["Extreme Value Theorem"],
        caseSensitive: false,
        kind: "short_text",
      };
    case "free_response":
      return {
        ...evidence,
        exemplarAnswer: "Continuity on a closed interval gives an attained maximum.",
        kind: "free_response",
        rubricPoints: ["States continuity", "Uses the closed interval condition"],
      };
    default:
      throw new Error(`Unsupported fixture question type: ${questionType}`);
  }
}

function taxonomyDecisions(questionType, abstainFacet = null) {
  const assigned = {
    concept: "concept.derivative",
    curriculum: "curriculum.calculus",
    form: FORM_TAG_BY_TYPE[questionType],
    method: "method.differentiate",
    task: "task.compute",
  };
  return ["curriculum", "concept", "method", "task", "form"].map((facet) =>
    facet === abstainFacet
      ? {
          confidence: 0.5,
          decision: "abstain",
          evidenceSpanIds: ["span-prompt"],
          facet,
          rationaleCode: "ambiguous",
          tagId: null,
        }
      : {
          confidence: 0.95,
          decision: "assign",
          evidenceSpanIds: ["span-prompt"],
          facet,
          rationaleCode: "exact_evidence",
          tagId: assigned[facet],
        },
  );
}

function questionBlock({
  boundaryKind = "standalone",
  childQuestionIds = [],
  id = "q1",
  parentQuestionId = null,
  questionType = "multiple_choice",
  requiredVisualIds = [],
  sourceSpanIds = ["span-prompt"],
  visibleNumber = "1",
} = {}) {
  return {
    boundaryKind,
    childQuestionIds,
    confidence: 0.96,
    difficultyRating: 500,
    id,
    options: questionType === "multiple_choice" ? options(id) : [],
    parentQuestionId,
    promptText: `Synthetic ${questionType.replaceAll("_", " ")} question ${visibleNumber}.`,
    questionType,
    requiredVisualIds,
    sourceSpanIds,
    visibleNumber,
  };
}

function generationFeatures() {
  const observation = {
    confidence: 0.88,
    evidenceSpanIds: ["span-prompt"],
    recurrenceEvidenceCount: 1,
    value: "direct computation prompt",
  };
  return {
    answerDerivationRelation: [],
    difficultySignals: [],
    distractorObservations: [],
    instanceSpecificDetails: [observation],
    invariantCandidates: [],
    parameterCandidates: [],
    reasoningOperators: [],
    solutionSkeleton: [],
    surfaceSpecificDetails: [],
    visualGrammarObservations: [],
  };
}

function solution(answer, { visualFactIds = [] } = {}) {
  return {
    conclusion: structuredClone(answer),
    sourceSpanIds: ["span-solution"],
    steps: [
      {
        id: "step-1",
        intermediateResult: null,
        sourceSpanIds: ["span-solution"],
        text: "Apply the source-supported operation and simplify.",
        visualFactIds,
      },
    ],
    summary: "The visible worked solution supports the keyed conclusion.",
  };
}

function modelDerivedSolution(answer) {
  return {
    conclusion: structuredClone(answer),
    sourceSpanIds: ["span-prompt"],
    steps: [
      {
        id: "step-derived-1",
        intermediateResult: "candidate derived result",
        sourceSpanIds: ["span-prompt"],
        text: "Apply the stated operation to the source-backed prompt values.",
        visualFactIds: [],
      },
    ],
    summary: "This concise derivation is model-proposed and remains review-gated.",
  };
}

function packageFor(question, { abstainFacet = null, answer = null } = {}) {
  const resolvedAnswer = answer ?? answerForType(question.questionType, question.id);
  return {
    answer: resolvedAnswer,
    generationRelevantFeatures: generationFeatures(),
    questionId: question.id,
    solution: solution(resolvedAnswer),
    taxonomyDecisions: taxonomyDecisions(question.questionType, abstainFacet),
  };
}

function baseProposal() {
  const question = questionBlock();
  return {
    assessment: {
      confidence: 0.98,
      evidenceSpanIds: ["span-prompt"],
      findings: [],
      reasonCode: "questions_detected",
      sufficiency: "extractable",
    },
    questionBlocks: [question],
    questionPackages: [packageFor(question)],
    sourceSpans: sourceSpans(),
    version: AI_PARSING_V2_PROPOSAL_VERSION,
    visualFacts: [],
    visualObjects: [],
    warningCodes: [],
  };
}

function replaceQuestionType(proposal, questionType) {
  const question = questionBlock({ questionType });
  proposal.questionBlocks = [question];
  proposal.questionPackages = [packageFor(question)];
}

function addVisual(
  proposal,
  { kind, required, visualType = "graph", withFact = false },
) {
  const question = proposal.questionBlocks[0];
  question.requiredVisualIds = required ? ["visual-1"] : [];
  proposal.visualObjects = [
    {
      confidence: kind === "ambiguous" ? 0.5 : 0.93,
      description: `${visualType} evidence`,
      id: "visual-1",
      kind,
      questionIds: [question.id],
      required,
      requiredForAnswering: required,
      requiredForUnderstanding: required,
      sourceSpanId: kind === "missing" ? null : "span-visual",
      visualType,
    },
  ];
  if (withFact) {
    proposal.visualFacts = [
      {
        confidence: 0.91,
        factType: visualType === "table" ? "table_cell" : "relationship",
        id: "visual-fact-1",
        sourceSpanIds: ["span-visual"],
        statement: "The visible relationship supports the keyed choice.",
        visualObjectId: "visual-1",
      },
    ];
    proposal.questionPackages[0].solution.steps[0].visualFactIds = [
      "visual-fact-1",
    ];
  }
}

function multipartProposal() {
  const proposal = baseProposal();
  for (const span of proposal.sourceSpans) {
    span.questionIds = ["q1", "q1a", "q1b"];
  }
  const parent = questionBlock({
    boundaryKind: "multipart_parent",
    childQuestionIds: ["q1a", "q1b"],
    id: "q1",
    questionType: "multipart",
  });
  const childA = questionBlock({
    boundaryKind: "multipart_child",
    id: "q1a",
    parentQuestionId: "q1",
    questionType: "numeric",
    visibleNumber: "1(a)",
  });
  const childB = questionBlock({
    boundaryKind: "multipart_child",
    id: "q1b",
    parentQuestionId: "q1",
    questionType: "short_text",
    visibleNumber: "1(b)",
  });
  const answerA = answerForType("numeric", "q1a");
  const answerB = answerForType("short_text", "q1b");
  const parentAnswer = {
    kind: "multipart",
    parts: [
      { answer: answerA, questionId: "q1a" },
      { answer: answerB, questionId: "q1b" },
    ],
    sourceSpanIds: ["span-answer"],
    support: "source_supported",
    provenance: "source_answer_key",
  };
  proposal.questionBlocks = [parent, childA, childB];
  proposal.questionPackages = [
    {
      answer: parentAnswer,
      generationRelevantFeatures: generationFeatures(),
      questionId: "q1",
      solution: solution(parentAnswer),
      taxonomyDecisions: taxonomyDecisions("multipart"),
    },
    packageFor(childA, { answer: answerA }),
    packageFor(childB, { answer: answerB }),
  ];
  return proposal;
}

function twoQuestionProposal() {
  const proposal = baseProposal();
  for (const span of proposal.sourceSpans) {
    span.questionIds = ["q1", "q2"];
  }
  const second = questionBlock({ id: "q2", visibleNumber: "2" });
  proposal.questionBlocks.push(second);
  proposal.questionPackages.push(packageFor(second));
  return proposal;
}

function sharedVisualProposal() {
  const proposal = twoQuestionProposal();
  for (const question of proposal.questionBlocks) {
    question.boundaryKind = "shared_visual";
    question.requiredVisualIds = ["visual-shared"];
  }
  proposal.visualObjects = [
    {
      confidence: 0.94,
      description: "one source diagram shared by two questions",
      id: "visual-shared",
      kind: "shared",
      questionIds: ["q1", "q2"],
      required: true,
      requiredForAnswering: true,
      requiredForUnderstanding: true,
      sourceSpanId: "span-visual",
      visualType: "diagram",
    },
  ];
  proposal.visualFacts = [
    {
      confidence: 0.92,
      factType: "relationship",
      id: "visual-fact-shared",
      sourceSpanIds: ["span-visual"],
      statement: "The shared diagram provides the same bounded relationship.",
      visualObjectId: "visual-shared",
    },
  ];
  for (const item of proposal.questionPackages) {
    item.solution.steps[0].visualFactIds = ["visual-fact-shared"];
  }
  return proposal;
}

function multipleVisualProposal() {
  const proposal = baseProposal();
  const secondVisualSpan = {
    ...structuredClone(
      proposal.sourceSpans.find((span) => span.id === "span-visual"),
    ),
    bbox: { height: 0.2, width: 0.25, x: 0.65, y: 0.2 },
    id: "span-visual-2",
  };
  proposal.sourceSpans.push(secondVisualSpan);
  proposal.questionBlocks[0].requiredVisualIds = ["visual-1", "visual-2"];
  proposal.visualObjects = [
    {
      confidence: 0.95,
      description: "first required graph",
      id: "visual-1",
      kind: "question",
      questionIds: ["q1"],
      required: true,
      requiredForAnswering: true,
      requiredForUnderstanding: true,
      sourceSpanId: "span-visual",
      visualType: "graph",
    },
    {
      confidence: 0.9,
      description: "second required table",
      id: "visual-2",
      kind: "question",
      questionIds: ["q1"],
      required: true,
      requiredForAnswering: false,
      requiredForUnderstanding: true,
      sourceSpanId: "span-visual-2",
      visualType: "table",
    },
  ];
  proposal.visualFacts = [
    {
      confidence: 0.9,
      factType: "relationship",
      id: "visual-fact-1",
      sourceSpanIds: ["span-visual"],
      statement: "The graph rises across the bounded interval.",
      visualObjectId: "visual-1",
    },
    {
      confidence: 0.88,
      factType: "table_cell",
      id: "visual-fact-2",
      sourceSpanIds: ["span-visual-2"],
      statement: "The table contains the bounded comparison value.",
      visualObjectId: "visual-2",
    },
  ];
  proposal.questionPackages[0].solution.steps[0].visualFactIds = [
    "visual-fact-1",
    "visual-fact-2",
  ];
  return proposal;
}

function compactInsufficientProposal({ findingCode, spanId }) {
  const spans = sourceSpans();
  const selectedSpan = spans.find((span) => span.id === spanId);
  if (selectedSpan) selectedSpan.questionIds = [];
  return {
    assessment: {
      confidence: 0.94,
      evidenceSpanIds: selectedSpan ? [selectedSpan.id] : [],
      findings: [
        {
          code: findingCode,
          evidenceSpanIds: selectedSpan ? [selectedSpan.id] : [],
        },
      ],
      reasonCode: "answer_or_prompt_evidence_incomplete",
      sufficiency: "insufficient_evidence",
    },
    questionBlocks: [],
    questionPackages: [],
    sourceSpans: selectedSpan ? [selectedSpan] : [],
    version: AI_PARSING_V2_PROPOSAL_VERSION,
    visualFacts: [],
    visualObjects: [],
    warningCodes: [],
  };
}

export function buildDevelopmentFixture(fixtureKind) {
  let context = buildFixtureContext();
  let proposal = baseProposal();

  switch (fixtureKind) {
    case "mcq":
    case "answer_provenance":
      break;
    case "worked_solution": {
      const answer = proposal.questionPackages[0].answer;
      answer.provenance = "source_worked_solution";
      answer.sourceSpanIds = ["span-solution"];
      proposal.questionPackages[0].solution.conclusion = structuredClone(answer);
      break;
    }
    case "source_explicit_answer": {
      const answerSpan = proposal.sourceSpans.find(
        (span) => span.id === "span-answer",
      );
      answerSpan.role = "explanation";
      const answer = proposal.questionPackages[0].answer;
      answer.provenance = "source_explicit_answer";
      proposal.questionPackages[0].solution.conclusion = structuredClone(answer);
      break;
    }
    case "boolean":
      replaceQuestionType(proposal, "boolean");
      break;
    case "numeric":
      replaceQuestionType(proposal, "numeric");
      break;
    case "numeric_units": {
      replaceQuestionType(proposal, "numeric");
      const answer = proposal.questionPackages[0].answer;
      answer.acceptedFormats = ["5 N", "5 newtons"];
      answer.unit = "N";
      answer.value = 5;
      proposal.questionPackages[0].solution.conclusion = structuredClone(answer);
      break;
    }
    case "short_text":
      replaceQuestionType(proposal, "short_text");
      break;
    case "free_response":
      replaceQuestionType(proposal, "free_response");
      break;
    case "multipart":
      proposal = multipartProposal();
      break;
    case "cross_page":
      proposal.questionBlocks[0].boundaryKind = "cross_page_continuation";
      proposal.sourceSpans.find((span) => span.id === "span-prompt").pageEnd = 2;
      break;
    case "shared_prompt":
      proposal.questionBlocks[0].boundaryKind = "shared_prompt";
      break;
    case "answer_key_continuation":
      proposal.questionBlocks[0].boundaryKind = "answer_key_continuation";
      break;
    case "required_graph":
      addVisual(proposal, { kind: "question", required: true, withFact: true });
      break;
    case "required_table":
      addVisual(proposal, {
        kind: "question",
        required: true,
        visualType: "table",
        withFact: true,
      });
      break;
    case "shared_visual":
      proposal = sharedVisualProposal();
      break;
    case "multiple_visuals":
      proposal = multipleVisualProposal();
      break;
    case "decorative_visual":
      addVisual(proposal, { kind: "decorative", required: false });
      break;
    case "missing_visual":
      addVisual(proposal, { kind: "missing", required: true });
      break;
    case "ambiguous_visual":
      addVisual(proposal, { kind: "ambiguous", required: true });
      break;
    case "no_questions":
      proposal = {
        assessment: {
          confidence: 0.98,
          evidenceSpanIds: [],
          findings: [
            { code: "notes_without_question", evidenceSpanIds: [] },
          ],
          reasonCode: "no_question_content_detected",
          sufficiency: "no_questions",
        },
        questionBlocks: [],
        questionPackages: [],
        sourceSpans: [],
        version: AI_PARSING_V2_PROPOSAL_VERSION,
        visualFacts: [],
        visualObjects: [],
        warningCodes: [],
      };
      break;
    case "insufficient_source":
      proposal = compactInsufficientProposal({
        findingCode: "incomplete_question",
        spanId: "span-prompt",
      });
      break;
    case "answer_only_source":
      proposal = compactInsufficientProposal({
        findingCode: "answer_only_source",
        spanId: "span-answer",
      });
      break;
    case "unsupported_answer": {
      const answer = proposal.questionPackages[0].answer;
      answer.sourceSpanIds = [];
      answer.support = "unsupported";
      answer.provenance = "model_derived";
      proposal.questionPackages[0].solution.conclusion.sourceSpanIds = [];
      proposal.questionPackages[0].solution.conclusion.support = "inferred";
      proposal.questionPackages[0].solution.conclusion.provenance = "model_derived";
      answer.support = "inferred";
      break;
    }
    case "model_derived_answer": {
      const answer = proposal.questionPackages[0].answer;
      answer.provenance = "model_derived";
      answer.sourceSpanIds = ["span-prompt"];
      answer.support = "inferred";
      proposal.questionPackages[0].solution = modelDerivedSolution(answer);
      break;
    }
    case "answer_solution_conflict":
      proposal.questionPackages[0].solution.conclusion.selectedOptionIds = [
        "q1-option-b",
      ];
      break;
    case "unsupported_source":
      context = buildFixtureContext({ sourceKind: "unsupported" });
      proposal = {
        assessment: {
          confidence: 0.99,
          evidenceSpanIds: [],
          findings: [
            { code: "unsupported_content", evidenceSpanIds: [] },
          ],
          reasonCode: "source_format_unsupported",
          sufficiency: "unsupported_source",
        },
        questionBlocks: [],
        questionPackages: [],
        sourceSpans: [],
        version: AI_PARSING_V2_PROPOSAL_VERSION,
        visualFacts: [],
        visualObjects: [],
        warningCodes: [],
      };
      break;
    case "taxonomy_abstain":
      proposal.questionPackages[0].taxonomyDecisions = taxonomyDecisions(
        "multiple_choice",
        "method",
      );
      break;
    case "taxonomy_ambiguous":
      proposal.questionPackages[0].taxonomyDecisions = taxonomyDecisions(
        "multiple_choice",
        "concept",
      );
      break;
    case "taxonomy_close_siblings":
      context.taxonomyCandidates.push({
        active: true,
        assignable: true,
        effectiveLeaf: true,
        facet: "concept",
        tagId: "concept.limit",
      });
      break;
    case "taxonomy_wrong_facet":
      proposal.questionPackages[0].taxonomyDecisions.find(
        (decision) => decision.facet === "concept",
      ).tagId = "method.differentiate";
      break;
    case "taxonomy_broad_parent":
      context.taxonomyCandidates.push({
        active: true,
        assignable: true,
        effectiveLeaf: false,
        facet: "concept",
        tagId: "concept.calculus_parent",
      });
      proposal.questionPackages[0].taxonomyDecisions.find(
        (decision) => decision.facet === "concept",
      ).tagId = "concept.calculus_parent";
      break;
    case "taxonomy_unknown_id":
      proposal.questionPackages[0].taxonomyDecisions.find(
        (decision) => decision.facet === "concept",
      ).tagId = "concept.not_in_catalog";
      break;
    case "generation_parameter_invariant": {
      const features = proposal.questionPackages[0].generationRelevantFeatures;
      features.instanceSpecificDetails = [
        {
          confidence: 0.97,
          evidenceSpanIds: ["span-prompt"],
          recurrenceEvidenceCount: 1,
          value: "F1 is 8 N right and F2 is 3 N left",
        },
      ];
      features.parameterCandidates = [
        {
          confidence: 0.86,
          evidenceSpanIds: ["span-prompt"],
          recurrenceEvidenceCount: 1,
          value: "force magnitudes",
        },
      ];
      features.invariantCandidates = [
        {
          confidence: 0.61,
          evidenceSpanIds: ["span-prompt"],
          recurrenceEvidenceCount: 1,
          value: "candidate opposing collinear forces pattern",
        },
      ];
      features.reasoningOperators = [
        {
          confidence: 0.9,
          evidenceSpanIds: ["span-prompt"],
          recurrenceEvidenceCount: 1,
          value: "compare magnitudes then subtract",
        },
      ];
      break;
    }
    case "surface_specific_rule": {
      const features = proposal.questionPackages[0].generationRelevantFeatures;
      features.surfaceSpecificDetails = [
        {
          confidence: 0.99,
          evidenceSpanIds: ["span-prompt"],
          recurrenceEvidenceCount: 1,
          value: "the source happens to use the numbers 8 and 3",
        },
      ];
      features.invariantCandidates = [
        {
          confidence: 0.35,
          evidenceSpanIds: ["span-prompt"],
          recurrenceEvidenceCount: 1,
          value: "unproven candidate only; never a generator rule",
        },
      ];
      break;
    }
    case "invalid_bbox": {
      addVisual(proposal, { kind: "question", required: true });
      const span = proposal.sourceSpans.find(
        (candidate) => candidate.id === "span-visual",
      );
      span.bbox.x = 0.8;
      span.bbox.width = 0.4;
      break;
    }
    case "fabricated_visual_fact":
      addVisual(proposal, { kind: "question", required: true, withFact: true });
      proposal.visualFacts[0].visualObjectId = "visual-does-not-exist";
      break;
    case "answer_key_visual":
      addVisual(proposal, {
        kind: "answer_key",
        required: false,
        visualType: "diagram",
        withFact: true,
      });
      break;
    case "two_questions":
      proposal = twoQuestionProposal();
      break;
    case "ambiguous_boundary":
      proposal.questionBlocks[0].boundaryKind = "ambiguous";
      break;
    default:
      throw new Error(`Unknown development fixture kind: ${fixtureKind}`);
  }

  return { context, proposal };
}

export function developmentFixtureFingerprint({ context, proposal }) {
  return sha256CanonicalJsonV2({ context, proposal });
}
