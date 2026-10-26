# Google Account Links Baseline Smoke Fix Report

## Root Cause

`npm.cmd run smoke` failed on current `main` when it reached `scripts/google-account-links-baseline-smoke.mjs` because the Google account-link smoke scripts imported local database packages that were not declared in the repo:

- `embedded-postgres`
- `pg`

`pg` happened to exist locally as an extraneous package, but it was not repeatable from a clean install. `embedded-postgres` was neither declared nor installed.

## Why Main Was Failing

The aggregate smoke imports three Google account-link scripts from `scripts/smoke-all.mjs`:

- `scripts/google-account-links-baseline-smoke.mjs`
- `scripts/google-account-links-apply-smoke.mjs`
- `scripts/google-account-links-rls-smoke.mjs`

Those scripts were intended to run against an embedded local Postgres harness, but the harness dependency was missing from `package.json` / `package-lock.json`. Publish Center v2 did not introduce the failure.

## Chosen Repair

The smallest valid repair was to keep the existing embedded local Postgres architecture and declare the required dev dependencies:

- `embedded-postgres`
- `pg`

The smoke was not weakened or converted into a skip. The Google account-link assertions now execute during `npm.cmd run smoke`.

## Dependency and Harness Decision

No existing alternate local database harness was available for these Google migration/RLS checks. The scripts were already written around embedded Postgres, so the repair uses the maintained `embedded-postgres` package and direct `pg` client dependency.

To improve portability, the scripts now share `scripts/google-account-links-embedded-postgres.mjs`, which:

- allocates a temporary data directory under the OS temp folder,
- reserves an available localhost port instead of assuming `54329`,
- removes hard-coded user-specific paths,
- stops embedded Postgres and removes temp data in cleanup,
- avoids printing secrets or production connection details.

## Google Security Assertions Preserved

The smoke still validates the account-linking foundation, including:

- Google sign-in creates a student profile and link without elevating role.
- Existing Google identity resolves to the same profile.
- Email collision does not grant access to another account.
- A user can link their own Google account.
- Duplicate live Google subject links are blocked.
- Unlink succeeds when a password identity remains.
- Unlink is blocked when it would remove the last identity.
- Super admin reject can revoke a link.
- Non-super-admin reject is forbidden.
- Partial unique index permits relink after revoke.
- Direct insert into `google_account_links` is blocked by RLS.
- Users can read their own links but not other users' links.
- Super admin can read all links.
- Audit log visibility remains scoped.
- Invalid Google subject format is rejected.

## Cleanup and Windows Portability

The previous scripts used a fixed `C:\AI\o2iinstitute\.pg-data` path and fixed port `54329`. They now use temp directories and a dynamic local port. Cleanup runs through `finally` paths, and smoke failures set `process.exitCode` instead of exiting before teardown.

Embedded Postgres initialization needs to run outside the Codex filesystem sandbox on Windows because `initdb` fails inside the sandbox with a restricted-token error. Running the same scripts with normal local process permissions succeeds.

## Files Changed

- `package.json`
- `package-lock.json`
- `scripts/google-account-links-embedded-postgres.mjs`
- `scripts/google-account-links-baseline-smoke.mjs`
- `scripts/google-account-links-apply-smoke.mjs`
- `scripts/google-account-links-rls-smoke.mjs`
- `docs/google-account-links-baseline-smoke-fix-report.md`

## Tests and Results

Passed:

- `npm.cmd install`
- `node scripts/google-account-links-baseline-smoke.mjs`
- `node scripts/google-account-links-apply-smoke.mjs`
- `node scripts/google-account-links-rls-smoke.mjs`
- `npm.cmd run lint`
- `npm.cmd run build`
- `node scripts/security-smoke.mjs`
- `node scripts/route-smoke.mjs`
- `npm.cmd run smoke`
- `npm.cmd run perf:budget`

`npm.cmd run smoke` now passes fully, including the Google account-link baseline/apply/RLS checks.

## Non-Goals

- No Google Login implementation.
- No OAuth behavior changes.
- No account-role changes.
- No Classroom sync.
- No Publish Center changes.
- No production database mutation.
