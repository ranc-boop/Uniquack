-- Closed-beta AI PDF selective execution control.
-- Full-document parsing remains the production-compatible default.

alter table public.ai_operations_controls
  add column if not exists selective_execution_enabled boolean not null default false;

comment on column public.ai_operations_controls.selective_execution_enabled is
  'Super-admin-only closed-beta control for trusted-worker selective PDF page execution. Disabled by default.';

-- PostgreSQL does not permit CREATE OR REPLACE to widen a RETURNS TABLE shape.
-- This RPC has no dependent database objects and is restored immediately below
-- with the same service-role-only authorization boundary.
drop function if exists public.get_ai_operations_worker_control();

create or replace function public.get_ai_operations_worker_control()
returns table (
  pause_worker_claims boolean,
  max_jobs_per_invocation integer,
  max_provider_calls_per_execution integer,
  selective_execution_enabled boolean
)
language plpgsql
stable
security definer
set search_path = public, private
as $$
declare
  control public.ai_operations_controls%rowtype;
begin
  if not private.is_trusted_ai_provider_worker() then
    raise exception 'Trusted worker role required.';
  end if;

  select * into control
  from public.ai_operations_controls
  where organization_id is null and operation_kind is null
  order by updated_at desc
  limit 1;

  return query
  select
    coalesce(control.pause_worker_claims, false),
    coalesce(control.max_jobs_per_invocation, 2),
    coalesce(control.max_provider_calls_per_execution, 4),
    coalesce(control.selective_execution_enabled, false);
end;
$$;

revoke all on function public.get_ai_operations_worker_control() from public, anon, authenticated;
grant execute on function public.get_ai_operations_worker_control() to service_role;
