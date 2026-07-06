# Question Bank / Library Foundation Report

## Summary

This branch adds the first real teacher-owned Question Bank / Library foundation.
Banks now exist as the content source of truth before classrooms and assignments.

## Product Workflow Touched

Private/owned materials flow into Review Drafts and then into a teacher-owned
Question Bank / Library before delivery. This PR implements the bank foundation
only:

- Teachers/admins can create a bank.
- Teachers/admins can list banks they own or are members of.
- Teachers/admins can open a bank detail page.
- Creating a bank creates the initial owner membership.
- Bank detail shows empty reviewed-content state and disabled future actions.

Classrooms and assignments remain delivery layers. No classroom-first shortcut was
added.

## Non-Goals

This PR does not implement:

- bank share-code mutation
- PDF import into a bank
- Review Draft approval into a bank
- assignment-from-bank
- public pull/private push
- student bank browsing
- Google Classroom
- wearable/state-aware UI
- AI/provider calls

## Role Boundaries

- Teacher: owns private/shared banks and can create/list/open bank workspaces.
- Admin/super admin: can preview teacher workspace and create banks through the
  same staff-safe path.
- Student: cannot browse teacher private banks.

## Data Ownership

The clean migration adds:

- `question_banks`
- `bank_members`
- `bank_questions`

Bank content remains private by default. Shared/organization/public visibility
is represented in schema and UI labels, but collaboration, public promotion, and
assignment delivery are deliberately not implemented here.

## Migration And RLS

Added clean migration:

- `supabase/clean-migrations/0025_question_banks_foundation.sql`

The migration adds scoped RLS helpers:

- `private.can_read_question_bank`
- `private.can_manage_question_bank`

It also adds authenticated RPC:

- `public.create_question_bank(bank_name, bank_description, bank_visibility)`

The RPC creates the bank and the owner membership in one server-side operation.
It rejects unauthenticated users and non-teacher/non-admin profiles.

## UI

Updated teacher surfaces:

- `/teacher`
- `/teacher/banks`
- `/teacher/banks/new`
- `/teacher/banks/[bankId]`

The UI follows the teacher workbench direction from `DESIGN.md`: pale sky/slate
wash, white panels, sky primary actions, and no dark-green control language.

## Smoke Coverage

Added:

- `scripts/question-bank-foundation-smoke.mjs`

Updated:

- `scripts/security-smoke.mjs`
- `scripts/route-smoke.mjs`
- `scripts/supabase-rls-smoke.mjs`
- `scripts/smoke-all.mjs`

The new smoke verifies route sources and, when migration 0025 is applied to the
target Supabase project, verifies:

- teacher/admin can create a private bank
- owner membership is created
- owned bank can be listed/opened
- anonymous users cannot read the private bank
- students cannot read the private bank when student credentials exist
- unrelated teacher check is skipped unless credentials exist
- smoke-created rows are cleaned up with service-role deletion when available

Current disposable clean Supabase state: migration 0025 was not applied from this
Codex environment because neither `supabase` CLI nor `psql` is available on PATH.
The live bank create smoke therefore skips with a clear message until migration
0025 is applied.

## Tests

Passed:

- `npm.cmd run lint`
- `npm.cmd run build`
- `node scripts/security-smoke.mjs`
- `node scripts/route-smoke.mjs`
- `node scripts/supabase-rls-smoke.mjs`
- `node scripts/question-bank-foundation-smoke.mjs`
- `npm.cmd run smoke`
- `npm.cmd run perf:budget`

Notes:

- `node scripts/question-bank-foundation-smoke.mjs` passed route/static checks
  and skipped live create/list/RLS checks because the remote clean Supabase target
  does not yet have migration 0025.

## Rollback Risk

Medium. This is a forward-only clean migration that introduces new bank tables and
does not modify old migrations or existing classroom/assignment behavior. If the
feature must be paused, the UI has a setup-needed state and the new bank routes do
not affect student assignment visibility.

## Next Recommended Task

Apply `supabase/clean-migrations/0025_question_banks_foundation.sql` to the clean
Supabase project, then rerun:

```bash
node scripts/question-bank-foundation-smoke.mjs
npm.cmd run smoke
```

After that, implement the next review-gated slice: Review Draft approval into a
selected teacher bank.
