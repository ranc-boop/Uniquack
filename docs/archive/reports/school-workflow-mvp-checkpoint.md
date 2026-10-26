# School Workflow MVP Checkpoint

Date: 2026-07-04

## Executive Summary

EduStruct now has a clean local-dev school workflow MVP running on the clean Supabase baseline.

The validated product path is:

Teacher creates classroom -> student joins classroom -> teacher assigns published Question Bank questions -> student sees work in My Work -> student starts assignment-linked Practice -> Practice evidence updates assignment progress -> teacher sees a progress summary.

This checkpoint is documentation only. It does not add runtime code, migrations, seeds, users, provider credentials, SQL, Course Builder bridge logic, Google Classroom integration, or wearable/state-aware UI.

## Completed Foundations

### Clean Supabase Baseline

The old Supabase project is treated as legacy/archive material. The current local-dev baseline uses the clean Supabase schema and reports that verified:

- clean migrations applied and aligned on the disposable clean project
- clean seed rehearsal completed separately
- local dev switched to the clean Supabase environment
- forbidden legacy analytics/page-visit/five-facet runtime objects were excluded from the clean baseline

### Provider Gateway Setup

The clean provider gateway setup is in place:

- gateway token hash setup exists through a service-role-only RPC/helper path
- provider profile constraints were patched to match current provider modes
- provider keys remain server/admin-managed
- provider secrets are not exposed to client UI or committed files

### AI Parsing To Review Drafts

AI PDF import can hand generated drafts to Review Drafts with visible handoff UX:

- completed imports show Review Draft navigation
- Review Draft cards surface provenance and warnings
- generated questions remain private drafts until reviewed
- no auto-publish path was introduced

### Review Draft To Question Bank

Review Draft approval lineage is part of the safety baseline:

- generated-question publishing requires review lineage
- `source_review_item_id` is required for AI/blueprint-generated question publish paths
- taxonomy assignment approval is not allowed to bypass review lineage
- published Question Bank questions remain the assignable source for teacher assignment flow

### Question Bank To Practice

The Question Bank and Practice Agent baseline is validated:

- published questions can be used by Practice
- Practice sessions, rounds, attempts, wrong-question history, and preference evidence use clean schema tables
- Practice maintains owner-scoped RLS
- current Practice schema versioning rejects stale session shapes

### Classroom / Join-Code Foundation

Native classroom support is implemented:

- `classrooms`
- `classroom_members`
- `classroom_join_codes`
- hash-only join code storage
- authenticated join RPC
- teacher classroom list/detail/roster routes
- student classroom join/list routes

### Student My Work

Student My Work is implemented:

- `/student/work`
- `/student/work/[id]`
- assigned work list
- assignment detail
- progress status
- Practice entry point
- classroom-scoped student read access

### Teacher Assignment Flow

Teacher assignment flow is implemented:

- `/teacher/classrooms/[id]/assignments`
- `/teacher/classrooms/[id]/assignments/new`
- `/teacher/classrooms/[id]/assignments/[assignmentId]`
- assignment creation from published Question Bank questions
- draft vs assigned visibility
- student handoff into My Work

### Assignment Practice Evidence

Assignment-linked Practice evidence is implemented:

- `/practice?assignmentId=<id>` starts an assignment-linked Practice session
- assigned published question items become deterministic Practice recommendations
- `assignment_practice_sessions` links assignment, student, and Practice session
- `student_assignment_progress` updates when Practice starts and after linked practice evidence
- teacher assignment detail shows student progress counts and latest Practice evidence timestamp

## End-To-End Validated Workflow

1. Teacher creates a classroom in `/teacher/classrooms`.
2. The app creates the classroom, teacher membership, and hash-only join-code record.
3. Student joins through `/student/classrooms/join` with the classroom code.
4. Teacher opens the classroom assignment flow and creates an assignment from published Question Bank questions.
5. Assigned work appears in `/student/work` for active classroom members.
6. Student opens `/student/work/[id]` and starts Practice.
7. `/practice?assignmentId=<id>` validates assigned student access and starts an owned Practice session.
8. Practice session evidence links back through `assignment_practice_sessions`.
9. `student_assignment_progress` moves to `in_progress` or `completed` based on linked question evidence.
10. Teacher opens assignment detail and sees student progress summary.

## Current Route Map

### Admin / Import / Review / Question / Provider

- `/admin`
- `/admin/ai-settings`
- `/admin/imports`
- `/admin/imports/pdf`
- `/admin/imports/assets`
- `/admin/imports/package`
- `/admin/review`
- `/admin/questions`
- `/admin/tags`
- `/admin/users`
- `/admin/videos`
- `/admin/practice-frameworks`
- `/admin/blueprints`
- `/admin/blueprints/review`
- `/admin/blueprints/library`
- `/admin/blueprints/history`
- `/admin/blueprints/sources`
- `/api/admin/imports/pdf/segment-preview/[batchId]/[chunkIndex]`
- `/api/tags/published`

### Teacher Classroom / Assignment

- `/teacher`
- `/teacher/classrooms`
- `/teacher/classrooms/[id]`
- `/teacher/classrooms/[id]/assignments`
- `/teacher/classrooms/[id]/assignments/new`
- `/teacher/classrooms/[id]/assignments/[assignmentId]`

### Student Classroom / Work

- `/student`
- `/student/classrooms`
- `/student/classrooms/join`
- `/student/work`
- `/student/work/[id]`

### Practice

- `/practice`
- `/mistakes`
- `/api/practice/assignments/start`
- `/api/practice/sessions`
- `/api/practice/sessions/[sessionId]`
- `/api/practice/sessions/title`
- `/api/practice/recommend`
- `/api/practice/review`
- `/api/practice/grade`
- `/api/practice/hint`
- `/api/practice/rounds/custom`
- `/api/practice/wrong-questions`
- `/api/practice/preferences`
- `/api/practice/preferences/merge/run`
- `/api/practice/course-frameworks`

### Public Question / Video

- `/questions`
- `/questions/[id]`
- `/videos`
- `/videos/[id]`

## DB / Schema Baseline

### Identity And Organization

- `organizations`
- `profiles`
- `organization_members`
- role/status/default organization contracts

### Classroom

- `classrooms`
- `classroom_members`
- `classroom_join_codes`
- hash-only join-code helpers
- classroom read/manage RLS helpers

### Assignments

- `assignments`
- `assignment_items`
- `student_assignment_progress`
- `assignment_practice_sessions`
- assignment manager/read helper functions

### Questions / Taxonomy / Review Lineage

- `questions`
- `question_assets`
- `question_taxonomy_assignments`
- `taxonomy_facets`
- `taxonomy_nodes`
- `review_items`
- `review_actions`
- review lineage publish RPCs
- taxonomy search RPC

### Practice Sessions / Evidence

- `practice_sessions`
- `practice_rounds`
- `practice_round_questions`
- `practice_attempts`
- `practice_wrong_questions`
- `practice_agent_episodes`
- `user_practice_preferences`
- `practice_preference_merge_jobs`

### Provider Gateway / Profiles

- `ai_provider_profiles`
- provider operation logs
- private provider gateway token hash storage
- service-role-only gateway setup RPC

## Safety Invariants

- AI output is not auto-published.
- Review Draft approval is required before generated questions enter the published Question Bank.
- `source_review_item_id` lineage is required for AI import / blueprint-generated publish paths.
- Teacher, student, and admin boundaries are improving through native route families and RLS scopes.
- Students can read only assigned work for active classroom memberships.
- Students can write only their own assignment progress.
- Teachers manage assignments only for managed classrooms.
- Join codes are hash-only in the database.
- Old Supabase is legacy/archive and should not be treated as a source to apply directly.
- Wearable UI is not part of the product MVP.
- Provider keys remain server/admin-managed and must not be printed or committed.

## Smoke / Test Baseline

Latest completed slices report the following checks passing:

- `npm.cmd run lint`
- `npm.cmd run build`
- `node scripts/security-smoke.mjs`
- `node scripts/supabase-rls-smoke.mjs`
- `node scripts/route-smoke.mjs`
- `npm.cmd run smoke`
- `node scripts/classroom-foundation-smoke.mjs`
- `node scripts/student-my-work-smoke.mjs`
- `node scripts/teacher-assignment-flow-smoke.mjs`
- `node scripts/assignment-practice-evidence-smoke.mjs`
- `node scripts/batch-import-smoke.mjs`
- `node scripts/question-assets-security-smoke.mjs`
- `node scripts/bulk-asset-import-smoke.mjs`
- `node scripts/package-import-smoke.mjs`
- `node scripts/markdown-latex-editor-smoke.mjs`
- `npm.cmd run perf:budget`

Some Supabase-backed checks require normal network access because the sandbox can report `fetch failed`.

## Known Limitations / Not Done

- No Course Builder to Assignment bridge yet.
- No full teacher analytics dashboard yet.
- No Google login or Google Classroom import yet.
- No enterprise workflow yet.
- No wearable UI migration into the core product MVP.
- Real AI provider output quality still needs ongoing QA as prompts and review policies evolve.
- Old legacy/deprecated compatibility objects should receive future schema hygiene review.
- Production/deployment is not applicable until the user explicitly adds hosting/cutover requirements.

## Recommended Next Product Slice

Recommended next slice: **Course Builder -> Assignment Bridge**.

Why this is next:

- The classroom, assignment, My Work, Practice evidence, Review Draft, and Question Bank loop now exists.
- Course Builder / Blueprint planning can become useful only when it can safely create teacher-owned draft assignments.
- The bridge should preserve existing review gates and never auto-publish AI output directly to students.
- It connects planning to the newly validated classroom loop rather than creating another isolated AI surface.

## Suggested Next PR Plan

1. **Course Builder Assignment Bridge**
   - Turn approved Course Builder / Blueprint planning outputs into teacher-owned draft assignments.
   - Use only reviewed/published Question Bank questions or approved blueprint-generated drafts.
   - Keep student visibility off until teacher explicitly assigns.

2. **Teacher Progress UI Polish**
   - Improve assignment detail progress display.
   - Add student rows, latest activity, completion state, and mistake/evidence summaries.
   - Avoid building a broad analytics dashboard too early.

3. **Student My Work Polish**
   - Improve due-date grouping, in-progress continuation, completed work history, and empty states.
   - Keep Practice as the learning engine.

4. **Google Login / Account Binding**
   - Add Google OAuth sign-in/linking before Google Classroom sync.
   - Preserve native users/profiles as the internal source of truth.

5. **Google Classroom Roster Import**
   - Import Classroom courses and rosters into native `classrooms` and `classroom_members`.
   - Do not replace the native classroom model.

6. **Enterprise Training Later**
   - Treat enterprise workflows as a later packaging layer after the school MVP is stable.

## Validation For This Docs-Only Checkpoint

This checkpoint inspected current reports, route files, smoke scripts, and the current route tree. Runtime tests were not rerun because this PR changes only documentation and does not modify code, migrations, seeds, or configuration.
