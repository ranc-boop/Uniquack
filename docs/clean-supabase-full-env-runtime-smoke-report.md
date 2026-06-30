# Clean Supabase Full-Env Runtime Smoke Report

Date: 2026-06-30

## Executive Summary

Disposable runtime smoke was rerun with the full process-only environment format. The previous `TEST_ADMIN_USERNAME` login blocker is resolved: `batch-import-smoke` successfully signed in, read active assignable taxonomy tags, and reached the question insert step.

Core checks passed:

- `npm.cmd run build`
- `node scripts/security-smoke.mjs`
- `node scripts/supabase-rls-smoke.mjs`
- `node scripts/route-smoke.mjs`

The broader `npm.cmd run smoke` still fails, but for a different and more specific reason: `scripts/batch-import-smoke.mjs` inserts a `questions` row without `organization_id`, while the clean schema requires `questions.organization_id` to be non-null.

## Full Env Categories Supplied

The local PowerShell runner prompted for process-only values and verified presence without printing values.

Supplied:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `TEST_ADMIN_USERNAME`
- `TEST_ADMIN_PASSWORD`
- `TEST_SUPER_ADMIN_USERNAME`
- `TEST_SUPER_ADMIN_PASSWORD`
- `TEST_STUDENT_USERNAME`
- `TEST_STUDENT_PASSWORD`
- `AI_PROVIDER_GATEWAY_TOKEN`
- `AI_PROVIDER_ENCRYPTION_KEY`
- `ENABLE_MOCK_AI_PROVIDER`
- `AI_IMPORT_LLM_DEBUG_LOGS`
- `PRACTICE_AGENT_FULL_CALL_LOGS`

All secret-bearing values were process-only and were cleared by the runner before exit.

## Environment Safety

Confirmed:

- `.env.local` was not modified.
- Vercel environment variables were not modified.
- Old Supabase was not intentionally used.
- Production/live Supabase was not intentionally used.
- Migrations were not modified or applied.
- Seed SQL was not modified or applied.
- Auth users were not created.
- `profiles` and `organization_members` were not mutated.
- Real provider credentials were not configured.
- Mock provider mode was used.
- No secret values were printed or committed.

The smoke scripts emitted normal dotenv loader messages, but no env values were printed.

## Results

| Check | Result |
| --- | --- |
| `npm.cmd run build` | Passed |
| `node scripts/security-smoke.mjs` | Passed |
| `node scripts/supabase-rls-smoke.mjs` | Passed |
| Local server start | Passed |
| `node scripts/route-smoke.mjs` | Passed |
| `npm.cmd run smoke` | Failed at `batch-import-smoke` |

## Build

`npm.cmd run build` passed with the Next.js production build and TypeScript checks.

## Security Smoke

`node scripts/security-smoke.mjs` passed.

Coverage included taxonomy, practice persistence, AI parsing, blueprint observation, blueprint library/review, generation safety, calibration, and admin surface checks.

## Supabase RLS Smoke

`node scripts/supabase-rls-smoke.mjs` passed.

Verified:

- Question blueprint migration enables admin-only RLS.
- Public can read active taxonomy nodes.
- Public can call taxonomy search RPC for published approved content.
- Anonymous users cannot write taxonomy nodes.

## Route Smoke

`node scripts/route-smoke.mjs` passed after the local server responded on `localhost:3000`.

Route smoke covered public question/video routes, admin auth redirects, import routes, blueprint routes, data-loading constraints, admin navigation, progressive loading shells, and AI PDF blueprint observation handoff.

## NPM Smoke

`npm.cmd run smoke` started and passed many bundled checks:

- Security smoke group
- Markdown/LaTeX editor smoke
- Bulk asset import smoke
- Package import smoke
- Supabase RLS smoke
- Batch import smoke taxonomy lookup

It failed at `scripts/batch-import-smoke.mjs` after admin sign-in succeeded:

```text
PASS batch smoke can read active assignable taxonomy tag IDs
Error: question insert failed: null value in column "organization_id" of relation "questions" violates not-null constraint
```

This means the previous admin credential failure is no longer the blocker. The remaining blocker is a clean-schema/app-smoke contract mismatch: `batch-import-smoke` inserts into `questions` without `organization_id`, but the clean MVP schema requires that column.

## Batch Import Smoke Status

Batch import smoke status: failed after successful login.

Failure reason:

- The script inserts a draft question without `organization_id`.
- The clean schema enforces `questions.organization_id NOT NULL`.

Recommended fix:

- Update `scripts/batch-import-smoke.mjs` in a separate focused PR to resolve the active organization for the signed-in admin and include `organization_id` when inserting test questions.
- Keep the cleanup logic intact so the smoke deletes only its own rows.

## Student Credentials

Student credentials were supplied in the full process-only env.

No student-specific blocker appeared before `npm.cmd run smoke` stopped at `batch-import-smoke`.

## Minimum Route Checks

Manual route probes while the local server was running:

| Route | Result |
| --- | --- |
| `/` | 200 |
| `/questions` | 200 |
| `/practice` | 307 |
| `/mistakes` | 307 |
| `/admin` | 307 |
| `/admin/questions` | 307 |
| `/admin/review` | 307 |
| `/admin/imports/pdf` | 307 |
| `/admin/blueprints` | 307 |
| `/teacher/course-builder` | 404 |
| `/videos` | 200 |

Redirects are expected for authenticated areas when unauthenticated.

`/teacher/course-builder` returned 404. The current app tree has no `src/app/teacher` route directory, so this appears to be a stale route expectation rather than a clean Supabase runtime failure.

## Provider Behavior

Provider behavior remained safe:

- `ENABLE_MOCK_AI_PROVIDER=true` was process-only.
- `AI_PROVIDER_GATEWAY_TOKEN` used a local disposable placeholder.
- `AI_PROVIDER_ENCRYPTION_KEY` used a local disposable placeholder.
- No real provider credentials were configured.
- No provider credential setup was attempted.

## Local Server Cleanup

The local server started successfully, route checks ran, and the leftover child process on port 3000 was stopped after the run.

## Files Changed

This branch changes only:

- `docs/clean-supabase-full-env-runtime-smoke-report.md`

## Recommended Next Task

Create a focused PR to make `scripts/batch-import-smoke.mjs` clean-schema-aware by inserting `organization_id` for its smoke-created question rows.

Separately, confirm whether `/teacher/course-builder` should be restored as a real route or removed from runtime smoke expectations.
