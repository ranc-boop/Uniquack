import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const [migration, adminPage, studentPage, teacherPage, adminActions, teacherActions] =
  await Promise.all([
    read("supabase/clean-migrations/0076_official_public_library_two_state_approval.sql"),
    read("src/app/admin/questions/page.tsx"),
    read("src/app/questions/page.tsx"),
    read("src/app/teacher/banks/[bankId]/questions/page.tsx"),
    read("src/app/admin/questions/actions.ts"),
    read("src/app/teacher/banks/actions.ts"),
  ]);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(
  migration.includes("questions_approval_status_check") &&
    migration.includes("check (approval_status in ('pending', 'approved'))") &&
    migration.includes("question_banks_official_public_key") &&
    migration.includes("system_key = 'official_public'") &&
    migration.includes("check (visibility <> 'public' or owner_scope = 'system')"),
  "0076 must define two-state approval and one system-owned official Public Library.",
);

for (const page of [adminPage, studentPage, teacherPage]) {
  assert(
    page.includes("search_official_public_questions_v2"),
    "Admin, Student, and Teacher Public Library surfaces must share the official RPC.",
  );
}

assert(
  migration.includes("question.approval_status = 'approved'") &&
    migration.includes("membership.status = 'active'") &&
    migration.includes("question.deleted_at is null") &&
    migration.includes("revoke all on function public.search_official_public_questions_v2") &&
    migration.includes("from public, anon;"),
  "Official search must be approval/membership scoped and unavailable to anonymous callers.",
);

assert(
  migration.includes("private.question_grading_capability_v2(question.id) <> 'needs_configuration'") &&
    migration.includes("Every selected question must be approved, active, and configured for grading.") &&
    migration.includes("rename to create_assignment_from_bank_pre_approval_v2"),
  "New Assignment creation must enforce approval and grading readiness without changing old Assignment rows.",
);

assert(
  migration.includes("Approved question content is immutable. Create and approve a revision instead.") &&
    migration.includes("questions_prevent_approved_content_update_v2") &&
    migration.includes("question.status = 'review'") &&
    migration.includes("malformed legacy rows remain pending"),
  "Approved content must be revision-only and readiness-valid legacy review rows must not become stuck pending.",
);

assert(
  migration.includes("Official Public Library pulls are server-only.") &&
    migration.includes("A real Library actor is required.") &&
    migration.includes(") to service_role;") &&
    migration.includes("set approval_status = 'approved'\n  where id = copied_question_id") &&
    migration.includes("count(distinct option_row->>'id')") &&
    migration.includes("jsonb_typeof(answer_value) = 'string'"),
  "Public pulls must preserve the service-role boundary and deterministic grading specs must be strict.",
);

assert(
  migration.includes("questions_one_pending_official_revision_v2_idx") &&
    migration.includes("'lineageKind', 'official_revision'") &&
    migration.includes("'replacedByQuestionId', target_question_id") &&
    migration.includes("revision_source_membership_id") &&
    migration.includes("status = 'archived'"),
  "Official revision approval must atomically replace active membership while preserving the old question.",
);

assert(
  migration.includes("attach_official_question_revision_assets_v2") &&
    migration.includes("Official revision asset attachment is server-only.") &&
    migration.includes("'official-revisions/' || p_source_question_id::text || '/' || p_target_question_id::text || '/%'") &&
    migration.includes("Official revision assets must map one-to-one.") &&
    migration.includes("'revisionAssetLineage'") &&
    migration.includes("membership.metadata ? 'revisionAssetLineage'") &&
    migration.includes(") to service_role;"),
  "Official revision assets must be attached by a service-only, lineage-preserving RPC.",
);

assert(
  migration.includes("'lineageKind', 'public_submission_copy'") &&
    migration.includes("set approval_status = 'approved'") &&
    migration.includes("insert into public.bank_questions") &&
    migration.includes("Only Admin can review public submissions."),
  "Approved teacher submissions must atomically create an official copy with lineage.",
);

assert(
  adminActions.includes('rpc(\n            "approve_library_questions_v2"') &&
    teacherActions.includes('rpc("approve_library_questions_v2"'),
  "Admin and Teacher approval actions must use the canonical v2 approval gate.",
);

assert(
  adminActions.includes("copyQuestionAssetsForIndependentUse") &&
    adminActions.includes("createServiceRoleClient") &&
    adminActions.includes('"attach_official_question_revision_assets_v2"') &&
    adminActions.includes("official-revisions/${revisionOfQuestionId}/${question.id}") &&
    adminActions.includes("if (!revisionAssetsFinalized) await copiedRevisionAssets?.cleanup()"),
  "Admin official revisions must independently copy, attach, and clean up source assets.",
);

assert(
  adminActions.includes("assertQuestionsAreNotApproved") &&
    adminActions.includes("Approved questions cannot be deleted or moved back to a legacy status"),
  "Approved official questions must fail closed for legacy delete and status downgrade actions.",
);

console.log("PASS official Public Library, two-state approval, lineage, and Assignment gates");
