# PDF50 Local 0049 To 0050 Upgrade Evidence

Date: 2026-07-21

Classification: `PDF50_0050_SEQUENTIAL_UPGRADE_VALIDATED`

This run used only the local Docker Supabase stack. No `.env.local`, hosted
Supabase project, Provider API, production row, source PDF content, signed URL,
credential-bearing URL, or Storage object path is recorded here.

## Localhost Boundary

- Required gates: `PDF50_LOCAL_CLONE_REHEARSAL=CONFIRMED`, `PDF50_LOCALHOST_ONLY=CONFIRMED`
- Only allowed local variables used: `PDF50_LOCAL_DATABASE_URL`, `PDF50_LOCAL_API_URL`, `PDF50_LOCAL_SUPABASE_DIR`
- Database/API host proof: localhost-only; database port `54322`
- Local reset guard printed before reset: `LOCALHOST_TARGET_CONFIRMED`
- Remote database/API calls: `0`
- Provider calls: `0`

## 0048 Mixed-History Baseline

After a local reset, the gate applied canonical migrations only through `0048`
and rewrote only the local history table to reproduce the audited mixed-history
shape:

- Schema objects through `0048`: fully represented
- History rows before repair: `21`
- Canonical legacy aliases for `0001`-`0019`: `19`
- Canonical history rows for `0020`-`0048`: absent
- Unmapped legacy rows preserved: `2`
- Unmapped rows:
  - `fix_private_schema_function_grants_for_rls`
  - `fix_taxonomy_closure_rebuild_safe_delete`
- Pending canonical migrations before repair: `0020`-`0050`
- `ai-import-sources` bucket before PDF50: absent in this canonical create-path baseline

## Gated History Reconciliation

Script: `scripts/pdf50-clone-history-repair.mjs`

- Baseline classification: `LOCAL_CLONE_BASELINE_VALIDATED`
- First repair inserted canonical history rows `0020`-`0048`: `29`
- Migration SQL executed by repair: `0`
- Schema fingerprint changed: no
- Storage metadata fingerprint changed: no
- Synthetic row counts changed: no
- Both unmapped legacy rows preserved: yes
- Second repair inserted additional rows: `0`
- Next pending migration after repair: `0049_practice_agent_provider_routing.sql`

## Sequential Apply

Script: `scripts/pdf50-local-0050-upgrade-rehearsal.mjs`

- Pre-apply canonical head: `0048`
- Pending canonical migrations: `0049`, `0050`
- `0049_practice_agent_provider_routing.sql`: applied exactly once
- `0050_pdf50_burst_upload_admission.sql`: applied exactly once
- Final canonical history rows: `50`
- Unmapped legacy history rows preserved: `2`
- Final total history rows: `52`
- Duplicate canonical prefix count: `0`
- Pending canonical migrations: `0`
- Second runner SQL re-executed: no
- Extra history rows on second pass: `0`
- No collision between Practice `0049` and PDF50 `0050`

## Practice 0049 Validation

- Practice `operation_kind = 'practice_generation'` accepted by both routing/runtime constraints
- `public.upsert_ai_provider_routing_policy_for_gateway`: updated for Practice routing
- `public.list_ai_provider_runtime_states_for_worker`: updated for Practice routing
- `public.record_ai_provider_route_outcome`: updated for Practice routing
- Provider calls: `0`

## PDF50 0050 Validation

- Burst tables: `2`
- PDF50 columns: `44`
- PDF50 functions: `13`
- PDF50 triggers: `6`
- PDF50 indexes: `4`
- RLS-enabled PDF50 tables: `2`
- Relevant policies: `5`
- Required uniqueness/idempotency constraints: present
- Source/import/job linkage: present
- Partial PDF50 state: absent
- Auto-publish: absent
- Assignment creation: absent

## Bucket Create Behavior

- `ai-import-sources` before `0050`: absent
- `0050` behavior: created bucket
- Bucket private: yes
- PDF-only MIME contract: yes
- Size limit: `50 MB`
- Canonical exact-path policies installed: `3`
- Legacy admin policies after apply: `0`
- Unknown bucket-targeting policies: `0`
- Public/anonymous grant: absent

## RLS And Storage Matrix

- Bank owner/editor: reserve, read, upload, finalize allowed
- Bank viewer: reserve/upload/finalize denied
- Student: burst/item/source access denied
- Unrelated organization user: denied
- Anonymous: denied
- Organization membership alone: denied
- Inactive Bank membership: denied
- Service role: bounded admission/pump operations allowed
- Exact server-reserved Storage path: allowed
- Arbitrary-path upload: denied
- Permanent public source URL: denied
- Authorization rechecked at finalize: yes

## Admission And Limits

- 1-PDF rehearsal: `1` durable item, `1` source linkage, `1` initial AI job
- 10-PDF rehearsal: `10` durable items, `10` source linkages, `10` initial AI jobs
- 10-PDF partial-failure rehearsal: `1` failed item, siblings preserved
- 50-PDF rehearsal: `50` durable items, `50` source linkages, `50` initial AI jobs
- Browser upload concurrency maximum observed: `4`
- Duplicate reservation/finalize: idempotent
- No duplicated jobs
- No lost items
- Provider calls: `0`

Observed capacity stayed inside the retained limits:

- Global active: `0` observed, limit `3`
- Organization active: `0` observed, limit `1`
- PDF active: `0` observed, limit `1`
- User outstanding: maximum `5`, limit `5`
- Organization outstanding: maximum `5`, limit `12`
- Worker invocation maximum: retained at `2`; AI worker not executed

## Race And Recovery

- Duplicate burst reservation: one logical burst
- Concurrent same-key reservation: one logical burst
- Five simultaneous finalize calls: safe
- Concurrent admission pumps: no duplicate linkage
- Capacity release races: bounded and eventually linked all valid items
- Cancel/finalize race: bounded
- Membership removal before finalize: denied
- Retry after upload-before-finalize: safe
- Retry after finalize-before-admission: safe
- Response-loss-after-job-linkage retry: safe
- Raw SQL error leakage: none observed in successful client paths

## Cleanup

- Synthetic database fixture cleanup: pass
- Synthetic Auth cleanup: pass
- Synthetic Storage-object cleanup: pass
- Temporary file cleanup: pass
- Temporary process cleanup: pass
- `ai-import-sources` bucket preserved: pass
- Final `ai-import-sources` object count: `0`
