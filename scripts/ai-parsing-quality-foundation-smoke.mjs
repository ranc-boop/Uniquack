import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

async function read(relativePath) {
  return readFile(resolve(root, relativePath), "utf8");
}

const [
  chat,
  previewComponent,
  previewData,
  previewRoute,
  reviewValidation,
  schema,
  service,
] = await Promise.all([
  read("src/lib/ai-providers/chat.ts"),
  read("src/components/teacher/teacher-question-preview.tsx"),
  read("src/lib/teacher-focus-preview.ts"),
  read("src/app/api/teacher/banks/[bankId]/previews/route.ts"),
  read("src/lib/questions/review-publish-validation.ts"),
  read("src/lib/ai-pdf-import/schema.ts"),
  read("src/lib/ai-pdf-import/service.ts"),
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
