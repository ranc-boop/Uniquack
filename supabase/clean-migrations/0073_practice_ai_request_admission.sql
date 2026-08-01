-- Atomic per-user admission for Practice AI operations.
-- The browser cannot read or mutate counters directly.

create table public.practice_ai_request_windows (
  user_id uuid not null references public.profiles(id) on delete cascade,
  operation text not null check (operation in (
    'recommend',
    'review',
    'hint',
    'session_title',
    'preference_merge'
  )),
  window_seconds integer not null check (window_seconds in (60, 3600)),
  window_started_at timestamptz not null,
  request_count integer not null default 0 check (request_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, operation, window_seconds, window_started_at)
);

alter table public.practice_ai_request_windows enable row level security;

revoke all on table public.practice_ai_request_windows from public, anon, authenticated;

create policy practice_ai_request_windows_no_direct_access
on public.practice_ai_request_windows
for all
to authenticated
using (false)
with check (false);

create or replace function public.claim_practice_ai_request(p_operation text)
returns table (
  allowed boolean,
  retry_after_seconds integer,
  minute_count integer,
  hour_count integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  normalized_operation text := lower(btrim(coalesce(p_operation, '')));
  current_time timestamptz := clock_timestamp();
  minute_start timestamptz := date_trunc('minute', current_time);
  hour_start timestamptz := date_trunc('hour', current_time);
  minute_limit integer;
  hour_limit integer;
  next_minute_count integer;
  next_hour_count integer;
  wait_seconds integer := 0;
begin
  if actor_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  select limits.minute_limit, limits.hour_limit
    into minute_limit, hour_limit
  from (values
    ('recommend'::text, 12, 120),
    ('review'::text, 12, 120),
    ('hint'::text, 20, 200),
    ('session_title'::text, 10, 100),
    ('preference_merge'::text, 5, 30)
  ) as limits(operation, minute_limit, hour_limit)
  where limits.operation = normalized_operation;

  if minute_limit is null or hour_limit is null then
    raise exception 'Unsupported Practice AI operation.' using errcode = '22023';
  end if;

  insert into public.practice_ai_request_windows (
    user_id,
    operation,
    window_seconds,
    window_started_at,
    request_count,
    updated_at
  ) values (
    actor_id,
    normalized_operation,
    60,
    minute_start,
    1,
    current_time
  )
  on conflict (user_id, operation, window_seconds, window_started_at)
  do update set
    request_count = public.practice_ai_request_windows.request_count + 1,
    updated_at = excluded.updated_at
  returning request_count into next_minute_count;

  insert into public.practice_ai_request_windows (
    user_id,
    operation,
    window_seconds,
    window_started_at,
    request_count,
    updated_at
  ) values (
    actor_id,
    normalized_operation,
    3600,
    hour_start,
    1,
    current_time
  )
  on conflict (user_id, operation, window_seconds, window_started_at)
  do update set
    request_count = public.practice_ai_request_windows.request_count + 1,
    updated_at = excluded.updated_at
  returning request_count into next_hour_count;

  delete from public.practice_ai_request_windows counter
  where counter.user_id = actor_id
    and counter.window_started_at < current_time - interval '2 days';

  if next_minute_count > minute_limit then
    wait_seconds := greatest(
      wait_seconds,
      ceil(extract(epoch from minute_start + interval '1 minute' - current_time))::integer
    );
  end if;
  if next_hour_count > hour_limit then
    wait_seconds := greatest(
      wait_seconds,
      ceil(extract(epoch from hour_start + interval '1 hour' - current_time))::integer
    );
  end if;

  return query select
    next_minute_count <= minute_limit and next_hour_count <= hour_limit,
    greatest(0, wait_seconds),
    next_minute_count,
    next_hour_count;
end;
$$;

revoke execute on function public.claim_practice_ai_request(text) from public, anon;
grant execute on function public.claim_practice_ai_request(text) to authenticated;

comment on table public.practice_ai_request_windows is
  'Server-controlled fixed-window admission counters for authenticated Practice AI operations.';
