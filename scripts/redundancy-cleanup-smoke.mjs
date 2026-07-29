import { readFile } from "node:fs/promises";

async function read(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

function assert(condition, message) {
  if (!condition) throw new Error(`FAIL ${message}`);
  console.log(`PASS ${message}`);
}

const [
  middleware,
  roles,
  practiceHelpers,
  adminCard,
  teacherShell,
  classroomUi,
  blueprintUi,
  bankImportUi,
  questionActions,
  videoActions,
  bankActions,
  knipConfig,
] = await Promise.all([
  read("src/lib/supabase/middleware.ts"),
  read("src/lib/auth/roles.ts"),
  read("src/lib/practice/client-helpers.ts"),
  read("src/components/admin/admin-card.tsx"),
  read("src/components/teacher/teacher-workspace-shell.tsx"),
  read("src/app/teacher/classrooms/classroom-ui.tsx"),
  read("src/app/teacher/blueprints/blueprint-library-ui.tsx"),
  read("src/app/teacher/banks/bank-import-ui.tsx"),
  read("src/app/admin/questions/actions.ts"),
  read("src/app/admin/videos/actions.ts"),
  read("src/app/teacher/banks/actions.ts"),
  read("knip.json"),
]);

assert(
  middleware.includes("canAccessAdmin(role)") &&
    middleware.includes("canAccessTeacher(role)") &&
    middleware.includes("canAccessStudent(role)") &&
    middleware.includes("canManageUsers(role)") &&
    !middleware.includes("const ADMIN_ROLES") &&
    !roles.includes("export const ADMIN_ROLES"),
  "middleware and RSC guards share one role-policy implementation",
);

assert(
  !practiceHelpers.includes("isReusableEmptyPracticeSession") &&
    !practiceHelpers.includes("export function practiceSourceQuestionId") &&
    !practiceHelpers.includes("export function formatDuration"),
  "Practice helpers contain no obsolete empty-session or unused public helpers",
);

assert(
  !adminCard.includes("AdminSectionCard") &&
    !teacherShell.includes("TeacherComingSoonPanel") &&
    !classroomUi.includes("ClassroomSectionHeader") &&
    !blueprintUi.includes("DisabledBlueprintActions"),
  "unused component aliases and superseded placeholder panels are removed",
);

assert(
  !bankImportUi.includes("BankTargetSelector") &&
    !bankImportUi.includes("TeacherImportSafetyCallout") &&
    !bankImportUi.includes("BankImportEntryPanel") &&
    bankImportUi.includes("RecentBankImportsPanel"),
  "legacy teacher import shells are removed while the active status panel remains",
);

assert(
  !questionActions.includes("updateQuestionStatus") &&
    !videoActions.includes("updateVideoStatus") &&
    !bankActions.includes("export async function importBankJsonDrafts(formData"),
  "superseded server actions are removed instead of retaining duplicate write paths",
);

const knip = JSON.parse(knipConfig);
assert(
  knip.entry.includes("scripts/**/*.mjs") &&
    knip.ignoreBinaries.includes("taskkill"),
  "dead-code auditing treats executable smoke scripts and Windows taskkill as intentional entrypoints",
);
