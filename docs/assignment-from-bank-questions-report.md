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

Migration 0028 was manually applied to the clean Supabase project through the Dashboard SQL Editor.

Live assignment-from-bank smoke was rerun against the clean project and passed the core workflow:

```text
PASS assignment-from-bank static checks protect bank-first assignment workflow
PASS draft bank assignment stays teacher-only
PASS assignment item preserves bank lineage
PASS student can read selected assigned private bank question without global publish
PASS student receives assigned item access without full bank access
PASS assignment-from-bank smoke cleanup removed smoke-created rows
```

During broader `supabase-rls-smoke`, public taxonomy search exposed a post-apply grant issue:

```text
permission denied for function can_read_assignment_question
```

The branch migration has been corrected to grant the private RLS policy helper to `anon, authenticated`. Because there is no local `psql` or Supabase CLI available in this environment, apply this small Dashboard correction before rerunning the broader RLS suite:

```text
docs/assignment-from-bank-0028-policy-helper-grant-reapply.sql
```

## Tests Run During Implementation

Passed:

```bash
node --check scripts/assignment-from-bank-smoke.mjs
node scripts/security-smoke.mjs
node scripts/route-smoke.mjs
node scripts/assignment-from-bank-smoke.mjs
npm.cmd run lint
npm.cmd run build
node scripts/question-bank-foundation-smoke.mjs
node scripts/bank-share-members-smoke.mjs
node scripts/bank-import-review-smoke.mjs
npm.cmd run perf:budget
```

Partial:

```bash
node scripts/supabase-rls-smoke.mjs
npm.cmd run smoke
```

The 0028 static RLS checks passed. The broader RLS suite stopped at the missing remote `anon` execute grant for `private.can_read_assignment_question(uuid)`. `npm.cmd run smoke` is expected to stop at the same RLS blocker until the grant correction is applied remotely.

## Remaining Blocker

Apply `docs/assignment-from-bank-0028-policy-helper-grant-reapply.sql` to the clean Supabase project, then rerun:

```bash
node scripts/supabase-rls-smoke.mjs
npm.cmd run smoke
```

No runtime code changes are expected for that step.
