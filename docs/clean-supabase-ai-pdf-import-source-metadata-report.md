# Clean Supabase AI PDF Import Source Metadata Report

Date: 2026-07-02

Branch: `codex/ai-pdf-import-organization-context`

## Root Cause

After the organization context patch, the real Gemini Native PDF path reached provider response validation and extracted questions, but draft persistence failed on the next clean-schema contract:

```text
null value in column "solution_source" of relation "questions" violates not-null constraint
```

The shared batch import persistence path explicitly inserted `normalized.solution_source`. For AI PDF output without a solution source, that value could be `null`, which overrode the clean schema default of an empty string.

## Required Question Fields Identified

The clean `questions` table requires draft question rows to satisfy these source/ownership fields:

- `organization_id`
- `content_source`
- `content_source_format`
- `solution_source`
- `solution_source_format`
- `status`
- `source_kind`

The table also includes optional provenance text in `source`.

## Fix

The shared batch import persistence service now fills source metadata safely before inserting draft questions:

- `content_source` uses a non-null string.
- `solution_source` uses a non-null string, falling back to `""`.
- `source` is set to a batch-scoped provenance label such as `ai_pdf_import:<batchId>`.
- `source_kind` is set from import type:
  - AI import source types use `ai_import`.
  - Manual/package-style import source types use `package_import`.

This keeps AI-imported questions clearly marked as generated/imported draft content instead of human-authored approved content.

## Shared Helper

No broader question creation abstraction was introduced. A small local helper was added in `src/lib/batch-import/service.ts` so AI PDF import and other shared batch import paths consistently fill required question source metadata.

## Draft / Review Boundary

Preserved:

- Question rows are still inserted with `status: "draft"`.
- Taxonomy assignments are still inserted with `review_status: "pending_review"`.
- No AI-generated question is auto-published.
- Review/admin workflows remain responsible for approval and publishing.

## Verification

Automated regression coverage was added to `scripts/security-smoke.mjs` to assert that shared import persistence:

- resolves organization context,
- inserts non-null `content_source` and `solution_source`,
- preserves `source` / `source_kind` provenance,
- keeps draft and pending-review boundaries.

A real-provider retry was not run in this PR. The previous smoke already confirmed the Gemini provider path reaches provider response validation; this patch targets the post-provider persistence layer.

## Tests Run

Passed:

- `npm.cmd run lint`
- `npm.cmd run build`
- `node scripts/security-smoke.mjs`
- `node scripts/supabase-rls-smoke.mjs`
- `node scripts/route-smoke.mjs`
- `npm.cmd run smoke`

## Remaining Blockers

- No known code blocker from this specific source metadata issue.
- A manual real-provider retry can confirm the 41-question Gemini batch now proceeds past the previous `solution_source` constraint.

## Safety Confirmations

- No old Supabase project was used.
- `.env.local` was not modified.
- Provider credentials were not changed.
- Provider API keys, gateway token, encryption key, anon key, service-role key, passwords, raw provider responses, and full prompts were not printed or committed.
- `.codex_tmp/` and `output/` were not committed.
