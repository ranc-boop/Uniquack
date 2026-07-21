# PDF50 Local 0050 Bucket Adoption Evidence

Date: 2026-07-21

Classification: `PDF50_0050_PREEXISTING_BUCKET_UPGRADE_VALIDATED`

This run used only synthetic localhost data and the local Docker Supabase stack.
No `.env.local`, hosted Supabase project, Provider API, production row, source
PDF content, signed URL, credential-bearing URL, or Storage object path is
recorded here.

## Localhost Boundary

- Required gates: `PDF50_LOCAL_CLONE_REHEARSAL=CONFIRMED`, `PDF50_LOCALHOST_ONLY=CONFIRMED`
- Only allowed local variables used: `PDF50_LOCAL_DATABASE_URL`, `PDF50_LOCAL_API_URL`, `PDF50_LOCAL_SUPABASE_DIR`
- Database/API host proof: localhost-only; database port `54322`
- Local reset guard printed before each reset: `LOCALHOST_TARGET_CONFIRMED`
- Remote database/API calls: `0`
- Provider calls: `0`

## Compatible Preexisting Shape

The gate reset the local database, applied canonical migrations through
Practice routing `0049`, and created only this synthetic preexisting bucket
shape before applying PDF50 `0050`:

- Bucket: `ai-import-sources`
- Privacy: private
- MIME contract: PDF-only
- Size cap: `50 MB`
- Legacy allowlisted policies:
  - `ai_import_sources_admin_upload`
  - `ai_import_sources_admin_read`
  - `ai_import_sources_admin_delete`
- Storage object count: `0`
- Real user or production content: none

## Fail-Closed Probe

Before the successful adoption run, the gate built a separate local
Practice-`0049` baseline with one extra unknown `ai-import-sources` policy and
attempted PDF50 `0050`.

- Unknown policy failed closed: yes
- Error class: bounded PostgreSQL exception `P0001`
- Transaction rolled back: yes
- `0050` history after rollback: absent
- Bucket metadata after rollback: unchanged
- Provider calls: `0`

## Adoption Apply

- Applied canonical migrations through `0049`: `49`
- Applied `0050_pdf50_burst_upload_admission.sql`: exactly once
- `0050` history rows: `1`
- Final canonical history rows: `50`
- Final canonical head: `0050`
- Pending canonical migrations: `0`
- Duplicate canonical prefix count: `0`

Bucket adoption results:

- Existing bucket adopted, not deleted or recreated
- Bucket identity hash unchanged
- Object count preserved: `0`
- Bucket remains private
- PDF-only MIME contract retained
- Size cap retained at `50 MB`
- Only the three allowlisted legacy policies removed
- Canonical exact-path policies installed exactly once: `3`
- Unknown bucket-targeting policies after apply: `0`
- Public/anonymous grant: absent

## Practice 0049 And PDF50 0050 Objects

Practice `0049`:

- Practice routing constraints accept `practice_generation`
- Practice routing worker/gateway functions accept `practice_generation`
- Provider calls: `0`

PDF50 `0050`:

- Burst tables: `2`
- PDF50 columns: `44`
- PDF50 functions: `13`
- PDF50 triggers: `6`
- PDF50 indexes: `4`
- RLS-enabled PDF50 tables: `2`
- Relevant policies: `5`

## Post-Adoption Runtime Matrix

After adoption, the local upgrade rehearsal validated the final state:

- Bank owner/editor: reserve, read, upload, finalize allowed
- Viewer/student/unrelated/anonymous: denied
- Organization membership alone: denied
- Inactive Bank membership: denied
- Service role: bounded admission/pump operations allowed
- Exact server-reserved Storage path: allowed
- Arbitrary-path upload: denied
- Permanent public source URL: denied
- Authorization rechecked at finalize: yes
- No auto-publish
- No Assignment creation

## 1 / 10 / 50 Admission

- 1-PDF rehearsal: `1` durable item, `1` source linkage, `1` initial AI job
- 10-PDF rehearsal: `10` durable items, `10` source linkages, `10` initial AI jobs
- 10-PDF partial-failure rehearsal: `1` failed item, siblings preserved
- 50-PDF rehearsal: `50` durable items, `50` source linkages, `50` initial AI jobs
- Maximum browser upload concurrency observed: `4`
- Maximum user outstanding observed: `5`
- Maximum organization outstanding observed: `5`
- Global active observed: `0`, retained limit `3`
- Organization active observed: `0`, retained limit `1`
- PDF active observed: `0`, retained limit `1`
- Worker invocation maximum: retained at `2`; AI worker not executed
- Duplicate reservation/finalize: idempotent
- No duplicate jobs
- No lost items
- Provider calls: `0`

## Race, Recovery, And Cleanup

- Duplicate burst reservation: one logical burst
- Concurrent same-key reservation: one logical burst
- Five simultaneous finalize calls: safe
- Concurrent admission pumps: bounded
- Capacity release races: bounded and eventually linked all valid items
- Cancel/finalize race: safe
- Membership removal before finalize: denied
- Retry after upload-before-finalize: safe
- Retry after finalize-before-admission: safe
- Response-loss-after-job-linkage retry: safe

Cleanup classifications:

- Synthetic database fixture cleanup: pass
- Synthetic Auth cleanup: pass
- Synthetic Storage-object cleanup: pass
- Temporary file cleanup: pass
- Temporary process cleanup: pass
- `ai-import-sources` bucket preserved: pass
- Final `ai-import-sources` object count: `0`
