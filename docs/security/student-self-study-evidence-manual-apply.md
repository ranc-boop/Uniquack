# P1-STUDENT-01 Manual Apply and Live Validation

## Scope and Status

`0047_practice_self_study_evidence_isolation.sql` has been manually applied
exactly once to the approved **clean disposable** Supabase project. Sanitized
catalog metadata confirms its three helpers. Do not rerun, edit, rename, or
replace `0047`.

Apply only the forward correction
`0048_practice_course_framework_evidence_isolation.sql` after review. It
removes two legacy course-framework read policies that can bypass the intended
private self-study boundary. Do not apply either migration to the old Supabase
project and do not infer a migration-ledger entry from a Dashboard SQL Editor
run.

Current status before this run:

```text
P1-STUDENT-01
0047 APPLIED_MANUALLY_NOT_LEDGERED / LIVE CATALOG VALIDATED
0048 IMPLEMENTED / AWAITING MANUAL APPLY AND LIVE VALIDATION
```

Frozen migrations `0043` through `0047` must not be edited, renamed, or
replayed. In particular, `0043` remains partially applied/failed and `0044`
through `0047` were manually applied exactly once.

## Read-only Preflight

The following catalog-only query records the already-applied `0047` helper
contract. It uses `to_regprocedure(...)`, which is signature-safe and does not
confuse named arguments with a bare `uuid` comparison.

```sql
select
  to_regprocedure('private.can_read_practice_session_evidence(uuid)')
    as can_read_practice_session_evidence,
  to_regprocedure('private.can_manage_practice_session_evidence(uuid)')
    as can_manage_practice_session_evidence,
  to_regprocedure('private.practice_session_matches_owner(uuid,uuid)')
    as practice_session_matches_owner;
```

All three values must be non-null before applying `0048`. Do not reapply
`0047` under any circumstance.

Then run this `0048` preflight. It must return exactly the two named legacy
policies. If it returns fewer, more, or different rows, stop and reconcile the
live policy inventory before applying anything.

```sql
select
  tablename,
  policyname,
  cmd,
  qual
from pg_policies
where schemaname = 'public'
  and (
    (tablename = 'practice_sessions' and policyname = 'practice_sessions_teacher_select_course')
    or (
      tablename = 'practice_agent_episodes'
      and policyname = 'practice_agent_episodes_teacher_select_course'
    )
  )
order by tablename, policyname;
```

## Operator Steps

1. Open the SQL Editor for the approved clean disposable project.
2. Run both read-only preflights above, then review the entire local
   `0048_practice_course_framework_evidence_isolation.sql` file. It drops only
   the two legacy RLS read policies; it does not insert, update, or delete
   application data.
3. Execute `0048` **once**. Do not run historical `supabase/migrations`, do
   not rerun `0043`-`0047`, and do not combine unrelated SQL in the editor tab.
4. Record the SQL Editor result as manual/unledgered application evidence. Do
   not invent Supabase migration history.
5. Run the local source and embedded checks:

   ```powershell
   node scripts/student-self-study-isolation-smoke.mjs
   node scripts/student-self-study-isolation-live-e2e-safety-smoke.mjs
   node scripts/migration-reconciliation-smoke.mjs
   node scripts/security-smoke.mjs
   ```

6. Run the approved process-only disposable live role matrix. It refuses
   production, derives the project reference from the supplied public Supabase
   URL, requires an exact expected-project match and explicit cleanup
   acknowledgement, creates no Provider profile, and uses no model call.
   Do not load an environment file for this operation.

   Required process-only names:

   ```text
   NEXT_PUBLIC_SUPABASE_URL
   NEXT_PUBLIC_SUPABASE_ANON_KEY
   CLEAN_SUPABASE_SERVICE_ROLE_KEY
   STUDENT_SELF_STUDY_E2E_ENVIRONMENT
   STUDENT_SELF_STUDY_E2E_EXPECTED_PROJECT_REF
   STUDENT_SELF_STUDY_E2E_CONFIRM_CLEANUP
   ```

   Required acknowledgement literals:

   ```text
   STUDENT_SELF_STUDY_E2E_ENVIRONMENT=DISPOSABLE_STUDENT_SELF_STUDY_E2E
   STUDENT_SELF_STUDY_E2E_CONFIRM_CLEANUP=DELETE_STUDENT_SELF_STUDY_E2E_FIXTURES
   ```

   Run:

   ```powershell
   node scripts/student-self-study-isolation-live-e2e.mjs
   ```

   The harness uses service role only to create and exactly clean up disposable
   fixtures. Every authorization assertion runs through a Student, Teacher,
   Admin, or anonymous requester session.

## Required Post-Apply Contract

- Student A can create, load, resume, and update their private self-study.
- A Teacher-owned active course framework can be selected for Student private
  self-study, but framework `created_by`, `teacher_id`, or admin status alone
  grants no read access to that session or its raw agent episode.
- Student B in the same Classroom, a same-organization unrelated Student,
  another-organization Student, unrelated Teacher, removed co-teacher,
  organization admin/staff, and anonymous are denied private self-study.
- An Assignment manager can read only the Student's explicitly linked Practice
  evidence and cannot mutate the Student's answers.
- Aggregate wrong-question history and long-term preference/merge state remain
  Student-owned even for an Assignment manager.
- Existing assignment progress and explicitly sent Teacher feedback remain
  scoped to the Assignment relationship.
- Classroom or Assignment entitlement creates no Bank membership and does not
  expose source-Bank questions, Review Drafts, Blueprints, or source assets.
- Service role retains trusted operational access only; no browser or standard
  application query should use it to bypass the new policy.
- Every fixture row/object is removed by its exact captured identifier in a
  `try/finally` cleanup path.

## Stop Conditions

Stop and do not report success if any of these occur:

- a same-organization staff member can read private self-study;
- a framework owner or admin can read a private self-study session or episode
  that lacks explicit Assignment linkage;
- a Teacher can mutate Student attempts or answers;
- an unrelated Student can read another Student's evidence;
- Bank/source content becomes visible through the evidence path;
- fixture cleanup cannot be proven; or
- the target fails the disposable-project or explicit-cleanup safety checks.

After the live matrix passes, update the migration register and schema manifest
with sanitized `0048` catalog evidence and the exact-ID cleanup result. Only
then may P1-STUDENT-01 be classified as live validated. This does not declare
the overall website deployment-ready.
