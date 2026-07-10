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

Dependency/provenance check:

- `git diff --name-only main...HEAD` shows this PR touched only Publish Center,
  Publish smoke, security/route smoke expectations, and this report.
- `git diff main...HEAD -- package.json package-lock.json scripts/google-account-links-baseline-smoke.mjs`
  is empty.
- This PR did not touch package files, the Google baseline smoke script, or
  Google account-linking runtime code.
- `npm.cmd pkg get dependencies.embedded-postgres` returned `{}`.
- `npm.cmd pkg get devDependencies.embedded-postgres` returned `{}`.
- `npm.cmd ls embedded-postgres --depth=0` showed no installed package.
- Switching to `main` and running
  `node scripts/google-account-links-baseline-smoke.mjs` reproduced the same
  `ERR_MODULE_NOT_FOUND` for `embedded-postgres`.

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
- It then failed in the unrelated Google account-link smoke because
  `scripts/google-account-links-baseline-smoke.mjs` imports undeclared local
  dependency `embedded-postgres`.
- `main` reproduces the same failure, so this is classified as an existing
  Google baseline smoke dependency issue unrelated to Publish Center v2.

## Blockers / Warnings

- No DB migration was needed.
- Package publishing remains intentionally not ready.
- Selected-student delivery remains intentionally disabled.
- The aggregate smoke blocker should be fixed in a separate PR, for example
  `codex/fix-google-account-links-baseline-dependency`, by either declaring the
  dependency or making the Google baseline smoke safely skip when the local
  embedded Postgres dependency is unavailable.
- Publish Center v2 is ready to merge based on the focused, security, route,
  RLS, bank, assignment, and performance checks above.
