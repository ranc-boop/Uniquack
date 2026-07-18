#!/usr/bin/env node

// Source-only contract for Assignment Practice start diagnostics. No server,
// browser, Provider, environment file, or database connection is used.

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();
const route = await readFile(
  resolve(root, "src/app/api/practice/assignments/start/route.ts"),
  "utf8",
);
const linkage = await readFile(
  resolve(root, "src/lib/practice/assignment-linkage.ts"),
  "utf8",
);
const persistence = await readFile(
  resolve(root, "src/lib/practice/persistence.ts"),
  "utf8",
);
const harness = await readFile(
  resolve(root, "scripts/student-v1-browser-e2e.mjs"),
  "utf8",
);

const EXPECTED_CODES = Object.freeze([
  "INVALID_REQUEST",
  "AUTHENTICATION_REQUIRED",
  "STUDENT_NOT_ELIGIBLE",
  "ASSIGNMENT_NOT_AVAILABLE",
  "ASSIGNMENT_CONTENT_UNAVAILABLE",
  "TAXONOMY_READ_FAILED",
  "PREFERENCE_INITIALIZATION_FAILED",
  "SESSION_CREATE_FAILED",
  "ROUND_PERSISTENCE_FAILED",
  "ASSIGNMENT_LINKAGE_FAILED",
  "SESSION_RELOAD_FAILED",
  "PRACTICE_START_FAILED",
]);
const SAFE_PUBLIC_ERROR = "Unable to start assignment practice.";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function block(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert(start >= 0 && end > start, `source block not found: ${startMarker}`);
  return source.slice(start, end);
}

const allowlistBlock = block(
  linkage,
  "export const ASSIGNMENT_PRACTICE_START_ERROR_CODES = [",
  "] as const;",
);
const actualCodes = [...allowlistBlock.matchAll(/"([A-Z_]+)"/g)].map((match) => match[1]);
assert(
  JSON.stringify(actualCodes) === JSON.stringify(EXPECTED_CODES),
  "Assignment Practice start error-code allowlist changed unexpectedly",
);

for (const [code, stage] of [
  ["STUDENT_NOT_ELIGIBLE", "student_profile"],
  ["ASSIGNMENT_NOT_AVAILABLE", "assignment_visibility"],
  ["ASSIGNMENT_CONTENT_UNAVAILABLE", "assignment_content"],
  ["TAXONOMY_READ_FAILED", "taxonomy"],
  ["SESSION_CREATE_FAILED", "session"],
  ["ROUND_PERSISTENCE_FAILED", "round"],
  ["ASSIGNMENT_LINKAGE_FAILED", "assignment_linkage"],
  ["SESSION_RELOAD_FAILED", "session_reload"],
  ["PRACTICE_START_FAILED", "start"],
]) {
  assert(
    linkage.includes(`code: "${code}"`) && linkage.includes(`stage: "${stage}"`),
    `missing safe stage mapping ${stage} -> ${code}`,
  );
}
assert(
  linkage.includes('stage === "preference"') &&
    linkage.includes('"PREFERENCE_INITIALIZATION_FAILED"') &&
    persistence.includes("onInitializationFailure") &&
    persistence.includes('stage: "preference"') &&
    persistence.includes('stage: "session"'),
  "preference and session initialization failures must remain distinguishable",
);

assert(
  route.includes(`const ASSIGNMENT_PRACTICE_START_PUBLIC_ERROR = "${SAFE_PUBLIC_ERROR}"`) &&
    route.includes("{ error: ASSIGNMENT_PRACTICE_START_PUBLIC_ERROR, code }") &&
    route.includes('code: "AUTHENTICATION_REQUIRED"') &&
    route.includes('code: "INVALID_REQUEST"') &&
    route.includes("normalizeAssignmentPracticeStartError(cause)") &&
    !route.includes("error.message") &&
    !route.includes("String(error)") &&
    !route.includes("String(cause)") &&
    !route.includes("stack"),
  "public start failures must serialize only the fixed message and allowlisted code",
);
assert(
  route.includes('status: 401') &&
    route.includes('status: 400') &&
    route.includes('status: 503'),
  "Assignment Practice start HTTP status behavior changed unexpectedly",
);
assert(
  route.includes('console.warn("assignment_practice_start_failed"') &&
    route.includes("code: startError.code") &&
    route.includes("stage: startError.stage") &&
    !/console\.(?:log|warn|error)\([^)]*(?:cause|message|stack|request|assignmentId|url|sql)/i.test(route),
  "server diagnostics must log only the bounded stage and code",
);

const sensitiveCause = new Error(
  "relation=private_table column=secret identifier=00000000-0000-0000-0000-000000000000",
);
const simulatedSafePayload = {
  error: SAFE_PUBLIC_ERROR,
  code: EXPECTED_CODES.includes(sensitiveCause.code) ? sensitiveCause.code : "PRACTICE_START_FAILED",
};
const serializedSafePayload = JSON.stringify(simulatedSafePayload);
assert(
  serializedSafePayload ===
    '{"error":"Unable to start assignment practice.","code":"PRACTICE_START_FAILED"}' &&
    !serializedSafePayload.includes(sensitiveCause.message),
  "an arbitrary internal Error must not affect the public response",
);

const responseClassifier = block(
  harness,
  "async function assignmentStartResponseOutcome",
  "function classifyPageError",
);
assert(
  responseClassifier.includes('request.method() === "POST"') &&
    responseClassifier.includes('request.resourceType() === "fetch"') &&
    responseClassifier.includes("url.origin === expectedOrigin") &&
    responseClassifier.includes("url.pathname === PRACTICE_START_PATH") &&
    responseClassifier.includes("const httpStatus = response.status()") &&
    responseClassifier.includes("ASSIGNMENT_START_API_CODES.has(candidate)") &&
    responseClassifier.includes('code: "UNRECOGNIZED_API_CODE"') &&
    !/console\.(?:log|warn|error)/.test(responseClassifier),
  "browser diagnostics must retain only the intended POST status and allowlisted code",
);
assert(
  harness.includes("assignment_start_http_status=") &&
    harness.includes("assignment_start_code=") &&
    !harness.includes("assignment_start_response_body=") &&
    !harness.includes("assignment_start_error_message="),
  "browser failure output must not retain raw assignment-start payload fields",
);

console.log("PASS Assignment Practice start typed diagnostic contract");
