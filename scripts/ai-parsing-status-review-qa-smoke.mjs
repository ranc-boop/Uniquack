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
const bankPdfBurstActions = await read("src/app/teacher/banks/pdf-burst-actions.ts");
const questionBanks = await read("src/lib/question-banks.ts");
const lazyReviewPreview = await read(
  "src/components/teacher/lazy-teacher-question-preview.tsx",
);
const reviewPreview = await read("src/components/teacher/teacher-question-preview.tsx");
const reviewPreviewRoute = await read(
  "src/app/api/teacher/banks/[bankId]/previews/route.ts",
);
const reviewGuidance = await read(
  "src/lib/questions/teacher-review-guidance.ts",
);
const smokeAll = await read("scripts/smoke-all.mjs");
const migrationFileNames = [
  ...(await readDir("supabase/clean-migrations")),
];
const reserveTeacherAIPdfBurst = extractFunctionBody(
  bankPdfBurstActions,
  "reserveTeacherAIPdfBurst",
);
const finalizeTeacherAIPdfBurstItem = extractFunctionBody(
  bankPdfBurstActions,
  "finalizeTeacherAIPdfBurstItem",
);
const approveBankReviewQuestion = extractFunctionBody(
  bankActions,
  "approveBankReviewQuestion",
);

assert(
  teacherAiParsingPage.includes("getTeacherQuestionBankDetail") &&
    teacherAiParsingPage.includes("canManageBankContent") &&
    teacherAiParsingPage.includes("imports?mode=ai") &&
    teacherAiParsingPage.includes('redirect("/teacher/banks?intent=import")') &&
    !teacherAiParsingPage.includes("/admin/imports/pdf") &&
    !teacherAiParsingPage.includes("/admin/review"),
  "/teacher/ai-parsing must remain a scoped compatibility redirect into Library Import/AI",
);

assert(
  bankImportUi.includes("Recent AI Parsing status") &&
    bankImportUi.includes("summarizeImportBatch") &&
    bankImportUi.includes("Target Library") &&
    bankImportUi.includes("Drafts") &&
    bankImportUi.includes("Warnings") &&
    bankImportUi.includes("status.retryable") &&
    bankImportUi.includes("Zero drafts were created") &&
    bankImportUi.includes("Open Review Drafts") &&
    bankImportUi.includes("QuestionBoundaryGuardCard") &&
    bankImportUi.includes("Nothing was published or") &&
    bankImportUi.includes("assigned; retry later"),
  "recent bank imports panel must derive teacher-safe status, counts, retry state, boundary summary, and a bank-scoped Review CTA",
);

assert(
  bankImportsPage.includes("AI Parsing runs server-side") &&
    bankImportsPage.includes("private drafts in this Library until review") &&
    bankImportsPage.includes("Review is required before assignment") &&
    bankImportsPage.includes("bankName={bank.name}") &&
    !bankImportsPage.includes("providerProfileId") &&
    !bankImportsPage.includes("api_key") &&
    !bankImportsPage.includes("apiKey"),
  "teacher Library imports page must explain review-gated private drafts and hide provider configuration",
);

assert(
  bankReviewPage.includes("LazyTeacherQuestionPreview") &&
    bankReviewPage.includes('kind="review"') &&
    bankReviewPage.includes("TeacherReviewGuidance") &&
    bankReviewPage.includes("markBankReviewDraftNeedsFix") &&
    bankReviewPage.includes("rejectBankReviewDraftQuestion") &&
    lazyReviewPreview.includes("/api/teacher/banks/") &&
    lazyReviewPreview.includes("credentials: \"same-origin\"") &&
    reviewPreviewRoute.includes("getReviewPreviewDTOs") &&
    reviewPreview.includes("QuestionDetailImageGallery") &&
    reviewPreview.includes("<CompactAnswer preview={preview} />") &&
    reviewPreview.includes("<SolutionText") &&
    reviewPreview.includes("preview.taxonomy.map") &&
    reviewGuidance.includes("Source boundary needs review") &&
    reviewGuidance.includes("Answer and solution need review") &&
    bankReviewPage.includes("Approval confirms these questions for this Library") &&
    bankReviewPage.includes("you did not preview remains your responsibility") &&
    !bankReviewPage.includes("published_at"),
  "teacher Review cards must load authenticated bank-scoped prompt, answer, solution, taxonomy, media, and safe boundary guidance without publishing",
);

assert(
  bankReviewPage.includes("await requireTeacher()") &&
    bankReviewPage.includes("const canApprove = detail.canManage") &&
    bankReviewPage.includes("listBankReviewQuestionSummaries") &&
    bankReviewPage.includes("question.publishable") &&
    questionBanks.includes("validateReviewQuestionForPublish") &&
    questionBanks.includes("expectedBankId: bankId") &&
    questionBanks.includes("ownerBankId: question.owner_bank_id") &&
    questionBanks.includes("status: question.status") &&
    questionBanks.includes("publishable: validation.hardErrors.length === 0") &&
    questionBanks.includes("question_taxonomy_assignments") &&
    questionBanks.includes("review_status") &&
    questionBanks.includes("import_batch_items") &&
    questionBanks.includes("validation_errors"),
  "Review QA must stay teacher-only, owner/editor gated, canonical-validator controlled, bank-scoped, and include taxonomy/warning context",
);

assert(
  reserveTeacherAIPdfBurst.includes("resolveTeacherAIPdfProviderProfile") &&
    reserveTeacherAIPdfBurst.includes("p_target_bank_id: detail.bank.id") &&
    reserveTeacherAIPdfBurst.includes("reserve_ai_pdf_upload_burst") &&
    finalizeTeacherAIPdfBurstItem.includes("releaseAIPdfBurstAdmissionJobs") &&
    !bankPdfBurstActions.includes("await processAIPdfImport") &&
    !bankPdfBurstActions.includes('visibility: "public"') &&
    !bankPdfBurstActions.includes('status: "published"') &&
    !bankPdfBurstActions.includes("published_at"),
  "teacher PDF import must preserve server-side provider routing, durable retry handoff, bank scope, and no auto-publish",
);

assert(
  approveBankReviewQuestion.includes('rpc("approve_library_questions_v2"') &&
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
