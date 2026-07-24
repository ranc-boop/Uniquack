import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  assertCanonicalMigrationExecutable,
  loadCanonicalMigrationPlan,
  migrationNumber,
} from "./lib/canonical-migration-plan.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const plan = await loadCanonicalMigrationPlan({ root });

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(plan.directoryMigrationNames.length === 54, "Raw clean source must contain 54 SQL files.");
assert(plan.executableMigrationNames.length === 53, "Executable clean chain must contain 53 migrations.");
assert(
  plan.duplicateRawPrefixes.length === 1 &&
    plan.duplicateRawPrefixes[0]?.number === 32,
  "Raw duplicate migration numbers must be detected explicitly.",
);
assert(
  plan.executableMigrationNames[31] === "0032_teacher_feedback_notes.sql",
  "Teacher feedback notes must be the only executable migration at position 0032.",
);
assert(
  plan.blockedMigrationNames.length === 1 &&
    plan.blockedMigrationNames[0] === "0032_google_account_links.sql",
  "Google account links must remain the exact excluded 0032.",
);

let blockedGoogle = false;
try {
  assertCanonicalMigrationExecutable(plan, "0032_google_account_links.sql");
} catch {
  blockedGoogle = true;
}
assert(blockedGoogle, "Excluded Google 0032 must fail closed in executable tooling.");

for (let number = 44; number <= 53; number += 1) {
  const filename = plan.executableMigrationNames[number - 1];
  const entry = plan.inventoryByFilename.get(filename);
  assert(migrationNumber(filename) === number, `Position ${number} has the wrong migration number.`);
  assert(entry?.migrationNumber === number, `${filename} is missing its registered number.`);
  assert(entry?.classification === "CANONICAL_EXECUTABLE", `${filename} is not canonical executable.`);
  assert(entry?.expectedOrder === number, `${filename} has the wrong expected order.`);
}

assert(
  plan.executableMigrationNames.at(-2) === "0052_practice_library_scope_and_inventory.sql" &&
    plan.executableMigrationNames.at(-1) === "0053_practice_session_source_rpc_ambiguity_fix.sql" &&
    plan.manifest.latestActivePrefix === 53,
  "Practice source RPC ambiguity fix 0053 must follow Practice Library scope 0052.",
);
assert(
  plan.manifest.canonicalMigrationDirectory === "supabase/clean-migrations" &&
    plan.manifest.legacyMigrationDirectory === "supabase/migrations" &&
    !plan.executableMigrationNames.some((name) => name.includes("/") || name.includes("\\")),
  "Executable migration names must resolve only inside the canonical clean directory.",
);

for (const filename of [
  "scripts/google-account-links-baseline-smoke.mjs",
  "scripts/google-account-links-apply-smoke.mjs",
  "scripts/google-account-links-rls-smoke.mjs",
  "scripts/migration-reconciliation-smoke.mjs",
]) {
  const source = await readFile(resolve(root, filename), "utf8");
  assert(source.includes("canonical-migration-plan.mjs"), `${filename} must use the manifest loader.`);
  assert(!source.includes("readdirSync(cleanDir)"), `${filename} cannot execute a raw directory glob.`);
}

console.log("PASS raw duplicate 0032 is detected and explicitly classified");
console.log("PASS executable 0032 is teacher feedback notes; Google 0032 is excluded");
console.log("PASS canonical registrations 0044-0053 are ordered and complete");
console.log("PASS fresh-chain enumeration is manifest-driven with canonical head 0053");
console.log("PASS legacy migrations are absent from the executable plan");
