import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { loadCanonicalMigrationPlan } from "./lib/canonical-migration-plan.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const workdir = resolve(root, process.argv[2] ?? ".ci");
const supabaseDir = resolve(workdir, "supabase");
const migrationsDir = resolve(supabaseDir, "migrations");
const plan = await loadCanonicalMigrationPlan({ root });

await rm(migrationsDir, { recursive: true, force: true });
await mkdir(migrationsDir, { recursive: true });
for (const [index, filename] of plan.executableMigrationNames.entries()) {
  const suffix = filename.replace(/^\d{4}_/, "");
  const ciFilename = `${String(index + 1).padStart(14, "0")}_${suffix}`;
  const source = await readFile(resolve(plan.cleanDirectory, filename), "utf8");
  const materializedSql = /^lock\s+table\b/im.test(source)
    ? `begin;\n${source.trimEnd()}\ncommit;\n`
    : source;
  await writeFile(resolve(migrationsDir, ciFilename), materializedSql, "utf8");
}
await writeFile(resolve(supabaseDir, "seed.sql"), "-- CI fixtures are seeded through the local Auth admin API.\n", "utf8");
console.log(`PASS materialized ${plan.executableMigrationNames.length} canonical migrations`);
