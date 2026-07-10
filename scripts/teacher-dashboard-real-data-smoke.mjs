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
const panels = await read("src/components/teacher/teacher-dashboard-panels.tsx");
const smokeAll = await read("scripts/smoke-all.mjs");

assert(
  page.includes("getTeacherDashboardSummary") &&
    page.includes("TeacherDashboardOverviewCards") &&
    page.includes("TeacherDashboardActionBoard") &&
    page.includes("TeacherDashboardEvidencePanel") &&
    page.includes("TeacherDashboardWorkflowPanel") &&
    page.includes("Review Drafts") &&
    page.includes("Publish from Library") &&
    page.includes("Start with a Question Bank") &&
    page.includes("No unreviewed draft can be assigned to students") &&
    page.includes("Student visibility stays assignment-only"),
  "/teacher must render a real dashboard while preserving bank-first safety copy",
);

assert(
  helper.includes("export async function getTeacherDashboardSummary") &&
    helper.includes("listTeacherQuestionBanks") &&
    helper.includes("listTeacherClassroomSummaries") &&
    helper.includes("assignment_practice_sessions") &&
    helper.includes("student_assignment_progress") &&
    helper.includes("practice_attempts") &&
    helper.includes("import_batches") &&
    helper.includes("owner_bank_id") &&
    helper.includes(".limit("),
  "teacher dashboard helper must aggregate bounded bank, import, classroom, assignment, and Practice evidence data",
);

assert(
  helper.includes('eq("status", "draft")') &&
    helper.includes("reviewDraftCount") &&
    helper.includes("assignmentReadyCount") &&
    helper.includes("assignmentsNeedingAttention") &&
    helper.includes("recentEvidence"),
  "teacher dashboard helper must expose review queue, assignment-ready, attention, and evidence sections",
);

assert(
  !helper.includes('.select("*")') &&
    !helper.includes(".insert(") &&
    !helper.includes(".update(") &&
    !helper.includes(".delete(") &&
    !helper.includes(".rpc(") &&
    !helper.includes("AI_PROVIDER") &&
    !helper.includes("SERVICE_ROLE") &&
    !helper.includes("SUPABASE_SERVICE_ROLE"),
  "teacher dashboard helper must stay read-only, bounded, and provider-free",
);

assert(
  !panels.includes('"use client"') &&
    panels.includes("Question Banks") &&
    panels.includes("Assignment-ready") &&
    panels.includes("Active classrooms") &&
    panels.includes("Active assignments") &&
    panels.includes("Recent Practice evidence") &&
    panels.includes("assignment-only") &&
    panels.includes("Student self-study is not mixed in") &&
    panels.includes("/teacher/publish?sourceBankId="),
  "teacher dashboard panels must be server-compatible and show the real action board",
);

assert(
  !page.includes("@/components/student") &&
    !page.includes("@/app/admin") &&
    !panels.includes("@/components/student") &&
    !panels.includes("@/app/admin"),
  "teacher dashboard must not import student or admin workspace surfaces",
);

assert(
  smokeAll.includes("./teacher-dashboard-real-data-smoke.mjs"),
  "aggregate smoke runner must include teacher dashboard real data smoke",
);

console.log("PASS teacher dashboard real data source checks");
