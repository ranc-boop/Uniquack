insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'question-assets',
  'question-assets',
  true,
  6291456,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table public.question_assets (
  id uuid primary key default gen_random_uuid(),
  question_id uuid references public.questions(id) on delete set null,
  object_path text not null unique check (length(btrim(object_path)) > 0),
  mime_type text not null
    check (mime_type in ('image/jpeg', 'image/png', 'image/webp', 'image/gif')),
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 6291456),
  original_filename text not null check (length(btrim(original_filename)) > 0),
  status text not null default 'pending'
    check (status in ('pending', 'ready')),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index question_assets_question_id_idx
  on public.question_assets(question_id);

create index question_assets_pending_idx
  on public.question_assets(created_at)
  where status = 'pending';

create trigger question_assets_set_updated_at
before update on public.question_assets
for each row execute function private.set_updated_at();

alter table public.question_assets enable row level security;

grant select, insert, update, delete on table public.question_assets
to authenticated;

create policy question_assets_admin_crud
on public.question_assets for all
to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

create policy question_assets_admin_upload
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'question-assets'
  and (select private.is_admin())
  and exists (
    select 1
    from public.question_assets qa
    where qa.object_path = name
      and qa.status = 'pending'
      and qa.created_by = (select auth.uid())
  )
);

create policy question_assets_admin_list
on storage.objects for select
to authenticated
using (
  bucket_id = 'question-assets'
  and (select private.is_admin())
);

create policy question_assets_admin_delete
on storage.objects for delete
to authenticated
using (
  bucket_id = 'question-assets'
  and (select private.is_admin())
);
