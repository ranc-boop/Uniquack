-- Question Read Authorization Helper (SEC-P1B prerequisite)
-- Introduces a single reusable read-authorization primitive for the `questions` table,
-- consolidating the boolean OR of the five existing SELECT-visible RLS policies
-- (questions_published_read, questions_staff_access, questions_bank_member_read,
-- questions_bank_manager_write, questions_assignment_item_read) into one function.
--
-- This migration is infrastructure only:
--   - Does not modify Storage (bucket visibility, signed URLs).
--   - Does not modify any existing Question RLS policy.
--   - Does not add write/INSERT/UPDATE/DELETE authorization.
-- It exists so that a future Storage access path can call one function instead of
-- re-deriving question visibility rules independently.

create or replace function private.can_read_question(p_question_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, private
as $$
  select exists (
    select 1
    from public.questions question
    where question.id = p_question_id
      and (
        -- questions_published_read (0029_teacher_role_bank_public_boundary.sql)
        (
          question.status = 'published'
          and question.visibility = 'public'
          and question.owner_bank_id is null
          and question.deleted_at is null
        )
        -- questions_staff_access, USING clause (0027_bank_import_review_scope.sql)
        or (
          question.owner_bank_id is null
          and private.is_org_staff(question.organization_id)
        )
        -- questions_bank_member_read (0027_bank_import_review_scope.sql)
        or (
          question.deleted_at is null
          and question.owner_bank_id is not null
          and exists (
            select 1
            from public.bank_questions bank_question
            where bank_question.question_id = question.id
              and bank_question.bank_id = question.owner_bank_id
              and bank_question.status = 'active'
              and private.can_read_question_bank(bank_question.bank_id)
          )
        )
        -- questions_bank_manager_write, USING clause (0027_bank_import_review_scope.sql)
        or (
          question.owner_bank_id is not null
          and private.can_manage_question_bank(question.owner_bank_id)
          and exists (
            select 1
            from public.question_banks bank
            where bank.id = question.owner_bank_id
              and bank.organization_id = question.organization_id
          )
        )
        -- questions_assignment_item_read (0028_assignment_from_bank_questions.sql)
        or (
          question.deleted_at is null
          and private.can_read_assignment_question(question.id)
        )
      )
  );
$$;

comment on function private.can_read_question(uuid) is
  'Read-only authorization primitive: true iff the current auth.uid() could SELECT this question row under the existing RLS policies (questions_published_read, questions_staff_access, questions_bank_member_read, questions_bank_manager_write, questions_assignment_item_read). Consolidates existing read rules only; introduces no new access path and no write authorization. Intended for reuse by future Storage signed-URL gating (SEC-P1B) and other read-only call sites — does not replace or alter the underlying RLS policies.';

alter function private.can_read_question(uuid) owner to postgres;
revoke all on function private.can_read_question(uuid) from public, anon, authenticated;

-- Browser callers receive only an asset UUID. This wrapper resolves its canonical
-- question relation inside a SECURITY DEFINER function and returns a boolean only.
-- It never exposes a question ID, Storage path, or asset metadata.
create or replace function public.can_read_question_asset(p_asset_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, private
as $$
  select exists (
    select 1
    from public.question_assets asset
    where asset.id = p_asset_id
      and asset.question_id is not null
      and private.can_read_question(asset.question_id)
  );
$$;

comment on function public.can_read_question_asset(uuid) is
  'Read-only asset authorization wrapper. Returns true only when the current requester can read the canonical question attached to this asset. Returns no asset metadata, Storage path, or question ID; intended only for the private question-assets signed-URL route.';

alter function public.can_read_question_asset(uuid) owner to postgres;
revoke all on function public.can_read_question_asset(uuid) from public;
grant execute on function public.can_read_question_asset(uuid) to anon, authenticated;
