# PDF50 Hosted History Reconciliation Evidence

Date: 2026-07-21

Final classification: `HOSTED_CLEAN_HISTORY_RECONCILED_THROUGH_0049`

Scope: hosted clean migration-history reconciliation only. No migration SQL was
executed. No schema, application data, Auth data, Storage metadata, Storage
objects, Supabase management API, Storage API, or Provider was touched.

## Authorization And Identity

| Check | Result |
|---|---|
| Read-only gate | exact |
| Write gate | exact |
| History-repair-only gate | exact |
| Environment scope | allowlisted hosted history repair variables only |
| Database identity | expected hosted clean target verified |
| Forbidden legacy target | not matched |
| Branch/source guard | requested branch, required source HEAD, canonical source unchanged |
| `.env.local` | not read |
| Provider calls | `0` |

## Pre-Repair Read-Only Proof

The preflight ran in `BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY`,
confirmed `transaction_read_only=on`, rolled back, and closed the connection.

| Check | Result |
|---|---:|
| Executable canonical migrations | 50 |
| Raw clean SQL files | 51 |
| Practice routing | canonical `0049` |
| PDF50 | canonical `0050` head |
| Active duplicate migration prefix | 0 |
| Excluded duplicate migration | `0032_google_account_links.sql` |
| History rows | 21 |
| Canonical represented rows | 19 (`0001`-`0019`) |
| Canonical missing rows | 30 (`0020`-`0049`) |
| Unmapped legacy rows | 2 preserved |
| Ambiguous history rows | 0 |
| `0050` history | absent |
| Canonical objects through `0048` | fully represented |
| Practice `0049` semantic match | 5/5 exact |
| PDF50 `0050` non-bucket objects | absent |
| PDF50 `0050` exact policies | absent |
| Compatible preexisting source bucket | present |

Pre-write fingerprints:

| Fingerprint | Value |
|---|---|
| Migration history | `796e1bd1ef982259c43a3bae8a36b774f75a39bca539bcc745ea3aa63ea5f5fb` |
| Application schema | `2a5552af07a5e61898f84e0e7d11b39bbf2ff04a8d9271c1de845fee282e40af` |
| Application row counts | `66108349e2c53a48047a59825a3214cd5bb41fad75c52e712f89eb3197312515` |
| Auth user count | `4` |
| Storage object count | `6` |
| Bucket metadata | `443b8e58f422c06da93f6efae9655c0139ad964a5741c7c76dd4cd37aa3e3f78` |
| Bucket policies | `1cc1a735057fa8138de5d3c3acbf0f1e26a3afa9291f971a83b533eb8c01ef12` |
| Preserved unmapped rows | `7af52a4ec3b111de2414f601c79c075194993f9bcb7da6dca6d508f526abc48d` |

## Controlled Write

The repair opened one explicit `REPEATABLE READ` write transaction, revalidated
the preconditions inside that transaction, inserted only allowlisted canonical
history records, rechecked fingerprints before commit, and committed.

| Check | Result |
|---|---:|
| Canonical inserted range | `0020`-`0049` |
| Inserted canonical records | 30 |
| `0050` inserted | 0 |
| Unmapped legacy rows inserted or edited | 0 |
| Excluded Google `0032` inserted | 0 |
| Legacy migration filenames inserted | 0 |
| Hosted schema writes | 0 |
| Hosted application-data writes | 0 |
| Hosted Auth writes | 0 |
| Hosted Storage writes | 0 |
| Hosted history writes | 30 |
| Transaction result | committed |

Before commit, the schema, application row-count, Auth count, Storage object
count, bucket metadata, bucket policy, and unmapped-row fingerprints matched
the pre-write fingerprints exactly.

## Post-Write Read-Only Proof

The post-write proof ran in a new `REPEATABLE READ, READ ONLY` transaction,
rolled back, and closed the connection.

| Check | Result |
|---|---:|
| Total history rows | 51 |
| Canonical records | 49 |
| Preserved unmapped legacy rows | 2 |
| Canonical represented head | `0049` |
| `0050` history | absent |
| Next pending canonical migration | `0050_pdf50_burst_upload_admission.sql` |
| Canonical pending migration count | 1 |
| Practice `0049` semantic match | 5/5 exact |
| PDF50 `0050` unapplied | yes |

Post-write fingerprints:

| Fingerprint | Value |
|---|---|
| Migration history | `17b73741361395dff7628b5b9c8e11324a9a680e9aa09c8d46644763ad28dc0a` |
| Application schema | `2a5552af07a5e61898f84e0e7d11b39bbf2ff04a8d9271c1de845fee282e40af` |
| Application row counts | `66108349e2c53a48047a59825a3214cd5bb41fad75c52e712f89eb3197312515` |
| Auth user count | `4` |
| Storage object count | `6` |
| Bucket metadata | `443b8e58f422c06da93f6efae9655c0139ad964a5741c7c76dd4cd37aa3e3f78` |
| Bucket policies | `1cc1a735057fa8138de5d3c3acbf0f1e26a3afa9291f971a83b533eb8c01ef12` |
| Preserved unmapped rows | `7af52a4ec3b111de2414f601c79c075194993f9bcb7da6dca6d508f526abc48d` |

## Idempotency

The exact repair operation was run a second time.

| Check | Result |
|---|---:|
| Additional rows inserted | 0 |
| Total history rows | 51 |
| Canonical represented head | `0049` |
| Next pending canonical migration | `0050_pdf50_burst_upload_admission.sql` |
| Canonical pending migration count | 1 |
| Schema fingerprint changed | no |
| Application-data fingerprint changed | no |
| Auth count changed | no |
| Storage object count changed | no |
| Bucket metadata/policy fingerprints changed | no |
| Transaction result | committed with zero inserts |

Hosted writes were limited to the migration-history table and only for the 30
canonical records in `0020` through `0049`.
