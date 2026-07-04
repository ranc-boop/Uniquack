alter table public.classroom_join_codes
  add column if not exists display_code text;

alter table public.classroom_join_codes
  drop constraint if exists classroom_join_codes_display_code_format;

alter table public.classroom_join_codes
  add constraint classroom_join_codes_display_code_format
  check (
    display_code is null
    or display_code ~ '^[A-Z2-9]{4}-[A-Z2-9]{4}$'
  );

create index if not exists classroom_join_codes_active_display_idx
  on public.classroom_join_codes(classroom_id, status, created_at desc)
  where display_code is not null;

comment on column public.classroom_join_codes.display_code is
  'Teacher-visible classroom enrollment code. Protected by classroom_join_codes RLS; validation still uses code_hash.';
