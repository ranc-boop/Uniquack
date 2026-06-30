# Local Dev Clean Supabase Switch Report

Date: 2026-06-30

## Executive Summary

Local development was switched from the old Supabase environment to the clean disposable Supabase environment by replacing the ignored local `.env.local` file with the ignored `.env.disposable-smoke.local` file.

The app was then verified locally against the clean Supabase environment.

Passed:

- `npm.cmd run lint`
- `npm.cmd run build`
- `node scripts/security-smoke.mjs`
- `node scripts/supabase-rls-smoke.mjs`
- `node scripts/route-smoke.mjs`
- `npm.cmd run smoke`

## Scope

This was a local dev only switch.

Not touched:

- Vercel environment variables
- production/live environment
- old Supabase
- migrations
- seed SQL
- app/frontend runtime code
- auth user bootstrap
- provider credential configuration

## Env Switch

`.env.local` was updated from `.env.disposable-smoke.local`.

The previous `.env.local` was backed up outside the repo:

```text
C:\Users\User\AppData\Local\Temp\edustruct-env-backups\.env.local.before-clean-switch-20260630-092913.bak
```

No env values were printed in logs, report output, or chat.

## Env Key Presence

Required keys were present in the new local `.env.local`:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `AI_PROVIDER_GATEWAY_TOKEN`
- `AI_PROVIDER_ENCRYPTION_KEY`
- `ENABLE_MOCK_AI_PROVIDER`
- `TEST_ADMIN_USERNAME`
- `TEST_ADMIN_PASSWORD`
- `TEST_SUPER_ADMIN_USERNAME`
- `TEST_SUPER_ADMIN_PASSWORD`

Optional keys were present:

- `TEST_STUDENT_USERNAME`
- `TEST_STUDENT_PASSWORD`

## High-Risk Key Check

No forbidden high-risk key names were found in the local switch env:

- `CLEAN_SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_DB_PASSWORD`
- `SERVICE_ROLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `DATABASE_URL`
- `OPENAI_API_KEY`
- `GEMINI_API_KEY`
- `DEEPSEEK_API_KEY`

No service-role key, database password, or real provider API key was added for this local switch.

## Verification

| Check | Result |
| --- | --- |
| `npm.cmd run lint` | Passed |
| `npm.cmd run build` | Passed |
| `node scripts/security-smoke.mjs` | Passed |
| `node scripts/supabase-rls-smoke.mjs` | Passed |
| Local server start | Passed |
| `node scripts/route-smoke.mjs` | Passed |
| `npm.cmd run smoke` | Passed |

The first non-escalated run hit a transient/sandbox-related Supabase `fetch failed` during RLS smoke. The verification was rerun with network access and passed.

## Local Server

The local server was started with the repository's production-style local server command after build:

```text
npm.cmd run start
```

The server responded on `http://localhost:3000`, route checks completed, and the server job was stopped afterward.

## Key Route Checks

Route smoke verified:

- `/questions`
- `/videos`
- admin auth redirects
- admin questions/review/import routes
- admin blueprint routes
- route data loading constraints
- AI PDF blueprint observation handoff

Additional key route probes returned:

| Route | Result |
| --- | --- |
| `/` | 200 |
| `/practice` | 307 |
| `/mistakes` | 307 |
| `/admin` | 307 |
| `/admin/questions` | 307 |
| `/admin/review` | 307 |
| `/admin/imports/pdf` | 307 |
| `/admin/blueprints` | 307 |
| `/videos` | 200 |

Redirects are expected for authenticated areas when unauthenticated.

## DB and Provider Safety

No migrations or seeds were applied.

No auth users were created.

`profiles` and `organization_members` were not intentionally mutated.

No provider credentials were configured. Local mock provider mode remains enabled through local env.

`npm.cmd run smoke` includes smoke scripts that intentionally create and clean up temporary disposable test rows, including batch-import smoke rows. No persistent manual DB mutation was performed by this task.

## Git Safety

Not committed:

- `.env.local`
- `.env.disposable-smoke.local`
- env backup files
- `.codex_tmp/`
- `output/`

Only this report is intended for commit.

## Remaining Blockers

No blocker was found for local dev running against the clean Supabase environment.

## Recommended Next Task

Open the local app with the clean `.env.local` and perform manual login/role QA for the disposable admin, student, and smoke-test routes that matter for the demo workflow.
