# Teacher Role and Bank/Public Boundary Audit

## Summary

This audit hardens the bank-first teacher workflow:

```text
Teacher creates or joins bank
-> imports/pulls/reviews/organizes questions
-> assigns selected bank content
-> student practices assigned items
```

The fix keeps admin/global publishing separate from teacher private bank review.

## Findings

- The clean schema already supports `teacher` in `profiles.role` and `organization_members.role`.
- Runtime guards and middleware already route `/teacher/*` through `requireTeacher` behavior.
- Admin user role editing omitted `teacher`, which made a real teacher account harder to manage.
- Teacher navigation still linked import/review actions to admin/global routes.
- Bank review approval already keeps approved bank questions non-published and bank-owned.
- The existing public/global question read policy and taxonomy search did not explicitly exclude bank-owned questions if a bank question were ever accidentally marked `published`.

## Changes

- Added `teacher` to admin user role validation and the admin role selector.
- Repointed teacher import/review navigation to the teacher bank library entry point.
- Clarified teacher UI copy:
  - approve drafts into this bank
  - not published to the public library
  - bank-scoped questions
  - assignments expose selected items only
- Added clean migration `0029_teacher_role_bank_public_boundary.sql`.
- Added `scripts/teacher-role-bank-boundary-smoke.mjs`.

## Public Boundary Hardening

Migration 0029:

- restricts public question reads to `status = 'published'`, `visibility = 'public'`, `owner_bank_id is null`, and not deleted.
- applies the same public/global boundary to question rubric, asset, and taxonomy assignment public reads.
- updates global taxonomy search so bank-owned questions cannot appear in global public search.
- updates global Review Draft publishing so bank-owned questions must use bank review approval and cannot be globally published by the admin/global publish RPC.

## Role Boundary

Teacher role is now visible and editable from admin user management. The smoke requires real `TEST_TEACHER` credentials for live teacher validation; admin-as-teacher validation is not treated as sufficient.

## Migration Status

`supabase/clean-migrations/0029_teacher_role_bank_public_boundary.sql` is forward-only and must be manually applied to the clean Supabase project before live public-boundary hardening checks can fully pass against the remote DB. Static checks pass without applying it.

## Tests

Passed:

- `npm.cmd run lint`
- `npm.cmd run build`
- `node scripts/security-smoke.mjs`
- `node scripts/supabase-rls-smoke.mjs`
- `node scripts/route-smoke.mjs`
- `node scripts/question-bank-foundation-smoke.mjs`
- `node scripts/bank-share-members-smoke.mjs`
- `node scripts/bank-import-review-smoke.mjs`
- `node scripts/assignment-from-bank-smoke.mjs`
- `node scripts/teacher-role-bank-boundary-smoke.mjs`
- `npm.cmd run smoke`
- `npm.cmd run perf:budget`

`teacher-role-bank-boundary-smoke.mjs` confirmed `TEST_TEACHER` is a real teacher profile/member and that a bank owner can read private bank content. The live public-read/search hardening check reported a clear skip because clean migration 0029 is not applied to the target Supabase project yet.

## Remaining Follow-Up

Apply clean migration 0029 to the clean Supabase project, then rerun `node scripts/teacher-role-bank-boundary-smoke.mjs` to confirm no live public read/search leakage.
