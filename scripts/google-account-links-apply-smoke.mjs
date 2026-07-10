import { readFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import EmbeddedPostgres from 'embedded-postgres';
import pg from 'pg';
import { splitSql } from './sql-split.mjs';

const here = fileURLToPath(import.meta.url);
const root = resolve(here, '..', '..');
const cleanDir = resolve(root, 'supabase/clean-migrations');

const pgInstance = new EmbeddedPostgres({
  databaseDir: 'C:\\AI\\o2iinstitute\\.pg-data',
  user: 'postgres',
  password: 'postgres',
  port: 54329,
  persistent: true,
});

let client;
try {
  await pgInstance.initialise();
  await pgInstance.start();
  await pgInstance.createDatabase('glogin1_test').catch(() => {});

  client = new pg.Client({
    host: '127.0.0.1',
    port: 54329,
    user: 'postgres',
    password: 'postgres',
    database: 'glogin1_test',
  });
  await client.connect();

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
      password_set boolean not null default false,
      created_at timestamptz not null default now()
    );
    create or replace function auth.uid() returns uuid
      language sql stable as $$ select null::uuid $$;
    create or replace function auth.role() returns text
      language sql stable as $$ select current_setting('request.jwt.claim.role', true) $$;
    create or replace function auth.jwt() returns jsonb
      language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;

    create schema if not exists storage;
    create table if not exists storage.buckets (
      id text primary key, name text not null, public boolean not null default false,
      file_size_limit bigint, allowed_mime_types text[],
      created_at timestamptz not null default now()
    );
    create table if not exists storage.objects (
      id uuid primary key default gen_random_uuid(),
      bucket_id text not null references storage.buckets(id) on delete cascade,
      name text not null, owner uuid, metadata jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now()
    );
  `);

  const files = readdirSync(cleanDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  console.log('applying', files.length, 'clean migrations');
  for (const f of files) {
    const sql = readFileSync(join(cleanDir, f), 'utf8');
    const stmts = splitSql(sql);
    try {
      await client.query('begin');
      for (const s of stmts) await client.query(s);
      await client.query('commit');
      console.log('  ok', f);
    } catch (e) {
      await client.query('rollback').catch(() => {});
      console.error('  FAIL', f, '-', e?.message);
      process.exit(2);
    }
  }
  console.log('all 31 baseline migrations applied');

  // now apply 0032
  const m32 = readFileSync(join(cleanDir, '0032_google_account_links.sql'), 'utf8');
  const stmts32 = splitSql(m32);
  console.log('applying 0032_google_account_links.sql (' + stmts32.length + ' stmts)');
  try {
    await client.query('begin');
    for (const s of stmts32) await client.query(s);
    await client.query('commit');
    console.log('  ok 0032');
  } catch (e) {
    await client.query('rollback').catch(() => {});
    console.error('  FAIL 0032 -', e?.message);
    console.error('--- first failing stmt (first 600 chars) ---');
    console.error((stmts32[0] || '').slice(0, 600));
    process.exit(3);
  }

  // basic shape checks
  const t1 = await client.query("select to_regclass('public.google_account_links') as t");
  const t2 = await client.query("select to_regclass('public.identity_link_audit_log') as t");
  const pcols = await client.query(
    "select column_name from information_schema.columns where table_schema='public' and table_name='profiles' and column_name in ('google_sub','google_email_at_link','google_linked_at') order by column_name"
  );
  const rpcs = await client.query(
    "select routine_name from information_schema.routines where routine_schema='public' and routine_name in ('record_google_signin','link_google_to_current_profile','unlink_google_account','reject_google_link') order by routine_name"
  );
  console.log('shape:');
  console.log('  google_account_links:', t1.rows[0].t);
  console.log('  identity_link_audit_log:', t2.rows[0].t);
  console.log('  profiles new cols:', pcols.rows.map(r => r.column_name));
  console.log('  RPCs:', rpcs.rows.map(r => r.routine_name));
} finally {
  if (client) await client.end().catch(() => {});
  try { await pgInstance.stop(); } catch {}
}
