-- Bounded Admin AI Parsing read model.
--
-- The caller identity and role are derived inside the function. SECURITY
-- INVOKER keeps table RLS authoritative; ordinary admins remain restricted to
-- their own imports while super admins retain the existing all-import view.

create or replace function public.get_admin_ai_pdf_workspace_v1(
  p_view text default 'history'
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
with
requester as materialized (
  select profile.id, profile.role::text as role
  from public.profiles profile
  where profile.id = (select auth.uid())
    and profile.role::text in ('admin', 'super_admin')
),
history_batches as materialized (
  select
    batch.id,
    batch.status,
    batch.summary,
    batch.created_at,
    batch.created_by
  from public.import_batches batch
  cross join requester
  where batch.source_type = 'ai_pdf'
    and (requester.role = 'super_admin' or batch.created_by = requester.id)
  order by batch.created_at desc, batch.id
  limit 10
),
source_assets as materialized (
  select
    asset.id,
    asset.batch_id,
    asset.object_path,
    asset.mime_type,
    asset.size_bytes,
    asset.original_filename,
    asset.status,
    asset.metadata,
    asset.created_at,
    asset.created_by
  from public.import_batch_assets asset
  cross join requester
  where asset.asset_role = 'source_pdf'
    and asset.status <> 'deleted'
    and (requester.role = 'super_admin' or asset.created_by = requester.id)
  order by asset.created_at desc, asset.id
  limit 25
),
source_batch_ids as materialized (
  select batch.id
  from history_batches batch
  where p_view <> 'new'
  union
  select asset.batch_id
  from source_assets asset
  where p_view = 'new'
),
source_batches as materialized (
  select
    batch.id,
    batch.status,
    batch.summary,
    batch.created_at,
    batch.created_by
  from public.import_batches batch
  join source_batch_ids source on source.id = batch.id
  cross join requester
  where batch.source_type = 'ai_pdf'
    and (requester.role = 'super_admin' or batch.created_by = requester.id)
),
source_items as materialized (
  select item.batch_id, item.status, item.created_question_id
  from public.import_batch_items item
  join source_batch_ids source on source.id = item.batch_id
  where item.created_question_id is not null
)
select jsonb_build_object(
  'batches',
  case
    when p_view = 'new' then '[]'::jsonb
    else coalesce((select jsonb_agg(to_jsonb(batch) order by batch.created_at desc, batch.id) from history_batches batch), '[]'::jsonb)
  end,
  'source_assets',
  coalesce((select jsonb_agg(to_jsonb(asset) order by asset.created_at desc, asset.id) from source_assets asset), '[]'::jsonb),
  'source_batches',
  coalesce((select jsonb_agg(to_jsonb(batch) order by batch.created_at desc, batch.id) from source_batches batch), '[]'::jsonb),
  'source_batch_items',
  coalesce((select jsonb_agg(to_jsonb(item) order by item.batch_id, item.created_question_id) from source_items item), '[]'::jsonb)
)
where exists (select 1 from requester);
$$;

revoke all on function public.get_admin_ai_pdf_workspace_v1(text)
  from public, anon, authenticated, service_role;
grant execute on function public.get_admin_ai_pdf_workspace_v1(text)
  to authenticated;

comment on function public.get_admin_ai_pdf_workspace_v1(text) is
  'Bounded Admin AI Parsing workspace read model; current role and ownership are auth-derived and SECURITY INVOKER preserves table RLS.';
