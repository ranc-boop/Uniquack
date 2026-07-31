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

const page = await read("src/app/teacher/page.tsx");
const helper = await read("src/lib/teacher-dashboard.ts");
const librariesPage = await read("src/app/teacher/banks/page.tsx");
const smokeAll = await read("scripts/smoke-all.mjs");

assert(
  page.includes("getTeacherHomeSummary") &&
    page.includes("Next action") &&
    page.includes('href: "/teacher/banks"') &&
    page.includes('href: "/teacher/publish"') &&
    page.includes('href: "/teacher/progress"') &&
    !page.includes("TeacherDashboardOverviewCards") &&
    !page.includes("TeacherDashboardEvidencePanel") &&
    !page.includes("TeacherDashboardWorkflowPanel") &&
    !page.includes("TeacherWorkspaceNav"),
  "/teacher must render one next action and three clean workflow shortcuts",
);

assert(
  helper.includes("export async function getTeacherHomeSummary") &&
    helper.includes("listTeacherQuestionBanks") &&
    helper.includes("reviewDraftCount") &&
    helper.includes("assignmentReadyCount") &&
    !helper.includes("listTeacherClassroomSummaries") &&
    !helper.includes("assignment_practice_sessions") &&
    !helper.includes("student_assignment_progress") &&
    !helper.includes("practice_attempts") &&
    !helper.includes("import_batches"),
  "teacher home data must use only the Library summary read model",
);

assert(
  !helper.includes('.select("*")') &&
    !helper.includes(".insert(") &&
    !helper.includes(".update(") &&
    !helper.includes(".delete(") &&
    !helper.includes(".rpc(") &&
    !helper.includes("AI_PROVIDER") &&
    !helper.includes("SERVICE_ROLE"),
  "teacher home helper must stay read-only and provider-free",
);

assert(
  librariesPage.includes('placeholder="Search Libraries"') &&
    librariesPage.includes("<details") &&
    librariesPage.includes("More") &&
    librariesPage.includes('["Questions", bank.questionCount]') &&
    librariesPage.includes('["Review", bank.reviewDraftCount]') &&
    librariesPage.includes('["Ready", bank.assignmentReadyCount]') &&
    !librariesPage.includes("BankMetricCard") &&
    !librariesPage.includes("Library workbench") &&
    !librariesPage.includes("TeacherWorkspaceNav"),
  "Libraries must use search, disclosed filters, three counts, and compact row actions",
);

assert(
  smokeAll.includes("./teacher-dashboard-real-data-smoke.mjs"),
  "aggregate smoke runner must include teacher dashboard smoke",
);

console.log("PASS teacher dashboard and Library source checks");
