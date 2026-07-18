#!/usr/bin/env node

// In-memory and source-level Assignment Practice resume proof. No server,
// browser, Provider, environment file, or database connection is used.

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import ts from "typescript";

const root = process.cwd();
const modulePath = resolve(root, "src/lib/practice/assignment-resume.ts");
const moduleSource = await readFile(modulePath, "utf8");
const transpiled = ts.transpileModule(moduleSource, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
  fileName: modulePath,
}).outputText;
const moduleUrl = `data:text/javascript;base64,${Buffer.from(transpiled).toString("base64")}`;
const { resolveAssignmentPracticeResumeSession } = await import(moduleUrl);

const linkage = await readFile(
  resolve(root, "src/lib/practice/assignment-linkage.ts"),
  "utf8",
);
const client = await readFile(
  resolve(root, "src/components/practice/practice-agent-client.tsx"),
  "utf8",
);
const card = await readFile(
  resolve(root, "src/components/practice/practice-question-card.tsx"),
  "utf8",
);
const route = await readFile(
  resolve(root, "src/app/api/practice/assignments/start/route.ts"),
  "utf8",
);
const preferenceInitialization = await readFile(
  resolve(root, "src/lib/practice/preference-initialization.ts"),
  "utf8",
);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const noLink = await resolveAssignmentPracticeResumeSession({
  lastPracticeSessionId: null,
  linkedSessions: [],
  loadSession: async () => {
    throw new Error("no linked session should be loaded");
  },
});
assert(noLink === null, "no linked session must fall through to first-start creation");

const pointerLoads = [];
const progressPointer = await resolveAssignmentPracticeResumeSession({
  lastPracticeSessionId: "progress-session",
  linkedSessions: [
    { createdAt: "2026-01-02T00:00:00.000Z", practiceSessionId: "newer-session" },
    { createdAt: "2026-01-01T00:00:00.000Z", practiceSessionId: "progress-session" },
  ],
  loadSession: async (sessionId) => {
    pointerLoads.push(sessionId);
    return { internalSession: sessionId };
  },
});
assert(
  progressPointer?.source === "progress_pointer" &&
    progressPointer.session.internalSession === "progress-session" &&
    pointerLoads.length === 1,
  "a valid progress pointer must win over a newer duplicate link",
);

const latest = await resolveAssignmentPracticeResumeSession({
  lastPracticeSessionId: null,
  linkedSessions: [
    { createdAt: "2026-01-01T00:00:00.000Z", practiceSessionId: "older-session" },
    { createdAt: "2026-01-02T00:00:00.000Z", practiceSessionId: "latest-session" },
  ],
  loadSession: async (sessionId) => ({ internalSession: sessionId }),
});
assert(
  latest?.source === "latest_link" && latest.session.internalSession === "latest-session",
  "missing progress pointer must resume the newest linked session",
);

const staleLoads = [];
const staleFallback = await resolveAssignmentPracticeResumeSession({
  lastPracticeSessionId: "stale-session",
  linkedSessions: [
    { createdAt: "2026-01-03T00:00:00.000Z", practiceSessionId: "stale-session" },
    { createdAt: "2026-01-02T00:00:00.000Z", practiceSessionId: "valid-session" },
  ],
  loadSession: async (sessionId) => {
    staleLoads.push(sessionId);
    return sessionId === "valid-session" ? { internalSession: sessionId } : null;
  },
});
assert(
  staleFallback?.session.internalSession === "valid-session" &&
    staleLoads.join(",") === "stale-session,valid-session",
  "a stale pointer must fall through to the newest valid linked session",
);

const allStale = await resolveAssignmentPracticeResumeSession({
  lastPracticeSessionId: "missing-session",
  linkedSessions: [
    { createdAt: "2026-01-01T00:00:00.000Z", practiceSessionId: "missing-session" },
  ],
  loadSession: async () => null,
});
assert(allStale === null, "all-stale linkage must select the safe create-replacement path");

const reloadInputs = {
  lastPracticeSessionId: "same-session",
  linkedSessions: [
    { createdAt: "2026-01-01T00:00:00.000Z", practiceSessionId: "same-session" },
  ],
  loadSession: async (sessionId) => ({ internalSession: sessionId }),
};
const firstReload = await resolveAssignmentPracticeResumeSession(reloadInputs);
const secondReload = await resolveAssignmentPracticeResumeSession(reloadInputs);
assert(
  firstReload?.session.internalSession === secondReload?.session.internalSession,
  "repeat Start resolution must return the same linked session",
);

const resumeBranch = linkage.indexOf("if (resumed)");
const createBranch = linkage.indexOf("createPracticeSession({", resumeBranch);
assert(resumeBranch >= 0 && createBranch > resumeBranch, "resume must be evaluated before session creation");
assert(
  linkage.includes('.from("student_assignment_progress")') &&
    linkage.includes('.select("status, started_at, completed_at, last_practice_session_id")') &&
    linkage.includes('.from("assignment_practice_sessions")') &&
    linkage.includes('.eq("assignment_id", assignmentId)') &&
    linkage.includes('.eq("student_id", userId)') &&
    linkage.includes("getPracticeSession({") &&
    linkage.includes("userId,") &&
    !linkage.includes("createServiceRoleClient"),
  "resume lookup must remain requester-scoped and preserve RLS",
);
assert(
  linkage.includes('resumeContext.progress?.status === "completed" ? "completed" : "in_progress"') &&
    linkage.slice(resumeBranch, createBranch).includes("return {") &&
    !linkage.slice(resumeBranch, createBranch).includes("createPracticeSession"),
  "completed and in-progress linked sessions must return without creating a new attempt",
);
assert(
  client.includes("server-side linked-session resume") &&
    client.includes("restoreRoundFromHistory(currentRound, restoredSession)") &&
    !client.includes("localStorage.setItem") &&
    !client.includes("sessionId: launchAssignmentId"),
  "the client may suppress a mounted duplicate but must restore server-owned session state",
);
assert(
  card.includes('data-testid="practice-result-badge"') &&
    card.includes('data-result="correct"'),
  "the result badge must expose one stable semantic success locator",
);
assert(
  route.includes("normalizeAssignmentPracticeStartError(cause)") &&
    !route.includes("error.message") &&
    !route.includes("String(cause)") &&
    !route.includes("stack"),
  "resume failures must retain bounded public errors",
);
assert(
  linkage.includes("onInitializationFailure") &&
    preferenceInitialization.includes('return errorCode(error) === "23505"'),
  "first-start preference initialization and 23505 recovery must remain intact",
);

console.log("PASS Assignment Practice resume contract (in-memory plus source proof; non-live)");
