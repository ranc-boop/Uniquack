# Clean Supabase Auth Bootstrap Dry-Run Rerun Report

## Executive Summary

Result: validate-only passed; dry-run blocked with a useful sanitized error.

The auth bootstrap script was rerun against the user-supplied disposable clean Supabase target after the dry-run error-handling patch was merged into `main`.

`--execute` was not used.

Validate-only passed:

```text
execution_mode: validate-only
requested_user_count: 1
clean_table_checks_passed: 1
```

Dry-run failed before returning a planned-action summary. Unlike the previous run, it now reported a specific sanitized blocker:

```text
category: table_check_error
message: Could not read organization by slug.
detail: message: Invalid path specified in request URL
detail: code: PGRST125
```

This confirms the error-handling patch replaced the previous unhelpful `Unknown error` with an actionable non-secret category/message.

## Disposable Target Confirmation

- Target type: user-supplied disposable clean Supabase target
- Old Supabase target intentionally used: no
- Production/live target intentionally used: no
- `BOOTSTRAP_MODE`: `disposable`
- `BOOTSTRAP_CONFIRM`: expected confirmation phrase set
- Teacher/student env vars: intentionally unset for this rerun because they were not explicitly requested in the rerun task

Private values were entered through local PowerShell prompts and were not printed or written to repo files.

## Validate-Only Result

Command shape:

```text
node scripts\clean-supabase-auth-bootstrap.mjs --validate-only
```

Result: passed.

Safe output:

```json
{
  "execution_mode": "validate-only",
  "requested_user_count": 1,
  "clean_table_checks_passed": 1
}
```

Validate-only may connect to the disposable project to check required clean tables. It does not create auth users, profiles, organization memberships, provider credentials, or runtime data.

## Dry-Run Result

Command shape:

```text
node scripts\clean-supabase-auth-bootstrap.mjs
```

Equivalent mode: default dry-run.

Result: blocked.

Safe blocker:

```text
category: table_check_error
message: Could not read organization by slug.
detail: message: Invalid path specified in request URL
detail: code: PGRST125
```

No raw API response, token, password, service-role key, credential-bearing URL, invite link, or user detail was logged.

## Planned Action Summary

Dry-run did not reach a complete planned-action summary.

Observed request shape:

```text
requested users: 1
admin included: yes
teacher included: no
student included: no
organization name/slug configured: yes
confirmation phrase configured: yes
disposable mode configured: yes
```

Because dry-run stopped while reading the organization by slug, it did not reach auth user creation/invite planning, profile planning, or membership planning.

## Mutation Safety

`--execute` was not run.

No code path that creates or mutates auth users, profiles, organization memberships, provider credentials, migrations, seeds, app code, or environment files was intentionally executed.

The dry-run failed before the script reached any execute-only mutation branch.

## Row-Count Verification

Safe row-count verification was attempted after the blocked dry-run.

The first row-count attempt failed because the temporary verification script was outside the repo and could not resolve `@supabase/supabase-js`.

The retry ran from the repo context, but Supabase Auth Admin user listing was blocked by the same sanitized target/path issue:

```text
AuthApiError: Invalid path specified in request URL
status: 404
```

Therefore no reliable post-run row counts were returned in this rerun.

Mutation status should be interpreted as:

- mutation mode used: no
- auth user creation path reached: no
- profile/member mutation path reached: no
- independent post-run row-count confirmation: blocked by target/path error

## Environment And Scope

- `.env.local` modified: no
- Vercel env modified: no
- app/frontend code modified: no
- migrations modified: no
- seeds modified: no
- SQL applied: no
- provider credentials configured: no
- secret values printed: no
- secret values committed: no
- `output/` committed: no

Private process env vars were cleared after the validate-only, dry-run, and row-count attempts.

## Blockers / Warnings

The current blocker is actionable:

```text
PGRST125 Invalid path specified in request URL
```

Likely next investigation:

- confirm `CLEAN_SUPABASE_URL` is the project root URL, such as `https://<project-ref>.supabase.co`
- do not use a Data API, REST, Auth, Studio, dashboard, or credential-bearing URL as `CLEAN_SUPABASE_URL`
- consider patching script validation so `CLEAN_SUPABASE_URL` rejects non-root pathnames before connecting

## Checks Run

```text
git status --short
git checkout main
git pull
git log -1 --oneline
git checkout -b codex/disposable-auth-bootstrap-dry-run-rerun
Test-Path scripts\clean-supabase-auth-bootstrap.mjs
node --check scripts\clean-supabase-auth-bootstrap.mjs
node scripts\clean-supabase-auth-bootstrap.mjs --validate-only
node scripts\clean-supabase-auth-bootstrap.mjs
safe row-count verification attempt
```

Lint/build were skipped because this task only adds this report document and does not modify application code.

## Recommended Next Task

Rerun validate-only and dry-run with `CLEAN_SUPABASE_URL` set to the disposable project root URL.

If the same blocker persists with a root URL, patch URL validation and/or Supabase client construction to fail earlier with a clearer `invalid_target` message.

Do not run `--execute` until default dry-run produces a complete planned-action summary and row-count verification succeeds.
