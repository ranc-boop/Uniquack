# Storage Read Authorization Helper — `private.can_read_question`

Status: infrastructure only. No Storage migration, no bucket visibility change, no signed URLs, no frontend change, no RLS policy change. Introduces one new read-only Postgres function.

Migration: [supabase/clean-migrations/0045_question_read_authorization_helper.sql](../supabase/clean-migrations/0045_question_read_authorization_helper.sql)

## Helper design

```sql
private.can_read_question(p_question_id uuid) returns boolean
```

The function body is the literal boolean OR of the `USING` clauses of the five existing `SELECT`-visible RLS policies on `public.questions`. This is not an approximation: for a single table and a single command, PostgreSQL's own RLS evaluation for multiple `PERMISSIVE` policies (none of the five are `AS RESTRICTIVE`) is defined as "row visible if any policy's `USING` clause is true" — i.e. exactly this OR. The function therefore returns the same answer the database would already give if you ran `select 1 from questions where id = ... ` as that user today.

Implementation reuses the existing helper functions (`private.is_org_staff`, `private.can_read_question_bank`, `private.can_manage_question_bank`, `private.can_read_assignment_question`) rather than re-deriving their logic — if those functions change in a future migration, `can_read_question` picks up the change automatically without needing an update.

## Covered read paths

| Source policy | Migration | Condition reused verbatim |
|---|---|---|
| `questions_published_read` | [0029_teacher_role_bank_public_boundary.sql:16-23](../supabase/clean-migrations/0029_teacher_role_bank_public_boundary.sql) | `status='published' AND visibility='public' AND owner_bank_id IS NULL AND deleted_at IS NULL` |
| `questions_staff_access` (USING half only) | [0027_bank_import_review_scope.sql:269-278](../supabase/clean-migrations/0027_bank_import_review_scope.sql) | `owner_bank_id IS NULL AND is_org_staff(organization_id)` |
| `questions_bank_member_read` | [0027_bank_import_review_scope.sql:280-294](../supabase/clean-migrations/0027_bank_import_review_scope.sql) | active `bank_questions` row + `can_read_question_bank(bank_id)` |
| `questions_bank_manager_write` (USING half only) | [0027_bank_import_review_scope.sql:296-309](../supabase/clean-migrations/0027_bank_import_review_scope.sql) | `can_manage_question_bank(owner_bank_id)` + bank/org match |
| `questions_assignment_item_read` | [0028_assignment_from_bank_questions.sql:59-66](../supabase/clean-migrations/0028_assignment_from_bank_questions.sql) | `can_read_assignment_question(id)` (covers both the assigned-student path and the assignment-manager path inside that function) |

`private.is_org_staff()` already OR's in `private.is_super_admin()` ([0001_foundations_identity_organizations.sql:170](../supabase/clean-migrations/0001_foundations_identity_organizations.sql)), so super_admin visibility is covered without a separate branch.

## Excluded write permissions

Two of the five source policies are `FOR ALL` (`questions_staff_access`, `questions_bank_manager_write`), meaning they also govern `INSERT`/`UPDATE`/`DELETE` via a `WITH CHECK` clause. `can_read_question` only consolidates their `USING` half. It grants no write capability, checks no write capability, and must not be used to gate any write path. (For the record: both `FOR ALL` policies happen to have `WITH CHECK` identical to their `USING` clause, so no read/write divergence exists today — but this function does not encode that fact and should not be relied on for write decisions.)

## Compatibility with existing RLS

No existing policy was modified, dropped, or replaced. `can_read_question` is a net-new, additive function; the five policies continue to govern `questions` table access exactly as before. Because the function's logic is a direct copy of those policies' conditions (not a reimplementation), there is no scenario where the function and the live RLS disagree about visibility — if a future migration changes one of the five policies without updating this function, they will drift, so any such change should update this function in the same migration (noted in the function's `comment on function`).

## Auth context requirements

Every underlying condition depends on `auth.uid()` (via `is_org_staff`, `can_manage_question_bank`, `can_read_question_bank`, `can_read_assignment_question`, and the RLS-standard session context). `can_read_question` must be invoked through a call path where `auth.uid()` resolves to the requesting user's session — i.e. through the user's own authenticated Supabase client (browser client, or a server client constructed from the user's session cookie/JWT), the same way RLS resolves it today.

Calling this function with a bare service-role client (no user JWT in context) will make `auth.uid()` null, and every branch will evaluate false — the function will report "not readable" even for content the service role could otherwise bypass via RLS override. This is intentional: the function answers "can this specific user read this row," not "can the server read this row." Do not call it from service-role-only code expecting it to reflect elevated privileges.

The function is `security definer` (consistent with the other `private.*` helpers) so it can read `bank_questions`, `question_banks`, `assignment_items`, etc. without requiring the calling role to have direct table grants — but `security definer` does not change whose `auth.uid()` is evaluated; that's still the JWT of the calling session.

`grant execute` is given to both `anon` and `authenticated` (matching `can_read_assignment_question` and the other read-helper grants), since `questions_published_read` is reachable by unauthenticated users and any future public-asset flow will need to call this function without a logged-in session.

## Future usage examples

These are illustrative only — no signed-URL or Storage code exists yet; SEC-P1B's actual Storage migration is a separate, later change.

**From a future server-side signed-URL route, called with the user's session:**
```ts
const supabase = await createClient(); // user-session-bound client, not service-role
const { data: canRead } = await supabase
  .rpc("can_read_question", { p_question_id: questionId });

if (!canRead) {
  return new Response("Forbidden", { status: 403 });
}
// proceed to issue a short-lived signed URL for assets under this question
```

**From a future RLS policy on `storage.objects` (if the bucket is later made private), joining back to `question_assets`:**
```sql
create policy question_assets_read_via_question_auth
on storage.objects for select
using (
  bucket_id = 'question-assets'
  and exists (
    select 1
    from public.question_assets asset
    where asset.storage_bucket = bucket_id
      and asset.storage_path = name
      and private.can_read_question(asset.question_id)
  )
);
```

Neither example is part of this PR; both are shown only to illustrate the intended call shape for the helper introduced here.
