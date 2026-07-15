import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import pg from "pg";

import { createGoogleAccountLinksPostgresHarness } from "./google-account-links-embedded-postgres.mjs";
import { splitSql } from "./sql-split.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const root = resolve(__dirname, "..");
dotenv.config({ path: resolve(root, ".env.local") });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const teacherUsername = process.env.TEST_TEACHER_USERNAME ?? process.env.TEST_ADMIN_USERNAME;
const teacherPassword = process.env.TEST_TEACHER_PASSWORD ?? process.env.TEST_ADMIN_PASSWORD;
const studentUsername = process.env.TEST_STUDENT_USERNAME;
const studentPassword = process.env.TEST_STUDENT_PASSWORD;
const unrelatedTeacherUsername = process.env.TEST_UNRELATED_TEACHER_USERNAME;
const unrelatedTeacherPassword = process.env.TEST_UNRELATED_TEACHER_PASSWORD;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function usernameToLocalEmail(username) {
  const normalized = username.trim().toLowerCase();
  return normalized.includes("@") ? normalized : `${normalized}@local.app`;
}

async function read(relativePath) {
  return readFile(resolve(root, relativePath), "utf8");
}

async function signIn(username, password, label) {
  const client = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false },
  });
  const { data, error } = await client.auth.signInWithPassword({
    email: usernameToLocalEmail(username),
    password,
  });
  if (error || !data.user?.id) {
    console.log(`SKIP ${label} live checks: configured test account could not sign in.`);
    return null;
  }
  return { client, user: data.user };
}

async function resolveOrganizationId(client, userId) {
  const { data: profile, error: profileError } = await client
    .from("profiles")
    .select("default_organization_id, role, status")
    .eq("id", userId)
    .single();
  assert(!profileError && profile?.status === "active", "teacher fixture must have an active profile");
  assert(
    ["teacher", "admin", "super_admin"].includes(profile.role),
    "teacher fixture must have a teacher-capable role",
  );
  if (profile.default_organization_id) return profile.default_organization_id;

  const { data: membership, error: membershipError } = await client
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", userId)
    .eq("status", "active")
    .in("role", ["teacher", "admin"])
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  assert(!membershipError && membership?.organization_id, "teacher fixture must have an allowed organization");
  return membership.organization_id;
}

async function applySql(client, sql) {
  for (const statement of splitSql(sql)) {
    await client.query(statement);
  }
}

async function asUser(client, profileId, jwtRole = "authenticated") {
  await client.query("select set_config('request.jwt.claim.role', $1, false)", [jwtRole]);
  await client.query("select set_config('request.jwt.claim.sub', $1, false)", [profileId]);
  await client.query("select set_config('request.jwt.claims', $1, false)", [
    JSON.stringify({ sub: profileId, role: jwtRole }),
  ]);
}

async function expectDenied(label, operation) {
  try {
    await operation();
  } catch {
    console.log(`PASS ${label}`);
    return;
  }
  throw new Error(`${label}: operation unexpectedly succeeded`);
}

async function runEmbeddedPostgresSmoke() {
  const [foundations, classroomFoundation, classroomDisplayCode, classroomRemoval, priorRlsFix, hardening] =
    await Promise.all([
      read("supabase/clean-migrations/0001_foundations_identity_organizations.sql"),
      read("supabase/clean-migrations/0018_classroom_foundation.sql"),
      read("supabase/clean-migrations/0019_classroom_join_code_display_and_roster_removal.sql"),
      read("supabase/clean-migrations/0020_classroom_removed_member_rejoin_block.sql"),
      read("supabase/clean-migrations/0030_teacher_classroom_rls_fix.sql"),
      read("supabase/clean-migrations/0043_classroom_creation_rls_hardening.sql"),
    ]);
  const harness = await createGoogleAccountLinksPostgresHarness("classroom-create-rls");
  const { connection, instance } = harness;
  let bootstrap;
  let rlsClient;

  const ids = {
    inactiveTeacher: "10000000-0000-0000-0000-000000000001",
    student: "10000000-0000-0000-0000-000000000002",
    teacher: "10000000-0000-0000-0000-000000000003",
    unrelatedTeacher: "10000000-0000-0000-0000-000000000004",
  };
  const organizations = {
    allowed: "20000000-0000-0000-0000-000000000001",
    foreign: "20000000-0000-0000-0000-000000000002",
  };

  try {
    await instance.initialise();
    await instance.start();
    await instance.createDatabase("classroom_create_rls_test").catch(() => {});
    bootstrap = new pg.Client({ ...connection, database: "classroom_create_rls_test" });
    await bootstrap.connect();

    await applySql(
      bootstrap,
      [
        "create schema if not exists auth;",
        "do $$ begin",
        "  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;",
        "  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;",
        "  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;",
        "  if not exists (select 1 from pg_roles where rolname = 'classroom_rls_tester') then create role classroom_rls_tester login password 'classroom_rls_tester_password'; end if;",
        "end $$;",
        "grant authenticated, anon to classroom_rls_tester;",
        "create table auth.users (id uuid primary key, email text unique, raw_user_meta_data jsonb not null default '{}'::jsonb, password_set boolean not null default false, created_at timestamptz not null default now());",
        "create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;",
        "create or replace function auth.role() returns text language sql stable as $$ select current_setting('request.jwt.claim.role', true) $$;",
        "create or replace function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;",
        "grant usage on schema public, auth to anon, authenticated, service_role;",
      ].join("\n"),
    );
    await applySql(bootstrap, foundations);
    await applySql(bootstrap, classroomFoundation);
    await applySql(bootstrap, classroomDisplayCode);
    await applySql(bootstrap, classroomRemoval);
    await applySql(bootstrap, priorRlsFix);
    await applySql(bootstrap, hardening);
    await applySql(
      bootstrap,
      "grant select, update on table public.classrooms to anon, authenticated;\n" +
        "grant select on table public.classroom_members, public.classroom_join_codes to anon, authenticated;",
    );

    await bootstrap.query(
      "insert into auth.users (id, email) values ($1, 'teacher@example.test'), ($2, 'student@example.test'), ($3, 'inactive@example.test'), ($4, 'unrelated@example.test')",
      [ids.teacher, ids.student, ids.inactiveTeacher, ids.unrelatedTeacher],
    );
    await bootstrap.query(
      "insert into public.organizations (id, name, slug, status) values ($1, 'Allowed Org', 'allowed-org', 'active'), ($2, 'Foreign Org', 'foreign-org', 'active')",
      [organizations.allowed, organizations.foreign],
    );
    await bootstrap.query(
      "insert into public.profiles (id, email, role, status, default_organization_id, display_name) values ($1, 'teacher@example.test', 'teacher', 'active', $5, 'Teacher'), ($2, 'student@example.test', 'student', 'active', $5, 'Student'), ($3, 'inactive@example.test', 'teacher', 'disabled', $5, 'Inactive Teacher'), ($4, 'unrelated@example.test', 'teacher', 'active', $6, 'Unrelated Teacher')",
      [
        ids.teacher,
        ids.student,
        ids.inactiveTeacher,
        ids.unrelatedTeacher,
        organizations.allowed,
        organizations.foreign,
      ],
    );

    rlsClient = new pg.Client({
      ...connection,
      database: "classroom_create_rls_test",
      user: "classroom_rls_tester",
      password: "classroom_rls_tester_password",
    });
    await rlsClient.connect();

    const requestId = "30000000-0000-0000-0000-000000000001";
    await asUser(rlsClient, ids.teacher);
    const firstCreate = await rlsClient.query(
      "select * from public.create_teacher_classroom($1, $2, $3, $4, $5)",
      ["Embedded Classroom", "Security", "Local RLS fixture", organizations.allowed, requestId],
    );
    assert(firstCreate.rowCount === 1, "embedded teacher create RPC did not return one Classroom");
    const first = firstCreate.rows[0];
    assert(first.classroom_id && first.display_code, "embedded create did not return safe Classroom metadata");

    const duplicateCreate = await rlsClient.query(
      "select * from public.create_teacher_classroom($1, $2, $3, $4, $5)",
      ["Embedded Classroom", "Security", "Local RLS fixture", organizations.allowed, requestId],
    );
    assert(
      duplicateCreate.rows[0]?.classroom_id === first.classroom_id &&
        duplicateCreate.rows[0]?.display_code === first.display_code,
      "embedded duplicate create was not idempotent",
    );
    const creatorMembers = await bootstrap.query(
      "select count(*)::int as count from public.classroom_members where classroom_id = $1 and user_id = $2 and role = 'teacher' and status = 'active'",
      [first.classroom_id, ids.teacher],
    );
    assert(creatorMembers.rows[0].count === 1, "embedded create did not create exactly one teacher member");
    const creatorRead = await rlsClient.query("select id from public.classrooms where id = $1", [
      first.classroom_id,
    ]);
    const creatorManage = await rlsClient.query("select private.can_manage_classroom($1) as allowed", [
      first.classroom_id,
    ]);
    assert(creatorRead.rowCount === 1 && creatorManage.rows[0]?.allowed === true, "creator cannot read/manage the new Classroom");
    console.log("PASS embedded active teacher create is atomic and idempotent");

    await expectDenied("embedded teacher direct Classroom insert is denied", () =>
      rlsClient.query(
        "insert into public.classrooms (organization_id, owner_id, name, created_by) values ($1, $2, $3, $4)",
        [organizations.allowed, ids.student, "Spoofed Classroom", ids.student],
      ),
    );
    await expectDenied("embedded teacher direct membership insert is denied", () =>
      rlsClient.query(
        "insert into public.classroom_members (classroom_id, user_id, role, status) values ($1, $2, 'teacher', 'active')",
        [first.classroom_id, ids.student],
      ),
    );
    await expectDenied("embedded caller cannot use the retired join-code RPC signature", () =>
      rlsClient.query(
        "select * from public.create_teacher_classroom($1, $2, $3, $4, $5::text)",
        ["Rejected Client Code", null, null, organizations.allowed, "ABCD-EFGH"],
      ),
    );

    await asUser(rlsClient, ids.student);
    await expectDenied("embedded student Classroom creation is denied", () =>
      rlsClient.query("select * from public.create_teacher_classroom($1, null, null, null, $2)", [
        "Student Classroom",
        "30000000-0000-0000-0000-000000000002",
      ]),
    );
    const joined = await rlsClient.query("select * from public.join_classroom_by_code($1)", [
      first.display_code,
    ]);
    assert(joined.rows[0]?.classroom_id === first.classroom_id, "embedded Student join returned wrong Classroom");
    const studentRead = await rlsClient.query("select id from public.classrooms where id = $1", [
      first.classroom_id,
    ]);
    const studentManage = await rlsClient.query("select private.can_manage_classroom($1) as allowed", [
      first.classroom_id,
    ]);
    const studentSettingsUpdate = await rlsClient.query(
      "update public.classrooms set name = 'Student Settings Attempt' where id = $1 returning id",
      [first.classroom_id],
    );
    assert(
      studentRead.rowCount === 1 && studentManage.rows[0]?.allowed === false && studentSettingsUpdate.rowCount === 0,
      "student membership unexpectedly gained Classroom management access",
    );
    console.log("PASS embedded student membership can read but cannot manage Classroom settings");

    await asUser(rlsClient, ids.teacher);
    await rlsClient.query(
      "select public.set_classroom_student_membership_status($1, $2, 'removed')",
      [first.classroom_id, joined.rows[0].membership_id],
    );
    await asUser(rlsClient, ids.student);
    await expectDenied("embedded removed Student cannot silently rejoin", () =>
      rlsClient.query("select * from public.join_classroom_by_code($1)", [first.display_code]),
    );

    await asUser(rlsClient, ids.inactiveTeacher);
    await expectDenied("embedded inactive Teacher creation is denied", () =>
      rlsClient.query("select * from public.create_teacher_classroom($1, null, null, null, $2)", [
        "Inactive Classroom",
        "30000000-0000-0000-0000-000000000003",
      ]),
    );

    await asUser(rlsClient, ids.unrelatedTeacher);
    const unrelatedRead = await rlsClient.query("select id from public.classrooms where id = $1", [
      first.classroom_id,
    ]);
    const unrelatedManage = await rlsClient.query("select private.can_manage_classroom($1) as allowed", [
      first.classroom_id,
    ]);
    assert(
      unrelatedRead.rowCount === 0 && unrelatedManage.rows[0]?.allowed === false,
      "unrelated teacher can read or manage the private Classroom",
    );
    await expectDenied("embedded unrelated Teacher foreign-organization create is denied", () =>
      rlsClient.query("select * from public.create_teacher_classroom($1, null, null, $2, $3)", [
        "Foreign Classroom",
        organizations.allowed,
        "30000000-0000-0000-0000-000000000004",
      ]),
    );

    await rlsClient.query("set role anon");
    await asUser(rlsClient, "", "anon");
    await expectDenied("embedded anonymous Classroom creation is denied", () =>
      rlsClient.query("select * from public.create_teacher_classroom($1, null, null, null, $2)", [
        "Anonymous Classroom",
        "30000000-0000-0000-0000-000000000005",
      ]),
    );
    await rlsClient.query("reset role");

    console.log("PASS embedded Classroom RLS matrix completed");
  } finally {
    if (rlsClient) await rlsClient.end().catch(() => {});
    if (bootstrap) await bootstrap.end().catch(() => {});
    await harness.cleanup();
  }
}

async function main() {
  const [migration, actions, foundationSmoke, operationsSmoke] = await Promise.all([
    read("supabase/clean-migrations/0043_classroom_creation_rls_hardening.sql"),
    read("src/app/teacher/classrooms/actions.ts"),
    read("scripts/classroom-foundation-smoke.mjs"),
    read("scripts/classroom-operations-smoke.mjs"),
  ]);

  assert(
    migration.includes("drop policy if exists classrooms_teacher_create") &&
      migration.includes("revoke insert on table public.classrooms from anon, authenticated") &&
      migration.includes("grant insert on table public.classrooms to service_role"),
    "0043 must retire direct authenticated Classroom creation while preserving service-role access",
  );
  assert(
    migration.includes("drop policy if exists classroom_members_teacher_write") &&
      migration.includes("revoke insert, update on table public.classroom_members from anon, authenticated") &&
      migration.includes("grant insert, update on table public.classroom_members to service_role"),
    "0043 must retire direct authenticated Classroom membership writes",
  );
  assert(
    migration.includes("create function public.create_teacher_classroom") &&
      migration.includes("v_actor_id uuid := auth.uid()") &&
      migration.includes("p_request_id uuid") &&
      migration.includes("set search_path = public, private, extensions") &&
      migration.includes("on conflict on constraint classrooms_owner_creation_request_key") &&
      migration.includes("extensions.gen_random_bytes") &&
      !migration.includes("p_join_code text"),
    "0043 classroom creation RPC must derive authority and join-code state server-side",
  );
  assert(
    migration.includes("create function public.add_classroom_co_teacher") &&
      migration.includes("create function public.set_classroom_student_membership_status") &&
      migration.includes("create function public.remove_classroom_co_teacher") &&
      migration.includes("grant execute on function public.add_classroom_co_teacher(uuid, uuid) to authenticated"),
    "0043 must preserve constrained teacher roster actions through RPCs",
  );
  assert(
    !migration.includes("bank_members") &&
      !migration.includes("review_draft") &&
      !migration.includes("question_blueprint") &&
      !migration.includes("insert into public.assignments"),
    "0043 must not create Bank access, assignments, Review Draft exposure, or Blueprints",
  );
  assert(
    actions.includes('await requireTeacher()') &&
      actions.includes('p_organization_id: null') &&
      actions.includes('p_request_id: parsed.requestId') &&
      !actions.includes("p_join_code") &&
      actions.includes('"add_classroom_co_teacher"') &&
      actions.includes('"set_classroom_student_membership_status"') &&
      actions.includes('"remove_classroom_co_teacher"'),
    "teacher server actions must use only the reviewed Classroom RPC contract",
  );
  assert(
    foundationSmoke.includes("create_teacher_classroom") &&
      !foundationSmoke.includes('.from("classrooms").insert') &&
      operationsSmoke.includes("add_classroom_co_teacher"),
    "Classroom smokes must exercise RPC creation rather than direct teacher table inserts",
  );
  console.log("PASS classroom creation source contract is narrow and Bank-independent");

  await runEmbeddedPostgresSmoke();

  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
    console.log("SKIP live Classroom RLS checks: missing disposable Supabase process environment.");
    return;
  }
  if (!teacherUsername || !teacherPassword || !studentUsername || !studentPassword) {
    console.log("SKIP live Classroom RLS checks: missing dedicated teacher or student test credentials.");
    return;
  }

  const [teacher, student] = await Promise.all([
    signIn(teacherUsername, teacherPassword, "teacher"),
    signIn(studentUsername, studentPassword, "student"),
  ]);
  if (!teacher || !student) return;

  const service = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { persistSession: false },
  });
  const organizationId = await resolveOrganizationId(teacher.client, teacher.user.id);
  const { count: bankMembershipCountBefore, error: bankMembershipBeforeError } = await service
    .from("bank_members")
    .select("id", { count: "exact", head: true })
    .in("user_id", [teacher.user.id, student.user.id]);
  assert(!bankMembershipBeforeError, "could not capture Bank membership baseline");
  const requestId = randomUUID();
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
  let classroomId = null;
  let studentMembershipId = null;

  try {
    const createArgs = {
      p_description: "Disposable classroom creation RLS smoke fixture.",
      p_name: `Classroom RLS smoke ${suffix}`,
      p_organization_id: organizationId,
      p_request_id: requestId,
      p_subject: "Security smoke",
    };
    const { data: firstRows, error: firstError } = await teacher.client.rpc(
      "create_teacher_classroom",
      createArgs,
    );
    assert(!firstError, "active teacher classroom RPC failed");
    const first = Array.isArray(firstRows) ? firstRows[0] : firstRows;
    assert(first?.classroom_id && first?.display_code, "create RPC did not return safe Classroom metadata");
    classroomId = first.classroom_id;

    const { data: secondRows, error: secondError } = await teacher.client.rpc(
      "create_teacher_classroom",
      createArgs,
    );
    assert(!secondError, "same idempotency request failed");
    const second = Array.isArray(secondRows) ? secondRows[0] : secondRows;
    assert(
      second?.classroom_id === first.classroom_id && second?.display_code === first.display_code,
      "duplicate Classroom create did not return the original Classroom safely",
    );

    const { count: creatorMembershipCount, error: creatorMembershipError } = await service
      .from("classroom_members")
      .select("id", { count: "exact", head: true })
      .eq("classroom_id", classroomId)
      .eq("user_id", teacher.user.id)
      .eq("role", "teacher")
      .eq("status", "active");
    assert(
      !creatorMembershipError && creatorMembershipCount === 1,
      "create RPC did not create exactly one active teacher membership",
    );
    console.log("PASS active teacher creation is atomic and idempotent");

    const { error: directClassroomError } = await teacher.client.from("classrooms").insert({
      created_by: student.user.id,
      name: `Spoofed classroom ${suffix}`,
      organization_id: organizationId,
      owner_id: student.user.id,
      status: "active",
    });
    assert(directClassroomError, "teacher directly inserted a Classroom with spoofed identity");

    const { error: directMembershipError } = await teacher.client.from("classroom_members").insert({
      classroom_id: classroomId,
      role: "teacher",
      status: "active",
      user_id: student.user.id,
    });
    assert(directMembershipError, "teacher directly inserted another user's Classroom membership");
    console.log("PASS direct Classroom and membership inserts are denied");

    const { error: studentCreateError } = await student.client.rpc("create_teacher_classroom", {
      p_name: `Student classroom ${suffix}`,
      p_request_id: randomUUID(),
    });
    assert(studentCreateError, "student unexpectedly created a Classroom");

    const anon = createClient(supabaseUrl, supabaseAnonKey, { auth: { persistSession: false } });
    const { error: anonCreateError } = await anon.rpc("create_teacher_classroom", {
      p_name: `Anonymous classroom ${suffix}`,
      p_request_id: randomUUID(),
    });
    assert(anonCreateError, "anonymous caller unexpectedly created a Classroom");
    console.log("PASS student and anonymous creation are denied");

    const { data: joinedRows, error: joinError } = await student.client.rpc("join_classroom_by_code", {
      join_code: first.display_code,
    });
    assert(!joinError, "student could not join a newly created Classroom with its server-generated code");
    const joined = Array.isArray(joinedRows) ? joinedRows[0] : joinedRows;
    assert(joined?.classroom_id === classroomId && joined?.membership_id, "student join returned wrong Classroom");
    studentMembershipId = joined.membership_id;

    const { error: removeError } = await teacher.client.rpc(
      "set_classroom_student_membership_status",
      {
        p_classroom_id: classroomId,
        p_member_id: studentMembershipId,
        p_status: "removed",
      },
    );
    assert(!removeError, "teacher could not remove a joined student through the scoped roster RPC");
    const { error: rejoinError } = await student.client.rpc("join_classroom_by_code", {
      join_code: first.display_code,
    });
    assert(rejoinError, "removed student silently rejoined the Classroom");

    const [bankMemberships, assignments] = await Promise.all([
      service
        .from("bank_members")
        .select("id", { count: "exact", head: true })
        .in("user_id", [teacher.user.id, student.user.id]),
      service
        .from("assignments")
        .select("id", { count: "exact", head: true })
        .eq("classroom_id", classroomId),
    ]);
    assert(
      !bankMemberships.error && bankMemberships.count === bankMembershipCountBefore,
      "Classroom creation or enrollment unexpectedly changed Bank membership",
    );
    assert(!assignments.error && assignments.count === 0, "Classroom creation unexpectedly created an Assignment");
    console.log("PASS join behavior remains scoped; creation added no Assignment or Bank membership");

    if (unrelatedTeacherUsername && unrelatedTeacherPassword) {
      const unrelatedTeacher = await signIn(
        unrelatedTeacherUsername,
        unrelatedTeacherPassword,
        "unrelated teacher",
      );
      if (unrelatedTeacher) {
        const { error: unrelatedCreateError } = await unrelatedTeacher.client.rpc(
          "create_teacher_classroom",
          {
            p_name: `Unrelated organization classroom ${suffix}`,
            p_organization_id: organizationId,
            p_request_id: randomUUID(),
          },
        );
        assert(unrelatedCreateError, "unrelated teacher created a Classroom in another organization");
        console.log("PASS unrelated teacher cannot create in a foreign organization");
      }
    } else {
      console.log("SKIP unrelated-teacher organization denial: no dedicated unrelated teacher credentials.");
    }
  } finally {
    if (classroomId) {
      await service.from("classroom_join_codes").delete().eq("classroom_id", classroomId);
      await service.from("classroom_members").delete().eq("classroom_id", classroomId);
      await service.from("classrooms").delete().eq("id", classroomId);
    }
  }

  console.log("PASS classroom creation RLS live smoke completed and cleaned its disposable fixture");
}

await main();
