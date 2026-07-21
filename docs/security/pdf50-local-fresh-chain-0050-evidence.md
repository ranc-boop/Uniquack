# PDF50 Local Fresh-Chain 0050 Evidence

Date: 2026-07-21

Classification: `PDF50_0050_FRESH_CHAIN_VALIDATED`

This is localhost-only evidence from `scripts/pdf50-local-0050-release-gate.mjs`
and its fresh-chain delegate `scripts/pdf50-local-fresh-chain-0050-gate.mjs`.
No `.env.local`, hosted Supabase project, Provider API, real user data, signed
URL, source PDF content, credential-bearing URL, or object path is recorded here.

## Localhost Boundary

- Required gates: `PDF50_LOCAL_CLONE_REHEARSAL=CONFIRMED`, `PDF50_LOCALHOST_ONLY=CONFIRMED`
- Only allowed local variables used: `PDF50_LOCAL_DATABASE_URL`, `PDF50_LOCAL_API_URL`, `PDF50_LOCAL_SUPABASE_DIR`
- Database/API host proof: localhost-only; database port `54322`
- Local Supabase Docker containers: running
- Remote database/API calls: `0`
- Provider calls: `0`
- Local reset guard printed before reset: `LOCALHOST_TARGET_CONFIRMED`

## Empty Target

After resetting only the local Supabase database and before applying migrations:

- EduStruct public tables: `0`
- EduStruct public/private routines: `0`
- Private application tables: `0`
- Canonical migration history rows: `0`
- Auth users: `0`
- Storage objects: `0`
- `ai-import-sources` bucket: absent

## Fresh Chain Apply

- Branch: `codex/pdf50-burst-clean-db-rehearsal`
- Source HEAD at gate start: `093dbc31ceb8dfcf79efa82205f79ae9a8f01144`
- Merge commit present: `093dbc3`
- Executable canonical migrations: `50`
- First applied migration: `0001_foundations_identity_organizations.sql`
- Canonical tail: `0048_practice_course_framework_evidence_isolation.sql` -> `0049_practice_agent_provider_routing.sql` -> `0050_pdf50_burst_upload_admission.sql`
- Last applied migration: `0050_pdf50_burst_upload_admission.sql`
- Executable `0032`: `0032_teacher_feedback_notes.sql`
- Excluded `0032`: `0032_google_account_links.sql`
- No `0051` migration exists
- Pending canonical migrations after apply: `0`

## History And Idempotency

- Total canonical history rows: `50`
- Canonical head: `0050`
- Practice routing `0049`: recorded exactly once
- PDF50 `0050`: recorded exactly once
- Duplicate canonical prefix count: `0`
- Unexpected canonical rows: `0`
- Second runner pass: recognized already applied
- Second runner SQL executed: `0`
- Extra history rows on second pass: `0`
- Schema changed on second pass: no
- Bucket changed on second pass: no

## 0050 Bucket Create Path

- `ai-import-sources` before `0050`: absent
- `0050` behavior: created private source bucket
- Privacy: private
- MIME contract: PDF-only
- Size limit: `50 MB`
- Canonical exact-path policies: `3`
- Legacy `ai_import_sources_admin_*` policies: `0`
- Unknown bucket-targeting policies: `0`
- Public/anonymous grant: absent
- Permanent public source URL: denied in focused runtime proof

## PDF50 Schema Contract

- Burst tables: `2`
- PDF50 columns: `44`
- PDF50 functions: `13`
- PDF50 triggers: `6`
- PDF50 indexes: `4`
- RLS-enabled PDF50 tables: `2`
- Relevant policies: `5`
- Idempotency constraints: present
- Source/import/job linkage: present
- Admission/pump functions: present
- Auto-publish trigger: absent
- Assignment creation trigger: absent
- Partial PDF50 state: absent

## Focused Admission

One synthetic PDF was reserved, uploaded to the exact server-reserved path,
finalized, linked to one source asset and one initial durable AI job, and then
cleaned up.

- Owner reserve/upload/finalize: allowed
- Editor reserve/finalize: allowed
- Viewer/student/unrelated/anonymous access: denied
- Arbitrary-path upload: denied
- Duplicate finalize: idempotent
- Review Draft auto-publish count: `0`
- Assignment creation count: `0`
- AI worker execution: `0`
- Provider calls: `0`

## Cleanup

- Synthetic database fixture cleanup: pass
- Synthetic Auth cleanup: pass
- Synthetic Storage-object cleanup: pass
- Temporary file cleanup: pass
- Temporary process cleanup: pass
- `ai-import-sources` bucket preserved: pass
- Final `ai-import-sources` object count: `0`
