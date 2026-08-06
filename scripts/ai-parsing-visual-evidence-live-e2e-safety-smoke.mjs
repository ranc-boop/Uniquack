import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

import { buildSyntheticVisualEvidencePdf } from "./ai-parsing-eval/synthetic-visual-pdf.mjs";
import { loadAuthoritativeTaxonomySourceInventory } from "./ai-parsing-eval/lib/taxonomy-source-inventory.mjs";
import {
  validateVisualEvidenceLiveObservation,
} from "./ai-parsing-eval/visual-evidence-live-contract.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const expectedParsingContractSha256 =
  "5c19aed2d13c85121d89b09a3a85064f2eea200016560780295f2d7510e9ca95";
const nativeRequire = createRequire(import.meta.url);
const jiti = nativeRequire("jiti")(import.meta.url, {
  alias: { "@": resolve(root, "src") },
  cache: false,
});
const {
  buildRuntimeTaxonomyCandidateSubset,
  buildRuntimeTaxonomySnapshot,
  serializeRuntimeTaxonomyCandidates,
} = jiti("../src/lib/tags/runtime-taxonomy-snapshot.ts");
const [
  harness,
  launcher,
  sharedHarness,
  sharedSafety,
  importService,
  qualityObservatory,
  structuredOutput,
] = await Promise.all([
  readFile(resolve(root, "scripts/ai-parsing-visual-evidence-live-e2e.mjs"), "utf8"),
  readFile(resolve(root, "scripts/run-ai-parsing-visual-evidence-live-e2e.ps1"), "utf8"),
  readFile(resolve(root, "scripts/pdf50-end-to-end-live-e2e.mjs"), "utf8"),
  readFile(resolve(root, "scripts/pdf50-end-to-end-live-e2e-safety-smoke.mjs"), "utf8"),
  readFile(resolve(root, "src/lib/ai-pdf-import/service.ts"), "utf8"),
  readFile(resolve(root, "src/lib/ai-pdf-import/quality-observatory.ts"), "utf8"),
  readFile(resolve(root, "src/lib/ai-providers/gemini-structured-output.ts"), "utf8"),
]);
const providerSchema = JSON.parse(
  await readFile(
    resolve(root, "src/lib/ai-providers/gemini-ai-pdf-extraction.schema.json"),
    "utf8",
  ),
);

function contractConstant(source, name) {
  const match = source.match(
    new RegExp(`${name}\\s*=\\s*(?:\\r?\\n\\s*)?["']([^"']+)["']`),
  );
  assert.ok(match, `missing versioned contract constant ${name}`);
  return match[1];
}

function parsingContractSha256(components) {
  const fingerprints = Object.fromEntries(
    Object.entries(components)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => {
        const bytes = Buffer.from(value, "utf8");
        return [
          key,
          {
            byteLength: bytes.byteLength,
            sha256: createHash("sha256").update(bytes).digest("hex"),
          },
        ];
      }),
  );
  return createHash("sha256")
    .update(JSON.stringify(fingerprints))
    .digest("hex");
}

assert(
  structuredOutput.includes('mode: "json_schema"') &&
    structuredOutput.includes('transport: "response_json_schema"') &&
    structuredOutput.includes("schema: GEMINI_AI_PDF_EXTRACTION_SCHEMA"),
  "Gemini extraction output contract wrapper drifted",
);
const taxonomyInventory = await loadAuthoritativeTaxonomySourceInventory(root);
const taxonomySnapshot = buildRuntimeTaxonomySnapshot({
  ...taxonomyInventory.catalog,
  edges: taxonomyInventory.edges,
});
assert.equal(taxonomySnapshot.valid, true);
const candidateSubset = buildRuntimeTaxonomyCandidateSubset(
  taxonomySnapshot.candidates,
);
const computedParsingContractSha256 = parsingContractSha256({
  candidateSubset: candidateSubset.canonicalJson,
  fullTaxonomySnapshot: taxonomySnapshot.canonicalJson,
  outputContract: JSON.stringify({
    mode: "json_schema",
    schema: providerSchema,
    transport: "response_json_schema",
  }),
  promptContractVersion: contractConstant(
    importService,
    "AI_PDF_PROMPT_CONTRACT_VERSION",
  ),
  repairPolicyVersion: contractConstant(
    importService,
    "AI_PDF_REPAIR_POLICY_VERSION",
  ),
  retrievalAlgorithmVersion: candidateSubset.version,
  schemaContractVersion: contractConstant(
    importService,
    "AI_PDF_SCHEMA_CONTRACT_VERSION",
  ),
  taxonomyCandidates: serializeRuntimeTaxonomyCandidates(
    candidateSubset.candidates,
  ),
  treatmentVersion: contractConstant(
    qualityObservatory,
    "AI_PDF_PARSING_TREATMENT_VERSION",
  ),
});
assert.equal(
  taxonomySnapshot.sha256,
  "05c3179f0ce67f4828a66ddfdb7bd4c59752aceb390055cb26ba5192ddcafebe",
);
assert.equal(
  candidateSubset.sha256,
  "fd11666a6ea207244dd5c60529aef812f73c8e82120f02b5348bb4db02970262",
);
assert.equal(computedParsingContractSha256, expectedParsingContractSha256);

for (const name of [
  "AI_PARSING_VISUAL_E2E_ENVIRONMENT",
  "AI_PARSING_VISUAL_E2E_CONFIRM_CLEANUP",
  "AI_PARSING_VISUAL_PRIOR_CONSERVATIVE_MICROS",
]) {
  assert(harness.includes(`"${name}"`), `missing process-only control ${name}`);
  assert(launcher.includes(`"${name}"`), `launcher missing process-only control ${name}`);
}

assert(
  !/(?:from\s+["']dotenv|dotenv\/config|readFile[^\n]*\.env(?:\.local)?)/i.test(
    harness,
  ),
  "live harness must not load environment files",
);
assert(
  !/(?:dotenv|\.env\.local|Get-Content\s+[^\n]*\.env)/i.test(launcher),
  "launcher must not load environment files",
);
assert(harness.includes("expectedPriorConservativeMicros = 1_048_584"));
assert(harness.includes("authorizedTotalMicros = 2_000_000"));
assert(
  harness.includes(
    `"${expectedParsingContractSha256}"`,
  ),
  "visual harness must bind the versioned parsing contract",
);
assert(
  importService.includes(
    'AI_PDF_PROMPT_CONTRACT_VERSION = "ai-pdf-extraction-prompt-v4"',
  ) &&
    importService.includes(
      'AI_PDF_SCHEMA_CONTRACT_VERSION = "gemini-ai-pdf-extraction-schema-v3"',
    ) &&
    qualityObservatory.includes(
      '"ai-pdf-parsing/provider-neutral-v5"',
    ),
  "runtime prompt, schema and treatment versions must advance together",
);
assert(harness.includes("runLocalWorkerOnce({"));
assert(harness.includes("providerInferenceAttempts !== 1"));
assert(harness.includes("providerInferenceRequests !== 1"));
assert(harness.includes("proofControl.providerMaxNetworkRequests"));
assert(harness.includes("cleanupFixture({ bankId, fixture, fixtures, service })"));
assert(harness.includes("deterministicAssetId({"));
assert(harness.includes("independentlyCropSource(pdf, record)"));
assert(harness.includes("await image.scrollIntoViewIfNeeded()"));
assert(harness.includes("element.addEventListener(\"load\""));
assert(harness.includes("browser_asset_render_contract"));
assert(harness.includes("emitSafeProviderTerminalEvidence(job)"));
assert(harness.includes("VISUAL_PROVIDER_SAFE_ERROR_CODE="));
assert(harness.includes('"ai_job_checkpoint_transient"'));
assert(harness.includes("VISUAL_CHECKPOINT_FAILURE=operation:"));
assert(harness.includes("safeCheckpointOperations"));
assert(harness.includes("safeCheckpointReasons"));
assert(!harness.includes("job.safe_message"));
assert(harness.includes("await loadingTask.destroy();"));
assert(!harness.includes("await document.destroy();"));
assert(harness.includes("directPublicStorageDenied(config, asset)"));
assert(harness.includes("teacherAuthorizedRouteCount"));
assert(harness.includes("anonymousAuthorizedRouteCount"));
assert(harness.includes("outsiderAuthorizedRouteCount"));
assert(harness.includes("verifyReviewSurface({"));
assert(harness.includes("AI_PARSING_VISUAL_EVIDENCE_LIVE_E2E=PASS"));
assert(harness.includes("clearProcessEnvironment();"));
assert(harness.includes("VISUAL_FAILURE_STAGE=${safeFailureStage(failure)}"));
assert(harness.includes("VISUAL_IMPORTED_ITEM_COUNT="));
assert(harness.includes("VISUAL_HASH_MATCH_COUNT="));
assert(harness.includes("VISUAL_METRIC_INVALID_PROPOSALS="));
assert(harness.includes("VISUAL_INVALID_REASON_COUNTS="));
assert(!/console\.(?:log|error)\([^\n]*(?:email|password|serviceRoleKey|anonKey|storage_path|object_path)/.test(harness));
assert(
  providerSchema.properties.questions.items.required.includes("page_refs"),
  "Gemini visual extraction must require question page lineage",
);
assert.equal(providerSchema.properties.questions.items.properties.page_refs.minItems, 1);

assert(
  sharedHarness.includes("collect_question_assets") &&
    sharedHarness.includes("question_asset_storage") &&
    sharedHarness.includes("questionAssets.map((asset) => asset.id)") &&
    sharedHarness.includes("await waitForChildExit(child, 270_000)") &&
    !sharedHarness.includes("sleep(270_000).then"),
  "shared one-file harness must clean exact visual assets and cancel worker timers",
);
assert(
  sharedSafety.includes("collect_question_assets") &&
    sharedSafety.includes("question_asset_storage"),
  "shared safety smoke must bind visual cleanup",
);

const pdf = buildSyntheticVisualEvidencePdf();
assert(pdf.subarray(0, 8).toString("ascii").startsWith("%PDF-1."));
assert(pdf.byteLength > 4_000 && pdf.byteLength < 200_000);
const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
const loadingTask = pdfjs.getDocument({
  data: new Uint8Array(pdf),
  disableFontFace: true,
  useWorkerFetch: false,
  verbosity: 0,
});
const pdfDocument = await loadingTask.promise;
try {
  assert.equal(pdfDocument.numPages, 4);
  const pageText = [];
  const { createCanvas } = await import("@napi-rs/canvas");
  for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber += 1) {
    const page = await pdfDocument.getPage(pageNumber);
    const text = await page.getTextContent();
    pageText.push(text.items.map((item) => item.str ?? "").join(" "));
    if ([1, 2, 4].includes(pageNumber)) {
      const viewport = page.getViewport({ scale: 1 });
      const canvas = createCanvas(
        Math.ceil(viewport.width),
        Math.ceil(viewport.height),
      );
      await page.render({
        canvas,
        canvasContext: canvas.getContext("2d"),
        viewport,
      }).promise;
      const stats = await sharp(canvas.toBuffer("image/png")).stats();
      assert(
        stats.entropy > 0.05,
        `synthetic visual page ${pageNumber} must render nonblank evidence`,
      );
    }
  }
  assert.match(pageText[0], /REQUIRED DIAGRAM FOR QUESTION 1/);
  assert.match(pageText[1], /DECORATIVE COURSE BANNER/);
  assert.match(pageText[2], /FIGURE 3 IS INTENTIONALLY MISSING/);
  assert.match(pageText[3], /SHARED REQUIRED TABLE/);
} finally {
  await loadingTask.destroy();
}

function attachedQuestion(number, page, sharedGroupKey = null) {
  const questionId = `00000000-0000-5000-8000-00000000000${number}`;
  const assetId = `10000000-0000-5000-8000-00000000000${number}`;
  const record = {
    assetId,
    bbox: { height: 0.3, width: 0.4, x: 0.2, y: 0.3 },
    contentHashMatches: true,
    contentSha256: "a".repeat(64),
    deterministicIdentityMatches: true,
    page,
    required: true,
    sharedGroupKey,
    sourceAssetId: "20000000-0000-5000-8000-000000000001",
  };
  return {
    assets: [
      {
        bucket: "question-assets",
        directPublicDenied: true,
        id: assetId,
        questionId,
        storageObjectPresent: true,
      },
    ],
    hasMissingVisualWarning: false,
    pageRefs: [page],
    placeholders: [
      {
        page,
        required: true,
        visual_role: page === 4 ? "table" : "diagram",
      },
    ],
    questionId,
    reviewStatus: "pending_review",
    visibleQuestionNumber: String(number),
    visualEvidence: {
      records: [record],
      required: true,
      sourceAssetId: record.sourceAssetId,
      status: "validated",
    },
  };
}

function validObservation() {
  const sourceAssetId = "20000000-0000-5000-8000-000000000001";
  return {
    anonymousAssetVisibilityCount: 0,
    anonymousAuthorizedRouteCount: 0,
    assignmentCount: 0,
    bankApprovalCount: 0,
    bucketPrivate: true,
    crossOrganizationVisibilityCount: 0,
    maxProviderNetworkRequests: 68,
    orphanAssetCount: 0,
    outsiderAssetVisibilityCount: 0,
    outsiderAuthorizedRouteCount: 0,
    pageCount: 4,
    providerInferenceAttempts: 1,
    providerInferenceRequests: 1,
    providerNetworkRequests: 4,
    publicationCount: 0,
    questions: [
      attachedQuestion(1, 1),
      {
        assets: [],
        hasMissingVisualWarning: false,
        pageRefs: [2],
        placeholders: [],
        questionId: "00000000-0000-5000-8000-000000000002",
        reviewStatus: "pending_review",
        visibleQuestionNumber: "2",
        visualEvidence: null,
      },
      {
        assets: [],
        hasMissingVisualWarning: true,
        pageRefs: [3],
        placeholders: [],
        questionId: "00000000-0000-5000-8000-000000000003",
        reviewStatus: "needs_more_evidence",
        visibleQuestionNumber: "3",
        visualEvidence: {
          records: [],
          required: true,
          sourceAssetId,
          status: "needs_more_evidence",
        },
      },
      {
        ...attachedQuestion(4, 4, "question_4_shared_table"),
        visibleQuestionNumber: "4 (parts a and b)",
      },
    ],
    secretOrRawContentEmissionCount: 0,
    sourceAssetId,
    sourceHashMatches: true,
    teacherAuthorizedRouteCount: 2,
    totalAssetCount: 2,
    visualInvalidReasonCounts: {
      decorative_required: 0,
      invalid_crop_content: 0,
      invalid_source_region: 0,
      missing_question_lineage: 0,
      page_outside_question_lineage: 0,
      source_render_unavailable: 0,
    },
    visualMetrics: { invalidProposals: 0 },
    ui: {
      initialAssetCount: 2,
      initialVisualSafeIndices: ["Q1", "Q4"],
      missingWarningVisible: true,
      reloadAssetCount: 2,
      reloadVisualSafeIndices: ["Q1", "Q4"],
      remountAssetCount: 2,
      remountVisualSafeIndices: ["Q1", "Q4"],
    },
  };
}

assert.equal(validateVisualEvidenceLiveObservation(validObservation()).valid, true);
const explicitDecorativeSkip = validObservation();
explicitDecorativeSkip.questions[1].placeholders = [
  { page: 2, required: false, visual_role: "decorative" },
];
assert.equal(
  validateVisualEvidenceLiveObservation(explicitDecorativeSkip).valid,
  true,
);
const rejectedMissingProposal = validObservation();
rejectedMissingProposal.questions[2].placeholders = [
  { page: 3, required: true, visual_role: "diagram" },
];
rejectedMissingProposal.visualMetrics.invalidProposals = 1;
rejectedMissingProposal.visualInvalidReasonCounts.invalid_crop_content = 1;
assert.equal(
  validateVisualEvidenceLiveObservation(rejectedMissingProposal).valid,
  true,
);

const mutations = [
  ["historical_source_drift", (value) => { value.sourceHashMatches = false; }],
  ["missing_safe_question", (value) => { value.questions.pop(); }],
  ["duplicate_safe_question", (value) => { value.questions[3].pageRefs = [1]; }],
  ["unexpected_safe_question", (value) => { value.questions[3].pageRefs = [5]; }],
  ["visible_number_lineage_mismatch", (value) => { value.questions[3].visibleQuestionNumber = "7"; }],
  ["wrong_question_asset", (value) => { value.questions[0].assets[0].questionId = value.questions[1].questionId; }],
  ["decorative_asset_attached", (value) => { value.questions[1].assets = structuredClone(value.questions[0].assets); }],
  ["decorative_misclassified_required", (value) => { value.questions[1].placeholders = [{ page: 2, required: true, visual_role: "diagram" }]; }],
  ["missing_visual_not_blocked", (value) => { value.questions[2].reviewStatus = "pending_review"; }],
  ["missing_visual_proposal_misclassified", (value) => {
    value.questions[2].placeholders = [
      { page: 3, required: false, visual_role: "decorative" },
    ];
    value.visualMetrics.invalidProposals = 1;
  }],
  ["unaccounted_invalid_proposal", (value) => { value.visualMetrics.invalidProposals = 1; }],
  ["missing_lineage_rejection_hidden", (value) => {
    value.visualMetrics.invalidProposals = 1;
    value.visualInvalidReasonCounts.missing_question_lineage = 1;
  }],
  ["rejection_reason_total_drift", (value) => {
    value.visualInvalidReasonCounts.invalid_source_region = 1;
  }],
  ["invalid_shared_group", (value) => { value.questions[3].visualEvidence.records[0].sharedGroupKey = ""; }],
  ["invalid_crop_bounds", (value) => { value.questions[0].visualEvidence.records[0].bbox.width = 2; }],
  ["nondeterministic_asset", (value) => { value.questions[0].visualEvidence.records[0].deterministicIdentityMatches = false; }],
  ["public_asset_route", (value) => { value.anonymousAuthorizedRouteCount = 1; }],
  ["orphan_asset", (value) => { value.orphanAssetCount = 1; }],
  ["review_gate_bypassed", (value) => { value.assignmentCount = 1; }],
  ["reload_visual_set_changed", (value) => { value.ui.reloadVisualSafeIndices = ["Q1", "Q3"]; }],
];

for (const [label, mutate] of mutations) {
  const value = structuredClone(validObservation());
  mutate(value);
  assert.throws(
    () => validateVisualEvidenceLiveObservation(value),
    undefined,
    `${label} mutation must fail closed`,
  );
}

console.log(`PASS AI Parsing visual live safety and ${mutations.length} mutation contracts`);
