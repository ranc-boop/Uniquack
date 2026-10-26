# Teacher AI PDF Provider E2E After Hardening Report

Date: 2026-07-09

## Executive Summary

The real provider-backed Teacher AI PDF flow passed end to end after transient failure hardening.

Validated workflow:

```text
Teacher private PDF
-> selected Question Bank
-> Gemini Native PDF provider extraction
-> bank-scoped Review Draft
-> approve into bank
-> publish assignment
-> student practice
-> evidence persists
```

No provider credentials, keys, gateway tokens, service-role keys, anon keys, or raw provider responses were printed or committed.

## Provider Readiness

- Enabled AI PDF-capable provider metadata exists.
- Safe strategy name: `gemini_native_pdf`.
- Default provider path used: Gemini Native PDF.
- Gateway RPC returned `0` profiles in this environment, so the server-only fallback profile resolution was used.
- The fallback did not expose provider secrets and completed the provider-backed extraction successfully.

## Real Provider Call

One small real provider-backed validation was run with a synthetic one-question PDF:

```text
Question 1. What is 2 + 3?
```

Result:

- Gemini Native PDF provider call completed through the bank-scoped service path.
- Import batch status: `imported`.
- Created draft count: `1`.
- Item count: `1`.

## Transient Failure Handling

Gemini did not return `503`, `UNAVAILABLE`, or high-demand during this rerun, so the transient-failure branch was not exercised by the live provider call.

The hardening smoke still passed:

- transient provider failure classification remains covered
- teacher-facing failure copy remains safe
- no provider secrets or raw provider payloads are exposed
- failed imports remain non-published and bank-scoped

## Bank-Scoped Import Verification

- `import_batches.target_bank_id` matched the selected private smoke bank.
- Generated draft question count: `1`.
- Generated draft `owner_bank_id` matched the selected bank.
- Generated draft remained private and non-published.
- `published_at` remained `null`.
- No auto-publish occurred.
- Taxonomy assignments existed and remained `pending_review` before approval.

## Review Draft And Bank Approval

- The generated draft appeared in the selected bank review path.
- Teacher approved one draft into the selected bank.
- `bank_questions` received an active row.
- The approved question remained bank-scoped and non-published.
- The approved question did not become globally public.

## Assignment, Student Practice, And Evidence

- Teacher assigned the approved bank question to a smoke classroom.
- Student could see the assigned work.
- Student could not browse the teacher source bank.
- `/practice?assignmentId=...` loaded the assigned bank-private question.
- Student practice progress was marked `completed`.
- Assignment-linked evidence persisted back to `student_assignment_progress`.

## Safety Confirmations

- No provider credentials were changed.
- `.env.local` was not modified.
- No migrations were added or applied.
- No provider keys, gateway tokens, anon keys, service-role keys, passwords, credential URLs, or raw provider responses were printed.
- No generated question was auto-published.
- No Review Draft gate was bypassed.
- No old demo branch was used.
- Smoke-created rows and the synthetic source PDF object were cleaned up.

## Tests Run

Passed:

- `npm.cmd run lint`
- `npm.cmd run build`
- `node scripts/security-smoke.mjs`
- `node scripts/route-smoke.mjs`
- `node scripts/ai-pdf-provider-failure-status-smoke.mjs`
- `node scripts/bank-scoped-ai-pdf-import-bridge-smoke.mjs`
- `node scripts/bank-import-review-smoke.mjs`
- `node scripts/question-bank-foundation-smoke.mjs`
- `npm.cmd run smoke`
- `npm.cmd run perf:budget`

## Remaining Warnings

- The provider gateway RPC returned `0` profiles in this environment even though server-side provider metadata was available and successful. This is not blocking the teacher AI PDF path, but it is worth tracking before relying on the gateway RPC as the only readiness signal.
- The live provider call emitted a PDF.js standard font data warning. It did not block extraction or review draft creation.

## Recommendation

Proceed to T-AIPARSE2. The full Teacher AI PDF provider E2E passed after failure hardening.
