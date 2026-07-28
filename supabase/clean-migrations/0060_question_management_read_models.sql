-- Bounded read models for question-management surfaces.
--
-- This migration is additive and forward-only. It keeps taxonomy RLS and
-- direct table grants authoritative by using SECURITY INVOKER.

create or replace function public.get_active_taxonomy_catalog_v1()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
with
active_aliases as (
  select
    alias.tag_id,
    jsonb_agg(alias.alias_text order by alias.alias_text) as aliases
  from public.taxonomy_aliases alias
  where alias.status = 'active'
  group by alias.tag_id
),
active_parents as (
  select
    edge.to_tag_id as tag_id,
    jsonb_agg(edge.from_tag_id order by edge.sort_order, edge.from_tag_id) as parent_tag_ids
  from public.taxonomy_edges edge
  join public.taxonomy_nodes parent
    on parent.tag_id = edge.from_tag_id
   and parent.status = 'active'
  where edge.status = 'active'
    and edge.edge_kind = 'parent_child'
  group by edge.to_tag_id
),
facet_payload as (
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'facet_key', facet.facet_key,
        'label', facet.label,
        'root_tag_id', facet.root_tag_id,
        'sort_order', facet.sort_order
      )
      order by facet.sort_order, facet.facet_key
    ),
    '[]'::jsonb
  ) as facets
  from public.taxonomy_facets facet
  where facet.status = 'active'
),
node_payload as (
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'tag_id', node.tag_id,
        'facet_key', node.facet_key,
        'label', node.label,
        'description', node.description,
        'is_assignable', node.is_assignable,
        'aliases', coalesce(alias_map.aliases, '[]'::jsonb),
        'parent_tag_ids', coalesce(parent_map.parent_tag_ids, '[]'::jsonb)
      )
      order by node.sort_order, node.tag_id
    ),
    '[]'::jsonb
  ) as nodes
  from public.taxonomy_nodes node
  left join active_aliases alias_map on alias_map.tag_id = node.tag_id
  left join active_parents parent_map on parent_map.tag_id = node.tag_id
  where node.status = 'active'
)
select jsonb_build_object(
  'facets', facet_payload.facets,
  'nodes', node_payload.nodes
)
from facet_payload
cross join node_payload;
$$;

revoke all on function public.get_active_taxonomy_catalog_v1()
  from public, anon, authenticated, service_role;
grant execute on function public.get_active_taxonomy_catalog_v1()
  to anon, authenticated, service_role;

comment on function public.get_active_taxonomy_catalog_v1() is
  'Versioned, bounded active-taxonomy read model for question-management filters; SECURITY INVOKER preserves table RLS and grants.';

create or replace function public.list_teacher_question_bank_summaries_v1()
returns table (
  id uuid,
  organization_id uuid,
  owner_id uuid,
  name text,
  description text,
  visibility text,
  status text,
  metadata jsonb,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz,
  updated_at timestamptz,
  membership_role text,
  active_member_count bigint,
  assignment_ready_count bigint,
  import_batch_count bigint,
  question_count bigint,
  review_draft_count bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
with
requester_memberships as materialized (
  select member.bank_id, member.role
  from public.bank_members member
  where member.user_id = (select auth.uid())
    and member.status = 'active'
),
member_counts as (
  select member.bank_id, count(*) as active_member_count
  from public.bank_members member
  join requester_memberships requester on requester.bank_id = member.bank_id
  where member.status = 'active'
  group by member.bank_id
),
question_counts as (
  select bank_question.bank_id, count(*) as question_count
  from public.bank_questions bank_question
  join requester_memberships requester on requester.bank_id = bank_question.bank_id
  where bank_question.status = 'active'
  group by bank_question.bank_id
),
review_counts as (
  select question.owner_bank_id as bank_id, count(*) as review_draft_count
  from public.questions question
  join requester_memberships requester
    on requester.bank_id = question.owner_bank_id
  where question.status = 'draft'
    and question.deleted_at is null
  group by question.owner_bank_id
),
import_counts as (
  select batch.target_bank_id as bank_id, count(*) as import_batch_count
  from public.import_batches batch
  join requester_memberships requester
    on requester.bank_id = batch.target_bank_id
  group by batch.target_bank_id
)
select
  bank.id,
  bank.organization_id,
  bank.owner_id,
  bank.name,
  bank.description,
  bank.visibility,
  bank.status,
  bank.metadata,
  bank.created_by,
  bank.updated_by,
  bank.created_at,
  bank.updated_at,
  requester.role as membership_role,
  coalesce(member_counts.active_member_count, 0),
  coalesce(question_counts.question_count, 0) as assignment_ready_count,
  coalesce(import_counts.import_batch_count, 0),
  coalesce(question_counts.question_count, 0),
  coalesce(review_counts.review_draft_count, 0)
from requester_memberships requester
join public.question_banks bank on bank.id = requester.bank_id
left join member_counts on member_counts.bank_id = bank.id
left join question_counts on question_counts.bank_id = bank.id
left join review_counts on review_counts.bank_id = bank.id
left join import_counts on import_counts.bank_id = bank.id
order by bank.updated_at desc, bank.id;
$$;

revoke all on function public.list_teacher_question_bank_summaries_v1()
  from public, anon, authenticated, service_role;
grant execute on function public.list_teacher_question_bank_summaries_v1()
  to authenticated;

comment on function public.list_teacher_question_bank_summaries_v1() is
  'Current-user Library summary read model; auth.uid-derived membership scope and SECURITY INVOKER preserve Library RLS without caller-supplied identity.';
