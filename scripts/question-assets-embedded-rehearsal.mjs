// Local-only rehearsal for the final reconciled schema dependencies of 0045/0046.
// It models the post-0044 state without replaying frozen 0043/0044 migrations.

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";

import { createGoogleAccountLinksPostgresHarness } from "./google-account-links-embedded-postgres.mjs";

const { Client } = pg;
const root = process.cwd();
const ids = {
  organization: "10000000-0000-4000-8000-000000000001",
  staff: "20000000-0000-4000-8000-000000000001",
  student: "20000000-0000-4000-8000-000000000002",
  unrelated: "20000000-0000-4000-8000-000000000003",
  bank: "30000000-0000-4000-8000-000000000001",
  publicQuestion: "40000000-0000-4000-8000-000000000001",
  draftQuestion: "40000000-0000-4000-8000-000000000002",
  bankQuestion: "40000000-0000-4000-8000-000000000003",
  assignedQuestion: "40000000-0000-4000-8000-000000000004",
  publicAsset: "50000000-0000-4000-8000-000000000001",
  draftAsset: "50000000-0000-4000-8000-000000000002",
  bankAsset: "50000000-0000-4000-8000-000000000003",
  assignedAsset: "50000000-0000-4000-8000-000000000004",
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
  console.log(`PASS ${message}`);
}

async function expectDenied(label, operation) {
  try {
    await operation();
  } catch {
    console.log(`PASS ${label}`);
    return;
  }
  throw new Error(`${label} unexpectedly succeeded`);
}

async function asRole(client, role, userId) {
  await client.query("reset role");
  await client.query(`set role ${role}`);
  await client.query("select set_config('request.jwt.claim.sub', $1, false)", [userId]);
}

const schemaSql = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  create schema auth;
  create schema private;
  create schema storage;
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create table public.questions (
    id uuid primary key,
    organization_id uuid not null,
    status text not null,
    visibility text not null,
    owner_bank_id uuid,
    deleted_at timestamptz
  );
  create table public.question_assets (
    id uuid primary key,
    question_id uuid not null references public.questions(id),
    storage_bucket text not null,
    storage_path text not null,
    created_by uuid not null
  );
  create table public.question_banks (id uuid primary key, organization_id uuid not null);
  create table public.bank_questions (bank_id uuid not null, question_id uuid not null, status text not null);
  create table private.staff_organizations (user_id uuid not null, organization_id uuid not null);
  create table private.bank_readers (user_id uuid not null, bank_id uuid not null);
  create table private.bank_managers (user_id uuid not null, bank_id uuid not null);
  create table private.assignment_question_readers (user_id uuid not null, question_id uuid not null);
  create function private.is_admin() returns boolean language sql stable security definer as $$ select false $$;
  create function private.is_org_staff(target_organization_id uuid) returns boolean language sql stable security definer as
    $$ select exists (select 1 from private.staff_organizations where user_id = auth.uid() and organization_id = target_organization_id) $$;
  create function private.can_read_question_bank(target_bank_id uuid) returns boolean language sql stable security definer as
    $$ select exists (select 1 from private.bank_readers where user_id = auth.uid() and bank_id = target_bank_id) $$;
  create function private.can_manage_question_bank(target_bank_id uuid) returns boolean language sql stable security definer as
    $$ select exists (select 1 from private.bank_managers where user_id = auth.uid() and bank_id = target_bank_id) $$;
  create function private.can_read_assignment_question(target_question_id uuid) returns boolean language sql stable security definer as
    $$ select exists (select 1 from private.assignment_question_readers where user_id = auth.uid() and question_id = target_question_id) $$;
  create table storage.buckets (
    id text primary key,
    name text not null,
    public boolean not null,
    file_size_limit bigint,
    allowed_mime_types text[]
  );
  create table storage.objects (
    id uuid primary key default md5(random()::text || clock_timestamp()::text)::uuid,
    bucket_id text not null,
    name text not null,
    unique(bucket_id, name)
  );
  alter table storage.objects enable row level security;
  grant usage on schema public, auth, storage to anon, authenticated, service_role;
  grant select on public.questions, public.question_assets, public.question_banks, public.bank_questions to authenticated;
  grant select, insert, delete on storage.objects to authenticated;
`;

async function main() {
  const harness = await createGoogleAccountLinksPostgresHarness("question-assets-rehearsal");
  const client = new Client({ ...harness.connection, database: "postgres" });

  try {
    await harness.instance.start();
    await client.connect();
    await client.query(schemaSql);

    const migration0015 = await readFile(
      resolve(root, "supabase/clean-migrations/0015_question_assets_storage_bucket.sql"),
      "utf8",
    );
    const migration0045 = await readFile(
      resolve(root, "supabase/clean-migrations/0045_question_read_authorization_helper.sql"),
      "utf8",
    );
    const migration0046 = await readFile(
      resolve(root, "supabase/clean-migrations/0046_question_assets_bucket_private.sql"),
      "utf8",
    );

    await client.query(migration0015);
    await client.query(
      `
      insert into public.question_banks values ('${ids.bank}', '${ids.organization}');
      insert into public.questions values
        ('${ids.publicQuestion}', '${ids.organization}', 'published', 'public', null, null),
        ('${ids.draftQuestion}', '${ids.organization}', 'draft', 'private', null, null),
        ('${ids.bankQuestion}', '${ids.organization}', 'draft', 'private', '${ids.bank}', null),
        ('${ids.assignedQuestion}', '${ids.organization}', 'draft', 'private', '${ids.bank}', null);
      insert into public.bank_questions values
        ('${ids.bank}', '${ids.bankQuestion}', 'active'),
        ('${ids.bank}', '${ids.assignedQuestion}', 'active');
      insert into public.question_assets values
        ('${ids.publicAsset}', '${ids.publicQuestion}', 'question-assets', 'questions/public.png', '${ids.staff}'),
        ('${ids.draftAsset}', '${ids.draftQuestion}', 'question-assets', 'questions/draft.png', '${ids.staff}'),
        ('${ids.bankAsset}', '${ids.bankQuestion}', 'question-assets', 'questions/bank.png', '${ids.staff}'),
        ('${ids.assignedAsset}', '${ids.assignedQuestion}', 'question-assets', 'questions/assigned.png', '${ids.staff}');
      insert into private.staff_organizations values ('${ids.staff}', '${ids.organization}');
      insert into private.bank_readers values ('${ids.staff}', '${ids.bank}');
      insert into private.bank_managers values ('${ids.staff}', '${ids.bank}');
      insert into private.assignment_question_readers values ('${ids.student}', '${ids.assignedQuestion}');
      `,
    );
    await client.query(migration0045);
    await client.query(migration0045);
    console.log("PASS 0045 applies and re-applies in the reconciled embedded schema");

    await asRole(client, "anon", "");
    let result = await client.query("select public.can_read_question_asset($1) as allowed", [ids.publicAsset]);
    assert(result.rows[0].allowed === true, "anonymous can read a public published asset");
    result = await client.query("select public.can_read_question_asset($1) as allowed", [ids.draftAsset]);
    assert(result.rows[0].allowed === false, "anonymous cannot read a private draft asset");
    await expectDenied("anonymous cannot execute the private question helper directly", () =>
      client.query("select private.can_read_question($1)", [ids.publicQuestion]),
    );

    await asRole(client, "authenticated", ids.student);
    result = await client.query("select public.can_read_question_asset($1) as allowed", [ids.assignedAsset]);
    assert(result.rows[0].allowed === true, "assignment-selected student can read only the selected private asset");
    result = await client.query("select public.can_read_question_asset($1) as allowed", [ids.bankAsset]);
    assert(result.rows[0].allowed === false, "classroom-unrelated student cannot enumerate an unselected bank asset");

    await asRole(client, "authenticated", ids.staff);
    result = await client.query("select public.can_read_question_asset($1) as allowed", [ids.bankAsset]);
    assert(result.rows[0].allowed === true, "authorized bank manager can read a bank asset");

    await asRole(client, "authenticated", ids.unrelated);
    result = await client.query("select public.can_read_question_asset($1) as allowed", [ids.bankAsset]);
    assert(result.rows[0].allowed === false, "unrelated teacher is denied the private bank asset");

    await asRole(client, "authenticated", ids.staff);
    await client.query("insert into storage.objects (bucket_id, name) values ('question-assets', 'questions/draft.png')");
    await client.query("delete from storage.objects where bucket_id = 'question-assets' and name = 'questions/draft.png'");
    console.log("PASS authorized staff upload and delete policy remains functional before cutover");
    await expectDenied("storage replace remains unavailable because no UPDATE policy exists", () =>
      client.query("update storage.objects set name = 'questions/replaced.png' where bucket_id = 'question-assets'"),
    );

    await client.query(migration0046);
    result = await client.query("select public from storage.buckets where id = 'question-assets'");
    assert(result.rows[0].public === false, "0046 makes only the expected bucket private");
    await client.query(migration0046);
    console.log("PASS 0046 re-applies safely after the bucket is private");

    await client.query("delete from storage.buckets where id = 'question-assets'");
    await expectDenied("0046 fails closed when the expected bucket is absent", () => client.query(migration0046));
  } finally {
    await client.end().catch(() => {});
    await harness.cleanup();
  }
}

await main();
