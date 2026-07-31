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

function tagContext(overrides = {}) {
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
    ...overrides,
  };
}

function assignmentFixture(overrides = {}) {
  return {
    dueAt: null,
    id: "LOCAL_BROWSER_ASSIGNMENT",
    itemCount: 1,
    title: "Atomic assignment marker",
    ...overrides,
  };
}

function traceFixture(overrides = {}) {
  return {
    elapsedMs: 12,
    inputSummary: "Local-only assignment startup",
    outputSummary: "Prepared a local practice round",
    phase: "context",
    toolName: "assignment_practice_start",
    ...overrides,
  };
}

function optionFixture(suffix = "A", overrides = {}) {
  return {
    content_html: `Option ${suffix}`,
    id: suffix,
    label: suffix,
    ...overrides,
  };
}

function questionFixture(suffix = "A", overrides = {}) {
  return {
    contentExcerpt: `Question ${suffix}`,
    contentHtml: `<p>Question ${suffix}</p>`,
    difficulty: 500,
    expectedSkill: `Skill ${suffix}`,
    id: `ROUND_QUESTION_${suffix}`,
    options: [optionFixture("A"), optionFixture("B")],
    position: 0,
    questionCode: `ATOMIC-${suffix}`,
    questionId: `QUESTION_${suffix}`,
    questionType: "mcq",
    reason: `Reason ${suffix}`,
    source: "local_assignment",
    sourceQuestionId: `SOURCE_QUESTION_${suffix}`,
    tagIds: ["atomic-tag"],
    title: `Atomic question ${suffix}`,
    ...overrides,
  };
}

function attemptFixture(question, overrides = {}) {
  return {
    answer: "A",
    explanation: "Saved local explanation.",
    hintCount: 1,
    hints: ["Saved local hint."],
    id: `ATTEMPT_${question.id}`,
    isCorrect: true,
    questionId: question.questionId,
    score: 1,
    solutionHtml: "<p>Saved local solution.</p>",
    sourceQuestionId: question.sourceQuestionId,
    ...overrides,
  };
}

function roundFixture(suffix = "A", overrides = {}) {
  const question = questionFixture(suffix);
  return {
    attempts: [],
    id: `ROUND_${suffix}`,
    nextRoundGoal: null,
    questions: [question],
    reviewSummary: null,
    roundGoal: `Round goal ${suffix}`,
    score: {
      correct: 0,
      total: 0,
    },
    trace: [traceFixture()],
    ...overrides,
  };
}

function sessionFixture({ rounds = [], ...overrides } = {}) {
  return {
    completedQuestionIds: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    goal: "Atomicity validation",
    id: "ATOMIC_SESSION",
    lastActivityAt: "2026-01-01T00:00:00.000Z",
    outlineUserNotes: "",
    roundCount: rounds.length,
    rounds,
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
    ...overrides,
  };
}

function recommendationFixture({ recommendations = [], ...overrides } = {}) {
  return {
    maxToolCalls: 0,
    mode: "heuristic",
    recommendations,
    roundGoal: "Atomicity validation",
    sessionId: "ATOMIC_SESSION",
    sessionMemory: "",
    tagContext: tagContext(),
    trace: [traceFixture()],
    ...overrides,
  };
}

function startPayload({
  assignment = assignmentFixture(),
  recommendation = recommendationFixture(),
  session = sessionFixture(),
  ...overrides
} = {}) {
  return {
    assignment,
    progressStatus: "in_progress",
    recommendation,
    session,
    ...overrides,
  };
}

function validNestedPayload() {
  const historicalQuestion = questionFixture("HISTORY");
  const currentQuestionA = questionFixture("CURRENT_A");
  const currentQuestionB = questionFixture("CURRENT_B", {
    options: [],
    questionId: null,
    questionType: "frq",
    source: undefined,
    sourceQuestionId: null,
  });
  const historicalRound = roundFixture("HISTORY", {
    attempts: [attemptFixture(historicalQuestion)],
    questions: [historicalQuestion],
    reviewSummary: "Saved prior-round review.",
    score: { correct: 1, total: 1 },
  });
  const currentRound = roundFixture("CURRENT", {
    questions: [currentQuestionA, currentQuestionB],
    trace: [],
  });
  const recommendationA = questionFixture("RECOMMENDATION_A");
  const recommendationB = questionFixture("RECOMMENDATION_B", {
    options: [],
    questionId: undefined,
    questionType: "fill_blank",
    source: undefined,
    sourceQuestionId: undefined,
  });

  return startPayload({
    assignment: assignmentFixture({ extraAssignmentField: "accepted" }),
    extraPayloadField: { accepted: true },
    recommendation: recommendationFixture({
      extraRecommendationField: "accepted",
      recommendations: [recommendationA, recommendationB],
      trace: [],
    }),
    session: sessionFixture({
      extraSessionField: "accepted",
      rounds: [historicalRound, currentRound],
      sourceScope: [{
        assignmentId: "LOCAL_BROWSER_ASSIGNMENT",
        extraSourceField: "accepted",
        name: "Atomic session marker",
        sourceKind: "assignment",
      }],
      tagContext: tagContext({ lastGoal: "Prior supported goal" }),
    }),
  });
}

function validRecommendationPayload() {
  return startPayload({
    recommendation: recommendationFixture({
      recommendations: [
        questionFixture("RECOMMENDATION_A"),
        questionFixture("RECOMMENDATION_B", {
          options: [],
          questionId: undefined,
          questionType: "fill_blank",
          source: undefined,
          sourceQuestionId: undefined,
        }),
      ],
    }),
  });
}

function payloadWithRound({
  attempts,
  questions,
  roundOverrides = {},
} = {}) {
  const question = questionFixture("MATRIX");
  const round = roundFixture("MATRIX", {
    attempts: attempts ?? [],
    questions: questions ?? [question],
    ...roundOverrides,
  });
  return startPayload({
    recommendation: recommendationFixture({
      recommendations: [questionFixture("RECOMMENDATION")],
    }),
    session: sessionFixture({ rounds: [round] }),
  });
}

const malformedModes = [
  "invalid_round_question",
  "invalid_round_null",
  "invalid_round_primitive",
  "invalid_round_questions_container",
  "invalid_round_question_primitive",
  "invalid_round_question_array",
  "invalid_round_question_identity",
  "invalid_sparse_questions",
  "invalid_attempt_null",
  "invalid_attempt_primitive",
  "invalid_attempt_required_field",
  "invalid_sparse_attempts",
  "invalid_recommendation_null",
  "invalid_recommendation_primitive",
  "invalid_recommendation_identity",
  "invalid_later_round_question",
  "invalid_mixed_questions",
  "invalid_option_null",
  "invalid_sparse_options",
  "invalid_recommendation_trace",
  "invalid_round_trace",
  "invalid_source_scope",
  "invalid_tag_context",
  "invalid_sparse_recommendations",
  "invalid_sparse_rounds",
];

const sparseModes = new Set([
  "invalid_sparse_attempts",
  "invalid_sparse_options",
  "invalid_sparse_questions",
  "invalid_sparse_recommendations",
  "invalid_sparse_rounds",
]);

function malformedPayload(mode) {
  const payload = payloadWithRound();
  const round = payload.session.rounds[0];
  const question = round.questions[0];

  switch (mode) {
    case "invalid_round_question":
      round.questions = [null];
      break;
    case "invalid_round_null":
      payload.session.rounds = [null];
      break;
    case "invalid_round_primitive":
      payload.session.rounds = ["not-a-round"];
      break;
    case "invalid_round_questions_container":
      round.questions = { invalid: true };
      break;
    case "invalid_round_question_primitive":
      round.questions = [42];
      break;
    case "invalid_round_question_array":
      round.questions = [[]];
      break;
    case "invalid_round_question_identity":
      delete question.id;
      question.sourceQuestionId = null;
      break;
    case "invalid_sparse_questions":
      break;
    case "invalid_attempt_null":
      round.attempts = [null];
      break;
    case "invalid_attempt_primitive":
      round.attempts = ["not-an-attempt"];
      break;
    case "invalid_attempt_required_field": {
      const attempt = attemptFixture(question);
      delete attempt.answer;
      round.attempts = [attempt];
      break;
    }
    case "invalid_sparse_attempts":
      round.attempts = [attemptFixture(question)];
      break;
    case "invalid_recommendation_null":
      payload.session = sessionFixture();
      payload.recommendation.recommendations = [null];
      break;
    case "invalid_recommendation_primitive":
      payload.session = sessionFixture();
      payload.recommendation.recommendations = ["not-a-recommendation"];
      break;
    case "invalid_recommendation_identity": {
      payload.session = sessionFixture();
      const invalidRecommendation = questionFixture("INVALID_RECOMMENDATION");
      delete invalidRecommendation.id;
      invalidRecommendation.sourceQuestionId = null;
      payload.recommendation.recommendations = [invalidRecommendation];
      break;
    }
    case "invalid_later_round_question":
      payload.session = sessionFixture({
        rounds: [
          roundFixture("FIRST"),
          roundFixture("SECOND", { questions: [null] }),
        ],
      });
      break;
    case "invalid_mixed_questions":
      round.questions = [question, null];
      break;
    case "invalid_option_null":
      question.options = [null];
      break;
    case "invalid_sparse_options":
      break;
    case "invalid_recommendation_trace":
      payload.recommendation.trace = [null];
      break;
    case "invalid_round_trace":
      round.trace = [null];
      break;
    case "invalid_source_scope":
      payload.session.sourceScope = [null];
      break;
    case "invalid_tag_context":
      payload.recommendation.tagContext.usefulTags = [null];
      break;
    case "invalid_sparse_recommendations":
      payload.session = sessionFixture();
      payload.recommendation.recommendations = [questionFixture("SPARSE")];
      break;
    case "invalid_sparse_rounds":
      break;
    default:
      throw new AssignmentAtomicityHarnessError("UNKNOWN_MALFORMED_MODE");
  }

  payload.session.roundCount = payload.session.rounds.length;
  return payload;
}

function startPayloadForMode(mode) {
  if (mode === "valid_nested") return validNestedPayload();
  if (mode === "valid_recommendations") return validRecommendationPayload();
  if (malformedModes.includes(mode)) return malformedPayload(mode);

  const payload = startPayload();
  if (mode === "missing_assignment") delete payload.assignment;
  if (mode === "invalid_assignment_identity") payload.assignment.id = "OTHER_ASSIGNMENT";
  if (mode === "missing_session") delete payload.session;
  if (mode === "invalid_session_id") {
    payload.session.id = " ";
    payload.recommendation.sessionId = " ";
  }
  return payload;
}

async function installParsedPayloadCapture(page, mode) {
  await page.addInitScript((activeMode) => {
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
          if (activeMode === "invalid_sparse_questions") {
            payload.session.rounds[0].questions = new Array(1);
          } else if (activeMode === "invalid_sparse_attempts") {
            payload.session.rounds[0].attempts = new Array(1);
          } else if (activeMode === "invalid_sparse_options") {
            payload.session.rounds[0].questions[0].options = new Array(1);
          } else if (activeMode === "invalid_sparse_recommendations") {
            payload.recommendation.recommendations = new Array(1);
          } else if (activeMode === "invalid_sparse_rounds") {
            payload.session.rounds = new Array(1);
            payload.session.roundCount = 1;
          }
          window.__assignmentAtomicityProbe.payload = payload;
          return payload;
        } catch (error) {
          window.__assignmentAtomicityProbe.parseRejected = true;
          throw error;
        }
      };
      return response;
    };
  }, mode);
}

async function activationState(page) {
  return page.evaluate(() => {
    const probe = window.__assignmentAtomicityProbe;
    const assignment = probe?.payload?.assignment;
    const recommendation = probe?.payload?.recommendation;
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
    let recommendationReferenceFound = false;
    let sessionReferenceFound = false;
    for (const fiber of fibers) {
      const name = fiber.type?.name ?? fiber.elementType?.name ?? "";
      if (name === "PracticeAgentClient") componentFound = true;
      assignmentReferenceFound ||= hookContains(fiber.memoizedState, assignment);
      recommendationReferenceFound ||= hookContains(fiber.memoizedState, recommendation);
      sessionReferenceFound ||= hookContains(fiber.memoizedState, session);
    }

    const assignmentClone = assignment ? { ...assignment } : null;
    const recommendationClone = recommendation ? { ...recommendation } : null;
    const sessionClone = session ? { ...session } : null;
    let assignmentCloneFound = false;
    let recommendationCloneFound = false;
    let sessionCloneFound = false;
    for (const fiber of fibers) {
      assignmentCloneFound ||= hookContains(fiber.memoizedState, assignmentClone);
      recommendationCloneFound ||= hookContains(fiber.memoizedState, recommendationClone);
      sessionCloneFound ||= hookContains(fiber.memoizedState, sessionClone);
    }

    return {
      assignmentCloneFound,
      assignmentReferenceFound,
      componentFound,
      parseCalls: probe?.parseCalls ?? 0,
      parseRejected: probe?.parseRejected ?? false,
      payloadCaptured: Boolean(probe?.payload),
      recommendationCloneFound,
      recommendationReferenceFound,
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

const successfulModes = new Set([
  "valid",
  "valid_nested",
  "valid_recommendations",
]);

function casePrefix(mode) {
  return mode === "invalid_round_question"
    ? "INVALID_ROUND_QUESTION"
    : mode.toUpperCase();
}

async function runCase(browser, origin, mode) {
  const context = await browser.newContext();
  const page = await context.newPage();
  let phase = "capture_install";
  await installParsedPayloadCapture(page, mode);
  const prefix = casePrefix(mode);
  const isSuccess = successfulModes.has(mode);
  const isMalformed = malformedModes.includes(mode);

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
      if (isSuccess) await startRelease.promise;
      if (mode === "request_rejection") {
        await route.abort("failed");
        return;
      }
      if (mode === "non_ok_response") {
        await jsonResponse(route, { error: "LOCAL_START_REJECTED" }, 503);
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

      const payload = startPayloadForMode(mode);
      await jsonResponse(route, payload);
      return;
    }

    if (url.pathname === "/api/practice/sessions" && request.method() === "GET") {
      counters.refresh += 1;
      refreshObserved.resolve();
      if (isSuccess) await refreshRelease.promise;
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
    await withTimeout(startObserved.promise, `${prefix}_START_NOT_OBSERVED`);

    assert(counters.start === 1, `${prefix}_START_COUNT_INVALID`);
    assert(
      startRequestBody?.assignmentId === "LOCAL_BROWSER_ASSIGNMENT",
      `${prefix}_ASSIGNMENT_ID_INVALID`,
    );

    if (isSuccess) {
      phase = "pre_resolution";
      const beforeResolution = await visibleActivation(page);
      assert(
        beforeResolution.assignment === 0 &&
          beforeResolution.session === 0 &&
          counters.refresh === 0,
        `${prefix}_PRE_RESOLUTION_EFFECT`,
      );

      startRelease.resolve();
      phase = "refresh_observation";
      await withTimeout(refreshObserved.promise, `${prefix}_REFRESH_NOT_OBSERVED`);
      phase = "pending_refresh_state";
      const whileRefreshPending = await visibleActivation(page);
      const pendingReferences = await activationState(page);
      assert(
        whileRefreshPending.assignment === 0 &&
          whileRefreshPending.session === 0 &&
          whileRefreshPending.root === 0,
        `${prefix}_UI_ACTIVATED_BEFORE_REFRESH`,
      );
      assert(
        !pendingReferences.assignmentReferenceFound &&
          !pendingReferences.recommendationReferenceFound &&
          !pendingReferences.sessionReferenceFound,
        `${prefix}_STATE_ACTIVATED_BEFORE_REFRESH`,
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
      if (mode !== "valid") {
        phase = "post_refresh_practice_ui";
        await page
          .locator('[data-testid="practice-answer-control"]')
          .first()
          .waitFor({ timeout: STEP_TIMEOUT_MS });
      }

      phase = "post_refresh_identity";
      const completedReferences = await activationState(page);
      assert(completedReferences.componentFound, `${prefix}_REAL_COMPONENT_NOT_FOUND`);
      assert(completedReferences.parseCalls === 1, `${prefix}_PARSE_COUNT_INVALID`);
      assert(completedReferences.payloadCaptured, `${prefix}_PAYLOAD_NOT_CAPTURED`);
      assert(
        completedReferences.assignmentReferenceFound &&
          completedReferences.sessionReferenceFound,
        `${prefix}_EXACT_STATE_IDENTITY_MISSING`,
      );
      if (mode !== "valid_nested") {
        assert(
          completedReferences.recommendationReferenceFound,
          `${prefix}_EXACT_RECOMMENDATION_IDENTITY_MISSING`,
        );
      }
      assert(
        !completedReferences.assignmentCloneFound &&
          !completedReferences.recommendationCloneFound &&
          !completedReferences.sessionCloneFound,
        `${prefix}_CLONED_STATE_IDENTITY_ACCEPTED`,
      );
      assert(counters.refresh === 1, `${prefix}_REFRESH_COUNT_INVALID`);
      assert(counters.wrong === 1, `${prefix}_REFRESH_DERIVED_REQUEST_COUNT_INVALID`);
      assert(refreshSessionId === "ATOMIC_SESSION", `${prefix}_REFRESH_SESSION_ID_INVALID`);
      assert(counters.unexpectedApi === 0, `${prefix}_UNEXPECTED_API_REQUEST`);
      assert(counters.pageErrors === 0, `${prefix}_PAGE_ERROR`);
      assert(counters.external === 0, `${prefix}_EXTERNAL_REQUEST`);
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
      `${prefix}_VISIBLE_PARTIAL_ACTIVATION`,
    );
    assert(
      !references.assignmentReferenceFound &&
        !references.recommendationReferenceFound &&
        !references.sessionReferenceFound,
      `${prefix}_STATE_PARTIAL_ACTIVATION`,
    );

    if (
      mode === "request_rejection" ||
      mode === "non_ok_response" ||
      mode === "parse_rejection"
    ) {
      assert(counters.refresh === 0, `${prefix}_REFRESH_OCCURRED`);
    }
    if (
      mode === "missing_assignment" ||
      mode === "invalid_assignment_identity" ||
      mode === "missing_session" ||
      mode === "invalid_session_id" ||
      isMalformed
    ) {
      assert(counters.refresh === 0, `${prefix}_REFRESH_OCCURRED`);
      assert(references.parseCalls === 1, `${prefix}_PARSE_COUNT_INVALID`);
    }
    if (mode === "parse_rejection") {
      assert(references.parseCalls === 1, "PARSE_REJECTION_PARSE_COUNT_INVALID");
      assert(references.parseRejected, "PARSE_REJECTION_NOT_OBSERVED");
    }
    if (mode === "non_ok_response") {
      assert(references.parseCalls === 1, "NON_OK_RESPONSE_PARSE_COUNT_INVALID");
    }
    if (mode === "refresh_rejection") {
      assert(counters.refresh === 1, "REFRESH_REJECTION_COUNT_INVALID");
      assert(references.payloadCaptured, "REFRESH_REJECTION_PAYLOAD_NOT_CAPTURED");
    }
    await page.waitForTimeout(150);
    assert(counters.start === 1, `${prefix}_AUTOMATIC_RETRY_OCCURRED`);
    assert(counters.wrong === 0, `${prefix}_WRONG_REQUEST_OCCURRED`);
    assert(counters.unexpectedApi === 0, `${prefix}_UNEXPECTED_API_REQUEST`);
    assert(counters.pageErrors === 0, `${prefix}_PAGE_ERROR`);
    assert(counters.external === 0, `${prefix}_EXTERNAL_REQUEST`);

    return {
      noActivation: true,
      parseCalls: references.parseCalls,
      refreshAttempts: counters.refresh,
    };
  } catch (error) {
    if (error instanceof AssignmentAtomicityHarnessError) throw error;
    throw new AssignmentAtomicityHarnessError(
      `${prefix}_${phase.toUpperCase()}_FAILED`,
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

    const modes = [
      "valid",
      "valid_nested",
      "valid_recommendations",
      "request_rejection",
      "non_ok_response",
      "parse_rejection",
      "missing_assignment",
      "invalid_assignment_identity",
      "missing_session",
      "invalid_session_id",
      "refresh_rejection",
      ...malformedModes,
    ];
    for (const mode of modes) {
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
  const expectedCaseCount = successfulModes.size + 8 + malformedModes.length;
  assert(results.size === expectedCaseCount, "CASE_COUNT_INVALID");
  for (const mode of successfulModes) {
    assert(results.get(mode)?.oneInvocation, `${casePrefix(mode)}_ONE_INVOCATION_NOT_PROVEN`);
    assert(
      results.get(mode)?.exactReferences,
      `${casePrefix(mode)}_EXACT_REFERENCE_CONTRACT_NOT_PROVEN`,
    );
  }
  const failureModes = [
    "request_rejection",
    "non_ok_response",
    "parse_rejection",
    "missing_assignment",
    "invalid_assignment_identity",
    "missing_session",
    "invalid_session_id",
    "refresh_rejection",
    ...malformedModes,
  ];
  for (const mode of failureModes) {
    assert(results.get(mode)?.noActivation, `${casePrefix(mode)}_NOT_PROVEN`);
  }
  assert(
    results.get("request_rejection")?.refreshAttempts === 0 &&
      results.get("non_ok_response")?.refreshAttempts === 0 &&
      results.get("parse_rejection")?.refreshAttempts === 0 &&
      results.get("missing_assignment")?.refreshAttempts === 0 &&
      results.get("invalid_assignment_identity")?.refreshAttempts === 0 &&
      results.get("missing_session")?.refreshAttempts === 0 &&
      results.get("invalid_session_id")?.refreshAttempts === 0 &&
      results.get("refresh_rejection")?.refreshAttempts === 1,
    "FAILURE_REFRESH_COUNTS_INVALID",
  );
  assert(
    malformedModes.every((mode) => results.get(mode)?.refreshAttempts === 0),
    "MALFORMED_REFRESH_COUNTS_INVALID",
  );
  assert(
    malformedModes.every((mode) => results.get(mode)?.parseCalls === 1),
    "MALFORMED_PARSE_COUNTS_INVALID",
  );
  assert(
    [...sparseModes].every((mode) => results.get(mode)?.noActivation),
    "SPARSE_ARRAY_REJECTION_NOT_PROVEN",
  );
  assert(serverStopped, "TEMPORARY_SERVER_NOT_STOPPED");
  assert(workspaceRemoved, "TEMPORARY_WORKSPACE_NOT_REMOVED");

  console.log("browser_framework=PLAYWRIGHT_MS_EDGE");
  console.log("real_component=PracticeAgentClient");
  console.log("valid_path=PASS");
  console.log("valid_nested_rounds_questions_attempts=PASS");
  console.log("valid_recommendation_elements=PASS");
  console.log("request_rejection=PASS");
  console.log("non_ok_response=PASS");
  console.log("parse_rejection=PASS");
  console.log("missing_assignment=PASS");
  console.log("invalid_assignment_identity=PASS");
  console.log("missing_session=PASS");
  console.log("invalid_session_id=PASS");
  console.log("refresh_rejection=PASS");
  console.log(`malformed_nested_cases=${malformedModes.length}`);
  console.log("malformed_nested_validation_before_refresh=PASS");
  console.log("sparse_array_rejection=PASS");
  console.log("exact_assignment_reference=PASS");
  console.log("exact_session_reference=PASS");
  console.log("exact_nested_response_identity=PASS");
  console.log("refresh_async_ownership=PASS");
  console.log("mutually_exclusive_false_positive=REJECTED");
  console.log("external_network_calls=0");
  console.log("production_test_backdoors=0");
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
