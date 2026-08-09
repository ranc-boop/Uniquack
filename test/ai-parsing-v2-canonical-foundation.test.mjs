import assert from "node:assert/strict";
import fs from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";
import { fileURLToPath } from "node:url";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") {
      return {
        shortCircuit: true,
        url: "data:text/javascript,export%20{}",
      };
    }
    if (specifier.startsWith("@/")) {
      const url = new URL(`../src/${specifier.slice(2)}.ts`, import.meta.url);
      if (fs.existsSync(fileURLToPath(url))) {
        return { shortCircuit: true, url: url.href };
      }
    }
    if (
      (specifier.startsWith("./") || specifier.startsWith("../")) &&
      !/\.[A-Za-z0-9]+$/.test(specifier)
    ) {
      const url = new URL(`${specifier}.ts`, context.parentURL);
      if (fs.existsSync(fileURLToPath(url))) {
        return { shortCircuit: true, url: url.href };
      }
    }
    return nextResolve(specifier, context);
  },
});

const {
  AI_PARSING_V2_PROMPT_FINGERPRINTS,
  AI_PARSING_V2_PROVIDER_JSON_SCHEMA,
  composeProviderRequestV2,
} = await import("../src/lib/ai-pdf-import/v2/prompt-contract.ts");
const {
  canonicalizeDocumentExtractionV2,
  toSafeCanonicalizationSummaryV2,
} = await import("../src/lib/ai-pdf-import/v2/validation.ts");
const {
  evaluateDocumentExtractionV2,
} = await import("../src/lib/ai-pdf-import/v2/evaluator.ts");
const {
  runFakeAiParsingV2,
} = await import("../src/lib/ai-pdf-import/v2/fake-pipeline.ts");
const {
  buildV2TaxonomyValidationContext,
} = await import("../src/lib/ai-pdf-import/v2/taxonomy-context.ts");
const {
  buildRuntimeTaxonomySnapshot,
} = await import("../src/lib/tags/runtime-taxonomy-snapshot.ts");
const {
  projectDocumentExtractionV2ToV1ReviewDrafts,
} = await import("../src/lib/ai-pdf-import/v2/projection.ts");
const {
  derivePrivateQuestionAssetIdentityV2Fake,
} = await import("../src/lib/ai-pdf-import/v2/visual-adapter.ts");
const {
  canonicalJsonV2,
  sha256CanonicalJsonV2,
  sha256NormalizedTextV2,
  sha256TextV2,
} = await import("../src/lib/ai-pdf-import/v2/fingerprint.ts");
const {
  FIXTURE_HASHES,
  buildDevelopmentFixture,
} = await import("../scripts/lib/ai-parsing-v2-fixtures.mjs");

function readJson(relativePath) {
  return JSON.parse(
    fs.readFileSync(new URL(relativePath, import.meta.url), "utf8"),
  );
}

const developmentCorpus = readJson(
  "./fixtures/ai-parsing-v2-development-corpus.json",
);
const frozenHoldout = readJson(
  "./fixtures/ai-parsing-v2-frozen-holdout.json",
);
const frozenFingerprints = readJson(
  "./fixtures/ai-parsing-v2-foundation-fingerprints.json",
);

function corpusFileText(relativePath) {
  return fs.readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

function assignedTaxonomyDecisions(formTag = "form.multiple_choice") {
  const assigned = {
    concept: "concept.derivative",
    curriculum: "curriculum.calculus",
    form: formTag,
    method: "method.differentiate",
    task: "task.compute",
  };
  return ["curriculum", "concept", "method", "task", "form"].map(
    (facet) => ({ decision: "assign", facet, tagId: assigned[facet] }),
  );
}

function perfectMcqGold() {
  const sourceReference = ({
    id,
    page,
    precision,
    role,
  }) => ({
    id,
    pageEnd: page,
    pageStart: page,
    precision,
    questionIds: ["q1"],
    role,
    sourceAssetRef: "source:development",
  });
  return {
    allowedBankScopeKey: "bank:development",
    allowedSourceAssetRef: "source:development",
    allowedTaxonomyTagIds: [
      "curriculum.calculus",
      "concept.derivative",
      "method.differentiate",
      "task.compute",
      "form.multiple_choice",
      "form.boolean",
      "form.numeric",
      "form.short_text",
      "form.free_response",
      "form.multipart",
    ],
    questions: [
      {
        answer: {
          allowMultiple: false,
          kind: "multiple_choice",
          provenance: "source_answer_key",
          selectedOptionIds: ["q1-option-a"],
          sourceSpanIds: ["span-answer"],
          support: "source_supported",
        },
        boundaryKind: "standalone",
        expectedDisposition: "review_ready",
        generationObservations: [
          "instanceSpecificDetails:direct computation prompt",
        ],
        id: "q1",
        parentQuestionId: null,
        missingRequiredVisualExpected: false,
        sourceReferences: [
          sourceReference({ id: "span-prompt", page: 1, precision: "exact", role: "prompt" }),
          ...["a", "b", "c", "d"].map((label) =>
            sourceReference({
              id: `span-option-${label}`,
              page: 1,
              precision: "region_level",
              role: "option",
            }),
          ),
          sourceReference({ id: "span-answer", page: 3, precision: "exact", role: "answer_key" }),
          sourceReference({ id: "span-solution", page: 3, precision: "exact", role: "worked_solution" }),
        ],
        sourceSpanIds: [
          "span-prompt",
          "span-option-a",
          "span-option-b",
          "span-option-c",
          "span-option-d",
          "span-answer",
          "span-solution",
        ],
        taxonomyDecisions: assignedTaxonomyDecisions(),
        visualObjectIds: [],
        visualDependencyExpected: false,
        visualFacts: [],
      },
    ],
    sufficiency: "extractable",
    version: "ai_parsing_v2_evaluation_gold_v1",
  };
}

function buildTwoIndependentlyGroundedQuestionsWithVisual() {
  const fixture = buildDevelopmentFixture("required_graph");
  const firstQuestion = fixture.proposal.questionBlocks[0];
  const firstPackage = fixture.proposal.questionPackages[0];
  const spanById = new Map(
    fixture.proposal.sourceSpans.map((span) => [span.id, span]),
  );
  const clonedSpanIds = new Map();

  for (const spanId of [
    "span-prompt",
    "span-option-a",
    "span-option-b",
    "span-option-c",
    "span-option-d",
    "span-answer",
    "span-solution",
  ]) {
    const source = structuredClone(spanById.get(spanId));
    const nextId = `${spanId}-q2`;
    source.id = nextId;
    source.questionIds = ["q2"];
    if (source.role === "prompt" || source.role === "option") {
      source.pageStart = 4;
      source.pageEnd = 4;
    }
    if (source.role === "prompt") {
      source.textFingerprintSha256 = FIXTURE_HASHES.prompt2;
    }
    clonedSpanIds.set(spanId, nextId);
    fixture.proposal.sourceSpans.push(source);
  }

  const secondQuestion = structuredClone(firstQuestion);
  secondQuestion.id = "q2";
  secondQuestion.visibleNumber = "2";
  secondQuestion.requiredVisualIds = [];
  secondQuestion.sourceSpanIds = [clonedSpanIds.get("span-prompt")];
  secondQuestion.options = secondQuestion.options.map((option) => ({
    ...option,
    id: option.id.replace("q1", "q2"),
    sourceSpanIds: option.sourceSpanIds.map((spanId) => clonedSpanIds.get(spanId)),
  }));

  const secondPackage = structuredClone(firstPackage);
  secondPackage.questionId = "q2";
  secondPackage.answer.selectedOptionIds = ["q2-option-a"];
  secondPackage.answer.sourceSpanIds = [clonedSpanIds.get("span-answer")];
  secondPackage.solution.conclusion.selectedOptionIds = ["q2-option-a"];
  secondPackage.solution.conclusion.sourceSpanIds = [
    clonedSpanIds.get("span-answer"),
  ];
  secondPackage.solution.sourceSpanIds = [clonedSpanIds.get("span-solution")];
  secondPackage.solution.steps[0].id = "step-q2";
  secondPackage.solution.steps[0].sourceSpanIds = [
    clonedSpanIds.get("span-solution"),
  ];
  secondPackage.solution.steps[0].visualFactIds = [];
  for (const decision of secondPackage.taxonomyDecisions) {
    decision.evidenceSpanIds = [clonedSpanIds.get("span-prompt")];
  }
  for (const observations of Object.values(
    secondPackage.generationRelevantFeatures,
  )) {
    for (const observation of observations) {
      observation.evidenceSpanIds = [clonedSpanIds.get("span-prompt")];
    }
  }

  fixture.proposal.questionBlocks.push(secondQuestion);
  fixture.proposal.questionPackages.push(secondPackage);
  fixture.context.applicationEvidence.questionEvidence.push({
    id: "evidence-question-2",
    kind: "question",
    pageEnd: 4,
    pageStart: 4,
    relationship: "single",
    textFingerprintSha256: FIXTURE_HASHES.prompt2,
  });
  return fixture;
}

test("development corpus covers every required category with independent rights-safe scenarios", () => {
  assert.equal(developmentCorpus.version, "ai_parsing_v2_development_corpus_v1");
  assert.match(developmentCorpus.rights, /Synthetic educational fixtures/);
  assert.ok(developmentCorpus.cases.length >= 26);
  assert.equal(
    new Set(developmentCorpus.cases.map((item) => item.id)).size,
    developmentCorpus.cases.length,
  );
  assert.ok(
    developmentCorpus.cases.every(
      (item) => item.sourceContent.length > 40 && item.coverage.length >= 2,
    ),
  );
  const fixtureKinds = new Set(
    developmentCorpus.cases.map((item) => item.fixtureKind),
  );
  for (const requiredKind of [
    "no_questions",
    "insufficient_source",
    "answer_only_source",
    "mcq",
    "worked_solution",
    "source_explicit_answer",
    "model_derived_answer",
    "answer_solution_conflict",
    "numeric_units",
    "numeric",
    "multipart",
    "cross_page",
    "shared_visual",
    "multiple_visuals",
    "decorative_visual",
    "missing_visual",
    "ambiguous_visual",
    "invalid_bbox",
    "fabricated_visual_fact",
    "taxonomy_close_siblings",
    "taxonomy_abstain",
    "taxonomy_wrong_facet",
    "taxonomy_broad_parent",
    "taxonomy_unknown_id",
    "generation_parameter_invariant",
    "surface_specific_rule",
  ]) {
    assert.ok(fixtureKinds.has(requiredKind), requiredKind);
  }
});

test("all development scenarios complete the source-only fake vertical flow", () => {
  for (const scenario of developmentCorpus.cases) {
    const fixture = buildDevelopmentFixture(scenario.fixtureKind);
    const result = runFakeAiParsingV2(fixture);
    const extraction = result.canonicalization.extraction;

    if (scenario.expectedCanonicalization === "provider_schema_rejected") {
      assert.equal(extraction, null, scenario.id);
      assert.equal(result.canonicalization.success, false, scenario.id);
      assert.equal(result.reviewDrafts.length, 0, scenario.id);
      assert.equal(result.providerCalls, 0, scenario.id);
      assert.equal(result.writes, 0, scenario.id);
      continue;
    }

    assert.ok(extraction, scenario.id);
    assert.equal(
      extraction.assessment.sufficiency,
      scenario.expectedSufficiency,
      scenario.id,
    );
    assert.equal(
      extraction.disposition.status,
      scenario.expectedDisposition,
      scenario.id,
    );
    assert.equal(
      extraction.questionPackages.length,
      scenario.expectedQuestionCount,
      scenario.id,
    );
    assert.equal(result.providerCalls, 0, scenario.id);
    assert.equal(result.writes, 0, scenario.id);
    assert.equal(
      result.canonicalization.success,
      scenario.expectedCanonicalization === "application_rejected" ? false : true,
      scenario.id,
    );

    const expectedDrafts =
      scenario.expectedDisposition === "review_ready" ||
      scenario.expectedDisposition === "needs_more_evidence"
        ? scenario.fixtureKind === "multipart"
          ? 1
          : scenario.expectedQuestionCount
        : 0;
    assert.equal(result.reviewDrafts.length, expectedDrafts, scenario.id);
    for (const draft of result.reviewDrafts) {
      assert.equal(draft.question.status, "draft", scenario.id);
      assert.equal(draft.question.visibility, "private", scenario.id);
      assert.ok(
        ["pending_review", "needs_more_evidence"].includes(
          draft.reviewItem.status,
        ),
        scenario.id,
      );
      assert.equal(
        draft.reviewItem.draft_payload.writeAuthority,
        "none_source_only_projection",
        scenario.id,
      );
    }
  }
});

test("frozen holdout is separate, unique, and integrity-only", () => {
  assert.equal(frozenHoldout.version, "ai_parsing_v2_frozen_holdout_v1");
  assert.match(frozenHoldout.policy, /Do not use these cases.*to tune/);
  assert.ok(frozenHoldout.cases.length >= 6);
  const developmentIds = new Set(
    developmentCorpus.cases.map((item) => item.id),
  );
  assert.ok(
    frozenHoldout.cases.every(
      (item) => !developmentIds.has(item.id) && item.sourceContent.length > 40,
    ),
  );
  assert.ok(
    frozenHoldout.cases.every(
      (item) =>
        item.sourceSha256 === sha256TextV2(item.sourceContent) &&
        item.gold &&
        Number.isInteger(item.gold.expectedQuestionCount) &&
        Array.isArray(item.gold.expectedQuestionIds),
    ),
  );
});

test("corpus, holdout, and Provider contracts match portable frozen fingerprints", () => {
  const developmentText = corpusFileText(
    "./fixtures/ai-parsing-v2-development-corpus.json",
  );
  const holdoutText = corpusFileText(
    "./fixtures/ai-parsing-v2-frozen-holdout.json",
  );

  assert.equal(
    sha256CanonicalJsonV2(JSON.parse(developmentText)),
    frozenFingerprints.developmentCorpus.canonicalJsonSha256,
  );
  assert.equal(
    sha256NormalizedTextV2(developmentText),
    frozenFingerprints.developmentCorpus.normalizedTextSha256,
  );
  assert.equal(
    sha256CanonicalJsonV2(JSON.parse(holdoutText)),
    frozenFingerprints.frozenHoldout.canonicalJsonSha256,
  );
  assert.equal(
    sha256NormalizedTextV2(holdoutText),
    frozenFingerprints.frozenHoldout.normalizedTextSha256,
  );
  const developmentLf = developmentText.replace(/\r\n?/g, "\n");
  const developmentCrlf = developmentLf.replace(/\n/g, "\r\n");
  assert.equal(
    sha256NormalizedTextV2(developmentLf),
    sha256NormalizedTextV2(developmentCrlf),
  );
  assert.notEqual(
    sha256NormalizedTextV2(`${developmentLf}\nsemantic-mutation`),
    frozenFingerprints.developmentCorpus.normalizedTextSha256,
  );
  assert.deepEqual(
    AI_PARSING_V2_PROMPT_FINGERPRINTS,
    frozenFingerprints.providerContract,
  );
});

test("Provider schema contains proposals but no application authority fields", () => {
  const schema = canonicalJsonV2(AI_PARSING_V2_PROVIDER_JSON_SCHEMA);
  assert.match(schema, /questionPackages/);
  assert.match(schema, /taxonomyDecisions/);
  assert.match(schema, /sourceSpans/);
  assert.doesNotMatch(schema, /qualityDisposition/);
  assert.doesNotMatch(schema, /reviewStatus/);
  assert.doesNotMatch(schema, /owner_bank_id/);
  assert.doesNotMatch(schema, /chainOfThought/);
});

test("safe diagnostics contain bounded metadata and no private proposal content", () => {
  const fixture = buildDevelopmentFixture(
    developmentCorpus.cases[0].fixtureKind,
  );
  const proposal = structuredClone(fixture.proposal);
  const privateSentinel = "source:private-leak-sentinel";
  proposal.sourceSpans[0].sourceAssetRef = privateSentinel;

  const result = canonicalizeDocumentExtractionV2({
    context: fixture.context,
    proposal,
  });
  const summary = toSafeCanonicalizationSummaryV2(result);
  const serialized = JSON.stringify(summary);

  assert.equal(summary.version, "ai_parsing_v2_safe_diagnostics_v1");
  assert.equal(summary.success, false);
  assert.ok(summary.safeIssueCodes.length > 0);
  assert.doesNotMatch(serialized, new RegExp(privateSentinel));
  assert.doesNotMatch(serialized, /sourceAssetRef|questionBlocks|promptText/);
  assert.doesNotMatch(
    serialized,
    new RegExp(proposal.questionBlocks[0].promptText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
  );
});

test("V2 remains source/fake only with no production imports", () => {
  const sourceRoot = fileURLToPath(new URL("../src", import.meta.url));
  const v2Root = fileURLToPath(
    new URL("../src/lib/ai-pdf-import/v2", import.meta.url),
  );
  const pending = [sourceRoot];
  const productionImporters = [];

  while (pending.length > 0) {
    const current = pending.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const path = `${current}/${entry.name}`;
      if (entry.isDirectory()) {
        if (path.replaceAll("\\", "/") !== v2Root.replaceAll("\\", "/")) {
          pending.push(path);
        }
        continue;
      }
      if (!/\.(?:js|jsx|mjs|ts|tsx)$/.test(entry.name)) continue;
      const source = fs.readFileSync(path, "utf8");
      if (/ai-pdf-import\/v2(?:\/|["'])/.test(source)) {
        productionImporters.push(path);
      }
    }
  }

  assert.deepEqual(productionImporters, []);
});

test("V2 taxonomy context reuses exact five-facet effective-leaf semantics", () => {
  const facetKeys = ["curriculum", "concept", "method", "task", "form"];
  const facets = facetKeys.map((facet, index) => ({
    facet_key: facet,
    label: facet,
    root_tag_id: `math.${facet}`,
    sort_order: index + 1,
  }));
  const nodes = [
    {
      facet_key: null,
      is_assignable: false,
      label: "Math",
      parent_tag_ids: [],
      tag_id: "math",
    },
    ...facets.map((facet) => ({
      facet_key: facet.facet_key,
      is_assignable: false,
      label: facet.label,
      parent_tag_ids: ["math"],
      tag_id: facet.root_tag_id,
    })),
    ...facetKeys.map((facet) => ({
      facet_key: facet,
      is_assignable: true,
      label: `${facet} leaf`,
      parent_tag_ids: [`math.${facet}`],
      tag_id: `math.${facet}.leaf`,
    })),
  ];
  const snapshot = buildRuntimeTaxonomySnapshot({ facets, nodes });
  const context = buildV2TaxonomyValidationContext({ snapshot });

  assert.equal(snapshot.valid, true);
  assert.equal(context.taxonomyCandidates.length, 5);
  assert.ok(
    context.taxonomyCandidates.every(
      (candidate) =>
        candidate.active && candidate.assignable && candidate.effectiveLeaf,
    ),
  );
  assert.throws(
    () =>
      buildV2TaxonomyValidationContext({
        candidateTagIds: ["math.concept"],
        snapshot,
      }),
    /non-canonical or non-leaf/,
  );
});

test("strict Provider schema rejects authority and hidden-reasoning fields", () => {
  const mutationCases = [
    ["qualityDisposition", (proposal) => (proposal.qualityDisposition = "review_ready")],
    ["reviewStatus", (proposal) => (proposal.reviewStatus = "approved")],
    ["bankAuthority", (proposal) => (proposal.owner_bank_id = "bank:other")],
    ["publication", (proposal) => (proposal.published_at = "now")],
    ["assignment", (proposal) => (proposal.assignmentId = "assignment:1")],
    [
      "chainOfThought",
      (proposal) =>
        (proposal.questionPackages[0].solution.steps[0].chainOfThought =
          "private hidden reasoning"),
    ],
    [
      "Blueprint invariant",
      (proposal) =>
        (proposal.questionPackages[0].generationRelevantFeatures.invariants = [
          "always use this pattern",
        ]),
    ],
  ];

  for (const [label, mutate] of mutationCases) {
    const fixture = buildDevelopmentFixture("mcq");
    mutate(fixture.proposal);
    const result = runFakeAiParsingV2(fixture);
    assert.equal(result.canonicalization.extraction, null, label);
    assert.equal(result.reviewDrafts.length, 0, label);
    assert.ok(
      result.canonicalization.safeIssueCodes.every((code) =>
        code.startsWith("provider_schema_invalid:"),
      ),
      label,
    );
  }
});

test("semantic hard-boundary mutations fail closed with zero Draft projections", () => {
  const mutationCases = [
    [
      "foreign source",
      (fixture) =>
        (fixture.proposal.sourceSpans[0].sourceAssetRef = "source:foreign"),
    ],
    [
      "out-of-range page",
      (fixture) => (fixture.proposal.sourceSpans[0].pageEnd = 99),
    ],
    [
      "unknown exact fingerprint",
      (fixture) =>
        (fixture.proposal.sourceSpans[0].textFingerprintSha256 = "f".repeat(64)),
    ],
    [
      "prompt span uses answer role",
      (fixture) => (fixture.proposal.sourceSpans[0].role = "answer_key"),
    ],
    [
      "answer evidence belongs to another question",
      (fixture) =>
        (fixture.proposal.sourceSpans.find(
          (span) => span.id === "span-answer",
        ).questionIds = ["q2"]),
    ],
    [
      "invalid taxonomy ID",
      (fixture) =>
        (fixture.proposal.questionPackages[0].taxonomyDecisions[0].tagId =
          "curriculum.unknown"),
    ],
    [
      "wrong-facet taxonomy ID",
      (fixture) =>
        (fixture.proposal.questionPackages[0].taxonomyDecisions.find(
          (decision) => decision.facet === "concept",
        ).tagId = "method.differentiate"),
    ],
    [
      "broad taxonomy parent",
      (fixture) => {
        fixture.context.taxonomyCandidates.push({
          active: true,
          assignable: true,
          effectiveLeaf: false,
          facet: "concept",
          tagId: "concept.parent",
        });
        fixture.proposal.questionPackages[0].taxonomyDecisions.find(
          (decision) => decision.facet === "concept",
        ).tagId = "concept.parent";
      },
    ],
    [
      "answer points outside options",
      (fixture) =>
        (fixture.proposal.questionPackages[0].answer.selectedOptionIds = [
          "q1-option-z",
        ]),
    ],
    [
      "solution contradicts answer",
      (fixture) =>
        (fixture.proposal.questionPackages[0].solution.conclusion.selectedOptionIds = [
          "q1-option-b",
        ]),
    ],
    [
      "orphan visual fact reference",
      (fixture) =>
        (fixture.proposal.questionPackages[0].solution.steps[0].visualFactIds = [
          "visual-fact-orphan",
        ]),
    ],
    [
      "duplicate question identifier",
      (fixture) => {
        fixture.proposal.questionBlocks.push(
          structuredClone(fixture.proposal.questionBlocks[0]),
        );
      },
    ],
    [
      "wrong visual question association",
      (fixture) => {
        fixture.proposal.questionBlocks[0].requiredVisualIds = ["visual-1"];
        fixture.proposal.visualObjects = [
          {
            confidence: 0.9,
            description: "wrong association",
            id: "visual-1",
            kind: "question",
            questionIds: ["q2"],
            required: true,
            requiredForAnswering: true,
            requiredForUnderstanding: true,
            sourceSpanId: "span-visual",
            visualType: "diagram",
          },
        ];
      },
    ],
    [
      "decorative visual promoted to required",
      (fixture) => {
        fixture.proposal.visualObjects = [
          {
            confidence: 0.9,
            description: "border",
            id: "visual-1",
            kind: "decorative",
            questionIds: ["q1"],
            required: true,
            requiredForAnswering: true,
            requiredForUnderstanding: true,
            sourceSpanId: "span-visual",
            visualType: "image",
          },
        ];
      },
    ],
    [
      "impossible multipart parent",
      (fixture) => {
        fixture.proposal.questionBlocks[0].boundaryKind = "multipart_parent";
        fixture.proposal.questionBlocks[0].questionType = "multipart";
      },
    ],
    [
      "question limit",
      (fixture) => {
        const second = structuredClone(fixture.proposal.questionBlocks[0]);
        second.id = "q2";
        second.options = second.options.map((option) => ({
          ...option,
          id: option.id.replace("q1", "q2"),
        }));
        const secondPackage = structuredClone(
          fixture.proposal.questionPackages[0],
        );
        secondPackage.questionId = "q2";
        secondPackage.answer.selectedOptionIds = ["q2-option-a"];
        secondPackage.solution.conclusion.selectedOptionIds = ["q2-option-a"];
        fixture.proposal.questionBlocks.push(second);
        fixture.proposal.questionPackages.push(secondPackage);
        fixture.context.maximumQuestions = 1;
      },
    ],
  ];

  for (const [label, mutate] of mutationCases) {
    const fixture = buildDevelopmentFixture("mcq");
    mutate(fixture);
    const result = runFakeAiParsingV2(fixture);
    assert.ok(result.canonicalization.extraction, label);
    assert.equal(
      result.canonicalization.extraction.disposition.status,
      "invalid_provider_output",
      label,
    );
    assert.equal(result.reviewDrafts.length, 0, label);
    assert.equal(result.providerCalls, 0, label);
    assert.equal(result.writes, 0, label);
  }
});

test("a Provider cannot reassign a real visual to a different real Question through self-consistent fields", () => {
  const fixture = buildTwoIndependentlyGroundedQuestionsWithVisual();
  const valid = runFakeAiParsingV2(structuredClone(fixture));
  assert.equal(valid.reviewDrafts.length, 2);

  fixture.proposal.questionBlocks[0].requiredVisualIds = [];
  fixture.proposal.questionBlocks[1].requiredVisualIds = ["visual-1"];
  fixture.proposal.sourceSpans.find(
    (span) => span.id === "span-visual",
  ).questionIds = ["q2"];
  fixture.proposal.visualObjects[0].questionIds = ["q2"];
  fixture.proposal.questionPackages[0].solution.steps[0].visualFactIds = [];
  fixture.proposal.questionPackages[1].solution.steps[0].visualFactIds = [
    "visual-fact-1",
  ];

  const reassigned = runFakeAiParsingV2(fixture);
  assert.equal(
    reassigned.canonicalization.extraction?.disposition.status,
    "invalid_provider_output",
  );
  assert.ok(
    reassigned.canonicalization.extraction?.findings.some(
      (item) => item.code === "visual_application_evidence_invalid",
    ),
  );
  assert.equal(reassigned.reviewDrafts.length, 0);
});

test("valid Question evidence cannot be silently downgraded by Provider abstention", () => {
  const validSource = buildDevelopmentFixture("mcq");
  const abstention = buildDevelopmentFixture("no_questions");
  validSource.proposal = abstention.proposal;

  const result = runFakeAiParsingV2(validSource);
  assert.equal(
    result.canonicalization.extraction?.disposition.status,
    "invalid_provider_output",
  );
  assert.notEqual(
    result.canonicalization.extraction?.assessment.sufficiency,
    "no_questions",
  );
  assert.equal(
    result.canonicalization.extraction?.assessment.providerProposal.sufficiency,
    "no_questions",
  );
  assert.ok(
    result.canonicalization.extraction?.findings.some(
      (item) => item.code === "application_source_evidence_contradiction",
    ),
  );
  assert.equal(result.reviewDrafts.length, 0);

  const insufficient = buildDevelopmentFixture("mcq");
  insufficient.proposal = buildDevelopmentFixture("insufficient_source").proposal;
  const insufficientResult = runFakeAiParsingV2(insufficient);
  assert.equal(
    insufficientResult.canonicalization.extraction?.disposition.status,
    "invalid_provider_output",
  );
  assert.equal(
    insufficientResult.canonicalization.extraction?.assessment.evidenceState,
    "extractable",
  );
  assert.equal(insufficientResult.reviewDrafts.length, 0);
});

test("application source evidence rejects false extraction and gates ambiguity", () => {
  for (const sourceKind of ["answer_only_source", "unsupported_source"]) {
    const fixture = buildDevelopmentFixture(sourceKind);
    fixture.proposal = buildDevelopmentFixture("mcq").proposal;
    const result = runFakeAiParsingV2(fixture);
    assert.equal(
      result.canonicalization.extraction?.disposition.status,
      "invalid_provider_output",
      sourceKind,
    );
    assert.equal(result.reviewDrafts.length, 0, sourceKind);
  }

  const ambiguous = runFakeAiParsingV2(
    buildDevelopmentFixture("ambiguous_source_evidence"),
  );
  assert.equal(
    ambiguous.canonicalization.extraction?.assessment.evidenceState,
    "ambiguous",
  );
  assert.equal(
    ambiguous.canonicalization.extraction?.assessment.sufficiency,
    "insufficient_evidence",
  );
  assert.equal(
    ambiguous.canonicalization.extraction?.disposition.status,
    "needs_more_evidence",
  );
  assert.equal(ambiguous.reviewDrafts.length, 1);
  assert.equal(ambiguous.reviewDrafts[0].reviewItem.status, "needs_more_evidence");

  const ungroundedAmbiguous = buildDevelopmentFixture(
    "ambiguous_source_evidence",
  );
  ungroundedAmbiguous.context.applicationEvidence.questionEvidence[0]
    .textFingerprintSha256 = FIXTURE_HASHES.prompt2;
  const ungroundedResult = runFakeAiParsingV2(ungroundedAmbiguous);
  assert.equal(
    ungroundedResult.canonicalization.extraction?.disposition.status,
    "invalid_provider_output",
  );
  assert.equal(ungroundedResult.reviewDrafts.length, 0);
});

test("V1 mixed semantics project one multipart parent row rather than duplicate children", () => {
  const fixture = buildDevelopmentFixture("multipart");
  const result = runFakeAiParsingV2(fixture);
  assert.equal(result.canonicalization.extraction?.questionPackages.length, 3);
  assert.equal(result.reviewDrafts.length, 1);
  assert.equal(result.reviewDrafts[0].question.question_type, "mixed");
  assert.equal(result.reviewDrafts[0].question.answer_spec.kind, "mixed");
  assert.deepEqual(
    result.reviewDrafts[0].question.ai_metadata.multipartChildren.map(
      (child) => child.id,
    ),
    ["q1a", "q1b"],
  );
  assert.match(result.reviewDrafts[0].question.content_source, /1\(a\)/);
  assert.match(result.reviewDrafts[0].question.content_source, /1\(b\)/);
  assert.ok(
    result.reviewDrafts[0].question.ai_metadata.sourceLineage.some(
      (span) => span.questionIds.includes("q1a") && span.questionIds.includes("q1b"),
    ),
  );

  const childWarning = buildDevelopmentFixture("multipart");
  childWarning.proposal.questionPackages.find(
    (item) => item.questionId === "q1b",
  ).solution = null;
  const warned = runFakeAiParsingV2(childWarning);
  assert.equal(warned.reviewDrafts.length, 1);
  assert.equal(warned.reviewDrafts[0].reviewItem.status, "needs_more_evidence");
  assert.ok(
    warned.reviewDrafts[0].reviewItem.validation_warnings.includes(
      "solution_missing",
    ),
  );
});

test("answer provenance, typed answers, and generation candidates remain explicit", () => {
  const provenanceByFixture = new Map([
    ["answer_provenance", "source_answer_key"],
    ["worked_solution", "source_worked_solution"],
    ["source_explicit_answer", "source_explicit_answer"],
    ["model_derived_answer", "model_derived"],
  ]);
  for (const [fixtureKind, provenance] of provenanceByFixture) {
    const result = runFakeAiParsingV2(buildDevelopmentFixture(fixtureKind));
    const packageValue = result.canonicalization.extraction?.questionPackages[0];
    assert.ok(packageValue, fixtureKind);
    assert.equal(packageValue.answer.proposal.provenance, provenance, fixtureKind);
    assert.equal(
      packageValue.disposition.status,
      provenance === "model_derived" ? "needs_more_evidence" : "review_ready",
      fixtureKind,
    );
  }

  const numeric = runFakeAiParsingV2(
    buildDevelopmentFixture("numeric_units"),
  );
  const numericAnswer =
    numeric.canonicalization.extraction.questionPackages[0].answer.proposal;
  assert.equal(numericAnswer.kind, "numeric");
  assert.equal(numericAnswer.unit, "N");
  assert.equal(numericAnswer.value, 5);
  assert.equal(numericAnswer.tolerance, 0.001);
  assert.ok(numeric.reviewDrafts[0].question.answer_spec.final_answers.includes("5 N"));

  const generation = runFakeAiParsingV2(
    buildDevelopmentFixture("generation_parameter_invariant"),
  ).canonicalization.extraction.questionPackages[0].generationRelevantFeatures;
  assert.equal(generation.authority, "provider_proposal");
  assert.equal(generation.candidateStatus, "candidate_only");
  assert.equal(
    generation.invariantCandidates[0].providerObservedInstanceCount,
    1,
  );
  assert.equal(
    "recurrenceEvidenceCount" in generation.invariantCandidates[0],
    false,
  );
  assert.equal("blueprint" in generation, false);
  assert.equal("authoritativeInvariants" in generation, false);

  const inflated = buildDevelopmentFixture("generation_parameter_invariant");
  inflated.proposal.questionPackages[0].generationRelevantFeatures
    .invariantCandidates[0].providerObservedInstanceCount = 2;
  const inflatedResult = runFakeAiParsingV2(inflated);
  assert.equal(inflatedResult.canonicalization.extraction, null);
  assert.equal(inflatedResult.reviewDrafts.length, 0);
});

test("source sufficiency and visual-registry outcomes are application-derived", () => {
  for (const [fixtureKind, sufficiency, findingCode] of [
    ["no_questions", "no_questions", "notes_without_question"],
    ["insufficient_source", "insufficient_evidence", "incomplete_question"],
    ["answer_only_source", "insufficient_evidence", "answer_only_source"],
    ["unsupported_source", "unsupported_source", "unsupported_content"],
  ]) {
    const result = runFakeAiParsingV2(buildDevelopmentFixture(fixtureKind));
    const extraction = result.canonicalization.extraction;
    assert.ok(extraction, fixtureKind);
    assert.equal(extraction.assessment.sufficiency, sufficiency, fixtureKind);
    assert.equal(extraction.disposition.authority, "application", fixtureKind);
    assert.equal(extraction.disposition.status, "insufficient_source", fixtureKind);
    assert.ok(extraction.findings.some((item) => item.code === findingCode));
    assert.equal(extraction.questionPackages.length, 0, fixtureKind);
    assert.equal(result.reviewDrafts.length, 0, fixtureKind);
  }

  const shared = runFakeAiParsingV2(buildDevelopmentFixture("shared_visual"));
  assert.equal(shared.canonicalization.extraction.questionPackages.length, 2);
  assert.equal(shared.canonicalization.extraction.visualObjects.length, 1);
  assert.deepEqual(
    [...shared.canonicalization.extraction.visualObjects[0].questionIds].sort(),
    ["q1", "q2"],
  );
  assert.equal(
    shared.canonicalization.extraction.visualObjects[0].applicationEvidenceId,
    "evidence-visual-1",
  );
  assert.ok(
    shared.canonicalization.extraction.questionPackages.every(
      (item) =>
        item.visualObjects.some((visual) => visual.id === "visual-shared") &&
        item.visualFacts.some((fact) => fact.id === "visual-fact-shared"),
    ),
  );

  const crossPageVisualFixture = buildDevelopmentFixture("required_graph");
  crossPageVisualFixture.proposal.questionBlocks[0].boundaryKind =
    "cross_page_continuation";
  crossPageVisualFixture.proposal.sourceSpans.find(
    (span) => span.id === "span-prompt",
  ).pageEnd = 2;
  crossPageVisualFixture.context.applicationEvidence.questionEvidence[0].pageEnd =
    2;
  const crossPageVisual = runFakeAiParsingV2(crossPageVisualFixture);
  assert.equal(crossPageVisual.reviewDrafts.length, 1);
  assert.equal(
    crossPageVisual.canonicalization.extraction?.visualObjects[0]
      .applicationEvidenceId,
    "evidence-visual-1",
  );

  const missing = runFakeAiParsingV2(buildDevelopmentFixture("missing_visual"));
  assert.equal(
    missing.canonicalization.extraction.questionPackages[0].disposition.status,
    "needs_more_evidence",
  );
  assert.equal(missing.reviewDrafts[0].reviewItem.status, "needs_more_evidence");

  const decorative = runFakeAiParsingV2(
    buildDevelopmentFixture("decorative_visual"),
  );
  assert.equal(
    decorative.canonicalization.extraction.visualObjects[0]
      .deterministicCropProposalKey,
    null,
  );
  assert.equal(
    decorative.reviewDrafts[0].question.ai_metadata.visualReferences.length,
    0,
  );
});

test("invalid normalized visual bounds fail at the Provider schema boundary", () => {
  const fixture = buildDevelopmentFixture("required_graph");
  const visualSpan = fixture.proposal.sourceSpans.find(
    (span) => span.id === "span-visual",
  );
  visualSpan.bbox.x = 0.8;
  visualSpan.bbox.width = 0.4;

  const result = runFakeAiParsingV2(fixture);
  assert.equal(result.canonicalization.extraction, null);
  assert.equal(result.reviewDrafts.length, 0);
});

test("required hard-boundary escape counters remain exactly zero", () => {
  const outOfRange = buildDevelopmentFixture("mcq");
  outOfRange.proposal.sourceSpans[0].pageStart = 99;
  outOfRange.proposal.sourceSpans[0].pageEnd = 99;
  const outOfRangeResult = runFakeAiParsingV2(outOfRange);

  const wrongVisual = buildDevelopmentFixture("required_graph");
  wrongVisual.proposal.visualObjects[0].questionIds = ["q2"];
  const wrongVisualResult = runFakeAiParsingV2(wrongVisual);

  const orphanFact = buildDevelopmentFixture("required_graph");
  orphanFact.proposal.questionPackages[0].solution.steps[0].visualFactIds = [
    "fact:orphan",
  ];
  const orphanFactResult = runFakeAiParsingV2(orphanFact);

  const providerAuthority = buildDevelopmentFixture("mcq");
  providerAuthority.proposal.reviewStatus = "review_ready";
  const providerAuthorityResult = runFakeAiParsingV2(providerAuthority);

  const valid = runFakeAiParsingV2(buildDevelopmentFixture("mcq"));
  const serializedProjection = JSON.stringify(valid.reviewDrafts);
  const foreignProjection = projectDocumentExtractionV2ToV1ReviewDrafts({
    extraction: valid.canonicalization.extraction,
    ownerBankId: "bank:foreign",
  });
  const singleInstance = runFakeAiParsingV2(
    buildDevelopmentFixture("generation_parameter_invariant"),
  ).canonicalization.extraction.questionPackages[0].generationRelevantFeatures;

  const counters = {
    answerSolutionContradictionReviewReady:
      runFakeAiParsingV2(buildDevelopmentFixture("answer_solution_conflict"))
        .reviewDrafts.length,
    autoApproval: /approved_at/.test(serializedProjection) ? 1 : 0,
    autoAssignment: /assignment_id|assignmentId/.test(serializedProjection) ? 1 : 0,
    autoPublication: /published_at|publication_id/.test(serializedProjection) ? 1 : 0,
    broadParentAccepted: runFakeAiParsingV2(
      buildDevelopmentFixture("taxonomy_broad_parent"),
    ).reviewDrafts.length,
    crossBankProjection: foreignProjection.length,
    fabricatedSourcePagePersisted:
      outOfRangeResult.canonicalization.extraction?.sourceSpans.filter(
        (span) => span.pageStart === 99 || span.pageEnd === 99,
      ).length ?? 0,
    invalidBboxAccepted:
      runFakeAiParsingV2(buildDevelopmentFixture("invalid_bbox"))
        .canonicalization.extraction === null
        ? 0
        : 1,
    invalidTaxonomyAccepted: runFakeAiParsingV2(
      buildDevelopmentFixture("taxonomy_unknown_id"),
    ).reviewDrafts.length,
    missingVisualSilentlyReviewReady: runFakeAiParsingV2(
      buildDevelopmentFixture("missing_visual"),
    ).reviewDrafts.filter((item) => item.reviewItem.status === "pending_review")
      .length,
    orphanVisualFactAccepted: orphanFactResult.reviewDrafts.length,
    providerReviewAuthorityAccepted:
      providerAuthorityResult.canonicalization.extraction === null ? 0 : 1,
    singleInstancePromotedToBlueprint:
      singleInstance.candidateStatus === "candidate_only" &&
      !("blueprint" in singleInstance) &&
      !("authoritativeInvariants" in singleInstance)
        ? 0
        : 1,
    wrongFacetAccepted: runFakeAiParsingV2(
      buildDevelopmentFixture("taxonomy_wrong_facet"),
    ).reviewDrafts.length,
    wrongQuestionVisualAccepted: wrongVisualResult.reviewDrafts.length,
  };

  assert.ok(
    Object.values(counters).every((count) => count === 0),
    JSON.stringify(counters),
  );
});

test("perfect independently declared gold yields deterministic full metrics", () => {
  const fixture = buildDevelopmentFixture("mcq");
  const result = runFakeAiParsingV2(fixture);
  assert.ok(result.canonicalization.extraction);

  const metrics = evaluateDocumentExtractionV2({
    extraction: result.canonicalization.extraction,
    gold: perfectMcqGold(),
  });

  assert.equal(metrics.questionDetection.f1, 1);
  assert.equal(metrics.boundaryDetection.f1, 1);
  assert.equal(metrics.sourceLineage.f1, 1);
  assert.equal(metrics.visualAssociations.f1, 1);
  assert.equal(metrics.visualDependentDetection.f1, 1);
  assert.equal(metrics.visualFactCorrectness.f1, 1);
  assert.equal(metrics.sharedVisualHandling.f1, 1);
  assert.equal(metrics.missingRequiredVisualHandling.f1, 1);
  assert.equal(metrics.answerCorrectness, 1);
  assert.equal(metrics.answerProvenanceAccuracy, 1);
  assert.equal(metrics.answerProvenanceCoverage, 1);
  assert.equal(metrics.solutionConsistency, 1);
  assert.equal(metrics.taxonomyExactIds.f1, 1);
  assert.equal(metrics.taxonomyOverTaggingCount, 0);
  assert.equal(metrics.taxonomyAbstentionAccuracy, 1);
  assert.equal(metrics.generationEvidence.f1, 1);
  assert.equal(metrics.sufficiencyAccuracy, 1);
  assert.equal(metrics.sourceReferences.f1, 1);
  assert.equal(metrics.qualityDispositionAccuracy, 1);
  assert.equal(metrics.validReviewDraftYield, 1);
  assert.equal(metrics.hardBoundaryEscapeTotal, 0);
  assert.ok(
    Object.values(metrics.hardBoundaryEscapes).every((count) => count === 0),
  );
});

test("independent gold mutations reduce measured quality", () => {
  const fixture = buildDevelopmentFixture("mcq");
  const result = runFakeAiParsingV2(fixture);
  const gold = perfectMcqGold();
  gold.questions[0].id = "q-expected-other";

  const metrics = evaluateDocumentExtractionV2({
    extraction: result.canonicalization.extraction,
    gold,
  });
  assert.equal(metrics.questionDetection.f1, 0);
  assert.equal(metrics.hardBoundaryEscapes.fabricatedQuestions, 1);
  assert.ok(metrics.hardBoundaryEscapeTotal > 0);
});

test("V1 projection cannot emit approval, publication, Assignment, or public asset state", () => {
  for (const fixtureKind of ["mcq", "missing_visual"]) {
    const fixture = buildDevelopmentFixture(fixtureKind);
    const canonical = canonicalizeDocumentExtractionV2({
      context: fixture.context,
      proposal: fixture.proposal,
    });
    const projected = projectDocumentExtractionV2ToV1ReviewDrafts({
      extraction: canonical.extraction,
      ownerBankId: fixture.context.source.bankScopeKey,
    });
    const serialized = JSON.stringify(projected);

    assert.ok(projected.length > 0);
    assert.doesNotMatch(serialized, /approved_at|published_at|assignment_id/);
    assert.doesNotMatch(serialized, /public_url|signed_url/);
    assert.ok(
      projected.every(
        (draft) =>
          draft.question.status === "draft" &&
          draft.question.visibility === "private" &&
          ["pending_review", "needs_more_evidence"].includes(
            draft.reviewItem.status,
          ),
      ),
    );
    assert.equal(
      projectDocumentExtractionV2ToV1ReviewDrafts({
        extraction: canonical.extraction,
        ownerBankId: "bank:foreign",
      }).length,
      0,
    );
  }
});

test("V2 visual registry reuses mature crop and private-asset identity kernels", () => {
  const fixture = buildDevelopmentFixture("multiple_visuals");
  const result = runFakeAiParsingV2(fixture);
  const extraction = result.canonicalization.extraction;
  assert.ok(extraction);
  assert.equal(extraction.visualObjects.length, 2);
  assert.ok(
    extraction.visualObjects.every(
      (visual) =>
        typeof visual.deterministicCropProposalKey === "string" &&
        visual.deterministicCropProposalKey.length > 0 &&
        visual.persistentAssetIdentity === null,
    ),
  );

  const first = derivePrivateQuestionAssetIdentityV2Fake({
    cropBytes: new TextEncoder().encode("synthetic bounded crop bytes"),
    questionId: "q1",
    sourceAssetId: "source:development",
  });
  const replay = derivePrivateQuestionAssetIdentityV2Fake({
    cropBytes: new TextEncoder().encode("synthetic bounded crop bytes"),
    questionId: "q1",
    sourceAssetId: "source:development",
  });
  assert.deepEqual(first, replay);
  assert.match(first.assetId, /^[a-f0-9-]{36}$/);
  assert.match(first.contentHash, /^[a-f0-9]{64}$/);
});

test("request composition keeps source last and reports local bytes without token claims", () => {
  const fixture = buildDevelopmentFixture("mcq");
  const taxonomyCandidates = fixture.context.taxonomyCandidates.map((candidate) => ({
    aliases: [],
    facet: candidate.facet,
    label: candidate.tagId,
    tagId: candidate.tagId,
  }));
  const sourcePacket = {
    availablePageNumbers: [1, 2, 3, 4],
    packetRefs: [
      {
        packetHash: "9".repeat(64),
        packetId: "packet:1",
        pageNumbers: [1, 2, 3],
      },
    ],
    pageCount: 4,
    sourceAssetRef: "source:development",
    sourceKind: "pdf",
    visualMetadata: [
      {
        bbox: { height: 0.4, width: 0.6, x: 0.2, y: 0.2 },
        localRef: "visual-region-1",
        page: 2,
      },
    ],
  };
  const initial = composeProviderRequestV2({
    attemptReason: "initial",
    candidateSubsetSha256: FIXTURE_HASHES.candidate,
    sourceContent: "bounded synthetic source",
    sourcePacket,
    taxonomyCandidates,
    taxonomySnapshotSha256: FIXTURE_HASHES.taxonomy,
  });

  assert.equal(initial.contextSize.repeatedSourceBytes, 0);
  assert.ok(initial.contextSize.sourceBytes > 0);
  assert.ok(initial.contextSize.schemaBytes > 0);
  assert.ok(initial.contextSize.taxonomyBytes > 0);
  assert.ok(initial.contextSize.candidateSubsetBytes > 0);
  assert.ok(initial.contextSize.sourcePacketBytes > 0);
  assert.ok(initial.contextSize.visualMetadataBytes > 0);
  assert.ok(initial.contextSize.totalRequestBytes > initial.contextSize.sourceBytes);
  assert.ok(
    initial.request.lastIndexOf("bounded synthetic source") >
      initial.request.lastIndexOf("<SOURCE_CONTENT>"),
  );
  assert.equal("estimatedTokens" in initial.contextSize, false);
  assert.equal("providerTokens" in initial.contextSize, false);

  const repair = composeProviderRequestV2({
    attemptReason: "structural_repair",
    candidateSubsetSha256: FIXTURE_HASHES.candidate,
    repairContext: "repair only the JSON structure",
    sourceContent: "",
    sourcePacket,
    taxonomyCandidates,
    taxonomySnapshotSha256: FIXTURE_HASHES.taxonomy,
  });
  assert.equal(repair.contextSize.sourceBytes, 0);
  assert.equal(repair.contextSize.repeatedSourceBytes, 0);

  assert.throws(
    () =>
      composeProviderRequestV2({
        attemptReason: "structural_repair",
        candidateSubsetSha256: FIXTURE_HASHES.candidate,
        sourceContent: "must not repeat",
        sourcePacket,
        taxonomyCandidates,
        taxonomySnapshotSha256: FIXTURE_HASHES.taxonomy,
      }),
    /zero source bytes/,
  );
  assert.throws(
    () =>
      composeProviderRequestV2({
        attemptReason: "checkpoint_replay",
        candidateSubsetSha256: FIXTURE_HASHES.candidate,
        sourceContent: "",
        sourcePacket,
        taxonomyCandidates,
        taxonomySnapshotSha256: FIXTURE_HASHES.taxonomy,
      }),
    /zero Provider inference/,
  );
});
