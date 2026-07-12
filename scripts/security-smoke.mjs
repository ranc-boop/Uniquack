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

const migration = await read("supabase/migrations/0011_math_taxonomy_source_of_truth.sql");
assert(migration.includes("create table if not exists public.taxonomy_nodes"), "taxonomy_nodes table is missing");
assert(migration.includes("create table if not exists public.question_taxonomy_assignments"), "question taxonomy assignments table is missing");
const developmentTaxonomySeed = await read("supabase/development/reset_math_taxonomy_seed_development_only.sql");
assert(developmentTaxonomySeed.includes("math.concept.algebra.equations"), "math-prefixed taxonomy seed is missing");
const legacySubjectRoot = ["subject", "math"].join(".");
assert(!migration.includes(legacySubjectRoot), `${legacySubjectRoot} should not exist in replacement taxonomy`);
console.log("PASS math-prefixed taxonomy schema and seed are present");

const rpc = await read("supabase/migrations/0012_taxonomy_question_search_rpc.sql");
assert(rpc.includes("create or replace function public.search_questions_by_taxonomy"), "taxonomy search RPC is missing");
assert(rpc.includes("matched_tags jsonb"), "taxonomy search RPC does not return matched tag metadata");
assert(rpc.includes("next_cursor text"), "taxonomy search RPC does not return a next cursor");
assert(rpc.includes("taxonomy_tag_path"), "taxonomy search RPC does not return tag paths");
assert(rpc.includes("to_tsvector"), "taxonomy search RPC does not use full-text search");
console.log("PASS taxonomy search RPC includes paths, cursor, and full-text matching");

const publicQuestions = await read("src/app/questions/page.tsx");
assert(publicQuestions.includes("search_questions_by_taxonomy"), "public questions page does not use taxonomy RPC");
console.log("PASS public questions page uses taxonomy search RPC");

const adminTags = await read("src/app/admin/tags/page.tsx");
assert(adminTags.includes("TaxonomyNodeCreateFields"), "taxonomy node form is missing parent tree picker");
assert(adminTags.includes("<details"), "taxonomy preview is missing collapsible tree rows");
console.log("PASS taxonomy admin uses parent tree creation and collapsible preview");

const batchJson = await read("src/lib/batch-import/json.ts");
assert(batchJson.includes("tag_ids"), "batch import does not accept tag_ids");
assert(!batchJson.includes(`tag_${"slugs"}`), "batch import still accepts legacy tag identifier arrays");
assert(!batchJson.includes(`tag_${"names"}`), "batch import still accepts legacy tag name arrays");
assert(
  batchJson.includes("function buildImportAnswerSpec") &&
    batchJson.includes('kind: "mcq"') &&
    batchJson.includes("resolveCorrectOptionIds") &&
    batchJson.includes("MCQ import has options but no reliable correct_option_ids"),
  "batch import must repair MCQ answer_spec from options/correct answers without leaving MCQs as FRQ",
);
assert(
  batchJson.includes("Missing solution or explanation; add solution guidance during review before approving."),
  "batch import must surface missing AI-generated solution/explanation as a review warning",
);
console.log("PASS batch import uses exact tag_ids only");

const batchImportService = await read("src/lib/batch-import/service.ts");
const adminQuestionActions = await read("src/app/admin/questions/actions.ts");
assert(
  batchImportService.includes("resolveImportOrganizationContext"),
  "batch import must resolve organization context before persistence",
);
assert(
  batchImportService.includes("profiles.default_organization_id") &&
    batchImportService.includes("organization_members") &&
    batchImportService.includes("active_staff_membership"),
  "batch import organization context must fall back to profile default org and active staff membership",
);
assert(
  batchImportService.includes("organization_id: organizationContext.organizationId"),
  "batch import question inserts must include organization_id",
);
assert(
  batchImportService.includes("requiredQuestionSourceText") &&
    batchImportService.includes("solution_source: requiredQuestionSourceText(normalized.solution_source)") &&
    batchImportService.includes("content_source: requiredQuestionSourceText(normalized.content_source)"),
  "batch import question inserts must provide non-null content/solution source metadata",
);
assert(
  batchImportService.includes("questionSourceKindForImport") &&
    batchImportService.includes('source_kind: questionSourceKindForImport(sourceType)') &&
    batchImportService.includes('return `${prefix}:${batchId}`'),
  "batch import question inserts must preserve source/source_kind provenance",
);
assert(
  batchImportService.includes('status: "draft"') &&
    batchImportService.includes('review_status: "pending_review"'),
  "batch import must preserve draft and pending-review boundaries",
);
const aiPdfImportActionsOrg = await read("src/app/admin/imports/pdf/actions.ts");
assert(
  aiPdfImportActionsOrg.includes("resolveImportOrganizationContext") &&
    aiPdfImportActionsOrg.includes("organization_id: organizationContext.organizationId"),
  "AI PDF import batches must preserve organization_id at source upload reservation",
);
const classroomMigration = await read("supabase/clean-migrations/0018_classroom_foundation.sql");
const teacherClassroomRlsMigration = await read(
  "supabase/clean-migrations/0030_teacher_classroom_rls_fix.sql",
);
const studentWorkMigration = await read("supabase/clean-migrations/0021_student_work_assignments.sql");
const studentWorkManagerScopeMigration = await read(
  "supabase/clean-migrations/0023_student_work_assignment_manager_scope_fix.sql",
);
const classroomHelpers = await read("src/lib/classrooms.ts");
const studentWorkHelpers = await read("src/lib/student-work.ts");
const teacherAssignmentHelpers = await read("src/lib/teacher-assignments.ts");
const teacherClassroomActions = await read("src/app/teacher/classrooms/actions.ts");
const teacherAssignmentActions = await read(
  "src/app/teacher/classrooms/[id]/assignments/actions.ts",
);
const studentJoinActions = await read("src/app/student/classrooms/join/actions.ts");
const teacherHomePage = await read("src/app/teacher/page.tsx");
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
const teacherBlueprintActions = await read("src/app/teacher/blueprints/actions.ts");
const teacherBankActions = await read("src/app/teacher/banks/actions.ts");
const teacherParsingProfiles = await read(
  "src/lib/ai-pdf-import/teacher-parsing-profiles.ts",
);
const questionBankHelpers = await read("src/lib/question-banks.ts");
const teacherClassroomPage = await read("src/app/teacher/classrooms/page.tsx");
const teacherClassroomDetailPage = await read("src/app/teacher/classrooms/[id]/page.tsx");
const teacherClassroomUi = await read("src/app/teacher/classrooms/classroom-ui.tsx");
const teacherClassroomPeoplePage = await read("src/app/teacher/classrooms/[id]/people/page.tsx");
const teacherClassroomStudentsPage = await read("src/app/teacher/classrooms/[id]/students/page.tsx");
const teacherClassroomTeachersPage = await read("src/app/teacher/classrooms/[id]/teachers/page.tsx");
const teacherAssignmentsPage = await read("src/app/teacher/classrooms/[id]/assignments/page.tsx");
const teacherClassroomAnalyticsPage = await read("src/app/teacher/classrooms/[id]/analytics/page.tsx");
const teacherClassroomBlueprintsPage = await read("src/app/teacher/classrooms/[id]/blueprints/page.tsx");
const teacherClassroomSettingsPage = await read("src/app/teacher/classrooms/[id]/settings/page.tsx");
const teacherAssignmentNewPage = await read("src/app/teacher/classrooms/[id]/assignments/new/page.tsx");
const teacherAssignmentDetailPage = await read("src/app/teacher/classrooms/[id]/assignments/[assignmentId]/page.tsx");
const assignmentSelectionSummary = await read("src/components/teacher/assignment-selection-summary.tsx");
const courseBuilderBridgeMigration = await read(
  "supabase/clean-migrations/0024_assignment_source_metadata.sql",
);
const questionBankMigration = await read(
  "supabase/clean-migrations/0025_question_banks_foundation.sql",
);
const bankShareMigration = await read(
  "supabase/clean-migrations/0026_bank_share_codes_and_members.sql",
);
const bankImportReviewMigration = await read(
  "supabase/clean-migrations/0027_bank_import_review_scope.sql",
);
const assignmentFromBankMigration = await read(
  "supabase/clean-migrations/0028_assignment_from_bank_questions.sql",
);
const teacherRoleBoundaryMigration = await read(
  "supabase/clean-migrations/0029_teacher_role_bank_public_boundary.sql",
);
const blueprintLibraryMigration = await read(
  "supabase/clean-migrations/0031_blueprint_library_foundation.sql",
);
const courseBuilderBridgeHelper = await read("src/lib/course-builder/assignment-bridge.ts");
const courseBuilderBridgeActions = await read("src/app/teacher/course-builder/actions.ts");
const courseBuilderBridgePage = await read("src/app/teacher/course-builder/page.tsx");
const studentWorkPage = await read("src/app/student/work/page.tsx");
const studentWorkDetailPage = await read("src/app/student/work/[id]/page.tsx");
const studentClassroomPage = await read("src/app/student/classrooms/page.tsx");
const studentJoinPage = await read("src/app/student/classrooms/join/page.tsx");
const authGuards = await read("src/lib/auth/guards.ts");
const authActions = await read("src/app/auth/actions.ts");
const authNav = await read("src/components/auth-nav.tsx");
const supabaseMiddleware = await read("src/lib/supabase/middleware.ts");
const profileValidation = await read("src/lib/validations/profile.ts");
const adminUsersPage = await read("src/app/admin/users/page.tsx");
assert(
  classroomMigration.includes("create table if not exists public.classrooms") &&
    classroomMigration.includes("create table if not exists public.classroom_members") &&
    classroomMigration.includes("create table if not exists public.classroom_join_codes") &&
    classroomMigration.includes("alter table public.classrooms enable row level security") &&
    classroomMigration.includes("alter table public.classroom_members enable row level security") &&
    classroomMigration.includes("alter table public.classroom_join_codes enable row level security"),
  "classroom foundation migration must create classroom tables with RLS enabled",
);
assert(
  classroomMigration.includes("private.classroom_join_code_hash") &&
    classroomMigration.includes("extensions.digest") &&
    classroomMigration.includes("public.join_classroom_by_code") &&
    classroomMigration.includes("revoke all on function public.join_classroom_by_code(text)") &&
    classroomMigration.includes("grant execute on function public.join_classroom_by_code(text) to authenticated") &&
    !classroomMigration.includes("join_code text not null") &&
    !classroomMigration.includes("join_code text unique"),
  "classroom join codes must be hash-only and joined through an authenticated RPC",
);
assert(
  classroomMigration.includes("classrooms_teacher_create") &&
    classroomMigration.includes("private.is_org_staff(organization_id)") &&
    classroomMigration.includes("classroom_members_teacher_write") &&
    classroomMigration.includes("user_id = auth.uid()") &&
    classroomMigration.includes("profiles_classroom_roster_read"),
  "classroom RLS must support teacher-owned creation, roster reads, and self-scoped student membership reads",
);
assert(
  teacherClassroomRlsMigration.includes("create or replace function private.is_org_staff") &&
    teacherClassroomRlsMigration.includes("profile.default_organization_id") &&
    teacherClassroomRlsMigration.includes("create or replace function public.create_teacher_classroom") &&
    teacherClassroomRlsMigration.includes("grant execute on function public.create_teacher_classroom") &&
    teacherClassroomRlsMigration.includes("to authenticated") &&
    !teacherClassroomRlsMigration.includes("to anon"),
  "teacher classroom RLS fix must support real teacher org context and authenticated classroom creation RPC",
);
assert(
  studentWorkMigration.includes("create table if not exists public.assignments") &&
    studentWorkMigration.includes("create table if not exists public.assignment_items") &&
    studentWorkMigration.includes("create table if not exists public.student_assignment_progress") &&
    studentWorkMigration.includes("create table if not exists public.assignment_practice_sessions") &&
    studentWorkMigration.includes("alter table public.assignments enable row level security") &&
    studentWorkMigration.includes("alter table public.assignment_items enable row level security") &&
    studentWorkMigration.includes("alter table public.student_assignment_progress enable row level security") &&
    studentWorkMigration.includes("alter table public.assignment_practice_sessions enable row level security"),
  "student My Work migration must create assignment tables with RLS enabled",
);
assert(
  studentWorkMigration.includes("private.can_manage_assignment") &&
    studentWorkMigration.includes("private.can_read_assignment") &&
    studentWorkMigration.includes("assignments_read_scoped") &&
    studentWorkMigration.includes("assignment.status = 'assigned'") &&
    studentWorkMigration.includes("member.user_id = auth.uid()") &&
    studentWorkMigration.includes("student_assignment_progress_student_insert") &&
    studentWorkMigration.includes("student_id = auth.uid()"),
  "student My Work RLS must keep assignment reads classroom-scoped and progress writes student-owned",
);
assert(
  studentWorkManagerScopeMigration.includes("classroom.owner_id = auth.uid()") &&
    studentWorkManagerScopeMigration.includes("private.is_org_admin(classroom.organization_id)") &&
    studentWorkManagerScopeMigration.includes("member.role in ('teacher', 'co_teacher')") &&
    studentWorkManagerScopeMigration.includes("private.can_manage_assignment") &&
    !studentWorkManagerScopeMigration.includes("student_assignment_progress"),
  "student My Work assignment manager scope must stay explicit to classroom owners, co-teachers, and org admins",
);
assert(
  classroomHelpers.includes("hashClassroomJoinCode") &&
    classroomHelpers.includes("generateClassroomJoinCode") &&
    classroomHelpers.includes("resolveClassroomOrganizationId") &&
    teacherClassroomActions.includes("requireTeacher") &&
    teacherClassroomActions.includes("create_teacher_classroom") &&
    teacherClassroomActions.includes("The join code is also available") &&
    studentJoinActions.includes("requireStudent") &&
    studentJoinActions.includes('rpc("join_classroom_by_code"'),
  "classroom server actions must create teacher classrooms and join students without direct student inserts",
);
assert(
  studentWorkHelpers.includes("listStudentAssignedWork") &&
    studentWorkHelpers.includes("getStudentAssignedWorkDetail") &&
    studentWorkHelpers.includes(".eq(\"status\", \"assigned\")") &&
    studentWorkHelpers.includes(".eq(\"student_id\", studentId)") &&
    !studentWorkHelpers.includes(".insert(") &&
    !studentWorkHelpers.includes(".update("),
  "student My Work helpers must read assigned work and own progress without mutating data",
);
assert(
  teacherAssignmentHelpers.includes("listTeacherClassroomAssignments") &&
    teacherAssignmentHelpers.includes("getTeacherAssignmentDetail") &&
    teacherAssignmentHelpers.includes("listAssignablePublishedQuestions") &&
    teacherAssignmentHelpers.includes('.eq("status", "published")') &&
    teacherAssignmentActions.includes("requireTeacher") &&
    teacherAssignmentActions.includes("getManagedClassroom") &&
    teacherAssignmentActions.includes('.eq("status", "published")') &&
    teacherAssignmentActions.includes(".from(\"assignments\")") &&
    teacherAssignmentActions.includes(".from(\"assignment_items\")") &&
    teacherAssignmentActions.includes("revalidatePath(\"/student/work\")") &&
    !teacherAssignmentActions.includes("course_builder") &&
    !teacherAssignmentActions.includes("google") &&
    !teacherAssignmentActions.includes("wearable"),
  "teacher assignment flow must require teacher access, assign only published questions, and avoid non-goal integrations",
);
assert(
  courseBuilderBridgeMigration.includes("add column if not exists source_kind") &&
    courseBuilderBridgeMigration.includes("source_record_id uuid") &&
    courseBuilderBridgeMigration.includes("source_summary jsonb") &&
    courseBuilderBridgeMigration.includes("'manual', 'course_builder_run', 'practice_framework'") &&
    courseBuilderBridgeMigration.includes("assignments_source_idx"),
  "Course Builder assignment bridge migration must add source metadata without changing assignment visibility",
);
assert(
  courseBuilderBridgeHelper.includes("practice_course_frameworks") &&
    courseBuilderBridgeHelper.includes("course_generation_runs") &&
    courseBuilderBridgeHelper.includes('.eq("status", "published")') &&
    courseBuilderBridgeHelper.includes("eligibleQuestionCount") &&
    courseBuilderBridgeHelper.includes("unavailableQuestionCount") &&
    courseBuilderBridgeHelper.includes("buildAssignmentSourceSummary"),
  "Course Builder bridge helper must load framework/run sources and expose only published assignable questions",
);
assert(
  courseBuilderBridgeActions.includes("requireTeacher") &&
    courseBuilderBridgeActions.includes("getManagedClassroom") &&
    courseBuilderBridgeActions.includes("getCourseBuilderBridgeSource") &&
    courseBuilderBridgeActions.includes('publishMode: z.enum(["draft", "assigned"]).default("draft")') &&
    courseBuilderBridgeActions.includes("source_kind: source.kind") &&
    courseBuilderBridgeActions.includes("source_record_id: source.id") &&
    courseBuilderBridgeActions.includes("source_summary: buildAssignmentSourceSummary(source)") &&
    courseBuilderBridgeActions.includes("No published Question Bank questions are available") &&
    courseBuilderBridgeActions.includes("revalidatePath(\"/student/work\")") &&
    !courseBuilderBridgeActions.includes("google") &&
    !courseBuilderBridgeActions.includes("wearable") &&
    !courseBuilderBridgeActions.includes("AI_PROVIDER") &&
    !courseBuilderBridgeActions.includes("provider"),
  "Course Builder bridge action must stay teacher-only, draft-by-default, published-question-only, and provider-free",
);
assert(
    courseBuilderBridgePage.includes("Course Builder will generate bank packages before assignment") &&
    courseBuilderBridgePage.includes("Save draft (teacher-only)") &&
    courseBuilderBridgePage.includes("Assign now (visible in My Work)") &&
    courseBuilderBridgePage.includes("Draft/unreviewed questions are unavailable for assignment") &&
    courseBuilderBridgePage.includes("bank review") &&
    courseBuilderBridgePage.includes("does not add") &&
    courseBuilderBridgePage.includes("provider calls") &&
    teacherAssignmentDetailPage.includes("Assignment source"),
  "Course Builder bridge UI must expose teacher draft/assign choices, Review Draft blockers, and assignment source traceability",
);
assert(
    teacherHomePage.includes("Teacher Workspace") &&
    teacherHomePage.includes("Start with a Question Bank") &&
    teacherHomePage.includes("review imported content") &&
    teacherHomePage.includes("Bank-first teacher workflow") &&
    teacherHomePage.includes("Student visibility stays assignment-only") &&
    teacherHomePage.includes("No unreviewed draft can be assigned to students") &&
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
    teacherBanksPage.includes("Question Bank tables are not available yet") &&
    teacherBankNewPage.includes("action={createQuestionBank}") &&
    teacherBankNewPage.includes("Creating a bank creates your owner membership only") &&
    teacherBankDetailPage.includes("No reviewed questions in this bank yet") &&
    teacherBankDetailPage.includes("Question Bank operating surface") &&
    teacherBankDetailPage.includes("BankRouteTabs") &&
    teacherBankDetailPage.includes("Import Material") &&
    teacherBankDetailPage.includes("Publish from bank") &&
    teacherBankDetailPage.includes("Assignments expose selected") &&
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
    teacherBankJoinPage.includes("action={joinQuestionBankByCode}") &&
    teacherBankJoinPage.includes("Joining a bank is separate from") &&
    teacherBankMembersPage.includes("Owner-controlled sharing") &&
    teacherBankMembersPage.includes("Share codes are shown") &&
    teacherBankMembersPage.includes("only once") &&
    teacherBankMembersPage.includes("Role") &&
    teacherBankActions.includes("requireTeacher") &&
    teacherBankActions.includes('rpc("create_question_bank"') &&
    teacherBankActions.includes('rpc("create_bank_share_code"') &&
    teacherBankActions.includes('rpc("join_question_bank_by_code"') &&
    teacherBankActions.includes('rpc("update_bank_member_role"') &&
    teacherBankActions.includes('rpc("remove_bank_member"') &&
    teacherBankActions.includes('rpc("approve_bank_review_question"') &&
    teacherBankActions.includes("create_assignment_from_bank") &&
    teacherBankActions.includes("createAssignmentFromBankQuestions") &&
    teacherPublishPage.includes("Publish distributes selected approved bank content to classes") &&
    teacherPublishPage.includes("Choose the content owner") &&
    teacherPublishPage.includes("Select approved assignment-ready rows") &&
    teacherPublishPage.includes("Choose classroom delivery") &&
    teacherPublishPage.includes("Selected students") &&
    teacherPublishPage.includes("Assignment-only. No full source bank access.") &&
    teacherPublishPage.includes("Blueprint rows are not directly publishable") &&
    teacherPublishPage.includes("Package publishing is not assignment-ready yet.") &&
    teacherPublishPage.includes("No Review Draft bypass") &&
    teacherPublishActions.includes("requireTeacher") &&
    teacherPublishActions.includes("publishQuestionBankAssignments") &&
    teacherPublishActions.includes("verifyPublishableSelection") &&
    teacherPublishActions.includes("buildPublishAssignmentSourceSummary") &&
    teacherPublishActions.includes("create_assignment_from_bank") &&
    teacherPublishActions.includes("selectedClassroomIds") &&
    teacherPublishActions.includes("p_selected_bank_question_ids") &&
    !teacherPublishActions.includes("AI_PROVIDER") &&
    !teacherPublishActions.includes("published_at") &&
    teacherBankActions.includes("importBatchImportJson") &&
    teacherBankActions.includes("importBankPdfDrafts") &&
    teacherBankActions.includes("resolveTeacherAIPdfProviderProfile") &&
    teacherBankActions.includes("assertNoRawProviderConfig(formData)") &&
    teacherBankActions.includes("buildAIPdfJobIdempotencyKey") &&
    teacherBankActions.includes("enqueueAIProviderJob") &&
    !teacherBankActions
      .slice(
        teacherBankActions.indexOf("export async function importBankPdfDrafts"),
        teacherBankActions.indexOf("export async function approveBankReviewQuestion"),
      )
      .includes("processAIPdfImport") &&
    teacherBankActions.includes("canManageBankContent(detail.currentUserRole)") &&
    teacherBankActions.includes("targetBankId: parsed.bankId") &&
    teacherBankAssignmentNewPage.includes("Assign from") &&
    teacherBankAssignmentNewPage.includes("selected approved bank items") &&
    teacherBankAssignmentNewPage.includes("not access to the full bank") &&
    teacherBankAssignmentNewPage.includes("action={createAssignmentFromBankQuestions}") &&
    teacherBankAssignmentNewPage.includes("Choose a class you manage") &&
    teacherBankAssignmentNewPage.includes("Assign to class") &&
    teacherBankAssignmentNewPage.includes("Save draft") &&
    teacherBankAssignmentNewPage.includes("server rechecks bank membership") &&
    teacherBlueprintPage.includes("Blueprint Library") &&
    teacherBlueprintPage.includes("Blueprints are reusable planning/package assets") &&
    teacherBlueprintPage.includes("Create Blueprint") &&
    teacherBlueprintPage.includes("New Folder") &&
    teacherBlueprintNewPage.includes("This form only creates the library asset") &&
    teacherBlueprintDetailPage.includes("BlueprintWorkflowPanel") &&
    teacherBankBlueprintsPage.includes("Blueprint links for") &&
    teacherBankBlueprintsPage.includes("Create Blueprint from this bank") &&
    teacherBlueprintActions.includes("requireTeacher") &&
    teacherBlueprintActions.includes("generation_ready: false") &&
    !teacherBlueprintActions.includes("executeDeepSeek") &&
    !teacherBlueprintActions.includes("callAIPdfExtractionProvider") &&
    blueprintLibraryMigration.includes("create table if not exists public.bank_blueprints") &&
    blueprintLibraryMigration.includes("private.can_read_question_blueprint") &&
    !blueprintLibraryMigration.includes("to anon") &&
    !teacherBankActions.includes("AI_PROVIDER") &&
    !teacherBankActions.includes("SUPABASE_SERVICE_ROLE") &&
    !teacherBankActions.includes('status: "published"') &&
    !teacherBankActions.includes('visibility: "public"') &&
    teacherBankActions.includes('"api_key"') &&
    teacherBankActions.includes('"provider_profile_id"') &&
    teacherParsingProfiles.includes('import "server-only"') &&
    teacherParsingProfiles.includes("listEnabledAIProviderProfilesForServerUse") &&
    teacherParsingProfiles.includes("Standard / Recommended") &&
    teacherParsingProfiles.includes("resolveTeacherAIPdfProviderProfile") &&
    !teacherParsingProfiles.includes("api_key_ciphertext") &&
    !teacherParsingProfiles.includes("api_key_iv") &&
    !teacherParsingProfiles.includes("api_key_tag") &&
    questionBankHelpers.includes("listTeacherQuestionBanks") &&
    questionBankHelpers.includes("getTeacherQuestionBankDetail") &&
    questionBankHelpers.includes("listBankShareCodes") &&
    questionBankHelpers.includes("listBankReviewDraftQuestions") &&
    questionBankHelpers.includes("listBankApprovedQuestions") &&
    questionBankHelpers.includes("QuestionBankSchemaMissingError") &&
    !teacherBankJoinPage.includes(".insert(") &&
    !teacherBankMembersPage.includes(".insert(") &&
    questionBankMigration.includes("create table if not exists public.question_banks") &&
    questionBankMigration.includes("create table if not exists public.bank_members") &&
    questionBankMigration.includes("create table if not exists public.bank_questions") &&
    questionBankMigration.includes("alter table public.question_banks enable row level security") &&
    questionBankMigration.includes("alter table public.bank_members enable row level security") &&
    questionBankMigration.includes("alter table public.bank_questions enable row level security") &&
    questionBankMigration.includes("private.can_read_question_bank") &&
    questionBankMigration.includes("private.can_manage_question_bank") &&
    questionBankMigration.includes("public.create_question_bank") &&
    questionBankMigration.includes("revoke all on function public.create_question_bank") &&
    questionBankMigration.includes("grant execute on function public.create_question_bank") &&
    questionBankMigration.includes("role in ('owner', 'editor', 'viewer')") &&
    !questionBankMigration.includes("share_code") &&
    !questionBankMigration.includes("provider") &&
    bankShareMigration.includes("create table if not exists public.bank_share_codes") &&
    bankShareMigration.includes("code_hash text not null unique") &&
    bankShareMigration.includes("private.bank_share_code_hash") &&
    bankShareMigration.includes("public.join_question_bank_by_code") &&
    bankShareMigration.includes("current_profile.role not in ('teacher', 'admin', 'super_admin')") &&
    bankShareMigration.includes("Only bank owners can create share codes") &&
    bankShareMigration.includes("drop policy if exists bank_members_write_managers") &&
    bankShareMigration.includes("create policy bank_members_owner_write") &&
    bankShareMigration.includes("alter table public.bank_share_codes enable row level security") &&
    bankShareMigration.includes("revoke all on function public.join_question_bank_by_code(text) from public, anon") &&
    bankShareMigration.includes("grant execute on function public.join_question_bank_by_code(text) to authenticated") &&
    !bankShareMigration.includes("raw_share_code text not null") &&
    !bankShareMigration.includes("grant execute on function public.join_question_bank_by_code(text) to anon") &&
    bankImportReviewMigration.includes("add column if not exists target_bank_id") &&
    bankImportReviewMigration.includes("add column if not exists owner_bank_id") &&
    bankImportReviewMigration.includes("public.approve_bank_review_question") &&
    bankImportReviewMigration.includes("questions_bank_member_read") &&
    bankImportReviewMigration.includes("Only bank owners or editors can approve") &&
    bankImportReviewMigration.includes("then 'review'") &&
    !bankImportReviewMigration.includes("status = 'published',") &&
    !bankImportReviewMigration.includes("published_at = coalesce") &&
    assignmentFromBankMigration.includes("create or replace function public.create_assignment_from_bank") &&
    assignmentFromBankMigration.includes("'question_bank'") &&
    assignmentFromBankMigration.includes("add column if not exists bank_question_id") &&
    assignmentFromBankMigration.includes("add column if not exists source_bank_id") &&
    assignmentFromBankMigration.includes("private.can_read_assignment_question") &&
    assignmentFromBankMigration.includes("questions_assignment_item_read") &&
    assignmentFromBankMigration.includes("assignment.status = 'assigned'") &&
    assignmentFromBankMigration.includes("private.can_read_question_bank(p_target_bank_id)") &&
    assignmentFromBankMigration.includes("private.can_manage_classroom(p_target_classroom_id)") &&
    assignmentFromBankMigration.includes("question.status <> 'draft'") &&
    assignmentFromBankMigration.includes("grant execute on function public.create_assignment_from_bank") &&
    assignmentFromBankMigration.includes("grant execute on function private.can_read_assignment_question(uuid) to anon, authenticated") &&
    !assignmentFromBankMigration.includes("published_at =") &&
    !/grant execute on function public\.create_assignment_from_bank[\s\S]*?to anon/i.test(assignmentFromBankMigration) &&
    profileValidation.includes('"teacher"') &&
    adminUsersPage.includes('<option value="teacher">Teacher</option>') &&
    teacherRoleBoundaryMigration.includes("questions_published_read") &&
    teacherRoleBoundaryMigration.includes("visibility = 'public'") &&
    teacherRoleBoundaryMigration.includes("owner_bank_id is null") &&
    teacherRoleBoundaryMigration.includes("Bank-owned questions must be approved through bank review") &&
    teacherRoleBoundaryMigration.includes("public.search_questions_by_taxonomy") &&
    authGuards.includes("next=/teacher") &&
    authActions.includes('redirect("/teacher")') &&
    authNav.includes("Teacher Workspace preview") &&
    teacherClassroomPage.includes("Your classes") &&
    teacherClassroomPage.includes("Create Class") &&
    teacherClassroomUi.includes("Publish to classes") &&
    teacherClassroomPage.includes("Class completion") &&
    teacherClassroomPage.includes("Delivery layer") &&
    teacherClassroomPage.includes("Classes are roster and delivery spaces") &&
    teacherClassroomDetailPage.includes("Class delivery snapshot") &&
    teacherClassroomDetailPage.includes("Students can join the roster") &&
    teacherClassroomDetailPage.includes("Active join code") &&
    teacherClassroomDetailPage.includes("Students needing attention") &&
    teacherClassroomDetailPage.includes("View assignments") &&
    teacherClassroomPeoplePage.includes("/students") &&
    teacherClassroomStudentsPage.includes("Remove from active roster") &&
    teacherClassroomStudentsPage.includes("source bank") &&
    teacherClassroomTeachersPage.includes("source Question Banks") &&
    teacherClassroomTeachersPage.includes("provider settings") &&
    teacherClassroomAnalyticsPage.includes("Progress") &&
    teacherClassroomAnalyticsPage.includes("Taxonomy mastery") &&
    teacherClassroomBlueprintsPage.includes("Blueprints linked to this class will appear here") &&
    teacherClassroomSettingsPage.includes("Join-code lifecycle") &&
    teacherClassroomSettingsPage.includes("Archive classroom") &&
    teacherClassroomSettingsPage.includes("Reopen classroom") &&
    teacherAssignmentsPage.includes("Classroom assignments") &&
    teacherAssignmentsPage.includes("Assignment visibility") &&
    teacherAssignmentsPage.includes("global publishing") &&
    teacherAssignmentsPage.includes("Drafts stay teacher-side") &&
    teacherAssignmentsPage.includes("Assigned") &&
    teacherAssignmentsPage.includes("Draft") &&
    teacherAssignmentsPage.includes("Archived") &&
    teacherAssignmentsPage.includes("Latest activity") &&
    teacherAssignmentNewPage.includes("Published questions") &&
    teacherAssignmentNewPage.includes("workflow now starts from Question Banks") &&
    teacherAssignmentNewPage.includes("published-question compatibility") &&
    teacherAssignmentNewPage.includes("AssignmentSelectionSummary") &&
    assignmentSelectionSummary.includes("selectedCount") &&
    assignmentSelectionSummary.includes("inputName") &&
    assignmentSelectionSummary.includes("Choose at least one published question") &&
    teacherAssignmentNewPage.includes("Save draft keeps the assignment teacher-only") &&
    teacherAssignmentNewPage.includes("The server rechecks every selected question") &&
    teacherAssignmentNewPage.includes("Assign to class") &&
    teacherAssignmentDetailPage.includes("Student handoff") &&
    teacherAssignmentDetailPage.includes("does not grant students") &&
    teacherAssignmentDetailPage.includes("full bank") &&
    teacherAssignmentDetailPage.includes("Student progress") &&
    teacherAssignmentDetailPage.includes("One row per active classroom student") &&
    teacherAssignmentDetailPage.includes("Practice evidence") &&
    teacherAssignmentDetailPage.includes("Draft assignment is teacher-only") &&
    teacherAssignmentDetailPage.includes("Assigned work is visible in Student My Work") &&
    teacherAssignmentDetailPage.includes("/questions/") &&
    teacherAssignmentDetailPage.includes("linked session") &&
    teacherAssignmentsPage.includes("Open progress") &&
    teacherAssignmentsPage.includes("completed") &&
    teacherAssignmentDetailPage.includes("My Work") &&
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
    studentClassroomPage.includes("My classes") &&
    studentClassroomPage.includes("Assigned work lives in My Work") &&
    studentClassroomPage.includes("Active membership") &&
    studentJoinPage.includes("Enter your class code"),
  "classroom routes must expose teacher list/detail/roster and student join/list/My Work MVP pages",
);
assert(
  authGuards.includes("requireTeacher") &&
    authGuards.includes("requireStudent") &&
    supabaseMiddleware.includes("isTeacherRoute") &&
    supabaseMiddleware.includes("isStudentRoute") &&
    supabaseMiddleware.includes("TEACHER_ROLES") &&
    supabaseMiddleware.includes("STUDENT_ROLES"),
  "teacher/student classroom routes must be protected by role-specific guards and middleware",
);
console.log("PASS native classroom foundation keeps hash-only joins and scoped teacher/student access");
const aiPdfImportService = await read("src/lib/ai-pdf-import/service.ts");
const questionAssetsStorageMigration = await read(
  "supabase/clean-migrations/0015_question_assets_storage_bucket.sql",
);
assert(
  aiPdfImportService.includes("storage_bucket: QUESTION_ASSETS_BUCKET") &&
    aiPdfImportService.includes("storage_path: objectPath") &&
    aiPdfImportService.includes('asset_kind: "image"') &&
    !aiPdfImportService.includes("display_on_detail: true"),
  "AI PDF crop uploads must use clean question_assets schema fields",
);
assert(
  aiPdfImportService.includes("missing solution/explanation; reviewer must add solution guidance before approval"),
  "AI PDF import must warn when provider output lacks solution/explanation",
);
assert(
  questionAssetsStorageMigration.includes("'question-assets'") &&
    questionAssetsStorageMigration.includes("storage.buckets") &&
    questionAssetsStorageMigration.includes("question_assets_staff_upload") &&
    questionAssetsStorageMigration.includes("qa.storage_path = name") &&
    questionAssetsStorageMigration.includes("private.is_org_staff"),
  "clean Supabase must create question-assets bucket and staff-only storage policies",
);
const reviewDraftPublishMigration = await read(
  "supabase/clean-migrations/0016_review_draft_publish_lineage.sql",
);
assert(
  reviewDraftPublishMigration.includes("create or replace function public.publish_review_draft_questions") &&
    reviewDraftPublishMigration.includes("source_review_item_id") &&
    reviewDraftPublishMigration.includes("question_row.source_kind in ('ai_import', 'blueprint_generation')") &&
    reviewDraftPublishMigration.includes("Review lineage is required before publishing generated question") &&
    reviewDraftPublishMigration.indexOf("update public.questions as question_update") <
      reviewDraftPublishMigration.indexOf("update public.question_taxonomy_assignments as assignment") &&
    reviewDraftPublishMigration.includes("insert into public.review_actions") &&
    reviewDraftPublishMigration.includes("grant execute on function public.publish_review_draft_questions(uuid[])") &&
    !reviewDraftPublishMigration.includes("drop constraint questions_ai_or_blueprint_requires_review_lineage"),
  "Review Draft publish RPC must attach generated-question lineage and publish before approving taxonomy",
);
assert(
  adminQuestionActions.includes("publishQuestionsWithReviewLineage") &&
    adminQuestionActions.includes('rpc("publish_review_draft_questions"') &&
    adminQuestionActions.includes("needsGeneratedReviewPublish") &&
    adminQuestionActions.indexOf("await publishQuestionsWithReviewLineage({") <
      adminQuestionActions.lastIndexOf('if (parsed.status === "published" && returnTo.startsWith("/admin/review"))') &&
    !adminQuestionActions.includes("approveQuestionTaxonomyAssignmentsForPublish"),
  "admin publish actions must use transactional review-lineage RPC instead of pre-approving taxonomy",
);
console.log("PASS AI/batch import persistence carries organization context without auto-publish");

const practicePersistence = await read("supabase/migrations/0014_practice_persistence.sql");
for (const table of [
  "practice_sessions",
  "practice_rounds",
  "practice_round_questions",
  "practice_attempts",
  "practice_wrong_questions",
  "user_practice_preferences",
  "practice_preference_merge_jobs",
]) {
  assert(
    practicePersistence.includes(`alter table public.${table} enable row level security`),
    `${table} is missing RLS`,
  );
  assert(
    practicePersistence.includes(`on public.${table} for select`) &&
      practicePersistence.includes("using ((select auth.uid()) = user_id)"),
    `${table} is missing owner select policy`,
  );
}
assert(
  practicePersistence.includes("long_term_preference text not null default ''") &&
    practicePersistence.includes("check (length(long_term_preference) <= 1000)"),
  "practice preference 1000-character constraint is missing",
);
assert(
  practicePersistence.includes("question_snapshot jsonb") &&
    practicePersistence.includes("references public.questions(id) on delete set null"),
  "practice history must preserve snapshots when source questions are deleted",
);
console.log("PASS practice persistence has owner RLS, preference limit, and snapshot-safe question links");

const practiceClient = await read("src/components/practice/practice-agent-client.tsx");
const practiceClientHelpers = await read("src/lib/practice/client-helpers.ts");
const practiceSchema = await read("src/lib/practice/schema.ts");
const practicePersistenceSource = await read("src/lib/practice/persistence.ts");
const practiceRecommendRoute = await read("src/app/api/practice/recommend/route.ts");
const practiceReviewRoute = await read("src/app/api/practice/review/route.ts");
const practiceCustomRoundRoute = await read("src/app/api/practice/rounds/custom/route.ts");
const assignmentPracticeLinkage = await read("src/lib/practice/assignment-linkage.ts");
const assignmentPracticeStartRoute = await read("src/app/api/practice/assignments/start/route.ts");
const practicePage = await read("src/app/practice/page.tsx");
const practiceLoader = await read("src/components/practice/practice-agent-loader.tsx");
assert(!practiceClient.includes("localStorage"), "practice client still uses localStorage");
assert(practiceClient.includes("/api/practice/sessions"), "practice client does not load database sessions");
assert(practiceClient.includes("/api/practice/wrong-questions"), "practice client does not load wrong-question records");
assert(
  practiceSchema.includes("CURRENT_PRACTICE_SESSION_SCHEMA_VERSION") &&
    practiceSchema.includes("practice-session-v2") &&
    practicePersistenceSource.includes("cache_prefix_version: CURRENT_PRACTICE_SESSION_SCHEMA_VERSION") &&
    practicePersistenceSource.includes(".eq(\"cache_prefix_version\", CURRENT_PRACTICE_SESSION_SCHEMA_VERSION)") &&
    practicePersistenceSource.includes("CURRENT_PRACTICE_QUESTION_SNAPSHOT_SCHEMA_VERSION") &&
    practicePersistenceSource.includes("isCurrentPracticeQuestionSnapshot"),
  "practice runtime must use one current session/schema version and ignore old snapshots",
);
assert(
  practiceClientHelpers.includes("CURRENT_PRACTICE_PENDING_ROUND_STORAGE_KEY") &&
    practiceClientHelpers.includes("LEGACY_PRACTICE_STORAGE_KEYS") &&
    !practiceClient.includes("o2i:pendingPracticeRound") &&
    !practiceClientHelpers.includes("o2i:pendingPracticeRound"),
  "practice client must stop reading old pending-round storage keys",
);
for (const source of [practiceRecommendRoute, practiceReviewRoute, practiceCustomRoundRoute]) {
  assert(
    source.includes("CURRENT_PRACTICE_SESSION_SCHEMA_VERSION") &&
      source.includes("PRACTICE_SESSION_EXPIRED_MESSAGE"),
    "practice API routes must reject expired session schema versions",
  );
}
assert(
  assignmentPracticeStartRoute.includes("startAssignmentPractice") &&
    assignmentPracticeStartRoute.includes("requirePracticeApiUser") &&
    assignmentPracticeLinkage.includes("Assignment practice is available only to active students") &&
    assignmentPracticeLinkage.includes('.eq("status", "assigned")') &&
    assignmentPracticeLinkage.includes('.eq("item_type", "question")') &&
    assignmentPracticeLinkage.includes("createPracticeSession") &&
    assignmentPracticeLinkage.includes("persistRecommendationRound") &&
    assignmentPracticeLinkage.includes("assignment_practice_sessions") &&
    assignmentPracticeLinkage.includes("student_assignment_progress") &&
    assignmentPracticeLinkage.includes("updateLinkedAssignmentProgressAfterPractice") &&
    practicePage.includes("assignmentId") &&
    practiceLoader.includes("assignmentId") &&
    practiceLoader.includes("Loading assignment practice workspace") &&
    practiceClient.includes("/api/practice/assignments/start") &&
    practiceClient.includes("Assignment practice") &&
    practiceReviewRoute.includes("updateLinkedAssignmentProgressAfterPractice"),
  "assignment-linked practice must validate assigned student work, create a practice session, and write progress evidence",
);
assert(
  !assignmentPracticeLinkage.includes("course_builder") &&
    !assignmentPracticeLinkage.includes("google") &&
    !assignmentPracticeLinkage.includes("wearable") &&
    !assignmentPracticeLinkage.includes("provider") &&
    !assignmentPracticeStartRoute.includes("course_builder") &&
    !assignmentPracticeStartRoute.includes("google") &&
    !assignmentPracticeStartRoute.includes("wearable"),
  "assignment practice linkage must not add non-goal integrations or provider behavior",
);
console.log("PASS practice client uses current persisted schema and ignores old practice history");

const blueprintObservation = await read("src/lib/ai-pdf-import/blueprint-observation.ts");
const blueprintObservationClustering = await read("src/lib/ai-pdf-import/blueprint-observation-clustering.ts");
const questionBlueprintAnalyzer = await read("src/lib/ai-pdf-import/question-blueprint-analyzer.ts");
const questionBlueprintReview = await read("src/lib/blueprints/question-blueprint-review.ts");
const questionBlueprintLibrary = await read("src/lib/blueprints/question-blueprint-library.ts");
const questionBlueprintPersistence = await read("src/lib/blueprints/question-blueprint-persistence.ts");
const questionBlueprintGeneration = await read("src/lib/blueprints/question-blueprint-generation.ts");
const questionBlueprintGenerationReview = await read("src/lib/blueprints/question-blueprint-generation-review.ts");
const questionBlueprintCalibration = await read("src/lib/blueprints/question-blueprint-calibration.ts");
const questionBlueprintRepair = await read("src/lib/blueprints/question-blueprint-repair.ts");
const questionBlueprintModelRouting = await read("src/lib/blueprints/question-blueprint-model-routing.ts");
const questionBlueprintQuality = await read("src/lib/blueprints/question-blueprint-quality.ts");
const questionBlueprintEditing = await read("src/lib/blueprints/question-blueprint-editing.ts");
const questionBlueprintVersioning = await read("src/lib/blueprints/question-blueprint-versioning.ts");
const questionBlueprintMigration = await read("supabase/migrations/0018_question_blueprint_library.sql");
const questionBlueprintFolderMigration = await read("supabase/migrations/0016_question_blueprint_folders.sql");
const questionBlueprintCalibrationMigration = await read("supabase/migrations/0020_question_blueprint_calibration.sql");
const questionBlueprintVersionMigration = await read("supabase/migrations/0021_question_blueprint_versions.sql");
const questionBlueprintFolders = await read("src/lib/blueprints/question-blueprint-folders.ts");
const aiPdfService = await read("src/lib/ai-pdf-import/service.ts");
const aiPdfActions = await read("src/app/admin/imports/pdf/actions.ts");
const aiPdfPanel = await read("src/components/ai-pdf-import-panel.tsx");
const aiPdfDashboard = await read("src/components/ai-pdf-dashboard/ai-pdf-control-dashboard.tsx");
const reviewDraftCard = await read("src/components/draft-review-card.tsx");
const adminLayout = await read("src/app/admin/layout.tsx");
const adminSidebar = await read("src/components/admin/admin-sidebar.tsx");
for (const exportName of [
  "AIBlueprintObservationPlan",
  "AIBlueprintObservationPacket",
  "AIBlueprintObservedQuestionBlock",
  "AINormalizedBlueprintObservationPacket",
  "buildAIBlueprintObservationPlanFromSummary",
  "buildBlueprintObservationPackets",
  "normalizeBlueprintObservationPackets",
  "validateBlueprintObservationPlan",
  "mergeAIBlueprintObservationPlanIntoSummary",
  "failedAIBlueprintObservationPlan",
  "summarizeBlueprintObservationPlan",
  "buildAIBlueprintObservationProviderPrompt",
  "buildAIBlueprintObservationPlanFromProviderResponse",
  "parseAIBlueprintObservationProviderText",
]) {
  assert(
    blueprintObservation.includes(exportName),
    `blueprint observation schema is missing ${exportName}`,
  );
}
for (const expectedText of [
  "blueprint_observation_plan_v1",
  "summary.aiPdfImport.blueprintObservationPlan",
  "blueprintObservationPlan",
  "textOnlyForAnalyzer: true",
  "rawPdfStored: false",
  "rawImageStored: false",
  "base64Stored: false",
  "providerResponseStored: false",
  "BLUEPRINT_OBSERVATION_EVIDENCE_SNIPPET_MAX_CHARS = 280",
  "blueprint_observation_planning_only",
  "blueprint_observation_no_provider_call",
  "blueprint_observation_no_generation",
  "blueprint_observation_no_review_draft_write",
  "blueprint_observation_no_raw_pdf_storage",
  "blueprint_observation_no_base64_storage",
  "blueprint_observation_missing_preanalysis",
  "blueprint_observation_missing_packet_plan",
  "You are not solving the problem.",
  "Only extract bounded structure/style observations",
  "generatedQuestionCount: 0",
  "providerCallCount: 0",
  "reviewDraftWriteCount: 0",
  "rawStorageCount: 0",
]) {
  assert(
    blueprintObservation.includes(expectedText),
    `blueprint observation guard is missing ${expectedText}`,
  );
}
assert(
  blueprintObservation.includes("boundedText("),
  "blueprint observation must bound evidence and summaries",
);
assert(
  blueprintObservation.includes("assetRefs"),
  "blueprint observation must keep asset references",
);
assert(
  !blueprintObservation.includes("fetch("),
  "blueprint observation must not call providers or network APIs",
);
assert(
  !blueprintObservation.includes("importBatchImportJson"),
  "blueprint observation must not write generated drafts to Review",
);
assert(!blueprintObservation.includes("question_tags"), "blueprint observation must not use legacy question_tags");
assert(!blueprintObservation.includes("video_tags"), "blueprint observation must not use legacy video_tags");
assert(!blueprintObservation.includes("supabase.from("), "blueprint observation must not query the database");
assert(!blueprintObservation.includes(".insert("), "blueprint observation must not insert database rows");
assert(!blueprintObservation.includes(".update("), "blueprint observation must not update database rows");
assert(!blueprintObservation.includes(".delete("), "blueprint observation must not delete database rows");
assert(
  !blueprintObservation.includes("executeBlueprintGenerationRequestWithDeepSeek"),
  "blueprint observation must not restore old DeepSeek execution",
);
assert(
  !blueprintObservation.includes("QuestionBlueprintPlan"),
  "blueprint observation must not restore the old QuestionBlueprintPlan",
);
console.log("PASS blueprint observation schema is planning-only, bounded, and provider-free");

for (const exportName of [
  "AIBlueprintObservationClusterPlan",
  "AIBlueprintObservationCluster",
  "buildAIBlueprintObservationClusterPlan",
  "buildClusteredBlueprintObservationAnalyzerPlans",
  "mergeAIBlueprintObservationClusterPlanIntoSummary",
  "summarizeBlueprintObservationClusterPlan",
]) {
  assert(
    blueprintObservationClustering.includes(exportName),
    `blueprint observation clustering is missing ${exportName}`,
  );
}
for (const expectedText of [
  "blueprint_observation_cluster_plan_v1",
  "summary.aiPdfImport.blueprintObservationClusterPlan",
  "sourceBlockIds",
  "normalizedAnalyzerPacketIds",
  "singleBlockClusterCount",
  "mixedSourceWarningCount",
  "megaClusterAvoidedCount",
  "blueprint_observation_clustering_planning_only",
  "blueprint_observation_clustering_deterministic",
  "blueprint_observation_clustering_no_generation",
  "blueprint_observation_clustering_no_review_draft_write",
  "blueprint_observation_clustering_no_db_write",
  "blueprint_observation_clustering_no_provider_call",
  "blueprint_observation_cluster_uncertain_split",
  "blueprint_observation_cluster_mixed_signals_split",
  "blueprint_observation_cluster_mega_cluster_split",
  "textOnlyForAnalyzer: true",
  "rawPdfStored: false",
  "rawImageStored: false",
  "base64Stored: false",
  "providerResponseStored: false",
  "generatedQuestionCount: 0",
  "providerCallCount: 0",
  "reviewDraftWriteCount: 0",
  "rawStorageCount: 0",
]) {
  assert(
    blueprintObservationClustering.includes(expectedText),
    `blueprint observation clustering guard is missing ${expectedText}`,
  );
}
assert(
  blueprintObservationClustering.includes("taxonomySignals.join") &&
    blueprintObservationClustering.includes("representationGroup") &&
    blueprintObservationClustering.includes("promptVerb") &&
    blueprintObservationClustering.includes("answerStructure"),
  "blueprint observation clustering must fingerprint mixed-topic signals before analysis",
);
assert(
  blueprintObservationClustering.includes("MEGA_CLUSTER_MAX_BLOCKS") &&
    blueprintObservationClustering.includes("splitMegaClusters"),
  "blueprint observation clustering must avoid a single mega-cluster",
);
assert(
  !blueprintObservationClustering.includes("fetch("),
  "blueprint observation clustering must not call providers",
);
assert(
  !blueprintObservationClustering.includes("importBatchImportJson"),
  "blueprint observation clustering must not write Review Drafts",
);
assert(!blueprintObservationClustering.includes("supabase.from("), "blueprint observation clustering must not query the database");
assert(!blueprintObservationClustering.includes(".insert("), "blueprint observation clustering must not insert database rows");
assert(!blueprintObservationClustering.includes(".update("), "blueprint observation clustering must not update database rows");
assert(!blueprintObservationClustering.includes(".delete("), "blueprint observation clustering must not delete database rows");
console.log("PASS blueprint observation clustering is deterministic, bounded, and write-free");

for (const exportName of [
  "AIQuestionBlueprintDraftPlan",
  "AIQuestionBlueprintDraft",
  "buildQuestionBlueprintAnalyzerPrompt",
  "buildQuestionBlueprintDraftPlanFromObservationPlan",
  "buildQuestionBlueprintDraftPlanFromAnalyzerResponse",
  "buildQuestionBlueprintDraftPlanFromClusteredDraftPlans",
  "parseQuestionBlueprintAnalyzerProviderText",
  "executeDeepSeekQuestionBlueprintAnalyzer",
  "skippedQuestionBlueprintDraftPlan",
  "failedQuestionBlueprintDraftPlan",
  "mergeQuestionBlueprintDraftPlanIntoSummary",
  "summarizeQuestionBlueprintDraftPlan",
]) {
  assert(
    questionBlueprintAnalyzer.includes(exportName),
    `question blueprint analyzer is missing ${exportName}`,
  );
}
for (const expectedText of [
  "question_blueprint_draft_plan_v1",
  "summary.aiPdfImport.questionBlueprintDraftPlan",
  "analysis_only",
  "DeepSeek provider is not configured or not enabled.",
  "You are analyzing the style and structure of a source question.",
  "Do not generate a new question.",
  "Do not solve the question.",
  "Do not copy wording.",
  "If packet IDs include blueprint observation cluster prefixes, analyze only that cluster and do not merge it with other clusters.",
  "Return JSON only.",
  "textOnlyForAnalyzer",
  "rawStorageCount: 0",
  "generatedQuestionCount: 0",
  "reviewDraftWriteCount: 0",
  "taxonomyGroundingStatus",
  "taxonomyTargetHints",
  "taxonomyUnresolved",
  "specificityScore",
  "specificityWarnings",
  "Bounded active assignable leaf taxonomy candidates by facet:",
  "Use exact active assignable leaf taxonomy tag IDs only",
  "Do not invent taxonomy IDs.",
  "Do not use parent IDs",
  "set taxonomyUnresolved: true",
  "buildQuestionBlueprintTaxonomyCandidateList",
  "question_blueprint_analyzer_text_only_packets",
  "question_blueprint_analyzer_no_generated_questions",
  "question_blueprint_analyzer_no_review_draft_write",
  "question_blueprint_analyzer_no_raw_pdf_storage",
  "question_blueprint_analyzer_no_image_or_base64_storage",
]) {
  assert(
    questionBlueprintAnalyzer.includes(expectedText),
    `question blueprint analyzer guard is missing ${expectedText}`,
  );
}
assert(
  questionBlueprintAnalyzer.includes("boundedText("),
  "question blueprint analyzer must bound evidence snippets",
);
assert(
  questionBlueprintAnalyzer.includes("buildQuestionBlueprintAnalyzerPrompt") &&
    questionBlueprintAnalyzer.includes("normalizedPacketsForAnalyzer"),
  "question blueprint analyzer must build prompts from normalized packets",
);
assert(
  questionBlueprintAnalyzer.includes("fetch("),
  "question blueprint analyzer should contain the DeepSeek text-only provider runner",
);
assert(
  !questionBlueprintAnalyzer.includes("importBatchImportJson"),
  "question blueprint analyzer must not write generated drafts to Review",
);
assert(!questionBlueprintAnalyzer.includes("question_tags"), "question blueprint analyzer must not use legacy question_tags");
assert(!questionBlueprintAnalyzer.includes("video_tags"), "question blueprint analyzer must not use legacy video_tags");
assert(!questionBlueprintAnalyzer.includes("supabase.from("), "question blueprint analyzer must not query the database");
assert(!questionBlueprintAnalyzer.includes(".insert("), "question blueprint analyzer must not insert database rows");
assert(!questionBlueprintAnalyzer.includes(".update("), "question blueprint analyzer must not update database rows");
assert(!questionBlueprintAnalyzer.includes(".delete("), "question blueprint analyzer must not delete database rows");
console.log("PASS question blueprint analyzer is text-only, bounded, and draft-free");

for (const exportName of [
  "QuestionBlueprintReviewActionPlan",
  "QuestionBlueprintReviewAction",
  "buildQuestionBlueprintReviewActionPlan",
  "validateQuestionBlueprintReviewActionPlan",
  "mergeQuestionBlueprintReviewPlanIntoSummary",
  "summarizeQuestionBlueprintReviewActionPlan",
]) {
  assert(
    questionBlueprintReview.includes(exportName),
    `question blueprint review module is missing ${exportName}`,
  );
}
for (const expectedText of [
  "question_blueprint_review_plan_v1",
  "summary.aiPdfImport.questionBlueprintReviewPlan",
  "approve_blueprint",
  "reject_blueprint",
  "edit_blueprint",
  "merge_similar_blueprint",
  "mark_needs_more_evidence",
  "pending_review",
  "reviewRequired: true",
  "question_blueprint_review_planning_only",
  "question_blueprint_review_no_generated_questions",
  "question_blueprint_review_no_review_draft_write",
  "question_blueprint_review_no_db_write",
  "question_blueprint_review_no_provider_call",
  "generatedQuestionCount: 0",
  "reviewDraftWriteCount: 0",
  "libraryWriteCount: 0",
  "rawStorageCount: 0",
  "This blueprint needs taxonomy mapping before it can become a reusable library entry.",
  "draft.taxonomyGroundingStatus !== \"grounded\"",
]) {
  assert(
    questionBlueprintReview.includes(expectedText),
    `question blueprint review guard is missing ${expectedText}`,
  );
}
assert(!questionBlueprintReview.includes("fetch("), "question blueprint review must not call providers");
assert(!questionBlueprintReview.includes("importBatchImportJson"), "question blueprint review must not write Review Drafts");
assert(!questionBlueprintReview.includes("supabase.from("), "question blueprint review must not query the database");
assert(!questionBlueprintReview.includes(".insert("), "question blueprint review must not insert database rows");
assert(!questionBlueprintReview.includes(".update("), "question blueprint review must not update database rows");
assert(!questionBlueprintReview.includes(".delete("), "question blueprint review must not delete database rows");
console.log("PASS question blueprint review plan is pending-review and write-free");

for (const exportName of [
  "QuestionBlueprintLibraryEntry",
  "QuestionBlueprintLibraryPersistencePlan",
  "buildQuestionBlueprintLibraryPersistencePlan",
  "validateQuestionBlueprintLibraryPersistencePlan",
  "mergeQuestionBlueprintLibraryPersistencePlanIntoSummary",
  "summarizeQuestionBlueprintLibraryPersistencePlan",
]) {
  assert(
    questionBlueprintLibrary.includes(exportName),
    `question blueprint library module is missing ${exportName}`,
  );
}
for (const expectedText of [
  "question_blueprint_library_persistence_plan_v1",
  "summary.aiPdfImport.questionBlueprintLibraryPersistencePlan",
  "ownerScope",
  "system",
  "school",
  "teacher",
  "private",
  "status: \"draft\"",
  "question_blueprint_library_persistence_planning_only",
  "question_blueprint_library_no_db_write",
  "question_blueprint_library_no_generated_questions",
  "question_blueprint_library_no_review_draft_write",
  "question_blueprint_library_pending_human_approval",
  "libraryWriteCount: 0",
  "generatedQuestionCount: 0",
  "reviewDraftWriteCount: 0",
  "rawStorageCount: 0",
]) {
  assert(
    questionBlueprintLibrary.includes(expectedText),
    `question blueprint library guard is missing ${expectedText}`,
  );
}
assert(!questionBlueprintLibrary.includes("fetch("), "question blueprint library must not call providers");
assert(!questionBlueprintLibrary.includes("importBatchImportJson"), "question blueprint library must not write Review Drafts");
assert(!questionBlueprintLibrary.includes("supabase.from("), "question blueprint library must not query the database");
assert(!questionBlueprintLibrary.includes(".insert("), "question blueprint library must not insert database rows");
assert(!questionBlueprintLibrary.includes(".update("), "question blueprint library must not update database rows");
assert(!questionBlueprintLibrary.includes(".delete("), "question blueprint library must not delete database rows");
console.log("PASS question blueprint library persistence is contract-only and write-free");

for (const tableName of [
  "question_blueprints",
  "question_blueprint_examples",
  "question_blueprint_review_actions",
]) {
  assert(
    questionBlueprintMigration.includes(`create table if not exists public.${tableName}`),
    `question blueprint migration is missing ${tableName}`,
  );
  assert(
    questionBlueprintMigration.includes(`alter table public.${tableName} enable row level security`),
    `${tableName} must enable RLS`,
  );
  assert(
    questionBlueprintMigration.includes(`${tableName}_admin_crud`),
    `${tableName} must have admin-only CRUD policy`,
  );
}
for (const expectedText of [
  "owner_scope in ('system', 'school', 'teacher', 'private')",
  "status in ('draft', 'approved', 'deprecated')",
  "status in ('pending_review', 'approved', 'rejected', 'needs_more_evidence', 'archived')",
  "private.is_admin()",
  "to authenticated",
]) {
  assert(
    questionBlueprintMigration.includes(expectedText),
    `question blueprint migration guard is missing ${expectedText}`,
  );
}
assert(
  !questionBlueprintMigration.includes("to anon"),
  "question blueprint migration must not grant anon access",
);

for (const exportName of [
  "validateQuestionBlueprintRow",
  "buildQuestionBlueprintRowsFromApprovedActions",
  "buildQuestionBlueprintLibrarySeedPlan",
  "persistApprovedQuestionBlueprints",
  "summarizeQuestionBlueprintLibrary",
  "buildQuestionBlueprintReviewActionRowsFromImportSummary",
]) {
  assert(
    questionBlueprintPersistence.includes(exportName),
    `question blueprint persistence helper is missing ${exportName}`,
  );
}
for (const expectedText of [
  "QUESTION_BLUEPRINT_DB_TABLES",
  "question_blueprints",
  "question_blueprint_examples",
  "question_blueprint_review_actions",
  "taxonomyGroundingStatus",
  "taxonomyTargetHints",
  "taxonomyUnresolved",
  "specificityScore",
  "specificityWarnings",
  "question_blueprint_library_seed_plan_no_question_generation",
  "question_blueprint_library_seed_plan_no_review_draft_write",
  "question_blueprint_library_seed_plan_no_provider_call",
]) {
  assert(
    questionBlueprintPersistence.includes(expectedText),
    `question blueprint persistence guard is missing ${expectedText}`,
  );
}
assert(!questionBlueprintPersistence.includes("fetch("), "question blueprint persistence must not call providers");
assert(!questionBlueprintPersistence.includes("importBatchImportJson"), "question blueprint persistence must not write Review Drafts");
assert(!questionBlueprintPersistence.includes("callAIPdfExtractionProvider"), "question blueprint persistence must not run extraction");
for (const expectedText of [
  "create table if not exists public.question_blueprint_folders",
  "alter table public.question_blueprints",
  "add column if not exists folder_id",
  "alter table public.question_blueprint_folders enable row level security",
  "question_blueprint_folders_admin_crud",
  "private.is_admin()",
  "to authenticated",
  "Deleting a folder does not delete blueprints",
]) {
  assert(
    questionBlueprintFolderMigration.includes(expectedText),
    `question blueprint folder migration is missing ${expectedText}`,
  );
}
assert(
  !questionBlueprintFolderMigration.includes("to anon"),
  "question blueprint folder migration must not grant anon access",
);
for (const expectedText of [
  "buildQuestionBlueprintFolderTree",
  "flattenQuestionBlueprintFolderTree",
  "wouldCreateQuestionBlueprintFolderCycle",
  "summarizeQuestionBlueprintFolders",
  "normalizeQuestionBlueprintFolderName",
  "slugifyQuestionBlueprintFolderName",
]) {
  assert(
    questionBlueprintFolders.includes(expectedText),
    `question blueprint folder helper is missing ${expectedText}`,
  );
}
assert(!questionBlueprintFolders.includes("fetch("), "question blueprint folder helper must not call providers");
assert(!questionBlueprintFolders.includes("supabase.from("), "question blueprint folder helper must stay DB-free");
console.log("PASS question blueprint DB migration and persistence helpers are admin-only");

assert(
  questionBlueprintVersionMigration.includes("create table if not exists public.question_blueprint_versions") &&
    questionBlueprintVersionMigration.includes("references public.question_blueprints(id) on delete cascade") &&
    questionBlueprintVersionMigration.includes("snapshot jsonb not null") &&
    questionBlueprintVersionMigration.includes("alter table public.question_blueprint_versions enable row level security") &&
    questionBlueprintVersionMigration.includes("question_blueprint_versions_admin_crud") &&
    questionBlueprintVersionMigration.includes("private.is_admin()") &&
    questionBlueprintVersionMigration.includes("to authenticated") &&
    !questionBlueprintVersionMigration.includes("to anon"),
  "question blueprint version migration must be admin-only and avoid anon grants",
);
for (const exportName of [
  "createBlueprintVersionSnapshot",
  "summarizeBlueprintVersionHistory",
]) {
  assert(
    questionBlueprintVersioning.includes(exportName),
    `question blueprint version helper is missing ${exportName}`,
  );
}
for (const expectedText of [
  "answer_spec_pattern",
  "generation_readiness",
  "last_calibrated_at",
  "last_calibration_run_id",
  "taxonomy_targets",
  "changeReason",
]) {
  assert(
    questionBlueprintVersioning.includes(expectedText),
    `question blueprint version helper must snapshot ${expectedText}`,
  );
}
assert(!questionBlueprintVersioning.includes("fetch("), "question blueprint version helper must not call providers");
assert(!questionBlueprintVersioning.includes("supabase.from("), "question blueprint version helper must stay DB-free");
for (const exportName of [
  "validateBlueprintEdit",
  "blueprintEditInputFromParts",
  "applyBlueprintEdit",
  "buildBlueprintSplitDrafts",
  "buildBlueprintMergePreview",
  "createMergedBlueprintDraft",
  "markBlueprintReplacement",
]) {
  assert(
    questionBlueprintEditing.includes(exportName),
    `question blueprint editing helper is missing ${exportName}`,
  );
}
for (const expectedText of [
  "generation_readiness: \"uncalibrated\"",
  "last_calibrated_at: null",
  "last_calibration_run_id: null",
  "status: \"draft\"",
  "mergedFromBlueprintIds",
  "replacedByBlueprintId",
]) {
  assert(
    questionBlueprintEditing.includes(expectedText),
    `question blueprint editing helper guard is missing ${expectedText}`,
  );
}
assert(!questionBlueprintEditing.includes("fetch("), "question blueprint editing helper must not call providers");
assert(!questionBlueprintEditing.includes("supabase.from("), "question blueprint editing helper must stay DB-free");
assert(!questionBlueprintEditing.includes("importBatchImportJson"), "question blueprint editing helper must not write Review Drafts");
console.log("PASS question blueprint editing and versioning are admin-scoped, draft-safe, and provider-free");

for (const expectedText of [
  "validateQuestionBlueprintQuality",
  "generationReady",
  "generationBlockingReasons",
  "approvalReady",
  "approvalBlockingReasons",
  "At least one active assignable concept leaf is required.",
  "At least one active assignable method or task leaf is required.",
  "At least one active assignable form leaf is required.",
  "Originality constraints must be provided.",
  "Bounded source evidence is required.",
  "MCQ option and correct-answer guidance is required.",
  "MCQ distractor pattern is required.",
  "Fill-blank answer structure guidance is required.",
]) {
  assert(
    questionBlueprintQuality.includes(expectedText),
    `question blueprint quality gate is missing ${expectedText}`,
  );
}
assert(
  questionBlueprintPersistence.includes("getQuestionBlueprintApprovalReadinessFromReviewAction") &&
    questionBlueprintPersistence.includes("knownAssignableTagIds") &&
    questionBlueprintPersistence.includes("Blueprint is not approval-ready:"),
  "question blueprint persistence must enforce approval quality gates before approval",
);
assert(
  !questionBlueprintQuality.includes("fetch(") &&
    !questionBlueprintQuality.includes("supabase.from(") &&
    !questionBlueprintQuality.includes("importBatchImportJson"),
  "question blueprint quality helper must be pure and provider/DB-free",
);
console.log("PASS question blueprint quality gates block invalid approval/generation inputs");

for (const exportName of [
  "buildQuestionBlueprintGenerationRequest",
  "buildQuestionBlueprintGenerationPrompt",
  "executeDeepSeekBlueprintGeneration",
  "parseQuestionBlueprintGenerationProviderText",
  "runBlueprintOriginalityGuard",
  "summarizeQuestionBlueprintGenerationResult",
]) {
  assert(
    questionBlueprintGeneration.includes(exportName),
    `question blueprint generation helper is missing ${exportName}`,
  );
}
for (const expectedText of [
  "Generate original questions that follow the approved blueprint structure.",
  "Do not copy the source question wording, numbers, scenario, or surface details.",
  "Preserve concept/method/task/form and cognitive demand.",
  "Return JSON only.",
  "Only approved question blueprints can generate draft questions.",
  "manual_deepseek_text_only",
  "noGeminiCall: true",
  "noOpenAICall: true",
  "reviewRequired: true",
  "response_format: { type: \"json_object\" }",
  "DeepSeek blueprint generation failed with provider status",
  "Blueprint is not generation-ready:",
]) {
  assert(
    questionBlueprintGeneration.includes(expectedText),
    `question blueprint generation guard is missing ${expectedText}`,
  );
}
assert(
  questionBlueprintGeneration.includes("copiedPhraseCount >= 2") &&
    questionBlueprintGeneration.includes("Missing originality constraints from approved blueprint."),
  "question blueprint generation must include deterministic originality blocking",
);
assert(
  !questionBlueprintGeneration.includes("generateWithGeminiNativePdf") &&
    !questionBlueprintGeneration.includes("callAIPdfExtractionProvider"),
  "question blueprint generation must not call Gemini or AI PDF extraction",
);
assert(
  !questionBlueprintGeneration.includes("supabase.from(") &&
    !questionBlueprintGeneration.includes(".insert(") &&
    !questionBlueprintGeneration.includes(".update(") &&
    !questionBlueprintGeneration.includes(".delete("),
  "question blueprint generation helper must not write the database directly",
);
for (const exportName of [
  "buildBlueprintGeneratedReviewDrafts",
  "buildBlueprintGeneratedBatchImportJson",
  "validateBlueprintGeneratedReviewDraft",
  "summarizeBlueprintGeneratedReviewDraftPersistence",
]) {
  assert(
    questionBlueprintGenerationReview.includes(exportName),
    `question blueprint review handoff helper is missing ${exportName}`,
  );
}
for (const expectedText of [
  "source: \"blueprint_generation\"",
  "provider: \"deepseek\"",
  "reviewRequired: true",
  "originalityChecked: true",
  "status: \"draft\"",
  "Generated MCQ draft needs answerSpec kind mcq.",
  "Generated MCQ draft needs a valid correct option reference.",
]) {
  assert(
    questionBlueprintGenerationReview.includes(expectedText),
    `question blueprint review handoff guard is missing ${expectedText}`,
  );
}
assert(
  !questionBlueprintGenerationReview.includes("fetch(") &&
    !questionBlueprintGenerationReview.includes("supabase.from("),
  "question blueprint review handoff helper must not call providers or DB directly",
);
console.log("PASS question blueprint generation is DeepSeek-only, original-draft, and Review-only");

for (const exportName of [
  "QuestionBlueprintRepairRequest",
  "QuestionBlueprintRepairAttempt",
  "QuestionBlueprintRepairResult",
  "buildBlueprintRepairPrompt",
  "runBlueprintDraftRepair",
  "validateRepairedBlueprintDraft",
  "summarizeBlueprintRepairAttempt",
  "repairQuestionBlueprintGenerationResult",
]) {
  assert(
    questionBlueprintRepair.includes(exportName),
    `question blueprint repair helper is missing ${exportName}`,
  );
}
for (const expectedText of [
  "You are not the final judge. The app will re-run local validators after this repair.",
  "Do not weaken, reinterpret, or bypass validation blockers.",
  "Return a complete MCQ draft with a clear question stem.",
  "Include exactly four answer options with stable A/B/C/D ids.",
  "answerSpec.correctOptionId",
  "Do not silently convert this blueprint to FRQ",
  "Do not invent taxonomy ids. Reuse only the provided taxonomyTagIds.",
  "Change scenario, wording, and numeric surface details",
  "response_format: { type: \"json_object\" }",
  "DeepSeek blueprint repair failed with provider status",
]) {
  assert(
    questionBlueprintRepair.includes(expectedText),
    `question blueprint repair guard is missing ${expectedText}`,
  );
}
assert(
  questionBlueprintRepair.includes("request.taxonomyTagIds") &&
    questionBlueprintRepair.includes("invalidTags"),
  "question blueprint repair must reject invented taxonomy ids",
);
assert(
  !questionBlueprintRepair.includes("importBatchImportJson") &&
    !questionBlueprintRepair.includes("supabase.from(") &&
    !questionBlueprintRepair.includes(".insert(") &&
    !questionBlueprintRepair.includes(".update(") &&
    !questionBlueprintRepair.includes(".delete(") &&
    !questionBlueprintRepair.includes("generateWithGeminiNativePdf") &&
    !questionBlueprintRepair.includes("callAIPdfExtractionProvider"),
  "question blueprint repair helper must not write DB, Review Drafts, Gemini, or AI PDF extraction",
);
for (const exportName of [
  "normalizeQuestionBlueprintModelQualityMode",
  "selectQuestionBlueprintDeepSeekProfile",
]) {
  assert(
    questionBlueprintModelRouting.includes(exportName),
    `question blueprint model routing helper is missing ${exportName}`,
  );
}
for (const expectedText of [
  "Quality model is not configured. Falling back to Fast.",
  "deepseek_openai",
  "\"fast\"",
  "\"quality\"",
]) {
  assert(
    questionBlueprintModelRouting.includes(expectedText),
    `question blueprint model quality routing guard is missing ${expectedText}`,
  );
}
assert(
  !questionBlueprintModelRouting.includes("fetch(") &&
    !questionBlueprintModelRouting.includes("supabase.from(") &&
    !questionBlueprintModelRouting.includes(".insert(") &&
    !questionBlueprintModelRouting.includes(".update(") &&
    !questionBlueprintModelRouting.includes(".delete("),
  "question blueprint model routing must be provider-selection only",
);
console.log("PASS question blueprint repair loop is bounded, validator-guided, and model-quality aware");

for (const expectedText of [
  "create table if not exists public.question_blueprint_calibration_runs",
  "sample_count integer not null check (sample_count between 1 and 3)",
  "sample_previews jsonb not null default '[]'::jsonb",
  "generation_readiness",
  "last_calibrated_at",
  "last_calibration_run_id",
  "alter table public.question_blueprint_calibration_runs enable row level security",
  "question_blueprint_calibration_runs_admin_crud",
  "private.is_admin()",
  "to authenticated",
  "never raw provider responses",
]) {
  assert(
    questionBlueprintCalibrationMigration.includes(expectedText),
    `question blueprint calibration migration is missing ${expectedText}`,
  );
}
assert(
  !questionBlueprintCalibrationMigration.includes("to anon"),
  "question blueprint calibration migration must not grant anon access",
);
for (const exportName of [
  "runQuestionBlueprintCalibration",
  "validateQuestionBlueprintCalibrationSample",
  "evaluateBlueprintAdherence",
  "evaluateCalibrationDiversity",
  "summarizeQuestionBlueprintCalibration",
  "deriveBlueprintGenerationReadiness",
]) {
  assert(
    questionBlueprintCalibration.includes(exportName),
    `question blueprint calibration helper is missing ${exportName}`,
  );
}
for (const expectedText of [
  "function sampleCount",
  "Math.min(3, Math.max(1",
  "executeDeepSeekBlueprintGeneration",
  "noReviewDraftWrite: true",
  "noDbWrite: true",
  "noGeminiCall: true",
  "noOpenAICall: true",
  "noRawProviderResponseStorage: true",
  "Calibration sample needs taxonomy leaf IDs.",
  "MCQ calibration sample requires at least two options.",
  "MCQ calibration sample needs a valid correct option reference.",
  "Calibration sample is too close to bounded source evidence.",
  "Calibration samples are near-duplicates.",
  "runBlueprintDraftRepair",
  "repairEnabled",
  "repairAttemptCount",
  "Automatic repair was attempted but validation blockers remain.",
  "generation_ready",
  "needs_edit",
  "blocked",
]) {
  assert(
    questionBlueprintCalibration.includes(expectedText),
    `question blueprint calibration guard is missing ${expectedText}`,
  );
}
assert(
  !questionBlueprintCalibration.includes("importBatchImportJson") &&
    !questionBlueprintCalibration.includes("supabase.from(") &&
    !questionBlueprintCalibration.includes(".insert(") &&
    !questionBlueprintCalibration.includes(".update(") &&
    !questionBlueprintCalibration.includes("generateWithGeminiNativePdf") &&
    !questionBlueprintCalibration.includes("callAIPdfExtractionProvider"),
  "question blueprint calibration helper must not write DB, Review Drafts, Gemini, or AI PDF extraction",
);
console.log("PASS question blueprint calibration is DeepSeek-only, temporary, and readiness-gated");

for (const expectedText of [
  "blueprint_observation",
  "processAIPdfBlueprintObservation",
  "buildAIBlueprintObservationProviderPrompt",
  "parseAIBlueprintObservationProviderText",
  "buildAndStoreQuestionBlueprintDraftPlan",
  "buildAIBlueprintObservationClusterPlan",
  "buildClusteredBlueprintObservationAnalyzerPlans",
  "mergeAIBlueprintObservationClusterPlanIntoSummary",
  "updateAIBlueprintObservationClusterPlan",
  "question_blueprint_clustering",
  "loadDeepSeekBlueprintAnalyzerProvider",
  "executeDeepSeekQuestionBlueprintAnalyzer",
  "buildQuestionBlueprintDraftPlanFromClusteredDraftPlans",
  "mergeQuestionBlueprintDraftPlanIntoSummary",
  "buildQuestionBlueprintReviewActionPlan",
  "mergeQuestionBlueprintReviewPlanIntoSummary",
  "buildQuestionBlueprintLibraryPersistencePlan",
  "mergeQuestionBlueprintLibraryPersistencePlanIntoSummary",
  "generateWithGeminiNativePdf",
  "mockBlueprintObservationProviderResponse",
  "Blueprint Observation Mode completed. Question blueprint review/library plans were created without generating questions.",
  "Question blueprint analyzer finished. No generated questions or Review Drafts were created.",
  "Blueprint review/library planning finished. Library persistence is planned only.",
  "status: \"ready\"",
  "createdCount: 0",
  "createdQuestions: []",
]) {
  assert(
    aiPdfService.includes(expectedText),
    `AI PDF service is missing blueprint observation mode wiring: ${expectedText}`,
  );
}
const observationProcessor = aiPdfService.slice(
  aiPdfService.indexOf("async function processAIPdfBlueprintObservation"),
  aiPdfService.indexOf("async function processAIPdfSinglePass"),
);
assert(
  observationProcessor.includes("generateWithGeminiNativePdf"),
  "blueprint observation mode must use Gemini Native provider path when not mocked",
);
assert(
  observationProcessor.includes("isMockAIProviderUrl"),
  "blueprint observation mode must support mocked provider responses for tests",
);
assert(
  !observationProcessor.includes("importBatchImportJson"),
  "blueprint observation mode must not create Review Drafts",
);
assert(
  !observationProcessor.includes("buildImportJson"),
  "blueprint observation mode must not build question import JSON",
);
assert(
  !observationProcessor.includes("attachCroppedAssets"),
  "blueprint observation mode must not attach question crops",
);
assert(
  aiPdfService.includes("QUESTION_BLUEPRINT_ANALYZER_MISSING_DEEPSEEK_WARNING") &&
    aiPdfService.includes("skippedQuestionBlueprintDraftPlan"),
  "blueprint observation mode must handle missing DeepSeek config safely",
);
assert(
  aiPdfService.includes("selectQuestionBlueprintDeepSeekProfile") &&
    aiPdfService.includes("blueprintModelQualityMode") &&
    aiPdfService.includes("blueprintModelQualityFallbackReason"),
  "blueprint observation analyzer must preserve model quality mode metadata",
);
assert(
  aiPdfService.includes("for (const clusterAnalyzerPlan of clusterAnalyzerPlans)") &&
    !aiPdfService.includes("Promise.all(clusterAnalyzerPlans"),
  "blueprint observation clustering must analyze clusters sequentially, not with unordered Promise.all",
);
assert(
  aiPdfService.includes("providerInput.strategy !== \"gemini_native_pdf\"") &&
    aiPdfService.includes("providerInput.strategy !== \"mock\""),
  "blueprint observation mode must guard provider strategy",
);
assert(
  aiPdfActions.includes("\"blueprint_observation\"") &&
    aiPdfActions.includes("Blueprint observation mode requires a Gemini Native full PDF provider"),
  "AI PDF actions must validate blueprint observation mode before queueing",
);
assert(
  aiPdfPanel.includes("Blueprint observation only") &&
    aiPdfPanel.includes("stores safe structure/style metadata and creates no questions") &&
    aiPdfPanel.includes("Blueprint AI quality mode") &&
    aiPdfPanel.includes("setBlueprintModelQualityMode") &&
    aiPdfPanel.includes("blueprintModelQualityMode"),
  "AI PDF panel must expose blueprint observation mode with safe copy",
);
assert(
    aiPdfDashboard.includes("Blueprint Observation Mode") &&
    aiPdfDashboard.includes("Observation packets:") &&
    aiPdfDashboard.includes("Normalized analyzer packets:") &&
    aiPdfDashboard.includes("No questions were created by design."),
  "AI PDF dashboard must surface blueprint observation metadata",
);
assert(
  aiPdfDashboard.includes("Blueprint Observation Clusters") &&
    aiPdfDashboard.includes("Clusters:") &&
    aiPdfDashboard.includes("Single-block clusters:") &&
    aiPdfDashboard.includes("Mixed-source warnings:") &&
    aiPdfDashboard.includes("Source questions were split into separate blueprint") &&
    aiPdfDashboard.includes("candidates before DeepSeek analysis."),
  "AI PDF dashboard must surface blueprint observation cluster metadata",
);
assert(
  aiPdfDashboard.includes("Question Blueprint Drafts") &&
    aiPdfDashboard.includes("Draft count:") &&
    aiPdfDashboard.includes("Review required: yes") &&
    aiPdfDashboard.includes("No questions generated yet."),
  "AI PDF dashboard must surface question blueprint draft metadata",
);
assert(
  aiPdfDashboard.includes("Question Blueprint Review") &&
    aiPdfDashboard.includes("Drafts pending review:") &&
    aiPdfDashboard.includes("Approved-ready actions:") &&
    aiPdfDashboard.includes("Library persistence:") &&
    aiPdfDashboard.includes("planned only"),
  "AI PDF dashboard must surface question blueprint review/library metadata",
);
assert(
  aiPdfDashboard.includes("Blueprint observation completed") &&
    aiPdfDashboard.includes("Open Blueprint Library") &&
    aiPdfDashboard.includes("Review and approve extracted question blueprints") &&
    aiPdfDashboard.includes("No questions were created by design.") &&
    aiPdfDashboard.includes("Clusters:") &&
    aiPdfDashboard.includes("Drafts pending review:") &&
    aiPdfDashboard.includes("Approved-ready actions:") &&
    aiPdfDashboard.includes("Safety notes: no generated questions"),
  "AI PDF dashboard must show blueprint observation completion handoff",
);
assert(
  aiPdfDashboard.includes("Review Draft handoff") &&
    aiPdfDashboard.includes("Review generated drafts") &&
    aiPdfDashboard.includes("Review warnings, taxonomy, media, and solutions before any") &&
    aiPdfPanel.includes("AI-generated questions are private drafts until an admin reviews") &&
    reviewDraftCard.includes("Generated drafts stay private") &&
    reviewDraftCard.includes("Warnings to review"),
  "AI PDF and Review Draft UI must expose draft-only handoff without auto-publish copy",
);
assert(
  aiPdfPanel.includes("isAIPdfBlueprintObservationCompletePhase") &&
    aiPdfPanel.includes("BlueprintObservationCompletionCallout") &&
    aiPdfPanel.includes("Open Blueprint Library") &&
    aiPdfPanel.includes("No questions were created by design.") &&
    aiPdfPanel.includes("!isAIPdfBlueprintObservationCompletePhase(activePhase)"),
  "AI PDF live panel must suppress the running spinner after blueprint observation completion",
);
assert(
  adminLayout.includes("AdminShell") &&
    adminSidebar.includes("Primary") &&
    adminSidebar.includes("Advanced tools") &&
    adminSidebar.includes("Settings") &&
    adminSidebar.includes("Blueprint Library") &&
    adminSidebar.includes("AI Parsing") &&
    adminSidebar.includes("Review Drafts") &&
    adminSidebar.includes("Manual JSON Import") &&
    adminSidebar.includes("/admin/blueprints") &&
    adminSidebar.includes("/admin/imports/pdf") &&
    adminSidebar.includes("aria-current"),
  "admin navigation must expose grouped primary, advanced, and settings links",
);
console.log("PASS blueprint observation mode is explicit, summary-only, and draft-free");

const blueprintPage = await read("src/app/admin/blueprints/page.tsx");
const blueprintReviewPage = await read("src/app/admin/blueprints/review/page.tsx");
const blueprintLibraryPage = await read("src/app/admin/blueprints/library/page.tsx");
const blueprintHistoryPage = await read("src/app/admin/blueprints/history/page.tsx");
const blueprintSourcesPage = await read("src/app/admin/blueprints/sources/page.tsx");
const blueprintWorkspace = await read("src/components/blueprints/blueprint-workspace.tsx");
const blueprintActions = await read("src/app/admin/blueprints/actions.ts");
assert(
  blueprintPage.includes("view=\"overview\"") &&
    blueprintReviewPage.includes("view=\"review\"") &&
    blueprintLibraryPage.includes("view=\"library\"") &&
    blueprintHistoryPage.includes("view=\"history\"") &&
    blueprintSourcesPage.includes("view=\"sources\"") &&
    blueprintWorkspace.includes("Question Blueprint Workspace") &&
    blueprintWorkspace.includes("Blueprint Review Queue") &&
    blueprintWorkspace.includes("Approved Blueprint Library") &&
    blueprintWorkspace.includes("History / Archive / Trash") &&
    blueprintWorkspace.includes("Blueprint Import Sources"),
  "question blueprint workspace routes or page copy are missing",
);
assert(
  blueprintWorkspace.includes("BlueprintWorkspaceNav") &&
    blueprintWorkspace.includes("Review blueprints") &&
    blueprintWorkspace.includes("Open library") &&
    blueprintWorkspace.includes("Manage folders") &&
    blueprintWorkspace.includes("Open sources") &&
    blueprintWorkspace.includes("ReviewActionPreview") &&
    blueprintWorkspace.includes("LibraryBlueprintPreview") &&
    blueprintWorkspace.includes("view === \"sources\" || view === \"overview\"") &&
    blueprintWorkspace.includes("view === \"review\" || view === \"overview\"") &&
    blueprintWorkspace.includes("view === \"library\" || view === \"overview\"") &&
    blueprintWorkspace.includes("view === \"history\""),
  "blueprint workspace must split overview/review/library/sources/history instead of one long debug page",
);
assert(blueprintWorkspace.includes("requireAdmin"), "blueprint workspace must remain admin-only");
assert(
    blueprintWorkspace.includes("Setup needed") &&
    blueprintWorkspace.includes("0018_question_blueprint_library.sql") &&
    blueprintWorkspace.includes("0016_question_blueprint_folders.sql") &&
    blueprintWorkspace.includes("0020_question_blueprint_calibration.sql") &&
    blueprintWorkspace.includes("0021_question_blueprint_versions.sql"),
  "blueprint library page must show setup-needed message when tables are missing",
);
assert(
  blueprintWorkspace.includes("Pending blueprint review actions") &&
    blueprintWorkspace.includes("Active library") &&
    blueprintWorkspace.includes("Store review actions") &&
    blueprintWorkspace.includes("Approve blueprint") &&
    blueprintWorkspace.includes("Needs more evidence") &&
    blueprintWorkspace.includes("Reject"),
  "blueprint library page must expose admin review workflow",
);
assert(
  blueprintActions.includes("requireAdmin") &&
    blueprintActions.includes("storeBlueprintReviewActionsFromImportBatch") &&
    blueprintActions.includes("updateBlueprintReviewActionTaxonomyTargets") &&
    blueprintActions.includes("approveQuestionBlueprintReviewAction") &&
    blueprintActions.includes("rejectQuestionBlueprintReviewAction") &&
    blueprintActions.includes("markQuestionBlueprintNeedsEvidence") &&
    blueprintActions.includes("persistApprovedQuestionBlueprints"),
  "blueprint library actions must be admin-only and use persistence helpers",
);
assert(
  blueprintWorkspace.includes("Blueprint folders") &&
    blueprintWorkspace.includes("All blueprints") &&
    blueprintWorkspace.includes("Unfiled") &&
    blueprintWorkspace.includes("Folder tree") &&
    blueprintWorkspace.includes("Create folder") &&
    blueprintWorkspace.includes("Move to folder") &&
    blueprintWorkspace.includes("No blueprints in this folder yet.") &&
    blueprintWorkspace.includes("never hard-deleted by folder actions"),
  "blueprint library page must expose folder tree, unfiled, and move-to-folder UI",
);
assert(
  blueprintActions.includes("createQuestionBlueprintFolder") &&
    blueprintActions.includes("renameQuestionBlueprintFolder") &&
    blueprintActions.includes("moveQuestionBlueprintFolder") &&
    blueprintActions.includes("archiveQuestionBlueprintFolder") &&
    blueprintActions.includes("restoreQuestionBlueprintFolder") &&
    blueprintActions.includes("moveQuestionBlueprintToFolder") &&
    blueprintActions.includes("wouldCreateQuestionBlueprintFolderCycle") &&
    blueprintActions.includes("folder_id: folderId") &&
    blueprintActions.includes("Filed blueprints are preserved") &&
    !blueprintActions.includes("question_blueprint_folders\").delete("),
  "blueprint folder actions must be admin-only, cycle-safe, and soft-delete only",
);
assert(
  blueprintWorkspace.includes("Calibration status") &&
    blueprintWorkspace.includes("Run calibration preview") &&
    blueprintWorkspace.includes("Repair failed samples automatically") &&
    blueprintWorkspace.includes("rerun calibration using Quality mode") &&
    blueprintWorkspace.includes("Temporary calibration samples") &&
    blueprintWorkspace.includes("not saved as questions") &&
    blueprintWorkspace.includes("sent to Review") &&
    blueprintWorkspace.includes("Run a successful calibration preview before generating Review Draft questions.") &&
    blueprintWorkspace.includes("Blueprint changed after the last successful calibration.") &&
    blueprintWorkspace.includes("Re-run calibration for the current version.") &&
    blueprintWorkspace.includes("Generation disabled"),
  "blueprint library page must show calibration status and gate full generation",
);
assert(
  blueprintActions.includes("runBlueprintCalibrationPreview") &&
    blueprintActions.includes("runQuestionBlueprintCalibration") &&
    blueprintActions.includes("repairEnabled") &&
    blueprintActions.includes("modelQualityMode") &&
    blueprintActions.includes("qualityFallbackReason") &&
    blueprintActions.includes("question_blueprint_calibration_runs") &&
    blueprintActions.includes("generation_readiness: summary.readiness") &&
    blueprintActions.includes("last_calibration_run_id") &&
    blueprintActions.includes("Number(calibrationRun.blueprint_version) !== Number(blueprint.version)") &&
    blueprintActions.includes("Blueprint changed after the last successful calibration. Re-run calibration for the current version.") &&
    blueprintActions.includes("Run a successful calibration preview before generating Review Draft questions.") &&
    blueprintActions.indexOf("generation_readiness !== \"generation_ready\"") <
      blueprintActions.lastIndexOf("executeDeepSeekBlueprintGeneration"),
  "blueprint actions must run manual calibration and block full generation before provider execution",
);
assert(
  blueprintActions.includes("loadActiveAssignableLeafTaxonomyByFacet") &&
    blueprintActions.includes("Parent taxonomy nodes cannot be used directly. Choose a specific assignable leaf tag.") &&
    blueprintActions.includes("taxonomyGroundingStatus") &&
    blueprintActions.includes("status: \"pending_review\"") &&
    blueprintActions.includes("draft_snapshot: nextSnapshot"),
  "blueprint taxonomy manual edit action must validate active assignable leaf tags and reopen review",
);
assert(
  blueprintWorkspace.includes("Generate original draft questions") &&
    blueprintWorkspace.includes("Manual DeepSeek call") &&
    blueprintWorkspace.includes("Repair failed drafts automatically") &&
    blueprintWorkspace.includes("Open Review Drafts") &&
    blueprintWorkspace.includes("never published automatically"),
  "blueprint library page must expose manual BP6 generation and review handoff copy",
);
assert(
    blueprintWorkspace.includes("Edit taxonomy targets") &&
    blueprintWorkspace.includes("selectable=\"assignable_leaf\"") &&
    blueprintWorkspace.includes("Needs more evidence") &&
    blueprintWorkspace.includes("Rejected") &&
    blueprintWorkspace.includes("Grouped taxonomy targets") &&
    blueprintWorkspace.includes("Short pattern summary") &&
    blueprintWorkspace.includes("Source refs and internal notes") &&
    blueprintWorkspace.includes("Draft ID:") &&
    blueprintWorkspace.includes("overflowWrap: \"anywhere\"") &&
    blueprintWorkspace.includes("Debug details") &&
    blueprintWorkspace.includes("Raw reason:") &&
    blueprintWorkspace.includes("This blueprint came from observation cluster") &&
    blueprintWorkspace.includes("needs taxonomy mapping before approval"),
  "blueprint library page must expose manual taxonomy edit, status sections, and readable cluster copy",
);
assert(
  blueprintActions.includes("generateOriginalQuestionsFromApprovedBlueprint") &&
    blueprintActions.includes("archiveQuestionBlueprint") &&
    blueprintActions.includes("restoreQuestionBlueprint") &&
    blueprintActions.includes("moveQuestionBlueprintToTrash") &&
    blueprintActions.includes("loadActiveAssignableTaxonomyTagIds") &&
    blueprintActions.includes("loadDeepSeekBlueprintGenerationProvider") &&
    blueprintActions.includes("executeDeepSeekBlueprintGeneration") &&
    blueprintActions.includes("repairQuestionBlueprintGenerationResult") &&
    blueprintActions.includes("importBatchImportJson") &&
    blueprintActions.includes("reviewRequired: true") &&
    blueprintActions.includes("originalityChecked: true") &&
    blueprintActions.includes("Generated draft questions were sent to Review Drafts.") &&
    blueprintActions.includes("DeepSeek provider is not configured or not enabled."),
  "blueprint generation action must be admin-only, DeepSeek-only, and Review-Draft-only",
);
assert(
  questionBlueprintGenerationReview.includes("status: \"draft\"") &&
    questionBlueprintGenerationReview.includes("source: \"blueprint_generation\"") &&
    questionBlueprintGenerationReview.includes("provider: \"deepseek\"") &&
    questionBlueprintGenerationReview.includes("reviewRequired: true") &&
    questionBlueprintGenerationReview.includes("tag_ids: draft.taxonomyTagIds"),
  "blueprint generation review handoff must create draft-only taxonomy-tagged Review payloads",
);
assert(
  blueprintActions.includes("deleted_at: new Date().toISOString()") &&
    blueprintActions.includes("status: \"deprecated\"") &&
    blueprintActions.includes("Permanent delete is deferred to preserve lineage.") &&
    !blueprintActions.includes(".delete("),
  "blueprint lifecycle actions must use soft delete/archive and avoid hard delete",
);
assert(
  blueprintActions.indexOf("buildQuestionBlueprintGenerationRequest") <
    blueprintActions.indexOf("loadDeepSeekBlueprintGenerationProvider"),
  "blueprint generation readiness must be checked before loading/calling DeepSeek",
);
assert(
  !blueprintActions.includes("generateWithGeminiNativePdf") &&
    !blueprintActions.includes("callAIPdfExtractionProvider"),
  "blueprint generation action must not run Gemini or AI PDF extraction",
);
assert(!blueprintActions.includes("callAIPdfExtractionProvider"), "blueprint library actions must not run extraction");
for (const removedBlueprintSurface of [
  "Question blueprint preview",
  "QuestionBlueprintPlan",
  "Run DeepSeek draft generation",
  "Provider run shadow plan",
  "executeBlueprintGenerationRequestWithDeepSeek",
  "persistBlueprintReviewDrafts",
  "buildQuestionBlueprintPlan",
  "buildBlueprintProviderRunPlan",
  "buildBlueprintGenerationRequestPlan",
]) {
  assert(
    !blueprintWorkspace.includes(removedBlueprintSurface),
    `old blueprint product surface remains on library page: ${removedBlueprintSurface}`,
  );
}
assert(
  blueprintWorkspace.includes("Active library") &&
    blueprintWorkspace.includes("Archived / Trash") &&
    blueprintWorkspace.includes("Quality gate blockers") &&
    blueprintWorkspace.includes("Generation disabled") &&
    blueprintWorkspace.includes("Deprecate") &&
    blueprintWorkspace.includes("Move to trash") &&
    blueprintWorkspace.includes("Restore") &&
    blueprintWorkspace.includes("Permanent") &&
    blueprintWorkspace.includes("hard delete is intentionally deferred"),
  "blueprint page must expose lifecycle controls and readable quality blockers",
);
assert(
  blueprintWorkspace.includes("Edit, version, split / merge") &&
    blueprintWorkspace.includes("Version history") &&
    blueprintWorkspace.includes("Current version:") &&
    blueprintWorkspace.includes("Edit blueprint fields") &&
    blueprintWorkspace.includes("Save blueprint edit") &&
    blueprintWorkspace.includes("Saving a meaningful edit sets generation readiness to uncalibrated.") &&
    blueprintWorkspace.includes("Advanced split / merge") &&
    blueprintWorkspace.includes("Split blueprint") &&
    blueprintWorkspace.includes("Merge preview") &&
    blueprintWorkspace.includes("Deprecate and replace") &&
    blueprintWorkspace.includes("question_blueprint_versions"),
  "blueprint page must expose edit/version/split/merge UI and version history",
);
assert(
  blueprintActions.includes("updateQuestionBlueprintFields") &&
    blueprintActions.includes("splitQuestionBlueprint") &&
    blueprintActions.includes("createMergedQuestionBlueprintDraft") &&
    blueprintActions.includes("replaceQuestionBlueprint") &&
    blueprintActions.includes("insertBlueprintVersionSnapshot") &&
    blueprintActions.includes("question_blueprint_versions") &&
    blueprintActions.includes("applyBlueprintEdit") &&
    blueprintActions.includes("buildBlueprintSplitDrafts") &&
    blueprintActions.includes("createMergedBlueprintDraft") &&
    blueprintActions.includes("markBlueprintReplacement") &&
    blueprintActions.includes("Blueprint updated. Calibration was invalidated") &&
    blueprintActions.includes("Source blueprints were not deleted.") &&
    blueprintActions.includes("Blueprint deprecated and linked to its replacement.") &&
    !blueprintActions.includes(".delete("),
  "blueprint actions must snapshot before edits and use draft/soft-delete edit workflows",
);
const durableAiJobsMigration = await read(
  "supabase/clean-migrations/0033_ai_provider_jobs.sql",
);
const durableAiJobsWorkerRoleFix = await read(
  "supabase/clean-migrations/0034_ai_provider_jobs_worker_role_fix.sql",
);
const providerRoutingCircuitMigration = await read(
  "supabase/clean-migrations/0035_ai_provider_routing_circuit_breaker.sql",
);
const aiOperationsMigration = await read(
  "supabase/clean-migrations/0036_ai_operations_launch_readiness.sql",
);
const aiOperationsTelemetry = await read("src/lib/ai-operations/telemetry.ts");
const aiOperationsDashboard = await read("src/lib/ai-operations/dashboard.ts");
const providerRouting = await read("src/lib/ai-providers/routing.ts");
const durableAiJobsWorker = await read("src/lib/ai-jobs/worker.ts");
const durableAiJobsRoute = await read("src/app/api/internal/ai-jobs/run/route.ts");
assert(
  durableAiJobsMigration.includes("alter table public.ai_provider_jobs enable row level security") &&
    durableAiJobsMigration.includes("No insert/update/delete policies") &&
    durableAiJobsMigration.includes("for update of job skip locked") &&
    durableAiJobsMigration.includes("revoke all on function public.claim_ai_provider_jobs") &&
    durableAiJobsMigration.includes("grant execute on function public.claim_ai_provider_jobs") &&
    durableAiJobsWorkerRoleFix.includes("nullif(auth.role()::text, '')") &&
    durableAiJobsWorkerRoleFix.includes("create or replace function public.finish_ai_provider_job") &&
    !durableAiJobsMigration.includes("api_key_ciphertext") &&
    !durableAiJobsMigration.includes("signed_url"),
  "durable AI jobs must be RLS-protected, atomically claimed by trusted workers, and secret-free",
);
assert(
  providerRoutingCircuitMigration.includes(
    "create table if not exists public.ai_provider_routing_policies",
  ) &&
    providerRoutingCircuitMigration.includes(
      "create table if not exists private.ai_provider_runtime_states",
    ) &&
    providerRoutingCircuitMigration.includes("acquire_ai_provider_half_open_probe") &&
    providerRoutingCircuitMigration.includes("record_ai_provider_route_outcome") &&
    providerRoutingCircuitMigration.includes("enable row level security") &&
    providerRoutingCircuitMigration.includes("to service_role") &&
    !providerRoutingCircuitMigration.includes("api_key_ciphertext") &&
    providerRouting.includes("providerSupportsAIProviderRoutingOperation") &&
    providerRouting.includes("blueprint_observe_pdf") &&
    providerRouting.includes("blueprint_analyze_text") &&
    !providerRouting.includes("process.env.GEMINI"),
  "provider routing must be capability-aware, service-role guarded, and free of provider credentials",
);
assert(
  durableAiJobsWorker.includes("recordAIPdfProviderFailure") &&
    durableAiJobsWorker.includes("safeAIProviderErrorState") &&
    durableAiJobsWorker.includes("retry_wait") &&
    !durableAiJobsWorker.includes("createAssignment") &&
    durableAiJobsRoute.includes("AI_JOBS_INTERNAL_TOKEN") &&
    durableAiJobsRoute.includes("x-ai-jobs-internal-token") &&
    !durableAiJobsRoute.includes("request.json"),
  "durable AI worker must preserve Review Draft safety and reject arbitrary public job payloads",
);
assert(
  aiOperationsMigration.includes("create table if not exists public.ai_operations_controls") &&
    aiOperationsMigration.includes("create table if not exists public.ai_operation_telemetry") &&
    aiOperationsMigration.includes("enable row level security") &&
    aiOperationsMigration.includes("pause_new_enqueues") &&
    aiOperationsMigration.includes("pause_worker_claims") &&
    aiOperationsMigration.includes("queued_reservation") &&
    aiOperationsMigration.includes("record_ai_operation_telemetry") &&
    aiOperationsMigration.includes("reset_ai_provider_runtime_state_for_admin") &&
    !aiOperationsMigration.includes("raw_prompt") &&
    !aiOperationsMigration.includes("raw_response") &&
    !aiOperationsMigration.includes("signed_url") &&
    !aiOperationsMigration.includes("api_key"),
  "AI operations controls and telemetry must stay RLS-protected and free of private provider content",
);
assert(
  aiOperationsTelemetry.includes("record_ai_operation_telemetry") &&
    aiOperationsTelemetry.includes("estimateAIProviderCost") &&
    durableAiJobsWorker.includes("getAIWorkerOperationsControl") &&
    durableAiJobsWorker.includes("recordAIOperationTelemetry") &&
    aiOperationsDashboard.includes("require") === false,
  "AI operations telemetry must remain worker-only while the admin dashboard exposes safe aggregates",
);
console.log("PASS question blueprint library admin surface has lifecycle gates and manual Review-Draft handoff");
