-- Question Blueprint calibration and generation readiness.
-- Calibration stores bounded sample previews and validation summaries only.

begin;

create table if not exists public.question_blueprint_calibration_runs (
  id uuid primary key default gen_random_uuid(),
  blueprint_id uuid not null references public.question_blueprints(id) on delete cascade,
  blueprint_version integer not null,
  status text not null
    check (status in ('calibrating', 'generation_ready', 'needs_edit', 'blocked')),
  provider_kind text not null default 'deepseek'
    check (provider_kind = 'deepseek'),
  model_name text not null,
  sample_count integer not null check (sample_count between 1 and 3),
  sample_previews jsonb not null default '[]'::jsonb,
  validation_summary jsonb not null default '{}'::jsonb,
  adherence_summary jsonb not null default '{}'::jsonb,
  originality_summary jsonb not null default '{}'::jsonb,
  diversity_summary jsonb not null default '{}'::jsonb,
  readiness_result text not null
    check (readiness_result in ('generation_ready', 'needs_edit', 'blocked')),
  blocking_reasons jsonb not null default '[]'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.question_blueprints
  add column if not exists generation_readiness text not null default 'uncalibrated'
    check (generation_readiness in ('uncalibrated', 'calibrating', 'generation_ready', 'needs_edit', 'blocked')),
  add column if not exists last_calibrated_at timestamptz,
  add column if not exists last_calibration_run_id uuid references public.question_blueprint_calibration_runs(id) on delete set null;

create index if not exists question_blueprint_calibration_runs_blueprint_idx
  on public.question_blueprint_calibration_runs(blueprint_id, created_at desc);

create index if not exists question_blueprints_generation_readiness_idx
  on public.question_blueprints(generation_readiness, updated_at desc)
  where deleted_at is null;

alter table public.question_blueprint_calibration_runs enable row level security;

grant select, insert, update, delete on table
  public.question_blueprint_calibration_runs
to authenticated;

drop policy if exists question_blueprint_calibration_runs_admin_crud on public.question_blueprint_calibration_runs;
create policy question_blueprint_calibration_runs_admin_crud
on public.question_blueprint_calibration_runs for all
to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

comment on table public.question_blueprint_calibration_runs is
  'Admin-only calibration preview runs for approved question blueprints. Stores bounded sample previews and summaries, never raw provider responses.';
comment on column public.question_blueprints.generation_readiness is
  'Generation gate derived from the latest successful calibration preview.';
comment on column public.question_blueprints.last_calibration_run_id is
  'Latest calibration run used to decide generation readiness.';

commit;
