-- Read-only verification queries for the JSONB-aware question-asset URL backfill.
-- Not a migration: run manually (e.g. via `supabase db execute` or the SQL editor)
-- before and after running scripts/backfill-question-asset-urls-jsonb.mjs --apply.
-- Nothing here writes data, changes RLS, changes Storage policies, or changes
-- bucket visibility.
--
-- These queries cast each JSONB column to text ONLY for read-only counting/sampling
-- here in SQL — this is unrelated to (and does not contradict) the requirement that
-- the backfill script itself never serializes JSONB to text and regex-replaces the
-- whole blob; the script always rewrites the parsed JSON tree in memory.

-- 1. Count remaining legacy-URL occurrences per target JSONB column (row-level: a
-- row counts once even if it contains multiple legacy URLs inside the JSON).
select 'practice_round_questions.question_snapshot' as target, count(*) as rows_with_legacy_url
from public.practice_round_questions
where question_snapshot::text ilike '%/storage/v1/object/public/question-assets/%'
union all
select 'practice_attempts.question_snapshot', count(*)
from public.practice_attempts
where question_snapshot::text ilike '%/storage/v1/object/public/question-assets/%'
union all
select 'practice_wrong_questions.question_snapshot', count(*)
from public.practice_wrong_questions
where question_snapshot::text ilike '%/storage/v1/object/public/question-assets/%'
union all
select 'review_draft_items.draft_payload', count(*)
from public.review_draft_items
where draft_payload::text ilike '%/storage/v1/object/public/question-assets/%';

-- 2. Count rows that already reference the authorized route (positive control /
-- pre-post comparison baseline).
select 'practice_round_questions.question_snapshot' as target, count(*) as rows_with_authorized_route
from public.practice_round_questions
where question_snapshot::text ilike '%/api/question-assets/%'
union all
select 'practice_attempts.question_snapshot', count(*)
from public.practice_attempts
where question_snapshot::text ilike '%/api/question-assets/%'
union all
select 'practice_wrong_questions.question_snapshot', count(*)
from public.practice_wrong_questions
where question_snapshot::text ilike '%/api/question-assets/%'
union all
select 'review_draft_items.draft_payload', count(*)
from public.review_draft_items
where draft_payload::text ilike '%/api/question-assets/%';

-- 3. Sample rows still containing a legacy URL after --apply, for manual triage.
select id, question_snapshot
from public.practice_round_questions
where question_snapshot::text ilike '%/storage/v1/object/public/question-assets/%'
limit 20;

select id, draft_payload
from public.review_draft_items
where draft_payload::text ilike '%/storage/v1/object/public/question-assets/%'
limit 20;

-- 4. Cross-check: legacy storage_path values referenced anywhere inside each JSONB
-- column that have no corresponding question_assets row (the precise "unmappable"
-- set), independent of the script's own report. Uses jsonb_path_query_array to walk
-- every string leaf, mirroring the recursive traversal the script performs in JS.
with candidate_strings as (
  select
    prq.id as row_id,
    jsonb_path_query(prq.question_snapshot, 'strict $.**?(@.type() == "string")')::text as leaf
  from public.practice_round_questions prq
  where prq.question_snapshot::text ilike '%/storage/v1/object/public/question-assets/%'
),
legacy_refs as (
  select
    row_id,
    (regexp_matches(
      leaf,
      'https?://[^\s"''<>]+/storage/v1/object/public/question-assets/([^\s"''<>]+)',
      'g'
    ))[1] as storage_path
  from candidate_strings
)
select legacy_refs.row_id, legacy_refs.storage_path
from legacy_refs
left join public.question_assets asset
  on asset.storage_path = legacy_refs.storage_path
where asset.id is null;
-- Repeat the same shape (candidate_strings -> legacy_refs -> anti-join) against
-- practice_attempts.question_snapshot, practice_wrong_questions.question_snapshot,
-- and review_draft_items.draft_payload for full coverage of all 4 columns.
