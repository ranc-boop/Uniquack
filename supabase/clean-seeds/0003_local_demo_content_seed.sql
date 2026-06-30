-- Clean Supabase local seed draft.
-- Synthetic demo content only. Do not copy private school/client content here.
-- Requires the organization seed and taxonomy seed to run first.

begin;

insert into public.questions (
  id,
  organization_id,
  question_code,
  title,
  question_type,
  content_html,
  content_source,
  content_source_format,
  solution_html,
  solution_source,
  solution_source_format,
  options,
  answer_spec,
  difficulty_rating,
  status,
  source,
  source_kind,
  published_at
)
values
  (
    '77777777-7777-4777-8777-777777777701',
    (select id from public.organizations where slug = 'edustruct-clean-mvp'),
    'LOCAL-CALC-001',
    'Accumulated change from a rate table',
    'mcq',
    '<p>A rate table gives values of <em>r(t)</em> on a closed interval. Which expression best represents the accumulated change over the interval?</p>',
    'A rate table gives values of r(t). Which expression best represents accumulated change?',
    'plain_text',
    '<p>The accumulated change is modeled by a definite integral of the rate function over the interval.</p>',
    'Use the definite integral of the rate function over the interval.',
    'plain_text',
    '[
      {"id":"A","content_html":"<p>The average of the endpoint rates only</p>","content_source":"The average of the endpoint rates only"},
      {"id":"B","content_html":"<p>The integral of <em>r(t)</em> over the interval</p>","content_source":"The integral of r(t) over the interval"},
      {"id":"C","content_html":"<p>The derivative of <em>r(t)</em> at the midpoint</p>","content_source":"The derivative of r(t) at the midpoint"},
      {"id":"D","content_html":"<p>The maximum value of <em>r(t)</em></p>","content_source":"The maximum value of r(t)"}
    ]'::jsonb,
    '{"kind":"mcq","correctOptionIds":["B"],"explanation":"Accumulated change is represented by a definite integral of the rate."}'::jsonb,
    620,
    'published',
    'local_seed',
    'manual',
    now()
  ),
  (
    '77777777-7777-4777-8777-777777777702',
    (select id from public.organizations where slug = 'edustruct-clean-mvp'),
    'LOCAL-CALC-002',
    'Area between two curves',
    'frq',
    '<p>Let <em>f</em> and <em>g</em> be continuous functions with <em>f(x) &ge; g(x)</em> on an interval. Write an expression for the area between the curves.</p>',
    'Write an expression for area between f and g on an interval where f is above g.',
    'plain_text',
    '<p>The area is the definite integral of the top function minus the bottom function over the interval.</p>',
    'Integrate f(x) - g(x) over the interval.',
    'plain_text',
    '[]'::jsonb,
    '{"kind":"free_response","expectedStructure":["integral","top_minus_bottom","interval_bounds"]}'::jsonb,
    680,
    'published',
    'local_seed',
    'manual',
    now()
  )
on conflict (id) do update
set
  question_code = excluded.question_code,
  title = excluded.title,
  question_type = excluded.question_type,
  content_html = excluded.content_html,
  content_source = excluded.content_source,
  content_source_format = excluded.content_source_format,
  solution_html = excluded.solution_html,
  solution_source = excluded.solution_source,
  solution_source_format = excluded.solution_source_format,
  options = excluded.options,
  answer_spec = excluded.answer_spec,
  difficulty_rating = excluded.difficulty_rating,
  status = excluded.status,
  source = excluded.source,
  source_kind = excluded.source_kind,
  published_at = excluded.published_at,
  updated_at = now();

insert into public.question_taxonomy_assignments (
  question_id,
  tag_id,
  source,
  confidence,
  review_status,
  evidence,
  approved_at
)
values
  ('77777777-7777-4777-8777-777777777701', 'math.curriculum.ap_calculus_bc.applications_of_integration', 'manual', 1.0000, 'approved', '{"seed":"local","reason":"curriculum alignment"}'::jsonb, now()),
  ('77777777-7777-4777-8777-777777777701', 'math.concept.integration.accumulation', 'manual', 1.0000, 'approved', '{"seed":"local","reason":"concept alignment"}'::jsonb, now()),
  ('77777777-7777-4777-8777-777777777701', 'math.method.table_accumulation', 'manual', 0.9000, 'approved', '{"seed":"local","reason":"method alignment"}'::jsonb, now()),
  ('77777777-7777-4777-8777-777777777701', 'math.task.determine', 'manual', 0.9000, 'approved', '{"seed":"local","reason":"task alignment"}'::jsonb, now()),
  ('77777777-7777-4777-8777-777777777701', 'math.form.multiple_choice', 'manual', 1.0000, 'approved', '{"seed":"local","reason":"form alignment"}'::jsonb, now()),
  ('77777777-7777-4777-8777-777777777702', 'math.curriculum.ap_calculus_bc.applications_of_integration', 'manual', 1.0000, 'approved', '{"seed":"local","reason":"curriculum alignment"}'::jsonb, now()),
  ('77777777-7777-4777-8777-777777777702', 'math.concept.integration.area_between_curves', 'manual', 1.0000, 'approved', '{"seed":"local","reason":"concept alignment"}'::jsonb, now()),
  ('77777777-7777-4777-8777-777777777702', 'math.method.integral_setup', 'manual', 0.9000, 'approved', '{"seed":"local","reason":"method alignment"}'::jsonb, now()),
  ('77777777-7777-4777-8777-777777777702', 'math.task.determine', 'manual', 0.9000, 'approved', '{"seed":"local","reason":"task alignment"}'::jsonb, now()),
  ('77777777-7777-4777-8777-777777777702', 'math.form.free_response', 'manual', 1.0000, 'approved', '{"seed":"local","reason":"form alignment"}'::jsonb, now())
on conflict (question_id, tag_id) do update
set
  source = excluded.source,
  confidence = excluded.confidence,
  review_status = excluded.review_status,
  evidence = excluded.evidence,
  approved_at = excluded.approved_at,
  updated_at = now();

insert into public.review_batches (
  id,
  organization_id,
  created_by,
  source_kind,
  source_record_id,
  status,
  title,
  summary
)
values (
  '88888888-8888-4888-8888-888888888801',
  (select id from public.organizations where slug = 'edustruct-clean-mvp'),
  null,
  'manual',
  null,
  'pending_review',
  'Local review smoke batch',
  '{"seed":"local","purpose":"admin review smoke"}'::jsonb
)
on conflict (id) do update
set
  status = excluded.status,
  title = excluded.title,
  summary = excluded.summary,
  updated_at = now();

insert into public.review_draft_items (
  id,
  review_batch_id,
  item_kind,
  status,
  draft_payload,
  validation_warnings
)
values (
  '88888888-8888-4888-8888-888888888802',
  '88888888-8888-4888-8888-888888888801',
  'question',
  'pending_review',
  '{
    "question_code":"LOCAL-DRAFT-001",
    "title":"Draft local review question",
    "question_type":"mcq",
    "content_html":"<p>This draft exists only to verify the admin review queue.</p>",
    "solution_html":"<p>Review and edit before publishing.</p>",
    "status":"draft"
  }'::jsonb,
  '["local_seed_draft_requires_review"]'::jsonb
)
on conflict (id) do update
set
  status = excluded.status,
  draft_payload = excluded.draft_payload,
  validation_warnings = excluded.validation_warnings,
  updated_at = now();

insert into public.question_blueprint_folders (
  id,
  owner_scope,
  owner_id,
  parent_id,
  name,
  slug,
  description,
  sort_order
)
values (
  '99999999-9999-4999-8999-999999999901',
  'school',
  null,
  null,
  'Local Calculus Blueprints',
  'local-calculus-blueprints',
  'Synthetic local blueprint folder.',
  10
)
on conflict (id) do update
set
  owner_scope = excluded.owner_scope,
  name = excluded.name,
  slug = excluded.slug,
  description = excluded.description,
  sort_order = excluded.sort_order,
  updated_at = now();

insert into public.question_blueprints (
  id,
  organization_id,
  owner_scope,
  owner_id,
  folder_id,
  status,
  title,
  taxonomy_targets,
  question_pattern,
  required_elements,
  answer_spec_pattern,
  distractor_pattern,
  difficulty_profile,
  generation_constraints,
  originality_constraints,
  source_refs,
  generation_ready,
  generation_readiness,
  generation_blocking_reasons,
  calibration_status,
  version
)
values (
  '99999999-9999-4999-8999-999999999902',
  (select id from public.organizations where slug = 'edustruct-clean-mvp'),
  'school',
  null,
  '99999999-9999-4999-8999-999999999901',
  'approved',
  'Local accumulation blueprint',
  '{"curriculum":["math.curriculum.ap_calculus_bc.applications_of_integration"],"concept":["math.concept.integration.accumulation"],"method":["math.method.table_accumulation"],"task":["math.task.determine"],"form":["math.form.multiple_choice"]}'::jsonb,
  '{"summary":"Use a rate or accumulation context and ask for the expression that models total change."}'::jsonb,
  '["rate context","accumulation target","bounded answer choices"]'::jsonb,
  '{"kind":"mcq","requiresCorrectOption":true}'::jsonb,
  '{"pattern":"include common rate-vs-accumulation misconception"}'::jsonb,
  '{"target":620,"range":[550,700]}'::jsonb,
  '{"draftOnly":true,"requiresReview":true}'::jsonb,
  '{"mustBeOriginal":true,"noSourceCopying":true}'::jsonb,
  '[{"kind":"manual_seed","ref":"LOCAL-CALC-001","evidence":"Synthetic pattern example."}]'::jsonb,
  true,
  'generation_ready',
  '[]'::jsonb,
  'calibrated',
  1
)
on conflict (id) do update
set
  folder_id = excluded.folder_id,
  status = excluded.status,
  title = excluded.title,
  taxonomy_targets = excluded.taxonomy_targets,
  question_pattern = excluded.question_pattern,
  required_elements = excluded.required_elements,
  answer_spec_pattern = excluded.answer_spec_pattern,
  distractor_pattern = excluded.distractor_pattern,
  difficulty_profile = excluded.difficulty_profile,
  generation_constraints = excluded.generation_constraints,
  originality_constraints = excluded.originality_constraints,
  source_refs = excluded.source_refs,
  generation_ready = excluded.generation_ready,
  generation_readiness = excluded.generation_readiness,
  generation_blocking_reasons = excluded.generation_blocking_reasons,
  calibration_status = excluded.calibration_status,
  updated_at = now();

insert into public.question_blueprint_examples (
  id,
  blueprint_id,
  source_kind,
  source_reference_id,
  question_id,
  review_draft_item_id,
  evidence_snippets,
  asset_refs
)
values (
  '99999999-9999-4999-8999-999999999903',
  '99999999-9999-4999-8999-999999999902',
  'question',
  null,
  '77777777-7777-4777-8777-777777777701',
  null,
  '["Accumulated change is modeled by an integral of a rate."]'::jsonb,
  '[]'::jsonb
)
on conflict (id) do update
set
  evidence_snippets = excluded.evidence_snippets,
  asset_refs = excluded.asset_refs;

insert into public.practice_course_frameworks (
  id,
  organization_id,
  title,
  description,
  framework_prompt,
  learning_path,
  allowed_tag_ids,
  priority_rules,
  status,
  framework_payload,
  assigned_question_ids,
  created_by,
  updated_by,
  teacher_id,
  published_at
)
values (
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
  (select id from public.organizations where slug = 'edustruct-clean-mvp'),
  'Local Applications of Integration Review',
  'Synthetic local framework for course builder smoke tests.',
  'Review accumulation and area between curves using approved local questions.',
  '[{"title":"Warm-up","tagIds":["math.concept.integration.accumulation"]},{"title":"Transfer","tagIds":["math.concept.integration.area_between_curves"]}]'::jsonb,
  array['math.concept.integration.accumulation','math.concept.integration.area_between_curves'],
  'Prioritize missed accumulation and setup questions.',
  'published',
  '{"seed":"local","draftOnly":false}'::jsonb,
  array['77777777-7777-4777-8777-777777777701'::uuid,'77777777-7777-4777-8777-777777777702'::uuid],
  null,
  null,
  null,
  now()
)
on conflict (id) do update
set
  title = excluded.title,
  description = excluded.description,
  framework_prompt = excluded.framework_prompt,
  learning_path = excluded.learning_path,
  allowed_tag_ids = excluded.allowed_tag_ids,
  priority_rules = excluded.priority_rules,
  status = excluded.status,
  framework_payload = excluded.framework_payload,
  assigned_question_ids = excluded.assigned_question_ids,
  published_at = excluded.published_at,
  updated_at = now();

insert into public.videos (
  id,
  organization_id,
  question_id,
  title,
  video_url,
  embed_url,
  thumbnail_url,
  provider,
  duration_seconds,
  status,
  created_by,
  updated_by,
  published_at
)
values (
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
  (select id from public.organizations where slug = 'edustruct-clean-mvp'),
  '77777777-7777-4777-8777-777777777701',
  'Local accumulation explanation',
  'https://example.test/local-video',
  'https://example.test/local-video/embed',
  null,
  'local',
  180,
  'published',
  null,
  null,
  now()
)
on conflict (id) do update
set
  title = excluded.title,
  video_url = excluded.video_url,
  embed_url = excluded.embed_url,
  provider = excluded.provider,
  duration_seconds = excluded.duration_seconds,
  status = excluded.status,
  published_at = excluded.published_at,
  updated_at = now();

insert into public.practice_sessions (
  id,
  organization_id,
  user_id,
  title,
  goal,
  status,
  current_recommendation,
  summary,
  completed_at
)
select
  'cccccccc-cccc-4ccc-8ccc-ccccccccccc1',
  (select id from public.organizations where slug = 'edustruct-clean-mvp'),
  '44444444-4444-4444-8444-444444444444',
  'Local practice smoke session',
  'Practice accumulation and area setup.',
  'completed',
  '{"action":"continue","reason":"Synthetic local seed."}'::jsonb,
  '{"correct":1,"total":2,"seed":"local"}'::jsonb,
  now()
where exists (
  select 1
  from public.profiles profile
  where profile.id = '44444444-4444-4444-8444-444444444444'
)
on conflict (id) do update
set
  title = excluded.title,
  goal = excluded.goal,
  status = excluded.status,
  current_recommendation = excluded.current_recommendation,
  summary = excluded.summary,
  completed_at = excluded.completed_at,
  updated_at = now();

insert into public.course_generation_runs (
  id,
  organization_id,
  teacher_id,
  status,
  generation_mode,
  source_bundle,
  public_question_ids,
  course_material_question_ids,
  exam_style_question_ids,
  generated_question_ids,
  blueprint_summary,
  teacher_prompt,
  framework_id,
  report_snapshot,
  completed_at
)
select
  'dddddddd-dddd-4ddd-8ddd-ddddddddddd1',
  (select id from public.organizations where slug = 'edustruct-clean-mvp'),
  '33333333-3333-4333-8333-333333333333',
  'preview_ready',
  'simulation',
  '{"seed":"local","sourcePolicy":"synthetic approved questions"}'::jsonb,
  array['77777777-7777-4777-8777-777777777701'::uuid],
  array['77777777-7777-4777-8777-777777777702'::uuid],
  array[]::uuid[],
  array[]::uuid[],
  '{"blueprintId":"99999999-9999-4999-8999-999999999902","title":"Local accumulation blueprint"}'::jsonb,
  'Create a two-step local review framework.',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
  '{"seed":"local","status":"ready_for_teacher_review"}'::jsonb,
  now()
where exists (
  select 1
  from public.profiles profile
  where profile.id = '33333333-3333-4333-8333-333333333333'
)
on conflict (id) do update
set
  status = excluded.status,
  generation_mode = excluded.generation_mode,
  source_bundle = excluded.source_bundle,
  public_question_ids = excluded.public_question_ids,
  course_material_question_ids = excluded.course_material_question_ids,
  exam_style_question_ids = excluded.exam_style_question_ids,
  generated_question_ids = excluded.generated_question_ids,
  blueprint_summary = excluded.blueprint_summary,
  teacher_prompt = excluded.teacher_prompt,
  framework_id = excluded.framework_id,
  report_snapshot = excluded.report_snapshot,
  completed_at = excluded.completed_at,
  updated_at = now();

commit;

