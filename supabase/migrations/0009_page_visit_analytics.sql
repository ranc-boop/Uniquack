-- =====================================================================
-- Page Visits Analytics: visitor IP tracking (SHA-256 hashed) with
-- country-level geo resolution.
-- Requires: 0001_initial_schema.sql (private.set_updated_at trigger).
-- =====================================================================

create table if not exists public.page_visits (
  id uuid primary key default gen_random_uuid(),
  ip_hash text not null,
  country_code text,
  country_name text,
  pathname text not null,
  user_agent text,
  user_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

comment on table public.page_visits is
  'Visitor access logs. IP is stored as SHA-256 hash (not plain text). Geo data at country level only.';

create index if not exists page_visits_country_created_idx
  on public.page_visits (country_code, created_at desc);

create index if not exists page_visits_created_at_idx
  on public.page_visits (created_at desc);

create index if not exists page_visits_pathname_idx
  on public.page_visits (pathname);

-- =====================================================================
-- RLS: anon/authenticated may INSERT; only admin may SELECT/DELETE.
-- =====================================================================

alter table public.page_visits enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policy
    where polrelid = 'public.page_visits'::regclass
      and polname = 'page_visits_any_insert'
  ) then
    create policy page_visits_any_insert
      on public.page_visits for insert
      to anon, authenticated
      with check (true);
  end if;

  if not exists (
    select 1 from pg_policy
    where polrelid = 'public.page_visits'::regclass
      and polname = 'page_visits_admin_select'
  ) then
    create policy page_visits_admin_select
      on public.page_visits for select
      to authenticated
      using ((select private.is_admin()));
  end if;

  if not exists (
    select 1 from pg_policy
    where polrelid = 'public.page_visits'::regclass
      and polname = 'page_visits_super_admin_delete'
  ) then
    create policy page_visits_super_admin_delete
      on public.page_visits for delete
      to authenticated
      using ((select private.is_super_admin()));
  end if;
end $$;

-- =====================================================================
-- Aggregate view: country statistics
-- =====================================================================

create or replace view public.page_visit_country_stats
with (security_definer = true)
as
select
  country_code,
  max(country_name) as country_name,
  count(*) as visit_count,
  count(distinct ip_hash) as unique_visitor_count,
  min(created_at) as first_visit_at,
  max(created_at) as last_visit_at
from public.page_visits
group by country_code
order by visit_count desc;

comment on view public.page_visit_country_stats is
  'Aggregated country-level visit counts. Security definer so non-admin viewers can see aggregated stats.';

grant select on public.page_visit_country_stats to anon, authenticated;

-- =====================================================================
-- Aggregate view: daily trend
-- =====================================================================

create or replace view public.page_visit_daily_stats
with (security_definer = true)
as
select
  date(created_at) as visit_date,
  country_code,
  max(country_name) as country_name,
  count(*) as visit_count,
  count(distinct ip_hash) as unique_visitor_count
from public.page_visits
group by date(created_at), country_code
order by visit_date desc, visit_count desc;

comment on view public.page_visit_daily_stats is
  'Daily aggregated visit counts by country. Security definer so non-admin viewers can see aggregated stats.';

grant select on public.page_visit_daily_stats to anon, authenticated;
