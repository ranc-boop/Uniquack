# Teacher AI PDF Provider E2E Validation Report

Date: 2026-07-08

Branch: `codex/teacher-ai-pdf-provider-e2e-validation`

## 1. Executive Summary

Provider-backed teacher AI PDF E2E is **blocked** in the current clean Supabase environment.

The real provider call was **not run**. A metadata-only readiness probe confirmed:

- Supabase runtime env categories are present.
- Teacher and student smoke credentials are present and can sign in.
- `ai-import-sources` storage bucket exists.
- The provider gateway is reachable.
- Enabled AI PDF provider profile count is `0`.

Because no enabled AI PDF provider profile exists, the teacher PDF -> bank Review Draft path cannot safely execute a real provider import. The bridge code remains source-validated, and non-provider live smokes passed with approved network access.

## 2. Environment Readiness

| Check | Result |
| --- | --- |
| Supabase URL / anon key present | Yes |
| Provider gateway token present | Yes |
| Provider encryption key present | Yes |
| Service-role metadata key present | Yes |
| Enabled provider profile count | 0 |
| Usable AI PDF provider profile count | 0 |
| `ai-import-sources` bucket exists | Yes |
| Teacher credentials available | Yes |
| Teacher sign-in | Passed |
| Teacher role | `teacher` |
| Teacher visible/manageable bank count | 2 |
| Student credentials available | Yes |
| Student sign-in | Passed |
| Network | Sandboxed fetch blocked with `EACCES`; approved network reruns passed |

No secret values, provider keys, anon keys, service-role keys, DB passwords, tokens, or credential URLs were printed.

## 3. E2E Validation Result

Status: **blocked before provider execution**.

The target workflow was:

```text
Teacher private PDF
-> selected Question Bank
-> shared site/org AI provider
-> bank-scoped Review Drafts
-> approve into bank
-> publish assignment
-> student practice
-> evidence persists
```

The flow stopped at provider readiness:

- `list_enabled_ai_provider_profiles_for_gateway` returned `0` enabled profiles.
- No PDF was uploaded for provider processing.
- No real Gemini/OpenAI-compatible provider call was made.
- No generated provider output was created.

Still verified:

- The merged bridge source passes static smoke.
- Teacher bank import/review live smoke passes.
- Question Bank live smoke passes.
- Full smoke passes with approved Supabase network access.
- Bank approval remains private/non-public and review-gated in live smoke.
- Assignment/practice/evidence related smokes pass through `npm.cmd run smoke`.

Not proven in this run:

- `import_batches.target_bank_id` for a real provider-backed teacher PDF import.
- `questions.owner_bank_id` from a real provider-backed teacher PDF import.
- Real provider-generated taxonomy assignments as `pending_review`.
- Provider-backed Review Draft approval into bank.
- Real provider-backed assignment -> student practice -> evidence loop.

## 4. Stash Inspection Result

Inspected `stash@{0}`:

```text
local follow-up fixes before teacher AI PDF E2E validation
```

The stash was **not applied**.

It contains follow-up changes not present on latest main, including teacher import loading/pending UI, bank Review Draft inspection UX, review approval staying on the review page, class join-code recovery UI, and server/provider fallback changes. Those changes are outside this report-only validation branch and should be handled separately. Applying them here would mix validation reporting with implementation changes.

## 5. Safety Boundaries

Confirmed:

- No admin/provider guard was weakened.
- No provider credentials were exposed.
- `.env.local` was not modified.
- No migrations were added or edited.
- No provider profile was created or changed.
- No real provider call was run.
- No AI output was auto-published.
- No Review Draft bypass was introduced.
- No public/global publish was performed.
- Student source bank access remains blocked by live smokes.

## 6. Tests Run

Passed:

- `npm.cmd run lint`
- `npm.cmd run build`
- `node scripts/security-smoke.mjs`
- `node scripts/route-smoke.mjs`
- `node scripts/bank-scoped-ai-pdf-import-bridge-smoke.mjs`
- `node scripts/bank-import-review-smoke.mjs`
- `node scripts/question-bank-foundation-smoke.mjs`
- `npm.cmd run smoke`
- `npm.cmd run perf:budget`

Network note:

- Initial sandboxed live Supabase checks hit `EACCES` / `fetch failed`.
- Approved network reruns passed for live `bank-import-review-smoke`, `question-bank-foundation-smoke`, and full `npm.cmd run smoke`.

## 7. Remaining Validation Or Blockers

Blocking issue:

- The clean Supabase target currently has `0` enabled AI PDF provider profiles.

Remaining manual/provider validation:

1. Enable one shared AI PDF-capable provider profile through Admin / AI Settings.
2. Re-run this E2E validation.
3. Upload a tiny synthetic PDF from `/teacher/banks/[bankId]/imports`.
4. Verify bank-scoped Review Draft creation and all downstream ownership, review, assignment, practice, and evidence checks.

Potential follow-up risk:

- The un-applied stash contains server/provider fallback and storage-related follow-up changes. If real teacher PDF upload later hits provider gateway or RLS/storage errors, inspect those fixes before changing schema or provider settings.

## 8. Merge/Product Recommendation

The AI PDF bridge is source-validated and non-provider workflow smokes pass, but provider-backed teacher PDF E2E is **not complete** until an enabled AI PDF provider profile exists.

Recommendation:

- Do **not** claim provider-backed E2E complete yet.
- Enable/configure a shared AI PDF provider profile first.
- Then rerun provider-backed teacher PDF E2E.
- Proceed to `T-AIPARSE2 AI Parsing Status + Review Draft QA Polish` only after either:
  - the provider-backed E2E passes, or
  - the PR explicitly scopes itself to status/QA polish without claiming provider execution is validated.

## 9. Explicit Non-goals

- No new feature implementation.
- No provider config changes.
- No migrations.
- No student workspace changes.
- No admin redesign.
- No old demo work.
