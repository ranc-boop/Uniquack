# PDF50 Local RLS, Storage, and Admission Evidence

> **PRE-SEQUENCE-RECONCILIATION EVIDENCE.** This previous PDF50 `0049` run is
> preserved as historical validation only. The canonical Practice `0049` then
> PDF50 `0050` path is now superseded by
> `docs/security/pdf50-local-0049-0050-upgrade-evidence.md` and
> `docs/security/pdf50-local-0050-bucket-adoption-evidence.md`.

Date: 2026-07-21

Classification: `LOCAL_0049_UPGRADE_RLS_STORAGE_ADMISSION_VALIDATED`

All data in this run was synthetic and localhost-only. No real users, emails, Storage paths, object contents, signed URLs, hosted project references, or provider credentials are recorded here.

## RLS Matrix

- Bank owner: reserve/read/upload/finalize/cancel paths allowed
- Bank editor: reserve/read/upload/finalize paths allowed
- Bank viewer: reserve, upload, finalize, mutation denied
- Student: burst/item access, upload, finalize, source object read denied
- Unrelated organization user: denied
- Anonymous: denied
- Organization membership alone: denied without active Bank owner/editor membership
- Inactive/deleted Bank membership: denied
- Service role: admission/pump/worker operations allowed without exposing user-facing bypass

## Storage Matrix

- Exact reserved path upload for manager: allowed
- Arbitrary path upload: denied
- Viewer upload: denied
- Student upload: denied
- Unrelated user upload: denied
- Anonymous upload: denied
- Manager source-object download: allowed
- Student source-object download: denied
- Permanent public URL: denied
- Public/anonymous bucket grant: absent

## Admission Rehearsals

1-PDF rehearsal:

- Durable burst items: `1`
- Source linkages: `1`
- Initial AI job linkages: `1`
- Duplicate finalize: idempotent safe outcome
- Review Draft auto-publish: `0`
- Assignment creation: `0`

10-PDF rehearsal:

- Durable burst items: `10`
- Source linkages: `10`
- Initial AI job linkages: `10`
- Maximum upload concurrency observed: `4`
- Duplicate reservation/finalize: converged
- Partial synthetic failed upload case: `1` failed item, siblings preserved
- Provider calls: `0`

50-PDF rehearsal:

- Durable burst items: `50`
- Source linkages: `50`
- Initial AI job linkages: `50`
- Maximum upload concurrency observed: `4`
- Maximum user outstanding observed: `3`
- Maximum organization outstanding observed: `3`
- Maximum global active observed: `0`
- Maximum organization active observed: `0`
- Maximum PDF active observed: `0`
- Capacity constants unchanged: global active `<=3`, organization active `<=1`, PDF active `<=1`, user outstanding `<=5`, organization outstanding `<=12`
- No duplicate jobs, no lost items, no provider calls

## Race and Recovery

- Duplicate burst reservation: one logical burst
- Concurrent reservation with same idempotency key and same manifest: one logical result
- Five simultaneous finalize calls for one item: safe
- Concurrent admission-pump calls: safe
- Capacity full and release: bounded, eventually linked all valid items
- Cancel before finalize: safe
- Membership removal before finalize: denied
- Response-loss/retry cases: bounded safe outcomes
- Raw SQL/database errors exposed to clients: none in the successful run

## Cleanup

- Synthetic database fixture cleanup: pass
- Synthetic Auth cleanup: pass
- Synthetic Storage-object cleanup: pass
- Temporary file cleanup: pass
- Temporary process cleanup: pass
- Final `ai-import-sources` object count: `0`
- Provider calls: `0`
