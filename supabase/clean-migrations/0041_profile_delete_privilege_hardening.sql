-- SEC-P0 follow-up: profile deletion privilege hardening.
--
-- Profiles are server-managed. Normal browser clients have no supported
-- account/profile deletion flow, and the canonical service-role cleanup path
-- deletes auth.users rows, which cascades to public.profiles. RLS currently
-- blocks client deletes because there is no DELETE policy, but retaining table
-- DELETE grants is broader than necessary and risks future policy mistakes.

revoke delete on table public.profiles from anon, authenticated;
revoke delete on table public.user_profiles from anon, authenticated;
