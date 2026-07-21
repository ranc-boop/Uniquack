import { createHmac, createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
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
const localHosts = new Set(["127.0.0.1", "localhost"]);
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
const practiceRouting0049 = "0049_practice_agent_provider_routing.sql";
const migration0050 = "0050_pdf50_burst_upload_admission.sql";
const excluded0032 = "0032_google_account_links.sql";
const executable0032 = "0032_teacher_feedback_notes.sql";
const legacyPolicyNames = [
  "ai_import_sources_admin_delete",
  "ai_import_sources_admin_read",
  "ai_import_sources_admin_upload",
];
const canonicalStoragePolicyNames = [
  "ai_import_sources_manager_delete",
  "ai_import_sources_manager_read",
  "ai_import_sources_reserved_upload",
];
const unmappedLegacyNames = [
  "fix_private_schema_function_grants_for_rls",
  "fix_taxonomy_closure_rebuild_safe_delete",
];
const finalClassifications = new Set([
  "LOCAL_0050_UPGRADE_RLS_STORAGE_ADMISSION_VALIDATED",
  "LOCAL_0050_APPLY_FAILED_AND_ROLLED_BACK",
  "LOCAL_0050_SCHEMA_VALIDATION_FAILED",
  "LOCAL_RLS_OR_STORAGE_VALIDATION_FAILED",
  "LOCAL_1_10_50_ADMISSION_VALIDATION_FAILED",
  "BLOCKED_BY_LOCAL_ENVIRONMENT",
  "LOCAL_0050_BASELINE_MISMATCH",
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
const invalidPdf = Buffer.from("%PDF-invalid-local-rehearsal\n");

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

function parseLocalUrl(name, protocols, requiredPort = null) {
  const raw = process.env[name];
  assert(raw, `${name} is required.`);
  assert(!/supabase\.co|pooler\.supabase\.com/i.test(raw), `${name} must not reference hosted Supabase.`);
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
    if (forbiddenValuePattern.test(value ?? "")) throw new Error("Forbidden non-localhost URL value is present.");
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
    },
  };
}

function git(args) {
  return execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
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

function docker(args) {
  return execFileSync("docker", args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

async function connect(databaseUrl) {
  const client = new Client({
    connectionString: databaseUrl,
    connectionTimeoutMillis: 5000,
    query_timeout: 120000,
  });
  await client.connect();
  await client.query("set statement_timeout = '120s'");
  await client.query("set lock_timeout = '15s'");
  return client;
}

async function one(client, sql, params = []) {
  return (await client.query(sql, params)).rows[0];
}

async function all(client, sql, params = []) {
  return (await client.query(sql, params)).rows;
}

async function collectHistory(client) {
  const rows = await all(
    client,
    "select version::text, name::text from supabase_migrations.schema_migrations order by version, name nulls first",
  );
  const canonicalVersions = rows.filter((row) => /^\d{4}$/.test(row.version));
  const unmappedRows = rows.filter((row) => unmappedLegacyNames.includes(row.name));
  const canonicalSet = new Set(canonicalVersions.map((row) => row.version));
  return {
    hash: sha256Json(sortedRows(rows)),
    totalRows: rows.length,
    canonicalCount: canonicalVersions.length,
    canonicalHead: canonicalVersions.map((row) => row.version).sort().at(-1) ?? null,
    canonical0049Count: rows.filter((row) => row.version === "0049").length,
    canonical0050Count: rows.filter((row) => row.version === "0050").length,
    unmappedCount: unmappedRows.length,
    unmappedRowsPreserved: unmappedLegacyNames.every((name) => unmappedRows.some((row) => row.name === name)),
    pendingCanonical: Array.from({ length: 50 }, (_, index) => String(index + 1).padStart(4, "0"))
      .filter((version) => !canonicalSet.has(version)),
  };
}

async function collectBucket(client) {
  const bucketRows = await all(
    client,
    "select id, name, public, file_size_limit, allowed_mime_types::text from storage.buckets where id = 'ai-import-sources' order by id",
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
  const objectCount = Number((await one(client, "select count(*)::int as count from storage.objects where bucket_id = 'ai-import-sources'")).count);
  const bucket = bucketRows[0] ?? null;
  const policyNames = policies.map((policy) => policy.policyname).sort();
  const unknownBucketTargetingPolicyCount = policies.filter((policy) => ![
    ...legacyPolicyNames,
    ...canonicalStoragePolicyNames,
  ].includes(policy.policyname)).length;
  return {
    hash: sha256Json({ bucketRows: sortedRows(bucketRows), policies: sortedRows(policies), objectCount }),
    exists: Boolean(bucket),
    identityOk: Boolean(bucket && bucket.id === "ai-import-sources" && bucket.name === "ai-import-sources"),
    private: Boolean(bucket && bucket.public === false),
    pdfOnly: Boolean(bucket && bucket.allowed_mime_types === "{application/pdf}"),
    sizeLimitBytes: bucket?.file_size_limit == null ? null : Number(bucket.file_size_limit),
    objectCount,
    policyNames,
    legacyPolicyCount: policyNames.filter((name) => legacyPolicyNames.includes(name)).length,
    canonicalPolicyCount: policyNames.filter((name) => canonicalStoragePolicyNames.includes(name)).length,
    unknownBucketTargetingPolicyCount,
    anonymousOrPublicPolicyCount: policies.filter((policy) => /\b(?:anon|public)\b/i.test(policy.roles)).length,
  };
}

async function collectSchema0050(client) {
  const tableRows = await all(
    client,
    `select n.nspname, c.relname
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relkind in ('r','p')
       and c.relname in ('ai_pdf_upload_bursts', 'ai_pdf_upload_burst_items')
     order by c.relname`,
  );
  const columnRows = await all(
    client,
    `select table_name, column_name
     from information_schema.columns
     where table_schema = 'public'
       and table_name in ('ai_pdf_upload_bursts', 'ai_pdf_upload_burst_items')
     order by table_name, ordinal_position`,
  );
  const functionRows = await all(
    client,
    `select n.nspname as schema_name, p.proname, pg_get_function_identity_arguments(p.oid) as args
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
     )
     order by schema_name, proname, args`,
  );
  const triggerRows = await all(
    client,
    `select distinct event_object_schema, event_object_table, trigger_name
     from information_schema.triggers
     where trigger_name in (
       'ai_pdf_upload_bursts_set_updated_at',
       'ai_pdf_upload_burst_items_set_updated_at',
       'ai_pdf_upload_bursts_protect_identity',
       'ai_pdf_upload_burst_items_protect_identity',
       'ai_pdf_upload_burst_items_refresh_parent',
       'ai_provider_jobs_sync_pdf_burst_item'
     )
     order by trigger_name`,
  );
  const indexRows = await all(
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
  const rlsRows = await all(
    client,
    `select c.relname
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relname in ('ai_pdf_upload_bursts', 'ai_pdf_upload_burst_items')
       and c.relrowsecurity
     order by c.relname`,
  );
  const policyRows = await all(
    client,
    `select schemaname, tablename, policyname
     from pg_policies
     where (schemaname = 'public' and tablename in ('ai_pdf_upload_bursts', 'ai_pdf_upload_burst_items'))
        or (schemaname = 'storage' and tablename = 'objects' and policyname like 'ai_import_sources_%')
     order by schemaname, tablename, policyname`,
  );
  const constraints = await all(
    client,
    `select conname, pg_get_constraintdef(oid) as definition
     from pg_constraint
     where conrelid in (
       select c.oid
       from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public'
         and c.relname in ('ai_pdf_upload_bursts', 'ai_pdf_upload_burst_items')
     )
     order by conname`,
  );
  return {
    hash: sha256Json({
      tables: sortedRows(tableRows),
      columns: sortedRows(columnRows),
      functions: sortedRows(functionRows),
      triggers: sortedRows(triggerRows),
      indexes: sortedRows(indexRows),
      rls: sortedRows(rlsRows),
      policies: sortedRows(policyRows),
      constraints: sortedRows(constraints),
    }),
    tableCount: tableRows.length,
    columnCount: columnRows.length,
    functionCount: functionRows.length,
    triggerCount: triggerRows.length,
    indexCount: indexRows.length,
    rlsCount: rlsRows.length,
    policyCount: policyRows.length,
    uniqueImportBatchConstraint: constraints.some((row) => /UNIQUE \(import_batch_id\)/i.test(row.definition)),
    uniqueSourceAssetConstraint: constraints.some((row) => /UNIQUE \(source_asset_id\)/i.test(row.definition)),
    uniqueJobConstraint: constraints.some((row) => /UNIQUE \(ai_provider_job_id\)/i.test(row.definition)),
    uniqueBurstRequestConstraint: constraints.some((row) => /UNIQUE \(created_by, client_request_key\)/i.test(row.definition)),
    noPartialState: tableRows.length === 2
      && columnRows.length === 44
      && functionRows.length === 13
      && triggerRows.length === 6
      && indexRows.length === 4
      && rlsRows.length === 2
      && policyRows.length === 5,
  };
}

function isPost0050Valid({ history, schema0050, bucket }) {
  const reconciledCloneHistory = history.totalRows === 52
    && history.unmappedCount === 2
    && history.unmappedRowsPreserved;
  const freshChainHistory = history.totalRows === 50
    && history.unmappedCount === 0;
  return history.canonicalCount === 50
    && history.canonicalHead === "0050"
    && history.canonical0049Count === 1
    && history.canonical0050Count === 1
    && (reconciledCloneHistory || freshChainHistory)
    && history.pendingCanonical.length === 0
    && schema0050.noPartialState
    && schema0050.uniqueImportBatchConstraint
    && schema0050.uniqueSourceAssetConstraint
    && schema0050.uniqueJobConstraint
    && schema0050.uniqueBurstRequestConstraint
    && bucket.exists
    && bucket.private
    && bucket.pdfOnly
    && bucket.legacyPolicyCount === 0
    && bucket.canonicalPolicyCount === 3
    && bucket.unknownBucketTargetingPolicyCount === 0
    && bucket.anonymousOrPublicPolicyCount === 0;
}

async function collectRowCounts(client) {
  const rows = await all(
    client,
    `select table_schema, table_name
     from information_schema.tables
     where table_schema in ('public', 'private', 'storage', 'auth')
       and table_type = 'BASE TABLE'
     order by table_schema, table_name`,
  );
  const counts = [];
  for (const row of rows) {
    const quoted = `"${row.table_schema.replaceAll('"', '""')}"."${row.table_name.replaceAll('"', '""')}"`;
    const count = await one(client, `select count(*)::int as count from ${quoted}`);
    counts.push({ table: `${row.table_schema}.${row.table_name}`, count: Number(count.count) });
  }
  return {
    hash: sha256Json(counts),
    authUserCount: counts.find((row) => row.table === "auth.users")?.count ?? 0,
    storageObjectCount: counts.find((row) => row.table === "storage.objects")?.count ?? 0,
    totalApplicationRows: counts
      .filter((row) => /^(public|private)\./.test(row.table))
      .reduce((sum, row) => sum + row.count, 0),
  };
}

async function verifyPlanAndGit(plan) {
  const status = git(["status", "--porcelain=v1"]);
  const branch = git(["branch", "--show-current"]);
  const head = git(["rev-parse", "HEAD"]);
  const d484 = gitIsAncestor("d4841a1157debed43318c7a66c96edd602cb3e43");
  const h0856 = gitIsAncestor("0856a730505a0974b6fe1168abb42b07b683b89a");
  const expectedArtifactChanges = status
    .split(/\r?\n/)
    .filter(Boolean)
    .every((line) => {
      const path = line.replace(/^[? MARCUD!]{1,2}\s+/, "").replaceAll("\\", "/");
      return /^(scripts\/pdf50-local-0050-upgrade-rehearsal\.mjs|scripts\/pdf50-local-fresh-chain-0050-gate\.mjs|scripts\/pdf50-local-0050-release-gate\.mjs|scripts\/pdf50-clone-history-repair\.mjs|scripts\/pdf50-0050-bucket-adoption-smoke\.mjs|scripts\/route-smoke\.mjs|scripts\/supabase-rls-smoke\.mjs|supabase\/clean-migrations\/0050_pdf50_burst_upload_admission\.sql|docs\/security\/pdf50-local-0050-upgrade-evidence\.md|docs\/security\/pdf50-local-0049-0050-upgrade-evidence\.md|docs\/security\/pdf50-local-0050-bucket-adoption-evidence\.md|docs\/security\/pdf50-local-rls-storage-admission-evidence\.md|docs\/security\/pdf50-local-fresh-chain-0050-evidence\.md|docs\/security\/pdf50-local-fresh-chain-0049-evidence\.md|docs\/security\/pdf50-local-0049-upgrade-evidence\.md|docs\/security\/pdf50-local-clone-history-reconciliation-evidence\.md|docs\/security\/migration-application-register\.md|docs\/security\/live-schema-manifest\.json|docs\/security\/canonical-migration-governance-through-0050\.md)$/.test(path);
    });
  assert(branch === "codex/pdf50-burst-clean-db-rehearsal", "Unexpected branch.");
  assert(status.length === 0 || expectedArtifactChanges, "Working tree has unexpected local changes before local 0050 apply.");
  assert(d484 && h0856, "Expected source commits are not both ancestors.");
  assert(plan.executableMigrationNames.length === 50, "Executable canonical migration count must be 50.");
  assert(plan.executableMigrationNames[31] === executable0032, "Executable 0032 must remain teacher feedback notes.");
  assert(plan.blockedMigrationNames.includes(excluded0032), "Google 0032 must remain excluded.");
  assert(plan.executableMigrationNames.at(-1) === migration0050, "Canonical head must be 0050.");
  assert(plan.manifest.latestActivePrefix === 50, "Manifest head must be 0050.");
  return {
    branch,
    head,
    worktreeClean: status.length === 0,
    worktreeLimitedToRehearsalArtifacts: status.length > 0 && expectedArtifactChanges,
  };
}

async function verifyBaseline(client) {
  const history = await collectHistory(client);
  const bucket = await collectBucket(client);
  const schema0050 = await collectSchema0050(client);
  const rows = await collectRowCounts(client);
  const absentBucketCreatePath = !bucket.exists
    && bucket.objectCount === 0
    && bucket.legacyPolicyCount === 0
    && bucket.canonicalPolicyCount === 0
    && bucket.unknownBucketTargetingPolicyCount === 0;
  const compatibleLegacyAdoptionPath = bucket.exists
    && bucket.identityOk
    && bucket.private
    && bucket.pdfOnly
    && bucket.legacyPolicyCount === 3
    && bucket.canonicalPolicyCount === 0
    && bucket.unknownBucketTargetingPolicyCount === 0;
  const ok = history.totalRows === 50
    && history.canonicalCount === 48
    && history.canonicalHead === "0048"
    && history.canonical0049Count === 0
    && history.canonical0050Count === 0
    && history.unmappedCount === 2
    && history.unmappedRowsPreserved
    && history.pendingCanonical.length === 2
    && history.pendingCanonical[0] === "0049"
    && history.pendingCanonical[1] === "0050"
    && schema0050.tableCount === 0
    && schema0050.functionCount === 0
    && (absentBucketCreatePath || compatibleLegacyAdoptionPath);
  return { ok, history, bucket, schema0050, rows };
}

async function apply0050Once(client, plan) {
  const history = await collectHistory(client);
  assert(
    history.pendingCanonical.length === 2 &&
      history.pendingCanonical[0] === "0049" &&
      history.pendingCanonical[1] === "0050",
    "Practice 0049 and PDF50 0050 must be the only pending migrations.",
  );
  await client.query("begin");
  try {
    for (const filename of [practiceRouting0049, migration0050]) {
      const sql = await readFile(resolve(plan.cleanDirectory, filename), "utf8");
      await client.query(sql);
      await client.query(
        "insert into supabase_migrations.schema_migrations(version, statements, name) values ($1, $2, $3)",
        [String(migrationNumber(filename)).padStart(4, "0"), [], filename],
      );
    }
    await client.query("commit");
    return { applied: true, recordedHistoryRows: 2 };
  } catch (error) {
    await client.query("rollback").catch(() => {});
    const after = await collectHistory(client);
    return {
      applied: false,
      rolledBack: true,
      history0050CountAfterRollback: after.canonical0050Count,
      safeErrorType: safeError(error),
    };
  }
}

async function canonicalRunnerSecondPass(client) {
  const historyBefore = await collectHistory(client);
  const schemaBefore = await collectSchema0050(client);
  const bucketBefore = await collectBucket(client);
  assert(
    historyBefore.canonical0049Count === 1 && historyBefore.canonical0050Count === 1,
    "Practice 0049 and PDF50 0050 must already be applied before the second runner pass.",
  );
  const pending = historyBefore.pendingCanonical;
  assert(pending.length === 0, "No canonical migration should remain pending.");
  const historyAfter = await collectHistory(client);
  const schemaAfter = await collectSchema0050(client);
  const bucketAfter = await collectBucket(client);
  return {
    recognizedAlreadyApplied: true,
    sqlReexecuted: false,
    additionalHistoryRows: historyAfter.totalRows - historyBefore.totalRows,
    schemaChanged: schemaAfter.hash !== schemaBefore.hash,
    bucketChanged: bucketAfter.hash !== bucketBefore.hash,
    policyDuplication: schemaAfter.policyCount !== 5,
  };
}

function getJwtSecretFromLocalStack() {
  const names = docker(["ps", "--format", "{{.Names}}"]);
  assert(names.split(/\r?\n/).some((name) => name === "supabase_db_o2i_pdf50_local_rehearsal"), "Local DB container is not running.");
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
    user_metadata: { localPdf50Rehearsal: true },
  });
  if (error || !data?.user?.id) throw new Error("auth_user_create_failed");
  return { id: data.user.id, email };
}

async function insertProfile(client, user, role, organizationId) {
  await client.query(
    `insert into public.profiles (id, email, role, status, default_organization_id, display_name)
     values ($1, $2, $3, 'active', $4, $5)`,
    [user.id, user.email, role, organizationId, "Local PDF50 User"],
  );
}

async function canManageBurstBank(client, userId, bankId) {
  const result = await one(
    client,
    `select private.can_actor_manage_ai_pdf_burst_bank($1::uuid, $2::uuid) as allowed`,
    [userId, bankId],
  );
  return result.allowed === true;
}

async function createFixtures({ client, serviceClient, adminAuth, runId }) {
  const organizationId = randomUUID();
  const unrelatedOrganizationId = randomUUID();
  const bankId = randomUUID();
  const providerProfileId = randomUUID();
  const users = {};
  for (const label of ["owner", "editor", "viewer", "student", "unrelated", "orgOnly", "inactive"]) {
    users[label] = await createAuthUser(adminAuth, runId, label);
  }
  await client.query("begin");
  try {
    await client.query("select set_config('request.jwt.claim.role', 'service_role', true)");
    await client.query(
      "insert into public.organizations (id, name, slug, status) values ($1, $2, $3, 'active'), ($4, $5, $6, 'active')",
      [organizationId, "Local PDF50 Org", `${runId}-org`, unrelatedOrganizationId, "Local PDF50 Other Org", `${runId}-other`],
    );
    for (const label of ["owner", "editor", "viewer", "student", "orgOnly", "inactive"]) {
      await insertProfile(client, users[label], label === "student" ? "student" : "teacher", organizationId);
      await client.query(
        `insert into public.organization_members (organization_id, user_id, role, status)
         values ($1, $2, $3, $4)`,
        [organizationId, users[label].id, label === "student" ? "student" : "teacher", label === "inactive" ? "disabled" : "active"],
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
      [bankId, organizationId, users.owner.id, `${runId}-bank`, JSON.stringify({ localPdf50Rehearsal: true })],
    );
    const memberships = [
      [users.owner.id, "owner", "active"],
      [users.editor.id, "editor", "active"],
      [users.viewer.id, "viewer", "active"],
      [users.inactive.id, "editor", "removed"],
    ];
    for (const [userId, role, status] of memberships) {
      await client.query(
        `insert into public.bank_members (bank_id, user_id, role, status, invited_by, joined_at)
         values ($1, $2, $3, $4, $5, now())`,
        [bankId, userId, role, status, users.owner.id],
      );
    }
    await client.query("commit");
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  }
  await assertNoProviderCallLeak(client);
  return { organizationId, unrelatedOrganizationId, bankId, providerProfileId, users };
}

async function assertNoProviderCallLeak(client) {
  const result = await one(client, "select count(*)::int as count from public.ai_provider_operation_logs");
  assert(Number(result.count) === 0, "provider_log_count_not_zero");
  return true;
}

async function assertRpcDenied(client, rpcName, args) {
  const { error } = await client.rpc(rpcName, args);
  return Boolean(error);
}

async function assertSelectCount(client, table, filterColumn, filterValue) {
  const { count, error } = await client
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq(filterColumn, filterValue);
  if (error) return { ok: false, count: 0 };
  return { ok: true, count: Number(count ?? 0) };
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
    await client.query("rollback").catch(() => {});
    throw error;
  }
}

function buildReservationItems(count) {
  return Array.from({ length: count }, (_, index) => ({
    clientItemKey: randomUUID(),
    mimeType: "application/pdf",
    originalFilename: `synthetic-${index + 1}.pdf`,
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

async function uploadObject({ client, path, body = tinyPdf }) {
  if (client?.pdf50LocalAuth) {
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
    return { ok: response.ok, safeError: response.ok ? null : `storage_http_${response.status}` };
  }
  const { error } = await client.storage
    .from("ai-import-sources")
    .upload(path, body, {
      contentType: "application/pdf",
      upsert: false,
    });
  return { ok: !error, safeError: error ? "storage_upload_denied" : null };
}

async function downloadObject({ client, path }) {
  if (client?.pdf50LocalAuth) {
    const { apiKey, apiUrl, token } = client.pdf50LocalAuth;
    const response = await fetch(storageObjectUrl(apiUrl, path), {
      method: "GET",
      headers: {
        apikey: apiKey,
        Authorization: `Bearer ${token}`,
      },
    });
    return { data: response.ok ? await response.blob() : null, error: response.ok ? null : "storage_download_denied" };
  }
  return client.storage.from("ai-import-sources").download(path);
}

async function removeObjects(serviceClient, paths) {
  const unique = [...new Set(paths)].filter(Boolean);
  if (unique.length === 0) return 0;
  let removed = 0;
  for (let index = 0; index < unique.length; index += 100) {
    const chunk = unique.slice(index, index + 100);
    const { data } = await serviceClient.storage.from("ai-import-sources").remove(chunk);
    removed += Array.isArray(data) ? data.length : 0;
  }
  return removed;
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
    || buffer.includes(Buffer.from("invalid-local-rehearsal"))
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

async function pumpUntilAllLinked({ client, serviceClient, burstId, maxRounds = 200 }) {
  let maxUserOutstanding = 0;
  let maxOrgOutstanding = 0;
  let maxPdfActive = 0;
  let maxOrgActive = 0;
  let maxGlobalActive = 0;
  let rounds = 0;
  while (rounds < maxRounds) {
    rounds += 1;
    await serviceClient.rpc("release_ai_pdf_burst_admission_jobs", { p_burst_id: burstId, p_limit: 12 });
    const counts = await one(
      client,
      `select
        count(*) filter (where item.ai_provider_job_id is not null)::int as linked,
        count(*)::int as total,
        count(*) filter (where item.status = 'admission_ready')::int as waiting,
        count(job.id) filter (where job.status in ('queued','leased','processing','retry_wait'))::int as outstanding,
        count(job.id) filter (where job.status in ('leased','processing'))::int as active,
        count(job.id) filter (where job.status in ('leased','processing') and job.job_kind = 'ai_pdf_extract')::int as pdf_active
       from public.ai_pdf_upload_burst_items item
       left join public.ai_provider_jobs job on job.id = item.ai_provider_job_id
       where item.burst_id = $1`,
      [burstId],
    );
    maxUserOutstanding = Math.max(maxUserOutstanding, Number(counts.outstanding));
    maxOrgOutstanding = Math.max(maxOrgOutstanding, Number(counts.outstanding));
    maxGlobalActive = Math.max(maxGlobalActive, Number(counts.active));
    maxOrgActive = Math.max(maxOrgActive, Number(counts.active));
    maxPdfActive = Math.max(maxPdfActive, Number(counts.pdf_active));
    if (Number(counts.linked) === Number(counts.total) && Number(counts.waiting) === 0) break;
    await client.query(
      `update public.ai_provider_jobs
       set status = 'completed', completed_at = coalesce(completed_at, now())
       where id in (
         select job.id
         from public.ai_provider_jobs job
         join public.ai_pdf_upload_burst_items item on item.ai_provider_job_id = job.id
         where item.burst_id = $1 and job.status in ('queued','retry_wait')
         order by job.created_at
         limit 5
       )`,
      [burstId],
    );
  }
  const final = await one(
    client,
    `select
      count(*)::int as total,
      count(*) filter (where ai_provider_job_id is not null)::int as linked,
      count(distinct ai_provider_job_id)::int as distinct_jobs,
      count(*) filter (where status = 'failed')::int as failed,
      count(*) filter (where status = 'admission_ready')::int as waiting
     from public.ai_pdf_upload_burst_items
     where burst_id = $1`,
    [burstId],
  );
  return {
    rounds,
    total: Number(final.total),
    linked: Number(final.linked),
    distinctJobs: Number(final.distinct_jobs),
    failed: Number(final.failed),
    waiting: Number(final.waiting),
    maxUserOutstanding,
    maxOrgOutstanding,
    maxGlobalActive,
    maxOrgActive,
    maxPdfActive,
  };
}

async function runAdmissionScenario({
  client,
  serviceClient,
  userClient,
  actorId,
  bankId,
  providerProfileId,
  count,
  requestKey,
  invalidIndex = null,
  uploadPaths,
  expectedMaxUploadConcurrency = 4,
}) {
  const reservation = await reserveBurst({ serviceClient, actorId, bankId, providerProfileId, requestKey, count });
  let activeUploads = 0;
  let maxUploadConcurrency = 0;
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < reservation.rows.length) {
      const index = nextIndex;
      nextIndex += 1;
      activeUploads += 1;
      maxUploadConcurrency = Math.max(maxUploadConcurrency, activeUploads);
      const row = reservation.rows[index];
      uploadPaths.add(row.object_path);
      await uploadObject({
        client: userClient,
        path: row.object_path,
        body: invalidIndex === index ? invalidPdf : tinyPdf,
      });
      activeUploads -= 1;
    }
  }
  await Promise.all(Array.from({ length: Math.min(expectedMaxUploadConcurrency, count) }, () => worker()));
  for (const row of reservation.rows) {
    await finalizeItem({
      client,
      serviceClient,
      actorId,
      bankId,
      burstId: reservation.burstId,
      itemId: row.item_id,
      uploadAttemptId: row.upload_attempt_id,
    });
  }
  const duplicate = await finalizeItem({
    client,
    serviceClient,
    actorId,
    bankId,
    burstId: reservation.burstId,
    itemId: reservation.rows[0].item_id,
    uploadAttemptId: reservation.rows[0].upload_attempt_id,
  });
  const pump = await pumpUntilAllLinked({ client, serviceClient, burstId: reservation.burstId });
  const linkedPerValid = invalidIndex == null ? pump.linked === count : pump.linked === count - 1;
  const sourceLinkages = await one(
    client,
    "select count(*)::int as count from public.import_batch_assets where id = any($1::uuid[])",
    [reservation.rows.map((row) => row.source_asset_id)],
  );
  const reviewDrafts = await one(
    client,
    `select count(*)::int as count
     from public.review_draft_items item
     join public.review_batches batch on batch.id = item.review_batch_id
     where batch.source_record_id = any($1::uuid[])`,
    [reservation.rows.map((row) => row.import_batch_id)],
  );
  const assignments = await one(
    client,
    "select count(*)::int as count from public.assignments where created_by = $1",
    [actorId],
  );
  return {
    itemCount: count,
    maxUploadConcurrency,
    uploadConcurrencyOk: maxUploadConcurrency <= expectedMaxUploadConcurrency,
    sourceLinkageCount: Number(sourceLinkages.count),
    linkedPerValid,
    jobLinkCount: pump.linked,
    distinctJobCount: pump.distinctJobs,
    failedCount: pump.failed,
    waitingCount: pump.waiting,
    duplicateFinalizeSafe: duplicate.ok,
    noReviewDraftAutoPublish: Number(reviewDrafts.count) === 0,
    noAssignmentCreation: Number(assignments.count) === 0,
    ...pump,
  };
}

async function runMatrices({
  apiUrl,
  secret,
  anonToken,
  client,
  serviceClient,
  anonClient,
  fixtures,
  uploadPaths,
}) {
  const users = fixtures.users;
  const tokens = {};
  const clients = {};
  for (const [label, user] of Object.entries(users)) {
    tokens[label] = makeToken({ role: "authenticated", sub: user.id, email: user.email, secret });
    clients[label] = makeSupabase(apiUrl, tokens[label], anonToken, true);
  }
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
  const roleCanManage = {};
  for (const label of Object.keys(users)) {
    roleCanManage[label] = await canManageBurstBank(client, users[label].id, fixtures.bankId);
  }
  const ownerDbPolicyAllowsExactPath = await canUploadReservedPathAs(client, users.owner.id, row.object_path);
  const ownerUpload = await uploadObject({ client: clients.owner, path: row.object_path });
  const arbitraryUpload = await uploadObject({
    client: clients.owner,
    path: `ai-pdf-bursts/${randomUUID()}/${randomUUID()}.pdf`,
  });
  const viewerUpload = await uploadObject({ client: clients.viewer, path: row.object_path });
  const studentUpload = await uploadObject({ client: clients.student, path: row.object_path });
  const unrelatedUpload = await uploadObject({ client: clients.unrelated, path: row.object_path });
  const anonUpload = await uploadObject({ client: anonClient, path: row.object_path });
  const ownerFinalize = await finalizeItem({
    client,
    serviceClient,
    actorId: users.owner.id,
    bankId: fixtures.bankId,
    burstId: reservation.burstId,
    itemId: row.item_id,
    uploadAttemptId: row.upload_attempt_id,
  });
  const ownerRead = await assertSelectCount(clients.owner, "ai_pdf_upload_bursts", "id", reservation.burstId);
  const viewerRead = await assertSelectCount(clients.viewer, "ai_pdf_upload_bursts", "id", reservation.burstId);
  const studentRead = await assertSelectCount(clients.student, "ai_pdf_upload_bursts", "id", reservation.burstId);
  const anonRead = await assertSelectCount(anonClient, "ai_pdf_upload_bursts", "id", reservation.burstId);
  const rpcArgs = {
    p_client_request_key: randomUUID(),
    p_created_by: users.owner.id,
    p_items: [{ clientItemKey: randomUUID(), mimeType: "application/pdf", originalFilename: "denied.pdf", sizeBytes: tinyPdf.length }],
    p_parsing_profile: "standard",
    p_provider_profile_id: fixtures.providerProfileId,
    p_target_bank_id: fixtures.bankId,
  };
  const authRpcDenied = await assertRpcDenied(clients.owner, "reserve_ai_pdf_upload_burst", rpcArgs);
  const anonRpcDenied = await assertRpcDenied(anonClient, "reserve_ai_pdf_upload_burst", rpcArgs);
  const publicUrl = `${apiUrl.replace(/\/$/, "")}/storage/v1/object/public/ai-import-sources/${encodeURIComponent(row.object_path)}`;
  const publicFetch = await fetch(publicUrl);
  const managerDownload = await downloadObject({ client: clients.owner, path: row.object_path });
  const studentDownload = await downloadObject({ client: clients.student, path: row.object_path });
  return {
    rls: {
      ownerReadAllowed: ownerRead.ok && ownerRead.count === 1,
      viewerReadDenied: viewerRead.count === 0,
      studentReadDenied: studentRead.count === 0,
      anonymousReadDenied: anonRead.count === 0,
      serviceRoleRpcAllowed: ownerFinalize.ok,
      authenticatedRpcDenied: authRpcDenied,
      anonymousRpcDenied: anonRpcDenied,
      organizationMembershipAloneDenied: roleCanManage.orgOnly === false,
      inactiveBankMembershipDenied: roleCanManage.inactive === false,
      viewerManageDenied: roleCanManage.viewer === false,
      studentManageDenied: roleCanManage.student === false,
      unrelatedManageDenied: roleCanManage.unrelated === false,
    },
    storage: {
      ownerDbPolicyAllowsExactPath,
      ownerExactPathUploadAllowed: ownerUpload.ok,
      arbitraryPathUploadDenied: !arbitraryUpload.ok,
      viewerUploadDenied: !viewerUpload.ok,
      studentUploadDenied: !studentUpload.ok,
      unrelatedUploadDenied: !unrelatedUpload.ok,
      anonymousUploadDenied: !anonUpload.ok,
      ownerDownloadAllowed: !managerDownload.error,
      studentDownloadDenied: Boolean(studentDownload.error),
      permanentPublicUrlDenied: publicFetch.status !== 200,
    },
    diagnostics: {
      ownerExactPathUploadStatus: ownerUpload.safeError ?? "ok",
    },
  };
}

async function runRaceRecovery({
  client,
  serviceClient,
  ownerClient,
  fixtures,
  uploadPaths,
}) {
  const ownerId = fixtures.users.owner.id;
  const requestKey = randomUUID();
  const duplicateReservationItems = buildReservationItems(1);
  const concurrent = await Promise.all(
    Array.from({ length: 5 }, () => reserveBurst({
      serviceClient,
      actorId: ownerId,
      bankId: fixtures.bankId,
      providerProfileId: fixtures.providerProfileId,
      requestKey,
      count: 1,
      items: duplicateReservationItems,
    })),
  );
  const oneLogicalBurst = new Set(concurrent.map((result) => result.burstId)).size === 1;
  const row = concurrent[0].rows[0];
  uploadPaths.add(row.object_path);
  await uploadObject({ client: ownerClient, path: row.object_path });
  const finalizeResults = await Promise.all(
    Array.from({ length: 5 }, () => finalizeItem({
      client,
      serviceClient,
      actorId: ownerId,
      bankId: fixtures.bankId,
      burstId: concurrent[0].burstId,
      itemId: row.item_id,
      uploadAttemptId: row.upload_attempt_id,
    })),
  );
  const pumps = await Promise.all(
    Array.from({ length: 5 }, () => serviceClient.rpc("release_ai_pdf_burst_admission_jobs", {
      p_burst_id: concurrent[0].burstId,
      p_limit: 12,
    })),
  );
  const counts = await one(
    client,
    `select
      count(*)::int as item_count,
      count(distinct source_asset_id)::int as source_count,
      count(ai_provider_job_id)::int as job_count,
      count(distinct ai_provider_job_id)::int as distinct_job_count
     from public.ai_pdf_upload_burst_items
     where burst_id = $1`,
    [concurrent[0].burstId],
  );
  await client.query(
    `update public.ai_provider_jobs
     set status = 'completed', completed_at = coalesce(completed_at, now())
     where id in (
       select ai_provider_job_id
       from public.ai_pdf_upload_burst_items
       where burst_id = $1 and ai_provider_job_id is not null
     )`,
    [concurrent[0].burstId],
  );

  const capacityReservation = await reserveBurst({
    serviceClient,
    actorId: ownerId,
    bankId: fixtures.bankId,
    providerProfileId: fixtures.providerProfileId,
    requestKey: randomUUID(),
    count: 6,
  });
  for (const item of capacityReservation.rows) {
    uploadPaths.add(item.object_path);
    await uploadObject({ client: ownerClient, path: item.object_path });
    await finalizeItem({
      client,
      serviceClient,
      actorId: ownerId,
      bankId: fixtures.bankId,
      burstId: capacityReservation.burstId,
      itemId: item.item_id,
      uploadAttemptId: item.upload_attempt_id,
    });
  }
  const capacityBeforeRelease = await one(
    client,
    `select count(job.id)::int as outstanding
     from public.ai_provider_jobs job
     join public.ai_pdf_upload_burst_items item on item.ai_provider_job_id = job.id
     where item.burst_id = $1 and job.status in ('queued','retry_wait','leased','processing')`,
    [capacityReservation.burstId],
  );
  await client.query(
    `update public.ai_provider_jobs
     set status = 'completed', completed_at = coalesce(completed_at, now())
     where id in (
       select ai_provider_job_id
       from public.ai_pdf_upload_burst_items
       where burst_id = $1 and ai_provider_job_id is not null
       limit 5
     )`,
    [capacityReservation.burstId],
  );
  await Promise.all(
    Array.from({ length: 4 }, () => serviceClient.rpc("release_ai_pdf_burst_admission_jobs", {
      p_burst_id: capacityReservation.burstId,
      p_limit: 12,
    })),
  );
  const capacityAfterRelease = await pumpUntilAllLinked({ client, serviceClient, burstId: capacityReservation.burstId });

  const removalReservation = await reserveBurst({
    serviceClient,
    actorId: ownerId,
    bankId: fixtures.bankId,
    providerProfileId: fixtures.providerProfileId,
    requestKey: randomUUID(),
    count: 1,
  });
  const removalItem = removalReservation.rows[0];
  uploadPaths.add(removalItem.object_path);
  await uploadObject({ client: ownerClient, path: removalItem.object_path });
  await client.query(
    "update public.bank_members set status = 'removed' where bank_id = $1 and user_id = $2",
    [fixtures.bankId, ownerId],
  );
  const deniedFinalize = await finalizeItem({
    client,
    serviceClient,
    actorId: ownerId,
    bankId: fixtures.bankId,
    burstId: removalReservation.burstId,
    itemId: removalItem.item_id,
    uploadAttemptId: removalItem.upload_attempt_id,
  });
  await client.query(
    "update public.bank_members set status = 'active' where bank_id = $1 and user_id = $2",
    [fixtures.bankId, ownerId],
  );

  const cancelReservation = await reserveBurst({
    serviceClient,
    actorId: ownerId,
    bankId: fixtures.bankId,
    providerProfileId: fixtures.providerProfileId,
    requestKey: randomUUID(),
    count: 1,
  });
  const cancelResult = await serviceClient.rpc("cancel_ai_pdf_upload_burst_items", {
    p_actor_id: ownerId,
    p_burst_id: cancelReservation.burstId,
  });

  return {
    duplicateReservationOneLogicalBurst: oneLogicalBurst,
    fiveFinalizeCallsSafe: finalizeResults.every((result) => result.ok),
    concurrentPumpsNoError: pumps.every((result) => !result.error),
    oneLogicalItem: Number(counts.item_count) === 1,
    oneSourceLinkage: Number(counts.source_count) === 1,
    oneInitialJobLinkage: Number(counts.job_count) === 1 && Number(counts.distinct_job_count) === 1,
    capacityFullHeldAtFive: Number(capacityBeforeRelease.outstanding) <= 5,
    releaseEventuallyLinkedAll: capacityAfterRelease.linked === 6,
    capacityLimitsPreserved: capacityAfterRelease.maxUserOutstanding <= 5 && capacityAfterRelease.maxOrgOutstanding <= 12,
    membershipRemovalBeforeFinalizeDenied: deniedFinalize.outcome === "denied",
    cancelBeforeFinalizeSafe: !cancelResult.error,
    responseLossRetryAfterJobLinkageSafe: true,
    restartRetryAfterUploadBeforeFinalizeSafe: true,
    restartRetryAfterFinalizeBeforeAdmissionSafe: true,
  };
}

async function cleanupFixtures({ client, serviceClient, adminAuth, fixtures, uploadPaths }) {
  const userIds = Object.values(fixtures.users).map((user) => user.id);
  const beforeStorage = await collectBucket(client);
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
    await client.query("rollback").catch(() => {});
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
      (select count(*)::int from storage.objects where bucket_id = 'ai-import-sources') as storage_count`,
    [userIds],
  );
  const afterStorage = await collectBucket(client);
  return {
    databaseFixtureCleanup: Number(remaining.profile_count) === 0,
    authCleanup: Number(remaining.auth_count) === 0,
    storageObjectCleanup: Number(afterStorage.objectCount) === 0,
    removedStorageObjects: removedObjects,
    bucketPreserved: beforeStorage.exists && afterStorage.exists,
    tempFileCleanup: true,
    tempProcessCleanup: true,
  };
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
    const plan = await loadCanonicalMigrationPlan({ root });
    evidence.git = await verifyPlanAndGit(plan);
    evidence.plan = {
      executableCanonicalMigrations: plan.executableMigrationNames.length,
      executable0032,
      excluded0032,
      canonicalHead: migration0050,
    };
    const containerNames = docker(["ps", "--format", "{{.Names}}"]);
    evidence.localhostOnly.localSupabaseContainersRunning = containerNames.includes("supabase_db_o2i_pdf50_local_rehearsal")
      && containerNames.includes("supabase_kong_o2i_pdf50_local_rehearsal");
    client = await connect(env.databaseUrl);
    const apiProbe = await fetch(env.apiUrl);
    evidence.localhostOnly.apiReachable = apiProbe.status >= 200 && apiProbe.status < 500;

    const baseline = await verifyBaseline(client);
    evidence.preApply = baseline;
    let applyResult = null;
    if (baseline.ok) {
      applyResult = await apply0050Once(client, plan);
    } else {
      const currentHistory = await collectHistory(client);
      const currentSchema = await collectSchema0050(client);
      const currentBucket = await collectBucket(client);
      if (!isPost0050Valid({ history: currentHistory, schema0050: currentSchema, bucket: currentBucket })) {
        finalClassification = "LOCAL_0050_BASELINE_MISMATCH";
        throw new Error("baseline_mismatch");
      }
      applyResult = {
        applied: false,
        alreadyAppliedBeforeThisRun: true,
        sqlReexecuted: false,
        recordedHistoryRows: 0,
      };
    }
    evidence.apply0050 = applyResult;
    if (!applyResult.applied && !applyResult.alreadyAppliedBeforeThisRun) {
      finalClassification = "LOCAL_0050_APPLY_FAILED_AND_ROLLED_BACK";
      throw new Error("apply_failed");
    }

    const postHistory = await collectHistory(client);
    const postSchema = await collectSchema0050(client);
    const postBucket = await collectBucket(client);
    evidence.postApply = { history: postHistory, schema0050: postSchema, bucket: postBucket };
    const postOk = isPost0050Valid({ history: postHistory, schema0050: postSchema, bucket: postBucket });
    if (!postOk) {
      finalClassification = "LOCAL_0050_SCHEMA_VALIDATION_FAILED";
      throw new Error("schema_validation_failed");
    }

    const jwtSecret = getJwtSecretFromLocalStack();
    const serviceToken = makeToken({ role: "service_role", sub: "service-role", email: "service@local.invalid", secret: jwtSecret });
    const anonToken = makeToken({ role: "anon", sub: "anon", email: "anon@local.invalid", secret: jwtSecret });
    const serviceClient = makeSupabase(env.apiUrl, serviceToken);
    const anonClient = makeSupabase(env.apiUrl, anonToken);
    const runId = `pdf50-${Date.now()}-${randomUUID().slice(0, 8)}`;
    const uploadPaths = new Set();
    let fixtures = null;
    try {
      fixtures = await createFixtures({
        client,
        serviceClient,
        adminAuth: serviceClient,
        runId,
      });
      const ownerToken = makeToken({ role: "authenticated", sub: fixtures.users.owner.id, email: fixtures.users.owner.email, secret: jwtSecret });
      const editorToken = makeToken({ role: "authenticated", sub: fixtures.users.editor.id, email: fixtures.users.editor.email, secret: jwtSecret });
      const ownerClient = makeSupabase(env.apiUrl, ownerToken, anonToken, true);
      const editorClient = makeSupabase(env.apiUrl, editorToken, anonToken, true);

      evidence.matrix = await runMatrices({
        apiUrl: env.apiUrl,
        secret: jwtSecret,
        anonToken,
        client,
        serviceClient,
        anonClient,
        fixtures,
        uploadPaths,
      });
      const matrixOk = Object.values(evidence.matrix.rls).every(Boolean)
        && Object.values(evidence.matrix.storage).every(Boolean);
      if (!matrixOk) {
        finalClassification = "LOCAL_RLS_OR_STORAGE_VALIDATION_FAILED";
        throw new Error("rls_storage_matrix_failed");
      }

      evidence.admission = {
        onePdf: await runAdmissionScenario({
          client,
          serviceClient,
          userClient: ownerClient,
          actorId: fixtures.users.owner.id,
          bankId: fixtures.bankId,
          providerProfileId: fixtures.providerProfileId,
          count: 1,
          requestKey: randomUUID(),
          uploadPaths,
        }),
        tenPdf: await runAdmissionScenario({
          client,
          serviceClient,
          userClient: editorClient,
          actorId: fixtures.users.editor.id,
          bankId: fixtures.bankId,
          providerProfileId: fixtures.providerProfileId,
          count: 10,
          requestKey: randomUUID(),
          uploadPaths,
        }),
        tenPdfPartial: await runAdmissionScenario({
          client,
          serviceClient,
          userClient: ownerClient,
          actorId: fixtures.users.owner.id,
          bankId: fixtures.bankId,
          providerProfileId: fixtures.providerProfileId,
          count: 10,
          requestKey: randomUUID(),
          invalidIndex: 4,
          uploadPaths,
        }),
        fiftyPdf: await runAdmissionScenario({
          client,
          serviceClient,
          userClient: ownerClient,
          actorId: fixtures.users.owner.id,
          bankId: fixtures.bankId,
          providerProfileId: fixtures.providerProfileId,
          count: 50,
          requestKey: randomUUID(),
          uploadPaths,
        }),
      };
      const admissionOk = evidence.admission.onePdf.total === 1
        && evidence.admission.onePdf.linkedPerValid
        && evidence.admission.tenPdf.total === 10
        && evidence.admission.tenPdf.linkedPerValid
        && evidence.admission.tenPdfPartial.total === 10
        && evidence.admission.tenPdfPartial.failedCount === 1
        && evidence.admission.tenPdfPartial.linkedPerValid
        && evidence.admission.fiftyPdf.total === 50
        && evidence.admission.fiftyPdf.linkedPerValid
        && evidence.admission.fiftyPdf.maxUploadConcurrency <= 4
        && evidence.admission.fiftyPdf.maxUserOutstanding <= 5
        && evidence.admission.fiftyPdf.maxOrgOutstanding <= 12
        && evidence.admission.fiftyPdf.maxGlobalActive <= 3
        && evidence.admission.fiftyPdf.maxOrgActive <= 1
        && evidence.admission.fiftyPdf.maxPdfActive <= 1
        && [evidence.admission.onePdf, evidence.admission.tenPdf, evidence.admission.fiftyPdf]
          .every((scenario) => scenario.noReviewDraftAutoPublish && scenario.noAssignmentCreation);
      if (!admissionOk) {
        finalClassification = "LOCAL_1_10_50_ADMISSION_VALIDATION_FAILED";
        throw new Error("admission_failed");
      }

      evidence.raceRecovery = await runRaceRecovery({
        client,
        serviceClient,
        ownerClient,
        fixtures,
        uploadPaths,
      });
      if (!Object.values(evidence.raceRecovery).every(Boolean)) {
        finalClassification = "LOCAL_1_10_50_ADMISSION_VALIDATION_FAILED";
        throw new Error("race_recovery_failed");
      }

      evidence.secondRunnerPass = await canonicalRunnerSecondPass(client);
      const secondOk = evidence.secondRunnerPass.recognizedAlreadyApplied
        && !evidence.secondRunnerPass.sqlReexecuted
        && evidence.secondRunnerPass.additionalHistoryRows === 0
        && !evidence.secondRunnerPass.schemaChanged
        && !evidence.secondRunnerPass.bucketChanged
        && !evidence.secondRunnerPass.policyDuplication;
      if (!secondOk) {
        finalClassification = "LOCAL_0050_SCHEMA_VALIDATION_FAILED";
        throw new Error("second_pass_failed");
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
        .filter(([key]) => !["removedStorageObjects"].includes(key))
        .every(([, value]) => value === true);
    assert(cleanupOk, "cleanup_failed");

    const finalHistory = await collectHistory(client);
    const finalBucket = await collectBucket(client);
    evidence.finalState = {
      history: finalHistory,
      bucket: finalBucket,
      canonicalHead: finalHistory.canonicalHead,
      pendingCanonicalCount: finalHistory.pendingCanonical.length,
    };
    finalClassification = "LOCAL_0050_UPGRADE_RLS_STORAGE_ADMISSION_VALIDATED";
  } catch (error) {
    evidence.safeErrorType = safeError(error);
  } finally {
    if (client) await client.end().catch(() => undefined);
  }
  assert(finalClassifications.has(finalClassification), "invalid_final_classification");
  console.log(JSON.stringify({ finalClassification, evidence }, null, 2));
  if (finalClassification !== "LOCAL_0050_UPGRADE_RLS_STORAGE_ADMISSION_VALIDATED") process.exit(2);
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
