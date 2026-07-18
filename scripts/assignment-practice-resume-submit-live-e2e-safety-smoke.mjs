#!/usr/bin/env node

// Source-only safety contract for the narrow resume-submit live harness.

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const source = await readFile(
  resolve(process.cwd(), "scripts/assignment-practice-resume-submit-live-e2e.mjs"),
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
  "AI_PROVIDER_ENCRYPTION_KEY",
  "ASSIGNMENT_RESUME_SUBMIT_E2E_ENVIRONMENT",
  "ASSIGNMENT_RESUME_SUBMIT_E2E_EXPECTED_PROJECT_REF",
  "ASSIGNMENT_RESUME_SUBMIT_E2E_CONFIRM_CLEANUP",
  "ASSIGNMENT_RESUME_SUBMIT_E2E_PROVIDER_MODE",
]) {
  assert(source.includes(`"${name}"`), `missing process-only variable ${name}`);
}
assert(
  source.includes('DISPOSABLE_CONFIRMATION = "DISPOSABLE_ASSIGNMENT_RESUME_SUBMIT_E2E"') &&
    source.includes('CLEANUP_CONFIRMATION = "DELETE_ASSIGNMENT_RESUME_SUBMIT_E2E_FIXTURES"') &&
    source.includes('LOCAL_FAKE_PROVIDER_MODE = "LOCAL_FAKE_HTTP_PROVIDER"') &&
    source.includes('NODE_ENV?.trim().toLowerCase() === "production"') &&
    source.includes("projectRefFromSupabaseUrl"),
  "production, disposable, cleanup, provider-mode, and project guards are required",
);
assert(
  !/dotenv|loadEnvConfig|["'`]\.env(?:\.local)?/i.test(source),
  "the narrow harness must not load environment files",
);
assert(
  !source.includes("student-v1-browser-e2e") &&
    !source.includes("startResumeAndCompleteAssignment") &&
    !source.includes("validateBrowserJourneys"),
  "the narrow harness must not import or run the full Student browser suite",
);

const preflight = block("// PREFLIGHT_READ_ONLY_START", "// PREFLIGHT_READ_ONLY_END");
assert(
  !/\.(?:insert|upsert|update|delete|remove)\s*\(/.test(preflight) &&
    !/spawn\s*\(|chromium\.launch|startLocalFakeProvider|startLocalNextServer/.test(preflight),
  "preflight-only discovery must stay read-only and must not start fixtures, servers, or a browser",
);
assert(
  source.includes("PREFLIGHT_EXIT_BEFORE_MUTATION_SERVER_BROWSER_API") &&
    source.indexOf("await runPreflightOnly()") < source.indexOf("await runFullValidation()") &&
    source.includes("STALE_ASSIGNMENT_RESUME_SUBMIT_PREFLIGHT_PASS") &&
    source.includes("STALE_ASSIGNMENT_RESUME_SUBMIT_PREFLIGHT_BLOCKED") &&
    source.includes("residue_total=") &&
    source.includes("affected_categories="),
  "preflight-only mode must exit through aggregate output before mutable execution",
);

assert(
  source.includes("signInThroughBrowser") &&
    source.includes("chromium.launch") &&
    source.includes('page.locator("#username")') &&
    source.includes('page.locator("#password")'),
  "the live path must establish the canonical authenticated Student browser session",
);
const journey = block("async function runResumeSubmitJourney", "async function collectGeneratedIds");
assert(
  journey.includes("waitForAssignmentStart(page)") &&
    journey.includes("firstStart.sessionId === reloadStart.sessionId") &&
    journey.includes("reload_session_consistency=${reloadSessionConsistency}") &&
    journey.includes("await verifyPostconditions(fixtures, contract)") &&
    !/console\.log\([^\n]*(?:sessionId|assignmentId|studentId|questionId|roundId)/.test(journey),
  "reload must resume the same session, compare IDs only in memory, and keep IDs out of output",
);
assert(
  journey.includes('[data-testid="practice-result-badge"][data-result="correct"]') &&
    !journey.includes('getByText("correct", { exact: true })') &&
    journey.includes('getByPlaceholder("Enter your final answer")') &&
    journey.includes('getByRole("button", { name: "Submit round" })'),
  "submit must use semantic controls and the unique result badge",
);

const completion = block(
  'phase(fixtures, "ASSIGNMENT_PRACTICE_COMPLETED_RELOAD_ROUTE")',
  "fakeProvider.assertUsedSafely()",
);
for (const phase of [
  "ASSIGNMENT_PRACTICE_COMPLETED_RELOAD_ROUTE",
  "ASSIGNMENT_PRACTICE_COMPLETED_RELOAD_START",
  "ASSIGNMENT_PRACTICE_COMPLETED_SESSION_CONSISTENCY",
  "ASSIGNMENT_PRACTICE_COMPLETED_RESULT_BADGE",
  "ASSIGNMENT_PRACTICE_COMPLETED_ANSWER_STATE",
  "ASSIGNMENT_PRACTICE_COMPLETED_POSTCONDITIONS",
  "ASSIGNMENT_PRACTICE_MY_WORK_NAVIGATION",
  "ASSIGNMENT_PRACTICE_MY_WORK_COMPLETED_SECTION",
  "ASSIGNMENT_PRACTICE_MY_WORK_COMPLETED_ASSIGNMENT",
]) {
  assert(completion.includes(`"${phase}"`), `missing bounded completion phase ${phase}`);
}
for (const category of [
  "COMPLETED_RELOAD_ROUTE_FAILED",
  "COMPLETED_RELOAD_START_FAILED",
  "COMPLETED_SESSION_MISMATCH",
  "COMPLETED_RESULT_BADGE_TIMEOUT",
  "COMPLETED_ANSWER_STATE_FAILED",
  "COMPLETED_POSTCONDITION_FAILED",
  "MY_WORK_NAVIGATION_FAILED",
  "MY_WORK_COMPLETED_SECTION_NOT_FOUND",
  "MY_WORK_COMPLETED_ASSIGNMENT_NOT_FOUND",
]) {
  assert(
    source.includes(`"${category}"`) && completion.includes(`"${category}"`),
    `missing bounded completion category ${category}`,
  );
}
assert(
  completion.includes('getByRole("heading", {') &&
    completion.includes('name: "Completed"') &&
    completion.includes('page.locator("section").filter({ has: completedHeading })') &&
    completion.includes('name: contract.assignmentTitle') &&
    completion.includes('getByRole("link", { exact: true, name: "Review work" })') &&
    !completion.includes('getByText("Completed", { exact: true })') &&
    !completion.includes(".first()"),
  "completion must scope the fixture Assignment to the semantic Completed section",
);

const execution = block("async function runFullValidation", "const args = process.argv.slice(2)");
assert(
  journey.indexOf("diagnostics.assignmentStartHttpStatus = firstStart.status") >
      journey.indexOf("const firstStart = await firstStartPromise") &&
    journey.indexOf("diagnostics.reviewCategory = review.category") >
      journey.indexOf("const review = await reviewPromise") &&
    journey.indexOf("diagnostics.gradeCategory = grade") >
      journey.indexOf("gradeObserver.read") &&
    execution.includes("const diagnostics = createJourneyDiagnostics()") &&
    execution.includes("diagnostics.assignmentStartHttpStatus") &&
    execution.includes("diagnostics.reviewCategory") &&
    execution.includes("diagnostics.gradeCategory") &&
    !execution.includes("reviewResultCategory") &&
    !execution.includes("gradeResultCategory"),
  "observed Start, review, and grade diagnostics must publish before later UI assertions",
);

const reviewDiagnostics = block("function reviewCategory", "async function verifyPostconditions");
assert(
  reviewDiagnostics.includes("REVIEW_SUCCESS_EVENT") &&
    reviewDiagnostics.includes("REVIEW_ERROR_EVENT") &&
    reviewDiagnostics.includes("REVIEW_STREAM_INCOMPLETE") &&
    reviewDiagnostics.includes("GRADE_RESPONSE_2XX") &&
    reviewDiagnostics.includes("GRADE_NOT_REQUIRED") &&
    !/console\.(?:log|error|warn)/.test(reviewDiagnostics) &&
    !/(?:writeFile|appendFile|createWriteStream)/.test(reviewDiagnostics),
  "review SSE and grade responses must collapse to bounded in-memory categories",
);
assert(
  source.includes('let code = status >= 200 && status < 300 ? "NONE" : "UNRECOGNIZED_API_CODE"') &&
    source.includes("assignment_start_code=") &&
    !source.includes("response_body=") &&
    !source.includes("review_stream=") &&
    !source.includes("model_output="),
  "successful Start must map to NONE and output must not include raw response data",
);
assert(
  !/console\.log\([^\n]*(?:username|password|email|serviceRoleKey|anonKey|cookie|header|baseUrl)/i.test(source),
  "credentials, identities, URLs, headers, and cookies must never be printed",
);

assert(
  source.includes("startLocalFakeProvider") &&
    source.includes("createFixtureProvider") &&
    source.includes("fakeProvider.assertUsedSafely()") &&
    source.includes('"OPENAI_API_KEY"') &&
    source.includes('"GEMINI_API_KEY"') &&
    source.includes('"DEEPSEEK_API_KEY"') &&
    source.includes('delete environment[name]') &&
    !/https:\/\/(?:api\.openai\.com|api\.deepseek\.com|generativelanguage\.googleapis\.com)/i.test(source),
  "the harness must select only its local fake HTTP Provider and strip real-provider variables",
);

const cleanup = block("async function cleanupFixtures", "async function inspectPreferenceState");
for (const table of [
  "practice_hint_events",
  "practice_reflection_records",
  "practice_weakness_links",
  "practice_wrong_questions",
  "practice_attempts",
  "practice_agent_episodes",
  "practice_round_questions",
  "practice_rounds",
  "assignment_practice_sessions",
  "student_assignment_progress",
  "practice_preference_merge_jobs",
  "practice_sessions",
  "user_practice_preferences",
  "assignment_items",
  "assignments",
  "bank_questions",
  "questions",
  "bank_members",
  "question_banks",
  "classroom_members",
  "classrooms",
  "ai_provider_profiles",
  "organization_members",
  "profiles",
  "organizations",
]) {
  assert(cleanup.includes(`"${table}"`), `cleanup is missing ${table}`);
}
assert(
  cleanup.includes("auth.admin.deleteUser") &&
    cleanup.includes("readStaleFixtureCounts") &&
    cleanup.includes("failedCategories") &&
    source.includes("cleanupPassed = await cleanupFixtures") &&
    source.includes('failureCategory = "CLEANUP_FAILED"'),
  "exact-ID cleanup must cover every fixture family and verify zero residue",
);

assert(
  source.includes("verifyFirstStartPrecondition") &&
    source.includes("preferenceCount === 0") &&
    source.includes("sessionCount === 0") &&
    source.includes("mergeCount === 0") &&
    source.includes("sessions.length === 1") &&
    source.includes("rounds.length === 1") &&
    source.includes("assignmentLinkCount === 1") &&
    source.includes("progressCount === 1"),
  "the harness must prove first start and one-session resume postconditions",
);

const teardown = block("function childExitObserved", "async function startLocalNextServer");
assert(
  teardown.includes("child.exitCode !== null || child.signalCode !== null") &&
    teardown.includes('child.kill("SIGTERM")') &&
    teardown.includes('spawn("taskkill", ["/PID", String(childPid), "/T", "/F"]') &&
    teardown.includes('process.platform === "win32"') &&
    teardown.includes("waitForPortClosed(port, SERVER_PORT_CLOSE_TIMEOUT_MS)") &&
    !teardown.includes('"/IM"') &&
    !teardown.toLowerCase().includes("node.exe") &&
    !teardown.includes("Get-Process") &&
    !teardown.includes("Stop-Process"),
  "server teardown must be bounded and target only the retained child PID tree",
);
assert(
  source.includes("processEnvironmentCleared = clearProcessEnvironment()") &&
    source.includes("temporary_server_stopped=") &&
    source.includes("process_environment_cleared=") &&
    source.indexOf("if (server)") < source.indexOf("cleanupPassed = await cleanupFixtures") &&
    source.indexOf("cleanupPassed = await cleanupFixtures") <
      source.indexOf("processEnvironmentCleared = clearProcessEnvironment()"),
  "server shutdown, cleanup, and process-variable clearing must stay independently visible",
);

console.log("PASS Assignment Practice resume-submit live harness safety contract");
