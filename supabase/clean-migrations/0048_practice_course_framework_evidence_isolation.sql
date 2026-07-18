-- P1-STUDENT-01 follow-up: framework ownership is not a Student evidence grant.
--
-- 0047 established Student-owned Practice evidence with narrow, read-only
-- Assignment-manager access. Canonical 0009 also left two course-framework
-- policies in place that bypassed that contract. A Student can select an active
-- framework for private self-study, so framework ownership alone must not reveal
-- the Student's session or its raw agent episode.
--
-- This migration changes RLS policy inventory only. It does not alter data,
-- framework availability, Assignment linkage, Bank access, Provider routing,
-- Storage, Classroom membership, or service-role operations.

drop policy if exists practice_sessions_teacher_select_course on public.practice_sessions;
drop policy if exists practice_agent_episodes_teacher_select_course on public.practice_agent_episodes;

comment on table public.practice_sessions is
  'Student-owned Practice sessions. Assignment managers receive read-only evidence access only through explicit assignment_practice_sessions linkage; course framework ownership alone grants no raw session access.';
comment on table public.practice_agent_episodes is
  'Student-owned raw Practice Agent evidence. Assignment managers receive read-only access only through an explicitly linked managed assignment; course framework ownership alone grants no episode access.';
