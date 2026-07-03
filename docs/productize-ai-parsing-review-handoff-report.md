# Productize AI Parsing Review Handoff Report

## Executive summary

This PR productizes the low-risk AI Parsing to Review Draft handoff from the demo inventory. It keeps current `main` as the source of truth and improves admin-facing workflow clarity around completed AI PDF imports, Review Draft navigation, warning visibility, and draft-only safety.

No provider execution behavior, database schema, migrations, provider credentials, Review Draft approval gates, or publish behavior were changed.

## Demo branch patterns inspected

Inspected `origin/codex/web-demo-feature-scan-ui-expansion` for:

- shared AI PDF import workspace framing
- five-step source to status to review workflow copy
- clearer draft-safe import language
- source and generated-question count surfacing

The implementation borrowed only workflow framing and handoff copy. It did not merge or cherry-pick demo branches and did not bring in teacher course-builder writes, publish actions, provider calls, or state-aware/wearable demo features.

## Files changed

- `src/components/ai-pdf-import-panel.tsx`
- `src/components/ai-pdf-dashboard/ai-pdf-control-dashboard.tsx`
- `src/app/admin/review/page.tsx`
- `src/components/draft-review-card.tsx`
- `scripts/route-smoke.mjs`
- `scripts/security-smoke.mjs`

## UX improvements made

- Added a live import completion callout: `Review Drafts are ready`.
- Added a direct `Review generated drafts` action from completed AI PDF imports to `/admin/review?batch=<batchId>`.
- Added a dashboard-level `Review Draft handoff` summary with imports needing review, draft count, and warning count.
- Added an `AI PDF imports` action from the Review Drafts page header.
- Replaced the batch-filter microcopy with a visible `Batch review handoff` panel showing source title, import status, draft count, and review reminders.
- Surfaced AI import provenance directly on Review Draft cards: provider, model, source batch, crop refs, and draft-only status.

## Review Draft handoff improvements

Review Draft links now appear in both the live import status card and the AI Parsing Control Dashboard. Batch-filtered Review Drafts now show a clear source/import context so admins understand which import produced the private drafts they are reviewing.

## Draft-only / no-auto-publish confirmation

The UI copy explicitly states that AI-generated questions are private drafts until reviewed and published by an admin. No publish, approve, reject, provider, or database mutation paths were changed.

## Warning visibility improvements

Warnings that affect review are now visible on Review Draft cards instead of being available only inside the secondary source/import debug disclosure. The dashboard handoff summary also counts warnings before the admin enters the review queue.

## Routes checked

`node scripts/route-smoke.mjs` passed with a temporary local dev server and covered:

- `/admin/imports/pdf`
- `/admin/imports`
- `/admin/review`
- `/admin/questions`
- `/admin/ai-settings` through existing admin route smoke coverage

Unauthenticated admin redirects remained acceptable. No 500s were reported.

## Tests run and results

- `npm.cmd run lint` - passed
- `npm.cmd run build` - passed
- `node scripts/security-smoke.mjs` - passed
- `node scripts/supabase-rls-smoke.mjs` - passed after rerun outside the network-restricted sandbox
- `node scripts/route-smoke.mjs` - passed with a temporary local dev server
- `npm.cmd run smoke` - passed
- `npm.cmd run perf:budget` - passed
- Additional focused smokes:
  - `node scripts/batch-import-smoke.mjs` - passed after rerun outside the network-restricted sandbox
  - `node scripts/question-assets-security-smoke.mjs` - passed after rerun outside the network-restricted sandbox; student-specific checks skipped because student env vars are unavailable
  - `node scripts/bulk-asset-import-smoke.mjs` - passed
  - `node scripts/package-import-smoke.mjs` - passed
  - `node scripts/markdown-latex-editor-smoke.mjs` - passed

## Remaining blockers or follow-ups

- Student-specific asset smoke checks remain skipped until disposable student credentials are available in the local process environment.
- A future productization slice can add a teacher-owned import workspace after teacher RBAC/RLS/provider access is explicitly validated.
- Do not productize demo course-builder publish/generation actions until they are split through Review Draft governance.

## Recommended next productization slice

Productize the safe Review Draft and Question Bank presentation polish that remains display-only and preserves the existing Review Draft lineage RPC. Avoid adding teacher course-builder writes, framework publishing, or state-aware demo behavior in the same PR.
