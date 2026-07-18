# P1-STUDENT-01: Student Self-Study Evidence Isolation

## Status

**0047 APPLIED_MANUALLY_NOT_LEDGERED / LIVE CATALOG VALIDATED; 0048 AWAITING
MANUAL APPLY AND LIVE VALIDATION**

This is a forward-only remediation for the canonical clean schema. The clean
Supabase catalog confirms the three `0047` helpers exist with the reviewed
security-definer, owner, search-path, and grant contract. It also confirmed two
older `0009` framework-owner read policies remained live, so `0047` alone does
not close the boundary. This does not change the overall Student classification:
**PARTIALLY COMPLETE / CORE GAPS REMAIN**.

## Original Exposure

Canonical `0008_practice_agent_evidence.sql` gave the Student owner *or* any
same-organization staff member access to Practice evidence using
`private.is_org_staff(organization_id)`. The predicate does not require a
shared Classroom, a managed Assignment, or a Student sharing decision. Several
of those policies also let that staff member write or delete evidence.

That broad shortcut covered private self-study sessions and their dependent
rounds, questions, answers, hints, reflections, aggregate mistakes, weakness
links, preference state, merge records, and agent episodes.

Canonical `0009_course_builder_near_term.sql` added a separate bypass after
those policies: `practice_sessions_teacher_select_course` and
`practice_agent_episodes_teacher_select_course`. A signed-in Student can select
an active `practice_course_framework` when creating a private Practice session.
Those two policies then allow the framework's `created_by`, `teacher_id`, or an
admin to read the private session and raw agent episode without an explicit
Assignment relationship.

## Final Contract

| Evidence group | Student owner | Assignment manager | Other Students / staff / admin | Notes |
| --- | --- | --- | --- | --- |
| `practice_sessions` | read/write own | read only when explicitly linked through `assignment_practice_sessions` to an Assignment they manage | denied | Classroom or organization membership alone is insufficient. |
| Rounds, round questions, attempts, hints, reflections, episodes | read/write own session | read only when the owning session is explicitly assignment-linked | denied | Teachers never receive answer mutation capability. |
| `practice_weakness_links` | read/write own | read only when the concrete session or attempt is assignment-linked | denied | Uses session evidence rather than organization membership. |
| `practice_wrong_questions` | read/write own | denied | denied | Aggregate history can combine self-study and assignment attempts, so it is not safe teacher-facing evidence. |
| `user_practice_preferences` and merge jobs | read/write own | denied | denied | Long-term preferences are not assignment evidence. |
| `assignment_practice_sessions` and progress | existing Student ownership | existing explicit Assignment-manager read | denied | Preserved from `0021`; not rewritten by `0047`. |
| Teacher feedback | explicitly sent feedback only | existing manager read/write | denied | Preserved from `0032`; it stays separate from Student answer mutation. |

`service_role` retains trusted operational access through its existing RLS
bypass capability. This migration does not create a browser or application
service-role bypass. The three new helpers are in the non-PostgREST `private`
schema; authenticated EXECUTE is retained only because PostgreSQL evaluates
RLS predicates as the requester. They accept no caller-supplied user identity
and derive the actor from `auth.uid()`.

## Migration Design

`0047_practice_self_study_evidence_isolation.sql` adds:

- `private.can_read_practice_session_evidence(uuid)`: owner or an active
  manager of an explicitly linked Assignment.
- `private.can_manage_practice_session_evidence(uuid)`: Student owner only.
- `private.practice_session_matches_owner(uuid, uuid)`: binds dependent rows to
  the true session owner before delegated read access is considered.

Each helper is `SECURITY DEFINER`, has a fixed `public, private` search path,
and is owned by `postgres`. The migration drops the known 0008 owner-or-staff
policies and replaces them with explicit Student ownership and narrowly scoped
Assignment-manager reads. It does not change data, existing rows, Bank
membership, source Bank visibility, Classroom authorization, provider routing,
Storage, or assignment authoring.

`0048_practice_course_framework_evidence_isolation.sql` is the required
forward-only follow-up. It drops only the two `0009` framework-owner select
policies. It preserves `0047` Student-owner access, explicit
Assignment-manager read-only access, sent feedback, Assignment progress, and
trusted service-role operations. Active framework selection remains available;
framework ownership no longer acts as a raw Student-evidence entitlement.

## API Exposure Boundary

The repository contains no Supabase project configuration that adds `private`
to PostgREST's exposed schema list, and no public RPC wrapper calls any of the
three `0047` helpers. Current browser-facing Practice routes use the default
public-schema client; helper references outside migrations and tests are absent.
The authenticated `EXECUTE` grants remain necessary for PostgreSQL RLS policy
evaluation and are not a browser capability grant. The unrun disposable harness
now additionally attempts a requester-side `private` schema RPC and requires it
to fail, providing the final live proof that the helpers are not browser-callable.

## Runtime Callers Checked

- Student Practice persistence and assignment linkage use the signed-in
  Student's normal client and continue to own their writes.
- Teacher dashboard, assignment detail, and feedback actions read
  assignment-scoped progress/attempt evidence rather than self-study
  preferences or aggregate mistake records.
- Server-side trusted workers continue to use their existing service-role path;
  no application query is moved to service role to work around RLS.

## Evidence Before Final Live Validation

`scripts/student-self-study-isolation-smoke.mjs` is a local embedded Postgres
matrix. It proves the final policy contract for Student A; a same-Classroom
Student B; a same-organization unrelated Student; another-organization
Student; an authorized Assignment Teacher; an unrelated Teacher; a removed
co-teacher; an organization admin; anonymous; and service role. It also checks
the unchanged assignment progress and sent-feedback contract statically.

The embedded matrix now creates a Teacher-owned course framework, attaches it
to Student A private self-study, and confirms the framework teacher and admin
cannot read the session or episode after `0048`. This is **non-live evidence**.
After manual `0048` application to the approved clean disposable project, run a
process-only exact-ID live fixture matrix before marking P1-STUDENT-01 live
validated. The live run must cover framework-linked self-study,
assignment-linked evidence, Teacher read-only behavior, removed-co-teacher
denial, Bank/source-question isolation, and exact-ID cleanup without retaining
fixture or credential identities.
