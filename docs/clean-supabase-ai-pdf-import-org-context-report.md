# Clean Supabase AI PDF Import Organization Context Report

Date: 2026-07-02

Branch: `codex/ai-pdf-import-organization-context`

## Executive Summary

AI PDF import persistence is now clean-schema-aware for organization ownership. Generated/imported draft questions created through the shared batch import path receive `organization_id`, and new AI PDF import batches preserve `organization_id` when the source upload is reserved.

The clean schema remains strict. No `organization_id` constraints were removed or weakened, Review Draft governance was not bypassed, and AI-generated questions are still created as private drafts rather than auto-published question-bank rows.

## Root Cause

The real-provider smoke showed Gemini Native PDF reached provider response validation and extracted one question, but persistence failed with:

```text
null value in column "organization_id" of relation "questions" violates not-null constraint
```

The post-provider import path converts AI output into the shared batch import JSON flow, then inserts into `questions`. That insert did not include `organization_id`, while the clean schema requires every question to be organization-owned.

## Organization Resolution

The shared import service now resolves organization context in this priority order:

1. Existing `import_batches.organization_id`, when the batch already has one.
2. `profiles.default_organization_id` for the current admin profile.
3. First active `organization_members` row for the current user with `admin` or `teacher` role.

If no organization can be resolved, the import fails clearly with:

```text
No active organization found for AI import. Please check your profile or organization membership.
```

## Inserts Updated

Updated runtime code paths:

- New AI PDF source upload reservation writes `import_batches.organization_id`.
- Existing import batches with missing `organization_id` are backfilled during validation/import when an organization can be resolved.
- `questions` inserts from `importBatchImportJson` now include `organization_id`.

The current AI PDF path does not create `review_batches` or `review_draft_items`; it creates private draft `questions` reviewed through the existing admin review workflow.

## Review Draft / No Auto-Publish Safety

Preserved:

- `questions.status` remains `draft`.
- `question_taxonomy_assignments.review_status` remains `pending_review`.
- No AI/provider output is auto-published.
- No Review Draft gate was disabled.
- No provider routing or provider credential behavior changed.

## Verification

The previous real-provider smoke already verified that Gemini Native PDF could execute through `provider_response_validated`. This PR did not repeat a real provider call because the changed code is strictly after provider response validation in the persistence path.

Regression coverage added:

- `scripts/security-smoke.mjs` now verifies that the shared batch import persistence path resolves organization context, writes `organization_id`, and preserves draft/pending-review boundaries.
- The normal clean Supabase smoke suite passed after the patch.

## Tests Run

Passed:

- `npm.cmd run lint`
- `npm.cmd run build`
- `node scripts/security-smoke.mjs`
- `node scripts/supabase-rls-smoke.mjs`
- `node scripts/route-smoke.mjs`
- `npm.cmd run smoke`

## Remaining Blockers

- A follow-up manual real-provider retry can confirm the previous synthetic Gemini batch now reaches draft creation instead of the `organization_id` constraint failure.
- The clean disposable project previously needed a manual `ai-import-sources` storage bucket/policy setup. That was not changed in this PR.

## Safety Confirmations

- Old Supabase was not used.
- `.env.local` was not modified.
- Provider credentials were not changed.
- Provider API keys, gateway token, encryption key, anon key, service-role key, passwords, and raw provider responses were not printed or committed.
- `.codex_tmp/` and `output/` were not committed.
