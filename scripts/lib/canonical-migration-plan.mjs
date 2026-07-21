import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

export function migrationNumber(filename) {
  const match = /^(\d{4})_/.exec(filename);
  assert(match, `Migration filename is missing a four-digit prefix: ${filename}`);
  return Number(match[1]);
}

export async function loadCanonicalMigrationPlan({ root }) {
  const manifestPath = resolve(root, "docs/security/live-schema-manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const cleanDirectory = resolve(root, manifest.canonicalMigrationDirectory);
  const directoryMigrationNames = (await readdir(cleanDirectory))
    .filter((name) => name.endsWith(".sql"))
    .sort();
  const executableMigrationNames = [...manifest.activeApplyPlan];
  const blockedMigrationNames = manifest.blockedMigrations.map(
    (entry) => entry.filename,
  );
  const executableSet = new Set(executableMigrationNames);
  const blockedSet = new Set(blockedMigrationNames);
  const inventoryByFilename = new Map(
    manifest.migrationInventory.map((entry) => [entry.filename, entry]),
  );

  assert(
    manifest.canonicalMigrationDirectory === "supabase/clean-migrations",
    "Canonical migration source must remain supabase/clean-migrations.",
  );
  assert(
    manifest.legacyMigrationDirectory === "supabase/migrations",
    "Legacy migrations must remain explicitly noncanonical.",
  );
  assert(
    executableSet.size === executableMigrationNames.length,
    "Executable migration plan contains a duplicate filename.",
  );
  assert(
    blockedSet.size === blockedMigrationNames.length,
    "Blocked migration register contains a duplicate filename.",
  );

  for (const name of directoryMigrationNames) {
    assert(
      executableSet.has(name) !== blockedSet.has(name),
      `Every clean migration must be exactly executable or explicitly excluded: ${name}`,
    );
    assert(inventoryByFilename.has(name), `Migration is missing from the register: ${name}`);
  }
  for (const name of [...executableMigrationNames, ...blockedMigrationNames]) {
    assert(
      directoryMigrationNames.includes(name),
      `Migration manifest references a missing clean SQL file: ${name}`,
    );
  }

  const executableNumbers = executableMigrationNames.map(migrationNumber);
  for (let index = 0; index < executableNumbers.length; index += 1) {
    const expected = index + 1;
    assert(
      executableNumbers[index] === expected,
      `Executable migration position ${expected} must contain canonical ${String(expected).padStart(4, "0")}.`,
    );
  }
  assert(
    executableNumbers.at(-1) === manifest.latestActivePrefix,
    "Manifest head must match the final executable migration.",
  );

  const rawPrefixGroups = new Map();
  for (const name of directoryMigrationNames) {
    const number = migrationNumber(name);
    const names = rawPrefixGroups.get(number) ?? [];
    names.push(name);
    rawPrefixGroups.set(number, names);
  }
  const duplicateRawPrefixes = [...rawPrefixGroups.entries()]
    .filter(([, names]) => names.length > 1)
    .map(([number, names]) => ({ number, names }));
  for (const duplicate of duplicateRawPrefixes) {
    const executableAtPosition = duplicate.names.filter((name) => executableSet.has(name));
    assert(
      executableAtPosition.length === 1,
      `Duplicate raw prefix ${duplicate.number} must have exactly one executable migration.`,
    );
    for (const name of duplicate.names) {
      if (!executableSet.has(name)) {
        assert(
          blockedSet.has(name),
          `Non-executable duplicate migration must be explicitly excluded: ${name}`,
        );
      }
    }
  }

  for (const [index, name] of executableMigrationNames.entries()) {
    const entry = inventoryByFilename.get(name);
    if (entry.migrationNumber != null) {
      assert(entry.migrationNumber === migrationNumber(name), `${name} has the wrong registered number.`);
    }
    if (entry.classification != null) {
      assert(entry.classification === "CANONICAL_EXECUTABLE", `${name} has the wrong classification.`);
    }
    if (entry.expectedOrder != null) {
      assert(entry.expectedOrder === index + 1, `${name} has the wrong executable order.`);
    }
  }
  for (const name of blockedMigrationNames) {
    const entry = inventoryByFilename.get(name);
    if (entry.classification != null) {
      assert(entry.classification === "EXCLUDED_NONEXECUTABLE", `${name} must remain excluded.`);
    }
    assert(entry.expectedOrder == null, `${name} cannot occupy an executable sequence position.`);
  }

  return {
    blockedMigrationNames,
    cleanDirectory,
    directoryMigrationNames,
    duplicateRawPrefixes,
    executableMigrationNames,
    inventoryByFilename,
    manifest,
  };
}

export function assertCanonicalMigrationExecutable(plan, filename) {
  if (plan.blockedMigrationNames.includes(filename)) {
    throw new Error(`Migration is explicitly excluded from execution: ${filename}`);
  }
  if (!plan.executableMigrationNames.includes(filename)) {
    throw new Error(`Migration is not in the canonical executable plan: ${filename}`);
  }
}
