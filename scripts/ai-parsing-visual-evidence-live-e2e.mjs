#!/usr/bin/env node

// One-run, synthetic-only proof that Gemini proposals become requester-authorized
// source crops without bypassing Review. The harness never reads environment files
// and emits only bounded counters and immutable contract hashes.

import { createHash, randomBytes } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import sharp from "sharp";

import {
  buildSyntheticVisualEvidencePdf,
} from "./ai-parsing-eval/synthetic-visual-pdf.mjs";
import {
  VisualEvidenceContractError,
  validateVisualEvidenceLiveObservation,
} from "./ai-parsing-eval/visual-evidence-live-contract.mjs";
import {
  estimatePDF50ProviderProofCostMicros,
} from "./lib/pdf50-provider-proof-control.mjs";
import {
  HarnessError,
  asRecord,
  assert,
  assertSafeBrowserText,
  clearProcessEnvironment,
  cleanupFixture,
  countRows,
  createFixtureState,
  createSyntheticBank,
  createSyntheticOrganization,
  createSyntheticTeacher,
  loadFinishedJob,
  knownProviderModel,
  numeric,
  proofControl,
  requiredEnvironment,
  requireData,
  requireProcessEnvironment,
  runLocalWorkerOnce,
  runReadinessPreflight,
  signInTeacher,
  signInThroughBrowser,
  sourceBucket,
  startNextServer,
  stopOwnedTemporaryServer,
  uploadThroughBrowser,
  unusedStandingTeacherEnvironment,
  verifyAnonymousSourcePrivacy,
  verifyProductionReconciliationContracts,
} from "./pdf50-end-to-end-live-e2e.mjs";

const visualEnvironment = [
  "AI_PARSING_VISUAL_E2E_ENVIRONMENT",
  "AI_PARSING_VISUAL_E2E_CONFIRM_CLEANUP",
  "AI_PARSING_VISUAL_PRIOR_CONSERVATIVE_MICROS",
];
const visualEnvironmentLiteral = "DISPOSABLE_AI_PARSING_VISUAL_EVIDENCE";
const visualCleanupLiteral = "DELETE_AI_PARSING_VISUAL_EVIDENCE_FIXTURES";
const expectedPriorConservativeMicros = 939_324;
const authorizedTotalMicros = 2_000_000;
const visualCostCeilingMicros = estimatePDF50ProviderProofCostMicros(proofControl);
const questionAssetsBucket = "question-assets";
const missingVisualWarning =
  "Visual evidence is still required before this Draft can be approved.";
const expectedTaxonomySnapshot =
  "05c3179f0ce67f4828a66ddfdb7bd4c59752aceb390055cb26ba5192ddcafebe";
const expectedCandidateSubset =
  "fd11666a6ea207244dd5c60529aef812f73c8e82120f02b5348bb4db02970262";
const expectedParsingContract =
  "579f6e308de89b77f681906ec40dc65cd7ba9043351e59894ebfa4c1c65687a1";

const allowedFailureCategories = new Set([
  "browser_visual_evidence_failed",
  "cleanup_failed",
  "cost_envelope_rejected",
  "provider_execution_failed",
  "provider_network_error",
  "provider_timeout",
  "unexpected_failure",
  "visual_evidence_contract_failed",
  "visual_evidence_persistence_failed",
  "visual_evidence_privacy_failed",
  "visual_source_integrity_failed",
]);
const allowedFailureStages = new Set([
  "batch_contract",
  "browser_render_contract",
  "cleanup_contract",
  "import_cardinality_contract",
  "provider_counter_contract",
  "provider_terminal_contract",
  "quality_observatory_contract",
  "requester_authorization_contract",
  "source_blob_contract",
  "source_hash_contract",
  "source_review_lineage_contract",
  "visual_persistence_contract",
]);

class VisualHarnessError extends Error {
  constructor(category, stage = "unspecified") {
    super(category);
    this.category = category;
    this.stage = stage;
  }
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function clearVisualEnvironment() {
  for (const name of visualEnvironment) delete process.env[name];
}

function requireVisualEnvironment() {
  for (const name of visualEnvironment) {
    console.log(`${name}=${process.env[name]?.trim() ? "PRESENT" : "MISSING"}`);
  }
  if (visualEnvironment.some((name) => !process.env[name]?.trim())) {
    throw new VisualHarnessError("cost_envelope_rejected");
  }
  if (
    process.env.AI_PARSING_VISUAL_E2E_ENVIRONMENT !== visualEnvironmentLiteral ||
    process.env.AI_PARSING_VISUAL_E2E_CONFIRM_CLEANUP !== visualCleanupLiteral
  ) {
    throw new VisualHarnessError("cost_envelope_rejected");
  }
  const prior = Number(process.env.AI_PARSING_VISUAL_PRIOR_CONSERVATIVE_MICROS);
  if (
    prior !== expectedPriorConservativeMicros ||
    prior + visualCostCeilingMicros > authorizedTotalMicros
  ) {
    throw new VisualHarnessError("cost_envelope_rejected");
  }
  return { prior };
}

function safeFailureCategory(error) {
  if (error instanceof VisualEvidenceContractError) {
    return "visual_evidence_contract_failed";
  }
  if (error instanceof HarnessError) {
    if (
      error.category === "provider_network_error" ||
      error.category === "provider_timeout"
    ) {
      return error.category;
    }
    if (String(error.category).startsWith("provider_")) {
      return "provider_execution_failed";
    }
    return allowedFailureCategories.has(error.category)
      ? error.category
      : "unexpected_failure";
  }
  const category = String(error?.category ?? "unexpected_failure");
  return allowedFailureCategories.has(category) ? category : "unexpected_failure";
}

function safeFailureStage(error) {
  if (
    error instanceof VisualEvidenceContractError &&
    /^[a-z0-9_]{1,80}$/.test(error.predicate)
  ) {
    return error.predicate;
  }
  if (error instanceof VisualHarnessError && allowedFailureStages.has(error.stage)) {
    return error.stage;
  }
  return "unexpected_failure";
}

async function blobToBuffer(blob, category, stage = "source_blob_contract") {
  if (!blob) throw new VisualHarnessError(category, stage);
  return Buffer.from(await blob.arrayBuffer());
}

async function renderSourcePage(pdf, pageNumber) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(
    path.join(
      process.cwd(),
      "node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",
    ),
  ).toString();
  const { createCanvas } = await import("@napi-rs/canvas");
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(pdf),
    disableFontFace: true,
    useWorkerFetch: false,
    verbosity: 0,
  });
  const document = await loadingTask.promise;
  try {
    const page = await document.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1.5 });
    const canvas = createCanvas(
      Math.ceil(viewport.width),
      Math.ceil(viewport.height),
    );
    await page.render({
      canvas,
      canvasContext: canvas.getContext("2d"),
      viewport,
    }).promise;
    return {
      height: canvas.height,
      png: canvas.toBuffer("image/png"),
      width: canvas.width,
    };
  } finally {
    await loadingTask.destroy();
  }
}

async function independentlyCropSource(pdf, record) {
  const page = await renderSourcePage(pdf, record.page);
  const left = Math.max(0, Math.floor(record.bbox.x * page.width));
  const top = Math.max(0, Math.floor(record.bbox.y * page.height));
  const requestedWidth = Math.max(1, Math.floor(record.bbox.width * page.width));
  const requestedHeight = Math.max(1, Math.floor(record.bbox.height * page.height));
  const width = Math.min(requestedWidth, page.width - left);
  const height = Math.min(requestedHeight, page.height - top);
  if (width < 1 || height < 1) {
    throw new VisualHarnessError(
      "visual_source_integrity_failed",
      "source_blob_contract",
    );
  }
  return sharp(page.png).extract({ height, left, top, width }).png().toBuffer();
}

function deterministicAssetId({ contentHash, questionId, sourceAssetId }) {
  const bytes = Buffer.from(
    sha256(
      [
        "edustruct-question-visual-v2",
        questionId,
        sourceAssetId,
        contentHash,
      ].join("\u0000"),
    ).slice(0, 32),
    "hex",
  );
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const value = bytes.toString("hex");
  return [
    value.slice(0, 8),
    value.slice(8, 12),
    value.slice(12, 16),
    value.slice(16, 20),
    value.slice(20, 32),
  ].join("-");
}

async function directPublicStorageDenied(config, asset) {
  const safePath = asset.storage_path
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
  const url = new URL(
    `/storage/v1/object/public/${asset.storage_bucket}/${safePath}`,
    config.url,
  );
  const response = await fetch(url, { redirect: "manual" });
  return response.status < 200 || response.status >= 300;
}

async function loadVisualEvidence({ bankId, config, fixture, job, pdf, service }) {
  if (
    job.status !== "completed" ||
    job.checkpoint_stage !== "completed" ||
    job.target_bank_id !== bankId ||
    job.resource_id !== fixture.item.import_batch_id
  ) {
    throw new VisualHarnessError(
      "provider_execution_failed",
      "provider_terminal_contract",
    );
  }
  const safeResult = asRecord(job.safe_result);
  const providerInferenceAttempts = numeric(safeResult.providerInferenceAttempts);
  const providerInferenceRequests = numeric(safeResult.providerInferenceRequests);
  const providerNetworkRequests = numeric(safeResult.providerNetworkRequests);
  if (
    providerInferenceAttempts !== 1 ||
    providerInferenceRequests !== 1 ||
    providerNetworkRequests === null ||
    providerNetworkRequests > proofControl.providerMaxNetworkRequests ||
    numeric(safeResult.providerCleanupFailures) !== 0
  ) {
    throw new VisualHarnessError(
      "provider_execution_failed",
      "provider_counter_contract",
    );
  }

  const batch = requireData(
    await service
      .from("import_batches")
      .select("id, status, target_bank_id, source_type, summary")
      .eq("id", fixture.item.import_batch_id)
      .maybeSingle(),
    "visual_evidence_persistence_failed",
  );
  if (
    !batch ||
    batch.status !== "imported" ||
    batch.target_bank_id !== bankId ||
    batch.source_type !== "ai_pdf"
  ) {
    throw new VisualHarnessError(
      "visual_evidence_persistence_failed",
      "batch_contract",
    );
  }

  const items =
    requireData(
      await service
        .from("import_batch_items")
        .select(
          "id, status, created_question_id, normalized_question_json, persistence_lineage_key",
        )
        .eq("batch_id", batch.id)
        .order("item_index"),
      "visual_evidence_persistence_failed",
    ) ?? [];
  const imported = items.filter(
    (item) => item.status === "imported" && item.created_question_id,
  );
  const uniqueLineageCount = new Set(
    imported.map((item) => item.persistence_lineage_key),
  ).size;
  console.log(`VISUAL_IMPORTED_ITEM_COUNT=${imported.length}`);
  console.log(`VISUAL_UNIQUE_LINEAGE_COUNT=${uniqueLineageCount}`);
  if (
    imported.length !== 4 ||
    uniqueLineageCount !== 4
  ) {
    throw new VisualHarnessError(
      "visual_evidence_contract_failed",
      "import_cardinality_contract",
    );
  }
  const questionIds = imported.map((item) => item.created_question_id);
  const questions =
    requireData(
      await service
        .from("questions")
        .select(
          "id, title, owner_bank_id, status, visibility, published_at, source, source_kind, source_review_item_id, deleted_at",
        )
        .in("id", questionIds),
      "visual_evidence_persistence_failed",
    ) ?? [];
  const reviews =
    requireData(
      await service
        .from("review_draft_items")
        .select(
          "id, review_batch_id, target_bank_id, created_question_id, status, draft_payload, validation_warnings",
        )
        .in("created_question_id", questionIds),
      "visual_evidence_persistence_failed",
    ) ?? [];
  const assetRows =
    requireData(
      await service
        .from("question_assets")
        .select(
          "id, question_id, storage_bucket, storage_path, asset_kind, display_on_detail",
        )
        .in("question_id", questionIds),
      "visual_evidence_persistence_failed",
    ) ?? [];
  console.log(`VISUAL_QUESTION_ROW_COUNT=${questions.length}`);
  console.log(`VISUAL_REVIEW_ITEM_COUNT=${reviews.length}`);
  console.log(`VISUAL_ASSET_ROW_COUNT=${assetRows.length}`);
  if (
    questions.length !== 4 ||
    reviews.length !== 4 ||
    reviews.some((review) => review.target_bank_id !== bankId) ||
    questions.some(
      (question) =>
        question.owner_bank_id !== bankId ||
        question.status !== "draft" ||
        question.visibility !== "private" ||
        question.published_at !== null ||
        question.deleted_at !== null ||
        question.source !== `ai_pdf_import:${batch.id}` ||
        question.source_kind !== "ai_import",
    )
  ) {
    throw new VisualHarnessError(
      "visual_evidence_persistence_failed",
      "visual_persistence_contract",
    );
  }

  const sourceDownload = await service.storage
    .from(sourceBucket)
    .download(fixture.item.object_path);
  const hostedSource = await blobToBuffer(
    sourceDownload.data,
    "visual_source_integrity_failed",
  );
  const sourceHashMatches = sha256(hostedSource) === sha256(pdf);
  if (!sourceHashMatches) {
    throw new VisualHarnessError(
      "visual_source_integrity_failed",
      "source_hash_contract",
    );
  }

  const questionById = new Map(questions.map((question) => [question.id, question]));
  const reviewByQuestion = new Map(
    reviews.map((review) => [review.created_question_id, review]),
  );
  const assetsByQuestion = new Map();
  for (const asset of assetRows) {
    const current = assetsByQuestion.get(asset.question_id) ?? [];
    current.push(asset);
    assetsByQuestion.set(asset.question_id, current);
  }

  const questionObservations = [];
  const recordedAssetIds = new Set();
  for (const item of imported) {
    const metadata = asRecord(asRecord(item.normalized_question_json).ai_metadata);
    const question = questionById.get(item.created_question_id);
    const review = reviewByQuestion.get(item.created_question_id);
    if (!question || !review || question.source_review_item_id !== review.id) {
      throw new VisualHarnessError(
        "visual_evidence_persistence_failed",
        "source_review_lineage_contract",
      );
    }
    const visualEvidence = asRecord(asRecord(review.draft_payload).visualEvidence);
    const evidenceRecords = Array.isArray(visualEvidence.records)
      ? visualEvidence.records.map((record) => ({ ...asRecord(record) }))
      : [];
    const questionAssets = assetsByQuestion.get(question.id) ?? [];
    const enrichedAssets = [];

    for (const asset of questionAssets) {
      const record = evidenceRecords.find((value) => value.assetId === asset.id);
      if (!record) {
        enrichedAssets.push({
          bucket: asset.storage_bucket,
          directPublicDenied: false,
          id: asset.id,
          questionId: asset.question_id,
          storagePath: asset.storage_path,
          storageObjectPresent: false,
        });
        continue;
      }
      const stored = await service.storage
        .from(asset.storage_bucket)
        .download(asset.storage_path);
      const storedBytes = await blobToBuffer(
        stored.data,
        "visual_source_integrity_failed",
      );
      const storedHash = sha256(storedBytes);
      const independentlyCropped = await independentlyCropSource(pdf, record);
      const independentHash = sha256(independentlyCropped);
      record.contentHashMatches =
        storedHash === record.contentSha256 && independentHash === storedHash;
      record.deterministicIdentityMatches =
        deterministicAssetId({
          contentHash: storedHash,
          questionId: question.id,
          sourceAssetId: fixture.item.source_asset_id,
        }) === asset.id;
      recordedAssetIds.add(asset.id);
      enrichedAssets.push({
        bucket: asset.storage_bucket,
        directPublicDenied: await directPublicStorageDenied(config, asset),
        id: asset.id,
        questionId: asset.question_id,
        storagePath: asset.storage_path,
        storageObjectPresent: true,
      });
    }

    questionObservations.push({
      assets: enrichedAssets,
      hasMissingVisualWarning: (review.validation_warnings ?? []).includes(
        missingVisualWarning,
      ),
      pageRefs: Array.isArray(metadata.page_refs) ? metadata.page_refs : [],
      placeholders: Array.isArray(metadata.asset_placeholders)
        ? metadata.asset_placeholders
        : [],
      questionId: question.id,
      reviewItemId: review.id,
      reviewStatus: review.status,
      title: question.title,
      visibleQuestionNumber: String(metadata.visible_question_number ?? ""),
      visualEvidence: Object.keys(visualEvidence).length
        ? { ...visualEvidence, records: evidenceRecords }
        : null,
    });
  }

  const quality = asRecord(asRecord(asRecord(batch.summary).aiPdfImport).qualityObservatory);
  const contractEvidence = asRecord(quality.contractEvidence);
  const visualMetrics = asRecord(quality.visualEvidence);
  const usage = asRecord(quality.usage);
  const hashMatchCount = [
    contractEvidence.fullTaxonomySnapshotSha256 === expectedTaxonomySnapshot,
    contractEvidence.taxonomySnapshotSha256 === expectedTaxonomySnapshot,
    contractEvidence.candidateSubsetSha256 === expectedCandidateSubset,
    contractEvidence.parsingContractSha256 === expectedParsingContract,
  ].filter(Boolean).length;
  const decorativeProposalCount = questionObservations.reduce(
    (total, question) =>
      total +
      question.placeholders.filter(
        (placeholder) =>
          placeholder.visual_role === "decorative" &&
          placeholder.required === false,
      ).length,
    0,
  );
  console.log(`VISUAL_PENDING_REVIEW_COUNT=${questionObservations.filter((question) => question.reviewStatus === "pending_review").length}`);
  console.log(`VISUAL_NEEDS_MORE_EVIDENCE_COUNT=${questionObservations.filter((question) => question.reviewStatus === "needs_more_evidence").length}`);
  console.log(`VISUAL_PLACEHOLDER_COUNT=${questionObservations.reduce((total, question) => total + question.placeholders.length, 0)}`);
  console.log(`VISUAL_EVIDENCE_RECORD_COUNT=${questionObservations.reduce((total, question) => total + (question.visualEvidence?.records?.length ?? 0), 0)}`);
  console.log(`VISUAL_HASH_MATCH_COUNT=${hashMatchCount}`);
  console.log(`VISUAL_METRIC_ATTACHED_ASSETS=${numeric(visualMetrics.attachedAssets) ?? -1}`);
  console.log(`VISUAL_METRIC_VALID_CROPS=${numeric(visualMetrics.validCrops) ?? -1}`);
  console.log(`VISUAL_METRIC_DECORATIVE_SKIPPED=${numeric(visualMetrics.decorativeSkipped) ?? -1}`);
  console.log(`VISUAL_METRIC_BLOCKING_MISSING=${numeric(visualMetrics.blockingMissingRequired) ?? -1}`);
  console.log(`VISUAL_METRIC_INVALID_PROPOSALS=${numeric(visualMetrics.invalidProposals) ?? -1}`);
  if (
    contractEvidence.fullTaxonomySnapshotSha256 !== expectedTaxonomySnapshot ||
    contractEvidence.taxonomySnapshotSha256 !== expectedTaxonomySnapshot ||
    contractEvidence.candidateSubsetSha256 !== expectedCandidateSubset ||
    contractEvidence.parsingContractSha256 !== expectedParsingContract ||
    quality.firstAttemptSuccess !== true ||
    quality.attemptsPerJob !== 1 ||
    numeric(usage.inputTokens) === null ||
    numeric(usage.outputTokens) === null ||
    numeric(usage.totalTokens) === null ||
    Number(usage.outputTokens) > proofControl.providerMaxOutputTokens ||
    visualMetrics.attachedAssets !== 2 ||
    visualMetrics.validCrops !== 2 ||
    visualMetrics.decorativeSkipped < decorativeProposalCount ||
    visualMetrics.blockingMissingRequired < 1 ||
    visualMetrics.invalidProposals !== 0
  ) {
    throw new VisualHarnessError(
      "visual_evidence_contract_failed",
      "quality_observatory_contract",
    );
  }

  const bankApprovalCount = await countRows(
    service
      .from("bank_questions")
      .select("id", { count: "exact", head: true })
      .in("question_id", questionIds),
    "visual_evidence_persistence_failed",
  );
  const assignmentCount = await countRows(
    service
      .from("assignments")
      .select("id", { count: "exact", head: true })
      .eq("source_record_id", batch.id),
    "visual_evidence_persistence_failed",
  );
  const bucketResult = await service.storage.getBucket(questionAssetsBucket);
  const bucketPrivate = !bucketResult.error && bucketResult.data?.public === false;

  return {
    assignmentCount,
    bankApprovalCount,
    batch,
    bucketPrivate,
    contractEvidence,
    decorativeProposalCount,
    maxProviderNetworkRequests: proofControl.providerMaxNetworkRequests,
    orphanAssetCount: assetRows.filter((asset) => !recordedAssetIds.has(asset.id)).length,
    pageCount: fixture.item.page_count,
    providerInferenceAttempts,
    providerInferenceRequests,
    providerNetworkRequests,
    publicationCount: questions.filter(
      (question) => question.published_at !== null || question.status === "published",
    ).length,
    questionIds,
    questions: questionObservations,
    reviewItemIds: reviews.map((review) => review.id),
    sourceAssetId: fixture.item.source_asset_id,
    sourceHashMatches,
    totalAssetCount: assetRows.length,
    usage,
    visualMetrics,
  };
}

async function deniedRequesterEvidence({ anonymous, observation, outsider }) {
  let anonymousAssetVisibilityCount = 0;
  let outsiderAssetVisibilityCount = 0;
  let crossOrganizationVisibilityCount = 0;
  const assetIds = observation.questions.flatMap((question) =>
    question.assets.map((asset) => asset.id),
  );
  const anonymousRows = await anonymous
    .from("question_assets")
    .select("id")
    .in("id", assetIds);
  if (!anonymousRows.error) anonymousAssetVisibilityCount += anonymousRows.data?.length ?? 0;
  const outsiderRows = await outsider.client
    .from("question_assets")
    .select("id")
    .in("id", assetIds);
  if (!outsiderRows.error) outsiderAssetVisibilityCount += outsiderRows.data?.length ?? 0;
  const outsiderQuestions = await outsider.client
    .from("questions")
    .select("id")
    .in("id", observation.questionIds);
  if (!outsiderQuestions.error) {
    crossOrganizationVisibilityCount += outsiderQuestions.data?.length ?? 0;
  }
  const outsiderReviews = await outsider.client
    .from("review_draft_items")
    .select("id")
    .in("id", observation.reviewItemIds);
  if (!outsiderReviews.error) {
    crossOrganizationVisibilityCount += outsiderReviews.data?.length ?? 0;
  }
  for (const question of observation.questions) {
    for (const asset of question.assets) {
      const anonymousDownload = await anonymous.storage
        .from(asset.bucket)
        .download(asset.storagePath);
      if (anonymousDownload.data) anonymousAssetVisibilityCount += 1;
      const outsiderDownload = await outsider.client.storage
        .from(asset.bucket)
        .download(asset.storagePath);
      if (outsiderDownload.data) outsiderAssetVisibilityCount += 1;
    }
  }
  return {
    anonymousAssetVisibilityCount,
    crossOrganizationVisibilityCount,
    outsiderAssetVisibilityCount,
  };
}

async function routeAuthorization({ anonymousContext, observation, outsiderContext, teacherContext }) {
  let anonymousAuthorizedRouteCount = 0;
  let outsiderAuthorizedRouteCount = 0;
  let teacherAuthorizedRouteCount = 0;
  for (const question of observation.questions) {
    for (const asset of question.assets) {
      const route = `/api/question-assets/${asset.id}`;
      const teacherResponse = await teacherContext.request.get(route, {
        maxRedirects: 0,
      });
      if (teacherResponse.status() === 302) teacherAuthorizedRouteCount += 1;
      const anonymousResponse = await anonymousContext.request.get(route, {
        maxRedirects: 0,
      });
      if (anonymousResponse.status() === 302) anonymousAuthorizedRouteCount += 1;
      const outsiderResponse = await outsiderContext.request.get(route, {
        maxRedirects: 0,
      });
      if (outsiderResponse.status() === 302) outsiderAuthorizedRouteCount += 1;
    }
  }
  return {
    anonymousAuthorizedRouteCount,
    outsiderAuthorizedRouteCount,
    teacherAuthorizedRouteCount,
  };
}

async function openQuestionPreview(page, question, expectedAssetIds) {
  const article = page.locator("article").filter({
    has: page.getByRole("heading", { exact: true, name: question.title }),
  });
  await article.waitFor({ state: "visible", timeout: 30_000 });
  await article.getByRole("button", { name: "Preview" }).click();
  const loaded = new Set();
  for (const assetId of expectedAssetIds) {
    const image = article.locator(`img[src="/api/question-assets/${assetId}"]`).first();
    await image.waitFor({ state: "visible", timeout: 30_000 });
    const rendered = await image.evaluate(
      (element) => element.complete && element.naturalWidth > 0 && element.naturalHeight > 0,
    );
    if (!rendered) throw new VisualHarnessError("browser_visual_evidence_failed");
    loaded.add(assetId);
  }
  return loaded.size;
}

async function verifyReviewSurface({ bankId, observation, page, secrets }) {
  const reviewUrl = `/teacher/banks/${bankId}/review`;
  const attached = observation.questions.filter((question) => question.assets.length > 0);
  const decorative = observation.questions.find(
    (question) => question.visibleQuestionNumber === "2",
  );
  const missing = observation.questions.find(
    (question) => question.visibleQuestionNumber === "3",
  );

  const verifyCycle = async (activePage) => {
    await activePage.goto(reviewUrl, { waitUntil: "networkidle" });
    const body = await activePage.locator("body").innerText();
    assertSafeBrowserText(body, secrets);
    let count = 0;
    for (const question of attached) {
      count += await openQuestionPreview(
        activePage,
        question,
        question.assets.map((asset) => asset.id),
      );
    }
    const decorativeArticle = activePage.locator("article").filter({
      has: activePage.getByRole("heading", {
        exact: true,
        name: decorative.title,
      }),
    });
    await decorativeArticle.getByRole("button", { name: "Preview" }).click();
    if ((await decorativeArticle.locator('img[src*="/api/question-assets/"]').count()) !== 0) {
      throw new VisualHarnessError("browser_visual_evidence_failed");
    }
    const missingArticle = activePage.locator("article").filter({
      has: activePage.getByRole("heading", { exact: true, name: missing.title }),
    });
    const missingText = await missingArticle.innerText();
    return { count, missingWarningVisible: missingText.includes(missingVisualWarning) };
  };

  const initial = await verifyCycle(page);
  await page.reload({ waitUntil: "networkidle" });
  const reload = await verifyCycle(page);
  const remounted = await page.context().newPage();
  let remount;
  try {
    remount = await verifyCycle(remounted);
  } finally {
    await remounted.close();
  }
  return {
    initialAssetCount: initial.count,
    missingWarningVisible:
      initial.missingWarningVisible &&
      reload.missingWarningVisible &&
      remount.missingWarningVisible,
    reloadAssetCount: reload.count,
    remountAssetCount: remount.count,
  };
}

async function main() {
  let anonymousContext = null;
  let bankId = null;
  let browser = null;
  let cleanup = { ok: true };
  let config = null;
  let failure = null;
  let fixture = null;
  let fixtures = null;
  let outsider = null;
  let outsiderContext = null;
  let server = null;
  let service = null;
  let teacher = null;
  let teacherContext = null;
  const internalToken = randomBytes(48).toString("base64url");
  const runId = randomBytes(8).toString("hex");
  const pdf = buildSyntheticVisualEvidencePdf();

  try {
    const ledger = requireVisualEnvironment();
    config = requireProcessEnvironment();
    service = createClient(config.url, config.serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    console.log("PHASE=hosted_readiness_preflight");
    await runReadinessPreflight({ service });
    console.log(`PRIOR_CONSERVATIVE_MICROS=${ledger.prior}`);
    console.log(`VISUAL_PROOF_COST_CEILING_MICROS=${visualCostCeilingMicros}`);

    console.log("PHASE=synthetic_visual_fixtures");
    fixtures = createFixtureState(service);
    const organizationId = await createSyntheticOrganization(
      fixtures,
      runId,
      "visual-primary",
    );
    const outsiderOrganizationId = await createSyntheticOrganization(
      fixtures,
      runId,
      "visual-outsider",
    );
    const teacherActor = await createSyntheticTeacher({
      fixtures,
      label: "visual-primary",
      organizationId,
      runId,
    });
    const outsiderActor = await createSyntheticTeacher({
      fixtures,
      label: "visual-outsider",
      organizationId: outsiderOrganizationId,
      runId,
    });
    teacher = await signInTeacher(config, teacherActor);
    outsider = await signInTeacher(config, outsiderActor);
    bankId = await createSyntheticBank(teacher);

    console.log("PHASE=local_next_server");
    server = await startNextServer({ config, internalToken });
    browser = await chromium.launch({ executablePath: config.edgePath, headless: true });
    teacherContext = await browser.newContext({ baseURL: server.origin });
    outsiderContext = await browser.newContext({ baseURL: server.origin });
    anonymousContext = await browser.newContext({ baseURL: server.origin });
    const page = await teacherContext.newPage();
    const outsiderPage = await outsiderContext.newPage();

    console.log("PHASE=browser_visual_pdf_upload");
    fixture = await uploadThroughBrowser({
      bankId,
      fileName: "ai-parsing-visual-evidence.pdf",
      origin: server.origin,
      page,
      pdf,
      service,
      teacher,
    });
    assert(
      fixture.burst.item_count === 1 && fixture.item.page_count === 4,
      "browser_upload_failed",
    );
    await verifyAnonymousSourcePrivacy({
      config,
      objectPath: fixture.item.object_path,
    });
    await signInThroughBrowser(
      outsiderPage,
      server.origin,
      outsider.actor,
      "/teacher",
    );

    console.log("PHASE=local_worker_one_visual_job");
    await runLocalWorkerOnce({
      internalToken,
      jobId: fixture.item.ai_provider_job_id,
      origin: server.origin,
    });
    const job = await loadFinishedJob({
      jobId: fixture.item.ai_provider_job_id,
      service,
    });
    const observation = await loadVisualEvidence({
      bankId,
      config,
      fixture,
      job,
      pdf,
      service,
    });

    const anonymous = createClient(config.url, config.anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    Object.assign(
      observation,
      await deniedRequesterEvidence({ anonymous, observation, outsider }),
    );
    Object.assign(
      observation,
      await routeAuthorization({
        anonymousContext,
        observation,
        outsiderContext,
        teacherContext,
      }),
    );
    const secrets = [
      config.anonKey,
      config.encryptionKey,
      config.serviceRoleKey,
      config.url,
      teacher.actor.email,
      teacher.actor.password,
      outsider.actor.email,
      outsider.actor.password,
      internalToken,
    ];
    observation.ui = await verifyReviewSurface({
      bankId,
      observation,
      page,
      secrets,
    });
    observation.secretOrRawContentEmissionCount = 0;

    const contract = validateVisualEvidenceLiveObservation(observation);
    await verifyProductionReconciliationContracts();
    const inputTokens = Number(observation.usage.inputTokens);
    const outputTokens = Number(observation.usage.outputTokens);
    const actualCostMicros =
      Math.ceil((inputTokens * proofControl.inputMicrosPerMillion) / 1_000_000) +
      Math.ceil((outputTokens * proofControl.outputMicrosPerMillion) / 1_000_000);
    console.log(`VISUAL_CONTRACT_PREDICATES=${contract.predicates.length}`);
    console.log(`VISUAL_ASSET_COUNT=${observation.totalAssetCount}`);
    console.log(`DECORATIVE_PROPOSAL_COUNT=${observation.decorativeProposalCount}`);
    console.log("DECORATIVE_ATTACHMENT_COUNT=0");
    console.log(`DECORATIVE_SKIPPED=${observation.visualMetrics.decorativeSkipped}`);
    console.log(
      `BLOCKING_MISSING_REQUIRED=${observation.visualMetrics.blockingMissingRequired}`,
    );
    console.log(`PROVIDER_INFERENCE_ATTEMPTS=${observation.providerInferenceAttempts}`);
    console.log(`PROVIDER_NETWORK_REQUESTS=${observation.providerNetworkRequests}`);
    console.log(`INPUT_TOKENS=${inputTokens}`);
    console.log(`OUTPUT_TOKENS=${outputTokens}`);
    console.log(`ACTUAL_ESTIMATED_COST_MICROS=${actualCostMicros}`);
    console.log(
      `TAXONOMY_SNAPSHOT_SHA256=${observation.contractEvidence.taxonomySnapshotSha256}`,
    );
    console.log(
      `TAXONOMY_CANDIDATE_SHA256=${observation.contractEvidence.candidateSubsetSha256}`,
    );
    console.log("BANK_APPROVAL_COUNT=0");
    console.log("PUBLICATION_COUNT=0");
    console.log("ASSIGNMENT_COUNT=0");
    console.log("CROSS_ORGANIZATION_VISIBILITY_COUNT=0");
    console.log("SECRET_OR_RAW_CONTENT_EMISSION_COUNT=0");
    console.log("AI_PARSING_VISUAL_EVIDENCE_LIVE_E2E=PASS");
  } catch (error) {
    failure = error;
  } finally {
    await anonymousContext?.close().catch(() => undefined);
    await outsiderContext?.close().catch(() => undefined);
    await teacherContext?.close().catch(() => undefined);
    await browser?.close().catch(() => undefined);
    const serverStopped = await stopOwnedTemporaryServer(server);
    console.log(`LOCAL_SERVER_CLEANUP=${serverStopped ? "PASS" : "FAIL"}`);
    if (!serverStopped && !failure) failure = new VisualHarnessError("cleanup_failed");
    await teacher?.client?.auth?.signOut().catch(() => undefined);
    await outsider?.client?.auth?.signOut().catch(() => undefined);
    if (service) cleanup = await cleanupFixture({ bankId, fixture, fixtures, service });
    console.log(`EXACT_ID_CLEANUP=${cleanup.ok ? "PASS" : "FAIL"}`);
    if (!cleanup.ok && !failure) failure = new VisualHarnessError("cleanup_failed");
    clearProcessEnvironment();
    clearVisualEnvironment();
    const environmentCleared = [
      ...visualEnvironment,
      ...requiredEnvironment,
      ...unusedStandingTeacherEnvironment,
    ].every((name) => !process.env[name]);
    console.log(`PROCESS_ENVIRONMENT_CLEARED=${environmentCleared ? "PASS" : "FAIL"}`);
    if (!environmentCleared && !failure) failure = new VisualHarnessError("cleanup_failed");
  }

  if (failure) {
    console.error("AI_PARSING_VISUAL_EVIDENCE_LIVE_E2E=BLOCKED");
    console.error(`VISUAL_FAILURE_STAGE=${safeFailureStage(failure)}`);
    console.error(`FAILURE_CATEGORY=${safeFailureCategory(failure)}`);
    process.exitCode = 1;
  }
}

try {
  await main();
} catch {
  clearVisualEnvironment();
  console.error("AI_PARSING_VISUAL_EVIDENCE_LIVE_E2E=BLOCKED");
  console.error("FAILURE_CATEGORY=unexpected_failure");
  process.exitCode = 1;
}
