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
const observerModule = await loadTypeScriptModule(
  "src/lib/ai-pdf-import/quality-observatory.ts",
);
const { normalizeAIPdfExtractionResponse } = jiti(
  "../../src/lib/ai-pdf-import/schema.ts",
);

const placeholder = {
  bbox: { height: 0.3, width: 0.4, x: 0.1, y: 0.2 },
  page: 1,
  required: true,
  visual_role: "graph",
};
assert.equal(visual.validateAIPdfVisualProposal({ pageCount: 1, placeholder }).valid, true);
assert.equal(visual.validateAIPdfVisualProposal({
  pageCount: 1,
  placeholder: { ...placeholder, bbox: { ...placeholder.bbox, x: 0.8 } },
}).valid, false);
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
  inputStrategy: "native_pdf",
  promptBytes: 100,
  reason: "initial_extraction",
  repairContextBytes: 0,
  routeCandidateIndex: 0,
  schemaBytes: 20,
  sourceBytes: 1_000,
  sourceIncluded: true,
  taxonomyCatalogBytes: 40,
  transportAttempt: 1,
}).complete({
  failureCategory: "application_schema",
  outcome: "failed",
});
observer.beginAttempt({
  extractionAttempt: 2,
  inputStrategy: "native_pdf",
  promptBytes: 70,
  reason: "application_repair",
  repairContextBytes: 50,
  routeCandidateIndex: 0,
  schemaBytes: 20,
  sourceBytes: 0,
  sourceIncluded: false,
  taxonomyCatalogBytes: 0,
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
const snapshot = observer.snapshot();
assert.equal(snapshot.attemptsPerJob, 2);
assert.equal(snapshot.attemptHistogram.application_repair, 1);
assert.equal(snapshot.contextComposition.repeatedSourceBytes, 0);
assert.equal(snapshot.attempts[1].sourceIncluded, false);
assert.equal(snapshot.output.importableReviewDrafts, 1);

console.log("AI_PARSING_RUNTIME_CONTRACT=PASS");
