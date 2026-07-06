# Bank Share Migration 0026 Manual Apply

`supabase` CLI and `psql` were not available in this local environment, so migration 0026 was not applied by Codex.

Apply only this clean migration to the clean Supabase project:

```text
supabase/clean-migrations/0026_bank_share_codes_and_members.sql
```

Do not run the old migration chain, do not run seeds, and do not apply this to the old Supabase project.

After applying, verify these objects exist:

```sql
select to_regclass('public.bank_share_codes') as bank_share_codes;

select
  pronamespace::regnamespace::text as schema_name,
  proname
from pg_proc
where (pronamespace::regnamespace::text, proname) in (
  ('public', 'create_bank_share_code'),
  ('public', 'revoke_bank_share_code'),
  ('public', 'join_question_bank_by_code'),
  ('public', 'update_bank_member_role'),
  ('public', 'remove_bank_member'),
  ('private', 'can_own_question_bank'),
  ('private', 'bank_share_code_hash')
)
order by schema_name, proname;
```

Then rerun:

```bash
node scripts/bank-share-members-smoke.mjs
npm.cmd run smoke
```

Expected live validation:

- teacher A creates a private smoke bank
- teacher B cannot read it before joining
- teacher A creates a viewer share code
- the DB stores only a hash/hint, not the raw code
- teacher B joins and reads the bank as viewer
- teacher B cannot manage share codes or members
- teacher A changes teacher B to editor
- teacher A removes teacher B
- teacher B loses access
- revoked share codes cannot be used
