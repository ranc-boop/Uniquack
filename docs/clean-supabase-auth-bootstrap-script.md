# Clean Supabase Auth Bootstrap Script Draft

## Purpose

`scripts/clean-supabase-auth-bootstrap.mjs` is a service-role-only bootstrap helper for a disposable clean Supabase project after clean migrations and clean seed rehearsal have passed.

It creates or plans the minimum auth/profile/organization membership records needed to log into the clean project:

- one organization
- one super-admin profile and admin membership
- optional teacher profile and membership
- optional student profile and membership

The script is intentionally not wired into the app and must not be exposed through a Next.js route or client UI.

## When To Use It

Use it only after:

1. Clean MVP migrations are applied.
2. Clean seed rehearsal has passed.
3. The target is confirmed disposable or otherwise explicitly approved.
4. You have a service-role key for that exact project.

This task only drafts the script and documentation. It does not run the script against Supabase.

## When Not To Use It

Do not use this script for:

- old Supabase projects
- production/live projects without a separate approval process
- provider credential setup
- app/Vercel environment cutover
- public first-admin onboarding
- client-side auth creation
- bulk legacy data import

The script refuses to run unless `BOOTSTRAP_MODE=disposable` and `BOOTSTRAP_CONFIRM=BOOTSTRAP_CLEAN_SUPABASE`.

## Required Environment Variables

Set these in the current shell process only. Do not write them to `.env.local`.

```powershell
$env:CLEAN_SUPABASE_URL="<clean disposable project URL>"
$env:CLEAN_SUPABASE_SERVICE_ROLE_KEY="<service role key for this disposable project>"
$env:BOOTSTRAP_ORGANIZATION_NAME="EduStruct Clean Demo"
$env:BOOTSTRAP_ORGANIZATION_SLUG="edustruct-clean-demo"
$env:BOOTSTRAP_ADMIN_EMAIL="admin@example.invalid"
$env:BOOTSTRAP_ADMIN_PASSWORD="<temporary admin password>"
$env:BOOTSTRAP_CONFIRM="BOOTSTRAP_CLEAN_SUPABASE"
$env:BOOTSTRAP_MODE="disposable"
```

For admin invite-only mode, use this instead of `BOOTSTRAP_ADMIN_PASSWORD`:

```powershell
$env:BOOTSTRAP_ADMIN_INVITE_ONLY="1"
```

Optional teacher/student users:

```powershell
$env:BOOTSTRAP_TEACHER_EMAIL="teacher@example.invalid"
$env:BOOTSTRAP_TEACHER_PASSWORD="<temporary teacher password>"
$env:BOOTSTRAP_STUDENT_EMAIL="student@example.invalid"
$env:BOOTSTRAP_STUDENT_PASSWORD="<temporary student password>"
```

## Disposable Usage Flow

First validate configuration and required clean tables:

```powershell
node scripts/clean-supabase-auth-bootstrap.mjs --validate-only
```

Then run the default dry run:

```powershell
node scripts/clean-supabase-auth-bootstrap.mjs
```

Dry run is the default and does not mutate auth users, profiles, organizations, or memberships.

Execute only after reviewing the dry-run summary:

```powershell
node scripts/clean-supabase-auth-bootstrap.mjs --execute
```

The script logs only action categories and counts. It must not print service-role keys, passwords, invite links, access tokens, JWTs, connection strings, provider keys, or raw Admin API responses.

## Production Caution

This draft is intentionally disposable-first. It requires `BOOTSTRAP_MODE=disposable`.

For production, create a separate reviewed process with stronger approvals, audit logging, key handling, rollback planning, and explicit environment cutover steps. Do not weaken this script to make production bootstrap casual.

## Rollback / Abort Behavior

Before `--execute`, there is no mutation.

During `--execute`, work is performed in this order:

1. validate required env vars and confirmation phrase
2. validate required clean tables
3. upsert organization by slug
4. find or create auth users through Supabase Admin API
5. upsert profiles by auth user ID
6. upsert organization memberships by organization and user

If a step fails, the script stops and prints a concise non-secret error. It does not print raw Admin API responses.

The script preserves existing `admin` / `super_admin` roles and refuses to demote the only active `super_admin`.

## What To Verify After Running

Use safe row-count checks only:

- `auth.users` count increased by the intended user count
- `profiles` includes the intended bootstrap user IDs
- `organization_members` includes intended memberships
- organization slug exists and is active
- no provider credentials were inserted
- no app/Vercel environment variables changed
- no public first-admin route was added

Do not print user passwords, service-role keys, invite links, access tokens, JWTs, or provider keys during verification.

## Next Task Recommendation

After a successful disposable auth bootstrap, run a separate app wiring/cutover planning task.

Provider credentials, Vercel/app environment changes, production bootstrap, and legacy data import should remain separate explicit tasks with separate approval.
