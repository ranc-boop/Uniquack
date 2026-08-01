#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();
const read = (file) => readFile(resolve(root, file), "utf8");

const [migration, route, sessionsRoute, persistence, client, manifest] = await Promise.all([
  read("supabase/clean-migrations/0072_practice_cycle_reset.sql"),
  read("src/app/api/practice/progress/reset/route.ts"),
  read("src/app/api/practice/sessions/route.ts"),
  read("src/lib/practice/persistence.ts"),
  read("src/components/practice/practice-agent-client.tsx"),
  read("docs/security/live-schema-manifest.json"),
]);

assert.match(migration, /create table public\.practice_progress_resets/i);
assert.match(migration, /enable row level security/i);
assert.match(migration, /to authenticated[\s\S]*auth\.uid\(\)/i);
assert.match(migration, /security definer[\s\S]*set search_path = ''/i);
assert.match(migration, /reset_my_practice_progress/i);
assert.match(migration, /revoke execute[\s\S]*from public, anon/i);
assert.match(migration, /grant execute[\s\S]*to authenticated/i);
assert.match(migration, /attempt\.created_at > coalesce\(reset\.reset_at/i);
assert.match(migration, /'public_catalog'::text as source_kind/i);
assert.match(migration, /count\(\*\) as question_count/i);
assert.doesNotMatch(migration, /delete from public\.practice_(attempts|wrong_questions)/i);
assert.doesNotMatch(migration, /delete from public\.student_assignment_progress/i);

assert.match(route, /requirePracticeApiUser/);
assert.match(route, /reset_my_practice_progress/);
assert.match(route, /resetAt/);

assert.match(client, /resetPracticeProgress/);
assert.match(client, /Practice all questions again/);
assert.match(client, /Historical attempts and Assignment evidence stay intact/);
assert.match(client, /prepareScopedNewSession/);
assert.match(persistence, /getPracticeProgressResetAt/);
assert.match(persistence, /from\("practice_progress_resets"\)/);
assert.match(sessionsRoute, /getPracticeProgressResetAt/);
assert.match(sessionsRoute, /sessionCreatedAfterReset/);
assert.match(sessionsRoute, /sessions\.find/);
assert.match(manifest, /0072_practice_cycle_reset\.sql/);

console.log("PASS non-destructive Practice cycle reset contract");
