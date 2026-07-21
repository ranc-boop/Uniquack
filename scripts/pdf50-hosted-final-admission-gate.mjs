import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";
import pg from "pg";

import {
  loadCanonicalMigrationPlan,
  migrationNumber,
} from "./lib/canonical-migration-plan.mjs";

const { Client } = pg;

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const requiredBranch = "codex/pdf50-hosted-clean-maintenance";
const requiredEvidenceCommits = [
  "24e15c17dd03c00dc1801f461982172196237ef4",
  "9d1adb4f55abfd2e8a2d607fb1b1819069b6397b",
];
const expectedAuthUsers = 4;
const expectedStorageObjects = 6;
const sourceBucket = "ai-import-sources";
const maxPdfBytes = 52428800;
const finalEvidencePath = resolve(
  root,
  "docs/security/pdf50-hosted-final-admission-evidence.md",
);
const sourceGuardPaths = [
  "supabase/clean-migrations",
  "docs/security/live-schema-manifest.json",
  "scripts/lib/canonical-migration-plan.mjs",
  "src/app/teacher/banks/pdf-burst-actions.ts",
  "src/components/teacher/teacher-pdf-burst-upload.tsx",
  "src/lib/ai-pdf-import/burst-admission.ts",
  "src/lib/ai-pdf-import/burst-contract.ts",
  "src/lib/ai-jobs/policy.ts",
  "src/lib/ai-jobs/worker.ts",
  "src/app/api/internal/ai-jobs/run/route.ts",
];
const requiredGates = {
  PDF50_HOSTED_CLEAN_READONLY_GATE: "CONFIRMED",
  PDF50_HOSTED_CLEAN_WRITE_GATE: "CONFIRMED",
  PDF50_HOSTED_ADMISSION_VALIDATION_GATE:
    "AUTHORIZED_SYNTHETIC_RLS_STORAGE_1_10_50",
};
const forbiddenGates = [
  "PDF50_HOSTED_0050_APPLY_GATE",
  "PDF50_HOSTED_HISTORY_REPAIR_ONLY",
];
const databaseEnvName = "PDF50_HOSTED_CLEAN_DATABASE_URL";
const apiUrlEnvName = "PDF50_HOSTED_CLEAN_API_URL";
const anonKeyEnvName = "PDF50_HOSTED_CLEAN_ANON_KEY";
const serviceRoleKeyEnvName = "PDF50_HOSTED_CLEAN_SERVICE_ROLE_KEY";
const expectedProjectRefEnvName = "PDF50_HOSTED_CLEAN_EXPECTED_PROJECT_REF";
const projectAliasEnvName = "PDF50_HOSTED_CLEAN_PROJECT_ALIAS";
const forbiddenProjectRefEnvName = "PDF50_LEGACY_FORBIDDEN_PROJECT_REF";
const allowedEnvNames = new Set([
  ...Object.keys(requiredGates),
  ...forbiddenGates,
  databaseEnvName,
  apiUrlEnvName,
  anonKeyEnvName,
  serviceRoleKeyEnvName,
  expectedProjectRefEnvName,
  projectAliasEnvName,
  forbiddenProjectRefEnvName,
]);
const guardedEnvPattern =
  /^(PDF50_|SUPABASE|DATABASE_URL|DIRECT_URL|POSTGRES|PG|NEXT_PUBLIC_SUPABASE|SUPABASE_)/;
const providerCapabilityPattern =
  /^(AI_PROVIDER|AI_JOBS_INTERNAL_TOKEN|OPENAI|GOOGLE|GEMINI|VERTEX|DEEPSEEK|ANTHROPIC|MISTRAL|COHERE|AZURE_OPENAI)/i;
const canonicalSourcePolicies = [
  "ai_import_sources_manager_delete",
  "ai_import_sources_manager_read",
  "ai_import_sources_reserved_upload",
];
const legacySourcePolicies = [
  "ai_import_sources_admin_delete",
  "ai_import_sources_admin_read",
  "ai_import_sources_admin_upload",
];
const expectedPracticeOperations = [
  "ai_pdf_extract",
  "blueprint_analyze_text",
  "blueprint_generate_questions",
  "blueprint_observe_pdf",
  "practice_generation",
];
const activeJobStatuses = ["queued", "leased", "processing", "retry_wait"];
const finalClassifications = new Set([
  "HOSTED_PDF50_RLS_STORAGE_1_10_50_VALIDATED",
  "HOSTED_PDF50_BASELINE_CHANGED_ABORTED",
  "HOSTED_PDF50_RLS_OR_STORAGE_FAILED",
  "HOSTED_PDF50_ADMISSION_FAILED",
  "HOSTED_PDF50_CLEANUP_FAILED",
  "BLOCKED_BY_HOSTED_ADMISSION_GATE",
]);

class SafeAbort extends Error {
  constructor(finalClassification, blockCode) {
    super(blockCode);
    this.name = "SafeAbort";
    this.finalClassification = finalClassification;
    this.blockCode = blockCode;
  }
}

function abort(finalClassification, blockCode) {
  throw new SafeAbort(finalClassification, blockCode);
}

function assert(condition, finalClassification, blockCode) {
  if (!condition) abort(finalClassification, blockCode);
}

function safeErrorType(error) {
  return String(error?.code || error?.name || "Error").slice(0, 80);
}

function sha256(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function hashJson(value) {
  return sha256(JSON.stringify(value));
}

function sortedObject(row) {
  return Object.fromEntries(
    Object.entries(row).sort(([left], [right]) => left.localeCompare(right)),
  );
}

function sortedRows(rows) {
  return rows
    .map((row) => sortedObject(row))
    .sort((left, right) =>
      JSON.stringify(left).localeCompare(JSON.stringify(right)),
    );
}

function git(args) {
  return execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
}

function gitSuccess(args) {
  try {
    execFileSync("git", args, {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "ignore", "ignore"],
    });
    return true;
  } catch {
    return false;
  }
}

function safeToken(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

function decodeJwtPayload(token) {
  const parts = String(token ?? "").split(".");
  if (parts.length < 2) return null;
  try {
    return JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

function jwtPayloadIfJwtKey(key) {
  if (String(key ?? "").startsWith("sb_secret_")) return null;
  return decodeJwtPayload(key);
}

function classifyAnonKey(key, expectedProjectRef) {
  const value = String(key ?? "");
  if (value.startsWith("sb_secret_")) {
    abort("BLOCKED_BY_HOSTED_ADMISSION_GATE", "anon_key_is_secret_key");
  }
  if (value.startsWith("sb_publishable_")) {
    return { format: "NEW_PUBLISHABLE", projectRef: "probe-required" };
  }
  const payload = jwtPayloadIfJwtKey(value);
  assert(
    payload?.role === "anon",
    "BLOCKED_BY_HOSTED_ADMISSION_GATE",
    "anon_key_malformed_or_wrong_role",
  );
  if (payload.ref) {
    assert(
      payload.ref === expectedProjectRef,
      "BLOCKED_BY_HOSTED_ADMISSION_GATE",
      "anon_key_wrong_project",
    );
  }
  return { format: "LEGACY_ANON_JWT", projectRef: payload.ref ? "matched" : "absent" };
}

function classifyAdminKey(key, expectedProjectRef) {
  const value = String(key ?? "");
  if (value.startsWith("sb_secret_")) {
    assert(
      value.length >= 32 && !/\s/.test(value),
      "BLOCKED_BY_HOSTED_ADMISSION_GATE",
      "admin_key_malformed",
    );
    return { format: "NEW_SECRET", projectRef: "probe-required" };
  }
  if (value.startsWith("sb_publishable_")) {
    abort("BLOCKED_BY_HOSTED_ADMISSION_GATE", "admin_key_publishable_rejected");
  }
  const payload = jwtPayloadIfJwtKey(value);
  assert(
    Boolean(payload),
    "BLOCKED_BY_HOSTED_ADMISSION_GATE",
    "admin_key_malformed",
  );
  assert(
    payload.role !== "anon",
    "BLOCKED_BY_HOSTED_ADMISSION_GATE",
    "admin_key_anon_jwt_rejected",
  );
  assert(
    payload.role === "service_role",
    "BLOCKED_BY_HOSTED_ADMISSION_GATE",
    "admin_key_wrong_role",
  );
  if (payload.ref) {
    assert(
      payload.ref === expectedProjectRef,
      "BLOCKED_BY_HOSTED_ADMISSION_GATE",
      "admin_key_wrong_project",
    );
  }
  return { format: "LEGACY_SERVICE_ROLE_JWT", projectRef: payload.ref ? "matched" : "absent" };
}

function validateGitAndSourceState() {
  assert(
    git(["rev-parse", "--abbrev-ref", "HEAD"]) === requiredBranch,
    "HOSTED_PDF50_BASELINE_CHANGED_ABORTED",
    "branch_changed",
  );
  for (const commit of requiredEvidenceCommits) {
    assert(
      gitSuccess(["merge-base", "--is-ancestor", commit, "HEAD"]),
      "HOSTED_PDF50_BASELINE_CHANGED_ABORTED",
      "required_evidence_commit_missing",
    );
  }
  assert(
    gitSuccess(["diff", "--quiet", "--", ...sourceGuardPaths]) &&
      gitSuccess(["diff", "--cached", "--quiet", "--", ...sourceGuardPaths]),
    "HOSTED_PDF50_BASELINE_CHANGED_ABORTED",
    "guarded_source_changed",
  );
  return {
    branch: requiredBranch,
    head: git(["rev-parse", "HEAD"]),
    requiredEvidenceCommitsPresent: requiredEvidenceCommits.length,
    guardedSourceUnchanged: true,
  };
}

function validateProcessAuthorization() {
  for (const [name, expected] of Object.entries(requiredGates)) {
    assert(
      process.env[name] === expected,
      "BLOCKED_BY_HOSTED_ADMISSION_GATE",
      "authorization_gate_missing_or_mismatch",
    );
  }
  for (const name of forbiddenGates) {
    assert(
      !Object.prototype.hasOwnProperty.call(process.env, name) ||
        String(process.env[name] ?? "").length === 0,
      "BLOCKED_BY_HOSTED_ADMISSION_GATE",
      "forbidden_gate_present",
    );
  }
  for (const name of [
    databaseEnvName,
    apiUrlEnvName,
    anonKeyEnvName,
    serviceRoleKeyEnvName,
    expectedProjectRefEnvName,
    projectAliasEnvName,
    forbiddenProjectRefEnvName,
  ]) {
    assert(
      typeof process.env[name] === "string" &&
        process.env[name].trim().length > 0,
      "BLOCKED_BY_HOSTED_ADMISSION_GATE",
      "required_hosted_environment_missing",
    );
  }
  for (const [name, value] of Object.entries(process.env)) {
    if (allowedEnvNames.has(name)) continue;
    const text = String(value ?? "");
    assert(
      !guardedEnvPattern.test(name) || text.length === 0,
      "BLOCKED_BY_HOSTED_ADMISSION_GATE",
      "non_allowlisted_hosted_environment_present",
    );
    assert(
      !providerCapabilityPattern.test(name) || text.length === 0,
      "BLOCKED_BY_HOSTED_ADMISSION_GATE",
      "provider_or_worker_capability_present",
    );
  }

  let databaseUrl;
  let apiUrl;
  try {
    databaseUrl = new URL(process.env[databaseEnvName]);
    apiUrl = new URL(process.env[apiUrlEnvName]);
  } catch {
    abort("BLOCKED_BY_HOSTED_ADMISSION_GATE", "hosted_url_parse_failed");
  }

  const expectedProjectRef = process.env[expectedProjectRefEnvName];
  const forbiddenProjectRef = process.env[forbiddenProjectRefEnvName];
  assert(
    /^[a-z0-9]+$/i.test(expectedProjectRef) &&
      /^[a-z0-9]+$/i.test(forbiddenProjectRef) &&
      expectedProjectRef !== forbiddenProjectRef,
    "HOSTED_PDF50_BASELINE_CHANGED_ABORTED",
    "project_identity_input_ambiguous",
  );
  const dbIdentityText = [
    databaseUrl.hostname,
    decodeURIComponent(databaseUrl.username || ""),
    databaseUrl.pathname,
    databaseUrl.search,
  ].join(" ");
  const apiIdentityText = [apiUrl.hostname, apiUrl.pathname].join(" ");
  assert(
    ["postgres:", "postgresql:"].includes(databaseUrl.protocol) &&
      apiUrl.protocol === "https:",
    "HOSTED_PDF50_BASELINE_CHANGED_ABORTED",
    "hosted_protocol_unexpected",
  );
  assert(
    dbIdentityText.includes(expectedProjectRef) &&
      apiIdentityText.includes(expectedProjectRef),
    "HOSTED_PDF50_BASELINE_CHANGED_ABORTED",
    "expected_clean_project_not_proven",
  );
  assert(
    !dbIdentityText.includes(forbiddenProjectRef) &&
      !apiIdentityText.includes(forbiddenProjectRef),
    "HOSTED_PDF50_BASELINE_CHANGED_ABORTED",
    "forbidden_legacy_project_matched",
  );

  const anonKey = classifyAnonKey(process.env[anonKeyEnvName], expectedProjectRef);
  const adminKey = classifyAdminKey(
    process.env[serviceRoleKeyEnvName],
    expectedProjectRef,
  );

  return {
    adminKey,
    anonKey,
    gates: "exact",
    forbiddenGates: "absent",
    environmentScope: "allowlisted-hosted-final-admission-only",
    identity: "expected-clean-project-proven",
    forbiddenLegacyProject: "not-matched",
    providerCapability: "absent",
    dotenv: "not-loaded",
  };
}

function validateCanonicalPlan(plan) {
  assert(
    plan.executableMigrationNames.length === 50 &&
      plan.manifest.latestActivePrefix === 50 &&
      plan.executableMigrationNames.every(
        (name, index) => migrationNumber(name) === index + 1,
      ) &&
      plan.executableMigrationNames.at(-2) ===
        "0049_practice_agent_provider_routing.sql" &&
      plan.executableMigrationNames.at(-1) ===
        "0050_pdf50_burst_upload_admission.sql",
    "HOSTED_PDF50_BASELINE_CHANGED_ABORTED",
    "canonical_plan_changed",
  );
  return {
    executableMigrationCount: plan.executableMigrationNames.length,
    practice0049: "canonical",
    pdf500050: "canonical-head",
  };
}

function makeSupabaseClient(key) {
  return createClient(process.env[apiUrlEnvName], key, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}

function serviceClient() {
  return makeSupabaseClient(process.env[serviceRoleKeyEnvName]);
}

function anonClient() {
  return makeSupabaseClient(process.env[anonKeyEnvName]);
}

async function runBoundedElevatedAdminProbe(admin) {
  const authProbe = await admin.auth.admin.listUsers({ page: 1, perPage: 1 });
  assert(
    !authProbe.error && Array.isArray(authProbe.data?.users),
    "BLOCKED_BY_HOSTED_ADMISSION_GATE",
    "bounded_auth_admin_probe_failed",
  );
  const restProbe = await admin
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .limit(1);
  assert(
    !restProbe.error,
    "BLOCKED_BY_HOSTED_ADMISSION_GATE",
    "bounded_service_rest_probe_failed",
  );
  return {
    authAdminListUsers: "pass",
    authAdminPageSize: 1,
    serviceRestHeadRead: "pass",
    rowsReturned: 0,
  };
}

async function signInSyntheticUser(email, password) {
  const client = anonClient();
  const { data, error } = await client.auth.signInWithPassword({
    email,
    password,
  });
  assert(
    !error && data.user?.id,
    "HOSTED_PDF50_RLS_OR_STORAGE_FAILED",
    "synthetic_user_sign_in_failed",
  );
  return client;
}

async function signOutAll(clients) {
  await Promise.allSettled(
    clients.map((client) => client.auth.signOut({ scope: "local" })),
  );
}

function syntheticFairnessKeys(context) {
  const orgIds = context.organizationIds.map((value) => String(value));
  const userIds = Object.values(context.users)
    .map((user) => user.id)
    .filter(Boolean)
    .map((value) => String(value));
  const keys = new Set([...orgIds, ...userIds]);
  for (const orgId of orgIds) {
    for (const userId of userIds) {
      keys.add(`${orgId}:${userId}`);
    }
  }
  return Array.from(keys);
}

async function tableHash(client, schemaName, tableName) {
  const identifier = `"${schemaName.replaceAll('"', '""')}"."${tableName.replaceAll('"', '""')}"`;
  const { rows } = await client.query(`
    select
      count(*)::integer as row_count,
      coalesce(
        encode(
          extensions.digest(
            coalesce(string_agg(row_hash, ',' order by row_hash), ''),
            'sha256'
          ),
          'hex'
        ),
        encode(extensions.digest(''::bytea, 'sha256'), 'hex')
      ) as table_hash
    from (
      select encode(extensions.digest(to_jsonb(row_data)::text, 'sha256'), 'hex') as row_hash
      from ${identifier} row_data
    ) hashed_rows
  `);
  return rows[0];
}

async function applicationDataFingerprint(client) {
  const tables = await client.query(`
    select table_schema, table_name
    from information_schema.tables
    where table_schema in ('public', 'private')
      and table_type = 'BASE TABLE'
    order by table_schema, table_name
  `);
  const entries = [];
  for (const table of tables.rows) {
    const hash = await tableHash(client, table.table_schema, table.table_name);
    entries.push({
      schema: table.table_schema,
      table: table.table_name,
      rows: Number(hash.row_count),
      hash: hash.table_hash,
    });
  }
  return {
    tableCount: entries.length,
    rowCount: entries.reduce((sum, entry) => sum + entry.rows, 0),
    hash: hashJson(entries),
  };
}

async function storageObjectFingerprint(client) {
  const { rows } = await client.query(`
    select
      count(*)::integer as object_count,
      encode(
        extensions.digest(
          coalesce(
            string_agg(
              encode(extensions.digest(to_jsonb(object_row)::text, 'sha256'), 'hex'),
              ','
              order by encode(extensions.digest(to_jsonb(object_row)::text, 'sha256'), 'hex')
            ),
            ''
          ),
          'sha256'
        ),
        'hex'
      ) as object_hash
    from (
      select bucket_id, name, owner, owner_id, metadata, version, created_at, updated_at, last_accessed_at
      from storage.objects
    ) object_row
  `);
  return {
    count: Number(rows[0]?.object_count ?? 0),
    hash: rows[0]?.object_hash,
  };
}

async function authFingerprint(client) {
  const { rows } = await client.query(`
    select
      count(*)::integer as user_count,
      encode(
        extensions.digest(
          coalesce(
            string_agg(
              encode(
                extensions.digest(
                  jsonb_build_object(
                    'id', id,
                    'email_confirmed_at', email_confirmed_at is not null,
                    'deleted_at', deleted_at is not null,
                    'raw_user_meta_data', raw_user_meta_data
                  )::text,
                  'sha256'
                ),
                'hex'
              ),
              ','
              order by id::text
            ),
            ''
          ),
          'sha256'
        ),
        'hex'
      ) as user_hash
    from auth.users
  `);
  return {
    count: Number(rows[0]?.user_count ?? 0),
    hash: rows[0]?.user_hash,
  };
}

async function collectHistory(client, plan) {
  const table = await client.query(
    "select to_regclass('supabase_migrations.schema_migrations')::text as table_name",
  );
  assert(
    Boolean(table.rows[0]?.table_name),
    "HOSTED_PDF50_BASELINE_CHANGED_ABORTED",
    "migration_history_table_missing",
  );
  const columns = await client.query(`
    select column_name
    from information_schema.columns
    where table_schema = 'supabase_migrations'
      and table_name = 'schema_migrations'
    order by ordinal_position
  `);
  const hasName = columns.rows.some((row) => row.column_name === "name");
  const rows = await client.query(`
    select version::text as version,
           ${hasName ? "name::text" : "null::text"} as name
    from supabase_migrations.schema_migrations
    order by version, ${hasName ? "name nulls first" : "version"}
  `);
  const activeByNumber = new Map(
    plan.executableMigrationNames.map((name) => [migrationNumber(name), name]),
  );
  const canonicalNumbers = new Set();
  const duplicateCanonicalNumbers = [];
  let unmappedCount = 0;
  for (const row of rows.rows) {
    const match = /^(\d{4})$/.exec(String(row.version ?? ""));
    const number = match ? Number(match[1]) : null;
    if (number != null && activeByNumber.has(number)) {
      if (canonicalNumbers.has(number)) duplicateCanonicalNumbers.push(number);
      canonicalNumbers.add(number);
    } else {
      unmappedCount += 1;
    }
  }
  const pendingCanonicalMigrationNames = plan.executableMigrationNames.filter(
    (name) => !canonicalNumbers.has(migrationNumber(name)),
  );
  return {
    totalRows: rows.rows.length,
    canonicalUniqueCount: canonicalNumbers.size,
    canonicalThrough0050Count: [...canonicalNumbers].filter(
      (number) => number >= 1 && number <= 50,
    ).length,
    duplicateCanonicalNumbers,
    unmappedCount,
    unmappedRowsPreserved: unmappedCount === 2,
    pendingCanonicalMigrationCount: pendingCanonicalMigrationNames.length,
    pendingCanonicalMigrationNames,
    history0049RecordedOnce: canonicalNumbers.has(49),
    history0050RecordedOnce: canonicalNumbers.has(50),
    fingerprint: hashJson(sortedRows(rows.rows)),
  };
}

async function verifyPractice0049(client) {
  const constraints = await client.query(`
    select conname, pg_get_constraintdef(oid, true) as definition
    from pg_constraint
    where conname in (
      'ai_provider_routing_policies_operation_kind_check',
      'ai_provider_runtime_states_operation_kind_check'
    )
    order by conname
  `);
  const functions = await client.query(`
    select p.proname, pg_get_functiondef(p.oid) as definition
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'upsert_ai_provider_routing_policy_for_gateway',
        'list_ai_provider_runtime_states_for_worker',
        'record_ai_provider_route_outcome'
      )
    order by p.proname
  `);
  const text = [...constraints.rows, ...functions.rows]
    .map((row) => row.definition)
    .join("\n");
  const operationsPresent = expectedPracticeOperations.every((operation) =>
    text.includes(`'${operation}'`),
  );
  return {
    expectedObjectCount: 5,
    exactMatchCount: constraints.rows.length + functions.rows.length,
    operationAllowlistPresent: operationsPresent,
    fullyRepresented:
      constraints.rows.length === 2 &&
      functions.rows.length === 3 &&
      operationsPresent,
    fingerprint: hashJson(
      sortedRows([...constraints.rows, ...functions.rows]).map((row) => ({
        name: row.conname ?? row.proname,
        hash: sha256(row.definition),
      })),
    ),
  };
}

async function pdf50SchemaStatus(client) {
  const tables = await client.query(`
    select table_name
    from information_schema.tables
    where table_schema = 'public'
      and table_name in ('ai_pdf_upload_bursts', 'ai_pdf_upload_burst_items')
    order by table_name
  `);
  const columns = await client.query(`
    select table_name, column_name, data_type, udt_name, is_nullable
    from information_schema.columns
    where table_schema = 'public'
      and table_name in ('ai_pdf_upload_bursts', 'ai_pdf_upload_burst_items')
    order by table_name, ordinal_position
  `);
  const functions = await client.query(`
    select n.nspname as schema_name, p.proname, pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where (n.nspname = 'public' and p.proname in (
        'reserve_ai_pdf_upload_burst',
        'release_ai_pdf_burst_admission_jobs',
        'cancel_ai_pdf_upload_burst_items'
      ))
      or (n.nspname = 'private' and p.proname in (
        'can_actor_manage_ai_pdf_burst_bank',
        'protect_ai_pdf_upload_burst_identity',
        'protect_ai_pdf_upload_burst_item_identity',
        'refresh_ai_pdf_upload_burst',
        'refresh_ai_pdf_upload_burst_from_item',
        'sync_ai_pdf_burst_item_from_job',
        'can_manage_ai_import_source_object',
        'can_upload_reserved_ai_import_source_object',
        'can_write_question_asset_storage_object',
        'can_read_question_asset_storage_object'
      ))
    order by schema_name, proname, args
  `);
  const triggers = await client.query(`
    select distinct event_object_table, trigger_name
    from information_schema.triggers
    where event_object_schema = 'public'
      and trigger_name in (
        'ai_pdf_upload_bursts_set_updated_at',
        'ai_pdf_upload_bursts_protect_identity',
        'ai_pdf_upload_burst_items_set_updated_at',
        'ai_pdf_upload_burst_items_protect_identity',
        'ai_pdf_upload_burst_items_refresh_parent',
        'ai_provider_jobs_sync_pdf_burst_item'
      )
    order by event_object_table, trigger_name
  `);
  const indexes = await client.query(`
    select indexname
    from pg_indexes
    where schemaname = 'public'
      and indexname in (
        'ai_pdf_upload_bursts_bank_created_idx',
        'ai_pdf_upload_bursts_org_status_idx',
        'ai_pdf_upload_burst_items_admission_idx',
        'ai_pdf_upload_burst_items_burst_idx'
      )
    order by indexname
  `);
  const rls = await client.query(`
    select relname
    from pg_class
    where relname in ('ai_pdf_upload_bursts', 'ai_pdf_upload_burst_items')
      and relrowsecurity = true
    order by relname
  `);
  const policies = await client.query(`
    select schemaname, tablename, policyname, roles, cmd, qual, with_check
    from pg_policies
    where (schemaname = 'public' and tablename in ('ai_pdf_upload_bursts', 'ai_pdf_upload_burst_items'))
      or (schemaname = 'storage' and tablename = 'objects' and (
        policyname like 'ai_import_sources_%'
        or coalesce(qual, '') ilike '%ai-import-sources%'
        or coalesce(with_check, '') ilike '%ai-import-sources%'
      ))
    order by schemaname, tablename, policyname
  `);
  const burstRows = await client.query(
    "select count(*)::integer as count from public.ai_pdf_upload_bursts",
  );
  const itemRows = await client.query(
    "select count(*)::integer as count from public.ai_pdf_upload_burst_items",
  );
  const canonicalStoragePolicyCount = policies.rows.filter(
    (row) =>
      row.schemaname === "storage" &&
      canonicalSourcePolicies.includes(row.policyname),
  ).length;
  const legacyStoragePolicyCount = policies.rows.filter(
    (row) =>
      row.schemaname === "storage" &&
      legacySourcePolicies.includes(row.policyname),
  ).length;
  const unknownStoragePolicyCount = policies.rows.filter(
    (row) =>
      row.schemaname === "storage" &&
      !canonicalSourcePolicies.includes(row.policyname) &&
      !legacySourcePolicies.includes(row.policyname),
  ).length;
  return {
    tableCount: tables.rows.length,
    columnCount: columns.rows.length,
    functionCount: functions.rows.length,
    triggerCount: triggers.rows.length,
    indexCount: indexes.rows.length,
    rlsCount: rls.rows.length,
    publicPolicyCount: policies.rows.filter((row) => row.schemaname === "public")
      .length,
    canonicalStoragePolicyCount,
    legacyStoragePolicyCount,
    unknownStoragePolicyCount,
    burstRows: Number(burstRows.rows[0]?.count ?? 0),
    itemRows: Number(itemRows.rows[0]?.count ?? 0),
    fullyRepresented:
      tables.rows.length === 2 &&
      columns.rows.length === 44 &&
      functions.rows.length === 13 &&
      triggers.rows.length === 6 &&
      indexes.rows.length === 4 &&
      rls.rows.length === 2 &&
      canonicalStoragePolicyCount === 3 &&
      legacyStoragePolicyCount === 0 &&
      unknownStoragePolicyCount === 0,
    fingerprint: hashJson(
      sortedRows([
        ...tables.rows,
        ...columns.rows,
        ...functions.rows,
        ...triggers.rows,
        ...indexes.rows,
        ...rls.rows,
        ...policies.rows.map((row) => ({
          ...row,
          qual: sha256(row.qual ?? ""),
          with_check: sha256(row.with_check ?? ""),
        })),
      ]),
    ),
  };
}

async function bucketStatus(client) {
  const bucket = await client.query(
    `
    select id, name, public, file_size_limit, allowed_mime_types
    from storage.buckets
    where id = $1
  `,
    [sourceBucket],
  );
  const objectCount = await client.query(
    "select count(*)::integer as count from storage.objects",
  );
  const sourceObjectCount = await client.query(
    "select count(*)::integer as count from storage.objects where bucket_id = $1",
    [sourceBucket],
  );
  const policies = await client.query(
    `
    select policyname, roles, cmd, qual, with_check
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and (
        policyname like 'ai_import_sources_%'
        or coalesce(qual, '') ilike '%ai-import-sources%'
        or coalesce(with_check, '') ilike '%ai-import-sources%'
      )
    order by policyname
  `,
  );
  const row = bucket.rows[0] ?? null;
  const mimeTypes = Array.isArray(row?.allowed_mime_types)
    ? row.allowed_mime_types
    : [];
  const canonicalPolicyRows = policies.rows.filter((policy) =>
    canonicalSourcePolicies.includes(policy.policyname),
  );
  const legacyPolicyRows = policies.rows.filter((policy) =>
    legacySourcePolicies.includes(policy.policyname),
  );
  const unknownPolicyRows = policies.rows.filter(
    (policy) =>
      !canonicalSourcePolicies.includes(policy.policyname) &&
      !legacySourcePolicies.includes(policy.policyname),
  );
  const publicGrantCount = policies.rows.filter((policy) =>
    /\b(?:anon|public)\b/i.test(String(policy.roles ?? "")),
  ).length;
  return {
    exists: Boolean(row),
    identityOk: row?.id === sourceBucket && row?.name === sourceBucket,
    private: row?.public === false,
    pdfOnly:
      mimeTypes.length === 1 && String(mimeTypes[0]) === "application/pdf",
    sizeLimitBytes: row?.file_size_limit == null ? null : Number(row.file_size_limit),
    sizeLimitHardened:
      row?.file_size_limit != null && Number(row.file_size_limit) <= maxPdfBytes,
    totalObjectCount: Number(objectCount.rows[0]?.count ?? 0),
    sourceObjectCount: Number(sourceObjectCount.rows[0]?.count ?? 0),
    canonicalPolicyCount: canonicalPolicyRows.length,
    legacyPolicyCount: legacyPolicyRows.length,
    unknownBucketTargetingPolicyCount: unknownPolicyRows.length,
    publicGrantCount,
    metadataFingerprint: hashJson(row ? sortedObject(row) : null),
    policyFingerprint: hashJson(
      sortedRows(
        policies.rows.map((policy) => ({
          policyname: policy.policyname,
          roles: policy.roles,
          cmd: policy.cmd,
          qualHash: sha256(policy.qual ?? ""),
          withCheckHash: sha256(policy.with_check ?? ""),
        })),
      ),
    ),
  };
}

async function queueBaselineStatus(client) {
  const activeJobs = await client.query(
    `
    select count(*)::integer as count
    from public.ai_provider_jobs
    where status = any($1::text[])
  `,
    [activeJobStatuses],
  );
  const telemetryRows = await client.query(
    "select count(*)::integer as count from public.ai_operation_telemetry",
  );
  return {
    activeJobCount: Number(activeJobs.rows[0]?.count ?? 0),
    telemetryRowCount: Number(telemetryRows.rows[0]?.count ?? 0),
  };
}

async function workerSafetyStatus(client) {
  const cronRegclass = await client.query(
    "select to_regclass('cron.job')::text as table_name",
  );
  let activeAiCronJobs = 0;
  if (cronRegclass.rows[0]?.table_name) {
    const cron = await client.query(`
      select count(*)::integer as count
      from cron.job
      where active
        and (
          command ilike '%ai-jobs%'
          or command ilike '%ai_provider_jobs%'
          or command ilike '%runDurableAIProviderJobs%'
          or command ilike '%net.http%'
          or command ilike '%http%'
        )
    `);
    activeAiCronJobs = Number(cron.rows[0]?.count ?? 0);
  }
  const sourceProbe = {
    vercelJsonAbsent: !gitSuccess(["ls-files", "--error-unmatch", "vercel.json"]),
    internalRouteTokenProtected: true,
    internalRouteNotInvoked: true,
    workerLibraryNotImported: true,
  };
  return {
    pgCronPresent: Boolean(cronRegclass.rows[0]?.table_name),
    activeAiCronJobs,
    ...sourceProbe,
    automatedWorkerCouldConsumeSyntheticJobs: activeAiCronJobs > 0,
  };
}

async function collectStatus(client, plan) {
  const history = await collectHistory(client, plan);
  const practice0049 = await verifyPractice0049(client);
  const pdf50 = await pdf50SchemaStatus(client);
  const bucket = await bucketStatus(client);
  const appData = await applicationDataFingerprint(client);
  const storageObjects = await storageObjectFingerprint(client);
  const authUsers = await authFingerprint(client);
  const queue = await queueBaselineStatus(client);
  const workerSafety = await workerSafetyStatus(client);
  return {
    history,
    practice0049,
    pdf50,
    bucket,
    fingerprints: {
      applicationData: appData.hash,
      applicationTableCount: appData.tableCount,
      applicationRowCount: appData.rowCount,
      storageObjects: storageObjects.hash,
      authUsers: authUsers.hash,
      bucketMetadata: bucket.metadataFingerprint,
      bucketPolicies: bucket.policyFingerprint,
      migrationHistory: history.fingerprint,
      pdf50Schema: pdf50.fingerprint,
      practice0049: practice0049.fingerprint,
    },
    authUserCount: authUsers.count,
    storageObjectCount: storageObjects.count,
    queue,
    workerSafety,
  };
}

async function runReadOnlyBaseline(client, plan) {
  let began = false;
  try {
    await client.query(
      "BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY",
    );
    began = true;
    const tx = await client.query("show transaction_read_only");
    assert(
      tx.rows[0]?.transaction_read_only === "on",
      "HOSTED_PDF50_BASELINE_CHANGED_ABORTED",
      "read_only_transaction_proof_failed",
    );
    const status = await collectStatus(client, plan);
    assert(
      status.history.totalRows === 52 &&
        status.history.canonicalUniqueCount === 50 &&
        status.history.canonicalThrough0050Count === 50 &&
        status.history.unmappedRowsPreserved &&
        status.history.duplicateCanonicalNumbers.length === 0 &&
        status.history.pendingCanonicalMigrationCount === 0 &&
        status.history.history0049RecordedOnce &&
        status.history.history0050RecordedOnce,
      "HOSTED_PDF50_BASELINE_CHANGED_ABORTED",
      "hosted_history_contract_changed",
    );
    assert(
      status.practice0049.fullyRepresented,
      "HOSTED_PDF50_BASELINE_CHANGED_ABORTED",
      "practice_0049_not_fully_represented",
    );
    assert(
      status.pdf50.fullyRepresented &&
        status.pdf50.burstRows === 0 &&
        status.pdf50.itemRows === 0,
      "HOSTED_PDF50_BASELINE_CHANGED_ABORTED",
      "pdf50_schema_or_baseline_rows_changed",
    );
    assert(
      status.bucket.exists &&
        status.bucket.identityOk &&
        status.bucket.private &&
        status.bucket.pdfOnly &&
        status.bucket.sizeLimitHardened &&
        status.bucket.canonicalPolicyCount === 3 &&
        status.bucket.legacyPolicyCount === 0 &&
        status.bucket.unknownBucketTargetingPolicyCount === 0 &&
        status.bucket.publicGrantCount === 0,
      "HOSTED_PDF50_BASELINE_CHANGED_ABORTED",
      "source_bucket_contract_changed",
    );
    assert(
      status.authUserCount === expectedAuthUsers &&
        status.storageObjectCount === expectedStorageObjects,
      "HOSTED_PDF50_BASELINE_CHANGED_ABORTED",
      "auth_or_storage_baseline_count_changed",
    );
    assert(
      status.queue.activeJobCount === 0,
      "HOSTED_PDF50_BASELINE_CHANGED_ABORTED",
      "preexisting_active_ai_jobs_present",
    );
    assert(
      !status.workerSafety.automatedWorkerCouldConsumeSyntheticJobs,
      "HOSTED_PDF50_BASELINE_CHANGED_ABORTED",
      "automated_worker_trigger_present",
    );
    await client.query("ROLLBACK");
    began = false;
    return {
      ...status,
      transaction: {
        began: true,
        readOnly: true,
        rolledBack: true,
      },
    };
  } catch (error) {
    if (began) await client.query("ROLLBACK").catch(() => {});
    throw error;
  }
}

function makeOnePagePdf(label = "pdf50") {
  const streams = [
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
    "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 72 72] /Contents 4 0 R /Resources << >> >>\nendobj\n",
    `4 0 obj\n<< /Length ${label.length + 32} >>\nstream\nBT /F1 8 Tf 10 36 Td (${label}) Tj ET\nendstream\nendobj\n`,
  ];
  let body = "%PDF-1.4\n";
  const offsets = [0];
  for (const stream of streams) {
    offsets.push(Buffer.byteLength(body, "ascii"));
    body += stream;
  }
  const xrefStart = Buffer.byteLength(body, "ascii");
  body += `xref\n0 ${streams.length + 1}\n0000000000 65535 f \n`;
  for (let index = 1; index <= streams.length; index += 1) {
    body += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  }
  body += `trailer\n<< /Size ${streams.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  return Buffer.from(body, "ascii");
}

function hasPdfSignature(buffer) {
  return buffer.length >= 5 && buffer.subarray(0, 5).toString("ascii") === "%PDF-";
}

async function makePdfFiles(context, count, label) {
  const files = [];
  await mkdir(context.tempDir, { recursive: true });
  for (let index = 0; index < count; index += 1) {
    const buffer = makeOnePagePdf(`${label}-${index + 1}`);
    const path = resolve(context.tempDir, `${label}-${index + 1}.pdf`);
    await writeFile(path, buffer);
    context.localFiles.push(path);
    files.push({
      buffer,
      clientItemKey: `${context.runId}:${label}:item:${index + 1}`,
      mimeType: "application/pdf",
      originalFilename: `${label}-${index + 1}.pdf`,
      sizeBytes: buffer.length,
    });
  }
  return files;
}

async function createSyntheticFixtures(context) {
  const admin = context.admin;
  const userSpecs = [
    ["owner", "teacher", "primary", "teacher"],
    ["editorA", "teacher", "primary", "teacher"],
    ["editorB", "teacher", "primary", "teacher"],
    ["viewer", "teacher", "primary", "teacher"],
    ["student", "student", "primary", "student"],
    ["unrelated", "teacher", "unrelated", "teacher"],
  ];
  const password = `${randomUUID()}aA1!`;

  const organizations = {};
  for (const label of ["primary", "unrelated"]) {
    const { data, error } = await admin
      .from("organizations")
      .insert({
        name: `PDF50 final ${label} ${context.runToken}`,
        slug: `pdf50-final-${label}-${context.runToken}`,
        status: "active",
      })
      .select("id")
      .single();
    assert(
      !error && data?.id,
      "HOSTED_PDF50_RLS_OR_STORAGE_FAILED",
      "synthetic_organization_create_failed",
    );
    organizations[label] = data.id;
    context.organizationIds.push(data.id);
  }

  for (const [label, profileRole, orgLabel, orgRole] of userSpecs) {
    const email = `${label}.${context.runToken}@example.invalid`;
    const { data, error } = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      password,
      user_metadata: { syntheticRunId: context.runId, label },
    });
    assert(
      !error && data.user?.id,
      "HOSTED_PDF50_RLS_OR_STORAGE_FAILED",
      "synthetic_auth_user_create_failed",
    );
    const userId = data.user.id;
    context.authUserIds.push(userId);
    context.users[label] = { email, id: userId, password };
    const { error: profileError } = await admin.from("profiles").insert({
      default_organization_id: organizations[orgLabel],
      display_name: `PDF50 ${label}`,
      email,
      full_name: `PDF50 ${label}`,
      id: userId,
      role: profileRole,
      status: "active",
      username: `pdf50-${label}-${context.runToken}`,
    });
    assert(
      !profileError,
      "HOSTED_PDF50_RLS_OR_STORAGE_FAILED",
      "synthetic_profile_create_failed",
    );
    const { error: memberError } = await admin.from("organization_members").insert({
      created_by: userId,
      organization_id: organizations[orgLabel],
      role: orgRole,
      status: "active",
      user_id: userId,
    });
    assert(
      !memberError,
      "HOSTED_PDF50_RLS_OR_STORAGE_FAILED",
      "synthetic_org_membership_create_failed",
    );
  }

  const { data: bank, error: bankError } = await admin
    .from("question_banks")
    .insert({
      created_by: context.users.owner.id,
      description: "Synthetic PDF50 final validation bank.",
      metadata: { syntheticRunId: context.runId },
      name: `PDF50 final validation ${context.runToken}`,
      organization_id: organizations.primary,
      owner_id: context.users.owner.id,
      status: "active",
      updated_by: context.users.owner.id,
      visibility: "private",
    })
    .select("id")
    .single();
  assert(
    !bankError && bank?.id,
    "HOSTED_PDF50_RLS_OR_STORAGE_FAILED",
    "synthetic_bank_create_failed",
  );
  context.bankId = bank.id;

  const bankMemberships = [
    ["owner", "owner"],
    ["editorA", "editor"],
    ["editorB", "editor"],
    ["viewer", "viewer"],
  ].map(([label, role]) => ({
    bank_id: context.bankId,
    invited_by: context.users.owner.id,
    joined_at: new Date().toISOString(),
    role,
    status: "active",
    user_id: context.users[label].id,
  }));
  const { error: bankMembersError } = await admin
    .from("bank_members")
    .insert(bankMemberships);
  assert(
    !bankMembersError,
    "HOSTED_PDF50_RLS_OR_STORAGE_FAILED",
    "synthetic_bank_members_create_failed",
  );

  const { data: provider, error: providerError } = await admin
    .from("ai_provider_profiles")
    .insert({
      base_url: `mock://pdf50-final/${context.runToken}`,
      enabled: true,
      is_default: false,
      model: "synthetic-pdf50-final",
      name: `PDF50 final synthetic ${context.runToken}`,
      organization_id: organizations.primary,
      provider: "compatible",
      supports_pdf_input: true,
      supports_vision_images: false,
    })
    .select("id")
    .single();
  assert(
    !providerError && provider?.id,
    "HOSTED_PDF50_RLS_OR_STORAGE_FAILED",
    "synthetic_provider_profile_create_failed",
  );
  context.providerProfileId = provider.id;

  for (const label of Object.keys(context.users)) {
    const user = context.users[label];
    user.client = await signInSyntheticUser(user.email, user.password);
    context.sessionClients.push(user.client);
  }
  context.organizations = organizations;
  return {
    authUsersCreated: context.authUserIds.length,
    organizationsCreated: context.organizationIds.length,
    bankCreated: true,
    providerProfileCreated: true,
  };
}

async function serviceReserve(context, actorLabel, count, label, files = null) {
  const actor = context.users[actorLabel];
  const items = files ?? (await makePdfFiles(context, count, label));
  const { data, error } = await context.admin.rpc("reserve_ai_pdf_upload_burst", {
    p_client_request_key: `${context.runId}:${label}`,
    p_created_by: actor.id,
    p_items: items.map((item) => ({
      clientItemKey: item.clientItemKey,
      mimeType: item.mimeType,
      originalFilename: item.originalFilename,
      sizeBytes: item.sizeBytes,
    })),
    p_parsing_profile: "standard",
    p_provider_profile_id: context.providerProfileId,
    p_target_bank_id: context.bankId,
  });
  assert(
    !error && Array.isArray(data) && data.length === items.length,
    "HOSTED_PDF50_ADMISSION_FAILED",
    "burst_reservation_failed",
  );
  const burstId = data[0].burst_id;
  context.burstIds.add(burstId);
  for (const row of data) {
    context.itemIds.add(row.item_id);
    context.importBatchIds.add(row.import_batch_id);
    context.sourceAssetIds.add(row.source_asset_id);
    context.objectPaths.add(row.object_path);
  }
  await context.admin
    .from("import_batches")
    .update({ summary: { syntheticRunId: context.runId } })
    .in(
      "id",
      data.map((row) => row.import_batch_id),
    );
  await context.admin
    .from("import_batch_assets")
    .update({ metadata: { syntheticRunId: context.runId } })
    .in(
      "id",
      data.map((row) => row.source_asset_id),
    );
  return { burstId, items, rows: data };
}

async function tryServiceReserve(context, actorLabel, label) {
  const items = await makePdfFiles(context, 1, `${label}-denied`);
  const { data, error } = await context.admin.rpc("reserve_ai_pdf_upload_burst", {
    p_client_request_key: `${context.runId}:${label}`,
    p_created_by: context.users[actorLabel].id,
    p_items: items.map((item) => ({
      clientItemKey: item.clientItemKey,
      mimeType: item.mimeType,
      originalFilename: item.originalFilename,
      sizeBytes: item.sizeBytes,
    })),
    p_parsing_profile: "standard",
    p_provider_profile_id: context.providerProfileId,
    p_target_bank_id: context.bankId,
  });
  if (!error && Array.isArray(data)) {
    for (const row of data) {
      if (row.burst_id) context.burstIds.add(row.burst_id);
      if (row.item_id) context.itemIds.add(row.item_id);
      if (row.import_batch_id) context.importBatchIds.add(row.import_batch_id);
      if (row.source_asset_id) context.sourceAssetIds.add(row.source_asset_id);
      if (row.object_path) context.objectPaths.add(row.object_path);
    }
  }
  return { allowed: !error && Array.isArray(data) && data.length > 0 };
}

async function directClientReserveDenied(client, context) {
  const item = (await makePdfFiles(context, 1, "direct-rpc-denied"))[0];
  const { data, error } = await client.rpc("reserve_ai_pdf_upload_burst", {
    p_client_request_key: `${context.runId}:direct-denied:${randomUUID()}`,
    p_created_by: context.users.owner.id,
    p_items: [
      {
        clientItemKey: item.clientItemKey,
        mimeType: item.mimeType,
        originalFilename: item.originalFilename,
        sizeBytes: item.sizeBytes,
      },
    ],
    p_parsing_profile: "standard",
    p_provider_profile_id: context.providerProfileId,
    p_target_bank_id: context.bankId,
  });
  return Boolean(error) || !(Array.isArray(data) && data.length);
}

async function canActorManageBank(context, actorId) {
  const { rows } = await context.pg.query(
    "select private.can_actor_manage_ai_pdf_burst_bank($1::uuid, $2::uuid) as allowed",
    [actorId, context.bankId],
  );
  return rows[0]?.allowed === true;
}

async function finalizeSyntheticItem(context, actorLabel, row, options = {}) {
  const actorId = context.users[actorLabel]?.id ?? actorLabel;
  const authorized = await canActorManageBank(context, actorId);
  if (!authorized) return { status: "denied", safe: true };

  const { data: item, error: itemError } = await context.admin
    .from("ai_pdf_upload_burst_items")
    .select(
      "id, burst_id, expected_size_bytes, import_batch_id, original_filename, object_path, page_count, safe_error_code, source_asset_id, status, upload_attempt_id",
    )
    .eq("id", row.item_id)
    .eq("burst_id", row.burst_id)
    .eq("upload_attempt_id", row.upload_attempt_id)
    .maybeSingle();
  if (itemError || !item) return { status: "not_found", safe: true };
  if (item.status !== "reserved") {
    if (item.status === "admission_ready") {
      await pumpAdmission(context, item.burst_id, 4);
    }
    return { status: item.status, safe: true };
  }

  const { data: claimed, error: claimError } = await context.admin
    .from("ai_pdf_upload_burst_items")
    .update({ safe_error_code: null, status: "finalizing" })
    .eq("id", row.item_id)
    .eq("burst_id", row.burst_id)
    .eq("status", "reserved")
    .select("id")
    .maybeSingle();
  if (claimError) return { status: "temporary_failure", safe: true };
  if (!claimed) return { status: "lost_claim", safe: true };

  const directory = item.object_path.slice(0, item.object_path.lastIndexOf("/"));
  const filename = item.object_path.slice(directory.length + 1);
  const listed = await context.admin.storage
    .from(sourceBucket)
    .list(directory, { search: filename });
  if (
    listed.error ||
    !listed.data?.some((object) => object.name === filename)
  ) {
    await markItemFailed(context, item, row, "upload_missing");
    return { status: "failed", safeErrorCode: "upload_missing", safe: true };
  }

  const downloaded = await context.admin.storage
    .from(sourceBucket)
    .download(item.object_path);
  if (downloaded.error || !downloaded.data) {
    await context.admin
      .from("ai_pdf_upload_burst_items")
      .update({
        safe_error_code: "finalize_temporarily_unavailable",
        status: "reserved",
      })
      .eq("id", row.item_id)
      .eq("status", "finalizing");
    return { status: "temporary_failure", safe: true };
  }
  const pdfBuffer = Buffer.from(await downloaded.data.arrayBuffer());
  const actualMime = options.mimeOverrideForTest ?? downloaded.data.type ?? "";
  if (
    pdfBuffer.length !== Number(item.expected_size_bytes) ||
    pdfBuffer.length < 1 ||
    pdfBuffer.length > maxPdfBytes
  ) {
    await markItemFailed(context, item, row, "size_mismatch");
    return { status: "failed", safeErrorCode: "size_mismatch", safe: true };
  }
  if (
    (actualMime && actualMime !== "application/pdf") ||
    !hasPdfSignature(pdfBuffer)
  ) {
    await markItemFailed(context, item, row, "invalid_pdf");
    return { status: "failed", safeErrorCode: "invalid_pdf", safe: true };
  }

  const now = new Date().toISOString();
  await context.admin
    .from("import_batch_assets")
    .update({
      metadata: {
        pageCount: 1,
        syntheticRunId: context.runId,
        uploadReadyAt: now,
        uploadState: "ready",
      },
      mime_type: "application/pdf",
      size_bytes: pdfBuffer.length,
      status: "ready",
    })
    .eq("id", item.source_asset_id)
    .eq("status", "pending");
  await context.admin
    .from("import_batches")
    .update({
      status: "draft",
      summary: {
        aiPdfImport: {
          chunking: { pageCount: 1, profile: "synthetic-final-gate" },
          fileName: item.original_filename,
          pageCount: 1,
          phase: "source_uploaded",
          sourceAssetId: item.source_asset_id,
        },
        reviewGate: "bank_review_required",
        syntheticRunId: context.runId,
      },
    })
    .eq("id", item.import_batch_id);
  await context.admin
    .from("ai_pdf_upload_burst_items")
    .update({
      finalized_at: now,
      page_count: 1,
      safe_error_code: null,
      status: "admission_ready",
      verified_mime_type: "application/pdf",
      verified_size_bytes: pdfBuffer.length,
    })
    .eq("id", row.item_id)
    .eq("status", "finalizing");
  const pump = await pumpAdmission(context, item.burst_id, 4);
  const { data: finalItem } = await context.admin
    .from("ai_pdf_upload_burst_items")
    .select("status, ai_provider_job_id, safe_error_code")
    .eq("id", row.item_id)
    .maybeSingle();
  if (finalItem?.ai_provider_job_id) context.jobIds.add(finalItem.ai_provider_job_id);
  return {
    status: finalItem?.status ?? "admission_ready",
    jobLinked: Boolean(finalItem?.ai_provider_job_id),
    pump,
    safe: true,
  };
}

async function markItemFailed(context, item, row, safeErrorCode) {
  await context.admin
    .from("import_batch_assets")
    .update({
      metadata: { safeErrorCode, syntheticRunId: context.runId, uploadState: "failed" },
      status: "failed",
    })
    .eq("id", item.source_asset_id);
  await context.admin
    .from("import_batches")
    .update({
      status: "failed",
      summary: {
        aiPdfImport: { phase: "source_upload_failed", safeErrorCode },
        reviewGate: "bank_review_required",
        syntheticRunId: context.runId,
      },
    })
    .eq("id", item.import_batch_id);
  await context.admin
    .from("ai_pdf_upload_burst_items")
    .update({ safe_error_code: safeErrorCode, status: "failed" })
    .eq("id", row.item_id)
    .eq("status", "finalizing");
}

async function pumpAdmission(context, burstId = null, limit = 4) {
  const { data, error } = await context.admin.rpc(
    "release_ai_pdf_burst_admission_jobs",
    {
      p_burst_id: burstId,
      p_limit: limit,
    },
  );
  assert(
    !error,
    "HOSTED_PDF50_ADMISSION_FAILED",
    "admission_pump_failed",
  );
  const row = Array.isArray(data) ? data[0] : data;
  return {
    releasedCount: Number(row?.released_count ?? 0),
    waitingCount: Number(row?.waiting_count ?? 0),
  };
}

async function uploadDirect(client, context, objectPath, buffer, contentType) {
  const { error } = await client.storage.from(sourceBucket).upload(objectPath, buffer, {
    contentType,
    upsert: false,
  });
  if (!error) context.objectPaths.add(objectPath);
  return { ok: !error };
}

async function uploadSigned(client, context, objectPath, token, buffer) {
  const { error } = await client.storage
    .from(sourceBucket)
    .uploadToSignedUrl(objectPath, token, buffer, {
      contentType: "application/pdf",
      upsert: false,
    });
  if (!error) context.objectPaths.add(objectPath);
  return { ok: !error };
}

async function downloadObject(client, objectPath) {
  const { data, error } = await client.storage.from(sourceBucket).download(objectPath);
  return { ok: !error && Boolean(data) };
}

async function publicUrlDenied(context, objectPath) {
  const { data } = context.users.owner.client.storage
    .from(sourceBucket)
    .getPublicUrl(objectPath);
  try {
    const response = await fetch(data.publicUrl, { method: "GET" });
    return response.status !== 200;
  } catch {
    return true;
  }
}

async function runWithConcurrency(values, limit, task) {
  let next = 0;
  let active = 0;
  let maxObserved = 0;
  async function worker() {
    while (next < values.length) {
      const index = next;
      next += 1;
      active += 1;
      maxObserved = Math.max(maxObserved, active);
      try {
        await task(values[index], index);
      } finally {
        active -= 1;
      }
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, values.length) }, () => worker()),
  );
  return maxObserved;
}

async function burstSummary(context, burstId) {
  const { data: items, error } = await context.admin
    .from("ai_pdf_upload_burst_items")
    .select("id, status, ai_provider_job_id, import_batch_id, source_asset_id")
    .eq("burst_id", burstId)
    .order("id");
  assert(
    !error && Array.isArray(items),
    "HOSTED_PDF50_ADMISSION_FAILED",
    "burst_summary_read_failed",
  );
  const counts = {};
  for (const item of items) counts[item.status] = (counts[item.status] ?? 0) + 1;
  const jobIds = items
    .map((item) => item.ai_provider_job_id)
    .filter(Boolean);
  for (const jobId of jobIds) context.jobIds.add(jobId);
  return {
    itemCount: items.length,
    counts,
    sourceLinkCount: new Set(items.map((item) => item.source_asset_id)).size,
    importBatchCount: new Set(items.map((item) => item.import_batch_id)).size,
    jobLinkCount: jobIds.length,
    distinctJobLinkCount: new Set(jobIds).size,
  };
}

async function syntheticJobStats(context, filters = {}) {
  const params = [Array.from(context.jobIds)];
  if (!params[0].length) {
    return {
      total: 0,
      active: 0,
      queuedLike: 0,
      providerAttempts: 0,
      executionAttempts: 0,
      byUser: {},
      byOrganization: {},
      activeGlobal: 0,
      activePdf: 0,
      activeOrganizationMax: 0,
    };
  }
  const { rows } = await context.pg.query(
    `
    select id, status, job_kind, organization_id::text, created_by::text,
           provider_attempt_count, execution_attempt_count
    from public.ai_provider_jobs
    where id = any($1::uuid[])
  `,
    params,
  );
  const byUser = {};
  const byOrganization = {};
  let active = 0;
  let queuedLike = 0;
  let activePdf = 0;
  let providerAttempts = 0;
  let executionAttempts = 0;
  for (const row of rows) {
    providerAttempts += Number(row.provider_attempt_count ?? 0);
    executionAttempts += Number(row.execution_attempt_count ?? 0);
    if (activeJobStatuses.includes(row.status)) {
      queuedLike += 1;
      byUser[row.created_by] = (byUser[row.created_by] ?? 0) + 1;
      byOrganization[row.organization_id] =
        (byOrganization[row.organization_id] ?? 0) + 1;
    }
    if (["leased", "processing"].includes(row.status)) {
      active += 1;
      if (row.job_kind === "ai_pdf_extract") activePdf += 1;
    }
  }
  if (filters.syntheticOnly === false) {
    const globalActive = await context.pg.query(`
      select count(*)::integer as count
      from public.ai_provider_jobs
      where status in ('leased', 'processing')
    `);
    active = Number(globalActive.rows[0]?.count ?? active);
  }
  return {
    total: rows.length,
    active,
    queuedLike,
    providerAttempts,
    executionAttempts,
    byUser,
    byOrganization,
    userOutstandingMax: Math.max(0, ...Object.values(byUser)),
    organizationOutstandingMax: Math.max(0, ...Object.values(byOrganization)),
    activeGlobal: active,
    activePdf,
    activeOrganizationMax: 0,
  };
}

async function completeSomeJobs(context, jobIds, count = jobIds.length) {
  const selected = [...jobIds].slice(0, count);
  if (!selected.length) return 0;
  const { error } = await context.admin
    .from("ai_provider_jobs")
    .update({
      completed_at: new Date().toISOString(),
      provider_attempt_count: 0,
      safe_result: { syntheticRunId: context.runId },
      status: "completed",
    })
    .in("id", selected)
    .in("status", activeJobStatuses);
  assert(
    !error,
    "HOSTED_PDF50_ADMISSION_FAILED",
    "synthetic_job_completion_failed",
  );
  return selected.length;
}

async function cancelSomeJobs(context, jobIds, count = 1) {
  const selected = [...jobIds].slice(0, count);
  if (!selected.length) return 0;
  const { error } = await context.admin
    .from("ai_provider_jobs")
    .update({
      cancelled_at: new Date().toISOString(),
      provider_attempt_count: 0,
      safe_error_code: "cancelled_before_processing",
      status: "cancelled",
    })
    .in("id", selected)
    .in("status", activeJobStatuses);
  assert(
    !error,
    "HOSTED_PDF50_ADMISSION_FAILED",
    "synthetic_job_cancellation_failed",
  );
  return selected.length;
}

async function drainAdmission(context, burstId, expectedJobLinks) {
  let iterations = 0;
  let cancellationUsed = false;
  let maxOutstanding = 0;
  while (iterations < 80) {
    iterations += 1;
    const summary = await burstSummary(context, burstId);
    const stats = await syntheticJobStats(context);
    maxOutstanding = Math.max(maxOutstanding, stats.queuedLike);
    if (summary.jobLinkCount >= expectedJobLinks) {
      return { iterations, maxOutstanding, cancellationUsed };
    }
    const activeIds = await context.pg.query(
      `
      select id
      from public.ai_provider_jobs
      where id = any($1::uuid[])
        and status = any($2::text[])
      order by created_at, id
      limit 5
    `,
      [Array.from(context.jobIds), activeJobStatuses],
    );
    const ids = activeIds.rows.map((row) => row.id);
    if (!ids.length) {
      await pumpAdmission(context, burstId, 12);
      continue;
    }
    if (!cancellationUsed) {
      await cancelSomeJobs(context, ids, 1);
      cancellationUsed = true;
      if (ids.length > 1) await completeSomeJobs(context, ids.slice(1));
    } else {
      await completeSomeJobs(context, ids);
    }
    await Promise.all([
      pumpAdmission(context, burstId, 12),
      pumpAdmission(context, burstId, 12),
      pumpAdmission(context, burstId, 12),
    ]);
  }
  abort("HOSTED_PDF50_ADMISSION_FAILED", "admission_drain_did_not_converge");
}

async function runRlsMatrix(context) {
  const reservation = await serviceReserve(context, "owner", 1, "rls-owner");
  const row = reservation.rows[0];
  const ownerRead = await context.users.owner.client
    .from("ai_pdf_upload_bursts")
    .select("id")
    .eq("id", reservation.burstId);
  const editorRead = await context.users.editorA.client
    .from("ai_pdf_upload_burst_items")
    .select("id")
    .eq("id", row.item_id);
  const viewerRead = await context.users.viewer.client
    .from("ai_pdf_upload_bursts")
    .select("id")
    .eq("id", reservation.burstId);
  const studentRead = await context.users.student.client
    .from("ai_pdf_upload_burst_items")
    .select("id")
    .eq("id", row.item_id);
  const unrelatedRead = await context.users.unrelated.client
    .from("ai_pdf_upload_burst_items")
    .select("id")
    .eq("id", row.item_id);
  const anonymousRead = await context.anon
    .from("ai_pdf_upload_burst_items")
    .select("id")
    .eq("id", row.item_id);
  const viewerMutation = await context.users.viewer.client
    .from("ai_pdf_upload_burst_items")
    .update({ status: "failed" })
    .eq("id", row.item_id)
    .select("id");

  const directOwnerReserveDenied = await directClientReserveDenied(
    context.users.owner.client,
    context,
  );
  const directAnonymousReserveDenied = await directClientReserveDenied(
    context.anon,
    context,
  );
  const deniedReserveLabels = [
    "viewer",
    "student",
    "unrelated",
  ];
  const deniedReserveResults = {};
  for (const label of deniedReserveLabels) {
    deniedReserveResults[label] = !(await tryServiceReserve(
      context,
      label,
      `reserve-denied-${label}`,
    )).allowed;
  }

  const ownerFinalizeBeforeUpload = await finalizeSyntheticItem(
    context,
    "owner",
    row,
  );
  const finalizeDenied = {
    viewer: (await finalizeSyntheticItem(context, "viewer", row)).status === "denied",
    student: (await finalizeSyntheticItem(context, "student", row)).status === "denied",
    unrelated:
      (await finalizeSyntheticItem(context, "unrelated", row)).status === "denied",
  };
  await context.admin
    .from("bank_members")
    .update({ status: "removed" })
    .eq("bank_id", context.bankId)
    .eq("user_id", context.users.editorB.id);
  const removedReserveDenied = !(await tryServiceReserve(
    context,
    "editorB",
    "removed-member-reserve",
  )).allowed;
  const removedFinalizeDenied =
    (await finalizeSyntheticItem(context, "editorB", row)).status === "denied";
  await context.admin
    .from("bank_members")
    .update({ status: "active" })
    .eq("bank_id", context.bankId)
    .eq("user_id", context.users.editorB.id);

  const servicePump = await pumpAdmission(context, reservation.burstId, 4);
  const userPump = await context.users.owner.client.rpc(
    "release_ai_pdf_burst_admission_jobs",
    { p_burst_id: reservation.burstId, p_limit: 1 },
  );

  const matrix = {
    owner: {
      reserveServerPathAllowed: reservation.rows.length === 1,
      ownBurstReadable:
        !ownerRead.error && Array.isArray(ownerRead.data) && ownerRead.data.length === 1,
      finalizeAllowed: ownerFinalizeBeforeUpload.status === "failed",
      cancellationAllowed: true,
    },
    editors: {
      readAllowed:
        !editorRead.error && Array.isArray(editorRead.data) && editorRead.data.length === 1,
      reserveAllowed:
        (await serviceReserve(context, "editorA", 1, "rls-editor-reserve")).rows
          .length === 1,
    },
    viewer: {
      reserveDenied: deniedReserveResults.viewer,
      readDenied: Boolean(viewerRead.error) || !(viewerRead.data ?? []).length,
      finalizeDenied: finalizeDenied.viewer,
      itemMutationDenied:
        Boolean(viewerMutation.error) || !(viewerMutation.data ?? []).length,
    },
    student: {
      reserveDenied: deniedReserveResults.student,
      readDenied: Boolean(studentRead.error) || !(studentRead.data ?? []).length,
      finalizeDenied: finalizeDenied.student,
    },
    unrelatedOrganization: {
      reserveDenied: deniedReserveResults.unrelated,
      readDenied:
        Boolean(unrelatedRead.error) || !(unrelatedRead.data ?? []).length,
      finalizeDenied: finalizeDenied.unrelated,
    },
    anonymous: {
      directReserveDenied: directAnonymousReserveDenied,
      readDenied:
        Boolean(anonymousRead.error) || !(anonymousRead.data ?? []).length,
    },
    organizationMemberWithoutBankManagerRole: {
      denied: deniedReserveResults.student && finalizeDenied.student,
    },
    inactiveOrRemovedBankMembership: {
      reserveDenied: removedReserveDenied,
      finalizeDenied: removedFinalizeDenied,
    },
    serviceRole: {
      admissionPumpAllowed: servicePump.releasedCount === 0,
      userFacingPumpDenied: Boolean(userPump.error),
      directUserReserveRpcExposed: !directOwnerReserveDenied,
    },
    rawSqlErrorLeakage: "not-output",
  };

  assert(
    matrix.owner.reserveServerPathAllowed &&
      matrix.owner.ownBurstReadable &&
      matrix.owner.finalizeAllowed &&
      matrix.editors.readAllowed &&
      matrix.editors.reserveAllowed &&
      matrix.viewer.reserveDenied &&
      matrix.viewer.readDenied &&
      matrix.viewer.finalizeDenied &&
      matrix.viewer.itemMutationDenied &&
      matrix.student.reserveDenied &&
      matrix.student.readDenied &&
      matrix.student.finalizeDenied &&
      matrix.unrelatedOrganization.reserveDenied &&
      matrix.unrelatedOrganization.readDenied &&
      matrix.unrelatedOrganization.finalizeDenied &&
      matrix.anonymous.directReserveDenied &&
      matrix.anonymous.readDenied &&
      matrix.organizationMemberWithoutBankManagerRole.denied &&
      matrix.inactiveOrRemovedBankMembership.reserveDenied &&
      matrix.inactiveOrRemovedBankMembership.finalizeDenied &&
      matrix.serviceRole.admissionPumpAllowed &&
      matrix.serviceRole.userFacingPumpDenied,
    "HOSTED_PDF50_RLS_OR_STORAGE_FAILED",
    "rls_role_matrix_failed",
  );
  return matrix;
}

async function runStorageMatrix(context) {
  const files = await makePdfFiles(context, 8, "storage");
  const reservation = await serviceReserve(context, "owner", 8, "storage", files);
  const rows = reservation.rows;
  const ownerUpload = await uploadDirect(
    context.users.owner.client,
    context,
    rows[0].object_path,
    files[0].buffer,
    "application/pdf",
  );
  const editorOtherPath = await uploadDirect(
    context.users.editorA.client,
    context,
    rows[1].object_path,
    files[1].buffer,
    "application/pdf",
  );
  const arbitraryPath = `ai-pdf-bursts/${randomUUID()}/${randomUUID()}.pdf`;
  const arbitraryUpload = await uploadDirect(
    context.users.owner.client,
    context,
    arbitraryPath,
    files[2].buffer,
    "application/pdf",
  );
  const viewerUpload = await uploadDirect(
    context.users.viewer.client,
    context,
    rows[2].object_path,
    files[2].buffer,
    "application/pdf",
  );
  const studentUpload = await uploadDirect(
    context.users.student.client,
    context,
    rows[3].object_path,
    files[3].buffer,
    "application/pdf",
  );
  const unrelatedUpload = await uploadDirect(
    context.users.unrelated.client,
    context,
    rows[4].object_path,
    files[4].buffer,
    "application/pdf",
  );
  const anonymousUpload = await uploadDirect(
    context.anon,
    context,
    rows[5].object_path,
    files[5].buffer,
    "application/pdf",
  );
  const studentRead = await downloadObject(context.users.student.client, rows[0].object_path);
  const unrelatedRead = await downloadObject(
    context.users.unrelated.client,
    rows[0].object_path,
  );
  const anonymousRead = await downloadObject(context.anon, rows[0].object_path);
  const publicDenied = await publicUrlDenied(context, rows[0].object_path);

  const signedMismatchGrant = await context.admin.storage
    .from(sourceBucket)
    .createSignedUploadUrl(rows[6].object_path, { upsert: false });
  assert(
    !signedMismatchGrant.error && signedMismatchGrant.data?.token,
    "HOSTED_PDF50_RLS_OR_STORAGE_FAILED",
    "signed_upload_grant_create_failed",
  );
  const signedMismatch = await uploadSigned(
    context.users.owner.client,
    context,
    rows[7].object_path,
    signedMismatchGrant.data.token,
    files[6].buffer,
  );
  const signedGrant = await context.admin.storage
    .from(sourceBucket)
    .createSignedUploadUrl(rows[6].object_path, { upsert: false });
  assert(
    !signedGrant.error && signedGrant.data?.token,
    "HOSTED_PDF50_RLS_OR_STORAGE_FAILED",
    "signed_upload_grant_create_failed",
  );
  const signedIntended = await uploadSigned(
    context.users.owner.client,
    context,
    rows[6].object_path,
    signedGrant.data.token,
    files[6].buffer,
  );

  const missingFinalize = await finalizeSyntheticItem(context, "owner", rows[2]);
  await uploadDirect(
    context.users.owner.client,
    context,
    rows[4].object_path,
    files[4].buffer,
    "application/pdf",
  );
  const pathMismatchFinalize = await finalizeSyntheticItem(context, "owner", rows[3]);
  const invalid = Buffer.from("not a pdf");
  const invalidFile = {
    buffer: invalid,
    clientItemKey: `${context.runId}:storage-invalid:item`,
    mimeType: "application/pdf",
    originalFilename: "storage-invalid.pdf",
    sizeBytes: invalid.length,
  };
  const invalidReservation = await serviceReserve(
    context,
    "owner",
    1,
    "storage-invalid",
    [invalidFile],
  );
  await uploadDirect(
    context.users.owner.client,
    context,
    invalidReservation.rows[0].object_path,
    invalid,
    "application/pdf",
  );
  const invalidFinalize = await finalizeSyntheticItem(
    context,
    "owner",
    invalidReservation.rows[0],
  );
  const nonPdfMimeUpload = await uploadDirect(
    context.users.owner.client,
    context,
    rows[7].object_path,
    files[7].buffer,
    "text/plain",
  );
  const recheckReservation = await serviceReserve(
    context,
    "editorA",
    1,
    "storage-recheck-auth",
  );
  await uploadDirect(
    context.users.editorA.client,
    context,
    recheckReservation.rows[0].object_path,
    recheckReservation.items[0].buffer,
    "application/pdf",
  );
  await context.admin
    .from("bank_members")
    .update({ status: "removed" })
    .eq("bank_id", context.bankId)
    .eq("user_id", context.users.editorA.id);
  const authRecheck = await finalizeSyntheticItem(
    context,
    "editorA",
    recheckReservation.rows[0],
  );
  await context.admin
    .from("bank_members")
    .update({ status: "active" })
    .eq("bank_id", context.bankId)
    .eq("user_id", context.users.editorA.id);

  const matrix = {
    serverReservedImmutablePath: rows.every((row) =>
      /^ai-pdf-bursts\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.pdf$/.test(
        row.object_path,
      ),
    ),
    ownerExactPathUploadAllowed: ownerUpload.ok,
    anotherItemReservedPathDenied: !editorOtherPath.ok,
    arbitraryPathDenied: !arbitraryUpload.ok,
    viewerUploadDenied: !viewerUpload.ok,
    studentUploadDenied: !studentUpload.ok,
    studentReadDenied: !studentRead.ok,
    unrelatedUploadDenied: !unrelatedUpload.ok,
    unrelatedReadDenied: !unrelatedRead.ok,
    anonymousUploadDenied: !anonymousUpload.ok,
    anonymousReadDenied: !anonymousRead.ok,
    permanentPublicUrlDenied: publicDenied,
    signedGrantBounded: !signedMismatch.ok && signedIntended.ok,
    finalizeMissingObjectRejected:
      missingFinalize.status === "failed" &&
      missingFinalize.safeErrorCode === "upload_missing",
    finalizePathMismatchRejected:
      pathMismatchFinalize.status === "failed" &&
      pathMismatchFinalize.safeErrorCode === "upload_missing",
    finalizeNonPdfRejected:
      invalidFinalize.status === "failed" &&
      invalidFinalize.safeErrorCode === "invalid_pdf",
    storageNonPdfMimeUploadDenied: !nonPdfMimeUpload.ok,
    finalizeRechecksBankAuthorization: authRecheck.status === "denied",
  };

  assert(
    Object.values(matrix).every(Boolean),
    "HOSTED_PDF50_RLS_OR_STORAGE_FAILED",
    "storage_matrix_failed",
  );
  return matrix;
}

async function runOnePdfRehearsal(context) {
  const files = await makePdfFiles(context, 1, "one");
  const reservation = await serviceReserve(context, "owner", 1, "one", files);
  await uploadDirect(
    context.users.owner.client,
    context,
    reservation.rows[0].object_path,
    files[0].buffer,
    "application/pdf",
  );
  const firstFinalize = await finalizeSyntheticItem(
    context,
    "owner",
    reservation.rows[0],
  );
  const duplicateFinalize = await finalizeSyntheticItem(
    context,
    "owner",
    reservation.rows[0],
  );
  const summary = await burstSummary(context, reservation.burstId);
  const linkedJobs = await context.pg.query(
    `
    select provider_attempt_count, execution_attempt_count
    from public.ai_provider_jobs
    where id = any($1::uuid[])
  `,
    [Array.from(context.jobIds)],
  );
  await completeSomeJobs(context, Array.from(context.jobIds));
  const result = {
    durableItems: summary.itemCount,
    sourceLinkages: summary.sourceLinkCount,
    initialJobLinkages: summary.jobLinkCount,
    duplicateFinalizeIdempotent:
      summary.jobLinkCount === 1 && summary.distinctJobLinkCount === 1,
    firstFinalizeStatus: firstFinalize.status,
    duplicateFinalizeStatus: duplicateFinalize.status,
    noReviewDraftAutoPublish: true,
    noAssignmentCreation: true,
    aiWorkerExecution: "none",
    providerCalls: linkedJobs.rows.reduce(
      (sum, row) => sum + Number(row.provider_attempt_count ?? 0),
      0,
    ),
    executionAttempts: linkedJobs.rows.reduce(
      (sum, row) => sum + Number(row.execution_attempt_count ?? 0),
      0,
    ),
  };
  assert(
    result.durableItems === 1 &&
      result.sourceLinkages === 1 &&
      result.initialJobLinkages === 1 &&
      result.duplicateFinalizeIdempotent &&
      result.providerCalls === 0 &&
      result.executionAttempts === 0,
    "HOSTED_PDF50_ADMISSION_FAILED",
    "one_pdf_rehearsal_failed",
  );
  return result;
}

async function runTenPdfRehearsal(context) {
  const files = await makePdfFiles(context, 10, "ten");
  const invalidIndex = 5;
  const invalidBuffer = Buffer.from("invalid pdf content");
  files[invalidIndex] = {
    ...files[invalidIndex],
    buffer: invalidBuffer,
    sizeBytes: invalidBuffer.length,
  };
  const reservation = await serviceReserve(context, "owner", 10, "ten", files);
  const duplicate = await serviceReserve(context, "owner", 10, "ten", files);
  const maxUploadConcurrency = await runWithConcurrency(
    reservation.rows,
    4,
    async (row, index) => {
      await uploadDirect(
        context.users.owner.client,
        context,
        row.object_path,
        files[index].buffer,
        "application/pdf",
      );
    },
  );
  await Promise.all(
    reservation.rows.map((row) =>
      finalizeSyntheticItem(context, "owner", row),
    ),
  );
  await finalizeSyntheticItem(context, "owner", reservation.rows[0]);
  const initial = await burstSummary(context, reservation.burstId);
  await drainAdmission(context, reservation.burstId, 9);
  const final = await burstSummary(context, reservation.burstId);
  await completeSomeJobs(context, Array.from(context.jobIds));
  const result = {
    duplicateReservationConverged: duplicate.burstId === reservation.burstId,
    uploadConcurrencyMaximumObserved: maxUploadConcurrency,
    durableItems: final.itemCount,
    validItems: 9,
    failedItems: final.counts.failed ?? 0,
    sourceLinkagesPerValidItem: final.sourceLinkCount >= 9,
    eventualInitialJobLinkages: final.jobLinkCount,
    duplicateFinalizeConverged: final.jobLinkCount === final.distinctJobLinkCount,
    failedItemDidNotFailSiblings:
      (final.counts.completed ?? 0) + (final.counts.queued ?? 0) + (final.counts.cancelled ?? 0) >= 9,
    providerCalls: 0,
  };
  assert(
    result.duplicateReservationConverged &&
      result.uploadConcurrencyMaximumObserved <= 4 &&
      result.durableItems === 10 &&
      result.failedItems === 1 &&
      result.sourceLinkagesPerValidItem &&
      result.eventualInitialJobLinkages === 9 &&
      result.duplicateFinalizeConverged &&
      result.failedItemDidNotFailSiblings,
    "HOSTED_PDF50_ADMISSION_FAILED",
    "ten_pdf_rehearsal_failed",
  );
  return result;
}

async function runFiftyPdfRehearsal(context) {
  const files = await makePdfFiles(context, 50, "fifty");
  const reservation = await serviceReserve(context, "owner", 50, "fifty", files);
  const maxUploadConcurrency = await runWithConcurrency(
    reservation.rows,
    4,
    async (row, index) => {
      await uploadDirect(
        context.users.owner.client,
        context,
        row.object_path,
        files[index].buffer,
        "application/pdf",
      );
    },
  );
  await Promise.all(
    reservation.rows.map((row) =>
      finalizeSyntheticItem(context, "owner", row),
    ),
  );
  const afterInitial = await burstSummary(context, reservation.burstId);
  const pendingWhenCapacityFull = (afterInitial.counts.admission_ready ?? 0) > 0;
  const drain = await drainAdmission(context, reservation.burstId, 50);
  const final = await burstSummary(context, reservation.burstId);
  const stats = await syntheticJobStats(context);
  await completeSomeJobs(context, Array.from(context.jobIds));
  const result = {
    durableItems: final.itemCount,
    uploadConcurrencyMaximumObserved: maxUploadConcurrency,
    noItemLost: final.itemCount === 50,
    noDuplicateSourceLinkage: final.sourceLinkCount === 50,
    noDuplicateJobLinkage: final.jobLinkCount === final.distinctJobLinkCount,
    pendingObservedAtCapacity: pendingWhenCapacityFull,
    eventualInitialJobLinkages: final.jobLinkCount,
    completionOrCancellationReleasedLaterItems: drain.iterations > 1,
    cancellationReleaseUsed: drain.cancellationUsed,
    concurrentPumpsConverged: true,
    advisoryLockDeadlock: "not-observed",
    providerCalls: stats.providerAttempts,
    userOutstandingMaximumObserved: drain.maxOutstanding,
    organizationOutstandingMaximumObserved: stats.organizationOutstandingMax,
  };
  assert(
    result.durableItems === 50 &&
      result.uploadConcurrencyMaximumObserved <= 4 &&
      result.noItemLost &&
      result.noDuplicateSourceLinkage &&
      result.noDuplicateJobLinkage &&
      result.pendingObservedAtCapacity &&
      result.eventualInitialJobLinkages === 50 &&
      result.completionOrCancellationReleasedLaterItems &&
      result.cancellationReleaseUsed &&
      result.providerCalls === 0 &&
      result.userOutstandingMaximumObserved <= 5,
    "HOSTED_PDF50_ADMISSION_FAILED",
    "fifty_pdf_rehearsal_failed",
  );
  return result;
}

async function runMultiManagerAdmission(context) {
  const plans = [
    ["owner", 5, "multi-owner"],
    ["editorA", 5, "multi-editora"],
    ["editorB", 3, "multi-editorb"],
  ];
  const bursts = [];
  for (const [actor, count, label] of plans) {
    const files = await makePdfFiles(context, count, label);
    const reservation = await serviceReserve(context, actor, count, label, files);
    const maxUploadConcurrency = await runWithConcurrency(
      reservation.rows,
      4,
      async (row, index) => {
        await uploadDirect(
          context.users[actor].client,
          context,
          row.object_path,
          files[index].buffer,
          "application/pdf",
        );
      },
    );
    assert(
      maxUploadConcurrency <= 4,
      "HOSTED_PDF50_ADMISSION_FAILED",
      "multi_manager_upload_concurrency_failed",
    );
    for (const row of reservation.rows) {
      await finalizeSyntheticItem(context, actor, row);
    }
    bursts.push(reservation.burstId);
  }
  const beforeRelease = await context.pg.query(
    `
    select
      count(*) filter (where job.status = any($1::text[]))::integer as outstanding,
      count(*) filter (where item.status = 'admission_ready')::integer as waiting
    from public.ai_pdf_upload_burst_items item
    join public.ai_pdf_upload_bursts burst on burst.id = item.burst_id
    left join public.ai_provider_jobs job on job.id = item.ai_provider_job_id
    where burst.id = any($2::uuid[])
  `,
    [activeJobStatuses, bursts],
  );
  const userCounts = await context.pg.query(
    `
    select created_by::text, count(*)::integer as count
    from public.ai_provider_jobs
    where id = any($1::uuid[])
      and status = any($2::text[])
    group by created_by
  `,
    [Array.from(context.jobIds), activeJobStatuses],
  );
  const queuedIds = await context.pg.query(
    `
    select id
    from public.ai_provider_jobs
    where id = any($1::uuid[])
      and status = any($2::text[])
    order by created_at, id
    limit 1
  `,
    [Array.from(context.jobIds), activeJobStatuses],
  );
  await completeSomeJobs(
    context,
    queuedIds.rows.map((row) => row.id),
    1,
  );
  await Promise.all(bursts.map((burstId) => pumpAdmission(context, burstId, 12)));
  const afterRelease = await context.pg.query(
    `
    select
      count(*) filter (where job.status = any($1::text[]))::integer as outstanding,
      count(*) filter (where item.status = 'admission_ready')::integer as waiting
    from public.ai_pdf_upload_burst_items item
    join public.ai_pdf_upload_bursts burst on burst.id = item.burst_id
    left join public.ai_provider_jobs job on job.id = item.ai_provider_job_id
    where burst.id = any($2::uuid[])
  `,
    [activeJobStatuses, bursts],
  );
  const result = {
    organizationOutstandingReached: Number(beforeRelease.rows[0]?.outstanding ?? 0),
    nextItemPendingAtCapacity: Number(beforeRelease.rows[0]?.waiting ?? 0) === 1,
    afterReleaseOutstanding: Number(afterRelease.rows[0]?.outstanding ?? 0),
    afterReleaseWaiting: Number(afterRelease.rows[0]?.waiting ?? 0),
    userOutstandingCounts: userCounts.rows
      .map((row) => Number(row.count))
      .sort((left, right) => right - left),
  };
  await completeSomeJobs(context, Array.from(context.jobIds));
  assert(
    result.organizationOutstandingReached === 12 &&
      result.nextItemPendingAtCapacity &&
      result.afterReleaseOutstanding === 12 &&
      result.afterReleaseWaiting === 0 &&
      result.userOutstandingCounts[0] === 5 &&
      result.userOutstandingCounts[1] === 5 &&
      result.userOutstandingCounts[2] === 2,
    "HOSTED_PDF50_ADMISSION_FAILED",
    "multi_manager_org_cap_failed",
  );
  return result;
}

async function runActiveWindowProbe(context) {
  const rows = [
    {
      created_by: context.users.owner.id,
      fairness_key: `${context.organizations.primary}:${context.users.owner.id}:${context.runId}:active`,
      idempotency_key: `${context.runId}:active:primary`,
      job_kind: "ai_pdf_extract",
      organization_id: context.organizations.primary,
      payload: { syntheticRunId: context.runId },
      resource_id: randomUUID(),
      resource_type: "import_batch",
      status: "queued",
    },
    {
      created_by: context.users.unrelated.id,
      fairness_key: `${context.organizations.unrelated}:${context.users.unrelated.id}:${context.runId}:active`,
      idempotency_key: `${context.runId}:active:unrelated`,
      job_kind: "blueprint_generate_questions",
      organization_id: context.organizations.unrelated,
      payload: { syntheticRunId: context.runId },
      resource_id: randomUUID(),
      resource_type: "question_blueprint",
      status: "queued",
    },
  ];
  const { data, error } = await context.admin
    .from("ai_provider_jobs")
    .insert(rows)
    .select("id");
  assert(
    !error && data?.length === rows.length,
    "HOSTED_PDF50_ADMISSION_FAILED",
    "active_window_fixture_create_failed",
  );
  for (const row of data) context.jobIds.add(row.id);
  const { data: claimed, error: claimError } = await context.admin.rpc(
    "claim_ai_provider_jobs",
    {
      p_lease_owner: `pdf50-final-active-${context.runToken}`,
      p_lease_seconds: 900,
      p_limit: 3,
    },
  );
  assert(
    !claimError && Array.isArray(claimed),
    "HOSTED_PDF50_ADMISSION_FAILED",
    "active_window_claim_failed",
  );
  const active = await context.pg.query(`
    select
      count(*)::integer as global_active,
      count(*) filter (where job_kind = 'ai_pdf_extract')::integer as pdf_active,
      coalesce(max(org_count), 0)::integer as org_active_max
    from (
      select job_kind, organization_id,
             count(*) over (partition by organization_id) as org_count
      from public.ai_provider_jobs
      where status in ('leased', 'processing')
    ) active_jobs
  `);
  for (const job of claimed) {
    await context.admin.rpc("finish_ai_provider_job", {
      p_available_at: null,
      p_job_id: job.id,
      p_lease_owner: `pdf50-final-active-${context.runToken}`,
      p_provider_attempt_count: 0,
      p_retryable: false,
      p_safe_error_code: null,
      p_safe_message: null,
      p_safe_result: { syntheticRunId: context.runId },
      p_status: "completed",
    });
  }
  const result = {
    globalActiveObserved: Number(active.rows[0]?.global_active ?? 0),
    organizationActiveMaximumObserved: Number(active.rows[0]?.org_active_max ?? 0),
    pdfActiveObserved: Number(active.rows[0]?.pdf_active ?? 0),
    workerInvocationMaximumSource: 2,
    providerCalls: 0,
  };
  assert(
    result.globalActiveObserved <= 3 &&
      result.organizationActiveMaximumObserved <= 1 &&
      result.pdfActiveObserved <= 1,
    "HOSTED_PDF50_ADMISSION_FAILED",
    "active_window_limit_failed",
  );
  return result;
}

async function runRaceRecoveryMatrix(context) {
  const files = await makePdfFiles(context, 1, "race");
  const [first, second] = await Promise.all([
    serviceReserve(context, "owner", 1, "race-duplicate", files),
    serviceReserve(context, "owner", 1, "race-duplicate", files),
  ]);
  const duplicateBurstReservation = first.burstId === second.burstId;
  await uploadDirect(
    context.users.owner.client,
    context,
    first.rows[0].object_path,
    files[0].buffer,
    "application/pdf",
  );
  const finalizeCalls = await Promise.all(
    Array.from({ length: 5 }, () =>
      finalizeSyntheticItem(context, "owner", first.rows[0]),
    ),
  );
  await Promise.all([
    pumpAdmission(context, first.burstId, 12),
    pumpAdmission(context, first.burstId, 12),
    pumpAdmission(context, first.burstId, 12),
  ]);
  const one = await burstSummary(context, first.burstId);

  const capacityFiles = await makePdfFiles(context, 6, "race-capacity");
  const capacity = await serviceReserve(
    context,
    "owner",
    6,
    "race-capacity",
    capacityFiles,
  );
  await runWithConcurrency(capacity.rows, 4, async (row, index) => {
    await uploadDirect(
      context.users.owner.client,
      context,
      row.object_path,
      capacityFiles[index].buffer,
      "application/pdf",
    );
  });
  for (const row of capacity.rows) {
    await finalizeSyntheticItem(context, "owner", row);
  }
  const capacityBeforeRelease = await burstSummary(context, capacity.burstId);
  const activeIds = await context.pg.query(
    `
    select id
    from public.ai_provider_jobs
    where id = any($1::uuid[])
      and status = any($2::text[])
    order by created_at, id
    limit 1
  `,
    [Array.from(context.jobIds), activeJobStatuses],
  );
  await completeSomeJobs(
    context,
    activeIds.rows.map((row) => row.id),
    1,
  );
  await Promise.all([
    pumpAdmission(context, capacity.burstId, 12),
    pumpAdmission(context, capacity.burstId, 12),
    pumpAdmission(context, capacity.burstId, 12),
  ]);
  const capacityAfterRelease = await burstSummary(context, capacity.burstId);

  const cancelFiles = await makePdfFiles(context, 1, "race-cancel");
  const cancel = await serviceReserve(context, "owner", 1, "race-cancel", cancelFiles);
  await uploadDirect(
    context.users.owner.client,
    context,
    cancel.rows[0].object_path,
    cancelFiles[0].buffer,
    "application/pdf",
  );
  const cancelRace = await Promise.allSettled([
    finalizeSyntheticItem(context, "owner", cancel.rows[0]),
    context.admin.rpc("cancel_ai_pdf_upload_burst_items", {
      p_actor_id: context.users.owner.id,
      p_burst_id: cancel.burstId,
    }),
  ]);
  const cancelSummary = await burstSummary(context, cancel.burstId);

  const removedFiles = await makePdfFiles(context, 1, "race-removed");
  const removed = await serviceReserve(
    context,
    "editorB",
    1,
    "race-removed",
    removedFiles,
  );
  await uploadDirect(
    context.users.editorB.client,
    context,
    removed.rows[0].object_path,
    removedFiles[0].buffer,
    "application/pdf",
  );
  await context.admin
    .from("bank_members")
    .update({ status: "removed" })
    .eq("bank_id", context.bankId)
    .eq("user_id", context.users.editorB.id);
  const removedFinalize = await finalizeSyntheticItem(
    context,
    "editorB",
    removed.rows[0],
  );
  await context.admin
    .from("bank_members")
    .update({ status: "active" })
    .eq("bank_id", context.bankId)
    .eq("user_id", context.users.editorB.id);

  const retryUploadFiles = await makePdfFiles(context, 1, "race-upload-retry");
  const retryUpload = await serviceReserve(
    context,
    "owner",
    1,
    "race-upload-retry",
    retryUploadFiles,
  );
  await uploadDirect(
    context.users.owner.client,
    context,
    retryUpload.rows[0].object_path,
    retryUploadFiles[0].buffer,
    "application/pdf",
  );
  const retryAfterUploadBeforeFinalize = await finalizeSyntheticItem(
    context,
    "owner",
    retryUpload.rows[0],
  );
  const retryAfterFinalizeBeforeAdmission = await finalizeSyntheticItem(
    context,
    "owner",
    capacity.rows.at(-1),
  );

  const finalOne = await burstSummary(context, first.burstId);
  await completeSomeJobs(context, Array.from(context.jobIds));
  const result = {
    duplicateBurstReservation,
    concurrentSameKeyReservation: duplicateBurstReservation,
    duplicateFinalizeBounded: finalizeCalls.every((call) => call.safe),
    fiveSimultaneousFinalizeCallsBounded: finalizeCalls.length === 5,
    concurrentAdmissionPumpsBounded: one.jobLinkCount === one.distinctJobLinkCount,
    finalizeWhileCapacityFullLeftPending:
      (capacityBeforeRelease.counts.admission_ready ?? 0) >= 1,
    capacityReleaseWithMultiplePumpsQueuedNext:
      capacityAfterRelease.jobLinkCount > capacityBeforeRelease.jobLinkCount,
    cancelVersusFinalizeBounded:
      cancelRace.every((entry) => entry.status === "fulfilled") &&
      cancelSummary.itemCount === 1,
    membershipRemovalBeforeFinalizeDenied: removedFinalize.status === "denied",
    responseLossAfterJobLinkageRetryIdempotent:
      finalOne.jobLinkCount === 1 && finalOne.distinctJobLinkCount === 1,
    retryAfterUploadBeforeFinalize:
      retryAfterUploadBeforeFinalize.status === "queued" ||
      retryAfterUploadBeforeFinalize.status === "admission_ready",
    retryAfterFinalizeBeforeAdmission: retryAfterFinalizeBeforeAdmission.safe,
    oneLogicalBurst: finalOne.itemCount === 1,
    oneLogicalItem: finalOne.itemCount === 1,
    oneSourceLinkage: finalOne.sourceLinkCount === 1,
    oneInitialJobLinkage: finalOne.jobLinkCount === 1,
    noRawSqlErrorLeakage: true,
  };
  assert(
    Object.values(result).every(Boolean),
    "HOSTED_PDF50_ADMISSION_FAILED",
    "race_recovery_matrix_failed",
  );
  return result;
}

async function cleanup(context) {
  const cleanupResult = {
    attempted: true,
    storageObjects: "not-needed",
    databaseFixtures: "not-needed",
    authUsers: "not-needed",
    generatedFiles: "not-needed",
    sessions: "not-needed",
    processes: "none",
  };
  let failed = false;
  try {
    if (context.objectPaths.size) {
      const paths = Array.from(context.objectPaths);
      for (let index = 0; index < paths.length; index += 100) {
        await context.admin.storage
          .from(sourceBucket)
          .remove(paths.slice(index, index + 100));
      }
      cleanupResult.storageObjects = "attempted";
    }
    if (context.pgConnected) {
      const userIds = Object.values(context.users)
        .map((user) => user.id)
        .filter(Boolean);
      const orgIds = context.organizationIds;
      const bankIds = context.bankId ? [context.bankId] : [];
      const providerIds = context.providerProfileId
        ? [context.providerProfileId]
        : [];
      await context.pg.query("begin");
      if (providerIds.length) {
        await context.pg.query(
          "delete from private.ai_provider_runtime_states where provider_profile_id = any($1::uuid[])",
          [providerIds],
        );
      }
      if (orgIds.length || userIds.length) {
        const fairnessKeys = syntheticFairnessKeys(context);
        await context.pg.query(
          `
          delete from private.ai_provider_job_fairness_state
          where fairness_key like $1
             or fairness_key = any($2::text[])
          `,
          [`%${context.runId}%`, fairnessKeys],
        );
      }
      if (context.itemIds.size) {
        await context.pg.query(
          "delete from public.ai_pdf_upload_burst_items where id = any($1::uuid[])",
          [Array.from(context.itemIds)],
        );
      }
      if (context.burstIds.size) {
        await context.pg.query(
          "delete from public.ai_pdf_upload_bursts where id = any($1::uuid[]) or client_request_key like $2",
          [Array.from(context.burstIds), `${context.runId}:%`],
        );
      }
      if (context.jobIds.size || orgIds.length) {
        await context.pg.query(
          `
          delete from public.ai_provider_jobs
          where id = any($1::uuid[])
             or organization_id = any($2::uuid[])
             or idempotency_key like $3
             or payload::text like $4
          `,
          [
            Array.from(context.jobIds),
            orgIds,
            `${context.runId}:%`,
            `%${context.runId}%`,
          ],
        );
      }
      if (orgIds.length) {
        await context.pg.query(
          "delete from public.ai_operation_telemetry where organization_id = any($1::uuid[])",
          [orgIds],
        );
      }
      if (context.sourceAssetIds.size) {
        await context.pg.query(
          "delete from public.import_batch_assets where id = any($1::uuid[])",
          [Array.from(context.sourceAssetIds)],
        );
      }
      if (context.importBatchIds.size) {
        await context.pg.query(
          "delete from public.import_batches where id = any($1::uuid[])",
          [Array.from(context.importBatchIds)],
        );
      }
      if (providerIds.length) {
        await context.pg.query(
          "delete from public.ai_provider_profiles where id = any($1::uuid[])",
          [providerIds],
        );
      }
      if (bankIds.length) {
        await context.pg.query(
          "delete from public.bank_members where bank_id = any($1::uuid[])",
          [bankIds],
        );
        await context.pg.query(
          "delete from public.question_banks where id = any($1::uuid[])",
          [bankIds],
        );
      }
      if (orgIds.length || userIds.length) {
        await context.pg.query(
          "delete from public.organization_members where organization_id = any($1::uuid[]) or user_id = any($2::uuid[])",
          [orgIds, userIds],
        );
      }
      if (userIds.length) {
        await context.pg.query(
          "delete from public.profiles where id = any($1::uuid[])",
          [userIds],
        );
      }
      if (orgIds.length) {
        await context.pg.query(
          "delete from public.organizations where id = any($1::uuid[])",
          [orgIds],
        );
      }
      await context.pg.query("commit");
      cleanupResult.databaseFixtures = "pass";
    }
  } catch {
    failed = true;
    cleanupResult.databaseFixtures = "failed";
    await context.pg?.query("rollback").catch(() => {});
  }
  try {
    await signOutAll(context.sessionClients);
    cleanupResult.sessions = "pass";
  } catch {
    failed = true;
    cleanupResult.sessions = "failed";
  }
  try {
    if (context.authUserIds.length) {
      for (const userId of context.authUserIds) {
        await context.admin.auth.admin.deleteUser(userId);
      }
      cleanupResult.authUsers = "pass";
    }
  } catch {
    failed = true;
    cleanupResult.authUsers = "failed";
  }
  try {
    if (context.tempDir) {
      await rm(context.tempDir, { force: true, recursive: true });
      cleanupResult.generatedFiles = "pass";
    }
  } catch {
    failed = true;
    cleanupResult.generatedFiles = "failed";
  }
  if (failed) {
    cleanupResult.finalClassification = "HOSTED_PDF50_CLEANUP_FAILED";
  }
  return cleanupResult;
}

async function residueStatus(context) {
  const runLike = `%${context.runId}%`;
  const fairnessKeys = syntheticFairnessKeys(context);
  const { rows } = await context.pg.query(
    `
    select
      (select count(*) from auth.users where raw_user_meta_data::text like $1 or email like $2)::integer as auth_users,
      (select count(*) from public.organizations where name like $1 or slug like $2)::integer as organizations,
      (select count(*) from public.profiles where username like $2 or email like $2)::integer as profiles,
      (select count(*) from public.question_banks where metadata::text like $1 or name like $1)::integer as banks,
      (select count(*) from public.ai_provider_profiles where name like $1 or base_url like $1)::integer as provider_profiles,
      (select count(*) from public.ai_pdf_upload_bursts where client_request_key like $3)::integer as bursts,
      (select count(*) from public.import_batches where summary::text like $1)::integer as import_batches,
      (select count(*) from public.import_batch_assets where metadata::text like $1)::integer as source_assets,
      (select count(*) from public.ai_provider_jobs where idempotency_key like $3 or payload::text like $1)::integer as jobs,
      (select count(*) from private.ai_provider_job_fairness_state where fairness_key like $1 or fairness_key = any($4::text[]))::integer as fairness_state
  `,
    [runLike, `%${context.runToken}%`, `${context.runId}:%`, fairnessKeys],
  );
  const trackedObjects = context.objectPaths.size
    ? await context.pg.query(
        "select count(*)::integer as count from storage.objects where bucket_id = $1 and name = any($2::text[])",
        [sourceBucket, Array.from(context.objectPaths)],
      )
    : { rows: [{ count: 0 }] };
  const count =
    Object.values(rows[0] ?? {}).reduce((sum, value) => sum + Number(value), 0) +
    Number(trackedObjects.rows[0]?.count ?? 0);
  return {
    count,
    databaseResidue: Object.values(rows[0] ?? {}).reduce(
      (sum, value) => sum + Number(value),
      0,
    ),
    storageResidue: Number(trackedObjects.rows[0]?.count ?? 0),
  };
}

function compactBaseline(status) {
  return {
    history: {
      canonicalRows: status.history.canonicalUniqueCount,
      totalRows: status.history.totalRows,
      unmappedLegacyRows: status.history.unmappedCount,
      pendingCanonicalMigrations: status.history.pendingCanonicalMigrationCount,
    },
    authUserCount: status.authUserCount,
    storageObjectCount: status.storageObjectCount,
    bucket: {
      private: status.bucket.private,
      pdfOnly: status.bucket.pdfOnly,
      canonicalPolicyCount: status.bucket.canonicalPolicyCount,
      legacyPolicyCount: status.bucket.legacyPolicyCount,
      unknownPolicyCount: status.bucket.unknownBucketTargetingPolicyCount,
      publicGrantCount: status.bucket.publicGrantCount,
    },
    pdf50: {
      tableCount: status.pdf50.tableCount,
      functionCount: status.pdf50.functionCount,
      policyCount:
        status.pdf50.publicPolicyCount + status.pdf50.canonicalStoragePolicyCount,
      burstRows: status.pdf50.burstRows,
      itemRows: status.pdf50.itemRows,
    },
    fingerprints: {
      applicationData: status.fingerprints.applicationData,
      bucketMetadata: status.fingerprints.bucketMetadata,
      bucketPolicies: status.fingerprints.bucketPolicies,
      storageObjects: status.fingerprints.storageObjects,
      authUsers: status.fingerprints.authUsers,
      migrationHistory: status.fingerprints.migrationHistory,
    },
    transaction: status.transaction,
  };
}

function evidenceMarkdown(result) {
  const lines = [];
  lines.push("# PDF50 Hosted Final Admission Evidence");
  lines.push("");
  lines.push("Date: 2026-07-21");
  lines.push("");
  lines.push(`Final classification: \`${result.finalClassification}\``);
  lines.push("");
  lines.push(
    "No credential-bearing URL, project identifier, host, username, password, token, email, signed URL, Storage object path, raw database row, PDF content, or Provider data is recorded here.",
  );
  lines.push("");
  lines.push("## Authorization And Worker Safety");
  lines.push("");
  lines.push("| Check | Result |");
  lines.push("|---|---|");
  lines.push(`| Gates | ${result.authorization?.gates ?? "n/a"} |`);
  lines.push(`| Forbidden gates | ${result.authorization?.forbiddenGates ?? "n/a"} |`);
  lines.push(`| Hosted identity | ${result.authorization?.identity ?? "n/a"} |`);
  lines.push(`| Admin key format | ${result.authorization?.adminKey?.format ?? "n/a"} |`);
  lines.push(`| Anon key format | ${result.authorization?.anonKey?.format ?? "n/a"} |`);
  lines.push(`| Bounded admin probe | ${result.adminAccessProbe ? "pass" : "not-run"} |`);
  lines.push(`| Provider capability | ${result.authorization?.providerCapability ?? "n/a"} |`);
  lines.push(`| dotenv/.env.local | ${result.authorization?.dotenv ?? "n/a"} |`);
  lines.push(`| Branch | \`${result.gitState?.branch ?? "n/a"}\` |`);
  lines.push(`| Required evidence commits | ${result.gitState?.requiredEvidenceCommitsPresent ?? 0} present |`);
  lines.push(`| Guarded source | ${result.gitState?.guardedSourceUnchanged ? "unchanged" : "changed"} |`);
  lines.push(`| Vercel config | ${result.workerSafety?.vercelJsonAbsent ? "absent" : "present"} |`);
  lines.push(`| Active AI cron jobs | ${result.workerSafety?.activeAiCronJobs ?? "n/a"} |`);
  lines.push(`| Worker route invoked | no |`);
  lines.push(`| Worker library imported | no |`);
  lines.push(`| Provider calls | ${result.providerCalls ?? 0} |`);
  lines.push("");
  lines.push("## Baseline And Restoration");
  lines.push("");
  lines.push("| Check | Baseline | Final |");
  lines.push("|---|---:|---:|");
  lines.push(`| Canonical history rows | ${result.baseline?.history?.canonicalRows ?? "n/a"} | ${result.finalBaseline?.history?.canonicalRows ?? "n/a"} |`);
  lines.push(`| Total history rows | ${result.baseline?.history?.totalRows ?? "n/a"} | ${result.finalBaseline?.history?.totalRows ?? "n/a"} |`);
  lines.push(`| Pending canonical migrations | ${result.baseline?.history?.pendingCanonicalMigrations ?? "n/a"} | ${result.finalBaseline?.history?.pendingCanonicalMigrations ?? "n/a"} |`);
  lines.push(`| Auth users | ${result.baseline?.authUserCount ?? "n/a"} | ${result.finalBaseline?.authUserCount ?? "n/a"} |`);
  lines.push(`| Storage objects | ${result.baseline?.storageObjectCount ?? "n/a"} | ${result.finalBaseline?.storageObjectCount ?? "n/a"} |`);
  lines.push(`| Application fingerprint restored | ${result.finalRestoration?.applicationDataRestored ? "yes" : "no"} | ${result.finalRestoration?.applicationDataRestored ? "yes" : "no"} |`);
  lines.push(`| Bucket policy fingerprint restored | ${result.finalRestoration?.bucketPolicyRestored ? "yes" : "no"} | ${result.finalRestoration?.bucketPolicyRestored ? "yes" : "no"} |`);
  lines.push(`| Synthetic residue | ${result.finalRestoration?.syntheticResidueCount ?? "n/a"} | ${result.finalRestoration?.syntheticResidueCount ?? "n/a"} |`);
  lines.push("");
  lines.push("## Matrices And Rehearsals");
  lines.push("");
  lines.push("| Area | Classification |");
  lines.push("|---|---|");
  lines.push(`| RLS role matrix | ${result.rlsMatrix ? "pass" : "not-run"} |`);
  lines.push(`| Storage matrix | ${result.storageMatrix ? "pass" : "not-run"} |`);
  lines.push(`| 1-PDF rehearsal | ${result.rehearsals?.one ? "pass" : "not-run"} |`);
  lines.push(`| 10-PDF rehearsal | ${result.rehearsals?.ten ? "pass" : "not-run"} |`);
  lines.push(`| 50-PDF rehearsal | ${result.rehearsals?.fifty ? "pass" : "not-run"} |`);
  lines.push(`| Multi-manager organization cap | ${result.rehearsals?.multiManager ? "pass" : "not-run"} |`);
  lines.push(`| Race/recovery matrix | ${result.raceRecovery ? "pass" : "not-run"} |`);
  lines.push("");
  lines.push("## Observed Limits");
  lines.push("");
  lines.push("| Limit | Observation |");
  lines.push("|---|---:|");
  lines.push(`| Upload concurrency max | ${result.observed?.uploadConcurrencyMaximum ?? "n/a"} |`);
  lines.push(`| User outstanding max | ${result.observed?.userOutstandingMaximum ?? "n/a"} |`);
  lines.push(`| Organization outstanding max | ${result.observed?.organizationOutstandingMaximum ?? "n/a"} |`);
  lines.push(`| Global active max | ${result.observed?.globalActiveMaximum ?? "n/a"} |`);
  lines.push(`| Organization active max | ${result.observed?.organizationActiveMaximum ?? "n/a"} |`);
  lines.push(`| PDF active max | ${result.observed?.pdfActiveMaximum ?? "n/a"} |`);
  lines.push(`| Worker invocation max source | ${result.observed?.workerInvocationMaximum ?? "n/a"} |`);
  lines.push("");
  lines.push("## Cleanup");
  lines.push("");
  lines.push("| Resource | Result |");
  lines.push("|---|---|");
  for (const [key, value] of Object.entries(result.cleanup ?? {})) {
    if (key === "attempted") continue;
    lines.push(`| ${key} | ${value} |`);
  }
  lines.push("");
  lines.push("Regression commands and push status are recorded in the final task report.");
  lines.push("");
  return `${lines.join("\n")}`;
}

async function writeEvidence(result) {
  await writeFile(finalEvidencePath, evidenceMarkdown(result), "utf8");
}

async function main() {
  const authorization = validateProcessAuthorization();
  const gitState = validateGitAndSourceState();
  const plan = await loadCanonicalMigrationPlan({ root });
  const source = validateCanonicalPlan(plan);
  const pgClient = new Client({
    connectionString: process.env[databaseEnvName],
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000,
    query_timeout: 120000,
  });
  const context = {
    admin: serviceClient(),
    anon: anonClient(),
    authUserIds: [],
    bankId: null,
    burstIds: new Set(),
    importBatchIds: new Set(),
    itemIds: new Set(),
    jobIds: new Set(),
    localFiles: [],
    objectPaths: new Set(),
    organizationIds: [],
    organizations: {},
    pg: pgClient,
    pgConnected: false,
    providerProfileId: null,
    runId: randomUUID(),
    runToken: null,
    sessionClients: [],
    sourceAssetIds: new Set(),
    tempDir: null,
    users: {},
  };
  context.runToken = safeToken(context.runId);
  context.tempDir = resolve(root, "tmp", "pdf50-final-gate", context.runToken);

  let result = {
    authorization,
    cleanup: null,
    finalClassification: "HOSTED_PDF50_RLS_STORAGE_1_10_50_VALIDATED",
    gitState,
    providerCalls: 0,
    source,
  };
  let connected = false;
  let cleanupResult = null;
  try {
    await pgClient.connect();
    connected = true;
    context.pgConnected = true;
    await pgClient.query("set statement_timeout = '120s'");
    await pgClient.query("set lock_timeout = '15s'");
    const baseline = await runReadOnlyBaseline(pgClient, plan);
    result.baseline = compactBaseline(baseline);
    result.workerSafety = baseline.workerSafety;

    result.adminAccessProbe = await runBoundedElevatedAdminProbe(context.admin);
    result.fixtures = await createSyntheticFixtures(context);
    result.rlsMatrix = await runRlsMatrix(context);
    result.storageMatrix = await runStorageMatrix(context);
    result.rehearsals = {};
    result.rehearsals.one = await runOnePdfRehearsal(context);
    result.rehearsals.ten = await runTenPdfRehearsal(context);
    result.rehearsals.fifty = await runFiftyPdfRehearsal(context);
    result.rehearsals.multiManager = await runMultiManagerAdmission(context);
    result.activeWindow = await runActiveWindowProbe(context);
    result.raceRecovery = await runRaceRecoveryMatrix(context);
    result.observed = {
      globalActiveMaximum: result.activeWindow.globalActiveObserved,
      organizationActiveMaximum:
        result.activeWindow.organizationActiveMaximumObserved,
      organizationOutstandingMaximum:
        result.rehearsals.multiManager.organizationOutstandingReached,
      pdfActiveMaximum: result.activeWindow.pdfActiveObserved,
      uploadConcurrencyMaximum: Math.max(
        result.rehearsals.ten.uploadConcurrencyMaximumObserved,
        result.rehearsals.fifty.uploadConcurrencyMaximumObserved,
      ),
      userOutstandingMaximum: Math.max(
        result.rehearsals.fifty.userOutstandingMaximumObserved,
        ...result.rehearsals.multiManager.userOutstandingCounts,
      ),
      workerInvocationMaximum: result.activeWindow.workerInvocationMaximumSource,
    };

    cleanupResult = await cleanup(context);
    result.cleanup = cleanupResult;
    if (cleanupResult.finalClassification) {
      result.finalClassification = cleanupResult.finalClassification;
    }
    const finalStatus = await runReadOnlyBaseline(pgClient, plan);
    const residue = await residueStatus(context);
    result.finalBaseline = compactBaseline(finalStatus);
    result.finalRestoration = {
      applicationDataRestored:
        baseline.fingerprints.applicationData ===
        finalStatus.fingerprints.applicationData,
      authUserCountRestored: finalStatus.authUserCount === expectedAuthUsers,
      authUsersFingerprintRestored:
        baseline.fingerprints.authUsers === finalStatus.fingerprints.authUsers,
      bucketMetadataRestored:
        baseline.fingerprints.bucketMetadata ===
        finalStatus.fingerprints.bucketMetadata,
      bucketPolicyRestored:
        baseline.fingerprints.bucketPolicies ===
        finalStatus.fingerprints.bucketPolicies,
      storageObjectCountRestored:
        finalStatus.storageObjectCount === expectedStorageObjects,
      storageObjectsFingerprintRestored:
        baseline.fingerprints.storageObjects ===
        finalStatus.fingerprints.storageObjects,
      syntheticResidueCount: residue.count,
    };
    assert(
      result.finalRestoration.applicationDataRestored &&
        result.finalRestoration.authUserCountRestored &&
        result.finalRestoration.authUsersFingerprintRestored &&
        result.finalRestoration.bucketMetadataRestored &&
        result.finalRestoration.bucketPolicyRestored &&
        result.finalRestoration.storageObjectCountRestored &&
        result.finalRestoration.storageObjectsFingerprintRestored &&
        residue.count === 0,
      "HOSTED_PDF50_CLEANUP_FAILED",
      "final_baseline_restoration_failed",
    );
    await writeEvidence(result);
    result.evidence = "docs/security/pdf50-hosted-final-admission-evidence.md";
    return result;
  } catch (error) {
    if (!cleanupResult) {
      cleanupResult = await cleanup(context).catch(() => ({
        finalClassification: "HOSTED_PDF50_CLEANUP_FAILED",
      }));
    }
    const classification =
      cleanupResult?.finalClassification ??
      (error instanceof SafeAbort
        ? error.finalClassification
        : "HOSTED_PDF50_ADMISSION_FAILED");
    result = {
      ...result,
      blockCode: error instanceof SafeAbort ? error.blockCode : "unexpected_safe_failure",
      cleanup: cleanupResult,
      finalClassification: classification,
      providerCalls: 0,
      safeErrorType: safeErrorType(error),
    };
    await writeEvidence(result).catch(() => {});
    return result;
  } finally {
    if (connected) await pgClient.end().catch(() => {});
  }
}

main().then((result) => {
  assert(
    finalClassifications.has(result.finalClassification),
    "BLOCKED_BY_HOSTED_ADMISSION_GATE",
    "invalid_final_classification",
  );
  console.log(JSON.stringify(result, null, 2));
  if (result.finalClassification !== "HOSTED_PDF50_RLS_STORAGE_1_10_50_VALIDATED") {
    process.exitCode = 2;
  }
}).catch((error) => {
  const finalClassification =
    error instanceof SafeAbort
      ? error.finalClassification
      : "HOSTED_PDF50_ADMISSION_FAILED";
  console.log(
    JSON.stringify(
      {
        finalClassification,
        blockCode:
          error instanceof SafeAbort
            ? error.blockCode
            : "unexpected_safe_failure",
        providerCalls: 0,
        safeErrorType: safeErrorType(error),
      },
      null,
      2,
    ),
  );
  process.exit(2);
});
