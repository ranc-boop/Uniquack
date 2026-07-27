import { readdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const root = resolve(__dirname, "..");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function read(relativePath) {
  return readFile(resolve(root, relativePath), "utf8");
}

async function readDir(relativePath) {
  return readdir(resolve(root, relativePath));
}

function extractFunctionBody(source, functionName) {
  const start = source.indexOf(`export async function ${functionName}`);
  assert(start >= 0, `${functionName} must exist`);
  const nextExport = source.indexOf("\nexport async function ", start + 1);
  return source.slice(start, nextExport >= 0 ? nextExport : source.length);
}

const aiPdfService = await read("src/lib/ai-pdf-import/service.ts");
const teacherPdfBurstActions = await read("src/app/teacher/banks/pdf-burst-actions.ts");
const teacherBankImportsPage = await read(
  "src/app/teacher/banks/[bankId]/imports/page.tsx",
);
const adminPdfActions = await read("src/app/admin/imports/pdf/actions.ts");
const smokeAll = await read("scripts/smoke-all.mjs");
const migrationFileNames = [
  ...(await readDir("supabase/clean-migrations")),
];
const reserveTeacherPdfBurst = extractFunctionBody(
  teacherPdfBurstActions,
  "reserveTeacherAIPdfBurst",
);
const finalizeTeacherPdfBurst = extractFunctionBody(
  teacherPdfBurstActions,
  "finalizeTeacherAIPdfBurstItem",
);

assert(
  aiPdfService.includes("AI_PDF_TRANSIENT_PROVIDER_FAILURE_MESSAGE") &&
    aiPdfService.includes(
      "The AI service is temporarily busy. Your file and target Library are safe, and the system is retrying automatically.",
    ),
  "AI PDF service must define the safe transient provider failure copy",
);

assert(
  aiPdfService.includes("runWithAIProviderRetry") &&
    aiPdfService.includes("safeAIProviderErrorState") &&
    aiPdfService.includes('phase: "provider_retry_wait"') &&
    aiPdfService.includes('phase: "provider_retry_exhausted"'),
  "AI PDF service must use the shared retry wrapper and safe provider status states",
);

assert(
  aiPdfService.includes("recordAIPdfProviderFailure") &&
    aiPdfService.includes('status: "failed"') &&
    aiPdfService.includes("failureKind: safeError.safeErrorCode") &&
    aiPdfService.includes("retryable: safeError.retryable") &&
    aiPdfService.includes("targetBankId: input.targetBankId") &&
    aiPdfService.includes("reviewGate: current.summary.reviewGate ?? \"bank_review_required\"") &&
    aiPdfService.includes("reviewScope: current.summary.reviewScope ?? \"question_bank\""),
  "transient provider failure recorder must mark the import failed, retryable, and bank scoped",
);

assert(
  reserveTeacherPdfBurst.includes("reserve_ai_pdf_upload_burst") &&
    reserveTeacherPdfBurst.includes("resolveTeacherAIPdfProviderProfile") &&
    reserveTeacherPdfBurst.includes("p_target_bank_id: detail.bank.id") &&
    finalizeTeacherPdfBurst.includes("releaseAIPdfBurstAdmissionJobs") &&
    finalizeTeacherPdfBurst.includes('"finalize_temporarily_unavailable"') &&
    !teacherPdfBurstActions.includes("await processAIPdfImport"),
  "teacher PDF burst actions must reserve private sources, hand off durable work, and preserve target bank scope",
);

assert(
  teacherPdfBurstActions.includes("canManageBankContent(detail.currentUserRole)") &&
    teacherPdfBurstActions.includes("requireManagedBank") &&
    !teacherPdfBurstActions.includes("published_at") &&
    !teacherPdfBurstActions.includes('status: "published"') &&
    !teacherPdfBurstActions.includes('visibility: "public"') &&
    !teacherPdfBurstActions.includes("apiKey"),
  "teacher failure hardening must preserve admin/provider guards and avoid public/published writes",
);

assert(
  teacherBankImportsPage.includes("query.error") &&
    !teacherBankImportsPage.includes("providerProfileId") &&
    !teacherBankImportsPage.includes("api_key") &&
    !teacherBankImportsPage.includes("apiKey"),
  "teacher imports page must render feedback without exposing provider configuration fields",
);

assert(
  adminPdfActions.includes("await requireAdmin()") &&
    adminPdfActions.includes("await requireSuperAdmin()") &&
    adminPdfActions.includes("runQueuedAIPdfExtraction") &&
    adminPdfActions.includes("recordExtractionFailure"),
  "admin AI PDF provider guards and queued failure handling must remain in place",
);

assert(
  migrationFileNames.every(
    (fileName) =>
      !fileName.includes("provider_failure_status") &&
      !fileName.includes("ai_pdf_retry") &&
      !fileName.includes("provider_retry"),
  ),
  "AI PDF provider failure status hardening must not add a migration",
);

assert(
  smokeAll.includes("ai-pdf-provider-failure-status-smoke.mjs"),
  "smoke-all must include the AI PDF provider failure status smoke",
);

console.log("PASS AI PDF provider failure status source smoke");
