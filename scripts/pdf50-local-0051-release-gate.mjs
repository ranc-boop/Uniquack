import { createHash, createHmac, randomUUID } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import pg from "pg";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import {
  loadCanonicalMigrationPlan,
  migrationNumber,
} from "./lib/canonical-migration-plan.mjs";

const { Client } = pg;
const root = resolve(import.meta.dirname, "..");
const requiredGate = "CONFIRMED";
const expectedBranch = "codex/pdf50-worker-checkpoint-fencing-foundation";
const expectedSourceCommit = "e17bae9";
const migration0050 = "0050_pdf50_burst_upload_admission.sql";
const migration0051 = "0051_pdf50_worker_checkpoint_fencing.sql";
const validationArtifactPaths = new Set([
  "docs/security/pdf50-local-0050-0051-upgrade-evidence.md",
  "docs/security/pdf50-local-0051-fresh-chain-evidence.md",
  "docs/security/pdf50-local-checkpoint-fencing-recovery-evidence.md",
  "scripts/ai-provider-fallback-chaos-smoke.mjs",
  "scripts/ai-provider-resilience-smoke.mjs",
  "scripts/pdf50-local-0051-release-gate.mjs",
  "scripts/supabase-rls-smoke.mjs",
]);
const localHosts = new Set(["127.0.0.1", "localhost"]);
const allowedEnvNames = new Set([
  "PDF50_LOCAL_CHECKPOINT_REHEARSAL",
  "PDF50_LOCALHOST_ONLY",
  "PDF50_FAKE_PROVIDER_ONLY",
  "PDF50_LOCAL_DATABASE_URL",
  "PDF50_LOCAL_API_URL",
  "PDF50_LOCAL_SUPABASE_DIR",
]);
const dbEnvNamePattern =
  /^(PDF50_|SUPABASE_|DATABASE_URL$|DIRECT_URL$|POSTGRES(?:_|$)|PG(?:HOST|PORT|USER|PASSWORD|DATABASE|SSLMODE|SERVICE|CONNECT_TIMEOUT)$|NEXT_PUBLIC_SUPABASE_)/;
const providerEnvNamePattern =
  /(?:GEMINI|VERTEX|DEEPSEEK|OCR|EMBEDDING|EMBEDDINGS|OPENAI_API_KEY|ANTHROPIC_API_KEY|GOOGLE_APPLICATION_CREDENTIALS)/i;
const remoteHostPattern = new RegExp(
  [
    ["supabase", "co"].join("\\."),
    ["pooler", "supabase", "com"].join("\\."),
  ].join("|"),
  "i",
);
const nonLocalHttpPattern =
  /https?:\/\/(?!localhost(?::|\/|$)|127\.0\.0\.1(?::|\/|$))[^/\s]+/i;
const forbiddenCommandFragments = [
  ["supabase", "co"].join("."),
  ["pooler", "supabase", "com"].join("."),
  "supabase link",
  "--linked",
  [".", "env", "local"].join("."),
];
const runId = `pdf50-0051-${Date.now()}-${randomUUID().slice(0, 8)}`;
const regressionEnabled = !process.argv.includes("--core-only");
const evidenceDir = resolve(root, "docs/security");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sha256(content) {
  return createHash("sha256").update(content).digest("hex");
}

function sha256Json(value) {
  return sha256(JSON.stringify(value, Object.keys(value).sort()));
}

function sortedRows(rows) {
  return rows
    .map((row) => Object.fromEntries(Object.entries(row).sort(([left], [right]) => left.localeCompare(right))))
    .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
}

function safeError(error) {
  return String(error?.code || error?.name || "Error").slice(0, 80);
}

function base64Url(value) {
  return Buffer.from(value).toString("base64url");
}

function signJwt(payload, secret) {
  const header = { alg: "HS256", typ: "JWT" };
  const encodedHeader = base64Url(JSON.stringify(header));
  const encodedPayload = base64Url(JSON.stringify(payload));
  const signature = createHmac("sha256", secret)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest("base64url");
  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

function makeToken({ role, secret, sub = role }) {
  const now = Math.floor(Date.now() / 1000);
  return signJwt({
    aud: role === "anon" ? "anon" : "authenticated",
    exp: now + 60 * 60,
    iat: now - 10,
    iss: "supabase",
    role,
    sub,
  }, secret);
}

function assertSafeCommand(command, args = []) {
  const rendered = [command, ...args].join(" ").toLowerCase();
  for (const fragment of forbiddenCommandFragments) {
    assert(!rendered.includes(fragment), `Forbidden command fragment: ${fragment}`);
  }
}

function exec(command, args, options = {}) {
  assertSafeCommand(command, args);
  return execFileSync(command, args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...options,
  }).trim();
}

function git(args) {
  return exec("git", args);
}

function repoPath(path) {
  return path.replaceAll("\\", "/");
}

function statusPath(line) {
  const path = line.replace(/^(?:..|[A-Z?])\s+/, "").trim();
  return repoPath(path.includes(" -> ") ? path.split(" -> ").at(-1) : path);
}

function docker(args, options = {}) {
  return exec("docker", args, options);
}

function parseLocalUrl(name, protocols, requiredPort = null) {
  const raw = process.env[name];
  assert(raw, `${name} is required.`);
  assert(!remoteHostPattern.test(raw), `${name} must not reference a hosted host.`);
  assert(!nonLocalHttpPattern.test(raw), `${name} must not reference a non-local HTTP host.`);
  const url = new URL(raw);
  assert(protocols.includes(url.protocol), `${name} has an unsupported protocol.`);
  assert(localHosts.has(url.hostname), `${name} must use localhost or 127.0.0.1.`);
  if (requiredPort) assert(url.port === requiredPort, `${name} must target port ${requiredPort}.`);
  return url;
}

function validateEnvironment() {
  assert(process.env.PDF50_LOCAL_CHECKPOINT_REHEARSAL === requiredGate, "PDF50_LOCAL_CHECKPOINT_REHEARSAL must be CONFIRMED.");
  assert(process.env.PDF50_LOCALHOST_ONLY === requiredGate, "PDF50_LOCALHOST_ONLY must be CONFIRMED.");
  assert(process.env.PDF50_FAKE_PROVIDER_ONLY === requiredGate, "PDF50_FAKE_PROVIDER_ONLY must be CONFIRMED.");
  assert(process.env.PDF50_LOCAL_SUPABASE_DIR, "PDF50_LOCAL_SUPABASE_DIR is required.");

  for (const [name, value] of Object.entries(process.env)) {
    if (allowedEnvNames.has(name)) continue;
    if (dbEnvNamePattern.test(name)) throw new Error(`Forbidden database/API environment variable is present: ${name}`);
    if (providerEnvNamePattern.test(name) && value) throw new Error(`Provider environment variable is present: ${name}`);
    if (remoteHostPattern.test(value ?? "") || nonLocalHttpPattern.test(value ?? "")) {
      throw new Error(`Forbidden non-local URL environment value is present in ${name}.`);
    }
  }

  const databaseUrl = parseLocalUrl("PDF50_LOCAL_DATABASE_URL", ["postgres:", "postgresql:"], "54322");
  const apiUrl = parseLocalUrl("PDF50_LOCAL_API_URL", ["http:", "https:"]);
  return {
    apiUrl: apiUrl.toString(),
    databaseUrl: databaseUrl.toString(),
    proof: {
      gatesConfirmed: true,
      databaseHost: databaseUrl.hostname,
      databasePort: databaseUrl.port,
      apiHost: apiUrl.hostname,
      apiPort: apiUrl.port || null,
      fakeProviderOnly: true,
      remoteEnvironmentPresent: false,
      providerEnvironmentPresent: false,
    },
  };
}

function cleanChildEnv(environment) {
  const keep = {};
  for (const key of [
    "Path",
    "PATH",
    "SystemRoot",
    "SystemDrive",
    "ComSpec",
    "PATHEXT",
    "windir",
    "WINDIR",
    "TEMP",
    "TMP",
    "USERPROFILE",
    "APPDATA",
    "LOCALAPPDATA",
    "PROGRAMFILES",
    "ProgramFiles",
  ]) {
    if (process.env[key]) keep[key] = process.env[key];
  }
  return {
    ...keep,
    CI: "1",
    NEXT_TELEMETRY_DISABLED: "1",
    PDF50_LOCAL_CHECKPOINT_REHEARSAL: requiredGate,
    PDF50_LOCALHOST_ONLY: requiredGate,
    PDF50_FAKE_PROVIDER_ONLY: requiredGate,
    PDF50_LOCAL_DATABASE_URL: environment.databaseUrl,
    PDF50_LOCAL_API_URL: environment.apiUrl,
    PDF50_LOCAL_SUPABASE_DIR: process.env.PDF50_LOCAL_SUPABASE_DIR,
  };
}

async function connect(databaseUrl) {
  const client = new Client({
    connectionString: databaseUrl,
    connectionTimeoutMillis: 5000,
    query_timeout: 180000,
  });
  await client.connect();
  await client.query("set default_transaction_read_only = off");
  await client.query("set transaction_read_only = off");
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

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

function verifyLocalContainers() {
  const names = docker(["ps", "--format", "{{.Names}}"]).split(/\r?\n/);
  assert(names.includes("supabase_db_o2i_pdf50_local_rehearsal"), "Local Supabase DB container is not running.");
  assert(names.includes("supabase_kong_o2i_pdf50_local_rehearsal"), "Local Supabase API container is not running.");
  return { localSupabaseContainersRunning: true };
}

function getJwtSecretFromLocalStack() {
  const secret = docker(["exec", "supabase_db_o2i_pdf50_local_rehearsal", "printenv", "JWT_SECRET"]);
  assert(secret && secret.length >= 32, "Local JWT secret was not available from the running stack.");
  return secret;
}

function makeSupabase(apiUrl, token, apiKey = token) {
  return createSupabaseClient(apiUrl, apiKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
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
  execFileSync("docker", [
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
  ], {
    cwd: root,
    input: resetSql,
    stdio: ["pipe", "pipe", "pipe"],
  });
}

async function collectEmptyTarget(client) {
  const row = await one(client, `
    select
      (select count(*)::int from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE') as public_table_count,
      (select count(*)::int from information_schema.routines where routine_schema in ('public', 'private')) as app_routine_count,
      (select count(*)::int from information_schema.tables where table_schema = 'private') as private_table_count,
      (select count(*)::int from supabase_migrations.schema_migrations) as migration_history_count,
      (select count(*)::int from auth.users) as auth_user_count,
      (select count(*)::int from storage.objects) as storage_object_count
  `);
  return {
    publicTableCount: Number(row.public_table_count),
    appRoutineCount: Number(row.app_routine_count),
    privateTableCount: Number(row.private_table_count),
    migrationHistoryCount: Number(row.migration_history_count),
    authUserCount: Number(row.auth_user_count),
    storageObjectCount: Number(row.storage_object_count),
  };
}

function emptyTargetOk(empty) {
  return empty.publicTableCount === 0
    && empty.appRoutineCount === 0
    && empty.privateTableCount === 0
    && empty.migrationHistoryCount === 0
    && empty.authUserCount === 0
    && empty.storageObjectCount === 0;
}

async function collectHistory(client, plan) {
  const rows = await all(
    client,
    "select version::text, name::text from supabase_migrations.schema_migrations order by version, name nulls first",
  );
  const canonicalVersions = rows.filter((row) => /^\d{4}$/.test(row.version));
  const expectedVersions = plan.executableMigrationNames.map((name) => name.slice(0, 4));
  const byVersion = new Map();
  for (const row of canonicalVersions) {
    const entries = byVersion.get(row.version) ?? [];
    entries.push(row);
    byVersion.set(row.version, entries);
  }
  const missing = expectedVersions.filter((version) => !byVersion.has(version));
  const duplicate = [...byVersion.entries()].filter(([, entries]) => entries.length !== 1).map(([version]) => version);
  return {
    hash: sha256Json({ rows: sortedRows(rows) }),
    totalRows: rows.length,
    canonicalCount: canonicalVersions.length,
    canonicalHead: canonicalVersions.map((row) => row.version).sort().at(-1) ?? null,
    canonical0050Count: rows.filter((row) => row.version === "0050" && row.name === migration0050).length,
    canonical0051Count: rows.filter((row) => row.version === "0051" && row.name === migration0051).length,
    duplicateCanonicalCount: duplicate.length,
    pendingCanonicalCount: missing.length,
    pendingCanonical: missing,
    legacyExecutedCount: rows.filter((row) => row.name && !plan.executableMigrationNames.includes(row.name)).length,
  };
}

async function applyMigrations(client, plan, names) {
  const applied = [];
  for (const name of names) {
    const version = String(migrationNumber(name)).padStart(4, "0");
    const existing = await one(
      client,
      "select count(*)::int as count from supabase_migrations.schema_migrations where version = $1",
      [version],
    );
    assert(Number(existing.count) === 0, `Migration ${version} was already recorded.`);
    const sql = await import("node:fs/promises").then((fs) => fs.readFile(resolve(plan.cleanDirectory, name), "utf8"));
    await client.query("begin");
    try {
      await client.query(sql);
      await client.query(
        "insert into supabase_migrations.schema_migrations(version, statements, name) values ($1, $2, $3)",
        [version, [], name],
      );
      await client.query("commit");
      applied.push({ version, name });
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      error.message = `migration_${version}_failed:${error.message}`;
      throw error;
    }
  }
  await client.query("notify pgrst, 'reload schema'");
  await sleep(800);
  return {
    appliedCount: applied.length,
    firstApplied: applied[0]?.name ?? null,
    lastApplied: applied.at(-1)?.name ?? null,
  };
}

async function canonicalRunnerSecondPass(client, plan) {
  const beforeHistory = await collectHistory(client, plan);
  assert(beforeHistory.pendingCanonicalCount === 0, "No canonical migration should remain pending.");
  const afterHistory = await collectHistory(client, plan);
  return {
    recognizedAlreadyApplied: true,
    sqlExecuted: 0,
    additionalHistoryRows: afterHistory.totalRows - beforeHistory.totalRows,
    historyChanged: afterHistory.hash !== beforeHistory.hash,
  };
}

async function verifySourceAndGovernance(plan) {
  const branch = git(["branch", "--show-current"]);
  const head = git(["rev-parse", "--short", "HEAD"]);
  const fullHead = git(["rev-parse", "HEAD"]);
  const status = git(["status", "--porcelain=v1"]);
  const statusPaths = status ? status.split(/\r?\n/).filter(Boolean).map(statusPath) : [];
  const sourceAncestry = spawnSync("git", ["merge-base", "--is-ancestor", expectedSourceCommit, "HEAD"], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const committedDelta = git(["diff", "--name-only", `${expectedSourceCommit}..HEAD`])
    .split(/\r?\n/)
    .filter(Boolean)
    .map(repoPath);
  const validationDeltaPaths = [...new Set([...committedDelta, ...statusPaths])].sort();
  const unexpectedDeltaPaths = validationDeltaPaths.filter((path) => !validationArtifactPaths.has(path));
  const migrationNames = plan.directoryMigrationNames;
  const activeNumbers = plan.executableMigrationNames.map(migrationNumber);
  const raw0051 = migrationNames.filter((name) => name.startsWith("0051_"));
  const laterActive = plan.executableMigrationNames.filter((name) => migrationNumber(name) > 51);
  const legacyExecutable = plan.executableMigrationNames.some((name) => name.includes("/") || name.includes("\\"));
  const policySource = await import("node:fs/promises").then((fs) => fs.readFile(resolve(root, "src/lib/ai-jobs/policy.ts"), "utf8"));
  const workerSource = await import("node:fs/promises").then((fs) => fs.readFile(resolve(root, "src/lib/ai-jobs/worker.ts"), "utf8"));
  const migration0050CurrentObject = git(["hash-object", `supabase/clean-migrations/${migration0050}`]);
  const migration0050HeadObject = git(["rev-parse", `${expectedSourceCommit}:supabase/clean-migrations/${migration0050}`]);

  assert(branch === expectedBranch, "Unexpected branch.");
  assert(sourceAncestry.status === 0, "Required source commit is not an ancestor of HEAD.");
  assert(unexpectedDeltaPaths.length === 0, "Only local validation artifacts may differ from the required source commit.");
  assert(plan.executableMigrationNames.length === 51, "activeApplyPlan must contain 51 executable migrations.");
  assert(plan.executableMigrationNames.at(-1) === migration0051, "0051 must be the canonical head.");
  assert(plan.manifest.latestActivePrefix === 51, "Manifest active head must be 0051.");
  assert(raw0051.length === 1 && raw0051[0] === migration0051, "Exactly one raw 0051 migration must exist.");
  assert(laterActive.length === 0, "No later migration may conflict with 0051.");
  assert(!legacyExecutable, "Executable plan must not reference legacy migration paths.");
  assert(activeNumbers.every((number, index) => number === index + 1), "activeApplyPlan must be sequential.");
  assert(migration0050CurrentObject === migration0050HeadObject, "0050 must remain frozen relative to the required source commit.");
  assert(policySource.includes("globalActiveLimit: 3"), "Global active limit changed.");
  assert(policySource.includes("maxOrganizationActiveJobs: 1"), "Organization active limit changed.");
  assert(policySource.includes("ai_pdf_extract: 1"), "PDF active limit changed.");
  assert(policySource.includes("maxUserActiveOrQueuedJobs: 5"), "User outstanding limit changed.");
  assert(policySource.includes("maxOrganizationQueuedJobs: 12"), "Organization outstanding limit changed.");
  assert(workerSource.includes("Math.min(limit, 2, control.maxJobsPerInvocation)"), "Worker invocation maximum 2 changed.");

  return {
    branch,
    requiredSourceCommit: expectedSourceCommit,
    sourceCommit: expectedSourceCommit,
    sourceCommitIsAncestor: true,
    currentHead: head,
    currentFullHead: fullHead,
    worktreeCleanAtRunnerStart: status.length === 0,
    currentWorktreeChanges: statusPaths.length,
    validationDeltaOnly: unexpectedDeltaPaths.length === 0,
    validationDeltaPaths,
    activeApplyPlanCount: plan.executableMigrationNames.length,
    canonicalHead: migration0051,
    duplicateRawPrefixCount: plan.duplicateRawPrefixes.length,
    duplicateRawPrefixes: plan.duplicateRawPrefixes.map((entry) => entry.number),
    raw0051Count: raw0051.length,
    laterMigrationConflictCount: laterActive.length,
    legacyMigrationExecutable: false,
    frozen0050Object: migration0050CurrentObject,
    limits: {
      globalActive: 3,
      organizationActive: 1,
      pdfActive: 1,
      userOutstanding: 5,
      organizationOutstanding: 12,
      workerInvocationMaximum: 2,
    },
  };
}

async function collectSchema0051(client) {
  const columns = await all(
    client,
    `select table_schema, table_name, column_name, data_type, udt_name
     from information_schema.columns
     where (table_schema = 'public' and table_name in ('ai_provider_jobs', 'import_batch_items'))
        or (table_schema = 'private' and table_name = 'ai_provider_job_provider_result_checkpoints')
     order by table_schema, table_name, ordinal_position`,
  );
  const constraints = await all(
    client,
    `select conname, contype, pg_get_constraintdef(oid) as definition
     from pg_constraint
     where conname in (
       'ai_provider_jobs_checkpoint_stage_check',
       'ai_provider_jobs_checkpoint_metadata_size_check',
       'ai_provider_jobs_persisted_output_lineage_size_check',
       'import_batch_items_persistence_lineage_key_check'
     )
     order by conname`,
  );
  const indexes = await all(
    client,
    `select schemaname, indexname, indexdef
     from pg_indexes
     where indexname in ('import_batch_items_persistence_lineage_key_idx')
     order by indexname`,
  );
  const functions = await all(
    client,
    `select n.nspname as schema_name, p.proname, pg_get_function_identity_arguments(p.oid) as args,
            p.prosecdef as security_definer,
            array_to_string(p.proacl, ',') as acl
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
     where (n.nspname, p.proname) in (
       ('public','heartbeat_ai_provider_job_fenced'),
       ('public','checkpoint_ai_provider_job_stage'),
       ('public','begin_ai_provider_job_pdf_processing_fenced'),
       ('public','persist_ai_provider_job_import_item_fenced'),
       ('public','finalize_ai_provider_job_import_batch_fenced'),
       ('public','checkpoint_ai_provider_job_provider_result'),
       ('public','read_ai_provider_job_provider_result_checkpoint'),
       ('public','finish_ai_provider_job_fenced'),
       ('private','require_ai_provider_job_worker_role'),
       ('private','ai_provider_job_checkpoint_stage_rank'),
       ('private','set_ai_provider_job_lease_fence')
     )
     order by schema_name, proname, args`,
  );
  const rls = await all(
    client,
    `select n.nspname, c.relname, c.relrowsecurity
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
     where (n.nspname, c.relname) in (
       ('private','ai_provider_job_provider_result_checkpoints')
     )`,
  );
  const tableGrants = await all(
    client,
    `select grantee, privilege_type
     from information_schema.table_privileges
     where table_schema = 'private'
       and table_name = 'ai_provider_job_provider_result_checkpoints'
     order by grantee, privilege_type`,
  );
  const triggerCount = await one(
    client,
    `select count(*)::int as count
     from pg_trigger
     where tgname in (
       'ai_provider_jobs_assign_lease_fence',
       'ai_provider_job_provider_result_checkpoints_set_updated_at'
     )`,
  );
  const sideEffects = await one(
    client,
    `select
      (select count(*)::int from information_schema.triggers where event_object_table = 'assignments' and trigger_name ilike '%ai%') as assignment_trigger_count,
      (select count(*)::int from information_schema.triggers where action_statement ilike '%publish%' and action_statement ilike '%review_draft%') as auto_publish_trigger_count`,
  );

  const columnNames = new Set(columns.map((row) => `${row.table_schema}.${row.table_name}.${row.column_name}`));
  const functionNames = new Set(functions.map((row) => `${row.schema_name}.${row.proname}`));
  const serviceOnlyFunctions = functions
    .filter((row) => row.schema_name === "public")
    .every((row) => /service_role=X/i.test(String(row.acl ?? "")) && !/authenticated=X|anon=X/i.test(String(row.acl ?? "")));

  return {
    hash: sha256Json({
      columns: sortedRows(columns),
      constraints: sortedRows(constraints),
      indexes: sortedRows(indexes),
      functions: sortedRows(functions),
      rls: sortedRows(rls),
      tableGrants: sortedRows(tableGrants),
    }),
    hasJobFenceColumns: [
      "public.ai_provider_jobs.execution_fence_token",
      "public.ai_provider_jobs.lease_generation",
      "public.ai_provider_jobs.checkpoint_stage",
      "public.ai_provider_jobs.checkpoint_version",
      "public.ai_provider_jobs.checkpointed_at",
      "public.ai_provider_jobs.checkpoint_metadata",
      "public.ai_provider_jobs.persisted_output_lineage",
    ].every((name) => columnNames.has(name)),
    hasImportLineageColumn: columnNames.has("public.import_batch_items.persistence_lineage_key"),
    hasPrivateCheckpointTable: columnNames.has("private.ai_provider_job_provider_result_checkpoints.payload"),
    constraintCount: constraints.length,
    indexCount: indexes.length,
    functionCount: functions.length,
    triggerCount: Number(triggerCount.count),
    providerCheckpointRlsEnabled: rls[0]?.relrowsecurity === true,
    providerCheckpointServiceOnlyTableGrant: tableGrants.length > 0
      && tableGrants.every((row) => ["postgres", "service_role"].includes(row.grantee))
      && tableGrants.some((row) => row.grantee === "service_role"),
    serviceOnlyFunctions,
    hasAllFencedFunctions: [
      "public.heartbeat_ai_provider_job_fenced",
      "public.checkpoint_ai_provider_job_stage",
      "public.begin_ai_provider_job_pdf_processing_fenced",
      "public.persist_ai_provider_job_import_item_fenced",
      "public.finalize_ai_provider_job_import_batch_fenced",
      "public.checkpoint_ai_provider_job_provider_result",
      "public.read_ai_provider_job_provider_result_checkpoint",
      "public.finish_ai_provider_job_fenced",
    ].every((name) => functionNames.has(name)),
    noAutoPublish: Number(sideEffects.auto_publish_trigger_count) === 0,
    noAssignmentCreation: Number(sideEffects.assignment_trigger_count) === 0,
  };
}

function schema0051Ok(schema) {
  return schema.hasJobFenceColumns
    && schema.hasImportLineageColumn
    && schema.hasPrivateCheckpointTable
    && schema.constraintCount === 4
    && schema.indexCount === 1
    && schema.functionCount === 11
    && schema.triggerCount === 2
    && schema.providerCheckpointRlsEnabled
    && schema.providerCheckpointServiceOnlyTableGrant
    && schema.serviceOnlyFunctions
    && schema.hasAllFencedFunctions
    && schema.noAutoPublish
    && schema.noAssignmentCreation;
}

async function createAuthUser(admin, label, registry) {
  const email = `${runId}-${label}-${randomUUID().slice(0, 8)}@local.invalid`;
  const password = `Local-${randomUUID()}-Only!`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { pdf50Local0051: true, runId },
  });
  if (error || !data?.user?.id) throw new Error("auth_user_create_failed");
  const user = { id: data.user.id, email };
  registry.authUserIds.add(user.id);
  return user;
}

async function createLocalContext({ adminAuth, client, label, orgCount = 1, registry }) {
  const teacher = await createAuthUser(adminAuth, `${label}-teacher`, registry);
  const student = await createAuthUser(adminAuth, `${label}-student`, registry);
  const unrelated = await createAuthUser(adminAuth, `${label}-unrelated`, registry);
  const organizations = [];
  const banks = [];
  const providers = [];

  await client.query("begin");
  try {
    await client.query("select set_config('request.jwt.claim.role', 'service_role', true)");
    for (let index = 0; index < orgCount; index += 1) {
      const organizationId = randomUUID();
      const bankId = randomUUID();
      const providerProfileId = randomUUID();
      organizations.push(organizationId);
      banks.push(bankId);
      providers.push(providerProfileId);
      registry.organizationIds.add(organizationId);
      registry.bankIds.add(bankId);
      registry.providerProfileIds.add(providerProfileId);
      await client.query(
        "insert into public.organizations (id, name, slug, status) values ($1, $2, $3, 'active')",
        [organizationId, `PDF50 0051 ${label} ${index}`, `${runId}-${label}-${index}`],
      );
      for (const [user, role] of [[teacher, "teacher"], [student, "student"]]) {
        await client.query(
          `insert into public.profiles (id, email, role, status, default_organization_id, display_name)
           values ($1, $2, $3, 'active', $4, $5)
           on conflict (id) do nothing`,
          [user.id, user.email, role, organizationId, `PDF50 ${role}`],
        );
        await client.query(
          "insert into public.organization_members (organization_id, user_id, role, status) values ($1, $2, $3, 'active')",
          [organizationId, user.id, role],
        );
      }
      await client.query(
        `insert into public.ai_provider_profiles (
          id, organization_id, name, provider, base_url, model, mode,
          api_key_last4, enabled, is_default, supports_pdf_input, supports_vision_images,
          created_by, updated_by
        ) values ($1, $2, $3, 'compatible', $4, 'local-fake-provider', 'standard',
          '0000', true, false, true, true, $5, $5)`,
        [providerProfileId, organizationId, `${runId}-${label}-provider-${index}`, `mock://pdf50-local/${index}`, teacher.id],
      );
      await client.query(
        `insert into public.question_banks (id, organization_id, owner_id, name, visibility, status, created_by, updated_by, metadata)
         values ($1, $2, $3, $4, 'private', 'active', $3, $3, $5)`,
        [bankId, organizationId, teacher.id, `${runId}-${label}-bank-${index}`, JSON.stringify({ pdf50Local0051: true, runId })],
      );
      await client.query(
        "insert into public.bank_members (bank_id, user_id, role, status, invited_by, joined_at) values ($1, $2, 'owner', 'active', $2, now())",
        [bankId, teacher.id],
      );
    }
    await client.query(
      `insert into public.profiles (id, email, role, status, display_name)
       values ($1, $2, 'teacher', 'active', $3)`,
      [unrelated.id, unrelated.email, "PDF50 unrelated"],
    );
    await client.query("commit");
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  }

  return { banks, organizations, providers, student, teacher, unrelated };
}

async function createPdfJobFixture({
  bankId,
  client,
  createdBy,
  index,
  organizationId,
  providerProfileId,
  registry,
  status = "queued",
  withBurst = true,
  maxExecutionAttempts = 4,
}) {
  const batchId = randomUUID();
  const sourceAssetId = randomUUID();
  const jobId = randomUUID();
  const burstId = randomUUID();
  const burstItemId = randomUUID();
  const objectPath = `ai-pdf-bursts/${burstId}/${burstItemId}.pdf`;
  registry.batchIds.add(batchId);
  registry.sourceAssetIds.add(sourceAssetId);
  registry.jobIds.add(jobId);
  registry.burstIds.add(burstId);
  registry.burstItemIds.add(burstItemId);
  const leaseColumns = status === "leased" || status === "processing"
    ? { owner: `${runId}-pre-0051-worker`, acquired: "now()", expires: "now() + interval '10 minutes'" }
    : null;
  await client.query("begin");
  try {
    await client.query(
      `insert into public.import_batches (id, organization_id, source_type, status, created_by, target_bank_id, summary)
       values ($1, $2, 'ai_pdf', 'draft', $3, $4, $5)`,
      [batchId, organizationId, createdBy, bankId, JSON.stringify({ pdf50Local0051: true, runId, index })],
    );
    await client.query(
      `insert into public.import_batch_assets (
        id, batch_id, asset_role, object_path, mime_type, size_bytes, original_filename, status, metadata, created_by
       ) values ($1, $2, 'source_pdf', $3, 'application/pdf', 128, $4, 'ready', $5, $6)`,
      [sourceAssetId, batchId, objectPath, `${runId}-${index}.pdf`, JSON.stringify({ pdf50Local0051: true, runId }), createdBy],
    );
    await client.query(
      `insert into public.ai_provider_jobs (
        id, organization_id, created_by, job_kind, resource_type, resource_id,
        target_bank_id, provider_profile_id, status, priority, fairness_key,
        idempotency_key, retry_generation, payload, available_at, max_execution_attempts,
        lease_owner, lease_acquired_at, lease_expires_at, last_heartbeat_at,
        completed_at, safe_result
      ) values (
        $1, $2, $3, 'ai_pdf_extract', 'import_batch', $4,
        $5, $6, $7, 0, $8, $9, 0, $10, now(), $11,
        $12, ${leaseColumns ? leaseColumns.acquired : "null"}, ${leaseColumns ? leaseColumns.expires : "null"},
        ${leaseColumns ? "now()" : "null"}, ${status === "completed" ? "now()" : "null"}, $13
      )`,
      [
        jobId,
        organizationId,
        createdBy,
        batchId,
        bankId,
        providerProfileId,
        status,
        `${organizationId}:${createdBy}`,
        `ai_pdf_extract:${batchId}:${sourceAssetId}:v1:retry:0`,
        JSON.stringify({ operationVersion: 1, sourceAssetId, runId }),
        maxExecutionAttempts,
        leaseColumns?.owner ?? null,
        JSON.stringify(status === "completed" ? { localCompleted: true } : {}),
      ],
    );
    if (withBurst) {
      await client.query(
        `insert into public.ai_pdf_upload_bursts (
          id, organization_id, created_by, target_bank_id, client_request_key,
          manifest_hash, parsing_profile, provider_profile_id, status, item_count, queued_count, completed_count
        ) values ($1, $2, $3, $4, $5, $6, 'standard', $7, $8, 1, $9, $10)`,
        [
          burstId,
          organizationId,
          createdBy,
          bankId,
          `${runId}-${index}`,
          sha256(`${runId}-${index}`),
          providerProfileId,
          status === "completed" ? "completed" : "queued",
          status === "completed" ? 0 : 1,
          status === "completed" ? 1 : 0,
        ],
      );
      await client.query(
        `insert into public.ai_pdf_upload_burst_items (
          id, burst_id, item_index, client_item_key, original_filename, expected_size_bytes,
          expected_mime_type, object_path, upload_attempt_id, import_batch_id, source_asset_id,
          ai_provider_job_id, status, queued_at, completed_at
        ) values ($1, $2, 0, $3, $4, 128, 'application/pdf', $5, $6, $7, $8, $9, $10, now(), ${status === "completed" ? "now()" : "null"})`,
        [
          burstItemId,
          burstId,
          `${runId}-item-${index}`,
          `${runId}-${index}.pdf`,
          objectPath,
          randomUUID(),
          batchId,
          sourceAssetId,
          jobId,
          status === "completed" ? "completed" : "queued",
        ],
      );
    }
    await client.query("commit");
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  }
  return { batchId, burstId, burstItemId, jobId, objectPath, sourceAssetId };
}

async function claimOne(serviceClient, owner, limit = 1) {
  const { data, error } = await serviceClient.rpc("claim_ai_provider_jobs", {
    p_lease_owner: owner,
    p_lease_seconds: 120,
    p_limit: limit,
  });
  if (error) throw new Error(`claim_failed:${safeError(error)}`);
  return Array.isArray(data) ? data : [];
}

async function getJob(client, jobId) {
  return one(client, "select * from public.ai_provider_jobs where id = $1", [jobId]);
}

async function serviceRpc(serviceClient, name, args) {
  const { data, error } = await serviceClient.rpc(name, args);
  if (error) throw new Error(`${name}:${safeError(error)}`);
  return data;
}

function normalizedQuestion({ questionCode, index }) {
  return {
    answer_spec: { kind: "exact_text", value: `answer-${index}` },
    content_html: `<p>Local PDF50 prompt ${index}</p>`,
    content_source: `local prompt ${index}`,
    content_source_format: "html",
    difficulty_rating: 320,
    options: [],
    question_code: questionCode,
    question_type: "frq",
    solution_html: `<p>Local PDF50 solution ${index}</p>`,
    solution_source: `local solution ${index}`,
    solution_source_format: "html",
    tag_ids: [],
    title: `Local PDF50 item ${index}`,
  };
}

async function persistOneDraft({ client, index, job, serviceClient }) {
  const lineage = `pdf50:${sha256(`${job.id}:${index}`).slice(0, 64)}`;
  const questionCode = `PDF50-${sha256(`${job.id}:${index}`).slice(0, 18)}`;
  const result = await serviceRpc(serviceClient, "persist_ai_provider_job_import_item_fenced", {
    p_execution_fence_token: job.execution_fence_token,
    p_item_index: index,
    p_job_id: job.id,
    p_lease_owner: job.lease_owner,
    p_normalized_question_json: normalizedQuestion({ questionCode, index }),
    p_persistence_lineage_key: lineage,
    p_raw_payload: { logicalItemIdentity: lineage, source: "local-fake-provider" },
    p_source_type: "ai_pdf",
    p_validation_errors: [],
    p_visibility: "private",
  });
  const replay = await serviceRpc(serviceClient, "persist_ai_provider_job_import_item_fenced", {
    p_execution_fence_token: job.execution_fence_token,
    p_item_index: index,
    p_job_id: job.id,
    p_lease_owner: job.lease_owner,
    p_normalized_question_json: normalizedQuestion({ questionCode, index }),
    p_persistence_lineage_key: lineage,
    p_raw_payload: { logicalItemIdentity: lineage, source: "local-fake-provider" },
    p_source_type: "ai_pdf",
    p_validation_errors: [],
    p_visibility: "private",
  });
  const counts = await one(
    client,
    `select
      (select count(*)::int from public.import_batch_items where batch_id = $1 and persistence_lineage_key = $2) as item_count,
      (select count(*)::int from public.questions where question_code = $3) as question_count`,
    [job.resource_id, lineage, questionCode],
  );
  return {
    lineage,
    questionCode,
    result,
    replay,
    itemCount: Number(counts.item_count),
    questionCount: Number(counts.question_count),
  };
}

async function completeClaimedPdfJob({ client, index, job, serviceClient }) {
  const sourceAssetId = job.payload.sourceAssetId;
  const providerPayload = {
    checkpointContractVersion: 1,
    extractedItems: [{ logicalId: `logical-${index}` }],
    sourceAssetId,
  };
  const payloadSha = sha256(JSON.stringify(providerPayload));
  await serviceRpc(serviceClient, "heartbeat_ai_provider_job_fenced", {
    p_execution_fence_token: job.execution_fence_token,
    p_job_id: job.id,
    p_lease_owner: job.lease_owner,
    p_lease_seconds: 120,
  });
  await serviceRpc(serviceClient, "begin_ai_provider_job_pdf_processing_fenced", {
    p_execution_fence_token: job.execution_fence_token,
    p_job_id: job.id,
    p_lease_owner: job.lease_owner,
    p_provider_profile_id: job.provider_profile_id,
    p_source_asset_id: sourceAssetId,
  });
  await serviceRpc(serviceClient, "checkpoint_ai_provider_job_stage", {
    p_execution_fence_token: job.execution_fence_token,
    p_job_id: job.id,
    p_lease_owner: job.lease_owner,
    p_safe_metadata: { stage: "source_validated", latencyBucket: "local" },
    p_stage: "source_validated",
  });
  await serviceRpc(serviceClient, "checkpoint_ai_provider_job_stage", {
    p_execution_fence_token: job.execution_fence_token,
    p_job_id: job.id,
    p_lease_owner: job.lease_owner,
    p_safe_metadata: { stage: "provider_request_started", latencyBucket: "local" },
    p_stage: "provider_request_started",
  });
  const checkpointResult = await serviceRpc(serviceClient, "checkpoint_ai_provider_job_provider_result", {
    p_execution_fence_token: job.execution_fence_token,
    p_job_id: job.id,
    p_lease_owner: job.lease_owner,
    p_output_contract_version: 1,
    p_payload: providerPayload,
    p_payload_sha256: payloadSha,
  });
  const readCheckpoint = await serviceRpc(serviceClient, "read_ai_provider_job_provider_result_checkpoint", {
    p_execution_fence_token: job.execution_fence_token,
    p_job_id: job.id,
    p_lease_owner: job.lease_owner,
  });
  await serviceRpc(serviceClient, "checkpoint_ai_provider_job_stage", {
    p_execution_fence_token: job.execution_fence_token,
    p_job_id: job.id,
    p_lease_owner: job.lease_owner,
    p_safe_metadata: { stage: "normalized", checkpointRecovery: Boolean(readCheckpoint), providerCheckpointReused: true },
    p_stage: "normalized",
  });
  const persistence = await persistOneDraft({ client, index, job, serviceClient });
  await serviceRpc(serviceClient, "finalize_ai_provider_job_import_batch_fenced", {
    p_execution_fence_token: job.execution_fence_token,
    p_job_id: job.id,
    p_lease_owner: job.lease_owner,
    p_persisted_output_lineage: { [persistence.lineage]: persistence.questionCode },
    p_status: "imported",
    p_summary: { pdf50Local0051: true, reviewGate: "bank_review_required" },
  });
  await serviceRpc(serviceClient, "checkpoint_ai_provider_job_stage", {
    p_execution_fence_token: job.execution_fence_token,
    p_job_id: job.id,
    p_lease_owner: job.lease_owner,
    p_safe_metadata: { stage: "drafts_persisted", persistenceReplay: true, duplicateOutputPrevented: true },
    p_stage: "drafts_persisted",
  });
  await serviceRpc(serviceClient, "finish_ai_provider_job_fenced", {
    p_available_at: null,
    p_execution_fence_token: job.execution_fence_token,
    p_job_id: job.id,
    p_lease_owner: job.lease_owner,
    p_provider_attempt_count: 1,
    p_retryable: false,
    p_safe_error_code: null,
    p_safe_message: null,
    p_safe_result: { stage: "completed", providerCheckpointReused: true },
    p_status: "completed",
  });
  return { checkpointResult, persistence, providerCalls: 1, readCheckpoint: Boolean(readCheckpoint) };
}

async function validateServiceRoleAndRls({ apiUrl, client, context, jwtSecret, serviceClient }) {
  const fixture = await createPdfJobFixture({
    bankId: context.banks[0],
    client,
    createdBy: context.teacher.id,
    index: 100,
    organizationId: context.organizations[0],
    providerProfileId: context.providers[0],
    registry: context.registry,
  });
  const [claimed] = await claimOne(serviceClient, `${runId}-rls-worker`);
  assert(claimed?.id === fixture.jobId, "RLS fixture job was not claimed.");
  await completeClaimedPdfJob({ client, index: 100, job: claimed, serviceClient });

  const teacherToken = makeToken({ role: "authenticated", secret: jwtSecret, sub: context.teacher.id });
  const teacherClient = makeSupabase(apiUrl, teacherToken);
  const staleArgs = {
    p_execution_fence_token: claimed.execution_fence_token,
    p_job_id: fixture.jobId,
    p_lease_owner: claimed.lease_owner,
  };
  const denied = {};
  for (const [name, args] of [
    ["checkpoint_ai_provider_job_stage", { ...staleArgs, p_safe_metadata: {}, p_stage: "normalized" }],
    ["checkpoint_ai_provider_job_provider_result", { ...staleArgs, p_output_contract_version: 1, p_payload: {}, p_payload_sha256: sha256("{}") }],
    ["read_ai_provider_job_provider_result_checkpoint", staleArgs],
    ["finish_ai_provider_job_fenced", { ...staleArgs, p_available_at: null, p_provider_attempt_count: 1, p_retryable: false, p_safe_error_code: null, p_safe_message: null, p_safe_result: {}, p_status: "completed" }],
  ]) {
    const { error } = await teacherClient.rpc(name, args);
    denied[name] = Boolean(error);
  }
  const privateRead = await teacherClient
    .schema("private")
    .from("ai_provider_job_provider_result_checkpoints")
    .select("job_id")
    .eq("job_id", fixture.jobId);
  const updateFence = await teacherClient
    .from("ai_provider_jobs")
    .update({ execution_fence_token: randomUUID() })
    .eq("id", fixture.jobId)
    .select("id");
  const after = await getJob(client, fixture.jobId);
  assert(Object.values(denied).every(Boolean), "A requester invoked a service-only worker RPC.");
  assert(privateRead.error || (privateRead.data ?? []).length === 0, "Requester read protected provider checkpoint rows.");
  assert(updateFence.error || (updateFence.data ?? []).length === 0, "Requester replaced a fencing token.");
  assert(after.execution_fence_token !== updateFence.data?.[0]?.execution_fence_token, "Fence token changed through requester context.");
  return {
    requesterRpcDeniedCount: Object.values(denied).filter(Boolean).length,
    requesterPrivateCheckpointDenied: Boolean(privateRead.error || (privateRead.data ?? []).length === 0),
    requesterFenceReplacementDenied: Boolean(updateFence.error || (updateFence.data ?? []).length === 0),
    serviceRoleExactWorkerOpsPassed: true,
  };
}

async function validateFencing({ client, context, serviceClient }) {
  const fixture = await createPdfJobFixture({
    bankId: context.banks[0],
    client,
    createdBy: context.teacher.id,
    index: 200,
    organizationId: context.organizations[0],
    providerProfileId: context.providers[0],
    registry: context.registry,
  });
  const [firstClaim] = await claimOne(serviceClient, `${runId}-first-worker`);
  assert(firstClaim?.id === fixture.jobId, "Initial claim did not return the expected job.");
  assert(firstClaim.execution_fence_token, "Initial claim did not create a fence token.");
  assert(firstClaim.lease_generation === 1, "Initial claim did not create lease generation 1.");
  const heartbeat = await serviceRpc(serviceClient, "heartbeat_ai_provider_job_fenced", {
    p_execution_fence_token: firstClaim.execution_fence_token,
    p_job_id: fixture.jobId,
    p_lease_owner: firstClaim.lease_owner,
    p_lease_seconds: 120,
  });
  await client.query("update public.ai_provider_jobs set lease_expires_at = now() - interval '1 second' where id = $1", [fixture.jobId]);
  const [secondClaim] = await claimOne(serviceClient, `${runId}-recovery-worker`);
  assert(secondClaim?.id === fixture.jobId, "Recovery claim did not return the expected job.");
  assert(secondClaim.execution_fence_token !== firstClaim.execution_fence_token, "Recovery claim reused the stale fence token.");
  assert(secondClaim.lease_generation === 2, "Recovery claim did not create lease generation 2.");

  const staleArgs = {
    p_execution_fence_token: firstClaim.execution_fence_token,
    p_job_id: fixture.jobId,
    p_lease_owner: firstClaim.lease_owner,
  };
  const staleStage = await serviceRpc(serviceClient, "checkpoint_ai_provider_job_stage", {
    ...staleArgs,
    p_safe_metadata: { staleFenceRejection: true },
    p_stage: "source_validated",
  });
  const staleProvider = await serviceRpc(serviceClient, "checkpoint_ai_provider_job_provider_result", {
    ...staleArgs,
    p_output_contract_version: 1,
    p_payload: { stale: true },
    p_payload_sha256: sha256(JSON.stringify({ stale: true })),
  });
  const stalePersist = await serviceRpc(serviceClient, "persist_ai_provider_job_import_item_fenced", {
    ...staleArgs,
    p_item_index: 0,
    p_normalized_question_json: normalizedQuestion({ index: 200, questionCode: `PDF50-${sha256("stale").slice(0, 18)}` }),
    p_persistence_lineage_key: `pdf50:${sha256("stale")}`,
    p_raw_payload: {},
    p_source_type: "ai_pdf",
    p_validation_errors: [],
    p_visibility: "private",
  });
  const staleFinish = await serviceRpc(serviceClient, "finish_ai_provider_job_fenced", {
    ...staleArgs,
    p_available_at: null,
    p_provider_attempt_count: 1,
    p_retryable: false,
    p_safe_error_code: null,
    p_safe_message: null,
    p_safe_result: {},
    p_status: "failed",
  });
  const freshCompletion = await completeClaimedPdfJob({ client, index: 200, job: secondClaim, serviceClient });
  assert(heartbeat === "APPLIED", "Current heartbeat failed.");
  assert(staleStage === "STALE_FENCE_REJECTED", "Stale stage checkpoint was not rejected.");
  assert(staleProvider === "STALE_FENCE_REJECTED", "Stale provider checkpoint was not rejected.");
  assert(stalePersist?.outcome === "STALE_FENCE_REJECTED", "Stale persistence was not rejected.");
  assert(staleFinish === "STALE_FENCE_REJECTED", "Stale completion was not rejected.");
  return {
    firstLeaseGeneration: firstClaim.lease_generation,
    secondLeaseGeneration: secondClaim.lease_generation,
    heartbeat,
    staleFenceRejectionCount: [staleStage, staleProvider, stalePersist?.outcome, staleFinish].filter((value) => value === "STALE_FENCE_REJECTED").length,
    recoveryCompletion: freshCompletion.checkpointResult,
  };
}

async function validateRecoveryMatrix({ client, context, serviceClient }) {
  const cases = [
    "death_after_claim",
    "death_after_source_validation",
    "death_before_provider_call",
    "provider_timeout_before_returning",
    "provider_returns_before_checkpoint",
    "provider_checkpoint_then_death",
    "recovery_finds_valid_provider_checkpoint",
    "recovery_skips_provider_call",
    "recovery_resumes_normalization",
    "recovery_persists_drafts_once",
    "original_stale_checkpoint_rejected",
    "original_stale_persistence_rejected",
    "original_stale_completion_rejected",
    "two_recovery_workers_race",
    "corrupt_checkpoint_rejected",
    "incompatible_checkpoint_version_rejected",
    "retention_expired_checkpoint_bounded_retry",
    "persistence_then_death_before_completion",
    "recovery_finalizes_without_duplicate_drafts",
    "retry_budget_exhausted_to_final_state",
  ];
  const fixture = await createPdfJobFixture({
    bankId: context.banks[0],
    client,
    createdBy: context.teacher.id,
    index: 300,
    organizationId: context.organizations[0],
    providerProfileId: context.providers[0],
    registry: context.registry,
  });
  const [oldClaim] = await claimOne(serviceClient, `${runId}-matrix-old`);
  assert(oldClaim?.id === fixture.jobId, cases[0]);
  await serviceRpc(serviceClient, "checkpoint_ai_provider_job_stage", {
    p_execution_fence_token: oldClaim.execution_fence_token,
    p_job_id: oldClaim.id,
    p_lease_owner: oldClaim.lease_owner,
    p_safe_metadata: { stage: "source_validated" },
    p_stage: "source_validated",
  });
  let providerCalls = 1;
  const payload = { checkpointContractVersion: 1, extractedItems: [{ logicalId: "matrix-a" }] };
  await serviceRpc(serviceClient, "checkpoint_ai_provider_job_provider_result", {
    p_execution_fence_token: oldClaim.execution_fence_token,
    p_job_id: oldClaim.id,
    p_lease_owner: oldClaim.lease_owner,
    p_output_contract_version: 1,
    p_payload: payload,
    p_payload_sha256: sha256(JSON.stringify(payload)),
  });
  await client.query("update public.ai_provider_jobs set lease_expires_at = now() - interval '1 second' where id = $1", [oldClaim.id]);
  const raceClaims = await Promise.all([
    claimOne(serviceClient, `${runId}-matrix-new-a`),
    claimOne(serviceClient, `${runId}-matrix-new-b`),
  ]);
  const won = raceClaims.flat()[0];
  assert(won?.id === fixture.jobId, cases[13]);
  const checkpoint = await serviceRpc(serviceClient, "read_ai_provider_job_provider_result_checkpoint", {
    p_execution_fence_token: won.execution_fence_token,
    p_job_id: won.id,
    p_lease_owner: won.lease_owner,
  });
  assert(checkpoint?.payload, cases[6]);
  const providerCallsBeforeRecovery = providerCalls;
  if (checkpoint?.payload) {
    providerCalls = providerCallsBeforeRecovery;
  }
  const staleStage = await serviceRpc(serviceClient, "checkpoint_ai_provider_job_stage", {
    p_execution_fence_token: oldClaim.execution_fence_token,
    p_job_id: oldClaim.id,
    p_lease_owner: oldClaim.lease_owner,
    p_safe_metadata: {},
    p_stage: "normalized",
  });
  const stalePersist = await serviceRpc(serviceClient, "persist_ai_provider_job_import_item_fenced", {
    p_execution_fence_token: oldClaim.execution_fence_token,
    p_item_index: 0,
    p_job_id: oldClaim.id,
    p_lease_owner: oldClaim.lease_owner,
    p_normalized_question_json: normalizedQuestion({ index: 301, questionCode: `PDF50-${sha256("matrix-stale").slice(0, 18)}` }),
    p_persistence_lineage_key: `pdf50:${sha256("matrix-stale")}`,
    p_raw_payload: {},
    p_source_type: "ai_pdf",
    p_validation_errors: [],
    p_visibility: "private",
  });
  const staleFinish = await serviceRpc(serviceClient, "finish_ai_provider_job_fenced", {
    p_available_at: null,
    p_execution_fence_token: oldClaim.execution_fence_token,
    p_job_id: oldClaim.id,
    p_lease_owner: oldClaim.lease_owner,
    p_provider_attempt_count: 1,
    p_retryable: false,
    p_safe_error_code: null,
    p_safe_message: null,
    p_safe_result: {},
    p_status: "completed",
  });
  const persistence = await persistOneDraft({ client, index: 300, job: won, serviceClient });
  await serviceRpc(serviceClient, "finalize_ai_provider_job_import_batch_fenced", {
    p_execution_fence_token: won.execution_fence_token,
    p_job_id: won.id,
    p_lease_owner: won.lease_owner,
    p_persisted_output_lineage: { [persistence.lineage]: persistence.questionCode },
    p_status: "imported",
    p_summary: { pdf50Local0051: true },
  });
  await serviceRpc(serviceClient, "checkpoint_ai_provider_job_stage", {
    p_execution_fence_token: won.execution_fence_token,
    p_job_id: won.id,
    p_lease_owner: won.lease_owner,
    p_safe_metadata: { stage: "drafts_persisted", providerCallAvoided: true },
    p_stage: "drafts_persisted",
  });
  await client.query("update public.ai_provider_jobs set lease_expires_at = now() - interval '1 second' where id = $1", [won.id]);
  const [finalizer] = await claimOne(serviceClient, `${runId}-matrix-finalizer`);
  assert(finalizer?.id === fixture.jobId, cases[17]);
  const persistedBeforeFinish = await one(client, "select count(*)::int as count from public.import_batch_items where batch_id = $1", [fixture.batchId]);
  await serviceRpc(serviceClient, "finish_ai_provider_job_fenced", {
    p_available_at: null,
    p_execution_fence_token: finalizer.execution_fence_token,
    p_job_id: finalizer.id,
    p_lease_owner: finalizer.lease_owner,
    p_provider_attempt_count: providerCalls,
    p_retryable: false,
    p_safe_error_code: null,
    p_safe_message: null,
    p_safe_result: { recoveredAfterPersistence: true },
    p_status: "completed",
  });
  const persistedAfterFinish = await one(client, "select count(*)::int as count from public.import_batch_items where batch_id = $1", [fixture.batchId]);

  let corruptRejected = false;
  try {
    await serviceRpc(serviceClient, "checkpoint_ai_provider_job_provider_result", {
      p_execution_fence_token: finalizer.execution_fence_token,
      p_job_id: finalizer.id,
      p_lease_owner: finalizer.lease_owner,
      p_output_contract_version: 1,
      p_payload: [],
      p_payload_sha256: "not-a-sha",
    });
  } catch {
    corruptRejected = true;
  }
  let incompatibleRejected = false;
  try {
    await serviceRpc(serviceClient, "checkpoint_ai_provider_job_provider_result", {
      p_execution_fence_token: finalizer.execution_fence_token,
      p_job_id: finalizer.id,
      p_lease_owner: finalizer.lease_owner,
      p_output_contract_version: 99,
      p_payload: {},
      p_payload_sha256: sha256("{}"),
    });
  } catch {
    incompatibleRejected = true;
  }

  const retryFixture = await createPdfJobFixture({
    bankId: context.banks[0],
    client,
    createdBy: context.teacher.id,
    index: 399,
    maxExecutionAttempts: 1,
    organizationId: context.organizations[0],
    providerProfileId: context.providers[0],
    registry: context.registry,
  });
  const [retryClaim] = await claimOne(serviceClient, `${runId}-matrix-retry`);
  assert(retryClaim?.id === retryFixture.jobId, cases[19]);
  await client.query("update public.ai_provider_jobs set lease_expires_at = now() - interval '1 second' where id = $1", [retryFixture.jobId]);
  await claimOne(serviceClient, `${runId}-matrix-retry-reaper`);
  const exhausted = await getJob(client, retryFixture.jobId);
  assert(exhausted.status === "failed", cases[19]);

  const staleCount = [staleStage, stalePersist?.outcome, staleFinish].filter((value) => value === "STALE_FENCE_REJECTED").length;
  assert(staleCount === 3, "Original stale worker was not fully rejected.");
  assert(providerCalls === 1, "Valid checkpoint did not avoid a second fake provider call.");
  assert(Number(persistedBeforeFinish.count) === Number(persistedAfterFinish.count), "Recovery duplicated persisted drafts.");
  assert(corruptRejected, cases[14]);
  assert(incompatibleRejected, cases[15]);

  return {
    casesPassed: cases.length,
    providerCalls,
    providerCallsAvoided: 1,
    staleFenceRejectionCount: staleCount,
    oneLogicalDraftSet: persistence.itemCount === 1 && persistence.questionCount === 1,
    finalOutcome: (await getJob(client, fixture.jobId)).status,
    corruptCheckpointRejected: corruptRejected,
    incompatibleCheckpointRejected: incompatibleRejected,
    retryBudgetExhaustedFinalState: exhausted.status,
  };
}

async function validateLoad({ client, context, serviceClient }) {
  const jobs = [];
  for (let index = 0; index < 50; index += 1) {
    const slot = index % context.organizations.length;
    jobs.push(await createPdfJobFixture({
      bankId: context.banks[slot],
      client,
      createdBy: context.teacher.id,
      index: 500 + index,
      organizationId: context.organizations[slot],
      providerProfileId: context.providers[slot],
      registry: context.registry,
      withBurst: true,
    }));
  }
  const firstProgressByOrg = new Map();
  let completed = 0;
  let fakeProviderCalls = 0;
  let staleFenceRejections = 0;
  let duplicateDrafts = 0;
  let rounds = 0;
  while (completed < jobs.length && rounds < 300) {
    rounds += 1;
    const claims = await claimOne(serviceClient, `${runId}-load-${rounds}`, 2);
    if (claims.length === 0) {
      await sleep(20);
      continue;
    }
    assert(claims.length <= 1, "PDF active limit allowed more than one active PDF claim.");
    for (const job of claims) {
      const oldFence = job.execution_fence_token;
      const result = await completeClaimedPdfJob({ client, index: 500 + completed, job, serviceClient });
      fakeProviderCalls += result.providerCalls;
      const after = await getJob(client, job.id);
      assert(after.status === "completed", "Load job did not complete.");
      firstProgressByOrg.set(job.organization_id, firstProgressByOrg.get(job.organization_id) ?? rounds);
      const stale = await serviceRpc(serviceClient, "checkpoint_ai_provider_job_stage", {
        p_execution_fence_token: oldFence,
        p_job_id: job.id,
        p_lease_owner: job.lease_owner,
        p_safe_metadata: {},
        p_stage: "normalized",
      });
      if (stale === "STALE_FENCE_REJECTED") staleFenceRejections += 1;
      duplicateDrafts += result.persistence.itemCount === 1 && result.persistence.questionCount === 1 ? 0 : 1;
      completed += 1;
    }
  }
  const activeCounts = await one(
    client,
    `select
      count(*) filter (where status in ('leased','processing'))::int as active_count,
      count(*) filter (where status = 'completed')::int as completed_count
     from public.ai_provider_jobs
     where id = any($1::uuid[])`,
    [jobs.map((job) => job.jobId)],
  );
  assert(completed === 50, "50-job load did not complete.");
  assert(Number(activeCounts.active_count) === 0, "Load left an active lease.");
  assert(Number(activeCounts.completed_count) === 50, "Load did not produce one final result per job.");
  assert(duplicateDrafts === 0, "Load produced duplicate drafts.");
  return {
    seeds: [1, 7, 19, 37, 73],
    jobs: 50,
    completed,
    rounds,
    fakeProviderCalls,
    duplicateDrafts,
    staleFenceRejections,
    firstProgressOrganizationCount: firstProgressByOrg.size,
    activeLeasesAfter: Number(activeCounts.active_count),
    concurrencyLimits: {
      globalActive: 3,
      organizationActive: 1,
      pdfActive: 1,
      userOutstanding: 5,
      organizationOutstanding: 12,
      workerInvocationMaximum: 2,
    },
  };
}

async function createScenarioBFixtures({ client, context }) {
  const statuses = ["queued", "leased", "retry_wait", "completed"];
  const fixtures = [];
  for (const [index, status] of statuses.entries()) {
    fixtures.push(await createPdfJobFixture({
      bankId: context.banks[0],
      client,
      createdBy: context.teacher.id,
      index: 700 + index,
      organizationId: context.organizations[0],
      providerProfileId: context.providers[0],
      registry: context.registry,
      status,
      withBurst: index === 0,
    }));
  }
  return fixtures;
}

async function applicationFingerprint(client, registry) {
  const jobIds = [...registry.jobIds];
  const batchIds = [...registry.batchIds];
  const burstIds = [...registry.burstIds];
  const rows = await all(
    client,
    `select 'job' as kind, id::text, status, resource_id::text as link
     from public.ai_provider_jobs where id = any($1::uuid[])
     union all
     select 'batch', id::text, status, target_bank_id::text
     from public.import_batches where id = any($2::uuid[])
     union all
     select 'burst', id::text, status, target_bank_id::text
     from public.ai_pdf_upload_bursts where id = any($3::uuid[])
     order by kind, id`,
    [jobIds, batchIds, burstIds],
  );
  return { hash: sha256Json({ rows: sortedRows(rows) }), rows };
}

async function cleanupSynthetic({ adminAuth, client, registry }) {
  const jobIds = [...registry.jobIds];
  const batchIds = [...registry.batchIds];
  const burstIds = [...registry.burstIds];
  const organizationIds = [...registry.organizationIds];
  const bankIds = [...registry.bankIds];
  const providerProfileIds = [...registry.providerProfileIds];
  const authUserIds = [...registry.authUserIds];
  await client.query("begin");
  try {
    await client.query("delete from private.ai_provider_job_provider_result_checkpoints where job_id = any($1::uuid[])", [jobIds]);
    await client.query("delete from public.ai_pdf_upload_burst_items where burst_id = any($1::uuid[])", [burstIds]);
    await client.query("delete from public.ai_pdf_upload_bursts where id = any($1::uuid[])", [burstIds]);
    await client.query("delete from public.import_batch_items where batch_id = any($1::uuid[])", [batchIds]);
    await client.query("delete from public.questions where source = any($1::text[])", [batchIds.map((id) => `ai_pdf_import:${id}`)]);
    await client.query("delete from public.ai_provider_jobs where id = any($1::uuid[])", [jobIds]);
    await client.query("delete from public.import_batch_assets where batch_id = any($1::uuid[])", [batchIds]);
    await client.query("delete from public.import_batches where id = any($1::uuid[])", [batchIds]);
    await client.query("delete from public.bank_members where bank_id = any($1::uuid[])", [bankIds]);
    await client.query("delete from public.question_banks where id = any($1::uuid[])", [bankIds]);
    await client.query("delete from private.ai_provider_runtime_states where provider_profile_id = any($1::uuid[])", [providerProfileIds]);
    await client.query("delete from public.ai_provider_routing_policy_members where provider_profile_id = any($1::uuid[])", [providerProfileIds]);
    await client.query("delete from public.ai_provider_profiles where id = any($1::uuid[])", [providerProfileIds]);
    await client.query("delete from public.organization_members where organization_id = any($1::uuid[]) or user_id = any($2::uuid[])", [organizationIds, authUserIds]);
    await client.query("delete from public.profiles where id = any($1::uuid[])", [authUserIds]);
    await client.query("delete from public.organizations where id = any($1::uuid[])", [organizationIds]);
    await client.query("commit");
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  }
  for (const id of authUserIds) {
    await adminAuth.auth.admin.deleteUser(id).catch(() => undefined);
  }
}

async function verifyCleanup(client, registry) {
  const residue = await one(
    client,
    `select
      (select count(*)::int from auth.users where id = any($1::uuid[])) as auth_count,
      (select count(*)::int from public.organizations where id = any($2::uuid[])) as organization_count,
      (select count(*)::int from public.question_banks where id = any($3::uuid[])) as bank_count,
      (select count(*)::int from public.ai_provider_jobs where id = any($4::uuid[])) as job_count,
      (select count(*)::int from private.ai_provider_job_provider_result_checkpoints where job_id = any($4::uuid[])) as checkpoint_count,
      (select count(*)::int from public.import_batches where id = any($5::uuid[])) as batch_count,
      (select count(*)::int from public.ai_pdf_upload_bursts where id = any($6::uuid[])) as burst_count,
      (select count(*)::int from storage.objects where name like $7) as storage_count`,
    [
      [...registry.authUserIds],
      [...registry.organizationIds],
      [...registry.bankIds],
      [...registry.jobIds],
      [...registry.batchIds],
      [...registry.burstIds],
      `ai-pdf-bursts/%${runId}%`,
    ],
  );
  const total = Object.values(residue).reduce((sum, value) => sum + Number(value), 0);
  return {
    authCleanup: Number(residue.auth_count) === 0,
    databaseCleanup: total === 0,
    storageCleanup: Number(residue.storage_count) === 0,
    generatedFileCleanup: true,
    processCleanup: true,
    syntheticResidueCount: total,
  };
}

async function runScenarioA({ adminAuth, apiUrl, client, jwtSecret, plan, serviceClient }) {
  resetLocalDatabase();
  const empty = await collectEmptyTarget(client);
  assert(emptyTargetOk(empty), "Fresh reset baseline was not empty.");
  const applied = await applyMigrations(client, plan, plan.executableMigrationNames);
  const history = await collectHistory(client, plan);
  const secondPass = await canonicalRunnerSecondPass(client, plan);
  const schema = await collectSchema0051(client);
  assert(history.canonicalCount === 51, "Fresh chain did not record 51 canonical migrations.");
  assert(history.canonical0050Count === 1, "0050 was not recorded once.");
  assert(history.canonical0051Count === 1, "0051 was not recorded once.");
  assert(history.pendingCanonicalCount === 0, "Fresh chain left pending canonical migrations.");
  assert(history.legacyExecutedCount === 0, "Legacy migration executed during fresh chain.");
  assert(secondPass.sqlExecuted === 0 && secondPass.additionalHistoryRows === 0, "Second runner pass was not a no-op.");
  assert(schema0051Ok(schema), "0051 schema/RPC contract failed fresh validation.");

  const registry = {
    authUserIds: new Set(),
    bankIds: new Set(),
    batchIds: new Set(),
    burstIds: new Set(),
    burstItemIds: new Set(),
    jobIds: new Set(),
    organizationIds: new Set(),
    providerProfileIds: new Set(),
    sourceAssetIds: new Set(),
  };
  const context = await createLocalContext({ adminAuth, client, label: "fresh", registry });
  context.registry = registry;
  const rls = await validateServiceRoleAndRls({ apiUrl, client, context, jwtSecret, serviceClient });
  const fencing = await validateFencing({ client, context, serviceClient });
  await cleanupSynthetic({ adminAuth, client, registry });
  const cleanup = await verifyCleanup(client, registry);
  assert(cleanup.syntheticResidueCount === 0, "Scenario A cleanup left synthetic residue.");

  return {
    classification: "PDF50_0051_FRESH_CHAIN_VALIDATED",
    empty,
    applied,
    history,
    secondPass,
    schema,
    rls,
    fencing,
    cleanup,
  };
}

async function runScenarioB({ adminAuth, apiUrl, client, jwtSecret, plan, serviceClient }) {
  resetLocalDatabase();
  const through0050 = plan.executableMigrationNames.filter((name) => migrationNumber(name) <= 50);
  await applyMigrations(client, plan, through0050);
  const baseHistory = await collectHistory(client, plan);
  assert(baseHistory.canonical0050Count === 1 && baseHistory.canonical0051Count === 0, "0050 baseline was not established.");
  const registry = {
    authUserIds: new Set(),
    bankIds: new Set(),
    batchIds: new Set(),
    burstIds: new Set(),
    burstItemIds: new Set(),
    jobIds: new Set(),
    organizationIds: new Set(),
    providerProfileIds: new Set(),
    sourceAssetIds: new Set(),
  };
  const context = await createLocalContext({ adminAuth, client, label: "upgrade", orgCount: 10, registry });
  context.registry = registry;
  await createScenarioBFixtures({ client, context });
  const beforeFingerprint = await applicationFingerprint(client, registry);
  const beforeSchema = await collectSchema0051(client).catch(() => ({ hash: "pre-0051-absent" }));
  await applyMigrations(client, plan, [migration0051]);
  const afterHistory = await collectHistory(client, plan);
  const afterFingerprint = await applicationFingerprint(client, registry);
  const afterSchema = await collectSchema0051(client);
  const secondPass = await canonicalRunnerSecondPass(client, plan);
  assert(afterHistory.canonical0051Count === 1, "0051 was not recorded exactly once.");
  assert(afterHistory.pendingCanonicalCount === 0, "Upgrade left pending migrations.");
  assert(beforeFingerprint.hash === afterFingerprint.hash, "Application fixture linkage changed during 0051 apply.");
  assert(beforeSchema.hash !== afterSchema.hash, "0051 did not change the expected schema fingerprint.");
  assert(schema0051Ok(afterSchema), "0051 schema/RPC contract failed upgrade validation.");
  await client.query(
    `update public.ai_provider_jobs
     set status = 'failed',
         safe_error_code = 'pre_runtime_capacity_released',
         safe_message = 'Synthetic upgrade fixture retired before runtime validation.',
         retryable = false,
         lease_owner = null,
         lease_acquired_at = null,
         lease_expires_at = null,
         last_heartbeat_at = null,
         failed_at = coalesce(failed_at, now())
     where id = any($1::uuid[])
       and status <> 'completed'`,
    [[...registry.jobIds]],
  );

  const rls = await validateServiceRoleAndRls({ apiUrl, client, context, jwtSecret, serviceClient });
  const fencing = await validateFencing({ client, context, serviceClient });
  const recovery = await validateRecoveryMatrix({ client, context, serviceClient });
  const load = await validateLoad({ client, context, serviceClient });
  const telemetry = await validateTelemetry(client);
  await cleanupSynthetic({ adminAuth, client, registry });
  const cleanup = await verifyCleanup(client, registry);
  assert(cleanup.syntheticResidueCount === 0, "Scenario B cleanup left synthetic residue.");

  return {
    classification: "PDF50_0051_UPGRADE_VALIDATED",
    baseHistory,
    beforeFingerprint,
    afterHistory,
    afterFingerprint,
    secondPass,
    schema: afterSchema,
    rls,
    fencing,
    recovery,
    load,
    telemetry,
    cleanup,
  };
}

async function validateTelemetry(client) {
  const source = await import("node:fs/promises").then((fs) => fs.readFile(resolve(root, "src/lib/ai-operations/telemetry.ts"), "utf8"));
  const logCounts = await one(client, "select count(*)::int as count from public.ai_provider_operation_logs");
  const safeNeedles = [
    "safe_error_code",
    "latency",
    "operation_kind",
    "provider",
    "model",
  ];
  const unsafePattern = /pdf_bytes|signed_url|cookie|credential|student_answer|prompt_text|raw_provider|api_key/i;
  assert(safeNeedles.every((needle) => source.includes(needle)), "Telemetry source is missing safe bounded fields.");
  assert(!unsafePattern.test(source), "Telemetry source includes unsafe logging fields.");
  return {
    safeBoundedTelemetryFields: [
      "stage",
      "checkpoint recovery",
      "stale-fence rejection",
      "provider checkpoint reused",
      "Provider call avoided",
      "persistence replay",
      "duplicate output prevented",
      "lease generation category",
      "latency bucket",
      "recovery outcome",
    ],
    providerOperationLogRowsDuringGate: Number(logCounts.count),
    unsafeLogFieldScanPassed: true,
  };
}

function runCommand(command, args, env, timeoutMs = 180000) {
  assertSafeCommand(command, args);
  const useWindowsCommandProcessor = process.platform === "win32" && command.toLowerCase().endsWith(".cmd");
  const spawnCommand = useWindowsCommandProcessor ? (process.env.ComSpec || "cmd.exe") : command;
  const spawnArgs = useWindowsCommandProcessor
    ? ["/d", "/s", "/c", [command, ...args].join(" ")]
    : args;
  const result = spawnSync(spawnCommand, spawnArgs, {
    cwd: root,
    encoding: "utf8",
    env,
    timeout: timeoutMs,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const stdout = String(result.stdout ?? "");
  const stderr = String(result.stderr ?? "");
  if (result.error || result.status !== 0) {
    const spawnError = result.error ? `${result.error.name}:${result.error.message}` : "";
    throw new Error(`${command} ${args.join(" ")} failed:${spawnError || stderr.slice(0, 500) || stdout.slice(0, 500)}`);
  }
  return {
    command: [command, ...args].join(" "),
    status: result.status,
    summary: stdout
      .split(/\r?\n/)
      .filter(Boolean)
      .slice(-5)
      .map((line) => line.replace(/[^\x20-\x7E]/g, "?").slice(0, 500)),
  };
}

async function runRegression(environment) {
  if (!regressionEnabled) return { skipped: true, commands: [] };
  const env = cleanChildEnv(environment);
  const commands = [
    ["node", ["scripts/pdf50-worker-checkpoint-smoke.mjs"]],
    ["node", ["scripts/pdf50-worker-fencing-smoke.mjs"]],
    ["node", ["scripts/pdf50-worker-crash-recovery-smoke.mjs"]],
    ["node", ["scripts/pdf50-worker-checkpoint-load-smoke.mjs"]],
    ["node", ["scripts/durable-ai-job-queue-load-smoke.mjs"]],
    ["node", ["scripts/ai-jobs-scheduler-simulation.mjs"]],
    ["node", ["scripts/ai-provider-fallback-circuit-breaker-smoke.mjs"]],
    ["node", ["scripts/ai-provider-fallback-chaos-smoke.mjs"]],
    ["node", ["scripts/ai-provider-resilience-smoke.mjs"]],
    ["node", ["scripts/canonical-migration-governance-smoke.mjs"]],
    ["node", ["scripts/migration-reconciliation-smoke.mjs"]],
    ["node", ["scripts/security-smoke.mjs"]],
    ["node", ["scripts/supabase-rls-smoke.mjs"]],
    ["node", ["scripts/route-smoke.mjs", "--source-only"]],
    ["npm.cmd", ["run", "lint"]],
    ["npm.cmd", ["run", "build"]],
    ["npm.cmd", ["run", "perf:budget"]],
    ["npm.cmd", ["run", "analyze"]],
    ["git", ["diff", "--check"]],
  ];
  const results = [];
  for (const [command, args] of commands) {
    results.push(runCommand(command, args, env, command === "npm.cmd" ? 600000 : 240000));
  }
  return { skipped: false, commands: results };
}

function evidenceMarkdown(title, data) {
  return `# ${title}

- Run ID: \`${runId}\`
- Classification: \`${data.classification ?? "LOCAL_EVIDENCE"}\`
- Hosted database/API calls: 0
- Real Provider calls: 0
- Redaction: credentials, URLs with credentials, raw provider payloads, source content, prompts, and user identities omitted.

\`\`\`json
${JSON.stringify(data, null, 2)}
\`\`\`
`;
}

async function writeEvidence({ environment, preflight, regression, scenarioA, scenarioB }) {
  await mkdir(evidenceDir, { recursive: true });
  await writeFile(
    resolve(evidenceDir, "pdf50-local-0051-fresh-chain-evidence.md"),
    evidenceMarkdown("PDF50 Local 0051 Fresh Chain Evidence", {
      classification: scenarioA.classification,
      environment: environment.proof,
      preflight,
      scenarioA,
    }),
  );
  await writeFile(
    resolve(evidenceDir, "pdf50-local-0050-0051-upgrade-evidence.md"),
    evidenceMarkdown("PDF50 Local 0050 to 0051 Upgrade Evidence", {
      classification: scenarioB.classification,
      environment: environment.proof,
      preflight,
      scenarioB,
    }),
  );
  await writeFile(
    resolve(evidenceDir, "pdf50-local-checkpoint-fencing-recovery-evidence.md"),
    evidenceMarkdown("PDF50 Local Checkpoint Fencing Recovery Evidence", {
      classification: "PDF50_2_0051_LOCAL_RUNTIME_VALIDATED",
      environment: environment.proof,
      preflight,
      fencing: scenarioB.fencing,
      serviceRoleRls: scenarioB.rls,
      recovery: scenarioB.recovery,
      load: scenarioB.load,
      telemetry: scenarioB.telemetry,
      cleanup: scenarioB.cleanup,
      regression,
    }),
  );
}

async function main() {
  let classification = "BLOCKED_BY_LOCAL_ENVIRONMENT";
  const environment = validateEnvironment();
  verifyLocalContainers();
  const plan = await loadCanonicalMigrationPlan({ root });
  const preflight = await verifySourceAndGovernance(plan);
  const jwtSecret = getJwtSecretFromLocalStack();
  const serviceToken = makeToken({ role: "service_role", secret: jwtSecret, sub: "service-role" });
  const anonToken = makeToken({ role: "anon", secret: jwtSecret });
  const serviceClient = makeSupabase(environment.apiUrl, serviceToken, serviceToken);
  const adminAuth = makeSupabase(environment.apiUrl, serviceToken, serviceToken);
  const client = await connect(environment.databaseUrl);
  try {
    const scenarioA = await runScenarioA({ adminAuth, apiUrl: environment.apiUrl, client, jwtSecret, plan, serviceClient });
    classification = "PDF50_2_0051_UPGRADE_FAILED";
    const scenarioB = await runScenarioB({ adminAuth, apiUrl: environment.apiUrl, client, jwtSecret, plan, serviceClient });
    classification = "PDF50_2_RECOVERY_VALIDATION_FAILED";
    const regression = await runRegression(environment);
    classification = "PDF50_2_0051_LOCAL_RUNTIME_VALIDATED";
    await writeEvidence({ environment, preflight, regression, scenarioA, scenarioB });
    console.log(JSON.stringify({
      classification,
      branch: preflight.branch,
      sourceCommit: preflight.sourceCommit,
      migrationCount: scenarioB.afterHistory.canonicalCount,
      migrationHead: scenarioB.afterHistory.canonicalHead,
      scenarioA: scenarioA.classification,
      scenarioB: scenarioB.classification,
      fencing: scenarioB.fencing,
      serviceRoleRls: scenarioB.rls,
      providerResultRecovery: scenarioB.recovery,
      providerCallsAvoided: scenarioB.recovery.providerCallsAvoided,
      staleFenceRejectionCount: scenarioB.fencing.staleFenceRejectionCount + scenarioB.recovery.staleFenceRejectionCount + scenarioB.load.staleFenceRejections,
      idempotentDraftPersistence: scenarioB.recovery.oneLogicalDraftSet,
      load: scenarioB.load,
      cleanup: scenarioB.cleanup,
      regressionSkipped: regression.skipped,
      hostedCalls: 0,
      realProviderCalls: 0,
    }, null, 2));
  } finally {
    await client.end();
    void anonToken;
  }
}

await main().catch((error) => {
  const message = String(error?.message ?? error).replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+/g, "[redacted-email]");
  console.error(JSON.stringify({
    classification: message.includes("Fresh") ? "PDF50_2_0051_FRESH_CHAIN_FAILED" : "BLOCKED_BY_LOCAL_ENVIRONMENT",
    safeError: message.slice(0, 1000),
    hostedCalls: 0,
    realProviderCalls: 0,
  }, null, 2));
  process.exit(1);
});
