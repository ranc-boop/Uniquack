# Clean Supabase Auth Bootstrap Execute Report

## Executive Summary

Result: execute passed for the disposable clean Supabase project.

The service-role-only auth bootstrap script was run in this required order:

```text
validate-only -> dry-run -> execute -> row-count verification -> post-execute dry-run
```

The execution created exactly the intended first disposable admin bootstrap records:

```text
organizations_created: 1
auth_users_created_or_invited: 1
profiles_created: 1
organization_members_created: 1
```

Teacher/student bootstrap env vars were intentionally unset, so no teacher or student users were created.

## Disposable Target Confirmation

- Target type: disposable clean Supabase project
- Target URL type: project root URL
- Old Supabase target used: no
- Production/live target used: no
- App cutover performed: no
- Provider credentials configured: no
- Migrations applied: no
- Seed SQL applied: no

Private values were entered through local PowerShell prompts. They were set only as process environment variables, were not printed, and were not written to repo files.

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

## Pre-Execute Dry-Run Result

Command shape:

```text
node scripts\clean-supabase-auth-bootstrap.mjs
```

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

The dry-run matched the expected first-admin bootstrap plan.

## Execute Result

Command shape:

```text
node scripts\clean-supabase-auth-bootstrap.mjs --execute
```

Result: passed.

Safe output:

```json
{
  "execution_mode": "execute",
  "requested_user_count": 1,
  "clean_table_checks_passed": 1,
  "organizations_created": 1,
  "auth_users_created_or_invited": 1,
  "profiles_created": 1,
  "organization_members_created": 1
}
```

Only the first disposable admin bootstrap target was included.

## Row-Count Verification

Safe row-count verification after execute:

```json
{
  "auth.users": 1,
  "organizations": 2,
  "profiles": 1,
  "organization_members": 1
}
```

The `organizations` total is `2` because the clean seed rehearsal had already created one local/demo organization row before this auth bootstrap. The execute summary confirms this run created one additional bootstrap organization for the configured disposable admin target.

No emails, IDs, tokens, invite links, raw user objects, or raw API responses were printed.

## Post-Execute Idempotency Dry-Run

Command shape:

```text
node scripts\clean-supabase-auth-bootstrap.mjs
```

Result: passed.

Safe output:

```json
{
  "execution_mode": "dry-run",
  "requested_user_count": 1,
  "clean_table_checks_passed": 1,
  "organizations_existing": 1,
  "organizations_would_update": 1,
  "auth_users_existing": 1,
  "profiles_existing": 1,
  "profiles_would_update": 1,
  "organization_members_existing": 1,
  "organization_members_would_update": 1
}
```

No duplicate create plan appeared after execution. The script detected the existing organization, auth user, profile, and membership and planned update-only behavior where applicable.

## Scope And Safety

- Teacher users created: no
- Student users created: no
- Provider credentials configured: no
- `.env.local` modified: no
- Vercel env modified: no
- app/frontend code modified: no
- migrations modified: no
- seed SQL applied: no
- old Supabase project used: no
- production/live project used: no
- secret values printed: no
- secret values committed: no
- `output/` committed: no

Private process env vars were cleared after execution and verification.

## Blockers / Warnings

No execution blocker remains.

Warning: total `organizations` is `2`, not `1`, because the disposable database already contained one seeded organization row from the clean seed rehearsal. This is expected for the current disposable rehearsal state and does not indicate duplicate admin bootstrap creation.

## Checks Run

```text
git status --short
git checkout main
git pull
git checkout -b codex/disposable-auth-bootstrap-execute
Test-Path scripts\clean-supabase-auth-bootstrap.mjs
node --check scripts\clean-supabase-auth-bootstrap.mjs
node scripts\clean-supabase-auth-bootstrap.mjs --validate-only
node scripts\clean-supabase-auth-bootstrap.mjs
node scripts\clean-supabase-auth-bootstrap.mjs --execute
safe row-count verification
node scripts\clean-supabase-auth-bootstrap.mjs
```

Lint/build were skipped because this task only adds this report document and does not modify application code.

## Recommended Next Task

Verify login against the disposable project using the newly bootstrapped admin account in a separate app wiring/cutover task.

Keep provider credentials, Vercel/app environment cutover, teacher/student bootstrap, and production bootstrap as separate explicit tasks.
