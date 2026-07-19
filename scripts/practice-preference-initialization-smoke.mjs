#!/usr/bin/env node

// Pure in-memory preference initialization checks. No server, browser,
// Provider, environment file, or database connection is used.

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import ts from "typescript";

const root = process.cwd();
const modulePath = resolve(root, "src/lib/practice/preference-initialization.ts");
const moduleSource = await readFile(modulePath, "utf8");
const transpiled = ts.transpileModule(moduleSource, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
  fileName: modulePath,
}).outputText;
const moduleUrl = `data:text/javascript;base64,${Buffer.from(transpiled).toString("base64")}`;
const { initializePracticePreference } = await import(moduleUrl);

const persistence = await readFile(
  resolve(root, "src/lib/practice/persistence.ts"),
  "utf8",
);
const linkage = await readFile(
  resolve(root, "src/lib/practice/assignment-linkage.ts"),
  "utf8",
);
const route = await readFile(
  resolve(root, "src/app/api/practice/assignments/start/route.ts"),
  "utf8",
);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const existing = { long_term_preference: "existing", user_id: "current-user" };
let createCalls = 0;
const existingResult = await initializePracticePreference({
  create: async () => {
    createCalls += 1;
    return { data: null, error: new Error("must not create") };
  },
  read: async () => existing,
});
assert(existingResult.data === existing && createCalls === 0, "existing preference must be reused");

const created = { long_term_preference: "", user_id: "current-user" };
let readCalls = 0;
const createdResult = await initializePracticePreference({
  create: async () => ({ data: created, error: null }),
  read: async () => {
    readCalls += 1;
    return null;
  },
});
assert(createdResult.data === created && readCalls === 1, "missing preference must be created once");

const readFailure = new Error("private read detail");
let observedReadFailure = null;
try {
  await initializePracticePreference({
    create: async () => ({ data: created, error: null }),
    read: async () => {
      throw readFailure;
    },
  });
} catch (error) {
  observedReadFailure = error;
}
assert(observedReadFailure === readFailure, "read failures must remain attributable to preference read");

const createFailure = { code: "42501", message: "private create detail" };
const failedCreateResult = await initializePracticePreference({
  create: async () => ({ data: null, error: createFailure }),
  read: async () => null,
});
assert(failedCreateResult.error === createFailure, "creation failures must remain attributable to create");

const concurrentWinner = { long_term_preference: "winner", user_id: "current-user" };
let concurrentReads = 0;
const concurrentResult = await initializePracticePreference({
  create: async () => ({ data: null, error: { code: "23505", message: "private conflict" } }),
  read: async () => {
    concurrentReads += 1;
    return concurrentReads === 1 ? null : concurrentWinner;
  },
});
assert(
  concurrentResult.data === concurrentWinner && concurrentReads === 2,
  "a concurrent first initializer must recover by reading the winning row",
);

assert(
  persistence.includes(".insert({ user_id: userId })") &&
    persistence.includes('stage: "preference_read"') &&
    persistence.includes('stage: "preference_create"'),
  "preference persistence must use the authenticated profile identity and typed read/create stages",
);
assert(
  persistence.includes('stage: "preference_merge_read"') &&
    persistence.includes('stage: "preference_merge_write"') &&
    linkage.includes('preference_merge_read: "PREFERENCE_MERGE_READ_FAILED"') &&
    linkage.includes('preference_merge_write: "PREFERENCE_MERGE_WRITE_FAILED"'),
  "merge read and write failures must have separate bounded codes",
);
assert(
  route.includes('{ error: ASSIGNMENT_PRACTICE_START_PUBLIC_ERROR, code }') &&
    !route.includes("error.message") &&
    !route.includes("String(cause)") &&
    !route.includes("stack"),
  "preference failures must not expose raw internal details",
);

console.log("PASS Practice preference initialization and concurrency contract");
