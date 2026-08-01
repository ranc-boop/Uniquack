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

assert(plan.directoryMigrationNames.length === 76, "Raw clean source must contain 76 SQL files.");
assert(plan.executableMigrationNames.length === 75, "Executable clean chain must contain 75 migrations.");
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

for (let number = 44; number <= 75; number += 1) {
  const filename = plan.executableMigrationNames[number - 1];
  const entry = plan.inventoryByFilename.get(filename);
  assert(migrationNumber(filename) === number, `Position ${number} has the wrong migration number.`);
  assert(entry?.migrationNumber === number, `${filename} is missing its registered number.`);
  assert(entry?.classification === "CANONICAL_EXECUTABLE", `${filename} is not canonical executable.`);
  assert(entry?.expectedOrder === number, `${filename} has the wrong expected order.`);
}

assert(
  plan.executableMigrationNames.at(-16) === "0060_question_management_read_models.sql" &&
    plan.executableMigrationNames.at(-15) ===
      "0061_question_taxonomy_search_materialization.sql" &&
    plan.executableMigrationNames.at(-14) ===
      "0062_teacher_bank_import_workspace_read_model.sql" &&
    plan.executableMigrationNames.at(-13) ===
      "0063_admin_ai_pdf_workspace_read_model.sql" &&
    plan.executableMigrationNames.at(-12) ===
      "0064_admin_ai_pdf_workspace_read_model_item_scan_fix.sql" &&
    plan.executableMigrationNames.at(-11) ===
      "0065_disable_slow_admin_ai_pdf_workspace_read_model.sql" &&
    plan.executableMigrationNames.at(-10) ===
      "0066_strict_bank_review_lineage_gate.sql" &&
    plan.executableMigrationNames.at(-9) ===
      "0067_teacher_bulk_review_and_question_management.sql" &&
    plan.executableMigrationNames.at(-8) ===
      "0068_assignment_creation_idempotency.sql" &&
    plan.executableMigrationNames.at(-7) ===
      "0069_assignment_creation_idempotency_receipt_fix.sql" &&
    plan.executableMigrationNames.at(-6) ===
      "0070_simplify_teacher_approval_and_question_delete.sql" &&
    plan.executableMigrationNames.at(-5) ===
      "0071_repair_bank_import_review_lineage.sql" &&
    plan.executableMigrationNames.at(-4) === "0072_practice_cycle_reset.sql" &&
    plan.executableMigrationNames.at(-3) === "0073_practice_ai_request_admission.sql" &&
    plan.executableMigrationNames.at(-2) === "0074_practice_ai_request_admission_time_fix.sql" &&
    plan.executableMigrationNames.at(-1) === "0075_practice_ai_inflight_leases.sql" &&
    plan.manifest.latestActivePrefix === 75,
  "Practice AI in-flight leases 0075 must be the canonical tail.",
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
console.log("PASS canonical registrations 0044-0075 are ordered and complete");
console.log("PASS fresh-chain enumeration is manifest-driven with canonical head 0075");
console.log("PASS legacy migrations are absent from the executable plan");
