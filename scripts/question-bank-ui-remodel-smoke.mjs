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

const banksPage = await read("src/app/teacher/banks/page.tsx");
const bankUi = await read("src/app/teacher/banks/bank-ui.tsx");
const bankDetailPage = await read("src/app/teacher/banks/[bankId]/page.tsx");
const bankQuestionsPage = await read("src/app/teacher/banks/[bankId]/questions/page.tsx");
const bankImportsPage = await read("src/app/teacher/banks/[bankId]/imports/page.tsx");
const bankImportUi = await read("src/app/teacher/banks/bank-import-ui.tsx");
const bankReviewPage = await read("src/app/teacher/banks/[bankId]/review/page.tsx");
const bankMembersPage = await read("src/app/teacher/banks/[bankId]/members/page.tsx");
const bankBlueprintsPage = await read("src/app/teacher/banks/[bankId]/blueprints/page.tsx");
const bankSourcesPage = await read("src/app/teacher/banks/[bankId]/sources/page.tsx");
const bankSettingsPage = await read("src/app/teacher/banks/[bankId]/settings/page.tsx");
const questionBankHelpers = await read("src/lib/question-banks.ts");
const smokeAll = await read("scripts/smoke-all.mjs");

assert(
  banksPage.includes('title="Libraries"') &&
    banksPage.includes("Libraries are your teacher content repositories") &&
    banksPage.includes("deliver selected approved items") &&
    banksPage.includes("Create Library") &&
    banksPage.includes("Join Library by Code") &&
    banksPage.includes("Private") &&
    banksPage.includes("Shared") &&
    banksPage.includes("Organization") &&
    banksPage.includes("Public") &&
    banksPage.includes("Needs Review") &&
    banksPage.includes("Recently Updated") &&
    banksPage.includes("Assignment Ready") &&
    banksPage.includes("No Libraries yet. Create your first Library or join a shared") &&
    banksPage.includes("Library by code."),
  "/teacher/banks must render the library title, bank-first copy, CTAs, filters, and empty state",
);

assert(
    bankUi.includes("BankRouteTabs") &&
    bankUi.includes("Questions") &&
    bankUi.includes('label: "Import"') &&
    bankUi.includes('label: "Review"') &&
    bankUi.includes("Public Submissions") &&
    bankUi.includes("Blueprints") &&
    bankUi.includes("Members") &&
    bankUi.includes("Sources") &&
    bankUi.includes("Settings") &&
    bankUi.includes("AI drafts stay private until reviewed.") &&
    bankUi.includes("Assignments expose selected approved items, not the full Library.") &&
    bankUi.includes("Public movement requires a separate review gate."),
  "bank UI helper must expose repository tabs and review/assignment/public safety copy",
);

assert(
  bankDetailPage.includes("Library workspace") &&
    bankDetailPage.includes("Repository workflow") &&
    bankDetailPage.includes("Open question database") &&
    bankDetailPage.includes("Boundary notes") &&
    bankDetailPage.includes("bankMemberProfileLabel") &&
    bankDetailPage.includes("BankSafetyList"),
  "/teacher/banks/[bankId] must render a bank operating surface with readable member labels and safety boundaries",
);

assert(
  bankQuestionsPage.includes("Question database") &&
    bankQuestionsPage.includes("Taxonomy") &&
    bankQuestionsPage.includes("Not tagged") &&
    bankQuestionsPage.includes("Not set") &&
    bankQuestionsPage.includes("Source") &&
    bankQuestionsPage.includes("Ready for assignment") &&
    bankQuestionsPage.includes("Assign") &&
    bankQuestionsPage.includes("Revise") &&
    bankQuestionsPage.includes("Submit selected to Public Library") &&
    !bankQuestionsPage.includes("Start Practice"),
  "/teacher/banks/[bankId]/questions must read as a question database, not a Practice entry point",
);

assert(
  bankImportsPage.includes('aria-label="Library import modes"') &&
    bankImportsPage.includes('["manual", "json", "ai"]') &&
    bankImportsPage.includes("BankManualQuestionForm") &&
    bankImportsPage.includes("BatchImportJsonPanelLoader") &&
    bankImportsPage.includes("TeacherPdfBurstUpload") &&
    bankImportsPage.includes("private Review Drafts") &&
    !bankImportsPage.includes("Advanced / Developer fixture"),
  "/teacher/banks/[bankId]/imports must expose Manual, JSON, and AI as equal bank-scoped entry points without a duplicate target selector",
);

assert(
  bankReviewPage.includes("Teacher QA queue") &&
    bankReviewPage.includes("Approve drafts into this Library. This does not publish them to the") &&
    bankReviewPage.includes("Pending private drafts") &&
    bankReviewPage.includes("Review required") &&
    bankReviewPage.includes("private to this Library and is not globally published") &&
    bankReviewPage.includes("Source lineage"),
  "/teacher/banks/[bankId]/review must render bank/private teacher QA language",
);

assert(
  bankMembersPage.includes("Members and share codes") &&
    bankMembersPage.includes("Owner-controlled sharing") &&
    bankMembersPage.includes("Create share code") &&
    bankMembersPage.includes("Viewer") &&
    bankMembersPage.includes("Editor") &&
    bankMembersPage.includes("Classroom membership does not grant"),
  "/teacher/banks/[bankId]/members must show role/share controls without implying student bank browsing",
);

assert(
  bankBlueprintsPage.includes("Blueprint links for") &&
    bankBlueprintsPage.includes("Create Blueprint from this Library") &&
    bankBlueprintsPage.includes("No Blueprints linked to this Library yet") &&
    bankBlueprintsPage.includes("Review Draft and Library approval gates") &&
    bankBlueprintsPage.includes("listBankLinkedBlueprints") &&
    !bankBlueprintsPage.includes("executeDeepSeek") &&
    !bankBlueprintsPage.includes("callAIPdfExtractionProvider") &&
    bankSourcesPage.includes("Source material and import lineage") &&
    bankSourcesPage.includes("does not expose private files to students") &&
    bankSettingsPage.includes("settings read-only") &&
    bankSettingsPage.includes("No visibility or ownership mutation is added"),
  "bank blueprints must show bank-linked Blueprint Library assets without generation/provider shortcuts, while sources/settings remain guarded",
);

assert(
  questionBankHelpers.includes("reviewDraftCount") &&
    questionBankHelpers.includes("importBatchCount") &&
    questionBankHelpers.includes("assignmentReadyCount") &&
    questionBankHelpers.includes("tagSummaries") &&
    questionBankHelpers.includes("taxonomy_nodes"),
  "question bank helpers must provide bounded UI metadata without fake counts",
);

assert(
  smokeAll.includes("question-bank-ui-remodel-smoke.mjs"),
  "smoke-all must include question bank UI remodel smoke",
);

console.log("PASS question bank UI remodel source smoke");
