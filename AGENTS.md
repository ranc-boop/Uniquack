# EduStruct Agent Guardrails

These instructions apply to the whole repository.

## Prime Directive

EduStruct is not:

- a generic AI tutor
- a route demo
- a mock-only LMS
- a question generator only

EduStruct is a **Private Multimodal Mastery Engine**.

Core workflow:

```text
Private/owned materials
-> AI Parsing
-> Review Drafts
-> Question Bank / Library
-> Assignment
-> Practice Evidence
-> Teacher insight
```

Future agents must protect that workflow before adding features.

## Bank-first Product Rule

Teacher and user workflows start with a Question Bank / Library, not a classroom.

Correct order:

```text
Teacher/User creates or joins bank
-> imports/pulls/reviews/organizes questions
-> creates classroom/course
-> assigns selected bank content
-> student practices
-> evidence returns
```

Question Banks are the content source of truth.

Classrooms are roster and delivery layers.

Assignments are delivery events.

Do not make a classroom-first shortcut the primary teacher workspace.

## Role Boundaries

Admin owns platform operations:

- provider settings
- global taxonomy
- public/global bank governance
- system review/support
- users and organization support

Teacher owns learning operations:

- private/shared banks
- imports
- Review Drafts
- bank questions
- classrooms
- assignments
- progress

Student owns learning activity:

- joined classrooms
- My Work
- Practice
- mistakes/progress

Never treat admin-as-teacher smoke as enough product validation. Teacher pages must be visible, navigable, and validated as teacher flows.

## Content Ownership

The product must distinguish:

- teacher private bank
- shared/collaborative bank
- organization bank
- public/global bank
- assignment-only student visibility

Student joining a classroom does not mean the student can browse a teacher bank.

Assignment visibility is not global publishing.

Private teacher content is private by default.

## Review Safety Gates

No AI auto-publish.

Review Draft approval is required before student assignment.

No unreviewed AI draft can be assigned to students.

No push or promote to public bank without a review gate.

Preserve source lineage such as `source_review_item_id` where relevant.

## Supabase And Migration Safety

Do not touch old Supabase.

Do not edit the old migration chain.

Do not delete committed clean migrations.

Applied migrations must be corrected forward-only.

Do not commit `.env.local` or secrets.

Do not print provider keys, anon keys, service role keys, DB passwords, tokens, or credential-bearing URLs.

## Old Demo Reuse Rule

The old competition demo is a conceptual product reference, not a branch to blindly restore.

Preserve conceptually:

- Teacher Studio landing
- Course Builder hub
- teacher-scoped AI PDF imports
- package/framework preview
- private course questions
- generated exam-style questions
- teacher report/thread evidence later

Do not restore into MVP:

- wearable/fatigue UI as normal product
- presentation-only demo pages
- auto-approve or fake publish flows

## PR Requirements

Every feature PR must state:

- goal
- non-goals
- product workflow touched
- role boundaries touched
- data ownership touched
- old demo overlap inspected or not applicable
- migrations/data risk
- smoke/tests
- rollback risk

For broad product work, do not jump directly into coding. First clarify scope, domain model, role boundaries, data ownership, safety gates, tests, and rollback risk.

## Testing Expectations

Feature PRs should run the relevant subset of:

```bash
npm.cmd run lint
npm.cmd run build
node scripts/security-smoke.mjs
node scripts/supabase-rls-smoke.mjs
node scripts/route-smoke.mjs
npm.cmd run smoke
npm.cmd run perf:budget
```

Also run workflow-specific smoke scripts when they exist.

Use test-first or repro-first for bugs. Capture the failing behavior before patching when possible.

## Stop-and-Ask Triggers

Stop before coding if:

- bank ownership is unclear
- private/public/shared visibility is unclear
- admin/teacher/student boundary is unclear
- old demo feature overlap exists but was not inspected
- migration rollback is requested
- a route-only implementation would bypass product workflow

