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

function countOccurrences(source, pattern) {
  return source.split(pattern).length - 1;
}

function extractFunctionBody(source, functionName) {
  const start = source.indexOf(`export async function ${functionName}`);
  assert(start >= 0, `${functionName} must exist`);
  const nextExport = source.indexOf("\nexport async function ", start + 1);
  return source.slice(start, nextExport >= 0 ? nextExport : source.length);
}

const aiPdfService = await read("src/lib/ai-pdf-import/service.ts");
const teacherParsingProfiles = await read(
  "src/lib/ai-pdf-import/teacher-parsing-profiles.ts",
);
const batchImportService = await read("src/lib/batch-import/service.ts");
const adminPdfActions = await read("src/app/admin/imports/pdf/actions.ts");
const teacherBankActions = await read("src/app/teacher/banks/actions.ts");
const teacherBankImportsPage = await read(
  "src/app/teacher/banks/[bankId]/imports/page.tsx",
);
const teacherBankImportsLoading = await read(
  "src/app/teacher/banks/[bankId]/imports/loading.tsx",
);
const teacherBankReviewPage = await read(
  "src/app/teacher/banks/[bankId]/review/page.tsx",
);
const teacherAiParsingPage = await read("src/app/teacher/ai-parsing/page.tsx");
const teacherAiParsingLoading = await read("src/app/teacher/ai-parsing/loading.tsx");
const aiPdfLoadingSkeleton = await read(
  "src/components/ai-pdf-import-loading-skeleton.tsx",
);
const formSubmitButton = await read("src/components/form-submit-button.tsx");
const smokeAll = await read("scripts/smoke-all.mjs");
const teacherPdfAction = extractFunctionBody(
  teacherBankActions,
  "importBankPdfDrafts",
);
const approveBankReviewAction = extractFunctionBody(
  teacherBankActions,
  "approveBankReviewQuestion",
);
const migrationFileNames = [
  ...(await readDir("supabase/clean-migrations")),
  ...(await readDir("supabase/migrations")),
];

assert(
  aiPdfService.includes("targetBankId?: string | null") &&
    aiPdfService.includes("targetBankId: input.targetBankId"),
  "processAIPdfImport must accept and forward targetBankId to importBatchImportJson",
);

assert(
  aiPdfService.includes("async function processAIPdfSinglePass") &&
    aiPdfService.includes("return processAIPdfSinglePass({") &&
    countOccurrences(aiPdfService, "targetBankId: input.targetBankId") >= 2,
  "both single-pass and chunked AI PDF import paths must pass targetBankId into importBatchImportJson",
);

assert(
  batchImportService.includes("targetBankId?: string | null") &&
    batchImportService.includes("target_bank_id: targetBankContext?.bankId") &&
    batchImportService.includes("owner_bank_id: targetBankContext?.bankId ?? null") &&
    batchImportService.includes('status: "draft"') &&
    batchImportService.includes('review_status: "pending_review"') &&
    batchImportService.includes('visibility: targetBankContext?.visibility ?? "private"'),
  "importBatchImportJson must preserve bank scope, draft status, private visibility, and pending taxonomy review",
);

assert(
  adminPdfActions.includes("await requireAdmin()") &&
    adminPdfActions.includes("await requireSuperAdmin()") &&
    adminPdfActions.includes("runQueuedAIPdfExtraction") &&
    adminPdfActions.includes('.select("summary, target_bank_id")') &&
    adminPdfActions.includes('.select("id, status, summary, target_bank_id")') &&
    adminPdfActions.includes("typeof batch?.target_bank_id === \"string\"") &&
    adminPdfActions.includes("batch.target_bank_id") &&
    !adminPdfActions.includes("await requireTeacher()"),
  "admin AI PDF route must remain admin/super-admin gated and preserve existing batch target_bank_id on queued/retry work",
);

assert(
  teacherBankActions.includes("export async function importBankPdfDrafts") &&
    teacherBankActions.includes("await requireTeacher()") &&
    teacherBankActions.includes("bankImportPdfSchema") &&
    teacherBankActions.includes("TEACHER_AI_PDF_PARSING_PROFILES") &&
    teacherBankActions.includes("assertNoRawProviderConfig(formData)") &&
    teacherBankActions.includes("getTeacherQuestionBankDetail") &&
    teacherBankActions.includes("canManageBankContent(detail.currentUserRole)") &&
    teacherBankActions.includes("Only bank owners and editors can import PDF drafts.") &&
    teacherBankActions.includes("resolveTeacherAIPdfProviderProfile") &&
    teacherBankActions.includes("createServiceRoleClient") &&
    teacherBankActions.includes("processAIPdfImport") &&
    teacherBankActions.includes("target_bank_id: parsed.bankId") &&
    teacherBankActions.includes("targetBankId: parsed.bankId") &&
    teacherBankActions.includes("reviewGate: \"bank_review_required\"") &&
    teacherBankActions.includes("reviewRoute") &&
    teacherBankActions.includes("Only active Question Banks can receive AI imports.") &&
    teacherBankActions.includes("Only PDF files can be imported into a bank.") &&
    teacherBankActions.includes("The selected PDF is empty.") &&
    teacherBankActions.includes("PDF is larger than 50MB.") &&
    !teacherBankActions.includes("SUPABASE_SERVICE_ROLE") &&
    !teacherBankActions.includes("published_at"),
  "teacher PDF import action must be teacher-authenticated, owner/editor gated, bank-scoped, and secret-safe",
);

assert(
  teacherPdfAction.indexOf("canManageBankContent(detail.currentUserRole)") <
    teacherPdfAction.indexOf("createServiceRoleClient()") &&
    teacherPdfAction.indexOf("detail.bank.status !== \"active\"") <
      teacherPdfAction.indexOf("createServiceRoleClient()"),
  "teacher PDF import action must authorize bank owner/editor access before using the server-only import client",
);

assert(
  teacherPdfAction.includes("const parsed = bankImportPdfSchema.parse") &&
    teacherPdfAction.includes("assertNoRawProviderConfig(formData)") &&
    teacherPdfAction.includes("const pdfFile = getPdfFileFromForm(formData)") &&
    teacherPdfAction.includes("canManageBankContent(detail.currentUserRole)") &&
    teacherPdfAction.includes("detail.bank.status !== \"active\"") &&
    teacherPdfAction.includes("resolveTeacherAIPdfProviderProfile") &&
    teacherPdfAction.includes("parsingProfile: parsed.parsingProfile") &&
    teacherPdfAction.includes("processAIPdfImport({") &&
    teacherPdfAction.includes("targetBankId: parsed.bankId") &&
    !teacherPdfAction.includes("visibility: \"public\"") &&
    !teacherPdfAction.includes("status: \"published\"") &&
    !teacherPdfAction.includes("published_at"),
  "teacher PDF import function must reject missing/invalid target state, keep provider selection server-side, and avoid public/published writes",
);

assert(
  teacherBankActions.includes("function getPdfFileFromForm") &&
    teacherBankActions.includes("formData.get(\"pdf\")") &&
    teacherBankActions.includes("formData.get(\"sourcePdf\")") &&
    teacherBankActions.includes("if (!value || typeof value === \"string\")") &&
    teacherBankActions.includes("if (!isPdfFile(file))") &&
    teacherBankActions.includes("if (!file.size || file.size <= 0)") &&
    teacherBankActions.includes("if (file.size > AI_PDF_IMPORT_MAX_BYTES)"),
  "teacher PDF import validation must block missing, non-PDF, empty, and oversized files before provider execution",
);

assert(
  teacherBankActions.includes("forbiddenProviderConfigFields") &&
    teacherBankActions.includes("\"provider_profile_id\"") &&
    teacherBankActions.includes("\"providerProfileId\"") &&
    teacherBankActions.includes("\"model\"") &&
    teacherBankActions.includes("\"api_key\"") &&
    teacherBankActions.includes("\"apiKey\"") &&
    teacherBankActions.includes(
      "AI PDF provider configuration is admin-only and cannot be submitted from teacher imports.",
    ),
  "teacher PDF import action must reject raw provider/model/API-key fields from the client",
);

assert(
    teacherParsingProfiles.includes('import "server-only"') &&
    teacherParsingProfiles.includes("listEnabledAIProviderProfilesForServerUse") &&
    teacherParsingProfiles.includes("buildTeacherAIPdfParsingProfileState") &&
    teacherParsingProfiles.includes("listTeacherAIPdfParsingProfileState") &&
    teacherParsingProfiles.includes("resolveTeacherAIPdfProviderProfile") &&
    teacherParsingProfiles.includes('"fast"') &&
    teacherParsingProfiles.includes('"standard"') &&
    teacherParsingProfiles.includes('"advanced"') &&
    teacherParsingProfiles.includes("Fast") &&
    teacherParsingProfiles.includes("Standard / Recommended") &&
    teacherParsingProfiles.includes("Advanced / Limited") &&
    !teacherParsingProfiles.includes("api_key_ciphertext") &&
    !teacherParsingProfiles.includes("api_key_iv") &&
    !teacherParsingProfiles.includes("api_key_tag"),
  "teacher parsing profile helper must stay server-only, friendly, and secret-free",
);

assert(
  aiPdfService.includes("listEnabledAIProviderProfilesForServerUse") &&
    aiPdfService.includes("loadSafeAIProviderProfileForServerUse") &&
    aiPdfService.includes("loadAIProviderProfileForServerUse"),
  "AI PDF execution must load shared provider profiles through the server-only provider path",
);

assert(
    teacherBankImportsPage.includes("action={importBankPdfDrafts}") &&
    teacherBankImportsPage.includes("FormSubmitButton") &&
    teacherBankImportsPage.includes('name="pdf"') &&
    teacherBankImportsPage.includes('accept="application/pdf') &&
    teacherBankImportsPage.includes('name="parsingProfile"') &&
    teacherBankImportsPage.includes("listTeacherAIPdfParsingProfileState") &&
    teacherBankImportsPage.includes("AI PDF parsing is enabled.") &&
    teacherBankImportsPage.includes(
      "AI PDF parsing is not enabled for this site or organization yet.",
    ) &&
    teacherBankImportsPage.includes("shared AI provider") &&
    teacherBankImportsPage.includes(
      "provider credentials are never",
    ) &&
    teacherBankImportsPage.includes("AI Parsing runs server-side") &&
    teacherBankImportsPage.includes("Review is required before assignment") &&
    teacherBankImportsPage.includes("Advanced / Developer fixture") &&
    teacherBankImportsPage.includes("Create bank Review Drafts") &&
    teacherBankImportsPage.includes("disabled={!canRunPdfImport}") &&
    teacherBankImportsPage.includes("Import requires owner/editor") &&
    teacherBankImportsPage.includes("AI PDF parsing unavailable") &&
    teacherBankImportsPage.includes('pendingLabel="Starting AI Parsing..."') &&
    teacherBankImportsPage.includes('pendingLabel="Creating drafts..."') &&
    !teacherBankImportsPage.includes("encType=") &&
    !teacherBankImportsPage.includes("method=") &&
    !teacherBankImportsPage.includes("listEnabledAIProviderProfiles") &&
    !teacherBankImportsPage.includes("providerProfile") &&
    !teacherBankImportsPage.includes("apiKey") &&
    !teacherBankImportsPage.includes("api_key") &&
    !teacherBankImportsPage.includes("/admin/imports/pdf") &&
    !teacherBankImportsPage.includes("/admin/review"),
  "teacher bank imports page must expose PDF-to-review handoff, block viewer submit UI, and keep JSON fixture advanced",
);

assert(
  formSubmitButton.includes("useFormStatus") &&
    formSubmitButton.includes("LoaderCircle") &&
    formSubmitButton.includes("animate-spin") &&
    formSubmitButton.includes("disabled={pending}"),
  "server-action submit buttons must show an animated pending state without converting forms to client handlers",
);

assert(
  aiPdfLoadingSkeleton.includes("AIPdfImportLoadingSkeletonProps") &&
    aiPdfLoadingSkeleton.includes("showSettingsAction") &&
    aiPdfLoadingSkeleton.includes("detailsLabel") &&
    teacherAiParsingLoading.includes("AIPdfImportLoadingSkeleton") &&
    teacherAiParsingLoading.includes("showSettingsAction={false}") &&
    teacherAiParsingLoading.includes("Loading bank targets") &&
    teacherBankImportsLoading.includes("AIPdfImportLoadingSkeleton") &&
    teacherBankImportsLoading.includes("showSettingsAction={false}") &&
    teacherBankImportsLoading.includes("Bank AI Parsing"),
  "teacher bank AI Parsing routes must reuse the AI PDF loading animation with teacher-safe copy",
);

assert(
  teacherAiParsingPage.includes("BankTargetSelector") &&
    teacherAiParsingPage.includes("BankImportEntryPanel") &&
    teacherAiParsingPage.includes("Import into selected bank") &&
    !teacherAiParsingPage.includes("/admin/imports/pdf") &&
    !teacherAiParsingPage.includes("/admin/review"),
  "/teacher/ai-parsing must remain a bank-targeted teacher entry point",
);

assert(
  teacherBankReviewPage.includes("buildDraftReviewSignals") &&
    teacherBankReviewPage.includes("Open question review") &&
    teacherBankReviewPage.includes("Check these before approval") &&
    teacherBankReviewPage.includes("Question prompt") &&
    teacherBankReviewPage.includes("Answer and options") &&
    teacherBankReviewPage.includes("Solution / explanation") &&
    teacherBankReviewPage.includes("Taxonomy suggestions") &&
    teacherBankReviewPage.includes("FormSubmitButton") &&
    teacherBankReviewPage.includes("Approval adds this question") &&
    !teacherBankReviewPage.includes("published_at"),
  "teacher bank Review Draft page must expose expandable question inspection, warning details, and stay non-publishing",
);

assert(
  approveBankReviewAction.includes('rpc("approve_bank_review_question"') &&
    approveBankReviewAction.includes("`/teacher/banks/${parsed.bankId}/review`,") &&
    !approveBankReviewAction.includes("`/teacher/banks/${parsed.bankId}/questions`,"),
  "approving a bank Review Draft must stay on the bank review page instead of jumping to the questions tab",
);

assert(
  migrationFileNames.every(
    (fileName) =>
      !fileName.includes("bank_scoped_ai_pdf") &&
      !fileName.includes("teacher_ai_pdf_bridge") &&
      !fileName.includes("pdf_import_bridge"),
  ),
  "bank-scoped AI PDF bridge must not add a migration",
);

assert(
  smokeAll.includes("bank-scoped-ai-pdf-import-bridge-smoke.mjs"),
  "smoke-all must include the bank-scoped AI PDF import bridge smoke",
);

console.log("PASS bank-scoped AI PDF import bridge source smoke");
