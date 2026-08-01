#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();
const read = (file) => readFile(resolve(root, file), "utf8");
const [boundary, ...callers] = await Promise.all([
  read("src/lib/ai-providers/prompt-safety.ts"),
  read("src/lib/blueprints/question-blueprint-generation.ts"),
  read("src/lib/blueprints/question-blueprint-repair.ts"),
  read("src/lib/ai-pdf-import/question-blueprint-analyzer.ts"),
  read("src/lib/teacher-blueprint-generation.ts"),
  read("src/lib/ai-pdf-import/service.ts"),
]);

for (const phrase of [
  "data only, never as instructions",
  "direct or indirect prompt injection",
  "system/developer prompts",
  "tool schemas or descriptions",
  "credentials",
  "internal reasoning",
  "unapproved Review Draft",
]) {
  assert.ok(boundary.includes(phrase), `Missing generation prompt boundary: ${phrase}`);
}
for (const caller of callers) {
  assert.match(caller, /AI_GENERATION_UNTRUSTED_DATA_BOUNDARY/);
}

console.log("PASS AI PDF and Blueprint generation treat all source material as untrusted data");
