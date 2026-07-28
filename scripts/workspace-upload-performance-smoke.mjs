#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const root = process.cwd();
const [rawAdminUpload, rawTeacherUpload] = await Promise.all([
  readFile(resolve(root, "src/components/ai-pdf-import-panel.tsx"), "utf8"),
  readFile(resolve(root, "src/components/teacher/teacher-pdf-burst-upload.tsx"), "utf8"),
]);
const adminUpload = rawAdminUpload.replaceAll("\r\n", "\n");
const teacherUpload = rawTeacherUpload.replaceAll("\r\n", "\n");

assert(
  adminUpload.includes('import { runWithConcurrency } from "@/lib/async-concurrency"') &&
    adminUpload.includes("runWithConcurrency(") &&
    adminUpload.includes("AI_PDF_ADMIN_UPLOAD_CONCURRENCY") &&
    !adminUpload.includes("for (const file of files)"),
  "Admin multi-PDF uploads must use bounded concurrency instead of serial file processing.",
);
assert(
  teacherUpload.includes('import { runWithConcurrency } from "@/lib/async-concurrency"') &&
    !teacherUpload.includes("async function runWithConcurrency"),
  "Teacher and admin PDF uploads must share the bounded-concurrency implementation.",
);

const { runWithConcurrency } = await import(
  pathToFileURL(resolve(root, "src/lib/async-concurrency.ts")).href
);
let active = 0;
let completed = 0;
let maxActive = 0;
await runWithConcurrency([1, 2, 3, 4, 5, 6], 3, async () => {
  active += 1;
  maxActive = Math.max(maxActive, active);
  await new Promise((resolveWait) => setTimeout(resolveWait, 5));
  completed += 1;
  active -= 1;
});
assert(
  completed === 6 && maxActive === 3,
  "Bounded concurrency must finish every upload without exceeding the configured limit.",
);

console.log("PASS workspace_upload_performance_smoke");
