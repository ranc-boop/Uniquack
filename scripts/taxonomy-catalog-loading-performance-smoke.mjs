import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const root = process.cwd();
const [migration, loader] = await Promise.all([
  readFile(
    resolve(
      root,
      "supabase/clean-migrations/0060_question_management_read_models.sql",
    ),
    "utf8",
  ),
  readFile(resolve(root, "src/lib/tags/taxonomy-db.ts"), "utf8"),
]);

assert(
  migration.includes(
    "create or replace function public.get_active_taxonomy_catalog_v1()",
  ) &&
    migration.includes("security invoker") &&
    migration.includes("set search_path = ''") &&
    !migration.includes("security definer"),
  "Taxonomy read model must remain a fixed-search-path SECURITY INVOKER function.",
);

assert(
  migration.includes(
    "revoke all on function public.get_active_taxonomy_catalog_v1()",
  ) &&
    migration.includes("from public, anon, authenticated, service_role") &&
    migration.includes("to anon, authenticated, service_role"),
  "Taxonomy read model must expose only the reviewed read-only roles.",
);

assert(
  migration.includes(
    "create or replace function public.list_teacher_question_bank_summaries_v1()",
  ) &&
    migration.includes("member.user_id = (select auth.uid())") &&
    migration.match(/security invoker/g)?.length === 2 &&
    migration.match(/set search_path = ''/g)?.length === 2 &&
    !migration.includes("p_profile_id"),
  "Teacher Library summaries must derive current-user scope inside a SECURITY INVOKER read model.",
);

assert(
  migration.includes(
    "revoke all on function public.list_teacher_question_bank_summaries_v1()",
  ) &&
    migration.includes(
      "grant execute on function public.list_teacher_question_bank_summaries_v1()",
    ),
  "Teacher Library summary execution must be explicitly revoked and re-granted.",
);

assert(
  loader.includes(
    'await supabase.rpc("get_active_taxonomy_catalog_v1")',
  ) &&
    loader.indexOf('await supabase.rpc("get_active_taxonomy_catalog_v1")') <
      loader.indexOf('.from("taxonomy_facets")') &&
    loader.includes("isMissingCatalogRpcError"),
  "Taxonomy loading must prefer one read-model RPC and keep a missing-migration fallback.",
);

console.log(
  "PASS taxonomy catalog loads through one versioned SECURITY INVOKER read model",
);
