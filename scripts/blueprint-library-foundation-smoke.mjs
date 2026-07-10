import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const root = resolve(__dirname, "..");
dotenv.config({ path: resolve(root, ".env.local") });
dotenv.config({ path: resolve(root, ".env.disposable-smoke.local") });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey =
  process.env.CLEAN_SUPABASE_SERVICE_ROLE_KEY ??
  process.env.SUPABASE_SERVICE_ROLE_KEY;
const teacherUsername = process.env.TEST_TEACHER_USERNAME;
const teacherPassword = process.env.TEST_TEACHER_PASSWORD;
const studentUsername = process.env.TEST_STUDENT_USERNAME;
const studentPassword = process.env.TEST_STUDENT_PASSWORD;
const unrelatedTeacherUsername = process.env.TEST_UNRELATED_TEACHER_USERNAME;
const unrelatedTeacherPassword = process.env.TEST_UNRELATED_TEACHER_PASSWORD;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function summarizeSupabaseError(error) {
  if (!error) return "unknown error";
  return [error.message, error.code, error.details, error.hint]
    .filter(Boolean)
    .join(" | ");
}

function isMissingBlueprintLibrary(error) {
  const summary = summarizeSupabaseError(error).toLowerCase();
  return (
    error?.code === "42703" ||
    error?.code === "42P01" ||
    error?.code === "PGRST204" ||
    error?.code === "PGRST205" ||
    summary.includes("bank_blueprints") ||
    summary.includes("blueprint_kind") ||
    summary.includes("source_bank_id") ||
    summary.includes("schema cache") ||
    summary.includes("does not exist")
  );
}

function usernameToLocalEmail(username) {
  const normalized = username.trim().toLowerCase();
  return normalized.includes("@") ? normalized : `${normalized}@local.app`;
}

async function read(relativePath) {
  return readFile(resolve(root, relativePath), "utf8");
}

async function signIn(username, password, label) {
  const supabase = createClient(supabaseUrl, supabaseAnonKey);
  const { data, error } = await supabase.auth.signInWithPassword({
    email: usernameToLocalEmail(username),
    password,
  });

  if (error) {
    console.log(
      `SKIP blueprint library ${label} check: credentials could not sign in (${error.message}).`,
    );
    return null;
  }

  assert(data.user?.id, `blueprint library smoke did not receive ${label} user`);
  return { client: supabase, user: data.user };
}

async function cleanup({ bankId, blueprintId, folderId, linkId }) {
  if (!serviceRoleKey) return;

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  if (linkId) {
    await admin.from("bank_blueprints").delete().eq("id", linkId);
  }

  if (blueprintId) {
    await admin.from("question_blueprints").delete().eq("id", blueprintId);
  }

  if (folderId) {
    await admin.from("question_blueprint_folders").delete().eq("id", folderId);
  }

  if (bankId) {
    await admin.from("question_banks").delete().eq("id", bankId);
  }

  console.log("PASS blueprint library smoke cleanup removed smoke-created rows");
}

async function runSourceSmoke() {
  const migration = await read("supabase/clean-migrations/0031_blueprint_library_foundation.sql");
  const teacherBlueprintPage = await read("src/app/teacher/blueprints/page.tsx");
  const teacherBlueprintNewPage = await read("src/app/teacher/blueprints/new/page.tsx");
  const teacherBlueprintDetailPage = await read("src/app/teacher/blueprints/[blueprintId]/page.tsx");
  const teacherBlueprintUi = await read("src/app/teacher/blueprints/blueprint-library-ui.tsx");
  const teacherBlueprintActions = await read("src/app/teacher/blueprints/actions.ts");
  const teacherBankBlueprintsPage = await read("src/app/teacher/banks/[bankId]/blueprints/page.tsx");
  const teacherBlueprintHelper = await read("src/lib/teacher-blueprints.ts");
  const routeSmoke = await read("scripts/route-smoke.mjs");
  const securitySmoke = await read("scripts/security-smoke.mjs");
  const rlsSmoke = await read("scripts/supabase-rls-smoke.mjs");
  const smokeAll = await read("scripts/smoke-all.mjs");
  const grantReapply = await read("docs/blueprint-library-0031-grants-reapply.sql");
  const policyReapply = await read("docs/blueprint-library-0031-policy-reapply.sql");

  assert(
    migration.includes("alter table public.question_blueprints") &&
      migration.includes("blueprint_kind") &&
      migration.includes("visibility in ('private', 'shared', 'organization', 'public')") &&
      migration.includes("create table if not exists public.bank_blueprints") &&
      migration.includes("private.can_use_question_blueprint_library") &&
      migration.includes("private.can_admin_question_blueprint_library") &&
      migration.includes("private.can_read_question_blueprint") &&
      migration.includes("private.can_manage_question_blueprint") &&
      migration.includes("alter table public.bank_blueprints enable row level security") &&
      migration.includes("bank_blueprints_member_read") &&
      migration.includes("grant select, insert, update, delete on public.question_blueprint_folders to authenticated") &&
      migration.includes("added_by = auth.uid()") &&
      !migration.includes("to anon"),
    "blueprint library migration must add teacher visibility, bank links, RLS helpers, and avoid anon grants",
  );

  assert(
    grantReapply.includes("grant select, insert, update, delete on public.question_blueprint_folders to authenticated") &&
      grantReapply.includes("grant execute on function private.can_read_question_blueprint_folder(uuid) to authenticated") &&
      !grantReapply.includes("insert into") &&
      !grantReapply.includes("delete from") &&
      policyReapply.includes("create or replace function private.can_use_question_blueprint_library()") &&
      policyReapply.includes("profile.role in ('teacher', 'admin', 'super_admin')") &&
      policyReapply.includes("drop policy if exists question_blueprint_folders_library_insert") &&
      policyReapply.includes("private.can_use_question_blueprint_library()") &&
      !policyReapply.includes("insert into") &&
      !policyReapply.includes("delete from"),
    "Blueprint Library reapply SQL must be copy-paste-safe and preserve teacher/admin role gates without data mutation",
  );

  assert(
    teacherBlueprintPage.includes("Blueprint Library") &&
      teacherBlueprintPage.includes("Blueprints are reusable planning/package assets") &&
      teacherBlueprintPage.includes("Create Blueprint") &&
      teacherBlueprintPage.includes("New Folder") &&
      teacherBlueprintPage.includes("BlueprintFilterTabs") &&
      teacherBlueprintPage.includes("BlueprintFolderPanel") &&
      teacherBlueprintPage.includes("BlueprintCard") &&
      !teacherBlueprintPage.includes("/admin/blueprints"),
    "/teacher/blueprints must be a teacher library surface, not an admin shortcut",
  );

  assert(
    teacherBlueprintUi.includes("Private") &&
      teacherBlueprintUi.includes("Shared") &&
      teacherBlueprintUi.includes("Organization") &&
      teacherBlueprintUi.includes("Public review") &&
      teacherBlueprintUi.includes("Bank-linked") &&
      teacherBlueprintUi.includes("Start with a private Blueprint") &&
      teacherBlueprintUi.includes("Blueprints do not go directly to students") &&
      teacherBlueprintUi.includes("Generate Review Drafts") &&
      teacherBlueprintUi.includes("coming next"),
    "teacher Blueprint UI must expose visibility filters, empty state, and disabled future actions",
  );

  assert(
    teacherBlueprintNewPage.includes("action={createTeacherBlueprint}") &&
      teacherBlueprintNewPage.includes("Create a reusable planning asset") &&
      teacherBlueprintNewPage.includes("This form only creates the library asset") &&
      teacherBlueprintActions.includes("requireTeacher") &&
      teacherBlueprintActions.includes("question_blueprints") &&
      teacherBlueprintActions.includes("bank_blueprints") &&
      teacherBlueprintActions.includes("generation_ready: false") &&
      !teacherBlueprintActions.includes("executeDeepSeek") &&
      !teacherBlueprintActions.includes("callAIPdfExtractionProvider") &&
      !teacherBlueprintActions.includes("generateWithGemini"),
    "teacher Blueprint create action must create only a review-gated library asset without provider calls",
  );

  assert(
    teacherBlueprintDetailPage.includes("BlueprintWorkflowPanel") &&
      teacherBlueprintDetailPage.includes("Generate Review Drafts") &&
      teacherBlueprintDetailPage.includes("Provider choice, model, and credentials stay admin-only") &&
      teacherBlueprintDetailPage.includes("Source lineage and constraints") &&
      teacherBankBlueprintsPage.includes("Blueprint links for") &&
      teacherBankBlueprintsPage.includes("Create Blueprint from this bank") &&
      teacherBankBlueprintsPage.includes("No Blueprints linked to this bank yet") &&
      teacherBankBlueprintsPage.includes("will appear here") &&
      teacherBlueprintHelper.includes("BlueprintLibrarySchemaMissingError"),
    "teacher Blueprint detail and bank-linked pages must expose safe lineage and bank linkage",
  );

  assert(
    routeSmoke.includes("teacherBlueprintPage") &&
      securitySmoke.includes("teacherBlueprintPage") &&
      rlsSmoke.includes("blueprintLibraryMigration") &&
      smokeAll.includes("blueprint-library-foundation-smoke.mjs"),
    "route/security/RLS/smoke-all must include Blueprint Library coverage",
  );

  console.log("PASS blueprint library foundation source smoke");
}

async function verifyPrivateBlueprintBlocked(client, blueprintId, label) {
  const { data, error } = await client
    .from("question_blueprints")
    .select("id")
    .eq("id", blueprintId);

  assert(
    !error,
    `${label} private Blueprint query failed: ${summarizeSupabaseError(error)}`,
  );
  assert(!data?.length, `${label} unexpectedly read private teacher Blueprint`);
}

async function runLiveSmoke() {
  if (!supabaseUrl || !supabaseAnonKey) {
    console.log("SKIP blueprint library live smoke: missing Supabase URL/anon key.");
    return;
  }

  if (!teacherUsername || !teacherPassword) {
    console.log("SKIP blueprint library live smoke: missing TEST_TEACHER credentials.");
    return;
  }

  if (!serviceRoleKey) {
    console.log("SKIP blueprint library live smoke: missing service role cleanup key.");
    return;
  }

  const teacher = await signIn(teacherUsername, teacherPassword, "teacher");
  if (!teacher) return;

  const { data: profile, error: profileError } = await teacher.client
    .from("profiles")
    .select("id, role, status, default_organization_id")
    .eq("id", teacher.user.id)
    .single();

  assert(
    !profileError,
    `blueprint library teacher profile lookup failed: ${summarizeSupabaseError(profileError)}`,
  );
  assert(profile.role === "teacher", "blueprint library smoke requires TEST_TEACHER credentials");
  assert(profile.status === "active", "blueprint library smoke teacher must be active");
  assert(profile.default_organization_id, "teacher must have a default organization");

  const probe = await teacher.client
    .from("question_blueprints")
    .select("id, visibility, blueprint_kind, source_bank_id")
    .limit(1);

  if (isMissingBlueprintLibrary(probe.error)) {
    console.log(
      "SKIP blueprint library live smoke: clean migration 0031 is not applied to the target Supabase project yet.",
    );
    return;
  }

  assert(
    !probe.error,
    `blueprint library schema probe failed: ${summarizeSupabaseError(probe.error)}`,
  );

  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let bankId = null;
  let folderId = null;
  let blueprintId = null;
  let linkId = null;

  try {
    const { data: createdBankId, error: createBankError } = await teacher.client.rpc(
      "create_question_bank",
      {
        bank_description: "Smoke-created bank for Blueprint Library validation.",
        bank_name: `Blueprint Library smoke ${suffix}`,
        bank_visibility: "private",
      },
    );

    assert(
      !createBankError && createdBankId,
      `blueprint library bank create failed: ${summarizeSupabaseError(createBankError)}`,
    );
    bankId = createdBankId;
    console.log("PASS blueprint library live smoke created private source bank");

    folderId = randomUUID();
    const { error: folderError } = await teacher.client
      .from("question_blueprint_folders")
      .insert({
        created_by: teacher.user.id,
        description: "Smoke-created folder.",
        id: folderId,
        name: `Blueprint folder smoke ${suffix}`,
        organization_id: profile.default_organization_id,
        owner_id: teacher.user.id,
        owner_scope: "teacher",
        slug: `blueprint-folder-smoke-${suffix}`,
        status: "active",
        updated_by: teacher.user.id,
        visibility: "private",
      });

    assert(
      !folderError,
      `blueprint library folder create failed: ${summarizeSupabaseError(folderError)}`,
    );
    const { data: folder, error: folderReadError } = await teacher.client
      .from("question_blueprint_folders")
      .select("id, name")
      .eq("id", folderId)
      .single();
    assert(
      !folderReadError && folder?.id === folderId,
      `teacher could not read created Blueprint folder: ${summarizeSupabaseError(folderReadError)}`,
    );
    console.log("PASS teacher can create private Blueprint folder");

    blueprintId = randomUUID();
    const { error: blueprintError } = await teacher.client
      .from("question_blueprints")
      .insert({
        answer_spec_pattern: {},
        blueprint_kind: "manual",
        created_by: teacher.user.id,
        description: "Smoke-created private teacher Blueprint.",
        difficulty_profile: {},
        distractor_pattern: {},
        folder_id: folderId,
        generation_blocking_reasons: ["Smoke Blueprint is not generation-ready."],
        generation_constraints: { reviewGate: "review_drafts_required" },
        generation_ready: false,
        id: blueprintId,
        metadata: { smokeOnly: true },
        organization_id: profile.default_organization_id,
        originality_constraints: { rule: "Smoke only" },
        owner_id: teacher.user.id,
        owner_scope: "teacher",
        question_pattern: { summary: "Smoke pattern" },
        required_elements: [],
        source_bank_id: bankId,
        source_kind: "question_bank",
        status: "pending_review",
        taxonomy_targets: [],
        title: `Blueprint Library smoke ${suffix}`,
        updated_by: teacher.user.id,
        visibility: "private",
      });

    assert(
      !blueprintError,
      `teacher private Blueprint create failed: ${summarizeSupabaseError(blueprintError)}`,
    );
    const { data: blueprint, error: blueprintReadError } = await teacher.client
      .from("question_blueprints")
      .select("id, title, visibility, blueprint_kind, source_bank_id")
      .eq("id", blueprintId)
      .single();
    assert(
      !blueprintReadError && blueprint?.id === blueprintId,
      `teacher could not read created private Blueprint: ${summarizeSupabaseError(blueprintReadError)}`,
    );
    assert(
      blueprint.visibility === "private" &&
        blueprint.blueprint_kind === "manual" &&
        blueprint.source_bank_id === bankId,
      "teacher Blueprint must start private/manual and preserve source bank linkage",
    );
    console.log("PASS teacher can create private manual Blueprint");

    linkId = randomUUID();
    const { error: linkError } = await teacher.client
      .from("bank_blueprints")
      .insert({
        added_by: teacher.user.id,
        bank_id: bankId,
        blueprint_id: blueprintId,
        id: linkId,
        metadata: { smokeOnly: true },
        relation_kind: "linked",
        status: "active",
      });

    assert(
      !linkError,
      `bank Blueprint link create failed: ${summarizeSupabaseError(linkError)}`,
    );
    const { data: link, error: linkReadError } = await teacher.client
      .from("bank_blueprints")
      .select("id, bank_id, blueprint_id, relation_kind")
      .eq("id", linkId)
      .single();
    assert(
      !linkReadError && link?.id === linkId,
      `teacher could not read bank Blueprint link: ${summarizeSupabaseError(linkReadError)}`,
    );
    console.log("PASS teacher can link Blueprint to private bank");

    const { data: listedBlueprints, error: listError } = await teacher.client
      .from("question_blueprints")
      .select("id, title, visibility, blueprint_kind")
      .eq("id", blueprintId);

    assert(
      !listError && listedBlueprints?.length === 1,
      `teacher could not list/open private Blueprint: ${summarizeSupabaseError(listError)}`,
    );
    console.log("PASS teacher can list and open private Blueprint");

    const { data: listedLinks, error: linkListError } = await teacher.client
      .from("bank_blueprints")
      .select("id, bank_id, blueprint_id")
      .eq("id", linkId);

    assert(
      !linkListError && listedLinks?.length === 1,
      `teacher could not list bank-linked Blueprint: ${summarizeSupabaseError(linkListError)}`,
    );
    console.log("PASS teacher can list bank-linked Blueprint");

    const anon = createClient(supabaseUrl, supabaseAnonKey);
    await verifyPrivateBlueprintBlocked(anon, blueprintId, "anonymous user");
    console.log("PASS anonymous users cannot browse private teacher Blueprints");

    if (studentUsername && studentPassword) {
      const student = await signIn(studentUsername, studentPassword, "student");
      if (student) {
        await verifyPrivateBlueprintBlocked(student.client, blueprintId, "student");
        const { data: studentLinks, error: studentLinkError } = await student.client
          .from("bank_blueprints")
          .select("id")
          .eq("id", linkId);
        assert(
          !studentLinkError,
          `student bank Blueprint link query failed: ${summarizeSupabaseError(studentLinkError)}`,
        );
        assert(!studentLinks?.length, "student unexpectedly read private bank-linked Blueprint");
        console.log("PASS students cannot browse private bank-linked Blueprints");
      }
    } else {
      console.log("SKIP student Blueprint Library check: TEST_STUDENT credentials are missing.");
    }

    if (unrelatedTeacherUsername && unrelatedTeacherPassword) {
      const unrelatedTeacher = await signIn(
        unrelatedTeacherUsername,
        unrelatedTeacherPassword,
        "unrelated teacher",
      );
      if (unrelatedTeacher) {
        await verifyPrivateBlueprintBlocked(
          unrelatedTeacher.client,
          blueprintId,
          "unrelated teacher",
        );
        console.log("PASS unrelated teachers cannot browse private teacher Blueprints");
      }
    } else {
      console.log("SKIP unrelated teacher Blueprint check: credentials are missing.");
    }
  } finally {
    await cleanup({ bankId, blueprintId, folderId, linkId });
  }
}

await runSourceSmoke();
await runLiveSmoke();
