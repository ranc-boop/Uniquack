import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

import pg from "pg";

import {
  loadCanonicalMigrationPlan,
  migrationNumber,
} from "./lib/canonical-migration-plan.mjs";

const { Client } = pg;
const root = resolve(import.meta.dirname, "..");
const requiredBranch = "codex/pdf50-hosted-clean-maintenance";
const requiredSourceHead = "1a848a2189942b000d22aeb86609978e60d582ba";
const expectedFinalClassification = "HOSTED_CLEAN_HISTORY_RECONCILED_THROUGH_0049";
const allowedEnvNames = new Set([
  "PDF50_HOSTED_CLEAN_READONLY_GATE",
  "PDF50_HOSTED_CLEAN_WRITE_GATE",
  "PDF50_HOSTED_HISTORY_REPAIR_ONLY",
  "PDF50_HOSTED_CLEAN_DATABASE_URL",
  "PDF50_HOSTED_CLEAN_EXPECTED_PROJECT_REF",
  "PDF50_HOSTED_CLEAN_PROJECT_ALIAS",
  "PDF50_LEGACY_FORBIDDEN_PROJECT_REF",
]);
const requiredGates = {
  PDF50_HOSTED_CLEAN_READONLY_GATE: "CONFIRMED",
  PDF50_HOSTED_CLEAN_WRITE_GATE: "CONFIRMED",
  PDF50_HOSTED_HISTORY_REPAIR_ONLY: "AUTHORIZED_0020_THROUGH_0049",
};
const databaseEnvName = "PDF50_HOSTED_CLEAN_DATABASE_URL";
const expectedProjectRefEnvName = "PDF50_HOSTED_CLEAN_EXPECTED_PROJECT_REF";
const projectAliasEnvName = "PDF50_HOSTED_CLEAN_PROJECT_ALIAS";
const forbiddenProjectRefEnvName = "PDF50_LEGACY_FORBIDDEN_PROJECT_REF";
const guardedEnvPattern =
  /^(PDF50_|SUPABASE|DATABASE_URL|DIRECT_URL|POSTGRES|PG|NEXT_PUBLIC_SUPABASE|SUPABASE_)/;
const canonicalRepairStart = 20;
const canonicalRepairEnd = 49;
const canonicalFinalHead = "0049";
const canonicalNextPending = "0050_pdf50_burst_upload_admission.sql";
const blockedGoogleMigration = "0032_google_account_links.sql";
const practice0049Migration = "0049_practice_agent_provider_routing.sql";
const pdf500050Migration = "0050_pdf50_burst_upload_admission.sql";
const expectedUnmappedLegacyNames = [
  "fix_private_schema_function_grants_for_rls",
  "fix_taxonomy_closure_rebuild_safe_delete",
];
const sourceGuardPaths = [
  "supabase/clean-migrations",
  "docs/security/live-schema-manifest.json",
  "scripts/lib/canonical-migration-plan.mjs",
];
const categories = [
  "tables",
  "columns",
  "views",
  "functions",
  "triggers",
  "indexes",
  "constraints",
  "rls",
  "policies",
  "buckets",
];
const removableCategories = [
  "views",
  "functions",
  "triggers",
  "indexes",
  "constraints",
  "policies",
];
const expectedPracticeOperations = [
  "ai_pdf_extract",
  "blueprint_analyze_text",
  "blueprint_generate_questions",
  "blueprint_observe_pdf",
  "practice_generation",
];

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
  if (process.argv.includes("--postwrite")) return "postwrite";
  if (process.argv.includes("--status")) return "status";
  return "repair";
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

function sorted(values) {
  return [...values].sort();
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

function emptySets() {
  return Object.fromEntries(categories.map((category) => [category, new Set()]));
}

function emptyDrops() {
  return Object.fromEntries(removableCategories.map((category) => [category, new Set()]));
}

function add(set, value) {
  if (value) set.add(lower(value));
}

function cloneState(state) {
  return Object.fromEntries(
    Object.entries(state).map(([key, value]) => [key, new Set(value)]),
  );
}

function applyEffect(state, effect) {
  for (const category of removableCategories) {
    for (const id of effect.drops[category]) state[category].delete(id);
  }
  for (const category of categories) {
    for (const id of effect.adds[category]) state[category].add(id);
  }
}

function stripSqlComments(sql) {
  return sql.replace(/--.*$/gm, " ");
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

function countByCategory(items) {
  const counts = Object.fromEntries(categories.map((category) => [category, 0]));
  for (const item of items) counts[item.category] = (counts[item.category] || 0) + 1;
  return counts;
}

function quoteIdentifier(identifier) {
  return `"${String(identifier).replaceAll('"', '""')}"`;
}

function canonicalRange(start, end) {
  const values = [];
  for (let number = start; number <= end; number += 1) values.push(pad(number));
  return values;
}

function safeMigrationLabel(filename) {
  return filename.replace(/^\d{14}_/, "").replace(/\.sql$/i, "");
}

function parseMigration(sql) {
  const text = stripSqlComments(sql);
  const adds = emptySets();
  const drops = emptyDrops();

  const tablePattern = /create\s+table\s+(?:if\s+not\s+exists\s+)?(public|private|storage)\.([a-z_]\w*)\s*\(/gi;
  for (const match of text.matchAll(tablePattern)) {
    const schema = lower(match[1]);
    const table = lower(match[2]);
    add(adds.tables, `${schema}.${table}`);
    const openIndex = match.index + match[0].lastIndexOf("(");
    const closeIndex = findMatchingParen(text, openIndex);
    if (closeIndex <= openIndex) continue;
    const body = text.slice(openIndex + 1, closeIndex);
    for (const rawPart of splitTopLevelComma(body)) {
      const part = rawPart.trim().replace(/,$/, "");
      if (!part) continue;
      const namedConstraint = /^constraint\s+([a-z_]\w*)/i.exec(part);
      if (namedConstraint) {
        add(adds.constraints, `${schema}.${table}.${namedConstraint[1]}`);
        continue;
      }
      if (/^(primary|unique|foreign|check|exclude)\b/i.test(part)) continue;
      const column = /^"?([a-z_]\w*)"?\s+/i.exec(part);
      if (column) add(adds.columns, `${schema}.${table}.${column[1]}`);
    }
  }

  for (const match of text.matchAll(/alter\s+table\s+(?:if\s+exists\s+)?(public|private|storage)\.([a-z_]\w*)\s+([\s\S]*?);/gi)) {
    const schema = lower(match[1]);
    const table = lower(match[2]);
    const body = match[3];
    add(adds.tables, `${schema}.${table}`);
    if (/enable\s+row\s+level\s+security/i.test(body)) add(adds.rls, `${schema}.${table}`);
    for (const column of body.matchAll(/add\s+column\s+(?:if\s+not\s+exists\s+)?"?([a-z_]\w*)"?/gi)) {
      add(adds.columns, `${schema}.${table}.${column[1]}`);
    }
    for (const constraint of body.matchAll(/add\s+constraint\s+([a-z_]\w*)/gi)) {
      add(adds.constraints, `${schema}.${table}.${constraint[1]}`);
    }
    for (const constraint of body.matchAll(/drop\s+constraint\s+(?:if\s+exists\s+)?([a-z_]\w*)/gi)) {
      add(drops.constraints, `${schema}.${table}.${constraint[1]}`);
    }
  }

  for (const match of text.matchAll(/create\s+(?:or\s+replace\s+)?view\s+(public|private|storage)\.([a-z_]\w*)/gi)) {
    add(adds.views, `${match[1]}.${match[2]}`);
  }
  for (const match of text.matchAll(/drop\s+view\s+(?:if\s+exists\s+)?(public|private|storage)\.([a-z_]\w*)/gi)) {
    add(drops.views, `${match[1]}.${match[2]}`);
  }

  for (const match of text.matchAll(/create\s+(?:or\s+replace\s+)?function\s+(public|private)\.([a-z_]\w*)\s*\(/gi)) {
    const openIndex = match.index + match[0].lastIndexOf("(");
    const closeIndex = findMatchingParen(text, openIndex);
    const args = closeIndex > openIndex ? normalizeFunctionArguments(text.slice(openIndex + 1, closeIndex)) : "";
    add(adds.functions, functionKey(match[1], match[2], args));
  }
  for (const match of text.matchAll(/drop\s+function\s+(?:if\s+exists\s+)?(public|private)\.([a-z_]\w*)\s*\(([^)]*)\)?/gi)) {
    add(drops.functions, functionKey(match[1], match[2], normalizeFunctionArguments(match[3] ?? "")));
  }

  for (const match of text.matchAll(/create\s+trigger\s+([a-z_]\w*)[\s\S]*?\s+on\s+(public|private|storage)\.([a-z_]\w*)[\s\S]*?;/gi)) {
    add(adds.triggers, `${match[2]}.${match[3]}.${match[1]}`);
  }
  for (const match of text.matchAll(/drop\s+trigger\s+(?:if\s+exists\s+)?([a-z_]\w*)\s+on\s+(public|private|storage)\.([a-z_]\w*)/gi)) {
    add(drops.triggers, `${match[2]}.${match[3]}.${match[1]}`);
  }

  for (const match of text.matchAll(/create\s+(?:unique\s+)?index\s+(?:if\s+not\s+exists\s+)?([a-z_]\w*)\s+on\s+(public|private|storage)\.([a-z_]\w*)/gi)) {
    add(adds.indexes, `${match[2]}.${match[1]}`);
  }
  for (const match of text.matchAll(/drop\s+index\s+(?:if\s+exists\s+)?(?:(public|private|storage)\.)?([a-z_]\w*)/gi)) {
    add(drops.indexes, `${match[1] || "public"}.${match[2]}`);
  }

  for (const match of text.matchAll(/create\s+policy\s+([a-z_]\w*)\s+on\s+(public|private|storage)\.([a-z_]\w*)/gi)) {
    add(adds.policies, `${match[2]}.${match[3]}.${match[1]}`);
  }
  for (const match of text.matchAll(/drop\s+policy\s+(?:if\s+exists\s+)?([a-z_]\w*)\s+on\s+(public|private|storage)\.([a-z_]\w*)/gi)) {
    add(drops.policies, `${match[2]}.${match[3]}.${match[1]}`);
  }

  for (const match of text.matchAll(/insert\s+into\s+storage\.buckets[\s\S]*?values\s*\(\s*'([^']+)'/gi)) {
    add(adds.buckets, match[1]);
  }

  return { adds, drops };
}

function expectedItemsForMigration(filename, effect, finalState) {
  const items = [];
  for (const category of categories) {
    for (const id of effect.adds[category]) {
      if (finalState[category].has(id)) items.push({ category, id, expected: "present" });
    }
  }
  for (const category of removableCategories) {
    for (const id of effect.drops[category]) {
      if (!finalState[category].has(id)) items.push({ category, id, expected: "absent" });
    }
  }
  const number = migrationNumber(filename);
  if (number === 41) items.push({ category: "special", id: "0041_profile_delete_grants_absent", expected: "special" });
  if (number === 42) items.push({ category: "special", id: "0042_provider_gateway_hardening", expected: "special" });
  if (number === 46) items.push({ category: "special", id: "0046_question_assets_bucket_private", expected: "special" });
  return items;
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
    "HOSTED_HISTORY_BASELINE_CHANGED_ABORTED",
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
    "HOSTED_HISTORY_BASELINE_CHANGED_ABORTED",
    "practice_0049_source_function_count_changed",
  );
  return {
    expectedObjectCount: 5,
    operationAllowlistHash: hashJson(expectedPracticeOperations),
    sourceHash: sha256(normalizeSqlShape(stripSqlComments(sql))),
    functionsByKey: new Map(selected.map((entry) => [entry.key, entry])),
  };
}

async function loadSourceModel(plan) {
  const active = plan.executableMigrationNames;
  const effects = new Map();
  for (const filename of active) {
    effects.set(filename, parseMigration(await readFile(resolve(plan.cleanDirectory, filename), "utf8")));
  }

  const finalStates = [];
  let rolling = emptySets();
  for (const filename of active) {
    rolling = cloneState(rolling);
    applyEffect(rolling, effects.get(filename));
    rolling.functionNames = new Set([...rolling.functions].map((key) => key.replace(/\([^)]*\)$/, "")));
    const snapshot = cloneState(rolling);
    snapshot.functionNames = new Set([...rolling.functionNames]);
    finalStates.push(snapshot);
  }

  const practiceSql = await readFile(resolve(plan.cleanDirectory, practice0049Migration), "utf8");
  return {
    active,
    effects,
    finalStates,
    practice0049: buildPractice0049Expectation(practiceSql),
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
    git(["rev-parse", "--abbrev-ref", "HEAD"]) === requiredBranch,
    "HOSTED_HISTORY_BASELINE_CHANGED_ABORTED",
    "branch_changed",
  );
  assert(
    git(["rev-parse", "HEAD"]) === requiredSourceHead,
    "HOSTED_HISTORY_BASELINE_CHANGED_ABORTED",
    "source_head_changed",
  );
  assert(
    gitCleanForPaths(["diff", "--quiet", "--", ...sourceGuardPaths]) &&
      gitCleanForPaths(["diff", "--cached", "--quiet", "--", ...sourceGuardPaths]),
    "HOSTED_HISTORY_BASELINE_CHANGED_ABORTED",
    "canonical_source_changed",
  );
  return {
    branch: requiredBranch,
    sourceHead: requiredSourceHead,
    canonicalSourceUnchanged: true,
  };
}

function validateProcessAuthorization() {
  for (const [name, expected] of Object.entries(requiredGates)) {
    assert(
      process.env[name] === expected,
      "BLOCKED_BY_HOSTED_WRITE_GATE",
      "authorization_gate_missing_or_mismatch",
    );
  }
  for (const name of [
    databaseEnvName,
    expectedProjectRefEnvName,
    projectAliasEnvName,
    forbiddenProjectRefEnvName,
  ]) {
    assert(
      typeof process.env[name] === "string" && process.env[name].trim().length > 0,
      "BLOCKED_BY_HOSTED_WRITE_GATE",
      "required_hosted_environment_missing",
    );
  }
  for (const [name, value] of Object.entries(process.env)) {
    if (allowedEnvNames.has(name)) continue;
    assert(
      !guardedEnvPattern.test(name) || String(value ?? "").length === 0,
      "BLOCKED_BY_HOSTED_WRITE_GATE",
      "non_allowlisted_database_environment_present",
    );
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(process.env[databaseEnvName]);
  } catch {
    abort("BLOCKED_BY_HOSTED_WRITE_GATE", "database_url_parse_failed");
  }
  const expectedProjectRef = process.env[expectedProjectRefEnvName];
  const forbiddenProjectRef = process.env[forbiddenProjectRefEnvName];
  const projectAlias = process.env[projectAliasEnvName];
  assert(
    /^[a-z0-9]+$/i.test(expectedProjectRef) &&
      /^[a-z0-9]+$/i.test(forbiddenProjectRef) &&
      expectedProjectRef !== forbiddenProjectRef &&
      projectAlias.trim().length > 0,
    "HOSTED_HISTORY_BASELINE_CHANGED_ABORTED",
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
    "HOSTED_HISTORY_BASELINE_CHANGED_ABORTED",
    "database_protocol_not_postgres",
  );
  assert(
    identityText.includes(expectedProjectRef),
    "HOSTED_HISTORY_BASELINE_CHANGED_ABORTED",
    "database_identity_ambiguous",
  );
  assert(
    !identityText.includes(forbiddenProjectRef),
    "HOSTED_HISTORY_BASELINE_CHANGED_ABORTED",
    "forbidden_legacy_database_matched",
  );
  assert(
    parsedUrl.password.length > 0 && parsedUrl.username.length > 0 && parsedUrl.hostname.length > 0,
    "HOSTED_HISTORY_BASELINE_CHANGED_ABORTED",
    "database_identity_incomplete",
  );

  return {
    gates: "exact",
    identityClassification: "EXPECTED_HOSTED_CLEAN_DATABASE_VERIFIED",
    forbiddenLegacyProject: "NOT_MATCHED",
    environmentScope: "ALLOWLISTED_HOSTED_HISTORY_REPAIR_ONLY",
  };
}

function validateCanonicalPlan(plan) {
  assert(
    plan.executableMigrationNames.length === 50 &&
      plan.directoryMigrationNames.length === 51 &&
      plan.manifest.latestActivePrefix === 50,
    "HOSTED_HISTORY_BASELINE_CHANGED_ABORTED",
    "canonical_source_count_or_head_changed",
  );
  const activePrefixes = new Map();
  for (const filename of plan.executableMigrationNames) {
    const number = migrationNumber(filename);
    const names = activePrefixes.get(number) ?? [];
    names.push(filename);
    activePrefixes.set(number, names);
  }
  assert(
    [...activePrefixes.values()].every((names) => names.length === 1),
    "HOSTED_HISTORY_BASELINE_CHANGED_ABORTED",
    "duplicate_active_migration_prefix",
  );
  assert(
    plan.duplicateRawPrefixes.length === 1 &&
      plan.duplicateRawPrefixes[0]?.number === 32 &&
      plan.blockedMigrationNames.includes(blockedGoogleMigration) &&
      !plan.executableMigrationNames.includes(blockedGoogleMigration),
    "HOSTED_HISTORY_BASELINE_CHANGED_ABORTED",
    "blocked_duplicate_0032_governance_changed",
  );
  assert(
    plan.executableMigrationNames[48] === practice0049Migration &&
      plan.executableMigrationNames[49] === pdf500050Migration,
    "HOSTED_HISTORY_BASELINE_CHANGED_ABORTED",
    "canonical_tail_changed",
  );
  return {
    executableMigrationCount: plan.executableMigrationNames.length,
    rawCleanSqlFileCount: plan.directoryMigrationNames.length,
    practice0049: "CANONICAL",
    pdf500050: "CANONICAL_HEAD",
    duplicateActivePrefix: "ABSENT",
    blockedGoogle0032: "EXCLUDED",
  };
}

function makeReadQuery(client) {
  return async function readQuery(sql, params = []) {
    assert(
      /^\s*(select|show)\b/i.test(sql),
      "HOSTED_HISTORY_REPAIR_FAILED_AND_ROLLED_BACK",
      "non_read_sql_blocked",
    );
    return client.query(sql, params);
  };
}

async function transactionCommand(client, sql) {
  assert(
    /^(BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ(?:, READ ONLY)?|COMMIT|ROLLBACK)$/i.test(sql),
    "HOSTED_HISTORY_REPAIR_FAILED_AND_ROLLED_BACK",
    "non_transaction_sql_blocked",
  );
  return client.query(sql);
}

async function inspectHistoryTable(query) {
  const regclass = await query("select to_regclass('supabase_migrations.schema_migrations')::text as table_name");
  assert(
    Boolean(regclass.rows[0]?.table_name),
    "HOSTED_HISTORY_BASELINE_CHANGED_ABORTED",
    "migration_history_table_missing",
  );
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
  assert(hasVersion, "HOSTED_HISTORY_BASELINE_CHANGED_ABORTED", "migration_history_version_column_missing");
  if (hasStatements) {
    const statementsColumn = columns.rows.find((row) => row.column_name === "statements");
    assert(
      statementsColumn.udt_name === "_text",
      "HOSTED_HISTORY_BASELINE_CHANGED_ABORTED",
      "migration_history_statements_shape_changed",
    );
  }
  const unsupportedRequiredColumns = columns.rows.filter((row) => (
    !["version", "name", "statements"].includes(row.column_name) &&
    row.is_nullable === "NO" &&
    row.column_default == null
  ));
  assert(
    unsupportedRequiredColumns.length === 0,
    "HOSTED_HISTORY_BASELINE_CHANGED_ABORTED",
    "migration_history_required_column_unknown",
  );
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
  assert(
    versionUnique.rows[0]?.has_version_unique === true,
    "HOSTED_HISTORY_BASELINE_CHANGED_ABORTED",
    "migration_history_version_not_unique",
  );
  return {
    hasName,
    hasStatements,
    columnCount: columns.rows.length,
    shapeHash: hashJson(sortedRows(columns.rows)),
  };
}

async function readHistoryRows(query, tableInfo) {
  const rows = await query(`
    select version::text as version,
           ${tableInfo.hasName ? "name::text" : "null::text"} as name
    from supabase_migrations.schema_migrations
    order by version, ${tableInfo.hasName ? "name nulls first" : "version"}
  `);
  return rows.rows;
}

async function readHistoryRawRows(query, tableInfo) {
  const rows = await query(`
    select to_jsonb(history_row) as row
    from (
      select *
      from supabase_migrations.schema_migrations
      order by version${tableInfo.hasName ? ", name nulls first" : ""}
    ) history_row
  `);
  return rows.rows.map((row) => row.row);
}

function mapHistoryRows(historyRows, activeMigrationNames, legacyMigrationNames) {
  const activeByPrefix = new Map(activeMigrationNames.map((name) => [pad(migrationNumber(name)), name]));
  const activeByName = new Map(activeMigrationNames.flatMap((name) => [
    [name.toLowerCase(), name],
    [name.replace(/\.sql$/i, "").toLowerCase(), name],
  ]));
  const legacyByVersion = new Map();
  const legacyByName = new Map();
  for (const name of legacyMigrationNames) {
    const timestamp = /^(\d{14})_/.exec(name)?.[1];
    if (timestamp) legacyByVersion.set(timestamp, name);
    legacyByName.set(name.toLowerCase(), name);
    legacyByName.set(safeMigrationLabel(name).toLowerCase(), name);
  }

  return historyRows.map((row, index) => {
    const version = String(row.version ?? "");
    const name = String(row.name ?? "");
    const exact = activeByName.get(name.toLowerCase()) ?? activeByName.get(version.toLowerCase());
    if (exact) {
      return {
        index,
        classification: "CANONICAL_EXACT_MATCH",
        canonicalMigration: exact,
      };
    }
    const searchable = `${version} ${name}`.toLowerCase();
    const prefix = /^\d{4}$/.test(version) ? version : /^(\d{4})(?:\D|$)/.exec(searchable)?.[1];
    if (prefix && activeByPrefix.has(prefix)) {
      return {
        index,
        classification: "CANONICAL_LEGACY_ALIAS",
        canonicalMigration: activeByPrefix.get(prefix),
      };
    }
    const legacyMatch = legacyByVersion.get(version)
      ?? legacyByName.get(name.toLowerCase())
      ?? legacyByName.get(name.replace(/^\d{14}_/, "").replace(/\.sql$/i, "").toLowerCase());
    if (legacyMatch) {
      return {
        index,
        classification: "UNMAPPED",
        knownLegacyMigration: safeMigrationLabel(legacyMatch),
        mustRemainUntouched: true,
      };
    }
    return {
      index,
      classification: "AMBIGUOUS",
      mustRemainUntouched: true,
    };
  });
}

function summarizeHistory(historyRows, historyRawRows, historyRegister, activeMigrationNames) {
  const canonicalRowsByNumber = new Map();
  for (const row of historyRegister) {
    if (!row.canonicalMigration) continue;
    const number = migrationNumber(row.canonicalMigration);
    const rows = canonicalRowsByNumber.get(number) ?? [];
    rows.push(row);
    canonicalRowsByNumber.set(number, rows);
  }
  const duplicateCanonicalNumbers = [...canonicalRowsByNumber.entries()]
    .filter(([, rows]) => rows.length > 1)
    .map(([number]) => pad(number));
  const canonicalNumbers = [...canonicalRowsByNumber.keys()].sort((left, right) => left - right);
  const missingThrough0049 = canonicalRange(1, 49).filter((version) => !canonicalRowsByNumber.has(Number(version)));
  const missing0020Through0049 = canonicalRange(canonicalRepairStart, canonicalRepairEnd)
    .filter((version) => !canonicalRowsByNumber.has(Number(version)));
  const present0020Through0049 = canonicalRange(canonicalRepairStart, canonicalRepairEnd)
    .filter((version) => canonicalRowsByNumber.has(Number(version)));
  const pendingCanonicalMigrations = activeMigrationNames.filter((name) => !canonicalRowsByNumber.has(migrationNumber(name)));
  const unmappedRows = historyRegister.filter((row) => row.classification === "UNMAPPED");
  const unmappedNames = unmappedRows.map((row) => row.knownLegacyMigration).sort();
  const classificationCounts = historyRegister.reduce((counts, row) => {
    counts[row.classification] = (counts[row.classification] ?? 0) + 1;
    return counts;
  }, {});
  const originalRowsRetained = historyRows.length >= 21;
  const unmappedRawRows = unmappedRows.map((row) => historyRawRows[row.index]);

  return {
    totalRows: historyRows.length,
    historyFingerprint: hashJson(sortedRows(historyRawRows)),
    classificationCounts,
    canonicalUniqueCount: canonicalNumbers.length,
    canonicalThrough0049Count: canonicalRange(1, 49)
      .filter((version) => canonicalRowsByNumber.has(Number(version))).length,
    canonicalThrough0019Count: canonicalRange(1, 19)
      .filter((version) => canonicalRowsByNumber.has(Number(version))).length,
    canonical0020Through0049PresentCount: present0020Through0049.length,
    canonical0020Through0049MissingCount: missing0020Through0049.length,
    canonical0020Through0049Missing: missing0020Through0049,
    canonicalThrough0049MissingCount: missingThrough0049.length,
    duplicateCanonicalNumbers,
    unmappedCount: unmappedRows.length,
    unmappedRowsPreserved: expectedUnmappedLegacyNames.every((name) => unmappedNames.includes(name)) &&
      unmappedNames.length === expectedUnmappedLegacyNames.length,
    unmappedRowsFingerprint: hashJson(sortedRows(unmappedRawRows)),
    ambiguousCount: classificationCounts.AMBIGUOUS ?? 0,
    history0050Absent: !canonicalRowsByNumber.has(50),
    nextPendingCanonicalMigration: pendingCanonicalMigrations[0] ?? null,
    pendingCanonicalMigrationCount: pendingCanonicalMigrations.length,
    originalRowsRetained,
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
  const bucketPolicies = await query(`
    select p.policyname, p.cmd, p.roles::text as roles,
           pg_get_expr(po.polqual, po.polrelid, true) as using_expression,
           pg_get_expr(po.polwithcheck, po.polrelid, true) as check_expression
    from pg_policies p
    join pg_policy po on po.polname = p.policyname
    join pg_class c on c.oid = po.polrelid and c.relname = p.tablename
    join pg_namespace n on n.oid = c.relnamespace and n.nspname = p.schemaname
    where p.schemaname = 'storage'
      and p.tablename = 'objects'
    order by p.policyname
  `);
  const bucketCompatibility = await query(`
    select exists (
      select 1
      from storage.buckets
      where id = 'ai-import-sources'
        and name = 'ai-import-sources'
        and public is false
        and allowed_mime_types = array['application/pdf']::text[]
        and file_size_limit = 52428800
    ) as compatible
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
  const bucketPolicyRows = bucketPolicies.rows.map((row) => ({
    policyname: row.policyname,
    cmd: row.cmd,
    roles: row.roles,
    usingHash: sha256(row.using_expression ?? ""),
    checkHash: sha256(row.check_expression ?? ""),
  }));

  return {
    tables: new Set(tablesAndViews.rows
      .filter((row) => row.relkind === "r" || row.relkind === "p")
      .map((row) => `${row.schema_name}.${row.object_name}`)),
    views: new Set(tablesAndViews.rows
      .filter((row) => row.relkind === "v" || row.relkind === "m")
      .map((row) => `${row.schema_name}.${row.object_name}`)),
    columns: new Set(columns.rows.map((row) => `${row.table_schema}.${row.table_name}.${row.column_name}`)),
    functions: new Set(functionRows.map((row) => row.key)),
    functionNames: new Set(functionRows.map((row) => row.nameKey)),
    triggers: new Set(triggers.rows.map((row) => `${row.event_object_schema}.${row.event_object_table}.${row.trigger_name}`)),
    indexes: new Set(indexes.rows.map((row) => `${row.schema_name}.${row.index_name}`)),
    constraints: new Set(constraintsRows.map((row) => row.id)),
    rls: new Set(tablesAndViews.rows
      .filter((row) => (row.relkind === "r" || row.relkind === "p") && row.relrowsecurity)
      .map((row) => `${row.schema_name}.${row.object_name}`)),
    policies: new Set(policies.rows.map((row) => `${row.schemaname}.${row.tablename}.${row.policyname}`)),
    buckets: new Set(bucketRows.rows.map((row) => lower(row.row.id))),
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
    bucketPolicyRows,
    aiImportSourcesBucketCompatible: bucketCompatibility.rows[0]?.compatible === true,
    storageObjectCount: Number(storageObjectCount.rows[0]?.count ?? 0),
    authUserCount: Number(authUserCount.rows[0]?.count ?? 0),
  };
}

async function applicationRowCountFingerprint(query) {
  const tables = await query(`
    select table_schema, table_name
    from information_schema.tables
    where table_schema in ('public', 'private')
      and table_type = 'BASE TABLE'
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

function schemaFingerprint(live) {
  return hashJson({
    tablesAndViews: sortedRows(live.tablesAndViewsRows),
    columns: sortedRows(live.columnRows),
    functions: sortedRows(live.functionRows),
    triggers: sortedRows(live.triggerRows),
    indexes: sortedRows(live.indexRows),
    constraints: sortedRows(live.constraintsRows),
    rls: sorted(live.rls),
    policies: sortedRows(live.policyRows),
    privileges: sortedRows(live.privilegeRows),
  });
}

function bucketMetadataFingerprint(live) {
  return hashJson(sortedRows(live.bucketRows));
}

function bucketPolicyFingerprint(live) {
  return hashJson(sortedRows(live.bucketPolicyRows));
}

function liveHas(live, category, id, expected = "present") {
  if (category === "functions") {
    if (expected === "absent") return live.functions.has(id);
    return live.functions.has(id) || live.functionNames.has(functionNameFromKey(id));
  }
  return live[category].has(id);
}

function specialCheck(live, number) {
  if (number === 41) {
    const privileges = new Set(live.privilegeRows.map((row) => (
      `${row.table_schema}.${row.table_name}.${row.grantee}.${row.privilege_type}`.toLowerCase()
    )));
    return !privileges.has("public.profiles.anon.delete")
      && !privileges.has("public.profiles.authenticated.delete")
      && !privileges.has("public.user_profiles.anon.delete")
      && !privileges.has("public.user_profiles.authenticated.delete");
  }
  if (number === 42) {
    const privileges = new Set(live.privilegeRows.map((row) => (
      `${row.table_schema}.${row.table_name}.${row.grantee}.${row.privilege_type}`.toLowerCase()
    )));
    return !live.functionNames.has("private.has_ai_router_provider_access")
      && !live.policies.has("public.ai_provider_profiles.ai_provider_profiles_ai_router_read")
      && !privileges.has("public.ai_provider_profiles.anon.select")
      && !privileges.has("public.ai_provider_profiles.authenticated.select")
      && privileges.has("public.ai_provider_profiles.service_role.select");
  }
  if (number === 46) {
    const bucket = live.bucketRows.find((row) => row.id === "question-assets");
    return Boolean(bucket && bucket.public === false);
  }
  return null;
}

function classifyMigration(filename, effect, finalState, live) {
  const number = migrationNumber(filename);
  const expected = expectedItemsForMigration(filename, effect, finalState);
  const failed = [];
  let passed = 0;
  for (const item of expected) {
    const ok = item.expected === "special"
      ? specialCheck(live, number)
      : (
          item.expected === "present"
            ? liveHas(live, item.category, item.id, item.expected)
            : !liveHas(live, item.category, item.id, item.expected)
        );
    if (ok) passed += 1;
    else failed.push(item);
  }
  const representation = expected.length === 0
    ? "NOT_SAFELY_DETERMINABLE"
    : (failed.length === 0 ? "FULLY_REPRESENTED" : (passed > 0 ? "PARTIALLY_REPRESENTED" : "ABSENT"));
  return {
    number: pad(number),
    filename,
    representation,
    expectedObjectCount: expected.length,
    failedCount: failed.length,
    fingerprintCounts: countByCategory(expected.filter((item) => item.category !== "special")),
  };
}

function verifyPractice0049(live, expected) {
  const constraintIds = [
    "public.ai_provider_routing_policies.ai_provider_routing_policies_operation_kind_check",
    "private.ai_provider_runtime_states.ai_provider_runtime_states_operation_kind_check",
  ];
  let exactConstraintCount = 0;
  for (const id of constraintIds) {
    const sourceHash = expected.operationAllowlistHash;
    const row = live.constraintById.get(id);
    if (!row || row.validated !== true) continue;
    const definition = live.rawConstraintDefinitions?.get(id) ?? "";
    if (hashJson(operationKindsFromText(definition)) === sourceHash) exactConstraintCount += 1;
  }

  let exactFunctionCount = 0;
  const functionFingerprints = [];
  const functionDiagnostics = [];
  for (const [key, source] of expected.functionsByKey.entries()) {
    const liveFunction = live.functionByKey.get(key);
    const fieldMatches = liveFunction ? {
      result: liveFunction.result === source.result,
      language: liveFunction.language === source.language,
      volatility: liveFunction.volatility === source.volatility,
      securityDefiner: liveFunction.securityDefiner === source.securityDefiner,
      searchPath: liveFunction.searchPath === source.searchPath,
      body: liveFunction.bodyHash === source.bodyHash,
    } : {
      result: false,
      language: false,
      volatility: false,
      securityDefiner: false,
      searchPath: false,
      body: false,
    };
    const matches = Object.values(fieldMatches).every(Boolean);
    if (matches) exactFunctionCount += 1;
    functionDiagnostics.push({
      function: functionNameFromKey(key),
      present: Boolean(liveFunction),
      fieldMatches,
      sourceBodyHash: source.bodyHash,
      liveBodyHash: liveFunction?.bodyHash ?? null,
    });
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
    functionDiagnostics,
    exact: exactMatchCount === expected.expectedObjectCount,
  };
}

async function collectRawConstraintDefinitions(query, live) {
  const rows = await query(`
    select con.connamespace::regnamespace::text as schema_name,
           con.conrelid::regclass::text as relation_name,
           con.conname,
           pg_get_constraintdef(con.oid, true) as definition
    from pg_constraint con
    where con.connamespace::regnamespace::text in ('public','private')
      and con.conname in (
        'ai_provider_routing_policies_operation_kind_check',
        'ai_provider_runtime_states_operation_kind_check'
      )
  `);
  live.rawConstraintDefinitions = new Map(rows.rows.map((row) => {
    const relation = String(row.relation_name).toLowerCase().split(".");
    const tableName = relation.length > 1 ? relation.slice(1).join(".") : relation[0];
    return [`${row.schema_name}.${tableName}.${row.conname}`, row.definition];
  }));
}

function pdf500050Status(live, sourceModel, history) {
  const expected50 = expectedItemsForMigration(
    pdf500050Migration,
    sourceModel.effects.get(pdf500050Migration),
    sourceModel.finalStates[49],
  );
  const specificPresent = expected50
    .filter((item) => item.expected === "present" && item.category !== "buckets")
    .filter((item) => !sourceModel.finalStates[48][item.category]?.has(item.id))
    .filter((item) => liveHas(live, item.category, item.id));
  const exact0050PolicyPresent = [
    "storage.objects.ai_import_sources_reserved_upload",
    "storage.objects.ai_import_sources_manager_read",
    "storage.objects.ai_import_sources_manager_delete",
  ].filter((id) => live.policies.has(id));
  return {
    historyAbsent: history.history0050Absent,
    specificNonBucketPresentCount: specificPresent.length,
    exact0050PolicyPresentCount: exact0050PolicyPresent.length,
    preexistingCompatibleBucket: live.aiImportSourcesBucketCompatible,
    unapplied: history.history0050Absent &&
      specificPresent.length === 0 &&
      exact0050PolicyPresent.length === 0 &&
      live.aiImportSourcesBucketCompatible,
  };
}

async function collectStatus(client, plan, sourceModel) {
  const query = makeReadQuery(client);
  const tableInfo = await inspectHistoryTable(query);
  const historyRows = await readHistoryRows(query, tableInfo);
  const historyRawRows = await readHistoryRawRows(query, tableInfo);
  const legacyMigrationNames = (await readdir(resolve(root, plan.manifest.legacyMigrationDirectory)))
    .filter((name) => name.endsWith(".sql"))
    .sort();
  const historyRegister = mapHistoryRows(historyRows, sourceModel.active, legacyMigrationNames);
  const history = summarizeHistory(historyRows, historyRawRows, historyRegister, sourceModel.active);
  const live = await collectLive(query);
  await collectRawConstraintDefinitions(query, live);
  const migrationResultsThrough0048 = sourceModel.active
    .filter((name) => migrationNumber(name) <= 48)
    .map((filename) => classifyMigration(
      filename,
      sourceModel.effects.get(filename),
      sourceModel.finalStates[48],
      live,
    ));
  const missingOrPartialThrough0048 = migrationResultsThrough0048
    .filter((result) => result.representation !== "FULLY_REPRESENTED");
  const practice0049 = verifyPractice0049(live, sourceModel.practice0049);
  const appRows = await applicationRowCountFingerprint(query);
  const fingerprints = {
    migrationHistory: history.historyFingerprint,
    schema: schemaFingerprint(live),
    applicationData: appRows.hash,
    applicationTableCount: appRows.tableCount,
    authUserCount: live.authUserCount,
    storageObjectCount: live.storageObjectCount,
    bucketMetadata: bucketMetadataFingerprint(live),
    bucketPolicies: bucketPolicyFingerprint(live),
    unmappedRows: history.unmappedRowsFingerprint,
  };
  const pdf50 = pdf500050Status(live, sourceModel, history);
  return {
    tableInfo,
    history,
    live,
    migrationResultsThrough0048,
    missingOrPartialThrough0048,
    practice0049,
    pdf50,
    fingerprints,
  };
}

function assertBaseline(status) {
  assert(
    status.missingOrPartialThrough0048.length === 0,
    "HOSTED_HISTORY_BASELINE_CHANGED_ABORTED",
    "canonical_objects_through_0048_missing_or_partial",
  );
  assert(
    status.practice0049.exact,
    "HOSTED_HISTORY_BASELINE_CHANGED_ABORTED",
    "practice_0049_semantic_equivalence_changed",
  );
  assert(
    status.history.totalRows === 21 &&
      status.history.canonicalThrough0019Count === 19 &&
      status.history.canonical0020Through0049PresentCount === 0 &&
      status.history.canonical0020Through0049MissingCount === 30 &&
      status.history.unmappedRowsPreserved &&
      status.history.unmappedCount === 2 &&
      status.history.ambiguousCount === 0 &&
      status.history.duplicateCanonicalNumbers.length === 0 &&
      status.history.history0050Absent,
    "HOSTED_HISTORY_BASELINE_CHANGED_ABORTED",
    "hosted_history_baseline_changed",
  );
  assert(
    status.pdf50.unapplied,
    "HOSTED_HISTORY_BASELINE_CHANGED_ABORTED",
    "pdf50_0050_boundary_changed",
  );
}

function assertReconciled(status) {
  assert(
    status.missingOrPartialThrough0048.length === 0 &&
      status.practice0049.exact,
    "HOSTED_HISTORY_REPAIR_FAILED_AND_ROLLED_BACK",
    "canonical_objects_through_0049_missing_or_partial",
  );
  assert(
    status.history.totalRows === 51 &&
      status.history.canonicalUniqueCount === 49 &&
      status.history.canonicalThrough0049Count === 49 &&
      status.history.canonicalThrough0049MissingCount === 0 &&
      status.history.unmappedRowsPreserved &&
      status.history.unmappedCount === 2 &&
      status.history.ambiguousCount === 0 &&
      status.history.duplicateCanonicalNumbers.length === 0 &&
      status.history.history0050Absent &&
      status.history.nextPendingCanonicalMigration === canonicalNextPending &&
      status.history.pendingCanonicalMigrationCount === 1,
    "HOSTED_HISTORY_REPAIR_FAILED_AND_ROLLED_BACK",
    "hosted_history_reconciled_assertion_failed",
  );
  assert(
    status.pdf50.unapplied,
    "HOSTED_HISTORY_REPAIR_FAILED_AND_ROLLED_BACK",
    "pdf50_0050_boundary_changed_after_repair",
  );
}

function assertPreserved(before, after) {
  const unchanged = before.fingerprints.schema === after.fingerprints.schema &&
    before.fingerprints.applicationData === after.fingerprints.applicationData &&
    before.fingerprints.authUserCount === after.fingerprints.authUserCount &&
    before.fingerprints.storageObjectCount === after.fingerprints.storageObjectCount &&
    before.fingerprints.bucketMetadata === after.fingerprints.bucketMetadata &&
    before.fingerprints.bucketPolicies === after.fingerprints.bucketPolicies &&
    before.fingerprints.unmappedRows === after.fingerprints.unmappedRows;
  assert(
    unchanged,
    "HOSTED_HISTORY_REPAIR_FAILED_AND_ROLLED_BACK",
    "non_history_fingerprint_changed",
  );
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

async function insertHistoryRecord(client, tableInfo, version, filename) {
  const sql = buildHistoryInsert(tableInfo);
  assert(
    /^insert into supabase_migrations\.schema_migrations\("version"(?:, "statements")?(?:, "name")?\) values \(\$1(?:, \$2)?(?:, \$3)?\) on conflict \(version\) do nothing$/i.test(sql),
    "HOSTED_HISTORY_REPAIR_FAILED_AND_ROLLED_BACK",
    "history_insert_sql_not_allowlisted",
  );
  const params = [version];
  if (tableInfo.hasStatements) params.push([]);
  if (tableInfo.hasName) params.push(filename);
  return client.query(sql, params);
}

function recordsForMissing(status, sourceModel) {
  return status.history.canonical0020Through0049Missing.map((version) => {
    const filename = sourceModel.active.find((name) => migrationNumber(name) === Number(version));
    assert(
      Boolean(filename) &&
        filename !== blockedGoogleMigration &&
        filename === sourceModel.active[Number(version) - 1],
      "HOSTED_HISTORY_BASELINE_CHANGED_ABORTED",
      "missing_canonical_record_not_allowlisted",
    );
    return { version, filename };
  });
}

function sanitizedStatusPayload({ mode, authorization, gitState, source, status, phase }) {
  const classification = status.history.totalRows === 21
    ? "HOSTED_CLEAN_PREFLIGHT_READY_FOR_HISTORY_REPAIR"
    : (status.history.totalRows === 51 ? expectedFinalClassification : "HOSTED_HISTORY_BASELINE_CHANGED_ABORTED");
  return {
    mode,
    phase,
    classification,
    authorization,
    gitState,
    source,
    history: {
      totalRows: status.history.totalRows,
      canonicalThrough0019Count: status.history.canonicalThrough0019Count,
      canonical0020Through0049PresentCount: status.history.canonical0020Through0049PresentCount,
      canonical0020Through0049MissingCount: status.history.canonical0020Through0049MissingCount,
      canonicalUniqueCount: status.history.canonicalUniqueCount,
      unmappedRowsPreserved: status.history.unmappedRowsPreserved,
      unmappedCount: status.history.unmappedCount,
      ambiguousCount: status.history.ambiguousCount,
      history0050Absent: status.history.history0050Absent,
      nextPendingCanonicalMigration: status.history.nextPendingCanonicalMigration,
      pendingCanonicalMigrationCount: status.history.pendingCanonicalMigrationCount,
    },
    objects: {
      canonicalThrough0048Represented: status.missingOrPartialThrough0048.length === 0,
      practice0049ExpectedObjects: status.practice0049.expectedObjectCount,
      practice0049ExactMatches: status.practice0049.exactMatchCount,
      practice0049MismatchCount: status.practice0049.mismatchCount,
      practice0049ConstraintMatches: status.practice0049.constraintsExact,
      practice0049FunctionMatches: status.practice0049.functionsExact,
      practice0049FunctionDiagnostics: status.practice0049.functionDiagnostics,
      practice0049OperationAllowlistHash: status.practice0049.operationAllowlistHash,
      practice0049ObjectFingerprint: status.practice0049.objectFingerprint,
      pdf500050Unapplied: status.pdf50.unapplied,
      pdf500050SpecificNonBucketPresentCount: status.pdf50.specificNonBucketPresentCount,
      pdf500050ExactPolicyPresentCount: status.pdf50.exact0050PolicyPresentCount,
      preexistingCompatibleBucket: status.pdf50.preexistingCompatibleBucket,
    },
    fingerprints: status.fingerprints,
    historyTable: {
      inspected: true,
      columnCount: status.tableInfo.columnCount,
      shapeHash: status.tableInfo.shapeHash,
    },
    transaction: {
      began: true,
      readOnly: true,
      committed: false,
      rolledBack: true,
    },
    hostedWrites: {
      schema: 0,
      applicationData: 0,
      auth: 0,
      storage: 0,
      migrationHistory: 0,
    },
    providerCalls: 0,
  };
}

async function runReadOnlyPhase(client, phase, requiredState, context) {
  let began = false;
  try {
    await transactionCommand(client, "BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY");
    began = true;
    const query = makeReadQuery(client);
    const txReadOnly = await query("show transaction_read_only");
    const txIsolation = await query("show transaction_isolation");
    assert(
      txReadOnly.rows[0]?.transaction_read_only === "on" &&
        txIsolation.rows[0]?.transaction_isolation === "repeatable read",
      "HOSTED_HISTORY_BASELINE_CHANGED_ABORTED",
      "read_only_transaction_proof_failed",
    );
    const status = await collectStatus(client, context.plan, context.sourceModel);
    if (requiredState === "baseline") assertBaseline(status);
    if (requiredState === "reconciled") assertReconciled(status);
    await transactionCommand(client, "ROLLBACK");
    began = false;
    return sanitizedStatusPayload({
      mode: requiredState,
      phase,
      authorization: context.authorization,
      gitState: context.gitState,
      source: context.source,
      status,
    });
  } catch (error) {
    if (began) await transactionCommand(client, "ROLLBACK").catch(() => {});
    throw error;
  }
}

async function runRepair(client, context) {
  let began = false;
  try {
    await transactionCommand(client, "BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ");
    began = true;
    const query = makeReadQuery(client);
    const txReadOnly = await query("show transaction_read_only");
    const txIsolation = await query("show transaction_isolation");
    assert(
      txReadOnly.rows[0]?.transaction_read_only === "off" &&
        txIsolation.rows[0]?.transaction_isolation === "repeatable read",
      "HOSTED_HISTORY_REPAIR_FAILED_AND_ROLLED_BACK",
      "write_transaction_proof_failed",
    );

    const before = await collectStatus(client, context.plan, context.sourceModel);
    const baselineReady = before.history.totalRows === 21;
    if (baselineReady) assertBaseline(before);
    else assertReconciled(before);

    const records = recordsForMissing(before, context.sourceModel);
    assert(
      records.length === 30 || records.length === 0,
      "HOSTED_HISTORY_BASELINE_CHANGED_ABORTED",
      "unexpected_repair_record_count",
    );

    let insertedCount = 0;
    const insertedVersions = [];
    for (const record of records) {
      const result = await insertHistoryRecord(client, before.tableInfo, record.version, record.filename);
      insertedCount += result.rowCount;
      if (result.rowCount === 1) insertedVersions.push(record.version);
    }
    assert(
      (records.length === 30 && insertedCount === 30) ||
        (records.length === 0 && insertedCount === 0),
      "HOSTED_HISTORY_REPAIR_FAILED_AND_ROLLED_BACK",
      "history_insert_count_mismatch",
    );

    const after = await collectStatus(client, context.plan, context.sourceModel);
    assertReconciled(after);
    assertPreserved(before, after);
    if (records.length === 0) {
      assert(
        before.fingerprints.migrationHistory === after.fingerprints.migrationHistory,
        "HOSTED_HISTORY_REPAIR_FAILED_AND_ROLLED_BACK",
        "idempotency_history_fingerprint_changed",
      );
    }

    await transactionCommand(client, "COMMIT");
    began = false;
    return {
      finalClassification: expectedFinalClassification,
      authorization: context.authorization,
      gitState: context.gitState,
      source: context.source,
      preWriteHistory: {
        totalRows: before.history.totalRows,
        canonicalThrough0019Count: before.history.canonicalThrough0019Count,
        canonical0020Through0049MissingCount: before.history.canonical0020Through0049MissingCount,
        unmappedRowsPreserved: before.history.unmappedRowsPreserved,
      },
      repair: {
        canonicalRangeInserted: insertedCount === 30 ? "0020-0049" : "none",
        insertedCount,
        insertedVersionCount: insertedVersions.length,
        secondRunIdempotent: insertedCount === 0,
      },
      finalHistory: {
        totalRows: after.history.totalRows,
        canonicalUniqueCount: after.history.canonicalUniqueCount,
        finalCanonicalHead: canonicalFinalHead,
        unmappedRowsPreserved: after.history.unmappedRowsPreserved,
        history0050Absent: after.history.history0050Absent,
        nextPendingCanonicalMigration: after.history.nextPendingCanonicalMigration,
        pendingCanonicalMigrationCount: after.history.pendingCanonicalMigrationCount,
      },
      objects: {
        canonicalThrough0048Represented: after.missingOrPartialThrough0048.length === 0,
        practice0049ExpectedObjects: after.practice0049.expectedObjectCount,
        practice0049ExactMatches: after.practice0049.exactMatchCount,
        practice0049MismatchCount: after.practice0049.mismatchCount,
        practice0049ConstraintMatches: after.practice0049.constraintsExact,
        practice0049FunctionMatches: after.practice0049.functionsExact,
        pdf500050Unapplied: after.pdf50.unapplied,
        preexistingCompatibleBucket: after.pdf50.preexistingCompatibleBucket,
      },
      fingerprints: {
        before: before.fingerprints,
        after: after.fingerprints,
        schemaUnchanged: before.fingerprints.schema === after.fingerprints.schema,
        applicationDataUnchanged: before.fingerprints.applicationData === after.fingerprints.applicationData,
        authUserCountUnchanged: before.fingerprints.authUserCount === after.fingerprints.authUserCount,
        storageObjectCountUnchanged: before.fingerprints.storageObjectCount === after.fingerprints.storageObjectCount,
        bucketMetadataUnchanged: before.fingerprints.bucketMetadata === after.fingerprints.bucketMetadata,
        bucketPoliciesUnchanged: before.fingerprints.bucketPolicies === after.fingerprints.bucketPolicies,
      },
      transaction: {
        began: true,
        committed: true,
        rolledBack: false,
      },
      hostedWrites: {
        schema: 0,
        applicationData: 0,
        auth: 0,
        storage: 0,
        migrationHistory: insertedCount,
      },
      providerCalls: 0,
    };
  } catch (error) {
    if (began) await transactionCommand(client, "ROLLBACK").catch(() => {});
    if (error instanceof SafeAbort) throw error;
    abort("HOSTED_HISTORY_REPAIR_FAILED_AND_ROLLED_BACK", "repair_transaction_failed");
  }
}

async function main() {
  const mode = modeFromArgs();
  const authorization = validateProcessAuthorization();
  const gitState = validateGitAndSourceState();
  const plan = await loadCanonicalMigrationPlan({ root });
  const source = validateCanonicalPlan(plan);
  const sourceModel = await loadSourceModel(plan);
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
    const context = { authorization, gitState, plan, source, sourceModel };
    if (mode === "preflight") result = await runReadOnlyPhase(client, "phase1", "baseline", context);
    else if (mode === "postwrite") result = await runReadOnlyPhase(client, "phase4", "reconciled", context);
    else if (mode === "status") result = await runReadOnlyPhase(client, "status", "any", context);
    else result = await runRepair(client, context);
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
    : "HOSTED_HISTORY_REPAIR_FAILED_AND_ROLLED_BACK";
  const blockCode = error instanceof SafeAbort
    ? error.blockCode
    : "unexpected_safe_failure";
  console.log(JSON.stringify({
    finalClassification,
    blockCode,
    safeErrorType: safeErrorType(error),
    hostedWrites: {
      schema: 0,
      applicationData: 0,
      auth: 0,
      storage: 0,
      migrationHistory: 0,
    },
    providerCalls: 0,
  }, null, 2));
  process.exit(2);
});
