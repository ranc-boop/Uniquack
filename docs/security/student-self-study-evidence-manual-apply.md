# P1-STUDENT-01 Manual Apply and Live Validation

## Scope and Status

Apply only `supabase/clean-migrations/0047_practice_self_study_evidence_isolation.sql`
to the approved **clean disposable** Supabase project after review. This is a
forward-only policy change. Do not apply it to the old Supabase project and do
not infer a migration-ledger entry from a Dashboard SQL Editor run.

Current status before this run:

```text
P1-STUDENT-01
IMPLEMENTED / AWAITING MANUAL APPLY AND LIVE VALIDATION
```

Frozen migrations `0043` through `0046` must not be edited, renamed, or
replayed. In particular, `0043` remains partially applied/failed and `0044`,
`0045`, and `0046` were manually applied exactly once.

## Operator Steps

1. Open the SQL Editor for the approved clean disposable project.
2. Review the entire local `0047_practice_self_study_evidence_isolation.sql`
   file. It changes RLS policies and private authorization helpers only; it
   does not insert, update, or delete application data.
3. Execute that file **once**. Do not run historical `supabase/migrations`, do
   not rerun `0043`-`0046`, and do not combine unrelated SQL in the editor tab.
4. Record the SQL Editor result as manual/unledgered application evidence. Do
   not invent Supabase migration history.
5. Run the local source and embedded checks:

   ```powershell
   node scripts/student-self-study-isolation-smoke.mjs
   node scripts/migration-reconciliation-smoke.mjs
   node scripts/security-smoke.mjs
   ```

6. Run the approved process-only disposable live role matrix. It must refuse
   production, verify the expected clean project reference from the supplied
   public Supabase URL, require explicit cleanup acknowledgement, use only
   harness-owned exact identifiers, and clear all process variables at the
   end. Do not load an environment file for this operation.

## Required Post-Apply Contract

- Student A can create, load, resume, and update their private self-study.
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
- a Teacher can mutate Student attempts or answers;
- an unrelated Student can read another Student's evidence;
- Bank/source content becomes visible through the evidence path;
- fixture cleanup cannot be proven; or
- the target fails the disposable-project or explicit-cleanup safety checks.

After the live matrix passes, update the migration register and schema manifest
with sanitized catalog evidence and the exact-ID cleanup result. Only then may
P1-STUDENT-01 be classified as live validated. This does not declare the
overall website deployment-ready.
