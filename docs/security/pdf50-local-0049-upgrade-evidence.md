# PDF50 Local 0049 Upgrade Evidence

Date: 2026-07-21

Classification: `LOCAL_0049_UPGRADE_RLS_STORAGE_ADMISSION_VALIDATED`

## Localhost Boundary

- Local gates: `PDF50_LOCAL_CLONE_REHEARSAL=CONFIRMED`, `PDF50_LOCALHOST_ONLY=CONFIRMED`
- Database host proof: localhost-only, port `54322`
- API host proof: localhost-only
- Local Supabase containers: running
- Remote database calls: `0`
- Current clean DB writes: `0`
- Legacy DB writes: `0`
- Provider calls: `0`

No local database URL, API key, Storage key, object path, user identity, signed URL, or PDF content is recorded here.

## Canonical Apply

- Branch: `codex/pdf50-burst-clean-db-rehearsal`
- Source HEAD at apply: `0856a730505a0974b6fe1168abb42b07b683b89a`
- Required ancestors present: `d4841a1157debed43318c7a66c96edd602cb3e43`, `0856a730505a0974b6fe1168abb42b07b683b89a`
- Canonical executable migrations: `49`
- Executable 0032: `0032_teacher_feedback_notes.sql`
- Excluded 0032: `0032_google_account_links.sql`
- Pre-apply canonical head: `0048`
- Pre-apply history model: `48` canonical rows plus `2` preserved unmapped rows
- Pre-apply pending canonical migration: `0049_pdf50_burst_upload_admission.sql`
- 0049 application: exactly one local transaction succeeded and registered 0049 once
- Subsequent validation reruns detected 0049 as already applied and did not re-execute the migration SQL
- Final canonical head: `0049`
- Final history model: `49` canonical rows plus `2` preserved unmapped rows
- Pending canonical migrations after apply: `0`
- Second canonical runner pass: recognized 0049 as already applied; no SQL re-executed; no extra history row

## Schema Contract

Final bounded 0049 object fingerprint:

- Burst tables: `2`
- 0049 columns: `44`
- 0049 functions validated: `13`
- 0049 triggers: `6`
- 0049 indexes: `4`
- RLS-enabled 0049 tables: `2`
- Relevant 0049 policies: `5`
- Required uniqueness/idempotency constraints: present
- Partial 0049 state: absent
- Publication or Assignment creation trigger: absent

The hardened 0049 source also isolates pre-existing `question_assets_*` Storage policies behind private security-definer helpers so unrelated bucket policies do not require Bank table grants during `ai-import-sources` operations. The local clone was aligned to those final function/policy definitions without adding a second 0049 history row.

## Bucket Adoption

- Bucket identity: unchanged
- Bucket privacy: private
- Allowed MIME type: PDF-only
- Size cap: `50 MB`
- Existing object count preserved through apply: `0`
- Final object count after cleanup: `0`
- Allowlisted legacy admin policies removed: `3`
- Canonical `ai-import-sources` policies present: `3`
- Unknown bucket-targeting policies: `0`
- Anonymous/public grant: absent

## Final State

- Canonical history hash: recorded in local script output only
- Schema fingerprint: stable after successful validation and second runner pass
- Bucket fingerprint: stable after successful validation and second runner pass
- Provider calls: `0`

## Validation

- Dedicated localhost 0049 rehearsal script: pass
- PDF50 source/security/load smokes: pass
- Canonical migration governance and reconciliation smokes: pass
- Durable AI queue and scheduler simulation smokes: pass
- Security smoke: pass
- Applicable route/RLS/source checks: pass in localhost-safe/source-only modes where live routes would require `.env.local`
- `npm.cmd run lint`: pass
- `npm.cmd run build`: pass
- `npm.cmd run perf:budget`: pass
- `git diff --check`: pass

For npm validation, `.env.local` was temporarily hidden without reading its contents and restored afterward.
