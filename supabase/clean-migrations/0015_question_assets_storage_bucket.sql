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

drop policy if exists question_assets_staff_upload on storage.objects;
create policy question_assets_staff_upload
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'question-assets'
  and exists (
    select 1
    from public.question_assets qa
    join public.questions q on q.id = qa.question_id
    where qa.storage_bucket = bucket_id
      and qa.storage_path = name
      and (
        qa.created_by = (select auth.uid())
        or private.is_org_staff(q.organization_id)
      )
  )
);

drop policy if exists question_assets_staff_list on storage.objects;
create policy question_assets_staff_list
on storage.objects for select
to authenticated
using (
  bucket_id = 'question-assets'
  and (
    private.is_admin()
    or exists (
      select 1
      from public.question_assets qa
      join public.questions q on q.id = qa.question_id
      where qa.storage_bucket = bucket_id
        and qa.storage_path = name
        and private.is_org_staff(q.organization_id)
    )
  )
);

drop policy if exists question_assets_staff_delete on storage.objects;
create policy question_assets_staff_delete
on storage.objects for delete
to authenticated
using (
  bucket_id = 'question-assets'
  and exists (
    select 1
    from public.question_assets qa
    join public.questions q on q.id = qa.question_id
    where qa.storage_bucket = bucket_id
      and qa.storage_path = name
      and (
        qa.created_by = (select auth.uid())
        or private.is_org_staff(q.organization_id)
      )
  )
);
