#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";
import pg from "pg";

import { splitSql } from "./sql-split.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const migrationPath = resolve(
  root,
  "supabase/clean-migrations/0076_official_public_library_two_state_approval.sql",
);
const applyGateName = "OFFICIAL_PUBLIC_LIBRARY_HOSTED_APPLY_GATE";
const applyGateValue = "AUTHORIZED_EXACTLY_ONCE";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function requiredEnvironment(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function safeError(error) {
  const code = String(error?.code || error?.name || "Error").slice(0, 80);
  const message = String(error?.message || "")
    .replace(/(?:postgres(?:ql)?:\/\/)[^\s]+/gi, "[redacted-database-url]")
    .replace(/[a-z0-9]{20}\.supabase\.co/gi, "[redacted-project].supabase.co")
    .slice(0, 320);
  return message ? `${code}: ${message}` : code;
}

async function loadEnvironment() {
  dotenv.config({ path: resolve(root, ".env.local"), override: false, quiet: true });
}

async function assertReleaseManifest() {
  const manifest = JSON.parse(
    await readFile(resolve(root, "docs/security/live-schema-manifest.json"), "utf8"),
  );
  const entry = manifest.migrationInventory?.find(
    (candidate) => candidate.filename === "0076_official_public_library_two_state_approval.sql",
  );
  const unresolvedDrift = (manifest.knownLiveDrift ?? []).filter(
    (candidate) => typeof candidate !== "object" || !candidate.ownerDecision,
  );
  assert(manifest.latestActivePrefix === 76, "Canonical manifest does not end at 0076.");
  assert(
    ["SOURCE_COMPLETE_NOT_APPLIED", "APPLIED_MANUALLY_NOT_LEDGERED"].includes(entry?.status),
    "Manifest has an unsupported 0076 release status.",
  );
  assert(unresolvedDrift.length === 0, "Live/repository reconciliation has unreviewed drift.");
  assert(
    ["COMPLETE", "PARTIALLY_CAPTURED_PROVIDER_GATEWAY_POST_0042"].includes(manifest.captureStatus),
    "Live/repository reconciliation has an unsupported capture state.",
  );
  return entry.status;
}

function validateTargetIdentity() {
  const projectRef = requiredEnvironment("DISPOSABLE_SUPABASE_PROJECT_REF");
  const databasePassword = requiredEnvironment("SUPABASE_DB_PASSWORD");
  const apiUrl = new URL(requiredEnvironment("NEXT_PUBLIC_SUPABASE_URL"));
  const serviceKey =
    process.env.CLEAN_SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    requiredEnvironment("SUPABASE_SERVICE_ROLE_KEY");

  assert(/^[a-z0-9]+$/.test(projectRef), "Disposable project ref format is invalid.");
  assert(apiUrl.protocol === "https:", "Hosted API URL must use HTTPS.");
  assert(apiUrl.hostname === `${projectRef}.supabase.co`, "API URL and disposable project ref do not match.");

  return { projectRef, databasePassword, apiUrl: apiUrl.toString(), serviceKey };
}

async function connect(projectRef, password) {
  const configuredPoolerHost =
    process.env.CLEAN_SUPABASE_POOLER_HOST?.trim() || "aws-0-us-west-2.pooler.supabase.com";
  assert(
    /(?:^|\.)pooler\.supabase\.com$/i.test(configuredPoolerHost),
    "Configured pooler host is not a Supabase pooler.",
  );
  const candidates = [
    { host: `db.${projectRef}.supabase.co`, port: 5432, user: "postgres" },
    {
      host: configuredPoolerHost,
      port: 6543,
      user: `postgres.${projectRef}`,
    },
  ];
  let lastError;
  for (const candidate of candidates) {
    const client = new pg.Client({
      ...candidate,
      database: "postgres",
      password,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 15_000,
      query_timeout: 120_000,
      application_name: "edustruct_0076_release_gate",
    });
    try {
      await client.connect();
      return client;
    } catch (error) {
      lastError = error;
      await client.end().catch(() => undefined);
    }
  }
  throw new Error(`Database connection failed (${safeError(lastError)}).`);
}

async function runStatements(client, sql) {
  for (const statement of splitSql(sql)) await client.query(statement);
}

async function beginMigrationTransaction(client) {
  await client.query("begin transaction isolation level repeatable read");
  await client.query("set local lock_timeout = '8s'");
  await client.query("set local statement_timeout = '110s'");
}

async function migrationState(client) {
  const result = await client.query(`
    select
      exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'question_banks' and column_name = 'owner_scope'
      ) as owner_scope_column,
      exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'question_banks' and column_name = 'system_key'
      ) as system_key_column,
      exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'questions' and column_name = 'approval_status'
      ) as approval_status_column,
      to_regprocedure('private.question_grading_capability_v2(uuid)') is not null as grading_helper,
      to_regprocedure('private.can_read_official_public_question_v2(uuid)') is not null as public_read_helper,
      to_regprocedure('public.search_official_public_questions_v2(text,integer,integer,integer,integer)') is not null as search_rpc,
      to_regprocedure('public.search_bank_question_rows_v2(uuid,text,text,text,text,text,integer,integer)') is not null as bank_search_rpc,
      to_regprocedure('public.count_bank_question_rows_v2(uuid,text,text,text,text,text)') is not null as bank_count_rpc,
      to_regprocedure('public.approve_library_questions_v2(uuid,uuid[])') is not null as approve_rpc,
      to_regprocedure('public.archive_library_questions_v2(uuid,uuid[])') is not null as archive_rpc,
      to_regprocedure('public.review_public_question_submission_v2(uuid,text,text,jsonb)') is not null as submission_rpc,
      to_regprocedure('public.attach_official_question_revision_assets_v2(uuid,uuid,jsonb,uuid)') is not null as revision_assets_rpc,
      to_regprocedure('public.pull_public_question_to_bank_pre_official_v2(uuid,uuid,jsonb,uuid)') is not null as pull_predecessor,
      to_regprocedure('public.create_assignment_from_bank_pre_approval_v2(uuid,uuid,text,text,timestamptz,uuid[],boolean)') is not null as assignment_predecessor,
      exists (
        select 1 from pg_trigger
        where tgrelid = 'public.questions'::regclass
          and tgname = 'questions_prevent_approved_content_update_v2'
          and not tgisinternal
      ) as immutable_content_trigger,
      to_regprocedure('public.pull_public_question_to_bank(uuid,uuid,jsonb,uuid)') is not null as pull_current,
      to_regprocedure('public.create_assignment_from_bank(uuid,uuid,text,text,timestamptz,uuid[],boolean)') is not null as assignment_current,
      to_regclass('public.practice_ai_inflight_leases') is not null as migration_0075_present
  `);
  const state = result.rows[0];
  const added = [
    state.owner_scope_column,
    state.system_key_column,
    state.approval_status_column,
    state.grading_helper,
    state.public_read_helper,
    state.search_rpc,
    state.bank_search_rpc,
    state.bank_count_rpc,
    state.approve_rpc,
    state.archive_rpc,
    state.submission_rpc,
    state.revision_assets_rpc,
    state.pull_predecessor,
    state.assignment_predecessor,
    state.immutable_content_trigger,
  ];
  const baseReady = state.migration_0075_present && state.pull_current && state.assignment_current;
  if (added.every((value) => value === false) && baseReady) return "UNAPPLIED";
  if (added.every(Boolean) && baseReady) return "APPLIED";
  return "PARTIAL_OR_WRONG_BASELINE";
}

async function capturePreservationCounts(client) {
  const result = await client.query(`
    select
      (select count(*)::bigint from public.questions) as questions,
      (select count(*)::bigint from public.assignment_items where item_type = 'question') as assignment_questions,
      (select count(distinct question_id)::bigint from public.assignment_items where item_type = 'question') as assigned_question_ids,
      (select count(*)::bigint from public.question_banks) as banks,
      (select count(*)::bigint from public.bank_questions) as memberships,
      (select count(*)::bigint from public.questions where owner_bank_id is null and deleted_at is null) as live_global_questions
  `);
  return result.rows[0];
}

async function assertCatalog(client) {
  const constraints = await client.query(`
    select conname, convalidated
    from pg_constraint
    where conrelid in ('public.question_banks'::regclass, 'public.questions'::regclass)
      and conname in (
        'question_banks_owner_scope_check',
        'question_banks_system_ownership_check',
        'question_banks_official_public_visibility_check',
        'questions_approval_status_check'
      )
  `);
  assert(constraints.rowCount === 4, "0076 constraints are incomplete.");
  assert(constraints.rows.every((row) => row.convalidated), "A 0076 constraint is not validated.");

  const indexes = await client.query(`
    select indexrelid::regclass::text as name
    from pg_index
    where indexrelid in (
      to_regclass('public.question_banks_official_public_key'),
      to_regclass('public.questions_approval_status_live_idx'),
      to_regclass('public.bank_questions_active_bank_question_idx')
      ,to_regclass('public.questions_one_pending_official_revision_v2_idx')
    )
  `);
  assert(indexes.rowCount === 4, "0076 indexes are incomplete.");

  const policies = await client.query(`
    select policyname, roles, cmd
    from pg_policies
    where schemaname = 'public'
      and policyname in (
        'question_banks_official_public_read_v2',
        'bank_questions_official_public_read_v2',
        'questions_official_public_read_v2',
        'question_rubric_steps_public_read',
        'question_assets_public_read',
        'question_taxonomy_assignments_public_read'
      )
  `);
  assert(policies.rowCount === 6, "0076 RLS policy inventory is incomplete.");
  assert(
    policies.rows.every((row) => row.cmd === "SELECT" && row.roles.includes("authenticated")),
    "An official Public Library policy has an unexpected role or command.",
  );

  const functions = await client.query(`
    select
      n.nspname,
      p.proname,
      p.prosecdef,
      p.proconfig,
      has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute,
      has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
      has_function_privilege('service_role', p.oid, 'EXECUTE') as service_execute
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where p.oid in (
      to_regprocedure('private.question_grading_capability_v2(uuid)'),
      to_regprocedure('private.can_read_official_public_question_v2(uuid)'),
      to_regprocedure('private.can_read_question(uuid)'),
      to_regprocedure('public.search_official_public_questions_v2(text,integer,integer,integer,integer)'),
      to_regprocedure('public.search_bank_question_rows_v2(uuid,text,text,text,text,text,integer,integer)'),
      to_regprocedure('public.count_bank_question_rows_v2(uuid,text,text,text,text,text)'),
      to_regprocedure('public.approve_library_questions_v2(uuid,uuid[])'),
      to_regprocedure('public.archive_library_questions_v2(uuid,uuid[])'),
      to_regprocedure('public.review_public_question_submission_v2(uuid,text,text,jsonb)'),
      to_regprocedure('public.attach_official_question_revision_assets_v2(uuid,uuid,jsonb,uuid)'),
      to_regprocedure('public.pull_public_question_to_bank(uuid,uuid,jsonb,uuid)'),
      to_regprocedure('public.create_assignment_from_bank(uuid,uuid,text,text,timestamptz,uuid[],boolean)')
    )
  `);
  assert(
    functions.rowCount === 12,
    `0076 function inventory is incomplete (${functions.rowCount}: ${functions.rows
      .map((row) => `${row.nspname}.${row.proname}`)
      .join(", ")}).`,
  );
  for (const row of functions.rows) {
    assert(row.prosecdef, `${row.nspname}.${row.proname} must be SECURITY DEFINER.`);
    assert(row.proconfig?.some((item) => item.startsWith("search_path=")), `${row.proname} must fix search_path.`);
    if (
      row.nspname === "public" &&
      !["pull_public_question_to_bank", "attach_official_question_revision_assets_v2"].includes(row.proname)
    ) {
      assert(row.authenticated_execute && !row.anon_execute, `${row.proname} grants are unsafe.`);
    }
  }
  const pull = functions.rows.find((row) => row.proname === "pull_public_question_to_bank");
  assert(
    pull?.service_execute && !pull.authenticated_execute && !pull.anon_execute,
    "Public pull must remain server-only while validating the real actor.",
  );
  const revisionAssets = functions.rows.find(
    (row) => row.proname === "attach_official_question_revision_assets_v2",
  );
  assert(
    revisionAssets?.service_execute &&
      !revisionAssets.authenticated_execute &&
      !revisionAssets.anon_execute,
    "Official revision asset finalization must remain server-only.",
  );
  const grading = functions.rows.find((row) => row.proname === "question_grading_capability_v2");
  assert(!grading.authenticated_execute && !grading.anon_execute, "Grading helper must remain internal.");
}

async function assertDataMapping(client, before) {
  const result = await client.query(`
    select
      (select count(*)::int from public.question_banks where owner_scope = 'system' and system_key = 'official_public') as official_banks,
      (select count(*)::int from public.question_banks where owner_scope <> 'system' and visibility = 'public') as non_system_public_banks,
      (select count(*)::bigint from public.questions) as questions,
      (select count(*)::bigint from public.assignment_items where item_type = 'question') as assignment_questions,
      (select count(distinct question_id)::bigint from public.assignment_items where item_type = 'question') as assigned_question_ids,
      (select count(*)::bigint from public.question_banks) as banks,
      (select count(*)::bigint from public.bank_questions) as memberships,
      (select count(*)::bigint
       from public.questions q
       where q.owner_bank_id is null and q.deleted_at is null
         and not exists (
           select 1
           from public.bank_questions bq
           join public.question_banks qb on qb.id = bq.bank_id
           where bq.question_id = q.id
             and qb.owner_scope = 'system' and qb.system_key = 'official_public'
         )) as unmapped_live_globals,
      (select count(*)::bigint
       from public.questions q
       where q.approval_status = 'approved'
         and not (
           (q.deleted_at is null and q.owner_bank_id is null and q.status = 'published' and q.visibility = 'public')
           or (q.deleted_at is null and q.owner_bank_id is not null and q.status = 'review'
             and private.question_grading_capability_v2(q.id) <> 'needs_configuration')
           or (q.deleted_at is null and q.owner_bank_id is not null and exists (
             select 1 from public.review_draft_items i
             where i.id = q.source_review_item_id and i.status = 'approved' and i.created_question_id = q.id
           ))
         )) as unexpected_approved
      ,(select count(*)::bigint
       from public.questions q
       where q.approval_status <> 'approved'
         and (
           (q.deleted_at is null and q.owner_bank_id is null and q.status = 'published' and q.visibility = 'public')
           or (q.deleted_at is null and q.owner_bank_id is not null and q.status = 'review'
             and private.question_grading_capability_v2(q.id) <> 'needs_configuration')
           or (q.deleted_at is null and q.owner_bank_id is not null and exists (
             select 1 from public.review_draft_items i
             where i.id = q.source_review_item_id and i.status = 'approved' and i.created_question_id = q.id
           ))
         )) as missing_approved
  `);
  const row = result.rows[0];
  assert(row.official_banks === 1, "Exactly one official Public Library is required.");
  assert(row.non_system_public_banks === 0, "A non-system Library remains public.");
  assert(row.unmapped_live_globals === "0", "A live global question is missing official membership.");
  assert(row.unexpected_approved === "0", "Approval backfill exceeded its evidence rules.");
  assert(row.missing_approved === "0", "Approval backfill missed an evidence-backed question.");
  assert(row.questions === before.questions, "Question count changed during 0076.");
  assert(row.assignment_questions === before.assignment_questions, "Assignment question rows changed during 0076.");
  assert(row.assigned_question_ids === before.assigned_question_ids, "Assigned question identity changed during 0076.");
  assert(BigInt(row.banks) === BigInt(before.banks) + 1n, "0076 must add exactly one system Library.");
  assert(
    BigInt(row.memberships) >= BigInt(before.memberships) + BigInt(before.live_global_questions),
    "Official membership backfill did not preserve all live global questions.",
  );
}

async function assertAppliedDataIntegrity(client) {
  const result = await client.query(`
    select
      (select count(*)::int from public.question_banks where owner_scope = 'system' and system_key = 'official_public') as official_banks,
      (select count(*)::int from public.question_banks where owner_scope <> 'system' and visibility = 'public') as non_system_public_banks,
      (select count(*)::bigint
       from public.questions q
       where q.owner_bank_id is null and q.deleted_at is null
         and not exists (
           select 1
           from public.bank_questions bq
           join public.question_banks qb on qb.id = bq.bank_id
           where bq.question_id = q.id
             and qb.owner_scope = 'system' and qb.system_key = 'official_public'
         )) as unmapped_live_globals,
      (select count(*)::bigint
       from public.assignment_items aq
       left join public.questions q on q.id = aq.question_id
       where aq.item_type = 'question' and q.id is null) as broken_assignment_question_refs,
      (select count(*)::bigint
       from public.bank_questions bq
       join public.question_banks qb on qb.id = bq.bank_id
       join public.questions q on q.id = bq.question_id
       where qb.owner_scope = 'system' and qb.system_key = 'official_public'
         and bq.status = 'active' and q.approval_status = 'approved'
         and q.deleted_at is null) as official_approved_questions,
      (select count(*)::bigint
       from public.bank_questions bq
       join public.question_banks qb on qb.id = bq.bank_id
       join public.questions q on q.id = bq.question_id
       where qb.owner_scope = 'system' and qb.system_key = 'official_public'
         and bq.status = 'active' and q.approval_status = 'pending'
         and q.deleted_at is null) as official_pending_questions,
      (select count(*)::bigint
       from public.questions q
       where q.approval_status = 'approved'
         and not (
           (q.deleted_at is null and q.owner_bank_id is null and q.status = 'published' and q.visibility = 'public')
           or (q.deleted_at is null and q.owner_bank_id is not null and q.status = 'review'
             and private.question_grading_capability_v2(q.id) <> 'needs_configuration')
           or (q.deleted_at is null and q.owner_bank_id is not null and exists (
             select 1 from public.review_draft_items i
             where i.id = q.source_review_item_id and i.status = 'approved' and i.created_question_id = q.id
           ))
         )) as unexpected_approved
  `);
  const row = result.rows[0];
  assert(row.official_banks === 1, "Exactly one official Public Library is required.");
  assert(row.non_system_public_banks === 0, "A non-system Library remains public.");
  assert(row.unmapped_live_globals === "0", "A live global question is missing official membership.");
  assert(row.broken_assignment_question_refs === "0", "An Assignment question reference is broken.");
  assert(row.unexpected_approved === "0", "Approval backfill exceeded its evidence rules.");
  return row;
}

async function setActor(client, actorId) {
  await client.query("select set_config('request.jwt.claim.role', 'authenticated', true)");
  await client.query("select set_config('request.jwt.claim.sub', $1, true)", [actorId]);
  await client.query("select set_config('request.jwt.claims', $1, true)", [
    JSON.stringify({ role: "authenticated", sub: actorId }),
  ]);
  await client.query("set local role authenticated");
}

async function beginRoleScope(client, name, useSavepoints) {
  if (useSavepoints) {
    await client.query(`savepoint ${name}`);
  } else {
    await client.query("begin");
  }
}

async function rollbackRoleScope(client, name, useSavepoints) {
  if (useSavepoints) {
    await client.query(`rollback to savepoint ${name}`);
    await client.query(`release savepoint ${name}`);
  } else {
    await client.query("rollback");
  }
}

async function assertRollbackOnlyRoleMatrix(client, { useSavepoints = false } = {}) {
  const actors = await client.query(`
    select distinct on (role) role, id
    from public.profiles
    where role in ('student', 'teacher', 'admin', 'super_admin') and status = 'active'
    order by role, created_at, id
  `);
  assert(actors.rowCount === 4, "Active student, teacher, admin, and super_admin profiles are required.");
  const resultSets = [];
  for (const [index, actor] of actors.rows.entries()) {
    const scopeName = `role_actor_${index}`;
    await beginRoleScope(client, scopeName, useSavepoints);
    try {
      await setActor(client, actor.id);
      const result = await client.query(`
        select question_id::text
        from public.search_official_public_questions_v2(null, null, null, 100, 0)
        order by question_id
      `);
      resultSets.push(result.rows.map((row) => row.question_id));
    } finally {
      await rollbackRoleScope(client, scopeName, useSavepoints);
    }
  }
  const canonical = JSON.stringify(resultSets[0]);
  assert(resultSets.every((ids) => JSON.stringify(ids) === canonical), "Workspace roles see different official question IDs.");

  const anonScope = "role_anon";
  await beginRoleScope(client, anonScope, useSavepoints);
  try {
    await client.query("set local role anon");
    await client.query("select * from public.search_official_public_questions_v2(null, null, null, 1, 0)");
    throw new Error("Anonymous role unexpectedly executed official search.");
  } catch (error) {
    assert(/permission denied/i.test(String(error?.message)), "Anonymous denial returned an unexpected error.");
  } finally {
    await rollbackRoleScope(client, anonScope, useSavepoints);
  }
  return resultSets[0].length;
}

async function dataApiSchemaCacheProbe(apiUrl, serviceKey) {
  const headers = {
    apikey: serviceKey,
    "content-type": "application/json",
  };
  if (serviceKey.split(".").length === 3) headers.authorization = `Bearer ${serviceKey}`;
  const response = await fetch(`${apiUrl}rest/v1/rpc/search_official_public_questions_v2`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      query_text: null,
      difficulty_min: null,
      difficulty_max: null,
      page_limit: 1,
      page_offset: 0,
    }),
  });
  const body = await response.text();
  assert(!body.includes("PGRST202") && !/schema cache.*function/i.test(body), "Data API schema cache has not discovered the v2 RPC.");
  assert(response.status !== 404, "Data API v2 RPC route was not found.");
}

await loadEnvironment();
const manifestStatus = await assertReleaseManifest();
const target = validateTargetIdentity();
const migrationSql = await readFile(migrationPath, "utf8");
const client = await connect(target.projectRef, target.databasePassword);

try {
  const initialState = await migrationState(client);
  assert(initialState !== "PARTIAL_OR_WRONG_BASELINE", "0076 target is partial or its 0075 baseline is incomplete; stop for reconciliation.");
  assert(
    initialState !== "UNAPPLIED" || manifestStatus === "SOURCE_COMPLETE_NOT_APPLIED",
    "The database is unapplied but the manifest claims 0076 was applied.",
  );

  if (initialState === "APPLIED") {
    await assertCatalog(client);
    const appliedSummary = await assertAppliedDataIntegrity(client);
    const publicRoleQuestionCount = await assertRollbackOnlyRoleMatrix(client);
    await dataApiSchemaCacheProbe(target.apiUrl, target.serviceKey);
    console.log("PASS existing 0076 state, catalog, role matrix, and Data API schema cache");
    console.log(
      `EVIDENCE official approved=${appliedSummary.official_approved_questions}, pending=${appliedSummary.official_pending_questions}, broken Assignment refs=${appliedSummary.broken_assignment_question_refs}`,
    );
    console.log(`EVIDENCE identical official IDs across 4 roles=${publicRoleQuestionCount}`);
    process.exitCode = 0;
  } else {
    const before = await capturePreservationCounts(client);

    await beginMigrationTransaction(client);
    try {
      await runStatements(client, migrationSql);
      assert((await migrationState(client)) === "APPLIED", "0076 rollback preflight did not reach a complete state.");
      await assertCatalog(client);
      await assertDataMapping(client, before);
      await assertRollbackOnlyRoleMatrix(client, { useSavepoints: true });
      await client.query("rollback");
      console.log("PASS 0076 rollback preflight, catalog, grants, data preservation, and role matrix");
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw error;
    }

    if (process.argv.includes("--preflight")) {
      console.log("PASS preflight-only mode completed without hosted commit");
      process.exitCode = 0;
    } else if (process.env[applyGateName] !== applyGateValue) {
      console.log(`STOP hosted commit requires ${applyGateName}=${applyGateValue}`);
      process.exitCode = 2;
    } else {
      assert((await migrationState(client)) === "UNAPPLIED", "Target changed after rollback preflight.");
      await beginMigrationTransaction(client);
      try {
        await runStatements(client, migrationSql);
        assert((await migrationState(client)) === "APPLIED", "0076 apply did not reach a complete state.");
        await assertCatalog(client);
        await assertDataMapping(client, before);
        await client.query("commit");
      } catch (error) {
        await client.query("rollback").catch(() => undefined);
        throw error;
      }
      await assertRollbackOnlyRoleMatrix(client);
      await dataApiSchemaCacheProbe(target.apiUrl, target.serviceKey);
      console.log("PASS 0076 hosted apply, post-commit role matrix, and Data API schema cache");
    }
  }
} catch (error) {
  console.error(`FAIL official Public Library 0076 release gate (${safeError(error)}).`);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => undefined);
}
