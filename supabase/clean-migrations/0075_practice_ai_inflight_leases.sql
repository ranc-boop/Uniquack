-- Serialize costly Practice AI operations per authenticated user and operation.

create table public.practice_ai_inflight_leases (
  user_id uuid not null references auth.users(id) on delete cascade,
  operation text not null check (operation in ('recommend', 'review', 'hint')),
  scope_id text not null check (char_length(scope_id) between 1 and 200),
  lease_token uuid not null,
  acquired_at timestamptz not null,
  expires_at timestamptz not null,
  primary key (user_id, operation)
);

alter table public.practice_ai_inflight_leases enable row level security;
revoke all on table public.practice_ai_inflight_leases from public, anon, authenticated;

create policy practice_ai_inflight_leases_no_direct_access
on public.practice_ai_inflight_leases
for all
to authenticated
using (false)
with check (false);

create or replace function public.claim_practice_ai_inflight_lease(
  p_operation text,
  p_scope_id text,
  p_ttl_seconds integer default 300
)
returns table (
  acquired boolean,
  lease_token uuid,
  retry_after_seconds integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  normalized_operation text := lower(btrim(coalesce(p_operation, '')));
  normalized_scope_id text := btrim(coalesce(p_scope_id, ''));
  request_time timestamptz := clock_timestamp();
  bounded_ttl_seconds integer := least(600, greatest(30, coalesce(p_ttl_seconds, 300)));
  next_token uuid := gen_random_uuid();
  acquired_token uuid;
  active_expiry timestamptz;
begin
  if actor_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  if normalized_operation not in ('recommend', 'review', 'hint') then
    raise exception 'Unsupported Practice AI lease operation.' using errcode = '22023';
  end if;
  if char_length(normalized_scope_id) not between 1 and 200 then
    raise exception 'Invalid Practice AI lease scope.' using errcode = '22023';
  end if;

  insert into public.practice_ai_inflight_leases as existing (
    user_id,
    operation,
    scope_id,
    lease_token,
    acquired_at,
    expires_at
  ) values (
    actor_id,
    normalized_operation,
    normalized_scope_id,
    next_token,
    request_time,
    request_time + make_interval(secs => bounded_ttl_seconds)
  )
  on conflict (user_id, operation)
  do update set
    scope_id = excluded.scope_id,
    lease_token = excluded.lease_token,
    acquired_at = excluded.acquired_at,
    expires_at = excluded.expires_at
  where existing.expires_at <= request_time
  returning existing.lease_token, existing.expires_at
    into acquired_token, active_expiry;

  if acquired_token is not null then
    return query select true, acquired_token, 0;
    return;
  end if;

  select existing.expires_at
    into active_expiry
  from public.practice_ai_inflight_leases existing
  where existing.user_id = actor_id
    and existing.operation = normalized_operation;

  return query select
    false,
    null::uuid,
    greatest(1, ceil(extract(epoch from active_expiry - request_time))::integer);
end;
$$;

create or replace function public.release_practice_ai_inflight_lease(
  p_operation text,
  p_lease_token uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  normalized_operation text := lower(btrim(coalesce(p_operation, '')));
begin
  if actor_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  delete from public.practice_ai_inflight_leases existing
  where existing.user_id = actor_id
    and existing.operation = normalized_operation
    and existing.lease_token = p_lease_token;

  return found;
end;
$$;

revoke execute on function public.claim_practice_ai_inflight_lease(text, text, integer) from public, anon;
revoke execute on function public.release_practice_ai_inflight_lease(text, uuid) from public, anon;
grant execute on function public.claim_practice_ai_inflight_lease(text, text, integer) to authenticated;
grant execute on function public.release_practice_ai_inflight_lease(text, uuid) to authenticated;

comment on table public.practice_ai_inflight_leases is
  'Short-lived per-user operation leases that prevent concurrent Practice AI cost amplification.';
