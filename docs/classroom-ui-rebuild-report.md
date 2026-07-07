# Classroom UI Rebuild Report

## Executive summary

Rebuilt the teacher classroom surface around the bank-first product model:

```text
Question Bank / Blueprint
-> Publish selected work
-> Classroom roster and delivery evidence
```

No database migration was added. No provider, AI Parsing, Blueprint generation, Review Draft, or student UI behavior was changed.

## `/teacher/classrooms` card grid result

- Remodels the classroom index into a Google-Classroom-like class card grid.
- Keeps the old-demo-derived teacher visual skin: pale sky/slate background, translucent white panels, sky/blue primary actions, slate text, semantic badges.
- Shows class name, subject, status, active students, active assignments, drafts, latest assignment, latest activity, completion rate when data exists, and linked Blueprint context when available.
- Adds primary `Create Class` CTA and secondary `Publish to classes` CTA pointing to `/teacher/publish`.
- Empty state now says: "No classes yet. Create your first class after your banks are ready."

## Class detail overview result

- `/teacher/classrooms/[id]` is now the default class workspace overview.
- Adds class cover/header, teacher-visible join code, top section tabs, bounded metrics, completion ring, recent assignments, students-needing-attention summary, People preview, Analytics / Feedback handoff, and Linked Blueprint context.
- Keeps classroom as roster/delivery layer, not content source of truth.

## People section result

- Added `/teacher/classrooms/[id]/people`.
- Shows teachers, students, status, role, joined date, visible join code, and explicit copy: joining a class does not grant access to teacher source banks.
- Adds a safe soft-remove action for active student memberships by setting `classroom_members.status = "removed"`.
- Does not hard-delete roster rows or evidence.

## Assignments section result

- Existing `/teacher/classrooms/[id]/assignments` now includes class section tabs and clearer Publish relationship copy.
- Assignment history remains class-specific and shows draft / assigned / archived groups.
- Class-local `New assignment` remains as a compatibility shortcut, while `/teacher/publish` is presented as the primary distribution workflow.

## Analytics / Feedback section result

- Added `/teacher/classrooms/[id]/analytics`.
- Shows real assignment completion summaries, linked Practice session counts, latest activity, and class completion rate.
- Shows honest placeholders for taxonomy mastery, mistake patterns, and feedback drafting.
- Does not fake analytics data or implement a full analytics engine.

## Linked Blueprints section result

- Added `/teacher/classrooms/[id]/blueprints`.
- Shows bank-linked assignment context when available.
- Otherwise shows a clean placeholder directing teachers to Blueprint Library.
- Does not generate Blueprints or deliver Blueprints directly to students.

## Settings section result

- Added `/teacher/classrooms/[id]/settings`.
- Shows class identity, subject, description, created/updated times, status, and visible join code.
- Archive/delete controls remain a placeholder because lifecycle/destructive controls are outside this PR.

## Publish relationship result

- Classroom pages point to `/teacher/publish`.
- Copy clarifies: Publish distributes work; Classroom views class-specific roster, delivery, and evidence.
- No full Publish Center was implemented.

## Teacher/student shell separation result

- All classroom teacher routes use teacher guards and teacher navigation.
- Student routes are unchanged.
- Student class visibility remains assignment/class-membership scoped and does not grant bank browsing.

## Smoke coverage

Added `scripts/classroom-ui-rebuild-smoke.mjs` and wired it into `scripts/smoke-all.mjs`.

Coverage verifies:

- classroom card grid source language
- class detail overview source language
- top section tabs: Overview, People, Assignments, Analytics / Feedback, Linked Blueprints, Settings
- Publish CTA relationship
- People section bank boundary copy
- safe soft-remove action source
- Analytics placeholders are honest
- Linked Blueprints does not implement generation
- Settings does not enable destructive lifecycle actions
- real teacher can create a smoke class
- unrelated student cannot read/create teacher classroom data

## Tests run/results

- `npm.cmd run lint` passed
- `npm.cmd run build` passed
- `node scripts/security-smoke.mjs` passed
- `node scripts/route-smoke.mjs` passed with temporary local dev server
- `node scripts/supabase-rls-smoke.mjs` passed
- `node scripts/question-bank-foundation-smoke.mjs` passed
- `node scripts/bank-share-members-smoke.mjs` passed
- `node scripts/bank-import-review-smoke.mjs` passed
- `node scripts/assignment-from-bank-smoke.mjs` passed
- `node scripts/teacher-workspace-shell-smoke.mjs` passed
- `node scripts/question-bank-ui-remodel-smoke.mjs` passed
- `node scripts/teacher-ai-parsing-bank-targeting-smoke.mjs` passed
- `node scripts/blueprint-library-foundation-smoke.mjs` passed
- `node scripts/classroom-ui-rebuild-smoke.mjs` passed
- `npm.cmd run smoke` passed
- `npm.cmd run perf:budget` passed

## Remaining blockers

- `/teacher/publish` remains the top-level publish placeholder/workflow shell; full Publish Center is intentionally not implemented here.
- Full analytics engine, taxonomy mastery aggregation, mistake-pattern clustering, and teacher feedback drafting remain future work.
- Direct class-to-Blueprint linking is not implemented; current context is inferred from bank-linked assignments when available.
- Class archive/delete lifecycle actions remain intentionally disabled in this UI slice.

## Explicit non-goals

- no full Publish Center
- no Google Classroom integration
- no full analytics engine
- no Blueprint generation
- no provider calls
- no public pull/private push
- no student UI redesign
- no wearable UI
