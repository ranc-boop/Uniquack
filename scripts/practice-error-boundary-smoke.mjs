#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const source = await readFile(resolve(process.cwd(), "src/app/practice/error.tsx"), "utf8");

assert.match(source, /^"use client";/);
assert.match(source, /reset: \(\) => void/);
assert.match(source, /onClick=\{reset\}/);
assert.match(source, /Your saved sessions and submitted evidence are still stored/);
assert.match(source, /error\.digest/);
assert.doesNotMatch(source, /error\.message/);
assert.doesNotMatch(source, /console\.(error|log)/);

console.log("PASS Practice route error boundary and safe recovery UI");
