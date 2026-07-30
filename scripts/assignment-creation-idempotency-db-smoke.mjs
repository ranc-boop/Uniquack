import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

import { createGoogleAccountLinksPostgresHarness } from "./google-account-links-embedded-postgres.mjs";
import { loadCanonicalMigrationPlan } from "./lib/canonical-migration-plan.mjs";
import { splitSql } from "./sql-split.mjs";

const root = resolve(fileURLToPath(import.meta.url), "..", "..");
const plan = await loadCanonicalMigrationPlan({ root });
const harness = await createGoogleAccountLinksPostgresHarness(
  "assignment-idempotency",
);
const { connection, instance } = harness;
let admin;
let teacherA;
let teacherB;

async function cleanupHarness() {
  const fallback = setTimeout(() => {
    const postgresPid = instance.process?.pid;
    if (process.platform === "win32" && postgresPid) {
      try {
        process.kill(postgresPid, "SIGKILL");
      } catch {
        // The primary Postgres process may have already exited.
      }
    }
  }, 5_000);

  try {
    await harness.cleanup();
  } finally {
    clearTimeout(fallback);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function connectTeacher(database, teacherId) {
  const client = new pg.Client({ ...connection, database });
  await client.connect();
  await client.query("set role authenticated");
  await client.query(
    "select set_config('request.jwt.claim.sub', $1, false)",
    [teacherId],
  );
  await client.query(
    "select set_config('request.jwt.claim.role', 'authenticated', false)",
  );
  return client;
}

async function createAssignment(client, ids, requestKey, title) {
  return client.query(
    `select public.create_assignment_from_bank(
       $1::uuid,
       $2::uuid,
       $3::text,
       $4::text,
       $5::timestamptz,
       $6::uuid[],
       $7::boolean,
       $8::uuid
     ) as assignment_id`,
    [
      ids.bank,
      ids.classroom,
      title,
      "Complete the reviewed question.",
      null,
      [ids.bankQuestion],
      true,
      requestKey,
    ],
  );
}

try {
  await instance.initialise();
  await instance.start();
  await instance.createDatabase("assignment_idempotency_test").catch(() => {});
  admin = new pg.Client({
    ...connection,
    database: "assignment_idempotency_test",
  });
  await admin.connect();
  await admin.query(`
    do $$ begin
      if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
      if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
      if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
    end $$;
    create schema if not exists auth;
    create table auth.users (
      id uuid primary key,
      email text unique,
      raw_user_meta_data jsonb not null default '{}'::jsonb,
      password_set boolean not null default false,
      created_at timestamptz not null default now()
    );
    create or replace function auth.uid() returns uuid
      language sql stable
      as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create or replace function auth.role() returns text
      language sql stable
      as $$ select current_setting('request.jwt.claim.role', true) $$;
    create or replace function auth.jwt() returns jsonb
      language sql stable
      as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
    create schema if not exists storage;
    create table storage.buckets (
      id text primary key,
      name text not null,
      public boolean not null default false,
      file_size_limit bigint,
      allowed_mime_types text[],
      created_at timestamptz not null default now()
    );
    create table storage.objects (
      id uuid primary key default gen_random_uuid(),
      bucket_id text not null references storage.buckets(id) on delete cascade,
      name text not null,
      owner uuid,
      metadata jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now()
    );
  `);

  for (const filename of plan.executableMigrationNames) {
    const sql = readFileSync(join(plan.cleanDirectory, filename), "utf8");
    await admin.query("begin");
    try {
      for (const statement of splitSql(sql)) {
        await admin.query(statement);
      }
      await admin.query("commit");
    } catch (error) {
      await admin.query("rollback");
      throw new Error(`${filename}: ${error.message}`);
    }
  }
  console.log("PASS fresh-chain migrations applied through 0069");
  await admin.query(
    "select set_config('request.jwt.claim.role', 'service_role', false)",
  );

  const ids = {
    bank: "71000000-0000-4000-8000-000000000068",
    bankQuestion: "72000000-0000-4000-8000-000000000068",
    classroom: "73000000-0000-4000-8000-000000000068",
    firstRequest: "74000000-0000-4000-8000-000000000068",
    secondRequest: "75000000-0000-4000-8000-000000000068",
    organization: "76000000-0000-4000-8000-000000000068",
    question: "77000000-0000-4000-8000-000000000068",
    teacher: "78000000-0000-4000-8000-000000000068",
  };

  await admin.query(
    `insert into auth.users (id, email, raw_user_meta_data)
     values ($1, 'assignment-idempotency@example.invalid', '{"role":"teacher"}')`,
    [ids.teacher],
  );
  await admin.query(
    `insert into public.organizations (id, name, slug)
     values ($1, 'Assignment Idempotency', 'assignment-idempotency-0068')`,
    [ids.organization],
  );
  await admin.query(
    `insert into public.profiles (
       id, email, role, status, default_organization_id
     ) values ($1, 'assignment-idempotency@example.invalid', 'teacher', 'active', $2)`,
    [ids.teacher, ids.organization],
  );
  await admin.query(
    `insert into public.organization_members (
       organization_id, user_id, role, status
     ) values ($1, $2, 'teacher', 'active')`,
    [ids.organization, ids.teacher],
  );
  await admin.query(
    `insert into public.question_banks (
       id, organization_id, owner_id, name, visibility, status, created_by, updated_by
     ) values ($1, $2, $3, 'Idempotent Library', 'private', 'active', $3, $3)`,
    [ids.bank, ids.organization, ids.teacher],
  );
  await admin.query(
    `insert into public.bank_members (
       bank_id, user_id, role, status, joined_at
     ) values ($1, $2, 'owner', 'active', now())`,
    [ids.bank, ids.teacher],
  );
  await admin.query(
    `insert into public.classrooms (
       id, organization_id, owner_id, name, status, created_by, updated_by
     ) values ($1, $2, $3, 'Idempotency classroom', 'active', $3, $3)`,
    [ids.classroom, ids.organization, ids.teacher],
  );
  await admin.query(
    `insert into public.classroom_members (
       classroom_id, user_id, role, status, joined_at
     ) values ($1, $2, 'teacher', 'active', now())`,
    [ids.classroom, ids.teacher],
  );
  await admin.query(
    `insert into public.questions (
       id, organization_id, owner_bank_id, question_code, title,
       question_type, content_html, solution_html, difficulty_rating,
       status, source_kind, visibility, created_by, updated_by, reviewed_by
     ) values (
       $1, $2, $3, 'IDEMP-0068', 'Reviewed idempotency question',
       'frq', '<p>What is 2 + 2?</p>', '<p>4</p>', 100,
       'review', 'manual', 'private', $4, $4, $4
     )`,
    [ids.question, ids.organization, ids.bank, ids.teacher],
  );
  await admin.query(
    `insert into public.bank_questions (
       id, bank_id, question_id, status, source_kind, added_by
     ) values ($1, $2, $3, 'active', 'manual', $4)`,
    [ids.bankQuestion, ids.bank, ids.question, ids.teacher],
  );

  teacherA = await connectTeacher(
    "assignment_idempotency_test",
    ids.teacher,
  );
  teacherB = await connectTeacher(
    "assignment_idempotency_test",
    ids.teacher,
  );
  console.log("PASS idempotency fixtures and authenticated teacher clients are ready");

  const [first, repeated] = await Promise.all([
    createAssignment(
      teacherA,
      ids,
      ids.firstRequest,
      "Concurrent reviewed Assignment",
    ),
    createAssignment(
      teacherB,
      ids,
      ids.firstRequest,
      "Concurrent reviewed Assignment",
    ),
  ]);
  const firstId = first.rows[0]?.assignment_id;
  const repeatedId = repeated.rows[0]?.assignment_id;
  assert(firstId && firstId === repeatedId, "same-key requests returned different Assignments");
  console.log("PASS concurrent same-key calls returned one Assignment id");

  const counts = await admin.query(
    `select
       (select count(*)::int from public.assignments where created_by = $1) as assignments,
       (select count(*)::int from private.assignment_creation_requests where actor_id = $1) as receipts`,
    [ids.teacher],
  );
  assert(
    counts.rows[0]?.assignments === 1 && counts.rows[0]?.receipts === 1,
    "same-key concurrency did not produce exactly one Assignment and one receipt",
  );

  let mismatchRejected = false;
  try {
    await createAssignment(
      teacherA,
      ids,
      ids.firstRequest,
      "Different payload must fail",
    );
  } catch (error) {
    mismatchRejected = String(error.message).includes(
      "already used for different content",
    );
  }
  assert(mismatchRejected, "request-key reuse with a different payload was not rejected");
  console.log("PASS same key with a different payload was rejected");

  const second = await createAssignment(
    teacherA,
    ids,
    ids.secondRequest,
    "Second intentional Assignment",
  );
  assert(
    second.rows[0]?.assignment_id &&
      second.rows[0].assignment_id !== firstId,
    "a new request key did not create a new Assignment",
  );

  let privateReceiptDenied = false;
  try {
    await teacherA.query(
      "select count(*) from private.assignment_creation_requests",
    );
  } catch {
    privateReceiptDenied = true;
  }
  assert(
    privateReceiptDenied,
    "authenticated browser role could read private Assignment request receipts",
  );

  console.log(
    "PASS Assignment creation idempotency: concurrent same-key reuse, mismatch denial, distinct-key creation, and private receipt isolation",
  );
} catch (error) {
  console.error("FAIL Assignment creation idempotency DB smoke:", error);
  process.exitCode = 1;
} finally {
  await teacherA?.end().catch(() => {});
  await teacherB?.end().catch(() => {});
  await admin?.end().catch(() => {});
  await cleanupHarness();
}
