#!/usr/bin/env node

// Source-only contract for the narrow Assignment Practice live harness.

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const source = await readFile(
  resolve(process.cwd(), "scripts/assignment-practice-start-live-e2e.mjs"),
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
  "ASSIGNMENT_START_LIVE_ENVIRONMENT",
  "ASSIGNMENT_START_LIVE_EXPECTED_PROJECT_REF",
  "ASSIGNMENT_START_LIVE_CONFIRM_CLEANUP",
]) {
  assert(source.includes(`"${name}"`), `missing process-only variable ${name}`);
}
assert(
  source.includes('DISPOSABLE_CONFIRMATION = "DISPOSABLE_ASSIGNMENT_START_LIVE"') &&
    source.includes('CLEANUP_CONFIRMATION = "DELETE_ASSIGNMENT_START_LIVE_FIXTURES"') &&
    source.includes('NODE_ENV?.trim().toLowerCase() === "production"') &&
    source.includes("projectRefFromSupabaseUrl"),
  "production, disposable-environment, cleanup, and project identity guards are required",
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
    !/spawn\s*\(|chromium\.launch|invokeAuthenticatedAssignmentStart/.test(preflight),
  "preflight-only data discovery must remain read-only and must not start a server/browser/API call",
);
assert(
  source.includes("PREFLIGHT_EXIT_BEFORE_MUTATION_SERVER_BROWSER_API") &&
    source.indexOf("await runPreflightOnly()") < source.indexOf("await runFullValidation()") &&
    source.includes("STALE_ASSIGNMENT_START_PREFLIGHT_PASS") &&
    source.includes("STALE_ASSIGNMENT_START_PREFLIGHT_BLOCKED") &&
    source.includes("residue_total=") &&
    source.includes("affected_categories="),
  "preflight-only mode must exit through aggregate PASS/BLOCKED output before the full run",
);

const invokeBlock = block(
  "async function invokeAuthenticatedAssignmentStart",
  "async function verifyPostconditions",
);
assert(
  invokeBlock.includes('fetch("/api/practice/assignments/start"') &&
    invokeBlock.includes('method: "POST"') &&
    invokeBlock.includes("page.evaluate") &&
    !invokeBlock.includes("serviceRoleKey") &&
    !invokeBlock.includes("serviceClient") &&
    !invokeBlock.includes("Authorization"),
  "the API request must use the browser Student cookie session, never service-role authorization",
);
assert(
  source.includes("signInThroughBrowser") &&
    source.includes("chromium.launch") &&
    source.includes('page.locator("#username")') &&
    source.includes('page.locator("#password")'),
  "the full run must establish the canonical authenticated Student browser session",
);

assert(
  source.includes("ASSIGNMENT_START_CODES.has(result.code)") &&
    source.includes("assignment_start_http_status=") &&
    source.includes("assignment_start_code=") &&
    !source.includes("response.text") &&
    !source.includes("response_body") &&
    !source.includes("console.log(error") &&
    !source.includes("console.error"),
  "output must retain only numeric status, allowlisted code, and bounded categories",
);
assert(
  !/console\.log\([^\n]*(?:username|password|email|assignmentId|studentId|userId|serviceRoleKey|anonKey|url|cookie|header)/i.test(source),
  "fixture identities, credentials, URLs, headers, and cookies must never be printed",
);

assert(
  !/ai_provider_profiles|chat\/completions|callPractice|fakeProvider|Provider execution/.test(source) &&
    source.includes('delete environment["AI_PROVIDER_GATEWAY_TOKEN"]') === false &&
    source.includes('"AI_PROVIDER_GATEWAY_TOKEN"') &&
    source.includes('"OPENAI_API_KEY"') &&
    source.includes('"GEMINI_API_KEY"') &&
    source.includes('"DEEPSEEK_API_KEY"'),
  "the harness must create no Provider fixture or request and must strip Provider credentials from Next",
);

const cleanup = block("async function cleanupFixtures", "async function inspectPreferenceState");
for (const table of [
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
  "cleanup must attempt every resource family, verify zero residue, and remain visible on failure",
);

assert(
  source.includes("verifyFirstStartPrecondition") &&
    source.includes("preferenceCount === 0") &&
    source.includes("sessionCount === 0") &&
    source.includes("mergeCount === 0") &&
    source.includes("verifyPostconditions") &&
    source.includes("roundQuestionCount === 1") &&
    source.includes("episodeCount === 1") &&
    source.includes("assignmentLinkCount === 1") &&
    source.includes("progressCount === 1"),
  "the harness must prove first initialization and the complete start persistence transaction",
);
assert(
  source.includes("const stopResult = await server.close()") &&
    source.includes("processEnvironmentCleared = clearProcessEnvironment()") &&
    source.includes("temporary_server_stopped=") &&
    source.includes("process_environment_cleared="),
  "server shutdown and process-variable clearing must be explicit and reportable",
);

const teardown = block("function childExitObserved", "async function startLocalNextServer");
assert(
    teardown.includes("child.exitCode !== null || child.signalCode !== null") &&
    teardown.includes('child.kill("SIGTERM")') &&
    teardown.indexOf('child.kill("SIGTERM")') <
      teardown.indexOf("await terminateWindowsProcessTree(childPid)") &&
    teardown.includes("waitForChildExit(child, SERVER_GRACEFUL_STOP_TIMEOUT_MS)") &&
    teardown.includes("waitForChildExit(child, SERVER_FORCED_STOP_TIMEOUT_MS)"),
  "shutdown must observe both normal and signal exits, attempt graceful stop first, and use bounded waits",
);
assert(
  teardown.includes('spawn("taskkill", ["/PID", String(childPid), "/T", "/F"]') &&
    teardown.includes('process.platform === "win32"') &&
    teardown.includes('shell: false') &&
    teardown.includes('stdio: "ignore"') &&
    !teardown.includes('"/IM"') &&
    !teardown.toLowerCase().includes("node.exe") &&
    !teardown.includes("Get-Process") &&
    !teardown.includes("Stop-Process"),
  "Windows fallback must target only the retained child PID tree without kill-by-name or raw output",
);
assert(
  teardown.includes("waitForPortClosed(port, SERVER_PORT_CLOSE_TIMEOUT_MS)") &&
    teardown.includes('category: "SERVER_PORT_STILL_OPEN"') &&
    teardown.includes('"SERVER_STOP_TREE_TERMINATED"') &&
    teardown.includes("{ category: forcedCategory, stopped: true }") &&
    teardown.includes('category: "SERVER_STOP_EXIT_NOT_OBSERVED"') &&
    !teardown.includes("console.log") &&
    !teardown.includes("console.error"),
  "teardown must verify port closure and retain only bounded internal categories",
);
assert(
  source.includes("const stopResult = await server.close()") &&
    source.includes("SERVER_STOP_CATEGORIES.has(stopResult.category)") &&
    source.indexOf("if (server)") < source.indexOf("cleanupPassed = await cleanupFixtures") &&
    source.indexOf("cleanupPassed = await cleanupFixtures") <
      source.indexOf("processEnvironmentCleared = clearProcessEnvironment()") &&
    source.includes('failureCategory = "TEMPORARY_SERVER_STOP_FAILED"'),
  "teardown failure must remain independently visible without masking database or environment cleanup",
);

console.log("PASS narrow Assignment Practice live harness safety contract");
