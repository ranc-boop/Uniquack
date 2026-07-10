import { dirname, resolve } from "node:path";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: resolve(__dirname, "..", ".env.local") });

const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? process.env.SITE_URL ?? "http://localhost:3000";
const root = resolve(__dirname, "..");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function checkRoute(path, expectedText) {
  const response = await fetch(new URL(path, baseUrl));
  assert(response.status < 500, `${path} returned ${response.status}`);
  const text = await response.text();
  if (expectedText) {
    assert(text.includes(expectedText), `${path} did not include expected text: ${expectedText}`);
  }
  console.log(`PASS ${path} route smoke`);
}

async function checkAdminRoute(path, expectedText) {
  const response = await fetch(new URL(path, baseUrl), { redirect: "manual" });
  assert(response.status < 500, `${path} returned ${response.status}`);

  const location = response.headers.get("location") ?? "";
  if (response.status >= 300 && response.status < 400) {
    assert(
      location.startsWith("/auth/login") || location.includes("/auth/login"),
      `${path} redirected to unexpected location: ${location}`,
    );
    console.log(`PASS ${path} route smoke auth redirect`);
    return;
  }

  const text = await response.text();
  assert(text.includes(expectedText), `${path} did not include expected text: ${expectedText}`);
  console.log(`PASS ${path} route smoke`);
}

async function read(relativePath) {
  return readFile(resolve(root, relativePath), "utf8");
}

await checkRoute("/questions", "Question Bank");
await checkRoute("/videos", "Videos");
await checkAdminRoute("/admin", "Dashboard");
await checkAdminRoute("/admin/questions", "Questions");
await checkAdminRoute("/admin/review", "Review Drafts");
await checkAdminRoute("/admin/imports", "Manual JSON Import");
await checkAdminRoute("/admin/imports/pdf", "AI PDF Import");
await checkAdminRoute("/admin/imports/assets", "Bulk asset upload");
await checkAdminRoute("/admin/imports/package", "Package Import");
await checkAdminRoute("/admin/tags", "Taxonomy");
await checkAdminRoute("/admin/blueprints", "Question Blueprint Workspace");
await checkAdminRoute("/admin/blueprints/review", "Blueprint Review Queue");
await checkAdminRoute("/admin/blueprints/library", "Approved Blueprint Library");
await checkAdminRoute("/admin/blueprints/history", "History / Archive / Trash");
await checkAdminRoute("/admin/blueprints/sources", "Blueprint Import Sources");
await checkAdminRoute("/teacher/banks", "Question Bank Library");
await checkAdminRoute("/teacher", "Teacher Workspace");
await checkAdminRoute("/teacher/banks/new", "Start a teacher-owned content library");
await checkAdminRoute("/teacher/banks/join", "Join a shared Question Bank");
await checkAdminRoute("/teacher/ai-parsing", "AI Parsing");
await checkAdminRoute("/teacher/blueprints", "Blueprint Library");
await checkAdminRoute("/teacher/blueprints/new", "Create Blueprint");
await checkAdminRoute("/teacher/classrooms", "Classrooms");
await checkAdminRoute("/teacher/publish", "Publish");
await checkAdminRoute("/teacher/progress", "Progress");
await checkAdminRoute("/teacher/course-builder", "Course Builder");
await checkAdminRoute("/student", "Student Dashboard");
await checkAdminRoute("/student/work", "My Work");
await checkAdminRoute("/student/library", "Study Library");
await checkAdminRoute("/student/groups", "Study Groups");
await checkAdminRoute("/student/public-library", "Public Library");
await checkAdminRoute("/student/progress", "Progress / Feedback");
await checkAdminRoute("/student/classrooms", "My classes");
await checkAdminRoute("/student/classrooms/join", "Enter your class code");
const blueprintPage = await read("src/app/admin/blueprints/page.tsx");
const blueprintWorkspace = await read("src/components/blueprints/blueprint-workspace.tsx");
const blueprintActions = await read("src/app/admin/blueprints/actions.ts");
const aiPdfDashboard = await read("src/components/ai-pdf-dashboard/ai-pdf-control-dashboard.tsx");
const aiPdfPanel = await read("src/components/ai-pdf-import-panel.tsx");
const aiPdfImportLoading = await read("src/app/admin/imports/pdf/loading.tsx");
const aiPdfImportLoadingSkeleton = await read("src/components/ai-pdf-import-loading-skeleton.tsx");
const adminActionGroup = await read("src/components/admin/admin-action-group.tsx");
const adminCard = await read("src/components/admin/admin-card.tsx");
const adminDangerZone = await read("src/components/admin/admin-danger-zone.tsx");
const adminDebugDisclosure = await read("src/components/admin/admin-debug-disclosure.tsx");
const adminEmptyState = await read("src/components/admin/admin-empty-state.tsx");
const adminInfoTip = await read("src/components/admin/admin-info-tip.tsx");
const adminLayout = await read("src/app/admin/layout.tsx");
const adminLoadingState = await read("src/components/admin/admin-loading-state.tsx");
const adminPage = await read("src/app/admin/page.tsx");
const adminImportsPage = await read("src/app/admin/imports/page.tsx");
const adminImportsPdfPage = await read("src/app/admin/imports/pdf/page.tsx");
const adminImportsPackagePage = await read("src/app/admin/imports/package/page.tsx");
const adminSidebar = await read("src/components/admin/admin-sidebar.tsx");
const adminPageHeader = await read("src/components/admin/admin-page-header.tsx");
const adminStatusBadge = await read("src/components/admin/admin-status-badge.tsx");
const adminQuestionsPage = await read("src/app/admin/questions/page.tsx");
const adminQuestionsLoading = await read("src/app/admin/questions/loading.tsx");
const publicQuestionsPage = await read("src/app/questions/page.tsx");
const publicQuestionsLoading = await read("src/app/questions/loading.tsx");
const adminReviewPage = await read("src/app/admin/review/page.tsx");
const adminReviewLoading = await read("src/app/admin/review/loading.tsx");
const draftReviewCard = await read("src/components/draft-review-card.tsx");
const blueprintLoading = await read("src/components/blueprints/blueprint-list-skeleton.tsx");
const bulkAssetsPage = await read("src/app/admin/imports/assets/page.tsx");
const bulkAssetPanel = await read("src/components/bulk-asset-upload-panel.tsx");
const packageImportPanel = await read("src/components/package-import-panel.tsx");
const videosPage = await read("src/app/videos/page.tsx");
const authActions = await read("src/app/auth/actions.ts");
const authGuards = await read("src/lib/auth/guards.ts");
const authNav = await read("src/components/auth-nav.tsx");
const teacherHomePage = await read("src/app/teacher/page.tsx");
const teacherDashboardHelper = await read("src/lib/teacher-dashboard.ts");
const teacherDashboardPanels = await read("src/components/teacher/teacher-dashboard-panels.tsx");
const teacherWorkspaceNav = await read("src/components/teacher/teacher-workspace-nav.tsx");
const teacherAiParsingPage = await read("src/app/teacher/ai-parsing/page.tsx");
const teacherBanksPage = await read("src/app/teacher/banks/page.tsx");
const teacherBankNewPage = await read("src/app/teacher/banks/new/page.tsx");
const teacherBankJoinPage = await read("src/app/teacher/banks/join/page.tsx");
const teacherBankDetailPage = await read("src/app/teacher/banks/[bankId]/page.tsx");
const teacherBankImportsPage = await read("src/app/teacher/banks/[bankId]/imports/page.tsx");
const teacherBankImportUi = await read("src/app/teacher/banks/bank-import-ui.tsx");
const teacherBankReviewPage = await read("src/app/teacher/banks/[bankId]/review/page.tsx");
const teacherBankQuestionsPage = await read("src/app/teacher/banks/[bankId]/questions/page.tsx");
const teacherBankMembersPage = await read("src/app/teacher/banks/[bankId]/members/page.tsx");
const teacherBankAssignmentNewPage = await read("src/app/teacher/banks/[bankId]/assignments/new/page.tsx");
const teacherPublishPage = await read("src/app/teacher/publish/page.tsx");
const teacherPublishActions = await read("src/app/teacher/publish/actions.ts");
const teacherBlueprintPage = await read("src/app/teacher/blueprints/page.tsx");
const teacherBlueprintNewPage = await read("src/app/teacher/blueprints/new/page.tsx");
const teacherBlueprintDetailPage = await read("src/app/teacher/blueprints/[blueprintId]/page.tsx");
const teacherBankBlueprintsPage = await read("src/app/teacher/banks/[bankId]/blueprints/page.tsx");
const blueprintLibraryMigration = await read("supabase/clean-migrations/0031_blueprint_library_foundation.sql");
const teacherBankActions = await read("src/app/teacher/banks/actions.ts");
const bankImportReviewMigration = await read("supabase/clean-migrations/0027_bank_import_review_scope.sql");
const assignmentFromBankMigration = await read("supabase/clean-migrations/0028_assignment_from_bank_questions.sql");
const teacherClassroomsPage = await read("src/app/teacher/classrooms/page.tsx");
const teacherClassroomDetailPage = await read("src/app/teacher/classrooms/[id]/page.tsx");
const teacherClassroomUi = await read("src/app/teacher/classrooms/classroom-ui.tsx");
const teacherClassroomPeoplePage = await read("src/app/teacher/classrooms/[id]/people/page.tsx");
const teacherAssignmentsPage = await read("src/app/teacher/classrooms/[id]/assignments/page.tsx");
const teacherClassroomAnalyticsPage = await read("src/app/teacher/classrooms/[id]/analytics/page.tsx");
const teacherClassroomBlueprintsPage = await read("src/app/teacher/classrooms/[id]/blueprints/page.tsx");
const teacherClassroomSettingsPage = await read("src/app/teacher/classrooms/[id]/settings/page.tsx");
const teacherAssignmentNewPage = await read("src/app/teacher/classrooms/[id]/assignments/new/page.tsx");
const teacherAssignmentDetailPage = await read("src/app/teacher/classrooms/[id]/assignments/[assignmentId]/page.tsx");
const assignmentSelectionSummary = await read("src/components/teacher/assignment-selection-summary.tsx");
const courseBuilderBridgePage = await read("src/app/teacher/course-builder/page.tsx");
const courseBuilderBridgeActions = await read("src/app/teacher/course-builder/actions.ts");
const courseBuilderBridgeHelper = await read("src/lib/course-builder/assignment-bridge.ts");
const courseBuilderBridgeMigration = await read("supabase/clean-migrations/0024_assignment_source_metadata.sql");
const studentHomePage = await read("src/app/student/page.tsx");
const studentLayout = await read("src/app/student/layout.tsx");
const studentWorkspaceNav = await read("src/components/student/student-workspace-nav.tsx");
const studentWorkspaceShell = await read("src/components/student/student-workspace-shell.tsx");
const studentWorkPage = await read("src/app/student/work/page.tsx");
const studentWorkDetailPage = await read("src/app/student/work/[id]/page.tsx");
const studentStudyLibraryPage = await read("src/app/student/library/page.tsx");
const studentStudyGroupsPage = await read("src/app/student/groups/page.tsx");
const studentPublicLibraryPage = await read("src/app/student/public-library/page.tsx");
const studentProgressPage = await read("src/app/student/progress/page.tsx");
const practicePage = await read("src/app/practice/page.tsx");
const practiceLoader = await read("src/components/practice/practice-agent-loader.tsx");
const practiceClient = await read("src/components/practice/practice-agent-client.tsx");
const assignmentPracticeStartRoute = await read("src/app/api/practice/assignments/start/route.ts");
const studentClassroomsPage = await read("src/app/student/classrooms/page.tsx");
const studentJoinClassroomPage = await read("src/app/student/classrooms/join/page.tsx");
const classroomMigration = await read("supabase/clean-migrations/0018_classroom_foundation.sql");
const studentWorkMigration = await read("supabase/clean-migrations/0021_student_work_assignments.sql");
assert(
    teacherHomePage.includes("Teacher Workspace") &&
    teacherHomePage.includes("Start with a Question Bank") &&
    teacherHomePage.includes("review imported content") &&
    teacherHomePage.includes("Bank-first teacher workflow") &&
    teacherHomePage.includes("Student visibility stays assignment-only") &&
    teacherHomePage.includes("No unreviewed draft can be assigned to students") &&
    teacherHomePage.includes("getTeacherDashboardSummary") &&
    teacherHomePage.includes("TeacherDashboardOverviewCards") &&
    teacherDashboardHelper.includes("assignment_practice_sessions") &&
    teacherDashboardHelper.includes("student_assignment_progress") &&
    teacherDashboardHelper.includes("practice_attempts") &&
    teacherDashboardHelper.includes(".limit(") &&
    !teacherDashboardHelper.includes('.select("*")') &&
    !teacherDashboardHelper.includes(".insert(") &&
    !teacherDashboardHelper.includes(".update(") &&
    !teacherDashboardHelper.includes(".delete(") &&
    teacherDashboardPanels.includes("Recent Practice evidence") &&
    teacherDashboardPanels.includes("Student self-study is not mixed in") &&
    teacherWorkspaceNav.includes("Dashboard") &&
    teacherWorkspaceNav.includes("Question Bank") &&
    teacherWorkspaceNav.includes("AI Parsing") &&
    teacherWorkspaceNav.includes("Blueprint") &&
    teacherWorkspaceNav.includes("Classroom") &&
    teacherWorkspaceNav.includes("Publish") &&
    teacherWorkspaceNav.includes("Progress") &&
    !teacherWorkspaceNav.includes("/admin/imports/pdf") &&
    !teacherWorkspaceNav.includes("/admin/review") &&
    teacherAiParsingPage.includes("Choose a Question Bank before importing. AI drafts stay private until reviewed.") &&
    teacherAiParsingPage.includes("BankTargetSelector") &&
    teacherAiParsingPage.includes("Import into selected bank") &&
    teacherAiParsingPage.includes("listTeacherQuestionBanks") &&
    !teacherAiParsingPage.includes("/admin/imports/pdf") &&
    !teacherAiParsingPage.includes("/admin/review") &&
    teacherBanksPage.includes("Question Bank Library") &&
    teacherBanksPage.includes("Join Bank by Code") &&
    teacherBanksPage.includes("Assignment Ready") &&
    teacherBanksPage.includes("Create Question Bank") &&
    teacherBankNewPage.includes("action={createQuestionBank}") &&
    teacherBankDetailPage.includes("No reviewed questions in this bank yet") &&
    teacherBankDetailPage.includes("Question Bank operating surface") &&
    teacherBankDetailPage.includes("BankRouteTabs") &&
    teacherBankDetailPage.includes("Import Material") &&
    teacherBankDetailPage.includes("Publish from bank") &&
    teacherBankDetailPage.includes("Assignments expose selected") &&
    teacherBankDetailPage.includes("Review Drafts") &&
    teacherBankImportsPage.includes("BankImportEntryPanel") &&
    teacherBankImportUi.includes("Import into selected bank") &&
    teacherBankImportsPage.includes("Advanced / Developer fixture") &&
    teacherBankImportsPage.includes("Developer fixture for smoke testing. Normal teachers should") &&
    teacherBankImportsPage.includes("Create bank Review Drafts") &&
    !teacherBankImportsPage.includes("/admin/imports/pdf") &&
    teacherBankImportsPage.includes("Drafts stay") &&
    teacherBankReviewPage.includes("Approve drafts into this bank") &&
    teacherBankReviewPage.includes("Approve into bank") &&
    teacherBankReviewPage.includes("not globally published") &&
    teacherBankQuestionsPage.includes("Question database") &&
    teacherBankQuestionsPage.includes("Taxonomy / knowledge point") &&
    teacherBankQuestionsPage.includes("not public/global questions") &&
    teacherBankQuestionsPage.includes("Assignment ready") &&
    teacherBankDetailPage.includes("Manage members and share codes") &&
    teacherBankActions.includes('rpc("create_question_bank"') &&
    teacherBankActions.includes('rpc("create_bank_share_code"') &&
    teacherBankActions.includes('rpc("join_question_bank_by_code"') &&
    teacherBankActions.includes('rpc("update_bank_member_role"') &&
    teacherBankActions.includes('rpc("remove_bank_member"') &&
    teacherBankActions.includes('rpc("approve_bank_review_question"') &&
    teacherBankActions.includes("create_assignment_from_bank") &&
    teacherPublishPage.includes("Publish distributes selected approved bank content to classes") &&
    teacherPublishPage.includes("Choose the content owner") &&
    teacherPublishPage.includes("Select approved assignment-ready rows") &&
    teacherPublishPage.includes("Choose classroom delivery") &&
    teacherPublishPage.includes("Assignment-only. No full source bank access.") &&
    teacherPublishPage.includes("Blueprint rows are not directly publishable") &&
    teacherPublishPage.includes("Package publishing is not assignment-ready yet.") &&
    teacherPublishPage.includes("No Review Draft bypass") &&
    teacherPublishActions.includes("publishQuestionBankAssignments") &&
    teacherPublishActions.includes("verifyPublishableSelection") &&
    teacherPublishActions.includes("buildPublishAssignmentSourceSummary") &&
    teacherPublishActions.includes("create_assignment_from_bank") &&
    teacherPublishActions.includes("selectedClassroomIds") &&
    !teacherPublishActions.includes("AI_PROVIDER") &&
    teacherBankAssignmentNewPage.includes("Question Bank assignment") &&
    teacherBankAssignmentNewPage.includes("Choose a class you manage") &&
    teacherBankAssignmentNewPage.includes("selected approved bank items") &&
    teacherBankAssignmentNewPage.includes("not access to the full bank") &&
    teacherBankAssignmentNewPage.includes("Assign to class") &&
    teacherBankAssignmentNewPage.includes("Save draft") &&
    teacherBlueprintPage.includes("Blueprint Library") &&
    teacherBlueprintPage.includes("Blueprints are reusable planning/package assets") &&
    teacherBlueprintPage.includes("Create Blueprint") &&
    teacherBlueprintPage.includes("New Folder") &&
    teacherBlueprintNewPage.includes("This form only creates the library asset") &&
    teacherBlueprintDetailPage.includes("BlueprintWorkflowPanel") &&
    teacherBankBlueprintsPage.includes("Blueprint links for") &&
    teacherBankBlueprintsPage.includes("Create Blueprint from this bank") &&
    blueprintLibraryMigration.includes("create table if not exists public.bank_blueprints") &&
    teacherBankActions.includes("importBatchImportJson") &&
    bankImportReviewMigration.includes("public.approve_bank_review_question") &&
    bankImportReviewMigration.includes("questions_bank_member_read") &&
    assignmentFromBankMigration.includes("public.create_assignment_from_bank") &&
    assignmentFromBankMigration.includes("questions_assignment_item_read") &&
    assignmentFromBankMigration.includes("'question_bank'") &&
    teacherBankJoinPage.includes("action={joinQuestionBankByCode}") &&
    teacherBankJoinPage.includes("Joining a bank is separate from") &&
    teacherBankMembersPage.includes("Owner-controlled sharing") &&
    teacherBankMembersPage.includes("Create share code") &&
    authActions.includes('redirect("/teacher")') &&
    authGuards.includes('redirect("/auth/login?next=/teacher")') &&
    authNav.includes("Teacher Workspace preview"),
  "teacher runtime must expose a bank-first teacher workspace and real bank foundation surfaces",
);
console.log("PASS teacher runtime exposes bank-first teacher workspace and bank foundation surfaces");
assert(
  teacherClassroomsPage.includes("Delivery layer") &&
    teacherClassroomsPage.includes("Classes are roster and delivery spaces") &&
    teacherClassroomsPage.includes("Your classes") &&
    teacherClassroomsPage.includes("Create Class") &&
    teacherClassroomUi.includes("Publish to classes") &&
    teacherClassroomDetailPage.includes("Students can join the roster") &&
    teacherClassroomDetailPage.includes("Active join code") &&
    teacherClassroomDetailPage.includes("Class delivery snapshot") &&
    teacherClassroomDetailPage.includes("Students needing attention") &&
    teacherClassroomDetailPage.includes("View assignments") &&
    teacherClassroomPeoplePage.includes("Joining a class does not grant access") &&
    teacherClassroomPeoplePage.includes("Remove from class") &&
    teacherAssignmentsPage.includes("Classroom assignments") &&
    teacherAssignmentsPage.includes("Publish new work") &&
    teacherAssignmentsPage.includes("Publish new bank work") &&
    teacherAssignmentsPage.includes("Assigned") &&
    teacherAssignmentsPage.includes("Assignment visibility") &&
    teacherAssignmentsPage.includes("global publishing") &&
    teacherAssignmentsPage.includes("Draft") &&
    teacherAssignmentsPage.includes("Archived") &&
    teacherAssignmentsPage.includes("Latest activity") &&
    teacherClassroomAnalyticsPage.includes("Analytics / Feedback") &&
    teacherClassroomAnalyticsPage.includes("Taxonomy mastery") &&
    teacherClassroomBlueprintsPage.includes("Blueprints linked to this class will appear here") &&
    teacherClassroomSettingsPage.includes("Archive and delete controls are not enabled") &&
    teacherAssignmentNewPage.includes("Published questions") &&
    teacherAssignmentNewPage.includes("workflow now starts from Question Banks") &&
    teacherAssignmentNewPage.includes("published-question compatibility") &&
    teacherAssignmentNewPage.includes("AssignmentSelectionSummary") &&
    assignmentSelectionSummary.includes("selectedCount") &&
    assignmentSelectionSummary.includes("inputName") &&
    assignmentSelectionSummary.includes("Choose at least one published question") &&
    teacherAssignmentNewPage.includes("Save draft keeps the assignment teacher-only") &&
    teacherAssignmentNewPage.includes("Assign to class") &&
    teacherAssignmentDetailPage.includes("Assignment items") &&
    teacherAssignmentDetailPage.includes("does not grant students") &&
    teacherAssignmentDetailPage.includes("full bank") &&
    teacherAssignmentDetailPage.includes("Assignment source") &&
    teacherAssignmentDetailPage.includes("Question Bank") &&
    teacherAssignmentDetailPage.includes("Student handoff") &&
    teacherAssignmentDetailPage.includes("Student progress") &&
    teacherAssignmentDetailPage.includes("One row per active classroom student") &&
    teacherAssignmentDetailPage.includes("Practice evidence") &&
    teacherAssignmentDetailPage.includes("Draft assignment is teacher-only") &&
    teacherAssignmentDetailPage.includes("Assigned work is visible in Student My Work") &&
    teacherAssignmentDetailPage.includes("/questions/") &&
    teacherAssignmentsPage.includes("Open progress") &&
    courseBuilderBridgePage.includes("Course Builder will generate bank packages before assignment") &&
    courseBuilderBridgePage.includes("does not add") &&
    courseBuilderBridgePage.includes("provider calls") &&
    courseBuilderBridgePage.includes("Save draft (teacher-only)") &&
    courseBuilderBridgePage.includes("Assign now (visible in My Work)") &&
    courseBuilderBridgePage.includes("Draft/unreviewed questions are unavailable for assignment") &&
    courseBuilderBridgeActions.includes("createAssignmentFromCourseBuilder") &&
    courseBuilderBridgeActions.includes("No published Question Bank questions are available") &&
    courseBuilderBridgeHelper.includes('.eq("status", "published")') &&
    courseBuilderBridgeMigration.includes("source_summary jsonb") &&
    studentHomePage.includes("Student Dashboard") &&
    studentHomePage.includes("My Work") &&
    studentHomePage.includes("Practice") &&
    studentHomePage.includes("Mistakes") &&
    studentHomePage.includes("Study Library") &&
    studentHomePage.includes("Study Groups") &&
    studentHomePage.includes("Public Library") &&
    studentHomePage.includes("Progress / Feedback") &&
    studentHomePage.includes("It does not open the teacher") &&
    studentLayout.includes("StudentWorkspaceNav") &&
    studentWorkspaceNav.includes("Dashboard") &&
    studentWorkspaceNav.includes("My Work") &&
    studentWorkspaceNav.includes("Practice") &&
    studentWorkspaceNav.includes("Mistakes") &&
    studentWorkspaceNav.includes("Study Library") &&
    studentWorkspaceNav.includes("Study Groups") &&
    studentWorkspaceNav.includes("Public Library") &&
    studentWorkspaceNav.includes("Progress / Feedback") &&
    studentWorkspaceShell.includes("StudentWorkspaceShell") &&
    studentWorkspaceShell.includes("StudentModuleCard") &&
    studentWorkPage.includes("My Work") &&
    studentWorkPage.includes("Due soon") &&
    studentWorkPage.includes("In progress") &&
    studentWorkPage.includes("Not started") &&
    studentWorkPage.includes("Completed") &&
    studentWorkPage.includes("No assigned work yet") &&
    studentWorkPage.includes("Start Practice") &&
    studentWorkPage.includes("Continue Practice") &&
    studentWorkPage.includes("Review work") &&
    studentWorkDetailPage.includes("Practice progress is saved back") &&
    studentWorkDetailPage.includes("Start Practice") &&
    studentWorkDetailPage.includes("Review Practice") &&
    studentWorkDetailPage.includes("Practice entry unavailable") &&
    studentWorkDetailPage.includes("Completed work history") &&
    studentWorkDetailPage.includes("full teacher") &&
    practicePage.includes("assignmentId") &&
    practiceLoader.includes("assignmentId") &&
    practiceLoader.includes("Loading assignment practice workspace") &&
    practiceClient.includes("/api/practice/assignments/start") &&
    practiceClient.includes("Assignment practice") &&
    assignmentPracticeStartRoute.includes("startAssignmentPractice") &&
    studentStudyLibraryPage.includes("Student-owned library foundation") &&
    studentStudyLibraryPage.includes("without creating a new backend") &&
    studentStudyGroupsPage.includes("peer self-study space") &&
    studentStudyGroupsPage.includes("do not grant access to teacher private banks") &&
    studentPublicLibraryPage.includes("Public does not mean verified") &&
    studentPublicLibraryPage.includes("Private stays private") &&
    studentProgressPage.includes("Progress / Feedback") &&
    studentProgressPage.includes("Feedback history") &&
    studentClassroomsPage.includes("Student workspace") &&
    studentClassroomsPage.includes("My classes") &&
    studentClassroomsPage.includes("Assigned work lives in My Work") &&
    studentClassroomsPage.includes("Active membership") &&
    studentJoinClassroomPage.includes("Join classroom") &&
    classroomMigration.includes("join_classroom_by_code") &&
    studentWorkMigration.includes("create table if not exists public.assignments"),
  "native classroom routes must expose teacher roster plus student join/list and My Work surfaces",
);
console.log("PASS native classroom and student My Work route sources expose teacher/student MVP surfaces");
assert(
  adminReviewPage.includes("REVIEW_PAGE_SIZE") &&
    adminReviewPage.includes(".range(pageFrom, pageTo)") &&
    !adminReviewPage.includes(".limit(1000)"),
  "admin review route must keep draft and related data page-sized",
);
assert(
  bulkAssetsPage.includes("BULK_ASSET_EXISTING_FILE_LIMIT") &&
    !bulkAssetsPage.includes(".limit(2000)"),
  "bulk asset import route must keep existing-file lookup bounded to the draft window",
);
assert(
  videosPage.includes("VIDEOS_PAGE_SIZE") &&
    videosPage.includes(".range(") &&
    !videosPage.includes(".limit(100);"),
  "videos route must use paged video loading instead of a fixed 100-row initial query",
);
console.log("PASS route data loading stays paged on review, assets, and videos");
assert(
  adminQuestionsPage.includes("ADMIN_QUESTION_PAGE_SIZE = 50") &&
    adminQuestionsPage.includes("ADMIN_QUESTION_SUMMARY_SELECT") &&
    adminQuestionsPage.includes("ADMIN_QUESTION_DETAIL_SELECT") &&
    adminQuestionsPage.includes("focusedQuestionId && orderedQuestionIds.length") &&
    !adminQuestionsPage.includes('select("*"'),
  "admin questions must use summary-first paged list loading and focused detail loading",
);
assert(
  publicQuestionsPage.includes("const pageSize = 25") &&
    publicQuestionsPage.includes("search_questions_by_taxonomy") &&
    publicQuestionsPage.includes("page_limit: pageSize") &&
    publicQuestionsPage.includes("id, question_code, title, content_html, difficulty_rating, status"),
  "public questions must keep bounded taxonomy RPC summary loading",
);
assert(
  blueprintWorkspace.includes("BLUEPRINT_REVIEW_PAGE_SIZE = 50") &&
    blueprintWorkspace.includes("BLUEPRINT_LIBRARY_PAGE_SIZE = 50") &&
    blueprintWorkspace.includes("BLUEPRINT_SOURCE_PAGE_SIZE = 25") &&
    blueprintWorkspace.includes("loadReviewActions") &&
    blueprintWorkspace.includes("loadBlueprintLibrary") &&
    blueprintWorkspace.includes("loadImportSources") &&
    blueprintWorkspace.includes("loadBlueprintDetailSummaries") &&
    blueprintWorkspace.includes(".in(\"blueprint_id\", loadedBlueprintIds)"),
  "blueprint workspace must keep route-scoped bounded data loading",
);
console.log("PASS question and blueprint data loading stays summary-first and route-scoped");
assert(
  adminLayout.includes("AdminShell") &&
    adminSidebar.includes("Primary") &&
    adminSidebar.includes("Advanced tools") &&
    adminSidebar.includes("Settings") &&
    adminSidebar.includes("Dashboard") &&
    adminSidebar.includes("Questions") &&
    adminSidebar.includes("Review Drafts") &&
    adminSidebar.includes("Blueprint Library") &&
    adminSidebar.includes("AI Parsing") &&
    adminSidebar.includes("Practice") &&
    adminSidebar.includes("Videos") &&
    adminSidebar.includes("Manual JSON Import") &&
    adminSidebar.includes("Bulk Assets") &&
    adminSidebar.includes("Package Import") &&
    adminSidebar.includes("Taxonomy") &&
    adminSidebar.includes("/admin/blueprints") &&
    adminSidebar.includes("/admin/imports/pdf") &&
    adminSidebar.includes("aria-current") &&
    adminPageHeader.includes("title") &&
    adminPageHeader.includes("description"),
  "admin shell must expose grouped navigation, active state, and shared page header",
);
console.log("PASS admin shell exposes grouped navigation and shared page header");
assert(
  adminActionGroup.includes("AdminActionGroup") &&
    adminCard.includes("AdminCard") &&
    adminDangerZone.includes("AdminDangerZone") &&
    adminDebugDisclosure.includes("AdminDebugDisclosure") &&
    adminEmptyState.includes("AdminEmptyState") &&
    adminInfoTip.includes("AdminInfoTip") &&
    adminLoadingState.includes("AdminLoadingState") &&
    adminStatusBadge.includes("AdminStatusBadge"),
  "shared admin primitives must exist",
);
assert(
  [
    adminActionGroup,
    adminCard,
    adminDangerZone,
    adminDebugDisclosure,
    adminEmptyState,
    adminInfoTip,
    adminLoadingState,
    adminStatusBadge,
  ].every((source) => !source.trimStart().startsWith("\"use client\"") && !source.trimStart().startsWith("'use client'")),
  "shared admin primitives must stay server-compatible by default",
);
assert(
  adminPage.includes("AdminCard") &&
    adminPage.includes("AdminActionGroup") &&
    adminPage.includes("action={createDemoContent}") &&
    adminCard.includes("AdminInfoTip") &&
    adminPageHeader.includes("AdminInfoTip") &&
    adminImportsPage.includes("AdminStatusBadge") &&
    adminImportsPage.includes("AdminDebugDisclosure") &&
    adminImportsPage.includes("AdminEmptyState") &&
    adminQuestionsPage.includes("AdminDangerZone") &&
    adminQuestionsPage.includes("action={bulkUpdateQuestions}") &&
    adminReviewPage.includes("AdminDangerZone") &&
    adminReviewPage.includes("action={bulkUpdateQuestions}") &&
    adminQuestionsLoading.includes("AdminLoadingState") &&
    adminReviewLoading.includes("AdminLoadingState"),
  "admin pages must use shared primitives without replacing server-action forms",
);
console.log("PASS shared admin primitives render server-compatible patterns");
assert(
  adminImportsPage.includes("Import Tools") &&
    adminImportsPage.includes("AI PDF / Image Parsing") &&
    adminImportsPage.includes("Nothing") &&
    adminImportsPage.includes("is published automatically") &&
    adminImportsPage.includes("helpLabel=") &&
    adminImportsPdfPage.includes("AdminCard") &&
    adminImportsPdfPage.includes("AI parsing workflow") &&
    adminImportsPdfPage.includes("Blueprint Library") &&
    adminImportsPdfPage.includes("helpLabel=") &&
    adminImportsPdfPage.includes("AIPdfImportPanelLoader") &&
    aiPdfPanel.includes("AdminInfoTip") &&
    aiPdfPanel.includes("Upload private PDF source") &&
    aiPdfPanel.includes("Choose uploaded source") &&
    aiPdfPanel.includes("Choose mode and run") &&
    aiPdfPanel.includes("No uploaded AI PDF sources yet") &&
    aiPdfPanel.includes("Blueprint") &&
    aiPdfPanel.includes("observation creates reviewable blueprint metadata") &&
    aiPdfPanel.includes("Review Drafts are ready") &&
    aiPdfPanel.includes("Review generated drafts") &&
    aiPdfPanel.includes("AI-generated questions are private drafts") &&
    bulkAssetsPage.includes("Bulk asset matching workflow") &&
    bulkAssetsPage.includes("Matching rules") &&
    bulkAssetsPage.includes("helpLabel=") &&
    bulkAssetPanel.includes("AdminInfoTip") &&
    bulkAssetPanel.includes("Select assets for preview") &&
    bulkAssetPanel.includes("No asset files selected") &&
    bulkAssetPanel.includes("Confirm upload/import") &&
    adminImportsPackagePage.includes("Package import workflow") &&
    adminImportsPackagePage.includes("ZIP contract") &&
    adminImportsPackagePage.includes("helpLabel=") &&
    packageImportPanel.includes("AdminInfoTip") &&
    packageImportPanel.includes("Select package for preview") &&
    packageImportPanel.includes("No package selected") &&
    packageImportPanel.includes("Confirm package import"),
  "import tools UI must expose workflow-first cards, draft-safe copy, and polished empty states without removing loaders/actions",
);
console.log("PASS import tools UI polish keeps loaders and manual confirmation flow");
assert(
  adminReviewPage.includes("AdminCard") &&
    adminReviewPage.includes("AdminActionGroup") &&
    adminReviewPage.includes("AdminEmptyState") &&
    adminReviewPage.includes("Review workflow") &&
    adminReviewPage.includes("Find draft questions") &&
    adminReviewPage.includes("Review selected drafts") &&
    adminReviewPage.includes("action={bulkUpdateQuestions}") &&
    draftReviewCard.includes("AdminDebugDisclosure") &&
    draftReviewCard.includes("AdminStatusBadge") &&
    draftReviewCard.includes("Edit / Review") &&
    draftReviewCard.includes("Source and AI import details") &&
    draftReviewCard.includes("AI import provenance") &&
    draftReviewCard.includes("Warnings to review") &&
    draftReviewCard.includes("Generated drafts stay private") &&
    draftReviewCard.includes("Publish readiness") &&
    draftReviewCard.includes("Taxonomy review") &&
    adminReviewPage.includes("AI PDF imports") &&
    adminReviewPage.includes("Batch review handoff") &&
    adminReviewPage.includes("Back to AI PDF imports"),
  "review drafts UI must use shared primitives, clear workflow copy, and collapsed source/import details",
);
assert(
  adminQuestionsPage.includes("AdminCard") &&
    adminQuestionsPage.includes("AdminStatusBadge") &&
    adminQuestionsPage.includes("AdminActionGroup") &&
    adminQuestionsPage.includes("AdminEmptyState") &&
    adminQuestionsPage.includes("Content library filters") &&
    adminQuestionsPage.includes("Question library") &&
    adminQuestionsPage.includes("action={bulkUpdateQuestions}") &&
    adminQuestionsPage.includes("action={deleteQuestion}") &&
    publicQuestionsPage.includes("Published question filters") &&
    publicQuestionsPage.includes("official difficulty") &&
    publicQuestionsPage.includes("No published questions match these filters.") &&
    publicQuestionsLoading.includes("QuestionListSkeleton"),
  "question bank UI must keep bounded list behavior while rendering polished filter, list, and empty states",
);
console.log("PASS review and question bank UI polish keeps server-action behavior intact");
assert(
  adminQuestionsLoading.includes("Loading questions...") &&
    adminQuestionsLoading.includes("Showing first 50 questions") &&
    adminQuestionsLoading.includes("QuestionListSkeleton"),
  "admin questions route must expose shell-first loading copy and skeleton rows",
);
assert(
  publicQuestionsLoading.includes("Loading questions...") &&
    publicQuestionsLoading.includes("Showing first 25 published questions") &&
    publicQuestionsLoading.includes("QuestionListSkeleton"),
  "public questions route must expose shell-first loading copy and skeleton cards",
);
assert(
  adminReviewLoading.includes("Loading Review Drafts...") &&
    adminReviewLoading.includes("ReviewDraftListSkeleton"),
  "admin review route must expose shell-first loading copy and skeleton cards",
);
assert(
  blueprintLoading.includes("BlueprintWorkspaceLoading") &&
    blueprintLoading.includes("Loading blueprint workspace...") &&
    blueprintLoading.includes("BlueprintSubnav") &&
    blueprintLoading.includes("SourcePlanSkeleton"),
  "blueprint routes must expose shell-first subnav and skeleton workspace content",
);
assert(
  aiPdfImportLoading.includes("AIPdfImportLoadingSkeleton") &&
    aiPdfImportLoadingSkeleton.includes("Loading AI PDF import controls...") &&
    aiPdfImportLoadingSkeleton.includes("Uploaded PDF sources") &&
    aiPdfImportLoadingSkeleton.includes("Loading provider and private source PDF access") &&
    aiPdfImportLoadingSkeleton.includes("Loading AI PDF import dashboard"),
  "AI PDF import route must expose shell-first loading copy, source skeletons, and dashboard skeletons",
);
console.log("PASS progressive loading shells are present for questions, review, blueprints, and AI PDF import");
assert(
  adminSidebar.includes("Blueprint Library") &&
    adminSidebar.includes("/admin/blueprints"),
  "admin navigation must include Blueprint Library",
);
console.log("PASS admin navigation includes Blueprint Library");
assert(
  blueprintPage.includes("view=\"overview\"") &&
    blueprintWorkspace.includes("Question Blueprint Workspace") &&
    blueprintWorkspace.includes("Blueprint Review Queue") &&
    blueprintWorkspace.includes("Approved Blueprint Library") &&
    blueprintWorkspace.includes("History / Archive / Trash") &&
    blueprintWorkspace.includes("Blueprint Import Sources") &&
    blueprintWorkspace.includes("Review blueprints") &&
    blueprintWorkspace.includes("Open library") &&
    blueprintWorkspace.includes("Open sources") &&
    blueprintWorkspace.includes("Generate original draft questions") &&
    blueprintWorkspace.includes("Manual DeepSeek call") &&
    blueprintWorkspace.includes("Open Review Drafts") &&
    blueprintWorkspace.includes("Active library") &&
    blueprintWorkspace.includes("Archived / Trash") &&
    blueprintWorkspace.includes("Needs more evidence") &&
    blueprintWorkspace.includes("Rejected") &&
    blueprintWorkspace.includes("Edit taxonomy targets") &&
    blueprintWorkspace.includes("Quality gate blockers") &&
    blueprintWorkspace.includes("Generation disabled") &&
    blueprintWorkspace.includes("Grouped taxonomy targets") &&
    blueprintWorkspace.includes("Short pattern summary") &&
    blueprintWorkspace.includes("Source refs and internal notes") &&
    blueprintWorkspace.includes("Draft ID:") &&
    blueprintWorkspace.includes("overflowWrap: \"anywhere\"") &&
    blueprintWorkspace.includes("Blueprint folders") &&
    blueprintWorkspace.includes("All blueprints") &&
    blueprintWorkspace.includes("Unfiled") &&
    blueprintWorkspace.includes("Folder tree") &&
    blueprintWorkspace.includes("Move to folder") &&
    blueprintWorkspace.includes("No blueprints in this folder yet.") &&
    blueprintWorkspace.includes("Calibration status") &&
    blueprintWorkspace.includes("Run calibration preview") &&
    blueprintWorkspace.includes("Repair failed samples automatically") &&
    blueprintWorkspace.includes("rerun calibration using Quality mode") &&
    blueprintWorkspace.includes("Temporary calibration samples") &&
    blueprintWorkspace.includes("Run a successful calibration preview before generating Review Draft questions.") &&
    blueprintWorkspace.includes("Blueprint changed after the last successful calibration.") &&
    blueprintWorkspace.includes("Edit, version, split / merge") &&
    blueprintWorkspace.includes("Version history") &&
    blueprintWorkspace.includes("Edit blueprint fields") &&
    blueprintWorkspace.includes("Advanced split / merge") &&
    blueprintWorkspace.includes("Deprecate and replace") &&
    blueprintWorkspace.includes("Repair failed drafts automatically"),
  "blueprint workspace source is missing BP14 sections, BP15 repair controls, or existing BP6 controls",
);
assert(
  blueprintWorkspace.includes("AdminCard") &&
    blueprintWorkspace.includes("AdminStatusBadge") &&
    blueprintWorkspace.includes("AdminActionGroup") &&
    blueprintWorkspace.includes("AdminDangerZone") &&
    blueprintWorkspace.includes("AdminDebugDisclosure") &&
    blueprintWorkspace.includes("AdminEmptyState") &&
    blueprintWorkspace.includes("No AI import blueprint review plans found yet.") &&
    blueprintWorkspace.includes("AI import blueprint plans") &&
    blueprintWorkspace.includes("Generated drafts sent to Review") &&
    blueprintWorkspace.includes("Nothing to show here yet."),
  "blueprint workspace must use shared admin primitives for readable cards, statuses, empty states, and debug disclosure",
);
assert(
  blueprintWorkspace.includes("action={approveQuestionBlueprintReviewAction}") &&
    blueprintWorkspace.includes("action={rejectQuestionBlueprintReviewAction}") &&
    blueprintWorkspace.includes("action={storeBlueprintReviewActionsFromImportBatch}") &&
    blueprintWorkspace.includes("action={generateOriginalQuestionsFromApprovedBlueprint}") &&
    blueprintWorkspace.includes("Reject blueprint draft") &&
    blueprintWorkspace.includes("Move blueprint to trash"),
  "blueprint workspace must preserve server-action forms while separating destructive actions",
);
console.log("PASS blueprint workspace uses shared admin primitives without changing action wiring");
assert(
  blueprintActions.includes("generateOriginalQuestionsFromApprovedBlueprint") &&
    blueprintActions.includes("runBlueprintCalibrationPreview") &&
    blueprintActions.includes("archiveQuestionBlueprint") &&
    blueprintActions.includes("restoreQuestionBlueprint") &&
    blueprintActions.includes("moveQuestionBlueprintToTrash") &&
    blueprintActions.includes("createQuestionBlueprintFolder") &&
    blueprintActions.includes("moveQuestionBlueprintToFolder") &&
    blueprintActions.includes("archiveQuestionBlueprintFolder") &&
    blueprintActions.includes("updateBlueprintReviewActionTaxonomyTargets") &&
    blueprintActions.includes("loadActiveAssignableLeafTaxonomyByFacet") &&
    blueprintActions.includes("importBatchImportJson") &&
    blueprintActions.includes("executeDeepSeekBlueprintGeneration") &&
    blueprintActions.includes("repairQuestionBlueprintGenerationResult") &&
    blueprintActions.includes("modelQualityMode") &&
    blueprintActions.includes("loadActiveAssignableTaxonomyTagIds") &&
    blueprintActions.includes("question_blueprint_calibration_runs") &&
    blueprintActions.includes("updateQuestionBlueprintFields") &&
    blueprintActions.includes("splitQuestionBlueprint") &&
    blueprintActions.includes("createMergedQuestionBlueprintDraft") &&
    blueprintActions.includes("replaceQuestionBlueprint") &&
    blueprintActions.includes("question_blueprint_versions") &&
    blueprintActions.includes("Number(calibrationRun.blueprint_version) !== Number(blueprint.version)") &&
    blueprintActions.includes("generation_readiness !== \"generation_ready\"") &&
    !blueprintActions.includes(".delete(") &&
    !blueprintActions.includes("generateWithGeminiNativePdf") &&
    !blueprintActions.includes("callAIPdfExtractionProvider"),
  "/admin/blueprints action must use manual DeepSeek generation without AI PDF extraction",
);
console.log("PASS /admin/blueprints source exposes lifecycle-gated DeepSeek draft generation safely");
assert(
  aiPdfDashboard.includes("Blueprint Observation Clusters") &&
    aiPdfDashboard.includes("Source questions were split into separate blueprint") &&
    aiPdfDashboard.includes("candidates before DeepSeek analysis.") &&
    aiPdfDashboard.includes("Clusters:") &&
    aiPdfDashboard.includes("Drafts pending review:"),
  "AI PDF dashboard must show blueprint observation clustering metadata",
);
console.log("PASS AI PDF dashboard source surfaces blueprint observation clusters");
assert(
  aiPdfDashboard.includes("Blueprint observation completed") &&
    aiPdfDashboard.includes("Open Blueprint Library") &&
    aiPdfDashboard.includes("Review and approve extracted question blueprints") &&
    aiPdfDashboard.includes("No questions were created by design."),
  "AI PDF dashboard must show completed blueprint observation handoff",
);
assert(
  aiPdfDashboard.includes("Review Draft handoff") &&
    aiPdfDashboard.includes("Imports needing review:") &&
    aiPdfDashboard.includes("Review generated drafts") &&
    aiPdfDashboard.includes("Review warnings, taxonomy, media, and solutions before any"),
  "AI PDF dashboard must show a top-level Review Draft handoff summary",
);
assert(
  aiPdfPanel.includes("isAIPdfBlueprintObservationCompletePhase") &&
    aiPdfPanel.includes("BlueprintObservationCompletionCallout") &&
    aiPdfPanel.includes("Blueprint AI quality mode") &&
    aiPdfPanel.includes("blueprintModelQualityMode") &&
    aiPdfPanel.includes("Open Blueprint Library") &&
    aiPdfPanel.includes("No questions were created by design."),
  "AI PDF live panel must stop spinner and show blueprint completion handoff",
);
console.log("PASS AI PDF blueprint observation completion handoff is visible");
console.log("PASS route smoke uses taxonomy routes without legacy tag setup");
