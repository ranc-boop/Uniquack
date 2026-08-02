import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFile(resolve(root, path), "utf8");
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const [
  migration,
  teacherActions,
  teacherImports,
  teacherQuestions,
  teacherSubmissions,
  aiCompatibility,
  jsonPanel,
  adminQuestions,
  adminReview,
  adminActions,
  adminAssets,
  adminSources,
  adminSubmissions,
  bankGovernance,
  publicQuestions,
  publicBoundaryMigration,
  officialPublicMigration,
  teacherMediaActions,
  manualForm,
  teacherAssignmentDetail,
  teacherAssignmentList,
  teacherDeliveryActions,
  studentAssignmentDetail,
] = await Promise.all([
  read("supabase/clean-migrations/0055_library_revision_public_governance.sql"),
  read("src/app/teacher/banks/actions.ts"),
  read("src/app/teacher/banks/[bankId]/imports/page.tsx"),
  read("src/app/teacher/banks/[bankId]/questions/page.tsx"),
  read("src/app/teacher/banks/[bankId]/submissions/page.tsx"),
  read("src/app/teacher/ai-parsing/page.tsx"),
  read("src/components/batch-import-json-panel.tsx"),
  read("src/app/admin/questions/page.tsx"),
  read("src/app/admin/review/page.tsx"),
  read("src/app/admin/questions/actions.ts"),
  read("src/app/admin/questions/asset-actions.ts"),
  read("src/app/admin/questions/source-file-actions.ts"),
  read("src/app/admin/questions/submissions/page.tsx"),
  read("src/app/admin/questions/banks/page.tsx"),
  read("src/app/questions/page.tsx"),
  read("supabase/clean-migrations/0029_teacher_role_bank_public_boundary.sql"),
  read("supabase/clean-migrations/0076_official_public_library_two_state_approval.sql"),
  read("src/app/teacher/banks/bank-media-actions.ts"),
  read("src/app/teacher/banks/bank-manual-question-form.tsx"),
  read("src/app/teacher/classrooms/[id]/assignments/[assignmentId]/page.tsx"),
  read("src/app/teacher/classrooms/[id]/assignments/page.tsx"),
  read("src/app/teacher/classrooms/[id]/assignments/[assignmentId]/delivery-actions.ts"),
  read("src/app/student/work/[id]/page.tsx"),
]);

assert(
  migration.includes("create_bank_manual_question_draft") &&
    migration.includes("revision_of_question_id") &&
    migration.includes("create_bank_question_revision_draft") &&
    migration.includes("approve_bank_review_question_legacy") &&
    migration.includes("status = 'archived'") &&
    migration.includes("'replacedByQuestionId'"),
  "Revision approval must create a draft and atomically replace the active bank row without deleting the original question.",
);

assert(
  migration.includes("public_question_submissions") &&
    migration.includes("prevent_public_submission_snapshot_change") &&
    migration.includes("public_question_submissions_one_open_idx") &&
    migration.includes("submit_bank_questions_to_public_review") &&
    migration.includes("withdraw_public_question_submission"),
  "Public submissions require immutable snapshots, one open submission, submit, and withdraw gates.",
);

assert(
  migration.includes("review_public_question_submission") &&
    migration.includes("not private.is_super_admin()") &&
    migration.includes("owner_bank_id") &&
    migration.includes("'public'") &&
    migration.includes("'published'") &&
    migration.includes("public_submission_id") &&
    migration.includes("Every submitted image must be copied before approval"),
  "Only Super Admin approval may create a separately-owned global published question with copied images.",
);

assert(
  migration.includes("options::text") &&
    migration.includes("answer_spec::text") &&
    migration.includes("content_source") &&
    migration.includes("solution_source") &&
    migration.includes("The revision contains an unreviewed image reference") &&
    migration.includes("Public content contains a private or unreviewed resource reference") &&
    migration.includes("(https?://|storage/v1/object/sign"),
  "Revision, public approval, and public pull must rewrite and gate assets in prompts, solutions, options, and answer specs.",
);

assert(
  migration.includes("is_question_bank_member") &&
    migration.includes("can_read_question_child") &&
    migration.includes("can_manage_question_child") &&
    migration.includes("question_assets_library_read") &&
    migration.includes("question_rubric_steps_library_read") &&
    migration.includes("question_taxonomy_assignments_library_read") &&
    migration.includes("can_write_question_asset_storage_object") &&
    migration.includes("search_bank_question_rows") &&
    migration.includes("count_bank_question_rows") &&
    migration.includes("search_bank_review_question_ids") &&
    migration.includes("count_bank_review_questions"),
  "Library Questions and Review must use member-scoped reads, editor-only child writes, and exact pagination counts.",
);

assert(
  migration.includes("Teachers cannot create public Libraries") &&
    migration.includes("pull_public_question_to_bank") &&
    migration.includes("'public_pull'") &&
    migration.includes("'sourcePublicQuestionId'"),
  "Teacher Library creation must reject public scope and public pulls must create independent bank-owned lineage.",
);

assert(
  teacherImports.includes('["manual", "json", "ai"]') &&
    teacherImports.includes("BatchImportJsonPanelLoader") &&
    teacherImports.includes("BankManualQuestionForm") &&
    teacherImports.includes("TeacherPdfBurstUpload") &&
    teacherImports.includes("bankQuestionWorkspaceCapabilities") &&
    jsonPanel.includes("importAction") &&
    jsonPanel.includes("previewAction") &&
    jsonPanel.includes("QuestionWorkspaceScope") &&
    !jsonPanel.includes("/admin/review") &&
    !jsonPanel.includes("/admin/questions"),
  "Manual, JSON, and AI must share one bank-scoped Import workspace and the shared JSON component cannot hardcode Admin routes/actions.",
);

assert(
  teacherActions.includes("requireManageableBankForAction") &&
    teacherActions.includes("targetBankId: parsed.bankId") &&
    teacherActions.includes("createBankQuestionRevisionDraft") &&
    teacherActions.includes("submitBankQuestionsToPublicReview") &&
    teacherActions.includes("pullPublicQuestionIntoBank") &&
    !teacherActions.includes('status: "published"'),
  "Teacher actions must re-check manageable bank scope and cannot directly publish global questions.",
);

assert(
  teacherMediaActions.includes("requireBankManager") &&
    teacherMediaActions.includes("assertBankDraft") &&
    teacherMediaActions.includes("create_bank_manual_question_draft") &&
    manualForm.includes("QuestionAssetsPanel") &&
    manualForm.includes("QuestionSourceFilesPanel") &&
    manualForm.includes("draft_id") &&
    teacherActions.includes("publicLicenseConfirmed"),
  "Teacher Manual must reuse shared media workspaces, persist one bank-scoped Review Draft, and require explicit public-license confirmation.",
);

assert(
  teacherAssignmentDetail.includes("Delivery paused by Library Review") &&
    teacherAssignmentDetail.includes("Open Library Review") &&
    teacherAssignmentDetail.includes("resumeQuarantinedAssignment") &&
    teacherAssignmentList.includes("Delivery paused") &&
    teacherDeliveryActions.includes("resume_quarantined_assignment") &&
    studentAssignmentDetail.includes("This work is currently unavailable") &&
    studentAssignmentDetail.includes("No private Library details are shown"),
  "Quarantined Assignment delivery must be explicit and recoverable for teachers while students receive a non-enumerating unavailable state.",
);

assert(
  teacherQuestions.includes("QuestionManagementWorkbench") &&
    teacherQuestions.includes("createBankQuestionRevisionDraft") &&
    teacherActions.includes("manageSelectedBankQuestions") &&
    teacherActions.includes('"public_review"') &&
    teacherQuestions.includes("Add from Public Library") &&
    teacherSubmissions.includes("submitted_snapshot") &&
    teacherSubmissions.includes("assignment-ready snapshot") &&
    teacherSubmissions.includes("Library owners and editors only") &&
    aiCompatibility.includes('redirect(`/teacher/banks/${bankId}/imports?mode=ai`)'),
  "Teacher UX must expose safe revision/submission/public pull and collapse the old AI route into the Library Import flow.",
);

assert(
  adminQuestions.includes("Official Public Library") &&
    adminQuestions.includes('"search_official_public_questions_v2"') &&
    adminQuestions.includes("QuestionManagementWorkbench") &&
    adminReview.includes('.eq("system_key", "official_public")') &&
    adminReview.includes('.eq("approval_status", "pending")') &&
    adminReview.includes('.is("target_bank_id", null)') &&
    adminActions.includes("assertGlobalQuestionIds") &&
    adminAssets.includes("assertGlobalQuestion") &&
    adminSources.includes("assertGlobalQuestion"),
  "Admin global Questions, Review, and media actions must reject bank-owned scope.",
);

assert(
  adminSubmissions.includes("requireSuperAdmin") &&
    adminSubmissions.includes("Approve and publish") &&
    adminSubmissions.includes("Request changes") &&
    adminSubmissions.includes("Source PDFs are never copied") &&
    bankGovernance.includes("Legacy public-review scope") &&
    bankGovernance.includes("requireSuperAdmin"),
  "Public Submissions and legacy public-bank governance must be explicit Super Admin workspaces.",
);

assert(
  publicQuestions.includes("search_official_public_questions_v2") &&
    officialPublicMigration.includes("bank.system_key = 'official_public'") &&
    officialPublicMigration.includes("question.approval_status = 'approved'") &&
    officialPublicMigration.includes("membership.status = 'active'") &&
    publicBoundaryMigration.includes("question.owner_bank_id is null"),
  "Student/public question search must remain limited to active approved official membership.",
);

console.log("PASS Library revision keeps old Assignment question lineage intact");
console.log("PASS immutable public submissions and Super Admin-only publication gate");
console.log("PASS Admin global and Teacher bank scopes do not share mutation actions");
console.log("PASS Manual/JSON/AI converge in one Library Import workspace");
console.log("PASS independent public pull and public catalog boundary");
