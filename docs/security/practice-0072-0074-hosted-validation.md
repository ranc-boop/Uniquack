# Practice migrations 0072-0074 hosted validation

## Scope

This record covers the configured disposable Supabase project only. It does not claim production deployment or Supabase migration-ledger entries.

## Application result

- 0072 passed a rollback preflight and was applied in a direct PostgreSQL transaction.
- 0073 passed a rollback preflight and was applied in a direct PostgreSQL transaction.
- The first runtime check exposed a PL/pgSQL name collision between the local `current_time` variable and PostgreSQL's built-in `current_time` expression.
- The applied 0073 file was preserved. Forward-only migration 0074 renamed the variable to `request_time`, passed rollback preflight, and was applied transactionally.
- Post-apply catalog checks confirmed both tables, both RPCs, RLS, browser-role table denial, authenticated RPC grants, and the corrected function definition.

## Runtime result

The runtime matrix ran inside rollback-only transactions, so it did not reset real learner progress or retain test counters.

- An authenticated owner could create and observe only their own reset boundary.
- A different authenticated user could not observe that boundary.
- Twelve recommendation admissions were allowed in one minute; the thirteenth was denied with retry metadata.
- Authenticated direct reads of the admission counter table were denied.
- Anonymous reset RPC execution was denied.
- Data API calls without a user identity reached both RPCs and failed with authorization errors rather than PostgREST missing-function errors, confirming schema-cache availability without mutation.

## Advisor result

Supabase database advisors were run at warning level after application:

- Security: 8 existing warnings, 0 related to the 0072-0074 tables or functions.
- Performance: 253 existing warnings, 0 related to the 0072-0074 tables or functions.

The security baseline warnings are mutable `search_path` findings on eight pre-existing private helper functions. They are outside this migration and should be corrected in a separate forward-only hardening migration. The performance baseline is likewise retained as separate project debt rather than mixed into the Practice release.

## Release rule

Other environments must apply 0072, 0073, and 0074 in canonical order before deploying the admission callers. Migration 0074 is mandatory even though 0073 applies successfully, because the defect appears only when the RPC executes.
