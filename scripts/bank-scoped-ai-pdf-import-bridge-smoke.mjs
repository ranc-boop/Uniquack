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
  compatibilityPage,
  parsingProfiles,
] = await Promise.all([
  read("src/lib/ai-pdf-import/service.ts"),
  read("src/lib/batch-import/service.ts"),
  read("src/app/teacher/banks/pdf-burst-actions.ts"),
  read("src/components/teacher/teacher-pdf-burst-upload.tsx"),
  read("src/app/teacher/banks/[bankId]/imports/page.tsx"),
  read("src/app/teacher/banks/[bankId]/review/page.tsx"),
  read("src/app/teacher/ai-parsing/page.tsx"),
  read("src/lib/ai-pdf-import/teacher-parsing-profiles.ts"),
]);

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
  reviewPage.includes("QuestionAssetsPanel") &&
    reviewPage.includes("QuestionSourceFilesPanel") &&
    reviewPage.includes("approveBankReviewQuestion") &&
    reviewPage.includes("private to this Library and is not globally published"),
  "AI-created drafts must hand off to the Library Review workspace with media and approval gates.",
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
