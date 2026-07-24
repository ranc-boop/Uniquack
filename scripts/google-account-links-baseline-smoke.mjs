// Smoke: can we apply the current clean migration chain onto embedded-postgres,
// with a minimal auth schema mock so private.handle_new_user() works?
import { readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { createGoogleAccountLinksPostgresHarness } from './google-account-links-embedded-postgres.mjs';
import { splitSql } from './sql-split.mjs';
import { loadCanonicalMigrationPlan } from './lib/canonical-migration-plan.mjs';

const here = fileURLToPath(import.meta.url);
const root = resolve(here, '..', '..');
const migrationPlan = await loadCanonicalMigrationPlan({ root });
const cleanDir = migrationPlan.cleanDirectory;
const files = migrationPlan.executableMigrationNames;

const harness = await createGoogleAccountLinksPostgresHarness('google-baseline');
const { instance: pgInstance, connection } = harness;

let client;
let migrationFailed = false;
try {
  await pgInstance.initialise();
  await pgInstance.start();
  await pgInstance.createDatabase('glogin1_test').catch(() => {});

  client = new pg.Client({
    ...connection,
    database: 'glogin1_test',
  });
  await client.connect();

  // --- minimal auth schema mock (Supabase parity surface) ---
  await client.query(`
    do $$ begin
      if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
      if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
      if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
    end $$;
    create schema if not exists auth;
    create table if not exists auth.users (
      id uuid primary key,
      email text unique,
      raw_user_meta_data jsonb not null default '{}'::jsonb,
      -- 0032 private.profile_has_password() reads this hint.
      -- on real Supabase this maps to (encrypted_password is not null).
      password_set boolean not null default false,
      created_at timestamptz not null default now()
    );
    create or replace function auth.uid() returns uuid
      language sql stable as $$ select null::uuid $$;
    create or replace function auth.role() returns text
      language sql stable as $$ select current_setting('request.jwt.claim.role', true) $$;
    create or replace function auth.jwt() returns jsonb
      language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;

    -- minimal Supabase storage schema mock (0015 needs storage.buckets)
    create schema if not exists storage;
    create table if not exists storage.buckets (
      id text primary key,
      name text not null,
      public boolean not null default false,
      file_size_limit bigint,
      allowed_mime_types text[],
      created_at timestamptz not null default now()
    );
    create table if not exists storage.objects (
      id uuid primary key default gen_random_uuid(),
      bucket_id text not null references storage.buckets(id) on delete cascade,
      name text not null,
      owner uuid,
      metadata jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now()
    );
  `);

  console.log('applying', files.length, 'clean migrations');
  for (const f of files) {
    const sql = readFileSync(join(cleanDir, f), 'utf8');
    const stmts = splitSql(sql);
    try {
      await client.query('begin');
      for (const s of stmts) {
        await client.query(s);
      }
      await client.query('commit');
      console.log('  ok', f, '(' + stmts.length + ' stmts)');
    } catch (e) {
      await client.query('rollback').catch(() => {});
      console.error('  FAIL', f, '-', e?.message);
      // dump first failing statement for diagnosis
      console.error('--- first stmt (first 400 chars) ---');
      console.error((stmts[0] || '').slice(0, 400));
      process.exitCode = 2;
      migrationFailed = true;
      break;
    }
  }

  if (!migrationFailed) {
    const practiceUserId = '10000000-0000-4000-8000-000000000053';
    const practiceSessionId = '20000000-0000-4000-8000-000000000053';
    await client.query(`
      create or replace function auth.uid() returns uuid
        language sql stable
        as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$
    `);
    await client.query(`
      insert into auth.users (id, email, raw_user_meta_data)
      values ($1, 'practice-0054@example.invalid', '{"role":"student"}'::jsonb)
      on conflict (id) do nothing
    `, [practiceUserId]);
    await client.query(`select set_config('request.jwt.claim.role', 'service_role', false)`);
    await client.query(`
      insert into public.profiles (id, email, role, status)
      values ($1, 'practice-0054@example.invalid', 'student', 'active')
      on conflict (id) do nothing
    `, [practiceUserId]);
    await client.query(`
      insert into public.practice_sessions (id, user_id, title)
      values ($2, $1, '0054 first-round source lock runtime smoke')
    `, [practiceUserId, practiceSessionId]);
    const beforeLock = await client.query(
      `select source_scope_locked_at
       from public.practice_sessions
       where id = $1`,
      [practiceSessionId],
    );
    if (beforeLock.rows[0]?.source_scope_locked_at !== null) {
      throw new Error('0054 empty Practice session must remain source-editable.');
    }
    await client.query(
      `select set_config('request.jwt.claim.sub', $1, false)`,
      [practiceUserId],
    );
    const sourceBinding = await client.query(
      `select source_kind, bank_id
       from public.lock_practice_session_sources_for_round($1, '{}'::uuid[], true)`,
      [practiceSessionId],
    );
    if (
      sourceBinding.rows.length !== 1 ||
      sourceBinding.rows[0]?.source_kind !== 'public_catalog' ||
      sourceBinding.rows[0]?.bank_id !== null
    ) {
      throw new Error('0054 first-round Practice source-lock RPC runtime smoke failed.');
    }
    const afterLock = await client.query(
      `select source_scope_locked_at
       from public.practice_sessions
       where id = $1`,
      [practiceSessionId],
    );
    if (!afterLock.rows[0]?.source_scope_locked_at) {
      throw new Error('0054 first-round Practice source lock timestamp was not persisted.');
    }
    const repeatedBinding = await client.query(
      `select source_kind, bank_id
       from public.lock_practice_session_sources_for_round($1, '{}'::uuid[], false)`,
      [practiceSessionId],
    );
    if (
      repeatedBinding.rows.length !== 1 ||
      repeatedBinding.rows[0]?.source_kind !== 'public_catalog'
    ) {
      throw new Error('0054 locked Practice source scope must be idempotent and immutable.');
    }
    console.log('PASS 0054 empty session stays editable and first-round source lock is atomic');

    const r = await client.query(
      "select count(*)::int as n from pg_tables where schemaname='public'"
    );
    console.log('public tables after current clean migrations:', r.rows[0].n);
  }
} finally {
  if (client) await client.end().catch(() => {});
  await harness.cleanup();
}
