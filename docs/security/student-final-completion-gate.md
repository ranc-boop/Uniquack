# Student V1 Final Completion Gate

**Audit date:** 2026-07-18
**Source:** `codex/student-final-completion-gate`, including the completed
Student Practice remediation, clean-database evidence isolation, and final
authenticated disposable browser validation.
**Scope:** Student V1 only. The final evidence update did not read an environment
file, modify live Supabase, replay a migration, or rerun the completed browser
fixture harness.

## Decision

**COMPLETED / LIVE VALIDATED**

The authenticated Student V1 browser suite passed end-to-end with exact-ID
cleanup. Assignment Practice and private self-study are both **COMPLETED / LIVE
VALIDATED**. Practice remains **FUNCTIONAL_BUT_REQUEST_BOUND / LIVE VALIDATED**:
completed results persist and resume, but an interrupted in-flight model call is
not guaranteed to finish after the page closes.

This decision applies to the Student V1 scope only. It does not declare the
overall website deployment-ready.

## Student V1 Contract

### Required V1 behavior

1. An active Student can reach a Student dashboard, join a classroom, open My
   Work, and view only entitled assigned work.
2. Assignment detail shows selected items, sent Teacher feedback, due date and
   persisted progress, with a scoped Practice entry point.
3. Assignment Practice starts selected assigned questions only, resumes completed
   persisted sessions, grades deterministically, and writes progress/evidence
   back to the assignment after successful work.
4. Private self-study sessions, rounds, attempts, hints, episodes, wrong-question
   history, preferences, and merge state are Student-owned.
5. Practice recommendation, review, hint, title, and preference merge authenticate
   the caller before the server-only compatible-provider resolver runs. The browser
   cannot choose a provider, profile, model, credential, or gateway token.
6. Explicitly sent Teacher feedback is visible in assignment detail; private
   Teacher notes remain unavailable to the Student.
7. Question assets use the requester-first protected asset route. Assignment
   entitlement grants selected assets only; source-Bank and unselected assets do
   not become readable.
8. Logout clears the authenticated Supabase session; unauthenticated Practice and
   Mistakes routes redirect to login, and Practice APIs return an authentication
   denial before data or provider access.

### Accepted limitation

Practice model calls are **request-bound**. Completed results and evidence persist
and resume, but an interrupted in-flight recommendation, review, hint, title, or
preference merge is not guaranteed to finish after the page closes. The current
product does not promise background completion. AI PDF, Blueprint, and coverage
recovery are the only durable worker job families.

### Future work and P2 scope

- Student Study Library backend and Study Group backend.
- Consolidated sent-feedback history outside assignment detail.
- Assignment availability-window, archived-classroom, and completed-history
  product contracts.
- Duplicate assignment-start/restart contract.
- Formal React error boundary for Practice.
- Generic classroom-list read-error copy instead of raw database error text.
- Investigate one non-blocking failed `PRACTICE_PREFERENCES` request observed
  during the otherwise passing private self-study journey.

These are not a newly found authorization defect in the required Student V1
workflow.

## Complete Route Inventory

The machine-readable route contract is
[`student-route-manifest.json`](student-route-manifest.json):

- 9 signed-in Student pages: dashboard, My Work/list/detail, classrooms/join,
  progress, Study Library shell, Study Groups shell, and Public Library entry.
- 4 shared page/action groups: Practice, Mistakes, public question discovery, and
  login/logout.
- 13 individually listed Practice API routes. Every one repeats
  `requirePracticeApiUser`; assignment start additionally requires an active
  Student and assignment RLS entitlement.
- 3 support boundaries: classroom join action, requester-first question-assets
  route, and the Student-visible client-module boundary.

The source guard verifies that every concrete Student page, shared page/action,
Practice API, and support route is manifested. It also verifies server-side
guards, no client service-role/provider gateway path, no Student Bank membership
grant, no self-study staff or framework-owner shortcut, protected asset routing,
no public asset URL builder, no super-admin gateway in Practice, and no durable
Practice worker claim.

## Workflow Results

| Area | Result | Evidence and limit |
| --- | --- | --- |
| Student landing and My Work | **Completed / live validated** | Browser proof covers authentication, Classroom join, entitled work visibility, unrelated Assignment denial, and completed Assignment display. |
| Assignment detail and start/resume | **Completed / live validated** | Selected-question scoping, sent/private feedback boundaries, start, same-session reload/resume, and linked completion passed. Duplicate-start product semantics remain P2. |
| Deterministic grade/completion | **Completed / live validated** | Submitted answers, review, completed restoration, and My Work completion persisted. Deterministic grade uses no Provider. |
| Practice provider path | **Functional but request-bound / live validated** | Practice uses the configured enabled/default compatible Provider; this may be DeepSeek or Gemini OpenAI-compatible by environment. No client Provider selection exists. |
| Private self-study | **Completed / live validated** | Create, persistence, active empty state, immediate list, same-session reload, zero initial evidence, and 0047/0048 isolation all passed. |
| Feedback and progress | **Completed for V1 / live validated** | Sent feedback was visible; private feedback and unselected-question content were hidden. Consolidated history remains P2. |
| Question assets | **Completed / live validated** | Selected private asset access succeeded and unselected private asset access was denied in the browser. |
| Login/logout and session loss | **Completed / live validated** | Logout, protected-page redirect, unauthenticated Practice API denial, and hidden Teacher/Admin controls passed. |

## Isolation and Ownership

Migrations `0043` through `0048` remain frozen and unchanged by this completion
gate:

- **0043** remains `PARTIALLY_APPLIED_FAILED`.
- **0044** was applied manually exactly once.
- **0045/0046** retain their clean-database live validation.
- **0047/0048** retain their clean-database live validation and were each
  applied manually exactly once.

No migration was required or replayed for this finalization. In particular,
`0047_practice_self_study_evidence_isolation.sql` and
`0048_practice_course_framework_evidence_isolation.sql` remain frozen:

- **0047**: `APPLIED_MANUALLY_NOT_LEDGERED`, exactly once, clean-database live
  catalog validated. It removed broad same-organization staff access from private
  self-study evidence while retaining explicit Assignment-manager read-only access.
- **0048**: `APPLIED_MANUALLY_NOT_LEDGERED`, exactly once, clean-database live
  validated. It removed the course-framework-owner/admin read bypass.

The recorded post-0048 catalog had zero legacy framework policies, two
Assignment-manager policies, three validated helpers, and RLS on all eleven
affected Practice tables. The completed disposable role matrix proved:

- same-class, same-organization unrelated, and cross-organization Students are
  denied another Student's private self-study;
- unrelated Teacher, removed co-teacher, framework owner, organization staff/admin,
  and anonymous callers are denied;
- an explicit Assignment manager has intended read-only evidence access but cannot
  mutate Student answers;
- wrong-question aggregate, preference, and preference-merge state remain
  Student-private;
- feedback/progress behavior remains functional;
- no Bank membership, source-Bank enumeration, Review Draft, or Blueprint access
  is created; and
- exact-ID cleanup completed.

## Provider and Routing Note

Practice chooses the configured enabled/default **compatible** provider using the
server-only resolver. Depending on the environment, that compatible default may
be DeepSeek or Gemini OpenAI-compatible. Practice is not hardcoded to either
Provider and does not claim cross-Provider fallback or circuit behavior. AI
PDF/vision retains its own execution path. Deterministic grade uses no Provider.
No routing/default change was made here.

## Browser E2E Completion Evidence

The final authenticated disposable suite reported `PASS Student V1 browser E2E
completed with exact cleanup`. It validated:

- Student authentication, Classroom join, My Work entitlement, and unrelated
  Assignment denial.
- Assignment selected-question scoping, sent feedback visibility, private
  feedback hiding, and unselected-question hiding.
- Assignment Practice start, same-session reload/resume, authoritative answer
  state/ref consistency, valid-input guard, Review success, submitted-answer
  persistence, completed restoration, and completed My Work state.
- Private self-study creation, persistence, active empty state, visible session
  list, same-session reload, and zero initial rounds/questions/attempts.
- Selected private question asset allowance, unselected private asset denial,
  same-class Student evidence isolation, and source content/Bank isolation.
- Logout, protected-page redirect, unauthenticated Practice API denial,
  Teacher/Admin controls hidden from Student, and safe error copy.

Cleanup and containment also passed: `cleanup=PASS`,
`temporary_servers_stopped=YES`, `process_environment_cleared=YES`, and zero
fixture residue. No production identity/data was used and no migration was
replayed.

One failed `PRACTICE_PREFERENCES` request was recorded during private self-study.
All required self-study creation, persistence, active-session, list, reload, and
zero-evidence assertions still passed. This is non-blocking P2 diagnostic debt.

## Remaining Findings

No new P0 or P1 finding was discovered.

| Severity | Finding | Required next action |
| --- | --- | --- |
| P2 diagnostic debt | One failed `PRACTICE_PREFERENCES` request during the passing self-study journey | Reproduce separately without reopening the completed Student V1 gate. |
| P2 product decision | Availability, archive/history retention, and duplicate-start semantics | Decide contracts before changing behavior. |
| P2 product scope | Study Library, Study Groups, consolidated feedback history | Plan as separate product work. |
| P2 resilience | Request-bound model calls and no formal Practice error boundary | Keep the limitation explicit; add a durable job only if product promises completion after disconnect. |
| P2 UX | Classroom list exposes raw read-error text | Replace with a generic safe message in a narrow UI-hardening change. |

## Completion Boundary

Student V1 is **COMPLETED / LIVE VALIDATED**. This does not declare the entire
website deployment-ready. Any remaining P2 item should be handled in a separately
scoped change without altering the accepted request-bound Practice contract by
implication.

## Validation Record

The final closure reran the required source, embedded, and local build checks
without reading an environment file or creating live fixtures:

- `npm.cmd run lint` and `npm.cmd run build`
- `student-workspace-completion-smoke` and `student-self-study-isolation-smoke`
- Student browser and private self-study live-harness safety smokes
- Assignment Practice resume, answer-state consistency, missing-answer guard,
  and submitted-attempt identity smokes
- question-assets merged-code audit and Practice provider-execution smokes
- security smoke and `git diff --check`

The already completed disposable browser harness was deliberately not rerun for
this evidence-only closure. No migration, database, Storage bucket, Provider
configuration, or environment file was changed.
