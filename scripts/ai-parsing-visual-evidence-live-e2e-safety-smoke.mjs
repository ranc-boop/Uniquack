import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

import { buildSyntheticVisualEvidencePdf } from "./ai-parsing-eval/synthetic-visual-pdf.mjs";
import {
  validateVisualEvidenceLiveObservation,
} from "./ai-parsing-eval/visual-evidence-live-contract.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const [harness, launcher, sharedHarness, sharedSafety] = await Promise.all([
  readFile(resolve(root, "scripts/ai-parsing-visual-evidence-live-e2e.mjs"), "utf8"),
  readFile(resolve(root, "scripts/run-ai-parsing-visual-evidence-live-e2e.ps1"), "utf8"),
  readFile(resolve(root, "scripts/pdf50-end-to-end-live-e2e.mjs"), "utf8"),
  readFile(resolve(root, "scripts/pdf50-end-to-end-live-e2e-safety-smoke.mjs"), "utf8"),
]);

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
assert(harness.includes("expectedPriorConservativeMicros = 677_178"));
assert(harness.includes("authorizedTotalMicros = 2_000_000"));
assert(harness.includes("runLocalWorkerOnce({"));
assert(harness.includes("providerInferenceAttempts !== 1"));
assert(harness.includes("providerInferenceRequests !== 1"));
assert(harness.includes("proofControl.providerMaxNetworkRequests"));
assert(harness.includes("cleanupFixture({ bankId, fixture, fixtures, service })"));
assert(harness.includes("deterministicAssetId({"));
assert(harness.includes("independentlyCropSource(pdf, record)"));
assert(harness.includes("await loadingTask.destroy();"));
assert(!harness.includes("await document.destroy();"));
assert(harness.includes("directPublicStorageDenied(config, asset)"));
assert(harness.includes("teacherAuthorizedRouteCount"));
assert(harness.includes("anonymousAuthorizedRouteCount"));
assert(harness.includes("outsiderAuthorizedRouteCount"));
assert(harness.includes("verifyReviewSurface({"));
assert(harness.includes("AI_PARSING_VISUAL_EVIDENCE_LIVE_E2E=PASS"));
assert(harness.includes("clearProcessEnvironment();"));
assert(!/console\.(?:log|error)\([^\n]*(?:email|password|serviceRoleKey|anonKey|storage_path|object_path)/.test(harness));

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
        placeholders: [
          { page: 2, required: false, visual_role: "decorative" },
        ],
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
      attachedQuestion(4, 4, "question_4_shared_table"),
    ],
    secretOrRawContentEmissionCount: 0,
    sourceAssetId,
    sourceHashMatches: true,
    teacherAuthorizedRouteCount: 2,
    totalAssetCount: 2,
    ui: {
      initialAssetCount: 2,
      missingWarningVisible: true,
      reloadAssetCount: 2,
      remountAssetCount: 2,
    },
  };
}

assert.equal(validateVisualEvidenceLiveObservation(validObservation()).valid, true);

const mutations = [
  ["historical_source_drift", (value) => { value.sourceHashMatches = false; }],
  ["wrong_question_asset", (value) => { value.questions[0].assets[0].questionId = value.questions[1].questionId; }],
  ["decorative_asset_attached", (value) => { value.questions[1].assets = structuredClone(value.questions[0].assets); }],
  ["missing_visual_not_blocked", (value) => { value.questions[2].reviewStatus = "pending_review"; }],
  ["shared_group_removed", (value) => { value.questions[3].visualEvidence.records[0].sharedGroupKey = null; }],
  ["invalid_crop_bounds", (value) => { value.questions[0].visualEvidence.records[0].bbox.width = 2; }],
  ["nondeterministic_asset", (value) => { value.questions[0].visualEvidence.records[0].deterministicIdentityMatches = false; }],
  ["public_asset_route", (value) => { value.anonymousAuthorizedRouteCount = 1; }],
  ["orphan_asset", (value) => { value.orphanAssetCount = 1; }],
  ["review_gate_bypassed", (value) => { value.assignmentCount = 1; }],
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
