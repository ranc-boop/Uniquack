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

const [page, helper, dashboardPanels, classroomAnalytics, smokeAll, migrations] =
  await Promise.all([
    read("src/app/teacher/progress/page.tsx"),
    read("src/lib/teacher-progress.ts"),
    read("src/components/teacher/teacher-dashboard-panels.tsx"),
    read("src/app/teacher/classrooms/[id]/analytics/page.tsx"),
    read("scripts/smoke-all.mjs"),
    readdir(resolve(root, "supabase/clean-migrations")),
  ]);

assert(
  page.includes("getTeacherProgressSummary") &&
    page.includes("Progress / Feedback") &&
    page.includes("Active classes") &&
    page.includes("Active assignments") &&
    page.includes("Completion rate") &&
    page.includes("Students needing attention") &&
    page.includes("Recent evidence") &&
    page.includes("Assignment progress") &&
    !page.includes("TeacherComingSoonPanel") &&
    !page.includes("Evidence and progress shell"),
  "/teacher/progress must render the real evidence dashboard instead of the old module shell",
);

assert(
  helper.includes("export async function getTeacherProgressSummary") &&
    helper.includes('.from("classrooms")') &&
    helper.includes('.from("classroom_members")') &&
    helper.includes('.from("assignments")') &&
    helper.includes('.from("student_assignment_progress")') &&
    helper.includes('.from("assignment_practice_sessions")') &&
    helper.includes('.from("practice_sessions")') &&
    helper.includes('.from("practice_attempts")') &&
    helper.includes('.eq("status", "active")') &&
    helper.includes('.in("id", practiceSessionIds)') &&
    helper.includes(".limit("),
  "teacher progress helper must use bounded classroom and assignment-linked evidence reads",
);

assert(
  !helper.includes('.select("*")') &&
    !helper.includes(".insert(") &&
    !helper.includes(".update(") &&
    !helper.includes(".delete(") &&
    !helper.includes(".rpc(") &&
    !helper.includes("SERVICE_ROLE") &&
    !helper.includes("AI_PROVIDER") &&
    !helper.includes("providerProfile") &&
    !helper.includes("source_bank_id") &&
    !helper.includes("bank_questions"),
  "teacher progress helper must remain read-only, provider-free, and independent of source-bank content",
);

assert(
  page.includes("Assignment and classroom evidence only") &&
    page.includes("Private student self-study is not included") &&
    page.includes("Source Question Banks remain private") &&
    page.includes("Teacher feedback notes are coming later") &&
    !page.includes("/teacher/banks/"),
  "teacher progress page must state assignment evidence privacy boundaries without source-bank links",
);

assert(
  page.includes("Open assignment detail") &&
    page.includes("/assignments/${assignment.assignmentId}") &&
    dashboardPanels.includes('href: "/teacher/progress"') &&
    classroomAnalytics.includes('href="/teacher/progress"') &&
    classroomAnalytics.includes("All progress"),
  "teacher dashboard, classroom analytics, and progress rows must link into the evidence workflow",
);

assert(
  smokeAll.includes("./teacher-progress-evidence-foundation-smoke.mjs"),
  "aggregate smoke runner must include teacher progress evidence foundation smoke",
);

assert(
  !migrations.some((name) => /teacher[_-]progress|progress[_-]evidence/i.test(name)),
  "teacher progress evidence foundation must not add a migration",
);

console.log("PASS teacher progress evidence foundation source checks");
