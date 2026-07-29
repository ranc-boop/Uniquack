import { readFile } from "node:fs/promises";

async function read(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const [
  dashboard,
  questionBanks,
  importsPage,
  questionsPage,
  reviewPage,
  adminQuestionsPage,
] = await Promise.all([
  read("src/lib/teacher-dashboard.ts"),
  read("src/lib/question-banks.ts"),
  read("src/app/teacher/banks/[bankId]/imports/page.tsx"),
  read("src/app/teacher/banks/[bankId]/questions/page.tsx"),
  read("src/app/teacher/banks/[bankId]/review/page.tsx"),
  read("src/app/admin/questions/page.tsx"),
]);

assert(
  dashboard.includes("const [bankResult, classrooms] = await Promise.all([") &&
    dashboard.includes("listTeacherQuestionBanks({ profileId, supabase })") &&
    dashboard.includes("listTeacherClassroomSummaries({ supabase })"),
  "Teacher dashboard must load independent Library and classroom data in parallel.",
);

const bankListStart = questionBanks.indexOf(
  "export async function listTeacherQuestionBanks",
);
const bankDetailStart = questionBanks.indexOf(
  "export async function getTeacherQuestionBankDetail",
);
const bankAccessStart = questionBanks.indexOf(
  "export async function getTeacherQuestionBankAccess",
);
assert(
  bankListStart >= 0 && bankDetailStart > bankListStart,
  "Teacher Library list/detail helpers are missing.",
);
const bankListSource = questionBanks.slice(bankListStart, bankDetailStart);
const bankDetailSource = questionBanks.slice(bankDetailStart, bankAccessStart);
const bankAccessSource = questionBanks.slice(bankAccessStart);
const reviewListStart = questionBanks.indexOf(
  "export async function listBankReviewDraftQuestions",
);
const reviewItemsStart = questionBanks.indexOf(
  "if (!reviewQuestionIds.length)",
  reviewListStart,
);
const approvedQuestionListStart = questionBanks.indexOf(
  "export async function listBankApprovedQuestions",
);
const bankQuestionPageStart = questionBanks.indexOf(
  "export async function listBankQuestionsPage",
);
const bankQuestionPageEnd = questionBanks.indexOf(
  "export function canManageBankMembers",
  bankQuestionPageStart,
);
const reviewPageRequestSource = questionBanks.slice(
  reviewListStart,
  reviewItemsStart,
);
const reviewEnrichmentSource = questionBanks.slice(
  reviewItemsStart,
  approvedQuestionListStart,
);
const bankQuestionPageSource = questionBanks.slice(
  bankQuestionPageStart,
  bankQuestionPageEnd,
);

assert(
  bankListSource.includes(
    'supabase.rpc("list_teacher_question_bank_summaries_v1")',
  ) &&
    bankListSource.indexOf(
      'supabase.rpc("list_teacher_question_bank_summaries_v1")',
    ) < bankListSource.indexOf('.from("bank_members")') &&
    bankListSource.includes("isMissingQuestionBankSummaryRpc"),
  "Teacher Library list must prefer one current-user read-model RPC and retain a missing-migration fallback.",
);

assert(
  bankListSource.includes("await Promise.all([") &&
    bankListSource.includes('.from("question_banks")') &&
    bankListSource.includes('.from("bank_questions")') &&
    bankListSource.includes('.from("bank_members")') &&
    bankListSource.includes('.from("questions")') &&
    bankListSource.includes('.from("import_batches")'),
  "Teacher Library list must batch its independent summary queries with Promise.all.",
);

assert(
  bankDetailSource.includes("await Promise.all([") &&
    bankDetailSource.match(/count: "exact", head: true/g)?.length === 3,
  "Teacher Library detail must parallelize metrics and use three head-only exact counts.",
);
assert(
  bankAccessSource.includes("await Promise.all([") &&
    bankAccessSource.includes('.from("question_banks")') &&
    bankAccessSource.includes('.from("bank_members")'),
  "Teacher Library access must load the visible bank and current membership in parallel.",
);
assert(
  reviewListStart >= 0 &&
    reviewItemsStart > reviewListStart &&
    approvedQuestionListStart > reviewItemsStart &&
    reviewPageRequestSource.includes('"search_bank_review_question_ids"') &&
    reviewPageRequestSource.includes("reviewPageRows?.[0]?.total_count") &&
    !reviewPageRequestSource.includes("await Promise.all([") &&
    reviewPageRequestSource.includes(
      "if (!reviewPageRows?.length && safePage > 1)",
    ) &&
    reviewPageRequestSource.includes('"count_bank_review_questions"'),
  "Library Review Draft pagination must reuse the page RPC total and reserve the count RPC for an empty deep-page fallback.",
);
assert(
  reviewEnrichmentSource.includes("reviewItemsByQuestionResult") &&
    reviewEnrichmentSource.includes("reviewItemsByIdResult") &&
    reviewEnrichmentSource.includes(
      "const [importBatchResult, tagNodeResult] = await Promise.all([",
    ),
  "Library Review Draft enrichment must batch review-item lookups with media metadata and overlap import-batch and taxonomy lookups.",
);
assert(
  bankQuestionPageStart >= 0 &&
    bankQuestionPageEnd > bankQuestionPageStart &&
    bankQuestionPageSource.includes('"search_bank_question_rows"') &&
    bankQuestionPageSource.includes("rows[0]?.total_count") &&
    !bankQuestionPageSource.includes("await Promise.all([") &&
    bankQuestionPageSource.includes("if (!rows.length && safePage > 1)") &&
    bankQuestionPageSource.includes('"count_bank_question_rows"'),
  "Library question pagination must avoid a duplicate count scan on normal pages and retain only the empty deep-page fallback.",
);

assert(
  importsPage.includes('mode === "ai" ? Promise.resolve(null) : loadTaxonomyCatalog(supabase)') &&
    importsPage.includes('mode === "ai"') &&
    importsPage.includes("listTeacherAIPdfParsingProfileState(supabase)") &&
    importsPage.includes("listAIPdfBurstsForBank({ bankId, supabase })") &&
    importsPage.includes("listAIQueueState({ bankId, supabase })"),
  "Library imports must load taxonomy and AI-only resources according to the selected mode.",
);

assert(
  importsPage.includes("const loadPageData = () =>") &&
    importsPage.includes("Promise.all([") &&
    importsPage.includes("getTeacherQuestionBankAccess({") &&
    importsPage.includes("listBankImportBatches({ bankId, supabase })"),
  "Library access and recent imports must load in parallel.",
);
assert(
  questionsPage.includes("getTeacherQuestionBankAccess({") &&
    !questionsPage.includes("getTeacherQuestionBankDetail({") &&
    questionsPage.includes("const showPublicCatalog = query.public === \"1\"") &&
    /showPublicCatalog\s*\?\s*Promise\.resolve\(null\)\s*:\s*listBankQuestionsPage\(\{/.test(
      questionsPage,
    ) &&
    questionsPage.includes("[access, questionPage] = await Promise.all([") &&
    questionsPage.includes("{!showPublicCatalog ? (") &&
    !questionsPage.includes("governanceProbeError") &&
    questionsPage.includes("const governanceAvailable = true"),
  "Library questions must overlap lightweight access with private pagination, skip that private page query in Public Catalog mode, and reuse the page RPC as the governance capability check.",
);
assert(
  questionsPage.includes('.is("owner_bank_id", null)') &&
    questionsPage.includes('.eq("status", "published")') &&
    questionsPage.includes('.eq("visibility", "public")') &&
    questionsPage.includes('.is("deleted_at", null)'),
  "Teacher Public Catalog queries must remain restricted to live Central Public Library questions.",
);
assert(
  reviewPage.includes("getTeacherQuestionBankAccess({") &&
    !reviewPage.includes("getTeacherQuestionBankDetail({") &&
    reviewPage.includes("[detail, draftPage] = await Promise.all(["),
  "Library Review Drafts must overlap lightweight access with draft loading instead of fetching unused detail metrics first.",
);
assert(
  adminQuestionsPage.includes("const [params, profile, supabase] = await Promise.all([") &&
    adminQuestionsPage.includes("const taxonomyCatalogPromise = loadTaxonomyCatalog(supabase)") &&
    adminQuestionsPage.includes("const focusedQuestionBundlePromise = focusedQuestionId") &&
    adminQuestionsPage.includes("ADMIN_QUESTION_EDIT_SELECT") &&
    adminQuestionsPage.includes("question_assets(") &&
    adminQuestionsPage.includes("question_source_files(") &&
    adminQuestionsPage.includes("import_batch_items(") &&
    adminQuestionsPage.includes("question_taxonomy_assignments("),
  "Admin focused-question loading must overlap taxonomy with one root-scoped edit bundle.",
);

console.log("PASS Teacher/Bank loading performance query-shape guard");
