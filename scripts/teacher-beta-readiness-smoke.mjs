import { access, readFile } from "node:fs/promises";
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

async function exists(relativePath) {
  try {
    await access(resolve(root, relativePath));
    return true;
  } catch {
    return false;
  }
}

const teacherRouteFiles = [
  "src/app/teacher/page.tsx",
  "src/app/teacher/banks/page.tsx",
  "src/app/teacher/banks/[bankId]/page.tsx",
  "src/app/teacher/banks/[bankId]/imports/page.tsx",
  "src/app/teacher/banks/[bankId]/review/page.tsx",
  "src/app/teacher/banks/[bankId]/questions/page.tsx",
  "src/app/teacher/banks/[bankId]/blueprints/page.tsx",
  "src/app/teacher/blueprints/page.tsx",
  "src/app/teacher/blueprints/new/page.tsx",
  "src/app/teacher/blueprints/[blueprintId]/page.tsx",
  "src/app/teacher/publish/page.tsx",
  "src/app/teacher/classrooms/page.tsx",
  "src/app/teacher/classrooms/[id]/page.tsx",
  "src/app/teacher/classrooms/[id]/assignments/page.tsx",
  "src/app/teacher/classrooms/[id]/assignments/[assignmentId]/page.tsx",
  "src/app/teacher/classrooms/[id]/students/page.tsx",
  "src/app/teacher/classrooms/[id]/teachers/page.tsx",
  "src/app/teacher/classrooms/[id]/analytics/page.tsx",
  "src/app/teacher/classrooms/[id]/settings/page.tsx",
  "src/app/teacher/progress/page.tsx",
];

for (const routeFile of teacherRouteFiles) {
  assert(await exists(routeFile), `teacher beta route is missing: ${routeFile}`);
}
console.log("PASS teacher beta route inventory is present");

const [
  nav,
  teacherHome,
  bankUi,
  bankDetail,
  bankImports,
  bankReview,
  bankActions,
  bankPdfBurstActions,
  blueprintDetail,
  blueprintActions,
  publishPage,
  publishActions,
  classroomActions,
  classroomOverview,
  classroomAnalytics,
  progressPage,
  feedbackActions,
  feedbackHelper,
  studentWorkDetail,
  actionFeedback,
  smokeAll,
] = await Promise.all([
  Promise.all([
    read("src/components/app-primary-nav.tsx"),
    read("src/components/teacher/teacher-workspace-nav.tsx"),
  ]).then((parts) => parts.join("\n")),
  read("src/app/teacher/page.tsx"),
  read("src/app/teacher/banks/bank-ui.tsx"),
  read("src/app/teacher/banks/[bankId]/page.tsx"),
  read("src/app/teacher/banks/[bankId]/imports/page.tsx"),
  read("src/app/teacher/banks/[bankId]/review/page.tsx"),
  read("src/app/teacher/banks/actions.ts"),
  read("src/app/teacher/banks/pdf-burst-actions.ts"),
  read("src/app/teacher/blueprints/[blueprintId]/page.tsx"),
  read("src/app/teacher/blueprints/actions.ts"),
  read("src/app/teacher/publish/page.tsx"),
  read("src/app/teacher/publish/actions.ts"),
  read("src/app/teacher/classrooms/actions.ts"),
  read("src/app/teacher/classrooms/[id]/page.tsx"),
  read("src/app/teacher/classrooms/[id]/analytics/page.tsx"),
  read("src/app/teacher/progress/page.tsx"),
  read("src/app/teacher/classrooms/[id]/assignments/[assignmentId]/feedback-actions.ts"),
  read("src/lib/teacher-feedback-notes.ts"),
  read("src/app/student/work/[id]/page.tsx"),
  read("src/lib/actions/feedback.ts"),
  read("scripts/smoke-all.mjs"),
]);

assert(
  nav.includes('"use client"') &&
    nav.includes("usePathname") &&
    nav.includes('aria-current={selected ? "page" : undefined}') &&
    nav.includes('pathname.startsWith(`${item.href}/`)'),
  "teacher navigation must expose a reliable active-route state",
);
assert(
  [
    "Home",
    "My Libraries",
    "Public Library",
    "Blueprints",
    "Classrooms",
    "Assignments",
    "Progress",
  ].every((label) => nav.includes(label)),
  "teacher navigation must keep every major workflow visible",
);
assert(
  teacherHome.includes("Next action") &&
    teacherHome.includes("Libraries") &&
    teacherHome.includes("Progress") &&
    teacherHome.includes("getTeacherHomeSummary") &&
    teacherHome.includes("/teacher/publish"),
  "teacher dashboard must keep the next Library action and three handoffs discoverable",
);
console.log("PASS teacher navigation and dashboard handoffs are discoverable");

assert(
  bankUi.includes("AI drafts stay private until reviewed") &&
    bankDetail.includes("Next action") &&
    bankDetail.includes('label: "Ready"') &&
    bankImports.includes("TeacherPdfBurstUpload") &&
    bankImports.includes("Review is required before assignment") &&
    bankReview.includes("Approve current page") &&
    bankReview.includes("LazyTeacherQuestionPreview") &&
    bankActions.includes("approveBankReviewQuestion") &&
    bankActions.includes("markBankReviewDraftNeedsFix") &&
    bankActions.includes("rejectBankReviewDraftQuestion"),
  "bank import and review must remain private, actionable, and review-gated",
);
assert(
  bankPdfBurstActions.includes("requireManagedBank") &&
    bankPdfBurstActions.includes("reserve_ai_pdf_upload_burst") &&
    bankPdfBurstActions.includes("releaseAIPdfBurstAdmissionJobs") &&
    !bankPdfBurstActions.includes('status: "published"'),
  "bank import must preserve target scope and no-publish guarantees",
);
assert(
  blueprintDetail.includes("Queue private Review Drafts") &&
    blueprintDetail.includes("Nothing is published or assigned until reviewed") &&
    blueprintActions.includes("generateTeacherBlueprintReviewDraftsAction") &&
    blueprintActions.includes("enqueueAIProviderJob") &&
    blueprintActions.includes("buildBlueprintGenerationJobIdempotencyKey"),
  "Blueprint output must remain Review Draft gated with safe failure recovery",
);
assert(
  publishPage.includes("Library") &&
    publishPage.includes("AssignmentComposerFlow") &&
    publishPage.includes("LazyTeacherQuestionPreview") &&
    publishActions.includes("Only Library owners and editors can create assignments") &&
    publishActions.includes('.eq("status", "active")'),
  "Publish Center must use approved bank content and active classroom targets only",
);
console.log("PASS teacher content handoffs preserve bank scope and review gates");

assert(
  classroomActions.includes("archiveClassroom") &&
    classroomActions.includes("reopenClassroom") &&
    classroomActions.includes("addClassroomCoTeacher") &&
    classroomActions.includes("removeClassroomCoTeacher") &&
    classroomActions.includes("removeClassroomStudent") &&
    !classroomActions.includes("bank_members"),
  "classroom operations must preserve roster-only membership and bank separation",
);
assert(
  classroomAnalytics.includes("assignment detail already supports") &&
    classroomAnalytics.includes("Assignment feedback") &&
    !classroomAnalytics.includes("Teacher feedback drafting is a later workflow") &&
    classroomOverview.includes("available from assignment detail") &&
    !classroomOverview.includes("feedback drafting are planned") &&
    progressPage.includes("Needs attention") &&
    progressPage.includes("Private self-study") &&
    !progressPage.includes("Teacher feedback notes are coming later"),
  "Progress and Classroom Analytics must accurately point teachers to live feedback",
);
assert(
  feedbackActions.includes("sendTeacherFeedbackNote") &&
    feedbackActions.includes("savePrivateTeacherFeedbackNote") &&
    feedbackHelper.includes('"sent_to_student"') &&
    feedbackHelper.includes('"sent"') &&
    studentWorkDetail.includes("Teacher feedback"),
  "teacher feedback must remain assignment-scoped and student-visible only when sent",
);
console.log("PASS classroom, evidence, and feedback boundaries are present");

assert(
  actionFeedback.includes("INTERNAL_ACTION_ERROR_PATTERN") &&
    actionFeedback.includes("Your changes were not saved") &&
    !actionFeedback.includes("return error.message;"),
  "teacher action errors must not expose raw database or network details",
);
const teacherRuntime = [nav, teacherHome, bankDetail, bankImports, bankReview, blueprintDetail, publishPage]
  .join("\n");
assert(
  !teacherRuntime.includes("api_key") &&
    !teacherRuntime.includes("apiKey") &&
    !teacherRuntime.includes("service_role") &&
    !teacherRuntime.includes("/admin/ai-settings"),
  "teacher UI must not expose provider configuration or admin-only settings",
);
assert(
  !teacherRuntime.includes("C:\\Users\\") &&
    !teacherRuntime.includes("legacy-supabase"),
  "teacher runtime must not contain local user paths or legacy Supabase routes",
);
console.log("PASS teacher errors, provider boundaries, and runtime paths are safe");

const requiredFixtureSmokes = [
  "question-bank-foundation-smoke.mjs",
  "bank-import-review-smoke.mjs",
  "ai-parsing-status-review-qa-smoke.mjs",
  "ai-pdf-provider-failure-status-smoke.mjs",
  "blueprint-library-foundation-smoke.mjs",
  "blueprint-builder-core-smoke.mjs",
  "blueprint-to-review-drafts-generation-smoke.mjs",
  "publish-center-v2-smoke.mjs",
  "classroom-operations-smoke.mjs",
  "assignment-from-bank-smoke.mjs",
  "assignment-practice-evidence-smoke.mjs",
  "teacher-progress-evidence-foundation-smoke.mjs",
  "teacher-assignment-attempt-drilldown-smoke.mjs",
  "teacher-feedback-notes-mvp-smoke.mjs",
];
assert(
  requiredFixtureSmokes.every((script) => smokeAll.includes(`./${script}`)),
  "aggregate smoke must retain the existing live teacher workflow fixtures",
);
console.log("PASS teacher beta live-fixture coverage remains registered in aggregate smoke");
