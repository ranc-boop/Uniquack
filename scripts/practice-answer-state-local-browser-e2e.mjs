#!/usr/bin/env node

import { spawn } from "node:child_process";
import { cp, mkdtemp, readdir, rm, symlink } from "node:fs/promises";
import { connect, createServer } from "node:net";
import { basename, join, resolve, sep } from "node:path";
import { tmpdir } from "node:os";

import { chromium } from "playwright";

const root = process.cwd();
const TEST_ENV_NAME = "PRACTICE_ANSWER_STATE_LOCAL_BROWSER_E2E";
const TEST_ENV_CONFIRMATION = "ENABLED";
const TEMP_PREFIX = "edustruct-practice-answer-state-";
const MAX_REPEAT = 20;
const LOCAL_HOST = "127.0.0.1";
const SERVER_READY_TIMEOUT_MS = 60_000;
const STEP_TIMEOUT_MS = 30_000;

class LocalBrowserHarnessError extends Error {
  constructor(category) {
    super(category);
    this.name = "LocalBrowserHarnessError";
    this.category = category;
  }
}

function assert(condition, category) {
  if (!condition) throw new LocalBrowserHarnessError(category);
}

function parseRepeat() {
  const match = /^--repeat=(\d{1,2})$/.exec(process.argv[2] ?? "");
  assert(match && process.argv.length === 3, "INVALID_REPEAT_ARGUMENT");
  const repeat = Number(match[1]);
  assert(Number.isSafeInteger(repeat) && repeat >= 1 && repeat <= MAX_REPEAT, "INVALID_REPEAT_ARGUMENT");
  return repeat;
}

function isEnvironmentFile(path) {
  return basename(path).toLowerCase().startsWith(".env");
}

async function prepareIsolatedWorkspace() {
  const workspace = await mkdtemp(join(tmpdir(), TEMP_PREFIX));
  const entries = [
    "src",
    "package.json",
    "package-lock.json",
    "tsconfig.json",
    "next.config.ts",
    "postcss.config.mjs",
    "tailwind.config.ts",
    "next-env.d.ts",
  ];

  try {
    for (const entry of entries) {
      await cp(resolve(root, entry), resolve(workspace, entry), {
        filter: (source) => !isEnvironmentFile(source),
        recursive: true,
      });
    }
    await symlink(resolve(root, "node_modules"), resolve(workspace, "node_modules"), "junction");

    const topLevelNames = await readdir(workspace);
    assert(!topLevelNames.some((name) => isEnvironmentFile(name)), "ENVIRONMENT_FILE_COPIED");
    return workspace;
  } catch (error) {
    await removeIsolatedWorkspace(workspace);
    throw error;
  }
}

function isolatedServerEnvironment() {
  const environment = {};
  for (const name of [
    "APPDATA",
    "HOME",
    "LOCALAPPDATA",
    "Path",
    "PATH",
    "SystemRoot",
    "TEMP",
    "TMP",
    "USERPROFILE",
    "WINDIR",
  ]) {
    if (process.env[name]) environment[name] = process.env[name];
  }
  return {
    ...environment,
    NEXT_TELEMETRY_DISABLED: "1",
    NODE_ENV: "development",
    [TEST_ENV_NAME]: TEST_ENV_CONFIRMATION,
  };
}

async function findFreePort() {
  return new Promise((resolvePort, rejectPort) => {
    const server = createServer();
    server.unref();
    server.once("error", rejectPort);
    server.listen(0, LOCAL_HOST, () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close((error) => error ? rejectPort(error) : resolvePort(port));
    });
  });
}

function localServerFailureCategory(output, lastStatus) {
  if (/module not found|can't resolve|cannot find module/i.test(output)) {
    return "LOCAL_SERVER_MODULE_RESOLUTION_FAILED";
  }
  if (/failed to compile|compile error|module build failed|syntax error/i.test(output)) {
    return "LOCAL_SERVER_COMPILE_FAILED";
  }
  if (/invalid next\.config|failed to load next\.config/i.test(output)) {
    return "LOCAL_SERVER_CONFIG_FAILED";
  }
  if (lastStatus >= 500) return "LOCAL_SERVER_HTTP_5XX";
  if (lastStatus === 404) return "LOCAL_SERVER_TEST_ROUTE_NOT_FOUND";
  return "LOCAL_SERVER_NOT_READY";
}

async function waitForServer(origin, child, runtimeOutput) {
  const deadline = Date.now() + SERVER_READY_TIMEOUT_MS;
  let lastStatus = 0;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new LocalBrowserHarnessError("LOCAL_SERVER_EXITED_EARLY");
    try {
      const response = await fetch(`${origin}/local-test/practice-answer-state`, {
        redirect: "manual",
      });
      lastStatus = response.status;
      if (response.status === 200) return;
    } catch {
      // The bounded poll waits only for the local listener and route compilation.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  throw new LocalBrowserHarnessError(
    localServerFailureCategory(runtimeOutput.text, lastStatus),
  );
}

async function startLocalServer(workspace) {
  const port = await findFreePort();
  assert(Number.isSafeInteger(port) && port > 0, "LOCAL_PORT_UNAVAILABLE");
  const nextBin = resolve(root, "node_modules", "next", "dist", "bin", "next");
  const child = spawn(
    process.execPath,
    [nextBin, "dev", "--webpack", "--hostname", LOCAL_HOST, "--port", String(port)],
    {
      cwd: workspace,
      env: isolatedServerEnvironment(),
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    },
  );
  const runtimeOutput = { text: "" };
  const retainBoundedOutput = (chunk) => {
    if (runtimeOutput.text.length >= 64_000) return;
    runtimeOutput.text += String(chunk).slice(0, 64_000 - runtimeOutput.text.length);
  };
  child.stdout.on("data", retainBoundedOutput);
  child.stderr.on("data", retainBoundedOutput);
  const origin = `http://${LOCAL_HOST}:${port}`;
  const server = { child, origin, port };
  try {
    await waitForServer(origin, child, runtimeOutput);
    return server;
  } catch (error) {
    await stopLocalServer(server);
    throw error;
  }
}

function waitForChildExit(child, timeoutMs) {
  if (child.exitCode !== null) return Promise.resolve(true);
  return new Promise((resolveExit) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolveExit(value);
    };
    const timer = setTimeout(() => finish(false), timeoutMs);
    child.once("exit", () => finish(true));
  });
}

function portIsListening(port) {
  return new Promise((resolveListening) => {
    const socket = connect({ host: LOCAL_HOST, port });
    socket.once("connect", () => {
      socket.destroy();
      resolveListening(true);
    });
    socket.once("error", () => resolveListening(false));
    socket.setTimeout(500, () => {
      socket.destroy();
      resolveListening(false);
    });
  });
}

async function waitForPortClosed(port) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (!(await portIsListening(port))) return true;
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  return !(await portIsListening(port));
}

async function stopLocalServer(server) {
  if (process.platform === "win32" && server.child.exitCode === null) {
    await new Promise((resolveKill) => {
      const killer = spawn("taskkill", ["/PID", String(server.child.pid), "/T", "/F"], {
        shell: false,
        stdio: "ignore",
        windowsHide: true,
      });
      killer.once("exit", resolveKill);
      killer.once("error", resolveKill);
    });
  } else if (server.child.exitCode === null) {
    server.child.kill("SIGTERM");
  }
  const exited = await waitForChildExit(server.child, 5_000);
  const portClosed = await waitForPortClosed(server.port);
  return exited && portClosed;
}

async function removeIsolatedWorkspace(workspace) {
  const resolvedWorkspace = resolve(workspace);
  const resolvedTemp = resolve(tmpdir());
  assert(
    resolvedWorkspace.startsWith(`${resolvedTemp}${sep}`) &&
      basename(resolvedWorkspace).startsWith(TEMP_PREFIX),
    "UNSAFE_TEMP_CLEANUP_TARGET",
  );
  await rm(resolvedWorkspace, { force: true, recursive: true });
}

function tagContext() {
  return { confirmedTagIds: [], usefulTags: [], version: 1 };
}

function localQuestion() {
  return {
    contentExcerpt: "Local integration question",
    contentHtml: "<p>Enter the expected local response.</p>",
    difficulty: 1,
    expectedSkill: "Local answer-state synchronization",
    id: "LOCAL_ROUND_QUESTION",
    options: [],
    position: 0,
    questionCode: "LOCAL-Q1",
    questionId: "LOCAL_SOURCE_QUESTION",
    questionType: "fill_blank",
    reason: "Validate the real Practice answer path.",
    source: "local-browser-integration",
    sourceQuestionId: "LOCAL_SOURCE_QUESTION",
    tagIds: [],
    title: "Local answer-state question",
  };
}

function localRecommendation() {
  const question = localQuestion();
  return {
    maxToolCalls: 0,
    mode: "heuristic",
    recommendations: [{
      contentExcerpt: question.contentExcerpt,
      contentHtml: question.contentHtml,
      difficulty: question.difficulty,
      expectedSkill: question.expectedSkill,
      id: question.id,
      options: question.options,
      questionCode: question.questionCode,
      questionType: question.questionType,
      reason: question.reason,
      source: question.source,
      sourceQuestionId: question.sourceQuestionId,
      tagIds: question.tagIds,
      title: question.title,
    }],
    roundGoal: "Local answer-state validation",
    roundId: "LOCAL_ROUND",
    sessionId: "LOCAL_SESSION",
    sessionMemory: "",
    tagContext: tagContext(),
    trace: [],
  };
}

function localRound(completed) {
  return {
    attempts: completed ? [{
      answer: "LOCAL_VALID_ANSWER",
      explanation: "Local review completed.",
      hintCount: 0,
      hints: [],
      id: "LOCAL_ATTEMPT",
      isCorrect: true,
      questionId: "LOCAL_SOURCE_QUESTION",
      score: 1,
      solutionHtml: "<p>Local solution.</p>",
      sourceQuestionId: "LOCAL_SOURCE_QUESTION",
    }] : [],
    id: "LOCAL_ROUND",
    nextRoundGoal: null,
    questions: [localQuestion()],
    reviewSummary: completed ? "Local review completed." : null,
    roundGoal: "Local answer-state validation",
    score: { correct: completed ? 1 : 0, total: completed ? 1 : 0 },
    trace: [],
  };
}

function localSession(completed) {
  return {
    completedQuestionIds: completed ? ["LOCAL_SOURCE_QUESTION"] : [],
    createdAt: "2026-01-01T00:00:00.000Z",
    goal: "Local answer-state validation",
    id: "LOCAL_SESSION",
    lastActivityAt: "2026-01-01T00:00:00.000Z",
    outlineUserNotes: "",
    roundCount: 1,
    rounds: [localRound(completed)],
    sessionMemory: "",
    status: "active",
    tagContext: tagContext(),
    title: "Local Practice Session",
  };
}

function localReviewResult() {
  return {
    explanation: "Local review completed.",
    gradingMode: "auto",
    isCorrect: true,
    questionId: "LOCAL_SOURCE_QUESTION",
    score: 1,
    solutionHtml: "<p>Local solution.</p>",
  };
}

function jsonResponse(route, body, status = 200) {
  return route.fulfill({
    body: JSON.stringify(body),
    contentType: "application/json",
    status,
  });
}

function sseResponse(route, events) {
  const body = events
    .map(({ data, event }) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
    .join("");
  return route.fulfill({
    body,
    headers: { "Content-Type": "text/event-stream; charset=utf-8" },
    status: 200,
  });
}

function hasPresentAnswer(value) {
  return typeof value === "string"
    ? Boolean(value.trim())
    : Array.isArray(value) && value.length > 0;
}

function deferred() {
  let resolvePromise;
  const promise = new Promise((resolveDeferred) => {
    resolvePromise = resolveDeferred;
  });
  return { promise, resolve: resolvePromise };
}

function withTimeout(promise, category) {
  return new Promise((resolvePromise, rejectPromise) => {
    const timer = setTimeout(
      () => rejectPromise(new LocalBrowserHarnessError(category)),
      STEP_TIMEOUT_MS,
    );
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolvePromise(value);
      },
      (error) => {
        clearTimeout(timer);
        rejectPromise(error);
      },
    );
  });
}

async function runBrowserJourney(browser, origin) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const hydrationRequested = deferred();
  const hydrationRelease = deferred();
  const hydrationResponseServed = deferred();
  const reviewObserved = deferred();
  const completedRefreshObserved = deferred();
  let completed = false;
  let completedDetailServed = false;
  let externalRequestCount = 0;
  let gradeRequestCount = 0;
  let hydrationRequestCount = 0;
  let pageErrorCount = 0;
  let reviewRequestAnswer = "NOT_OBSERVED";
  let reviewRequestCount = 0;
  let startRequestCount = 0;
  let unexpectedApiCount = 0;
  let phase = "NAVIGATION";

  page.on("pageerror", () => {
    pageErrorCount += 1;
  });

  await context.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== origin) {
      externalRequestCount += 1;
      await route.abort("blockedbyclient");
      return;
    }

    if (url.pathname === "/__test__/practice-answer-state/delayed-hydration") {
      hydrationRequestCount += 1;
      hydrationRequested.resolve();
      await hydrationRelease.promise;
      await jsonResponse(route, { session: localSession(false) });
      hydrationResponseServed.resolve();
      return;
    }

    if (url.pathname === "/api/practice/assignments/start" && request.method() === "POST") {
      startRequestCount += 1;
      await jsonResponse(route, {
        assignment: {
          dueAt: null,
          id: "LOCAL_BROWSER_ASSIGNMENT",
          itemCount: 1,
          title: "Local answer-state assignment",
        },
        progressStatus: completed ? "completed" : "in_progress",
        recommendation: localRecommendation(),
        session: localSession(completed),
      });
      return;
    }

    if (url.pathname === "/api/practice/sessions" && request.method() === "GET") {
      const session = localSession(completed);
      await jsonResponse(route, { activeSession: session, sessions: [session] });
      return;
    }

    if (url.pathname.startsWith("/api/practice/sessions/") && request.method() === "GET") {
      const session = localSession(completed);
      if (completed) completedDetailServed = true;
      await jsonResponse(route, { session });
      return;
    }

    if (url.pathname === "/api/practice/wrong-questions" && request.method() === "GET") {
      await jsonResponse(route, { wrongQuestions: [] });
      return;
    }

    if (url.pathname === "/api/practice/preferences" && request.method() === "GET") {
      await jsonResponse(route, {
        cacheStatsEnabled: false,
        fullCallLogsEnabled: false,
        longTermPreference: "",
        pendingMergeCount: 0,
      });
      return;
    }

    if (url.pathname === "/api/practice/course-frameworks" && request.method() === "GET") {
      await jsonResponse(route, { frameworks: [] });
      if (completed) completedRefreshObserved.resolve();
      return;
    }

    if (url.pathname === "/api/practice/review" && request.method() === "POST") {
      reviewRequestCount += 1;
      const payload = request.postDataJSON();
      const attempts = Array.isArray(payload?.attempts) ? payload.attempts : [];
      reviewRequestAnswer = attempts.length === 1 && hasPresentAnswer(attempts[0]?.answer)
        ? "PRESENT"
        : "EMPTY";
      completed = true;
      reviewObserved.resolve();
      const result = localReviewResult();
      await sseResponse(route, [
        {
          data: {
            result,
            review: {
              isCorrect: true,
              judgmentReason: "Local review completed.",
              questionId: result.questionId,
              score: 1,
              verdict: "correct",
            },
          },
          event: "question_review",
        },
        { data: {}, event: "round_review_start" },
        { data: { text: "Local review completed." }, event: "round_review_delta" },
        {
          data: {
            mode: "heuristic",
            nextRoundGoal: "",
            questionReviews: [],
            results: [result],
            sessionId: "LOCAL_SESSION",
            summary: "Local review completed.",
            trace: [],
            updatedSessionMemory: "",
          },
          event: "result",
        },
      ]);
      return;
    }

    if (url.pathname === "/api/practice/grade" && request.method() === "POST") {
      gradeRequestCount += 1;
      await jsonResponse(route, { results: [localReviewResult()], trace: [] });
      return;
    }

    if (url.pathname.startsWith("/api/practice/")) {
      unexpectedApiCount += 1;
      await jsonResponse(route, { error: "LOCAL_API_NOT_MOCKED" }, 500);
      return;
    }

    await route.continue();
  });

  try {
    await page.goto(`${origin}/local-test/practice-answer-state`, {
      waitUntil: "domcontentloaded",
    });
    phase = "INITIAL_RESTORE";
    const answerContainer = page.locator(
      '[data-testid="practice-answer-control"][data-client-ready="yes"][data-answer-committed="no"]',
    );
    await answerContainer.waitFor({ timeout: STEP_TIMEOUT_MS });
    const answerControl = page.getByPlaceholder("Enter your final answer", { exact: true });
    await answerControl.waitFor({ timeout: STEP_TIMEOUT_MS });
    assert(
      await answerControl.evaluate((element) => !element.value.trim()),
      "INITIAL_RESTORED_ANSWER_NOT_EMPTY",
    );
    await page.locator(
      '[data-testid="practice-submission-state"]' +
        '[data-answer-state-before-submit="EMPTY"]' +
        '[data-answer-ref-before-submit="EMPTY"]' +
        '[data-answer-state-ref-consistency="MATCH"]' +
        '[data-answer-last-write-reason="SESSION_HYDRATION"]' +
        '[data-test-only-delayed-hydration="REQUESTED"]',
    ).waitFor({ timeout: STEP_TIMEOUT_MS });
    await withTimeout(hydrationRequested.promise, "DELAYED_HYDRATION_NOT_REQUESTED");

    phase = "INPUT_COMMIT";
    await answerControl.fill("LOCAL_VALID_ANSWER");
    await page.locator(
      '[data-testid="practice-submission-state"]' +
        '[data-answer-state-after-input="PRESENT"]' +
        '[data-answer-ref-after-input="PRESENT"]' +
        '[data-answer-state-before-submit="PRESENT"]' +
        '[data-answer-ref-before-submit="PRESENT"]' +
        '[data-answer-state-ref-consistency="MATCH"]' +
        '[data-answer-reset-after-input="NO"]' +
        '[data-answer-last-write-reason="INPUT"]',
    ).waitFor({ timeout: STEP_TIMEOUT_MS });
    await page.locator(
      '[data-testid="practice-answer-control"][data-answer-committed="yes"]',
    ).waitFor({ timeout: STEP_TIMEOUT_MS });

    phase = "DELAYED_HYDRATION_RELEASE";
    hydrationRelease.resolve();
    phase = "DELAYED_HYDRATION_RESPONSE";
    await withTimeout(hydrationResponseServed.promise, "DELAYED_HYDRATION_RESPONSE_NOT_SERVED");
    phase = "DELAYED_HYDRATION_SEMANTIC_STATE";
    try {
      await page.locator(
        '[data-testid="practice-submission-state"]' +
          '[data-answer-state-before-submit="PRESENT"]' +
          '[data-answer-ref-before-submit="PRESENT"]' +
          '[data-answer-state-ref-consistency="MATCH"]' +
          '[data-answer-reset-after-input="NO"]' +
          '[data-answer-last-write-reason="INPUT"]' +
          '[data-test-only-delayed-hydration="REJECTED_AS_STALE"]',
      ).waitFor({ timeout: STEP_TIMEOUT_MS });
    } catch {
      const boundedCategory = await page
        .locator('[data-testid="practice-submission-state"]')
        .evaluate((element) => {
          const hydration = element.getAttribute("data-test-only-delayed-hydration");
          if (hydration === "APPLIED") return "STALE_HYDRATION_APPLIED";
          if (hydration === "FAILED") return "DELAYED_HYDRATION_PROBE_FAILED";
          if (hydration === "REQUESTED") return "DELAYED_HYDRATION_NOT_PROCESSED";
          if (element.getAttribute("data-answer-reset-after-input") === "YES") {
            return "ANSWER_RESET_AFTER_DELAYED_HYDRATION";
          }
          if (element.getAttribute("data-answer-state-ref-consistency") === "MISMATCH") {
            return "STATE_REF_MISMATCH_AFTER_DELAYED_HYDRATION";
          }
          return "DELAYED_HYDRATION_STATE_UNRECOGNIZED";
        })
        .catch(() => "DELAYED_HYDRATION_STATE_UNAVAILABLE");
      throw new LocalBrowserHarnessError(boundedCategory);
    }
    phase = "DELAYED_HYDRATION_DOM_STATE";
    assert(
      await answerControl.evaluate((element) => Boolean(element.value.trim())),
      "ANSWER_ERASED_AFTER_DELAYED_HYDRATION",
    );

    phase = "SUBMIT";
    await page.getByRole("button", { name: "Submit round" }).click();
    phase = "REVIEW_RESULT";
    await page.locator(
      '[data-testid="practice-submission-state"]' +
        '[data-current-round-question-count="1"]' +
        '[data-submitted-attempt-count="1"]' +
        '[data-submitted-attempt-answer="PRESENT"]' +
        '[data-missing-required-attempt-count="0"]' +
        '[data-client-missing-answer-guard="PASSED"]',
    ).waitFor({ timeout: STEP_TIMEOUT_MS });
    await withTimeout(reviewObserved.promise, "REVIEW_REQUEST_NOT_OBSERVED");
    assert(reviewRequestCount === 1, "REVIEW_REQUEST_COUNT_INVALID");
    assert(reviewRequestAnswer === "PRESENT", "REVIEW_REQUEST_ANSWER_EMPTY");
    await page.locator(
      '[data-testid="practice-result-badge"][data-result="correct"]',
    ).waitFor({ timeout: STEP_TIMEOUT_MS });
    await withTimeout(completedRefreshObserved.promise, "COMPLETED_REFRESH_NOT_OBSERVED");
    assert(
      await answerControl.evaluate(
        (element) => element.disabled && Boolean(element.value.trim()),
      ),
      "SUBMITTED_ANSWER_NOT_VISIBLE_IMMUTABLE",
    );

    phase = "COMPLETED_RELOAD";
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.locator(
      '[data-testid="practice-result-badge"][data-result="correct"]',
    ).waitFor({ timeout: STEP_TIMEOUT_MS });
    const completedControl = page
      .locator('[data-testid="practice-answer-control"][data-answer-committed="yes"]')
      .getByPlaceholder("Enter your final answer", { exact: true });
    await completedControl.waitFor({ timeout: STEP_TIMEOUT_MS });
    assert(
      await completedControl.evaluate(
        (element) => element.disabled && Boolean(element.value.trim()),
      ),
      "COMPLETED_ANSWER_NOT_RESTORED_IMMUTABLE",
    );
    await page.locator(
      '[data-testid="practice-submission-state"]' +
        '[data-answer-state-before-submit="PRESENT"]' +
        '[data-answer-ref-before-submit="PRESENT"]' +
        '[data-answer-state-ref-consistency="MATCH"]' +
        '[data-answer-last-write-reason="COMPLETED_RESTORE"]',
    ).waitFor({ timeout: STEP_TIMEOUT_MS });

    phase = "COMPLETED_ASSERTIONS";
    assert(startRequestCount === 2, "COMPONENT_REMOUNT_NOT_OBSERVED");
    assert(completedDetailServed, "COMPLETED_SESSION_DETAIL_NOT_SERVED");
    assert(localSession(true).rounds[0].attempts.length === 1, "COMPLETED_ATTEMPT_COUNT_INVALID");
    assert(reviewRequestCount === 1, "SECOND_ATTEMPT_CREATED");
    assert(hydrationRequestCount === 1, "DELAYED_HYDRATION_REQUEST_COUNT_INVALID");
    assert(gradeRequestCount === 0, "UNEXPECTED_GRADE_FALLBACK");
    assert(unexpectedApiCount === 0, "UNEXPECTED_PRACTICE_API_REQUEST");
    assert(pageErrorCount === 0, "BROWSER_PAGE_ERROR");
    assert(externalRequestCount === 0, "EXTERNAL_NETWORK_REQUEST");

    return {
      answerResetAfterDelayedHydration: "NO",
      completedAnswer: "PRESENT_IMMUTABLE",
      externalNetworkCalls: 0,
      guard: "PASSED",
      reviewRequest: "INVOKED",
      reviewRequestAnswer,
      stateRefConsistency: "MATCH",
      submittedAttempt: "FOUND_PRESENT",
    };
  } catch (error) {
    if (error instanceof LocalBrowserHarnessError) throw error;
    throw new LocalBrowserHarnessError(`BROWSER_${phase}_FAILED`);
  } finally {
    hydrationRelease.resolve();
    await context.close();
  }
}

function verifyRunResult(result) {
  assert(result.stateRefConsistency === "MATCH", "STATE_REF_MISMATCH");
  assert(result.answerResetAfterDelayedHydration === "NO", "ANSWER_RESET_AFTER_HYDRATION");
  assert(result.submittedAttempt === "FOUND_PRESENT", "SUBMITTED_ATTEMPT_INVALID");
  assert(result.guard === "PASSED", "MISSING_ANSWER_GUARD_BLOCKED");
  assert(result.reviewRequest === "INVOKED", "REVIEW_REQUEST_NOT_INVOKED");
  assert(result.reviewRequestAnswer === "PRESENT", "REVIEW_REQUEST_ANSWER_EMPTY");
  assert(result.completedAnswer === "PRESENT_IMMUTABLE", "COMPLETED_RESTORE_INVALID");
  assert(result.externalNetworkCalls === 0, "EXTERNAL_NETWORK_REQUEST");
}

async function main() {
  const repeat = parseRepeat();
  let workspace = null;
  let server = null;
  let browser = null;
  let passed = 0;
  let serversStopped = false;
  let artifactsRemoved = false;
  let phase = "WORKSPACE_PREPARE";
  try {
    workspace = await prepareIsolatedWorkspace();
    phase = "SERVER_START";
    server = await startLocalServer(workspace);
    phase = "BROWSER_LAUNCH";
    browser = await chromium.launch({ channel: "msedge", headless: true });
    phase = "BROWSER_JOURNEY";
    for (let run = 0; run < repeat; run += 1) {
      const result = await runBrowserJourney(browser, server.origin);
      verifyRunResult(result);
      passed += 1;
    }
  } catch (error) {
    if (error instanceof LocalBrowserHarnessError) throw error;
    throw new LocalBrowserHarnessError(`MAIN_${phase}_FAILED`);
  } finally {
    if (browser) await browser.close().catch(() => {});
    if (server) serversStopped = await stopLocalServer(server);
    if (workspace) {
      await removeIsolatedWorkspace(workspace);
      artifactsRemoved = true;
    }
  }

  assert(passed === repeat, "RUN_COUNT_MISMATCH");
  assert(serversStopped, "TEMPORARY_SERVER_NOT_STOPPED");
  assert(artifactsRemoved, "GENERATED_ARTIFACTS_NOT_REMOVED");
  console.log("browser_framework=PLAYWRIGHT_MS_EDGE");
  console.log(`runs_passed=${passed}/${repeat}`);
  console.log("state_ref_consistency=MATCH");
  console.log("answer_reset_after_delayed_hydration=NO");
  console.log("submitted_attempt=FOUND_PRESENT");
  console.log("missing_answer_guard=PASSED");
  console.log("review_request=INVOKED");
  console.log("review_request_answer=PRESENT");
  console.log("completed_answer=PRESENT_IMMUTABLE");
  console.log("external_network_calls=0");
  console.log("temporary_servers_stopped=YES");
  console.log("generated_artifacts_removed=YES");
  console.log("PASS practice_answer_state_local_browser_e2e");
}

try {
  await main();
} catch (error) {
  const category = error instanceof LocalBrowserHarnessError
    ? error.category
    : "LOCAL_BROWSER_HARNESS_FAILURE";
  console.error(`FAIL practice_answer_state_local_browser_e2e category=${category}`);
  process.exitCode = 1;
}
