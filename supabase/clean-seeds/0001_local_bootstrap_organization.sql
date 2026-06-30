-- Clean Supabase local seed draft.
-- Local/dev only. Do not use this as a production auth bootstrap script.
-- This file does not create auth.users rows. Create local placeholder auth users first,
-- then rerun this seed to attach profiles and organization memberships.

begin;

insert into public.organizations (
  id,
  name,
  slug,
  status
)
values (
  '11111111-1111-4111-8111-111111111111',
  'EduStruct Local Demo',
  'edustruct-local-demo',
  'active'
)
on conflict (id) do update
set
  name = excluded.name,
  slug = excluded.slug,
  status = excluded.status,
  updated_at = now();

-- Placeholder local auth identities expected by this draft:
--   local-admin@example.invalid   -> 22222222-2222-4222-8222-222222222222
--   local-teacher@example.invalid -> 33333333-3333-4333-8333-333333333333
--   local-student@example.invalid -> 44444444-4444-4444-8444-444444444444
-- Create those auth users through local Supabase auth tooling or a service-role-only
-- local setup script before applying this seed if profile/member rows are needed.

insert into public.profiles (
  id,
  username,
  email,
  full_name,
  display_name,
  role,
  status,
  default_organization_id
)
select
  seed.id,
  seed.username,
  seed.email,
  seed.full_name,
  seed.display_name,
  seed.role,
  'active',
  '11111111-1111-4111-8111-111111111111'::uuid
from (
  values
    (
      '22222222-2222-4222-8222-222222222222'::uuid,
      'local_admin',
      'local-admin@example.invalid',
      'Local Admin',
      'Local Admin',
      'super_admin'
    ),
    (
      '33333333-3333-4333-8333-333333333333'::uuid,
      'local_teacher',
      'local-teacher@example.invalid',
      'Local Teacher',
      'Local Teacher',
      'teacher'
    ),
    (
      '44444444-4444-4444-8444-444444444444'::uuid,
      'local_student',
      'local-student@example.invalid',
      'Local Student',
      'Local Student',
      'student'
    )
) as seed(id, username, email, full_name, display_name, role)
where exists (
  select 1
  from auth.users auth_user
  where auth_user.id = seed.id
)
on conflict (id) do update
set
  username = excluded.username,
  email = excluded.email,
  full_name = excluded.full_name,
  display_name = excluded.display_name,
  role = excluded.role,
  status = excluded.status,
  default_organization_id = excluded.default_organization_id,
  updated_at = now();

insert into public.organization_members (
  id,
  organization_id,
  user_id,
  role,
  status,
  created_by
)
select
  seed.id,
  '11111111-1111-4111-8111-111111111111'::uuid,
  seed.user_id,
  seed.role,
  'active',
  null::uuid
from (
  values
    (
      '55555555-5555-4555-8555-555555555551'::uuid,
      '22222222-2222-4222-8222-222222222222'::uuid,
      'admin'
    ),
    (
      '55555555-5555-4555-8555-555555555552'::uuid,
      '33333333-3333-4333-8333-333333333333'::uuid,
      'teacher'
    ),
    (
      '55555555-5555-4555-8555-555555555553'::uuid,
      '44444444-4444-4444-8444-444444444444'::uuid,
      'student'
    )
) as seed(id, user_id, role)
where exists (
  select 1
  from public.profiles profile
  where profile.id = seed.user_id
)
on conflict (organization_id, user_id) do update
set
  role = excluded.role,
  status = excluded.status,
  updated_at = now();

insert into public.ai_provider_profiles (
  id,
  organization_id,
  name,
  provider,
  base_url,
  model,
  mode,
  credential_ref,
  enabled,
  is_default,
  supports_pdf_input,
  supports_vision_images,
  created_by,
  updated_by
)
values (
  '66666666-6666-4666-8666-666666666661',
  '11111111-1111-4111-8111-111111111111',
  'Local Disabled DeepSeek Placeholder',
  'deepseek',
  null,
  'deepseek-chat',
  'standard',
  'local-disabled-placeholder',
  false,
  false,
  false,
  false,
  null,
  null
)
on conflict (id) do update
set
  organization_id = excluded.organization_id,
  name = excluded.name,
  provider = excluded.provider,
  base_url = excluded.base_url,
  model = excluded.model,
  mode = excluded.mode,
  credential_ref = excluded.credential_ref,
  enabled = excluded.enabled,
  is_default = excluded.is_default,
  supports_pdf_input = excluded.supports_pdf_input,
  supports_vision_images = excluded.supports_vision_images,
  updated_by = excluded.updated_by,
  updated_at = now();

commit;

