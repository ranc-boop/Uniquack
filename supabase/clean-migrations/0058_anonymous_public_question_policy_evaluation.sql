-- Anonymous public-question policy evaluation.
--
-- Public search joins question child tables whose authenticated staff/member
-- policies are evaluated alongside their public-read policies. These private
-- helpers are SECURITY DEFINER, use fixed search paths, and always return false
-- for an anonymous request because auth.uid() is null. Granting EXECUTE lets
-- Postgres finish RLS evaluation without exposing any Library-owned rows.

grant execute on function private.can_read_question_child(uuid) to anon;
grant execute on function private.can_manage_question_child(uuid) to anon;

