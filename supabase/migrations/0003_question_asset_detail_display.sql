alter table public.question_assets
add column if not exists display_on_detail boolean not null default false;

drop policy if exists question_assets_public_read_displayed
on public.question_assets;

create policy question_assets_public_read_displayed
on public.question_assets for select
to anon, authenticated
using (
  status = 'ready'
  and display_on_detail
  and exists (
    select 1
    from public.questions q
    where q.id = question_id
      and q.status = 'published'
  )
);
