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

const teacherAiParsingPage = await read("src/app/teacher/ai-parsing/page.tsx");
const bankImportUi = await read("src/app/teacher/banks/bank-import-ui.tsx");
const bankImportsPage = await read("src/app/teacher/banks/[bankId]/imports/page.tsx");
const bankReviewPage = await read("src/app/teacher/banks/[bankId]/review/page.tsx");
const bankActions = await read("src/app/teacher/banks/actions.ts");
const questionBanks = await read("src/lib/question-banks.ts");
const smokeAll = await read("scripts/smoke-all.mjs");
const migrationFileNames = [
  ...(await readDir("supabase/clean-migrations")),
  ...(await readDir("supabase/migrations")),
];
const importBankPdfDrafts = extractFunctionBody(bankActions, "importBankPdfDrafts");
const approveBankReviewQuestion = extractFunctionBody(
  bankActions,
  "approveBankReviewQuestion",
);

assert(
  teacherAiParsingPage.includes("Teacher import workspace") &&
    teacherAiParsingPage.includes("AI drafts stay private until reviewed") &&
    teacherAiParsingPage.includes("RecentBankImportsPanel") &&
    teacherAiParsingPage.includes("bankName={selectedBank.name}") &&
    teacherAiParsingPage.includes("Import into selected bank") &&
    !teacherAiParsingPage.includes("/admin/imports/pdf") &&
    !teacherAiParsingPage.includes("/admin/review"),
  "/teacher/ai-parsing must remain a teacher bank-targeted AI Parsing entry point with status history",
);

assert(
  bankImportUi.includes("Recent AI Parsing status") &&
    bankImportUi.includes("AI Parsing status history uses existing import batches only") &&
    bankImportUi.includes("Target bank") &&
    bankImportUi.includes("Drafts") &&
    bankImportUi.includes("Warnings") &&
    bankImportUi.includes("Retryable import") &&
    bankImportUi.includes("The AI service is temporarily busy") &&
    bankImportUi.includes("Zero drafts were created") &&
    bankImportUi.includes("Open Review Drafts") &&
    bankImportUi.includes("Provider setup stays in Admin / AI Settings"),
  "recent bank imports panel must show teacher-safe AI Parsing status, target bank, draft/warning counts, retry copy, and Review Draft CTA",
);

assert(
  bankImportsPage.includes("AI Parsing runs server-side") &&
    bankImportsPage.includes("private drafts in this bank until review") &&
    bankImportsPage.includes("Review is required before assignment") &&
    bankImportsPage.includes("provider credentials are never") &&
    bankImportsPage.includes("Advanced / Developer fixture") &&
    bankImportsPage.includes("Developer fixture for smoke testing") &&
    bankImportsPage.includes("bankName={bank.name}") &&
    !bankImportsPage.includes("providerProfileId") &&
    !bankImportsPage.includes("api_key") &&
    !bankImportsPage.includes("apiKey"),
  "teacher bank imports page must explain review-gated private drafts, hide provider config, and keep JSON fixture advanced",
);

assert(
  bankReviewPage.includes("Open question review") &&
    bankReviewPage.includes("Check these before approval") &&
    bankReviewPage.includes("Question prompt") &&
    bankReviewPage.includes("Answer and options") &&
    bankReviewPage.includes("Marked correct") &&
    bankReviewPage.includes("QuestionAnswerSummary") &&
    bankReviewPage.includes("Solution / explanation") &&
    bankReviewPage.includes("Taxonomy suggestions") &&
    bankReviewPage.includes("Edit Review Draft before approval") &&
    bankReviewPage.includes("Mark needs fix") &&
    bankReviewPage.includes("Reject and archive") &&
    bankReviewPage.includes("Approval adds this question") &&
    bankReviewPage.includes("bank-scoped and is not globally published") &&
    bankReviewPage.includes("Source lineage") &&
    !bankReviewPage.includes("published_at"),
  "teacher bank Review Draft QA must expose expandable prompt/answer/solution/taxonomy/warning review without publishing",
);

assert(
  bankReviewPage.includes("await requireTeacher()") &&
    bankReviewPage.includes("canManageBankContent(currentUserRole)") &&
    questionBanks.includes(".eq(\"owner_bank_id\", bankId)") &&
    questionBanks.includes(".eq(\"status\", \"draft\")") &&
    questionBanks.includes("question_taxonomy_assignments") &&
    questionBanks.includes("review_status") &&
    questionBanks.includes("import_batch_items") &&
    questionBanks.includes("validation_errors"),
  "Review Draft QA must stay teacher-only, owner/editor gated for approval, draft-only, and include taxonomy/warning context",
);

assert(
  importBankPdfDrafts.includes("assertNoRawProviderConfig(formData)") &&
    importBankPdfDrafts.includes("resolveTeacherAIPdfProviderProfile") &&
    importBankPdfDrafts.includes("targetBankId: parsed.bankId") &&
    importBankPdfDrafts.includes("enqueueAIProviderJob") &&
    importBankPdfDrafts.includes("buildAIPdfJobIdempotencyKey") &&
    !importBankPdfDrafts.includes("await processAIPdfImport") &&
    !importBankPdfDrafts.includes('visibility: "public"') &&
    !importBankPdfDrafts.includes('status: "published"') &&
    !importBankPdfDrafts.includes("published_at"),
  "teacher PDF import must preserve server-side provider routing, durable retry handoff, bank scope, and no auto-publish",
);

assert(
  approveBankReviewQuestion.includes('rpc("approve_bank_review_question"') &&
    approveBankReviewQuestion.includes("`/teacher/banks/${parsed.bankId}/review`,") &&
    !approveBankReviewQuestion.includes("`/teacher/banks/${parsed.bankId}/questions`,"),
  "approving a bank Review Draft must stay on the same Review Draft page",
);

assert(
  !bankImportUi.includes("api_key") &&
    !bankImportUi.includes("apiKey") &&
    !bankImportUi.includes("service_role") &&
    !bankReviewPage.includes("api_key") &&
    !bankReviewPage.includes("apiKey") &&
    !bankReviewPage.includes("service_role"),
  "teacher-facing import/review UI must not expose provider or Supabase secret fields",
);

assert(
  migrationFileNames.every(
    (fileName) =>
      !fileName.includes("ai_parsing_status") &&
      !fileName.includes("review_qa_polish") &&
      !fileName.includes("teacher_ai_parse_status"),
  ),
  "AI Parsing status and Review Draft QA polish must not add a migration",
);

assert(
  smokeAll.includes("ai-parsing-status-review-qa-smoke.mjs"),
  "smoke-all must include the AI Parsing status and Review Draft QA polish smoke",
);

console.log("PASS AI Parsing status and Review Draft QA source smoke");
