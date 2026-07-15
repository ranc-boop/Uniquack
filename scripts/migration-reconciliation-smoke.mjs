import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const root = resolve(__dirname, "..");
const cleanMigrationDirectory = resolve(root, "supabase/clean-migrations");
const manifestPath = resolve(root, "docs/security/live-schema-manifest.json");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function prefixOf(filename) {
  const match = /^(\d{4})_/.exec(filename);
  assert(match, `Clean migration filename is missing a four-digit prefix: ${filename}`);
  return Number(match[1]);
}

function sha256(content) {
  return createHash("sha256").update(content).digest("hex");
}

async function read(relativePath) {
  return readFile(resolve(root, relativePath), "utf8");
}

const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const migrationNames = (await readdir(cleanMigrationDirectory))
  .filter((name) => name.endsWith(".sql"))
  .sort();
const blockedMigrationNames = new Set(
  manifest.blockedMigrations.map((entry) => entry.filename),
);
const activeMigrationNames = migrationNames.filter((name) => !blockedMigrationNames.has(name));

assert(
  manifest.canonicalMigrationDirectory === "supabase/clean-migrations",
  "Only supabase/clean-migrations may be canonical.",
);
assert(
  manifest.legacyMigrationDirectory === "supabase/migrations",
  "Legacy migration directory must remain explicitly non-canonical.",
);
assert(
  blockedMigrationNames.has("0032_google_account_links.sql"),
  "Unapproved Google 0032 must remain blocked in the reconciliation manifest.",
);

const registeredNames = new Set(manifest.migrationInventory.map((entry) => entry.filename));
assert(
  migrationNames.length === registeredNames.size && migrationNames.every((name) => registeredNames.has(name)),
  "Every clean migration must have a reconciliation register entry; files alone do not prove application.",
);

const activePrefixes = new Map();
for (const name of activeMigrationNames) {
  const prefix = prefixOf(name);
  const names = activePrefixes.get(prefix) ?? [];
  names.push(name);
  activePrefixes.set(prefix, names);
}
for (const [prefix, names] of activePrefixes) {
  assert(names.length === 1, `Duplicate active migration prefix ${prefix}: ${names.join(", ")}`);
}

const allPrefixes = [...new Set(migrationNames.map(prefixOf))].sort((left, right) => left - right);
for (let expected = allPrefixes[0]; expected <= allPrefixes.at(-1); expected += 1) {
  assert(allPrefixes.includes(expected), `Migration prefix gap requires an explicit owner decision: ${expected}`);
}
assert(
  activePrefixes.get(manifest.latestActivePrefix)?.length === 1,
  "Latest active migration prefix must be unique.",
);
assert(
  !manifest.activeApplyPlan.includes("0032_google_account_links.sql"),
  "Blocked Google 0032 must not be included in the active apply plan.",
);

for (const [filename, expectedHash] of Object.entries(manifest.frozenMigrationHashes)) {
  const content = await readFile(resolve(cleanMigrationDirectory, filename), "utf8");
  assert(
    sha256(content) === expectedHash,
    `${filename} changed after its reviewed historical application; correct forward-only.`,
  );
}

for (const entry of manifest.migrationInventory) {
  assert(entry.status, `Missing reconciliation status for ${entry.filename}`);
  assert(entry.applicationMethod, `Missing application method for ${entry.filename}`);
  assert(
    entry.evidenceSource && !/file exists|repository presence/i.test(entry.evidenceSource),
    `Application evidence for ${entry.filename} cannot be inferred from the file alone.`,
  );
}

const canonicalSql = await Promise.all(
  migrationNames.map(async (name) => readFile(resolve(cleanMigrationDirectory, name), "utf8")),
);
const canonicalText = canonicalSql.join("\n");
const rlsTables = [...canonicalText.matchAll(/alter table public\.([a-z_]+) enable row level security;/gi)]
  .map((match) => match[1])
  .sort();
for (const tableName of rlsTables) {
  assert(
    new RegExp(`create policy [^\\n]+\\s+on public\\.${tableName}\\s+for`, "i").test(canonicalText),
    `RLS-enabled table public.${tableName} is missing an explicit canonical policy inventory.`,
  );
}

for (const match of canonicalText.matchAll(/create or replace function[\s\S]*?\$\$;/gi)) {
  const definition = match[0];
  if (/security definer/i.test(definition)) {
    assert(
      /set search_path\s*=\s*[a-z_ ,]+/i.test(definition),
      "Every canonical security-definer function must declare a fixed search_path.",
    );
  }
}

const manifestText = JSON.stringify(manifest);
for (const forbiddenPattern of [
  /api[_-]?key\s*[:=]\s*[A-Za-z0-9_-]{16,}/i,
  /postgres(?:ql)?:\/\//i,
  /service[_-]?role\s*[:=]\s*[A-Za-z0-9_-]{16,}/i,
  /eyJ[A-Za-z0-9_-]{20,}/,
]) {
  assert(!forbiddenPattern.test(manifestText), "Schema manifest contains credential-like material.");
}

const smokeAll = await read("scripts/smoke-all.mjs");
const aggregateHarnesses = [...smokeAll.matchAll(/await import\("\.\/([^\"]+)"\);/g)].map(
  (match) => `scripts/${match[1]}`,
);
const releaseControlFiles = [
  "scripts/smoke-all.mjs",
  "scripts/security-smoke.mjs",
  "scripts/supabase-rls-smoke.mjs",
  ...aggregateHarnesses,
];
const releaseControlViolations = [];
for (const filename of releaseControlFiles) {
  const content = await read(filename);
  if (/\b(?:read|readFile|readdir|readDir)\s*\([^)]*["']supabase\/migrations(?:\/|["'])/i.test(content)) {
    releaseControlViolations.push(`${filename} consumes legacy supabase/migrations`);
  }
}

for (const blockedGoogleSmoke of [
  "google-account-links-baseline-smoke",
  "google-account-links-apply-smoke",
  "google-account-links-rls-smoke",
]) {
  if (smokeAll.includes(blockedGoogleSmoke)) {
    releaseControlViolations.push(
      `scripts/smoke-all.mjs includes blocked Google 0032 apply tooling: ${blockedGoogleSmoke}`,
    );
  }
}

assert(
  releaseControlViolations.length === 0,
  `Release-control violations require a forward review decision:\n- ${releaseControlViolations.join("\n- ")}`,
);

const unreviewedDrift = manifest.knownLiveDrift.filter((entry) => !entry.ownerDecision);
if (process.argv.includes("--require-live-reconciliation")) {
  assert(
    manifest.captureStatus === "COMPLETE" && unreviewedDrift.length === 0,
    "Live/repository reconciliation is blocked by incomplete metadata capture or unreviewed security drift.",
  );
}

console.log(`PASS canonical migration inventory: ${migrationNames.length} files, ${activeMigrationNames.length} active`);
console.log("PASS blocked Google 0032 is excluded from the active apply plan");
console.log(`PASS canonical RLS policy inventory: ${rlsTables.length} tables`);
console.log("PASS historical 0039-0041 hashes remain unchanged");
console.log(
  `STATUS ${manifest.captureStatus}: ${unreviewedDrift.length} known live authorization object(s) await owner decision`,
);
