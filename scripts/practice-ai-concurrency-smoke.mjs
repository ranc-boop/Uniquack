#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();
const read = (file) => readFile(resolve(root, file), "utf8");

const [migration, admission, recommend, review, hint] = await Promise.all([
  read("supabase/clean-migrations/0075_practice_ai_inflight_leases.sql"),
  read("src/lib/practice/admission.ts"),
  read("src/app/api/practice/recommend/route.ts"),
  read("src/app/api/practice/review/route.ts"),
  read("src/app/api/practice/hint/route.ts"),
]);

assert.match(migration, /primary key \(user_id, operation\)/i);
assert.match(migration, /where existing\.expires_at <= request_time/i);
assert.match(migration, /security definer[\s\S]*set search_path = ''/i);
assert.match(migration, /revoke all on table[\s\S]*public, anon, authenticated/i);
assert.match(migration, /claim_practice_ai_inflight_lease/i);
assert.match(migration, /release_practice_ai_inflight_lease/i);
assert.match(admission, /requirePracticeAiOperationLease/);
assert.match(admission, /releasePracticeAiOperationLease/);

for (const [name, route] of [["recommend", recommend], ["review", review], ["hint", hint]]) {
  assert.match(route, new RegExp(`requirePracticeAiOperationLease\\(\\{[\\s\\S]*operation: "${name}"`));
  assert.match(route, /releasePracticeAiOperationLease/);
}
assert.match(recommend, /ROUND_ALREADY_ACTIVE/);
assert.match(review, /finally \{[\s\S]*releasePracticeAiOperationLease/);
assert.match(hint, /finally \{[\s\S]*releasePracticeAiOperationLease/);

console.log("PASS atomic Practice AI in-flight concurrency lease contract");
