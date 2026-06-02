insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'question-source-files',
  'question-source-files',
  false,
  20971520,
  array['application/pdf']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.question_source_files (
  id uuid primary key default gen_random_uuid(),
  question_id uuid references public.questions(id) on delete set null,
  object_path text not null unique check (length(btrim(object_path)) > 0),
  original_filename text not null check (length(btrim(original_filename)) > 0),
  mime_type text not null check (mime_type = 'application/pdf'),
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 20971520),
  status text not null default 'pending'
    check (status in ('pending', 'ready', 'deleted')),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.question_source_files is
  'Admin-only source PDFs for original materials and future ingestion/AI parsing. Not shown publicly.';

create index if not exists question_source_files_question_id_idx
  on public.question_source_files(question_id);

create index if not exists question_source_files_pending_idx
  on public.question_source_files(created_at)
  where status = 'pending';

drop trigger if exists question_source_files_set_updated_at
on public.question_source_files;

create trigger question_source_files_set_updated_at
before update on public.question_source_files
for each row execute function private.set_updated_at();

alter table public.question_source_files enable row level security;

grant select, insert, update, delete on table public.question_source_files
to authenticated;

drop policy if exists question_source_files_admin_crud
on public.question_source_files;

create policy question_source_files_admin_crud
on public.question_source_files for all
to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

drop policy if exists question_source_files_admin_upload
on storage.objects;

create policy question_source_files_admin_upload
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'question-source-files'
  and (select private.is_admin())
  and exists (
    select 1
    from public.question_source_files qsf
    where qsf.object_path = name
      and qsf.status = 'pending'
      and qsf.created_by = (select auth.uid())
  )
);

drop policy if exists question_source_files_admin_read
on storage.objects;

create policy question_source_files_admin_read
on storage.objects for select
to authenticated
using (
  bucket_id = 'question-source-files'
  and (select private.is_admin())
);

drop policy if exists question_source_files_admin_delete
on storage.objects;

create policy question_source_files_admin_delete
on storage.objects for delete
to authenticated
using (
  bucket_id = 'question-source-files'
  and (select private.is_admin())
);
