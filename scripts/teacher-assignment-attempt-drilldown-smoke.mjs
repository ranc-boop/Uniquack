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

const [page, helper, progressPage, smokeAll, migrations] = await Promise.all([
  read("src/app/teacher/classrooms/[id]/assignments/[assignmentId]/page.tsx"),
  read("src/lib/teacher-assignments.ts"),
  read("src/app/teacher/progress/page.tsx"),
  read("scripts/smoke-all.mjs"),
  readdir(resolve(root, "supabase/clean-migrations")),
]);
const normalizedPage = page.replace(/\s+/g, " ");

assert(
  page.includes('t("assignmentDetail.evidenceEyebrow")') &&
    page.includes('t("assignmentDetail.studentProgress")') &&
    page.includes('t("assignmentDetail.questionPerformance")') &&
    page.includes('t("assignmentDetail.attemptDrilldown")') &&
    page.includes('t("assignmentDetail.viewEvidence")') &&
    page.includes('t("assignmentDetail.correctTotal")') &&
    page.includes('t("assignmentDetail.attentionSignal")'),
  "assignment detail must render the teacher evidence header, student table, question table, and drilldown",
);

assert(
  page.includes('t("assignmentDetail.evidenceDescription")') &&
    page.includes('t("assignmentDetail.optionalEvidenceByQuestion")') &&
    page.includes('t("assignmentDetail.optionalRecentEvidence")') &&
    page.includes('t("assignmentDetail.assignmentOnlyLibraryPrivate")') &&
    !page.includes("lastPracticeSessionId") &&
    !page.includes("attempt.sessionId") &&
    !page.includes("@/components/student"),
  "assignment drilldown must preserve privacy copy, progressively disclose secondary evidence, and avoid raw session IDs or student workspace imports",
);

assert(
  helper.includes("export async function getTeacherAssignmentDetail") &&
    helper.includes('.from("assignment_practice_sessions")') &&
    helper.includes('.from("practice_attempts")') &&
    helper.includes('.in("session_id", practiceSessionIds)') &&
    helper.includes('.in("source_question_id", questionIds)') &&
    helper.includes("linkedStudentBySessionId") &&
    helper.includes("attemptsByStudentId") &&
    helper.includes("questionPerformanceItems") &&
    helper.includes("questionPerformanceRows") &&
    helper.includes("evidenceSummary") &&
    helper.includes(".limit("),
  "assignment helper must aggregate bounded, assignment-linked student and question attempt evidence",
);

assert(
  !helper.includes('.select("*")') &&
    !helper.includes(".insert(") &&
    !helper.includes(".update(") &&
    !helper.includes(".delete(") &&
    !helper.includes(".rpc(") &&
    !helper.includes("SERVICE_ROLE") &&
    !helper.includes("AI_PROVIDER") &&
    !helper.includes("providerProfile"),
  "assignment evidence helper must remain read-only, bounded, and provider-free",
);

assert(
  progressPage.includes("/assignments/${assignment.assignmentId}") &&
    smokeAll.includes("./teacher-assignment-attempt-drilldown-smoke.mjs"),
  "teacher progress must continue to link into the assignment drilldown and aggregate smoke must cover it",
);

assert(
  !migrations.some((name) => /assignment[_-]attempt|attempt[_-]drilldown/i.test(name)),
  "assignment attempt drilldown must not add a migration",
);

console.log("PASS teacher assignment attempt drilldown source checks");
