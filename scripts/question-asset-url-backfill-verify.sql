-- Read-only verification queries for the question-asset URL backfill.
-- Not a migration: run manually (e.g. via `supabase db execute` or the SQL editor)
-- before and after running scripts/backfill-question-asset-urls.mjs --apply.
-- Nothing here writes data, changes RLS, changes Storage policies, or changes
-- bucket visibility.

-- 1. Count remaining legacy-URL occurrences per target column.
-- Expected after a full --apply run: every count is 0 for rows that had a mappable
-- asset; nonzero counts should correspond exactly to rows already listed in the
-- backfill script's "unmapped" report.
select 'questions.content_html' as target, count(*) as rows_with_legacy_url
from public.questions
where content_html ilike '%/storage/v1/object/public/question-assets/%'
union all
select 'questions.solution_html', count(*)
from public.questions
where solution_html ilike '%/storage/v1/object/public/question-assets/%'
union all
select 'question_rubric_steps.content_html', count(*)
from public.question_rubric_steps
where content_html ilike '%/storage/v1/object/public/question-assets/%'
union all
select 'practice_round_questions.content_html', count(*)
from public.practice_round_questions
where content_html ilike '%/storage/v1/object/public/question-assets/%'
union all
select 'practice_attempts.solution_html', count(*)
from public.practice_attempts
where solution_html ilike '%/storage/v1/object/public/question-assets/%';

-- 2. Count rows that already reference the authorized route (sanity check that the
-- backfill actually produced output, and a baseline you can compare pre/post run).
select 'questions.content_html' as target, count(*) as rows_with_authorized_route
from public.questions
where content_html ilike '%/api/question-assets/%'
union all
select 'questions.solution_html', count(*)
from public.questions
where solution_html ilike '%/api/question-assets/%'
union all
select 'question_rubric_steps.content_html', count(*)
from public.question_rubric_steps
where content_html ilike '%/api/question-assets/%'
union all
select 'practice_round_questions.content_html', count(*)
from public.practice_round_questions
where content_html ilike '%/api/question-assets/%'
union all
select 'practice_attempts.solution_html', count(*)
from public.practice_attempts
where solution_html ilike '%/api/question-assets/%';

-- 3. Sample rows still containing a legacy URL after --apply, for manual triage of
-- unmapped cases (storage_path with no matching question_assets row, e.g. an asset
-- whose metadata row was deleted but whose HTML reference survived).
select id, content_html
from public.questions
where content_html ilike '%/storage/v1/object/public/question-assets/%'
limit 20;

-- 4. Cross-check: legacy storage_path values referenced in HTML that have no
-- corresponding question_assets row at all (the precise "unmappable" set). Requires
-- a Postgres session with regexp_matches support; mirrors the script's own mapping
-- logic for independent verification.
with legacy_refs as (
  select
    q.id as question_id,
    (regexp_matches(
      q.content_html,
      'https?://[^\s"''<>]+/storage/v1/object/public/question-assets/([^\s"''<>]+)',
      'g'
    ))[1] as storage_path
  from public.questions q
  where q.content_html ilike '%/storage/v1/object/public/question-assets/%'
)
select legacy_refs.question_id, legacy_refs.storage_path
from legacy_refs
left join public.question_assets asset
  on asset.storage_path = legacy_refs.storage_path
where asset.id is null;
