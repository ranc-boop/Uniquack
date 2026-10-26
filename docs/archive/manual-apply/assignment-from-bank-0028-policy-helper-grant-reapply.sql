-- Assignment from Bank Questions 0028 policy-helper grant correction
-- Run only on the clean Supabase project if supabase-rls-smoke fails with:
-- permission denied for function can_read_assignment_question

grant execute on function private.can_read_assignment_question(uuid) to anon, authenticated;
