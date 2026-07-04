-- Course Builder to Assignment Bridge.
-- Adds lightweight source metadata so teacher-created assignments can trace back to
-- a Course Builder run or practice framework without changing assignment visibility.

alter table public.assignments
  add column if not exists source_kind text not null default 'manual'
    check (source_kind in ('manual', 'course_builder_run', 'practice_framework')),
  add column if not exists source_record_id uuid,
  add column if not exists source_summary jsonb not null default '{}'::jsonb
    check (jsonb_typeof(source_summary) = 'object');

create index if not exists assignments_source_idx
  on public.assignments(source_kind, source_record_id)
  where source_record_id is not null;

comment on column public.assignments.source_kind is
  'Assignment origin. Course Builder bridge uses course_builder_run or practice_framework; student visibility still depends on assignment status.';

comment on column public.assignments.source_record_id is
  'Optional source record id for traceability to course_generation_runs or practice_course_frameworks.';

comment on column public.assignments.source_summary is
  'Bounded assignment source metadata for teacher UI traceability. Does not grant student visibility to planning outputs.';
