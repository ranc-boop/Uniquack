import { createHmac } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const root = resolve(__dirname, "..");

const localHosts = new Set(["127.0.0.1", "localhost"]);
const requiredLocalGate = "CONFIRMED";
const pdf50LocalOnly =
  process.env.PDF50_LOCAL_CLONE_REHEARSAL === requiredLocalGate &&
  process.env.PDF50_LOCALHOST_ONLY === requiredLocalGate;
const allowedLocalEnvNames = new Set([
  "PDF50_LOCAL_CLONE_REHEARSAL",
  "PDF50_LOCALHOST_ONLY",
  "PDF50_LOCAL_DATABASE_URL",
  "PDF50_LOCAL_API_URL",
  "PDF50_LOCAL_SUPABASE_DIR",
]);
const forbiddenLocalEnvNamePattern =
  /^(PDF50_|SUPABASE|DATABASE_URL|DIRECT_URL|POSTGRES|PG|NEXT_PUBLIC_SUPABASE|SUPABASE_)/;
const forbiddenRemoteValuePattern =
  /supabase\.co|pooler\.supabase\.com|https?:\/\/(?!localhost(?::|\/|$)|127\.0\.0\.1(?::|\/|$))[^/\s]+/i;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function base64Url(value) {
  return Buffer.from(value).toString("base64url");
}

function signJwt(payload, secret) {
  const header = { alg: "HS256", typ: "JWT" };
  const encodedHeader = base64Url(JSON.stringify(header));
  const encodedPayload = base64Url(JSON.stringify(payload));
  const signature = createHmac("sha256", secret)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest("base64url");
  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

function makeAnonToken(secret) {
  const now = Math.floor(Date.now() / 1000);
  return signJwt({
    aud: "anon",
    exp: now + 60 * 60,
    iat: now - 10,
    iss: "supabase",
    role: "anon",
    sub: "anon",
  }, secret);
}

function getLocalJwtSecret() {
  const names = execFileSync("docker", ["ps", "--format", "{{.Names}}"], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  assert(
    names.split(/\r?\n/).some((name) => name === "supabase_db_o2i_pdf50_local_rehearsal"),
    "Local Supabase DB container is not running.",
  );
  const secret = execFileSync("docker", [
    "exec",
    "supabase_db_o2i_pdf50_local_rehearsal",
    "printenv",
    "JWT_SECRET",
  ], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
  assert(secret.length >= 32, "Local JWT secret was unavailable.");
  return secret;
}

function requireLocalApiUrl(rawUrl) {
  assert(rawUrl, "PDF50_LOCAL_API_URL is required.");
  assert(!/supabase\.co|pooler\.supabase\.com/i.test(rawUrl), "Local API URL must not reference hosted Supabase.");
  const url = new URL(rawUrl);
  assert(["http:", "https:"].includes(url.protocol), "Local API URL has an unsupported protocol.");
  assert(localHosts.has(url.hostname), "Local API URL must use localhost or 127.0.0.1.");
  return url.toString();
}

let supabaseUrl;
let supabaseAnonKey;
if (pdf50LocalOnly) {
  for (const [name, value] of Object.entries(process.env)) {
    if (allowedLocalEnvNames.has(name)) continue;
    if (forbiddenLocalEnvNamePattern.test(name)) {
      throw new Error("Forbidden database/API environment variable is present.");
    }
    if (forbiddenRemoteValuePattern.test(value ?? "")) {
      throw new Error("Forbidden non-localhost URL value is present.");
    }
  }
  supabaseUrl = requireLocalApiUrl(process.env.PDF50_LOCAL_API_URL);
  supabaseAnonKey = makeAnonToken(getLocalJwtSecret());
} else {
  dotenv.config({ path: resolve(__dirname, "..", ".env.local") });
  supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
}

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY.");
}

const blueprintMigration = await readFile(
  resolve(root, "supabase/clean-migrations/0007_blueprint_engine.sql"),
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
const teacherClassroomRlsMigration = await readFile(
  resolve(root, "supabase/clean-migrations/0030_teacher_classroom_rls_fix.sql"),
  "utf8",
);
const classroomCreationHardeningMigration = await readFile(
  resolve(root, "supabase/clean-migrations/0043_classroom_creation_rls_hardening.sql"),
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
const bankImportReviewMigration = await readFile(
  resolve(root, "supabase/clean-migrations/0027_bank_import_review_scope.sql"),
  "utf8",
);
const assignmentFromBankMigration = await readFile(
  resolve(root, "supabase/clean-migrations/0028_assignment_from_bank_questions.sql"),
  "utf8",
);
const teacherRoleBoundaryMigration = await readFile(
  resolve(root, "supabase/clean-migrations/0029_teacher_role_bank_public_boundary.sql"),
  "utf8",
);
const blueprintLibraryMigration = await readFile(
  resolve(root, "supabase/clean-migrations/0031_blueprint_library_foundation.sql"),
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
assert(
  teacherClassroomRlsMigration.includes("create or replace function private.is_org_staff") &&
    teacherClassroomRlsMigration.includes("profile.default_organization_id") &&
    teacherClassroomRlsMigration.includes("create or replace function public.create_teacher_classroom") &&
    teacherClassroomRlsMigration.includes("revoke all on function public.create_teacher_classroom") &&
    teacherClassroomRlsMigration.includes("from public, anon") &&
    teacherClassroomRlsMigration.includes("grant execute on function public.create_teacher_classroom") &&
    teacherClassroomRlsMigration.includes("to authenticated") &&
    !teacherClassroomRlsMigration.includes("to anon"),
  "teacher classroom RLS fix must keep classroom creation teacher/authenticated scoped",
);
assert(
  classroomCreationHardeningMigration.includes("drop policy if exists classrooms_teacher_create") &&
    classroomCreationHardeningMigration.includes(
      "revoke insert on table public.classrooms from anon, authenticated",
    ) &&
    classroomCreationHardeningMigration.includes("drop policy if exists classroom_members_teacher_write") &&
    classroomCreationHardeningMigration.includes(
      "revoke insert, update on table public.classroom_members from anon, authenticated",
    ) &&
    classroomCreationHardeningMigration.includes("create function public.create_teacher_classroom") &&
    classroomCreationHardeningMigration.includes("p_request_id uuid") &&
    classroomCreationHardeningMigration.includes("set search_path = public, private, extensions") &&
    classroomCreationHardeningMigration.includes("grant execute on function public.create_teacher_classroom") &&
    classroomCreationHardeningMigration.includes("to authenticated") &&
    !classroomCreationHardeningMigration.includes("to anon") &&
    !classroomCreationHardeningMigration.includes("p_join_code text"),
  "0043 must replace direct Classroom/member writes with authenticated, server-derived RPC paths",
);
console.log("PASS classroom migrations enable scoped RLS, narrow teacher creation, and authenticated hash-only joins");
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
assert(
  bankImportReviewMigration.includes("alter table public.import_batches") &&
    bankImportReviewMigration.includes("target_bank_id") &&
    bankImportReviewMigration.includes("alter table public.questions") &&
    bankImportReviewMigration.includes("owner_bank_id") &&
    bankImportReviewMigration.includes("questions_bank_member_read") &&
    bankImportReviewMigration.includes("questions_bank_manager_write") &&
    bankImportReviewMigration.includes("public.approve_bank_review_question") &&
    bankImportReviewMigration.includes("private.can_manage_question_bank(target_bank_id)") &&
    bankImportReviewMigration.includes("revoke all on function public.approve_bank_review_question(uuid, uuid) from public, anon") &&
    bankImportReviewMigration.includes("grant execute on function public.approve_bank_review_question(uuid, uuid) to authenticated") &&
    !bankImportReviewMigration.includes("published_at = coalesce") &&
    !bankImportReviewMigration.includes("grant execute on function public.approve_bank_review_question(uuid, uuid) to anon"),
  "bank import/review migration must scope imports and approval to bank managers without global publish or anon grants",
);
console.log("PASS bank import review migration keeps approval bank-scoped and non-public");
assert(
  assignmentFromBankMigration.includes("add column if not exists bank_question_id") &&
    assignmentFromBankMigration.includes("add column if not exists source_bank_id") &&
    assignmentFromBankMigration.includes("private.can_read_assignment_question") &&
    assignmentFromBankMigration.includes("questions_assignment_item_read") &&
    assignmentFromBankMigration.includes("public.create_assignment_from_bank") &&
    assignmentFromBankMigration.includes("private.can_read_question_bank(p_target_bank_id)") &&
    assignmentFromBankMigration.includes("private.can_manage_classroom(p_target_classroom_id)") &&
    assignmentFromBankMigration.includes("assignment.status = 'assigned'") &&
    assignmentFromBankMigration.includes("question.status <> 'draft'") &&
    assignmentFromBankMigration.includes("revoke all on function public.create_assignment_from_bank") &&
    assignmentFromBankMigration.includes("grant execute on function public.create_assignment_from_bank") &&
    assignmentFromBankMigration.includes("grant execute on function private.can_read_assignment_question(uuid) to anon, authenticated") &&
    !assignmentFromBankMigration.includes("published_at =") &&
    !/grant execute on function public\.create_assignment_from_bank[\s\S]*?to anon/i.test(assignmentFromBankMigration),
  "assignment-from-bank migration must expose selected bank questions through assignment scope only, with no global publish or anon grants",
);
console.log("PASS assignment-from-bank migration keeps bank content assignment-scoped");
assert(
  teacherRoleBoundaryMigration.includes("questions_published_read") &&
    teacherRoleBoundaryMigration.includes("status = 'published'") &&
    teacherRoleBoundaryMigration.includes("visibility = 'public'") &&
    teacherRoleBoundaryMigration.includes("owner_bank_id is null") &&
    teacherRoleBoundaryMigration.includes("question_rubric_steps_public_read") &&
    teacherRoleBoundaryMigration.includes("question_assets_public_read") &&
    teacherRoleBoundaryMigration.includes("question_taxonomy_assignments_public_read") &&
    teacherRoleBoundaryMigration.includes("Bank-owned questions must be approved through bank review") &&
    teacherRoleBoundaryMigration.includes("question.owner_bank_id is null"),
  "teacher role/bank boundary migration must restrict public reads/search to global public questions and block global publish for bank-owned questions",
);
console.log("PASS teacher role/bank boundary migration protects public/global reads");
assert(
  blueprintLibraryMigration.includes("alter table public.question_blueprints") &&
    blueprintLibraryMigration.includes("add column if not exists visibility") &&
    blueprintLibraryMigration.includes("add column if not exists blueprint_kind") &&
    blueprintLibraryMigration.includes("create table if not exists public.bank_blueprints") &&
    blueprintLibraryMigration.includes("alter table public.bank_blueprints enable row level security") &&
    blueprintLibraryMigration.includes("private.can_read_question_blueprint") &&
    blueprintLibraryMigration.includes("private.can_manage_question_blueprint") &&
    blueprintLibraryMigration.includes("question_blueprints_library_read") &&
    blueprintLibraryMigration.includes("question_blueprints_library_insert") &&
    blueprintLibraryMigration.includes("bank_blueprints_member_read") &&
    blueprintLibraryMigration.includes("private.can_read_question_bank(bank_id)") &&
    blueprintLibraryMigration.includes("private.can_manage_question_bank(bank_id)") &&
    blueprintLibraryMigration.includes("added_by = auth.uid()") &&
    !blueprintLibraryMigration.includes("to anon"),
  "teacher Blueprint Library migration must add visibility-safe RLS and bank links without anon grants",
);
console.log("PASS teacher Blueprint Library migration protects private library and bank links");
for (const tableName of [
  "question_blueprints",
  "question_blueprint_folders",
  "question_blueprint_examples",
  "question_blueprint_review_actions",
  "question_blueprint_versions",
  "question_blueprint_calibration_runs",
]) {
  assert(
    blueprintMigration.includes(`alter table public.${tableName} enable row level security`),
    `${tableName} is missing RLS`,
  );
}
assert(blueprintMigration.includes("question_blueprints_staff_read"), "question blueprints must retain a staff-scoped read policy");
assert(blueprintMigration.includes("question_blueprint_folders_staff_read"), "question blueprint folders must retain a staff-scoped read policy");
assert(blueprintMigration.includes("question_blueprint_examples_staff_access"), "question blueprint examples must retain a staff-scoped policy");
assert(blueprintMigration.includes("question_blueprint_review_actions_staff_access"), "question blueprint review actions must retain a staff-scoped policy");
assert(blueprintMigration.includes("question_blueprint_versions_staff_read"), "question blueprint versions must retain a staff-scoped read policy");
assert(blueprintMigration.includes("question_blueprint_calibration_runs_staff_access"), "question blueprint calibration runs must retain a staff-scoped policy");
assert(
  blueprintMigration.includes("private.is_teacher_or_admin()") && !blueprintMigration.includes("to anon"),
  "canonical Blueprint Engine migration must enforce staff scope and avoid anon grants",
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
  "question blueprint lifecycle/editing must use snapshots, soft-delete actions, and never hard-delete",
);
console.log("PASS canonical Blueprint Engine migration enables staff-scoped RLS");

if (pdf50LocalOnly) {
  console.log("PASS PDF50 localhost-only RLS smoke source checks; generic anon live taxonomy probes skipped");
  process.exit(0);
}

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
