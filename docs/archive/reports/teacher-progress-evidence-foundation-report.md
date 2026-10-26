# Teacher Progress / Evidence Foundation Report

Date: 2026-07-09

## Executive Summary

`/teacher/progress` is now a real cross-class evidence dashboard instead of a module shell.

It completes the visible teacher loop:

```text
Private source
-> AI Parsing
-> bank-scoped Review Draft
-> Question Bank approval
-> classroom assignment
-> student Practice
-> assignment-linked evidence
-> teacher Progress / Feedback
```

The dashboard is read-only. It does not publish content, change student progress, call an AI provider, or expose private student self-study.

## Data Helper Summary

Added `src/lib/teacher-progress.ts` as a server-only evidence aggregator.

The helper reads only existing teacher-scoped clean-schema data:

- active `classrooms`
- active student `classroom_members`
- assigned and draft `assignments`
- `student_assignment_progress`
- `assignment_practice_sessions`
- only the `practice_sessions` referenced by those assignment links
- only the `practice_attempts` referenced by those linked sessions
- bounded student profile labels

Every query has an explicit field list and hard limit. The helper does not use `select("*")`, mutations, RPCs, service-role credentials, provider settings, Question Bank rows, or source draft data.

Not-started counts are derived from the active classroom roster. Removed students and unlinked self-study sessions do not contribute to teacher evidence.

## What `/teacher/progress` Shows

The page now includes:

- Active classes
- Active assignments and saved draft assignment count
- Cross-class completion rate
- Unique students needing attention
- Recent assignment-linked evidence count
- Needs-attention queue
- Recent evidence feed
- Responsive assignment progress table/cards
- Direct links to classroom assignment detail
- Empty states for no classrooms, no assigned work, and no evidence

The teacher dashboard progress metrics now link to `/teacher/progress`. Classroom Analytics / Feedback also includes an `All progress` link.

## Needs-Attention Logic

An assigned item enters the attention queue when current bounded evidence indicates one or more of:

- overdue work with incomplete students
- work due within seven days with incomplete students
- completion below 50 percent after work has started
- at least three attempts with a wrong-answer rate of 50 percent or higher

Each queue row shows:

- assignment and classroom
- due date
- incomplete count
- completion rate
- recent wrong / attempt count
- number of students represented by the signal
- assignment detail link

The overview counts unique students across the visible attention assignments.

## Recent Evidence Logic

Recent evidence starts from `assignment_practice_sessions`. The helper then reads only those linked Practice session IDs and their attempts.

The feed shows:

- student label
- assignment and classroom
- correct / attempt count
- wrong count
- latest linked activity
- assignment detail link

The overview recent-evidence count uses a 14-day window. The feed is bounded to the 12 latest linked sessions.

## Privacy And Scope Boundaries

Confirmed:

- Teacher evidence is limited to active classroom assignments.
- Private student self-study is not included.
- Source Question Banks and Review Drafts are not queried or linked from this page.
- Classroom membership still does not grant source-bank access.
- Draft assignments remain teacher-only.
- No teacher feedback notes were added.
- No student workspace code changed.
- No provider credentials or provider paths changed.

## Files Changed

- `src/lib/teacher-progress.ts`
- `src/app/teacher/progress/page.tsx`
- `src/components/teacher/teacher-dashboard-panels.tsx`
- `src/app/teacher/classrooms/[id]/analytics/page.tsx`
- `scripts/teacher-progress-evidence-foundation-smoke.mjs`
- `scripts/smoke-all.mjs`
- `docs/teacher-progress-evidence-foundation-report.md`

## Smoke Coverage

Added `scripts/teacher-progress-evidence-foundation-smoke.mjs` and registered it in the aggregate smoke runner.

Coverage verifies:

- `/teacher/progress` is no longer a coming-soon shell
- required progress and evidence labels render
- the helper is server-only, read-only, field-bounded, and query-bounded
- Practice data is followed only through assignment linkage
- privacy and source-bank boundary copy renders
- dashboard and classroom analytics links point to `/teacher/progress`
- no provider path is introduced
- no clean migration is added

## Tests Run

Passed:

- `npm.cmd run lint`
- `npm.cmd run build`
- `node scripts/security-smoke.mjs`
- `node scripts/route-smoke.mjs`
- `node scripts/teacher-progress-evidence-foundation-smoke.mjs`
- `node scripts/teacher-dashboard-real-data-smoke.mjs`
- `node scripts/classroom-ui-rebuild-smoke.mjs`
- `node scripts/assignment-practice-evidence-smoke.mjs`
- `node scripts/bank-import-review-smoke.mjs`
- `npm.cmd run smoke`
- `npm.cmd run perf:budget`

Notes:

- Route smoke passed against an isolated local server on `127.0.0.1:3011`.
- Live classroom, assignment-evidence, and bank-review smokes passed against the configured clean Supabase environment with scoped cleanup.
- The restricted sandbox initially denied live network access with `EACCES`; the same checks passed when rerun with approved network access.

## Remaining Blockers

No blocker remains for the read-only evidence foundation.

Future product work can add teacher-authored feedback notes and deeper taxonomy mastery summaries after their review and privacy contracts are defined.

## Explicit Non-Goals

- No teacher feedback notes
- No student self-study visibility
- No migrations
- No provider calls
- No Blueprint generation
- No Google Login or Google Classroom
- No student workspace redesign

## Product And Rollback Notes

- Product workflow touched: assignment -> Practice evidence -> teacher insight.
- Role boundary: teacher reads managed classroom evidence; student and admin workspaces are unchanged.
- Data ownership: only assignment-linked classroom evidence is surfaced.
- Old demo overlap: not applicable; no old demo branch code was used.
- Migration/data risk: none; the change is read-only and adds no schema.
- Rollback risk: low. Reverting the helper, page, link updates, smoke, and report restores the prior shell without data changes.
