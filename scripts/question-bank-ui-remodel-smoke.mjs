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
  banksPage.includes("<BankWorkbenchPage") &&
    banksPage.includes("Libraries") &&
    banksPage.includes("Create Library") &&
    banksPage.includes("Join by code") &&
    banksPage.includes("Search Libraries") &&
    banksPage.includes("Private") &&
    banksPage.includes("Shared") &&
    banksPage.includes("Organization") &&
    banksPage.includes("Public") &&
    banksPage.includes("Needs review") &&
    banksPage.includes("Recently updated") &&
    banksPage.includes("Assignment ready") &&
    banksPage.includes("No Libraries yet"),
  "/teacher/banks must render the restrained Library workbench, CTAs, filters, search, and empty state",
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
  bankDetailPage.includes("Next action") &&
    bankDetailPage.includes('aria-label="Library work"') &&
    bankDetailPage.includes('label: "Draft"') &&
    bankDetailPage.includes('label: "Ready"') &&
    bankDetailPage.includes('label: "Members"') &&
    bankDetailPage.includes("bankMemberRoleLabel") &&
    bankDetailPage.includes("canManageBankContent"),
  "/teacher/banks/[bankId] must render a focused next-action surface with readable membership and capability boundaries",
);

assert(
  bankQuestionsPage.includes("QuestionManagementWorkbench") &&
    bankQuestionsPage.includes("workbenchApprovalStatus") &&
    bankQuestionsPage.includes('query.status === "approved" ? "approved" : "pending"') &&
    bankQuestionsPage.includes("search_official_public_questions_v2") &&
    bankQuestionsPage.includes('mode="teacher"') &&
    bankQuestionsPage.includes("打开经典批量管理") &&
    !bankQuestionsPage.includes("Start Practice"),
  "/teacher/banks/[bankId]/questions must default to the shared two-state workbench and use the official Public Library query",
);

assert(
  bankImportsPage.includes('["manual", "json", "ai"].includes') &&
    bankImportsPage.includes('query.mode as "manual" | "json" | "ai"') &&
    bankImportsPage.includes("BankManualQuestionForm") &&
    bankImportsPage.includes("BatchImportJsonPanelLoader") &&
    bankImportsPage.includes("TeacherPdfBurstUpload") &&
    bankImportsPage.includes("private Review Drafts in") &&
    !bankImportsPage.includes("Advanced / Developer fixture"),
  "/teacher/banks/[bankId]/imports must expose Manual, JSON, and AI as equal bank-scoped entry points without a duplicate target selector",
);

assert(
  bankReviewPage.includes("Review") &&
    bankReviewPage.includes("All Drafts") &&
    bankReviewPage.includes("Ready to review") &&
    bankReviewPage.includes("Needs attention") &&
    bankReviewPage.includes("Approve current page") &&
    bankReviewPage.includes("Approval confirms these questions for this Library") &&
    bankReviewPage.includes("approveBankReviewQuestions"),
  "/teacher/banks/[bankId]/review must render the Library-scoped teacher QA queue and approval action",
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
