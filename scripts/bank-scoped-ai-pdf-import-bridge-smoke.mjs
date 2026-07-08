import { readFile } from "node:fs/promises";
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

const aiPdfService = await read("src/lib/ai-pdf-import/service.ts");
const batchImportService = await read("src/lib/batch-import/service.ts");
const adminPdfActions = await read("src/app/admin/imports/pdf/actions.ts");
const teacherBankActions = await read("src/app/teacher/banks/actions.ts");
const teacherBankImportsPage = await read(
  "src/app/teacher/banks/[bankId]/imports/page.tsx",
);
const teacherAiParsingPage = await read("src/app/teacher/ai-parsing/page.tsx");
const smokeAll = await read("scripts/smoke-all.mjs");

assert(
  aiPdfService.includes("targetBankId?: string | null") &&
    aiPdfService.includes("targetBankId: input.targetBankId"),
  "processAIPdfImport must accept and forward targetBankId to importBatchImportJson",
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
    adminPdfActions.includes("targetBankId:") &&
    !adminPdfActions.includes("await requireTeacher()"),
  "admin AI PDF route must remain admin/super-admin gated and not become a teacher bypass",
);

assert(
  teacherBankActions.includes("export async function importBankPdfDrafts") &&
    teacherBankActions.includes("await requireTeacher()") &&
    teacherBankActions.includes("bankImportPdfSchema") &&
    teacherBankActions.includes("getTeacherQuestionBankDetail") &&
    teacherBankActions.includes("canManageBankContent(detail.currentUserRole)") &&
    teacherBankActions.includes("Only bank owners and editors can import PDF drafts.") &&
    teacherBankActions.includes("listEnabledAIProviderProfiles") &&
    teacherBankActions.includes("selectTeacherAIPdfProvider") &&
    teacherBankActions.includes("processAIPdfImport") &&
    teacherBankActions.includes("target_bank_id: parsed.bankId") &&
    teacherBankActions.includes("targetBankId: parsed.bankId") &&
    teacherBankActions.includes("reviewGate: \"bank_review_required\"") &&
    teacherBankActions.includes("reviewRoute") &&
    !teacherBankActions.includes("api_key") &&
    !teacherBankActions.includes("SUPABASE_SERVICE_ROLE") &&
    !teacherBankActions.includes("published_at"),
  "teacher PDF import action must be teacher-authenticated, owner/editor gated, bank-scoped, and secret-safe",
);

assert(
  teacherBankImportsPage.includes("action={importBankPdfDrafts}") &&
    teacherBankImportsPage.includes('name="sourcePdf"') &&
    teacherBankImportsPage.includes("AI Parsing runs server-side") &&
    teacherBankImportsPage.includes("Review is required before assignment") &&
    teacherBankImportsPage.includes("Advanced / Developer fixture") &&
    teacherBankImportsPage.includes("Create bank Review Drafts") &&
    !teacherBankImportsPage.includes("/admin/imports/pdf") &&
    !teacherBankImportsPage.includes("/admin/review"),
  "teacher bank imports page must expose PDF-to-review handoff and keep JSON fixture advanced",
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
  smokeAll.includes("bank-scoped-ai-pdf-import-bridge-smoke.mjs"),
  "smoke-all must include the bank-scoped AI PDF import bridge smoke",
);

console.log("PASS bank-scoped AI PDF import bridge source smoke");
