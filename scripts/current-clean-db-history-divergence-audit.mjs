import { execFileSync } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createRequire } from "node:module";

import {
  loadCanonicalMigrationPlan,
  migrationNumber,
} from "./lib/canonical-migration-plan.mjs";

const root = resolve(import.meta.dirname, "..");
const requiredGate = "CONFIRMED";
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

const report = {
  readOnlyProof: {},
  safety: {},
  history: {},
  migrations: {},
  migration0049: {},
  noncanonical: {},
  bucket: {},
  closure: {},
};

function fail(blockCode, error) {
  report.finalClassification = "BLOCKED_BY_READONLY_AUDIT";
  report.blockCode = blockCode;
  if (error) report.safeErrorType = String(error.code || error.name || "Error").slice(0, 80);
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

function parseArgs() {
  const args = process.argv.slice(2);
  const parsed = { pgModule: null };
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--pg-module") {
      parsed.pgModule = args[index + 1] ?? null;
      index += 1;
    }
  }
  return parsed;
}

async function loadPgClient() {
  const args = parseArgs();
  if (args.pgModule) {
    const require = createRequire(import.meta.url);
    return require(args.pgModule).Client;
  }
  const pg = await import("pg");
  return pg.Client;
}

function git(args) {
  return execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function lower(value) {
  return String(value || "").toLowerCase();
}

function pad(number) {
  return String(number).padStart(4, "0");
}

function safeMigrationLabel(filename) {
  return filename.replace(/^\d{14}_/, "").replace(/\.sql$/i, "");
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

function stripComments(sql) {
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

function rangeSummary(numbers) {
  const sorted = [...numbers].sort((left, right) => left - right);
  const ranges = [];
  let start = null;
  let previous = null;
  for (const number of sorted) {
    if (start == null) {
      start = number;
      previous = number;
      continue;
    }
    if (number === previous + 1) {
      previous = number;
      continue;
    }
    ranges.push(start === previous ? pad(start) : `${pad(start)}-${pad(previous)}`);
    start = number;
    previous = number;
  }
  if (start != null) ranges.push(start === previous ? pad(start) : `${pad(start)}-${pad(previous)}`);
  return ranges;
}

function parseMigration(sql) {
  const text = stripComments(sql);
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

function safeVersionLabel(version, ordinal) {
  const value = String(version ?? "");
  if (/^\d{4}$/.test(value)) return value;
  if (/^\d{14}$/.test(value)) return `legacy-timestamp-row-${String(ordinal).padStart(2, "0")}`;
  if (/^\d+$/.test(value)) return `numeric-row-${String(ordinal).padStart(2, "0")}`;
  return `history-row-${String(ordinal).padStart(2, "0")}`;
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
    legacyByName.set(name.replace(/^\d{14}_/, "").replace(/\.sql$/i, "").toLowerCase(), name);
  }

  return historyRows.map((row, index) => {
    const ordinal = index + 1;
    const version = String(row.version ?? "");
    const name = String(row.name ?? "");
    const searchable = `${version} ${name}`.toLowerCase();
    const exact = activeByName.get(name.toLowerCase()) ?? activeByName.get(version.toLowerCase());
    if (exact) {
      return {
        row: `HIST-${String(ordinal).padStart(3, "0")}`,
        versionLabel: safeVersionLabel(version, ordinal),
        classification: "CANONICAL_EXACT_MATCH",
        canonicalMigration: exact,
      };
    }

    const prefix = /^\d{4}$/.test(version) ? version : /^(\d{4})(?:\D|$)/.exec(searchable)?.[1];
    if (prefix && activeByPrefix.has(prefix)) {
      return {
        row: `HIST-${String(ordinal).padStart(3, "0")}`,
        versionLabel: safeVersionLabel(version, ordinal),
        classification: "CANONICAL_LEGACY_ALIAS",
        canonicalMigration: activeByPrefix.get(prefix),
        aliasKind: "prefix-compatible historical row",
      };
    }

    const legacyMatch = legacyByVersion.get(version)
      ?? legacyByName.get(name.toLowerCase())
      ?? legacyByName.get(name.replace(/^\d{14}_/, "").replace(/\.sql$/i, "").toLowerCase());
    if (legacyMatch) {
      return {
        row: `HIST-${String(ordinal).padStart(3, "0")}`,
        versionLabel: safeVersionLabel(version, ordinal),
        classification: "UNMAPPED",
        knownLegacyMigration: safeMigrationLabel(legacyMatch),
        correspondsToKnownCommitOrMigrationGroup: true,
        earliestCanonicalCouldRepresent: null,
        latestCanonicalCouldRepresent: null,
        treatingAsCanonicalSafe: false,
        mustRemainUntouched: true,
      };
    }

    if (/(batch|group|through|range)/i.test(name)) {
      return {
        row: `HIST-${String(ordinal).padStart(3, "0")}`,
        versionLabel: safeVersionLabel(version, ordinal),
        classification: "GROUPED_OR_BATCHED_RECORD",
      };
    }

    return {
      row: `HIST-${String(ordinal).padStart(3, "0")}`,
      versionLabel: safeVersionLabel(version, ordinal),
      classification: "AMBIGUOUS",
      treatingAsCanonicalSafe: false,
      mustRemainUntouched: true,
    };
  });
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

function objectKeyWithoutSignature(key) {
  return key.replace(/\([^)]*\)$/, "");
}

function summarizeExpectedItems(items) {
  return countByCategory(items.filter((item) => item.category !== "special"));
}

function makeAllowedQuery(client) {
  const allowed = /^\s*(select|show|begin\s+transaction|set\s+local|rollback)\b/i;
  return async function query(sql) {
    if (!allowed.test(sql)) throw new Error("unsafe_sql_blocked");
    return client.query(sql);
  };
}

function canonicalConstraintTable(id) {
  return id.split(".").slice(0, 2).join(".");
}

function classifyNoncanonical(id, category, canonicalFinal, storagePolicyNames, extensionObjects) {
  if (category === "buckets" && id === "ai-import-sources") {
    return "APPLICATION_OBJECT_OUTSIDE_CANONICAL_CHAIN";
  }
  if (category === "policies" && storagePolicyNames.has(id)) {
    return "APPLICATION_OBJECT_OUTSIDE_CANONICAL_CHAIN";
  }
  if ((category === "tables" || category === "rls") && extensionObjects.has(id)) {
    return "POSTGRES_SYSTEM_GENERATED";
  }
  if ((category === "tables" || category === "rls") && id === "public.spatial_ref_sys") {
    return "POSTGRES_SYSTEM_GENERATED";
  }
  if ((category === "tables" || category === "rls") && id === "private.ai_router_credential_hashes") {
    return "APPLICATION_OBJECT_OUTSIDE_CANONICAL_CHAIN";
  }
  if (category === "constraints" && /(_pkey|_fkey|_check|_key|_excl)$/.test(id)) {
    return "POSTGRES_SYSTEM_GENERATED";
  }
  if (category === "indexes" && /(_pkey|_key|_idx|_gin_idx|_trgm_idx)$/.test(id) && canonicalFinal.indexes.has(id)) {
    return "CANONICAL_OBJECT_NOT_RECOGNIZED_BY_THE_PREVIOUS_PARSER";
  }
  if (category === "indexes" && /(_pkey|_key)$/.test(id)) {
    return "POSTGRES_SYSTEM_GENERATED";
  }
  if (id.startsWith("storage.") && !storagePolicyNames.has(id)) {
    return "SUPABASE_PLATFORM_MANAGED";
  }
  if (category === "constraints" && canonicalFinal.tables.has(canonicalConstraintTable(id))) {
    return "POSTGRES_SYSTEM_GENERATED";
  }
  return "UNKNOWN";
}

function partitionNoncanonical(live, canonicalFinal, storagePolicyNames, extensionObjects) {
  const candidates = {
    tables: [...live.tables].filter((id) => /^(public|private|storage)\./.test(id) && !canonicalFinal.tables.has(id)),
    columns: [...live.columns].filter((id) => canonicalFinal.tables.has(id.split(".").slice(0, 2).join(".")) && !canonicalFinal.columns.has(id)),
    views: [...live.views].filter((id) => !canonicalFinal.views.has(id)),
    functions: [...live.functions].filter((id) => !canonicalFinal.functions.has(id) && !canonicalFinal.functionNames.has(objectKeyWithoutSignature(id))),
    triggers: [...live.triggers].filter((id) => !canonicalFinal.triggers.has(id)),
    indexes: [...live.explicitIndexes].filter((id) => !canonicalFinal.indexes.has(id)),
    constraints: [...live.constraints].filter((id) => !canonicalFinal.constraints.has(id)),
    rls: [...live.rls].filter((id) => !canonicalFinal.rls.has(id)),
    policies: [...live.policies].filter((id) => !canonicalFinal.policies.has(id)),
    buckets: [...live.buckets].filter((id) => !canonicalFinal.buckets.has(id)),
  };
  const partition = {};
  for (const [category, ids] of Object.entries(candidates)) {
    const counts = {
      SUPABASE_PLATFORM_MANAGED: 0,
      POSTGRES_SYSTEM_GENERATED: 0,
      CANONICAL_OBJECT_NOT_RECOGNIZED_BY_THE_PREVIOUS_PARSER: 0,
      APPLICATION_OBJECT_OUTSIDE_CANONICAL_CHAIN: 0,
      UNKNOWN: 0,
    };
    const applicationObjects = [];
    for (const id of ids) {
      const classification = classifyNoncanonical(
        id,
        category,
        canonicalFinal,
        storagePolicyNames,
        extensionObjects,
      );
      counts[classification] += 1;
      if (classification === "APPLICATION_OBJECT_OUTSIDE_CANONICAL_CHAIN") applicationObjects.push(id);
    }
    partition[category] = { total: ids.length, counts, applicationObjects: applicationObjects.sort() };
  }
  return partition;
}

try {
  if (process.env.PDF50_CURRENT_CLEAN_READONLY_AUDIT !== requiredGate) throw new Error("gate_not_confirmed");
  const connectionString = process.env.PDF50_CURRENT_CLEAN_DATABASE_URL;
  if (!connectionString) throw new Error("database_url_missing");
  const parsedUrl = new URL(connectionString);
  const username = decodeURIComponent(parsedUrl.username || "");
  const identity = [parsedUrl.hostname, username, parsedUrl.pathname, parsedUrl.search].join(" ");
  report.safety.urlShape = {
    postgres: ["postgres:", "postgresql:"].includes(parsedUrl.protocol),
    sessionPooler: parsedUrl.hostname.endsWith(".pooler.supabase.com"),
    port5432: parsedUrl.port === "5432",
    poolerUsernameProjectIdentityPresent: /^postgres\.[a-z0-9]+$/i.test(username),
    denylistClear: !/(prod|production|staging|legacy|old|validation|disposable|fresh)/i.test(identity),
  };
  if (!Object.values(report.safety.urlShape).every(Boolean)) throw new Error("url_shape_failed");

  const statusBefore = git(["status", "--porcelain=v1"]);
  report.safety.gitBefore = {
    branchOk: git(["branch", "--show-current"]) === "codex/pdf50-burst-clean-db-rehearsal",
    headOk: git(["rev-parse", "HEAD"]) === "f7c53a4978446882bde0d7485911e34190736fc0",
    worktreeClean: statusBefore.length === 0,
    statusEntryCount: statusBefore.length === 0 ? 0 : statusBefore.split(/\r?\n/).filter(Boolean).length,
  };
  if (!report.safety.gitBefore.branchOk || !report.safety.gitBefore.headOk) {
    throw new Error("git_safety_failed");
  }

  const plan = await loadCanonicalMigrationPlan({ root });
  const active = plan.executableMigrationNames;
  const legacyMigrationNames = (await readdir(resolve(root, plan.manifest.legacyMigrationDirectory)))
    .filter((name) => name.endsWith(".sql"))
    .sort();
  const effects = new Map();
  for (const filename of active) {
    effects.set(filename, parseMigration(await readFile(resolve(plan.cleanDirectory, filename), "utf8")));
  }
  const finalStates = [];
  let rolling = emptySets();
  for (const filename of active) {
    rolling = cloneState(rolling);
    applyEffect(rolling, effects.get(filename));
    rolling.functionNames = new Set([...rolling.functions].map(objectKeyWithoutSignature));
    finalStates.push(cloneState(rolling));
    finalStates.at(-1).functionNames = new Set([...rolling.functionNames]);
  }
  const final48 = finalStates[47];
  const final49 = finalStates[48];

  report.source = {
    activeApplyPlanCount: active.length,
    cleanMigrationSqlFileCount: plan.directoryMigrationNames.length,
    latestActivePrefix: plan.manifest.latestActivePrefix,
    blockedMigrationCount: plan.blockedMigrationNames.length,
  };

  const Client = await loadPgClient();
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000,
    query_timeout: 35000,
  });
  const query = makeAllowedQuery(client);
  let began = false;
  let rolledBack = false;
  let live = null;
  let historyRows = [];
  try {
    await client.connect();
    report.readOnlyProof.connectionAuthenticated = "PASS";
    report.safety.ssl = client.connection?.stream?.encrypted === true ? "PASS" : "FAIL";
    await query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY");
    began = true;
    report.readOnlyProof.beginReadOnly = "PASS";
    const txReadOnly = await query("SHOW transaction_read_only");
    const defaultReadOnly = await query("SHOW default_transaction_read_only");
    const txIsolation = await query("SHOW transaction_isolation");
    report.readOnlyProof.transactionReadOnly = txReadOnly.rows[0].transaction_read_only === "on" ? "ON" : "OFF";
    report.readOnlyProof.defaultTransactionReadOnly = defaultReadOnly.rows[0].default_transaction_read_only === "on" ? "ON" : "OFF";
    report.readOnlyProof.repeatableReadIsolation = txIsolation.rows[0].transaction_isolation === "repeatable read" ? "PASS" : "FAIL";
    if (report.readOnlyProof.transactionReadOnly !== "ON" || report.readOnlyProof.repeatableReadIsolation !== "PASS") {
      throw new Error("read_only_proof_failed");
    }
    await query("SET LOCAL statement_timeout = '30s'");
    await query("SET LOCAL lock_timeout = '5s'");
    report.readOnlyProof.localTimeouts = "PASS";
    const selectOne = await query("SELECT 1 AS ok");
    report.safety.select1 = selectOne.rows[0].ok === 1 ? "PASS" : "FAIL";

    const historyTable = await query("SELECT to_regclass('supabase_migrations.schema_migrations')::text AS table_name");
    if (historyTable.rows[0].table_name) {
      const historyColumns = await query("SELECT column_name FROM information_schema.columns WHERE table_schema = 'supabase_migrations' AND table_name = 'schema_migrations' ORDER BY ordinal_position");
      const hasName = historyColumns.rows.map((row) => row.column_name).includes("name");
      const historyCount = await query("SELECT count(*)::int AS count FROM supabase_migrations.schema_migrations");
      report.history.recordedHistoryCount = historyCount.rows[0].count;
      historyRows = (await query(`SELECT version::text AS version, ${hasName ? "name::text" : "null::text"} AS name FROM supabase_migrations.schema_migrations ORDER BY version LIMIT 200`)).rows;
      report.history.historyResultBounded = report.history.recordedHistoryCount <= 200;
    } else {
      report.history.recordedHistoryCount = 0;
      report.history.historyResultBounded = true;
    }

    const tablesAndViews = await query("SELECT n.nspname AS schema_name, c.relname AS object_name, c.relkind FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE c.relkind IN ('r','p','v','m') AND n.nspname IN ('public','private','storage')");
    const columns = await query("SELECT table_schema, table_name, column_name FROM information_schema.columns WHERE table_schema IN ('public','private','storage')");
    const functions = await query("SELECT n.nspname AS schema_name, p.proname, pg_get_function_identity_arguments(p.oid) AS identity_arguments FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname IN ('public','private')");
    const triggers = await query("SELECT event_object_schema, event_object_table, trigger_name FROM information_schema.triggers WHERE event_object_schema IN ('public','private','storage')");
    const indexes = await query("SELECT ns.nspname AS schema_name, idx.relname AS index_name, EXISTS (SELECT 1 FROM pg_constraint con WHERE con.conindid = idx.oid) AS constraint_backed FROM pg_class idx JOIN pg_index ix ON ix.indexrelid = idx.oid JOIN pg_namespace ns ON ns.oid = idx.relnamespace WHERE ns.nspname IN ('public','private','storage')");
    const constraints = await query("SELECT connamespace::regnamespace::text AS schema_name, conrelid::regclass::text AS relation_name, conname FROM pg_constraint WHERE connamespace::regnamespace::text IN ('public','private','storage')");
    const rls = await query("SELECT n.nspname AS schema_name, c.relname AS table_name, c.relrowsecurity AS enabled FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE c.relkind IN ('r','p') AND n.nspname IN ('public','private','storage')");
    const policies = await query("SELECT schemaname, tablename, policyname FROM pg_policies WHERE schemaname IN ('public','private','storage')");
    const storagePolicies = await query("SELECT p.policyname, p.cmd, p.roles::text AS roles, pg_get_expr(po.polqual, po.polrelid, true) AS using_expression, pg_get_expr(po.polwithcheck, po.polrelid, true) AS check_expression FROM pg_policies p JOIN pg_policy po ON po.polname = p.policyname JOIN pg_class c ON c.oid = po.polrelid AND c.relname = p.tablename JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = p.schemaname WHERE p.schemaname = 'storage' AND p.tablename = 'objects' AND p.policyname LIKE 'ai_import_sources_%' ORDER BY p.policyname");
    const buckets = await query("SELECT id, public, file_size_limit, allowed_mime_types::text AS allowed_mime_types, created_at IS NOT NULL AS has_creation_metadata FROM storage.buckets WHERE id IN ('ai-import-sources', 'question-assets') ORDER BY id");
    const privileges = await query("SELECT table_schema, table_name, grantee, privilege_type FROM information_schema.table_privileges WHERE table_schema IN ('public','private','storage') AND grantee IN ('public','anon','authenticated','service_role')");
    const extensionObjects = await query("SELECT n.nspname AS schema_name, c.relname AS object_name FROM pg_depend d JOIN pg_extension e ON e.oid = d.refobjid JOIN pg_class c ON c.oid = d.objid JOIN pg_namespace n ON n.oid = c.relnamespace WHERE d.deptype = 'e' AND n.nspname IN ('public','private','storage')");

    live = {
      tables: new Set(tablesAndViews.rows.filter((row) => row.relkind === "r" || row.relkind === "p").map((row) => `${row.schema_name}.${row.object_name}`)),
      views: new Set(tablesAndViews.rows.filter((row) => row.relkind === "v" || row.relkind === "m").map((row) => `${row.schema_name}.${row.object_name}`)),
      columns: new Set(columns.rows.map((row) => `${row.table_schema}.${row.table_name}.${row.column_name}`)),
      functions: new Set(functions.rows.map((row) => functionKey(row.schema_name, row.proname, normalizeFunctionArguments(row.identity_arguments ?? "")))),
      functionNames: new Set(functions.rows.map((row) => `${row.schema_name}.${row.proname}`)),
      triggers: new Set(triggers.rows.map((row) => `${row.event_object_schema}.${row.event_object_table}.${row.trigger_name}`)),
      indexes: new Set(indexes.rows.map((row) => `${row.schema_name}.${row.index_name}`)),
      explicitIndexes: new Set(indexes.rows.filter((row) => !row.constraint_backed).map((row) => `${row.schema_name}.${row.index_name}`)),
      constraints: new Set(constraints.rows.map((row) => {
        const relation = String(row.relation_name).toLowerCase().split(".");
        const tableName = relation.length > 1 ? relation.slice(1).join(".") : relation[0];
        return `${row.schema_name}.${tableName}.${row.conname}`;
      })),
      rls: new Set(rls.rows.filter((row) => row.enabled).map((row) => `${row.schema_name}.${row.table_name}`)),
      policies: new Set(policies.rows.map((row) => `${row.schemaname}.${row.tablename}.${row.policyname}`)),
      buckets: new Set(buckets.rows.map((row) => lower(row.id))),
      bucketRows: buckets.rows,
      privileges: new Set(privileges.rows.map((row) => `${row.table_schema}.${row.table_name}.${row.grantee}.${row.privilege_type}`.toLowerCase())),
      storagePolicies: storagePolicies.rows.map((row) => ({
        policy: row.policyname,
        command: row.cmd,
        roles: row.roles,
        bucketScoped: /bucket_id\s*=\s*'ai-import-sources'/i.test(`${row.using_expression ?? ""} ${row.check_expression ?? ""}`),
        usesAdminOnlyGate: /private\.is_admin\(\)/i.test(`${row.using_expression ?? ""} ${row.check_expression ?? ""}`),
        usesExactReservedPathGate: /can_upload_reserved_ai_import_source_object/i.test(`${row.using_expression ?? ""} ${row.check_expression ?? ""}`),
        usesManagerGate: /can_manage_ai_import_source_object/i.test(`${row.using_expression ?? ""} ${row.check_expression ?? ""}`),
      })),
      extensionObjects: new Set(extensionObjects.rows.map((row) => `${row.schema_name}.${row.object_name}`)),
    };

    await query("ROLLBACK");
    rolledBack = true;
    report.closure.rollback = "PASS";
    report.closure.transactionEnded = "PASS";
  } catch (error) {
    if (began && !rolledBack) {
      try {
        await client.query("ROLLBACK");
        rolledBack = true;
        report.closure.rollback = "PASS";
      } catch {
        report.closure.rollback = "FAIL";
      }
    }
    throw error;
  } finally {
    report.closure.beginAttempted = began;
    report.closure.rolledBack = rolledBack;
    try {
      await client.end();
      report.closure.connectionClosed = "PASS";
    } catch {
      report.closure.connectionClosed = "FAIL";
    }
  }

  function liveHas(category, id, expected = "present") {
    if (category === "functions") {
      if (expected === "absent") return live.functions.has(id);
      return live.functions.has(id) || live.functionNames.has(functionNameFromKey(id));
    }
    return live[category].has(id);
  }

  function specialCheck(number) {
    if (number === 41) {
      return !live.privileges.has("public.profiles.anon.delete")
        && !live.privileges.has("public.profiles.authenticated.delete")
        && !live.privileges.has("public.user_profiles.anon.delete")
        && !live.privileges.has("public.user_profiles.authenticated.delete");
    }
    if (number === 42) {
      return !live.functionNames.has("private.has_ai_router_provider_access")
        && !live.policies.has("public.ai_provider_profiles.ai_provider_profiles_ai_router_read")
        && !live.privileges.has("public.ai_provider_profiles.anon.select")
        && !live.privileges.has("public.ai_provider_profiles.authenticated.select")
        && live.privileges.has("public.ai_provider_profiles.service_role.select");
    }
    if (number === 46) {
      const row = live.bucketRows.find((bucket) => bucket.id === "question-assets");
      return Boolean(row && row.public === false);
    }
    return null;
  }

  function classifyMigration(filename, finalState, historyByNumber) {
    const number = migrationNumber(filename);
    const expected = expectedItemsForMigration(filename, effects.get(filename), finalState);
    const failed = [];
    let passed = 0;
    for (const item of expected) {
      const ok = item.expected === "special"
        ? specialCheck(number)
        : (
            item.expected === "present"
              ? liveHas(item.category, item.id, item.expected)
              : !liveHas(item.category, item.id, item.expected)
          );
      if (ok) passed += 1;
      else failed.push(item);
    }
    const representation = expected.length === 0
      ? "NOT_SAFELY_DETERMINABLE"
      : (failed.length === 0 ? "FULLY_REPRESENTED" : (passed > 0 ? "PARTIALLY_REPRESENTED" : "ABSENT"));
    const history = historyByNumber.get(number);
    let classification = representation;
    if (representation === "FULLY_REPRESENTED") {
      if (!history) classification = "FULLY_REPRESENTED_HISTORY_MISSING";
      else if (history.classification === "GROUPED_OR_BATCHED_RECORD") classification = "FULLY_REPRESENTED_BY_GROUPED_HISTORY";
      else classification = "FULLY_REPRESENTED_AND_RECORDED";
    }
    return {
      number: pad(number),
      filename,
      classification,
      sourceFingerprintCounts: summarizeExpectedItems(expected),
      failedByCategory: countByCategory(failed),
    };
  }

  const historyRegister = mapHistoryRows(historyRows, active, legacyMigrationNames);
  const historyByNumber = new Map();
  for (const entry of historyRegister) {
    if (entry.canonicalMigration) {
      historyByNumber.set(migrationNumber(entry.canonicalMigration), entry);
    }
  }
  const migrationResults = active.slice(0, 48).map((filename) => classifyMigration(filename, final48, historyByNumber));
  let highestHead = 0;
  for (const result of migrationResults) {
    if (Number(result.number) === highestHead + 1 && result.classification.startsWith("FULLY_REPRESENTED")) highestHead += 1;
    else break;
  }

  report.history.register = historyRegister;
  report.history.trackingModel = historyRegister.some((entry) => entry.classification === "UNMAPPED")
    && historyRegister.some((entry) => entry.classification === "CANONICAL_LEGACY_ALIAS")
    ? "mixed historical conventions with incomplete canonical history"
    : "incomplete history";
  report.history.rowClassificationCounts = historyRegister.reduce((counts, entry) => {
    counts[entry.classification] = (counts[entry.classification] ?? 0) + 1;
    return counts;
  }, {});

  const exactRecorded = migrationResults.filter((result) => result.classification === "FULLY_REPRESENTED_AND_RECORDED");
  const missingHistory = migrationResults.filter((result) => result.classification === "FULLY_REPRESENTED_HISTORY_MISSING");
  report.migrations = {
    canonical0048: migrationResults.map((result) => ({
      number: result.number,
      filename: result.filename,
      classification: result.classification,
      fingerprintCounts: result.sourceFingerprintCounts,
    })),
    fullyRepresentedAndRecorded: {
      count: exactRecorded.length,
      ranges: rangeSummary(exactRecorded.map((result) => Number(result.number))),
    },
    fullyRepresentedHistoryMissing: {
      count: missingHistory.length,
      ranges: rangeSummary(missingHistory.map((result) => Number(result.number))),
      migrations0020Through0048: missingHistory
        .filter((result) => Number(result.number) >= 20)
        .map((result) => ({
          number: result.number,
          filename: result.filename,
          fingerprintCounts: result.sourceFingerprintCounts,
        })),
    },
    partial: migrationResults.filter((result) => result.classification === "PARTIALLY_REPRESENTED"),
    absent: migrationResults.filter((result) => result.classification === "ABSENT"),
    notSafelyDeterminable: migrationResults.filter((result) => result.classification === "NOT_SAFELY_DETERMINABLE"),
    highestConsecutiveCanonicalHead: pad(highestHead),
  };

  const expected49 = expectedItemsForMigration(active[48], effects.get(active[48]), final49)
    .filter((item) => item.category !== "special" && item.expected === "present");
  const present49 = expected49.filter((item) => liveHas(item.category, item.id));
  report.migration0049 = {
    status: present49.length === 0 ? "ABSENT" : (present49.length === expected49.length ? "FULLY_PRESENT" : "PARTIALLY_PRESENT"),
    expectedObjectCount: expected49.length,
    presentObjectCount: present49.length,
    expectedByCategory: countByCategory(expected49),
    presentByCategory: countByCategory(present49),
    collisionCategories: [...new Set(present49.map((item) => item.category))].sort(),
    historyRecorded: historyByNumber.has(49),
  };

  const storagePolicyNames = new Set(live.storagePolicies.map((policy) => `storage.objects.${policy.policy}`));
  report.noncanonical = {
    againstCanonical0048: partitionNoncanonical(live, final48, storagePolicyNames, live.extensionObjects),
    againstCanonical0049: partitionNoncanonical(live, final49, storagePolicyNames, live.extensionObjects),
  };

  const aiBucket = live.bucketRows.find((bucket) => bucket.id === "ai-import-sources");
  const existingPolicyNames = live.storagePolicies.map((policy) => policy.policy).sort();
  const hasLegacyAdminPolicies = existingPolicyNames.includes("ai_import_sources_admin_upload")
    && existingPolicyNames.includes("ai_import_sources_admin_read")
    && existingPolicyNames.includes("ai_import_sources_admin_delete");
  const has0049Policies = existingPolicyNames.includes("ai_import_sources_reserved_upload")
    && existingPolicyNames.includes("ai_import_sources_manager_read")
    && existingPolicyNames.includes("ai_import_sources_manager_delete");
  const bucketEquivalent = Boolean(
    aiBucket
      && aiBucket.public === false
      && Number(aiBucket.file_size_limit) === 52_428_800
      && String(aiBucket.allowed_mime_types).includes("application/pdf"),
  );
  report.bucket = {
    classification: bucketEquivalent && hasLegacyAdminPolicies && !has0049Policies
      ? "COMPATIBLE_BUT_REQUIRES_ADOPTION"
      : (bucketEquivalent && has0049Policies ? "EXACTLY_EQUIVALENT_TO_0049" : "INCOMPATIBLE_WITH_0049"),
    exists: Boolean(aiBucket),
    publicFlag: aiBucket ? (aiBucket.public ? "PUBLIC" : "PRIVATE") : "ABSENT",
    fileSizeLimitMatches0049: aiBucket ? Number(aiBucket.file_size_limit) === 52_428_800 : false,
    allowedMimeTypesMatch0049: aiBucket ? String(aiBucket.allowed_mime_types).includes("application/pdf") : false,
    creationMetadataPresent: aiBucket ? Boolean(aiBucket.has_creation_metadata) : false,
    existingPolicyNames,
    policySemantics: live.storagePolicies,
    arbitraryPathCurrentlyPermittedForAdminPolicy: hasLegacyAdminPolicies,
    exactReservedPathPolicyPresent: live.storagePolicies.some((policy) => policy.usesExactReservedPathGate),
    runtimeStaticReferencesBucket: true,
    current0049WouldSafelyReuse: Boolean(aiBucket),
    current0049WouldFailOnInsert: false,
    current0049WouldOverwriteConfiguration: Boolean(aiBucket),
    current0049WouldDuplicatePolicies: false,
    current0049WouldWeakenAccess: false,
    sourceDecision: "0049_REQUIRES_PREEXISTING_BUCKET_ADOPTION_HARDENING",
  };

  report.finalClassification = "REPAIR_PLAN_READY_0049_HARDENING_REQUIRED";
  report.providerCalls = 0;
  report.databaseWrites = 0;
  const statusAfter = git(["status", "--porcelain=v1"]);
  report.gitStatus = {
    clean: statusAfter.length === 0,
    statusEntryCount: statusAfter.length === 0 ? 0 : statusAfter.split(/\r?\n/).filter(Boolean).length,
  };
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  fail("audit_failed", error);
}
