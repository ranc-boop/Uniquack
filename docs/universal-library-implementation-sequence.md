# Universal Library Implementation Sequence

This is a planning document. Each phase should become a small PR with explicit product workflow, role boundaries, data ownership, tests, and rollback risk.

## Phase 0: Finalize Universal Library Docs

Goal:

- Land the product architecture, student/teacher boundary, entitlement, and implementation-sequence docs.

Non-goals:

- no runtime features
- no schema changes
- no route changes

Expected routes/files:

- `docs/universal-library-product-architecture.md`
- `docs/student-teacher-boundary-plan.md`
- `docs/entitlements-and-monetization-plan.md`
- `docs/universal-library-implementation-sequence.md`
- optional root doc alignment

Migration likely: no.

Smoke coverage:

- diff/status only

Rollback risk: low.

## Phase 1: Language / Model Alignment

Goal:

- Treat current Question Bank as the implementation foundation for Universal Library.
- Begin moving product language toward Library where appropriate.
- Preserve route stability and data contracts.

Non-goals:

- no schema rename
- no table rename
- no broad UI rewrite

Expected routes/files:

- `CONTEXT.md`
- `AGENTS.md`
- `DESIGN.md`
- teacher bank copy where safe
- future route map docs

Migration likely: no.

Smoke coverage:

- route smoke
- security smoke source checks
- no private/public leakage regression

Rollback risk: low/medium because copy affects product expectations.

## Phase 2: Student Workspace IA Doc And Shell

Goal:

- Define and implement a student workspace shell that is not a teacher shell.
- Add IA for My Work, Practice, Mistakes, Study Library, Study Groups, Public Library, and Progress.

Non-goals:

- no Study Group backend yet
- no public Library browse yet
- no entitlements enforcement beyond existing route guards

Expected routes/files:

- `src/app/student/page.tsx`
- `src/app/student/work/*`
- `src/app/student/library` placeholder
- `src/app/student/groups` placeholder
- student nav/shell components
- route smoke updates

Migration likely: no.

Smoke coverage:

- student routes require student
- student shell does not expose teacher/admin actions
- student cannot browse teacher private banks

Rollback risk: medium because it changes visible student IA.

## Phase 3: Student Practice Compatibility Fix

Goal:

- Fix the reported assignment-linked Practice issue such as `Key is not allowed`.
- Ensure bank questions assigned through classroom delivery can launch Practice cleanly.
- Ensure evidence writes link back to assignment, item, question, taxonomy, student, and classroom.

Non-goals:

- no Practice redesign
- no new AI behavior
- no student Library feature yet

Expected routes/files:

- `src/app/practice/*`
- `src/app/api/practice/*`
- `src/lib/practice/*`
- `src/lib/student-work.ts`
- assignment linkage helpers

Migration likely: maybe, only if a real schema blocker is found.

Smoke coverage:

- student starts assigned bank question
- progress/evidence writes
- teacher can read linked evidence
- unassigned private bank questions remain hidden

Rollback risk: medium/high because Practice is core student flow.

## Phase 4: Student Study Library Foundation

Goal:

- Add personal student Study Library foundations.
- Support saved questions, study sets, mistake sets, and public pulls.

Non-goals:

- no Study Groups yet
- no public verification yet
- no personal AI import unless separately approved

Expected routes/files:

- `src/app/student/library`
- `src/lib/libraries` or current bank helpers extended carefully
- Library UI components
- student smoke scripts

Migration likely: yes, if current bank schema cannot safely represent student-owned Libraries and study sets.

Smoke coverage:

- student creates private Study Library
- student saves assigned/public item
- teacher private bank remains hidden
- public pull preserves provenance

Rollback risk: high because it expands Library ownership beyond teachers.

## Phase 5: Student Self-study Feedback

Goal:

- Add private self-study feedback generation and storage.
- Feedback is private by default and can later be shared.

Non-goals:

- no teacher assignment feedback mutation unless explicitly scoped
- no Verified/public feedback yet
- no unrestricted provider usage

Expected routes/files:

- `feedback_runs`
- `feedback_items`
- student feedback routes/components
- provider gateway usage if approved in a separate PR

Migration likely: yes.

Smoke coverage:

- self-study feedback is private
- no teacher/class visibility unless shared or assigned
- provider calls are mocked in smoke
- quotas/entitlements enforced

Rollback risk: high because it introduces new generated student content.

## Phase 6: Study Group Foundation

Goal:

- Add peer-owned Study Groups for self-study collaboration.

Non-goals:

- no teacher classroom replacement
- no formal grading by default
- no school-wide open groups without policy

Expected routes/files:

- `src/app/student/groups`
- group tables
- group membership helpers
- shared study set / mistake set helpers

Migration likely: yes.

Smoke coverage:

- student can create group if entitled
- group members can read shared group items
- non-members blocked
- classroom access is not granted
- teacher private bank remains hidden

Rollback risk: high because it introduces social sharing.

## Phase 7: Public / Verified Library Foundation

Goal:

- Add public discovery, pull/fork/copy, and Verified review governance.

Non-goals:

- no direct Verified without review
- no private content leakage
- no arbitrary taxonomy creation

Expected routes/files:

- public `/library` or similar
- admin verification routes
- pull/fork/provenance helpers
- verified review queue

Migration likely: yes.

Smoke coverage:

- public Library browse sees only public/verified content
- pull creates private copy/reference with provenance
- fork preserves lineage
- submit to verified creates review item
- private content blocked from public search

Rollback risk: high because public visibility is safety-critical.

## Phase 8: Entitlements / Plan Flags

Goal:

- Add central entitlement/capability helpers for Free, Student Plus, Teacher Pro, School Student Lite, School Teacher, and Admin.

Non-goals:

- no payment processor unless explicitly scoped
- no scattered tier checks
- no role explosion

Expected routes/files:

- `src/lib/entitlements/*`
- profile/organization plan metadata
- route guard integration
- docs/tests

Migration likely: yes, for plan metadata if absent.

Smoke coverage:

- capabilities resolve consistently
- school policy can limit student public/Study Group features
- Teacher Pro can publish to classroom
- Free cannot create classroom
- admin governance remains separate

Rollback risk: high because entitlements touch many surfaces.

## Phase 9: Blueprint Generation / Course Builder Rebuild

Goal:

- Rebuild Blueprint generation and Course Builder as review-gated Library output flows.

Non-goals:

- no auto-publish
- no raw AI delivery to students
- no public Verified bypass

Expected routes/files:

- `/teacher/course-builder`
- `/teacher/blueprints`
- Library package helpers
- Review Draft integration
- provider execution if explicitly scoped

Migration likely: maybe.

Smoke coverage:

- generated output becomes Review Drafts
- approved output enters Library
- Publish only uses approved Library content
- source lineage preserved

Rollback risk: high because it crosses AI, Review Drafts, Library, and Publish.

## Phase 10: External Integrations

Goal:

- Add external integrations only after native Library, Classroom, Assignment, Practice, and entitlement models are stable.

Potential integrations:

- Google login
- Google Classroom roster import
- SIS import
- LTI

Non-goals:

- no replacement of native model
- no external sync that grants Library access by accident

Expected routes/files:

- account linking
- integration settings
- external roster mapping
- audit logs

Migration likely: yes.

Smoke coverage:

- native flows work without integration
- imported classroom maps into internal classroom model
- external roster membership does not grant source Library access
- disconnect/retry behavior is safe

Rollback risk: high because integrations can affect identity and school data.

## Cross-phase Rules

- Library ownership must be clear before delivery.
- Classroom is delivery and roster, not content ownership.
- Study Group is self-study collaboration, not classroom management.
- Teacher/student/admin workspace boundaries must remain separate.
- Visibility, membership role, and capability must remain separate concepts.
- No AI auto-publish.
- No unreviewed draft to students.
- No Verified status without review.
- No migration rollback.
- No legacy tag resurrection.
- `taxonomy_*` remains runtime taxonomy source of truth.
