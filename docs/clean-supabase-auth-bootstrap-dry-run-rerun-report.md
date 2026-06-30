# Clean Supabase Auth Bootstrap Dry-Run Rerun Report

## Executive Summary

Result: validate-only passed; dry-run passed; no mutations occurred.

The auth bootstrap script was rerun against the disposable clean Supabase project using the project root URL:

```text
https://noxageqkoedbwtwhxmtu.supabase.co
```

The previous blocker was caused by using the REST endpoint URL ending in `/rest/v1`. With the root project URL, both validate-only and default dry-run completed successfully.

`--execute` was not used.

## Disposable Target Confirmation

- Target type: disposable clean Supabase project
- URL kind: project root URL
- Old Supabase target intentionally used: no
- Production/live target intentionally used: no
- `BOOTSTRAP_MODE`: `disposable`
- `BOOTSTRAP_CONFIRM`: expected confirmation phrase set
- Teacher/student env vars: intentionally unset for this rerun

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

Validate-only connected to the disposable project and verified required clean tables without mutation.

## Dry-Run Result

Command shape:

```text
node scripts\clean-supabase-auth-bootstrap.mjs
```

Equivalent mode: default dry-run.

Result: passed.

Safe output:

```json
{
  "execution_mode": "dry-run",
  "requested_user_count": 1,
  "clean_table_checks_passed": 1,
  "organizations_would_create": 1,
  "auth_users_would_create_or_invite": 1,
  "profiles_would_create": 1,
  "organization_members_would_create": 1
}
```

This was planning-only. No auth user, organization, profile, or membership was created.

## Planned Action Summary

The dry-run plan would create, if `--execute` is explicitly approved later:

```text
organization: 1 would create
auth user/invite: 1 would create or invite
profile: 1 would create
organization membership: 1 would create
```

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

## Mutation Safety

`--execute` was not run.

No code path that creates or mutates auth users, profiles, organization memberships, provider credentials, migrations, seeds, app code, or environment files was intentionally executed.

## Row-Count Verification

Safe post-run row-count verification passed:

```json
{
  "auth.users": 0,
  "profiles": 0,
  "organization_members": 0
}
```

Therefore:

- auth users created: no
- profiles created or mutated: no
- organization memberships created or mutated: no

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

Private process env vars were cleared after validate-only, dry-run, and row-count verification.

## Blockers / Warnings

No dry-run blocker remains when `CLEAN_SUPABASE_URL` is set to the project root URL.

Important operator note:

```text
CLEAN_SUPABASE_URL must be the project root URL, not the REST endpoint ending in /rest/v1.
```

## Checks Run

```text
git status --short
Test-Path scripts\clean-supabase-auth-bootstrap.mjs
node --check scripts\clean-supabase-auth-bootstrap.mjs
node scripts\clean-supabase-auth-bootstrap.mjs --validate-only
node scripts\clean-supabase-auth-bootstrap.mjs
safe row-count verification for auth.users / profiles / organization_members
```

Lint/build were skipped because this update only changes this report document and does not modify application code.

## Recommended Next Task

If the team wants to actually create the disposable admin account, run a separate explicit task for `--execute` with a fresh approval gate.

Do not run `--execute` from this report task.
