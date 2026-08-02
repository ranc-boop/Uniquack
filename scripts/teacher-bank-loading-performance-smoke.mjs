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
  appPrimaryNav,
  teacherPendingLink,
] = await Promise.all([
  read("src/lib/teacher-dashboard.ts"),
  read("src/lib/question-banks.ts"),
  read("src/app/teacher/banks/[bankId]/imports/page.tsx"),
  read("src/app/teacher/banks/[bankId]/questions/page.tsx"),
  read("src/app/teacher/banks/[bankId]/review/page.tsx"),
  read("src/app/admin/questions/page.tsx"),
  read("src/components/app-primary-nav.tsx"),
  read("src/components/teacher/teacher-pending-link.tsx"),
]);

assert(
  appPrimaryNav.includes("prefetch={false}") &&
    teacherPendingLink.includes("prefetch={false}") &&
    teacherPendingLink.includes("onMouseEnter={prefetchTarget}") &&
    teacherPendingLink.includes("onFocus={prefetchTarget}"),
  "Teacher navigation must disable viewport prefetch and only warm routes on user intent.",
);

assert(
  dashboard.includes("export async function getTeacherHomeSummary") &&
    dashboard.includes("listTeacherQuestionBanks({ profileId, supabase })") &&
    !dashboard.includes("listTeacherClassroomSummaries") &&
    !dashboard.includes("assignment_practice_sessions") &&
    !dashboard.includes("student_assignment_progress") &&
    !dashboard.includes("practice_attempts") &&
    !dashboard.includes("import_batches"),
  "Teacher home must derive its next action from the lightweight Library summary only.",
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
    importsPage.includes("getTeacherBankImportWorkspace({") &&
    importsPage.includes("taxonomyPromise") &&
    importsPage.includes("parsingProfilePromise"),
  "Library shared import state must use one read model and overlap mode-specific data.",
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
  questionsPage.includes('"search_official_public_questions_v2"') &&
    questionsPage.includes("page_limit: publicPageSize") &&
    questionsPage.includes("page_offset: (publicPage - 1) * publicPageSize"),
  "Teacher Public Catalog queries must use the paged official Public Library read model.",
);
assert(
  reviewPage.includes("getTeacherQuestionBankAccess({") &&
    !reviewPage.includes("getTeacherQuestionBankDetail({") &&
    reviewPage.includes("[detail, draftPage] = await Promise.all(["),
  "Library Review Drafts must overlap lightweight access with draft loading instead of fetching unused detail metrics first.",
);
assert(
  adminQuestionsPage.includes("const [profile, params, supabase] = await Promise.all([") &&
    adminQuestionsPage.includes('"search_official_public_questions_v2"') &&
    adminQuestionsPage.includes("page_limit: PAGE_SIZE") &&
    adminQuestionsPage.includes('.select("id, solution_html")') &&
    adminQuestionsPage.includes('.in("id", rows.map((row) => row.question_id))'),
  "Admin Public Library loading must stay paged and bound detail hydration to the returned official IDs.",
);

console.log("PASS Teacher/Bank loading performance query-shape guard");
