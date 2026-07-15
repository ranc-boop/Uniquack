// SEC-P0 local SQL/RLS smoke. It uses an isolated embedded Postgres instance;
// it never reads local environment files or contacts Supabase.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import pg from "pg";

import { createGoogleAccountLinksPostgresHarness } from "./google-account-links-embedded-postgres.mjs";
import { splitSql } from "./sql-split.mjs";

const here = fileURLToPath(import.meta.url);
const root = resolve(dirname(here), "..");
const migrationPath = resolve(
  root,
  "supabase/clean-migrations/0039_profile_privileged_fields_immutability.sql",
);
const foundationsPath = resolve(
  root,
  "supabase/clean-migrations/0001_foundations_identity_organizations.sql",
);

const foundationsSql = readFileSync(foundationsPath, "utf8");
const migrationSql = readFileSync(migrationPath, "utf8");
const adminUsersAction = readFileSync(
  resolve(root, "src/app/admin/users/actions.ts"),
  "utf8",
);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(
  migrationSql.includes("revoke update on table public.profiles from anon, authenticated") &&
    migrationSql.includes("grant update (full_name, avatar_url, display_name)") &&
    migrationSql.includes("profiles_enforce_privileged_field_immutability"),
  "Migration must narrow profile UPDATE grants and add a trigger.",
);
assert(
  migrationSql.includes("transition_profile_role_as_super_admin") &&
    migrationSql.includes("profile_privileged_change_audit_log") &&
    migrationSql.includes("app.profile_privileged_mutation"),
  "Migration must provide audited, guarded role transitions.",
);
assert(
  adminUsersAction.includes('rpc("transition_profile_role_as_super_admin"') &&
    !adminUsersAction.includes('.from("profiles")\n    .update({ role: parsed.role })'),
  "Admin role updates must use the guarded RPC.",
);
console.log("PASS static profile privileged-field guard contract");

const harness = await createGoogleAccountLinksPostgresHarness("profile-role-immutability");
const { instance, connection } = harness;

let bootstrap;
let rlsClient;
let serviceClient;
let failures = 0;

function pass(label) {
  console.log("PASS " + label);
}

function fail(label, error) {
  failures += 1;
  const detail = error instanceof Error ? error.message : String(error);
  console.error("FAIL " + label + ": " + detail);
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
    const result = await operation();
    if (result?.rowCount === 0) {
      pass(label);
      return;
    }
    fail(label, "operation unexpectedly succeeded");
  } catch {
    pass(label);
  }
}

try {
  await instance.initialise();
  await instance.start();
  await instance.createDatabase("profile_role_test").catch(() => {});

  bootstrap = new pg.Client({ ...connection, database: "profile_role_test" });
  await bootstrap.connect();

  await applySql(
    bootstrap,
    [
      "create schema if not exists auth;",
      "do $$ begin",
      "  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;",
      "  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;",
      "  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;",
      "  if not exists (select 1 from pg_roles where rolname = 'rls_tester') then create role rls_tester login password 'rls_tester_password'; end if;",
      "  if not exists (select 1 from pg_roles where rolname = 'service_tester') then create role service_tester login password 'service_tester_password'; end if;",
      "end $$;",
      "grant authenticated, anon to rls_tester;",
      "grant service_role to service_tester;",
      "create table auth.users (id uuid primary key, email text unique, raw_user_meta_data jsonb not null default '{}'::jsonb, password_set boolean not null default false, created_at timestamptz not null default now());",
      "create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;",
      "create or replace function auth.role() returns text language sql stable as $$ select current_setting('request.jwt.claim.role', true) $$;",
      "create or replace function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;",
      "grant usage on schema public, auth to authenticated, anon, service_role;",
      "grant select, insert, update on auth.users to service_role;",
    ].join("\n"),
  );

  await applySql(bootstrap, foundationsSql);

  // Model the broad API grant 0039 must remove.
  await bootstrap.query(
    "grant select, insert, update on public.profiles to authenticated, anon",
  );
  await bootstrap.query("grant all on public.profiles to service_role");
  await applySql(bootstrap, migrationSql);

  const ids = {
    superAdmin: "11111111-1111-1111-1111-111111111111",
    admin: "22222222-2222-2222-2222-222222222222",
    teacher: "33333333-3333-3333-3333-333333333333",
    student: "44444444-4444-4444-4444-444444444444",
    otherStudent: "55555555-5555-5555-5555-555555555555",
    serviceCreated: "66666666-6666-6666-6666-666666666666",
  };
  const organizationId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

  await bootstrap.query(
    "insert into auth.users (id, email) values ($1, 'super-admin@example.test'), ($2, 'admin@example.test'), ($3, 'teacher@example.test'), ($4, 'student@example.test'), ($5, 'other@example.test')",
    [ids.superAdmin, ids.admin, ids.teacher, ids.student, ids.otherStudent],
  );
  await bootstrap.query(
    "insert into public.organizations (id, name, slug) values ($1, 'Security Test Org', 'security-test-org')",
    [organizationId],
  );
  await bootstrap.query(
    "insert into public.profiles (id, email, role, status, default_organization_id, display_name) values ($1, 'super-admin@example.test', 'super_admin', 'active', $6, 'Super Admin'), ($2, 'admin@example.test', 'admin', 'active', $6, 'Admin'), ($3, 'teacher@example.test', 'teacher', 'active', $6, 'Teacher'), ($4, 'student@example.test', 'student', 'active', $6, 'Student'), ($5, 'other@example.test', 'student', 'active', $6, 'Other Student')",
    [ids.superAdmin, ids.admin, ids.teacher, ids.student, ids.otherStudent, organizationId],
  );

  rlsClient = new pg.Client({
    host: connection.host,
    port: connection.port,
    user: "rls_tester",
    password: "rls_tester_password",
    database: "profile_role_test",
  });
  await rlsClient.connect();

  await asUser(rlsClient, ids.student);
  const safeUpdate = await rlsClient.query(
    "update public.profiles set display_name = 'Student Updated' where id = $1",
    [ids.student],
  );
  assert(safeUpdate.rowCount === 1, "student display-name update was not allowed");
  pass("student updates safe display field");

  for (const nextRole of ["teacher", "admin", "super_admin"]) {
    await expectDenied("student cannot set own role to " + nextRole, () =>
      rlsClient.query("update public.profiles set role = $1 where id = $2", [
        nextRole,
        ids.student,
      ]),
    );
  }
  await expectDenied("student cannot use profile view to change role", () =>
    rlsClient.query("update public.user_profiles set role = 'teacher' where user_id = $1", [
      ids.student,
    ]),
  );
  await expectDenied("student cannot change own status", () =>
    rlsClient.query("update public.profiles set status = 'disabled' where id = $1", [
      ids.student,
    ]),
  );
  await expectDenied("student cannot change default organization", () =>
    rlsClient.query(
      "update public.profiles set default_organization_id = null where id = $1",
      [ids.student],
    ),
  );
  await expectDenied("mixed safe and role update is atomic and denied", () =>
    rlsClient.query(
      "update public.profiles set display_name = 'Must Not Persist', role = 'teacher' where id = $1",
      [ids.student],
    ),
  );

  const studentAfterMixed = await bootstrap.query(
    "select role, status, default_organization_id, display_name from public.profiles where id = $1",
    [ids.student],
  );
  assert(studentAfterMixed.rows[0].role === "student", "student role changed after denial");
  assert(studentAfterMixed.rows[0].status === "active", "student status changed after denial");
  assert(
    studentAfterMixed.rows[0].default_organization_id === organizationId,
    "student default organization changed after denial",
  );
  assert(
    studentAfterMixed.rows[0].display_name === "Student Updated",
    "mixed update partially persisted its safe field",
  );
  pass("denied writes leave privileged and mixed fields unchanged");

  const helperState = await rlsClient.query(
    "select private.is_admin() as is_admin, private.is_teacher_or_admin() as is_teacher_or_admin",
  );
  assert(
    helperState.rows[0].is_admin === false &&
      helperState.rows[0].is_teacher_or_admin === false,
    "failed escalation changed SQL helper authorization",
  );
  pass("failed student escalation leaves SQL helpers false");

  await asUser(rlsClient, ids.teacher);
  await expectDenied("teacher cannot change own role", () =>
    rlsClient.query("update public.profiles set role = 'admin' where id = $1", [
      ids.teacher,
    ]),
  );
  await expectDenied("teacher cannot invoke the super-admin role RPC", () =>
    rlsClient.query(
      "select public.transition_profile_role_as_super_admin($1, 'teacher')",
      [ids.otherStudent],
    ),
  );

  await asUser(rlsClient, ids.admin);
  await expectDenied("admin cannot change own role through self path", () =>
    rlsClient.query("update public.profiles set role = 'super_admin' where id = $1", [
      ids.admin,
    ]),
  );
  await expectDenied("admin cannot invoke the super-admin role RPC", () =>
    rlsClient.query(
      "select public.transition_profile_role_as_super_admin($1, 'teacher')",
      [ids.otherStudent],
    ),
  );

  await asUser(rlsClient, ids.student);
  const unrelated = await rlsClient.query(
    "update public.profiles set display_name = 'Cross User Write' where id = $1",
    [ids.otherStudent],
  );
  assert(unrelated.rowCount === 0, "student updated another profile");
  pass("unrelated user cannot update another profile");

  await rlsClient.query("set role anon");
  await asUser(rlsClient, "", "anon");
  await expectDenied("anonymous profile update is denied", () =>
    rlsClient.query("update public.profiles set display_name = 'Anonymous' where id = $1", [
      ids.student,
    ]),
  );
  await rlsClient.query("reset role");

  await asUser(rlsClient, ids.superAdmin);
  await expectDenied("super-admin direct table role update is denied", () =>
    rlsClient.query("update public.profiles set role = 'teacher' where id = $1", [
      ids.superAdmin,
    ]),
  );

  await asUser(rlsClient, ids.superAdmin);
  await rlsClient.query(
    "select public.transition_profile_role_as_super_admin($1, 'teacher')",
    [ids.otherStudent],
  );
  const transitioned = await bootstrap.query(
    "select role from public.profiles where id = $1",
    [ids.otherStudent],
  );
  assert(transitioned.rows[0].role === "teacher", "guarded transition failed");
  pass("authorized super-admin role transition succeeds through RPC");

  await expectDenied("super-admin cannot self-demote through role RPC", () =>
    rlsClient.query(
      "select public.transition_profile_role_as_super_admin($1, 'admin')",
      [ids.superAdmin],
    ),
  );

  await asUser(rlsClient, ids.superAdmin);
  await rlsClient.query(
    "select public.transition_profile_role_as_super_admin($1, 'student')",
    [ids.otherStudent],
  );
  const audit = await bootstrap.query(
    "select count(*)::integer as count from private.profile_privileged_change_audit_log where target_profile_id = $1",
    [ids.otherStudent],
  );
  assert(audit.rows[0].count === 2, "role transitions were not safely audited");
  pass("role transitions write private audit events");

  serviceClient = new pg.Client({
    host: connection.host,
    port: connection.port,
    user: "service_tester",
    password: "service_tester_password",
    database: "profile_role_test",
  });
  await serviceClient.connect();
  await serviceClient.query("set role service_role");
  await asUser(serviceClient, ids.serviceCreated, "service_role");
  await serviceClient.query(
    "insert into auth.users (id, email) values ($1, 'service-created@example.test')",
    [ids.serviceCreated],
  );
  await serviceClient.query(
    "insert into public.profiles (id, email, role, status, default_organization_id) values ($1, 'service-created@example.test', 'teacher', 'disabled', $2)",
    [ids.serviceCreated, organizationId],
  );
  const serviceCreated = await bootstrap.query(
    "select role, status, default_organization_id from public.profiles where id = $1",
    [ids.serviceCreated],
  );
  assert(
    serviceCreated.rows[0].role === "teacher" &&
      serviceCreated.rows[0].status === "disabled" &&
      serviceCreated.rows[0].default_organization_id === organizationId,
    "service-role profile creation lost privileged fields",
  );
  pass("service-role profile creation remains available");

  await bootstrap.query(
    "alter table public.profiles add column google_sub text, add column google_email_at_link text, add column google_linked_at timestamptz",
  );
  await bootstrap.query(
    "create table public.profile_identity_sync_source (profile_id uuid primary key, google_sub text not null)",
  );
  await bootstrap.query(
    [
      "create or replace function private.test_profile_identity_sync()",
      "returns trigger",
      "language plpgsql",
      "security definer",
      "set search_path = public, private",
      "as $$",
      "begin",
      "  update public.profiles",
      "  set google_sub = new.google_sub, google_email_at_link = 'linked@example.test', google_linked_at = now()",
      "  where id = new.profile_id;",
      "  return new;",
      "end;",
      "$$;",
      "create trigger profile_identity_sync_test after insert on public.profile_identity_sync_source for each row execute function private.test_profile_identity_sync();",
      "grant insert on public.profile_identity_sync_source to authenticated;",
    ].join("\n"),
  );
  await asUser(rlsClient, ids.student);
  await rlsClient.query(
    "insert into public.profile_identity_sync_source (profile_id, google_sub) values ($1, 'test-google-sub')",
    [ids.student],
  );
  const googleSync = await bootstrap.query(
    "select google_sub from public.profiles where id = $1",
    [ids.student],
  );
  assert(googleSync.rows[0].google_sub === "test-google-sub", "nested identity sync failed");
  pass("trusted nested identity synchronization remains compatible");

  const grants = await bootstrap.query(
    "select has_table_privilege('authenticated', 'public.profiles', 'UPDATE') as broad_update, has_column_privilege('authenticated', 'public.profiles', 'display_name', 'UPDATE') as display_update, has_column_privilege('authenticated', 'public.profiles', 'role', 'UPDATE') as role_update",
  );
  assert(
    grants.rows[0].broad_update === false &&
      grants.rows[0].display_update === true &&
      grants.rows[0].role_update === false,
    "authenticated profile grants are not narrowly configured",
  );
  pass("authenticated receives only safe profile UPDATE column grants");
} catch (error) {
  fail("embedded profile role immutability smoke", error);
} finally {
  if (serviceClient) await serviceClient.end().catch(() => {});
  if (rlsClient) await rlsClient.end().catch(() => {});
  if (bootstrap) await bootstrap.end().catch(() => {});
  await harness.cleanup();
}

if (failures > 0) {
  throw new Error(String(failures) + " profile role immutability smoke check(s) failed.");
}

function requiredLiveEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error("Missing required live smoke environment category: " + name);
  return value;
}

function usernameEmail(username) {
  return username.includes("@") ? username : username + "@local.app";
}

async function signInLive({ createClient, label }) {
  const username = requiredLiveEnv("TEST_" + label + "_USERNAME");
  const password = requiredLiveEnv("TEST_" + label + "_PASSWORD");
  const client = createClient(
    requiredLiveEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requiredLiveEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const { data, error } = await client.auth.signInWithPassword({
    email: usernameEmail(username),
    password,
  });
  if (error || !data.user) throw new Error(label + " login failed");

  const { data: profile, error: profileError } = await client
    .from("profiles")
    .select("id, role, status, default_organization_id, display_name")
    .eq("id", data.user.id)
    .single();
  if (profileError || !profile) throw new Error(label + " profile lookup failed");
  return { client, profile };
}

function assertProfileUnchanged(profile, before, label) {
  assert(
    profile.role === before.role &&
      profile.status === before.status &&
      profile.default_organization_id === before.default_organization_id &&
      profile.display_name === before.display_name,
    label + " changed profile state",
  );
}

async function runLiveSmoke() {
  if (process.env.PROFILE_ROLE_IMMUTABILITY_CONFIRM !== "RUN_DISPOSABLE_P0_LIVE_SMOKE") {
    throw new Error(
      "Refusing live mutation smoke without PROFILE_ROLE_IMMUTABILITY_CONFIRM=RUN_DISPOSABLE_P0_LIVE_SMOKE.",
    );
  }

  const { default: dotenv } = await import("dotenv");
  const { createClient } = await import("@supabase/supabase-js");
  dotenv.config({ path: resolve(root, ".env.local"), override: false });

  const student = await signInLive({ createClient, label: "STUDENT" });
  const teacher = await signInLive({ createClient, label: "TEACHER" });
  const admin = await signInLive({ createClient, label: "ADMIN" });
  const superAdmin = await signInLive({ createClient, label: "SUPER_ADMIN" });

  assert(student.profile.role === "student", "TEST_STUDENT must be a student");
  assert(teacher.profile.role === "teacher", "TEST_TEACHER must be a teacher");
  assert(admin.profile.role === "admin", "TEST_ADMIN must be an admin");
  assert(superAdmin.profile.role === "super_admin", "TEST_SUPER_ADMIN must be a super-admin");

  const roleCounts = {};
  const { data: aggregateProfiles, error: aggregateError } = await superAdmin.client
    .from("profiles")
    .select("role, status");
  if (aggregateError) throw new Error("Safe profile aggregate audit failed");
  for (const profile of aggregateProfiles ?? []) {
    const key = profile.role + ":" + profile.status;
    roleCounts[key] = (roleCounts[key] ?? 0) + 1;
  }
  console.log("PASS live aggregate profile role/status counts " + JSON.stringify(roleCounts));

  const originalStudent = { ...student.profile };
  const marker = "P0 smoke " + Date.now();
  const { error: safeUpdateError } = await student.client
    .from("profiles")
    .update({ display_name: marker })
    .eq("id", student.profile.id);
  if (safeUpdateError) throw new Error("Student safe display update failed");
  const { data: safeUpdated, error: safeReadError } = await student.client
    .from("profiles")
    .select("id, role, status, default_organization_id, display_name")
    .eq("id", student.profile.id)
    .single();
  if (safeReadError || safeUpdated?.display_name !== marker) {
    throw new Error("Student safe display update did not persist");
  }
  const { error: restoreError } = await student.client
    .from("profiles")
    .update({ display_name: originalStudent.display_name })
    .eq("id", student.profile.id);
  if (restoreError) throw new Error("Student display-name restore failed");
  pass("live student safe display update and restore");

  const deniedPatches = [
    { role: "teacher" },
    { role: "admin" },
    { role: "super_admin" },
    { status: "disabled" },
    {
      default_organization_id:
        originalStudent.default_organization_id === null
          ? "00000000-0000-0000-0000-000000000001"
          : null,
    },
    { display_name: "P0 mixed update", role: "teacher" },
  ];
  for (const patch of deniedPatches) {
    await student.client.from("profiles").update(patch).eq("id", student.profile.id);
    const { data: after, error } = await student.client
      .from("profiles")
      .select("id, role, status, default_organization_id, display_name")
      .eq("id", student.profile.id)
      .single();
    if (error || !after) throw new Error("Student post-denial profile check failed");
    assertProfileUnchanged(after, originalStudent, "Student denied privileged update");
  }
  pass("live student role, status, organization, and mixed updates remain denied");

  const directAttempts = [
    [teacher, { role: "admin" }, teacher.profile],
    [admin, { role: "super_admin" }, admin.profile],
    [superAdmin, { role: "teacher" }, superAdmin.profile],
  ];
  for (const [actor, patch, before] of directAttempts) {
    await actor.client.from("profiles").update(patch).eq("id", before.id);
    const { data: after, error } = await actor.client
      .from("profiles")
      .select("id, role, status, default_organization_id, display_name")
      .eq("id", before.id)
      .single();
    if (error || !after) throw new Error("Direct privileged update verification failed");
    assertProfileUnchanged(after, before, "Direct privileged update");
  }
  pass("live teacher, admin, and super-admin direct role writes remain denied");

  await teacher.client
    .from("profiles")
    .update({ display_name: "P0 cross-user update" })
    .eq("id", student.profile.id);
  const { data: afterOtherUserAttempt, error: afterOtherUserError } = await student.client
    .from("profiles")
    .select("id, role, status, default_organization_id, display_name")
    .eq("id", student.profile.id)
    .single();
  if (afterOtherUserError || !afterOtherUserAttempt) {
    throw new Error("Cross-user update verification failed");
  }
  assertProfileUnchanged(afterOtherUserAttempt, originalStudent, "Cross-user update");
  pass("live unrelated user cannot update student profile");

  const anonymous = createClient(
    requiredLiveEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requiredLiveEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  await anonymous.from("profiles").update({ display_name: "P0 anonymous update" }).eq("id", student.profile.id);
  const { data: afterAnonAttempt, error: afterAnonError } = await student.client
    .from("profiles")
    .select("id, role, status, default_organization_id, display_name")
    .eq("id", student.profile.id)
    .single();
  if (afterAnonError || !afterAnonAttempt) throw new Error("Anonymous update verification failed");
  assertProfileUnchanged(afterAnonAttempt, originalStudent, "Anonymous update");
  pass("live anonymous profile update is denied");

  const serviceRoleKey =
    process.env.CLEAN_SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!serviceRoleKey) {
    throw new Error("Missing service-role key required for full live signup/RPC validation.");
  }
  const service = createClient(requiredLiveEnv("NEXT_PUBLIC_SUPABASE_URL"), serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const temporaryEmail = "p0-smoke-" + Date.now() + "@example.invalid";
  const temporaryPassword = "P0-smoke-" + crypto.randomUUID();
  let temporaryUserId;
  try {
    const { data: created, error: createError } = await service.auth.admin.createUser({
      email: temporaryEmail,
      password: temporaryPassword,
      email_confirm: true,
    });
    if (createError || !created.user) throw new Error("Service-role temporary signup failed");
    temporaryUserId = created.user.id;

    const { error: profileInsertError } = await service.from("profiles").insert({
      id: temporaryUserId,
      email: temporaryEmail,
      role: "student",
      status: "active",
    });
    if (profileInsertError) throw new Error("Service-role temporary profile creation failed");

    const { error: transitionError } = await superAdmin.client.rpc(
      "transition_profile_role_as_super_admin",
      {
        p_next_role: "teacher",
        p_target_profile_id: temporaryUserId,
      },
    );
    if (transitionError) throw new Error("Guarded super-admin transition failed");
    const { data: transitioned, error: transitionedError } = await service
      .from("profiles")
      .select("role")
      .eq("id", temporaryUserId)
      .single();
    if (transitionedError || transitioned?.role !== "teacher") {
      throw new Error("Guarded super-admin transition did not persist");
    }
    pass("live service-role signup and guarded super-admin transition");
  } finally {
    if (temporaryUserId) {
      await service.auth.admin.deleteUser(temporaryUserId).catch(() => {});
    }
  }

  console.log("PASS live PostgREST profile role immutability smoke");
}

if (process.argv.includes("--live")) {
  await runLiveSmoke();
}
