#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();
const read = (file) => readFile(resolve(root, file), "utf8");
const [frameworkLimits, frameworkActions, frameworkPage, importJson, importPanel] = await Promise.all([
  read("src/lib/practice/framework-input-limits.ts"),
  read("src/app/admin/practice-frameworks/actions.ts"),
  read("src/app/admin/practice-frameworks/page.tsx"),
  read("src/lib/batch-import/json.ts"),
  read("src/components/batch-import-json-panel.tsx"),
]);

assert.match(frameworkLimits, /LEARNING_PATH_CHARS: 8_000/);
assert.match(frameworkLimits, /LEARNING_PATH_ITEMS: 40/);
assert.match(frameworkLimits, /LEARNING_PATH_ITEM_CHARS: 1_000/);
assert.match(frameworkActions, /items\.length > PRACTICE_FRAMEWORK_INPUT_LIMITS\.LEARNING_PATH_ITEMS/);
for (const field of ["TITLE", "DESCRIPTION", "FRAMEWORK_PROMPT", "LEARNING_PATH", "ALLOWED_TAG_IDS", "PRIORITY_RULES"]) {
  assert.ok(frameworkPage.includes(`PRACTICE_FRAMEWORK_INPUT_LIMITS.${field}_CHARS`));
}
assert.match(importJson, /byteLength > 2 \* 1024 \* 1024/);
assert.match(importJson, /items\.length > 1_000/);
assert.match(importPanel, /maxLength=\{2_000_000\}/);

console.log("PASS admin prompt and manual import resource limits");
