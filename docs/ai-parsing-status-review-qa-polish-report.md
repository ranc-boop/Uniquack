# AI Parsing Status + Review Draft QA Polish Report

Date: 2026-07-09

## Executive Summary

This PR polishes the teacher-facing AI Parsing status/history and bank-scoped Review Draft QA surfaces after the real Gemini Native PDF teacher E2E passed.

No provider credentials, provider routing, migrations, Review Draft approval rules, student workspace behavior, or public publishing behavior were changed.

## Product Workflow Touched

```text
Teacher Question Bank
-> AI Parsing / PDF import
-> bank-scoped import batch status
-> bank-scoped Review Draft QA
-> manual approval into bank
```

The workflow remains bank-first and review-gated.

## AI Parsing Status History

Updated the recent import panel used by `/teacher/ai-parsing` and `/teacher/banks/[bankId]/imports`.

The panel now shows teacher-safe import status metadata from existing `import_batches.summary` fields:

- source/file label when safely available
- target bank name
- batch phase
- imported/failed/pending/retryable status label
- draft count
- warning count
- warning excerpts
- zero-draft copy
- retryable provider-busy copy
- `Open Review Drafts` link

Provider setup remains described as shared site/org configuration in Admin / AI Settings. Teachers do not see provider IDs, model IDs, API keys, encrypted fields, gateway tokens, or raw provider payloads.

## Teacher PDF Import Copy

The existing teacher import page already stated the required safety model:

- AI Parsing runs server-side.
- Generated content becomes private Review Drafts in the selected bank.
- Review is required before assignment.
- Imports do not auto-publish or auto-assign.
- Provider credentials are never configured in the teacher workspace.
- JSON fixture remains an Advanced / Developer fixture.

This PR keeps that structure and makes status/history clearer.

## Review Draft QA Polish

The bank Review Draft page already had expandable question review panels. This PR keeps and smoke-protects:

- question prompt preview
- MCQ options with marked-correct highlighting
- answer-spec summary
- solution/explanation preview
- taxonomy suggestion labels
- validation warning list
- missing prompt/solution/taxonomy/answer warnings
- source lineage
- non-public bank approval copy

Added disabled placeholders for:

- `Edit draft - coming next`
- `Needs fix - coming next`

No edit/reject/needs-fix mutations were implemented in this PR.

## Safety Boundaries

Confirmed by source smoke and existing live smokes:

- unreviewed AI output remains draft/private
- no public auto-publish
- no student-visible Review Draft path
- teacher import is owner/editor gated
- viewer imports remain disabled
- approval stays bank-scoped
- approving a draft stays on `/teacher/banks/[bankId]/review`
- target bank scope is preserved
- source bank is not exposed to students
- provider configuration remains admin-only

## Gateway RPC Warning

The previous E2E report noted that the provider gateway RPC returned `0` profiles in this environment while the server-only fallback profile resolution succeeded.

This PR does not change that server/provider behavior. The UI continues to avoid relying on teacher-visible provider configuration.

## Smoke Coverage Added

Added:

- `scripts/ai-parsing-status-review-qa-smoke.mjs`

Updated:

- `scripts/smoke-all.mjs`
- `scripts/teacher-ai-parsing-bank-targeting-smoke.mjs`

The new smoke verifies:

- teacher AI Parsing route remains bank-targeted
- recent status cards show target bank, phase, draft/warning counts, retryable copy, zero-draft copy, and Review Draft CTA
- teacher import copy keeps review-gated/private-bank wording
- JSON fixture remains Advanced / Developer
- Review Draft QA panels expose prompt, answer/options, solution, taxonomy, warnings, source lineage, and disabled future actions
- provider/API secret fields are not exposed in teacher import/review UI
- import and approval paths remain non-publishing
- no migration was added for this polish

## Tests Run

Passed:

- `npm.cmd run lint`
- `npm.cmd run build`
- `node scripts/security-smoke.mjs`
- `node scripts/route-smoke.mjs`
- `node scripts/ai-parsing-status-review-qa-smoke.mjs`
- `node scripts/ai-pdf-provider-failure-status-smoke.mjs`
- `node scripts/bank-scoped-ai-pdf-import-bridge-smoke.mjs`
- `node scripts/bank-import-review-smoke.mjs`
- `node scripts/question-bank-foundation-smoke.mjs`
- `node scripts/teacher-dashboard-real-data-smoke.mjs`
- `npm.cmd run smoke`
- `npm.cmd run perf:budget`

Notes:

- Supabase-backed live smokes required network access outside the filesystem sandbox.
- The first sandboxed `bank-import-review-smoke` attempt failed with `EACCES fetch failed`; rerun with network access passed.

## Remaining Warnings

- Gateway RPC readiness signal should be revisited later if the product wants a single provider-readiness source of truth.
- Edit/reject/needs-fix actions are visible as disabled placeholders only; the actual mutation workflow should be a separate PR.

