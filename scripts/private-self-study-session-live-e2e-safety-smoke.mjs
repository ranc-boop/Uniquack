#!/usr/bin/env node

// Source-only safety contract for the narrow private self-study live harness.

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const source = await readFile(
  resolve(process.cwd(), "scripts/private-self-study-session-live-e2e.mjs"),
  "utf8",
);
const clientSource = await readFile(
  resolve(process.cwd(), "src/components/practice/practice-agent-client.tsx"),
  "utf8",
);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function block(startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert(start >= 0 && end > start, `source block not found: ${startMarker}`);
  return source.slice(start, end);
}

for (const name of [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "CLEAN_SUPABASE_SERVICE_ROLE_KEY",
  "PRIVATE_SELF_STUDY_E2E_ENVIRONMENT",
  "PRIVATE_SELF_STUDY_E2E_EXPECTED_PROJECT_REF",
  "PRIVATE_SELF_STUDY_E2E_CONFIRM_CLEANUP",
]) {
  assert(source.includes(`"${name}"`), `missing process-only variable ${name}`);
}
assert(
  source.includes('DISPOSABLE_CONFIRMATION = "DISPOSABLE_PRIVATE_SELF_STUDY_E2E"') &&
    source.includes('CLEANUP_CONFIRMATION = "DELETE_PRIVATE_SELF_STUDY_E2E_FIXTURES"') &&
    source.includes('NODE_ENV?.trim().toLowerCase() === "production"') &&
    source.includes("projectRefFromSupabaseUrl"),
  "production, disposable-environment, cleanup, and project identity guards are required",
);
assert(
  !/dotenv|loadEnvConfig|["'`]\.env(?:\.local)?/i.test(source),
  "the narrow harness must not load environment files",
);

const preflight = block("// PREFLIGHT_READ_ONLY_START", "// PREFLIGHT_READ_ONLY_END");
const preflightHelpers = block("async function selectByIds", "// PREFLIGHT_READ_ONLY_START");
assert(
  !/\.(?:insert|upsert|update|delete|remove|rpc)\s*\(/.test(preflight) &&
    !/spawn\s*\(|chromium\.launch|createFixture|startLocalNextServer|signInThroughBrowser|runBrowserJourney/.test(preflight),
  "preflight-only discovery must remain read/list/count only",
);
assert(
  preflightHelpers.includes("auth.admin.listUsers") &&
    !/auth\.admin\.(?:createUser|deleteUser)/.test(preflightHelpers) &&
    !/\.(?:insert|upsert|update|delete|remove|rpc)\s*\(/.test(preflightHelpers),
  "preflight helper call graph must contain no mutation",
);
assert(
  source.includes("PREFLIGHT_EXIT_BEFORE_MUTATION_SERVER_BROWSER_API") &&
    source.indexOf("await runPreflightOnly()") < source.indexOf("await runFullValidation()") &&
    source.includes("STALE_PRIVATE_SELF_STUDY_PREFLIGHT_PASS") &&
    source.includes("STALE_PRIVATE_SELF_STUDY_PREFLIGHT_BLOCKED") &&
    source.includes("residue_total=") &&
    source.includes("affected_categories="),
  "preflight-only mode must exit with aggregate PASS/BLOCKED output before the full run",
);
for (const [table, category] of [
  ["organizations", "ORGANIZATIONS"],
  ["profiles", "PROFILES"],
  ["organization_members", "ORGANIZATION_MEMBERSHIPS"],
  ["user_practice_preferences", "PRACTICE_PREFERENCES"],
  ["practice_sessions", "PRACTICE_SESSIONS"],
  ["practice_rounds", "PRACTICE_ROUNDS"],
  ["practice_round_questions", "PRACTICE_ROUND_QUESTIONS"],
  ["practice_attempts", "PRACTICE_ATTEMPTS"],
  ["practice_agent_episodes", "PRACTICE_EPISODES"],
  ["practice_preference_merge_jobs", "PREFERENCE_MERGE_JOBS"],
]) {
  assert(preflight.includes(`"${table}"`) && source.includes(`"${category}"`), `missing preflight coverage ${category}`);
}
assert(source.includes('"AUTH_USERS"'), "auth-user preflight coverage is required");

const matcher = block("function isSessionRequest", "function observeProviderBackedBrowserRequests");
const journey = block("async function runBrowserJourney", "async function verifyPostconditions");
assert(
  matcher.includes("request.method() === method") &&
    matcher.includes('request.resourceType() === "fetch"') &&
    matcher.includes("url.origin === expectedOrigin") &&
    matcher.includes("url.pathname === SESSION_PATH") &&
    matcher.includes('page.off("response", onResponse)') &&
    matcher.includes('page.off("requestfailed", onFailed)'),
  "session waiters must match and dispose exact same-origin method/fetch/path observers",
);
assert(
  journey.indexOf("const createPromise = waitForSessionOutcome") <
      journey.indexOf("await createButton.click()") &&
    journey.indexOf("const postCreateList = await readSessionListThroughBrowser") >
      journey.indexOf("const created = await createPromise") &&
    !journey.includes("postCreateListPromise") &&
    (journey.match(/await createButton\.click\(\)/g) ?? []).length === 1,
  "the exact create waiter must precede one click and the identity-bearing list read must follow create",
);
assert(
  journey.includes('name: "Ready when you are."') &&
    journey.includes('name: "Sessions"') &&
    journey.includes('[data-testid="practice-session-item"][data-session-active="yes"]') &&
    !journey.includes('hasText: "New practice session"') &&
    !journey.includes('getByText("Practice session")') &&
    !journey.includes(".first()") &&
    !journey.includes('waitUntil: "networkidle"'),
  "the empty-session contract must use accessible stable state without ambiguous waits",
);
assert(
  journey.indexOf("state.persistedSession =") < journey.indexOf('assert(state.persistedSession === "FOUND"') &&
    journey.indexOf("state.activeSession =") < journey.indexOf('assert(state.activeSession === "MATCH"') &&
    journey.indexOf("state.listContainer =") < journey.indexOf('assert(state.listContainer === "PRESENT"') &&
    journey.indexOf("state.sessionList =") < journey.indexOf("await page.reload") &&
    journey.indexOf("await page.reload") < journey.indexOf("state.listAfterReload =") &&
    journey.indexOf("state.listAfterReload =") < journey.indexOf("state.reloadSession =") &&
    !journey.includes('assert(state.sessionList === "FOUND"') &&
    !journey.includes('assert(state.reloadSession === "MATCH"'),
  "each bounded self-study diagnostic must be published before its assertion can throw",
);
assert(
  journey.includes('from("practice_sessions")') &&
    journey.includes("persistedSessionCount === 1") &&
    journey.includes("postCreateList.activeId === created.sessionId") &&
    journey.includes("postCreateList.sessionIds.filter") &&
    journey.includes("reloaded.activeId === created.sessionId") &&
    !/console\.(?:log|warn|error)/.test(journey),
  "created and restored session identities must be compared only in memory",
);

const outcome = block("function classifySelfStudyOutcome", "async function runBrowserJourney");
assert(
  outcome.includes("SELF_STUDY_IMMEDIATE_LIST_MISSING_RELOAD_MATCH") &&
    outcome.includes("SELF_STUDY_LIST_MISSING_BEFORE_AND_AFTER_RELOAD") &&
    outcome.includes("SELF_STUDY_RELOAD_SESSION_MISMATCH") &&
    source.indexOf("await verifyPostconditions(fixtures, state)") <
      source.lastIndexOf("assertSelfStudyOutcome(state)"),
  "immediate-list failure must be classified only after reload and zero-evidence postconditions",
);

const refreshFlow = clientSource.slice(
  clientSource.indexOf("async function refreshPracticeState"),
  clientSource.indexOf("function restoreRoundFromHistory"),
);
const createFlow = clientSource.slice(
  clientSource.indexOf("function createNewSession"),
  clientSource.indexOf("function resetPracticeProgress"),
);
assert(
  createFlow.includes("prepareScopedNewSession()") &&
    !createFlow.includes("jsonRequest") &&
    !createFlow.includes("refreshPracticeState(") &&
    refreshFlow.includes("sessionPayload.sessions") &&
    refreshFlow.includes("setActiveSession(nextSession)"),
  "new-session UI must stay local until first generation while refresh restores canonical sessions",
);
assert(
  clientSource.includes('data-testid="practice-session-list"') &&
    clientSource.includes('data-testid="practice-session-item"') &&
    clientSource.includes('data-session-active={activeSession?.id === item.id ? "yes" : "no"}') &&
    clientSource.includes("sessions.length ? sessions.map"),
  "empty sessions must render once with an ID-free semantic active marker",
);

const postconditions = block("async function verifyPostconditions", "async function collectGeneratedIds");
assert(
  postconditions.includes("sessionCount === 1") &&
    postconditions.includes("preferenceCount === 1") &&
    postconditions.includes("roundCount === 0") &&
    postconditions.includes("questionCount === 0") &&
    postconditions.includes("attemptCount === 0") &&
    postconditions.includes("episodeCount === 0") &&
    postconditions.includes("mergeCount === 0"),
  "postconditions must prove one empty private session and no generated evidence or merge job",
);

const childEnvironment = block("async function startLocalNextServer", "async function signInThroughBrowser");
for (const secretName of [
  "CLEAN_SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "AI_PROVIDER_ENCRYPTION_KEY",
  "AI_PROVIDER_GATEWAY_TOKEN",
  "OPENAI_API_KEY",
  "GEMINI_API_KEY",
  "DEEPSEEK_API_KEY",
]) {
  assert(childEnvironment.includes(`"${secretName}"`), `child environment must strip ${secretName}`);
}
assert(
  !source.includes("ai_provider_profiles") &&
    !source.includes("chat/completions") &&
    !journey.includes("/api/practice/recommend") &&
    !journey.includes("/api/practice/review") &&
    !journey.includes("/api/practice/grade") &&
    source.includes('provider_called=NO'),
  "empty self-study validation must not create or invoke a Provider path",
);

const cleanup = block("async function cleanupFixtures", "async function runPreflightOnly");
for (const table of [
  "practice_agent_episodes",
  "practice_attempts",
  "practice_round_questions",
  "practice_rounds",
  "practice_preference_merge_jobs",
  "practice_sessions",
  "user_practice_preferences",
  "organization_members",
  "profiles",
  "organizations",
]) {
  assert(cleanup.includes(`"${table}"`), `cleanup is missing ${table}`);
}
assert(
  cleanup.includes("auth.admin.deleteUser") &&
    cleanup.includes("readStaleFixtureCounts") &&
    cleanup.includes("failures") &&
    source.includes("cleanupPassed = await cleanupFixtures") &&
    source.includes('failureCategory = "CLEANUP_FAILED"'),
  "cleanup must always run, attempt every exact-ID family, and verify zero residue",
);

const teardown = block("function childExitObserved", "async function startLocalNextServer");
assert(
  teardown.includes("child.exitCode !== null || child.signalCode !== null") &&
    teardown.includes('child.kill("SIGTERM")') &&
    teardown.includes('spawn("taskkill", ["/PID", String(childPid), "/T", "/F"]') &&
    teardown.includes('process.platform === "win32"') &&
    teardown.includes('shell: false') &&
    teardown.includes('stdio: "ignore"') &&
    !teardown.includes('"/IM"') &&
    !teardown.toLowerCase().includes("node.exe") &&
    teardown.includes("waitForPortClosed"),
  "server teardown must retain one PID, use bounded waits, and never kill by name",
);
assert(
  source.includes("processEnvironmentCleared = clearProcessEnvironment()") &&
    source.includes("temporary_server_stopped=") &&
    source.includes("process_environment_cleared=") &&
    source.indexOf("if (server)") < source.indexOf("cleanupPassed = await cleanupFixtures") &&
    source.indexOf("cleanupPassed = await cleanupFixtures") < source.indexOf("processEnvironmentCleared = clearProcessEnvironment()"),
  "teardown, cleanup, and process-variable clearing must remain ordered and visible",
);

for (const output of [
  "PASS private_self_study_session_live_validation",
  "FAIL private_self_study_session_live_validation",
  "self_study_create_http_status=",
  "self_study_persisted_session=",
  "self_study_active_session=",
  "self_study_active_ui=",
  "self_study_list_container=",
  "self_study_session_list=",
  "self_study_list_after_reload=",
  "self_study_reload_session=",
  "self_study_outcome_classification=",
  "self_study_initial_round_count=",
  "self_study_initial_question_count=",
  "self_study_initial_attempt_count=",
  "provider_called=",
  "cleanup=",
  "temporary_server_stopped=",
  "process_environment_cleared=",
]) {
  assert(source.includes(output), `missing bounded output ${output}`);
}
assert(
  !/console\.(?:log|error)\([^\n]*(?:\.id|username|password|email|url|pathname|request|response|body|cookie|header|token|secret|key)/i.test(source) &&
    !/console\.error/.test(source),
  "output must not expose identities, request data, credentials, URLs, or raw errors",
);

console.log("PASS private self-study session live harness safety contract");
