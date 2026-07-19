#!/usr/bin/env node

// Source-only safety contract for the local Practice answer-state browser integration.

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sourceBlock(content, startMarker, endMarker) {
  const start = content.indexOf(startMarker);
  const end = content.indexOf(endMarker, start + startMarker.length);
  assert(start >= 0 && end > start, `source block not found: ${startMarker}`);
  return content.slice(start, end);
}

const root = process.cwd();
const [clientSource, harnessSource, layoutSource, routeSource] = await Promise.all([
  readFile(resolve(root, "src/components/practice/practice-agent-client.tsx"), "utf8"),
  readFile(resolve(root, "scripts/practice-answer-state-local-browser-e2e.mjs"), "utf8"),
  readFile(resolve(root, "src/app/layout.tsx"), "utf8"),
  readFile(resolve(root, "src/app/local-test/practice-answer-state/page.tsx"), "utf8"),
]);

assert(
  routeSource.includes('const LOCAL_BROWSER_TEST_ENV = "PRACTICE_ANSWER_STATE_LOCAL_BROWSER_E2E"') &&
    routeSource.includes('const LOCAL_BROWSER_TEST_CONFIRMATION = "ENABLED"') &&
    routeSource.includes('process.env.NODE_ENV === "production"') &&
    routeSource.includes("process.env[LOCAL_BROWSER_TEST_ENV] !== LOCAL_BROWSER_TEST_CONFIRMATION") &&
    routeSource.includes("notFound()") &&
    routeSource.includes("testOnlyDelayedHydration") &&
    routeSource.includes('assignmentId="LOCAL_BROWSER_ASSIGNMENT"'),
  "test-only page must be explicit-env gated, production denied, and render the real Practice client",
);
assert(
  !layoutSource.includes("/local-test/practice-answer-state") &&
    !routeSource.includes("Supabase") &&
    !routeSource.includes("createClient") &&
    !routeSource.includes("redirect("),
  "test-only page must not enter navigation or import authentication/data infrastructure",
);

const delayedHydrationBlock = sourceBlock(
  clientSource,
  "async function runTestOnlyDelayedHydration",
  "useEffect(() =>",
);
assert(
  delayedHydrationBlock.includes('"/__test__/practice-answer-state/delayed-hydration"') &&
    delayedHydrationBlock.includes('restoreRoundFromHistory(delayedRound, payload.session, "SESSION_HYDRATION")') &&
    delayedHydrationBlock.includes('answerWriteMetaRef.current.lastWriteReason === "INPUT"') &&
    delayedHydrationBlock.includes('"REJECTED_AS_STALE"') &&
    delayedHydrationBlock.includes('"APPLIED"') &&
    !delayedHydrationBlock.includes("setAnswers(") &&
    !delayedHydrationBlock.includes("answersRef.current ="),
  "delayed hydration probe must exercise the existing restore/commit path without recreating answer logic",
);
assert(
  clientSource.includes("if (!restoredCompleted) void runTestOnlyDelayedHydration()") &&
    clientSource.includes("data-test-only-delayed-hydration") &&
    (clientSource.match(/setAnswers\(/g) ?? []).length === 1 &&
    (clientSource.match(/answersRef\.current\s*=/g) ?? []).length === 1,
  "test probe must retain one authoritative answer write boundary",
);

assert(
  harnessSource.includes('import { chromium } from "playwright"') &&
    harnessSource.includes('chromium.launch({ channel: "msedge", headless: true })') &&
    harnessSource.includes("browser.newContext()") &&
    harnessSource.includes("for (let run = 0; run < repeat; run += 1)") &&
    harnessSource.includes("const MAX_REPEAT = 20") &&
    !harnessSource.includes("page.waitForTimeout") &&
    !harnessSource.includes("student-v1-browser-e2e") &&
    !harnessSource.includes("assignment-practice-resume-submit-live-e2e"),
  "local browser integration must run sequential fresh contexts without sleeps or live harness reuse",
);

const isolatedWorkspace = sourceBlock(
  harnessSource,
  "async function prepareIsolatedWorkspace",
  "function isolatedServerEnvironment",
);
assert(
  isolatedWorkspace.includes("isEnvironmentFile(source)") &&
    isolatedWorkspace.includes('resolve(root, "node_modules")') &&
    isolatedWorkspace.includes('"junction"') &&
    !isolatedWorkspace.includes('".git"') &&
    !isolatedWorkspace.includes('".next"'),
  "isolated workspace must copy only reviewed source/config and exclude environment/generated state",
);
const childEnvironment = sourceBlock(
  harnessSource,
  "function isolatedServerEnvironment",
  "async function findFreePort",
);
assert(
  childEnvironment.includes('NEXT_TELEMETRY_DISABLED: "1"') &&
    childEnvironment.includes('NODE_ENV: "development"') &&
    childEnvironment.includes("[TEST_ENV_NAME]: TEST_ENV_CONFIRMATION") &&
    !childEnvironment.includes("...process.env") &&
    !/(?:SUPABASE|GEMINI|DEEPSEEK|OPENAI|SERVICE_ROLE|ANON_KEY|PROVIDER_KEY)/.test(childEnvironment),
  "local server child must receive an allowlisted environment with no data/provider variables",
);
assert(
  !/(?:dotenv|loadEnvConfig|\.env\.local|readFile[^\n]*\.env)/i.test(harnessSource) &&
    !/(?:createClient|supabase-js|from\("profiles"\)|service_role)/i.test(harnessSource),
  "local harness must not load environment files or access Supabase",
);

const requestRouter = sourceBlock(
  harnessSource,
  'await context.route("**/*"',
  "try {",
);
for (const path of [
  "/api/practice/assignments/start",
  "/api/practice/sessions",
  "/api/practice/review",
  "/api/practice/grade",
  "/api/practice/preferences",
  "/api/practice/course-frameworks",
]) {
  assert(requestRouter.includes(path), `missing local API mock: ${path}`);
}
assert(
  requestRouter.includes("if (url.origin !== origin)") &&
    requestRouter.includes("externalRequestCount += 1") &&
    requestRouter.includes('route.abort("blockedbyclient")') &&
    requestRouter.includes("request.postDataJSON()") &&
    !/(?:console\.|writeFile|appendFile|createWriteStream|createHash)/.test(requestRouter),
  "browser router must block external traffic and keep request diagnostics in memory",
);

const journey = sourceBlock(harnessSource, "async function runBrowserJourney", "function verifyRunResult");
for (const selector of [
  '[data-client-ready="yes"]',
  '[data-answer-state-after-input="PRESENT"]',
  '[data-answer-ref-after-input="PRESENT"]',
  '[data-answer-state-ref-consistency="MATCH"]',
  '[data-answer-reset-after-input="NO"]',
  '[data-test-only-delayed-hydration="REJECTED_AS_STALE"]',
  '[data-current-round-question-count="1"]',
  '[data-submitted-attempt-count="1"]',
  '[data-submitted-attempt-answer="PRESENT"]',
  '[data-client-missing-answer-guard="PASSED"]',
  '[data-result="correct"]',
  '[data-answer-last-write-reason="COMPLETED_RESTORE"]',
]) {
  assert(journey.includes(selector), `missing bounded browser assertion: ${selector}`);
}
assert(
  journey.indexOf('answerControl.fill("LOCAL_VALID_ANSWER")') < journey.indexOf("hydrationRelease.resolve()") &&
    journey.indexOf("hydrationRelease.resolve()") < journey.indexOf('getByRole("button", { name: "Submit round" })') &&
    journey.includes("reviewRequestCount === 1") &&
    journey.includes('reviewRequestAnswer === "PRESENT"') &&
    journey.includes("completedDetailServed") &&
    journey.includes("gradeRequestCount === 0") &&
    journey.includes("externalRequestCount === 0") &&
    !/(?:console\.|inputValue\(|JSON\.stringify\([^)]*(?:attempt|answer)|answer\.length)/.test(journey),
  "journey must deliver stale hydration after input, validate one request, and expose only bounded states",
);

const cleanup = sourceBlock(harnessSource, "async function removeIsolatedWorkspace", "function tagContext");
assert(
  cleanup.includes("resolvedWorkspace.startsWith") &&
    cleanup.includes("basename(resolvedWorkspace).startsWith(TEMP_PREFIX)") &&
    cleanup.includes("rm(resolvedWorkspace, { force: true, recursive: true })"),
  "temporary artifact cleanup must verify its bounded temp target before recursive removal",
);

const output = sourceBlock(harnessSource, 'console.log("browser_framework=', "try {");
assert(
  output.includes("runs_passed=${passed}/${repeat}") &&
    output.includes('state_ref_consistency=MATCH') &&
    output.includes('external_network_calls=0') &&
    output.includes('temporary_servers_stopped=YES') &&
    output.includes('generated_artifacts_removed=YES') &&
    !/(?:answer\.length|inputValue|LOCAL_VALID_ANSWER|LOCAL_SOURCE|LOCAL_SESSION|http:|https:)/.test(output),
  "success output must contain only aggregate counts and bounded states",
);
assert(
  !/console\.(?:log|error|warn)\([^)]*(?:assignmentId|questionId|sessionId|roundId|postDataJSON|request\.url|element\.value)/.test(harnessSource),
  "harness output must not expose IDs, request bodies, URLs, or answer values",
);

console.log("PASS practice_answer_state_local_browser_e2e_safety_smoke");
