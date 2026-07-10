# Publish Center v2 Report

## Goal

Publish Center v2 turns `/teacher/publish` into the teacher distribution
workbench for approved, assignment-ready content.

Product workflow touched:

```text
Question Bank / Library
-> approved bank questions
-> Publish Center
-> classroom assignment draft or assigned work
-> Student My Work / Practice
```

## Files Changed

- `src/app/teacher/publish/page.tsx`
- `src/app/teacher/publish/actions.ts`
- `src/lib/teacher-publish.ts`
- `src/components/teacher/publish-selection-controls.tsx`
- `scripts/publish-center-v2-smoke.mjs`
- `scripts/publish-center-foundation-smoke.mjs`
- `scripts/security-smoke.mjs`
- `scripts/smoke-all.mjs`
- `docs/publish-center-v2-report.md`

## Migration Decision

No migration was added.

The existing clean schema already supports:

- `bank_questions` as the assignment-ready bank membership row.
- `assignment_items.bank_question_id` and `assignment_items.source_bank_id`.
- `assignments.source_summary` for sanitized Publish Center v2 lineage.
- `public.create_assignment_from_bank` for server-side assignment creation.

## Visible Source Types

Publish now shows three visible source modes:

- **Question Bank**: active, uses approved active bank questions.
- **Blueprint**: active only when this bank contains approved
  Blueprint-generated bank questions.
- **Package**: visible but clearly not assignment-ready yet.

Blueprint records themselves are not directly publishable.

## Approved-Content Filtering

`src/lib/teacher-publish.ts` centralizes the publishable question set.

A row must be:

- an active `bank_questions` row,
- linked to an existing question,
- not deleted,
- not `draft`, `archived`, or `deprecated`,
- scoped to the selected bank when `owner_bank_id` is present.

The UI filters only the visible checklist. The server action reloads the source
bank and publishable question set on submit and blocks stale selections.

## Blueprint Lineage Behavior

Blueprint source mode shows only bank questions that carry Blueprint generation
lineage after Review Draft approval. The assignment source summary stores safe
counts and Blueprint labels/ids for teacher traceability, but student preview
metadata explicitly hides:

- source bank access,
- Blueprint internals,
- provider metadata,
- import metadata,
- answers and solutions.

## Assignment Creation

The server action still uses `public.create_assignment_from_bank`.

Before creating assignments, it verifies:

- current user is a teacher/admin role through `requireTeacher`,
- selected bank is active,
- current bank role can publish (`owner` or `editor`),
- every selected question remains assignment-ready,
- every selected classroom is active and in the bank organization.

After the RPC creates an assignment, the action writes a sanitized v2
`source_summary` for teacher traceability.

## Draft / Assign Now

Publish supports both:

- **Save draft**: teacher-only assignment draft.
- **Assign now**: visible in Student My Work for selected class members.

Multi-class publishing remains class-level. Selected-student targeting is shown
as a future option and disabled.

## Student Access Boundary

Publish Center v2 keeps the bank-first boundary:

- students receive assignment items only,
- students do not gain source bank browsing access,
- private bank questions are not globally published,
- Review Drafts are not bypassed,
- no AI/provider call happens in Publish.

## Tests

Passed:

- `npm.cmd run lint`
- `npm.cmd run build`
- `node scripts/security-smoke.mjs`
- `node scripts/route-smoke.mjs`
- `node scripts/publish-center-v2-smoke.mjs`
- `node scripts/publish-center-foundation-smoke.mjs`
- `node scripts/question-bank-foundation-smoke.mjs`
- `node scripts/bank-import-review-smoke.mjs`
- `node scripts/assignment-from-bank-smoke.mjs`
- `node scripts/supabase-rls-smoke.mjs`
- `npm.cmd run perf:budget`

Aggregate smoke status:

- `npm.cmd run smoke` ran through the Publish, Bank, Assignment, Classroom,
  Blueprint, AI Parsing, Review Draft, and Batch Import smokes successfully.
- It then failed in the unrelated Google account-link smoke because the local
  install does not include the `embedded-postgres` package imported by
  `scripts/google-account-links-baseline-smoke.mjs`.

## Blockers / Warnings

- No DB migration was needed.
- Package publishing remains intentionally not ready.
- Selected-student delivery remains intentionally disabled.
- Live Supabase-backed smokes may skip/fail if the environment cannot reach the
  clean Supabase endpoint.
