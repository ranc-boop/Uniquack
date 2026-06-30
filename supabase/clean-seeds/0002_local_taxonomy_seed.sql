-- Clean Supabase local seed draft.
-- Minimal representative taxonomy for local smoke tests.
-- This is not a full production taxonomy and does not import legacy tag data.

begin;
set constraints all deferred;

insert into public.taxonomy_nodes (
  tag_id,
  node_kind,
  subject_tag_id,
  facet_key,
  label,
  description,
  is_assignable,
  sort_order,
  status,
  metadata
)
values
  ('math', 'subject', null, null, 'Mathematics', 'Local demo subject.', false, 0, 'active', '{"seed":"local"}'::jsonb),
  ('math.curriculum', 'facet_root', 'math', 'curriculum', 'Curriculum', 'Curriculum roots are browse-only.', false, 10, 'active', '{"seed":"local"}'::jsonb),
  ('math.concept', 'facet_root', 'math', 'concept', 'Concept', 'Concept roots are browse-only.', false, 20, 'active', '{"seed":"local"}'::jsonb),
  ('math.method', 'facet_root', 'math', 'method', 'Method', 'Method roots are browse-only.', false, 30, 'active', '{"seed":"local"}'::jsonb),
  ('math.task', 'facet_root', 'math', 'task', 'Task', 'Task roots are browse-only.', false, 40, 'active', '{"seed":"local"}'::jsonb),
  ('math.form', 'facet_root', 'math', 'form', 'Form', 'Form roots are browse-only.', false, 50, 'active', '{"seed":"local"}'::jsonb)
on conflict (tag_id) do update
set
  node_kind = excluded.node_kind,
  subject_tag_id = excluded.subject_tag_id,
  facet_key = excluded.facet_key,
  label = excluded.label,
  description = excluded.description,
  is_assignable = excluded.is_assignable,
  sort_order = excluded.sort_order,
  status = excluded.status,
  metadata = excluded.metadata,
  updated_at = now();

insert into public.taxonomy_facets (
  facet_key,
  subject_tag_id,
  root_tag_id,
  label,
  description,
  sort_order,
  status,
  config
)
values
  ('curriculum', 'math', 'math.curriculum', 'Curriculum', 'Course or standard alignment.', 10, 'active', '{"seed":"local"}'::jsonb),
  ('concept', 'math', 'math.concept', 'Concept', 'Canonical mathematical concepts.', 20, 'active', '{"seed":"local"}'::jsonb),
  ('method', 'math', 'math.method', 'Method', 'Solution methods and procedures.', 30, 'active', '{"seed":"local"}'::jsonb),
  ('task', 'math', 'math.task', 'Task', 'Question intent or action.', 40, 'active', '{"seed":"local"}'::jsonb),
  ('form', 'math', 'math.form', 'Form', 'Question representation or response format.', 50, 'active', '{"seed":"local"}'::jsonb)
on conflict (facet_key) do update
set
  subject_tag_id = excluded.subject_tag_id,
  root_tag_id = excluded.root_tag_id,
  label = excluded.label,
  description = excluded.description,
  sort_order = excluded.sort_order,
  status = excluded.status,
  config = excluded.config,
  updated_at = now();

insert into public.taxonomy_nodes (
  tag_id,
  node_kind,
  subject_tag_id,
  facet_key,
  label,
  description,
  is_assignable,
  sort_order,
  status,
  metadata
)
values
  ('math.curriculum.ap_calculus_bc', 'tag', 'math', 'curriculum', 'AP Calculus BC', 'Local curriculum seed.', true, 10, 'active', '{"seed":"local"}'::jsonb),
  ('math.curriculum.ap_calculus_bc.applications_of_integration', 'tag', 'math', 'curriculum', 'Applications of Integration', 'Local curriculum unit seed.', true, 20, 'active', '{"seed":"local"}'::jsonb),
  ('math.concept.integration', 'tag', 'math', 'concept', 'Integration', 'Browse-only integration concept group.', false, 10, 'active', '{"seed":"local"}'::jsonb),
  ('math.concept.integration.accumulation', 'tag', 'math', 'concept', 'Accumulation', 'Use definite integrals to model accumulated change.', true, 20, 'active', '{"seed":"local"}'::jsonb),
  ('math.concept.integration.area_between_curves', 'tag', 'math', 'concept', 'Area Between Curves', 'Find area bounded by two functions.', true, 30, 'active', '{"seed":"local"}'::jsonb),
  ('math.method.integral_setup', 'tag', 'math', 'method', 'Set Up An Integral', 'Translate conditions into an integral expression.', true, 10, 'active', '{"seed":"local"}'::jsonb),
  ('math.method.table_accumulation', 'tag', 'math', 'method', 'Table-Based Accumulation', 'Use tabular rate data to estimate or compute change.', true, 20, 'active', '{"seed":"local"}'::jsonb),
  ('math.task.determine', 'tag', 'math', 'task', 'Determine', 'Find a requested value or expression.', true, 10, 'active', '{"seed":"local"}'::jsonb),
  ('math.task.explain', 'tag', 'math', 'task', 'Explain', 'Justify reasoning in words or steps.', true, 20, 'active', '{"seed":"local"}'::jsonb),
  ('math.form.free_response', 'tag', 'math', 'form', 'Free Response', 'Written solution or explanation.', true, 10, 'active', '{"seed":"local"}'::jsonb),
  ('math.form.table', 'tag', 'math', 'form', 'Table', 'Question uses tabular information.', true, 20, 'active', '{"seed":"local"}'::jsonb),
  ('math.form.multiple_choice', 'tag', 'math', 'form', 'Multiple Choice', 'Question uses answer options.', true, 30, 'active', '{"seed":"local"}'::jsonb)
on conflict (tag_id) do update
set
  node_kind = excluded.node_kind,
  subject_tag_id = excluded.subject_tag_id,
  facet_key = excluded.facet_key,
  label = excluded.label,
  description = excluded.description,
  is_assignable = excluded.is_assignable,
  sort_order = excluded.sort_order,
  status = excluded.status,
  metadata = excluded.metadata,
  updated_at = now();

insert into public.taxonomy_edges (
  from_tag_id,
  to_tag_id,
  edge_kind,
  is_primary,
  sort_order,
  status,
  metadata
)
values
  ('math', 'math.curriculum', 'parent_child', true, 10, 'active', '{"seed":"local"}'::jsonb),
  ('math', 'math.concept', 'parent_child', true, 20, 'active', '{"seed":"local"}'::jsonb),
  ('math', 'math.method', 'parent_child', true, 30, 'active', '{"seed":"local"}'::jsonb),
  ('math', 'math.task', 'parent_child', true, 40, 'active', '{"seed":"local"}'::jsonb),
  ('math', 'math.form', 'parent_child', true, 50, 'active', '{"seed":"local"}'::jsonb),
  ('math.curriculum', 'math.curriculum.ap_calculus_bc', 'parent_child', true, 10, 'active', '{"seed":"local"}'::jsonb),
  ('math.curriculum', 'math.curriculum.ap_calculus_bc.applications_of_integration', 'parent_child', true, 20, 'active', '{"seed":"local"}'::jsonb),
  ('math.concept', 'math.concept.integration', 'parent_child', true, 10, 'active', '{"seed":"local"}'::jsonb),
  ('math.concept.integration', 'math.concept.integration.accumulation', 'parent_child', true, 20, 'active', '{"seed":"local"}'::jsonb),
  ('math.concept.integration', 'math.concept.integration.area_between_curves', 'parent_child', true, 30, 'active', '{"seed":"local"}'::jsonb),
  ('math.method', 'math.method.integral_setup', 'parent_child', true, 10, 'active', '{"seed":"local"}'::jsonb),
  ('math.method', 'math.method.table_accumulation', 'parent_child', true, 20, 'active', '{"seed":"local"}'::jsonb),
  ('math.task', 'math.task.determine', 'parent_child', true, 10, 'active', '{"seed":"local"}'::jsonb),
  ('math.task', 'math.task.explain', 'parent_child', true, 20, 'active', '{"seed":"local"}'::jsonb),
  ('math.form', 'math.form.free_response', 'parent_child', true, 10, 'active', '{"seed":"local"}'::jsonb),
  ('math.form', 'math.form.table', 'parent_child', true, 20, 'active', '{"seed":"local"}'::jsonb),
  ('math.form', 'math.form.multiple_choice', 'parent_child', true, 30, 'active', '{"seed":"local"}'::jsonb),
  ('math.curriculum.ap_calculus_bc.applications_of_integration', 'math.concept.integration.accumulation', 'maps_to', true, 10, 'active', '{"seed":"local"}'::jsonb),
  ('math.curriculum.ap_calculus_bc.applications_of_integration', 'math.concept.integration.area_between_curves', 'maps_to', true, 20, 'active', '{"seed":"local"}'::jsonb)
on conflict (from_tag_id, to_tag_id, edge_kind) do update
set
  is_primary = excluded.is_primary,
  sort_order = excluded.sort_order,
  status = excluded.status,
  metadata = excluded.metadata,
  updated_at = now();

insert into public.taxonomy_aliases (
  alias_text,
  normalized_alias,
  tag_id,
  status,
  metadata
)
values
  ('Applications of Integration', 'applications of integration', 'math.curriculum.ap_calculus_bc.applications_of_integration', 'active', '{"seed":"local"}'::jsonb),
  ('Accumulation', 'accumulation', 'math.concept.integration.accumulation', 'active', '{"seed":"local"}'::jsonb),
  ('Area between curves', 'area between curves', 'math.concept.integration.area_between_curves', 'active', '{"seed":"local"}'::jsonb),
  ('FRQ', 'frq', 'math.form.free_response', 'active', '{"seed":"local"}'::jsonb)
on conflict (normalized_alias, tag_id) do update
set
  alias_text = excluded.alias_text,
  status = excluded.status,
  metadata = excluded.metadata,
  updated_at = now();

select private.rebuild_taxonomy_node_closure();

commit;

