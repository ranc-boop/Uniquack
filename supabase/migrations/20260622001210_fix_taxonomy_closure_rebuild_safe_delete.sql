-- Forward repair for databases that already ran an earlier taxonomy migration.
-- Some environments reject DELETE statements without a WHERE clause. The closure
-- table is fully rebuilt by this helper, so TRUNCATE is the intended operation.

create or replace function private.rebuild_taxonomy_node_closure()
returns void
language plpgsql
security definer
set search_path = public, private
as $$
begin
  truncate table public.taxonomy_node_closure;

  insert into public.taxonomy_node_closure (ancestor_tag_id, descendant_tag_id, depth)
  with recursive walk as (
    select
      tag_id as ancestor_tag_id,
      tag_id as descendant_tag_id,
      0 as depth,
      array[tag_id] as visited
    from public.taxonomy_nodes
    where status = 'active'
    union all
    select
      w.ancestor_tag_id,
      c.tag_id as descendant_tag_id,
      w.depth + 1 as depth,
      w.visited || c.tag_id
    from walk w
    join public.taxonomy_edges e on e.from_tag_id = w.descendant_tag_id and e.edge_kind = 'parent_child' and e.status = 'active'
    join public.taxonomy_nodes c on c.tag_id = e.to_tag_id and c.status = 'active'
    where not c.tag_id = any(w.visited)
  )
  select ancestor_tag_id, descendant_tag_id, min(depth)
  from walk
  group by ancestor_tag_id, descendant_tag_id
  on conflict (ancestor_tag_id, descendant_tag_id) do update
    set depth = excluded.depth;
end;
$$;

select private.rebuild_taxonomy_node_closure();
