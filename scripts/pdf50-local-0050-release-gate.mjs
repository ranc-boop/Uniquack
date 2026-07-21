import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

import pg from "pg";

import {
  loadCanonicalMigrationPlan,
  migrationNumber,
} from "./lib/canonical-migration-plan.mjs";

const { Client } = pg;
const root = resolve(import.meta.dirname, "..");
const requiredGate = "CONFIRMED";
const expectedBranch = "codex/pdf50-burst-clean-db-rehearsal";
const requiredMergeCommit = "093dbc3";
const localHosts = new Set(["127.0.0.1", "localhost"]);
const practice0049 = "0049_practice_agent_provider_routing.sql";
const pdf500050 = "0050_pdf50_burst_upload_admission.sql";
const executable0032 = "0032_teacher_feedback_notes.sql";
const excluded0032 = "0032_google_account_links.sql";
const legacyUnmappedNames = [
  "fix_private_schema_function_grants_for_rls",
  "fix_taxonomy_closure_rebuild_safe_delete",
];
const legacyPolicyNames = [
  "ai_import_sources_admin_upload",
  "ai_import_sources_admin_read",
  "ai_import_sources_admin_delete",
];
const canonicalPolicyNames = [
  "ai_import_sources_reserved_upload",
  "ai_import_sources_manager_read",
  "ai_import_sources_manager_delete",
];
const allowedEnvNames = new Set([
  "PDF50_LOCAL_CLONE_REHEARSAL",
  "PDF50_LOCALHOST_ONLY",
  "PDF50_LOCAL_DATABASE_URL",
  "PDF50_LOCAL_API_URL",
  "PDF50_LOCAL_SUPABASE_DIR",
]);
const forbiddenEnvNamePattern =
  /^(PDF50_|SUPABASE|DATABASE_URL|DIRECT_URL|POSTGRES|PG|NEXT_PUBLIC_SUPABASE|SUPABASE_)/;
const forbiddenValuePattern = /supabase\.co|pooler\.supabase\.com|https?:\/\/(?!localhost(?::|\/|$)|127\.0\.0\.1(?::|\/|$))[^/\s]+/i;
const providerEnvNamePattern = /(?:GEMINI|VERTEX|DEEPSEEK|OCR|EMBEDDING|EMBEDDINGS|OPENAI_API_KEY|ANTHROPIC_API_KEY|GOOGLE_APPLICATION_CREDENTIALS)/i;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function safeError(error) {
  return String(error?.code || error?.name || "Error").slice(0, 80);
}

function sha256Json(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function sortedRows(rows) {
  return rows
    .map((row) => Object.fromEntries(Object.entries(row).sort(([left], [right]) => left.localeCompare(right))))
    .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
}

function git(args) {
  return execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function docker(args, input = undefined) {
  return execFileSync("docker", args, {
    cwd: root,
    encoding: "utf8",
    input,
    stdio: input == null ? ["ignore", "pipe", "pipe"] : ["pipe", "pipe", "pipe"],
  }).trim();
}

function gitIsAncestor(commit) {
  try {
    execFileSync("git", ["merge-base", "--is-ancestor", commit, "HEAD"], {
      cwd: root,
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

function parseLocalUrl(name, protocols, requiredPort = null) {
  const raw = process.env[name];
  assert(raw, `${name} is required.`);
  assert(!forbiddenValuePattern.test(raw), `${name} must be localhost-only.`);
  const url = new URL(raw);
  assert(protocols.includes(url.protocol), `${name} has an unsupported protocol.`);
  assert(localHosts.has(url.hostname), `${name} must use localhost or 127.0.0.1.`);
  if (requiredPort) assert(url.port === requiredPort, `${name} must target port ${requiredPort}.`);
  return url;
}

function validateEnvironment() {
  assert(process.env.PDF50_LOCAL_CLONE_REHEARSAL === requiredGate, "PDF50_LOCAL_CLONE_REHEARSAL must be CONFIRMED.");
  assert(process.env.PDF50_LOCALHOST_ONLY === requiredGate, "PDF50_LOCALHOST_ONLY must be CONFIRMED.");
  assert(process.env.PDF50_LOCAL_SUPABASE_DIR, "PDF50_LOCAL_SUPABASE_DIR is required.");

  for (const [name, value] of Object.entries(process.env)) {
    if (allowedEnvNames.has(name)) continue;
    if (forbiddenEnvNamePattern.test(name)) throw new Error("Forbidden database/API environment variable is present.");
    if (forbiddenValuePattern.test(value ?? "")) throw new Error("Forbidden non-localhost environment value is present.");
    if (providerEnvNamePattern.test(name) && value) throw new Error("Provider access environment variable is present.");
  }

  const databaseUrl = parseLocalUrl("PDF50_LOCAL_DATABASE_URL", ["postgres:", "postgresql:"], "54322");
  const apiUrl = parseLocalUrl("PDF50_LOCAL_API_URL", ["http:", "https:"]);
  return {
    databaseUrl: databaseUrl.toString(),
    apiUrl: apiUrl.toString(),
    proof: {
      gatesConfirmed: true,
      databaseHostLocal: true,
      databasePort54322: true,
      apiHostLocal: true,
      remoteEnvironmentPresent: false,
      providerEnvironmentPresent: false,
    },
  };
}

function verifyLocalContainers() {
  const names = docker(["ps", "--format", "{{.Names}}"]).split(/\r?\n/);
  const dbRunning = names.includes("supabase_db_o2i_pdf50_local_rehearsal");
  const apiRunning = names.includes("supabase_kong_o2i_pdf50_local_rehearsal");
  assert(dbRunning && apiRunning, "Local Supabase containers are not running.");
  return true;
}

function verifyGitAndPlan(plan) {
  const branch = git(["branch", "--show-current"]);
  const head = git(["rev-parse", "HEAD"]);
  const status = git(["status", "--porcelain=v1"]);
  const allowedDirty = status
    .split(/\r?\n/)
    .filter(Boolean)
    .every((line) => {
      const path = line.replace(/^[? MARCUD!]{1,2}\s+/, "").replaceAll("\\", "/");
      return /^(scripts\/pdf50-local-0050-release-gate\.mjs|scripts\/pdf50-local-fresh-chain-0050-gate\.mjs|scripts\/pdf50-local-0050-upgrade-rehearsal\.mjs|scripts\/pdf50-clone-history-repair\.mjs|docs\/security\/pdf50-local-fresh-chain-0050-evidence\.md|docs\/security\/pdf50-local-0049-0050-upgrade-evidence\.md|docs\/security\/pdf50-local-0050-bucket-adoption-evidence\.md|docs\/security\/pdf50-local-fresh-chain-0049-evidence\.md|docs\/security\/pdf50-local-0049-upgrade-evidence\.md|docs\/security\/pdf50-local-rls-storage-admission-evidence\.md|docs\/security\/pdf50-local-clone-history-reconciliation-evidence\.md|docs\/security\/migration-application-register\.md|docs\/security\/live-schema-manifest\.json|docs\/security\/canonical-migration-governance-through-0050\.md)$/.test(path);
    });

  assert(branch === expectedBranch, "Unexpected branch.");
  assert(gitIsAncestor(requiredMergeCommit), "Required merge commit 093dbc3 is not in HEAD history.");
  assert(status.length === 0 || allowedDirty, "Working tree has unexpected local changes.");
  assert(plan.executableMigrationNames.length === 50, "activeApplyPlan must contain exactly 50 executable migrations.");
  assert(plan.executableMigrationNames[31] === executable0032, "Executable 0032 must be teacher feedback notes.");
  assert(plan.blockedMigrationNames.includes(excluded0032), "Google account links 0032 must remain excluded.");
  assert(!plan.executableMigrationNames.includes(excluded0032), "Excluded Google 0032 cannot be executable.");
  assert(plan.executableMigrationNames.at(-2) === practice0049, "Practice routing must be canonical 0049.");
  assert(plan.executableMigrationNames.at(-1) === pdf500050, "PDF50 must be canonical 0050.");
  assert(plan.manifest.latestActivePrefix === 50, "Canonical head must be 0050.");
  assert(!plan.directoryMigrationNames.some((name) => name.startsWith("0051_")), "No 0051 migration may exist.");

  return {
    branch,
    head,
    mergeCommitPresent: true,
    worktreeClean: status.length === 0,
    activeApplyPlanCount: plan.executableMigrationNames.length,
    canonicalTail: plan.executableMigrationNames.slice(-3),
    executable0032,
    excluded0032,
    canonicalHead: pdf500050,
    no0051: true,
  };
}

async function connect(databaseUrl) {
  const client = new Client({
    connectionString: databaseUrl,
    connectionTimeoutMillis: 5000,
    query_timeout: 180000,
  });
  await client.connect();
  await client.query("set statement_timeout = '180s'");
  await client.query("set lock_timeout = '20s'");
  return client;
}

async function one(client, sql, params = []) {
  return (await client.query(sql, params)).rows[0];
}

async function all(client, sql, params = []) {
  return (await client.query(sql, params)).rows;
}

function resetLocalDatabase() {
  console.log("LOCALHOST_TARGET_CONFIRMED");
  const resetSql = `
    begin;
      do $$
      declare
        policy_record record;
      begin
        for policy_record in
          select pol.polname
          from pg_policy pol
          join pg_class cls on cls.oid = pol.polrelid
          join pg_namespace ns on ns.oid = cls.relnamespace
          where ns.nspname = 'storage' and cls.relname = 'objects'
        loop
          execute format('drop policy if exists %I on storage.objects', policy_record.polname);
        end loop;
      end
      $$;

      drop schema if exists public cascade;
      create schema public authorization postgres;
      grant usage on schema public to postgres, anon, authenticated, service_role;
      grant all on schema public to postgres, service_role;
      alter default privileges for role postgres in schema public grant all on tables to postgres, anon, authenticated, service_role;
      alter default privileges for role postgres in schema public grant all on functions to postgres, anon, authenticated, service_role;
      alter default privileges for role postgres in schema public grant all on sequences to postgres, anon, authenticated, service_role;

      drop schema if exists private cascade;
      truncate table auth.users cascade;
      alter table storage.objects disable trigger user;
      alter table storage.buckets disable trigger user;
      truncate table storage.objects cascade;
      delete from storage.buckets;
      alter table storage.buckets enable trigger user;
      alter table storage.objects enable trigger user;

      drop schema if exists supabase_migrations cascade;
      create schema supabase_migrations authorization postgres;
      create table supabase_migrations.schema_migrations (
        version text primary key,
        statements text[],
        name text
      );
      alter table supabase_migrations.schema_migrations owner to postgres;
      grant all on table supabase_migrations.schema_migrations to postgres;
    commit;
  `;
  docker([
    "exec",
    "-i",
    "supabase_db_o2i_pdf50_local_rehearsal",
    "psql",
    "-U",
    "supabase_admin",
    "-d",
    "postgres",
    "-v",
    "ON_ERROR_STOP=1",
    "-q",
  ], resetSql);
}

async function reloadPostgrest(client) {
  await client.query("notify pgrst, 'reload schema'");
  await new Promise((resolveSleep) => {
    setTimeout(resolveSleep, 500);
  });
}

async function applyMigration(client, plan, filename) {
  const version = String(migrationNumber(filename)).padStart(4, "0");
  const sql = await readFile(resolve(plan.cleanDirectory, filename), "utf8");
  await client.query("begin");
  try {
    await client.query(sql);
    await client.query(
      "insert into supabase_migrations.schema_migrations(version, statements, name) values ($1, $2, $3)",
      [version, [], filename],
    );
    await client.query("commit");
    return { version, name: filename };
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    error.message = `migration_${version}_failed:${error.message}`;
    throw error;
  }
}

async function applyCanonicalThrough(client, plan, maxNumber) {
  const applied = [];
  for (const filename of plan.executableMigrationNames.filter((name) => migrationNumber(name) <= maxNumber)) {
    applied.push(await applyMigration(client, plan, filename));
  }
  await reloadPostgrest(client);
  return {
    appliedCount: applied.length,
    firstApplied: applied[0]?.name ?? null,
    lastApplied: applied.at(-1)?.name ?? null,
  };
}

async function rewriteMixedCloneHistory(client) {
  const legacyNames = (await readdir(resolve(root, "supabase/migrations")))
    .filter((name) => name.endsWith(".sql"))
    .sort();
  const legacyByPrefix = new Map();
  for (const name of legacyNames) {
    const prefix = /^(\d{4})_/.exec(name)?.[1];
    if (prefix) legacyByPrefix.set(prefix, name);
  }

  await client.query("begin");
  try {
    await client.query("delete from supabase_migrations.schema_migrations");
    for (let number = 1; number <= 19; number += 1) {
      const version = String(number).padStart(4, "0");
      const legacyName = legacyByPrefix.get(version);
      assert(legacyName, `Missing legacy alias for ${version}.`);
      await client.query(
        "insert into supabase_migrations.schema_migrations(version, statements, name) values ($1, $2, $3)",
        [version, [], legacyName],
      );
    }
    for (const name of legacyUnmappedNames) {
      const legacyFile = legacyNames.find((candidate) => candidate.includes(name));
      assert(legacyFile, `Missing unmapped legacy file for ${name}.`);
      const version = /^(\d{14})_/.exec(legacyFile)?.[1] ?? name;
      await client.query(
        "insert into supabase_migrations.schema_migrations(version, statements, name) values ($1, $2, $3)",
        [version, [], name],
      );
    }
    await client.query("commit");
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  }

  const history = await collectHistory(client);
  assert(history.totalRows === 21, "Mixed clone history must contain 21 rows before repair.");
  assert(history.canonicalCount === 19, "Mixed clone history must contain 19 canonical alias rows.");
  assert(history.unmappedCount === 2, "Mixed clone history must preserve two unmapped rows.");
  assert(history.pendingCanonical.length === 31, "Mixed clone history must leave 0020-0050 pending.");
  return history;
}

async function collectHistory(client) {
  const rows = await all(
    client,
    "select version::text, name::text from supabase_migrations.schema_migrations order by version, name nulls first",
  );
  const canonicalVersions = rows.filter((row) => /^\d{4}$/.test(row.version));
  const canonicalSet = new Set(canonicalVersions.map((row) => row.version));
  const expected = Array.from({ length: 50 }, (_, index) => String(index + 1).padStart(4, "0"));
  const duplicates = [...expected].filter((version) => rows.filter((row) => row.version === version).length > 1);
  const unmappedRows = rows.filter((row) => legacyUnmappedNames.includes(row.name));
  return {
    hash: sha256Json(sortedRows(rows)),
    totalRows: rows.length,
    canonicalCount: canonicalVersions.length,
    canonicalHead: canonicalVersions.map((row) => row.version).sort().at(-1) ?? null,
    canonical0049Count: rows.filter((row) => row.version === "0049" && row.name === practice0049).length,
    canonical0050Count: rows.filter((row) => row.version === "0050" && row.name === pdf500050).length,
    duplicateCanonicalCount: duplicates.length,
    unmappedCount: unmappedRows.length,
    unmappedRowsPreserved: legacyUnmappedNames.every((name) => unmappedRows.some((row) => row.name === name)),
    pendingCanonical: expected.filter((version) => !canonicalSet.has(version)),
  };
}

async function collectBucket(client) {
  const bucketRows = await all(
    client,
    "select id, name, public, file_size_limit, allowed_mime_types::text, created_at::text from storage.buckets where id = 'ai-import-sources' order by id",
  );
  const policies = await all(
    client,
    `select p.policyname, p.cmd, p.roles::text as roles,
            pg_get_expr(po.polqual, po.polrelid, true) as using_expression,
            pg_get_expr(po.polwithcheck, po.polrelid, true) as check_expression
     from pg_policies p
     join pg_policy po on po.polname = p.policyname
     join pg_class c on c.oid = po.polrelid and c.relname = p.tablename
     join pg_namespace n on n.oid = c.relnamespace and n.nspname = p.schemaname
     where p.schemaname = 'storage' and p.tablename = 'objects'
       and (
         p.policyname like 'ai_import_sources_%'
         or coalesce(pg_get_expr(po.polqual, po.polrelid, true), '') ilike '%ai-import-sources%'
         or coalesce(pg_get_expr(po.polwithcheck, po.polrelid, true), '') ilike '%ai-import-sources%'
       )
     order by p.policyname`,
  );
  const objectCount = Number((await one(
    client,
    "select count(*)::int as count from storage.objects where bucket_id = 'ai-import-sources'",
  )).count);
  const bucket = bucketRows[0] ?? null;
  const policyNames = policies.map((policy) => policy.policyname).sort();
  return {
    hash: sha256Json({ bucketRows: sortedRows(bucketRows), policies: sortedRows(policies), objectCount }),
    identityHash: sha256Json(bucket ? {
      id: bucket.id,
      name: bucket.name,
      createdAt: bucket.created_at,
    } : null),
    exists: Boolean(bucket),
    identityOk: Boolean(bucket && bucket.id === "ai-import-sources" && bucket.name === "ai-import-sources"),
    private: Boolean(bucket && bucket.public === false),
    pdfOnly: Boolean(bucket && bucket.allowed_mime_types === "{application/pdf}"),
    sizeLimitBytes: bucket?.file_size_limit == null ? null : Number(bucket.file_size_limit),
    objectCount,
    policyNames,
    legacyPolicyCount: policyNames.filter((name) => legacyPolicyNames.includes(name)).length,
    canonicalPolicyCount: policyNames.filter((name) => canonicalPolicyNames.includes(name)).length,
    unknownBucketTargetingPolicyCount: policies.filter((policy) => ![
      ...legacyPolicyNames,
      ...canonicalPolicyNames,
    ].includes(policy.policyname)).length,
    anonymousOrPublicPolicyCount: policies.filter((policy) => /\b(?:anon|public)\b/i.test(policy.roles)).length,
  };
}

async function collectSchema0050(client) {
  const row = await one(
    client,
    `select
      (select count(*)::int
       from information_schema.tables
       where table_schema = 'public'
         and table_name in ('ai_pdf_upload_bursts', 'ai_pdf_upload_burst_items')
         and table_type = 'BASE TABLE') as table_count,
      (select count(*)::int
       from information_schema.columns
       where table_schema = 'public'
         and table_name in ('ai_pdf_upload_bursts', 'ai_pdf_upload_burst_items')) as column_count,
      (select count(*)::int
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where (n.nspname, p.proname) in (
         ('private','can_actor_manage_ai_pdf_burst_bank'),
         ('private','protect_ai_pdf_upload_burst_identity'),
         ('private','protect_ai_pdf_upload_burst_item_identity'),
         ('private','refresh_ai_pdf_upload_burst'),
         ('private','refresh_ai_pdf_upload_burst_from_item'),
         ('private','sync_ai_pdf_burst_item_from_job'),
         ('public','reserve_ai_pdf_upload_burst'),
         ('public','release_ai_pdf_burst_admission_jobs'),
         ('public','cancel_ai_pdf_upload_burst_items'),
         ('private','can_manage_ai_import_source_object'),
         ('private','can_upload_reserved_ai_import_source_object'),
         ('private','can_write_question_asset_storage_object'),
         ('private','can_read_question_asset_storage_object')
       )) as function_count,
      (select count(distinct trigger_name)::int
       from information_schema.triggers
       where trigger_name in (
         'ai_pdf_upload_bursts_set_updated_at',
         'ai_pdf_upload_burst_items_set_updated_at',
         'ai_pdf_upload_bursts_protect_identity',
         'ai_pdf_upload_burst_items_protect_identity',
         'ai_pdf_upload_burst_items_refresh_parent',
         'ai_provider_jobs_sync_pdf_burst_item'
       )) as trigger_count,
      (select count(*)::int
       from pg_indexes
       where schemaname = 'public'
         and indexname in (
           'ai_pdf_upload_bursts_bank_created_idx',
           'ai_pdf_upload_bursts_org_status_idx',
           'ai_pdf_upload_burst_items_admission_idx',
           'ai_pdf_upload_burst_items_burst_idx'
         )) as index_count,
      (select count(*)::int
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public'
         and c.relname in ('ai_pdf_upload_bursts', 'ai_pdf_upload_burst_items')
         and c.relrowsecurity) as rls_count,
      (select count(*)::int
       from pg_policies
       where (schemaname = 'public' and tablename in ('ai_pdf_upload_bursts', 'ai_pdf_upload_burst_items'))
          or (schemaname = 'storage' and tablename = 'objects' and policyname like 'ai_import_sources_%')) as policy_count`,
  );
  return {
    tableCount: Number(row.table_count),
    columnCount: Number(row.column_count),
    functionCount: Number(row.function_count),
    triggerCount: Number(row.trigger_count),
    indexCount: Number(row.index_count),
    rlsCount: Number(row.rls_count),
    policyCount: Number(row.policy_count),
  };
}

async function collectPractice0049(client) {
  const constraints = await all(
    client,
    `select conname, pg_get_constraintdef(oid) as definition
     from pg_constraint
     where conname in (
       'ai_provider_routing_policies_operation_kind_check',
       'ai_provider_runtime_states_operation_kind_check'
     )
     order by conname`,
  );
  const functions = await all(
    client,
    `select n.nspname as schema_name, p.proname, pg_get_functiondef(p.oid) as definition
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
     where (n.nspname, p.proname) in (
       ('public','upsert_ai_provider_routing_policy_for_gateway'),
       ('public','list_ai_provider_runtime_states_for_worker'),
       ('public','record_ai_provider_route_outcome')
     )
     order by n.nspname, p.proname`,
  );
  const everyConstraintAllowsPractice = constraints.length === 2
    && constraints.every((row) => row.definition.includes("practice_generation"));
  const everyFunctionAllowsPractice = functions.length === 3
    && functions.every((row) => row.definition.includes("practice_generation"));
  return {
    routingConstraintCount: constraints.length,
    functionCount: functions.length,
    practiceGenerationAllowedInConstraints: everyConstraintAllowsPractice,
    practiceGenerationAllowedInRouterFunctions: everyFunctionAllowsPractice,
    noProviderCalls: true,
  };
}

async function createCompatibleLegacyBucket(client, { includeUnknownPolicy = false } = {}) {
  await client.query(`
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('ai-import-sources', 'ai-import-sources', false, 52428800, array['application/pdf'])
  `);
  await client.query(`
    create policy ai_import_sources_admin_upload
    on storage.objects for insert
    to authenticated
    with check (bucket_id = 'ai-import-sources' and private.is_admin())
  `);
  await client.query(`
    create policy ai_import_sources_admin_read
    on storage.objects for select
    to authenticated
    using (bucket_id = 'ai-import-sources' and private.is_admin())
  `);
  await client.query(`
    create policy ai_import_sources_admin_delete
    on storage.objects for delete
    to authenticated
    using (bucket_id = 'ai-import-sources' and private.is_admin())
  `);
  if (includeUnknownPolicy) {
    await client.query(`
      create policy ai_import_sources_unreviewed_extra
      on storage.objects for select
      to authenticated
      using (bucket_id = 'ai-import-sources')
    `);
  }
}

async function attempt0050WithUnknownPolicy(client, plan) {
  const beforeHistory = await collectHistory(client);
  const beforeBucket = await collectBucket(client);
  let failedClosed = false;
  let safeErrorType = null;
  await client.query("begin");
  try {
    const sql = await readFile(resolve(plan.cleanDirectory, pdf500050), "utf8");
    await client.query(sql);
    await client.query(
      "insert into supabase_migrations.schema_migrations(version, statements, name) values ($1, $2, $3)",
      ["0050", [], pdf500050],
    );
    await client.query("commit");
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    failedClosed = true;
    safeErrorType = safeError(error);
  }
  const afterHistory = await collectHistory(client);
  const afterBucket = await collectBucket(client);
  return {
    unknownPolicyFailedClosed: failedClosed,
    safeErrorType,
    historyUnchanged: beforeHistory.hash === afterHistory.hash,
    bucketUnchanged: beforeBucket.hash === afterBucket.hash,
    canonical0050AbsentAfterRollback: afterHistory.canonical0050Count === 0,
  };
}

async function runScenarioA() {
  console.log("LOCALHOST_TARGET_CONFIRMED");
  const output = runNode("scripts/pdf50-local-fresh-chain-0050-gate.mjs");
  assert(output.finalClassification === "LOCAL_FRESH_CHAIN_0001_0050_VALIDATED", "Scenario A fresh-chain gate failed.");
  return {
    classification: "PDF50_0050_FRESH_CHAIN_VALIDATED",
    freshGateClassification: output.finalClassification,
    appliedCount: output.evidence.apply.appliedCount,
    canonicalHead: output.evidence.history.canonicalHead,
    pendingCanonicalCount: output.evidence.history.pendingCanonicalCount,
    secondRunnerPass: output.evidence.secondRunnerPass,
    bucketCreate: output.evidence.bucketCreate,
    schema0050: output.evidence.schema0050,
    focusedSecurity: output.evidence.focusedSecurity,
    cleanup: output.evidence.cleanup,
    providerCalls: output.evidence.providerCalls,
    hostedCalls: output.evidence.remoteDatabaseCalls,
  };
}

async function runScenarioB({ client, plan }) {
  resetLocalDatabase();
  const applied = await applyCanonicalThrough(client, plan, 48);
  const mixedHistory = await rewriteMixedCloneHistory(client);
  const baseline = runNode("scripts/pdf50-clone-history-repair.mjs", ["--status"]);
  assert(baseline.classification === "LOCAL_CLONE_BASELINE_VALIDATED", "Scenario B mixed baseline failed.");
  const firstRepair = runNode("scripts/pdf50-clone-history-repair.mjs");
  assert(firstRepair.finalClassification === "LOCAL_CLONE_HISTORY_RECONCILED_THROUGH_0048", "Scenario B first repair failed.");
  assert(firstRepair.insertedCount === 29, "Scenario B repair must insert 0020-0048.");
  const secondRepair = runNode("scripts/pdf50-clone-history-repair.mjs");
  assert(secondRepair.finalClassification === "LOCAL_CLONE_HISTORY_RECONCILED_THROUGH_0048", "Scenario B second repair failed.");
  assert(secondRepair.insertedCount === 0, "Scenario B second repair must be a no-op.");
  const upgrade = runNode("scripts/pdf50-local-0050-upgrade-rehearsal.mjs");
  assert(upgrade.finalClassification === "LOCAL_0050_UPGRADE_RLS_STORAGE_ADMISSION_VALIDATED", "Scenario B upgrade rehearsal failed.");

  const practice = await collectPractice0049(client);
  assert(practice.practiceGenerationAllowedInConstraints, "Practice 0049 constraints were not validated.");
  assert(practice.practiceGenerationAllowedInRouterFunctions, "Practice 0049 router functions were not validated.");
  const history = await collectHistory(client);
  assert(history.canonical0049Count === 1 && history.canonical0050Count === 1, "Scenario B final history must record 0049 and 0050 once.");
  assert(history.unmappedRowsPreserved, "Scenario B must preserve unmapped legacy rows.");

  return {
    classification: "PDF50_0050_SEQUENTIAL_UPGRADE_VALIDATED",
    appliedThrough0048: applied,
    mixedHistory,
    baselineClassification: baseline.classification,
    firstRepair: {
      insertedCount: firstRepair.insertedCount,
      schemaFingerprintUnchanged: firstRepair.schemaFingerprintUnchanged,
      storageMetadataUnchanged: firstRepair.storageMetadataUnchanged,
      syntheticRowCountsUnchanged: firstRepair.syntheticRowCountsUnchanged,
      unmappedRowsPreserved: firstRepair.unmappedRowsPreserved,
    },
    secondRepairInsertedCount: secondRepair.insertedCount,
    upgradeClassification: upgrade.finalClassification,
    practice0049: practice,
    pdf500050: upgrade.evidence.postApply.schema0050,
    bucketAdoption: upgrade.evidence.postApply.bucket,
    rlsStorageMatrix: upgrade.evidence.matrix,
    admission: upgrade.evidence.admission,
    raceRecovery: upgrade.evidence.raceRecovery,
    secondRunnerPass: upgrade.evidence.secondRunnerPass,
    cleanup: upgrade.evidence.cleanup,
    finalHistory: history,
    providerCalls: upgrade.evidence.providerCalls,
    hostedCalls: upgrade.evidence.remoteDatabaseCalls,
  };
}

async function runScenarioC({ client, plan }) {
  resetLocalDatabase();
  await applyCanonicalThrough(client, plan, 49);
  await createCompatibleLegacyBucket(client, { includeUnknownPolicy: true });
  const unsafeProbe = await attempt0050WithUnknownPolicy(client, plan);
  assert(unsafeProbe.unknownPolicyFailedClosed, "Scenario C unsafe policy probe must fail closed.");
  assert(unsafeProbe.historyUnchanged && unsafeProbe.bucketUnchanged, "Scenario C unsafe policy probe must roll back cleanly.");

  resetLocalDatabase();
  const applied = await applyCanonicalThrough(client, plan, 49);
  await createCompatibleLegacyBucket(client);
  const beforeBucket = await collectBucket(client);
  assert(beforeBucket.exists && beforeBucket.private && beforeBucket.pdfOnly, "Scenario C preexisting bucket is not compatible.");
  assert(beforeBucket.legacyPolicyCount === 3 && beforeBucket.canonicalPolicyCount === 0, "Scenario C preexisting policies are not the legacy allowlist.");
  assert(beforeBucket.objectCount === 0, "Scenario C preexisting bucket must contain no objects.");

  await applyMigration(client, plan, pdf500050);
  await reloadPostgrest(client);
  const afterBucket = await collectBucket(client);
  const history = await collectHistory(client);
  const schema0050 = await collectSchema0050(client);
  const practice = await collectPractice0049(client);
  const adopted = beforeBucket.identityHash === afterBucket.identityHash
    && beforeBucket.objectCount === afterBucket.objectCount
    && afterBucket.private
    && afterBucket.pdfOnly
    && afterBucket.sizeLimitBytes === 52428800
    && afterBucket.legacyPolicyCount === 0
    && afterBucket.canonicalPolicyCount === 3
    && afterBucket.unknownBucketTargetingPolicyCount === 0
    && afterBucket.anonymousOrPublicPolicyCount === 0;
  assert(adopted, "Scenario C bucket adoption contract failed.");
  assert(history.canonical0049Count === 1 && history.canonical0050Count === 1, "Scenario C history must record 0049 and 0050 once.");
  assert(schema0050.tableCount === 2 && schema0050.columnCount === 44, "Scenario C PDF50 schema object counts failed.");

  const upgrade = runNode("scripts/pdf50-local-0050-upgrade-rehearsal.mjs");
  assert(upgrade.finalClassification === "LOCAL_0050_UPGRADE_RLS_STORAGE_ADMISSION_VALIDATED", "Scenario C post-adoption runtime rehearsal failed.");

  return {
    classification: "PDF50_0050_PREEXISTING_BUCKET_UPGRADE_VALIDATED",
    unsafePolicyProbe: unsafeProbe,
    appliedThrough0049: applied,
    preApplyBucket: beforeBucket,
    postApplyBucket: afterBucket,
    bucketIdentityUnchanged: beforeBucket.identityHash === afterBucket.identityHash,
    objectCountPreserved: beforeBucket.objectCount === afterBucket.objectCount,
    history,
    practice0049: practice,
    schema0050,
    postAdoptionRuntimeClassification: upgrade.finalClassification,
    rlsStorageMatrix: upgrade.evidence.matrix,
    admission: upgrade.evidence.admission,
    raceRecovery: upgrade.evidence.raceRecovery,
    secondRunnerPass: upgrade.evidence.secondRunnerPass,
    cleanup: upgrade.evidence.cleanup,
    providerCalls: upgrade.evidence.providerCalls,
    hostedCalls: upgrade.evidence.remoteDatabaseCalls,
  };
}

function runNode(relativeScript, args = []) {
  const result = spawnSync(process.execPath, [relativeScript, ...args], {
    cwd: root,
    env: process.env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    const details = `${result.stdout}\n${result.stderr}`.trim();
    throw new Error(details || `${relativeScript} failed with ${result.status}`);
  }
  const stdout = result.stdout.trim();
  const jsonStart = stdout.indexOf("{");
  assert(jsonStart >= 0, `${relativeScript} did not emit JSON evidence.`);
  return JSON.parse(stdout.slice(jsonStart));
}

async function main() {
  let finalClassification = "BLOCKED_BY_LOCAL_ENVIRONMENT";
  const evidence = {
    providerCalls: 0,
    hostedCalls: 0,
  };
  let client = null;
  try {
    const env = validateEnvironment();
    evidence.localhostOnly = env.proof;
    evidence.localhostOnly.localSupabaseContainersRunning = verifyLocalContainers();
    const apiProbe = await fetch(env.apiUrl);
    evidence.localhostOnly.apiReachable = apiProbe.status >= 200 && apiProbe.status < 500;
    assert(evidence.localhostOnly.apiReachable, "Local Supabase API is not reachable.");
    const plan = await loadCanonicalMigrationPlan({ root });
    evidence.preflight = verifyGitAndPlan(plan);
    client = await connect(env.databaseUrl);

    evidence.scenarioA = await runScenarioA();
    evidence.scenarioB = await runScenarioB({ client, plan });
    evidence.scenarioC = await runScenarioC({ client, plan });

    const finalHistory = await collectHistory(client);
    const finalBucket = await collectBucket(client);
    const finalSchema0050 = await collectSchema0050(client);
    evidence.finalState = {
      history: finalHistory,
      bucket: finalBucket,
      schema0050: finalSchema0050,
      canonicalHead: finalHistory.canonicalHead,
      pendingCanonicalCount: finalHistory.pendingCanonical.length,
      providerCalls: 0,
      hostedCalls: 0,
    };
    assert(finalHistory.canonicalHead === "0050", "Final canonical history head must be 0050.");
    assert(finalHistory.pendingCanonical.length === 0, "Final canonical pending migration count must be zero.");
    assert(finalBucket.exists && finalBucket.objectCount === 0, "Final bucket must be preserved and empty after cleanup.");
    finalClassification = "PDF50_0050_LOCAL_RUNTIME_REVALIDATED";
  } catch (error) {
    evidence.safeErrorType = safeError(error);
    evidence.safeErrorMessage = String(error?.message ?? "unknown").slice(0, 240);
    if (evidence.scenarioA == null) finalClassification = "PDF50_0050_FRESH_CHAIN_FAILED";
    else if (evidence.scenarioB == null) finalClassification = "PDF50_0050_SEQUENTIAL_UPGRADE_FAILED";
    else if (evidence.scenarioC == null) finalClassification = "PDF50_0050_BUCKET_ADOPTION_FAILED";
    else finalClassification = "PDF50_0050_RLS_STORAGE_ADMISSION_FAILED";
  } finally {
    if (client) await client.end().catch(() => undefined);
  }

  console.log(JSON.stringify({ finalClassification, evidence }, null, 2));
  if (finalClassification !== "PDF50_0050_LOCAL_RUNTIME_REVALIDATED") process.exit(2);
}

main().catch((error) => {
  console.log(JSON.stringify({
    finalClassification: "BLOCKED_BY_LOCAL_ENVIRONMENT",
    safeErrorType: safeError(error),
    providerCalls: 0,
    hostedCalls: 0,
  }, null, 2));
  process.exit(2);
});
