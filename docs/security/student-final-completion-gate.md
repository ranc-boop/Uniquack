# Student V1 Final Completion Gate

**Audit date:** 2026-07-17
**Source:** merged canonical `main`, including the completed Student Practice
provider remediation and clean-database evidence-isolation work.
**Scope:** audit, route inventory, and source guardrails only. This gate did not
read an environment file, modify live Supabase, rerun a migration, or rerun a
completed live fixture harness.

## Decision

**IMPLEMENTATION COMPLETE / BROWSER E2E BLOCKED**

The required Student V1 implementation is present, its authorization boundaries
have prior clean-disposable live proof, and no new P0/P1 authorization defect was
found by this audit. The ten signed-in browser journeys below have not been run
end-to-end. Source, embedded PostgreSQL, API, route-smoke, and prior live role
evidence must not be represented as browser validation.

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
| Student landing and My Work | **Implemented** | Active-Student server guard and assigned-work scoping are source-covered. Prior disposable assignment evidence proves entitled versus unrelated assignment access. Browser flow is not run. |
| Assignment detail and start/resume | **Implemented** | Selected items, sent feedback, progress state, and scoped Practice entry are present. Assignment-to-Practice evidence is persisted after successful work. Duplicate start behavior is P2. |
| Deterministic grade/completion | **Implemented** | Grade is provider-independent and updates linked assignment progress/evidence. Browser completion/reload remains unproven. |
| Practice provider path | **Functional but request-bound** | Authenticated route authorization precedes the trusted server-only compatible/default provider resolver. No normal Practice gateway path or client provider selection exists. |
| Private self-study | **P1 completed / clean-db live validated** | 0047 and 0048 clean-disposable matrices proved owner access and cross-Student/staff/framework-owner denials with exact-ID cleanup. |
| Feedback and progress | **Implemented for V1** | Only explicit `sent_to_student` feedback is visible on assignment detail. The Progress page is a summary; a consolidated feedback feed is P2. |
| Question assets | **P0 dependency completed / clean-db live validated** | Private bucket, zero residual legacy URLs, requester-first authorization, direct-public URL denial, selected asset allowance, and staff upload/delete were previously validated. |
| Login/logout and session loss | **Source-covered; browser unproven** | Safe local `next` handling, `signOut`, redirect/401 code paths are present. Session expiry needs a browser journey. |

## Isolation and Ownership

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
server-only resolver. It is not operation-routed specifically to DeepSeek. AI
PDF/vision retains its own execution path. Changing the global compatible default
can change Practice selection, so Practice-specific provider routing is a
**product decision recommended post-launch**, not a verified security dependency
for Student V1. No routing/default change was made here.

## Browser E2E Gap

None of these journeys has full browser evidence yet:

| Required browser journey | Source/embedded proof | Prior live role proof | Browser proof |
| --- | --- | --- | --- |
| Student joins classroom | yes | yes | missing |
| Student opens My Work | yes | assignment access | missing |
| Student starts assignment | yes | yes | missing |
| Student resumes in-progress Practice | yes | persisted-state role evidence | missing |
| Student completes and reloads | yes | linked evidence proof | missing |
| Student sees sent Teacher feedback | yes | isolation/feedback proof | missing |
| Student performs private self-study | yes | yes | missing |
| Student opens selected question asset | yes | P0 storage matrix | missing |
| Student logs out or loses session | source only | no dedicated live browser run | missing |
| Unauthorized direct URL is denied | source/API/RLS | role matrices where applicable | missing |

## Remaining Findings

No new P0 or P1 finding was discovered.

| Severity | Finding | Required next action |
| --- | --- | --- |
| P2 release evidence | No full browser E2E for the ten required journeys | Run authenticated browser E2E against the approved disposable environment. |
| P2 product decision | Availability, archive/history retention, and duplicate-start semantics | Decide contracts before changing behavior. |
| P2 product scope | Study Library, Study Groups, consolidated feedback history | Plan as separate product work. |
| P2 resilience | Request-bound model calls and no formal Practice error boundary | Keep the limitation explicit; add a durable job only if product promises completion after disconnect. |
| P2 UX | Classroom list exposes raw read-error text | Replace with a generic safe message in a narrow UI-hardening change. |

## Completion Path

To reach **COMPLETED / LIVE VALIDATED** for Student V1, run and record the ten
browser journeys above without changing migrations, Provider routing, or the
request-bound Practice contract. Any reproduced P0/P1 issue should be fixed in a
separate forward-only change. The broader site remains independently subject to
its other launch gates.

## Validation Record

The following source, embedded, and local-server checks passed without reading
an environment file or creating live fixtures:

- `npm.cmd install`, `npm.cmd run lint`, and `npm.cmd run build`
- `student-workspace-completion-smoke`, `student-self-study-isolation-smoke`,
  and the self-study live-harness safety smoke
- `practice-provider-execution-smoke`, question-assets public URL and merged
  code-audit smokes, migration reconciliation, and security smoke
- route smoke against a temporary local production server
- `perf:budget`, `perf:audit`, and `analyze`

`student-my-work-smoke` was correctly blocked at its process-environment gate.
`assignment-practice-evidence-smoke` and `assignment-from-bank-smoke` completed
their source phases and were then correctly blocked at the same live
environment gate. These are not reported as passing live evidence. The
migration reconciliation smoke also retains its independent, pre-existing
post-0042 Provider Gateway ownership status; it does not change this Student
gate.

Completed disposable live harnesses were deliberately not rerun. No migration,
database, Storage bucket, Provider configuration, or environment file was
changed during this audit.
