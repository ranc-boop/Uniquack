# PDF50 Hosted 0050 Apply Evidence

Date: 2026-07-21

Final classification:
`HOSTED_PDF50_0050_APPLIED_AND_SCHEMA_VALIDATED`

Scope: hosted clean PDF50 migration `0050` only. No hosted fixtures, users,
organizations, Banks, bursts, jobs, PDFs, Provider calls, Supabase management
API calls, deployments, or admission matrix runs were created or executed.

No credential-bearing URL, project identifier, host, username, password, token,
database row, email, Storage object path, signed URL, or source body is recorded
in this evidence.

## Authorization And Identity

| Check | Result |
|---|---|
| Read-only gate | exact |
| Write gate | exact |
| PDF50 0050 apply gate | exact, exactly-once authorization |
| History-repair-only gate | absent |
| Environment scope | allowlisted hosted 0050 variables only |
| Database identity | expected hosted clean target verified through Session Pooler username |
| Forbidden legacy target | not matched |
| Branch | `codex/pdf50-hosted-clean-maintenance` |
| Source HEAD | `24e15c17dd03c00dc1801f461982172196237ef4` |
| Source governance | canonical migration SQL, live manifest, and manifest loader unchanged |
| `.env.local` | not read |
| Provider calls | `0` |

## Pre-Apply Read-Only Proof

The preflight ran in `BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY`,
confirmed `transaction_read_only=on`, rolled back, and closed the connection.

| Check | Result |
|---|---:|
| Executable canonical migrations | 50 |
| Raw clean SQL files | 51 |
| Practice routing | canonical `0049` |
| PDF50 | canonical `0050` head |
| Excluded duplicate migration | `0032_google_account_links.sql` |
| Total migration-history rows | 51 |
| Canonical migration-history rows | 49 |
| Canonical represented range | `0001` through `0049` |
| Unmapped legacy rows | 2 preserved |
| `0050` history | absent |
| Pending canonical migrations | 1 |
| Next pending canonical migration | `0050_pdf50_burst_upload_admission.sql` |
| Practice `0049` semantic match | 5/5 exact |
| PDF50 burst tables | 0 |
| PDF50 columns | 0 |
| PDF50 functions | 0 |
| PDF50 triggers | 0 |
| PDF50 indexes | 0 |
| PDF50 RLS tables | 0 |
| Source bucket exists | yes |
| Source bucket private | yes |
| Source bucket MIME contract | PDF-only |
| Source bucket size cap | 50 MB |
| Source bucket objects | 6 |
| Legacy source bucket policies | 3 present |
| Canonical source bucket policies | 0 present |
| Unknown source bucket-targeting policies | 0 |
| Anonymous/public source grants | 0 |
| Auth users | 4 |
| Total Storage objects | 6 |

Pre-apply fingerprints:

| Fingerprint | Value |
|---|---|
| Migration history | `17b73741361395dff7628b5b9c8e11324a9a680e9aa09c8d46644763ad28dc0a` |
| Application schema | `2a5552af07a5e61898f84e0e7d11b39bbf2ff04a8d9271c1de845fee282e40af` |
| Application data row counts | `66108349e2c53a48047a59825a3214cd5bb41fad75c52e712f89eb3197312515` |
| Storage object rows | `7bd4b388104e509c73ba6a86883528c427834fe4d205b8d27e2c947aa83e9d46` |
| Source bucket metadata | `db7801e1ec9e2629dad3c7453590616f311a256735275d6be3fa38482f7567bb` |
| Source bucket identity | `749aada7fd2e66498097383ab0cc343cf7c935b7399434ac0b379685dc596aeb` |
| Source bucket policies | `cea5503a3caf9139e441371f36fb4bd2d25a0647b21285f2c296a3741c1af81e` |
| Preserved unmapped rows | `7af52a4ec3b111de2414f601c79c075194993f9bcb7da6dca6d508f526abc48d` |

## Controlled Apply

The runner opened one explicit hosted write transaction, revalidated every
precondition inside that transaction, executed only
`0050_pdf50_burst_upload_admission.sql`, inserted the canonical `0050` history
record only after the migration SQL completed, validated the post-0050 contract,
and committed.

| Check | Result |
|---|---:|
| Migration SQL files executed | 1 |
| Executed migration | `0050_pdf50_burst_upload_admission.sql` |
| History rows inserted | 1 |
| Total history rows before commit | 52 |
| Canonical history rows before commit | 50 |
| Pending canonical migrations before commit | 0 |
| Unmapped legacy rows before commit | 2 preserved |
| Transaction result | committed |
| Connection closed | pass |

Hosted writes were limited to migration `0050` effects and one canonical
migration-history record. Auth, Storage objects, and Provider systems were not
called or mutated.

## Post-Apply Schema Contract

| PDF50 contract | Result |
|---|---:|
| Burst tables | 2 |
| PDF50 columns | 44 |
| Functions | 13 |
| Triggers | 6 |
| Indexes | 4 |
| RLS-enabled PDF50 tables | 2 |
| Relevant canonical policies | 5 |
| Expected unique/idempotency constraints | pass |
| Source/import/job linkage | pass |
| Admission and pump functions | pass |
| Auto-publish behavior | absent |
| Assignment-creation behavior | absent |
| Burst rows created | 0 |
| Burst item rows created | 0 |

## Bucket Adoption

| Check | Result |
|---|---:|
| Bucket identity unchanged | yes |
| Bucket private | yes |
| Bucket MIME contract | PDF-only |
| Bucket size cap | 50 MB |
| Source bucket object count before | 6 |
| Source bucket object count after | 6 |
| Total Storage object count before | 6 |
| Total Storage object count after | 6 |
| Legacy source admin policies before | 3 |
| Legacy source admin policies after | 0 |
| Canonical exact-path source policies before | 0 |
| Canonical exact-path source policies after | 3 |
| Unknown source bucket-targeting policies | 0 |
| Anonymous/public source grants | 0 |

## Final Read-Only Proof

The post-apply proof ran in a new
`BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY`, confirmed the
post-0050 state, rolled back, and closed the connection.

| Check | Result |
|---|---:|
| Canonical history rows | 50 |
| Total history rows | 52 |
| `0050` history rows | 1 |
| Pending canonical migrations | 0 |
| Unmapped legacy rows | 2 preserved |
| Practice `0049` semantic match | 5/5 exact |
| Auth users | 4 |
| Total Storage objects | 6 |

Post-apply fingerprints:

| Fingerprint | Value |
|---|---|
| Migration history | `687eb4d86de286e955b0eb8127da43a8e32c71f6a76d06e0cb4e95b3c3339d13` |
| Application schema | `367ff0db5449925637c90887502c95b1b5a70ae6c7214cd56fc87953ef980f77` |
| Application data row counts | `66108349e2c53a48047a59825a3214cd5bb41fad75c52e712f89eb3197312515` |
| Storage object rows | `7bd4b388104e509c73ba6a86883528c427834fe4d205b8d27e2c947aa83e9d46` |
| Source bucket metadata | `db7801e1ec9e2629dad3c7453590616f311a256735275d6be3fa38482f7567bb` |
| Source bucket identity | `749aada7fd2e66498097383ab0cc343cf7c935b7399434ac0b379685dc596aeb` |
| Source bucket policies | `6e55d6be9ba9981acaf499f8aa357d670a975e13c6379356b9bd5717dc590d4a` |
| Preserved unmapped rows | `7af52a4ec3b111de2414f601c79c075194993f9bcb7da6dca6d508f526abc48d` |

Preservation comparison:

| Comparison | Result |
|---|---|
| Application data row-count fingerprint | unchanged |
| Auth user count | unchanged |
| Storage object count | unchanged |
| Storage object rows | unchanged |
| Source bucket identity | unchanged |
| Unmapped legacy rows | unchanged |
| Schema fingerprint | changed only by validated 0050 schema/policy objects |
| Source bucket policy fingerprint | changed by expected legacy-to-canonical transition |

## Second Runner No-Op

The canonical hosted 0050 runner was executed a second time in second-run mode.

| Check | Result |
|---|---:|
| `0050` recognized already applied | yes |
| Migration SQL files executed | 0 |
| History rows inserted | 0 |
| Total history rows | 52 |
| Canonical history rows | 50 |
| Pending canonical migrations | 0 |
| Schema fingerprint changed | no |
| Application-data fingerprint changed | no |
| Bucket metadata fingerprint changed | no |
| Bucket policy fingerprint changed | no |
| Auth user count changed | no |
| Storage object count changed | no |
| Provider calls | 0 |

Second-run fingerprints matched the post-apply fingerprints exactly for
migration history, schema, application data row counts, Storage object rows,
bucket metadata, bucket identity, bucket policies, and unmapped rows.

## Local Validation

All required local checks passed after the hosted apply and no-op proof:

```text
node --check scripts/pdf50-hosted-0050-apply.mjs
node scripts/canonical-migration-governance-smoke.mjs
node scripts/migration-reconciliation-smoke.mjs
node scripts/pdf50-0050-bucket-adoption-smoke.mjs
node scripts/pdf50-burst-admission-smoke.mjs
node scripts/pdf50-direct-upload-contract-smoke.mjs
node scripts/pdf50-burst-security-smoke.mjs
node scripts/security-smoke.mjs
git diff --check
```

No hosted fixtures were created and no hosted admission matrix was run.
