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

const [
  publishPage,
  publishAction,
  composer,
  assignmentPage,
  evidenceDisclosureLink,
  feedbackAction,
  formSubmitButton,
  previewPage,
  assignmentHelper,
  focusHelper,
  middleware,
  nextConfig,
  progressPage,
  migrationFoundation,
  migrationFix,
  publishLoading,
  publishError,
  progressLoading,
  progressError,
  assignmentLoading,
  assignmentError,
  previewLoading,
  previewError,
  reviewLoading,
  reviewError,
  smokeAll,
] = await Promise.all([
  read("src/app/teacher/publish/page.tsx"),
  read("src/app/teacher/publish/actions.ts"),
  read("src/components/teacher/assignment-composer-flow.tsx"),
  read("src/app/teacher/classrooms/[id]/assignments/[assignmentId]/page.tsx"),
  read("src/components/teacher/evidence-disclosure-link.tsx"),
  read(
    "src/app/teacher/classrooms/[id]/assignments/[assignmentId]/feedback-actions.ts",
  ),
  read("src/components/form-submit-button.tsx"),
  read(
    "src/app/teacher/classrooms/[id]/assignments/[assignmentId]/student-preview/page.tsx",
  ),
  read("src/lib/teacher-assignments.ts"),
  read("src/lib/teacher-focus-workspace.ts"),
  read("src/lib/supabase/middleware.ts"),
  read("next.config.ts"),
  read("src/app/teacher/progress/page.tsx"),
  read("supabase/clean-migrations/0068_assignment_creation_idempotency.sql"),
  read(
    "supabase/clean-migrations/0069_assignment_creation_idempotency_receipt_fix.sql",
  ),
  read("src/app/teacher/publish/loading.tsx"),
  read("src/app/teacher/publish/error.tsx"),
  read("src/app/teacher/progress/loading.tsx"),
  read("src/app/teacher/progress/error.tsx"),
  read(
    "src/app/teacher/classrooms/[id]/assignments/[assignmentId]/loading.tsx",
  ),
  read(
    "src/app/teacher/classrooms/[id]/assignments/[assignmentId]/error.tsx",
  ),
  read(
    "src/app/teacher/classrooms/[id]/assignments/[assignmentId]/student-preview/loading.tsx",
  ),
  read(
    "src/app/teacher/classrooms/[id]/assignments/[assignmentId]/student-preview/error.tsx",
  ),
  read("src/app/teacher/banks/[bankId]/review/loading.tsx"),
  read("src/app/teacher/banks/[bankId]/review/error.tsx"),
  read("scripts/smoke-all.mjs"),
]);

assert(
  publishPage.includes("Choose one source Library") &&
    publishPage.includes("AssignmentComposerFlow") &&
    publishPage.includes("QuestionChecklist") &&
    publishPage.includes("LazyTeacherQuestionPreview") &&
    publishPage.includes("AssignmentSelectionSummary") &&
    publishPage.includes("clientRequestKey") &&
    !publishPage.includes("Selected students later") &&
    !publishPage.includes("Safety gates"),
  "Assignment Composer must expose one clean source/content/classroom/review mainline without future cards",
);

assert(
  composer.includes('"content" | "target" | "review"') &&
    composer.includes("useActionState") &&
    composer.includes("AssignmentDetailsFields") &&
    composer.includes("aria-invalid={titleError ? true : undefined}") &&
    composer.includes('aria-current={isCurrent ? "step"') &&
    composer.includes("Continue to classroom") &&
    composer.includes("Continue to review") &&
    composer.includes("Publish Assignment") &&
    composer.includes("useFormStatus") &&
    composer.includes("aria-busy={pending}") &&
    composer.includes("disabled={!canSubmit || pending}") &&
    composer.includes("min-h-11"),
  "Assignment Composer must provide reversible stages, input-preserving field errors, pending feedback, duplicate-submit protection, and 44px controls",
);

assert(
  publishAction.includes("selectedClassroomIds.length !== 1") &&
    publishAction.includes("AssignmentInputError") &&
    publishAction.includes('"content",') &&
    publishAction.includes('field: "form"') &&
    !publishAction.includes("redirectWithError(fallbackPath") &&
    publishAction.includes("p_client_request_key") &&
    !publishAction.includes("for (const classroomId of selectedClassroomIds)") &&
    !publishAction.includes("were created before the failure"),
  "Assignment creation must be one-classroom and must not retain the partial multi-class loop",
);

assert(
  migrationFoundation.includes("private.assignment_creation_requests") &&
    migrationFoundation.includes("revoke all on table private.assignment_creation_requests") &&
    migrationFix.includes("pg_advisory_xact_lock") &&
    migrationFix.includes("request_fingerprint") &&
    migrationFix.includes("p_client_request_key uuid") &&
    migrationFix.includes("actor_id,") &&
    migrationFix.includes("current_actor_id,") &&
    migrationFix.includes("to authenticated"),
  "Assignment creation must use the forward-corrected private actor-scoped transactional idempotency receipt",
);

assert(
  assignmentPage.includes('name="feedbackId"') &&
    assignmentPage.includes('pendingLabel="Saving private note') &&
    assignmentPage.includes('pendingLabel="Sending feedback') &&
    feedbackAction.includes("feedbackId: z.string().uuid()") &&
    feedbackAction.includes("id: parsed.feedbackId") &&
    feedbackAction.includes('error.code === "23505"') &&
    feedbackAction.includes('.eq("id", parsed.feedbackId)') &&
    feedbackAction.includes('.eq("author_id", profile.id)') &&
    feedbackAction.includes("already used for different content") &&
    formSubmitButton.includes("formAction={formAction}") &&
    formSubmitButton.includes("action === formAction") &&
    formSubmitButton.includes('aria-live={isActiveSubmitter ? "polite" : undefined}'),
  "Teacher feedback must expose an accurate pending state and reuse the existing note primary key as its retry receipt",
);

assert(
  assignmentPage.includes("FocusTaskLink") &&
    assignmentPage.includes('taskKind="student-preview"') &&
    assignmentPage.includes("Preview as student") &&
    assignmentPage.includes("newTabLabel=") &&
    !assignmentPage.includes('href={`/student/work/${assignment.id}`}') &&
    assignmentPage.includes("Question performance") &&
    assignmentPage.includes("Attempt drilldown") &&
    assignmentPage.includes("Assignment setup and source") &&
    assignmentPage.includes("EvidenceDisclosureLink") &&
    assignmentPage.includes("divide-y divide-slate-100 lg:hidden") &&
    evidenceDisclosureLink.includes("HTMLDetailsElement") &&
    evidenceDisclosureLink.includes("current.open = true") &&
    evidenceDisclosureLink.includes("target.focus"),
  "Teacher Assignment detail must use the authorized focused preview and progressively disclose secondary evidence",
);

assert(
  previewPage.includes("requireTeacher") &&
    previewPage.includes("getTeacherAssignmentStudentPreview") &&
    previewPage.includes("sanitizeTeacherAssignmentReturnTo") &&
    previewPage.includes("returnSurfaceLabel=\"Assignment detail\"") &&
    previewPage.includes("QuestionText") &&
    !previewPage.includes("answer_spec") &&
    !previewPage.includes("solution_html") &&
    !previewPage.includes("practice_attempts") &&
    !previewPage.includes("source_record_id"),
  "Student preview must stay teacher-authorized and contain only student-visible Assignment fields",
);

assert(
  assignmentHelper.includes(
    "export async function getTeacherAssignmentStudentPreview",
  ) &&
    assignmentHelper.includes(
      '"id, title, content_html, question_type, difficulty_rating"',
    ) &&
    focusHelper.includes("sanitizeTeacherAssignmentReturnTo") &&
    middleware.includes("student-preview") &&
    nextConfig.includes("student-preview") &&
    nextConfig.includes("Cross-Origin-Opener-Policy"),
  "Focused student preview must use a minimal DTO, strict return path, and private no-opener headers",
);

assert(
  progressPage.includes("Needs attention") &&
    progressPage.includes("All Assignment progress") &&
    progressPage.includes("<details") &&
    !progressPage.includes("Assignment and classroom evidence only.") &&
    !progressPage.includes("Evidence boundary"),
  "Teacher Progress must prioritize the attention queue and collapse secondary evidence",
);

for (const [source, label] of [
  [publishLoading, "Assignment creation"],
  [progressLoading, "student evidence"],
  [assignmentLoading, "Assignment evidence"],
  [previewLoading, "student preview"],
  [reviewLoading, "Review Drafts"],
]) {
  assert(
    source.includes("TeacherRouteLoading") && source.includes(label),
    `${label} requires a route-level loading state`,
  );
}

for (const [source, label] of [
  [publishError, "Assignment creation"],
  [progressError, "Student evidence"],
  [assignmentError, "Assignment evidence"],
  [previewError, "Student preview"],
  [reviewError, "Review Drafts"],
]) {
  assert(
    source.includes("TeacherRouteError") && source.includes("reset={reset}"),
    `${label} route requires an explicit recoverable error boundary`,
  );
}

for (const smokeName of [
  "practice-assignment-ux-gate-smoke.mjs",
  "student-my-work-ux-smoke.mjs",
  "teacher-assignment-standard-flow-smoke.mjs",
]) {
  assert(
    smokeAll.includes(smokeName),
    `smoke-all must include ${smokeName}`,
  );
}

console.log(
  "PASS teacher Assignment standard flow protects focus, idempotency, preview isolation, and progressive disclosure",
);
