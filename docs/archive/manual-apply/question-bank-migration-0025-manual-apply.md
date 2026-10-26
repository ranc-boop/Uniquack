# Manual Apply: Question Bank Migration 0025

This environment does not currently have `supabase` CLI or `psql` available on
`PATH`, so migration 0025 could not be applied safely from Codex.

## Target

Apply only this file to the clean Supabase project:

```text
supabase/clean-migrations/0025_question_banks_foundation.sql
```

Do not run old migrations. Do not run seeds. Do not modify provider settings,
Review Draft publishing behavior, assignments, or student data.

## Apply Steps

1. Open the clean Supabase project SQL editor.
2. Open the local migration file:

   ```text
   supabase/clean-migrations/0025_question_banks_foundation.sql
   ```

3. Copy the full SQL content into the SQL editor.
4. Run it once against the clean project.
5. Do not paste or expose DB passwords, service-role keys, anon keys, provider
   keys, gateway tokens, or encryption keys.

## Expected Objects

The migration should add:

- `public.question_banks`
- `public.bank_members`
- `public.bank_questions`
- `private.can_read_question_bank(uuid)`
- `private.can_manage_question_bank(uuid)`
- `public.create_question_bank(text, text, text)`

## Verification Queries

Run these in the Supabase SQL editor after applying the migration:

```sql
select to_regclass('public.question_banks') as question_banks;
select to_regclass('public.bank_members') as bank_members;
select to_regclass('public.bank_questions') as bank_questions;

select
  n.nspname as schema_name,
  p.proname as function_name
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where (n.nspname, p.proname) in (
  ('public', 'create_question_bank'),
  ('private', 'can_read_question_bank'),
  ('private', 'can_manage_question_bank')
)
order by n.nspname, p.proname;
```

Expected:

- all three `to_regclass` results are non-null
- all three functions are returned

## Post-Apply Smoke

After applying migration 0025, rerun locally:

```bash
node scripts/question-bank-foundation-smoke.mjs
npm.cmd run smoke
```

The live bank smoke should no longer skip the create/list/RLS segment.
