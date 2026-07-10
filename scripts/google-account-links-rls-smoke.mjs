// Live RLS smoke for 0032_google_account_links.sql.
//
// Spins up embedded-postgres, applies the full clean-migration chain
// including 0032, then exercises the four main flow paths plus the
// RLS and trigger invariants. Runs each case as the actual user by
// switching the connection role + set_config'ing request.jwt.claim.sub
// to mimic Supabase's RLS context.
//
// temporary: true. Safe to delete.

import { readFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { createGoogleAccountLinksPostgresHarness } from './google-account-links-embedded-postgres.mjs';
import { splitSql } from './sql-split.mjs';

const here = fileURLToPath(import.meta.url);
const root = resolve(here, '..', '..');
const cleanDir = resolve(root, 'supabase/clean-migrations');

const harness = await createGoogleAccountLinksPostgresHarness('google-rls');
const { instance: pgInstance, connection } = harness;

// --- tiny test harness --------------------------------------------------

let pass = 0;
let fail = 0;
const fails = [];

function ok(name, cond, detail) {
  if (cond) {
    pass++;
    console.log('  PASS', name);
  } else {
    fail++;
    fails.push({ name, detail });
    console.log('  FAIL', name, '-', detail ?? '');
  }
}

// switch rlsClient to a specific (profile, role) context. Supabase
// uses request.jwt.claim.sub to identify the auth user. We mimic that.
async function asUser(c, profileId, role) {
  await c.query("select set_config('request.jwt.claim.role', $1, true)", [role]);
  await c.query("select set_config('request.jwt.claim.sub', $1, true)", [profileId]);
  await c.query("select set_config('request.jwt.claims', $1, true)", [
    JSON.stringify({ sub: profileId, role }),
  ]);
}

async function clearAuth(c) {
  await c.query("select set_config('request.jwt.claim.role', 'anon', true)");
  await c.query("select set_config('request.jwt.claim.sub', '', true)");
  await c.query("select set_config('request.jwt.claims', '{}', true)");
}

// --- main ---------------------------------------------------------------

let client; // bootstrap (postgres superuser) - setup + seed + rpc calls
let rlsClient; // rls_tester (non-superuser) - RLS tests
try {
  await pgInstance.initialise();
  await pgInstance.start();
  await pgInstance.createDatabase('glogin1_test').catch(() => {});

  client = new pg.Client({
    ...connection,
    database: 'glogin1_test',
  });
  await client.connect();

  const bootstrapSql = `
    create schema if not exists extensions;
    create extension if not exists pgcrypto with schema extensions;
    do $$ begin
      if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
      if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
      if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
    end $$;
    do $$ begin
      if not exists (select 1 from pg_roles where rolname='rls_tester') then
        create role rls_tester with login password 'rls_tester_pw';
      end if;
    end $$;
    grant authenticated to rls_tester;
    grant anon to rls_tester;
    create schema if not exists auth;
    create schema if not exists storage;
    grant usage on schema public to rls_tester, authenticated, anon;
    grant usage on schema auth to rls_tester, authenticated, anon;
    create table if not exists auth.users (
      id uuid primary key,
      email text unique,
      raw_user_meta_data jsonb not null default '{}'::jsonb,
      password_set boolean not null default false,
      created_at timestamptz not null default now()
    );
    create or replace function auth.uid() returns uuid
      language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
      $$;
    create or replace function auth.role() returns text
      language sql stable as $$ select current_setting('request.jwt.claim.role', true) $$;
    create or replace function auth.jwt() returns jsonb
      language sql stable as $$
        select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
      $$;
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
  `;
  await client.query('begin');
  for (const s of splitSql(bootstrapSql)) await client.query(s);
  await client.query('commit');
  // grant rls_tester access to existing + future tables in public
  await client.query(`
    grant select on all tables in schema public to rls_tester;
    grant select, insert, update on all tables in schema auth to rls_tester;
    alter default privileges in schema public grant select on tables to rls_tester;
  `);

  const files = readdirSync(cleanDir).filter((f) => f.endsWith('.sql')).sort();
  for (const f of files) {
    const sql = readFileSync(join(cleanDir, f), 'utf8');
    const stmts = splitSql(sql);
    await client.query('begin');
    for (const s of stmts) await client.query(s);
    await client.query('commit');
  }
  console.log('migrations applied:', files.length);

  // re-grant rls_tester rights on any tables created by the migrations
  await client.query(`
    grant select on all tables in schema public to rls_tester;
    grant select, insert, update on all tables in schema auth to rls_tester;
  `);

  // open a SECOND connection as the non-superuser rls_tester
  rlsClient = new pg.Client({
    host: connection.host,
    port: connection.port,
    user: 'rls_tester',
    password: 'rls_tester_pw',
    database: 'glogin1_test',
  });
  await rlsClient.connect();

  // seed a super_admin, a teacher, two students (as superuser)
  const u1 = '11111111-1111-1111-1111-111111111111';
  const u2 = '22222222-2222-2222-2222-222222222222';
  const u3 = '33333333-3333-3333-3333-333333333333';
  const u4 = '44444444-4444-4444-4444-444444444444';
  const org1 = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

  await client.query("insert into auth.users(id, email, password_set) values ($1,'admin@e.test', true),($2,'teach@e.test', true),($3,'alice@e.test', true),($4,'bob@e.test', false)", [u1, u2, u3, u4]);
  await client.query("insert into public.organizations(id,name,slug) values ($1,'Default','default')", [org1]);
  await client.query("insert into public.profiles(id,email,role,status) values ($1,'admin@e.test','super_admin','active'),($2,'teach@e.test','teacher','active'),($3,'alice@e.test','student','active'),($4,'bob@e.test','student','active')", [u1, u2, u3, u4]);

  console.log('\n=== case 1: signin_new creates profile + link + audit ===');
  await client.query('begin');
  await clearAuth(client);
  const r1 = await client.query(
    "select * from public.record_google_signin($1,$2,$3,$4,null,null)",
    ['100000000000000000001', 'carol@e.test', true, 'Bob']
  );
  const r1status = r1.rows[0].status;
  const r1profile = r1.rows[0].profile_id;
  ok('signin returns status', r1status === 'signin_new', `got ${r1status}`);
  const linkExists = await client.query(
    "select count(*)::int as n from public.google_account_links where google_sub=$1 and revoked_at is null",
    ['100000000000000000001']
  );
  ok('live link exists for new google_sub', linkExists.rows[0].n === 1);
  const profRow = await client.query("select google_sub, google_email_at_link, role from public.profiles where id=$1", [r1profile]);
  ok('trigger set profiles.google_sub', profRow.rows[0]?.google_sub === '100000000000000000001');
  ok('trigger set profiles.google_email_at_link', profRow.rows[0]?.google_email_at_link === 'carol@e.test');
  ok('new profile is student', profRow.rows[0]?.role === 'student');
  const audit1 = await client.query("select count(*)::int as n from public.identity_link_audit_log where profile_id=$1 and event_type='signin_new'", [r1profile]);
  ok('audit row written for signin_new', audit1.rows[0].n === 1);
  await client.query('commit');

  console.log('\n=== case 2: signin_existing returns same profile ===');
  await client.query('begin');
  await clearAuth(client);
  const r2 = await client.query(
    "select * from public.record_google_signin($1,$2,$3,$4,null,null)",
    ['100000000000000000001', 'carol@e.test', true, 'Bob']
  );
  ok('signin_existing status', r2.rows[0].status === 'signin_existing');
  ok('signin_existing returns same profile', r2.rows[0].profile_id === r1profile);
  await client.query('commit');

  console.log('\n=== case 3: email_collision on fresh google_sub ===');
  await client.query('begin');
  await clearAuth(client);
  const r3 = await client.query(
    "select * from public.record_google_signin($1,$2,$3,$4,null,null)",
    ['200000000000000000002', 'alice@e.test', true, 'Hacker']
  );
  ok('email_collision status', r3.rows[0].status === 'email_collision');
  ok('email_collision returns existing profile_id', r3.rows[0].profile_id === u3);
  const collAudit = await client.query("select count(*)::int as n from public.identity_link_audit_log where profile_id=$1 and event_type='link_rejected_email_collision'", [u3]);
  ok('email_collision writes audit', collAudit.rows[0].n === 1);
  await client.query('commit');

  console.log('\n=== case 4: link_google_to_current_profile ===');
  await client.query('begin');
  await asUser(client, u3, 'authenticated');
  const r4 = await client.query(
    "select * from public.link_google_to_current_profile($1,$2,$3,$4,null,null)",
    ['300000000000000000003', 'alice@e.test', true, 'Alice']
  );
  ok('link_new status', r4.rows[0].status === 'link_new');
  const aliceRow = await client.query("select google_sub, role from public.profiles where id=$1", [u3]);
  ok('trigger synced profiles.google_sub for alice', aliceRow.rows[0].google_sub === '300000000000000000003');
  const r4b = await client.query(
    "select * from public.link_google_to_current_profile($1,$2,$3,$4,null,null)",
    ['300000000000000000099', 'alice2@e.test', true, 'Alice-2']
  );
  ok('second link rejected as already_linked', r4b.rows[0].status === 'already_linked');
  await asUser(client, u4, 'authenticated');
  const r4c = await client.query(
    "select * from public.link_google_to_current_profile($1,$2,$3,$4,null,null)",
    ['300000000000000000003', 'bob@e.test', true, 'Bob']
  );
  ok('link rejected as duplicate_sub', r4c.rows[0].status === 'duplicate_sub');
  await client.query('commit');

  console.log('\n=== case 5: unlink_google_account with password (success) ===');
  await client.query('begin');
  await asUser(client, u3, 'authenticated');
  const r5 = await client.query("select * from public.unlink_google_account('1.1.1.1','ua')");
  ok('unlink_google_account status', r5.rows[0].status === 'unlinked');
  const aliceAfter = await client.query("select google_sub from public.profiles where id=$1", [u3]);
  ok('trigger cleared profiles.google_sub', aliceAfter.rows[0].google_sub === null);
  const linkAfter = await client.query("select count(*)::int as n from public.google_account_links where profile_id=$1 and revoked_at is null", [u3]);
  ok('no live link for alice', linkAfter.rows[0].n === 0);
  await client.query('commit');

  console.log('\n=== case 6: unlink_google_account blocks last identity (no password) ===');
  await client.query('begin');
  await asUser(client, u4, 'authenticated');
  const r6link = await client.query(
    "select * from public.link_google_to_current_profile($1,$2,$3,$4,null,null)",
    ['400000000000000000004', 'bob@e.test', true, 'Bob']
  );
  ok('bob can link his first google', r6link.rows[0].status === 'link_new');
  const r6unlink = await client.query("select * from public.unlink_google_account()");
  ok('bob unlink blocked last identity', r6unlink.rows[0].status === 'blocked_last_identity');
  const bobAudit = await client.query("select count(*)::int as n from public.identity_link_audit_log where profile_id=$1 and event_type='unlink_blocked_last_identity'", [u4]);
  ok('audit row written for blocked unlink', bobAudit.rows[0].n === 1);
  const bobLink = await client.query("select count(*)::int as n from public.google_account_links where profile_id=$1 and revoked_at is null", [u4]);
  ok('bob live link still present', bobLink.rows[0].n === 1);
  await client.query('commit');

  console.log('\n=== case 7: reject_google_link bypasses last identity (super_admin) ===');
  await client.query('begin');
  await asUser(client, u1, 'authenticated');
  const r7 = await client.query("select * from public.reject_google_link($1,'compliance', '9.9.9.9', 'agent')", [u4]);
  ok('admin reject status', r7.rows[0].status === 'unlinked_by_admin');
  const bobAfter = await client.query("select google_sub from public.profiles where id=$1", [u4]);
  ok('trigger cleared bob.google_sub', bobAfter.rows[0].google_sub === null);
  const rejectAudit = await client.query("select count(*)::int as n from public.identity_link_audit_log where profile_id=$1 and event_type='reject_by_admin' and is_super_admin_action=true", [u4]);
  ok('admin reject audit row written', rejectAudit.rows[0].n === 1);
  await client.query('commit');

  console.log('\n=== case 8: reject_google_link by non-super_admin ===');
  await client.query('begin');
  await asUser(client, u2, 'authenticated');
  let r8err = null;
  try {
    await client.query("select * from public.reject_google_link($1,'x')", [u3]);
  } catch (e) { r8err = e?.message; }
  ok('non-admin rejected', !!r8err && r8err.toLowerCase().includes('forbidden'), `got ${r8err}`);
  await client.query('commit');

  console.log('\n=== case 9: partial unique index on google_sub ===');
  await client.query('begin');
  await asUser(client, u3, 'authenticated');
  const r9 = await client.query(
    "select * from public.link_google_to_current_profile($1,$2,$3,$4,null,null)",
    ['400000000000000000004', 'alice@e.test', true, 'Alice']
  );
  ok('re-link same google_sub to different profile after revoke', r9.rows[0].status === 'link_new');
  const r9b = await client.query(
    "select * from public.link_google_to_current_profile($1,$2,$3,$4,null,null)",
    ['300000000000000000003', 'alice@e.test', true, 'Alice']
  );
  ok('second link attempt rejected (already_linked guard)', r9b.rows[0].status === 'already_linked');
  await client.query('commit');

  // ---------- RLS-sensitive tests use rlsClient (non-superuser) ----------

  console.log('\n=== case 10: RLS - direct insert into google_account_links blocked ===');
  await rlsClient.query('begin');
  await asUser(rlsClient, u3, 'authenticated');
  let r10err = null;
  try {
    await rlsClient.query(
      "insert into public.google_account_links(profile_id, google_sub) values ($1, $2)",
      [u3, '999999999999999999999']
    );
  } catch (e) { r10err = e?.message; }
  ok('direct insert blocked by RLS', !!r10err, `expected error, got: ${r10err}`);
  await rlsClient.query('commit');

  console.log('\n=== case 11: RLS - self can read own link, not others ===');
  await rlsClient.query('begin');
  await asUser(rlsClient, u3, 'authenticated');
  const r11a = await rlsClient.query("select count(*)::int as n from public.google_account_links");
  ok('alice sees her own links', r11a.rows[0].n >= 1, `n=${r11a.rows[0].n}`);
  const r11aAlice = await rlsClient.query(
    "select count(*)::int as n from public.google_account_links where profile_id = $1",
    [u3]
  );
  ok('alice only sees her own profile_id rows', r11aAlice.rows[0].n === r11a.rows[0].n, `alice=${r11a.rows[0].n} own=${r11aAlice.rows[0].n}`);
  await asUser(rlsClient, u4, 'authenticated');
  const r11b = await rlsClient.query("select count(*)::int as n from public.google_account_links");
  const r11bForeign = await rlsClient.query(
    "select count(*)::int as n from public.google_account_links where profile_id <> $1",
    [u4]
  );
  ok('bob does not see alice links', r11bForeign.rows[0].n === 0, `foreign=${r11bForeign.rows[0].n} visible=${r11b.rows[0].n}`);
  await rlsClient.query('commit');

  console.log('\n=== case 12: RLS - super_admin reads all links ===');
  await rlsClient.query('begin');
  await asUser(rlsClient, u1, 'authenticated');
  const r12 = await rlsClient.query("select count(*)::int as n from public.google_account_links");
  ok('super_admin sees all links', r12.rows[0].n >= 2, `n=${r12.rows[0].n}`);
  await rlsClient.query('commit');

  console.log('\n=== case 13: RLS - audit log: self sees own, not others ===');
  await rlsClient.query('begin');
  await asUser(rlsClient, u3, 'authenticated');
  const r13a = await rlsClient.query("select count(*)::int as n from public.identity_link_audit_log");
  ok('alice sees her own audit rows', r13a.rows[0].n >= 1);
  await asUser(rlsClient, u4, 'authenticated');
  const r13b = await rlsClient.query("select count(*)::int as n from public.identity_link_audit_log");
  ok('bob sees his own audit rows', r13b.rows[0].n >= 1);
  await rlsClient.query('commit');

  console.log('\n=== case 14: google_sub format check rejects non-numeric ===');
  await rlsClient.query('begin');
  await asUser(rlsClient, u4, 'authenticated');
  let r14err = null;
  try {
    await rlsClient.query(
      "select * from public.link_google_to_current_profile($1,$2,$3,$4,null,null)",
      ['not-a-google-sub', 'a@e.test', true, 'A']
    );
  } catch (e) { r14err = e?.message; }
  ok('non-numeric google_sub rejected by check', !!r14err, `expected error, got: ${r14err}`);
  await rlsClient.query('commit');

  console.log('\n=== summary ===');
  console.log('  passed:', pass);
  console.log('  failed:', fail);
  if (fail > 0) {
    console.log('--- failures ---');
    for (const f of fails) console.log('  -', f.name, ':', f.detail);
    process.exitCode = 4;
  }
} catch (e) {
  console.error('HARNESS ERROR:', e?.message ?? e);
  console.error(e?.stack);
  process.exitCode = 5;
} finally {
  if (client) await client.end().catch(() => {});
  if (rlsClient) await rlsClient.end().catch(() => {});
  await harness.cleanup();
  console.log('  teardown: embedded Postgres temp data removed');
}
