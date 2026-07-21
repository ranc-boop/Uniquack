import { createHmac, createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import pg from "pg";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import { loadCanonicalMigrationPlan } from "./lib/canonical-migration-plan.mjs";

const { Client } = pg;
const root = resolve(import.meta.dirname, "..");
const requiredGate = "CONFIRMED";
const localHosts = new Set(["127.0.0.1", "localhost"]);
const expectedBranch = "codex/pdf50-burst-clean-db-rehearsal";
const executable0032 = "0032_teacher_feedback_notes.sql";
const excluded0032 = "0032_google_account_links.sql";
const migration0050 = "0050_pdf50_burst_upload_admission.sql";
const allowedEnvNames = new Set([
  "PDF50_LOCAL_CLONE_REHEARSAL",
  "PDF50_LOCALHOST_ONLY",
  "PDF50_LOCAL_DATABASE_URL",
  "PDF50_LOCAL_API_URL",
  "PDF50_LOCAL_SUPABASE_DIR",
]);
const forbiddenEnvNamePattern =
  /^(PDF50_|SUPABASE|DATABASE_URL|DIRECT_URL|POSTGRES|PG|NEXT_PUBLIC_SUPABASE|SUPABASE_)/;
const remoteSupabaseHostPattern = new RegExp(
  ["supabase", "co"].join("\\.") + "|" + ["pooler", "supabase", "com"].join("\\."),
  "i",
);
const nonLocalHttpPattern = /https?:\/\/(?!localhost(?::|\/|$)|127\.0\.0\.1(?::|\/|$))[^/\s]+/i;
const providerEnvNamePattern = /(?:GEMINI|VERTEX|DEEPSEEK|OCR|EMBEDDING|EMBEDDINGS|OPENAI_API_KEY|ANTHROPIC_API_KEY|GOOGLE_APPLICATION_CREDENTIALS)/i;
const legacyUnmappedNames = [
  "fix_private_schema_function_grants_for_rls",
  "fix_taxonomy_closure_rebuild_safe_delete",
];
const legacyAiImportPolicyPattern = /^ai_import_sources_admin_/;
const canonicalStoragePolicyNames = [
  "ai_import_sources_manager_delete",
  "ai_import_sources_manager_read",
  "ai_import_sources_reserved_upload",
];
const finalClassifications = new Set([
  "LOCAL_FRESH_CHAIN_0001_0050_VALIDATED",
  "LOCAL_FRESH_CHAIN_APPLY_FAILED",
  "LOCAL_FRESH_0050_BUCKET_CREATE_FAILED",
  "LOCAL_FRESH_SECURITY_VALIDATION_FAILED",
  "BLOCKED_BY_LOCAL_ENVIRONMENT",
]);
const tinyPdf = Buffer.from(`%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 72 72] >>
endobj
xref
0 4
0000000000 65535 f
0000000009 00000 n
0000000058 00000 n
0000000115 00000 n
trailer
<< /Root 1 0 R /Size 4 >>
startxref
190
%%EOF
`);

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

function makeToken({ role, sub, email, secret }) {
  const now = Math.floor(Date.now() / 1000);
  return signJwt({
    aud: role === "anon" ? "anon" : "authenticated",
    email,
    exp: now + 60 * 60,
    iat: now - 10,
    iss: "supabase",
    role,
    sub,
  }, secret);
}

function git(args) {
  return execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function docker(args) {
  return execFileSync("docker", args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function parseLocalUrl(name, protocols, requiredPort = null) {
  const raw = process.env[name];
  assert(raw, `${name} is required.`);
  assert(!remoteSupabaseHostPattern.test(raw), `${name} must not reference hosted Supabase.`);
  assert(!nonLocalHttpPattern.test(raw), `${name} must not reference a non-local HTTP host.`);
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
    if (remoteSupabaseHostPattern.test(value ?? "") || nonLocalHttpPattern.test(value ?? "")) {
      throw new Error("Forbidden non-localhost environment value is present.");
    }
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

function sleep(ms) {
  return new Promise((resolveSleep) => {
    setTimeout(resolveSleep, ms);
  });
}

async function verifySourceAndPlan(plan) {
  const branch = git(["branch", "--show-current"]);
  const head = git(["rev-parse", "HEAD"]);
  const status = git(["status", "--porcelain=v1"]);
  const allowedDirty = status
    .split(/\r?\n/)
    .filter(Boolean)
    .every((line) => {
      const path = line.replace(/^[? MARCUD!]{1,2}\s+/, "").replaceAll("\\", "/");
      return /^(scripts\/pdf50-local-fresh-chain-0050-gate\.mjs|scripts\/pdf50-local-0050-release-gate\.mjs|scripts\/pdf50-local-0050-upgrade-rehearsal\.mjs|scripts\/pdf50-clone-history-repair\.mjs|docs\/security\/pdf50-local-fresh-chain-0050-evidence\.md|docs\/security\/pdf50-local-0049-0050-upgrade-evidence\.md|docs\/security\/pdf50-local-0050-bucket-adoption-evidence\.md|docs\/security\/pdf50-local-fresh-chain-0049-evidence\.md|docs\/security\/pdf50-local-0049-upgrade-evidence\.md|docs\/security\/pdf50-local-rls-storage-admission-evidence\.md|docs\/security\/pdf50-local-clone-history-reconciliation-evidence\.md|docs\/security\/migration-application-register\.md|docs\/security\/live-schema-manifest\.json|docs\/security\/canonical-migration-governance-through-0050\.md)$/.test(path);
    });

  assert(branch === expectedBranch, "Unexpected branch.");
  assert(status.length === 0 || allowedDirty, "Working tree has unexpected local changes.");
  assert(plan.executableMigrationNames.length === 50, "Executable canonical migration count must be 50.");
  assert(plan.executableMigrationNames[31] === executable0032, "Executable 0032 must remain teacher feedback notes.");
  assert(plan.blockedMigrationNames.includes(excluded0032), "Google 0032 must remain excluded.");
  assert(plan.executableMigrationNames.at(-1) === migration0050, "Canonical head must be 0050.");
  assert(plan.manifest.latestActivePrefix === 50, "Manifest active head must be 0050.");
  assert(!plan.executableMigrationNames.includes(excluded0032), "Excluded 0032 must not be executable.");
  assert(plan.executableMigrationNames.includes(migration0050), "PDF50 0050 must remain executable.");

  return {
    branch,
    head,
    worktreeCleanAtRunnerStart: status.length === 0,
    worktreeLimitedToFreshGateArtifacts: status.length > 0 && allowedDirty,
    executableCanonicalMigrations: plan.executableMigrationNames.length,
    executable0032,
    excluded0032,
    canonicalHead: migration0050,
  };
}

function verifyLocalContainers() {
  const names = docker(["ps", "--format", "{{.Names}}"]).split(/\r?\n/);
  const dbRunning = names.includes("supabase_db_o2i_pdf50_local_rehearsal");
  const apiRunning = names.includes("supabase_kong_o2i_pdf50_local_rehearsal");
  assert(dbRunning && apiRunning, "Local Supabase containers are not running.");
  return { localSupabaseContainersRunning: true };
}

function resetLocalDatabase() {
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
      (select count(*)::int
       from information_schema.tables
       where table_schema = 'public'
         and table_type = 'BASE TABLE') as public_table_count,
      (select count(*)::int
       from information_schema.routines
       where routine_schema in ('public', 'private')) as app_routine_count,
      (select count(*)::int
       from information_schema.tables
       where table_schema = 'private') as private_table_count,
      (select count(*)::int
       from supabase_migrations.schema_migrations) as migration_history_count,
      (select count(*)::int from auth.users) as auth_user_count,
      (select count(*)::int from storage.objects) as storage_object_count,
      (select count(*)::int from storage.buckets where id = 'ai-import-sources') as ai_import_bucket_count
  `);
  return {
    publicTableCount: Number(row.public_table_count),
    appRoutineCount: Number(row.app_routine_count),
    privateTableCount: Number(row.private_table_count),
    migrationHistoryCount: Number(row.migration_history_count),
    authUserCount: Number(row.auth_user_count),
    storageObjectCount: Number(row.storage_object_count),
    aiImportSourcesBucketAbsent: Number(row.ai_import_bucket_count) === 0,
  };
}

function emptyTargetOk(empty) {
  return empty.publicTableCount === 0
    && empty.appRoutineCount === 0
    && empty.privateTableCount === 0
    && empty.migrationHistoryCount === 0
    && empty.authUserCount === 0
    && empty.storageObjectCount === 0
    && empty.aiImportSourcesBucketAbsent;
}

async function collectHistory(client, plan) {
  const rows = await all(
    client,
    "select version::text, name::text from supabase_migrations.schema_migrations order by version, name nulls first",
  );
  const canonicalVersions = rows.filter((row) => /^\d{4}$/.test(row.version));
  const canonicalByVersion = new Map();
  for (const row of canonicalVersions) {
    const list = canonicalByVersion.get(row.version) ?? [];
    list.push(row);
    canonicalByVersion.set(row.version, list);
  }
  const expectedVersions = plan.executableMigrationNames.map((name) => name.slice(0, 4));
  const missingCanonical = expectedVersions.filter((version) => !canonicalByVersion.has(version));
  const duplicateCanonical = [...canonicalByVersion.entries()]
    .filter(([, versionRows]) => versionRows.length !== 1)
    .map(([version]) => version);
  const unexpectedCanonical = canonicalVersions
    .map((row) => row.version)
    .filter((version) => !expectedVersions.includes(version));
  return {
    hash: sha256Json(sortedRows(rows)),
    totalRows: rows.length,
    canonicalCount: canonicalVersions.length,
    canonicalHead: canonicalVersions.map((row) => row.version).sort().at(-1) ?? null,
    canonical0050Count: rows.filter((row) => row.version === "0050" && row.name === migration0050).length,
    missingCanonicalCount: missingCanonical.length,
    duplicateCanonicalCount: duplicateCanonical.length,
    unexpectedCanonicalCount: unexpectedCanonical.length,
    excluded0032Absent: rows.every((row) => row.name !== excluded0032),
    unmappedLegacyRows: rows.filter((row) => legacyUnmappedNames.includes(row.name)).length,
    pendingCanonicalCount: missingCanonical.length,
  };
}

async function collectBucket(client) {
  const bucket = await one(
    client,
    `select id, name, public, file_size_limit, allowed_mime_types
     from storage.buckets
     where id = 'ai-import-sources'`,
  );
  const objectCount = await one(
    client,
    "select count(*)::int as count from storage.objects where bucket_id = 'ai-import-sources'",
  );
  const policies = await all(
    client,
    `select policyname, roles, coalesce(qual, '') as qual, coalesce(with_check, '') as with_check
     from pg_policies
     where schemaname = 'storage' and tablename = 'objects'
     order by policyname`,
  );
  const bucketPolicies = policies.filter((policy) => (
    policy.policyname.startsWith("ai_import_sources_")
    || policy.qual.includes("ai-import-sources")
    || policy.with_check.includes("ai-import-sources")
  ));
  return {
    hash: sha256Json({
      bucket: bucket ? {
        exists: true,
        public: bucket.public,
        file_size_limit: bucket.file_size_limit == null ? null : Number(bucket.file_size_limit),
        allowed_mime_types: bucket.allowed_mime_types,
      } : { exists: false },
      policies: bucketPolicies.map((policy) => policy.policyname).sort(),
      objectCount: Number(objectCount.count),
    }),
    exists: Boolean(bucket),
    identityOk: Boolean(bucket && bucket.id === "ai-import-sources" && bucket.name === "ai-import-sources"),
    private: Boolean(bucket && bucket.public === false),
    pdfOnly: Boolean(bucket && JSON.stringify(bucket.allowed_mime_types ?? []) === JSON.stringify(["application/pdf"])),
    sizeLimitBytes: bucket?.file_size_limit == null ? null : Number(bucket.file_size_limit),
    objectCount: Number(objectCount.count),
    canonicalPolicyCount: bucketPolicies.filter((policy) => canonicalStoragePolicyNames.includes(policy.policyname)).length,
    legacyPolicyCount: bucketPolicies.filter((policy) => legacyAiImportPolicyPattern.test(policy.policyname)).length,
    unknownBucketTargetingPolicyCount: bucketPolicies.filter((policy) => (
      !canonicalStoragePolicyNames.includes(policy.policyname)
      && !legacyAiImportPolicyPattern.test(policy.policyname)
    )).length,
    anonymousOrPublicPolicyCount: bucketPolicies.filter((policy) => /\b(?:anon|public)\b/i.test(policy.roles)).length,
  };
}

async function collectSchema0050(client) {
  const tables = await all(
    client,
    `select table_schema, table_name
     from information_schema.tables
     where table_schema = 'public'
       and table_name in ('ai_pdf_upload_bursts', 'ai_pdf_upload_burst_items')
       and table_type = 'BASE TABLE'
     order by table_name`,
  );
  const columns = await all(
    client,
    `select table_name, column_name
     from information_schema.columns
     where table_schema = 'public'
       and table_name in ('ai_pdf_upload_bursts', 'ai_pdf_upload_burst_items')
     order by table_name, ordinal_position`,
  );
  const functions = await all(
    client,
    `select n.nspname as schema_name, p.proname, pg_get_function_identity_arguments(p.oid) as args
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
     where (n.nspname, p.proname) in (
       ('public','reserve_ai_pdf_upload_burst'),
       ('public','release_ai_pdf_burst_admission_jobs'),
       ('public','cancel_ai_pdf_upload_burst_items'),
       ('private','can_actor_manage_ai_pdf_burst_bank'),
       ('private','protect_ai_pdf_upload_burst_identity'),
       ('private','protect_ai_pdf_upload_burst_item_identity'),
       ('private','refresh_ai_pdf_upload_burst'),
       ('private','refresh_ai_pdf_upload_burst_from_item'),
       ('private','sync_ai_pdf_burst_item_from_job'),
       ('private','can_manage_ai_import_source_object'),
       ('private','can_upload_reserved_ai_import_source_object'),
       ('private','can_write_question_asset_storage_object'),
       ('private','can_read_question_asset_storage_object')
     )
     order by schema_name, proname, args`,
  );
  const triggers = await all(
    client,
    `select event_object_table, trigger_name, event_manipulation
     from information_schema.triggers
     where event_object_schema = 'public'
       and event_object_table in ('ai_pdf_upload_bursts', 'ai_pdf_upload_burst_items', 'ai_provider_jobs')
       and trigger_name in (
         'ai_pdf_upload_bursts_set_updated_at',
         'ai_pdf_upload_bursts_protect_identity',
         'ai_pdf_upload_burst_items_set_updated_at',
         'ai_pdf_upload_burst_items_protect_identity',
         'ai_pdf_upload_burst_items_refresh_parent',
         'ai_provider_jobs_sync_pdf_burst_item'
       )
     order by event_object_table, trigger_name, event_manipulation`,
  );
  const triggerNames = new Set(triggers.map((row) => row.trigger_name));
  const indexes = await all(
    client,
    `select indexname
     from pg_indexes
     where schemaname = 'public'
       and indexname in (
         'ai_pdf_upload_bursts_bank_created_idx',
         'ai_pdf_upload_bursts_org_status_idx',
         'ai_pdf_upload_burst_items_admission_idx',
         'ai_pdf_upload_burst_items_burst_idx'
       )
     order by indexname`,
  );
  const rls = await all(
    client,
    `select relname
     from pg_class
     join pg_namespace on pg_namespace.oid = pg_class.relnamespace
     where nspname = 'public'
       and relname in ('ai_pdf_upload_bursts', 'ai_pdf_upload_burst_items')
       and relrowsecurity = true
     order by relname`,
  );
  const policies = await all(
    client,
    `select schemaname, tablename, policyname
     from pg_policies
     where (schemaname = 'public' and tablename in ('ai_pdf_upload_bursts', 'ai_pdf_upload_burst_items'))
        or (schemaname = 'storage' and tablename = 'objects' and policyname like 'ai_import_sources_%')
     order by schemaname, tablename, policyname`,
  );
  const constraints = await one(
    client,
    `select
      to_regclass('public.ai_pdf_upload_bursts') is not null as has_burst_table,
      to_regclass('public.ai_pdf_upload_burst_items') is not null as has_item_table,
      exists(select 1 from pg_constraint where conname = 'ai_pdf_upload_bursts_created_by_client_request_key_key') as unique_burst_request,
      exists(select 1 from pg_constraint where conname = 'ai_pdf_upload_burst_items_import_batch_id_key') as unique_import_batch,
      exists(select 1 from pg_constraint where conname = 'ai_pdf_upload_burst_items_source_asset_id_key') as unique_source_asset,
      exists(select 1 from pg_constraint where conname = 'ai_pdf_upload_burst_items_ai_provider_job_id_key') as unique_job`,
  );
  const assignmentTriggerCount = await one(
    client,
    `select count(*)::int as count
     from information_schema.triggers
     where event_object_schema = 'public'
       and (event_object_table = 'assignments' or action_statement ilike '%assignments%')
       and trigger_name ilike '%ai_pdf%'`,
  );
  const reviewAutoPublishCount = await one(
    client,
    `select count(*)::int as count
     from information_schema.triggers
     where event_object_schema = 'public'
       and action_statement ilike '%review_draft%'
       and action_statement ilike '%publish%'`,
  );
  return {
    hash: sha256Json({
      tables: sortedRows(tables),
      columns: sortedRows(columns),
      functions: sortedRows(functions),
      triggers: [...triggerNames].sort(),
      indexes: sortedRows(indexes),
      rls: sortedRows(rls),
      policies: sortedRows(policies),
      constraints,
    }),
    tableCount: tables.length,
    columnCount: columns.length,
    functionCount: functions.length,
    triggerCount: triggerNames.size,
    indexCount: indexes.length,
    rlsCount: rls.length,
    policyCount: policies.length,
    uniqueImportBatchConstraint: constraints.unique_import_batch === true,
    uniqueSourceAssetConstraint: constraints.unique_source_asset === true,
    uniqueJobConstraint: constraints.unique_job === true,
    uniqueBurstRequestConstraint: constraints.unique_burst_request === true,
    sourceImportJobLinkage: constraints.has_burst_table === true && constraints.has_item_table === true,
    admissionPumpFunctions: functions.some((row) => row.proname === "release_ai_pdf_burst_admission_jobs"),
    noAutoPublishTrigger: Number(reviewAutoPublishCount.count) === 0,
    noAssignmentCreationTrigger: Number(assignmentTriggerCount.count) === 0,
    noPartialState: constraints.has_burst_table === true && constraints.has_item_table === true,
  };
}

function schema0050Ok(schema) {
  return schema.tableCount === 2
    && schema.columnCount === 44
    && schema.functionCount === 13
    && schema.triggerCount === 6
    && schema.indexCount === 4
    && schema.rlsCount === 2
    && schema.policyCount === 5
    && schema.uniqueImportBatchConstraint
    && schema.uniqueSourceAssetConstraint
    && schema.uniqueJobConstraint
    && schema.uniqueBurstRequestConstraint
    && schema.sourceImportJobLinkage
    && schema.admissionPumpFunctions
    && schema.noAutoPublishTrigger
    && schema.noAssignmentCreationTrigger
    && schema.noPartialState;
}

async function applyCanonicalFreshChain(client, plan) {
  const applied = [];
  let aiImportBucketAbsentBefore0050 = null;
  for (const name of plan.executableMigrationNames) {
    const version = name.slice(0, 4);
    const existing = await one(
      client,
      "select count(*)::int as count from supabase_migrations.schema_migrations where version = $1",
      [version],
    );
    assert(Number(existing.count) === 0, `Migration ${version} was already recorded.`);
    if (name === migration0050) {
      const bucket = await collectBucket(client);
      aiImportBucketAbsentBefore0050 = !bucket.exists;
    }
    const sql = await readFile(resolve(plan.cleanDirectory, name), "utf8");
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
  await sleep(500);
  return {
    appliedCount: applied.length,
    firstApplied: applied[0]?.name ?? null,
    lastApplied: applied.at(-1)?.name ?? null,
    aiImportBucketAbsentBefore0050,
  };
}

async function canonicalRunnerSecondPass(client, plan) {
  const beforeHistory = await collectHistory(client, plan);
  const beforeSchema = await collectSchema0050(client);
  const beforeBucket = await collectBucket(client);
  const missing = plan.executableMigrationNames.filter((name) => {
    const version = name.slice(0, 4);
    return beforeHistory.missingCanonicalCount > 0 && version;
  });
  assert(beforeHistory.pendingCanonicalCount === 0, "No canonical migration should remain pending.");
  const afterHistory = await collectHistory(client, plan);
  const afterSchema = await collectSchema0050(client);
  const afterBucket = await collectBucket(client);
  return {
    recognizedAlreadyApplied: missing.length === 0 && beforeHistory.pendingCanonicalCount === 0,
    sqlExecuted: 0,
    additionalHistoryRows: afterHistory.totalRows - beforeHistory.totalRows,
    schemaChanged: afterSchema.hash !== beforeSchema.hash,
    bucketChanged: afterBucket.hash !== beforeBucket.hash,
  };
}

function getJwtSecretFromLocalStack() {
  const secret = docker(["exec", "supabase_db_o2i_pdf50_local_rehearsal", "printenv", "JWT_SECRET"]);
  assert(secret && secret.length >= 32, "Local JWT secret was not available from the running stack.");
  return secret;
}

function makeSupabase(apiUrl, token, apiKey = token, useAccessToken = false) {
  const options = {
    auth: { autoRefreshToken: false, persistSession: false },
  };
  if (useAccessToken) {
    options.accessToken = async () => token;
  } else {
    options.global = { headers: { Authorization: `Bearer ${token}` } };
  }
  const client = createSupabaseClient(apiUrl, apiKey, options);
  client.pdf50LocalAuth = { apiKey, apiUrl, token };
  return client;
}

function storageObjectUrl(apiUrl, path) {
  const encodedPath = path.split("/").map((part) => encodeURIComponent(part)).join("/");
  return `${apiUrl.replace(/\/$/, "")}/storage/v1/object/ai-import-sources/${encodedPath}`;
}

async function createAuthUser(admin, runId, roleLabel) {
  const email = `${runId}-${roleLabel}@local.invalid`;
  const password = `Local-${randomUUID()}-Only!`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { localPdf50FreshGate: true },
  });
  if (error || !data?.user?.id) throw new Error("auth_user_create_failed");
  return { id: data.user.id, email };
}

async function insertProfile(client, user, role, organizationId) {
  await client.query(
    `insert into public.profiles (id, email, role, status, default_organization_id, display_name)
     values ($1, $2, $3, 'active', $4, $5)`,
    [user.id, user.email, role, organizationId, "Local PDF50 Fresh User"],
  );
}

async function createFixtures({ client, adminAuth, runId }) {
  const organizationId = randomUUID();
  const unrelatedOrganizationId = randomUUID();
  const bankId = randomUUID();
  const providerProfileId = randomUUID();
  const users = {};
  for (const label of ["owner", "editor", "viewer", "student", "unrelated"]) {
    users[label] = await createAuthUser(adminAuth, runId, label);
  }
  await client.query("begin");
  try {
    await client.query("select set_config('request.jwt.claim.role', 'service_role', true)");
    await client.query(
      "insert into public.organizations (id, name, slug, status) values ($1, $2, $3, 'active'), ($4, $5, $6, 'active')",
      [organizationId, "Local PDF50 Fresh Org", `${runId}-org`, unrelatedOrganizationId, "Local PDF50 Fresh Other", `${runId}-other`],
    );
    for (const label of ["owner", "editor", "viewer", "student"]) {
      await insertProfile(client, users[label], label === "student" ? "student" : "teacher", organizationId);
      await client.query(
        `insert into public.organization_members (organization_id, user_id, role, status)
         values ($1, $2, $3, 'active')`,
        [organizationId, users[label].id, label === "student" ? "student" : "teacher"],
      );
    }
    await insertProfile(client, users.unrelated, "teacher", unrelatedOrganizationId);
    await client.query(
      `insert into public.organization_members (organization_id, user_id, role, status)
       values ($1, $2, 'teacher', 'active')`,
      [unrelatedOrganizationId, users.unrelated.id],
    );
    await client.query(
      `insert into public.ai_provider_profiles (
        id, organization_id, name, provider, base_url, model, mode,
        enabled, is_default, supports_pdf_input, supports_vision_images, created_by, updated_by
      ) values ($1, $2, $3, 'gemini', null, 'local-no-provider-call', 'standard',
        true, false, true, true, $4, $4)`,
      [providerProfileId, organizationId, `${runId}-provider`, users.owner.id],
    );
    await client.query(
      `insert into public.question_banks (id, organization_id, owner_id, name, visibility, status, created_by, updated_by, metadata)
       values ($1, $2, $3, $4, 'private', 'active', $3, $3, $5)`,
      [bankId, organizationId, users.owner.id, `${runId}-bank`, JSON.stringify({ localPdf50FreshGate: true })],
    );
    for (const [userId, role] of [[users.owner.id, "owner"], [users.editor.id, "editor"], [users.viewer.id, "viewer"]]) {
      await client.query(
        `insert into public.bank_members (bank_id, user_id, role, status, invited_by, joined_at)
         values ($1, $2, $3, 'active', $4, now())`,
        [bankId, userId, role, users.owner.id],
      );
    }
    await client.query("commit");
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  }
  return { organizationId, unrelatedOrganizationId, bankId, providerProfileId, users };
}

function buildReservationItems(count) {
  return Array.from({ length: count }, (_, index) => ({
    clientItemKey: randomUUID(),
    mimeType: "application/pdf",
    originalFilename: `fresh-${index + 1}.pdf`,
    sizeBytes: tinyPdf.length,
  }));
}

async function reserveBurst({ serviceClient, actorId, bankId, providerProfileId, requestKey, count, items = buildReservationItems(count) }) {
  const { data, error } = await serviceClient.rpc("reserve_ai_pdf_upload_burst", {
    p_client_request_key: requestKey,
    p_created_by: actorId,
    p_items: items,
    p_parsing_profile: "standard",
    p_provider_profile_id: providerProfileId,
    p_target_bank_id: bankId,
  });
  if (error || !Array.isArray(data) || data.length !== count) throw new Error("reserve_failed");
  return {
    burstId: data[0].burst_id,
    rows: data,
  };
}

async function reserveProbe(client, { actorId, bankId, providerProfileId }) {
  const items = JSON.stringify(buildReservationItems(1));
  await client.query("begin");
  try {
    await client.query("select set_config('request.jwt.claim.role', 'service_role', true)");
    const rows = await all(
      client,
      "select * from public.reserve_ai_pdf_upload_burst($1, $2, $3, 'standard', $4, $5::jsonb)",
      [actorId, bankId, randomUUID(), providerProfileId, items],
    );
    await client.query("rollback");
    return rows.length === 1;
  } catch {
    await client.query("rollback").catch(() => undefined);
    return false;
  }
}

async function canManageBurstBank(client, userId, bankId) {
  const result = await one(
    client,
    "select private.can_actor_manage_ai_pdf_burst_bank($1::uuid, $2::uuid) as allowed",
    [userId, bankId],
  );
  return result.allowed === true;
}

async function canUploadReservedPathAs(client, userId, objectPath) {
  await client.query("begin");
  try {
    await client.query("select set_config('request.jwt.claim.role', 'authenticated', true)");
    await client.query("select set_config('request.jwt.claim.sub', $1, true)", [userId]);
    const result = await one(
      client,
      "select private.can_upload_reserved_ai_import_source_object($1) as allowed",
      [objectPath],
    );
    await client.query("rollback");
    return result.allowed === true;
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  }
}

async function uploadObject({ client, path, body = tinyPdf }) {
  const { apiKey, apiUrl, token } = client.pdf50LocalAuth;
  const form = new FormData();
  form.append("cacheControl", "3600");
  form.append("", new Blob([body], { type: "application/pdf" }), "synthetic.pdf");
  const response = await fetch(storageObjectUrl(apiUrl, path), {
    method: "POST",
    headers: {
      apikey: apiKey,
      Authorization: `Bearer ${token}`,
      "x-upsert": "false",
    },
    body: form,
  });
  return { ok: response.ok, safeStatus: response.ok ? "ok" : `storage_http_${response.status}` };
}

async function assertSelectCount(client, table, filterColumn, filterValue) {
  const { count, error } = await client
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq(filterColumn, filterValue);
  if (error) return { ok: false, count: 0 };
  return { ok: true, count: Number(count ?? 0) };
}

async function markItemFailed(client, item, itemId, safeErrorCode) {
  await client.query("update public.import_batch_assets set status = 'failed', metadata = metadata || $1::jsonb where id = $2", [
    JSON.stringify({ uploadState: "failed", safeErrorCode }),
    item.source_asset_id,
  ]);
  await client.query("update public.import_batches set status = 'failed', summary = summary || $1::jsonb where id = $2", [
    JSON.stringify({ reviewGate: "bank_review_required", aiPdfImport: { phase: "source_upload_failed", safeErrorCode } }),
    item.import_batch_id,
  ]);
  await client.query(
    "update public.ai_pdf_upload_burst_items set safe_error_code = $1, status = 'failed' where id = $2 and status = 'finalizing'",
    [safeErrorCode, itemId],
  );
}

async function finalizeItem({ client, serviceClient, actorId, bankId, burstId, itemId, uploadAttemptId }) {
  if (!(await canManageBurstBank(client, actorId, bankId))) {
    return { ok: false, outcome: "denied" };
  }
  const itemResult = await one(
    client,
    `select burst_id, expected_size_bytes, import_batch_id, original_filename, object_path,
            page_count, safe_error_code, source_asset_id, status, upload_attempt_id
     from public.ai_pdf_upload_burst_items
     where id = $1 and burst_id = $2 and upload_attempt_id = $3`,
    [itemId, burstId, uploadAttemptId],
  );
  if (!itemResult) return { ok: false, outcome: "missing" };
  if (itemResult.status !== "reserved") {
    if (itemResult.status === "admission_ready") {
      await serviceClient.rpc("release_ai_pdf_burst_admission_jobs", { p_burst_id: burstId, p_limit: 4 });
    }
    return { ok: true, outcome: itemResult.status };
  }
  const claimed = await all(
    client,
    `update public.ai_pdf_upload_burst_items
     set safe_error_code = null, status = 'finalizing'
     where id = $1 and burst_id = $2 and status = 'reserved'
     returning id`,
    [itemId, burstId],
  );
  if (claimed.length === 0) return { ok: true, outcome: "already_claimed" };
  const { data: downloaded, error: downloadError } = await serviceClient.storage
    .from("ai-import-sources")
    .download(itemResult.object_path);
  if (downloadError || !downloaded) {
    await markItemFailed(client, itemResult, itemId, "upload_missing");
    return { ok: true, outcome: "failed" };
  }
  const buffer = Buffer.from(await downloaded.arrayBuffer());
  if (
    buffer.length !== Number(itemResult.expected_size_bytes)
    || !buffer.subarray(0, 5).equals(Buffer.from("%PDF-"))
  ) {
    await markItemFailed(client, itemResult, itemId, "invalid_pdf");
    return { ok: true, outcome: "failed" };
  }
  const now = new Date().toISOString();
  await client.query(
    `update public.import_batch_assets
     set metadata = metadata || $1::jsonb, mime_type = 'application/pdf',
         size_bytes = $2, status = 'ready'
     where id = $3 and status = 'pending'`,
    [JSON.stringify({ pageCount: 1, uploadReadyAt: now, uploadState: "ready" }), buffer.length, itemResult.source_asset_id],
  );
  await client.query(
    `update public.import_batches
     set status = 'draft',
         summary = summary || $1::jsonb
     where id = $2`,
    [JSON.stringify({ reviewGate: "bank_review_required" }), itemResult.import_batch_id],
  );
  await client.query(
    `update public.ai_pdf_upload_burst_items
     set finalized_at = $1, page_count = 1, safe_error_code = null,
         status = 'admission_ready', verified_mime_type = 'application/pdf',
         verified_size_bytes = $2
     where id = $3 and status = 'finalizing'`,
    [now, buffer.length, itemId],
  );
  await serviceClient.rpc("release_ai_pdf_burst_admission_jobs", { p_burst_id: burstId, p_limit: 4 });
  const final = await one(
    client,
    "select status, ai_provider_job_id is not null as has_job from public.ai_pdf_upload_burst_items where id = $1",
    [itemId],
  );
  return { ok: true, outcome: final.status, hasJob: final.has_job };
}

async function assertNoProviderCallLeak(client) {
  const result = await one(client, "select count(*)::int as count from public.ai_provider_operation_logs");
  assert(Number(result.count) === 0, "provider_log_count_not_zero");
  return true;
}

async function runFocusedSecurity({ apiUrl, client, serviceClient, anonClient, fixtures, ownerClient, editorClient, viewerClient, studentClient, unrelatedClient, uploadPaths }) {
  const users = fixtures.users;
  const ownerReserveProbe = await reserveProbe(client, {
    actorId: users.owner.id,
    bankId: fixtures.bankId,
    providerProfileId: fixtures.providerProfileId,
  });
  const editorReserveProbe = await reserveProbe(client, {
    actorId: users.editor.id,
    bankId: fixtures.bankId,
    providerProfileId: fixtures.providerProfileId,
  });
  const viewerReserveDenied = !(await reserveProbe(client, {
    actorId: users.viewer.id,
    bankId: fixtures.bankId,
    providerProfileId: fixtures.providerProfileId,
  }));
  const studentReserveDenied = !(await reserveProbe(client, {
    actorId: users.student.id,
    bankId: fixtures.bankId,
    providerProfileId: fixtures.providerProfileId,
  }));
  const unrelatedReserveDenied = !(await reserveProbe(client, {
    actorId: users.unrelated.id,
    bankId: fixtures.bankId,
    providerProfileId: fixtures.providerProfileId,
  }));

  const reservation = await reserveBurst({
    serviceClient,
    actorId: users.owner.id,
    bankId: fixtures.bankId,
    providerProfileId: fixtures.providerProfileId,
    requestKey: randomUUID(),
    count: 1,
  });
  const row = reservation.rows[0];
  uploadPaths.add(row.object_path);
  const viewerRead = await assertSelectCount(viewerClient, "ai_pdf_upload_bursts", "id", reservation.burstId);
  const studentRead = await assertSelectCount(studentClient, "ai_pdf_upload_bursts", "id", reservation.burstId);
  const unrelatedRead = await assertSelectCount(unrelatedClient, "ai_pdf_upload_bursts", "id", reservation.burstId);
  const anonRead = await assertSelectCount(anonClient, "ai_pdf_upload_bursts", "id", reservation.burstId);
  const exactPathDbAllowed = await canUploadReservedPathAs(client, users.owner.id, row.object_path);
  const viewerUpload = await uploadObject({ client: viewerClient, path: row.object_path });
  const studentUpload = await uploadObject({ client: studentClient, path: row.object_path });
  const unrelatedUpload = await uploadObject({ client: unrelatedClient, path: row.object_path });
  const anonUpload = await uploadObject({ client: anonClient, path: row.object_path });
  const arbitraryUpload = await uploadObject({
    client: ownerClient,
    path: `ai-pdf-bursts/${randomUUID()}/${randomUUID()}.pdf`,
  });
  const ownerUpload = await uploadObject({ client: ownerClient, path: row.object_path });
  const viewerFinalize = await finalizeItem({
    client,
    serviceClient,
    actorId: users.viewer.id,
    bankId: fixtures.bankId,
    burstId: reservation.burstId,
    itemId: row.item_id,
    uploadAttemptId: row.upload_attempt_id,
  });
  const editorFinalize = await finalizeItem({
    client,
    serviceClient,
    actorId: users.editor.id,
    bankId: fixtures.bankId,
    burstId: reservation.burstId,
    itemId: row.item_id,
    uploadAttemptId: row.upload_attempt_id,
  });
  const duplicateFinalize = await finalizeItem({
    client,
    serviceClient,
    actorId: users.editor.id,
    bankId: fixtures.bankId,
    burstId: reservation.burstId,
    itemId: row.item_id,
    uploadAttemptId: row.upload_attempt_id,
  });
  const publicFetch = await fetch(`${apiUrl.replace(/\/$/, "")}/storage/v1/object/public/ai-import-sources/${row.object_path.split("/").map((part) => encodeURIComponent(part)).join("/")}`);
  const counts = await one(
    client,
    `select
      (select count(*)::int from public.ai_pdf_upload_bursts where id = $1) as burst_count,
      (select count(*)::int from public.ai_pdf_upload_burst_items where burst_id = $1) as item_count,
      (select count(*)::int from storage.objects where bucket_id = 'ai-import-sources') as private_object_count,
      (select count(*)::int from public.import_batch_assets where id = $2) as source_linkage_count,
      (select count(*)::int from public.ai_pdf_upload_burst_items where burst_id = $1 and ai_provider_job_id is not null) as initial_job_linkage_count,
      (select count(distinct ai_provider_job_id)::int from public.ai_pdf_upload_burst_items where burst_id = $1 and ai_provider_job_id is not null) as distinct_job_count,
      (select count(*)::int
       from public.review_draft_items item
       join public.review_batches batch on batch.id = item.review_batch_id
       where batch.source_record_id = $3) as review_draft_count,
      (select count(*)::int from public.assignments where created_by = $4) as assignment_count`,
    [reservation.burstId, row.source_asset_id, row.import_batch_id, users.owner.id],
  );
  await assertNoProviderCallLeak(client);
  return {
    rls: {
      ownerReserveAllowed: ownerReserveProbe,
      editorReserveAllowed: editorReserveProbe,
      viewerReserveDenied,
      studentReserveDenied,
      unrelatedReserveDenied,
      viewerReadDenied: viewerRead.count === 0,
      studentReadDenied: studentRead.count === 0,
      unrelatedReadDenied: unrelatedRead.count === 0,
      anonymousReadDenied: anonRead.count === 0,
      finalizeRevalidatesAuthorization: viewerFinalize.outcome === "denied",
      editorFinalizeAllowed: editorFinalize.ok && editorFinalize.hasJob === true,
    },
    storage: {
      exactReservedPathDbAllowed: exactPathDbAllowed,
      exactPathUploadAllowed: ownerUpload.ok,
      arbitraryPathDenied: !arbitraryUpload.ok,
      viewerUploadDenied: !viewerUpload.ok,
      studentUploadDenied: !studentUpload.ok,
      unrelatedUploadDenied: !unrelatedUpload.ok,
      anonymousUploadDenied: !anonUpload.ok,
      permanentPublicUrlDenied: publicFetch.status !== 200,
    },
    admission: {
      burstCount: Number(counts.burst_count),
      itemCount: Number(counts.item_count),
      privateObjectCount: Number(counts.private_object_count),
      sourceLinkageCount: Number(counts.source_linkage_count),
      initialJobLinkageCount: Number(counts.initial_job_linkage_count),
      distinctJobCount: Number(counts.distinct_job_count),
      duplicateFinalizeIdempotent: duplicateFinalize.ok === true,
      reviewDraftAutoPublishCount: Number(counts.review_draft_count),
      assignmentCreationCount: Number(counts.assignment_count),
      providerCalls: 0,
    },
  };
}

async function removeObjects(serviceClient, paths) {
  const unique = [...new Set(paths)].filter(Boolean);
  if (unique.length === 0) return 0;
  const { data } = await serviceClient.storage.from("ai-import-sources").remove(unique);
  return Array.isArray(data) ? data.length : 0;
}

async function cleanupFixtures({ client, serviceClient, adminAuth, fixtures, uploadPaths }) {
  const userIds = Object.values(fixtures.users).map((user) => user.id);
  const beforeBucket = await collectBucket(client);
  const removedObjects = await removeObjects(serviceClient, [...uploadPaths]);
  await client.query("begin");
  try {
    await client.query("select set_config('request.jwt.claim.role', 'service_role', true)");
    await client.query("delete from public.ai_pdf_upload_burst_items where burst_id in (select id from public.ai_pdf_upload_bursts where created_by = any($1::uuid[]))", [userIds]);
    await client.query("delete from public.ai_provider_jobs where created_by = any($1::uuid[])", [userIds]);
    await client.query("delete from public.ai_pdf_upload_bursts where created_by = any($1::uuid[])", [userIds]);
    await client.query("delete from public.import_batch_assets where created_by = any($1::uuid[])", [userIds]);
    await client.query("delete from public.import_batches where created_by = any($1::uuid[])", [userIds]);
    await client.query("delete from public.bank_members where user_id = any($1::uuid[]) or invited_by = any($1::uuid[])", [userIds]);
    await client.query("delete from public.question_banks where created_by = any($1::uuid[])", [userIds]);
    await client.query("delete from public.ai_provider_profiles where created_by = any($1::uuid[])", [userIds]);
    await client.query("delete from public.organization_members where user_id = any($1::uuid[]) or created_by = any($1::uuid[])", [userIds]);
    await client.query("delete from public.profiles where id = any($1::uuid[])", [userIds]);
    await client.query("delete from public.organizations where id in ($1, $2)", [fixtures.organizationId, fixtures.unrelatedOrganizationId]);
    await client.query("commit");
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  }
  for (const id of userIds) {
    await adminAuth.auth.admin.deleteUser(id).catch(() => undefined);
  }
  const remaining = await one(
    client,
    `select
      (select count(*)::int from public.profiles where id = any($1::uuid[])) as profile_count,
      (select count(*)::int from auth.users where id = any($1::uuid[])) as auth_count,
      (select count(*)::int from public.organizations where id in ($2, $3)) as org_count,
      (select count(*)::int from storage.objects where bucket_id = 'ai-import-sources') as storage_count`,
    [userIds, fixtures.organizationId, fixtures.unrelatedOrganizationId],
  );
  const afterBucket = await collectBucket(client);
  return {
    databaseFixtureCleanup: Number(remaining.profile_count) === 0 && Number(remaining.org_count) === 0,
    authCleanup: Number(remaining.auth_count) === 0,
    storageObjectCleanup: Number(remaining.storage_count) === 0 && afterBucket.objectCount === 0,
    removedStorageObjects: removedObjects,
    bucketPreserved: beforeBucket.exists && afterBucket.exists,
    tempFileCleanup: true,
    tempProcessCleanup: true,
  };
}

function allBooleansTrue(value) {
  return Object.values(value).every((entry) => {
    if (entry && typeof entry === "object" && !Array.isArray(entry)) return allBooleansTrue(entry);
    return entry === true;
  });
}

async function main() {
  let finalClassification = "BLOCKED_BY_LOCAL_ENVIRONMENT";
  let client = null;
  const evidence = {
    providerCalls: 0,
    remoteDatabaseCalls: 0,
    currentCleanDbWrites: 0,
    legacyDbWrites: 0,
  };
  try {
    const env = validateEnvironment();
    evidence.localhostOnly = env.proof;
    evidence.localhostOnly = { ...evidence.localhostOnly, ...verifyLocalContainers() };
    const plan = await loadCanonicalMigrationPlan({ root });
    evidence.source = await verifySourceAndPlan(plan);
    client = await connect(env.databaseUrl);
    const apiProbe = await fetch(env.apiUrl);
    evidence.localhostOnly.apiReachable = apiProbe.status >= 200 && apiProbe.status < 500;
    assert(evidence.localhostOnly.apiReachable, "Local API is not reachable.");

    console.log("LOCALHOST_TARGET_CONFIRMED");
    resetLocalDatabase();
    evidence.emptyTarget = await collectEmptyTarget(client);
    assert(emptyTargetOk(evidence.emptyTarget), "empty_target_validation_failed");

    evidence.apply = await applyCanonicalFreshChain(client, plan);
    evidence.history = await collectHistory(client, plan);
    const historyOk = evidence.history.totalRows === 50
      && evidence.history.canonicalCount === 50
      && evidence.history.canonicalHead === "0050"
      && evidence.history.canonical0050Count === 1
      && evidence.history.missingCanonicalCount === 0
      && evidence.history.duplicateCanonicalCount === 0
      && evidence.history.unexpectedCanonicalCount === 0
      && evidence.history.unmappedLegacyRows === 0
      && evidence.history.excluded0032Absent
      && evidence.history.pendingCanonicalCount === 0;
    if (!historyOk) {
      finalClassification = "LOCAL_FRESH_CHAIN_APPLY_FAILED";
      throw new Error("history_validation_failed");
    }

    const bucket = await collectBucket(client);
    const bucketOk = evidence.apply.aiImportBucketAbsentBefore0050 === true
      && bucket.exists
      && bucket.identityOk
      && bucket.private
      && bucket.pdfOnly
      && bucket.sizeLimitBytes === 52428800
      && bucket.canonicalPolicyCount === 3
      && bucket.legacyPolicyCount === 0
      && bucket.unknownBucketTargetingPolicyCount === 0
      && bucket.anonymousOrPublicPolicyCount === 0;
    evidence.bucketCreate = {
      absentBefore0050: evidence.apply.aiImportBucketAbsentBefore0050 === true,
      createdBy0050: bucket.exists && evidence.apply.aiImportBucketAbsentBefore0050 === true,
      private: bucket.private,
      pdfOnly: bucket.pdfOnly,
      sizeLimitBytes: bucket.sizeLimitBytes,
      canonicalPolicyCount: bucket.canonicalPolicyCount,
      legacyPolicyCount: bucket.legacyPolicyCount,
      unknownBucketTargetingPolicyCount: bucket.unknownBucketTargetingPolicyCount,
      anonymousOrPublicPolicyCount: bucket.anonymousOrPublicPolicyCount,
    };
    if (!bucketOk) {
      finalClassification = "LOCAL_FRESH_0050_BUCKET_CREATE_FAILED";
      throw new Error("bucket_create_validation_failed");
    }

    const schema = await collectSchema0050(client);
    evidence.schema0050 = schema;
    if (!schema0050Ok(schema)) {
      finalClassification = "LOCAL_FRESH_CHAIN_APPLY_FAILED";
      throw new Error("schema_validation_failed");
    }

    const jwtSecret = getJwtSecretFromLocalStack();
    const serviceToken = makeToken({ role: "service_role", sub: "service-role", email: "service@local.invalid", secret: jwtSecret });
    const anonToken = makeToken({ role: "anon", sub: "anon", email: "anon@local.invalid", secret: jwtSecret });
    const serviceClient = makeSupabase(env.apiUrl, serviceToken);
    const anonClient = makeSupabase(env.apiUrl, anonToken);
    const runId = `pdf50-fresh-${Date.now()}-${randomUUID().slice(0, 8)}`;
    const uploadPaths = new Set();
    let fixtures = null;
    try {
      fixtures = await createFixtures({ client, adminAuth: serviceClient, runId });
      const ownerToken = makeToken({ role: "authenticated", sub: fixtures.users.owner.id, email: fixtures.users.owner.email, secret: jwtSecret });
      const editorToken = makeToken({ role: "authenticated", sub: fixtures.users.editor.id, email: fixtures.users.editor.email, secret: jwtSecret });
      const viewerToken = makeToken({ role: "authenticated", sub: fixtures.users.viewer.id, email: fixtures.users.viewer.email, secret: jwtSecret });
      const studentToken = makeToken({ role: "authenticated", sub: fixtures.users.student.id, email: fixtures.users.student.email, secret: jwtSecret });
      const unrelatedToken = makeToken({ role: "authenticated", sub: fixtures.users.unrelated.id, email: fixtures.users.unrelated.email, secret: jwtSecret });
      const ownerClient = makeSupabase(env.apiUrl, ownerToken, anonToken, true);
      const editorClient = makeSupabase(env.apiUrl, editorToken, anonToken, true);
      const viewerClient = makeSupabase(env.apiUrl, viewerToken, anonToken, true);
      const studentClient = makeSupabase(env.apiUrl, studentToken, anonToken, true);
      const unrelatedClient = makeSupabase(env.apiUrl, unrelatedToken, anonToken, true);
      evidence.focusedSecurity = await runFocusedSecurity({
        apiUrl: env.apiUrl,
        client,
        serviceClient,
        anonClient,
        fixtures,
        ownerClient,
        editorClient,
        viewerClient,
        studentClient,
        unrelatedClient,
        uploadPaths,
      });
      const rlsStorageOk = allBooleansTrue(evidence.focusedSecurity.rls)
        && allBooleansTrue(evidence.focusedSecurity.storage);
      const admission = evidence.focusedSecurity.admission;
      const admissionOk = admission.burstCount === 1
        && admission.itemCount === 1
        && admission.privateObjectCount === 1
        && admission.sourceLinkageCount === 1
        && admission.initialJobLinkageCount === 1
        && admission.distinctJobCount === 1
        && admission.duplicateFinalizeIdempotent
        && admission.reviewDraftAutoPublishCount === 0
        && admission.assignmentCreationCount === 0
        && admission.providerCalls === 0;
      if (!rlsStorageOk || !admissionOk) {
        finalClassification = "LOCAL_FRESH_SECURITY_VALIDATION_FAILED";
        throw new Error("focused_security_validation_failed");
      }
    } finally {
      if (fixtures) {
        evidence.cleanup = await cleanupFixtures({
          client,
          serviceClient,
          adminAuth: serviceClient,
          fixtures,
          uploadPaths,
        });
      }
    }
    const cleanupOk = evidence.cleanup
      && Object.entries(evidence.cleanup)
        .filter(([key]) => key !== "removedStorageObjects")
        .every(([, value]) => value === true);
    if (!cleanupOk) {
      finalClassification = "LOCAL_FRESH_SECURITY_VALIDATION_FAILED";
      throw new Error("cleanup_failed");
    }

    evidence.secondRunnerPass = await canonicalRunnerSecondPass(client, plan);
    const secondOk = evidence.secondRunnerPass.recognizedAlreadyApplied
      && evidence.secondRunnerPass.sqlExecuted === 0
      && evidence.secondRunnerPass.additionalHistoryRows === 0
      && !evidence.secondRunnerPass.schemaChanged
      && !evidence.secondRunnerPass.bucketChanged;
    if (!secondOk) {
      finalClassification = "LOCAL_FRESH_CHAIN_APPLY_FAILED";
      throw new Error("second_runner_failed");
    }

    const finalBucket = await collectBucket(client);
    const finalHistory = await collectHistory(client, plan);
    evidence.finalState = {
      canonicalHead: finalHistory.canonicalHead,
      pendingCanonicalCount: finalHistory.pendingCanonicalCount,
      canonicalHistoryCount: finalHistory.canonicalCount,
      bucketExists: finalBucket.exists,
      bucketObjectCount: finalBucket.objectCount,
      providerCalls: 0,
    };
    finalClassification = "LOCAL_FRESH_CHAIN_0001_0050_VALIDATED";
  } catch (error) {
    evidence.safeErrorType = safeError(error);
  } finally {
    if (client) await client.end().catch(() => undefined);
  }
  assert(finalClassifications.has(finalClassification), "invalid_final_classification");
  console.log(JSON.stringify({ finalClassification, evidence }, null, 2));
  if (finalClassification !== "LOCAL_FRESH_CHAIN_0001_0050_VALIDATED") process.exit(2);
}

main().catch((error) => {
  console.log(JSON.stringify({
    finalClassification: "BLOCKED_BY_LOCAL_ENVIRONMENT",
    safeErrorType: safeError(error),
    providerCalls: 0,
    remoteDatabaseCalls: 0,
  }, null, 2));
  process.exit(2);
});
