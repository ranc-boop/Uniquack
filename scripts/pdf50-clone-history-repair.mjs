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
const requiredGate = "CONFIRMED";
const allowedLocalHosts = new Set(["127.0.0.1", "localhost"]);
const allowedEnvNames = new Set([
  "PDF50_LOCAL_CLONE_REHEARSAL",
  "PDF50_LOCALHOST_ONLY",
  "PDF50_LOCAL_DATABASE_URL",
  "PDF50_LOCAL_API_URL",
  "PDF50_LOCAL_SUPABASE_DIR",
]);
const forbiddenEnvNamePattern =
  /^(PDF50_|SUPABASE|DATABASE_URL|DIRECT_URL|POSTGRES|PG|NEXT_PUBLIC_SUPABASE|SUPABASE_)/;
const forbiddenUrlValuePattern = /supabase\.co|pooler\.supabase\.com|https?:\/\//i;
const unmappedLegacyNames = [
  "fix_private_schema_function_grants_for_rls",
  "fix_taxonomy_closure_rebuild_safe_delete",
];
const canonicalRepairStart = 20;
const canonicalRepairEnd = 48;
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

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function pad(number) {
  return String(number).padStart(4, "0");
}

function lower(value) {
  return String(value ?? "").toLowerCase();
}

function sha256(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function sorted(values) {
  return [...values].sort();
}

function sortedRows(rows) {
  return rows
    .map((row) => Object.fromEntries(Object.entries(row).sort(([left], [right]) => left.localeCompare(right))))
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

function summarizeExpectedItems(items) {
  return countByCategory(items.filter((item) => item.category !== "special"));
}

function validateLocalEnvironment() {
  assert(process.env.PDF50_LOCAL_CLONE_REHEARSAL === requiredGate, "PDF50_LOCAL_CLONE_REHEARSAL must be CONFIRMED.");
  assert(process.env.PDF50_LOCALHOST_ONLY === requiredGate, "PDF50_LOCALHOST_ONLY must be CONFIRMED.");
  assert(process.env.PDF50_LOCAL_SUPABASE_DIR, "PDF50_LOCAL_SUPABASE_DIR is required.");

  for (const [name, value] of Object.entries(process.env)) {
    if (allowedEnvNames.has(name)) continue;
    if (forbiddenEnvNamePattern.test(name)) {
      throw new Error("Non-local database/API environment variable is present.");
    }
    if (forbiddenUrlValuePattern.test(value ?? "")) {
      throw new Error("Non-local URL-shaped environment variable is present.");
    }
  }

  const databaseUrl = new URL(process.env.PDF50_LOCAL_DATABASE_URL ?? "");
  assert(["postgres:", "postgresql:"].includes(databaseUrl.protocol), "Local database URL protocol must be postgres.");
  assert(allowedLocalHosts.has(databaseUrl.hostname), "Local database hostname must be localhost or 127.0.0.1.");
  assert(databaseUrl.port === "54322", "Local database port must be 54322.");
  assert(!/supabase\.co|pooler\.supabase\.com/i.test(process.env.PDF50_LOCAL_DATABASE_URL), "Hosted database URL is forbidden.");

  const apiUrl = new URL(process.env.PDF50_LOCAL_API_URL ?? "");
  assert(["http:", "https:"].includes(apiUrl.protocol), "Local API URL protocol must be HTTP(S).");
  assert(allowedLocalHosts.has(apiUrl.hostname), "Local API hostname must be localhost or 127.0.0.1.");
  assert(!/supabase\.co|pooler\.supabase\.com/i.test(process.env.PDF50_LOCAL_API_URL), "Hosted API URL is forbidden.");

  return {
    gatesConfirmed: true,
    databaseHostLocal: true,
    databasePort54322: true,
    apiHostLocal: true,
    remoteEnvironmentPresent: false,
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
  return { active, effects, finalStates };
}

async function collectLive(client) {
  const tablesAndViews = await client.query("SELECT n.nspname AS schema_name, c.relname AS object_name, c.relkind FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE c.relkind IN ('r','p','v','m') AND n.nspname IN ('public','private','storage')");
  const columns = await client.query("SELECT table_schema, table_name, column_name FROM information_schema.columns WHERE table_schema IN ('public','private','storage')");
  const functions = await client.query("SELECT n.nspname AS schema_name, p.proname, pg_get_function_identity_arguments(p.oid) AS identity_arguments FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname IN ('public','private')");
  const triggers = await client.query("SELECT event_object_schema, event_object_table, trigger_name FROM information_schema.triggers WHERE event_object_schema IN ('public','private','storage')");
  const indexes = await client.query("SELECT ns.nspname AS schema_name, idx.relname AS index_name, EXISTS (SELECT 1 FROM pg_constraint con WHERE con.conindid = idx.oid) AS constraint_backed FROM pg_class idx JOIN pg_index ix ON ix.indexrelid = idx.oid JOIN pg_namespace ns ON ns.oid = idx.relnamespace WHERE ns.nspname IN ('public','private','storage')");
  const constraints = await client.query("SELECT connamespace::regnamespace::text AS schema_name, conrelid::regclass::text AS relation_name, conname FROM pg_constraint WHERE connamespace::regnamespace::text IN ('public','private','storage')");
  const rls = await client.query("SELECT n.nspname AS schema_name, c.relname AS table_name, c.relrowsecurity AS enabled FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE c.relkind IN ('r','p') AND n.nspname IN ('public','private','storage')");
  const policies = await client.query("SELECT schemaname, tablename, policyname FROM pg_policies WHERE schemaname IN ('public','private','storage')");
  const storagePolicies = await client.query("SELECT p.policyname, p.cmd, p.roles::text AS roles, pg_get_expr(po.polqual, po.polrelid, true) AS using_expression, pg_get_expr(po.polwithcheck, po.polrelid, true) AS check_expression FROM pg_policies p JOIN pg_policy po ON po.polname = p.policyname JOIN pg_class c ON c.oid = po.polrelid AND c.relname = p.tablename JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = p.schemaname WHERE p.schemaname = 'storage' AND p.tablename = 'objects' ORDER BY p.policyname");
  const buckets = await client.query("SELECT id, name, public, file_size_limit, allowed_mime_types::text AS allowed_mime_types FROM storage.buckets WHERE id IN ('ai-import-sources', 'question-assets') ORDER BY id");
  const storageObjectCount = await client.query("SELECT count(*)::int AS count FROM storage.objects");
  const privileges = await client.query("SELECT table_schema, table_name, grantee, privilege_type FROM information_schema.table_privileges WHERE table_schema IN ('public','private','storage') AND grantee IN ('public','anon','authenticated','service_role') ORDER BY table_schema, table_name, grantee, privilege_type");

  return {
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
    storageObjectCount: storageObjectCount.rows[0].count,
    storagePolicies: storagePolicies.rows,
    privileges: new Set(privileges.rows.map((row) => `${row.table_schema}.${row.table_name}.${row.grantee}.${row.privilege_type}`.toLowerCase())),
    privilegeRows: privileges.rows,
  };
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
    fingerprintCounts: summarizeExpectedItems(expected),
    failedByCategory: countByCategory(failed),
  };
}

async function readHistoryRows(client) {
  const table = await client.query("SELECT to_regclass('supabase_migrations.schema_migrations')::text AS table_name");
  assert(table.rows[0].table_name, "Migration history table is missing.");
  const columns = await client.query("SELECT column_name FROM information_schema.columns WHERE table_schema = 'supabase_migrations' AND table_name = 'schema_migrations'");
  const hasName = columns.rows.some((row) => row.column_name === "name");
  return (await client.query(`SELECT version::text AS version, ${hasName ? "name::text" : "null::text"} AS name FROM supabase_migrations.schema_migrations ORDER BY version, name NULLS FIRST`)).rows;
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
    const label = name.replace(/^\d{14}_/, "").replace(/\.sql$/i, "");
    if (timestamp) legacyByVersion.set(timestamp, name);
    legacyByName.set(name.toLowerCase(), name);
    legacyByName.set(label.toLowerCase(), name);
  }

  return historyRows.map((row, index) => {
    const version = String(row.version ?? "");
    const name = String(row.name ?? "");
    const exact = activeByName.get(name.toLowerCase()) ?? activeByName.get(version.toLowerCase());
    if (exact) {
      return {
        row: `HIST-${String(index + 1).padStart(3, "0")}`,
        version,
        name,
        classification: "CANONICAL_EXACT_MATCH",
        canonicalMigration: exact,
      };
    }
    const searchable = `${version} ${name}`.toLowerCase();
    const prefix = /^\d{4}$/.test(version) ? version : /^(\d{4})(?:\D|$)/.exec(searchable)?.[1];
    if (prefix && activeByPrefix.has(prefix)) {
      return {
        row: `HIST-${String(index + 1).padStart(3, "0")}`,
        version,
        name,
        classification: "CANONICAL_LEGACY_ALIAS",
        canonicalMigration: activeByPrefix.get(prefix),
      };
    }
    const legacyMatch = legacyByVersion.get(version)
      ?? legacyByName.get(name.toLowerCase())
      ?? legacyByName.get(name.replace(/^\d{14}_/, "").replace(/\.sql$/i, "").toLowerCase());
    if (legacyMatch) {
      return {
        row: `HIST-${String(index + 1).padStart(3, "0")}`,
        version,
        name,
        classification: "UNMAPPED",
        knownLegacyMigration: legacyMatch.replace(/^\d{14}_/, "").replace(/\.sql$/i, ""),
        treatingAsCanonicalSafe: false,
        mustRemainUntouched: true,
      };
    }
    return {
      row: `HIST-${String(index + 1).padStart(3, "0")}`,
      version,
      name,
      classification: "AMBIGUOUS",
      treatingAsCanonicalSafe: false,
      mustRemainUntouched: true,
    };
  });
}

function summarizeHistory(register, activeMigrationNames) {
  const canonicalByNumber = new Map();
  for (const row of register) {
    if (row.canonicalMigration) canonicalByNumber.set(migrationNumber(row.canonicalMigration), row);
  }
  const missingThrough48 = [];
  const presentThrough48 = [];
  for (let number = 1; number <= 48; number += 1) {
    if (canonicalByNumber.has(number)) presentThrough48.push(number);
    else missingThrough48.push(number);
  }
  const missingRepairRange = [];
  const presentRepairRange = [];
  for (let number = canonicalRepairStart; number <= canonicalRepairEnd; number += 1) {
    if (canonicalByNumber.has(number)) presentRepairRange.push(number);
    else missingRepairRange.push(number);
  }
  const nextPending = activeMigrationNames.find((name) => !canonicalByNumber.has(migrationNumber(name)));
  const counts = register.reduce((accumulator, row) => {
    accumulator[row.classification] = (accumulator[row.classification] ?? 0) + 1;
    return accumulator;
  }, {});
  const unmapped = register.filter((row) => row.classification === "UNMAPPED");
  return {
    totalRows: register.length,
    rowClassificationCounts: counts,
    canonicalPresentThrough0048Count: presentThrough48.length,
    canonicalMissingThrough0048: missingThrough48.map(pad),
    canonicalPresent0020Through0048Count: presentRepairRange.length,
    canonicalMissing0020Through0048: missingRepairRange.map(pad),
    unmappedRows: unmapped.map((row) => row.knownLegacyMigration).sort(),
    unmappedRowsPreserved: unmappedLegacyNames.every((name) => unmapped.some((row) => row.knownLegacyMigration === name)),
    history0050Absent: !canonicalByNumber.has(50),
    nextPendingCanonicalMigration: nextPending ?? null,
  };
}

function schemaFingerprint(live) {
  return sha256({
    tables: sorted(live.tables),
    columns: sorted(live.columns),
    views: sorted(live.views),
    functions: sorted(live.functions),
    triggers: sorted(live.triggers),
    indexes: sorted(live.indexes),
    constraints: sorted(live.constraints),
    rls: sorted(live.rls),
    policies: sorted(live.policies),
    buckets: sortedRows(live.bucketRows),
    privileges: sortedRows(live.privilegeRows),
  });
}

function storageFingerprint(live) {
  return sha256({
    buckets: sortedRows(live.bucketRows),
    storagePolicies: sortedRows(live.storagePolicies),
    objectCount: live.storageObjectCount,
  });
}

async function rowCountFingerprint(client) {
  const tables = await client.query(`
    select table_schema, table_name
    from information_schema.tables
    where table_schema in ('public', 'private', 'storage', 'auth')
      and table_type = 'BASE TABLE'
      and not (table_schema = 'supabase_migrations')
    order by table_schema, table_name
  `);
  const counts = [];
  for (const row of tables.rows) {
    const count = await client.query(
      `select count(*)::int as count from ${quoteIdentifier(row.table_schema)}.${quoteIdentifier(row.table_name)}`,
    );
    counts.push({ table: `${row.table_schema}.${row.table_name}`, count: count.rows[0].count });
  }
  return {
    hash: sha256(counts),
    counts,
  };
}

function quoteIdentifier(identifier) {
  return `"${String(identifier).replaceAll('"', '""')}"`;
}

function migration0050Status(active, effects, finalStates, live, historySummary) {
  const migration50 = active.find((name) => migrationNumber(name) === 50);
  const expected = expectedItemsForMigration(migration50, effects.get(migration50), finalStates[49]);
  const nonBucketExpected = expected.filter((item) => item.category !== "buckets" && item.category !== "special" && item.expected === "present");
  const presentNonBucket = nonBucketExpected.filter((item) => liveHas(live, item.category, item.id));
  const pdf50SpecificExpected = nonBucketExpected.filter((item) => (
    item.id.includes("ai_pdf_upload_burst")
    || item.id.includes("reserve_ai_pdf_upload_burst")
    || item.id.includes("release_ai_pdf_burst_admission_jobs")
    || item.id.includes("cancel_ai_pdf_upload_burst_items")
    || item.id.includes("ai_import_sources_")
  ));
  const presentPdf50Specific = pdf50SpecificExpected.filter((item) => liveHas(live, item.category, item.id));
  const exact0050PoliciesPresent = [
    "ai_import_sources_reserved_upload",
    "ai_import_sources_manager_read",
    "ai_import_sources_manager_delete",
  ].filter((name) => live.policies.has(`storage.objects.${name}`));
  return {
    historyAbsent: historySummary.history0050Absent,
    nonBucketObjectExpectedCount: nonBucketExpected.length,
    nonBucketObjectPresentCount: presentNonBucket.length,
    pdf50SpecificObjectExpectedCount: pdf50SpecificExpected.length,
    pdf50SpecificObjectPresentCount: presentPdf50Specific.length,
    exact0050PolicyPresentCount: exact0050PoliciesPresent.length,
    hardened0050Executed: !historySummary.history0050Absent || presentPdf50Specific.length > 0 || exact0050PoliciesPresent.length > 0,
  };
}

function bucketStatus(live) {
  const bucket = live.bucketRows.find((row) => row.id === "ai-import-sources");
  const policyNames = live.storagePolicies
    .filter((policy) => policy.policyname.startsWith("ai_import_sources_"))
    .map((policy) => policy.policyname)
    .sort();
  const legacyPolicyNames = [
    "ai_import_sources_admin_delete",
    "ai_import_sources_admin_read",
    "ai_import_sources_admin_upload",
  ];
  return {
    exists: Boolean(bucket),
    private: Boolean(bucket && bucket.public === false),
    pdfOnly: Boolean(bucket && String(bucket.allowed_mime_types) === "{application/pdf}"),
    fileSizeLimit50Mb: Boolean(bucket && Number(bucket.file_size_limit) === 52_428_800),
    storageObjectCount: live.storageObjectCount,
    legacyPolicyNames,
    actualAiImportPolicyNames: policyNames,
    legacyPolicyCount: policyNames.filter((name) => legacyPolicyNames.includes(name)).length,
    exact0050PolicyCount: policyNames.filter((name) => [
      "ai_import_sources_reserved_upload",
      "ai_import_sources_manager_read",
      "ai_import_sources_manager_delete",
    ].includes(name)).length,
  };
}

function bucketReadyFor0050(bucket) {
  const absentCreatePath = !bucket.exists
    && bucket.storageObjectCount === 0
    && bucket.legacyPolicyCount === 0
    && bucket.exact0050PolicyCount === 0;
  const compatibleLegacyAdoptionPath = bucket.exists
    && bucket.private
    && bucket.pdfOnly
    && bucket.fileSizeLimit50Mb
    && bucket.storageObjectCount === 0
    && bucket.legacyPolicyCount === 3
    && bucket.exact0050PolicyCount === 0;
  return absentCreatePath || compatibleLegacyAdoptionPath;
}

async function buildStatus(client, plan, sourceModel) {
  const legacyMigrationNames = (await readdir(resolve(root, plan.manifest.legacyMigrationDirectory)))
    .filter((name) => name.endsWith(".sql"))
    .sort();
  const live = await collectLive(client);
  const historyRows = await readHistoryRows(client);
  const historyRegister = mapHistoryRows(historyRows, sourceModel.active, legacyMigrationNames);
  const history = summarizeHistory(historyRegister, sourceModel.active);
  const final0048State = sourceModel.finalStates[47];
  const migrationResults = sourceModel.active
    .filter((name) => migrationNumber(name) <= 48)
    .map((filename) => classifyMigration(
      filename,
      sourceModel.effects.get(filename),
      final0048State,
      live,
    ));
  const missingObjectMigrations = migrationResults.filter((result) => result.representation !== "FULLY_REPRESENTED");
  const bucket = bucketStatus(live);
  const migration50 = migration0050Status(sourceModel.active, sourceModel.effects, sourceModel.finalStates, live, history);
  return {
    localhostOnly: {
      databaseHostLocal: true,
      databasePort54322: true,
      apiHostLocal: true,
      remoteEnvironmentPresent: false,
    },
    canonicalObjectsThrough0048Represented: missingObjectMigrations.length === 0,
    missingObjectMigrations: missingObjectMigrations.map((result) => ({
      number: result.number,
      filename: result.filename,
      representation: result.representation,
      failedByCategory: result.failedByCategory,
    })),
    history,
    migration0050: migration50,
    bucket,
    schemaFingerprint: schemaFingerprint(live),
    storageFingerprint: storageFingerprint(live),
    migrationFingerprintCounts: migrationResults.map((result) => ({
      number: result.number,
      filename: result.filename,
      fingerprintCounts: result.fingerprintCounts,
    })),
  };
}

function baselineValid(status) {
  return status.canonicalObjectsThrough0048Represented
    && status.history.totalRows === 21
    && status.history.canonicalPresentThrough0048Count === 19
    && status.history.canonicalMissing0020Through0048.length === 29
    && status.history.unmappedRowsPreserved
    && status.history.history0050Absent
    && status.migration0050.pdf50SpecificObjectPresentCount === 0
    && status.migration0050.exact0050PolicyPresentCount === 0
    && bucketReadyFor0050(status.bucket);
}

function reconciledValid(status) {
  return status.canonicalObjectsThrough0048Represented
    && status.history.canonicalPresentThrough0048Count === 48
    && status.history.canonicalMissingThrough0048.length === 0
    && status.history.unmappedRowsPreserved
    && status.history.history0050Absent
    && status.history.nextPendingCanonicalMigration === "0049_practice_agent_provider_routing.sql"
    && status.migration0050.pdf50SpecificObjectPresentCount === 0
    && status.migration0050.exact0050PolicyPresentCount === 0
    && bucketReadyFor0050(status.bucket);
}

async function repair(client, plan, sourceModel) {
  const beforeStatus = await buildStatus(client, plan, sourceModel);
  assert(beforeStatus.canonicalObjectsThrough0048Represented, "Canonical object fingerprint through 0048 is incomplete.");
  assert(beforeStatus.history.unmappedRowsPreserved, "Unmapped legacy rows are missing.");
  assert(beforeStatus.history.history0050Absent, "0050 history must be absent.");
  assert(!beforeStatus.migration0050.hardened0050Executed, "0050 appears to have executed.");
  assert(bucketReadyFor0050(beforeStatus.bucket), "Pre-0050 source bucket state is neither absent nor compatible legacy.");

  const beforeRows = await rowCountFingerprint(client);
  const missingVersions = beforeStatus.history.canonicalMissing0020Through0048;
  const recordsToInsert = missingVersions.map((version) => {
    const number = Number(version);
    const filename = sourceModel.active.find((name) => migrationNumber(name) === number);
    assert(filename, `Missing canonical filename for ${version}.`);
    return { version, filename };
  });

  let insertedCount = 0;
  const insertedVersions = [];
  let rolledBack = false;
  await client.query("begin");
  try {
    await client.query("set local statement_timeout = '30s'");
    await client.query("set local lock_timeout = '5s'");
    for (const record of recordsToInsert) {
      const result = await client.query(
        "insert into supabase_migrations.schema_migrations(version, statements, name) values ($1, $2, $3) on conflict (version) do nothing",
        [record.version, [], record.filename],
      );
      insertedCount += result.rowCount;
      if (result.rowCount === 1) insertedVersions.push(record.version);
    }

    const afterStatus = await buildStatus(client, plan, sourceModel);
    const afterRows = await rowCountFingerprint(client);
    assert(reconciledValid(afterStatus), "Post-repair history reconciliation check failed.");
    assert(afterStatus.schemaFingerprint === beforeStatus.schemaFingerprint, "Schema fingerprint changed.");
    assert(afterStatus.storageFingerprint === beforeStatus.storageFingerprint, "Storage metadata fingerprint changed.");
    assert(afterRows.hash === beforeRows.hash, "Synthetic row counts changed.");
    await client.query("commit");

    return {
      finalClassification: "LOCAL_CLONE_HISTORY_RECONCILED_THROUGH_0048",
      insertedCount,
      insertedVersions,
      missingBefore: beforeStatus.history.canonicalMissing0020Through0048,
      finalCanonicalHead: "0048",
      nextPendingCanonicalMigration: afterStatus.history.nextPendingCanonicalMigration,
      schemaFingerprintUnchanged: true,
      storageMetadataUnchanged: true,
      syntheticRowCountsUnchanged: true,
      unmappedRowsPreserved: true,
      providerCalls: 0,
    };
  } catch (error) {
    await client.query("rollback").catch(() => {});
    rolledBack = true;
    return {
      finalClassification: "LOCAL_CLONE_HISTORY_REPAIR_FAILED_AND_ROLLED_BACK",
      insertedCount: 0,
      rolledBack,
      safeErrorType: error.code || error.name || "Error",
      providerCalls: 0,
    };
  }
}

async function main() {
  const mode = process.argv.includes("--status") ? "status" : "repair";
  const localEnvironment = validateLocalEnvironment();
  const plan = await loadCanonicalMigrationPlan({ root });
  assert(plan.executableMigrationNames[31] === "0032_teacher_feedback_notes.sql", "Executable 0032 must be teacher feedback notes.");
  assert(plan.blockedMigrationNames.includes("0032_google_account_links.sql"), "Google account links 0032 must remain excluded.");
  const sourceModel = await loadSourceModel(plan);
  const client = new Client({
    connectionString: process.env.PDF50_LOCAL_DATABASE_URL,
    connectionTimeoutMillis: 5000,
    query_timeout: 60000,
  });
  await client.connect();
  try {
    if (mode === "status") {
      const status = await buildStatus(client, plan, sourceModel);
      const classification = baselineValid(status)
        ? "LOCAL_CLONE_BASELINE_VALIDATED"
        : (reconciledValid(status) ? "LOCAL_CLONE_HISTORY_RECONCILED_THROUGH_0048" : "LOCAL_CLONE_BASELINE_FAILED");
      console.log(JSON.stringify({
        classification,
        localEnvironment,
        status,
        providerCalls: 0,
      }, null, 2));
      if (classification === "LOCAL_CLONE_BASELINE_FAILED") process.exitCode = 2;
      return;
    }

    const result = await repair(client, plan, sourceModel);
    console.log(JSON.stringify({
      localEnvironment,
      ...result,
    }, null, 2));
    if (result.finalClassification !== "LOCAL_CLONE_HISTORY_RECONCILED_THROUGH_0048") {
      process.exitCode = 2;
    }
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.log(JSON.stringify({
    finalClassification: "BLOCKED_BY_LOCAL_ENVIRONMENT",
    safeErrorType: error.code || error.name || "Error",
    providerCalls: 0,
  }, null, 2));
  process.exit(2);
});
