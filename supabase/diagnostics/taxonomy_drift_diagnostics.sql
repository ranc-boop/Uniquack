-- Taxonomy drift diagnostics.
-- Run manually in Supabase SQL Editor. This file is read-only.

select
  version,
  name
from supabase_migrations.schema_migrations
where version in (
  '0011',
  '0012',
  '20260622001158'
)
   or name ilike '%taxonomy%'
order by version desc;

select
  'private schema usage' as check_name,
  has_schema_privilege('anon', 'private', 'USAGE') as anon_ok,
  has_schema_privilege('authenticated', 'private', 'USAGE') as authenticated_ok;

select
  proname as function_name,
  has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'private'
  and proname in (
    'current_user_role',
    'is_admin',
    'is_super_admin',
    'taxonomy_label_from_tag_id'
  )
order by proname;

select
  n.nspname as schema_name,
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as arguments,
  has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where (n.nspname, p.proname) in (
  ('public', 'taxonomy_tag_path'),
  ('public', 'search_questions_by_taxonomy')
)
order by n.nspname, p.proname;

select
  expected.table_name,
  to_regclass('public.' || expected.table_name) is not null as exists_in_public_schema,
  coalesce(pg_class.reltuples::bigint, 0) as estimated_rows
from (
  values
    ('questions'),
    ('taxonomy_nodes'),
    ('taxonomy_edges'),
    ('taxonomy_node_closure'),
    ('question_taxonomy_assignments')
) as expected(table_name)
left join pg_class
  on pg_class.oid = to_regclass('public.' || expected.table_name);

select
  status,
  count(*) as question_count
from public.questions
group by status
order by status;
