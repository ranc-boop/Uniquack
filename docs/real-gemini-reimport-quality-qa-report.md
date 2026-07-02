# Real Gemini Reimport Quality QA

Date: 2026-07-02

## Executive summary

The previous QA blocker is resolved for the non-interactive QA path. The rerun used an authenticated clean Supabase admin session with the same provider gateway RPC used by the app, then executed a real Gemini Native PDF AI import against a tiny synthetic PDF fixture.

Result: the real Gemini import completed and created one draft Review question. The draft stayed unpublished, MCQ normalization produced a non-FRQ answer spec, solution fields were populated, source metadata was present, taxonomy assignments stayed `pending_review`, and organization alignment matched the authenticated profile default organization.

No provider API key, gateway token, encryption key, anon key, service-role key, password, raw provider response, or full prompt was printed or committed.

## Previous blocker

The first QA attempt was blocked because it used a service-role table inspection path that did not match the app runtime provider gateway path. The app provider gateway requires an authenticated admin context and `AI_PROVIDER_GATEWAY_TOKEN`; direct service-role table visibility is not equivalent to the real RPC path.

The corrected QA path signs in through Supabase Auth using local test admin credentials and calls:

```text
list_enabled_ai_provider_profiles_for_gateway
```

with the existing local gateway token, using the authenticated anon-session client.

## Authenticated QA path used

- Auth: Supabase Auth sign-in from local smoke env.
- Role: authenticated clean admin session with provider gateway access.
- Provider loading: app gateway RPC, not private table bypass.
- Service role for provider path: not used.
- Source fixture: synthetic one-page PDF with non-private algebra content.
- Provider: Gemini Native PDF.
- Model: `gemini-2.5-flash`.

## Import summary

- Batch ID: `f3ebacf3-5c21-4c3e-b11e-8417201e9c8a`
- Source file: `real-gemini-qa-1783035823724.pdf`
- Page count: 1
- Batch status: `imported`
- AI PDF phase: `completed`
- Draft questions created: 1
- Import items imported: 1
- Warning count: 4
- Reached Review Draft flow: yes, created question status is `draft`.

## Solution/explanation quality check

- Drafts with empty solution/explanation fields: 0
- Result: passed for this synthetic import.

The generated draft included non-empty solution content/source fields. No missing-solution blocker was observed in this run.

## MCQ answer_spec check

- MCQ drafts with options: 1
- MCQ drafts with non-FRQ `answer_spec.kind`: 1
- Result: passed.

The previous MCQ normalization issue was not reproduced. The MCQ draft did not remain with `answer_spec.kind = "frq"`.

## Asset/crop attachment check

- Question asset rows created: 0
- Clean asset field compatibility: passed.

The synthetic PDF did not require image crops, so no `question_assets` rows were created. The clean-schema `display_on_detail` mismatch did not occur, and the QA script verifies any created asset rows using the current clean fields:

- `asset_kind`
- `storage_bucket`
- `storage_path`
- `label`
- `alt_text`

## Review Draft / no-auto-publish confirmation

- Auto-published questions: 0
- Created question statuses: `draft`
- Result: passed.

No draft was approved, rejected, or published during this QA run.

## Source/provenance metadata confirmation

- Questions missing source metadata: 0
- Result: passed.

The generated draft contained source/provenance metadata in the current clean-schema fields.

## Organization alignment confirmation

- Batch organization matched authenticated profile default organization: yes.
- Generated questions with wrong organization: 0.
- Result: passed.

## Taxonomy pending_review confirmation

- Taxonomy assignments created: 2
- Assignments with `pending_review`: 2
- Assignment source: `batch_import`
- Result: passed.

No official taxonomy assignment was auto-approved.

## Provider log safety confirmation

No provider operation log rows were returned for this provider in the latest metadata-only check. The QA path did not print raw provider responses, prompts, gateway token, encryption key, or provider key material.

## Tests run

- `npm.cmd run lint`
- `npm.cmd run build`
- `node scripts/security-smoke.mjs`
- `node scripts/supabase-rls-smoke.mjs`
- `node scripts/route-smoke.mjs`
- `npm.cmd run smoke`

Networked Supabase checks were run with network access where needed.

## Remaining blockers before manual approval

No blocking schema/provider issue was found in this synthetic real Gemini reimport.

Manual review is still required before approving any generated draft:

1. Review the generated draft in `/admin/review`.
2. Check the 4 AI PDF warnings from the import summary.
3. Confirm the generated solution and MCQ answer key are pedagogically correct.
4. Confirm the pending taxonomy assignments are appropriate before approval.

## Recommended next task

Run a manual Review Draft QA pass on the generated synthetic draft, then repeat with a representative calculus packet if the content is safe to use for provider testing.
