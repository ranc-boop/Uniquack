# Teacher Product Implementation Sequence

This sequence is an implementation plan, not code. Each phase should become a small PR with explicit role boundaries, data ownership, smoke coverage, and rollback risk.

## Phase 0: Current Status And Stop-the-line Items

Goal: document what exists and what must not be bypassed.

Current status:

- teacher role is real
- bank foundation exists
- bank sharing exists
- bank import/review exists
- assignment from bank exists
- classroom RLS fix exists if migration 0030 has been applied to the clean target
- teacher shell still needs full product separation
- Blueprint is still mostly admin/system-facing
- Publish is not yet a top-level teacher workflow

Non-goals:

- no new runtime behavior
- no schema changes just for planning

Expected routes/files:

- docs and smoke reports
- no runtime code

Migration likely: no.

Smoke needed: docs diff/status only.

Rollback risk: low.

## Phase 1: Teacher Workspace Shell Finalization

Goal: make Teacher a separate product shell, not student practice plus gated features.

Scope:

- `/teacher` dashboard modules
- teacher navigation cleanup
- visible major modules: Dashboard, Question Bank, AI Parsing, Blueprint, Classroom, Publish, Progress
- confirm classroom creation RLS after migration 0030
- ensure teacher pages are validated with real teacher credentials

Non-goals:

- no Blueprint generation changes
- no public bank push

Expected routes/files:

- `src/app/teacher/page.tsx`
- teacher layout/nav components
- smoke scripts for teacher route shell

Migration likely: no, unless route work exposes missing role metadata.

Smoke needed:

- teacher route smoke
- teacher-workspace shell smoke
- no student/admin nav bleed

Rollback risk: medium, because nav/shell affects many teacher paths.

## Phase 2: Question Bank UI Remodel

Goal: make Bank feel like an asset library/repository.

Scope:

- `/teacher/banks`
- `/teacher/banks/[bankId]`
- bank card/table hybrid
- bank detail tabs: questions, imports, review, blueprints, members, sources, settings
- readable taxonomy/difficulty/source/review columns

Non-goals:

- no new bank permission model
- no public marketplace yet

Expected routes/files:

- `src/app/teacher/banks/*`
- bank UI components
- `src/lib/question-banks.ts`

Migration likely: no if existing bank schema is enough.

Smoke needed:

- bank foundation smoke
- bank share smoke
- route smoke

Rollback risk: medium.

## Phase 3: AI Parsing Top-level And Bank Targeting

Goal: create a teacher-owned AI Parsing entry that clearly targets banks.

Scope:

- `/teacher/ai-parsing`
- choose target bank
- upload/import owned material
- Review Draft handoff
- source lineage display

Non-goals:

- no auto-publish
- no provider setup in teacher space
- no arbitrary taxonomy creation

Expected routes/files:

- new teacher AI Parsing route
- import actions reused from bank/admin-safe paths
- review handoff components

Migration likely: maybe, only if target bank metadata gaps remain.

Smoke needed:

- import creates target-bank Review Drafts
- no auto-publish
- source lineage preserved

Rollback risk: high, because AI Parsing and Review Drafts are safety-critical.

## Phase 4: Blueprint Library Foundation

Goal: make Blueprint a teacher-facing library asset.

Scope:

- `/teacher/blueprints`
- `/teacher/blueprints/[blueprintId]`
- private/shared/public blueprint scopes
- folders
- bank-linked blueprint lists
- source examples and taxonomy targets

Non-goals:

- no provider generation yet
- no direct student delivery
- no bypass around Review Drafts

Expected routes/files:

- teacher blueprint routes
- blueprint library helpers/components
- optional bank-blueprint links

Migration likely: maybe, if teacher access/folder/link model is missing.

Smoke needed:

- teacher can view accessible blueprints
- private blueprint default
- no generation/provider call in smoke

Rollback risk: medium/high.

## Phase 5: Classroom UI Rebuild

Goal: make Classroom a real teacher classroom product while preserving bank-first ownership.

Scope:

- class card grid
- class cover/identity
- people tab
- assignments tab
- analytics/feedback tab
- linked blueprints tab
- settings tab
- remove/kick student
- persistent class join code visibility

Non-goals:

- no content ownership in classroom
- no Google Classroom integration yet

Expected routes/files:

- `src/app/teacher/classrooms/*`
- classroom actions/helpers
- student classroom routes for join/visibility regression

Migration likely: maybe, only for missing roster/action audit fields.

Smoke needed:

- teacher creates classroom
- student join works
- student creation blocked
- teacher can remove student
- class detail tabs render

Rollback risk: medium.

## Phase 6: Publish Center

Goal: create top-level distribution workflow.

Scope:

- `/teacher/publish`
- source selection: Question Bank, Blueprint, package
- target selection: one class, multiple classes, individual students later
- draft/assign/schedule states
- assignment-only boundary copy
- feedback publishing later

Non-goals:

- no public/global publish
- no unreviewed AI draft assignment

Expected routes/files:

- teacher publish route
- assignment helpers
- source selectors

Migration likely: maybe, if scheduling or multi-target relationships are missing.

Smoke needed:

- publish from bank to assignment
- multi-class path planned or disabled safely
- student sees selected items only

Rollback risk: high because delivery and visibility boundaries are involved.

## Phase 7: Student Practice Compatibility

Goal: ensure assignment-linked Practice works with bank questions.

Scope:

- fix any remaining "Key is not allowed" or assignment-start incompatibilities
- assignment-linked practice with bank questions
- evidence update and teacher progress linkage

Non-goals:

- no practice redesign
- no schema cutover unless required by repro

Expected routes/files:

- practice API routes
- practice loader/client
- assignment linkage helpers

Migration likely: no unless a real blocker proves otherwise.

Smoke needed:

- student starts assigned bank question
- attempt/evidence records link to assignment/question/taxonomy/classroom
- teacher can read evidence

Rollback risk: medium.

## Phase 8: Public Pull / Private Push

Goal: add governed movement between public/global and private/shared banks.

Scope:

- pull public approved items into private/shared banks
- submit private/shared items to public review
- admin review gate

Non-goals:

- no direct public publish by teacher
- no public mutation without review

Expected routes/files:

- public bank/library surfaces
- bank contribution actions
- admin review support

Migration likely: yes.

Smoke needed:

- pull preserves provenance
- submit creates review item
- rejected item stays private/shared

Rollback risk: high.

## Phase 9: Blueprint Generation And Course Builder Rebuild

Goal: rebuild Course Builder around bank/package generation and review gates.

Scope:

- bank/package generator
- blueprint-driven package plan
- generated output to Review Drafts
- approved package enters bank
- optional assignment through Publish

Non-goals:

- no fake publish
- no direct raw AI delivery
- no old demo route restoration

Expected routes/files:

- `/teacher/course-builder`
- blueprint/package helpers
- Review Draft integration

Migration likely: maybe.

Smoke needed:

- generated package is reviewable
- approval enters bank
- assignment only after approval

Rollback risk: high.

## Phase 10: Google Login / Classroom / LTI Later

Goal: integrate external identity/classroom systems after native model is stable.

Scope:

- optional Google login
- Google Classroom import later
- LTI later if needed

Non-goals:

- no replacement of native bank/classroom/assignment model

Expected routes/files:

- account linking
- imported classroom mapping
- external integration settings

Migration likely: yes.

Smoke needed:

- native flows work without Google
- imported classroom maps into internal classroom model
- no external sync grants bank access by mistake

Rollback risk: high.

## Cross-phase Rules

- Bank ownership must be clear before delivery.
- Private/shared/public visibility must be explicit.
- Teacher/student/admin boundaries must remain separate.
- Review Draft gates must remain intact.
- No AI auto-publish.
- No migration rollback.
- No legacy tag resurrection.
- `taxonomy_*` remains the runtime taxonomy source of truth.
