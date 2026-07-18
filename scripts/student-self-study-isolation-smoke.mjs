// P1-STUDENT-01 local SQL/RLS smoke. It runs against an isolated embedded
// Postgres instance and never reads environment files or contacts Supabase.

import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import pg from "pg";

import { createGoogleAccountLinksPostgresHarness } from "./google-account-links-embedded-postgres.mjs";
import { splitSql } from "./sql-split.mjs";

const here = fileURLToPath(import.meta.url);
const root = resolve(dirname(here), "..");
const migrationPath = resolve(
  root,
  "supabase/clean-migrations/0047_practice_self_study_evidence_isolation.sql",
);

const practiceTables = [
  "practice_sessions",
  "practice_rounds",
  "practice_round_questions",
  "practice_attempts",
  "practice_hint_events",
  "practice_reflection_records",
  "practice_wrong_questions",
  "practice_weakness_links",
  "user_practice_preferences",
  "practice_preference_merge_jobs",
  "practice_agent_episodes",
];
const sessionEvidenceTables = [
  "practice_rounds",
  "practice_round_questions",
  "practice_attempts",
  "practice_hint_events",
  "practice_reflection_records",
  "practice_weakness_links",
  "practice_agent_episodes",
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function read(relativePath) {
  return readFile(resolve(root, relativePath), "utf8");
}

async function applySql(client, sql) {
  for (const statement of splitSql(sql)) {
    await client.query(statement);
  }
}

async function asUser(client, userId, role = "authenticated") {
  await client.query("select set_config('request.jwt.claim.role', $1, false)", [role]);
  await client.query("select set_config('request.jwt.claim.sub', $1, false)", [userId ?? ""]);
  await client.query("select set_config('request.jwt.claims', $1, false)", [
    JSON.stringify(userId ? { sub: userId, role } : { role }),
  ]);
}

async function expectNoRows(label, operation) {
  try {
    const result = await operation();
    assert(result.rowCount === 0, `${label}: operation unexpectedly returned rows`);
    console.log(`PASS ${label}`);
  } catch (error) {
    if (/permission denied|row-level security/i.test(error instanceof Error ? error.message : String(error))) {
      console.log(`PASS ${label}`);
      return;
    }
    throw error;
  }
}

async function expectOneRow(label, operation) {
  const result = await operation();
  assert(result.rowCount === 1, `${label}: expected one row, received ${result.rowCount}`);
  console.log(`PASS ${label}`);
}

const [migrationSql, assignmentSql, feedbackSql] = await Promise.all([
  readFile(migrationPath, "utf8"),
  read("supabase/clean-migrations/0021_student_work_assignments.sql"),
  read("supabase/clean-migrations/0032_teacher_feedback_notes.sql"),
]);

for (const table of practiceTables) {
  assert(
    migrationSql.includes(`on public.${table}`),
    `0047 must define owner-scoped policy coverage for public.${table}.`,
  );
}
for (const table of sessionEvidenceTables) {
  assert(
    migrationSql.includes(`${table}_assignment_manager_select`),
    `0047 must explicitly limit Assignment-manager reads for public.${table}.`,
  );
}
assert(
  !/private\.is_org_staff\(organization_id\)/i.test(migrationSql),
  "0047 must not retain a broad organization-staff Practice evidence shortcut.",
);
assert(
  migrationSql.includes("private.can_manage_assignment(assignment_session.assignment_id)"),
  "0047 must resolve Teacher evidence access through an explicit managed Assignment.",
);
assert(
  !migrationSql.includes("practice_wrong_questions_assignment_manager_select"),
  "Aggregate wrong-question history must remain Student-owned rather than leak through a latest-session shortcut.",
);
assert(
  !/user_practice_preferences_assignment_manager_select|practice_preference_merge_jobs_assignment_manager_select/i.test(
    migrationSql,
  ),
  "Long-term preferences and merge records must remain Student-owned.",
);
assert(
  /student_assignment_progress_read_scoped[\s\S]*?private\.can_manage_assignment\(assignment_id\)/.test(
    assignmentSql,
  ) && /assignment_practice_sessions_read_scoped[\s\S]*?private\.can_manage_assignment\(assignment_id\)/.test(assignmentSql),
  "Existing assignment progress and assignment-session policies must stay explicitly Assignment-manager scoped.",
);
assert(
  /teacher_feedback_notes_teacher_read[\s\S]*?can_manage_teacher_feedback_assignment/.test(feedbackSql) &&
    /teacher_feedback_notes_student_sent_read[\s\S]*?visibility = 'sent_to_student'/.test(feedbackSql),
  "Teacher feedback must remain Assignment-manager scoped and Student-visible only when sent.",
);
assert(
  !/bank_members|question_banks|owner_bank_id|ai_provider|storage\.objects/i.test(migrationSql),
  "0047 must not alter Bank, provider, or Storage boundaries.",
);
console.log("PASS static P1-STUDENT-01 authorization contract");

const harness = await createGoogleAccountLinksPostgresHarness("student-self-study-isolation");
const { connection, instance } = harness;
let bootstrap;
let authenticatedClient;
let anonymousClient;
let serviceClient;

const ids = {
  studentA: "10000000-0000-0000-0000-000000000001",
  studentB: "10000000-0000-0000-0000-000000000002",
  studentC: "10000000-0000-0000-0000-000000000003",
  studentD: "10000000-0000-0000-0000-000000000004",
  teacherA: "10000000-0000-0000-0000-000000000005",
  teacherB: "10000000-0000-0000-0000-000000000006",
  removedCoTeacher: "10000000-0000-0000-0000-000000000007",
  organizationAdmin: "10000000-0000-0000-0000-000000000008",
  selfSession: "20000000-0000-0000-0000-000000000001",
  assignmentSession: "20000000-0000-0000-0000-000000000002",
  studentBSession: "20000000-0000-0000-0000-000000000004",
  assignment: "30000000-0000-0000-0000-000000000001",
};

try {
  await instance.initialise();
  await instance.start();
  await instance.createDatabase("student_self_study_isolation_test").catch(() => {});
  bootstrap = new pg.Client({ ...connection, database: "student_self_study_isolation_test" });
  await bootstrap.connect();

  await applySql(
    bootstrap,
    [
      "create schema if not exists auth;",
      "create schema if not exists private;",
      "do $$ begin",
      "  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;",
      "  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;",
      "  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;",
      "  if not exists (select 1 from pg_roles where rolname = 'practice_rls_tester') then create role practice_rls_tester login password 'practice_rls_tester_password'; end if;",
      "  if not exists (select 1 from pg_roles where rolname = 'practice_anon_tester') then create role practice_anon_tester login password 'practice_anon_tester_password'; end if;",
      "  if not exists (select 1 from pg_roles where rolname = 'practice_service_tester') then create role practice_service_tester login password 'practice_service_tester_password'; end if;",
      "end $$;",
      "grant authenticated to practice_rls_tester;",
      "grant anon to practice_anon_tester;",
      "grant service_role to practice_service_tester;",
      "create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;",
      "create table public.assignments (id uuid primary key);",
      "create table public.classroom_members (classroom_id uuid not null, user_id uuid not null, role text not null, status text not null);",
      "create table public.assignment_practice_sessions (assignment_id uuid not null, student_id uuid not null, practice_session_id uuid not null);",
      "create table private.assignment_managers (assignment_id uuid not null, user_id uuid not null);",
      "create or replace function private.can_manage_assignment(target_assignment_id uuid) returns boolean language sql stable security definer set search_path = public, private as $$ select exists (select 1 from private.assignment_managers where assignment_id = target_assignment_id and user_id = auth.uid()) $$;",
      "alter function private.can_manage_assignment(uuid) owner to postgres;",
      "revoke all on function private.can_manage_assignment(uuid) from public, anon;",
      "grant execute on function private.can_manage_assignment(uuid) to authenticated;",
      "create table public.practice_sessions (id uuid primary key, organization_id uuid, user_id uuid not null);",
      "create table public.practice_rounds (id uuid primary key, organization_id uuid, user_id uuid not null, session_id uuid not null);",
      "create table public.practice_round_questions (id uuid primary key, organization_id uuid, user_id uuid not null, session_id uuid not null);",
      "create table public.practice_attempts (id uuid primary key, organization_id uuid, user_id uuid not null, session_id uuid not null);",
      "create table public.practice_hint_events (id uuid primary key, organization_id uuid, user_id uuid not null, session_id uuid not null);",
      "create table public.practice_reflection_records (id uuid primary key, organization_id uuid, user_id uuid not null, session_id uuid not null);",
      "create table public.practice_wrong_questions (id uuid primary key, organization_id uuid, user_id uuid not null, last_session_id uuid);",
      "create table public.practice_weakness_links (id uuid primary key, organization_id uuid, user_id uuid not null, session_id uuid, attempt_id uuid);",
      "create table public.user_practice_preferences (user_id uuid primary key, organization_id uuid);",
      "create table public.practice_preference_merge_jobs (id uuid primary key, organization_id uuid, user_id uuid not null, source_session_id uuid);",
      "create table public.practice_agent_episodes (id uuid primary key, organization_id uuid, user_id uuid not null, session_id uuid not null);",
      "create table public.student_assignment_progress (id uuid primary key, assignment_id uuid not null, student_id uuid not null);",
      "create table public.teacher_feedback_notes (id uuid primary key, assignment_id uuid not null, student_id uuid not null, visibility text not null, status text not null);",
      "grant usage on schema public, auth to anon, authenticated, service_role;",
      "grant select, insert, update, delete on all tables in schema public to anon, authenticated;",
      "grant select, insert, update, delete on all tables in schema public to service_role;",
    ].join("\n"),
  );
  await applySql(bootstrap, migrationSql);

  await applySql(
    bootstrap,
    [
      "alter table public.assignment_practice_sessions enable row level security;",
      "create policy assignment_practice_sessions_read_scoped on public.assignment_practice_sessions for select to authenticated using (student_id = auth.uid() or private.can_manage_assignment(assignment_id));",
      "alter table public.student_assignment_progress enable row level security;",
      "create policy student_assignment_progress_read_scoped on public.student_assignment_progress for select to authenticated using (student_id = auth.uid() or private.can_manage_assignment(assignment_id));",
      "alter table public.teacher_feedback_notes enable row level security;",
      "create policy teacher_feedback_notes_teacher_read on public.teacher_feedback_notes for select to authenticated using (private.can_manage_assignment(assignment_id));",
      "create policy teacher_feedback_notes_student_sent_read on public.teacher_feedback_notes for select to authenticated using (student_id = auth.uid() and visibility = 'sent_to_student' and status = 'sent');",
    ].join("\n"),
  );

  const orgOne = "40000000-0000-0000-0000-000000000001";
  const sharedClassroom = "40000000-0000-0000-0000-000000000003";
  const selfRound = "50000000-0000-0000-0000-000000000001";
  const assignedRound = "50000000-0000-0000-0000-000000000002";
  const selfAttempt = "60000000-0000-0000-0000-000000000001";
  const assignedAttempt = "60000000-0000-0000-0000-000000000002";

  await bootstrap.query("insert into public.assignments (id) values ($1)", [ids.assignment]);
  await bootstrap.query(
    "insert into public.classroom_members (classroom_id, user_id, role, status) values ($1, $2, 'student', 'active'), ($1, $3, 'student', 'active'), ($1, $4, 'teacher', 'active'), ($1, $5, 'teacher', 'removed')",
    [sharedClassroom, ids.studentA, ids.studentB, ids.teacherA, ids.removedCoTeacher],
  );
  await bootstrap.query(
    "insert into private.assignment_managers (assignment_id, user_id) values ($1, $2)",
    [ids.assignment, ids.teacherA],
  );
  await bootstrap.query(
    "insert into public.practice_sessions (id, organization_id, user_id) values ($1, $3, $2), ($4, $3, $2), ($5, $3, $6)",
    [ids.selfSession, ids.studentA, orgOne, ids.assignmentSession, ids.studentBSession, ids.studentB],
  );
  await bootstrap.query(
    "insert into public.assignment_practice_sessions (assignment_id, student_id, practice_session_id) values ($1, $2, $3)",
    [ids.assignment, ids.studentA, ids.assignmentSession],
  );
  for (const [table, id] of [
    ["practice_rounds", selfRound],
    ["practice_round_questions", "70000000-0000-0000-0000-000000000001"],
    ["practice_attempts", selfAttempt],
    ["practice_hint_events", "70000000-0000-0000-0000-000000000002"],
    ["practice_reflection_records", "70000000-0000-0000-0000-000000000003"],
    ["practice_agent_episodes", "70000000-0000-0000-0000-000000000004"],
  ]) {
    await bootstrap.query(`insert into public.${table} (id, organization_id, user_id, session_id) values ($1, $2, $3, $4)`, [
      id,
      orgOne,
      ids.studentA,
      ids.selfSession,
    ]);
  }
  for (const [table, id] of [
    ["practice_rounds", assignedRound],
    ["practice_round_questions", "80000000-0000-0000-0000-000000000001"],
    ["practice_attempts", assignedAttempt],
    ["practice_hint_events", "80000000-0000-0000-0000-000000000002"],
    ["practice_reflection_records", "80000000-0000-0000-0000-000000000003"],
    ["practice_agent_episodes", "80000000-0000-0000-0000-000000000004"],
  ]) {
    await bootstrap.query(`insert into public.${table} (id, organization_id, user_id, session_id) values ($1, $2, $3, $4)`, [
      id,
      orgOne,
      ids.studentA,
      ids.assignmentSession,
    ]);
  }
  await bootstrap.query(
    "insert into public.practice_wrong_questions (id, organization_id, user_id, last_session_id) values ($1, $2, $3, $4)",
    ["90000000-0000-0000-0000-000000000001", orgOne, ids.studentA, ids.assignmentSession],
  );
  await bootstrap.query(
    "insert into public.practice_weakness_links (id, organization_id, user_id, session_id, attempt_id) values ($1, $2, $3, $4, $5), ($6, $2, $3, $7, $8)",
    [
      "90000000-0000-0000-0000-000000000002",
      orgOne,
      ids.studentA,
      ids.selfSession,
      selfAttempt,
      "90000000-0000-0000-0000-000000000003",
      ids.assignmentSession,
      assignedAttempt,
    ],
  );
  await bootstrap.query(
    "insert into public.user_practice_preferences (user_id, organization_id) values ($1, $2)",
    [ids.studentA, orgOne],
  );
  await bootstrap.query(
    "insert into public.practice_preference_merge_jobs (id, organization_id, user_id, source_session_id) values ($1, $2, $3, $4)",
    ["90000000-0000-0000-0000-000000000004", orgOne, ids.studentA, ids.assignmentSession],
  );
  await bootstrap.query(
    "insert into public.student_assignment_progress (id, assignment_id, student_id) values ($1, $2, $3)",
    ["90000000-0000-0000-0000-000000000005", ids.assignment, ids.studentA],
  );
  await bootstrap.query(
    "insert into public.teacher_feedback_notes (id, assignment_id, student_id, visibility, status) values ($1, $2, $3, 'sent_to_student', 'sent'), ($4, $2, $3, 'private', 'draft')",
    [
      "90000000-0000-0000-0000-000000000006",
      ids.assignment,
      ids.studentA,
      "90000000-0000-0000-0000-000000000007",
    ],
  );

  authenticatedClient = new pg.Client({
    ...connection,
    database: "student_self_study_isolation_test",
    user: "practice_rls_tester",
    password: "practice_rls_tester_password",
  });
  anonymousClient = new pg.Client({
    ...connection,
    database: "student_self_study_isolation_test",
    user: "practice_anon_tester",
    password: "practice_anon_tester_password",
  });
  serviceClient = new pg.Client({
    ...connection,
    database: "student_self_study_isolation_test",
    user: "practice_service_tester",
    password: "practice_service_tester_password",
  });
  await Promise.all([authenticatedClient.connect(), anonymousClient.connect(), serviceClient.connect()]);
  await serviceClient.query("set role service_role");

  await asUser(authenticatedClient, ids.studentA);
  await expectOneRow("Student A can create private self-study", () =>
    authenticatedClient.query(
      "insert into public.practice_sessions (id, organization_id, user_id) values ($1, $2, $3) returning id",
      ["20000000-0000-0000-0000-000000000003", orgOne, ids.studentA],
    ),
  );
  await expectOneRow("Student A can read private self-study session", () =>
    authenticatedClient.query("select id from public.practice_sessions where id = $1", [ids.selfSession]),
  );
  await expectOneRow("Student A can update private self-study session", () =>
    authenticatedClient.query("update public.practice_sessions set organization_id = organization_id where id = $1 returning id", [
      ids.selfSession,
    ]),
  );
  await expectOneRow("Student A can read their assignment-linked session", () =>
    authenticatedClient.query("select id from public.practice_sessions where id = $1", [ids.assignmentSession]),
  );
  await expectNoRows("Student A cannot read same-class Student B self-study", () =>
    authenticatedClient.query("select id from public.practice_sessions where id = $1", [ids.studentBSession]),
  );
  await expectOneRow("Student A can read sent assignment feedback only", () =>
    authenticatedClient.query("select id from public.teacher_feedback_notes where visibility = 'sent_to_student'"),
  );
  await expectNoRows("Student A cannot read private teacher feedback", () =>
    authenticatedClient.query("select id from public.teacher_feedback_notes where visibility = 'private'"),
  );

  for (const [label, actor] of [
    ["same-class Student B", ids.studentB],
    ["same-organization unrelated Student C", ids.studentC],
    ["other-organization Student D", ids.studentD],
    ["authorized Assignment Teacher A", ids.teacherA],
    ["same-organization unrelated Teacher B", ids.teacherB],
    ["removed co-teacher", ids.removedCoTeacher],
    ["organization admin", ids.organizationAdmin],
  ]) {
    await asUser(authenticatedClient, actor);
    await expectNoRows(`${label} cannot read Student A private self-study`, () =>
      authenticatedClient.query("select id from public.practice_sessions where id = $1", [ids.selfSession]),
    );
    await expectNoRows(`${label} cannot mutate Student A private self-study`, () =>
      authenticatedClient.query("update public.practice_sessions set organization_id = organization_id where id = $1 returning id", [
        ids.selfSession,
      ]),
    );
  }

  await asUser(authenticatedClient, ids.teacherA);
  await expectOneRow("Assignment Teacher A can read linked Practice session", () =>
    authenticatedClient.query("select id from public.practice_sessions where id = $1", [ids.assignmentSession]),
  );
  for (const table of sessionEvidenceTables) {
    await expectOneRow(`Assignment Teacher A can read linked ${table}`, () =>
      authenticatedClient.query(`select id from public.${table} where session_id = $1`, [ids.assignmentSession]),
    );
  }
  await expectNoRows("Assignment Teacher A cannot mutate Student answers", () =>
    authenticatedClient.query("update public.practice_attempts set organization_id = organization_id where id = $1 returning id", [
      assignedAttempt,
    ]),
  );
  await expectNoRows("Assignment Teacher A cannot read aggregate wrong-question history", () =>
    authenticatedClient.query("select id from public.practice_wrong_questions where user_id = $1", [ids.studentA]),
  );
  await expectNoRows("Assignment Teacher A cannot read long-term preferences", () =>
    authenticatedClient.query("select user_id from public.user_practice_preferences where user_id = $1", [ids.studentA]),
  );
  await expectNoRows("Assignment Teacher A cannot read preference merge records", () =>
    authenticatedClient.query("select id from public.practice_preference_merge_jobs where user_id = $1", [ids.studentA]),
  );
  await expectOneRow("Assignment Teacher A can read assignment progress", () =>
    authenticatedClient.query("select id from public.student_assignment_progress where assignment_id = $1", [ids.assignment]),
  );
  await expectOneRow("Assignment Teacher A can read assignment feedback", () =>
    authenticatedClient.query(
      "select id from public.teacher_feedback_notes where id = $1 and assignment_id = $2",
      ["90000000-0000-0000-0000-000000000006", ids.assignment],
    ),
  );

  for (const [label, actor] of [
    ["same-class Student B", ids.studentB],
    ["same-organization unrelated Teacher B", ids.teacherB],
    ["removed co-teacher", ids.removedCoTeacher],
    ["organization admin", ids.organizationAdmin],
  ]) {
    await asUser(authenticatedClient, actor);
    await expectNoRows(`${label} cannot read Student A assignment-linked evidence`, () =>
      authenticatedClient.query("select id from public.practice_sessions where id = $1", [ids.assignmentSession]),
    );
    await expectNoRows(`${label} cannot read Student A assignment progress`, () =>
      authenticatedClient.query("select id from public.student_assignment_progress where assignment_id = $1", [ids.assignment]),
    );
  }

  await asUser(anonymousClient, null, "anon");
  await expectNoRows("anonymous requester cannot read Practice evidence", () =>
    anonymousClient.query("select id from public.practice_sessions where id = $1", [ids.selfSession]),
  );

  const helperGrant = await bootstrap.query(
    "select has_function_privilege('authenticated', 'private.can_read_practice_session_evidence(uuid)', 'execute') as allowed",
  );
  assert(helperGrant.rows[0]?.allowed === true, "RLS helper execute grant is required for policy evaluation");
  console.log("PASS helper execution grant is present for private-schema RLS evaluation");
  const bankTable = await bootstrap.query("select to_regclass('public.bank_members') as bank_members");
  assert(bankTable.rows[0]?.bank_members === null, "embedded isolation fixture must not create Bank membership state");
  console.log("PASS Practice evidence policy has no Bank membership side effect");

  const serviceRead = await serviceClient.query("select id from public.practice_sessions where id = $1", [
    ids.selfSession,
  ]);
  assert(serviceRead.rowCount === 1, "trusted service role must retain exact operational access");
  console.log("PASS service role retains trusted Practice evidence access");
  console.log("PASS embedded P1-STUDENT-01 isolation matrix");
} finally {
  await Promise.all([
    authenticatedClient?.end().catch(() => {}),
    anonymousClient?.end().catch(() => {}),
    serviceClient?.end().catch(() => {}),
    bootstrap?.end().catch(() => {}),
  ]);
  await instance.stop().catch(() => {});
  await harness.cleanup().catch(() => {});
}
