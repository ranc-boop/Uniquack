#!/usr/bin/env node

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
const [
  rawClient,
  rawPersistence,
  rawPreferencesRoute,
  rawSessionsRoute,
  rawPracticeLoading,
  rawPracticeLoader,
  rawPracticeSkeleton,
  rawClientHelpers,
] = await Promise.all([
  readFile(resolve(root, "src/components/practice/practice-agent-client.tsx"), "utf8"),
  readFile(resolve(root, "src/lib/practice/persistence.ts"), "utf8"),
  readFile(resolve(root, "src/app/api/practice/preferences/route.ts"), "utf8"),
  readFile(resolve(root, "src/app/api/practice/sessions/route.ts"), "utf8"),
  readFile(resolve(root, "src/app/practice/loading.tsx"), "utf8"),
  readFile(resolve(root, "src/components/practice/practice-agent-loader.tsx"), "utf8"),
  readFile(resolve(root, "src/components/practice/practice-workspace-skeleton.tsx"), "utf8"),
  readFile(resolve(root, "src/lib/practice/client-helpers.ts"), "utf8"),
]);
const client = rawClient.replaceAll("\r\n", "\n");
const persistence = rawPersistence.replaceAll("\r\n", "\n");
const preferencesRoute = rawPreferencesRoute.replaceAll("\r\n", "\n");
const sessionsRoute = rawSessionsRoute.replaceAll("\r\n", "\n");
const practiceLoading = rawPracticeLoading.replaceAll("\r\n", "\n");
const practiceLoader = rawPracticeLoader.replaceAll("\r\n", "\n");
const practiceSkeleton = rawPracticeSkeleton.replaceAll("\r\n", "\n");
const clientHelpers = rawClientHelpers.replaceAll("\r\n", "\n");

assert(
  practiceLoading.includes("@/components/practice/practice-workspace-skeleton") &&
    practiceLoader.includes("@/components/practice/practice-workspace-skeleton") &&
    client.includes("@/components/practice/practice-workspace-skeleton") &&
    !practiceSkeleton.includes('"use client"') &&
    !practiceSkeleton.includes("@/components/math-content"),
  "Practice loading fallback must remain a dependency-light shared skeleton.",
);

const initialHydration = sourceBlock(
  client,
  "useEffect(() => {\n    if (initialHydrationStartedRef.current)",
  "useEffect(() => () =>",
);
assert(
  client.includes("initialHydrationStartedRef") &&
    initialHydration.includes("if (initialHydrationStartedRef.current) return") &&
    initialHydration.includes("initialHydrationStartedRef.current = true"),
  "Practice entry hydration must be idempotent under React development Strict Effects",
);
assert(
  client.includes("deferAuxiliary: true") &&
    client.includes("nextSession?.sourceScopeLockedAt") &&
    client.includes("void auxiliaryStatePromise.then") &&
    client.includes("settlePracticeRequest(") &&
    clientHelpers.includes("(error: unknown) => error") &&
    client.includes("wrongStatePromise") &&
    !client.includes("const wrongPayload = await wrongPayloadPromise"),
  "Practice entry must not block critical session hydration on auxiliary source/framework/preferences data",
);

const listSessions = sourceBlock(
  persistence,
  "export async function listPracticeSessions",
  "export async function getPracticeSession",
);
assert(
  !listSessions.includes('.select("*') &&
    listSessions.includes("PRACTICE_SESSION_SUMMARY_SELECT"),
  "Practice session lists must select only fields used by summaries",
);

const getSession = sourceBlock(
  persistence,
  "export async function getPracticeSession",
  "export async function createPracticeSession",
);
assert(
  getSession.includes("sessionSummary?: PracticeSessionSummary") &&
    getSession.includes("Promise.all([") &&
    getSession.includes("questionsPromise") &&
    getSession.includes("attemptsPromise") &&
    !getSession.includes('.select("*'),
  "Practice detail hydration must reuse the list summary and parallelize independent history reads",
);
assert(
  sessionsRoute.includes("sessionSummary: sessions[0]"),
  "Sessions API must not reload the active practice_sessions row already returned by its list query",
);

const preferencesGet = sourceBlock(
  preferencesRoute,
  "export async function GET()",
  "export async function PATCH",
);
assert(
  preferencesGet.includes("Promise.all([") &&
    preferencesGet.includes("getOrCreatePracticePreference") &&
    preferencesGet.includes("countPendingPreferenceJobs"),
  "Practice preferences GET must parallelize independent preference and pending-job reads",
);

console.log("PASS practice_loading_performance_smoke");
