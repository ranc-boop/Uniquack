create table if not exists public.import_batches (
  id uuid primary key default gen_random_uuid(),
  source_type text not null
    check (source_type in (
      'manual_json',
      'manual_csv',
      'ai_pdf',
      'ai_image',
      'ai_word'
    )),
  source_file_id uuid,
  status text not null default 'draft'
    check (status in ('draft', 'validating', 'ready', 'imported', 'failed')),
  summary jsonb not null default '{}'::jsonb,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.import_batches is
  'Admin-only structured import batches. Future AI parsers can write normalized output into this same pipeline.';

create table if not exists public.import_batch_items (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.import_batches(id) on delete cascade,
  item_index int not null check (item_index >= 0),
  raw_payload jsonb not null,
  normalized_question_json jsonb,
  validation_errors jsonb not null default '[]'::jsonb,
  status text not null default 'invalid'
    check (status in ('valid', 'invalid', 'imported', 'skipped')),
  created_question_id uuid references public.questions(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (batch_id, item_index)
);

comment on table public.import_batch_items is
  'Per-item preview, validation, normalized question JSON, and import result records.';

create index if not exists import_batches_created_by_created_at_idx
  on public.import_batches(created_by, created_at desc);

create index if not exists import_batch_items_batch_id_idx
  on public.import_batch_items(batch_id, item_index);

drop trigger if exists import_batches_set_updated_at
on public.import_batches;

create trigger import_batches_set_updated_at
before update on public.import_batches
for each row execute function private.set_updated_at();

drop trigger if exists import_batch_items_set_updated_at
on public.import_batch_items;

create trigger import_batch_items_set_updated_at
before update on public.import_batch_items
for each row execute function private.set_updated_at();

alter table public.import_batches enable row level security;
alter table public.import_batch_items enable row level security;

grant select, insert, update, delete on table public.import_batches
to authenticated;

grant select, insert, update, delete on table public.import_batch_items
to authenticated;

drop policy if exists import_batches_admin_crud
on public.import_batches;

create policy import_batches_admin_crud
on public.import_batches for all
to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

drop policy if exists import_batch_items_admin_crud
on public.import_batch_items;

create policy import_batch_items_admin_crud
on public.import_batch_items for all
to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));
