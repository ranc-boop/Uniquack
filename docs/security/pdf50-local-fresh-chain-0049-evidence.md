# PDF50 Local Fresh-Chain 0049 Evidence

> **PRE-SEQUENCE-RECONCILIATION EVIDENCE.** This is preserved evidence for the
> prior PDF50 `0049` candidate. Main subsequently retained Practice routing as
> canonical `0049`, and PDF50 moved to `0050`. This run is superseded by
> `docs/security/pdf50-local-fresh-chain-0050-evidence.md`.

Date: 2026-07-21

Classification: `LOCAL_FRESH_CHAIN_0001_0049_VALIDATED`

## Localhost Boundary

- Local gates: `PDF50_LOCAL_CLONE_REHEARSAL=CONFIRMED`, `PDF50_LOCALHOST_ONLY=CONFIRMED`
- Database host proof: localhost-only, port `54322`
- API host proof: localhost-only
- Local Supabase containers: running
- Local target reset: disposable localhost database only
- Remote database calls: `0`
- Current clean DB writes: `0`
- Legacy DB writes: `0`
- Provider calls: `0`

No credential-bearing URL, API key, Storage key, object path, user identity, signed URL, or PDF content is recorded here.

## Empty Target

After the local reset and before applying canonical migrations:

- EduStruct public tables: `0`
- EduStruct public/private routines: `0`
- Private application tables: `0`
- Canonical migration history rows: `0`
- Auth users: `0`
- Storage objects: `0`
- `ai-import-sources` bucket: absent

## Canonical Fresh Apply

- Branch: `codex/pdf50-burst-clean-db-rehearsal`
- Source HEAD at gate start: `3db26132a231913212b41d54a4058583fa907689`
- Canonical executable migrations applied: `49`
- First applied migration: `0001_foundations_identity_organizations.sql`
- Last applied migration: `0049_pdf50_burst_upload_admission.sql`
- Executable 0032: `0032_teacher_feedback_notes.sql`
- Excluded 0032: `0032_google_account_links.sql`
- Legacy `supabase/migrations` input: `0`
- Apply failures: `0`

## Canonical History

- Total history rows: `49`
- Canonical rows: `49`
- Canonical head: `0049`
- 0049 history rows: `1`
- Duplicate canonical rows: `0`
- Missing canonical rows: `0`
- Unexpected canonical rows: `0`
- Unmapped synthetic legacy rows: `0`
- Pending canonical migrations: `0`
- Second runner pass: recognized already applied; migration SQL executed `0`; extra history rows `0`

## 0049 Bucket Creation

- `ai-import-sources` before 0049: absent
- 0049 bucket path: created, not adopted
- Bucket privacy: private
- Allowed MIME type: PDF-only
- Size cap: `50 MB`
- Canonical exact-path policies: `3`
- Legacy `ai_import_sources_admin_*` policies: `0`
- Unknown bucket-targeting policies: `0`
- Anonymous/public grant: absent
- Permanent public source URL: denied in focused security proof

## Final 0049 Schema

- Burst tables: `2`
- 0049 columns: `44`
- 0049 functions: `13`
- 0049 triggers: `6`
- 0049 indexes: `4`
- RLS-enabled 0049 tables: `2`
- Relevant 0049 policies: `5`
- Required uniqueness/idempotency constraints: present
- Source/import/job linkage: present
- Admission/pump functions: present
- Auto-publish trigger: absent
- Assignment-creation trigger: absent
- Partial migration state: absent

## Focused Security And Admission

- Owner reserve: allowed
- Editor reserve: allowed
- Viewer reserve/read/upload/finalize: denied
- Student reserve/read/upload/finalize: denied
- Unrelated user reserve/read/upload/finalize: denied
- Anonymous read/upload: denied
- Exact reserved-path upload: allowed
- Arbitrary path upload: denied
- Finalize authorization recheck: enforced

One-PDF admission:

- Bursts: `1`
- Items: `1`
- Private Storage objects before cleanup: `1`
- Source linkages: `1`
- Initial AI job linkages: `1`
- Duplicate finalize: idempotent
- Review Draft auto-publish count: `0`
- Assignment creation count: `0`
- AI worker executions: `0`
- Provider calls: `0`

## Cleanup

- Synthetic database fixture cleanup: pass
- Synthetic Auth cleanup: pass
- Synthetic Storage-object cleanup: pass
- Temporary file cleanup: pass
- Temporary process cleanup: pass
- `ai-import-sources` bucket preserved: pass
- Final `ai-import-sources` object count: `0`

## Regression

Regression results after the fresh-chain gate:

- `node scripts/pdf50-local-0049-upgrade-rehearsal.mjs`: pass against fresh post-0049 history
- `node scripts/pdf50-0049-bucket-adoption-smoke.mjs`: pass
- `node scripts/pdf50-burst-admission-smoke.mjs`: pass
- `node scripts/pdf50-direct-upload-contract-smoke.mjs`: pass
- `node scripts/pdf50-burst-security-smoke.mjs`: pass
- `node scripts/pdf50-burst-load-smoke.mjs`: pass
- `node scripts/canonical-migration-governance-smoke.mjs`: pass
- `node scripts/migration-reconciliation-smoke.mjs`: pass
- `node scripts/security-smoke.mjs`: pass
- `npm.cmd run lint`: pass
- `npm.cmd run build`: pass
- `git diff --check`: pass

The fresh-chain gate and regression suite completed without reading local secret files, accessing hosted Supabase, or invoking a Provider.
