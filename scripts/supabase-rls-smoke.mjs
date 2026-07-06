import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const root = resolve(__dirname, "..");
dotenv.config({ path: resolve(__dirname, "..", ".env.local") });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY.");
}

const blueprintMigration = await readFile(
  resolve(root, "supabase/migrations/0015_question_blueprint_library.sql"),
  "utf8",
);
const blueprintFolderMigration = await readFile(
  resolve(root, "supabase/migrations/0016_question_blueprint_folders.sql"),
  "utf8",
);
const blueprintCalibrationMigration = await readFile(
  resolve(root, "supabase/migrations/0018_question_blueprint_calibration.sql"),
  "utf8",
);
const blueprintVersionMigration = await readFile(
  resolve(root, "supabase/migrations/0019_question_blueprint_versions.sql"),
  "utf8",
);
const reviewDraftPublishMigration = await readFile(
  resolve(root, "supabase/clean-migrations/0016_review_draft_publish_lineage.sql"),
  "utf8",
);
const classroomMigration = await readFile(
  resolve(root, "supabase/clean-migrations/0018_classroom_foundation.sql"),
  "utf8",
);
const studentWorkMigration = await readFile(
  resolve(root, "supabase/clean-migrations/0021_student_work_assignments.sql"),
  "utf8",
);
const studentWorkManagerScopeMigration = await readFile(
  resolve(root, "supabase/clean-migrations/0023_student_work_assignment_manager_scope_fix.sql"),
  "utf8",
);
const courseBuilderBridgeMigration = await readFile(
  resolve(root, "supabase/clean-migrations/0024_assignment_source_metadata.sql"),
  "utf8",
);
const questionBankMigration = await readFile(
  resolve(root, "supabase/clean-migrations/0025_question_banks_foundation.sql"),
  "utf8",
);
const bankShareMigration = await readFile(
  resolve(root, "supabase/clean-migrations/0026_bank_share_codes_and_members.sql"),
  "utf8",
);
const blueprintActions = await readFile(
  resolve(root, "src/app/admin/blueprints/actions.ts"),
  "utf8",
);
assert(
  reviewDraftPublishMigration.includes("security definer") &&
    reviewDraftPublishMigration.includes("private.is_teacher_or_admin()") &&
    reviewDraftPublishMigration.includes("private.is_org_staff(question_row.organization_id)") &&
    reviewDraftPublishMigration.includes("revoke all on function public.publish_review_draft_questions(uuid[])") &&
    reviewDraftPublishMigration.includes("from public, anon") &&
    reviewDraftPublishMigration.includes("grant execute on function public.publish_review_draft_questions(uuid[])") &&
    reviewDraftPublishMigration.includes("to authenticated"),
  "Review Draft publish RPC must be teacher/admin scoped and unavailable to anon/public",
);
for (const tableName of [
  "classrooms",
  "classroom_members",
  "classroom_join_codes",
]) {
  assert(
    classroomMigration.includes(`alter table public.${tableName} enable row level security`),
    `${tableName} is missing RLS`,
  );
}
assert(
  classroomMigration.includes("classrooms_teacher_create") &&
    classroomMigration.includes("classrooms_teacher_update") &&
    classroomMigration.includes("classroom_members_read_scoped") &&
    classroomMigration.includes("classroom_join_codes_teacher_read"),
  "classroom migration must define scoped teacher/student RLS policies",
);
assert(
  classroomMigration.includes("public.join_classroom_by_code") &&
    classroomMigration.includes("security definer") &&
    classroomMigration.includes("profile_row.role <> 'student'") &&
    classroomMigration.includes("private.classroom_join_code_hash") &&
    classroomMigration.includes("revoke all on function public.join_classroom_by_code(text)") &&
    classroomMigration.includes("grant execute on function public.join_classroom_by_code(text) to authenticated"),
  "student classroom enrollment must use authenticated join-code RPC with hash comparison",
);
assert(
  classroomMigration.includes("profiles_classroom_roster_read") &&
    classroomMigration.includes("private.can_manage_classroom(member.classroom_id)") &&
    !classroomMigration.includes("grant execute on function public.join_classroom_by_code(text) to anon"),
  "classroom roster profile reads must be manager-scoped and anonymous joins must stay blocked",
);
console.log("PASS classroom migration enables scoped RLS and authenticated hash-only joins");
for (const tableName of [
  "assignments",
  "assignment_items",
  "student_assignment_progress",
  "assignment_practice_sessions",
]) {
  assert(
    studentWorkMigration.includes(`alter table public.${tableName} enable row level security`),
    `${tableName} is missing RLS`,
  );
}
assert(
  studentWorkMigration.includes("private.can_manage_assignment") &&
    studentWorkMigration.includes("private.can_read_assignment") &&
    studentWorkMigration.includes("assignments_read_scoped") &&
    studentWorkMigration.includes("assignment.status = 'assigned'") &&
    studentWorkMigration.includes("member.role = 'student'") &&
    studentWorkMigration.includes("student_assignment_progress_student_insert") &&
    studentWorkMigration.includes("student_assignment_progress_student_update") &&
    studentWorkMigration.includes("student_id = auth.uid()"),
  "student My Work migration must scope assignments to active classroom membership and progress to the student owner",
);
assert(
  studentWorkManagerScopeMigration.includes("classroom.owner_id = auth.uid()") &&
    studentWorkManagerScopeMigration.includes("private.is_org_admin(classroom.organization_id)") &&
    studentWorkManagerScopeMigration.includes("member.role in ('teacher', 'co_teacher')") &&
    studentWorkManagerScopeMigration.includes("assignments_teacher_insert") &&
    studentWorkManagerScopeMigration.includes("assignments_teacher_update"),
  "student My Work final manager scope must use classroom owner/co-teacher/org-admin checks",
);
assert(
  courseBuilderBridgeMigration.includes("alter table public.assignments") &&
    courseBuilderBridgeMigration.includes("source_kind text not null default 'manual'") &&
    courseBuilderBridgeMigration.includes("source_record_id uuid") &&
    courseBuilderBridgeMigration.includes("source_summary jsonb not null default '{}'::jsonb") &&
    courseBuilderBridgeMigration.includes("'manual', 'course_builder_run', 'practice_framework'") &&
    !courseBuilderBridgeMigration.toLowerCase().includes("\ngrant ") &&
    !courseBuilderBridgeMigration.includes("disable row level security"),
  "Course Builder bridge migration must add assignment source metadata without adding grants or weakening RLS",
);
console.log("PASS student My Work migration enables scoped assignment RLS and student-owned progress writes");
for (const tableName of [
  "question_banks",
  "bank_members",
  "bank_questions",
]) {
  assert(
    questionBankMigration.includes(`alter table public.${tableName} enable row level security`),
    `${tableName} is missing RLS`,
  );
}
assert(
  questionBankMigration.includes("private.can_read_question_bank") &&
    questionBankMigration.includes("private.can_manage_question_bank") &&
    questionBankMigration.includes("question_banks_read_scoped") &&
    questionBankMigration.includes("question_banks_update_managers") &&
    questionBankMigration.includes("bank_members_read_scoped") &&
    questionBankMigration.includes("bank_members_write_managers") &&
    questionBankMigration.includes("bank_questions_read_scoped") &&
    questionBankMigration.includes("bank_questions_write_managers"),
  "question bank migration must define scoped member/manager RLS policies",
);
assert(
  questionBankMigration.includes("public.create_question_bank") &&
    questionBankMigration.includes("current_profile.role not in ('teacher', 'admin', 'super_admin')") &&
    questionBankMigration.includes("insert into public.bank_members") &&
    questionBankMigration.includes("'owner'") &&
    questionBankMigration.includes("revoke all on function public.create_question_bank") &&
    questionBankMigration.includes("from public, anon") &&
    questionBankMigration.includes("grant execute on function public.create_question_bank") &&
    questionBankMigration.includes("to authenticated") &&
    !questionBankMigration.includes("share_code") &&
    !questionBankMigration.includes("to anon"),
  "question bank create RPC must be authenticated teacher/admin scoped and must not add share-code/public anon behavior",
);
console.log("PASS question bank migration enables scoped RLS and authenticated owner creation");
assert(
  bankShareMigration.includes("create table if not exists public.bank_share_codes") &&
    bankShareMigration.includes("code_hash text not null unique") &&
    bankShareMigration.includes("private.bank_share_code_hash") &&
    bankShareMigration.includes("extensions.digest") &&
    bankShareMigration.includes("alter table public.bank_share_codes enable row level security"),
  "bank share migration must store only hashed share codes and enable RLS",
);
assert(
  bankShareMigration.includes("public.create_bank_share_code") &&
    bankShareMigration.includes("public.join_question_bank_by_code") &&
    bankShareMigration.includes("public.update_bank_member_role") &&
    bankShareMigration.includes("public.remove_bank_member") &&
    bankShareMigration.includes("Only bank owners can create share codes") &&
    bankShareMigration.includes("Only bank owners can update member roles") &&
    bankShareMigration.includes("Only teacher or admin accounts can join banks by share code"),
  "bank share RPCs must keep joins teacher/admin-only and member management owner-controlled",
);
assert(
  bankShareMigration.includes("drop policy if exists bank_members_write_managers") &&
    bankShareMigration.includes("create policy bank_members_owner_write") &&
    bankShareMigration.includes("private.can_own_question_bank(bank_id)") &&
    bankShareMigration.includes("bank_share_codes_owner_read") &&
    bankShareMigration.includes("bank_share_codes_owner_write") &&
    bankShareMigration.includes("revoke all on function public.join_question_bank_by_code(text) from public, anon") &&
    bankShareMigration.includes("grant execute on function public.join_question_bank_by_code(text) to authenticated") &&
    !bankShareMigration.includes("grant execute on function public.join_question_bank_by_code(text) to anon") &&
    !bankShareMigration.includes("raw_share_code text not null"),
  "bank share RLS/grants must block anonymous access and avoid storing raw share codes",
);
console.log("PASS bank share migration enables owner-managed hashed share codes");
for (const tableName of [
  "question_blueprints",
  "question_blueprint_examples",
  "question_blueprint_review_actions",
]) {
  assert(
    blueprintMigration.includes(`alter table public.${tableName} enable row level security`),
    `${tableName} is missing RLS`,
  );
  assert(
    blueprintMigration.includes(`${tableName}_admin_crud`) &&
      blueprintMigration.includes("private.is_admin()"),
    `${tableName} is missing admin-only policy`,
  );
}
assert(!blueprintMigration.includes("to anon"), "question blueprint tables must not grant anon access");
assert(
  blueprintFolderMigration.includes("create table if not exists public.question_blueprint_folders") &&
    blueprintFolderMigration.includes("add column if not exists folder_id") &&
    blueprintFolderMigration.includes("alter table public.question_blueprint_folders enable row level security") &&
    blueprintFolderMigration.includes("question_blueprint_folders_admin_crud") &&
    blueprintFolderMigration.includes("private.is_admin()") &&
    !blueprintFolderMigration.includes("to anon"),
  "question blueprint folder migration must enable admin-only RLS and avoid anon grants",
);
assert(
  blueprintCalibrationMigration.includes("create table if not exists public.question_blueprint_calibration_runs") &&
    blueprintCalibrationMigration.includes("alter table public.question_blueprint_calibration_runs enable row level security") &&
    blueprintCalibrationMigration.includes("question_blueprint_calibration_runs_admin_crud") &&
    blueprintCalibrationMigration.includes("private.is_admin()") &&
    blueprintCalibrationMigration.includes("generation_readiness") &&
    !blueprintCalibrationMigration.includes("to anon"),
  "question blueprint calibration migration must enable admin-only RLS and avoid anon grants",
);
assert(
  blueprintVersionMigration.includes("create table if not exists public.question_blueprint_versions") &&
    blueprintVersionMigration.includes("alter table public.question_blueprint_versions enable row level security") &&
    blueprintVersionMigration.includes("question_blueprint_versions_admin_crud") &&
    blueprintVersionMigration.includes("private.is_admin()") &&
    blueprintVersionMigration.includes("snapshot jsonb not null") &&
    !blueprintVersionMigration.includes("to anon"),
  "question blueprint version migration must enable admin-only RLS and avoid anon grants",
);
assert(
  blueprintMigration.includes("deleted_at timestamptz") &&
    blueprintMigration.includes("status in ('draft', 'approved', 'deprecated')"),
  "question blueprint migration must support lifecycle status and soft delete",
);
assert(
  blueprintActions.includes("archiveQuestionBlueprint") &&
    blueprintActions.includes("restoreQuestionBlueprint") &&
    blueprintActions.includes("moveQuestionBlueprintToTrash") &&
    blueprintActions.includes("archiveQuestionBlueprintFolder") &&
    blueprintActions.includes("restoreQuestionBlueprintFolder") &&
    blueprintActions.includes("moveQuestionBlueprintToFolder") &&
    blueprintActions.includes("updateQuestionBlueprintFields") &&
    blueprintActions.includes("splitQuestionBlueprint") &&
    blueprintActions.includes("createMergedQuestionBlueprintDraft") &&
    blueprintActions.includes("replaceQuestionBlueprint") &&
    blueprintActions.includes("question_blueprint_versions") &&
    blueprintActions.includes("deleted_at: new Date().toISOString()") &&
    !blueprintActions.includes(".delete("),
  "question blueprint lifecycle/editing must use admin snapshots, soft-delete actions, and never hard-delete",
);
console.log("PASS question blueprint migration enables admin-only RLS");

const anon = createClient(supabaseUrl, supabaseAnonKey);
const { data: nodes, error: nodesError } = await anon
  .from("taxonomy_nodes")
  .select("tag_id,status")
  .eq("status", "active")
  .limit(5);
assert(!nodesError, `taxonomy_nodes public read failed: ${nodesError?.message}`);
assert(Array.isArray(nodes), "taxonomy_nodes did not return an array");
console.log("PASS public can read active taxonomy nodes");

const { data: rpcRows, error: rpcError } = await anon.rpc("search_questions_by_taxonomy", {
  assignment_review_status: "approved",
  difficulty_max: 1000,
  difficulty_min: 0,
  exclude_tag_ids: [],
  include_tag_ids: [],
  page_limit: 1,
  page_offset: 0,
  query_text: null,
  question_status: "published",
});
assert(!rpcError, `public taxonomy search RPC failed: ${rpcError?.message}`);
assert(Array.isArray(rpcRows), "taxonomy search RPC did not return rows");
console.log("PASS public can call taxonomy search RPC for published approved content");

const { error: insertError } = await anon.from("taxonomy_nodes").insert({
  tag_id: `math.concept.rls_denied_${Date.now()}`,
  node_kind: "tag",
  subject_tag_id: "math",
  facet_key: "concept",
  label: "RLS denied",
  is_assignable: true,
  status: "active",
});
assert(insertError, "anon unexpectedly inserted taxonomy_nodes");
console.log("PASS anon cannot write taxonomy nodes");

const { error: anonAssignmentInsertError } = await anon.from("assignments").insert({
  classroom_id: "00000000-0000-0000-0000-000000000000",
  organization_id: "00000000-0000-0000-0000-000000000000",
  title: "RLS denied assignment",
});
assert(anonAssignmentInsertError, "anon unexpectedly inserted assignments");
console.log("PASS anon cannot write assignments");
