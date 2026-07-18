import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const [harness, runbook] = await Promise.all([
  readFile(resolve(root, "scripts/student-self-study-isolation-live-e2e.mjs"), "utf8"),
  readFile(resolve(root, "docs/security/student-self-study-evidence-manual-apply.md"), "utf8"),
]);

for (const required of [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "CLEAN_SUPABASE_SERVICE_ROLE_KEY",
  "STUDENT_SELF_STUDY_E2E_ENVIRONMENT",
  "STUDENT_SELF_STUDY_E2E_EXPECTED_PROJECT_REF",
  "STUDENT_SELF_STUDY_E2E_CONFIRM_CLEANUP",
  "DISPOSABLE_STUDENT_SELF_STUDY_E2E",
  "DELETE_STUDENT_SELF_STUDY_E2E_FIXTURES",
]) {
  assert(harness.includes(required), `0047 live harness is missing required safety contract: ${required}`);
}

for (const forbidden of [
  "AI_PROVIDER_ENCRYPTION_KEY",
  "ai_provider_profiles",
  "startLocalFakeProvider",
  "LOCAL_FAKE_HTTP_PROVIDER",
  "dotenv",
  ".env.local",
]) {
  assert(!harness.includes(forbidden), `0047 live harness must not depend on Provider or environment-file behavior: ${forbidden}`);
}

assert(
  harness.includes("production_environment_refused") &&
    harness.includes("expected_project_identity_mismatch") &&
    harness.includes("destructive_fixture_acknowledgement_required"),
  "0047 live harness must refuse production, an unexpected project, and missing cleanup acknowledgement",
);
assert(
  harness.includes("try {") &&
    harness.includes("finally {") &&
    harness.includes("cleanupFixtures") &&
    harness.includes("clearProcessEnvironment"),
  "0047 live harness must use final cleanup and clear process-only variables",
);
for (const table of [
  "practice_sessions",
  "practice_rounds",
  "practice_round_questions",
  "practice_attempts",
  "practice_hint_events",
  "practice_reflection_records",
  "practice_wrong_questions",
  "practice_weakness_links",
  "user_practice_preferences",
  "practice_preference_merge_jobs",
  "practice_agent_episodes",
]) {
  assert(harness.includes(table), `0047 live harness must cover ${table}`);
}
assert(
  harness.includes("teacher_a_cannot_mutate_student_attempt") &&
    harness.includes("student_b_cannot_read_student_a_private_attempt") &&
    harness.includes("[fixtures.studentB, fixtures.teacherB, fixtures.removedCoTeacher]") &&
    harness.includes("cannot_read_student_a_assignment_session") &&
    harness.includes("student_a_has_no_source_bank_membership") &&
    harness.includes("service role completed exact-ID fixture cleanup"),
  "0047 live harness is missing required isolation, Bank, or cleanup assertions",
);
assert(
  runbook.includes("to_regprocedure('private.can_read_practice_session_evidence(uuid)')") &&
    runbook.includes("student-self-study-isolation-live-e2e.mjs"),
  "0047 runbook must use signature-safe helper preflight and name the live harness",
);

console.log("PASS 0047 self-study live harness safety contract");
