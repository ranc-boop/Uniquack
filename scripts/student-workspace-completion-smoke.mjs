import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function read(relativePath) {
  return readFile(resolve(root, relativePath), "utf8");
}

async function listFiles(relativePath) {
  const absolutePath = resolve(root, relativePath);
  const entries = await readdir(absolutePath);
  const files = [];

  for (const entry of entries) {
    const fullPath = resolve(absolutePath, entry);
    const details = await stat(fullPath);
    if (details.isDirectory()) {
      files.push(...(await listFiles(relative(root, fullPath))));
    } else {
      files.push(relative(root, fullPath).replaceAll("\\", "/"));
    }
  }

  return files;
}

const manifest = JSON.parse(await read("docs/security/student-route-manifest.json"));
const studentPageFiles = (await listFiles("src/app/student"))
  .filter((file) => file.endsWith("/page.tsx"))
  .sort();
const expectedStudentPageFiles = [
  "src/app/student/classrooms/join/page.tsx",
  "src/app/student/classrooms/page.tsx",
  "src/app/student/groups/page.tsx",
  "src/app/student/library/page.tsx",
  "src/app/student/page.tsx",
  "src/app/student/progress/page.tsx",
  "src/app/student/public-library/page.tsx",
  "src/app/student/work/[id]/page.tsx",
  "src/app/student/work/page.tsx",
];

assert(
  JSON.stringify(studentPageFiles) === JSON.stringify(expectedStudentPageFiles),
  "Student route manifest smoke must be updated when a signed-in Student page is added or removed",
);
assert(
  manifest.student_page_routes.length === expectedStudentPageFiles.length,
  "Student route manifest must cover every concrete Student page route",
);
for (const file of expectedStudentPageFiles) {
  const source = await read(file);
  assert(source.includes("requireStudent("), `${file} must enforce the active Student server guard`);
}
console.log("PASS Student page manifest covers all current signed-in Student pages with server guards");

const practiceApiFiles = (await listFiles("src/app/api/practice"))
  .filter((file) => file.endsWith("/route.ts"))
  .sort();
const expectedPracticeApiFiles = [
  "src/app/api/practice/assignments/start/route.ts",
  "src/app/api/practice/course-frameworks/route.ts",
  "src/app/api/practice/grade/route.ts",
  "src/app/api/practice/hint/route.ts",
  "src/app/api/practice/preferences/merge/run/route.ts",
  "src/app/api/practice/preferences/route.ts",
  "src/app/api/practice/recommend/route.ts",
  "src/app/api/practice/review/route.ts",
  "src/app/api/practice/rounds/custom/route.ts",
  "src/app/api/practice/sessions/[sessionId]/route.ts",
  "src/app/api/practice/sessions/route.ts",
  "src/app/api/practice/sessions/title/route.ts",
  "src/app/api/practice/wrong-questions/route.ts",
];
assert(
  JSON.stringify(practiceApiFiles) === JSON.stringify(expectedPracticeApiFiles),
  "Student shared Practice API inventory must be updated when a route is added or removed",
);
for (const file of expectedPracticeApiFiles) {
  const source = await read(file);
  assert(source.includes("requirePracticeApiUser("), `${file} must authenticate before Practice work`);
}
console.log("PASS every shared Practice API repeats authenticated-user authorization");

const [assignmentLinkage, assignmentMigration, practiceEvidenceMigration, practiceIsolationMigration, practiceFrameworkIsolationMigration, feedbackMigration, assetRoute] =
  await Promise.all([
    read("src/lib/practice/assignment-linkage.ts"),
    read("supabase/clean-migrations/0028_assignment_from_bank_questions.sql"),
    read("supabase/clean-migrations/0008_practice_agent_evidence.sql"),
    read("supabase/clean-migrations/0047_practice_self_study_evidence_isolation.sql"),
    read("supabase/clean-migrations/0048_practice_course_framework_evidence_isolation.sql"),
    read("supabase/clean-migrations/0032_teacher_feedback_notes.sql"),
    read("src/app/api/question-assets/[assetId]/route.ts"),
  ]);

assert(
  assignmentLinkage.includes("assertStudentProfile") &&
    assignmentLinkage.includes("Assignment practice is available only to active students.") &&
    assignmentLinkage.includes(".eq(\"status\", \"assigned\")") &&
    assignmentLinkage.includes("assignment_practice_sessions") &&
    assignmentLinkage.includes("student_assignment_progress"),
  "assignment Practice must be student-gated, assignment-scoped, and persist linked evidence",
);
assert(
  assignmentMigration.includes("private.can_read_assignment_question") &&
    assignmentMigration.includes("assignment.status = 'assigned'") &&
    assignmentMigration.includes("member.role = 'student'") &&
    assignmentMigration.includes("member.status = 'active'") &&
    !assignmentLinkage.includes('from("bank_members").insert'),
  "assignment entitlement must require active student membership without granting Bank membership",
);
console.log("PASS assignment Practice remains active-membership and selected-item scoped, not Bank-member scoped");

assert(
  feedbackMigration.includes("student_id = auth.uid()") &&
    feedbackMigration.includes("visibility = 'sent_to_student'") &&
    feedbackMigration.includes("status = 'sent'") &&
    feedbackMigration.includes("member.status = 'active'"),
  "Student feedback policy must expose only explicitly sent notes for active assigned membership",
);
console.log("PASS feedback policy keeps private teacher notes outside Student reads");

assert(
  /supabase\.rpc\(\s*"can_read_question_asset"/.test(assetRoute) &&
    !assetRoute.includes("p_question_id") &&
    assetRoute.includes("createSignedUrl") &&
    assetRoute.indexOf("can_read_question_asset") < assetRoute.indexOf('.from("question_assets")') &&
    assetRoute.indexOf('.from("question_assets")') < assetRoute.indexOf("createSignedUrl") &&
    assetRoute.includes("Cache-Control\": \"private, no-store"),
  "question assets must authorize through the requester-first asset wrapper before reading metadata or creating a no-store signed redirect",
);
const clientPaths = ["src/app/student", "src/components/student", "src/components/practice", "src/lib/practice"];
for (const path of clientPaths) {
  for (const file of (await listFiles(path)).filter((entry) => /\.(ts|tsx)$/.test(entry))) {
    const source = await read(file);
    assert(
      !source.includes("createServiceRoleClient") &&
        !source.includes("SUPABASE_SERVICE_ROLE_KEY") &&
        !source.includes("AI_PROVIDER_GATEWAY_TOKEN"),
      `${file} must not import a service-role or gateway credential path into Student-visible code`,
    );
    assert(!source.includes(".getPublicUrl("), `${file} must not create public question-asset URLs`);
  }
}
console.log("PASS Student-visible code uses protected question assets and has no service-role/provider credential import");

const studentSource = await Promise.all(
  (await listFiles("src/app/student")).filter((file) => /\.(ts|tsx)$/.test(file)).map(read),
);
assert(
  !studentSource.some((source) =>
    /create_question_bank|bank_members|review_draft_items|question_blueprints|approve_bank_review_question/.test(source),
  ),
  "Student workspace must not render Bank management, Review Draft, or Blueprint management controls",
);
assert(
    practiceEvidenceMigration.includes("private.is_org_staff(organization_id)") &&
    practiceIsolationMigration.includes("private.can_read_practice_session_evidence") &&
    !practiceIsolationMigration.includes("private.is_org_staff(organization_id)") &&
    practiceFrameworkIsolationMigration.includes("drop policy if exists practice_sessions_teacher_select_course") &&
    practiceFrameworkIsolationMigration.includes("drop policy if exists practice_agent_episodes_teacher_select_course") &&
    manifest.findings.some(
      (finding) =>
        finding.id === "P1_SELF_STUDY_ORG_STAFF" &&
        finding.status === "COMPLETED / CLEAN-DB LIVE VALIDATED",
    ),
  "canonical self-study exposure must retain completed assignment and course-framework boundary validation evidence",
);
console.log("PASS Student source has no Bank/Review/Blueprint management surface and records the P1 self-study remediation state");

for (const file of [
  "scripts/student-my-work-smoke.mjs",
  "scripts/assignment-practice-evidence-smoke.mjs",
  "scripts/assignment-from-bank-smoke.mjs",
  "scripts/route-smoke.mjs",
]) {
  const source = await read(file);
  assert(!source.includes("dotenv") && !source.includes(".env.local"), `${file} must use process-only environment input`);
}
console.log("PASS Student live-smoke scripts require process-only environment input");
