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

assert(plan.directoryMigrationNames.length === 70, "Raw clean source must contain 70 SQL files.");
assert(plan.executableMigrationNames.length === 69, "Executable clean chain must contain 69 migrations.");
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

for (let number = 44; number <= 69; number += 1) {
  const filename = plan.executableMigrationNames[number - 1];
  const entry = plan.inventoryByFilename.get(filename);
  assert(migrationNumber(filename) === number, `Position ${number} has the wrong migration number.`);
  assert(entry?.migrationNumber === number, `${filename} is missing its registered number.`);
  assert(entry?.classification === "CANONICAL_EXECUTABLE", `${filename} is not canonical executable.`);
  assert(entry?.expectedOrder === number, `${filename} has the wrong expected order.`);
}

assert(
  plan.executableMigrationNames.at(-10) === "0060_question_management_read_models.sql" &&
    plan.executableMigrationNames.at(-9) ===
      "0061_question_taxonomy_search_materialization.sql" &&
    plan.executableMigrationNames.at(-8) ===
      "0062_teacher_bank_import_workspace_read_model.sql" &&
    plan.executableMigrationNames.at(-7) ===
      "0063_admin_ai_pdf_workspace_read_model.sql" &&
    plan.executableMigrationNames.at(-6) ===
      "0064_admin_ai_pdf_workspace_read_model_item_scan_fix.sql" &&
    plan.executableMigrationNames.at(-5) ===
      "0065_disable_slow_admin_ai_pdf_workspace_read_model.sql" &&
    plan.executableMigrationNames.at(-4) ===
      "0066_strict_bank_review_lineage_gate.sql" &&
    plan.executableMigrationNames.at(-3) ===
      "0067_teacher_bulk_review_and_question_management.sql" &&
    plan.executableMigrationNames.at(-2) ===
      "0068_assignment_creation_idempotency.sql" &&
    plan.executableMigrationNames.at(-1) ===
      "0069_assignment_creation_idempotency_receipt_fix.sql" &&
    plan.manifest.latestActivePrefix === 69,
  "Assignment receipt correction 0069 must follow idempotency foundation 0068.",
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
console.log("PASS canonical registrations 0044-0069 are ordered and complete");
console.log("PASS fresh-chain enumeration is manifest-driven with canonical head 0069");
console.log("PASS legacy migrations are absent from the executable plan");
