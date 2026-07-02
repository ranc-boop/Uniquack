# Clean Supabase Real Provider AI Import Smoke Report

Date: 2026-07-02

Branch: `codex/real-provider-ai-import-safety-smoke`

## Scope

This smoke verified the clean local Supabase setup with the real Gemini AI PDF import path. It did not use the old Supabase project, did not modify `.env.local`, did not print or commit provider keys, and did not weaken Review Draft or publish gates.

## Provider Selected

- Provider profile: Gemini Native PDF
- Provider mode: `gemini_native`
- Model: `gemini-2.5-flash`
- Profile state: enabled
- Credential check: API key was present in the saved provider profile, confirmed through safe metadata only. Encrypted credential fields and raw keys were not printed.

`/admin/ai-settings` loaded the provider metadata without exposing encrypted credential fields.

## Fixture

A tiny synthetic, non-private PDF was used:

```text
Solve: 2x + 3 = 7. What is x?
```

The source PDF was 604 bytes, one page, and was uploaded as a private AI import source asset.

During setup, the clean disposable project was missing the `ai-import-sources` storage bucket/policies. A disposable-only storage setup was applied outside repo code so this smoke could run. No migration or application code was changed for that setup.

## Real Provider Call Result

The AI PDF import was started manually from `/admin/imports/pdf` with the Gemini Native PDF provider.

Observed batch progression:

- `calling_provider`
- `provider_response_validated`
- `cropping_assets`
- final status: `failed`

The real Gemini path succeeded far enough to return a validated provider response:

- `sourceInput`: `gemini_native_pdf`
- extracted question count: 1
- provider response raw payload: not stored in this report
- provider keys: not printed

## Import Result

The batch did not create a Review Draft because the clean schema rejected the question insert:

```text
null value in column "organization_id" of relation "questions" violates not-null constraint
```

This appears to be a clean schema/app import contract mismatch: AI PDF import builds the imported question payload without `organization_id`, while the clean `questions` table requires it.

## Review Draft Result

- Review Draft rows created for this batch: 0
- Imported question rows created for this batch: 0
- Import batch item status: skipped

The failure happened after provider response validation and before successful draft persistence.

## No Auto-Publish Confirmation

- Approved questions created from this batch: 0
- No generated question was published directly to the approved Question Bank.
- Review gates were not disabled or bypassed.

## Source Reference Confirmation

The source asset remained available as a private import source:

- asset role: `source_pdf`
- status: `ready`
- MIME type: `application/pdf`
- page count: 1

No signed URL, storage credential, or provider credential was printed in this report.

## Provider Log Safety

`ai_provider_operation_logs` had no rows for this smoke path. No provider operation log containing raw provider keys, gateway token, encryption key, or raw provider response was found.

## Remaining Blockers

1. Clean schema storage bootstrap is incomplete: `ai-import-sources` bucket/policies were missing until applied manually to the disposable project.
2. AI PDF import draft persistence is blocked by the clean `questions.organization_id` not-null contract.
3. The synthetic algebra fixture produced taxonomy warnings because the current clean seed taxonomy is AP Calculus-focused. This is not a provider execution blocker.

## Tests

Passed:

- `npm.cmd run lint`
- `npm.cmd run build`
- `node scripts/security-smoke.mjs`
- `node scripts/supabase-rls-smoke.mjs`
- `node scripts/route-smoke.mjs`
- `npm.cmd run smoke`

## Safety

- No old Supabase project was used.
- No Vercel or production environment was modified.
- `.env.local` was not modified or committed.
- Provider API keys, gateway token, encryption key, service role key, and raw provider responses were not printed or committed.
- No generated question was auto-published.
- No Review Draft gate was weakened.
