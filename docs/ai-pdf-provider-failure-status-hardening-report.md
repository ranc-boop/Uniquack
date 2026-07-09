# AI PDF Provider Failure Status Hardening

## E2E Blocker Summary

The teacher AI PDF provider E2E reached the configured Gemini Native PDF path, but Gemini returned a temporary provider-side `503 UNAVAILABLE` / high-demand response. Provider readiness and the teacher bank bridge were working; the remaining product issue was failure copy and status handling.

## What Changed

- Added transient AI PDF provider failure classification for `503`, `UNAVAILABLE`, high demand, rate-limit, and overloaded responses.
- Added a safe teacher-facing failure message:
  `The AI provider is temporarily busy. Your file was not published or assigned. Please retry in a few minutes.`
- Marked transient failed teacher imports as `failed` and retryable in the existing `import_batches.summary.aiPdfImport` metadata.
- Preserved `targetBankId`, `reviewScope`, source asset refs, and the bank review gate on the failed import batch.
- Added source smoke coverage for the failure classification, teacher copy, bank scope preservation, and no-migration boundary.

## Teacher-Facing Behavior

When Gemini or another provider is temporarily busy, the teacher sees a short retry message. Raw provider JSON, response previews, provider credentials, and provider internals are not shown in the teacher page.

The uploaded source PDF and import batch remain bank-scoped. Nothing is published, assigned, or moved around Review Drafts automatically.

## Retry Recommendation

Teachers should retry in a few minutes. A future polish pass can add a first-class retry button/timeline, but this PR intentionally avoids new schema or workflow expansion.

## Safety Boundaries

- No provider credentials changed.
- No `.env.local` changes.
- No migration added.
- No admin/provider guard weakening.
- No AI auto-publish.
- No Review Draft bypass.
- No student workspace changes.
- No raw provider output exposed to teachers.

## Tests Run

- `npm.cmd run lint` - passed
- `npm.cmd run build` - passed
- `node scripts/security-smoke.mjs` - passed
- `node scripts/route-smoke.mjs` - passed
- `node scripts/ai-pdf-provider-failure-status-smoke.mjs` - passed
- `node scripts/bank-scoped-ai-pdf-import-bridge-smoke.mjs` - passed
- `node scripts/bank-import-review-smoke.mjs` - passed
- `node scripts/question-bank-foundation-smoke.mjs` - passed
- `npm.cmd run smoke` - passed
- `npm.cmd run perf:budget` - passed

Note: `route-smoke` was run with a same-command local dev server because this shell does not keep a background Next dev helper alive after the launcher exits. Live Supabase smokes required approved network access after sandboxed runs hit `EACCES` / `fetch failed`.

## Full Provider E2E

The full real-provider Teacher AI PDF E2E still needs to be rerun after this hardening and when Gemini Native PDF is available. This PR makes provider-busy failures safe and understandable; it does not claim the full provider-backed import/approve/assign/practice chain has passed.
