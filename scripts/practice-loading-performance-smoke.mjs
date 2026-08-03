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
  rawPracticePage,
  rawPracticeScopePanels,
  rawPracticeSkeleton,
  rawClientHelpers,
  rawPracticeAuth,
] = await Promise.all([
  readFile(resolve(root, "src/components/practice/practice-agent-client.tsx"), "utf8"),
  readFile(resolve(root, "src/lib/practice/persistence.ts"), "utf8"),
  readFile(resolve(root, "src/app/api/practice/preferences/route.ts"), "utf8"),
  readFile(resolve(root, "src/app/api/practice/sessions/route.ts"), "utf8"),
  readFile(resolve(root, "src/app/practice/loading.tsx"), "utf8"),
  readFile(resolve(root, "src/components/practice/practice-agent-loader.tsx"), "utf8"),
  readFile(resolve(root, "src/app/practice/page.tsx"), "utf8"),
  readFile(resolve(root, "src/components/practice/practice-session-scope-panels.tsx"), "utf8"),
  readFile(resolve(root, "src/components/practice/practice-workspace-skeleton.tsx"), "utf8"),
  readFile(resolve(root, "src/lib/practice/client-helpers.ts"), "utf8"),
  readFile(resolve(root, "src/lib/practice/auth.ts"), "utf8"),
]);
const client = rawClient.replaceAll("\r\n", "\n");
const persistence = rawPersistence.replaceAll("\r\n", "\n");
const preferencesRoute = rawPreferencesRoute.replaceAll("\r\n", "\n");
const sessionsRoute = rawSessionsRoute.replaceAll("\r\n", "\n");
const practiceLoading = rawPracticeLoading.replaceAll("\r\n", "\n");
const practiceLoader = rawPracticeLoader.replaceAll("\r\n", "\n");
const practicePage = rawPracticePage.replaceAll("\r\n", "\n");
const practiceScopePanels = rawPracticeScopePanels.replaceAll("\r\n", "\n");
const practiceSkeleton = rawPracticeSkeleton.replaceAll("\r\n", "\n");
const clientHelpers = rawClientHelpers.replaceAll("\r\n", "\n");
const practiceAuth = rawPracticeAuth.replaceAll("\r\n", "\n");

assert(
  practiceLoading.includes("@/components/practice/practice-workspace-skeleton") &&
    practiceLoader.includes("@/components/practice/practice-workspace-skeleton") &&
    client.includes("@/components/practice/practice-workspace-skeleton") &&
    !practiceSkeleton.includes('"use client"') &&
    !practiceSkeleton.includes("@/components/math-content"),
  "Practice loading fallback must remain a dependency-light shared skeleton.",
);
assert(
  !client.includes('} from "@/components/math-content"') &&
    !client.includes('import { PracticeQuestionCard }') &&
    !client.includes('import { PracticeRoundReviewPanel }') &&
    !client.includes('import { ReadableDataCard') &&
    !practiceScopePanels.includes("@/components/math-content") &&
    client.includes('import("@/components/math-content")') &&
    client.includes('import("@/components/practice/practice-question-card")') &&
    client.includes('import("@/components/practice/practice-round-review-panel")') &&
    client.includes('import("@/components/practice/practice-completion-panel")') &&
    client.includes('import("@/components/practice/practice-readable-data-card")'),
  "Practice starter must defer math rendering and round-only panels until their UI is visible.",
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
    listSessions.includes("PRACTICE_SESSION_SUMMARY_SELECT") &&
    persistence.includes("practice_rounds(count)") &&
    listSessions.includes(".range(boundedOffset, boundedOffset + boundedLimit - 1)"),
  "Practice session lists must use a bounded summary page and aggregate round counts",
);
assert(
  persistence.includes("PRACTICE_SESSION_LIST_FIELDS") &&
    persistence.includes('"created_at,goal,id,last_activity_at,source_scope_locked_at,status,summary,title"') &&
    listSessions.includes("compact: true") &&
    !listSessions.includes("PRACTICE_SESSION_FIELDS"),
  "Practice session history must select and serialize compact rows without thread payloads",
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
  !sessionsRoute.includes("sessionSummary: activeSummary") &&
    sessionsRoute.includes("const hasMore = sessionPage.length > limit") &&
    sessionsRoute.includes("nextOffset: offset + sessions.length"),
  "Sessions API must use the compact list for history and hydrate the active session as detail",
);
const loadMoreSessions = sourceBlock(
  client,
  "async function loadMoreSessions",
  "function createNewSession",
);
assert(
  loadMoreSessions.includes("includeActive=0&limit=25&offset=${sessions.length}") &&
    loadMoreSessions.includes("setSessionHistoryHasMore") &&
    client.includes("Load more sessions"),
  "Bounded Practice session history must retain access to older sessions through incremental loading",
);
const sessionsPost = sourceBlock(
  sessionsRoute,
  "export async function POST",
  "\n}",
);
assert(
  sessionsPost.includes("rounds: []") &&
    !sessionsPost.includes("getPracticeSession("),
  "Creating an empty Practice session must return its known empty detail without reloading history",
);

const ensureSession = sourceBlock(
  client,
  "async function ensureSession",
  "async function startAssignmentPractice",
);
assert(
  ensureSession.includes("setSessions(") &&
    !ensureSession.includes("refreshPracticeState("),
  "Creating the first Practice session must update local history without a redundant list refresh",
);

const createNewSession = sourceBlock(
  client,
  "function createNewSession",
  "function resetPracticeProgress",
);
assert(
  createNewSession.includes("prepareScopedNewSession()") &&
    !createNewSession.includes("jsonRequest") &&
    !createNewSession.includes("startTransition") &&
    !createNewSession.includes("setSessionAction"),
  "New Practice session clicks must switch to a local draft without waiting on persistence",
);
const preferenceMerge = sourceBlock(
  client,
  "async function runPreferenceMerge",
  "async function updateSessionTitle",
);
assert(
  preferenceMerge.includes("longTermPreference") &&
    preferenceMerge.includes("setLongTermMemory(mergePayload.longTermPreference)") &&
    !preferenceMerge.includes('jsonRequest<{ longTermPreference: string }>("/api/practice/preferences")'),
  "Practice preference merge must reuse the merge response instead of issuing a duplicate GET.",
);
assert(
  practicePage.includes("supabase.auth.getClaims()") &&
    !practicePage.includes("supabase.auth.getUser()"),
  "Practice first-screen auth must use locally verifiable claims instead of a remote user lookup",
);
assert(
  practiceAuth.includes("supabase.auth.getClaims()") &&
    practiceAuth.includes("data?.claims?.sub") &&
    !practiceAuth.includes("supabase.auth.getUser()"),
  "Practice APIs must reuse verified claims instead of repeating a remote Auth user lookup per bootstrap request",
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
