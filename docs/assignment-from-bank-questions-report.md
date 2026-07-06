# Assignment from Bank Questions Report

## Goal

Add the bank-first assignment path:

```text
Question Bank / Library
-> select approved active bank questions
-> choose a managed classroom
-> save draft or assign
-> Student My Work receives selected assignment items only
```

## Product Workflow

Teachers now create the normal assignment flow from a bank detail page:

- `/teacher/banks/[bankId]` shows **Create assignment**.
- `/teacher/banks/[bankId]/assignments/new` lists active approved bank questions.
- The teacher chooses a classroom they manage.
- The teacher can save a draft or assign immediately.
- Students see assigned items through `/student/work`, not through the source bank.

The older classroom-first published-question assignment form remains as a compatibility/regression path and now points teachers back to Question Banks as the primary workflow.

## Migration

Added:

```text
supabase/clean-migrations/0028_assignment_from_bank_questions.sql
```

The migration:

- extends `assignments.source_kind` with `question_bank`
- adds `assignment_items.bank_question_id`
- adds `assignment_items.source_bank_id`
- adds `private.can_read_assignment_question(...)`
- adds `questions_assignment_item_read` for assignment-scoped question reads
- adds `public.create_assignment_from_bank(...)`

The RPC validates:

- authenticated active teacher/admin role
- source bank is active and readable
- classroom is active and manageable
- bank and classroom share an organization
- selected `bank_questions` are active and belong to the bank
- linked questions are not raw drafts

It creates assignment rows and item lineage without publishing questions globally.

## UI Changes

Changed:

- Bank detail page now has **Create assignment** and assignment-only copy.
- New bank assignment page shows bank context, assignable question count, classroom selector, selected-item checklist, draft/assign controls, and server-side recheck copy.
- Assignment detail shows `Question Bank` as a source kind and links teachers back to the source bank.
- Student work detail shows an assignment-only notice for bank-sourced work and does not expose a bank link.

## Data Ownership And Safety

Confirmed by implementation/static smoke:

- Students do not gain full bank browsing access.
- Assignment visibility is selected-item only.
- Draft assignments remain teacher-only.
- Bank-sourced assigned questions are not globally published by this path.
- No Review Draft approval path was bypassed.
- No provider or AI calls were added.
- No old Supabase migrations were edited.

## Smoke Coverage

Added:

```text
scripts/assignment-from-bank-smoke.mjs
```

Added to:

```text
scripts/smoke-all.mjs
```

Updated:

- `scripts/security-smoke.mjs`
- `scripts/route-smoke.mjs`
- `scripts/supabase-rls-smoke.mjs`

The workflow smoke performs static checks immediately and live checks when the clean Supabase target has migration 0028 applied and network access is available.

## Live Validation Status

In this Codex sandbox, live Supabase access was blocked by:

```text
EACCES fetch failed
```

Because of that, the live create/list/RLS portion of `assignment-from-bank-smoke` was skipped locally. The migration should be applied to the clean Supabase project using:

```text
docs/assignment-from-bank-migration-0028-manual-apply.md
```

Then rerun:

```bash
node scripts/assignment-from-bank-smoke.mjs
```

## Tests Run During Implementation

Passed:

```bash
node --check scripts/assignment-from-bank-smoke.mjs
node scripts/security-smoke.mjs
node scripts/route-smoke.mjs
node scripts/assignment-from-bank-smoke.mjs
```

Partial:

```bash
node scripts/supabase-rls-smoke.mjs
```

The 0028 static RLS checks passed before the script later hit the same network restriction on a live Supabase read.

## Remaining Blocker

Apply clean migration 0028 to the clean Supabase project, then rerun the live assignment-from-bank smoke. No runtime code changes are expected for that step unless the live smoke finds a real database blocker.
