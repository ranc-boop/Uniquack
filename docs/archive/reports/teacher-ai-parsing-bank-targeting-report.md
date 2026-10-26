# Teacher AI Parsing Bank Targeting Report

## Executive Summary

Phase 3 adds a real teacher-facing `/teacher/ai-parsing` entry point. Teachers now choose a Question Bank before importing, and the teacher import flow routes into the selected bank workspace instead of the admin/global import surface.

## Product Behavior

- `/teacher/ai-parsing` lists the teacher's Question Banks.
- Owner/editor banks are selectable and can receive imports.
- Viewer banks are shown as read-only context and cannot start imports.
- If no banks exist, the page sends teachers to create or join a bank first.
- The primary handoff is `/teacher/banks/[bankId]/imports`.
- Review handoff is `/teacher/banks/[bankId]/review`.

## Target Bank Selector

The selector shows bank role, visibility, draft/import/ready counts, and disabled read-only copy for viewer banks. The selected bank becomes the import target for the bank-scoped workflow.

## Import Route Consistency

`/teacher/banks/[bankId]/imports` now shares the same bank-targeted language as `/teacher/ai-parsing`:

- selected bank first
- Review Drafts before bank entry
- no global publish from import
- no assignment action from import
- no teacher handoff to `/admin/imports/pdf` or `/admin/review`

## Developer Fixture

The normalized JSON fixture remains available for smoke testing, but it is hidden under:

`Advanced / Developer fixture`

It is labeled:

`Developer fixture for smoke testing. Normal teachers should use AI Parsing import.`

## Permissions

- `requireTeacher()` gates `/teacher/ai-parsing`.
- Owners and editors can import into a bank.
- Viewers can see bank context but cannot import.
- Students and anonymous users remain blocked by teacher route guards.

## Bank Scope

The existing teacher bank import action still calls `importBatchImportJson` with `targetBankId`. It preserves `target_bank_id` on import batches and redirects created drafts to the selected bank Review Drafts page.

## Smoke Coverage

Added `scripts/teacher-ai-parsing-bank-targeting-smoke.mjs`.

Coverage includes:

- `/teacher/ai-parsing` renders as a bank-targeted entry point.
- Teacher pages do not link normal import/review flow through admin routes.
- Viewer banks are disabled for import in the selector UI.
- JSON fixture is advanced/developer-only.
- Bank import action preserves `target_bank_id`.
- Live smoke creates a private teacher bank and a bank-scoped import batch when clean DB teacher credentials are available.

## Non-goals

- No provider configuration changes.
- No provider behavior changes.
- No global/public publishing flow.
- No assignment changes.
- No student bank browsing.
- No Blueprint generation changes.
- No migration.

