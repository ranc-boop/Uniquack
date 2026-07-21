# PDF50 Local Clone History Reconciliation Evidence

Final classification: **LOCAL_CLONE_HISTORY_RECONCILED_THROUGH_0048**

Scope: local disposable Docker Supabase rehearsal only. Migration `0049` was
not applied, and no RLS/Storage admission tests were run.

## Localhost Boundary

| Check | Result |
|---|---|
| `PDF50_LOCAL_CLONE_REHEARSAL` gate | CONFIRMED |
| `PDF50_LOCALHOST_ONLY` gate | CONFIRMED |
| Sanitized execution environment used only approved local variables | PASS |
| Database hostname local and port `54322` | PASS |
| API hostname local and reachable | PASS |
| Required local Supabase containers running | PASS |
| Remote database calls | 0 |
| Current clean DB writes | 0 |
| Legacy DB writes | 0 |
| Provider calls | 0 |

No `.env.local`, Supabase link, `--linked`, hosted project reference, Provider
API, remote Storage, real users, emails, production rows, Storage files, source
PDF content, or credential-bearing URL was used or recorded.

## Canonical 0048 Baseline

Canonical source came only from `docs/security/live-schema-manifest.json`
`activeApplyPlan`.

| Check | Result |
|---|---|
| Applied canonical migrations | `0001` through `0048` |
| Applied migration count | 48 |
| Executable `0032` | `0032_teacher_feedback_notes.sql` |
| Excluded `0032` | `0032_google_account_links.sql` |
| Applied `0049` | No |
| Legacy `supabase/migrations` input | No |

Synthetic mixed-history baseline:

| Check | Result |
|---|---:|
| Total history rows | 21 |
| Canonical legacy aliases | 19 |
| Canonical exact matches for `0020`-`0048` | 0 |
| Unmapped legacy evidence rows | 2 |
| Canonical objects through `0048` represented | PASS |
| `0049` history | ABSENT |
| `0049` non-bucket objects present | 0 |
| Hardened `0049` exact policies present | 0 |

The two unmapped rows were preserved as unmapped evidence:

- `fix_private_schema_function_grants_for_rls`
- `fix_taxonomy_closure_rebuild_safe_delete`

Bucket baseline:

| Check | Result |
|---|---|
| `ai-import-sources` bucket exists | PASS |
| Bucket private | PASS |
| PDF-only MIME contract | PASS |
| 50 MB size contract | PASS |
| Legacy admin policies present | 3 |
| Storage object rows | 0 |

Baseline classification: **LOCAL_CLONE_BASELINE_VALIDATED**

## Repair Result

Script: `scripts/pdf50-clone-history-repair.mjs`

The script verified the required object fingerprint for every canonical
migration through `0048`, opened one explicit transaction, inserted only missing
canonical history rows for `0020` through `0048`, and committed only after
post-repair checks passed.

| Check | Result |
|---|---:|
| Records inserted on first run | 29 |
| Inserted canonical range | `0020`-`0048` |
| Existing `0001`-`0019` rows preserved | PASS |
| Unmapped rows preserved | PASS |
| `0049` history created | No |
| Migration SQL executed by repair | No |
| Schema fingerprint unchanged | PASS |
| Storage metadata fingerprint unchanged | PASS |
| Synthetic row counts unchanged | PASS |

Final history model:

| Check | Result |
|---|---:|
| Total history rows | 50 |
| Canonical legacy aliases | 19 |
| Canonical exact matches | 29 |
| Unmapped rows | 2 |
| Canonical head | `0048` |
| Next pending canonical migration | `0049_pdf50_burst_upload_admission.sql` |

Sanitized fingerprints:

| Fingerprint | Value |
|---|---|
| Schema/catalog fingerprint | `8b1c7d96b4019e743d50b13e175476997c65726c8ad20fd3e33bba5d34826e98` |
| Storage metadata fingerprint | `9cf9cc75c169b2daae04e4ad0229bc9b4688933af01eb27d5c9452820eaef227` |

## Idempotency

The repair script was run a second time.

| Check | Result |
|---|---:|
| Additional rows inserted | 0 |
| Error | No |
| Schema fingerprint changed | No |
| Storage metadata changed | No |
| Synthetic row counts changed | No |
| Next pending canonical migration | `0049_pdf50_burst_upload_admission.sql` |

Provider calls remained zero for the full rehearsal.
