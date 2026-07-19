#!/usr/bin/env node

// Narrow disposable validation for one authenticated private self-study session.
// It never loads environment files and never invokes a recommendation Provider.

import { spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import net from "node:net";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const edgePaths = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
];
const edgePath = edgePaths.find((candidate) => existsSync(candidate)) ?? null;

const DISPOSABLE_CONFIRMATION = "DISPOSABLE_PRIVATE_SELF_STUDY_E2E";
const CLEANUP_CONFIRMATION = "DELETE_PRIVATE_SELF_STUDY_E2E_FIXTURES";
const FIXTURE_KIND = "private_self_study_session_live_e2e";
const FIXTURE_PREFIX = "private-self-study-live-";
const SESSION_PATH = "/api/practice/sessions";
const REQUIRED_ENVIRONMENT = Object.freeze([
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "CLEAN_SUPABASE_SERVICE_ROLE_KEY",
  "PRIVATE_SELF_STUDY_E2E_ENVIRONMENT",
  "PRIVATE_SELF_STUDY_E2E_EXPECTED_PROJECT_REF",
  "PRIVATE_SELF_STUDY_E2E_CONFIRM_CLEANUP",
]);
const PREFLIGHT_CATEGORIES = Object.freeze([
  "AUTH_USERS",
  "ORGANIZATIONS",
  "PROFILES",
  "ORGANIZATION_MEMBERSHIPS",
  "PRACTICE_PREFERENCES",
  "PRACTICE_SESSIONS",
  "PRACTICE_ROUNDS",
  "PRACTICE_ROUND_QUESTIONS",
  "PRACTICE_ATTEMPTS",
  "PRACTICE_EPISODES",
  "PREFERENCE_MERGE_JOBS",
]);
const ALLOWED_FAILURE_CATEGORIES = new Set([
  "MISSING_PROCESS_ENVIRONMENT",
  "PRODUCTION_ENVIRONMENT_REFUSED",
  "DISPOSABLE_ENVIRONMENT_ACKNOWLEDGEMENT_REQUIRED",
  "CLEANUP_ACKNOWLEDGEMENT_REQUIRED",
  "EXPECTED_PROJECT_IDENTITY_MISMATCH",
  "LOCAL_EDGE_BROWSER_MISSING",
  "STALE_PRIVATE_SELF_STUDY_PREFLIGHT_FAILED",
  "STALE_PRIVATE_SELF_STUDY_FIXTURES_BLOCKED",
  "FIXTURE_SETUP_FAILED",
  "FIXTURE_CONTRACT_FAILED",
  "LOCAL_SERVER_START_FAILED",
  "AUTHENTICATED_STUDENT_SESSION_FAILED",
  "SELF_STUDY_NAVIGATION_FAILED",
  "SELF_STUDY_CREATE_REQUEST_NOT_OBSERVED",
  "SELF_STUDY_CREATE_REQUEST_FAILED",
  "SELF_STUDY_CREATE_NON_2XX",
  "SELF_STUDY_ACTIVE_UI_MISSING",
  "SELF_STUDY_PERSISTENCE_MISSING",
  "SELF_STUDY_ACTIVE_SESSION_MISMATCH",
  "SELF_STUDY_LIST_CONTAINER_MISSING",
  "SELF_STUDY_SESSION_LIST_MISSING",
  "SELF_STUDY_RELOAD_SESSION_MISMATCH",
  "SELF_STUDY_PROVIDER_CALL_DETECTED",
  "POSTCONDITION_FAILED",
  "CLEANUP_FAILED",
  "TEMPORARY_SERVER_STOP_FAILED",
  "PROCESS_ENVIRONMENT_CLEAR_FAILED",
  "UNEXPECTED_FAILURE",
]);
const SERVER_STOP_CATEGORIES = new Set([
  "SERVER_STOP_GRACEFUL",
  "SERVER_STOP_TREE_TERMINATED",
]);
const SERVER_GRACEFUL_STOP_TIMEOUT_MS = 5_000;
const SERVER_FORCED_STOP_TIMEOUT_MS = 10_000;
const SERVER_PORT_CLOSE_TIMEOUT_MS = 5_000;

class HarnessError extends Error {
  constructor(category) {
    super(category);
    this.category = category;
  }
}

function fail(category) {
  throw new HarnessError(category);
}

function assert(condition, category) {
  if (!condition) fail(category);
}

function boundedFailureCategory(error) {
  const candidate = typeof error?.category === "string" ? error.category : "UNEXPECTED_FAILURE";
  return ALLOWED_FAILURE_CATEGORIES.has(candidate) ? candidate : "UNEXPECTED_FAILURE";
}

function projectRefFromSupabaseUrl(value) {
  try {
    const url = new URL(value);
    return /^([a-z0-9]+)\.supabase\.co$/i.exec(url.hostname)?.[1]?.toLowerCase() ?? null;
  } catch {
    return null;
  }
}

function requireApprovedEnvironment({ requireBrowser }) {
  if (process.env.NODE_ENV?.trim().toLowerCase() === "production") {
    fail("PRODUCTION_ENVIRONMENT_REFUSED");
  }
  if (REQUIRED_ENVIRONMENT.some((name) => !process.env[name]?.trim())) {
    fail("MISSING_PROCESS_ENVIRONMENT");
  }
  if (process.env.PRIVATE_SELF_STUDY_E2E_ENVIRONMENT !== DISPOSABLE_CONFIRMATION) {
    fail("DISPOSABLE_ENVIRONMENT_ACKNOWLEDGEMENT_REQUIRED");
  }
  if (process.env.PRIVATE_SELF_STUDY_E2E_CONFIRM_CLEANUP !== CLEANUP_CONFIRMATION) {
    fail("CLEANUP_ACKNOWLEDGEMENT_REQUIRED");
  }
  const projectRef = projectRefFromSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  if (
    !projectRef ||
    projectRef !== process.env.PRIVATE_SELF_STUDY_E2E_EXPECTED_PROJECT_REF.trim().toLowerCase()
  ) {
    fail("EXPECTED_PROJECT_IDENTITY_MISMATCH");
  }
  if (requireBrowser && !edgePath) fail("LOCAL_EDGE_BROWSER_MISSING");
  return {
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    serviceRoleKey: process.env.CLEAN_SUPABASE_SERVICE_ROLE_KEY,
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
  };
}

function clearProcessEnvironment() {
  for (const name of REQUIRED_ENVIRONMENT) delete process.env[name];
  return REQUIRED_ENVIRONMENT.every((name) => process.env[name] === undefined);
}

function serviceClient(config) {
  return createClient(config.url, config.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function assertNoError(result, category) {
  if (result?.error) fail(category);
  return result?.data;
}

function ids(rows) {
  return (rows ?? []).map((row) => row.id).filter(Boolean);
}

async function selectByIds(service, table, column, values, columns = "id") {
  if (!values.length) return [];
  const result = await service.from(table).select(columns).in(column, values);
  if (result.error) fail("STALE_PRIVATE_SELF_STUDY_PREFLIGHT_FAILED");
  return result.data ?? [];
}

async function selectFixtureAuthUsers(service) {
  const matches = [];
  for (let page = 1; page <= 20; page += 1) {
    const result = await service.auth.admin.listUsers({ page, perPage: 1000 });
    if (result.error) fail("STALE_PRIVATE_SELF_STUDY_PREFLIGHT_FAILED");
    const users = result.data?.users ?? [];
    matches.push(...users.filter((user) => user.user_metadata?.fixture_kind === FIXTURE_KIND));
    if (users.length < 1000) break;
  }
  return matches;
}

// PREFLIGHT_READ_ONLY_START
async function readStaleFixtureCounts(service) {
  const authUsers = await selectFixtureAuthUsers(service);
  const organizations = assertNoError(
    await service.from("organizations").select("id").like("slug", `${FIXTURE_PREFIX}%`),
    "STALE_PRIVATE_SELF_STUDY_PREFLIGHT_FAILED",
  ) ?? [];
  const profiles = assertNoError(
    await service.from("profiles").select("id").like("username", `${FIXTURE_PREFIX}%`),
    "STALE_PRIVATE_SELF_STUDY_PREFLIGHT_FAILED",
  ) ?? [];
  const userIds = Array.from(new Set([...ids(authUsers), ...ids(profiles)]));
  const organizationIds = ids(organizations);
  const memberships = organizationIds.length
    ? await selectByIds(service, "organization_members", "organization_id", organizationIds)
    : await selectByIds(service, "organization_members", "user_id", userIds);
  const preferences = await selectByIds(service, "user_practice_preferences", "user_id", userIds, "user_id");
  const sessions = await selectByIds(service, "practice_sessions", "user_id", userIds);
  const sessionIds = ids(sessions);
  const rounds = await selectByIds(service, "practice_rounds", "session_id", sessionIds);
  const roundQuestions = await selectByIds(service, "practice_round_questions", "session_id", sessionIds);
  const attempts = await selectByIds(service, "practice_attempts", "session_id", sessionIds);
  const episodes = await selectByIds(service, "practice_agent_episodes", "session_id", sessionIds);
  const mergeJobs = await selectByIds(service, "practice_preference_merge_jobs", "user_id", userIds);
  const counts = {
    AUTH_USERS: authUsers.length,
    ORGANIZATIONS: organizations.length,
    ORGANIZATION_MEMBERSHIPS: memberships.length,
    PRACTICE_ATTEMPTS: attempts.length,
    PRACTICE_EPISODES: episodes.length,
    PRACTICE_PREFERENCES: preferences.length,
    PRACTICE_ROUNDS: rounds.length,
    PRACTICE_ROUND_QUESTIONS: roundQuestions.length,
    PRACTICE_SESSIONS: sessions.length,
    PREFERENCE_MERGE_JOBS: mergeJobs.length,
    PROFILES: profiles.length,
  };
  const residueTotal = PREFLIGHT_CATEGORIES.reduce((total, category) => total + counts[category], 0);
  return {
    affectedCategories: PREFLIGHT_CATEGORIES.filter((category) => counts[category] > 0),
    counts,
    residueTotal,
  };
}
// PREFLIGHT_READ_ONLY_END

function printPreflight(report) {
  for (const category of PREFLIGHT_CATEGORIES) {
    console.log(`${category}=${report.counts[category]}`);
  }
  if (report.residueTotal === 0) {
    console.log("STALE_PRIVATE_SELF_STUDY_PREFLIGHT_PASS");
    console.log("residue_total=0");
    return;
  }
  console.log("STALE_PRIVATE_SELF_STUDY_PREFLIGHT_BLOCKED");
  console.log(`residue_total=${report.residueTotal}`);
  console.log(`affected_categories=${report.affectedCategories.join(",")}`);
}

function createFixtureState(service) {
  return {
    organizationIds: [],
    organizationMemberIds: [],
    profileIds: [],
    roundIds: [],
    service,
    sessionIds: [],
    student: null,
    userIds: [],
  };
}

function randomPassword() {
  return `PrivateStudy!${randomBytes(24).toString("base64url")}`;
}

async function createFixture(fixtures) {
  const runId = randomUUID().replace(/-/g, "").slice(0, 16);
  const organization = assertNoError(
    await fixtures.service
      .from("organizations")
      .insert({ name: `Private Study ${runId}`, slug: `${FIXTURE_PREFIX}${runId}`, status: "active" })
      .select("id")
      .single(),
    "FIXTURE_SETUP_FAILED",
  );
  assert(organization?.id, "FIXTURE_SETUP_FAILED");
  fixtures.organizationIds.push(organization.id);

  const username = `${FIXTURE_PREFIX}${runId}-student`;
  const email = `${username}@local.app`;
  const password = randomPassword();
  const created = await fixtures.service.auth.admin.createUser({
    email,
    email_confirm: true,
    password,
    user_metadata: { fixture_kind: FIXTURE_KIND },
  });
  assert(!created.error && created.data.user?.id, "FIXTURE_SETUP_FAILED");
  const userId = created.data.user.id;
  fixtures.userIds.push(userId);

  assertNoError(
    await fixtures.service.from("profiles").upsert(
      {
        default_organization_id: organization.id,
        display_name: "Private Study Student",
        email,
        id: userId,
        role: "student",
        status: "active",
        username,
      },
      { onConflict: "id" },
    ),
    "FIXTURE_SETUP_FAILED",
  );
  fixtures.profileIds.push(userId);
  const membership = assertNoError(
    await fixtures.service
      .from("organization_members")
      .insert({ organization_id: organization.id, role: "student", status: "active", user_id: userId })
      .select("id")
      .single(),
    "FIXTURE_SETUP_FAILED",
  );
  assert(membership?.id, "FIXTURE_SETUP_FAILED");
  fixtures.organizationMemberIds.push(membership.id);
  fixtures.student = { id: userId, password, username };
}

async function countRows(query, category = "FIXTURE_CONTRACT_FAILED") {
  const result = await query;
  if (result.error) fail(category);
  return Number(result.count ?? 0);
}

async function verifyPreconditions(fixtures) {
  const userId = fixtures.student.id;
  const [preferenceCount, sessionCount, mergeCount] = await Promise.all([
    countRows(fixtures.service.from("user_practice_preferences").select("user_id", { count: "exact", head: true }).eq("user_id", userId)),
    countRows(fixtures.service.from("practice_sessions").select("id", { count: "exact", head: true }).eq("user_id", userId)),
    countRows(fixtures.service.from("practice_preference_merge_jobs").select("id", { count: "exact", head: true }).eq("user_id", userId)),
  ]);
  assert(preferenceCount === 0 && sessionCount === 0 && mergeCount === 0, "FIXTURE_CONTRACT_FAILED");
}

function findFreePort() {
  return new Promise((resolvePort, reject) => {
    const server = net.createServer();
    server.unref();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close(() => resolvePort(port));
    });
  });
}

function childExitObserved(child) {
  return child.exitCode !== null || child.signalCode !== null;
}

function waitForChildExit(child, timeoutMs) {
  if (childExitObserved(child)) return Promise.resolve(true);
  return new Promise((resolveExit) => {
    let settled = false;
    const finish = (exited) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.off("exit", onExit);
      resolveExit(exited);
    };
    const onExit = () => finish(true);
    const timer = setTimeout(() => finish(childExitObserved(child)), timeoutMs);
    child.once("exit", onExit);
    if (childExitObserved(child)) finish(true);
  });
}

function portIsListening(port) {
  return new Promise((resolveListening) => {
    const socket = net.createConnection({ host: "127.0.0.1", port });
    let settled = false;
    const finish = (listening) => {
      if (settled) return;
      settled = true;
      socket.removeAllListeners();
      socket.destroy();
      resolveListening(listening);
    };
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
    socket.setTimeout(500, () => finish(false));
  });
}

async function waitForPortClosed(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  do {
    if (!(await portIsListening(port))) return true;
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  } while (Date.now() < deadline);
  return !(await portIsListening(port));
}

function terminateWindowsProcessTree(childPid) {
  if (!Number.isInteger(childPid) || childPid <= 0) return Promise.resolve(false);
  return new Promise((resolveTermination) => {
    let settled = false;
    const killer = spawn("taskkill", ["/PID", String(childPid), "/T", "/F"], {
      shell: false,
      stdio: "ignore",
      windowsHide: true,
    });
    const finish = (terminated) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolveTermination(terminated);
    };
    const timer = setTimeout(() => {
      killer.kill();
      finish(false);
    }, SERVER_GRACEFUL_STOP_TIMEOUT_MS);
    killer.once("error", () => finish(false));
    killer.once("exit", (code) => finish(code === 0));
  });
}

async function stopOwnedTemporaryServer(child, port) {
  const childPid = child.pid;
  if (!Number.isInteger(childPid) || childPid <= 0) return { category: "SERVER_STOP_FAILED", stopped: false };
  if (!childExitObserved(child)) {
    try {
      child.kill("SIGTERM");
    } catch {
      // The bounded exit wait determines whether the retained process already exited.
    }
  }
  if (await waitForChildExit(child, SERVER_GRACEFUL_STOP_TIMEOUT_MS)) {
    return (await waitForPortClosed(port, SERVER_PORT_CLOSE_TIMEOUT_MS))
      ? { category: "SERVER_STOP_GRACEFUL", stopped: true }
      : { category: "SERVER_PORT_STILL_OPEN", stopped: false };
  }
  let category = "SERVER_STOP_TIMEOUT";
  if (process.platform === "win32") {
    await terminateWindowsProcessTree(childPid);
    category = "SERVER_STOP_TREE_TERMINATED";
  } else {
    try {
      child.kill("SIGKILL");
    } catch {
      return { category: "SERVER_STOP_FAILED", stopped: false };
    }
  }
  if (!(await waitForChildExit(child, SERVER_FORCED_STOP_TIMEOUT_MS))) {
    return { category: "SERVER_STOP_EXIT_NOT_OBSERVED", stopped: false };
  }
  if (!(await waitForPortClosed(port, SERVER_PORT_CLOSE_TIMEOUT_MS))) {
    return { category: "SERVER_PORT_STILL_OPEN", stopped: false };
  }
  return { category, stopped: true };
}

async function startLocalNextServer(config) {
  const port = await findFreePort();
  assert(Number.isInteger(port) && port > 0, "LOCAL_SERVER_START_FAILED");
  const nextBin = resolve(root, "node_modules", "next", "dist", "bin", "next");
  const environment = { ...process.env };
  for (const name of [
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "CLEAN_SUPABASE_SERVICE_ROLE_KEY",
    "PRIVATE_SELF_STUDY_E2E_ENVIRONMENT",
    "PRIVATE_SELF_STUDY_E2E_EXPECTED_PROJECT_REF",
    "PRIVATE_SELF_STUDY_E2E_CONFIRM_CLEANUP",
    "SUPABASE_SERVICE_ROLE_KEY",
    "AI_PROVIDER_ENCRYPTION_KEY",
    "AI_PROVIDER_GATEWAY_TOKEN",
    "OPENAI_API_KEY",
    "GEMINI_API_KEY",
    "DEEPSEEK_API_KEY",
  ]) {
    delete environment[name];
  }
  Object.assign(environment, {
    NEXT_PUBLIC_SUPABASE_ANON_KEY: config.anonKey,
    NEXT_PUBLIC_SUPABASE_URL: config.url,
    NODE_ENV: "development",
    PRACTICE_AGENT_FULL_CALL_LOGS: "false",
    PRACTICE_AGENT_TOKEN_STATS_LOGS: "false",
    VERCEL: "",
    VERCEL_ENV: "",
  });
  const child = spawn(process.execPath, [nextBin, "dev", "--webpack", "--port", String(port)], {
    cwd: root,
    env: environment,
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  child.stdout.on("data", () => {});
  child.stderr.on("data", () => {});
  const origin = `http://127.0.0.1:${port}`;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(`${origin}/auth/login`);
      if (response.status < 500) return { close: () => stopOwnedTemporaryServer(child, port), origin };
    } catch {
      // Bounded readiness polling; raw server output is discarded.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
  await stopOwnedTemporaryServer(child, port).catch(() => ({ category: "SERVER_STOP_FAILED", stopped: false }));
  fail("LOCAL_SERVER_START_FAILED");
}

async function signInThroughBrowser(page, origin, student) {
  await page.goto(`${origin}/auth/login?next=%2Fstudent`, { waitUntil: "networkidle" });
  await page.locator("#username").fill(student.username);
  await page.locator("#password").fill(student.password);
  await Promise.all([
    page.waitForURL(/\/student(?:$|\?)/, { timeout: 30_000 }),
    page.getByRole("button", { name: "Sign in" }).click(),
  ]);
}

function isSessionRequest(request, expectedOrigin, method) {
  try {
    const url = new URL(request.url());
    return request.method() === method && request.resourceType() === "fetch" &&
      url.origin === expectedOrigin && url.pathname === SESSION_PATH;
  } catch {
    return false;
  }
}

function sessionPayload(payload) {
  const session = payload && typeof payload === "object" ? payload.session : null;
  const active = payload && typeof payload === "object" ? payload.activeSession : null;
  const sessions = payload && typeof payload === "object" && Array.isArray(payload.sessions)
    ? payload.sessions
    : [];
  return {
    activeId: typeof active?.id === "string" ? active.id : null,
    activeRoundCount: Array.isArray(active?.rounds) ? active.rounds.length : 0,
    sessionId: typeof session?.id === "string" ? session.id : null,
    sessionIds: sessions
      .map((item) => (typeof item?.id === "string" ? item.id : null))
      .filter(Boolean),
    sessionRoundCount: Array.isArray(session?.rounds) ? session.rounds.length : 0,
  };
}

async function readSessionListThroughBrowser(page) {
  return page.evaluate(async (path) => {
    try {
      const response = await fetch(path, { credentials: "same-origin" });
      const payload = await response.json().catch(() => null);
      const active = payload && typeof payload === "object" ? payload.activeSession : null;
      const sessions = payload && typeof payload === "object" && Array.isArray(payload.sessions)
        ? payload.sessions
        : [];
      return {
        activeId: typeof active?.id === "string" ? active.id : null,
        activeRoundCount: Array.isArray(active?.rounds) ? active.rounds.length : 0,
        request: "OBSERVED",
        sessionIds: sessions
          .map((item) => (typeof item?.id === "string" ? item.id : null))
          .filter(Boolean),
        status: response.status,
      };
    } catch {
      return {
        activeId: null,
        activeRoundCount: 0,
        request: "FAILED",
        sessionIds: [],
        status: 0,
      };
    }
  }, SESSION_PATH);
}

function waitForSessionOutcome(page, expectedOrigin, method, timeoutMs = 30_000) {
  return new Promise((resolveOutcome) => {
    let settled = false;
    const finish = (outcome) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      page.off("response", onResponse);
      page.off("requestfailed", onFailed);
      resolveOutcome(outcome);
    };
    const onResponse = async (response) => {
      if (!isSessionRequest(response.request(), expectedOrigin, method)) return;
      const parsed = sessionPayload(await response.json().catch(() => null));
      finish({ ...parsed, request: "OBSERVED", status: response.status() });
    };
    const onFailed = (request) => {
      if (isSessionRequest(request, expectedOrigin, method)) {
        finish({ activeId: null, activeRoundCount: 0, request: "FAILED", sessionId: null, sessionRoundCount: 0, status: 0 });
      }
    };
    const timer = setTimeout(
      () => finish({ activeId: null, activeRoundCount: 0, request: "NOT_OBSERVED", sessionId: null, sessionRoundCount: 0, status: 0 }),
      timeoutMs,
    );
    page.on("response", onResponse);
    page.on("requestfailed", onFailed);
  });
}

function observeProviderBackedBrowserRequests(page, expectedOrigin, state) {
  const providerBackedPaths = new Set([
    "/api/practice/recommend",
    "/api/practice/review",
    "/api/practice/hint",
    "/api/practice/sessions/title",
  ]);
  page.on("request", (request) => {
    try {
      const url = new URL(request.url());
      if (url.origin === expectedOrigin && providerBackedPaths.has(url.pathname)) state.providerCalled = true;
    } catch {
      // Malformed request metadata is ignored; no raw request information is retained.
    }
  });
}

async function runBrowserJourney(page, server, fixtures, state) {
  const initialListPromise = waitForSessionOutcome(page, server.origin, "GET");
  const navigation = await page.goto(`${server.origin}/practice`, { waitUntil: "domcontentloaded" });
  assert(navigation?.status() === 200, "SELF_STUDY_NAVIGATION_FAILED");
  const initialList = await initialListPromise;
  assert(initialList.request === "OBSERVED" && initialList.status === 200, "SELF_STUDY_NAVIGATION_FAILED");

  const createButton = page.getByRole("button", { name: /New practice session/ });
  await createButton.waitFor({ state: "visible", timeout: 30_000 });
  const createPromise = waitForSessionOutcome(page, server.origin, "POST");
  await createButton.click();
  const created = await createPromise;
  state.createHttpStatus = created.status;
  if (created.request === "FAILED") fail("SELF_STUDY_CREATE_REQUEST_FAILED");
  assert(created.request === "OBSERVED", "SELF_STUDY_CREATE_REQUEST_NOT_OBSERVED");
  assert(created.status >= 200 && created.status < 300, "SELF_STUDY_CREATE_NON_2XX");
  assert(created.sessionId, "SELF_STUDY_CREATE_REQUEST_FAILED");
  state.createdSessionId = created.sessionId;
  state.initialRoundCount = created.sessionRoundCount;

  const persistedSessionCount = await countRows(
    fixtures.service
      .from("practice_sessions")
      .select("id", { count: "exact", head: true })
      .eq("id", created.sessionId)
      .eq("user_id", fixtures.student.id),
    "SELF_STUDY_PERSISTENCE_MISSING",
  ).catch(() => null);
  state.persistedSession = persistedSessionCount === 1 ? "FOUND" : "MISSING";
  assert(state.persistedSession === "FOUND", "SELF_STUDY_PERSISTENCE_MISSING");

  const postCreateList = await readSessionListThroughBrowser(page);
  state.activeSession =
    postCreateList.request === "OBSERVED" &&
    postCreateList.status === 200 &&
    postCreateList.activeId === created.sessionId
      ? "MATCH"
      : "MISMATCH";
  assert(state.activeSession === "MATCH", "SELF_STUDY_ACTIVE_SESSION_MISMATCH");

  const sessionsHeading = page.getByRole("heading", { exact: true, level: 2, name: "Sessions" });
  const sessionsSection = page.locator("section").filter({ has: sessionsHeading });
  state.listContainer = await sessionsSection
    .waitFor({ state: "visible", timeout: 30_000 })
    .then(() => "PRESENT", () => "MISSING");
  assert(state.listContainer === "PRESENT", "SELF_STUDY_LIST_CONTAINER_MISSING");

  state.activeUi = await page
    .getByRole("heading", { exact: true, level: 1, name: "Ready when you are." })
    .waitFor({ timeout: 30_000 })
    .then(() => "PRESENT", () => "MISSING");
  assert(state.activeUi === "PRESENT", "SELF_STUDY_ACTIVE_UI_MISSING");
  const activeSessionItems = sessionsSection.locator('button[aria-current="true"]');
  const activeItemCount = await activeSessionItems.count();
  state.sessionList =
    postCreateList.sessionIds.filter((sessionId) => sessionId === created.sessionId).length === 1 &&
    activeItemCount === 1
      ? "FOUND"
      : "MISSING";
  assert(state.sessionList === "FOUND", "SELF_STUDY_SESSION_LIST_MISSING");

  await page.reload({ waitUntil: "domcontentloaded" });
  const reloaded = await readSessionListThroughBrowser(page);
  const reloadedActiveItem = page
    .locator("section")
    .filter({ has: page.getByRole("heading", { exact: true, level: 2, name: "Sessions" }) })
    .locator('button[aria-current="true"]');
  const reloadedActiveItemVisible = await reloadedActiveItem
    .waitFor({ state: "visible", timeout: 30_000 })
    .then(() => true, () => false);
  state.reloadSession =
    reloaded.request === "OBSERVED" &&
    reloaded.status === 200 &&
    reloaded.activeId === created.sessionId &&
    reloaded.sessionIds.filter((sessionId) => sessionId === created.sessionId).length === 1 &&
    reloadedActiveItemVisible
      ? "MATCH"
      : "MISMATCH";
  assert(state.reloadSession === "MATCH", "SELF_STUDY_RELOAD_SESSION_MISMATCH");
  assert(reloaded.activeRoundCount === 0, "POSTCONDITION_FAILED");
  await page.getByRole("heading", { exact: true, level: 1, name: "Ready when you are." })
    .waitFor({ timeout: 30_000 });
  assert(!state.providerCalled, "SELF_STUDY_PROVIDER_CALL_DETECTED");
}

async function verifyPostconditions(fixtures, state) {
  const [sessionCount, preferenceCount, roundCount, questionCount, attemptCount, episodeCount, mergeCount] = await Promise.all([
    countRows(fixtures.service.from("practice_sessions").select("id", { count: "exact", head: true }).eq("id", state.createdSessionId).eq("user_id", fixtures.student.id), "POSTCONDITION_FAILED"),
    countRows(fixtures.service.from("user_practice_preferences").select("user_id", { count: "exact", head: true }).eq("user_id", fixtures.student.id), "POSTCONDITION_FAILED"),
    countRows(fixtures.service.from("practice_rounds").select("id", { count: "exact", head: true }).eq("session_id", state.createdSessionId), "POSTCONDITION_FAILED"),
    countRows(fixtures.service.from("practice_round_questions").select("id", { count: "exact", head: true }).eq("session_id", state.createdSessionId), "POSTCONDITION_FAILED"),
    countRows(fixtures.service.from("practice_attempts").select("id", { count: "exact", head: true }).eq("session_id", state.createdSessionId), "POSTCONDITION_FAILED"),
    countRows(fixtures.service.from("practice_agent_episodes").select("id", { count: "exact", head: true }).eq("session_id", state.createdSessionId), "POSTCONDITION_FAILED"),
    countRows(fixtures.service.from("practice_preference_merge_jobs").select("id", { count: "exact", head: true }).eq("user_id", fixtures.student.id), "POSTCONDITION_FAILED"),
  ]);
  assert(sessionCount === 1 && preferenceCount === 1, "POSTCONDITION_FAILED");
  assert(roundCount === 0 && questionCount === 0 && attemptCount === 0 && episodeCount === 0, "POSTCONDITION_FAILED");
  assert(mergeCount === 0 && state.initialRoundCount === 0, "POSTCONDITION_FAILED");
  state.initialQuestionCount = questionCount;
  state.initialAttemptCount = attemptCount;
}

async function collectGeneratedIds(fixtures) {
  if (!fixtures.student?.id) return;
  const sessions = assertNoError(
    await fixtures.service.from("practice_sessions").select("id").eq("user_id", fixtures.student.id),
    "CLEANUP_FAILED",
  ) ?? [];
  fixtures.sessionIds = Array.from(new Set([...fixtures.sessionIds, ...ids(sessions)]));
  const rounds = await selectByIds(fixtures.service, "practice_rounds", "session_id", fixtures.sessionIds);
  fixtures.roundIds = Array.from(new Set([...fixtures.roundIds, ...ids(rounds)]));
}

async function deleteExact(service, table, column, values) {
  if (!values.length) return;
  const result = await service.from(table).delete().in(column, values);
  if (result.error) fail("CLEANUP_FAILED");
}

async function cleanupFixtures(fixtures) {
  const failures = [];
  async function clean(category, operation) {
    try {
      await operation();
    } catch {
      failures.push(category);
    }
  }
  await clean("COLLECT", () => collectGeneratedIds(fixtures));
  const service = fixtures.service;
  await clean("EPISODES", () => deleteExact(service, "practice_agent_episodes", "session_id", fixtures.sessionIds));
  await clean("ATTEMPTS", () => deleteExact(service, "practice_attempts", "session_id", fixtures.sessionIds));
  await clean("ROUND_QUESTIONS", () => deleteExact(service, "practice_round_questions", "session_id", fixtures.sessionIds));
  await clean("ROUNDS", () => deleteExact(service, "practice_rounds", "id", fixtures.roundIds));
  await clean("MERGE_JOBS", () => deleteExact(service, "practice_preference_merge_jobs", "user_id", fixtures.userIds));
  await clean("SESSIONS", () => deleteExact(service, "practice_sessions", "id", fixtures.sessionIds));
  await clean("PREFERENCES", () => deleteExact(service, "user_practice_preferences", "user_id", fixtures.userIds));
  await clean("ORGANIZATION_MEMBERS", () => deleteExact(service, "organization_members", "id", fixtures.organizationMemberIds));
  await clean("PROFILES", () => deleteExact(service, "profiles", "id", fixtures.profileIds));
  await clean("ORGANIZATIONS", () => deleteExact(service, "organizations", "id", fixtures.organizationIds));
  await clean("AUTH_USERS", async () => {
    for (const userId of fixtures.userIds) {
      const result = await service.auth.admin.deleteUser(userId);
      if (result.error) fail("CLEANUP_FAILED");
    }
  });
  await clean("ZERO_RESIDUE", async () => {
    const report = await readStaleFixtureCounts(service);
    assert(report.residueTotal === 0, "CLEANUP_FAILED");
  });
  return failures.length === 0;
}

async function runPreflightOnly() {
  let cleared = false;
  try {
    const config = requireApprovedEnvironment({ requireBrowser: false });
    const report = await readStaleFixtureCounts(serviceClient(config));
    printPreflight(report);
    if (report.residueTotal > 0) process.exitCode = 1;
  } catch (error) {
    console.log("STALE_PRIVATE_SELF_STUDY_PREFLIGHT_BLOCKED");
    console.log("residue_total=0");
    console.log(`affected_categories=${boundedFailureCategory(error)}`);
    process.exitCode = 1;
  } finally {
    cleared = clearProcessEnvironment();
    if (!cleared) process.exitCode = 1;
  }
}

async function runFullValidation() {
  let browser = null;
  let context = null;
  let fixtures = null;
  let server = null;
  let failureCategory = "NONE";
  let cleanupPassed = true;
  let temporaryServerStopped = true;
  let processEnvironmentCleared = false;
  let succeeded = false;
  const state = {
    activeSession: "NOT_OBSERVED",
    activeUi: "NOT_CHECKED",
    createHttpStatus: 0,
    createdSessionId: null,
    initialAttemptCount: 0,
    initialQuestionCount: 0,
    initialRoundCount: 0,
    listContainer: "NOT_CHECKED",
    persistedSession: "NOT_CHECKED",
    providerCalled: false,
    reloadSession: "NOT_OBSERVED",
    sessionList: "NOT_CHECKED",
  };
  try {
    const config = requireApprovedEnvironment({ requireBrowser: true });
    const service = serviceClient(config);
    fixtures = createFixtureState(service);
    const stale = await readStaleFixtureCounts(service);
    assert(stale.residueTotal === 0, "STALE_PRIVATE_SELF_STUDY_FIXTURES_BLOCKED");
    await createFixture(fixtures);
    await verifyPreconditions(fixtures);
    server = await startLocalNextServer(config);
    temporaryServerStopped = false;
    browser = await chromium.launch({ executablePath: edgePath, headless: true });
    context = await browser.newContext();
    const page = await context.newPage();
    observeProviderBackedBrowserRequests(page, server.origin, state);
    await signInThroughBrowser(page, server.origin, fixtures.student).catch(() => {
      fail("AUTHENTICATED_STUDENT_SESSION_FAILED");
    });
    await runBrowserJourney(page, server, fixtures, state);
    await verifyPostconditions(fixtures, state);
    succeeded = true;
  } catch (error) {
    failureCategory = boundedFailureCategory(error);
  } finally {
    if (context) await context.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
    if (server) {
      const stopResult = await server.close().catch(() => ({ category: "SERVER_STOP_FAILED", stopped: false }));
      temporaryServerStopped = stopResult.stopped === true && SERVER_STOP_CATEGORIES.has(stopResult.category);
    }
    if (fixtures) cleanupPassed = await cleanupFixtures(fixtures).catch(() => false);
    processEnvironmentCleared = clearProcessEnvironment();
    if (!cleanupPassed && failureCategory === "NONE") failureCategory = "CLEANUP_FAILED";
    if (!temporaryServerStopped && failureCategory === "NONE") failureCategory = "TEMPORARY_SERVER_STOP_FAILED";
    if (!processEnvironmentCleared && failureCategory === "NONE") failureCategory = "PROCESS_ENVIRONMENT_CLEAR_FAILED";
  }

  if (succeeded && cleanupPassed && temporaryServerStopped && processEnvironmentCleared) {
    console.log("PASS private_self_study_session_live_validation");
    console.log("self_study_create_http_status=200");
    console.log("self_study_persisted_session=FOUND");
    console.log("self_study_active_session=MATCH");
    console.log("self_study_active_ui=PRESENT");
    console.log("self_study_list_container=PRESENT");
    console.log("self_study_session_list=FOUND");
    console.log("self_study_reload_session=MATCH");
    console.log("self_study_initial_round_count=0");
    console.log("self_study_initial_question_count=0");
    console.log("self_study_initial_attempt_count=0");
    console.log("provider_called=NO");
    console.log("cleanup=PASS");
    console.log("temporary_server_stopped=YES");
    console.log("process_environment_cleared=YES");
    return;
  }

  console.log("FAIL private_self_study_session_live_validation");
  console.log(`failure_category=${failureCategory}`);
  console.log(`self_study_create_http_status=${state.createHttpStatus || "NOT_OBSERVED"}`);
  console.log(`self_study_persisted_session=${state.persistedSession}`);
  console.log(`self_study_active_session=${state.activeSession}`);
  console.log(`self_study_active_ui=${state.activeUi}`);
  console.log(`self_study_list_container=${state.listContainer}`);
  console.log(`self_study_session_list=${state.sessionList}`);
  console.log(`self_study_reload_session=${state.reloadSession}`);
  console.log(`provider_called=${state.providerCalled ? "YES" : "NO"}`);
  console.log(`cleanup=${cleanupPassed ? "PASS" : "FAIL"}`);
  console.log(`temporary_server_stopped=${temporaryServerStopped ? "YES" : "NO"}`);
  console.log(`process_environment_cleared=${processEnvironmentCleared ? "YES" : "NO"}`);
  process.exitCode = 1;
}

const args = process.argv.slice(2);
const preflightOnly = args.length === 1 && args[0] === "--preflight-only";
if (args.length && !preflightOnly) {
  console.log("FAIL private_self_study_session_live_validation");
  console.log("failure_category=UNEXPECTED_FAILURE");
  clearProcessEnvironment();
  process.exitCode = 1;
} else if (preflightOnly) {
  // PREFLIGHT_EXIT_BEFORE_MUTATION_SERVER_BROWSER_API
  await runPreflightOnly();
} else {
  await runFullValidation();
}
