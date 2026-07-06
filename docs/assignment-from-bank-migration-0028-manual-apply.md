# Migration 0028 Manual Apply

Use this only for the clean Supabase project.

Migration:

```text
supabase/clean-migrations/0028_assignment_from_bank_questions.sql
```

## Purpose

Migration 0028 enables the bank-first assignment workflow:

- teacher selects active approved `bank_questions`
- teacher chooses a classroom they manage
- assignment is created as draft or assigned
- `assignment_items` keep `bank_question_id` and `source_bank_id`
- students can read only assigned question items, not the full source bank
- bank questions remain non-public unless a separate review gate publishes them

## Manual Apply

If the Supabase CLI or `psql` is unavailable locally, open the clean Supabase Dashboard SQL Editor and run the full contents of:

```text
supabase/clean-migrations/0028_assignment_from_bank_questions.sql
```

Do not run old migrations. Do not run seeds. Do not apply this to the legacy Supabase project.

## Verification

After applying, run:

```bash
node scripts/assignment-from-bank-smoke.mjs
npm.cmd run smoke
```

The live smoke should no longer skip the assignment-from-bank checks. It should verify:

- teacher can create draft and assigned assignments from selected bank questions
- draft assignments stay teacher-only
- assigned work appears through assignment scope
- student can read selected assigned questions
- student cannot browse the source bank
- unassigned private bank questions remain hidden
- assigned bank questions remain non-published

## Safety Notes

Migration 0028 does not publish questions, does not approve Review Drafts, does not call AI providers, and does not grant anonymous access.
