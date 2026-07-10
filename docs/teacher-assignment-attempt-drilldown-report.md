# Teacher Assignment Attempt Drilldown

## Executive Summary

Assignment detail now gives teachers a bounded, assignment-specific view of
student Practice evidence. The page adds a completion and attention summary,
per-student totals, per-question performance, and expandable recent-attempt
cards. It does not change student work, provider behavior, publishing, or the
Review Draft gate.

## Product Workflow

This change strengthens the final insight stage of the bank-first workflow:

```text
Private material -> AI Parsing -> Review Drafts -> Question Bank -> Assignment
-> Student Practice -> assignment-linked teacher evidence
```

No old competition-demo implementation was reused; its product concepts were
not needed for this teacher evidence extension.

## Data and Helper Changes

`src/lib/teacher-assignments.ts` now reads only bounded, assignment-linked
evidence:

- active students from the managed classroom;
- progress rows and `assignment_practice_sessions` for the current assignment;
- Practice sessions referenced by those links;
- attempts whose session is linked to the assignment and whose
  `source_question_id` is a selected assignment question.

The helper additionally verifies that each attempt user matches the linked
student before it enters an aggregate. Reads use explicit projections and
limits. The helper has no writes, RPC calls, service-role access, provider
calls, or source-bank content queries.

Per-student evidence includes status, timestamps, linked-session count,
attempt/correct/incorrect/hint totals, and up to six recent safe answer and
result summaries. Per-question evidence includes the assignment item prompt,
type, difficulty, attempt/student counts, correct/missed counts, latest
activity, and a readable attention signal.

## Assignment Detail UI

The teacher assignment detail route now renders:

- an **Assignment evidence** header with completion rate, total attempts,
  students needing attention, and latest activity;
- a **Student progress** table with a jump link to evidence for each student;
- a **Question performance** table with prompt previews through `QuestionText`;
- an **Attempt drilldown** using native expandable disclosure cards;
- empty states for no roster, no selected questions, and pending evidence.

The page deliberately keeps raw session identifiers out of the teacher UI. It
states that evidence is assignment-linked only, private self-study is excluded,
source bank access remains teacher-private, and teacher feedback notes are a
later follow-up.

## Role and Ownership Boundaries

- Teachers can reach the detail helper only after `requireTeacher()` and the
  existing managed-classroom lookup.
- Attempts are limited to assignment-linked sessions for active classroom
  students; independent student self-study is excluded.
- Students receive only assigned question visibility through the existing
  assignment flow and cannot access this teacher drilldown or the source bank.
- This PR does not change bank membership, publication, assignment visibility,
  Review Draft approval, or student workspace behavior.

## Data and Rollback Risk

No migration was added and no Supabase schema/RLS policy changed. The feature is
read-only over existing assignment, Practice-session, and Practice-attempt
records. Rollback is limited to removing the additional teacher detail reads
and rendering; no persisted records require cleanup.

## Files Changed

- `src/lib/teacher-assignments.ts`
- `src/app/teacher/classrooms/[id]/assignments/[assignmentId]/page.tsx`
- `scripts/teacher-assignment-attempt-drilldown-smoke.mjs`
- `scripts/smoke-all.mjs`
- `scripts/security-smoke.mjs`
- `docs/teacher-assignment-attempt-drilldown-report.md`

## Smoke Coverage

`teacher-assignment-attempt-drilldown-smoke.mjs` verifies:

- evidence, student, question, and drilldown labels;
- assignment-session and selected-question attempt filters;
- bounded read-only/provider-free helper behavior;
- privacy copy and absence of raw session identifier rendering;
- the existing `/teacher/progress` link to assignment detail;
- no attempt-drilldown migration.

The aggregate smoke runner imports this focused smoke.

## Verification

Passed:

- `npm.cmd run lint`
- `npm.cmd run build`
- `node scripts/security-smoke.mjs`
- `node scripts/route-smoke.mjs` against a temporary local server on port 3011
- `node scripts/teacher-assignment-attempt-drilldown-smoke.mjs`
- `node scripts/teacher-progress-evidence-foundation-smoke.mjs`
- `node scripts/teacher-dashboard-real-data-smoke.mjs`
- `node scripts/classroom-ui-rebuild-smoke.mjs`
- `node scripts/assignment-practice-evidence-smoke.mjs`
- `node scripts/bank-import-review-smoke.mjs`
- `npm.cmd run smoke`
- `npm.cmd run perf:budget`

The live assignment-practice smoke confirmed the teacher can read scoped linked
evidence after a student starts assignment Practice. Aggregate smoke also
confirmed student assignment-only visibility and that private bank content does
not leak through public search or student bank access.

## Explicit Non-Goals

- No teacher feedback notes.
- No student self-study visibility.
- No migrations or RLS changes.
- No provider calls or provider configuration changes.
- No Blueprint generation.
- No Google Login or Google Classroom integration.
- No student workspace redesign.

## Next Recommendation

Add teacher feedback notes as a separate, explicitly scoped review-action flow
only after its authoring, visibility, and student-delivery boundaries are
defined.
