# Teacher AI PDF Provider E2E Rerun Report

Date: 2026-07-09

Branch: `codex/teacher-ai-pdf-provider-e2e-rerun`

## 1. Executive Summary

Status: **passed with one provider-metadata warning**.

The real Gemini Native PDF provider call was run against a tiny synthetic PDF.
The provider-backed teacher path was validated from a selected private Question
Bank through bank-scoped Review Drafts, approval into the bank, assignment,
student practice, and evidence persistence.

Verified workflow:

```text
Teacher private PDF
-> selected Question Bank
-> Gemini Native PDF provider extraction
-> bank-scoped Review Drafts
-> approve into bank
-> publish assignment
-> student practice
-> evidence persists
```

The validation used a temporary local smoke harness that mirrors the teacher
server action sequence and calls the same `processAIPdfImport(...)` service with
`targetBankId`. It did not change product code, provider credentials, schema, or
`.env.local`.

## 2. Provider Readiness

Confirmed:

- an enabled AI PDF-capable provider profile exists;
- provider kind: `gemini_native_pdf`;
- `ai-import-sources` bucket exists;
- teacher credentials can sign in;
- student credentials can sign in;
- teacher can create a manageable private Question Bank;
- no provider keys, gateway tokens, service-role keys, DB passwords, raw
  provider responses, signed URLs, or credential-bearing URLs were printed.

Provider metadata warning:

- `list_enabled_ai_provider_profiles_for_gateway` returned `0` profiles in the
  E2E harness;
- the server-only provider fallback found the enabled Gemini Native PDF profile;
- the teacher import implementation also uses server-only fallback behavior, so
  this did not block teacher import execution;
- a follow-up can align the gateway token/hash path if Admin / AI Settings
  metadata listing must use only the gateway RPC.

No provider configuration was changed.

## 3. E2E Result

Result: **passed**.

Safe validation summary:

- created a private smoke Question Bank;
- created a smoke classroom with teacher and student membership;
- created a bank-scoped AI PDF import batch/source asset;
- uploaded one tiny synthetic PDF to `ai-import-sources`;
- ran Gemini Native PDF extraction through the shared AI PDF service;
- import completed with status `imported`;
- created draft count: `1`;
- `import_batches.target_bank_id` matched the selected bank;
- generated draft `owner_bank_id` matched the selected bank;
- generated draft remained `status = draft` before approval;
- generated draft remained private/non-public with `published_at = null`;
- taxonomy assignments existed and were `pending_review` before approval;
- teacher approved one draft into the bank;
- `bank_questions` received an active row;
- approved question remained bank-scoped and non-published;
- student could see the assigned work;
- student could not read the teacher source bank;
- assignment practice loaded the assigned bank-private question;
- practice evidence linked back to assignment progress;
- smoke-created rows and source object were cleaned up.

Browser/UI note:

- this rerun used a service/action-equivalent harness rather than manual browser
  upload;
- the teacher form wiring remains covered by the bank-scoped AI PDF bridge smoke
  and route smoke;
- no React form error was observed in this harness because no browser form submit
  was used.

## 4. Safety Boundaries

Confirmed:

- no admin/provider guard was weakened;
- no provider credentials were exposed;
- no `.env.local` changes;
- no migrations;
- no provider profile changes;
- no auto-publish;
- no Review Draft bypass;
- no public/global publish;
- no student source bank access;
- no stash applied.

The run used only safe IDs/counts internally and did not print raw provider
output.

Stash status:

- `stash@{0}` still exists as
  `local follow-up fixes before teacher AI PDF E2E validation`;
- it was not popped, applied, or modified in this branch.

## 5. Tests Run

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

Live Supabase/provider checks used approved network access. The route smoke used
a temporary local dev server and then stopped it.

## 6. Product Recommendation

Proceed to:

```text
T-AIPARSE2 AI Parsing Status + Review Draft QA Polish
```

Recommended follow-up warning, not a blocker for teacher E2E:

- investigate why the gateway RPC returned zero enabled profiles while the
  service-role fallback found the configured Gemini Native PDF profile. This
  appears to be provider metadata/gateway-token alignment, not a teacher import
  runtime blocker.
