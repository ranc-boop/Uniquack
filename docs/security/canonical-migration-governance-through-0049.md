# Canonical Migration Governance Through 0049

Result: **MIGRATION_GOVERNANCE_RECONCILED**

This is source-only governance evidence. No environment file was read, no
database was contacted, no migration was applied, and no migration SQL file was
changed.

## Canonical Sources

- SQL inventory: `supabase/clean-migrations`
- release manifest and reconciliation register:
  `docs/security/live-schema-manifest.json`
- manifest loader: `scripts/lib/canonical-migration-plan.mjs`
- governance checks: `scripts/canonical-migration-governance-smoke.mjs` and
  `scripts/migration-reconciliation-smoke.mjs`

The directory contains 50 SQL files. The manifest-driven executable chain
contains 49 migrations in positions 1 through 49. A directory glob is never an
executable plan.

## Duplicate 0032 Decision

| File | Classification | Executable order | Decision |
|---|---|---:|---|
| `0032_teacher_feedback_notes.sql` | `CANONICAL_EXECUTABLE` | 32 | The only executable canonical 0032 |
| `0032_google_account_links.sql` | `EXCLUDED_NONEXECUTABLE` | None | Preserved but blocked pending approved Google identity/OIDC design |

The shared loader detects duplicate raw prefixes and requires exactly one
executable file at each duplicated position. Every other file with that prefix
must be explicitly excluded. Google-specific apply/RLS harnesses now check the
manifest before starting their embedded database and fail closed while the
Google migration remains blocked.

## Registrations 0044-0049

| Order | File | Classification | Registered status |
|---:|---|---|---|
| 44 | `0044_classroom_creation_rpc_reconciliation.sql` | `CANONICAL_EXECUTABLE` | Existing applied evidence retained |
| 45 | `0045_question_read_authorization_helper.sql` | `CANONICAL_EXECUTABLE` | Existing applied evidence retained |
| 46 | `0046_question_assets_bucket_private.sql` | `CANONICAL_EXECUTABLE` | Existing applied evidence retained |
| 47 | `0047_practice_self_study_evidence_isolation.sql` | `CANONICAL_EXECUTABLE` | Existing applied evidence retained |
| 48 | `0048_practice_course_framework_evidence_isolation.sql` | `CANONICAL_EXECUTABLE` | Existing applied evidence retained |
| 49 | `0049_pdf50_burst_upload_admission.sql` | `CANONICAL_EXECUTABLE` | Unapplied; disposable rehearsal required |

`0049_pdf50_burst_upload_admission.sql` is the canonical source head. Its
registration does not claim that it has been applied to any database. Before
its first application, it may create an absent private source bucket or adopt
only a compatible preexisting private PDF-only bucket; incompatible bucket
state fails closed. The migration becomes frozen after its first successful
application.

## Execution Controls

The active chain is read from `activeApplyPlan`, validated against the complete
directory inventory, and checked for contiguous sequence positions. Each raw
file must be exactly one of executable or explicitly excluded. The loader
rejects missing files, unregistered files, duplicate active filenames,
ambiguous duplicate prefixes, incorrect ordering, and a head mismatch.

Full-chain baseline tooling consumes this loader. Google-specific apply tooling
also consumes it and cannot execute the excluded migration. Legacy
`supabase/migrations` is recorded as noncanonical and cannot contribute a file
to `activeApplyPlan`.

## Remaining Gate

Migration governance is reconciled, but PDF50 live readiness is not claimed.
Migration 0049 still requires the separately approved disposable fresh-chain,
0048-to-0049 upgrade, RLS, Storage, admission, race, recovery, and exact-cleanup
rehearsal.
