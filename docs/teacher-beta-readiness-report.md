# Teacher Beta Readiness Report

Date: 2026-07-10

## Executive Summary

Teacher V1 is **ready for closed beta** on the clean Supabase environment.
The bank-first loop is connected and covered by live cleanup-backed smoke
fixtures:

```text
Private source -> AI Parsing -> Review Draft -> Question Bank
-> Blueprint optional -> Publish -> Classroom assignment
-> Student Practice -> teacher evidence -> teacher feedback
```

This audit fixed three integration defects without changing data ownership,
schema, providers, or review gates:

- Teacher navigation now exposes the active module with `aria-current` and a
  visible active state.
- Classroom Overview, Classroom Analytics, and Progress now point teachers to
  the live assignment feedback workflow instead of calling it future work.
- Shared action errors redact database/network/credential-shaped messages
  before a teacher can see them in a query-string alert.

No AI output is auto-published, no classroom member receives source-bank
access, and no Blueprint bypasses bank-scoped Review Draft approval.

## Teacher V1 Capability Inventory

| Capability | Current behavior | Boundary |
| --- | --- | --- |
| Dashboard | Real review, import, publish, classroom, and evidence summaries | Teacher-only workspace |
| Question Bank | Create, join, share, import, review, curate, source/membership views | Bank roles control access |
| AI Parsing | Bank-targeted private source import, status history, retryable status | Provider resolved server-side; output is draft-only |
| Review Drafts | Inspect, edit, needs-fix, reject, approve into bank | Mandatory review gate |
| Blueprint Library | Build from bank examples, inspect readiness, generate Review Drafts | No direct delivery |
| Publish Center | Select approved content, save a draft, or assign to active classroom | Assignment-only visibility |
| Classrooms | Roster, join code, archive/reopen, teachers, students, operation views | No implicit bank membership |
| Progress | Assignment-linked Practice evidence and drilldown | Private self-study excluded |
| Feedback | Private notes or explicit student-visible notes from assignment detail | Scoped to assignment and selected student |

## Full Workflow QA

| Handoff | Result | Coverage |
| --- | --- | --- |
| Dashboard -> Question Bank | Review, import, publish, and create-bank actions remain visible. | Source/static, route smoke |
| Bank -> AI Parsing | `target_bank_id` is server-verified and preserved. | Live teacher AI Parsing fixture |
| AI Parsing -> Review Draft | Drafts stay private, bank-owned, and review-gated. | Source/static and live import/review fixture |
| Review Draft -> Bank | Approval creates an active `bank_questions` row without global publish. | Live bank-import/review fixture |
| Bank -> Blueprint | Teacher can create a private Blueprint from approved bank examples. | Live Blueprint Builder fixture |
| Blueprint -> Review Draft | Manual generation remains private and pending taxonomy review. | Live mock-safe Blueprint fixture; no paid provider call in this PR |
| Bank -> Publish | Only approved active bank questions and active classrooms are accepted. | Live Publish Center fixture |
| Publish -> Student My Work | Draft is teacher-only; assigned items appear only to class members. | Live assignment/Publish fixtures |
| My Work -> Practice | Assignment-scoped private bank question loads through `/practice?assignmentId=...`. | Live Practice-evidence fixture |
| Practice -> evidence | Attempts/progress return to teacher assignment/progress surfaces. | Live evidence and drilldown fixtures |
| Evidence -> feedback | Teacher saves private note or sends student-only feedback. | Live feedback fixture |
| Classroom lifecycle | Archive blocks new joins/assignment targets and preserves history. | Live Classroom Operations fixture |

## Route Inventory

There is no `/teacher/banks/[bankId]/import`; the actual route is `/imports`.
There is no classroom `/progress`; `/analytics` is the classroom progress route.

| Route | Purpose / primary action | State and safe destination |
| --- | --- | --- |
| `/teacher` | Dashboard; create, import, review, or publish | Teacher guard; summary-driven primary action |
| `/teacher/banks` | Question Bank registry | Empty: create or join bank |
| `/teacher/banks/new` | Create bank | Pending submit; opens created bank |
| `/teacher/banks/join` | Join collaborative bank by code | Pending submit; opens joined bank |
| `/teacher/banks/[bankId]` | Bank workbench | Tabs retain bank context; setup/not-found handling |
| `/teacher/banks/[bankId]/imports` | Private PDF import | Owner/editor only; no-provider/viewer/retry/zero-draft states; success goes to review |
| `/teacher/banks/[bankId]/review` | Review Draft QA | Edit, needs-fix, reject, approve; stays on bank review route |
| `/teacher/banks/[bankId]/questions` | Approved bank question list | Empty: import/review first |
| `/teacher/banks/[bankId]/blueprints` | Bank-linked Blueprint view | Empty: create Blueprint from approved questions |
| `/teacher/banks/[bankId]/members` | Members and share codes | Viewer is read-only |
| `/teacher/banks/[bankId]/sources` | Source lineage | Explicit setup/error recovery |
| `/teacher/banks/[bankId]/settings` | Bank configuration | No public/review bypass |
| `/teacher/banks/[bankId]/assignments/new` | Bank-context assignment shortcut | Approved content only |
| `/teacher/ai-parsing` | Bank-targeted AI Parsing entry | Empty: create/join bank; provider stays non-vendor-specific |
| `/teacher/blueprints` | Blueprint Library | Empty: create Blueprint |
| `/teacher/blueprints/new` | Blueprint Builder | Manageable bank + approved source questions required |
| `/teacher/blueprints/[blueprintId]` | Blueprint readiness/generation | Blocking reasons shown; output only to Review Drafts |
| `/teacher/publish` | Distribution workbench | Server rechecks bank, selection, role, active classroom |
| `/teacher/classrooms` | Classroom list/create | Empty: create classroom; archive status visible |
| `/teacher/classrooms/[id]` | Classroom overview | Links to roster, assignments, analytics, settings |
| `/teacher/classrooms/[id]/assignments` | Assignment history | Primary action leads to Publish Center |
| `/teacher/classrooms/[id]/assignments/new` | Classroom shortcut | Archived classroom directs teacher to reopen |
| `/teacher/classrooms/[id]/assignments/[assignmentId]` | Evidence drilldown and feedback | Private/sent feedback remains scoped |
| `/teacher/classrooms/[id]/students` | Active/removed roster | Soft remove/restore preserves evidence |
| `/teacher/classrooms/[id]/teachers` | Co-teacher operations | Classroom capability only; no bank grant |
| `/teacher/classrooms/[id]/analytics` | Completion/progress summary | Assignment detail is the feedback destination |
| `/teacher/classrooms/[id]/blueprints` | Linked planning context | Reference-only, no direct delivery |
| `/teacher/classrooms/[id]/settings` | Join-code and lifecycle controls | Archive blocks new joins and assignment targets |
| `/teacher/classrooms/[id]/people` | Compatibility route | Redirects to Students |
| `/teacher/progress` | Cross-class evidence | Empty states direct to Classroom or Publish |
| `/teacher/course-builder` | Compatibility bridge | Secondary to bank-first workflow; retains gates |

All major teacher pages require the teacher guard. AI Parsing/bank import have
explicit loading states; server-action forms use pending-submit controls. Missing
schema capability is shown as setup-needed rather than a crash. The new shared
error guard returns a safe recovery message rather than raw database text.

## Navigation and Naming

The teacher navigation always exposes Dashboard, Question Bank, AI Parsing,
Blueprint, Classroom, Publish, and Progress. Nested bank/classroom routes now
show the current module. Review Drafts remain bank-contextual but are reachable
from both Dashboard review work and bank tabs.

`Library` is the broad product term. `Question Bank` remains the precise content
workflow term. `Publish` means assignment delivery, never global public release.
Blueprint means planning/generation-to-review, never direct student delivery.

## Empty, Error, and Recovery States

- No bank: create/join a bank before import.
- Empty bank or no approved content: import then review.
- Pending drafts/no approved questions: open review before publish.
- Empty Blueprint Library: create from approved bank examples.
- Blueprint not ready: visible blocking reasons and disabled generation.
- No publishable content/classrooms/evidence/feedback: page-specific valid next
  action, not fake sample data.
- Archived classroom: reopen before student joins or new assignment creation.
- No enabled provider: import is disabled with admin-control-plane guidance only.
- Transient provider issue: existing retryable status preserves source and bank,
  and says no questions were published or assigned.

## Role and Permission Result

| Actor | Result | Evidence |
| --- | --- | --- |
| Bank owner | Can create/manage/import/review/publish | Live bank/import/publish fixtures |
| Bank editor | Role is grantable; management path is source/RLS covered | Live role change plus static coverage |
| Bank viewer | Cannot manage imports, review, or share-code changes | Live bank-share fixture |
| Classroom owner | Manages class, roster, join code, lifecycle, co-teachers | Live classroom fixture |
| Co-teacher | Source/RLS covered only | See manual acceptance item below |
| Unrelated teacher | Denied private bank, Blueprint, and feedback reads | Live boundary fixtures |
| Student | Assigned items only; no source bank/Blueprint/private note access | Live assignment/Blueprint/feedback fixtures |
| Anonymous | Denied private classroom, bank, and feedback reads | Live RLS fixtures |
| Admin support | Separate guard path; not substituted for teacher validation | Security and route coverage |

## Responsive and Manual QA

The local app was checked at 1440px, 1024px, 768px, and 390px. The available
in-app browser had no authenticated teacher session, so `/teacher` correctly
redirected to login with `next=/teacher` at every size. That surface had no
horizontal overflow.

Authenticated responsive layouts are source/static covered by wrapped actions,
mobile card/table variants, and route smoke. A signed-in visual QA pass with
representative bank/review/classroom data is still a closed-beta acceptance item.
No screenshots were committed.

## Deployment Readiness

- Environment variable names only: `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` or
  `CLEAN_SUPABASE_SERVICE_ROLE_KEY` for smoke infrastructure, and existing
  server-only AI gateway/encryption settings where parsing is enabled.
- Teacher UI source checks confirm no provider key, model/profile identifier,
  gateway token, encrypted credential field, or admin provider-settings link.
- Full smoke successfully applied the local clean migration baseline and ran the
  Google account-links embedded harness with 36 passing checks. It did not apply
  remote migrations.
- Live Teacher Feedback smoke passing confirms the expected 0032 feedback
  objects are available in the configured clean environment.
- The readiness smoke found no active teacher-runtime legacy Supabase path,
  hard-coded user-specific Windows path, or raw debug surface.

## Files Changed

- `src/components/teacher/teacher-workspace-nav.tsx`
- `src/app/teacher/page.tsx`
- `src/app/teacher/progress/page.tsx`
- `src/app/teacher/classrooms/[id]/page.tsx`
- `src/app/teacher/classrooms/[id]/analytics/page.tsx`
- `src/lib/actions/feedback.ts`
- `scripts/teacher-beta-readiness-smoke.mjs`
- `scripts/teacher-progress-evidence-foundation-smoke.mjs`
- `scripts/classroom-ui-rebuild-smoke.mjs`
- `scripts/smoke-all.mjs`
- `docs/teacher-beta-readiness-report.md`

## Tests

Passed:

- `npm.cmd install`
- `npm.cmd run lint`
- `npm.cmd run build`
- `node scripts/security-smoke.mjs`
- `node scripts/route-smoke.mjs`
- `node scripts/teacher-beta-readiness-smoke.mjs`
- `npm.cmd run smoke` including bank, AI Parsing, review, Blueprint, Publish,
  Classroom, assignment, Practice, evidence, feedback, RLS, and Google fixtures
- `npm.cmd run perf:budget`
- `npm.cmd run perf:audit`
- `npm.cmd run analyze`

## Remaining Limitations

- No second teacher smoke credential is configured. Live owner -> add
  co-teacher -> verify -> remove coverage is an explicit manual acceptance item.
- This PR intentionally did not run a paid real-provider PDF extraction. Run
  one bounded import before a public launch when provider availability is stable.
- Authenticated browser visual QA could not run because the in-app browser did
  not have a teacher session.
- Taxonomy mastery and aggregate mistake patterns are future scope; assignment
  feedback is live now.

## Explicit Non-goals

- No Student Study Library, Study Groups, or Public Library implementation.
- No Google Login or Google Classroom implementation.
- No Blueprint Intelligence Layer, User Memory system, Student Practice redesign,
  notification system, or grade writeback.

## Recommendation

**Ready for closed beta.** The teacher content-to-evidence loop is live-fixture
validated and remains review-gated/bank-first. Complete the signed-in visual QA,
the two-teacher co-teacher acceptance check, and one bounded real PDF import
before widening beyond a closed beta.
