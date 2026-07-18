#!/usr/bin/env node

// Source-only contract for the disposable Student V1 browser harness.

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const source = await readFile(resolve(process.cwd(), "scripts/student-v1-browser-e2e.mjs"), "utf8");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sourceBlock(startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert(start >= 0 && end > start, `browser harness source block not found: ${startMarker}`);
  return source.slice(start, end);
}

for (const name of [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "CLEAN_SUPABASE_SERVICE_ROLE_KEY",
  "AI_PROVIDER_ENCRYPTION_KEY",
  "STUDENT_BROWSER_E2E_ENVIRONMENT",
  "STUDENT_BROWSER_E2E_EXPECTED_PROJECT_REF",
  "STUDENT_BROWSER_E2E_CONFIRM_CLEANUP",
  "STUDENT_BROWSER_E2E_PROVIDER_MODE",
]) {
  assert(source.includes(`"${name}"`), `browser harness is missing required process-only variable ${name}`);
}

assert(
  source.includes('DISPOSABLE_CONFIRMATION = "DISPOSABLE_STUDENT_BROWSER_E2E"') &&
    source.includes('CLEANUP_CONFIRMATION = "DELETE_STUDENT_BROWSER_E2E_FIXTURES"') &&
    source.includes('LOCAL_FAKE_PROVIDER_MODE = "LOCAL_FAKE_HTTP_PROVIDER"'),
  "browser harness is missing disposable, cleanup, or local-provider safety literal",
);
assert(
  source.includes('NODE_ENV?.trim().toLowerCase() === "production"') &&
    source.includes("expected_project_identity_mismatch") &&
    source.includes("clearProcessEnvironment"),
  "browser harness must refuse production, verify the expected project, and clear its process variables",
);
assert(
  !/dotenv|loadEnvConfig|["'`]\.env(?:\.local)?/i.test(source) &&
    !/NODE_ENV[^\n]*(?:allow|permit|override)[^\n]*production/i.test(source),
  "browser harness must not load environment files or provide a production override",
);
assert(
  source.includes("chromium.launch({ executablePath: edgePath, headless: true })") &&
    source.includes("signInThroughBrowser") &&
    source.includes("joinClassroomThroughBrowser"),
  "browser harness must use local Edge and real browser requester sessions",
);
assert(
  source.includes("try {") &&
    source.includes("finally {") &&
    source.includes("cleanupFixtures(fixtures)") &&
    source.includes("verifyAbsent") &&
    source.includes('console.log(cleanupResult.ok ? "CLEANUP_PASS" : "CLEANUP_FAIL")') &&
    source.includes('diagnostics.cleanup = cleanupResult.ok ? "PASS" : "FAIL"'),
  "browser harness must use finally cleanup and verify exact-ID fixture deletion",
);
assert(
  source.includes("assertBrowserIsolation") &&
    source.includes("same_class_student_private_evidence_exposed") &&
    source.includes("source_bank_route_exposed_to_student") &&
    source.includes("review_draft_route_exposed_to_student") &&
    source.includes("blueprint_route_exposed_to_student"),
  "browser harness must cover Student evidence and source-content isolation",
);
assert(
  source.includes("selected_assignment_asset_not_authorized") &&
    source.includes("unselected_private_bank_asset_not_denied") &&
    source.includes("protected_student_page_not_redirected_after_logout") &&
    source.includes("practice_api_not_denied_after_logout"),
  "browser harness must cover asset and session-loss boundaries",
);
assert(
  source.includes('is_correct: true') &&
    source.includes('judgment_reason: "Disposable exact answer matched."') &&
    source.includes('PHASE=browser_assignment_practice_submit') &&
    source.includes('PHASE=browser_assignment_practice_progress'),
  "browser harness fake provider must satisfy the review contract and report safe assignment-practice subphases",
);

for (const phase of [
  "browser_assignment_practice_click",
  "browser_assignment_practice_navigation_response",
  "browser_assignment_practice_final_route",
  "browser_assignment_practice_start_api_wait",
  "browser_assignment_practice_start_api_status",
  "browser_assignment_practice_banner",
  "browser_assignment_practice_question_title",
  "browser_assignment_practice_safe_text",
]) {
  assert(source.includes(`"${phase}"`), `browser harness is missing sanitized Practice phase ${phase}`);
}

for (const category of [
  "NO_DOCUMENT_RESPONSE",
  "NAVIGATION_2XX",
  "NAVIGATION_3XX",
  "NAVIGATION_4XX",
  "NAVIGATION_5XX",
  "RESPONSE_2XX",
  "RESPONSE_3XX",
  "RESPONSE_4XX",
  "RESPONSE_5XX",
  "REQUEST_FAILED",
  "REQUEST_NOT_OBSERVED",
  "PRACTICE_ROUTE",
  "LOGIN_ROUTE",
  "STUDENT_ROUTE",
  "ERROR_ROUTE",
  "UNEXPECTED_ROUTE",
  "CLIENT_RENDER_ERROR",
  "NETWORK_ERROR",
  "AUTH_ERROR",
  "UNKNOWN_PAGE_ERROR",
  "DOCUMENT",
  "PRACTICE_ASSIGNMENT_START",
  "NEXT_STATIC",
  "OTHER_SAME_ORIGIN",
  "EXTERNAL",
  "UNKNOWN",
  "HTTP_4XX",
  "HTTP_5XX",
  "UNHANDLED_REJECTION",
  "UNCAUGHT_EXCEPTION",
  "COMPILE_ERROR",
  "RUNTIME_ERROR",
  "PROCESS_EXIT_NONZERO",
]) {
  assert(source.includes(`"${category}"`), `browser harness is missing bounded diagnostic category ${category}`);
}

for (const category of [
  "practice_navigation_timeout",
  "practice_start_api_timeout",
  "practice_banner_timeout",
  "practice_question_title_timeout",
  "practice_page_context_error",
]) {
  assert(source.includes(`"${category}"`), `browser harness is missing bounded failure category ${category}`);
}

const practiceLaunchBlock = sourceBlock(
  "async function startResumeAndCompleteAssignment",
  "async function createAndResumePrivateSelfStudy",
);
assert(
  practiceLaunchBlock.indexOf("waitForAssignmentStartOutcome") <
    practiceLaunchBlock.indexOf('getByRole("link", { name: /Practice for this assignment/ }).click()'),
  "assignment-start response waiter must be registered before the Practice link click",
);
assert(
  practiceLaunchBlock.includes("fixtures.diagnostics.navigationStatus") &&
    practiceLaunchBlock.includes("fixtures.diagnostics.finalRoute") &&
    practiceLaunchBlock.includes("fixtures.diagnostics.assignmentStartApi"),
  "Practice launch must persist only sanitized navigation, route, and API outcomes",
);

assert(
  source.includes("MAX_DIAGNOSTIC_CATEGORIES = 8") &&
    source.includes("target.length >= MAX_DIAGNOSTIC_CATEGORIES") &&
    source.includes("Math.min(diagnostics.consoleErrorCount + 1, 999)") &&
    source.includes("String(chunk).slice(0, 32_768)") &&
    source.includes('stdio: ["ignore", "pipe", "pipe"]'),
  "browser and server diagnostics must use bounded category/count storage",
);
const serverDiagnosticsBlock = sourceBlock("function markServerRuntimeCategory", "function setHarnessPhase");
assert(
  source.includes('page.on("pageerror"') &&
    source.includes('page.on("requestfailed"') &&
    source.includes('page.on("console"') &&
    source.includes("inspectServerOutput") &&
    !/serverOutput\s*\+=|runtimeLogs?\.push\s*\(|\.push\s*\(\s*chunk\s*\)/i.test(serverDiagnosticsBlock),
  "browser and server diagnostics must classify events without accumulating raw logs",
);

for (const key of [
  "failure_category",
  "navigation_status",
  "final_route",
  "assignment_start_api",
  "pageerror_category",
  "failed_request_category",
  "server_runtime_category",
  "cleanup",
]) {
  assert(source.includes(`${key}=`), `sanitized failure summary is missing ${key}`);
}
assert(
  source.includes('console.error("FAIL Student V1 browser E2E")') &&
    !/console\.(?:log|error)\s*\([^\n]*(?:error\.message|response\.url|request\.url|response\.text|request\.postData|child\.stdout|child\.stderr)/i.test(source),
  "failure reporting must not print raw browser, request, response, or server details",
);

const staleFixtureBlock = sourceBlock(
  "async function assertNoStaleStudentBrowserFixtures",
  "function opaqueRunId",
);
assert(
  staleFixtureBlock.includes('.select("id", { count: "exact", head: true })') &&
    staleFixtureBlock.includes("STALE_FIXTURE_PREFLIGHT_COUNT") &&
    staleFixtureBlock.includes("stale_disposable_fixtures_refused") &&
    !staleFixtureBlock.includes(".delete(") &&
    !staleFixtureBlock.includes(".remove("),
  "stale fixture preflight must aggregate read-only counts and refuse residue without deleting it",
);

const preflightReadBlock = sourceBlock("// PREFLIGHT_ONLY_READ_START", "// PREFLIGHT_ONLY_READ_END");
const cliBlock = sourceBlock("async function runHarnessCli", "try {\n  await runHarnessCli");
assert(
  preflightReadBlock.includes('args[0] === "--preflight-only"') &&
    preflightReadBlock.includes('return "PREFLIGHT_ONLY"') &&
    preflightReadBlock.includes('return "INVALID_ARGUMENTS"') &&
    cliBlock.includes('console.error("STUDENT_BROWSER_E2E_ARGUMENT_ERROR")'),
  "browser harness must explicitly recognize preflight-only mode and reject unknown arguments",
);
assert(
  cliBlock.indexOf("parseHarnessMode(process.argv.slice(2))") < cliBlock.indexOf("await runPreflightOnly()") &&
    cliBlock.indexOf("await runPreflightOnly()") < cliBlock.indexOf("await main()") &&
    cliBlock.includes('if (mode === "PREFLIGHT_ONLY")') &&
    cliBlock.includes("await runPreflightOnly();\n    return;"),
  "preflight-only CLI control flow must return before the full mutable harness",
);
assert(
  preflightReadBlock.includes("requireApprovedProcessEnvironment({ requireLocalBrowser: false, reportPresence: false })") &&
    preflightReadBlock.includes("auditStudentBrowserFixtureResidue(service)") &&
    !preflightReadBlock.includes("createFixtureOrganization") &&
    !preflightReadBlock.includes("createFixtureUser") &&
    !preflightReadBlock.includes("startLocalFakeProvider") &&
    !preflightReadBlock.includes("startNextServer") &&
    !preflightReadBlock.includes("validateBrowserJourneys") &&
    !preflightReadBlock.includes("cleanupFixtures"),
  "preflight-only call graph must exit before fixtures, Provider, Next.js, browser, or cleanup",
);
assert(
  !/\.(?:insert|update|upsert|delete|rpc)\s*\(/.test(preflightReadBlock) &&
    !/auth\.admin\.(?:createUser|deleteUser)\s*\(/.test(preflightReadBlock) &&
    !/\.storage[\s\S]*?\.(?:upload|remove)\s*\(/.test(preflightReadBlock) &&
    preflightReadBlock.includes("auth.admin.listUsers") &&
    preflightReadBlock.includes('.storage.from("question-assets").list('),
  "preflight-only call graph must use read/list operations and contain no mutation",
);
assert(
  source.includes('AUTH_FIXTURE_KIND = "student_v1_browser_e2e"') &&
    source.includes('STALE_FIXTURE_SOURCE = "student_browser_e2e"') &&
    source.includes('STALE_FIXTURE_PREFIX = "student-browser-"') &&
    source.includes('STALE_PROVIDER_PREFIX = "!student-browser-e2e-"') &&
    source.includes("user_metadata: { fixture_kind: AUTH_FIXTURE_KIND }") &&
    preflightReadBlock.includes("AUTH_FIXTURE_KIND") &&
    preflightReadBlock.includes("STALE_FIXTURE_PREFIX") &&
    preflightReadBlock.includes("STALE_FIXTURE_SOURCE") &&
    preflightReadBlock.includes("STALE_PROVIDER_PREFIX"),
  "preflight must use stable cross-run fixture namespaces rather than a new random run suffix",
);

for (const [table, category] of [
  ["organizations", "ORGANIZATIONS"],
  ["profiles", "PROFILES"],
  ["organization_members", "ORGANIZATION_MEMBERSHIPS"],
  ["classrooms", "CLASSROOMS"],
  ["classroom_members", "CLASSROOM_MEMBERSHIPS"],
  ["classroom_join_codes", "CLASSROOM_JOIN_CODES"],
  ["question_banks", "BANKS"],
  ["bank_members", "BANK_MEMBERSHIPS"],
  ["questions", "QUESTIONS"],
  ["bank_questions", "QUESTION_SUPPORT_ROWS"],
  ["assignments", "ASSIGNMENTS"],
  ["assignment_items", "ASSIGNMENT_ITEMS"],
  ["student_assignment_progress", "ASSIGNMENT_PROGRESS"],
  ["user_practice_preferences", "PRACTICE_PREFERENCES"],
  ["practice_preference_merge_jobs", "PREFERENCE_MERGE_JOBS"],
  ["practice_sessions", "PRACTICE_SESSIONS"],
  ["practice_rounds", "PRACTICE_ROUNDS"],
  ["practice_round_questions", "PRACTICE_QUESTIONS"],
  ["practice_attempts", "PRACTICE_ATTEMPTS"],
  ["practice_agent_episodes", "PRACTICE_EPISODES"],
  ["practice_wrong_questions", "PRACTICE_WRONG_QUESTION_ROWS"],
  ["practice_hint_events", "PRACTICE_HINT_EVENTS"],
  ["practice_reflection_records", "PRACTICE_REFLECTION_ROWS"],
  ["practice_weakness_links", "PRACTICE_WEAKNESS_ROWS"],
  ["assignment_practice_sessions", "ASSIGNMENT_PRACTICE_LINKS"],
  ["teacher_feedback_notes", "FEEDBACK_ROWS"],
  ["question_assets", "QUESTION_ASSET_ROWS"],
  ["ai_provider_profiles", "AI_PROVIDER_ROWS"],
]) {
  assert(
    preflightReadBlock.includes(`table: "${table}"`) && preflightReadBlock.includes(`"${category}"`),
    `preflight coverage is missing ${table} -> ${category}`,
  );
}
for (const category of ["AUTH_USERS", "STORAGE_OBJECTS"]) {
  assert(preflightReadBlock.includes(`"${category}"`), `preflight coverage is missing ${category}`);
}
assert(
  preflightReadBlock.includes("PREFLIGHT_CATEGORY_LABELS.filter((category) => !counts.has(category))") &&
    preflightReadBlock.includes('console.log("PREFLIGHT_COVERAGE_INCOMPLETE")') &&
    preflightReadBlock.includes("missing_categories=") &&
    preflightReadBlock.includes("process.exitCode = 1"),
  "incomplete preflight coverage must fail closed with generic category labels",
);
assert(
  preflightReadBlock.includes('console.log("STALE_FIXTURE_PREFLIGHT_PASS")') &&
    preflightReadBlock.includes('console.log("STALE_FIXTURE_PREFLIGHT_BLOCKED")') &&
    preflightReadBlock.includes('console.log("STALE_FIXTURE_PREFLIGHT_ERROR")') &&
    preflightReadBlock.includes("affected_categories=") &&
    preflightReadBlock.includes("error_category=") &&
    preflightReadBlock.includes("process.exitCode = 0") &&
    (preflightReadBlock.match(/process\.exitCode = 1/g) ?? []).length >= 2,
  "preflight output and exit codes must distinguish clean, residue, query-error, and incomplete states",
);
assert(
  preflightReadBlock.includes("PREFLIGHT_PAGE_SIZE = 500") &&
    preflightReadBlock.includes("PREFLIGHT_MAX_PAGES = 200") &&
    preflightReadBlock.includes("for (const category of PREFLIGHT_CATEGORY_LABELS)") &&
    !/console\.(?:log|error)\([^\n]*(?:\.id|\.email|\.name|\.url|\.message|storage_path|user_metadata|result\.data)/i.test(
      preflightReadBlock,
    ),
  "preflight output must be bounded to aggregate category counts and sanitized result fields",
);
assert(
  !/console\.(?:log|error)\([^)]*(?:url|password|email|token|secret|uuid|fixtureIds?|responseBody|requestBody)/i.test(source),
  "browser harness must not load an env file or log sensitive fixture values",
);

console.log("PASS Student V1 browser E2E harness safety contract");
