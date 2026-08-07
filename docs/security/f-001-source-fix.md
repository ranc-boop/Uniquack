# F-001 source fix

F-001 identified cross-tenant access to bank-less (`owner_bank_id is null`) questions because `questions_staff_access` used the global `private.is_admin()` predicate.

Migration `0077_scope_orphan_question_admin_access.sql` replaces that predicate with `private.is_org_admin(organization_id)`. Organization admins therefore retain management of bank-less questions in their own organization, super-admin behavior remains global through the existing helper contract, and unrelated organization admins are denied.

CI validates the change only against a disposable local Supabase stack. The authorization matrix covers cross-tenant read/write and `ci-authz-delete-regression.mjs` adds an explicit DELETE control/regression pair. This document does not claim that 0077 has been applied to any hosted or production Supabase project.
