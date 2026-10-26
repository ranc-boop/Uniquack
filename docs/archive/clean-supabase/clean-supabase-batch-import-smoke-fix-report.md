# Clean Supabase Batch Import Smoke Fix Report

Date: 2026-06-30

## Executive Summary

`scripts/batch-import-smoke.mjs` is now clean-schema-aware for organization-owned inserts.

The previous full-env runtime smoke proved admin login worked, but the smoke failed because it inserted a `questions` row without `organization_id`. This fix resolves the signed-in admin's organization and includes that organization on smoke-created org-owned rows.

After the patch, the full disposable smoke path passed:

- `node --check scripts/batch-import-smoke.mjs`
- `npm.cmd run build`
- `node scripts/security-smoke.mjs`
- `node scripts/supabase-rls-smoke.mjs`
- `node scripts/route-smoke.mjs`
- `npm.cmd run smoke`
- Extra: `npm.cmd run lint`

## What Changed

Updated:

- `scripts/batch-import-smoke.mjs`

The smoke now:

- Resolves the signed-in admin's active organization.
- Inserts `organization_id` into smoke-created `import_batches`.
- Inserts `organization_id` into smoke-created `questions`.
- Adds `created_by` and `updated_by` to the smoke-created `question_taxonomy_assignments`.
- Keeps cleanup scoped to smoke-generated IDs and the resolved organization.
- Improves Supabase error messages without printing secrets.
- Removes an unused `randomUUID` import.

## Organization Resolution

Resolution priority:

1. Use `profiles.default_organization_id` for the signed-in admin if present.
2. Otherwise, query active `organization_members` rows for the signed-in user with role `admin` or `teacher`.
3. If multiple active admin/teacher memberships exist, choose the first deterministic row ordered by role and creation time.
4. If no organization can be resolved, fail with:

```text
no admin organization found: profile has no default_organization_id and no active admin/teacher organization_members row
```

The successful disposable run resolved the admin organization from:

```text
profiles.default_organization_id
```

## Org-Owned Inserts

The smoke creates only temporary rows. The clean-schema-aware inserts now include `organization_id` for:

- `import_batches`
- `questions`

The script also inspected related inserts:

- `question_taxonomy_assignments` does not have its own `organization_id`; access is scoped through the linked question.
- `import_batch_items`, `import_batch_assets`, `question_source_files`, `question_assets`, and review draft rows are not created by this smoke script.

## Cleanup Safety

Cleanup remains scoped to IDs created during the smoke run:

- `question_taxonomy_assignments.id`
- `questions.id`
- `import_batches.id`

Question and import-batch cleanup additionally filters by the resolved `organization_id`. The script reports cleanup failures explicitly as `batch smoke cleanup failed`.

## Teacher Route Expectation

No smoke script currently requires `/teacher/course-builder`.

The stale expectation only appears in `docs/clean-supabase-full-env-runtime-smoke-report.md`, where the route returned 404. The current app tree has no `src/app/teacher` route directory, so no route was added and `scripts/route-smoke.mjs` was not changed.

## Environment Safety

The validation loaded `.env.disposable-smoke.local` into process-only environment variables and reported presence only.

Required keys were present:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `AI_PROVIDER_GATEWAY_TOKEN`
- `AI_PROVIDER_ENCRYPTION_KEY`
- `ENABLE_MOCK_AI_PROVIDER`
- `TEST_ADMIN_USERNAME`
- `TEST_ADMIN_PASSWORD`
- `TEST_SUPER_ADMIN_USERNAME`
- `TEST_SUPER_ADMIN_PASSWORD`

Optional student keys were present:

- `TEST_STUDENT_USERNAME`
- `TEST_STUDENT_PASSWORD`

No env values were printed or committed.

## Verification

| Check | Result |
| --- | --- |
| `node --check scripts/batch-import-smoke.mjs` | Passed |
| `npm.cmd run build` | Passed |
| `node scripts/security-smoke.mjs` | Passed |
| `node scripts/supabase-rls-smoke.mjs` | Passed |
| `node scripts/route-smoke.mjs` | Passed |
| `npm.cmd run smoke` | Passed |
| `npm.cmd run lint` | Passed |

The first non-escalated run hit a transient/sandbox-related Supabase `fetch failed` during RLS smoke, so the validation was rerun with network access. The rerun passed all checks.

## Batch Import Smoke Result

Passed.

Confirmed output included:

```text
PASS batch smoke resolved admin organization from profile default_organization_id
PASS batch smoke can read active assignable taxonomy tag IDs
PASS batch smoke binds imported questions through exact tag_ids
PASS batch smoke verifies native taxonomy search for exact tag_ids
```

## Safety Confirmations

Confirmed:

- `.env.local` was not modified.
- Vercel env was not modified.
- `.env.disposable-smoke.local` was not committed.
- Old Supabase and production/live were not intentionally used.
- Migrations and seeds were untouched.
- App/frontend runtime code was untouched.
- No auth users were created.
- `profiles` and `organization_members` were not mutated.
- Real provider credentials were not configured.
- Mock provider mode was used.
- Process env secrets were cleared after validation.

## Remaining Blockers

No remaining blocker was found for `batch-import-smoke` or `npm.cmd run smoke`.

Separate product/routing note:

- `/teacher/course-builder` remains a stale expectation unless the product intends to restore a teacher route. It is not required by current smoke scripts.
