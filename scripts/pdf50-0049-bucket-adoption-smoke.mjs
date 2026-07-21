import { readdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { loadCanonicalMigrationPlan } from "./lib/canonical-migration-plan.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const migrationPath = resolve(
  root,
  "supabase/clean-migrations/0049_pdf50_burst_upload_admission.sql",
);
const migration = (await readFile(migrationPath, "utf8")).replace(/\r\n/g, "\n");
const plan = await loadCanonicalMigrationPlan({ root });

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const adoptionStart = migration.indexOf("do $$\ndeclare\n  existing_bucket storage.buckets%rowtype;");
const adoptionEnd = migration.indexOf("$$;", adoptionStart);
const adoption = migration.slice(adoptionStart, adoptionEnd + 3);
const droppedStoragePolicies = [
  ...migration.matchAll(/drop policy if exists\s+([a-z0-9_]+)\s+on storage\.objects;/gi),
].map((match) => match[1]);
const expectedDrops = new Set([
  "ai_import_sources_admin_upload",
  "ai_import_sources_admin_read",
  "ai_import_sources_admin_delete",
  "ai_import_sources_reserved_upload",
  "ai_import_sources_manager_read",
  "ai_import_sources_manager_delete",
  "question_assets_staff_upload",
  "question_assets_staff_list",
  "question_assets_staff_delete",
]);

assert(adoptionStart >= 0 && adoptionEnd > adoptionStart, "0049 must contain one explicit bucket-adoption block");
assert(adoption.includes("if not found then") && adoption.includes("insert into storage.buckets"), "absent bucket must use the canonical private create branch");
assert(adoption.includes("existing_bucket.name is distinct from 'ai-import-sources'"), "bucket identity must be exact before adoption");
assert(adoption.includes("existing_bucket.public is distinct from false"), "public buckets must fail closed");
assert(adoption.includes("existing_bucket.allowed_mime_types is distinct from canonical_mime_types"), "MIME contract must be exact before adoption");
assert(adoption.includes("existing_bucket.file_size_limit is null") && adoption.includes("existing_bucket.file_size_limit > canonical_file_size_limit"), "only unset or larger size limits may be tightened");
assert(adoption.includes("A smaller existing cap is stricter and is intentionally preserved."), "stricter existing size limits must remain intact");
assert((adoption.match(/raise exception 'AI import source bucket is incompatible with the required private PDF contract\.'/g) ?? []).length >= 3, "incompatible bucket branches must fail closed with bounded errors");
assert(!/on conflict\s*\(id\)\s*do\s+update/i.test(migration), "0049 must not silently overwrite a preexisting bucket");
assert(!/delete\s+from\s+storage\.buckets|drop\s+bucket|truncate\s+storage/i.test(migration), "0049 must not delete or recreate a bucket or its objects");
assert(!/public\s*=\s*true/i.test(migration), "0049 must never create or adopt a public source bucket");
assert(!/commit;|rollback;/i.test(migration), "0049 must remain a single migration transaction");
assert(droppedStoragePolicies.length === expectedDrops.size && droppedStoragePolicies.every((name) => expectedDrops.has(name)), "only allowlisted legacy, canonical PDF50, and scoped question-asset Storage policy names may be dropped");
assert(migration.includes("drop policy if exists ai_import_sources_admin_upload on storage.objects;") && migration.includes("drop policy if exists ai_import_sources_admin_read on storage.objects;") && migration.includes("drop policy if exists ai_import_sources_admin_delete on storage.objects;"), "the three known arbitrary-path legacy policies must be reconciled");
assert(migration.includes("from pg_policies") && migration.includes("unexpected_source_policy_count > 0") && migration.includes("AI import source storage policies require review before PDF50 migration."), "unexpected source-bucket policies must fail closed instead of being retained or broadly deleted");
assert(migration.includes("private.can_upload_reserved_ai_import_source_object(name)") && migration.includes("private.can_manage_ai_import_source_object(name)"), "canonical policies must retain exact-path helpers");
assert(migration.includes("private.can_write_question_asset_storage_object(bucket_id, name)") && migration.includes("private.can_read_question_asset_storage_object(bucket_id, name)"), "shared storage.objects question-asset policies must remain helper-scoped");
assert(migration.includes("if p_bucket_id <> 'question-assets' then"), "question-asset helper policies must fail closed for unrelated buckets");
assert(!/on storage\.objects for (?:insert|select|delete)\s+to\s+(?:anon|public)/i.test(migration), "Storage policies must not grant anonymous or public access");
assert(!/organization_members member/i.test(migration), "organization membership must not bypass Bank owner/editor authorization");
assert(plan.executableMigrationNames.length === 49 && plan.executableMigrationNames.at(-1) === "0049_pdf50_burst_upload_admission.sql", "0049 must remain the canonical active head");
assert(!(await readdir(resolve(root, "supabase/clean-migrations"))).some((name) => /^0050_/.test(name)), "a 0050 workaround must not be introduced");

console.log("PASS PDF50 0049 bucket-adoption source contract (absent/create, compatible/adopt, incompatible/fail-closed)");
