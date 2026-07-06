# Real Teacher Bank Smoke Validation Report

## Executive Summary

The clean Supabase environment now has a disposable real teacher test account
for Question Bank / Library validation. The live bank smoke used
`TEST_TEACHER_USERNAME` / `TEST_TEACHER_PASSWORD` from the ignored local smoke
environment and no longer relied on admin fallback for bank creation.

Result: real teacher Question Bank creation, owner membership, list/detail read,
anonymous block, student block, and smoke cleanup all passed.

## Teacher Account / Bootstrap Method

Bootstrap method:

- existing `scripts/clean-supabase-auth-bootstrap.mjs`
- `--validate-only`
- `--execute`
- process-only clean Supabase URL/service-role env
- ignored local smoke env for test teacher credentials

The bootstrap script already supports:

- `BOOTSTRAP_TEACHER_EMAIL`
- `BOOTSTRAP_TEACHER_PASSWORD`
- teacher profile role: `teacher`
- organization membership role: `teacher`
- idempotent auth/profile/membership upsert behavior

## Teacher Created Or Reused

The local ignored smoke env did not previously include
`TEST_TEACHER_USERNAME` / `TEST_TEACHER_PASSWORD`, so a disposable teacher smoke
credential was generated locally and written only to:

```text
.env.disposable-smoke.local
```

That file is ignored by Git and was not committed.

Bootstrap result:

- existing admin user reused
- teacher auth user created
- teacher profile created
- teacher organization membership created

No passwords, service-role keys, anon keys, DB passwords, provider keys, or
tokens were committed or intentionally printed in the report.

## Role Confirmation

The updated `scripts/question-bank-foundation-smoke.mjs` now distinguishes real
teacher credentials from admin fallback.

When `TEST_TEACHER_USERNAME` / `TEST_TEACHER_PASSWORD` are present, the smoke
requires:

- profile role is exactly `teacher`
- active organization membership role is exactly `teacher`

The smoke passed those checks.

## Question Bank Live Smoke Result

Command:

```bash
node scripts/question-bank-foundation-smoke.mjs
```

Result:

- real teacher credentials used
- teacher created a private smoke bank
- owner membership was created for that teacher
- teacher could list/open the owned bank
- anonymous users could not read the private bank
- student users could not browse the teacher private bank
- smoke-created rows were cleaned up

Student block result: passed.

Unrelated teacher check: skipped because separate unrelated teacher credentials
were not configured.

## Smoke Script Update

Updated:

```text
scripts/question-bank-foundation-smoke.mjs
```

Purpose:

- load ignored `.env.disposable-smoke.local` after `.env.local`
- use real `TEST_TEACHER_*` credentials when present
- clearly log whether real teacher credentials or admin fallback are used
- require exact teacher role/membership when real teacher credentials are present

No runtime product code was changed.

## Tests

Passed:

```bash
node scripts/question-bank-foundation-smoke.mjs
npm.cmd run lint
npm.cmd run build
node scripts/security-smoke.mjs
node scripts/route-smoke.mjs
node scripts/supabase-rls-smoke.mjs
npm.cmd run smoke
npm.cmd run perf:budget
```

## Remaining Blockers

- Dedicated unrelated teacher smoke credentials are not configured, so the
  unrelated-teacher private bank visibility check remains skipped.

## Explicit Non-Goals

This task did not implement:

- bank share code
- teacher-private import
- assignment-from-bank
- Review Draft approval into bank
- Google Classroom
- wearable UI
- provider calls
- AI calls
- Review Draft publishing
- schema changes
