# Blueprint Library Foundation Report

## Executive Summary

Phase 4 adds a teacher-facing Blueprint Library foundation. `/teacher/blueprints` is now a real library surface for reusable planning/package assets, with safe create, folder, detail, and bank-linked list paths.

This PR does not implement Blueprint AI generation. It does not call providers, create Review Drafts, assign to students, or publish anything.

## Existing Schema Reuse Decision

The clean schema already had the core Blueprint Engine tables:

- `question_blueprints`
- `question_blueprint_folders`
- `question_blueprint_examples`
- `question_blueprint_review_actions`
- `question_blueprint_versions`
- `question_blueprint_calibration_runs`

I reused `question_blueprints` and `question_blueprint_folders` instead of creating a parallel teacher-only table, then added the missing teacher-library contract fields and a `bank_blueprints` link table.

## Schema / Migration

Added:

- `supabase/clean-migrations/0031_blueprint_library_foundation.sql`

It adds:

- `question_blueprints.description`
- `question_blueprints.visibility`
- `question_blueprints.blueprint_kind`
- `question_blueprints.source_bank_id`
- `question_blueprints.source_kind`
- `question_blueprints.source_record_id`
- `question_blueprints.metadata`
- `question_blueprint_folders.organization_id`
- `question_blueprint_folders.visibility`
- `question_blueprint_folders.status`
- `bank_blueprints`
- RLS helper functions for Blueprint read/manage and folder read/manage
- bank-linked Blueprint RLS policies

Remote clean Supabase does not have 0031 applied yet. I added:

- `docs/blueprint-library-migration-0031-manual-apply.md`

Live Blueprint Library DB validation will pass only after applying 0031.

## Blueprint Library Behavior

Implemented:

- `/teacher/blueprints`
- filters: All, Private, Shared, Organization, Public, Bank-linked, Recently Updated
- folder/sidebar layout
- Blueprint cards with title, visibility, status, kind, folder, source bank, taxonomy summary, updated date
- empty state: “Start with a private Blueprint, or generate one from a bank in a later step.”
- setup-needed state when migration 0031 is missing

## Blueprint Detail Behavior

Implemented:

- `/teacher/blueprints/[blueprintId]`
- title, description, visibility, status, kind
- source bank link
- folder
- taxonomy summary
- source lineage and metadata disclosure
- disabled placeholders for:
  - Link to Bank
  - Generate Review Drafts
  - Use in Publish
  - Share / Submit to Public Review

Safety copy remains explicit: Blueprints do not go directly to students; output flows through Review Drafts and banks before assignment.

## Folder Behavior

Implemented:

- teacher folder creation from `/teacher/blueprints`
- folder tree display
- Unfiled state
- folder visibility/status in migration

Folders are teacher-owned assets. No hard delete behavior was added.

## Bank-linked Blueprint Behavior

Implemented:

- `/teacher/banks/[bankId]/blueprints`
- linked Blueprint list
- empty state for banks with no linked Blueprints
- “Create Blueprint from this bank” safe manual handoff
- `bank_blueprints` link table and RLS policies

The bank route does not generate questions. It only links planning assets to a bank.

## Visibility / Status Behavior

Visibility:

- `private`
- `shared`
- `organization`
- `public`

Status uses the existing Blueprint lifecycle:

- pending review shown as Draft
- approved
- needs more evidence
- rejected
- archived
- deprecated
- trash

Shared visibility is a placeholder-level organization-visible state until a richer Blueprint sharing model exists.

## RLS / Security

Migration 0031 adds helper-based RLS for:

- teacher reading own private Blueprints
- teacher/admin reading organization/public Blueprints where allowed
- students blocked from teacher Blueprint browsing
- anonymous blocked
- bank-linked Blueprints visible only through bank membership unless broader Blueprint visibility applies

Live RLS source checks passed. Full live 0031 DB mutation validation is blocked until migration 0031 is manually applied.

## Design Compliance

The teacher library follows the current old-demo-derived teacher style:

- pale sky/slate wash
- translucent white panels
- sky/blue primary actions
- semantic badges
- folder/card library feel
- no dark green primary/sidebar base

## Smoke Coverage

Added:

- `scripts/blueprint-library-foundation-smoke.mjs`

Updated:

- `scripts/route-smoke.mjs`
- `scripts/security-smoke.mjs`
- `scripts/supabase-rls-smoke.mjs`
- `scripts/smoke-all.mjs`
- `scripts/question-bank-ui-remodel-smoke.mjs`

The new smoke validates source contracts every run and skips live mutation with a clear message until migration 0031 is applied.

## Tests

Passed:

- `npm.cmd run lint`
- `npm.cmd run build`
- `node scripts/security-smoke.mjs`
- `node scripts/route-smoke.mjs` with `SITE_URL=http://localhost:3001`
- `node scripts/supabase-rls-smoke.mjs`
- `node scripts/question-bank-foundation-smoke.mjs`
- `node scripts/bank-share-members-smoke.mjs`
- `node scripts/bank-import-review-smoke.mjs`
- `node scripts/assignment-from-bank-smoke.mjs`
- `node scripts/teacher-workspace-shell-smoke.mjs`
- `node scripts/question-bank-ui-remodel-smoke.mjs`
- `node scripts/teacher-ai-parsing-bank-targeting-smoke.mjs`
- `node scripts/blueprint-library-foundation-smoke.mjs`
- `npm.cmd run smoke` with `SITE_URL=http://localhost:3001`
- `npm.cmd run perf:budget`

Notes:

- Initial route smoke required using the already-running dev server on port `3001`.
- `blueprint-library-foundation-smoke` source checks passed.
- `blueprint-library-foundation-smoke` live mutation checks skipped because migration 0031 is not applied to remote clean Supabase yet.

## Remaining Blockers

Apply:

```text
supabase/clean-migrations/0031_blueprint_library_foundation.sql
```

Then rerun:

```bash
node scripts/blueprint-library-foundation-smoke.mjs
```

## Explicit Non-goals

- no Blueprint AI generation
- no provider calls
- no Review Draft bypass
- no direct student delivery
- no full Publish Center
- no public pull/private push
- no Google Classroom
- no wearable UI
