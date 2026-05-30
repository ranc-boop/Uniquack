-- 1. First create the initial user through Supabase Auth.
--    With the username-login convention, "alice" becomes "alice@local.app".
--
-- 2. Then run this SQL from Supabase SQL Editor or another privileged DB session.

update public.profiles
set
  role = 'super_admin',
  updated_at = now()
where id = (
  select u.id
  from auth.users u
  where u.email = 'REPLACE_WITH_FIRST_ADMIN_USERNAME@local.app'
);

-- Optional verification:
select id, username, email, role
from public.profiles
where role = 'super_admin';
