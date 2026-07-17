import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = await readFile(resolve(root, "scripts/student-assignment-practice-live-e2e.mjs"), "utf8");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

for (const required of [
  "DISPOSABLE_STUDENT_PRACTICE_E2E",
  "DELETE_STUDENT_PRACTICE_E2E_FIXTURES",
  "LOCAL_FAKE_HTTP_PROVIDER",
  "STUDENT_PRACTICE_E2E_EXPECTED_PROJECT_REF",
  "CLEAN_SUPABASE_SERVICE_ROLE_KEY",
  "AI_PROVIDER_ENCRYPTION_KEY",
]) {
  assert(source.includes(required), `live E2E is missing its required safety gate: ${required}`);
}

assert(
  source.includes("production_environment_refused") &&
    source.includes("expected_project_identity_mismatch") &&
    source.includes("local_fake_provider_mode_required"),
  "live E2E must reject production, mismatched projects, and non-local provider modes",
);
assert(
  !source.includes("dotenv") &&
    !source.includes(".env.local") &&
    !source.includes(".env.disposable"),
  "live E2E must not load an environment file",
);
assert(
  source.includes("startLocalFakeProvider") &&
    source.includes("createFixtureProviderProfiles") &&
    source.includes("fakeProvider.assertCredentialSelection"),
  "live E2E must exercise a disposable local provider through server-side profile resolution",
);
assert(
  source.includes("requireApprovedProcessEnvironment") &&
    source.includes("cleanupFixtures") &&
    source.includes("cleanup_incomplete"),
  "live E2E must gate execution and fail closed when exact cleanup fails",
);
assert(
  source.includes("create_assignment_from_bank") &&
    source.includes("/api/practice/assignments/start") &&
    source.includes("/api/practice/recommend") &&
    source.includes("/api/practice/review") &&
    source.includes("/api/practice/hint") &&
    source.includes("/api/practice/grade"),
  "live E2E must cover the assignment-linked Practice journey",
);
assert(
  source.includes("raw_upstream_body_leaked_to_browser") &&
    source.includes("provider_metadata_leaked_to_browser") &&
    source.includes("student_or_unrelated_rls_isolation_failed"),
  "live E2E must check browser secrecy and Student isolation",
);

console.log("PASS Student Assignment/Practice live E2E safety smoke");
