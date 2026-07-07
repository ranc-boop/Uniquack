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
const bankReviewPage = await read("src/app/teacher/banks/[bankId]/review/page.tsx");
const bankMembersPage = await read("src/app/teacher/banks/[bankId]/members/page.tsx");
const bankBlueprintsPage = await read("src/app/teacher/banks/[bankId]/blueprints/page.tsx");
const bankSourcesPage = await read("src/app/teacher/banks/[bankId]/sources/page.tsx");
const bankSettingsPage = await read("src/app/teacher/banks/[bankId]/settings/page.tsx");
const questionBankHelpers = await read("src/lib/question-banks.ts");
const smokeAll = await read("scripts/smoke-all.mjs");

assert(
  banksPage.includes("Question Bank Library") &&
    banksPage.includes("Banks are your teacher content repositories") &&
    banksPage.includes("deliver selected approved items") &&
    banksPage.includes("Create Question Bank") &&
    banksPage.includes("Join Bank by Code") &&
    banksPage.includes("Private") &&
    banksPage.includes("Shared") &&
    banksPage.includes("Organization") &&
    banksPage.includes("Public") &&
    banksPage.includes("Needs Review") &&
    banksPage.includes("Recently Updated") &&
    banksPage.includes("Assignment Ready") &&
    banksPage.includes("No banks yet. Create your first Question Bank or join a shared") &&
    banksPage.includes("bank by code."),
  "/teacher/banks must render the library title, bank-first copy, CTAs, filters, and empty state",
);

assert(
  bankUi.includes("BankRouteTabs") &&
    bankUi.includes("Questions") &&
    bankUi.includes("Imports") &&
    bankUi.includes("Review Drafts") &&
    bankUi.includes("Blueprints") &&
    bankUi.includes("Members") &&
    bankUi.includes("Sources") &&
    bankUi.includes("Settings") &&
    bankUi.includes("AI drafts stay private until reviewed.") &&
    bankUi.includes("Assignments expose selected approved items, not the full bank.") &&
    bankUi.includes("Public movement requires a separate review gate."),
  "bank UI helper must expose repository tabs and review/assignment/public safety copy",
);

assert(
  bankDetailPage.includes("Question Bank operating surface") &&
    bankDetailPage.includes("Repository workflow") &&
    bankDetailPage.includes("Open question database") &&
    bankDetailPage.includes("Boundary notes") &&
    bankDetailPage.includes("bankMemberProfileLabel") &&
    bankDetailPage.includes("BankSafetyList"),
  "/teacher/banks/[bankId] must render a bank operating surface with readable member labels and safety boundaries",
);

assert(
  bankQuestionsPage.includes("Question database") &&
    bankQuestionsPage.includes("Taxonomy / knowledge point") &&
    bankQuestionsPage.includes("Not tagged yet") &&
    bankQuestionsPage.includes("Not set") &&
    bankQuestionsPage.includes("Source lineage") &&
    bankQuestionsPage.includes("Assignment ready") &&
    bankQuestionsPage.includes("Use in assignment") &&
    !bankQuestionsPage.includes("Start Practice"),
  "/teacher/banks/[bankId]/questions must read as a question database, not a Practice entry point",
);

assert(
  bankImportsPage.includes("AI Parsing-first workflow") &&
    bankImportsPage.includes("Open AI Parsing") &&
    bankImportsPage.includes("Review gate: no imported draft is assignable or globally published") &&
    bankImportsPage.includes("Advanced / developer import fixture") &&
    bankImportsPage.includes("JSON is not the primary teacher flow") &&
    bankImportsPage.indexOf("AI Parsing-first workflow") <
      bankImportsPage.indexOf("Draft question JSON"),
  "/teacher/banks/[bankId]/imports must lead with AI Parsing and hide JSON behind an advanced fixture",
);

assert(
  bankReviewPage.includes("Teacher QA queue") &&
    bankReviewPage.includes("Approve drafts into this bank. This does not publish them to the") &&
    bankReviewPage.includes("Pending private drafts") &&
    bankReviewPage.includes("Review required") &&
    bankReviewPage.includes("bank-scoped and is not globally published") &&
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
  bankBlueprintsPage.includes("Blueprints generated from or linked to this bank will appear here") &&
    bankBlueprintsPage.includes("Blueprint output still flows through Review Drafts") &&
    bankSourcesPage.includes("Source material and import lineage") &&
    bankSourcesPage.includes("does not expose private files to students") &&
    bankSettingsPage.includes("settings read-only") &&
    bankSettingsPage.includes("No visibility or ownership mutation is added"),
  "bank blueprints/sources/settings placeholder routes must stay non-mutating and review-gated",
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
