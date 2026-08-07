-- Scope bank-less question administration to the question's organization.
-- Forward-only correction for F-001: questions_staff_access previously used
-- private.is_admin(), which is global and allowed cross-tenant access.

drop policy if exists questions_staff_access on public.questions;
create policy questions_staff_access
on public.questions for all
to authenticated
using (
  owner_bank_id is null
  and private.is_org_admin(organization_id)
)
with check (
  owner_bank_id is null
  and private.is_org_admin(organization_id)
);

comment on policy questions_staff_access on public.questions is
  'Bank-less questions are manageable only by an admin in the owning organization or by a super-admin.';
