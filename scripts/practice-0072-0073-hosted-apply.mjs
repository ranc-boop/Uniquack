#!/usr/bin/env node

import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import pg from "pg";

import { splitSql } from "./sql-split.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function loadLocalEnvironment() {
  const source = await readFile(resolve(root, ".env.local"), "utf8");
  for (const line of source.split(/\r?\n/)) {
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line);
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].trim().replace(/^(['"])(.*)\1$/, "$2");
  }
}

function requiredEnvironment(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

async function connect(projectRef, password) {
  const candidates = [
    { host: `db.${projectRef}.supabase.co`, port: 5432, user: "postgres" },
    {
      host: process.env.CLEAN_SUPABASE_POOLER_HOST?.trim() || "aws-0-us-west-2.pooler.supabase.com",
      port: 6543,
      user: `postgres.${projectRef}`,
    },
  ];
  let lastError;
  for (const candidate of candidates) {
    const client = new pg.Client({
      ...candidate,
      connectionTimeoutMillis: 15_000,
      database: "postgres",
      password,
      query_timeout: 45_000,
      ssl: { rejectUnauthorized: false },
    });
    try {
      await client.connect();
      return client;
    } catch (error) {
      lastError = error;
      await client.end().catch(() => undefined);
    }
  }
  throw lastError ?? new Error("No database connection candidate succeeded.");
}

async function runStatements(client, sql) {
  for (const statement of splitSql(sql)) {
    await client.query(statement);
  }
}

async function inTransaction(client, operation, { rollback = false } = {}) {
  await client.query("begin");
  try {
    await client.query("set local lock_timeout = '5s'");
    await client.query("set local statement_timeout = '40s'");
    const result = await operation();
    await client.query(rollback ? "rollback" : "commit");
    return result;
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  }
}

async function hostedMigrationState(client) {
  const result = await client.query(`
    select
      to_regclass('public.practice_progress_resets') is not null as reset_table,
      to_regclass('public.practice_ai_request_windows') is not null as admission_table,
      to_regprocedure('public.reset_my_practice_progress()') is not null as reset_rpc,
      to_regprocedure('public.claim_practice_ai_request(text)') is not null as admission_rpc,
      coalesce((
        select pg_get_functiondef(p.oid) like '%request_time timestamptz%'
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'claim_practice_ai_request'
      ), false) as admission_time_fixed
  `);
  return result.rows[0];
}

async function assertCatalog(client) {
  const result = await client.query(`
    select
      c.relname,
      c.relrowsecurity,
      has_table_privilege('authenticated', format('public.%I', c.relname), 'SELECT') as auth_select,
      has_table_privilege('authenticated', format('public.%I', c.relname), 'INSERT,UPDATE,DELETE') as auth_write,
      has_table_privilege('anon', format('public.%I', c.relname), 'SELECT,INSERT,UPDATE,DELETE') as anon_access
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in ('practice_progress_resets', 'practice_ai_request_windows')
    order by c.relname
  `);
  assert(result.rowCount === 2, "Expected both Practice security tables.");
  const admission = result.rows.find((row) => row.relname === "practice_ai_request_windows");
  const reset = result.rows.find((row) => row.relname === "practice_progress_resets");
  assert(admission?.relrowsecurity && reset?.relrowsecurity, "Both tables must have RLS enabled.");
  assert(reset.auth_select && !reset.auth_write && !reset.anon_access, "Reset marker grants are not least privilege.");
  assert(!admission.auth_select && !admission.auth_write && !admission.anon_access, "Admission counters must deny direct browser access.");

  const functions = await client.query(`
    select
      p.proname,
      p.prosecdef,
      p.proconfig,
      has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_execute,
      has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
      pg_get_functiondef(p.oid) as definition
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'reset_my_practice_progress',
        'claim_practice_ai_request',
        'list_selectable_practice_sources',
        'search_practice_questions_in_session'
      )
    order by p.proname
  `);
  assert(functions.rowCount === 4, "Expected both RPCs and both reset-aware read functions.");
  for (const row of functions.rows) {
    assert(row.auth_execute && !row.anon_execute, `${row.proname} execute grants are unsafe.`);
  }
  for (const name of ["reset_my_practice_progress", "claim_practice_ai_request"]) {
    const row = functions.rows.find((candidate) => candidate.proname === name);
    assert(row?.prosecdef, `${name} must remain SECURITY DEFINER.`);
    assert(row.proconfig?.includes("search_path=\"\"") || row.proconfig?.includes("search_path="), `${name} must fix search_path.`);
  }
  const admissionFunction = functions.rows.find((candidate) => candidate.proname === "claim_practice_ai_request");
  assert(
    /request_time timestamptz/.test(admissionFunction?.definition ?? "") &&
      !/date_trunc\('minute'[^\n]*current_time\)/.test(admissionFunction?.definition ?? ""),
    "Admission RPC is missing the 0074 timestamp correction.",
  );
  for (const name of ["list_selectable_practice_sources", "search_practice_questions_in_session"]) {
    const row = functions.rows.find((candidate) => candidate.proname === name);
    assert(!row?.prosecdef, `${name} must remain SECURITY INVOKER.`);
    assert(/practice_progress_resets/.test(row.definition) && /attempt\.created_at >/.test(row.definition), `${name} is not reset-aware.`);
  }
}

async function setAuthenticatedActor(client, userId) {
  await client.query("select set_config('request.jwt.claim.role', 'authenticated', true)");
  await client.query("select set_config('request.jwt.claim.sub', $1, true)", [userId]);
  await client.query("select set_config('request.jwt.claims', $1, true)", [
    JSON.stringify({ role: "authenticated", sub: userId }),
  ]);
  await client.query("set local role authenticated");
}

async function assertRoleRuntime(client) {
  const profile = await client.query("select id::text from public.profiles order by created_at, id limit 1");
  assert(profile.rowCount === 1, "A profile is required for rollback-only role validation.");
  const actorId = profile.rows[0].id;

  await inTransaction(client, async () => {
    await setAuthenticatedActor(client, actorId);
    const reset = await client.query("select public.reset_my_practice_progress() as reset_at");
    assert(reset.rows[0].reset_at, "Authenticated reset RPC did not return a timestamp.");
    const own = await client.query("select count(*)::int as count from public.practice_progress_resets");
    assert(own.rows[0].count === 1, "Reset marker owner cannot read their marker.");
    await client.query("select set_config('request.jwt.claim.sub', $1, true)", [randomUUID()]);
    const other = await client.query("select count(*)::int as count from public.practice_progress_resets");
    assert(other.rows[0].count === 0, "Reset marker leaked across users.");
  }, { rollback: true });

  await inTransaction(client, async () => {
    await setAuthenticatedActor(client, actorId);
    const decisions = [];
    for (let index = 0; index < 13; index += 1) {
      const result = await client.query("select allowed from public.claim_practice_ai_request('recommend')");
      decisions.push(result.rows[0].allowed);
    }
    assert(decisions.slice(0, 12).every(Boolean) && decisions[12] === false, "Recommendation admission must allow 12 requests and reject the 13th.");
  }, { rollback: true });

  await client.query("begin");
  try {
    await setAuthenticatedActor(client, actorId);
    await client.query("select * from public.practice_ai_request_windows");
    throw new Error("Authenticated role unexpectedly read admission counters directly.");
  } catch (error) {
    assert(/permission denied/i.test(error instanceof Error ? error.message : String(error)), "Direct admission-table denial returned an unexpected error.");
  } finally {
    await client.query("rollback");
  }

  await client.query("begin");
  try {
    await client.query("set local role anon");
    await client.query("select public.reset_my_practice_progress()");
    throw new Error("Anonymous role unexpectedly executed reset RPC.");
  } catch (error) {
    assert(/permission denied/i.test(error instanceof Error ? error.message : String(error)), "Anonymous reset denial returned an unexpected error.");
  } finally {
    await client.query("rollback");
  }
}

await loadLocalEnvironment();
assert(process.env.CONFIRM_PRACTICE_HOSTED_APPLY === "YES", "Set CONFIRM_PRACTICE_HOSTED_APPLY=YES to authorize hosted DDL.");
const projectRef = requiredEnvironment("DISPOSABLE_SUPABASE_PROJECT_REF");
const databasePassword = requiredEnvironment("SUPABASE_DB_PASSWORD");
const apiUrl = new URL(requiredEnvironment("NEXT_PUBLIC_SUPABASE_URL"));
assert(apiUrl.hostname.split(".")[0] === projectRef, "Configured API URL and disposable project ref do not match.");
assert(/^[a-z0-9]+$/.test(projectRef), "Project ref format is invalid.");

const [migration72, migration73, migration74] = await Promise.all([
  readFile(resolve(root, "supabase/clean-migrations/0072_practice_cycle_reset.sql"), "utf8"),
  readFile(resolve(root, "supabase/clean-migrations/0073_practice_ai_request_admission.sql"), "utf8"),
  readFile(resolve(root, "supabase/clean-migrations/0074_practice_ai_request_admission_time_fix.sql"), "utf8"),
]);
const client = await connect(projectRef, databasePassword);
try {
  const initialState = await hostedMigrationState(client);
  const baseObjects = [
    initialState.reset_table,
    initialState.admission_table,
    initialState.reset_rpc,
    initialState.admission_rpc,
  ];
  assert(
    baseObjects.every(Boolean) || baseObjects.every((value) => value === false),
    "Hosted 0072/0073 state is partial; stop for manual reconciliation.",
  );
  if (baseObjects.every((value) => value === false)) {
    await inTransaction(client, async () => runStatements(client, migration72), { rollback: true });
    console.log("PASS 0072 rollback preflight");
    await inTransaction(client, async () => runStatements(client, migration73), { rollback: true });
    console.log("PASS 0073 rollback preflight");
    await inTransaction(client, async () => runStatements(client, migration72));
    console.log("PASS 0072 hosted apply");
    await inTransaction(client, async () => runStatements(client, migration73));
    console.log("PASS 0073 hosted apply");
  } else {
    console.log("PASS existing 0072/0073 hosted state detected without replay");
  }

  if (!initialState.admission_time_fixed) {
    await inTransaction(client, async () => runStatements(client, migration74), { rollback: true });
    console.log("PASS 0074 rollback preflight");
    await inTransaction(client, async () => runStatements(client, migration74));
    console.log("PASS 0074 hosted apply");
  } else {
    console.log("PASS existing 0074 hosted correction detected without replay");
  }

  await assertCatalog(client);
  console.log("PASS post-apply catalog, RLS, and grants");
  await assertRoleRuntime(client);
  console.log("PASS rollback-only authenticated/anonymous runtime matrix");
} finally {
  await client.end().catch(() => undefined);
}
