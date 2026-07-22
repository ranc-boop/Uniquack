# PDF50 Hosted Final Admission Evidence

Date: 2026-07-21

Final classification: `HOSTED_PDF50_RLS_STORAGE_1_10_50_VALIDATED`

No credential-bearing URL, project identifier, host, username, password, token, email, signed URL, Storage object path, raw database row, PDF content, or Provider data is recorded here.

## Authorization And Worker Safety

| Check | Result |
|---|---|
| Gates | exact |
| Forbidden gates | absent |
| Hosted identity | expected-clean-project-proven |
| Admin key format | NEW_SECRET |
| Anon key format | LEGACY_ANON_JWT |
| Bounded admin probe | pass |
| Provider capability | absent |
| dotenv/.env.local | not-loaded |
| Branch | `codex/pdf50-hosted-clean-maintenance` |
| Required evidence commits | 2 present |
| Guarded source | unchanged |
| Vercel config | absent |
| Active AI cron jobs | 0 |
| Worker route invoked | no |
| Worker library imported | no |
| Provider calls | 0 |

## Baseline And Restoration

| Check | Baseline | Final |
|---|---:|---:|
| Canonical history rows | 50 | 50 |
| Total history rows | 52 | 52 |
| Pending canonical migrations | 0 | 0 |
| Auth users | 4 | 4 |
| Storage objects | 6 | 6 |
| Application fingerprint restored | yes | yes |
| Bucket policy fingerprint restored | yes | yes |
| Synthetic residue | 0 | 0 |

## Matrices And Rehearsals

| Area | Classification |
|---|---|
| RLS role matrix | pass |
| Storage matrix | pass |
| 1-PDF rehearsal | pass |
| 10-PDF rehearsal | pass |
| 50-PDF rehearsal | pass |
| Multi-manager organization cap | pass |
| Race/recovery matrix | pass |

## Observed Limits

| Limit | Observation |
|---|---:|
| Upload concurrency max | 4 |
| User outstanding max | 5 |
| Organization outstanding max | 12 |
| Global active max | 2 |
| Organization active max | 1 |
| PDF active max | 1 |
| Worker invocation max source | 2 |

## Cleanup

| Resource | Result |
|---|---|
| storageObjects | attempted |
| databaseFixtures | pass |
| authUsers | pass |
| generatedFiles | pass |
| sessions | pass |
| processes | none |

Regression commands and push status are recorded in the final task report.
