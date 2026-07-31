#!/usr/bin/env node

import { spawn } from "node:child_process";
import { rmSync } from "node:fs";
import { cp, mkdtemp, readdir, symlink, unlink } from "node:fs/promises";
import { connect, createServer } from "node:net";
import { basename, resolve, join, sep } from "node:path";
import { tmpdir } from "node:os";

import { chromium } from "playwright";

const root = process.cwd();
const LOCAL_HOST = "127.0.0.1";
const SERVER_READY_TIMEOUT_MS = 60_000;
const STEP_TIMEOUT_MS = 15_000;
const TEMP_PREFIX = "edustruct-assignment-atomicity-";
const TEST_ENV_NAME = "PRACTICE_ANSWER_STATE_LOCAL_BROWSER_E2E";
const TEST_ENV_CONFIRMATION = "ENABLED";

class AssignmentAtomicityHarnessError extends Error {
  constructor(category) {
    super(category);
    this.name = "AssignmentAtomicityHarnessError";
    this.category = category;
  }
}

function assert(condition, category) {
  if (!condition) throw new AssignmentAtomicityHarnessError(category);
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
      () => rejectPromise(new AssignmentAtomicityHarnessError(category)),
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
    assert(
      !topLevelNames.some((name) => isEnvironmentFile(name)),
      "ENVIRONMENT_FILE_COPIED",
    );
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

async function waitForServer(origin, child) {
  const deadline = Date.now() + SERVER_READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new AssignmentAtomicityHarnessError("LOCAL_SERVER_EXITED_EARLY");
    }
    try {
      const response = await fetch(`${origin}/local-test/practice-answer-state`, {
        redirect: "manual",
      });
      if (response.status === 200) return;
    } catch {
      // Bounded local-only readiness polling.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  throw new AssignmentAtomicityHarnessError("LOCAL_SERVER_NOT_READY");
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
      stdio: ["ignore", "ignore", "ignore"],
      windowsHide: true,
    },
  );
  const origin = `http://${LOCAL_HOST}:${port}`;
  const server = { child, origin, port };
  try {
    await waitForServer(origin, child);
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
    const killer = spawn("taskkill", ["/PID", String(server.child.pid), "/T", "/F"], {
      shell: false,
      stdio: "ignore",
      windowsHide: true,
    });
    const killerExited = await waitForChildExit(killer, 10_000);
    if (!killerExited && killer.exitCode === null) killer.kill("SIGKILL");
  } else if (server.child.exitCode === null) {
    server.child.kill("SIGTERM");
    if (!(await waitForChildExit(server.child, 5_000))) {
      server.child.kill("SIGKILL");
    }
  }
  let childExited = await waitForChildExit(server.child, 10_000);
  if (!childExited && server.child.exitCode === null) {
    server.child.kill("SIGKILL");
    childExited = await waitForChildExit(server.child, 5_000);
  }
  return childExited && await waitForPortClosed(server.port);
}

async function removeIsolatedWorkspace(workspace) {
  if (!workspace) return;
  const resolvedWorkspace = resolve(workspace);
  const resolvedTemp = resolve(tmpdir());
  assert(
    resolvedWorkspace.startsWith(`${resolvedTemp}${sep}`) &&
      basename(resolvedWorkspace).startsWith(TEMP_PREFIX),
    "UNSAFE_TEMPORARY_WORKSPACE_PATH",
  );
  await unlink(resolve(resolvedWorkspace, "node_modules")).catch((error) => {
    if (error?.code !== "ENOENT") throw error;
  });
  await new Promise((resolveWait) => setTimeout(resolveWait, 500));
  rmSync(resolvedWorkspace, {
    force: true,
    maxRetries: 20,
    recursive: true,
    retryDelay: 100,
  });
}

function tagContext() {
  return {
    confirmedTagIds: ["atomic-tag"],
    usefulTags: [
      {
        searchableQuestionCount: 1,
        source: "search",
        tagId: "atomic-tag",
      },
    ],
    version: 1,
  };
}

function assignmentFixture() {
  return {
    dueAt: null,
    id: "LOCAL_BROWSER_ASSIGNMENT",
    itemCount: 1,
    title: "Atomic assignment marker",
  };
}

function sessionFixture() {
  return {
    completedQuestionIds: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    goal: "Atomicity validation",
    id: "ATOMIC_SESSION",
    lastActivityAt: "2026-01-01T00:00:00.000Z",
    outlineUserNotes: "",
    roundCount: 0,
    rounds: [],
    sessionMemory: "",
    sourceScope: [{
      assignmentId: "LOCAL_BROWSER_ASSIGNMENT",
      name: "Atomic session marker",
      sourceKind: "assignment",
    }],
    sourceScopeLockedAt: "2026-01-01T00:00:00.000Z",
    status: "active",
    tagContext: tagContext(),
    title: "Atomic session marker",
  };
}

function recommendationFixture() {
  return {
    maxToolCalls: 0,
    mode: "heuristic",
    recommendations: [],
    roundGoal: "Atomicity validation",
    sessionId: "ATOMIC_SESSION",
    sessionMemory: "",
    tagContext: tagContext(),
    trace: [],
  };
}

function startPayload() {
  return {
    assignment: assignmentFixture(),
    progressStatus: "in_progress",
    recommendation: recommendationFixture(),
    session: sessionFixture(),
  };
}

async function installParsedPayloadCapture(page) {
  await page.addInitScript(() => {
    const nativeFetch = window.fetch.bind(window);
    window.__assignmentAtomicityProbe = {
      parseCalls: 0,
      parseRejected: false,
      payload: null,
    };
    window.fetch = async (...args) => {
      const response = await nativeFetch(...args);
      const requestUrl = String(args[0] instanceof Request ? args[0].url : args[0]);
      if (!requestUrl.includes("/api/practice/assignments/start")) return response;

      const nativeJson = response.json.bind(response);
      response.json = async () => {
        window.__assignmentAtomicityProbe.parseCalls += 1;
        try {
          const payload = await nativeJson();
          window.__assignmentAtomicityProbe.payload = payload;
          return payload;
        } catch (error) {
          window.__assignmentAtomicityProbe.parseRejected = true;
          throw error;
        }
      };
      return response;
    };
  });
}

async function activationState(page) {
  return page.evaluate(() => {
    const probe = window.__assignmentAtomicityProbe;
    const assignment = probe?.payload?.assignment;
    const session = probe?.payload?.session;
    const fibers = new Set();

    for (const element of document.querySelectorAll("*")) {
      const fiberKey = Object.keys(element).find((key) => key.startsWith("__reactFiber$"));
      let fiber = fiberKey ? element[fiberKey] : null;
      while (fiber) {
        fibers.add(fiber);
        if (fiber.alternate) fibers.add(fiber.alternate);
        fiber = fiber.return;
      }
    }

    const queueContains = (queue, target) => {
      if (!queue || !target) return false;
      let update = queue;
      let count = 0;
      do {
        if (update.action === target) return true;
        update = update.next;
        count += 1;
      } while (update && update !== queue && count < 1_000);
      return false;
    };

    const hookContains = (firstHook, target) => {
      if (!target) return false;
      let hook = firstHook;
      let count = 0;
      while (hook && count < 1_000) {
        if (
          hook.memoizedState === target ||
          hook.baseState === target ||
          queueContains(hook.baseQueue, target) ||
          queueContains(hook.queue?.pending, target)
        ) {
          return true;
        }
        hook = hook.next;
        count += 1;
      }
      return false;
    };

    let componentFound = false;
    let assignmentReferenceFound = false;
    let sessionReferenceFound = false;
    for (const fiber of fibers) {
      const name = fiber.type?.name ?? fiber.elementType?.name ?? "";
      if (name === "PracticeAgentClient") componentFound = true;
      assignmentReferenceFound ||= hookContains(fiber.memoizedState, assignment);
      sessionReferenceFound ||= hookContains(fiber.memoizedState, session);
    }

    const assignmentClone = assignment ? { ...assignment } : null;
    const sessionClone = session ? { ...session } : null;
    let assignmentCloneFound = false;
    let sessionCloneFound = false;
    for (const fiber of fibers) {
      assignmentCloneFound ||= hookContains(fiber.memoizedState, assignmentClone);
      sessionCloneFound ||= hookContains(fiber.memoizedState, sessionClone);
    }

    return {
      assignmentCloneFound,
      assignmentReferenceFound,
      componentFound,
      parseCalls: probe?.parseCalls ?? 0,
      parseRejected: probe?.parseRejected ?? false,
      payloadCaptured: Boolean(probe?.payload),
      sessionCloneFound,
      sessionReferenceFound,
    };
  });
}

async function visibleActivation(page) {
  return {
    assignment: await page.getByText("Atomic assignment marker", { exact: false }).count(),
    root: await page.locator('[data-testid="practice-submission-state"]').count(),
    session: await page.getByText("Atomic session marker", { exact: false }).count(),
  };
}

async function waitForError(page) {
  await page.locator('[role="alert"]').first().waitFor({ timeout: STEP_TIMEOUT_MS });
}

function jsonResponse(route, body, status = 200) {
  return route.fulfill({
    body: JSON.stringify(body),
    contentType: "application/json",
    status,
  });
}

async function runCase(browser, origin, mode) {
  const context = await browser.newContext();
  const page = await context.newPage();
  let phase = "capture_install";
  await installParsedPayloadCapture(page);

  const startObserved = deferred();
  const startRelease = deferred();
  const refreshObserved = deferred();
  const refreshRelease = deferred();
  const counters = {
    external: 0,
    pageErrors: 0,
    refresh: 0,
    start: 0,
    unexpectedApi: 0,
    wrong: 0,
  };
  let startRequestBody = null;
  let refreshSessionId = null;

  page.on("pageerror", () => {
    counters.pageErrors += 1;
  });

  await context.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== origin) {
      counters.external += 1;
      await route.abort("blockedbyclient");
      return;
    }

    if (url.pathname === "/api/practice/assignments/start") {
      counters.start += 1;
      startRequestBody = request.postDataJSON();
      startObserved.resolve();
      if (mode === "valid") await startRelease.promise;
      if (mode === "request_rejection") {
        await route.abort("failed");
        return;
      }
      if (mode === "parse_rejection") {
        await route.fulfill({
          body: "{malformed",
          contentType: "application/json",
          status: 200,
        });
        return;
      }

      const payload = startPayload();
      if (mode === "missing_assignment") delete payload.assignment;
      if (mode === "missing_session") delete payload.session;
      await jsonResponse(route, payload);
      return;
    }

    if (url.pathname === "/api/practice/sessions" && request.method() === "GET") {
      counters.refresh += 1;
      refreshObserved.resolve();
      if (mode === "valid") await refreshRelease.promise;
      if (mode === "refresh_rejection") {
        await jsonResponse(route, { error: "LOCAL_REFRESH_REJECTED" }, 503);
        return;
      }
      await jsonResponse(route, { activeSession: null, sessions: [] });
      return;
    }

    if (url.pathname === "/api/practice/preferences" && request.method() === "GET") {
      await jsonResponse(route, {
        longTermPreference: "",
        pendingMergeCount: 0,
      });
      return;
    }

    if (url.pathname === "/api/practice/course-frameworks" && request.method() === "GET") {
      await jsonResponse(route, { frameworks: [] });
      return;
    }

    if (url.pathname === "/api/practice/wrong-questions" && request.method() === "GET") {
      counters.wrong += 1;
      refreshSessionId = url.searchParams.get("sessionId");
      await jsonResponse(route, { wrongQuestions: [] });
      return;
    }

    if (url.pathname === "/__test__/practice-answer-state/delayed-hydration") {
      await jsonResponse(route, { session: sessionFixture() });
      return;
    }

    if (url.pathname.startsWith("/api/practice/")) {
      counters.unexpectedApi += 1;
      await jsonResponse(route, { error: "LOCAL_API_NOT_MOCKED" }, 500);
      return;
    }

    await route.continue();
  });

  try {
    phase = "navigation";
    await page.goto(`${origin}/local-test/practice-answer-state`, {
      waitUntil: "domcontentloaded",
    });
    phase = "start_observation";
    await withTimeout(startObserved.promise, `${mode.toUpperCase()}_START_NOT_OBSERVED`);

    assert(counters.start === 1, `${mode.toUpperCase()}_START_COUNT_INVALID`);
    assert(
      startRequestBody?.assignmentId === "LOCAL_BROWSER_ASSIGNMENT",
      `${mode.toUpperCase()}_ASSIGNMENT_ID_INVALID`,
    );

    if (mode === "valid") {
      phase = "pre_resolution";
      const beforeResolution = await visibleActivation(page);
      assert(
        beforeResolution.assignment === 0 &&
          beforeResolution.session === 0 &&
          counters.refresh === 0,
        "VALID_PRE_RESOLUTION_EFFECT",
      );

      startRelease.resolve();
      phase = "refresh_observation";
      await withTimeout(refreshObserved.promise, "VALID_REFRESH_NOT_OBSERVED");
      phase = "pending_refresh_state";
      const whileRefreshPending = await visibleActivation(page);
      const pendingReferences = await activationState(page);
      assert(
        whileRefreshPending.assignment === 0 &&
          whileRefreshPending.session === 0 &&
          whileRefreshPending.root === 0,
        "VALID_UI_ACTIVATED_BEFORE_REFRESH",
      );
      assert(
        !pendingReferences.assignmentReferenceFound &&
          !pendingReferences.sessionReferenceFound,
        "VALID_STATE_ACTIVATED_BEFORE_REFRESH",
      );

      refreshRelease.resolve();
      phase = "post_refresh_assignment";
      await page
        .getByText("Atomic assignment marker", { exact: false })
        .first()
        .waitFor({ timeout: STEP_TIMEOUT_MS });
      phase = "post_refresh_session";
      await page
        .getByText("Atomic session marker", { exact: false })
        .first()
        .waitFor({ timeout: STEP_TIMEOUT_MS });

      phase = "post_refresh_identity";
      const completedReferences = await activationState(page);
      assert(completedReferences.componentFound, "VALID_REAL_COMPONENT_NOT_FOUND");
      assert(completedReferences.parseCalls === 1, "VALID_PARSE_COUNT_INVALID");
      assert(completedReferences.payloadCaptured, "VALID_PAYLOAD_NOT_CAPTURED");
      assert(
        completedReferences.assignmentReferenceFound &&
          completedReferences.sessionReferenceFound,
        "VALID_EXACT_STATE_IDENTITY_MISSING",
      );
      assert(
        !completedReferences.assignmentCloneFound &&
          !completedReferences.sessionCloneFound,
        "VALID_CLONED_STATE_IDENTITY_ACCEPTED",
      );
      assert(counters.refresh === 1, "VALID_REFRESH_COUNT_INVALID");
      assert(counters.wrong === 1, "VALID_REFRESH_DERIVED_REQUEST_COUNT_INVALID");
      assert(refreshSessionId === "ATOMIC_SESSION", "VALID_REFRESH_SESSION_ID_INVALID");
      assert(counters.unexpectedApi === 0, "VALID_UNEXPECTED_API_REQUEST");
      assert(counters.pageErrors === 0, "VALID_PAGE_ERROR");
      assert(counters.external === 0, "VALID_EXTERNAL_REQUEST");
      return {
        activationAfterRefresh: true,
        exactReferences: true,
        oneInvocation: true,
        refreshOwnership: true,
      };
    }

    phase = "error_state";
    await waitForError(page);
    phase = "failure_state";
    const visible = await visibleActivation(page);
    const references = await activationState(page);
    assert(
      visible.assignment === 0 && visible.session === 0,
      `${mode.toUpperCase()}_VISIBLE_PARTIAL_ACTIVATION`,
    );
    assert(
      !references.assignmentReferenceFound && !references.sessionReferenceFound,
      `${mode.toUpperCase()}_STATE_PARTIAL_ACTIVATION`,
    );

    if (mode === "request_rejection" || mode === "parse_rejection") {
      assert(counters.refresh === 0, `${mode.toUpperCase()}_REFRESH_OCCURRED`);
    }
    if (mode === "missing_assignment" || mode === "missing_session") {
      assert(counters.refresh === 0, `${mode.toUpperCase()}_REFRESH_OCCURRED`);
      assert(references.parseCalls === 1, `${mode.toUpperCase()}_PARSE_COUNT_INVALID`);
    }
    if (mode === "parse_rejection") {
      assert(references.parseCalls === 1, "PARSE_REJECTION_PARSE_COUNT_INVALID");
      assert(references.parseRejected, "PARSE_REJECTION_NOT_OBSERVED");
    }
    if (mode === "refresh_rejection") {
      assert(counters.refresh === 1, "REFRESH_REJECTION_COUNT_INVALID");
      assert(references.payloadCaptured, "REFRESH_REJECTION_PAYLOAD_NOT_CAPTURED");
    }
    assert(counters.wrong === 0, `${mode.toUpperCase()}_WRONG_REQUEST_OCCURRED`);
    assert(counters.unexpectedApi === 0, `${mode.toUpperCase()}_UNEXPECTED_API_REQUEST`);
    assert(counters.pageErrors === 0, `${mode.toUpperCase()}_PAGE_ERROR`);
    assert(counters.external === 0, `${mode.toUpperCase()}_EXTERNAL_REQUEST`);

    return {
      noActivation: true,
      refreshAttempts: counters.refresh,
    };
  } catch (error) {
    if (error instanceof AssignmentAtomicityHarnessError) throw error;
    throw new AssignmentAtomicityHarnessError(
      `${mode.toUpperCase()}_${phase.toUpperCase()}_FAILED`,
    );
  } finally {
    startRelease.resolve();
    refreshRelease.resolve();
    await context.close();
  }
}

async function main() {
  let workspace = null;
  let server = null;
  let browser = null;
  let serverStopped = false;
  let workspaceRemoved = false;
  let runFailure = null;
  let cleanupFailure = null;
  const results = new Map();

  try {
    console.log("phase=workspace_prepare");
    workspace = await prepareIsolatedWorkspace();
    console.log("phase=local_server_start");
    server = await startLocalServer(workspace);
    console.log("phase=browser_launch");
    browser = await chromium.launch({ channel: "msedge", headless: true });

    for (const mode of [
      "valid",
      "request_rejection",
      "parse_rejection",
      "missing_assignment",
      "missing_session",
      "refresh_rejection",
    ]) {
      console.log(`phase=case_${mode}`);
      results.set(mode, await runCase(browser, server.origin, mode));
    }
    console.log("phase=cleanup");
  } catch (error) {
    runFailure = error;
  } finally {
    console.log("phase=cleanup_browser");
    if (browser) await browser.close().catch(() => {});
    if (server) {
      console.log("phase=cleanup_server");
      try {
        serverStopped = await stopLocalServer(server);
      } catch {
        cleanupFailure = new AssignmentAtomicityHarnessError(
          "TEMPORARY_SERVER_CLEANUP_FAILED",
        );
      }
    }
    if (workspace) {
      console.log("phase=cleanup_workspace");
      try {
        await removeIsolatedWorkspace(workspace);
        workspaceRemoved = true;
      } catch {
        cleanupFailure ??= new AssignmentAtomicityHarnessError(
          "TEMPORARY_WORKSPACE_CLEANUP_FAILED",
        );
      }
    }
  }

  if (runFailure) throw runFailure;
  if (cleanupFailure) throw cleanupFailure;
  assert(results.size === 6, "CASE_COUNT_INVALID");
  assert(results.get("valid")?.oneInvocation, "VALID_ONE_INVOCATION_NOT_PROVEN");
  assert(
    results.get("valid")?.exactReferences,
    "VALID_EXACT_REFERENCE_CONTRACT_NOT_PROVEN",
  );
  for (const mode of [
    "request_rejection",
    "parse_rejection",
    "missing_assignment",
    "missing_session",
    "refresh_rejection",
  ]) {
    assert(results.get(mode)?.noActivation, `${mode.toUpperCase()}_NOT_PROVEN`);
  }
  assert(
    results.get("request_rejection")?.refreshAttempts === 0 &&
      results.get("parse_rejection")?.refreshAttempts === 0 &&
      results.get("missing_assignment")?.refreshAttempts === 0 &&
      results.get("missing_session")?.refreshAttempts === 0 &&
      results.get("refresh_rejection")?.refreshAttempts === 1,
    "FAILURE_REFRESH_COUNTS_INVALID",
  );
  assert(serverStopped, "TEMPORARY_SERVER_NOT_STOPPED");
  assert(workspaceRemoved, "TEMPORARY_WORKSPACE_NOT_REMOVED");

  console.log("browser_framework=PLAYWRIGHT_MS_EDGE");
  console.log("real_component=PracticeAgentClient");
  console.log("valid_path=PASS");
  console.log("request_rejection=PASS");
  console.log("parse_rejection=PASS");
  console.log("missing_assignment=PASS");
  console.log("missing_session=PASS");
  console.log("refresh_rejection=PASS");
  console.log("exact_assignment_reference=PASS");
  console.log("exact_session_reference=PASS");
  console.log("refresh_async_ownership=PASS");
  console.log("mutually_exclusive_false_positive=REJECTED");
  console.log("external_network_calls=0");
  console.log("temporary_server_stopped=YES");
  console.log("temporary_workspace_removed=YES");
  console.log("PASS assignment_practice_activation_atomicity_local_browser_e2e");
}

try {
  await main();
  process.exit(0);
} catch (error) {
  const category = error instanceof AssignmentAtomicityHarnessError
    ? error.category
    : "ASSIGNMENT_ATOMICITY_HARNESS_FAILURE";
  console.error(`FAIL assignment_practice_activation_atomicity_local_browser_e2e category=${category}`);
  process.exit(1);
}
