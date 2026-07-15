// SEC-P0 local SQL/RLS smoke. It uses an isolated embedded Postgres instance;
// it never reads local environment files or contacts Supabase.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { randomUUID } from "node:crypto";

import pg from "pg";

import { createGoogleAccountLinksPostgresHarness } from "./google-account-links-embedded-postgres.mjs";
import { splitSql } from "./sql-split.mjs";

const here = fileURLToPath(import.meta.url);
const root = resolve(dirname(here), "..");
const migrationPath = resolve(
  root,
  "supabase/clean-migrations/0039_profile_privileged_fields_immutability.sql",
);
const hardeningMigrationPath = resolve(
  root,
  "supabase/clean-migrations/0040_profile_insert_and_role_transition_hardening.sql",
);
const foundationsPath = resolve(
  root,
  "supabase/clean-migrations/0001_foundations_identity_organizations.sql",
);

const foundationsSql = readFileSync(foundationsPath, "utf8");
const migrationSql = readFileSync(migrationPath, "utf8");
const hardeningMigrationSql = readFileSync(hardeningMigrationPath, "utf8");
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
assert(
    hardeningMigrationSql.includes("revoke insert on table public.profiles from anon, authenticated") &&
    hardeningMigrationSql.includes("profiles_enforce_insert_immutability") &&
    hardeningMigrationSql.includes("pg_advisory_xact_lock") &&
    !hardeningMigrationSql.includes("pg_trigger_depth() > 1"),
  "Migration must revoke direct profile INSERT, enforce it in a trigger, serialize role transitions, and remove generic nested-trigger trust.",
);
console.log("PASS static profile insert and role-transition hardening contract");

const harness = await createGoogleAccountLinksPostgresHarness("profile-role-immutability");
const { instance, connection } = harness;

let bootstrap;
let rlsClient;
let serviceClient;
let firstSuperAdminClient;
let secondSuperAdminClient;
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
    concurrentSuperAdmin: "12121212-1212-1212-1212-121212121212",
    admin: "22222222-2222-2222-2222-222222222222",
    teacher: "33333333-3333-3333-3333-333333333333",
    student: "44444444-4444-4444-4444-444444444444",
    otherStudent: "55555555-5555-5555-5555-555555555555",
    serviceCreated: "66666666-6666-6666-6666-666666666666",
    directAuthenticated: "77777777-7777-7777-7777-777777777777",
    directAnonymous: "88888888-8888-8888-8888-888888888888",
    directView: "99999999-9999-9999-9999-999999999999",
  };
  const organizationId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

  await bootstrap.query(
    "insert into auth.users (id, email) values ($1, 'super-admin@example.test'), ($2, 'concurrent-super-admin@example.test'), ($3, 'admin@example.test'), ($4, 'teacher@example.test'), ($5, 'student@example.test'), ($6, 'other@example.test'), ($7, 'direct-authenticated@example.test'), ($8, 'direct-anonymous@example.test'), ($9, 'direct-view@example.test')",
    [
      ids.superAdmin,
      ids.concurrentSuperAdmin,
      ids.admin,
      ids.teacher,
      ids.student,
      ids.otherStudent,
      ids.directAuthenticated,
      ids.directAnonymous,
      ids.directView,
    ],
  );
  await bootstrap.query(
    "insert into public.organizations (id, name, slug) values ($1, 'Security Test Org', 'security-test-org')",
    [organizationId],
  );
  await bootstrap.query(
    "insert into public.profiles (id, email, role, status, default_organization_id, display_name) values ($1, 'super-admin@example.test', 'super_admin', 'active', $7, 'Super Admin'), ($2, 'concurrent-super-admin@example.test', 'super_admin', 'active', $7, 'Concurrent Super Admin'), ($3, 'admin@example.test', 'admin', 'active', $7, 'Admin'), ($4, 'teacher@example.test', 'teacher', 'active', $7, 'Teacher'), ($5, 'student@example.test', 'student', 'active', $7, 'Student'), ($6, 'other@example.test', 'student', 'active', $7, 'Other Student')",
    [
      ids.superAdmin,
      ids.concurrentSuperAdmin,
      ids.admin,
      ids.teacher,
      ids.student,
      ids.otherStudent,
      organizationId,
    ],
  );
  await applySql(bootstrap, hardeningMigrationSql);

  rlsClient = new pg.Client({
    host: connection.host,
    port: connection.port,
    user: "rls_tester",
    password: "rls_tester_password",
    database: "profile_role_test",
  });
  await rlsClient.connect();

  await asUser(rlsClient, ids.directAuthenticated);
  await expectDenied("authenticated direct profile insert is denied", () =>
    rlsClient.query(
      "insert into public.profiles (id, username, email, role, status, default_organization_id, created_at, updated_at) values ($1, 'spoofed_student', 'spoofed@example.test', 'student', 'active', $2, now() - interval '1 day', now() - interval '1 day')",
      [ids.directAuthenticated, organizationId],
    ),
  );
  await expectDenied("authenticated insert through user_profiles is denied", () =>
    rlsClient.query(
      "insert into public.user_profiles (user_id, display_name, role, status, default_organization_id) values ($1, 'Spoofed view profile', 'student', 'active', null)",
      [ids.directView],
    ),
  );

  await rlsClient.query("set role anon");
  await asUser(rlsClient, "", "anon");
  await expectDenied("anonymous direct profile insert is denied", () =>
    rlsClient.query(
      "insert into public.profiles (id, username, email, role, status, created_at, updated_at) values ($1, 'anonymous_spoof', 'anonymous@example.test', 'student', 'active', now() - interval '1 day', now() - interval '1 day')",
      [ids.directAnonymous],
    ),
  );
  await rlsClient.query("reset role");

  await asUser(rlsClient, ids.student);
  const safeUpdate = await rlsClient.query(
    "update public.profiles set display_name = 'Student Updated' where id = $1",
    [ids.student],
  );
  assert(safeUpdate.rowCount === 1, "student display-name update was not allowed");
  pass("student updates safe display field");

  await bootstrap.query("alter table public.profiles add column future_server_managed text");
  await bootstrap.query("grant update (future_server_managed) on public.profiles to authenticated");
  await expectDenied("future profile columns are not automatically self-editable", () =>
    rlsClient.query(
      "update public.profiles set future_server_managed = 'client-controlled' where id = $1",
      [ids.student],
    ),
  );

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
  const firstAudit = await bootstrap.query(
    "select count(*)::integer as count from private.profile_privileged_change_audit_log where target_profile_id = $1",
    [ids.otherStudent],
  );
  assert(firstAudit.rows[0].count === 1, "authorized transition did not write exactly one audit event");
  pass("authorized super-admin role transition succeeds through RPC and writes one audit event");

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

  firstSuperAdminClient = new pg.Client({
    host: connection.host,
    port: connection.port,
    user: "rls_tester",
    password: "rls_tester_password",
    database: "profile_role_test",
  });
  secondSuperAdminClient = new pg.Client({
    host: connection.host,
    port: connection.port,
    user: "rls_tester",
    password: "rls_tester_password",
    database: "profile_role_test",
  });
  await Promise.all([firstSuperAdminClient.connect(), secondSuperAdminClient.connect()]);
  await Promise.all([
    asUser(firstSuperAdminClient, ids.superAdmin),
    asUser(secondSuperAdminClient, ids.concurrentSuperAdmin),
  ]);
  const concurrentDemotions = await Promise.allSettled([
    firstSuperAdminClient.query(
      "select public.transition_profile_role_as_super_admin($1, 'teacher')",
      [ids.concurrentSuperAdmin],
    ),
    secondSuperAdminClient.query(
      "select public.transition_profile_role_as_super_admin($1, 'teacher')",
      [ids.superAdmin],
    ),
  ]);
  assert(
    concurrentDemotions.filter((result) => result.status === "fulfilled").length === 1,
    "concurrent last-super-admin demotions did not reject exactly one transition",
  );
  const remainingSuperAdmins = await bootstrap.query(
    "select count(*)::integer as count from public.profiles where role = 'super_admin' and status = 'active'",
  );
  assert(
    remainingSuperAdmins.rows[0].count === 1,
    "concurrent role transitions left no active super-admin",
  );
  pass("concurrent last-super-admin demotions retain one active super-admin");

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
  await expectDenied("generic nested trigger cannot update protected Google identity fields", () =>
    rlsClient.query(
      "insert into public.profile_identity_sync_source (profile_id, google_sub) values ($1, 'test-google-sub')",
      [ids.student],
    ),
  );
  const googleSync = await bootstrap.query(
    "select google_sub from public.profiles where id = $1",
    [ids.student],
  );
  assert(googleSync.rows[0].google_sub === null, "generic nested trigger changed a protected identity field");
  pass("protected Google identity fields remain unchanged after nested-trigger denial");

  const grants = await bootstrap.query(
    "select has_table_privilege('authenticated', 'public.profiles', 'UPDATE') as broad_update, has_column_privilege('authenticated', 'public.profiles', 'display_name', 'UPDATE') as display_update, has_column_privilege('authenticated', 'public.profiles', 'role', 'UPDATE') as role_update, has_table_privilege('authenticated', 'public.profiles', 'INSERT') as authenticated_insert, has_table_privilege('anon', 'public.profiles', 'INSERT') as anon_insert, has_table_privilege('authenticated', 'public.user_profiles', 'INSERT') as authenticated_view_insert",
  );
  assert(
    grants.rows[0].broad_update === false &&
      grants.rows[0].display_update === true &&
      grants.rows[0].role_update === false &&
      grants.rows[0].authenticated_insert === false &&
      grants.rows[0].anon_insert === false &&
      grants.rows[0].authenticated_view_insert === false,
    "authenticated profile grants are not narrowly configured or direct profile INSERT remains available",
  );
  pass("authenticated receives only safe profile UPDATE grants and no direct profile INSERT");
} catch (error) {
  fail("embedded profile role immutability smoke", error);
} finally {
  if (secondSuperAdminClient) await secondSuperAdminClient.end().catch(() => {});
  if (firstSuperAdminClient) await firstSuperAdminClient.end().catch(() => {});
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
    .select("id, role, status, default_organization_id, full_name, avatar_url, display_name")
    .eq("id", data.user.id)
    .single();
  if (profileError || !profile) throw new Error(label + " profile lookup failed");
  return { client, profile };
}

async function readLiveProfile(client, profileId) {
  const { data, error } = await client
    .from("profiles")
    .select("id, role, status, default_organization_id, full_name, avatar_url, display_name")
    .eq("id", profileId)
    .single();
  if (error || !data) throw new Error("Profile verification read failed");
  return data;
}

function assertProfileUnchanged(profile, before, label) {
  assert(
    profile.role === before.role &&
      profile.status === before.status &&
      profile.default_organization_id === before.default_organization_id &&
      profile.full_name === before.full_name &&
      profile.avatar_url === before.avatar_url &&
      profile.display_name === before.display_name,
    label + " changed profile state",
  );
}

async function expectLiveProfilePatchDenied({
  actor,
  targetProfileId,
  patch,
  before,
  label,
  verificationClient = actor.client,
}) {
  const result = await actor.client
    .from("profiles")
    .update(patch)
    .eq("id", targetProfileId)
    .select("id");
  const didUpdate = Array.isArray(result.data) && result.data.length > 0;
  if (!result.error && didUpdate) {
    throw new Error(label + " unexpectedly succeeded");
  }
  const after = await readLiveProfile(verificationClient, targetProfileId);
  assertProfileUnchanged(after, before, label);
  pass(label);
}

function assertRpcDenied(result, label) {
  if (!result.error) throw new Error(label + " unexpectedly succeeded");
  pass(label);
}

function roleCountsFromRows(rows) {
  return Object.fromEntries(
    rows.map((row) => [row.role + ":" + row.status, Number(row.profile_count)]),
  );
}

async function inspectLiveSchema() {
  const databasePassword = requiredLiveEnv("SUPABASE_DB_PASSWORD");
  const projectRef = requiredLiveEnv("DISPOSABLE_SUPABASE_PROJECT_REF");
  if (!/^[a-z0-9]+$/.test(projectRef)) {
    throw new Error("Disposable project reference format is invalid.");
  }

  let verificationStage = "connection";
  const connectionCandidates = [
    { host: "db." + projectRef + ".supabase.co", port: 5432, user: "postgres" },
    {
      host: process.env.CLEAN_SUPABASE_POOLER_HOST?.trim() || "aws-0-us-west-2.pooler.supabase.com",
      port: 6543,
      user: "postgres." + projectRef,
    },
  ];
  let metadataClient;
  let lastConnectionError;
  try {
    for (const candidate of connectionCandidates) {
      const candidateClient = new pg.Client({
        ...candidate,
        password: databasePassword,
        database: "postgres",
        ssl: { rejectUnauthorized: false },
        connectionTimeoutMillis: 15_000,
      });
      try {
        await candidateClient.connect();
        metadataClient = candidateClient;
        break;
      } catch (error) {
        lastConnectionError = error;
        await candidateClient.end().catch(() => {});
      }
    }
    if (!metadataClient) throw lastConnectionError ?? new Error("No metadata connection candidate succeeded.");
    verificationStage = "schema metadata query";
    const [updateColumns, tableWideGrant, insertGrants, policies, insertPolicy, triggers, rpc, viewGrant, auditColumns, identityColumns, functionDefinition, aggregates] =
      await Promise.all([
        metadataClient.query(
          "select column_name from information_schema.column_privileges where table_schema = 'public' and table_name = 'profiles' and grantee = 'authenticated' and privilege_type = 'UPDATE' order by column_name",
        ),
        metadataClient.query(
          "select exists (select 1 from information_schema.role_table_grants where table_schema = 'public' and table_name = 'profiles' and grantee = 'authenticated' and privilege_type = 'UPDATE') as has_table_wide_update",
        ),
        metadataClient.query(
          "select has_table_privilege('authenticated', 'public.profiles', 'INSERT') as authenticated_profiles_insert, has_table_privilege('anon', 'public.profiles', 'INSERT') as anon_profiles_insert, has_table_privilege('authenticated', 'public.user_profiles', 'INSERT') as authenticated_view_insert, has_table_privilege('anon', 'public.user_profiles', 'INSERT') as anon_view_insert",
        ),
        metadataClient.query(
          "select policyname, cmd, roles from pg_policies where schemaname = 'public' and tablename = 'profiles' and policyname = 'profiles_self_safe_update'",
        ),
        metadataClient.query(
          "select policyname from pg_policies where schemaname = 'public' and tablename = 'profiles' and policyname = 'profiles_super_admin_insert'",
        ),
        metadataClient.query(
          "select tgname from pg_trigger where tgrelid = 'public.profiles'::regclass and not tgisinternal and tgname in ('profiles_enforce_privileged_field_immutability', 'profiles_enforce_insert_immutability') order by tgname",
        ),
        metadataClient.query(
          "select has_function_privilege('anon', 'public.transition_profile_role_as_super_admin(uuid,text)', 'EXECUTE') as anon_execute, has_function_privilege('authenticated', 'public.transition_profile_role_as_super_admin(uuid,text)', 'EXECUTE') as authenticated_execute, exists (select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl, acldefault('f'::\"char\", p.proowner))) privilege where p.oid = 'public.transition_profile_role_as_super_admin(uuid,text)'::regprocedure and privilege.grantee = 0 and privilege.privilege_type = 'EXECUTE') as public_execute",
        ),
        metadataClient.query(
          "select has_table_privilege('authenticated', 'public.user_profiles', 'UPDATE') as authenticated_update, has_table_privilege('anon', 'public.user_profiles', 'UPDATE') as anon_update",
        ),
        metadataClient.query(
          "select column_name from information_schema.columns where table_schema = 'private' and table_name = 'profile_privileged_change_audit_log' order by column_name",
        ),
        metadataClient.query(
          "select column_name from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name in ('google_sub', 'google_email_at_link', 'google_linked_at') order by column_name",
        ),
        metadataClient.query(
          "select pg_get_functiondef('private.enforce_profile_privileged_field_immutability()'::regprocedure) as definition",
        ),
        metadataClient.query(
          "select role, status, count(*)::integer as profile_count from public.profiles group by role, status order by role, status",
        ),
      ]);

    const safeUpdateColumns = updateColumns.rows.map((row) => row.column_name);
    assert(
      JSON.stringify(safeUpdateColumns) === JSON.stringify(["avatar_url", "display_name", "full_name"]),
      "Authenticated UPDATE grants are not limited to the three safe profile fields.",
    );
    assert(tableWideGrant.rows[0]?.has_table_wide_update === false, "Authenticated retains table-wide profiles UPDATE.");
    assert(
      insertGrants.rows[0]?.authenticated_profiles_insert === false &&
        insertGrants.rows[0]?.anon_profiles_insert === false &&
        insertGrants.rows[0]?.authenticated_view_insert === false &&
        insertGrants.rows[0]?.anon_view_insert === false,
      "Direct profile or user_profiles INSERT remains available to a client role.",
    );
    assert(policies.rows.length === 1 && policies.rows[0]?.cmd === "UPDATE", "Safe self-update policy is missing.");
    assert(insertPolicy.rows.length === 0, "Legacy profile insert policy remains present.");
    assert(
      JSON.stringify(triggers.rows.map((row) => row.tgname)) ===
        JSON.stringify(["profiles_enforce_insert_immutability", "profiles_enforce_privileged_field_immutability"]),
      "Profile insert and privileged-field immutability triggers are incomplete.",
    );
    assert(
      rpc.rows[0]?.anon_execute === false &&
        rpc.rows[0]?.authenticated_execute === true &&
        rpc.rows[0]?.public_execute === false,
      "Role-transition RPC execution grants are not narrow.",
    );
    assert(
      viewGrant.rows[0]?.authenticated_update === false && viewGrant.rows[0]?.anon_update === false,
      "The user_profiles view retains a write bypass.",
    );
    const auditColumnNames = auditColumns.rows.map((row) => row.column_name);
    assert(
      ["action_kind", "actor_profile_id", "created_at", "id", "next_role", "previous_role", "target_profile_id"].every(
        (column) => auditColumnNames.includes(column),
      ) &&
        auditColumnNames.every(
          (column) => !/(email|name|token|secret|password|credential)/i.test(column),
        ),
      "Role-transition audit schema is incomplete or stores unnecessary sensitive fields.",
    );
    const triggerDefinition = functionDefinition.rows[0]?.definition ?? "";
    assert(
      triggerDefinition.includes("to_jsonb(old) - safe_self_edit_keys") &&
        triggerDefinition.includes("to_jsonb(new) - safe_self_edit_keys") &&
        triggerDefinition.includes("app.profile_privileged_mutation") &&
        !triggerDefinition.includes("pg_trigger_depth"),
      "Profile trigger does not retain the future-field-safe invariant or still trusts a generic nested trigger.",
    );

    pass("live 0039/0040 profile grants, insert revocations, triggers, and RPC execution grants");
    return {
      client: metadataClient,
      roleCounts: roleCountsFromRows(aggregates.rows),
      identityColumns: identityColumns.rows.map((row) => row.column_name),
    };
  } catch (error) {
    await metadataClient?.end().catch(() => {});
    if (error instanceof Error && error.message.startsWith("Authenticated ")) throw error;
    if (error instanceof Error && error.message.includes("Safe self-update")) throw error;
    if (error instanceof Error && error.message.includes("Privileged-field")) throw error;
    if (error instanceof Error && error.message.includes("Role-transition")) throw error;
    if (error instanceof Error && error.message.includes("user_profiles")) throw error;
    if (error instanceof Error && error.message.includes("Profile trigger")) throw error;
    const safeCode =
      error && typeof error === "object" && typeof error.code === "string"
        ? error.code
        : "unknown";
    throw new Error("Live schema metadata " + verificationStage + " failed (" + safeCode + ").");
  }
}

async function readLiveRoleHelpers(metadataClient, profileId) {
  await metadataClient.query("select set_config('request.jwt.claim.role', 'authenticated', false)");
  await metadataClient.query("select set_config('request.jwt.claim.sub', $1, false)", [profileId]);
  const result = await metadataClient.query(
    "select private.is_admin() as is_admin, private.is_teacher_or_admin() as is_teacher_or_admin",
  );
  await metadataClient.query("select set_config('request.jwt.claim.sub', '', false)");
  return result.rows[0];
}

async function runLiveSmoke({ allowMetadataTransportBlock = false } = {}) {
  if (process.env.PROFILE_ROLE_IMMUTABILITY_CONFIRM !== "RUN_DISPOSABLE_P0_LIVE_SMOKE") {
    throw new Error(
      "Refusing live mutation smoke without PROFILE_ROLE_IMMUTABILITY_CONFIRM=RUN_DISPOSABLE_P0_LIVE_SMOKE.",
    );
  }

  const { default: dotenv } = await import("dotenv");
  const { createClient } = await import("@supabase/supabase-js");
  dotenv.config({ path: resolve(root, ".env.local"), override: false });

  let liveSchema;
  let metadataBlocker = null;
  try {
    liveSchema = await inspectLiveSchema();
  } catch (error) {
    if (!allowMetadataTransportBlock) throw error;
    metadataBlocker = error instanceof Error ? error.message : "Live schema metadata verification could not complete.";
    console.log("BLOCKED live schema metadata verification: " + metadataBlocker);
    liveSchema = { client: null, roleCounts: null, identityColumns: [] };
  }
  const metadataClient = liveSchema.client;
  let student;
  let teacher;
  let admin;
  let superAdmin;
  let service;
  let originalStudent;
  const temporaryUsers = [];

  try {
    const serviceRoleKey =
      process.env.CLEAN_SUPABASE_SERVICE_ROLE_KEY?.trim() ||
      process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
    if (!serviceRoleKey) {
      throw new Error("Missing service-role key required for full live signup/RPC validation.");
    }
    service = createClient(requiredLiveEnv("NEXT_PUBLIC_SUPABASE_URL"), serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    async function createTemporaryFixture({ role, status }) {
      const temporaryEmail = "p0-smoke-" + randomUUID() + "@example.invalid";
      const temporaryPassword = "P0-smoke-" + randomUUID();
      const { data: created, error: createError } = await service.auth.admin.createUser({
        email: temporaryEmail,
        password: temporaryPassword,
        email_confirm: true,
      });
      if (createError || !created.user) throw new Error("Service-role temporary signup failed");
      temporaryUsers.push(created.user.id);
      const { error: profileUpsertError } = await service.from("profiles").upsert(
        { id: created.user.id, email: temporaryEmail, role, status },
        { onConflict: "id" },
      );
      if (profileUpsertError) throw new Error("Service-role temporary profile bootstrap failed");
      const client = createClient(requiredLiveEnv("NEXT_PUBLIC_SUPABASE_URL"), requiredLiveEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"), {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const { data: session, error: signInError } = await client.auth.signInWithPassword({
        email: temporaryEmail,
        password: temporaryPassword,
      });
      if (signInError || !session.user) throw new Error("Temporary fixture login failed");
      return { client, id: created.user.id };
    }

    async function createUnprofiledAuthClient() {
      const temporaryEmail = "p0-unprofiled-" + randomUUID() + "@example.invalid";
      const temporaryPassword = "P0-unprofiled-" + randomUUID();
      const { data: created, error: createError } = await service.auth.admin.createUser({
        email: temporaryEmail,
        password: temporaryPassword,
        email_confirm: true,
      });
      if (createError || !created.user) throw new Error("Service-role unprofiled auth fixture creation failed");
      temporaryUsers.push(created.user.id);
      const client = createClient(requiredLiveEnv("NEXT_PUBLIC_SUPABASE_URL"), requiredLiveEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"), {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const { data: session, error: signInError } = await client.auth.signInWithPassword({
        email: temporaryEmail,
        password: temporaryPassword,
      });
      if (signInError || !session.user) throw new Error("Unprofiled auth fixture login failed");
      return { client, id: created.user.id, email: temporaryEmail };
    }

    async function signInOrCreateTemporaryFixture({ label, role }) {
      const username = process.env["TEST_" + label + "_USERNAME"]?.trim();
      const password = process.env["TEST_" + label + "_PASSWORD"]?.trim();
      if (username && password) {
        try {
          const account = await signInLive({ createClient, label });
          assert(account.profile.role === role, "TEST_" + label + " must be a " + role);
          pass("live configured " + role + " account signs in");
          return account;
        } catch {
          console.log(
            "BLOCKED configured TEST_" + label + " account is unavailable or has the wrong role; using a temporary active " + role + " fixture.",
          );
        }
      } else {
        console.log("BLOCKED TEST_" + label + " credentials are unset; using a temporary active " + role + " fixture.");
      }

      const fixture = await createTemporaryFixture({ role, status: "active" });
      const profile = await readLiveProfile(fixture.client, fixture.id);
      assert(profile.role === role, "Temporary " + role + " fixture bootstrap failed");
      pass("live temporary active " + role + " fixture signs in");
      return { client: fixture.client, profile };
    }

    student = await signInLive({ createClient, label: "STUDENT" });
    teacher = await signInOrCreateTemporaryFixture({ label: "TEACHER", role: "teacher" });
    admin = await signInOrCreateTemporaryFixture({ label: "ADMIN", role: "admin" });

    assert(student.profile.role === "student", "TEST_STUDENT must be a student");

    superAdmin = await signInOrCreateTemporaryFixture({ label: "SUPER_ADMIN", role: "super_admin" });

    if (liveSchema.roleCounts) {
      console.log("PASS live aggregate profile role/status counts " + JSON.stringify(liveSchema.roleCounts));
    } else {
      const { data: aggregateProfiles, error: aggregateError } = await superAdmin.client
        .from("profiles")
        .select("role, status");
      if (aggregateError) throw new Error("Safe profile aggregate audit failed");
      const roleCounts = {};
      for (const profile of aggregateProfiles ?? []) {
        const key = profile.role + ":" + profile.status;
        roleCounts[key] = (roleCounts[key] ?? 0) + 1;
      }
      console.log("PASS live aggregate profile role/status counts " + JSON.stringify(roleCounts));
    }

    originalStudent = { ...student.profile };
    const marker = "P0 smoke " + Date.now();
    const safeFieldTests = [
      ["full_name", marker + " full name"],
      ["display_name", marker + " display name"],
      ["avatar_url", "https://example.invalid/p0-smoke-" + Date.now() + ".png"],
    ];
    for (const [field, value] of safeFieldTests) {
      const { data, error } = await student.client
        .from("profiles")
        .update({ [field]: value })
        .eq("id", student.profile.id)
        .select(field)
        .single();
      if (error || data?.[field] !== value) throw new Error("Student safe " + field + " update failed");
    }
    pass("live student full_name, display_name, and avatar_url updates");

    const safeUpdatedStudent = await readLiveProfile(student.client, student.profile.id);
    const deniedPatches = [
      ["live student role to teacher is denied", { role: "teacher" }],
      ["live student role to admin is denied", { role: "admin" }],
      ["live student role to super_admin is denied", { role: "super_admin" }],
      ["live student status update is denied", { status: "disabled" }],
      [
        "live student default organization update is denied",
        {
          default_organization_id:
            safeUpdatedStudent.default_organization_id === null
              ? "00000000-0000-0000-0000-000000000001"
              : null,
        },
      ],
      ["live student mixed safe plus role update is atomic and denied", { full_name: marker + " mixed", role: "teacher" }],
    ];
    for (const [label, patch] of deniedPatches) {
      await expectLiveProfilePatchDenied({
        actor: student,
        targetProfileId: student.profile.id,
        patch,
        before: safeUpdatedStudent,
        label,
      });
    }

    for (const [label, actor, patch] of [
      ["live teacher self-role update is denied", teacher, { role: "admin" }],
      ["live admin self-role update is denied", admin, { role: "super_admin" }],
      ["live super-admin direct table role update is denied", superAdmin, { role: "teacher" }],
    ]) {
      await expectLiveProfilePatchDenied({
        actor,
        targetProfileId: actor.profile.id,
        patch,
        before: actor.profile,
        label,
      });
    }

    await expectLiveProfilePatchDenied({
      actor: teacher,
      targetProfileId: student.profile.id,
      patch: { display_name: marker + " cross user" },
      before: safeUpdatedStudent,
      label: "live unrelated authenticated user cannot update another profile",
      verificationClient: student.client,
    });

    const anonymous = createClient(
      requiredLiveEnv("NEXT_PUBLIC_SUPABASE_URL"),
      requiredLiveEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
    await expectLiveProfilePatchDenied({
      actor: { client: anonymous },
      targetProfileId: student.profile.id,
      patch: { display_name: marker + " anonymous" },
      before: safeUpdatedStudent,
      label: "live anonymous profile update is denied",
      verificationClient: student.client,
    });

    const viewAttempt = await student.client
      .from("user_profiles")
      .update({ role: "teacher" })
      .eq("user_id", student.profile.id)
      .select("user_id");
    if (!viewAttempt.error && Array.isArray(viewAttempt.data) && viewAttempt.data.length > 0) {
      throw new Error("The user_profiles view unexpectedly allowed a privileged update");
    }
    assertProfileUnchanged(
      await readLiveProfile(student.client, student.profile.id),
      safeUpdatedStudent,
      "user_profiles view update",
    );
    pass("live user_profiles view cannot bypass profile protections");

    const directInsertFixture = await createUnprofiledAuthClient();
    const directInsert = await directInsertFixture.client
      .from("profiles")
      .insert({
        id: directInsertFixture.id,
        email: directInsertFixture.email,
        username: "spoofed_profile",
        role: "student",
        status: "active",
        created_at: new Date(0).toISOString(),
      })
      .select("id");
    if (!directInsert.error && Array.isArray(directInsert.data) && directInsert.data.length > 0) {
      throw new Error("Authenticated direct profile insert unexpectedly succeeded");
    }
    const directViewInsert = await directInsertFixture.client
      .from("user_profiles")
      .insert({
        user_id: directInsertFixture.id,
        display_name: "Spoofed profile",
        role: "student",
        status: "active",
      })
      .select("user_id");
    if (!directViewInsert.error && Array.isArray(directViewInsert.data) && directViewInsert.data.length > 0) {
      throw new Error("Authenticated user_profiles insert unexpectedly succeeded");
    }
    const anonymousInsert = await anonymous
      .from("profiles")
      .insert({
        id: randomUUID(),
        email: "anonymous-spoof@example.invalid",
        role: "student",
        status: "active",
      })
      .select("id");
    if (!anonymousInsert.error && Array.isArray(anonymousInsert.data) && anonymousInsert.data.length > 0) {
      throw new Error("Anonymous direct profile insert unexpectedly succeeded");
    }
    pass("live anonymous/authenticated profile and view inserts are denied");

    if (liveSchema.identityColumns.length > 0) {
      const identityField = liveSchema.identityColumns.includes("google_linked_at")
        ? "google_linked_at"
        : liveSchema.identityColumns[0];
      const { data: beforeIdentity, error: beforeIdentityError } = await superAdmin.client
        .from("profiles")
        .select(identityField)
        .eq("id", student.profile.id)
        .single();
      if (beforeIdentityError || !beforeIdentity) throw new Error("Identity-field baseline read failed");
      const result = await student.client
        .from("profiles")
        .update({ [identityField]: identityField === "google_linked_at" ? new Date().toISOString() : marker + " identity" })
        .eq("id", student.profile.id)
        .select("id");
      if (!result.error && Array.isArray(result.data) && result.data.length > 0) {
        throw new Error("Student identity/server-managed field update unexpectedly succeeded");
      }
      const { data: afterIdentity, error: afterIdentityError } = await superAdmin.client
        .from("profiles")
        .select(identityField)
        .eq("id", student.profile.id)
        .single();
      if (afterIdentityError || afterIdentity?.[identityField] !== beforeIdentity[identityField]) {
        throw new Error("Student identity/server-managed field changed after a denied update");
      }
      pass("live identity/server-managed profile field update is denied");
    } else {
      const identityProbe = await superAdmin.client
        .from("profiles")
        .select("google_linked_at")
        .eq("id", student.profile.id)
        .single();
      if (!identityProbe.error && identityProbe.data) {
        const result = await student.client
          .from("profiles")
          .update({ google_linked_at: new Date().toISOString() })
          .eq("id", student.profile.id)
          .select("id");
        if (!result.error && Array.isArray(result.data) && result.data.length > 0) {
          throw new Error("Student identity/server-managed field update unexpectedly succeeded");
        }
        const afterIdentity = await superAdmin.client
          .from("profiles")
          .select("google_linked_at")
          .eq("id", student.profile.id)
          .single();
        if (afterIdentity.error || afterIdentity.data?.google_linked_at !== identityProbe.data.google_linked_at) {
          throw new Error("Student identity/server-managed field changed after a denied update");
        }
        pass("live identity/server-managed profile field update is denied");
      } else {
        pass("live profile has no optional Google identity columns; narrow grants protect future fields by default");
      }
    }

    if (metadataClient) {
      const roleHelpers = await readLiveRoleHelpers(metadataClient, student.profile.id);
      assert(
        roleHelpers.is_admin === false && roleHelpers.is_teacher_or_admin === false,
        "Student role helpers changed after denied escalation attempts.",
      );
      pass("live denied student escalation leaves role helpers false");
    } else {
      console.log("BLOCKED live SQL role-helper verification: " + metadataBlocker);
    }

    const target = await createTemporaryFixture({ role: "student", status: "active" });
    const inactiveSuperAdmin = await createTemporaryFixture({ role: "super_admin", status: "disabled" });
    pass("live service-role profile bootstrap and temporary fixture login");

    for (const [label, actor] of [
      ["live student cannot call super-admin role transition RPC", student],
      ["live teacher cannot call super-admin role transition RPC", teacher],
      ["live admin cannot call super-admin role transition RPC", admin],
      ["live inactive super-admin cannot call role transition RPC", inactiveSuperAdmin],
    ]) {
      const result = await actor.client.rpc("transition_profile_role_as_super_admin", {
        p_next_role: "teacher",
        p_target_profile_id: target.id,
      });
      assertRpcDenied(result, label);
    }

    const selfTransition = await superAdmin.client.rpc("transition_profile_role_as_super_admin", {
      p_next_role: "teacher",
      p_target_profile_id: superAdmin.profile.id,
    });
    assertRpcDenied(selfTransition, "live super-admin cannot change their own role through the RPC");

    const { error: transitionError } = await superAdmin.client.rpc(
      "transition_profile_role_as_super_admin",
      {
        p_next_role: "teacher",
        p_target_profile_id: target.id,
      },
    );
    if (transitionError) throw new Error("Guarded super-admin transition failed");
    const { data: transitioned, error: transitionedError } = await service
      .from("profiles")
      .select("role")
      .eq("id", target.id)
      .single();
    if (transitionedError || transitioned?.role !== "teacher") {
      throw new Error("Guarded super-admin transition did not persist");
    }
    if (metadataClient) {
      const auditResult = await metadataClient.query(
        "select count(*)::integer as audit_count from private.profile_privileged_change_audit_log where actor_profile_id = $1 and target_profile_id = $2 and previous_role = 'student' and next_role = 'teacher' and action_kind = 'role_transition'",
        [superAdmin.profile.id, target.id],
      );
      assert(auditResult.rows[0]?.audit_count === 1, "Expected safe role-transition audit event was not recorded.");
      pass("live guarded super-admin transition and safe audit event");
    } else {
      pass("live guarded super-admin transition persists without direct audit-table exposure");
      console.log("BLOCKED live audit-event count verification: " + metadataBlocker);
    }

    const targetRoleAfterDeniedCalls = await service.from("profiles").select("role").eq("id", target.id).single();
    if (targetRoleAfterDeniedCalls.error || targetRoleAfterDeniedCalls.data?.role !== "teacher") {
      throw new Error("Denied RPC callers changed the temporary target role.");
    }
  } finally {
    if (student && originalStudent) {
      try {
        await student.client
          .from("profiles")
          .update({
            full_name: originalStudent.full_name,
            avatar_url: originalStudent.avatar_url,
            display_name: originalStudent.display_name,
          })
          .eq("id", student.profile.id)
          .select("id");
      } catch {
        // Cleanup must never mask the original validation result.
      }
    }
    if (service) {
      for (const userId of temporaryUsers) {
        await service.auth.admin.deleteUser(userId).catch(() => {});
      }
    }
    await metadataClient?.end().catch(() => {});
  }

  console.log("PASS live PostgREST profile role immutability smoke");
}

if (process.argv.includes("--live")) {
  await runLiveSmoke();
}

if (process.argv.includes("--live-http-only")) {
  await runLiveSmoke({ allowMetadataTransportBlock: true });
}
