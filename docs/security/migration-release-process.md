# Canonical Migration Release Process

## Authority

- Canonical source: `supabase/clean-migrations`.
- Legacy/non-canonical source: `supabase/migrations`.
- Blocked from every live apply plan: `0032_google_account_links.sql`.
- No previously applied migration is renamed, edited, replayed, or represented as
  a different historical version.

The repository-owned reconciliation manifest and application register are the
release record until a future, separately reviewed release-ledger design is
approved. This is safer than mutating Supabase's internal migration ledger or
inventing timestamps for past SQL Editor work.

## Future Release Procedure

1. The release owner creates one new SQL file with the next unused monotonic
   four-digit prefix. The current active maximum is `0042`; it was applied
   exactly once through SQL Editor and must not be renumbered or replayed.
2. The PR records purpose, ownership boundary, RLS/function-grant review,
   forward-only rollback plan, and the exact expected catalog objects.
3. Run `node scripts/migration-reconciliation-smoke.mjs`. It verifies the
   active plan, blocked migration exclusion, historical integrity hashes,
   canonical RLS policy inventory, and security-definer search paths.
4. Apply only the approved active file(s) through the reviewed deployment path.
   Do not apply the legacy directory and do not bulk replay the historical
   clean chain against an existing environment.
5. Capture read-only catalog evidence using the queries in
   `docs/security/live-schema-reconciliation-report.md`. Store only object
   names, normalized definitions, booleans, and aggregate counts.
6. Add an application-register entry with the release owner, method, immutable
   migration hash, evidence location, and verification result.
7. A failed catalog comparison or an unknown authorization object blocks the
   release. Correct only with a new forward migration after review.

## SQL Editor Exception

SQL Editor application is an exception, not a deployment mechanism. It needs:

- an owner-signed register entry before use;
- exact file name and SHA-256 recorded without copying secrets;
- a statement that the SQL was applied once, or a clearly recorded failure;
- post-apply read-only catalog evidence and focused smoke output;
- no backfilled timestamp and no claim that the Supabase CLI applied it.

## Quarantine Rules

`0032_google_account_links.sql` remains present as a reviewed-but-blocked
artifact. It is not a live migration and must not be included by an aggregate
or release apply harness. Google identity work needs an approved OAuth/OIDC
design before a new, uniquely numbered forward migration can exist.

## Live Reconciliation Gate

Run the focused static check normally:

```powershell
node scripts/migration-reconciliation-smoke.mjs
```

Run the hard live gate only after the sanitized metadata manifest has a
complete capture and every drift entry has an owner decision:

```powershell
node scripts/migration-reconciliation-smoke.mjs --require-live-reconciliation
```

Neither command applies SQL, reads user rows, or reads credentials.
