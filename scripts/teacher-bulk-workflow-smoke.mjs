import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

async function read(pathname) {
  return readFile(resolve(root, pathname), "utf8");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const [
  migration,
  actions,
  controls,
  reviewPage,
  questionPage,
  assignmentPage,
  questionPreviewPage,
  reviewPreviewPage,
  focusWorkspace,
  middleware,
  nextConfig,
  selectionApi,
  selectionHelper,
  previewLoader,
  focusTaskLink,
  liveE2E,
  bankDetailPage,
  publishPage,
  bankUi,
  importsPage,
] = await Promise.all([
  read("supabase/clean-migrations/0067_teacher_bulk_review_and_question_management.sql"),
  read("src/app/teacher/banks/actions.ts"),
  read("src/components/teacher/teacher-bulk-selection.tsx"),
  read("src/app/teacher/banks/[bankId]/review/page.tsx"),
  read("src/app/teacher/banks/[bankId]/questions/page.tsx"),
  read("src/app/teacher/banks/[bankId]/assignments/new/page.tsx"),
  read("src/app/teacher/banks/[bankId]/questions/preview/page.tsx"),
  read("src/app/teacher/banks/[bankId]/review/bulk/page.tsx"),
  read("src/lib/teacher-focus-workspace.ts"),
  read("src/lib/supabase/middleware.ts"),
  read("next.config.ts"),
  read("src/app/api/teacher/focus-selections/route.ts"),
  read("src/lib/teacher-focus-selection.ts"),
  read("src/lib/teacher-focus-preview.ts"),
  read("src/components/teacher/focus-task-link.tsx"),
  read("scripts/teacher-focus-workspace-live-e2e.mjs"),
  read("src/app/teacher/banks/[bankId]/page.tsx"),
  read("src/app/teacher/publish/page.tsx"),
  read("src/app/teacher/banks/bank-ui.tsx"),
  read("src/app/teacher/banks/[bankId]/imports/page.tsx"),
]);

for (const functionName of [
  "approve_bank_review_questions",
  "set_bank_question_statuses",
  "submit_bank_questions_to_public_review_for_bank",
  "create_teacher_focus_selection_receipt",
  "read_teacher_focus_selection_receipt",
]) {
  assert(
    migration.includes(`function public.${functionName}`),
    `${functionName} must be defined by the forward-only migration.`,
  );
}

assert(
  migration.includes("requested_count = 0 or requested_count > 25") &&
    migration.includes("count(distinct selected.question_id)") &&
    migration.includes("count(distinct selected.bank_question_id)"),
  "Every bulk RPC must enforce a bounded, unique current-page selection.",
);
assert(
  migration.includes("question_row.status = 'draft'") &&
    migration.includes("item.status = 'pending_review'") &&
    migration.includes("item.created_question_id = question_row.id") &&
    migration.includes("batch.target_bank_id = p_target_bank_id"),
  "Single and batch approval must preserve strict pending, bidirectional, bank-scoped Review lineage.",
);
assert(
  migration.includes("for update of question_row, item, batch") &&
    migration.includes("Every selected Review Draft must still be pending") &&
    migration.includes("multiple revisions of the same active Library question"),
  "Bulk Review must lock and validate the complete selection before any approval.",
);
assert(
  migration.includes("Existing Assignments") === false &&
    migration.includes("question_row.status = 'review'") &&
    migration.includes("superseded revisions cannot be restored"),
  "Question status management must preserve reviewed-question and superseded-revision gates.",
);
assert(
  !migration.match(
    /grant execute on function public\.(?:approve_bank_review_questions|set_bank_question_statuses|submit_bank_questions_to_public_review_for_bank|create_teacher_focus_selection_receipt|read_teacher_focus_selection_receipt)[\s\S]{0,180}\bto\s+(?:public|anon)\b/i,
  ),
  "Teacher bulk RPCs cannot be executable by public or anon.",
);
assert(
  migration.includes("teacher_focus_selection_receipts") &&
    migration.includes("expires_at") &&
    migration.includes("user_id = auth.uid()") &&
    migration.includes("validated_count <> requested_count") &&
    migration.includes("p_surface = 'review'") &&
    migration.includes("private.is_question_bank_member(p_target_bank_id)"),
  "Opaque focus receipts must be short-lived, owner-bound, and constrained to server-authorized IDs.",
);

assert(
  actions.includes("export async function approveBankReviewQuestions") &&
    actions.includes("export async function manageSelectedBankQuestions") &&
    actions.includes("No selected Review Draft was changed") &&
    actions.includes("No selected Library question was changed"),
  "Server actions must expose atomic all-or-none results without redirect-only error recovery.",
);
assert(
  actions.includes("parseCurrentPageUuidSelection") &&
    actions.includes(".min(1).max(25)") &&
    actions.includes("new Set(parsed).size !== parsed.length"),
  "Server actions must independently bound, validate, and deduplicate submitted IDs.",
);

assert(
  controls.includes("CurrentPageSelectionProvider") &&
    controls.includes("checkboxRef.current.indeterminate") &&
    controls.includes('aria-checked={someEligibleSelected ? "mixed"') &&
    controls.includes("selected on this page") &&
    controls.includes("env(safe-area-inset-bottom)") &&
    controls.includes("min-h-11"),
  "Shared controls must provide mixed-state current-page selection and a touch-safe sticky action bar.",
);
assert(
  controls.includes("onOpenAutoFocus") &&
    controls.includes("onCloseAutoFocus") &&
    controls.includes('scrollIntoView({ block: "center", behavior: "auto" })') &&
    controls.includes("setSelected((current) => new Set(current))") &&
    controls.includes("new ResizeObserver(updateHeight)") &&
    controls.includes("cancelRef.current?.focus()") &&
    controls.includes("No partial result") === false &&
    controls.includes("if any draft is stale or invalid, none are changed"),
  "Bulk confirmations must start on Cancel and explain atomic failure behavior.",
);
assert(
  controls.includes("FocusTaskForm") &&
    controls.includes("Preview selected") &&
    !controls.includes("window.open(") &&
    !controls.includes("sessionStorage"),
  "Batch preview must use one real new-tab focus link without popup loops or hidden browser storage.",
);

assert(
  reviewPage.includes("BulkSelectAllCheckbox") &&
    reviewPage.includes("BulkRowCheckbox") &&
    reviewPage.includes("ReviewBulkActionBar") &&
    reviewPage.includes('question.reviewItemStatus === "pending_review"') &&
    !reviewPage.includes("open={Boolean(warningTotal)}"),
  "Review must select only strict pending drafts and keep heavy detail collapsed by default.",
);
assert(
  questionPage.includes("QuestionBulkActionBar") &&
    questionPage.includes("BulkSelectAllCheckbox") &&
    questionPage.includes("BulkRowCheckbox") &&
    !questionPage.includes("public-submission-form") &&
    !questionPage.includes("Assign selected work") &&
    questionPage.match(/<TableHead(?:\s|>)/g)?.length === 10,
  "Questions must use the shared selection contract, remove the misleading action, and reduce the main table to five columns.",
);
assert(
  assignmentPage.includes("selection?: string") &&
    assignmentPage.includes("readTeacherFocusSelectionReceipt") &&
    assignmentPage.includes("canManageBankContent(currentUserRole)") &&
    assignmentPage.includes("defaultChecked={selectedQuestionIds.has(") &&
    assignmentPage.includes("You can still change the selection"),
  "Opaque selected-question receipts must carry into Assignment creation without hard-locking the teacher.",
);
assert(
  bankDetailPage.includes("{canManageContent ? (") &&
    bankDetailPage.includes("Reviewed content is available for read-only inspection") &&
    bankUi.includes(
      'currentUserRole === "owner" || currentUserRole === "editor"',
    ) &&
    importsPage.includes("if (!canImport)") &&
    importsPage.includes("notFound()") &&
    publishPage.includes(
      "banks = banks.filter((bank) => canManageBankContent(bank.membershipRole))",
    ) &&
    publishPage.includes("No manageable source Libraries"),
  "Viewer-facing Library, import, and Assignment entrypoints must share the owner/editor capability boundary.",
);

for (const previewPage of [questionPreviewPage, reviewPreviewPage]) {
  assert(
    previewPage.includes("unstable_noStore") &&
      previewPage.includes("requireTeacher") &&
      previewPage.includes("readTeacherFocusSelectionReceipt") &&
      previewPage.includes("selection?: string") &&
      previewPage.includes("TeacherQuestionPreviewQueue") &&
      previewPage.includes("notFound()"),
    "Every batch preview must be authenticated, receipt-bound, no-store, server-authorized, and single-item-at-a-time.",
  );
}
assert(
  focusWorkspace.includes("values.length > maxItems") &&
    focusWorkspace.includes("new Set(values).size !== values.length") &&
    focusWorkspace.includes("values.every(isDatabaseUuid)"),
  "Focused batch preview query IDs must be unique, bounded UUIDs.",
);
assert(
  selectionApi.includes("request.formData()") &&
    selectionApi.includes('destinationUrl.searchParams.set("selection", receiptId)') &&
    !selectionApi.includes('destinationUrl.searchParams.set("selected"') &&
    selectionApi.includes("NextResponse.redirect(destinationUrl, 303)") &&
    selectionHelper.includes("parseCurrentPageFocusSelection"),
  "Private item IDs must move through a bounded POST and opaque receipt, never the preview URL or browser history.",
);
assert(
  focusTaskLink.includes('action="/api/teacher/focus-selections"') &&
    focusTaskLink.includes('target="_blank"') &&
    focusTaskLink.includes("BroadcastChannel") &&
    focusTaskLink.includes("disabled={!preparedLaunchId || !selectedIds.length}") &&
    !focusTaskLink.includes("window.open("),
  "Batch preview must open one native new tab and keep the focus-return protocol.",
);
assert(
  previewLoader.includes("loadPreviewEnrichmentBatch") &&
    previewLoader.includes("getTeacherQuestionPreviewDTOs") &&
    previewLoader.includes("getReviewPreviewDTOs") &&
    previewLoader.includes('.in("question_id", uniqueQuestionIds)'),
  "Batch preview must load queue enrichment in bounded set queries instead of per-item N+1 calls.",
);
assert(
  middleware.includes("questions\\/(?:preview|[^/]+\\/preview)") &&
    nextConfig.includes('source: "/teacher/banks/:bankId/questions/preview"') &&
    nextConfig.includes('"Cross-Origin-Opener-Policy"'),
  "Static batch preview routes must receive the same no-store/no-referrer/noindex headers as single previews.",
);
assert(
  liveE2E.includes("runBulkInteractionJourney") &&
    liveE2E.includes("bulk_questions_horizontal_overflow") &&
    liveE2E.includes("bulk_select_all_not_mixed") &&
    liveE2E.includes("bulk_dialog_cancel_not_initial_focus") &&
    liveE2E.includes("bulk_failure_must_close_dialog_and_preserve_selection") &&
    liveE2E.includes("bulk_failure_changed_database_state") &&
    liveE2E.includes("bulk_preview_did_not_use_opaque_post_receipt") &&
    liveE2E.includes("Preview 2 selected questions") &&
    liveE2E.includes("assertViewerManagementBoundaries") &&
    liveE2E.includes("viewer_direct_import_route_must_be_not_found") &&
    !liveE2E.includes('context.route("**/api/teacher/focus-selections"') &&
    liveE2E.includes("bulk_preview_focus_not_restored"),
  "Live browser Gate must cover responsive selection, zero-write Dialog recovery, the real receipt queue, viewer boundaries, and return focus.",
);

console.log("PASS current-page mixed-state selection, 44px controls, and scope reset contract");
console.log("PASS atomic Review approval and Library question management gates");
console.log("PASS one-tab question and Review batch previews with opaque, expiring selection receipts");
console.log("PASS bounded batch preview loaders avoid per-item N+1 enrichment calls");
console.log("PASS selected-question receipt handoff keeps Assignment choice editable");
console.log("PASS Questions information density is reduced to five primary columns");
