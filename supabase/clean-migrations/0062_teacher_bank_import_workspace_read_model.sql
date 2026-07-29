-- Collapse the shared Teacher Library import header and recent-run inventory
-- into one bounded read. Mode-specific taxonomy and AI state remain separate
-- so manual, JSON, and AI Parsing never load one another's data.
--
-- SECURITY INVOKER intentionally preserves question_banks, bank_members, and
-- import_batches RLS. No caller-supplied profile id is trusted.

create or replace function public.get_teacher_bank_import_workspace_v1(
  p_bank_id uuid
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
select jsonb_build_object(
  'bank',
  jsonb_build_object(
    'id', bank.id,
    'organization_id', bank.organization_id,
    'owner_id', bank.owner_id,
    'name', bank.name,
    'description', bank.description,
    'visibility', bank.visibility,
    'status', bank.status,
    'metadata', bank.metadata,
    'created_by', bank.created_by,
    'updated_by', bank.updated_by,
    'created_at', bank.created_at,
    'updated_at', bank.updated_at
  ),
  'current_user_role', membership.role,
  'import_batches',
  coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'id', recent_batch.id,
          'source_type', recent_batch.source_type,
          'status', recent_batch.status,
          'summary', recent_batch.summary,
          'target_bank_id', recent_batch.target_bank_id,
          'created_at', recent_batch.created_at
        )
        order by recent_batch.created_at desc, recent_batch.id
      )
      from (
        select
          batch.id,
          batch.source_type,
          batch.status,
          batch.summary,
          batch.target_bank_id,
          batch.created_at
        from public.import_batches batch
        where batch.target_bank_id = bank.id
        order by batch.created_at desc, batch.id
        limit 25
      ) recent_batch
    ),
    '[]'::jsonb
  )
)
from public.question_banks bank
left join lateral (
  select member.role
  from public.bank_members member
  where member.bank_id = bank.id
    and member.user_id = (select auth.uid())
  limit 1
) membership on true
where bank.id = p_bank_id;
$$;

revoke all on function public.get_teacher_bank_import_workspace_v1(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_teacher_bank_import_workspace_v1(uuid)
  to authenticated;

comment on function public.get_teacher_bank_import_workspace_v1(uuid) is
  'Bounded current-user Teacher Library import read model; SECURITY INVOKER keeps Library and import RLS authoritative.';
