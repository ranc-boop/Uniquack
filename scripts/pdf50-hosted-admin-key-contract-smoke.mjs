import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const gatePath = resolve(root, "scripts", "pdf50-hosted-final-admission-gate.mjs");
const source = await readFile(gatePath, "utf8");

function assert(condition, message) {
  if (!condition) throw new Error(`pdf50_hosted_admin_key_contract:${message}`);
}

function functionSource(name) {
  const start = source.indexOf(`function ${name}(`);
  assert(start >= 0, `missing_${name}`);
  const end = source.indexOf("\nfunction ", start + 1);
  return source.slice(start, end < 0 ? source.length : end);
}

function assertIncludes(value, expected, message) {
  assert(value.includes(expected), message);
}

function assertBefore(first, second, message) {
  const firstIndex = source.indexOf(first);
  const secondIndex = source.indexOf(second);
  assert(firstIndex >= 0 && secondIndex >= 0 && firstIndex < secondIndex, message);
}

const jwtPayloadSource = functionSource("jwtPayloadIfJwtKey");
const adminClassifierSource = functionSource("classifyAdminKey");
const clientFactorySource = functionSource("makeSupabaseClient");
const serviceClientSource = functionSource("serviceClient");
const mainSource = functionSource("main");

// New secret keys deliberately bypass JWT parsing and use the bounded probe below.
assertIncludes(
  jwtPayloadSource,
  'if (String(key ?? "").startsWith("sb_secret_")) return null;',
  "new_secret_jwt_decode_not_bypassed",
);
assertIncludes(adminClassifierSource, 'value.startsWith("sb_secret_")', "new_secret_not_recognized");
assertIncludes(adminClassifierSource, 'format: "NEW_SECRET"', "new_secret_format_missing");
assertIncludes(
  adminClassifierSource,
  'value.length >= 32 && !/\\s/.test(value)',
  "new_secret_not_opaque_or_bounded",
);
assertIncludes(
  adminClassifierSource,
  'value.startsWith("sb_publishable_")',
  "publishable_key_branch_missing",
);
assertIncludes(
  adminClassifierSource,
  '"admin_key_publishable_rejected"',
  "publishable_key_not_rejected",
);
assertIncludes(
  adminClassifierSource,
  '"admin_key_anon_jwt_rejected"',
  "legacy_anon_jwt_not_rejected",
);
assertIncludes(
  adminClassifierSource,
  'payload.role === "service_role"',
  "legacy_service_role_not_required",
);
assertIncludes(
  adminClassifierSource,
  'format: "LEGACY_SERVICE_ROLE_JWT"',
  "legacy_service_role_format_missing",
);
assertIncludes(adminClassifierSource, '"admin_key_malformed"', "malformed_admin_key_not_rejected");
assertIncludes(adminClassifierSource, '"admin_key_wrong_role"', "unknown_admin_role_not_rejected");
assertIncludes(adminClassifierSource, 'payload.ref === expectedProjectRef', "wrong_project_not_rejected");

assertIncludes(mainSource, "admin: serviceClient()", "admin_context_not_service_key_only");
assertIncludes(
  serviceClientSource,
  "makeSupabaseClient(process.env[serviceRoleKeyEnvName])",
  "service_context_not_bound_to_backend_key",
);
assertIncludes(clientFactorySource, "autoRefreshToken: false", "backend_auto_refresh_not_disabled");
assertIncludes(clientFactorySource, "persistSession: false", "backend_session_persistence_not_disabled");
assertIncludes(
  clientFactorySource,
  "detectSessionInUrl: false",
  "backend_url_session_detection_not_disabled",
);

assertBefore(
  "result.adminAccessProbe = await runBoundedElevatedAdminProbe(context.admin);",
  "result.fixtures = await createSyntheticFixtures(context);",
  "fixtures_can_precede_elevated_key_probe",
);
assertIncludes(mainSource, "context.admin", "browser_or_ssr_client_can_replace_admin_context");

assertIncludes(source, "async function cleanup(context)", "exact_cleanup_missing");
assertIncludes(source, "cleanupResult = await cleanup(context);", "successful_run_cleanup_missing");
assertIncludes(source, "cleanupResult = await cleanup(context).catch", "failure_run_cleanup_missing");
assertIncludes(source, "providerCalls: 0", "provider_calls_not_pinned_to_zero");
assertIncludes(source, "providerCapability: \"absent\"", "provider_capability_guard_missing");
assertIncludes(source, "internalRouteNotInvoked: true", "worker_route_guard_missing");
assertIncludes(source, "workerLibraryNotImported: true", "worker_library_guard_missing");
assertIncludes(source, "No credential-bearing URL, project identifier", "safe_evidence_redaction_missing");
assert(
  !/(?:dotenv\.config|loadEnvConfig|loadEnvFile|readFile(?:Sync)?\([^\n]*\.env)/.test(source),
  "dotenv_or_env_file_loading_present",
);
assert(
  !/console\.log\([^\n]*(?:process\.env|serviceRoleKeyEnvName|databaseEnvName|apiUrlEnvName|error\.message)/.test(
    source,
  ),
  "raw_authorization_or_error_logging_present",
);

console.log("PASS pdf50_hosted_admin_key_contract_smoke");
