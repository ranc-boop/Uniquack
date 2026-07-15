import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const root = resolve(dirname(__filename), "..");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function read(relativePath) {
  return readFile(resolve(root, relativePath), "utf8");
}

function exportedFunction(source, name) {
  const start = source.indexOf(`export async function ${name}`);
  assert(start >= 0, `Missing server action ${name}`);
  const next = source.indexOf("\nexport async function ", start + 1);
  return source.slice(start, next >= 0 ? next : undefined);
}

const [
  migration,
  canonicalProviderMigration,
  profiles,
  gatewayToken,
  adminActions,
  adminPage,
  routing,
  worker,
  databaseTypes,
] = await Promise.all([
  read("supabase/clean-migrations/0042_internal_provider_gateway_hardening.sql"),
  read("supabase/clean-migrations/0002_provider_profiles_and_operation_logs.sql"),
  read("src/lib/ai-providers/profiles.ts"),
  read("src/lib/ai-providers/gateway-token.ts"),
  read("src/app/admin/ai-settings/actions.ts"),
  read("src/app/admin/ai-settings/page.tsx"),
  read("src/lib/ai-providers/routing.ts"),
  read("src/lib/ai-jobs/worker.ts"),
  read("src/types/database.ts"),
]);

assert(
  migration.includes("drop policy if exists ai_provider_profiles_ai_router_read") &&
    migration.includes("drop function if exists private.has_ai_router_provider_access()"),
  "0042 must remove the untracked request-header policy and helper path",
);
assert(
  migration.includes("drop policy if exists ai_provider_profiles_staff_read") &&
    migration.includes("drop policy if exists ai_provider_profiles_admin_write") &&
    migration.includes(
      "revoke all privileges on table public.ai_provider_profiles from public, anon, authenticated",
    ) &&
    migration.includes("grant all privileges on table public.ai_provider_profiles to service_role"),
  "0042 must remove browser-role provider-table access while preserving trusted service-role access",
);
assert(
  migration.includes("drop function if exists public.get_ai_provider_profile_for_gateway(text, uuid)") &&
    !migration.includes("api_key_ciphertext") &&
    !migration.includes("api_key_iv") &&
    !migration.includes("api_key_tag") &&
    !migration.includes("credential_ref"),
  "0042 must retire the credential-returning RPC without introducing a new credential projection",
);
assert(
  migration.includes("create or replace function public.list_ai_provider_profiles_for_gateway") &&
    migration.includes("create or replace function public.list_enabled_ai_provider_profiles_for_gateway") &&
    migration.includes("private.verify_ai_provider_gateway(gateway_token)") &&
    migration.includes("grant execute on function public.list_ai_provider_profiles_for_gateway(text) to authenticated") &&
    migration.includes("grant execute on function public.list_enabled_ai_provider_profiles_for_gateway(text) to authenticated") &&
    migration.includes("grant execute on function public.create_ai_provider_profile_for_gateway") &&
    migration.includes("grant execute on function public.update_ai_provider_profile_for_gateway") &&
    migration.includes("grant execute on function public.delete_ai_provider_profile_for_gateway") &&
    migration.includes("grant execute on function public.upsert_ai_provider_routing_policy_for_gateway"),
  "0042 must preserve only reviewed, token-guarded Admin gateway RPC access",
);
assert(
  canonicalProviderMigration.includes("private.is_super_admin()") &&
    canonicalProviderMigration.includes("token.status = 'active'") &&
    canonicalProviderMigration.includes("extensions.digest") &&
    canonicalProviderMigration.includes("gateway_token text"),
  "gateway verification must require both an active super-admin context and an active token digest",
);

const safeType = profiles.slice(
  profiles.indexOf("export type SafeAIProviderProfile"),
  profiles.indexOf("export async function listSafeAIProviderProfiles"),
);
const trustedResolver = profiles.slice(
  profiles.indexOf("export async function listEnabledAIProviderProfilesForServerUse"),
  profiles.indexOf("export async function clearDefaultProfile"),
);
assert(
  !safeType.includes("api_key_ciphertext") &&
    !safeType.includes("api_key_iv") &&
    !safeType.includes("api_key_tag") &&
    !safeType.includes("credential_ref") &&
    profiles.includes("const safeProviderProfileSelect") &&
    !profiles.slice(
      profiles.indexOf("const safeProviderProfileSelect"),
      profiles.indexOf("export async function listSafeAIProviderProfiles"),
    ).includes("api_key_ciphertext"),
  "safe provider metadata must use an explicit credential-free allowlist",
);
assert(
  trustedResolver.includes("listSafeAIProviderProfilesWithServiceRole") &&
    trustedResolver.includes("loadAIProviderProfileForUseWithServiceRole") &&
    !trustedResolver.includes("gateway_token") &&
    !trustedResolver.includes("requireAIProviderGatewayToken") &&
    !trustedResolver.includes("get_ai_provider_profile_for_gateway"),
  "trusted server and worker resolution must use service role directly, never a gateway-first credential RPC",
);
assert(
  profiles.includes("export async function loadAIProviderProfileForUse") &&
    profiles.includes("return loadAIProviderProfileForUseWithServiceRole(profileId)") &&
    !profiles.includes("get_ai_provider_profile_for_gateway"),
  "legacy server-only provider callers must resolve through service role rather than retain the retired credential RPC",
);
assert(
  gatewayToken.startsWith('import "server-only";') &&
    gatewayToken.includes("process.env.AI_PROVIDER_GATEWAY_TOKEN") &&
    !gatewayToken.includes("NEXT_PUBLIC"),
  "the gateway token helper must remain server-only and non-public",
);
assert(
  !profiles.includes("get_ai_provider_profile_for_gateway") &&
    !adminActions.includes("get_ai_provider_profile_for_gateway") &&
    !databaseTypes.includes("get_ai_provider_profile_for_gateway"),
  "no runtime or generated client contract may retain the credential-returning gateway RPC",
);

for (const actionName of [
  "createAIProviderProfile",
  "testNewAIProviderConnection",
  "updateAIProviderProfile",
  "testSavedAIProviderConnection",
  "deleteAIProviderProfile",
  "saveAIProviderRoutingPolicy",
  "saveAIOperationsControl",
  "resetAIProviderCircuit",
  "setAIOperationPause",
  "cancelQueuedAIJobAsAdmin",
]) {
  assert(
    exportedFunction(adminActions, actionName).includes("requireSuperAdmin()"),
    `${actionName} must remain super-admin gated`,
  );
}
assert(
  adminActions.startsWith('"use server";') &&
    adminActions.includes("loadAIProviderProfileForServerUse") &&
    adminActions.includes("saved.apiKey") &&
    !adminActions.includes("decryptSecret") &&
    adminPage.includes("await requireSuperAdmin()") &&
    adminPage.includes("listSafeAIProviderProfiles(supabase)") &&
    !adminPage.includes("api_key_ciphertext") &&
    !adminPage.includes("api_key_iv") &&
    !adminPage.includes("api_key_tag") &&
    !adminPage.includes("credential_ref") &&
    !adminPage.includes("AI_PROVIDER_GATEWAY_TOKEN"),
  "Admin Settings must gate actions first and receive only safe metadata while saved-key tests decrypt in server memory",
);
assert(
  routing.includes("listEnabledAIProviderProfilesForServerUse()") &&
    routing.includes("loadAIProviderProfileForServerUse({") &&
    worker.includes("supabase = createServiceRoleClient()") &&
    worker.includes("resolveAIProviderRoute") &&
    worker.includes("runWithAIProviderRoute") &&
    !worker.includes("AI_PROVIDER_GATEWAY_TOKEN"),
  "durable workers must keep their service-role queue/routing path without receiving gateway-token access",
);
assert(
  !adminActions.includes("console.log") &&
    !profiles.includes("console.log") &&
    !routing.includes("console.log") &&
    !worker.includes("api_key_ciphertext"),
  "provider control-plane sources must not log raw credentials or encrypted provider fields",
);

console.log("PASS internal provider gateway hardening smoke");
