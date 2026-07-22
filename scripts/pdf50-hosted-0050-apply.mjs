import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import pg from "pg";

import {
  loadCanonicalMigrationPlan,
  migrationNumber,
} from "./lib/canonical-migration-plan.mjs";

const { Client } = pg;
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const requiredBranch = "codex/pdf50-hosted-clean-maintenance";
const requiredSourceHead = "24e15c17dd03c00dc1801f461982172196237ef4";
const practice0049Migration = "0049_practice_agent_provider_routing.sql";
const pdf500050Migration = "0050_pdf50_burst_upload_admission.sql";
const blockedGoogleMigration = "0032_google_account_links.sql";
const executable0032Migration = "0032_teacher_feedback_notes.sql";
const databaseEnvName = "PDF50_HOSTED_CLEAN_DATABASE_URL";
const expectedProjectRefEnvName = "PDF50_HOSTED_CLEAN_EXPECTED_PROJECT_REF";
const projectAliasEnvName = "PDF50_HOSTED_CLEAN_PROJECT_ALIAS";
const forbiddenProjectRefEnvName = "PDF50_LEGACY_FORBIDDEN_PROJECT_REF";
const historyRepairGateEnvName = "PDF50_HOSTED_HISTORY_REPAIR_ONLY";
const expectedAuthUsers = 4;
const expectedStorageObjects = 6;
const maxPdfBytes = 52428800;
const expectedUnmappedLegacyNames = [
  "fix_private_schema_function_grants_for_rls",
  "fix_taxonomy_closure_rebuild_safe_delete",
];
const legacySourcePolicyNames = [
  "ai_import_sources_admin_delete",
  "ai_import_sources_admin_read",
  "ai_import_sources_admin_upload",
];
const canonicalSourcePolicyNames = [
  "ai_import_sources_manager_delete",
  "ai_import_sources_manager_read",
  "ai_import_sources_reserved_upload",
];
const expectedPracticeOperations = [
  "ai_pdf_extract",
  "blueprint_analyze_text",
  "blueprint_generate_questions",
  "blueprint_observe_pdf",
  "practice_generation",
];
const sourceGuardPaths = [
  "supabase/clean-migrations",
  "docs/security/live-schema-manifest.json",
  "scripts/lib/canonical-migration-plan.mjs",
];
const allowedEnvNames = new Set([
  "PDF50_HOSTED_CLEAN_READONLY_GATE",
  "PDF50_HOSTED_CLEAN_WRITE_GATE",
  "PDF50_HOSTED_0050_APPLY_GATE",
  databaseEnvName,
  expectedProjectRefEnvName,
  projectAliasEnvName,
  forbiddenProjectRefEnvName,
]);
const requiredGates = {
  PDF50_HOSTED_CLEAN_READONLY_GATE: "CONFIRMED",
  PDF50_HOSTED_CLEAN_WRITE_GATE: "CONFIRMED",
  PDF50_HOSTED_0050_APPLY_GATE: "AUTHORIZED_EXACTLY_ONCE",
};
const guardedEnvPattern =
  /^(PDF50_|SUPABASE|DATABASE_URL|DIRECT_URL|POSTGRES|PG|NEXT_PUBLIC_SUPABASE|SUPABASE_)/;
const finalClassifications = new Set([
  "HOSTED_PDF50_0050_APPLIED_AND_SCHEMA_VALIDATED",
  "HOSTED_0050_BASELINE_CHANGED_ABORTED",
  "HOSTED_0050_APPLY_FAILED_AND_ROLLED_BACK",
  "HOSTED_0050_POST_APPLY_VALIDATION_FAILED",
  "BLOCKED_BY_HOSTED_0050_GATE",
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

function modeFromArgs() {
  if (process.argv.includes("--preflight")) return "preflight";
  if (process.argv.includes("--postapply")) return "postapply";
  if (process.argv.includes("--second-run")) return "second-run";
  return "apply";
}

function pad(number) {
  return String(number).padStart(4, "0");
}

function lower(value) {
  return String(value ?? "").toLowerCase();
}

function normalizeWhitespace(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalizeSqlShape(value) {
  return normalizeWhitespace(value)
    .toLowerCase()
    .replace(/\btimestamp with time zone\b/g, "timestamptz")
    .replace(/\btimestamp without time zone\b/g, "timestamp")
    .replace(/\s*([(),;])\s*/g, "$1")
    .replace(/\s*=\s*/g, "=")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeSearchPath(value) {
  return String(value ?? "")
    .replace(/^search_path=/i, "")
    .split(",")
    .map((part) => part.trim().replace(/^"|"$/g, ""))
    .filter(Boolean)
    .join(",");
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
    .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
}

function quoteIdentifier(identifier) {
  return `"${String(identifier).replaceAll('"', '""')}"`;
}

function canonicalRange(start, end) {
  return Array.from({ length: end - start + 1 }, (_, index) => pad(start + index));
}

function findMatchingParen(text, openIndex) {
  let depth = 0;
  let quote = null;
  for (let index = openIndex; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (quote) {
      if (char === quote && next === quote) index += 1;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      continue;
    }
    if (char === "(") depth += 1;
    else if (char === ")") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function splitTopLevelComma(body) {
  const parts = [];
  let start = 0;
  let depth = 0;
  let quote = null;
  for (let index = 0; index < body.length; index += 1) {
    const char = body[index];
    const next = body[index + 1];
    if (quote) {
      if (char === quote && next === quote) index += 1;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      continue;
    }
    if (char === "(") depth += 1;
    else if (char === ")") depth -= 1;
    else if (char === "," && depth === 0) {
      parts.push(body.slice(start, index));
      start = index + 1;
    }
  }
  parts.push(body.slice(start));
  return parts;
}

function normalizeFunctionArguments(rawArgs) {
  return splitTopLevelComma(rawArgs)
    .map((argument) => argument.trim())
    .filter(Boolean)
    .map((argument) => {
      const withoutDefault = argument.replace(/\s+default\s+[\s\S]+$/i, "").trim();
      const tokens = withoutDefault.split(/\s+/).filter(Boolean);
      const cleaned = tokens.filter((token) => !/^(in|out|inout|variadic)$/i.test(token));
      if (cleaned.length <= 1) return cleaned.join(" ").toLowerCase();
      if (/^(uuid|text|integer|bigint|boolean|jsonb|numeric|date|timestamptz|timestamp|void)$/i.test(cleaned[0])) {
        return cleaned.join(" ").toLowerCase();
      }
      return cleaned.slice(1).join(" ").toLowerCase();
    })
    .join(", ");
}

function functionKey(schema, name, args) {
  return `${schema}.${name}(${args})`.toLowerCase();
}

function functionNameFromKey(key) {
  return key.replace(/\([^)]*\)$/, "");
}

function stripSqlComments(sql) {
  return sql.replace(/--.*$/gm, " ");
}

function operationKindsFromText(value) {
  return [...String(value ?? "").matchAll(/'([a-z_]+)'/g)]
    .map((match) => match[1])
    .sort();
}

function extractPracticeOperationLists(sql) {
  return [...sql.matchAll(/(?:p_)?operation_kind\s+(?:not\s+)?in\s*\(([\s\S]*?)\)/gi)]
    .map((match) => operationKindsFromText(match[1]))
    .filter((items) => items.length > 0);
}

function sourceFunctionBlocks(sql) {
  const blocks = [];
  const pattern = /create\s+or\s+replace\s+function\s+(public|private)\.([a-z_]\w*)\s*\(/gi;
  for (const match of sql.matchAll(pattern)) {
    const schema = lower(match[1]);
    const name = lower(match[2]);
    const openIndex = match.index + match[0].lastIndexOf("(");
    const closeIndex = findMatchingParen(sql, openIndex);
    if (closeIndex <= openIndex) continue;
    const asIndex = sql.slice(closeIndex).search(/\bas\s+\$\$/i);
    if (asIndex < 0) continue;
    const bodyStart = closeIndex + asIndex + sql.slice(closeIndex + asIndex).match(/\bas\s+\$\$/i)[0].length;
    const bodyEnd = sql.indexOf("$$;", bodyStart);
    if (bodyEnd < 0) continue;
    const header = sql.slice(match.index, bodyStart);
    const body = sql.slice(bodyStart, bodyEnd);
    const returns = /returns\s+([\s\S]*?)\s+language\s+([a-z]+)/i.exec(header);
    if (!returns) continue;
    blocks.push({
      key: functionKey(schema, name, normalizeFunctionArguments(sql.slice(openIndex + 1, closeIndex))),
      result: normalizeSqlShape(returns[1]),
      language: lower(returns[2]),
      volatility: /\bstable\b/i.test(header) ? "stable" : (/\bimmutable\b/i.test(header) ? "immutable" : "volatile"),
      securityDefiner: /\bsecurity\s+definer\b/i.test(header),
      searchPath: normalizeSearchPath(/set\s+search_path\s*=\s*([^\n$]+)/i.exec(header)?.[1] ?? ""),
      bodyHash: sha256(normalizeSqlShape(body)),
    });
  }
  return blocks;
}

function buildPractice0049Expectation(sql) {
  const operationLists = extractPracticeOperationLists(sql);
  const uniqueOperationHashes = new Set(operationLists.map(hashJson));
  assert(
    operationLists.length === 5 &&
      uniqueOperationHashes.size === 1 &&
      hashJson(operationLists[0]) === hashJson(expectedPracticeOperations),
    "HOSTED_0050_BASELINE_CHANGED_ABORTED",
    "practice_0049_source_operation_allowlist_changed",
  );
  const functions = sourceFunctionBlocks(sql);
  const expectedFunctionNames = new Set([
    "public.upsert_ai_provider_routing_policy_for_gateway",
    "public.list_ai_provider_runtime_states_for_worker",
    "public.record_ai_provider_route_outcome",
  ]);
  const selected = functions.filter((entry) => expectedFunctionNames.has(functionNameFromKey(entry.key)));
  assert(
    selected.length === 3,
    "HOSTED_0050_BASELINE_CHANGED_ABORTED",
    "practice_0049_source_function_count_changed",
  );
  return {
    expectedObjectCount: 5,
    operationAllowlistHash: hashJson(expectedPracticeOperations),
    sourceHash: sha256(normalizeSqlShape(stripSqlComments(sql))),
    functionsByKey: new Map(selected.map((entry) => [entry.key, entry])),
  };
}

function git(args) {
  return execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
}

function gitCleanForPaths(args) {
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

function validateGitAndSourceState() {
  assert(
    git(["branch", "--show-current"]) === requiredBranch,
    "HOSTED_0050_BASELINE_CHANGED_ABORTED",
    "branch_changed",
  );
  assert(
    git(["rev-parse", "HEAD"]) === requiredSourceHead,
    "HOSTED_0050_BASELINE_CHANGED_ABORTED",
    "source_head_changed",
  );
  assert(
    gitCleanForPaths(["diff", "--quiet", "--", ...sourceGuardPaths]) &&
      gitCleanForPaths(["diff", "--cached", "--quiet", "--", ...sourceGuardPaths]),
    "HOSTED_0050_BASELINE_CHANGED_ABORTED",
    "source_governance_changed",
  );
  return {
    branch: requiredBranch,
    sourceHead: requiredSourceHead,
    sourceGovernanceUnchanged: true,
  };
}

function validateProcessAuthorization() {
  for (const [name, expected] of Object.entries(requiredGates)) {
    assert(
      process.env[name] === expected,
      "BLOCKED_BY_HOSTED_0050_GATE",
      "authorization_gate_missing_or_mismatch",
    );
  }
  assert(
    !Object.prototype.hasOwnProperty.call(process.env, historyRepairGateEnvName),
    "BLOCKED_BY_HOSTED_0050_GATE",
    "history_repair_gate_present",
  );
  for (const name of [
    databaseEnvName,
    expectedProjectRefEnvName,
    projectAliasEnvName,
    forbiddenProjectRefEnvName,
  ]) {
    assert(
      typeof process.env[name] === "string" && process.env[name].trim().length > 0,
      "BLOCKED_BY_HOSTED_0050_GATE",
      "required_hosted_environment_missing",
    );
  }
  for (const [name, value] of Object.entries(process.env)) {
    if (allowedEnvNames.has(name)) continue;
    assert(
      !guardedEnvPattern.test(name) || String(value ?? "").length === 0,
      "BLOCKED_BY_HOSTED_0050_GATE",
      "non_allowlisted_database_environment_present",
    );
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(process.env[databaseEnvName]);
  } catch {
    abort("BLOCKED_BY_HOSTED_0050_GATE", "database_url_parse_failed");
  }
  const expectedProjectRef = process.env[expectedProjectRefEnvName];
  const forbiddenProjectRef = process.env[forbiddenProjectRefEnvName];
  const projectAlias = process.env[projectAliasEnvName];
  assert(
    /^[a-z0-9]+$/i.test(expectedProjectRef) &&
      /^[a-z0-9]+$/i.test(forbiddenProjectRef) &&
      expectedProjectRef !== forbiddenProjectRef &&
      projectAlias.trim().length > 0,
    "HOSTED_0050_BASELINE_CHANGED_ABORTED",
    "database_identity_input_ambiguous",
  );
  const username = decodeURIComponent(parsedUrl.username || "");
  const identityText = [
    parsedUrl.hostname,
    username,
    parsedUrl.pathname,
    parsedUrl.search,
  ].join(" ");
  assert(
    ["postgres:", "postgresql:"].includes(parsedUrl.protocol),
    "HOSTED_0050_BASELINE_CHANGED_ABORTED",
    "database_protocol_not_postgres",
  );
  assert(
    parsedUrl.hostname.includes("pooler") && username.includes(expectedProjectRef),
    "HOSTED_0050_BASELINE_CHANGED_ABORTED",
    "session_pooler_username_identity_not_proven",
  );
  assert(
    !identityText.includes(forbiddenProjectRef),
    "HOSTED_0050_BASELINE_CHANGED_ABORTED",
    "forbidden_legacy_database_matched",
  );
  assert(
    parsedUrl.password.length > 0 && parsedUrl.username.length > 0 && parsedUrl.hostname.length > 0,
    "HOSTED_0050_BASELINE_CHANGED_ABORTED",
    "database_identity_incomplete",
  );
  return {
    gates: "exact",
    historyRepairGate: "absent",
    identityClassification: "SESSION_POOLER_USERNAME_MATCHED_EXPECTED_HOSTED_CLEAN",
    forbiddenLegacyProject: "NOT_MATCHED",
    environmentScope: "ALLOWLISTED_HOSTED_0050_ONLY",
  };
}

function validateCanonicalPlan(plan) {
  assert(
    plan.executableMigrationNames.length === 50 &&
      plan.directoryMigrationNames.length === 51 &&
      plan.manifest.latestActivePrefix === 50,
    "HOSTED_0050_BASELINE_CHANGED_ABORTED",
    "canonical_source_count_or_head_changed",
  );
  assert(
    plan.executableMigrationNames.every((name, index) => migrationNumber(name) === index + 1),
    "HOSTED_0050_BASELINE_CHANGED_ABORTED",
    "canonical_active_order_changed",
  );
  assert(
    plan.executableMigrationNames[31] === executable0032Migration &&
      plan.blockedMigrationNames.includes(blockedGoogleMigration) &&
      !plan.executableMigrationNames.includes(blockedGoogleMigration),
    "HOSTED_0050_BASELINE_CHANGED_ABORTED",
    "blocked_duplicate_0032_governance_changed",
  );
  assert(
    plan.executableMigrationNames[48] === practice0049Migration &&
      plan.executableMigrationNames[49] === pdf500050Migration,
    "HOSTED_0050_BASELINE_CHANGED_ABORTED",
    "canonical_tail_changed",
  );
  assert(
    !plan.executableMigrationNames.some((name) => name.includes("/") || name.includes("\\")),
    "HOSTED_0050_BASELINE_CHANGED_ABORTED",
    "canonical_filename_path_changed",
  );
  return {
    executableMigrationCount: plan.executableMigrationNames.length,
    rawCleanSqlFileCount: plan.directoryMigrationNames.length,
    practice0049: "CANONICAL",
    pdf500050: "CANONICAL_HEAD",
    blockedGoogle0032: "EXCLUDED",
  };
}

function makeReadQuery(client, finalClassification = "HOSTED_0050_BASELINE_CHANGED_ABORTED") {
  return async function readQuery(sql, params = []) {
    assert(
      /^\s*(select|show)\b/i.test(sql),
      finalClassification,
      "non_read_sql_blocked",
    );
    return client.query(sql, params);
  };
}

async function transactionCommand(client, sql, finalClassification) {
  assert(
    /^(BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ(?:, READ ONLY)?|COMMIT|ROLLBACK)$/i.test(sql),
    finalClassification,
    "non_transaction_sql_blocked",
  );
  return client.query(sql);
}

async function inspectHistoryTable(query, finalClassification) {
  const regclass = await query("select to_regclass('supabase_migrations.schema_migrations')::text as table_name");
  assert(Boolean(regclass.rows[0]?.table_name), finalClassification, "migration_history_table_missing");
  const columns = await query(`
    select column_name, data_type, udt_name, is_nullable, column_default
    from information_schema.columns
    where table_schema = 'supabase_migrations'
      and table_name = 'schema_migrations'
    order by ordinal_position
  `);
  const columnNames = columns.rows.map((row) => row.column_name);
  const hasVersion = columnNames.includes("version");
  const hasName = columnNames.includes("name");
  const hasStatements = columnNames.includes("statements");
  assert(hasVersion, finalClassification, "migration_history_version_column_missing");
  if (hasStatements) {
    const statementsColumn = columns.rows.find((row) => row.column_name === "statements");
    assert(statementsColumn.udt_name === "_text", finalClassification, "migration_history_statements_shape_changed");
  }
  const unsupportedRequiredColumns = columns.rows.filter((row) => (
    !["version", "name", "statements"].includes(row.column_name) &&
    row.is_nullable === "NO" &&
    row.column_default == null
  ));
  assert(unsupportedRequiredColumns.length === 0, finalClassification, "migration_history_required_column_unknown");
  const versionUnique = await query(`
    select exists (
      select 1
      from pg_constraint constraint_row
      join pg_class history_table on history_table.oid = constraint_row.conrelid
      join pg_namespace history_schema on history_schema.oid = history_table.relnamespace
      where history_schema.nspname = 'supabase_migrations'
        and history_table.relname = 'schema_migrations'
        and constraint_row.contype in ('p', 'u')
        and (
          select array_agg(attribute.attname order by key_position.ordinality)
          from unnest(constraint_row.conkey) with ordinality as key_position(attnum, ordinality)
          join pg_attribute attribute
            on attribute.attrelid = history_table.oid
           and attribute.attnum = key_position.attnum
        ) = array['version']::name[]
    ) as has_version_unique
  `);
  assert(versionUnique.rows[0]?.has_version_unique === true, finalClassification, "migration_history_version_not_unique");
  return {
    hasName,
    hasStatements,
    columnCount: columns.rows.length,
    shapeHash: hashJson(sortedRows(columns.rows)),
  };
}

async function collectHistory(query, tableInfo, plan) {
  const rowsResult = await query(`
    select version::text as version,
           ${tableInfo.hasName ? "name::text" : "null::text"} as name
    from supabase_migrations.schema_migrations
    order by version, ${tableInfo.hasName ? "name nulls first" : "version"}
  `);
  const rawRowsResult = await query(`
    select to_jsonb(history_row) as row
    from (
      select *
      from supabase_migrations.schema_migrations
      order by version${tableInfo.hasName ? ", name nulls first" : ""}
    ) history_row
  `);
  const activeByNumber = new Map(plan.executableMigrationNames.map((name) => [migrationNumber(name), name]));
  const canonicalRowsByNumber = new Map();
  const unmappedIndexes = [];
  const ambiguousIndexes = [];
  rowsResult.rows.forEach((row, index) => {
    const version = String(row.version ?? "");
    const name = String(row.name ?? "");
    const numericVersion = /^\d{4}$/.test(version) ? Number(version) : null;
    if (numericVersion != null && activeByNumber.has(numericVersion)) {
      const rows = canonicalRowsByNumber.get(numericVersion) ?? [];
      rows.push({ index, version, name });
      canonicalRowsByNumber.set(numericVersion, rows);
      return;
    }
    if (expectedUnmappedLegacyNames.includes(name)) {
      unmappedIndexes.push(index);
      return;
    }
    ambiguousIndexes.push(index);
  });
  const duplicateCanonicalNumbers = [...canonicalRowsByNumber.entries()]
    .filter(([, rows]) => rows.length > 1)
    .map(([number]) => pad(number));
  const pendingCanonicalMigrations = plan.executableMigrationNames
    .filter((name) => !canonicalRowsByNumber.has(migrationNumber(name)));
  const unmappedRawRows = unmappedIndexes.map((index) => rawRowsResult.rows[index].row);
  const unmappedNames = unmappedIndexes.map((index) => rowsResult.rows[index].name).sort();
  return {
    totalRows: rowsResult.rows.length,
    historyFingerprint: hashJson(sortedRows(rawRowsResult.rows.map((row) => row.row))),
    canonicalUniqueCount: canonicalRowsByNumber.size,
    canonicalThrough0049Count: canonicalRange(1, 49)
      .filter((version) => canonicalRowsByNumber.has(Number(version))).length,
    canonicalThrough0050Count: canonicalRange(1, 50)
      .filter((version) => canonicalRowsByNumber.has(Number(version))).length,
    canonical0050Count: canonicalRowsByNumber.get(50)?.length ?? 0,
    history0050Absent: !canonicalRowsByNumber.has(50),
    history0050RecordedOnce: (canonicalRowsByNumber.get(50)?.length ?? 0) === 1,
    duplicateCanonicalNumbers,
    unmappedCount: unmappedIndexes.length,
    unmappedRowsPreserved: expectedUnmappedLegacyNames.every((name) => unmappedNames.includes(name)) &&
      unmappedNames.length === expectedUnmappedLegacyNames.length,
    unmappedRowsFingerprint: hashJson(sortedRows(unmappedRawRows)),
    ambiguousCount: ambiguousIndexes.length,
    nextPendingCanonicalMigration: pendingCanonicalMigrations[0] ?? null,
    pendingCanonicalMigrationCount: pendingCanonicalMigrations.length,
    pendingCanonicalMigrations,
  };
}

async function collectLive(query) {
  const tablesAndViews = await query(`
    select n.nspname as schema_name, c.relname as object_name, c.relkind,
           c.relrowsecurity, c.relforcerowsecurity
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where c.relkind in ('r','p','v','m')
      and n.nspname in ('public','private','storage')
  `);
  const columns = await query(`
    select table_schema, table_name, column_name, data_type, udt_name,
           is_nullable, column_default
    from information_schema.columns
    where table_schema in ('public','private','storage')
    order by table_schema, table_name, ordinal_position
  `);
  const functions = await query(`
    select n.nspname as schema_name,
           p.proname,
           pg_get_function_identity_arguments(p.oid) as identity_arguments,
           pg_get_function_result(p.oid) as function_result,
           l.lanname as language_name,
           p.provolatile,
           p.prosecdef,
           coalesce(array_to_string(p.proconfig, E'\\n'), '') as function_config,
           p.prosrc,
           coalesce(pg_get_userbyid(p.proowner), '') as function_owner,
           coalesce(p.proacl::text, '') as function_acl
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    join pg_language l on l.oid = p.prolang
    where n.nspname in ('public','private')
  `);
  const triggers = await query(`
    select event_object_schema, event_object_table, trigger_name,
           action_timing, event_manipulation,
           action_statement
    from information_schema.triggers
    where event_object_schema in ('public','private','storage')
    order by event_object_schema, event_object_table, trigger_name, event_manipulation
  `);
  const indexes = await query(`
    select ns.nspname as schema_name,
           tbl.relname as table_name,
           idx.relname as index_name,
           exists (select 1 from pg_constraint con where con.conindid = idx.oid) as constraint_backed,
           pg_get_indexdef(idx.oid) as definition
    from pg_class idx
    join pg_index ix on ix.indexrelid = idx.oid
    join pg_class tbl on tbl.oid = ix.indrelid
    join pg_namespace ns on ns.oid = idx.relnamespace
    where ns.nspname in ('public','private','storage')
  `);
  const constraints = await query(`
    select con.connamespace::regnamespace::text as schema_name,
           con.conrelid::regclass::text as relation_name,
           con.conname,
           con.contype,
           con.convalidated,
           pg_get_constraintdef(con.oid, true) as definition
    from pg_constraint con
    where con.connamespace::regnamespace::text in ('public','private','storage')
  `);
  const policies = await query(`
    select p.schemaname, p.tablename, p.policyname, p.cmd, p.roles::text as roles,
           pg_get_expr(po.polqual, po.polrelid, true) as using_expression,
           pg_get_expr(po.polwithcheck, po.polrelid, true) as check_expression
    from pg_policies p
    join pg_policy po on po.polname = p.policyname
    join pg_class c on c.oid = po.polrelid and c.relname = p.tablename
    join pg_namespace n on n.oid = c.relnamespace and n.nspname = p.schemaname
    where p.schemaname in ('public','private','storage')
  `);
  const privileges = await query(`
    select table_schema, table_name, grantee, privilege_type
    from information_schema.table_privileges
    where table_schema in ('public','private','storage')
      and grantee in ('public','anon','authenticated','service_role')
    order by table_schema, table_name, grantee, privilege_type
  `);
  const bucketRows = await query(`
    select to_jsonb(bucket_row) as row
    from (
      select *
      from storage.buckets
      order by id
    ) bucket_row
  `);
  const storageObjectCount = await query("select count(*)::bigint as count from storage.objects");
  const authUserCount = await query("select count(*)::bigint as count from auth.users");

  const functionRows = functions.rows.map((row) => {
    const key = functionKey(
      row.schema_name,
      row.proname,
      normalizeFunctionArguments(row.identity_arguments ?? ""),
    );
    return {
      key,
      nameKey: functionNameFromKey(key),
      result: normalizeSqlShape(row.function_result),
      language: lower(row.language_name),
      volatility: row.provolatile === "s" ? "stable" : (row.provolatile === "i" ? "immutable" : "volatile"),
      securityDefiner: row.prosecdef === true,
      searchPath: normalizeSearchPath(/search_path=([^\n]+)/i.exec(row.function_config ?? "")?.[1] ?? ""),
      bodyHash: sha256(normalizeSqlShape(row.prosrc)),
      ownerHash: sha256(row.function_owner),
      aclHash: sha256(row.function_acl),
    };
  });
  const triggerRows = triggers.rows.map((row) => ({
    event_object_schema: row.event_object_schema,
    event_object_table: row.event_object_table,
    trigger_name: row.trigger_name,
    action_timing: row.action_timing,
    event_manipulation: row.event_manipulation,
    actionHash: sha256(row.action_statement ?? ""),
  }));
  const indexRows = indexes.rows.map((row) => ({
    schema_name: row.schema_name,
    table_name: row.table_name,
    index_name: row.index_name,
    constraint_backed: row.constraint_backed,
    definitionHash: sha256(row.definition ?? ""),
  }));
  const constraintsRows = constraints.rows.map((row) => {
    const relation = String(row.relation_name).toLowerCase().split(".");
    const tableName = relation.length > 1 ? relation.slice(1).join(".") : relation[0];
    return {
      id: `${row.schema_name}.${tableName}.${row.conname}`,
      schemaName: row.schema_name,
      tableName,
      constraintName: row.conname,
      type: row.contype,
      validated: row.convalidated,
      definitionHash: sha256(row.definition ?? ""),
    };
  });
  const rawConstraintDefinitions = new Map(constraints.rows.map((row) => {
    const relation = String(row.relation_name).toLowerCase().split(".");
    const tableName = relation.length > 1 ? relation.slice(1).join(".") : relation[0];
    return [`${row.schema_name}.${tableName}.${row.conname}`, row.definition ?? ""];
  }));
  const policyRows = policies.rows.map((row) => ({
    schemaname: row.schemaname,
    tablename: row.tablename,
    policyname: row.policyname,
    cmd: row.cmd,
    roles: row.roles,
    usingHash: sha256(row.using_expression ?? ""),
    checkHash: sha256(row.check_expression ?? ""),
  }));
  return {
    functionRows,
    functionByKey: new Map(functionRows.map((row) => [row.key, row])),
    constraintsRows,
    constraintById: new Map(constraintsRows.map((row) => [row.id, row])),
    rawConstraintDefinitions,
    tablesAndViewsRows: tablesAndViews.rows,
    columnRows: columns.rows,
    triggerRows,
    indexRows,
    policyRows,
    privilegeRows: privileges.rows,
    bucketRows: bucketRows.rows.map((row) => row.row),
    schemaFingerprint: hashJson({
      tablesAndViews: sortedRows(tablesAndViews.rows),
      columns: sortedRows(columns.rows),
      functions: sortedRows(functionRows),
      triggers: sortedRows(triggerRows),
      indexes: sortedRows(indexRows),
      constraints: sortedRows(constraintsRows),
      rls: tablesAndViews.rows
        .filter((row) => (row.relkind === "r" || row.relkind === "p") && row.relrowsecurity)
        .map((row) => `${row.schema_name}.${row.object_name}`)
        .sort(),
      policies: sortedRows(policyRows),
      privileges: sortedRows(privileges.rows),
    }),
    authUserCount: Number(authUserCount.rows[0]?.count ?? 0),
    storageObjectCount: Number(storageObjectCount.rows[0]?.count ?? 0),
  };
}

function verifyPractice0049(live, expected) {
  const constraintIds = [
    "public.ai_provider_routing_policies.ai_provider_routing_policies_operation_kind_check",
    "private.ai_provider_runtime_states.ai_provider_runtime_states_operation_kind_check",
  ];
  let exactConstraintCount = 0;
  for (const id of constraintIds) {
    const row = live.constraintById.get(id);
    if (!row || row.validated !== true) continue;
    const definition = live.rawConstraintDefinitions?.get(id) ?? "";
    if (hashJson(operationKindsFromText(definition)) === expected.operationAllowlistHash) exactConstraintCount += 1;
  }

  let exactFunctionCount = 0;
  const functionFingerprints = [];
  for (const [key, source] of expected.functionsByKey.entries()) {
    const liveFunction = live.functionByKey.get(key);
    const fieldMatches = liveFunction ? {
      result: liveFunction.result === source.result,
      language: liveFunction.language === source.language,
      volatility: liveFunction.volatility === source.volatility,
      securityDefiner: liveFunction.securityDefiner === source.securityDefiner,
      searchPath: liveFunction.searchPath === source.searchPath,
      body: liveFunction.bodyHash === source.bodyHash,
    } : {};
    if (Object.values(fieldMatches).length === 6 && Object.values(fieldMatches).every(Boolean)) {
      exactFunctionCount += 1;
    }
    functionFingerprints.push(hashJson({
      key,
      result: source.result,
      language: source.language,
      volatility: source.volatility,
      securityDefiner: source.securityDefiner,
      searchPath: source.searchPath,
      bodyHash: source.bodyHash,
    }));
  }
  const exactMatchCount = exactConstraintCount + exactFunctionCount;
  return {
    expectedObjectCount: expected.expectedObjectCount,
    exactMatchCount,
    mismatchCount: expected.expectedObjectCount - exactMatchCount,
    constraintsExact: exactConstraintCount,
    functionsExact: exactFunctionCount,
    operationAllowlistHash: expected.operationAllowlistHash,
    sourceHash: expected.sourceHash,
    objectFingerprint: hashJson({
      operationAllowlistHash: expected.operationAllowlistHash,
      functionFingerprints: functionFingerprints.sort(),
    }),
    exact: exactMatchCount === expected.expectedObjectCount,
  };
}

async function collectBucket(query) {
  const bucketRows = await query(`
    select to_jsonb(bucket_row) as row
    from (
      select *
      from storage.buckets
      where id = 'ai-import-sources'
      order by id
    ) bucket_row
  `);
  const bucketConfig = await query(`
    select id, name, public, file_size_limit, allowed_mime_types::text as allowed_mime_types
    from storage.buckets
    where id = 'ai-import-sources'
    order by id
  `);
  const policies = await query(`
    select p.policyname, p.cmd, p.roles::text as roles,
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
    order by p.policyname
  `);
  const objectCount = Number((await query(
    "select count(*)::int as count from storage.objects where bucket_id = 'ai-import-sources'",
  )).rows[0]?.count ?? 0);
  const bucket = bucketConfig.rows[0] ?? null;
  const policyNames = policies.rows.map((policy) => policy.policyname).sort();
  const legacyPolicyCount = policyNames.filter((name) => legacySourcePolicyNames.includes(name)).length;
  const canonicalPolicyCount = policyNames.filter((name) => canonicalSourcePolicyNames.includes(name)).length;
  const unknownBucketTargetingPolicyCount = policies.rows.filter((policy) => ![
    ...legacySourcePolicyNames,
    ...canonicalSourcePolicyNames,
  ].includes(policy.policyname)).length;
  const publicGrantCount = policies.rows.filter((policy) => /\b(?:anon|public)\b/i.test(policy.roles)).length;
  const bucketRaw = bucketRows.rows[0]?.row ?? null;
  const identityForHash = bucketRaw ? Object.fromEntries(
    Object.entries(bucketRaw).filter(([key]) => ![
      "public",
      "file_size_limit",
      "allowed_mime_types",
      "updated_at",
    ].includes(key)),
  ) : null;
  const sizeLimit = bucket?.file_size_limit == null ? null : Number(bucket.file_size_limit);
  return {
    metadataHash: hashJson(sortedRows(bucketRows.rows.map((row) => row.row))),
    identityHash: hashJson(identityForHash ?? {}),
    policyHash: hashJson(sortedRows(policies.rows.map((row) => ({
      policyname: row.policyname,
      cmd: row.cmd,
      roles: row.roles,
      usingHash: sha256(row.using_expression ?? ""),
      checkHash: sha256(row.check_expression ?? ""),
    })))),
    exists: Boolean(bucket),
    identityOk: Boolean(bucket && bucket.id === "ai-import-sources" && bucket.name === "ai-import-sources"),
    private: Boolean(bucket && bucket.public === false),
    pdfOnly: Boolean(bucket && bucket.allowed_mime_types === "{application/pdf}"),
    sizeLimitBytes: sizeLimit,
    sizeLimitCompatiblePre: sizeLimit == null || sizeLimit > 0,
    sizeLimitHardenedPost: sizeLimit != null && sizeLimit > 0 && sizeLimit <= maxPdfBytes,
    objectCount,
    legacyPolicyCount,
    canonicalPolicyCount,
    unknownBucketTargetingPolicyCount,
    publicGrantCount,
  };
}

async function collectSchema0050(query) {
  const tableRows = await query(`
    select n.nspname, c.relname
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r','p')
      and c.relname in ('ai_pdf_upload_bursts', 'ai_pdf_upload_burst_items')
    order by c.relname
  `);
  const columnRows = await query(`
    select table_name, column_name
    from information_schema.columns
    where table_schema = 'public'
      and table_name in ('ai_pdf_upload_bursts', 'ai_pdf_upload_burst_items')
    order by table_name, ordinal_position
  `);
  const functionRows = await query(`
    select n.nspname as schema_name, p.proname,
           pg_get_function_identity_arguments(p.oid) as args,
           p.prosrc
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
    order by schema_name, proname, args
  `);
  const triggerRows = await query(`
    select distinct event_object_schema, event_object_table, trigger_name
    from information_schema.triggers
    where trigger_name in (
      'ai_pdf_upload_bursts_set_updated_at',
      'ai_pdf_upload_burst_items_set_updated_at',
      'ai_pdf_upload_bursts_protect_identity',
      'ai_pdf_upload_burst_items_protect_identity',
      'ai_pdf_upload_burst_items_refresh_parent',
      'ai_provider_jobs_sync_pdf_burst_item'
    )
    order by trigger_name
  `);
  const indexRows = await query(`
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
  const rlsRows = await query(`
    select c.relname
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in ('ai_pdf_upload_bursts', 'ai_pdf_upload_burst_items')
      and c.relrowsecurity
    order by c.relname
  `);
  const policyRows = await query(`
    select schemaname, tablename, policyname
    from pg_policies
    where (schemaname = 'public' and tablename in ('ai_pdf_upload_bursts', 'ai_pdf_upload_burst_items'))
       or (schemaname = 'storage' and tablename = 'objects' and policyname like 'ai_import_sources_%')
    order by schemaname, tablename, policyname
  `);
  const constraints = await query(`
    select conname, contype, pg_get_constraintdef(oid) as definition
    from pg_constraint
    where conrelid in (
      select c.oid
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname in ('ai_pdf_upload_bursts', 'ai_pdf_upload_burst_items')
    )
    order by conname
  `);
  let burstTableRows = 0;
  let itemTableRows = 0;
  if (tableRows.rows.length === 2) {
    const tableCounts = await query(`
      select
        (select count(*)::int from public.ai_pdf_upload_bursts) as burst_rows,
        (select count(*)::int from public.ai_pdf_upload_burst_items) as item_rows
    `);
    burstTableRows = Number(tableCounts.rows[0]?.burst_rows ?? 0);
    itemTableRows = Number(tableCounts.rows[0]?.item_rows ?? 0);
  }
  const functionText = functionRows.rows.map((row) => row.prosrc ?? "").join("\n");
  const publicPolicyCount = policyRows.rows.filter((row) => row.schemaname === "public").length;
  const canonicalStoragePolicyCount = policyRows.rows
    .filter((row) => row.schemaname === "storage" && canonicalSourcePolicyNames.includes(row.policyname)).length;
  const legacyStoragePolicyCount = policyRows.rows
    .filter((row) => row.schemaname === "storage" && legacySourcePolicyNames.includes(row.policyname)).length;
  const definitions = constraints.rows.map((row) => row.definition ?? "").join("\n");
  return {
    hash: hashJson({
      tables: sortedRows(tableRows.rows),
      columns: sortedRows(columnRows.rows),
      functions: sortedRows(functionRows.rows.map((row) => ({
        schema_name: row.schema_name,
        proname: row.proname,
        args: row.args,
        bodyHash: sha256(row.prosrc ?? ""),
      }))),
      triggers: sortedRows(triggerRows.rows),
      indexes: sortedRows(indexRows.rows),
      rls: sortedRows(rlsRows.rows),
      policies: sortedRows(policyRows.rows),
      constraints: sortedRows(constraints.rows.map((row) => ({
        conname: row.conname,
        contype: row.contype,
        definitionHash: sha256(row.definition ?? ""),
      }))),
    }),
    tableCount: tableRows.rows.length,
    columnCount: columnRows.rows.length,
    functionCount: functionRows.rows.length,
    triggerCount: triggerRows.rows.length,
    indexCount: indexRows.rows.length,
    rlsCount: rlsRows.rows.length,
    policyCount: policyRows.rows.length,
    publicPolicyCount,
    canonicalStoragePolicyCount,
    legacyStoragePolicyCount,
    uniqueImportBatchConstraint: /UNIQUE \(import_batch_id\)/i.test(definitions),
    uniqueSourceAssetConstraint: /UNIQUE \(source_asset_id\)/i.test(definitions),
    uniqueJobConstraint: /UNIQUE \(ai_provider_job_id\)/i.test(definitions),
    uniqueBurstRequestConstraint: /UNIQUE \(created_by, client_request_key\)/i.test(definitions),
    sourceImportJobLinkage: /FOREIGN KEY \(import_batch_id\) REFERENCES import_batches\(id\)/i.test(definitions) &&
      /FOREIGN KEY \(source_asset_id\) REFERENCES import_batch_assets\(id\)/i.test(definitions) &&
      /FOREIGN KEY \(ai_provider_job_id\) REFERENCES ai_provider_jobs\(id\)/i.test(definitions),
    admissionPumpFunctions: functionRows.rows.some((row) => row.proname === "reserve_ai_pdf_upload_burst") &&
      functionRows.rows.some((row) => row.proname === "release_ai_pdf_burst_admission_jobs") &&
      functionRows.rows.some((row) => row.proname === "cancel_ai_pdf_upload_burst_items"),
    noAutoPublishBehavior: !/publish_review_draft|publish.*review_draft/i.test(functionText),
    noAssignmentCreationBehavior: !/insert\s+into\s+(?:public\.)?assignments\b|create\s+trigger[\s\S]+assignment/i.test(functionText),
    burstTableRows,
    itemTableRows,
  };
}

async function collectApplicationDataFingerprint(query) {
  const tables = await query(`
    select table_schema, table_name
    from information_schema.tables
    where table_schema in ('public', 'private')
      and table_type = 'BASE TABLE'
      and not (table_schema = 'public' and table_name in ('ai_pdf_upload_bursts', 'ai_pdf_upload_burst_items'))
    order by table_schema, table_name
  `);
  const counts = [];
  for (const row of tables.rows) {
    const count = await query(
      `select count(*)::bigint as count from ${quoteIdentifier(row.table_schema)}.${quoteIdentifier(row.table_name)}`,
    );
    counts.push({
      table: `${row.table_schema}.${row.table_name}`,
      count: String(count.rows[0]?.count ?? "0"),
    });
  }
  return {
    hash: hashJson(counts),
    tableCount: counts.length,
  };
}

async function collectStorageObjectsFingerprint(query) {
  const rows = await query(`
    select to_jsonb(object_row) as row
    from (
      select *
      from storage.objects
      order by bucket_id, name, id
    ) object_row
  `);
  return {
    hash: hashJson(sortedRows(rows.rows.map((row) => row.row))),
    count: rows.rows.length,
  };
}

async function collectStatus(client, plan, practiceExpected, finalClassification) {
  const query = makeReadQuery(client, finalClassification);
  const tableInfo = await inspectHistoryTable(query, finalClassification);
  const history = await collectHistory(query, tableInfo, plan);
  const live = await collectLive(query);
  const practice0049 = verifyPractice0049(live, practiceExpected);
  const bucket = await collectBucket(query);
  const schema0050 = await collectSchema0050(query);
  const applicationData = await collectApplicationDataFingerprint(query);
  const storageObjects = await collectStorageObjectsFingerprint(query);
  return {
    tableInfo,
    history,
    practice0049,
    bucket,
    schema0050,
    fingerprints: {
      migrationHistory: history.historyFingerprint,
      schema: live.schemaFingerprint,
      applicationData: applicationData.hash,
      applicationTableCount: applicationData.tableCount,
      authUserCount: live.authUserCount,
      storageObjectCount: live.storageObjectCount,
      storageObjects: storageObjects.hash,
      bucketMetadata: bucket.metadataHash,
      bucketIdentity: bucket.identityHash,
      bucketPolicies: bucket.policyHash,
      unmappedRows: history.unmappedRowsFingerprint,
    },
  };
}

function assertReconciledPreApply(status, finalClassification = "HOSTED_0050_BASELINE_CHANGED_ABORTED") {
  assert(
    status.history.totalRows === 51 &&
      status.history.canonicalUniqueCount === 49 &&
      status.history.canonicalThrough0049Count === 49 &&
      status.history.history0050Absent &&
      status.history.unmappedRowsPreserved &&
      status.history.unmappedCount === 2 &&
      status.history.ambiguousCount === 0 &&
      status.history.duplicateCanonicalNumbers.length === 0 &&
      status.history.pendingCanonicalMigrationCount === 1 &&
      status.history.nextPendingCanonicalMigration === pdf500050Migration,
    finalClassification,
    "hosted_preapply_history_baseline_changed",
  );
  assert(status.practice0049.exact, finalClassification, "practice_0049_semantic_equivalence_changed");
  assert(
    status.schema0050.tableCount === 0 &&
      status.schema0050.functionCount === 0 &&
      status.schema0050.triggerCount === 0 &&
      status.schema0050.indexCount === 0 &&
      status.schema0050.rlsCount === 0 &&
      status.schema0050.publicPolicyCount === 0 &&
      status.schema0050.canonicalStoragePolicyCount === 0,
    finalClassification,
    "pdf50_schema_or_canonical_policy_partially_present",
  );
  assert(
    status.bucket.exists &&
      status.bucket.identityOk &&
      status.bucket.private &&
      status.bucket.pdfOnly &&
      status.bucket.sizeLimitCompatiblePre &&
      status.bucket.legacyPolicyCount === 3 &&
      status.bucket.canonicalPolicyCount === 0 &&
      status.bucket.unknownBucketTargetingPolicyCount === 0 &&
      status.bucket.publicGrantCount === 0,
    finalClassification,
    "source_bucket_preapply_contract_changed",
  );
  assert(
    status.fingerprints.authUserCount === expectedAuthUsers &&
      status.fingerprints.storageObjectCount === expectedStorageObjects,
    finalClassification,
    "hosted_preapply_data_counts_changed",
  );
}

function assertPostApplyValid(status, finalClassification = "HOSTED_0050_POST_APPLY_VALIDATION_FAILED") {
  assert(
    status.history.totalRows === 52 &&
      status.history.canonicalUniqueCount === 50 &&
      status.history.canonicalThrough0050Count === 50 &&
      status.history.history0050RecordedOnce &&
      status.history.unmappedRowsPreserved &&
      status.history.unmappedCount === 2 &&
      status.history.ambiguousCount === 0 &&
      status.history.duplicateCanonicalNumbers.length === 0 &&
      status.history.pendingCanonicalMigrationCount === 0,
    finalClassification,
    "postapply_history_contract_failed",
  );
  assert(status.practice0049.exact, finalClassification, "practice_0049_postapply_equivalence_changed");
  assert(
    status.schema0050.tableCount === 2 &&
      status.schema0050.columnCount === 44 &&
      status.schema0050.functionCount === 13 &&
      status.schema0050.triggerCount === 6 &&
      status.schema0050.indexCount === 4 &&
      status.schema0050.rlsCount === 2 &&
      status.schema0050.policyCount === 5 &&
      status.schema0050.publicPolicyCount === 2 &&
      status.schema0050.canonicalStoragePolicyCount === 3 &&
      status.schema0050.legacyStoragePolicyCount === 0 &&
      status.schema0050.uniqueImportBatchConstraint &&
      status.schema0050.uniqueSourceAssetConstraint &&
      status.schema0050.uniqueJobConstraint &&
      status.schema0050.uniqueBurstRequestConstraint &&
      status.schema0050.sourceImportJobLinkage &&
      status.schema0050.admissionPumpFunctions &&
      status.schema0050.noAutoPublishBehavior &&
      status.schema0050.noAssignmentCreationBehavior &&
      status.schema0050.burstTableRows === 0 &&
      status.schema0050.itemTableRows === 0,
    finalClassification,
    "pdf50_schema_contract_failed",
  );
  assert(
    status.bucket.exists &&
      status.bucket.identityOk &&
      status.bucket.private &&
      status.bucket.pdfOnly &&
      status.bucket.sizeLimitHardenedPost &&
      status.bucket.objectCount <= expectedStorageObjects &&
      status.bucket.legacyPolicyCount === 0 &&
      status.bucket.canonicalPolicyCount === 3 &&
      status.bucket.unknownBucketTargetingPolicyCount === 0 &&
      status.bucket.publicGrantCount === 0,
    finalClassification,
    "source_bucket_postapply_contract_failed",
  );
  assert(
    status.fingerprints.authUserCount === expectedAuthUsers &&
      status.fingerprints.storageObjectCount === expectedStorageObjects,
    finalClassification,
    "postapply_data_counts_changed",
  );
}

function assertPreservedAcrossApply(before, after, finalClassification) {
  assert(
    before.fingerprints.applicationData === after.fingerprints.applicationData &&
      before.fingerprints.applicationTableCount === after.fingerprints.applicationTableCount &&
      before.fingerprints.authUserCount === after.fingerprints.authUserCount &&
      before.fingerprints.storageObjectCount === after.fingerprints.storageObjectCount &&
      before.fingerprints.storageObjects === after.fingerprints.storageObjects &&
      before.fingerprints.bucketIdentity === after.fingerprints.bucketIdentity &&
      before.fingerprints.unmappedRows === after.fingerprints.unmappedRows,
    finalClassification,
    "non_migration_state_changed",
  );
  const preLimit = before.bucket.sizeLimitBytes;
  const postLimit = after.bucket.sizeLimitBytes;
  const sizeLimitTransitionOk = preLimit == null || preLimit > maxPdfBytes
    ? postLimit === maxPdfBytes
    : postLimit === preLimit;
  assert(sizeLimitTransitionOk, finalClassification, "bucket_size_limit_transition_unexpected");
}

function buildHistoryInsert(tableInfo) {
  const columns = ["version"];
  const values = ["$1"];
  if (tableInfo.hasStatements) {
    columns.push("statements");
    values.push("$2");
  }
  if (tableInfo.hasName) {
    columns.push("name");
    values.push(`$${values.length + 1}`);
  }
  return `insert into supabase_migrations.schema_migrations(${columns.map(quoteIdentifier).join(", ")}) values (${values.join(", ")}) on conflict (version) do nothing`;
}

async function insertHistoryRecord(client, tableInfo) {
  const sql = buildHistoryInsert(tableInfo);
  assert(
    /^insert into supabase_migrations\.schema_migrations\("version"(?:, "statements")?(?:, "name")?\) values \(\$1(?:, \$2)?(?:, \$3)?\) on conflict \(version\) do nothing$/i.test(sql),
    "HOSTED_0050_APPLY_FAILED_AND_ROLLED_BACK",
    "history_insert_sql_not_allowlisted",
  );
  const params = ["0050"];
  if (tableInfo.hasStatements) params.push([]);
  if (tableInfo.hasName) params.push(pdf500050Migration);
  const result = await client.query(sql, params);
  assert(result.rowCount === 1, "HOSTED_0050_APPLY_FAILED_AND_ROLLED_BACK", "history_0050_insert_count_mismatch");
  return result.rowCount;
}

async function runReadOnlyPhase(client, mode, context) {
  let began = false;
  try {
    await transactionCommand(client, "BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY", "HOSTED_0050_BASELINE_CHANGED_ABORTED");
    began = true;
    const query = makeReadQuery(client);
    const txReadOnly = await query("show transaction_read_only");
    const txIsolation = await query("show transaction_isolation");
    assert(
      txReadOnly.rows[0]?.transaction_read_only === "on" &&
        txIsolation.rows[0]?.transaction_isolation === "repeatable read",
      "HOSTED_0050_BASELINE_CHANGED_ABORTED",
      "read_only_transaction_proof_failed",
    );
    const status = await collectStatus(client, context.plan, context.practiceExpected, "HOSTED_0050_BASELINE_CHANGED_ABORTED");
    if (mode === "preflight") assertReconciledPreApply(status);
    else assertPostApplyValid(status);
    await transactionCommand(client, "ROLLBACK", "HOSTED_0050_BASELINE_CHANGED_ABORTED");
    began = false;
    return {
      finalClassification: mode === "preflight"
        ? "HOSTED_0050_PREFLIGHT_READY"
        : "HOSTED_PDF50_0050_APPLIED_AND_SCHEMA_VALIDATED",
      phase: mode,
      authorization: context.authorization,
      gitState: context.gitState,
      source: context.source,
      history: {
        canonicalCount: status.history.canonicalUniqueCount,
        totalRows: status.history.totalRows,
        history0050Absent: status.history.history0050Absent,
        history0050RecordedOnce: status.history.history0050RecordedOnce,
        pendingCanonicalMigrationCount: status.history.pendingCanonicalMigrationCount,
        nextPendingCanonicalMigration: status.history.nextPendingCanonicalMigration,
        unmappedRowsPreserved: status.history.unmappedRowsPreserved,
      },
      practice0049: {
        exact: status.practice0049.exact,
        exactMatchCount: status.practice0049.exactMatchCount,
        expectedObjectCount: status.practice0049.expectedObjectCount,
      },
      pdf50: {
        tableCount: status.schema0050.tableCount,
        columnCount: status.schema0050.columnCount,
        functionCount: status.schema0050.functionCount,
        triggerCount: status.schema0050.triggerCount,
        indexCount: status.schema0050.indexCount,
        rlsCount: status.schema0050.rlsCount,
        policyCount: status.schema0050.policyCount,
      },
      bucket: {
        exists: status.bucket.exists,
        identityOk: status.bucket.identityOk,
        private: status.bucket.private,
        pdfOnly: status.bucket.pdfOnly,
        sizeLimitBytes: status.bucket.sizeLimitBytes,
        objectCount: status.bucket.objectCount,
        legacyPolicyCount: status.bucket.legacyPolicyCount,
        canonicalPolicyCount: status.bucket.canonicalPolicyCount,
        unknownBucketTargetingPolicyCount: status.bucket.unknownBucketTargetingPolicyCount,
        publicGrantCount: status.bucket.publicGrantCount,
      },
      fingerprints: status.fingerprints,
      transaction: {
        began: true,
        readOnly: true,
        committed: false,
        rolledBack: true,
      },
      hostedWrites: {
        migrationSqlFiles: 0,
        migrationHistory: 0,
        auth: 0,
        storageObjects: 0,
      },
      providerCalls: 0,
    };
  } catch (error) {
    if (began) await transactionCommand(client, "ROLLBACK", "HOSTED_0050_BASELINE_CHANGED_ABORTED").catch(() => {});
    throw error;
  }
}

async function runApply(client, context, secondRunOnly = false) {
  let began = false;
  try {
    await transactionCommand(client, "BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ", "HOSTED_0050_APPLY_FAILED_AND_ROLLED_BACK");
    began = true;
    const query = makeReadQuery(client, "HOSTED_0050_APPLY_FAILED_AND_ROLLED_BACK");
    const txReadOnly = await query("show transaction_read_only");
    const txIsolation = await query("show transaction_isolation");
    assert(
      txReadOnly.rows[0]?.transaction_read_only === "off" &&
        txIsolation.rows[0]?.transaction_isolation === "repeatable read",
      "HOSTED_0050_APPLY_FAILED_AND_ROLLED_BACK",
      "write_transaction_proof_failed",
    );
    const before = await collectStatus(client, context.plan, context.practiceExpected, "HOSTED_0050_APPLY_FAILED_AND_ROLLED_BACK");
    const alreadyApplied = before.history.pendingCanonicalMigrationCount === 0 && before.history.history0050RecordedOnce;
    let migrationSqlFilesExecuted = 0;
    let migrationHistoryRowsInserted = 0;
    if (alreadyApplied) {
      assertPostApplyValid(before, "HOSTED_0050_POST_APPLY_VALIDATION_FAILED");
      assert(secondRunOnly, "HOSTED_0050_BASELINE_CHANGED_ABORTED", "0050_already_recorded_before_apply");
    } else {
      assert(!secondRunOnly, "HOSTED_0050_BASELINE_CHANGED_ABORTED", "second_runner_found_pending_migration");
      assertReconciledPreApply(before, "HOSTED_0050_BASELINE_CHANGED_ABORTED");
      const pendingOnly0050 = before.history.pendingCanonicalMigrationCount === 1 &&
        before.history.nextPendingCanonicalMigration === pdf500050Migration;
      assert(pendingOnly0050, "HOSTED_0050_BASELINE_CHANGED_ABORTED", "pending_migration_not_exactly_0050");

      const allowedMigrationPath = resolve(root, "supabase/clean-migrations", pdf500050Migration);
      const candidateMigrationPath = resolve(context.plan.cleanDirectory, pdf500050Migration);
      assert(
        candidateMigrationPath === allowedMigrationPath,
        "HOSTED_0050_BASELINE_CHANGED_ABORTED",
        "migration_sql_path_not_allowlisted",
      );
      const migrationSql = await readFile(candidateMigrationPath, "utf8");
      await client.query(migrationSql);
      migrationSqlFilesExecuted = 1;
      migrationHistoryRowsInserted = await insertHistoryRecord(client, before.tableInfo);
    }

    const after = await collectStatus(client, context.plan, context.practiceExpected, "HOSTED_0050_POST_APPLY_VALIDATION_FAILED");
    assertPostApplyValid(after, "HOSTED_0050_POST_APPLY_VALIDATION_FAILED");
    assertPreservedAcrossApply(before, after, "HOSTED_0050_POST_APPLY_VALIDATION_FAILED");
    if (alreadyApplied) {
      assert(
        before.fingerprints.migrationHistory === after.fingerprints.migrationHistory &&
          before.fingerprints.schema === after.fingerprints.schema &&
          before.fingerprints.bucketMetadata === after.fingerprints.bucketMetadata &&
          before.fingerprints.bucketPolicies === after.fingerprints.bucketPolicies,
        "HOSTED_0050_POST_APPLY_VALIDATION_FAILED",
        "second_runner_state_changed",
      );
    } else {
      assert(
        before.history.totalRows + 1 === after.history.totalRows &&
          before.history.canonicalUniqueCount + 1 === after.history.canonicalUniqueCount,
        "HOSTED_0050_POST_APPLY_VALIDATION_FAILED",
        "history_delta_not_exactly_0050",
      );
    }

    await transactionCommand(client, "COMMIT", "HOSTED_0050_APPLY_FAILED_AND_ROLLED_BACK");
    began = false;
    return {
      finalClassification: "HOSTED_PDF50_0050_APPLIED_AND_SCHEMA_VALIDATED",
      phase: alreadyApplied ? "second-run-no-op" : "apply",
      authorization: context.authorization,
      gitState: context.gitState,
      source: context.source,
      preApplyHistory: {
        canonicalCount: before.history.canonicalUniqueCount,
        totalRows: before.history.totalRows,
        pendingCanonicalMigrationCount: before.history.pendingCanonicalMigrationCount,
        nextPendingCanonicalMigration: before.history.nextPendingCanonicalMigration,
        history0050Absent: before.history.history0050Absent,
      },
      migration: {
        executed: migrationSqlFilesExecuted === 1 ? pdf500050Migration : "none",
        migrationSqlFilesExecuted,
        historyRowsInserted: migrationHistoryRowsInserted,
        alreadyAppliedBeforeThisRun: alreadyApplied,
      },
      finalHistory: {
        canonicalCount: after.history.canonicalUniqueCount,
        totalRows: after.history.totalRows,
        history0050RecordedOnce: after.history.history0050RecordedOnce,
        pendingCanonicalMigrationCount: after.history.pendingCanonicalMigrationCount,
        unmappedRowsPreserved: after.history.unmappedRowsPreserved,
      },
      pdf50: {
        tableCount: after.schema0050.tableCount,
        columnCount: after.schema0050.columnCount,
        functionCount: after.schema0050.functionCount,
        triggerCount: after.schema0050.triggerCount,
        indexCount: after.schema0050.indexCount,
        rlsCount: after.schema0050.rlsCount,
        policyCount: after.schema0050.policyCount,
        uniqueAndLinkageOk: after.schema0050.uniqueImportBatchConstraint &&
          after.schema0050.uniqueSourceAssetConstraint &&
          after.schema0050.uniqueJobConstraint &&
          after.schema0050.uniqueBurstRequestConstraint &&
          after.schema0050.sourceImportJobLinkage,
        admissionPumpFunctions: after.schema0050.admissionPumpFunctions,
        noAutoPublishBehavior: after.schema0050.noAutoPublishBehavior,
        noAssignmentCreationBehavior: after.schema0050.noAssignmentCreationBehavior,
        burstRows: after.schema0050.burstTableRows,
        itemRows: after.schema0050.itemTableRows,
      },
      bucket: {
        identityUnchanged: before.fingerprints.bucketIdentity === after.fingerprints.bucketIdentity,
        private: after.bucket.private,
        pdfOnly: after.bucket.pdfOnly,
        sizeLimitBytes: after.bucket.sizeLimitBytes,
        storageObjectCountBefore: before.fingerprints.storageObjectCount,
        storageObjectCountAfter: after.fingerprints.storageObjectCount,
        sourceBucketObjectCount: after.bucket.objectCount,
        legacyPolicyCountBefore: before.bucket.legacyPolicyCount,
        legacyPolicyCountAfter: after.bucket.legacyPolicyCount,
        canonicalPolicyCountBefore: before.bucket.canonicalPolicyCount,
        canonicalPolicyCountAfter: after.bucket.canonicalPolicyCount,
        unknownBucketTargetingPolicyCount: after.bucket.unknownBucketTargetingPolicyCount,
        publicGrantCount: after.bucket.publicGrantCount,
      },
      fingerprints: {
        before: before.fingerprints,
        after: after.fingerprints,
        applicationDataUnchanged: before.fingerprints.applicationData === after.fingerprints.applicationData,
        authUserCountUnchanged: before.fingerprints.authUserCount === after.fingerprints.authUserCount,
        storageObjectCountUnchanged: before.fingerprints.storageObjectCount === after.fingerprints.storageObjectCount,
        storageObjectsUnchanged: before.fingerprints.storageObjects === after.fingerprints.storageObjects,
        bucketIdentityUnchanged: before.fingerprints.bucketIdentity === after.fingerprints.bucketIdentity,
        unmappedRowsUnchanged: before.fingerprints.unmappedRows === after.fingerprints.unmappedRows,
      },
      transaction: {
        began: true,
        readOnly: false,
        committed: true,
        rolledBack: false,
      },
      hostedWrites: {
        migrationSqlFiles: migrationSqlFilesExecuted,
        migrationHistory: migrationHistoryRowsInserted,
        auth: 0,
        storageObjects: 0,
      },
      providerCalls: 0,
    };
  } catch (error) {
    if (began) await transactionCommand(client, "ROLLBACK", "HOSTED_0050_APPLY_FAILED_AND_ROLLED_BACK").catch(() => {});
    if (error instanceof SafeAbort) throw error;
    abort("HOSTED_0050_APPLY_FAILED_AND_ROLLED_BACK", "apply_transaction_failed");
  }
}

async function main() {
  const mode = modeFromArgs();
  const authorization = validateProcessAuthorization();
  const gitState = validateGitAndSourceState();
  const plan = await loadCanonicalMigrationPlan({ root });
  const source = validateCanonicalPlan(plan);
  const practiceSql = await readFile(resolve(plan.cleanDirectory, practice0049Migration), "utf8");
  const practiceExpected = buildPractice0049Expectation(practiceSql);
  const client = new Client({
    connectionString: process.env[databaseEnvName],
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000,
    query_timeout: 120000,
  });

  let result;
  let connectionClosed = "NOT_ATTEMPTED";
  await client.connect();
  try {
    await client.query("set statement_timeout = '120s'");
    await client.query("set lock_timeout = '15s'");
    const context = { authorization, gitState, plan, source, practiceExpected };
    if (mode === "preflight") result = await runReadOnlyPhase(client, "preflight", context);
    else if (mode === "postapply") result = await runReadOnlyPhase(client, "postapply", context);
    else result = await runApply(client, context, mode === "second-run");
  } finally {
    try {
      await client.end();
      connectionClosed = "PASS";
    } catch {
      connectionClosed = "FAIL";
    }
  }
  console.log(JSON.stringify({
    ...result,
    connectionClosed,
  }, null, 2));
  if (connectionClosed !== "PASS") process.exitCode = 2;
}

main().catch((error) => {
  const finalClassification = error instanceof SafeAbort
    ? error.finalClassification
    : "HOSTED_0050_APPLY_FAILED_AND_ROLLED_BACK";
  const blockCode = error instanceof SafeAbort
    ? error.blockCode
    : "unexpected_safe_failure";
  assert(finalClassifications.has(finalClassification), "BLOCKED_BY_HOSTED_0050_GATE", "invalid_final_classification");
  console.log(JSON.stringify({
    finalClassification,
    blockCode,
    safeErrorType: safeErrorType(error),
    hostedWrites: {
      migrationSqlFiles: 0,
      migrationHistory: 0,
      auth: 0,
      storageObjects: 0,
    },
    providerCalls: 0,
  }, null, 2));
  process.exit(2);
});
