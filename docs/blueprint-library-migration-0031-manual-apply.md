# Blueprint Library Migration 0031 Manual Apply

Use this only for the clean Supabase project.

Apply:

```text
supabase/clean-migrations/0031_blueprint_library_foundation.sql
```

Do not rerun old `supabase/migrations/*`.
Do not run seeds.
Do not touch provider credentials.

This migration:

- extends `question_blueprints` with teacher library fields
- extends `question_blueprint_folders` with visibility/status fields
- creates `bank_blueprints`
- adds RLS helpers for teacher Blueprint read/manage checks
- keeps anonymous access blocked

After applying it, rerun:

```bash
node scripts/blueprint-library-foundation-smoke.mjs
```

The live section should stop skipping and validate teacher create/list/open, bank linking, student block, anonymous block, and cleanup.

## Post-apply grant correction

If live smoke reaches the DB but fails when a real teacher creates a Blueprint folder or Blueprint with a row-level-security insert error, run only:

```text
docs/blueprint-library-0031-grants-reapply.sql
```

Do not rerun the full migration for this correction. The reapply file only grants authenticated access to the existing Blueprint Library tables and helper functions; RLS policies still enforce teacher ownership, bank membership, student blocking, and anonymous blocking.
