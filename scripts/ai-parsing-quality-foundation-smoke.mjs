import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

async function read(relativePath) {
  return readFile(resolve(root, relativePath), "utf8");
}

const [
  attemptState,
  chat,
  previewComponent,
  previewData,
  previewRoute,
  reviewValidation,
  runtimeTaxonomy,
  schema,
  service,
  taxonomyGoldenFixture,
  taxonomySourceInventory,
] = await Promise.all([
  read("src/lib/ai-providers/ai-pdf-attempt-state.ts"),
  read("src/lib/ai-providers/chat.ts"),
  read("src/components/teacher/teacher-question-preview.tsx"),
  read("src/lib/teacher-focus-preview.ts"),
  read("src/app/api/teacher/banks/[bankId]/previews/route.ts"),
  read("src/lib/questions/review-publish-validation.ts"),
  read("src/lib/tags/runtime-taxonomy-snapshot.ts"),
  read("src/lib/ai-pdf-import/schema.ts"),
  read("src/lib/ai-pdf-import/service.ts"),
  read("scripts/ai-parsing-eval/lib/taxonomy-golden-fixture.mjs"),
  read("scripts/ai-parsing-eval/lib/taxonomy-source-inventory.mjs"),
]);

assert(
  schema.includes("x + width <= 1") &&
    schema.includes("y + height <= 1") &&
    !schema.includes("Math.max(0, Math.min(1, numeric))"),
  "visual bounding boxes must reject, not clamp, invalid source coordinates",
);
assert(
  reviewValidation.includes(
    'input.reviewItem?.status === "needs_more_evidence"',
  ) && reviewValidation.includes("still needs more evidence"),
  "needs-more-evidence Review Drafts must remain blocked from approval",
);
assert(
  service.includes("deterministicQuestionAssetId") &&
    service.includes("contentSha256") &&
    !service.includes("const assetId = crypto.randomUUID()"),
  "question visual assets must use content-bound deterministic identity",
);
assert(
  service.includes("placeholder.page ?? placeholder.pageNumber"),
  "question-boundary evidence must read the canonical visual page field",
);
assert(
  service.includes("curriculum, concept, method, task, and form") &&
    !service.includes("try to cover at least 4 of the 5") &&
    !service.includes("choose the closest accurate allowed leaf tag_id"),
  "taxonomy instructions must prefer exact-ID abstention over forced facet coverage",
);
assert(
  chat.includes("generateWithGeminiNativeText") &&
    chat.includes("sourceIncluded") &&
    chat.includes("qualityObserver"),
  "reason-specific structural repair must avoid repeating the full PDF and emit safe attempt evidence",
);
assert(
  attemptState.includes('"SOURCE_BACKED_SEMANTIC_RECOVERY"') &&
    attemptState.includes('"CHECKPOINT_REPLAY_ZERO_INFERENCE"') &&
    attemptState.includes("sourceRecoveryUsed") &&
    attemptState.includes("sourceInferenceCount"),
  "one durable attempt ledger must distinguish recovery, transport retry, and zero-inference replay",
);
assert(
  runtimeTaxonomy.includes("buildRuntimeTaxonomySnapshot") &&
    runtimeTaxonomy.includes("effectiveLeaf") &&
    runtimeTaxonomy.includes("cycleNodeIds") &&
    runtimeTaxonomy.includes("orphanNodeIds") &&
    runtimeTaxonomy.includes("crossFacetNodeIds") &&
    runtimeTaxonomy.includes("canonicalJson") &&
    runtimeTaxonomy.includes('createHash("sha256")'),
  "runtime taxonomy eligibility must be graph-derived, fail closed, and fingerprinted",
);
assert(
  service.includes("buildRuntimeTaxonomySnapshot") &&
    service.includes("buildRuntimeTaxonomyCandidateSubset") &&
    service.includes("includeAllEdges: true") &&
    service.includes("candidateSubsetSha256") &&
    service.includes("fullTaxonomySnapshotSha256") &&
    service.includes("taxonomySnapshotSha256") &&
    service.includes("parsingContractSha256"),
  "reachable parsing must bind runtime candidates and their snapshot fingerprint",
);
assert(
  service.includes('AI_PDF_PROMPT_CONTRACT_VERSION = "ai-pdf-extraction-prompt-v3"') &&
    service.includes('AI_PDF_SCHEMA_CONTRACT_VERSION = "gemini-ai-pdf-extraction-schema-v2"') &&
    service.includes("AI_PDF_REPAIR_POLICY_VERSION") &&
    service.includes('"source-free-structural-single-source-semantic-v2"'),
  "reachable parsing must expose explicit prompt, schema, and repair-policy versions",
);
assert(
  taxonomySourceInventory.includes("loadAuthoritativeTaxonomySourceInventory") &&
    taxonomySourceInventory.includes("seed_preserved_0056_compatible") &&
    taxonomySourceInventory.includes("stage.nodes") &&
    taxonomyGoldenFixture.includes("loadAuthoritativeTaxonomySourceInventory") &&
    taxonomyGoldenFixture.includes("taxonomy Golden fixture references an unbound ID"),
  "taxonomy evidence must replay seed-plus-0056 semantics and reject fixture-defined catalog IDs",
);
assert(
  service.includes("qualityObservatory") &&
    service.includes("visualEvidence"),
  "safe parsing and visual quality summaries must be persisted with the import evidence",
);
assert(
  service.includes("Visual evidence persistence is incomplete; approval remains blocked.") &&
    service.includes('visual_role === "decorative"') &&
    service.includes("safeQuestionVisualAlt") &&
    service.includes('.eq("batch_id", sourceBatchId)') &&
    service.includes('upsert: false') &&
    schema.includes("visual_evidence_required") &&
    service.includes("question_restore_verify") &&
    service.includes("cleanupAttempt <= 2"),
  "visual persistence must skip decoration, validate exact source lineage, lock Review approval, and compensate exact non-replacing asset writes fail closed",
);
assert(
  service.includes("recoveryRenderedPages") &&
    service.includes("extraction: recoveryExtraction") &&
    service.includes("renderedPages: recoveryRenderedPages"),
  "targeted coverage recovery must preserve the same visual attachment boundary",
);
assert(
  previewData.includes('.from("question_assets")') &&
    previewData.includes("getQuestionAssetUrl(asset.id)") &&
    previewComponent.includes("QuestionDetailImageGallery") &&
    previewComponent.includes("preview.assets.map") &&
    previewRoute.includes("getReviewPreviewDTOs") &&
    previewRoute.includes('"Cache-Control": "private, no-store"'),
  "Teacher Review remounts must reload private canonical question assets through the requester-scoped preview route",
);

console.log("PASS AI Parsing quality, retry, taxonomy, and visual source contracts");
