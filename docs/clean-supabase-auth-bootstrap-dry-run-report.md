# Clean Supabase Auth Bootstrap Dry-Run Report

## Executive Summary

Result: partially passed / dry-run blocked.

The service-role-only auth bootstrap script was validated against the user-confirmed disposable clean Supabase project without using `--execute`.

`--validate-only` passed and confirmed the required clean tables are reachable:

```text
requested_user_count: 3
clean_table_checks_passed: 1
```

The default dry-run was attempted with admin, teacher, and student bootstrap inputs, but the script failed during dry-run planning with a non-secret `Unknown error`. No mutation mode was used.

Safe row-count verification after the failed dry-run confirmed:

```text
auth.users: 0
profiles: 0
organization_members: 0
```

No auth users, profiles, or organization memberships were created.

## Target Confirmation

- Target type: user-confirmed disposable clean Supabase validation project
- Old Supabase project used: no
- Production/live project used: no
- App cutover performed: no
- Provider credentials configured: no

Private inputs were collected through a local PowerShell prompt with hidden input. They were set only as process environment variables for the prompt process and were not written to repo files.

## Script Checks

Script path:

```text
scripts/clean-supabase-auth-bootstrap.mjs
```

Checks:

```text
Test-Path scripts\clean-supabase-auth-bootstrap.mjs: true
node --check scripts\clean-supabase-auth-bootstrap.mjs: passed
```

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
  "requested_user_count": 3,
  "clean_table_checks_passed": 1
}
```

This confirms the script could connect to the disposable project and validate the required clean tables without mutation.

## Dry-Run Result

Command shape:

```text
node scripts\clean-supabase-auth-bootstrap.mjs
```

Equivalent mode: default dry-run.

`--execute` was not used.

Result: failed / blocked.

Safe error summary:

```text
Clean Supabase auth bootstrap failed.
Unknown error
dry_run_exit_code=1
```

No raw API response, token, password, invite link, service-role key, or project URL was logged.

## Planned Action Summary

The dry-run failed before returning a complete planned-action summary.

Validated intended request shape:

```text
requested users: 3
admin included: yes
teacher included: yes
student included: yes
organization name/slug configured: yes
confirmation phrase configured: yes
disposable mode configured: yes
```

Because dry-run did not complete, the script should not be executed until the dry-run blocker is fixed and a complete planned-action summary is produced.

## No-Mutation Verification

After validate-only and the failed dry-run, safe row-count verification showed:

```text
auth.users: 0
profiles: 0
organization_members: 0
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

Secret environment values were cleared or not present before finishing.

## Blockers / Warnings

Dry-run did not complete. The script returned `Unknown error`, which is not actionable enough for safe execution.

Likely next investigation areas:

- improve non-`Error` exception reporting in `scripts/clean-supabase-auth-bootstrap.mjs`
- inspect Supabase Admin API dry-run lookup behavior
- keep output sanitized, but include stable non-secret error code/message details
- rerun validate-only and dry-run after the script reports a complete planned-action summary

## Tests

NPM lint/build were skipped because this task only added this report document and did not modify app code.

Executed checks:

```text
node --check scripts\clean-supabase-auth-bootstrap.mjs
node scripts\clean-supabase-auth-bootstrap.mjs --validate-only
node scripts\clean-supabase-auth-bootstrap.mjs
safe row-count query for auth.users / profiles / organization_members
```

## Recommended Next Task

Patch the auth bootstrap script dry-run error handling and planning path, then rerun validate-only and dry-run.

Do not run `--execute` until dry-run produces a complete planned-action summary for admin, teacher, student, organization, profile, and membership actions.
