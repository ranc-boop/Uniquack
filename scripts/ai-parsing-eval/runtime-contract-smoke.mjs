import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

import ts from "typescript";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const nativeRequire = createRequire(import.meta.url);
const jiti = nativeRequire("jiti")(import.meta.url, {
  alias: { "@": resolve(root, "src") },
  cache: false,
});

async function loadTypeScriptModule(relativePath, mocks = {}) {
  const filePath = resolve(root, relativePath);
  const source = await readFile(filePath, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: filePath,
  }).outputText;
  const loaded = { exports: {} };
  const requireMock = (specifier) => {
    if (specifier === "server-only") return {};
    if (specifier === "node:crypto") return nativeRequire("node:crypto");
    if (Object.hasOwn(mocks, specifier)) return mocks[specifier];
    throw new Error(`Unexpected test dependency: ${specifier}`);
  };
  new Function("exports", "require", "module", "__filename", "__dirname", output)(
    loaded.exports,
    requireMock,
    loaded,
    filePath,
    dirname(filePath),
  );
  return loaded.exports;
}

const visual = await loadTypeScriptModule(
  "src/lib/ai-pdf-import/visual-evidence.ts",
);
const providerUsage = await loadTypeScriptModule(
  "src/lib/ai-operations/provider-usage.ts",
);
const observerModule = await loadTypeScriptModule(
  "src/lib/ai-pdf-import/quality-observatory.ts",
  { "@/lib/ai-operations/provider-usage": providerUsage },
);
const taxonomyDb = await loadTypeScriptModule(
  "src/lib/tags/taxonomy-db.ts",
);
const { normalizeAIPdfExtractionResponse } = jiti(
  "../../src/lib/ai-pdf-import/schema.ts",
);

const taxonomyEdges = [
  {
    edge_kind: "parent_child",
    from_tag_id: "math",
    is_primary: true,
    to_tag_id: "math.concept",
  },
  {
    edge_kind: "maps_to",
    from_tag_id: "math.curriculum.ap",
    is_primary: false,
    to_tag_id: "math.concept.algebra",
  },
];
const taxonomyCatalog = await taxonomyDb.loadTaxonomyCatalog(
  {
    from(table) {
      assert.equal(table, "taxonomy_edges");
      return {
        select() {
          return this;
        },
        eq(column, value) {
          assert.equal(column, "status");
          assert.equal(value, "active");
          return this;
        },
        async order(column, options) {
          assert.equal(column, "sort_order");
          assert.deepEqual(options, { ascending: true });
          return { data: taxonomyEdges, error: null };
        },
      };
    },
    async rpc(name) {
      assert.equal(name, "get_active_taxonomy_catalog_v1");
      return {
        data: {
          facets: [{
            facet_key: "concept",
            label: "Concept",
            root_tag_id: "math.concept",
            sort_order: 1,
          }],
          nodes: [
            {
              aliases: [],
              description: null,
              facet_key: null,
              is_assignable: false,
              label: "Math",
              parent_tag_ids: [],
              tag_id: "math",
            },
            {
              aliases: [],
              description: null,
              facet_key: "concept",
              is_assignable: false,
              label: "Concept",
              parent_tag_ids: ["math"],
              tag_id: "math.concept",
            },
          ],
        },
        error: null,
      };
    },
  },
  { includeAllEdges: true },
);
assert.equal(taxonomyCatalog.errorMessage, null);
assert.equal(taxonomyCatalog.catalog.nodes.length, 2);
assert.equal(
  taxonomyCatalog.catalog.nodes.find((node) => node.tag_id === "math")?.facet_key,
  null,
);
assert.deepEqual(taxonomyCatalog.edges, taxonomyEdges);

const placeholder = {
  bbox: { height: 0.3, width: 0.4, x: 0.1, y: 0.2 },
  page: 1,
  required: true,
  visual_role: "graph",
};
assert.equal(visual.validateAIPdfVisualProposal({
  pageCount: 1,
  placeholder,
  questionPageRefs: [1],
}).valid, true);
assert.equal(visual.validateAIPdfVisualProposal({
  pageCount: 1,
  placeholder: { ...placeholder, bbox: { ...placeholder.bbox, x: 0.8 } },
  questionPageRefs: [1],
}).valid, false);
assert.equal(visual.validateAIPdfVisualProposal({
  pageCount: 2,
  placeholder,
  questionPageRefs: [],
}).reason, "missing_question_lineage");
assert.equal(visual.validateAIPdfVisualProposal({
  pageCount: 2,
  placeholder,
  questionPageRefs: [2],
}).reason, "page_outside_question_lineage");
assert.equal(visual.questionRequiresVisualEvidence({
  contentHtml: "<p>Use the graph shown below to justify your answer.</p>",
}), true);
const contentHash = visual.contentSha256(Buffer.from("synthetic-crop"));
const identity = visual.deterministicQuestionAssetId({
  contentHash,
  questionId: "00000000-0000-4000-8000-000000000001",
  sourceAssetId: "00000000-0000-4000-8000-000000000002",
});
assert.equal(identity, visual.deterministicQuestionAssetId({
  contentHash,
  questionId: "00000000-0000-4000-8000-000000000001",
  sourceAssetId: "00000000-0000-4000-8000-000000000002",
}));
assert.equal(
  visual.safeQuestionVisualAlt({
    ...placeholder,
    subquestion_ref: "b",
  }),
  "Question graph for part b",
);
const sanitizedRecord = visual.visualEvidenceRecord({
  assetId: "00000000-0000-4000-8000-000000000003",
  contentHash,
  placeholder: {
    ...placeholder,
    ambiguity: "source text must not be copied",
    shared_group_key: "source text must not be copied",
  },
  sourceAssetId: "00000000-0000-4000-8000-000000000002",
});
assert.equal(sanitizedRecord.ambiguity, "provider_flagged");
assert.equal(sanitizedRecord.sharedGroupKey, null);

const normalizedVisuals = normalizeAIPdfExtractionResponse({
  questions: [
    {
      asset_placeholders: [
        {
          bbox: { height: 0.2, width: 0.2, x: 0.1, y: 0.1 },
          page: 1,
          placeholder: "{{asset:logo}}",
          visual_role: "decorative",
        },
      ],
      content_html: "<p>Compute 2 + 2.</p>",
      title: "Decorative image",
    },
    {
      asset_placeholders: [
        {
          bbox: { height: 0.4, width: 0.4, x: 0.8, y: 0.1 },
          page: 1,
          placeholder: "{{asset:required_bad_crop}}",
          required: true,
          visual_role: "diagram",
        },
      ],
      content_html: "<p>Determine the requested value.</p>",
      title: "Required invalid crop",
    },
  ],
});
assert.equal(normalizedVisuals.questions[0].asset_placeholders[0].required, false);
assert.equal(normalizedVisuals.questions[0].visual_evidence_required, false);
assert.equal(normalizedVisuals.questions[1].asset_placeholders.length, 0);
assert.equal(normalizedVisuals.questions[1].visual_evidence_required, true);

const observer = observerModule.createAIPdfQualityObservatory();
observer.beginAttempt({
  extractionAttempt: 1,
  inputStrategy: "gemini_native_pdf",
  context: {
    extractionInstructionBytes: 60,
    previousResponseBytes: 0,
    semanticRecoveryInstructionBytes: 0,
    serializedRequestBytes: 1_180,
    sourceInputBytes: 1_000,
    structuralRepairInstructionBytes: 0,
    structuredSchemaBytes: 80,
    systemInstructionBytes: 0,
    taxonomyCandidateBytes: 40,
  },
  inferenceOrdinal: 1,
  reason: "FIRST_ATTEMPT",
  routeCandidateIndex: 0,
  sourceIncluded: true,
  sourceRepeated: false,
  scope: "single",
  transportAttempt: 1,
}).complete({
  failureCategory: "application_schema",
  outcome: "failed",
});
observer.beginAttempt({
  extractionAttempt: 2,
  inputStrategy: "gemini_native_pdf",
  context: {
    extractionInstructionBytes: 0,
    previousResponseBytes: 50,
    semanticRecoveryInstructionBytes: 0,
    serializedRequestBytes: 150,
    sourceInputBytes: 0,
    structuralRepairInstructionBytes: 70,
    structuredSchemaBytes: 0,
    systemInstructionBytes: 0,
    taxonomyCandidateBytes: 0,
  },
  inferenceOrdinal: 2,
  reason: "STRUCTURAL_SCHEMA_REPAIR",
  routeCandidateIndex: 0,
  sourceIncluded: false,
  sourceRepeated: false,
  scope: "single",
  transportAttempt: 1,
}).complete({
  outcome: "success",
  output: {
    applicationValidCandidates: 1,
    rawCandidates: 1,
    rejectedCandidates: 0,
    schemaValidCandidates: 1,
    warningCount: 0,
  },
  usage: {
    cachedInputTokens: 0,
    candidateOutputTokens: 80,
    inputTokens: 100,
    outputTokens: 80,
    thoughtTokens: 0,
    totalTokens: 180,
  },
});
observer.recordPersistence({ importableReviewDrafts: 1 });
observer.recordVisualEvidence({
  invalidProposals: 1,
  invalidProposalReasons: {
    decorative_required: 0,
    invalid_crop_content: 1,
    invalid_source_region: 0,
    missing_question_lineage: 0,
    page_outside_question_lineage: 0,
    source_render_unavailable: 0,
  },
});
observer.recordVisualEvidence({
  invalidProposals: 1,
  invalidProposalReasons: {
    decorative_required: 0,
    invalid_crop_content: 0,
    invalid_source_region: 0,
    missing_question_lineage: 0,
    page_outside_question_lineage: 1,
    source_render_unavailable: 0,
  },
});
observer.recordContractEvidence({
  candidateCount: 10,
  candidateSubsetBytes: 400,
  candidateSubsetSha256: "c".repeat(64),
  fullTaxonomySnapshotBytes: 800,
  fullTaxonomySnapshotSha256: "b".repeat(64),
  parsingContractSha256: "a".repeat(64),
  promptContractVersion: "prompt-v1",
  repairPolicyVersion: "repair-v1",
  retrievalAlgorithmVersion: "retrieval-v1",
  schemaContractVersion: "schema-v1",
  subsetToFullCatalogByteRatio: 0.5,
  taxonomySnapshotSha256: "b".repeat(64),
  taxonomySnapshotVersion: 2,
});
const snapshot = observer.snapshot();
assert.equal(snapshot.attemptsPerJob, 2);
assert.equal(snapshot.attemptHistogram.STRUCTURAL_SCHEMA_REPAIR, 1);
assert.equal(snapshot.contextComposition.repeatedSourceBytes, 0);
assert.equal(snapshot.contextComposition.repeatedPreviousResponseBytes, 50);
assert.equal(snapshot.contextComposition.totalSerializedRequestBytes, 1_330);
assert.equal(snapshot.contextComposition.componentBytes.sourceInput, 1_000);
assert.equal(snapshot.contextComposition.componentBytes.fixedTransportOverhead, 30);
assert.equal(snapshot.contextComposition.providerReportedInputTokens, null);
assert.equal(snapshot.contextComposition.providerReportedOutputTokens, null);
assert.equal(
  snapshot.attempts[1].usageAccounting.providerReportedUsage.source,
  "PROVIDER_REPORTED_USAGE",
);
assert.equal(
  snapshot.usageAccounting.localContextBytes.source,
  "LOCAL_CONTEXT_BYTES",
);
assert.deepEqual(snapshot.usageAccounting.unknownUsage.fields, [
  "providerReportedInputTokens",
  "countTokensInputTokens",
  "candidateOutputTokens",
  "thoughtTokens",
  "toolUseInputTokens",
  "totalTokens",
]);
assert.equal(snapshot.attempts[1].sourceIncluded, false);
assert.equal(snapshot.output.importableReviewDrafts, 1);
assert.equal(snapshot.visualEvidence.invalidProposals, 2);
assert.equal(snapshot.visualEvidence.invalidProposalReasons.invalid_crop_content, 1);
assert.equal(
  snapshot.visualEvidence.invalidProposalReasons.page_outside_question_lineage,
  1,
);
assert.equal(snapshot.output.usefulOutputPerProviderInputToken, null);
assert.equal(snapshot.contractEvidence.taxonomySnapshotSha256, "b".repeat(64));
assert.equal(snapshot.contractEvidence.candidateSubsetSha256, "c".repeat(64));
assert.equal(snapshot.contractEvidence.subsetToFullCatalogByteRatio, 0.5);

const checkpoint = observer.checkpoint();
assert.deepEqual(
  observerModule.parseAIPdfQualityCheckpoint(checkpoint),
  checkpoint,
);
const legacyCheckpoint = structuredClone(checkpoint);
for (const attempt of legacyCheckpoint.attempts) {
  delete attempt.usageAccounting;
}
const parsedLegacyCheckpoint = observerModule.parseAIPdfQualityCheckpoint(
  legacyCheckpoint,
);
assert(parsedLegacyCheckpoint);
assert.equal(parsedLegacyCheckpoint.attempts[0].usageAccounting, null);
const resumedObserver = observerModule.createAIPdfQualityObservatory(checkpoint);
resumedObserver.recordCheckpointReplay();
const resumedSnapshot = resumedObserver.snapshot();
assert.equal(resumedSnapshot.attemptsPerJob, 2);
assert.equal(resumedSnapshot.attemptHistogram.FIRST_ATTEMPT, 1);
assert.equal(resumedSnapshot.attemptHistogram.STRUCTURAL_SCHEMA_REPAIR, 1);
assert.equal(
  resumedSnapshot.attemptHistogram.CHECKPOINT_REPLAY_ZERO_INFERENCE,
  1,
);
assert.equal(resumedSnapshot.checkpointReplayCount, 1);
assert.equal(resumedSnapshot.contextComposition.totalSerializedRequestBytes, 1_330);
assert.equal(resumedSnapshot.contextComposition.providerReportedInputTokens, null);
assert.equal(resumedSnapshot.contextComposition.providerReportedOutputTokens, null);
assert.equal(
  resumedSnapshot.contractEvidence.taxonomySnapshotSha256,
  "b".repeat(64),
);
assert.equal(
  observerModule.parseAIPdfQualityCheckpoint({
    ...checkpoint,
    contractVersion: 99,
  }),
  null,
);
assert.equal(
  observerModule.parseAIPdfQualityCheckpoint({
    ...checkpoint,
    attempts: [
      {
        ...checkpoint.attempts[0],
        context: {
          ...checkpoint.attempts[0].context,
          sourceInputBytes: -1,
        },
      },
    ],
  }),
  null,
);
const canonicalCheckpoint = observerModule.parseAIPdfQualityCheckpoint({
  ...checkpoint,
  rawSource: "must-not-survive",
  attempts: checkpoint.attempts.map((attempt) => ({
    ...attempt,
    rawPrompt: "must-not-survive",
  })),
});
assert(canonicalCheckpoint);
assert.equal(JSON.stringify(canonicalCheckpoint).includes("must-not-survive"), false);

console.log("AI_PARSING_RUNTIME_CONTRACT=PASS");
