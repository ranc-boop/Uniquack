import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFile(resolve(root, path), "utf8");
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const [
  aiPdfService,
  batchImportService,
  burstActions,
  burstUpload,
  importsPage,
  reviewPage,
  lazyReviewPreview,
  previewRoute,
  previewService,
  previewRenderer,
  questionAssetUrl,
  compatibilityPage,
  parsingProfiles,
] = await Promise.all([
  read("src/lib/ai-pdf-import/service.ts"),
  read("src/lib/batch-import/service.ts"),
  read("src/app/teacher/banks/pdf-burst-actions.ts"),
  read("src/components/teacher/teacher-pdf-burst-upload.tsx"),
  read("src/app/teacher/banks/[bankId]/imports/page.tsx"),
  read("src/app/teacher/banks/[bankId]/review/page.tsx"),
  read("src/components/teacher/lazy-teacher-question-preview.tsx"),
  read("src/app/api/teacher/banks/[bankId]/previews/route.ts"),
  read("src/lib/teacher-focus-preview.ts"),
  read("src/components/teacher/teacher-question-preview.tsx"),
  read("src/lib/storage/question-assets.ts"),
  read("src/app/teacher/ai-parsing/page.tsx"),
  read("src/lib/ai-pdf-import/teacher-parsing-profiles.ts"),
]);

function hasProtectedReviewMediaHandoff({
  lazySource,
  pageSource,
  rendererSource,
  routeSource,
  serviceSource,
  urlSource,
}) {
  return (
    pageSource.includes("LazyTeacherQuestionPreview") &&
    pageSource.includes('kind="review"') &&
    lazySource.includes("/api/teacher/banks/") &&
    lazySource.includes("credentials: \"same-origin\"") &&
    routeSource.includes("getReviewPreviewDTOs") &&
    routeSource.includes('return jsonResponse({ error: "Preview not found." }, 404)') &&
    serviceSource.includes("if (!access?.canManage) return null") &&
    serviceSource.includes('.eq("target_bank_id", bankId)') &&
    serviceSource.includes("loadPreviewEnrichmentBatch") &&
    serviceSource.includes("getQuestionAssetUrl(asset.id)") &&
    rendererSource.includes("QuestionDetailImageGallery") &&
    rendererSource.includes("preview.assets.map") &&
    urlSource.includes("return `/api/question-assets/${assetId}`")
  );
}

assert(
  aiPdfService.includes("targetBankId?: string | null") &&
    aiPdfService.includes("targetBankId: input.targetBankId") &&
    batchImportService.includes("target_bank_id: targetBankContext?.bankId") &&
    batchImportService.includes("owner_bank_id: targetBankContext?.bankId ?? null") &&
    batchImportService.includes('status: "draft"') &&
    batchImportService.includes('review_status: "pending_review"'),
  "AI PDF extraction and JSON persistence must preserve private Library Review Draft scope.",
);

assert(
  burstActions.includes("reserveTeacherAIPdfBurst") &&
    burstActions.includes("finalizeTeacherAIPdfBurstItem") &&
    burstActions.includes("requireManagedBank") &&
    burstActions.includes("canManageBankContent(detail.currentUserRole)") &&
    burstActions.includes("resolveTeacherAIPdfProviderProfile") &&
    burstActions.includes("reserve_ai_pdf_upload_burst") &&
    burstActions.includes("releaseAIPdfBurstAdmissionJobs") &&
    burstActions.includes("reviewGate: \"bank_review_required\"") &&
    !burstActions.includes("await processAIPdfImport") &&
    !burstActions.includes('status: "published"') &&
    !burstActions.includes('visibility: "public"') &&
    !burstActions.includes("apiKey"),
  "Teacher PDF burst actions must authorize the Library, validate private uploads, and enqueue review-gated work without auto-publishing.",
);

assert(
  burstUpload.includes("reserveTeacherAIPdfBurst") &&
    burstUpload.includes("finalizeTeacherAIPdfBurstItem") &&
    burstUpload.includes("uploadToSignedUrl") &&
    importsPage.includes("TeacherPdfBurstUpload") &&
    importsPage.includes('["manual", "json", "ai"]') &&
    importsPage.includes("Review is required before assignment") &&
    !importsPage.includes("/admin/imports/pdf") &&
    !importsPage.includes("apiKey") &&
    !importsPage.includes("api_key"),
  "Library Import must expose the private multi-PDF uploader inside the unified Manual/JSON/AI workspace.",
);

assert(
  hasProtectedReviewMediaHandoff({
    lazySource: lazyReviewPreview,
    pageSource: reviewPage,
    rendererSource: previewRenderer,
    routeSource: previewRoute,
    serviceSource: previewService,
    urlSource: questionAssetUrl,
  }) &&
    reviewPage.includes("approveBankReviewQuestion") &&
    reviewPage.includes("Approval confirms these questions for this Library") &&
    reviewPage.includes("you did not preview remains your responsibility") &&
    !reviewPage.includes("published_at"),
  "AI-created drafts must hand off through the authenticated, bank-scoped lazy Review preview and protected asset route.",
);

assert(
  !hasProtectedReviewMediaHandoff({
    lazySource: lazyReviewPreview,
    pageSource: reviewPage,
    rendererSource: previewRenderer,
    routeSource: previewRoute,
    serviceSource: previewService.replaceAll(
      "getQuestionAssetUrl(asset.id)",
      "asset.storage_path",
    ),
    urlSource: questionAssetUrl,
  }),
  "Direct Storage-path Review media mutation must be detectable.",
);

assert(
  compatibilityPage.includes("getTeacherQuestionBankDetail") &&
    compatibilityPage.includes("canManageBankContent") &&
    compatibilityPage.includes("imports?mode=ai"),
  "The legacy teacher AI Parsing route must resolve a valid Library and redirect into unified Import/AI.",
);

assert(
  parsingProfiles.includes('import "server-only"') &&
    parsingProfiles.includes("resolveTeacherAIPdfProviderProfile") &&
    !parsingProfiles.includes("api_key_ciphertext"),
  "Teacher parsing profiles must remain server-only and secret-free.",
);

console.log("PASS bank-scoped AI PDF burst import bridge source smoke");
