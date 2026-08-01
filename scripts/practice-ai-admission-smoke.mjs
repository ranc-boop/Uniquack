#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();
const read = (file) => readFile(resolve(root, file), "utf8");

const [migration, helper, ...routes] = await Promise.all([
  read("supabase/clean-migrations/0073_practice_ai_request_admission.sql"),
  read("src/lib/practice/admission.ts"),
  read("src/app/api/practice/recommend/route.ts"),
  read("src/app/api/practice/review/route.ts"),
  read("src/app/api/practice/hint/route.ts"),
  read("src/app/api/practice/sessions/title/route.ts"),
  read("src/app/api/practice/preferences/merge/run/route.ts"),
]);

assert.match(migration, /create table public\.practice_ai_request_windows/i);
assert.match(migration, /enable row level security/i);
assert.match(migration, /security definer[\s\S]*set search_path = ''/i);
assert.match(migration, /actor_id uuid := auth\.uid\(\)/i);
assert.match(migration, /on conflict[\s\S]*request_count = public\.practice_ai_request_windows\.request_count \+ 1/i);
assert.match(migration, /revoke execute[\s\S]*from public, anon/i);
assert.match(migration, /grant execute[\s\S]*to authenticated/i);
assert.doesNotMatch(migration, /grant (select|insert|update|delete|all)[^;]*authenticated/i);

assert.match(helper, /PRACTICE_RATE_LIMITED/);
assert.match(helper, /Retry-After/);
assert.match(helper, /status: 429/);
assert.match(helper, /PRACTICE_ADMISSION_UNAVAILABLE/);
assert.match(helper, /status: 503/);

for (const route of routes) {
  assert.match(route, /requirePracticeApiUser/);
  assert.match(route, /requirePracticeAiAdmission/);
}

console.log("PASS authenticated fail-closed Practice AI admission contract");
