# Teacher AI PDF Provider E2E Rerun

## Executive Summary

The clean Supabase provider readiness blocker is resolved: the site has an enabled AI PDF-capable provider profile with stored key metadata, and the teacher import page renders AI PDF parsing as enabled.

The real provider-backed teacher import was attempted once with a tiny synthetic PDF through the teacher bank import form. The request reached the Gemini Native PDF path, but Gemini returned a temporary provider-side `503 UNAVAILABLE` / high-demand response. The E2E is therefore **blocked by provider availability**, not by missing provider configuration or teacher UI routing.

No provider keys, gateway tokens, encryption keys, anon keys, service-role keys, passwords, credential URLs, raw prompts, or raw provider responses were committed.

## Provider Readiness Confirmation

- Enabled provider profiles: 2
- Enabled AI PDF-capable provider profiles: 1
- Default AI PDF provider: Gemini Native PDF
- Strategy: `gemini_native_pdf`
- Stored key metadata present: yes
- Teacher UI state: `/teacher/banks/[bankId]/imports` showed `AI PDF parsing is enabled.`
- Teacher provider configuration boundary: teacher form submitted only `bankId`, `parsingProfile`, and PDF file; provider/model/API settings remain admin-only.

## Real Provider Call

- Real provider call run: yes
- Fixture: one tiny synthetic PDF containing only `Question 1. What is 2 + 3? Answer: 5`
- Provider strategy: `gemini_native_pdf`
- Result: blocked by provider response
- Safe error summary: Gemini Native `generateContent` returned status `503 UNAVAILABLE` because the model was experiencing high demand.

## Teacher PDF Import Result

The import was submitted through the rendered teacher bank PDF import server-action form. The app accepted the teacher session and reached the provider call, but the import action redirected back with the provider 503 error before creating usable Review Draft output.

Because the provider failed before draft creation:

- `import_batches.target_bank_id` verification for the successful batch could not complete.
- No generated draft question was available to verify `owner_bank_id`.
- No bank Review Draft was available to approve in this E2E run.

The temporary smoke bank/import artifacts were cleaned up.

## Review Draft / Approval / Assignment / Practice

These downstream E2E steps were not executed in the real-provider path because the provider did not return generated draft questions:

- Review Draft appears in `/teacher/banks/[bankId]/review`
- Approve one draft into the bank
- Create active `bank_questions` row from the provider-generated question
- Publish approved bank question to a classroom
- Student opens `/practice?assignmentId=...`
- Student answer/hint/grade path persists evidence back to teacher progress

The non-provider regression smokes for these boundaries passed:

- `bank-import-review-smoke`: bank-scoped Review Draft approval remains private/non-published.
- `question-bank-foundation-smoke`: teacher private banks remain private.
- `npm.cmd run smoke`: assignment-from-bank and assignment-practice evidence flows passed.

## Safety Confirmations

- No generated question was auto-published during this run.
- No Review Draft was approved from the failed provider response.
- No provider credentials were changed.
- No `.env.local` changes were made.
- No migrations or seeds were applied.
- No old Supabase project was used.
- Temporary `.codex_tmp` validation artifacts were removed before commit.

## Stash Status

`stash@{0}` still exists:

```text
On codex/bank-scoped-ai-pdf-import-bridge: local follow-up fixes before teacher AI PDF E2E validation
```

It was not popped or applied in this branch. Based on the earlier correction and merged PR #171, it should remain untouched unless a separate follow-up audit confirms it is obsolete and safe to drop.

## Tests Run

- `npm.cmd run lint` — passed
- `npm.cmd run build` — passed
- `node scripts/security-smoke.mjs` — passed
- `node scripts/route-smoke.mjs` — passed
- `node scripts/bank-scoped-ai-pdf-import-bridge-smoke.mjs` — passed
- `node scripts/bank-import-review-smoke.mjs` — passed
- `node scripts/question-bank-foundation-smoke.mjs` — passed
- `npm.cmd run smoke` — passed
- `npm.cmd run perf:budget` — passed

## Recommendation

Do not proceed to T-AIPARSE2 yet as a proven green E2E. Rerun this exact teacher AI PDF provider E2E when Gemini Native PDF is available again, or configure an admin-approved AI PDF-capable fallback profile if the product wants provider redundancy.

