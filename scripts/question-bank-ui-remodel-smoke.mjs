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
    banksPage.includes('translate(locale, "teacher.libraries")') &&
    banksPage.includes('translate(locale, "teacher.createLibrary")') &&
    banksPage.includes('translate(locale, "teacher.joinByCode")') &&
    banksPage.includes('translate(locale, "teacher.searchLibraries")') &&
    banksPage.includes('translate(locale, "teacher.private")') &&
    banksPage.includes('translate(locale, "teacher.shared")') &&
    banksPage.includes('translate(locale, "teacher.organization")') &&
    banksPage.includes('translate(locale, "teacher.public")') &&
    banksPage.includes('translate(locale, "teacher.needsReview")') &&
    banksPage.includes('translate(locale, "teacher.recentlyUpdated")') &&
    banksPage.includes('translate(locale, "teacher.assignmentReady")') &&
    banksPage.includes('translate(locale, "teacher.noLibrariesYet")'),
  "/teacher/banks must render the restrained Library workbench, CTAs, filters, search, and empty state",
);

assert(
  bankUi.includes("BankRouteTabs") &&
    bankUi.includes('labelKey: "teacherLibrary.questions"') &&
    bankUi.includes('labelKey: "teacherLibrary.import"') &&
    bankUi.includes('labelKey: "teacherLibrary.review"') &&
    bankUi.includes('labelKey: "teacherLibrary.publicSubmissions"') &&
    bankUi.includes('labelKey: "teacherLibrary.blueprints"') &&
    bankUi.includes('labelKey: "teacherLibrary.members"') &&
    bankUi.includes('labelKey: "teacherLibrary.sources"') &&
    !bankUi.includes('label: "Settings"') &&
    !bankUi.includes("BankSafetyList"),
  "bank UI helper must expose only working repository tabs without static boundary cards",
);

assert(
  bankDetailPage.includes('t("teacherLibrary.nextAction")') &&
    bankDetailPage.includes('aria-label={t("teacherLibrary.libraryWork")}') &&
    bankDetailPage.includes('label: t("teacherLibrary.draft")') &&
    bankDetailPage.includes('label: t("teacherLibrary.ready")') &&
    bankDetailPage.includes('label: t("teacherLibrary.members")') &&
    bankDetailPage.includes("memberRoleLabel") &&
    bankDetailPage.includes("canManageBankContent"),
  "/teacher/banks/[bankId] must render a focused next-action surface with readable membership and capability boundaries",
);

assert(
  bankQuestionsPage.includes("QuestionManagementWorkbench") &&
    bankQuestionsPage.includes("workbenchApprovalStatus") &&
    bankQuestionsPage.includes('query.status === "approved" ? "approved" : "pending"') &&
    bankQuestionsPage.includes("search_official_public_questions_v2") &&
    bankQuestionsPage.includes('mode="teacher"') &&
    bankQuestionsPage.includes("QuestionBulkActionBar") &&
    !bankQuestionsPage.includes("Start Practice"),
  "/teacher/banks/[bankId]/questions must default to the shared two-state workbench and use the official Public Library query",
);

assert(
  bankImportsPage.includes('["manual", "json", "ai"].includes') &&
    bankImportsPage.includes('query.mode as "manual" | "json" | "ai"') &&
    bankImportsPage.includes("BankManualQuestionForm") &&
    bankImportsPage.includes("BatchImportJsonPanelLoader") &&
    bankImportsPage.includes("TeacherPdfBurstUpload") &&
    bankImportsPage.includes('t("teacherLibrary.importedPrivateReviewDrafts"') &&
    !bankImportsPage.includes("Advanced / Developer fixture"),
  "/teacher/banks/[bankId]/imports must expose Manual, JSON, and AI as equal bank-scoped entry points without a duplicate target selector",
);

assert(
  bankReviewPage.includes('t("teacherLibrary.review")') &&
    bankReviewPage.includes('t("teacherLibrary.allDrafts")') &&
    bankReviewPage.includes('t("teacherLibrary.readyToReview")') &&
    bankReviewPage.includes('t("teacherLibrary.needsAttention")') &&
    bankReviewPage.includes('t("teacherLibrary.approveCurrentPage"') &&
    bankReviewPage.includes('t("teacherLibrary.approvalResponsibility")') &&
    bankReviewPage.includes("approveBankReviewQuestions"),
  "/teacher/banks/[bankId]/review must render the Library-scoped teacher QA queue and approval action",
);

assert(
  bankMembersPage.includes('t("teacherLibrary.membersDescription")') &&
    bankMembersPage.includes('t("teacherLibrary.ownerControlledSharing")') &&
    bankMembersPage.includes('t("teacherLibrary.createShareCode")') &&
    bankMembersPage.includes('t("teacherLibrary.viewer")') &&
    bankMembersPage.includes('t("teacherLibrary.editor")') &&
    bankMembersPage.includes('t("teacherLibrary.sharingDescription")') &&
    bankMembersPage.includes('t("teacherLibrary.onlyOwnersShareCodes")'),
  "/teacher/banks/[bankId]/members must show role/share controls without implying student bank browsing",
);

assert(
  bankBlueprintsPage.includes('t("teacherLibrary.blueprintsLinkedToLibrary")') &&
    bankBlueprintsPage.includes('t("teacherLibrary.createBlueprintFromLibrary")') &&
    bankBlueprintsPage.includes('t("teacherLibrary.noLinkedBlueprints")') &&
    bankBlueprintsPage.includes('t("teacherLibrary.linkedBlueprintsDescription")') &&
    bankBlueprintsPage.includes("listBankLinkedBlueprints") &&
    !bankBlueprintsPage.includes("executeDeepSeek") &&
    !bankBlueprintsPage.includes("callAIPdfExtractionProvider") &&
    bankSourcesPage.includes('t("teacherLibrary.sourceActivityDescription")') &&
    bankSettingsPage.includes("redirect(`/teacher/banks/${bankId}`)"),
  "bank blueprints must show bank-linked assets without generation shortcuts, while the removed Settings placeholder redirects safely",
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
