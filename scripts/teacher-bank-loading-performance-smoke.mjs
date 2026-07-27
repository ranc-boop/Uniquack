import { readFile } from "node:fs/promises";

async function read(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const [dashboard, questionBanks, importsPage, questionsPage, adminQuestionsPage] = await Promise.all([
  read("src/lib/teacher-dashboard.ts"),
  read("src/lib/question-banks.ts"),
  read("src/app/teacher/banks/[bankId]/imports/page.tsx"),
  read("src/app/teacher/banks/[bankId]/questions/page.tsx"),
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
    questionsPage.includes("[access, questionPage, { error: governanceProbeError }] = await Promise.all(["),
  "Library questions must use lightweight access and parallelize access, pagination, and governance capability checks.",
);
assert(
  adminQuestionsPage.includes("const [params, , supabase] = await Promise.all([") &&
    adminQuestionsPage.includes("{ data: taxonomyAssignments, error: taxonomyAssignmentsError }") &&
    adminQuestionsPage.includes("{ data: importItems }"),
  "Admin questions must overlap request setup and batch detail-only taxonomy/import lookups.",
);

console.log("PASS Teacher/Bank loading performance query-shape guard");
