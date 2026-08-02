#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = await readFile(
  resolve(root, "scripts/official-public-library-0076-hosted-apply.mjs"),
  "utf8",
);
const manifest = JSON.parse(
  await readFile(resolve(root, "docs/security/live-schema-manifest.json"), "utf8"),
);
const evidence = await readFile(
  resolve(root, "docs/security/official-public-library-0076-hosted-apply-evidence.md"),
  "utf8",
);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

for (const contract of [
  'OFFICIAL_PUBLIC_LIBRARY_HOSTED_APPLY_GATE',
  'AUTHORIZED_EXACTLY_ONCE',
  'DISPOSABLE_SUPABASE_PROJECT_REF',
  'SUPABASE_DB_PASSWORD',
  '0076_official_public_library_two_state_approval.sql',
  'PARTIAL_OR_WRONG_BASELINE',
  'assertReleaseManifest',
  'PARTIALLY_CAPTURED_PROVIDER_GATEWAY_POST_0042',
  'begin transaction isolation level repeatable read',
  'rollback preflight',
  'assertCatalog',
  'assertDataMapping',
  'assertRollbackOnlyRoleMatrix',
  'dataApiSchemaCacheProbe',
  'PGRST202',
]) {
  assert(source.includes(contract), `0076 hosted apply harness is missing ${contract}.`);
}

assert(
  /process\.env\[applyGateName\] !== applyGateValue/.test(source),
  "Hosted commit must fail closed without the exact apply gate.",
);
assert(
  source.indexOf('await client.query("rollback")') < source.indexOf('await client.query("commit")'),
  "Rollback preflight must precede the hosted commit.",
);
assert(
  /process\.argv\.includes\("--preflight"\)[\s\S]*process\.exitCode = 0/.test(source),
  "Preflight-only mode must succeed without authorizing a commit.",
);
assert(
  !/console\.(?:log|error)\([^\n]*(?:serviceKey|databasePassword|projectRef)/.test(source),
  "Hosted harness must not print target credentials or identity values.",
);
const manifestEntry = manifest.migrationInventory.find(
  (entry) => entry.filename === "0076_official_public_library_two_state_approval.sql",
);
assert(
  manifestEntry?.status === "APPLIED_MANUALLY_NOT_LEDGERED" &&
    evidence.includes("APPLIED AND VALIDATED") &&
    evidence.includes("never claim migration-ledger history"),
  "0076 release evidence must record the direct hosted apply without fabricating ledger history.",
);

console.log("PASS 0076 hosted apply requires exact target, rollback preflight, and explicit commit gate");
console.log("PASS 0076 hosted validation covers catalog, data preservation, roles, and schema cache");
console.log("PASS 0076 direct hosted apply is registered without migration-ledger claims");
