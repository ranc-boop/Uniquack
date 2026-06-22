-- Development-only cleanup for the retired legacy tag systems.
--
-- This intentionally lives outside 0011_math_taxonomy_source_of_truth.sql so
-- production taxonomy setup cannot accidentally drop legacy tables during a
-- normal schema rollout. Run manually only when the environment no longer needs
-- legacy tags / question_tags / video_tags / five_facet_* data.

begin;

drop table if exists public.five_facet_video_tag_assignments cascade;
drop table if exists public.five_facet_tag_review_actions cascade;
drop table if exists public.five_facet_question_tag_assignments cascade;
drop table if exists public.five_facet_curriculum_concept_mappings cascade;
drop table if exists public.five_facet_tag_aliases cascade;
drop table if exists public.five_facet_tag_edges cascade;
drop table if exists public.five_facet_tag_nodes cascade;
drop table if exists public.video_tags cascade;
drop table if exists public.question_tags cascade;
drop table if exists public.tags cascade;

commit;
