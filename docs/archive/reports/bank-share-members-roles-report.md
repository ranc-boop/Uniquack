# Bank Share Code / Members / Roles Report

## Executive Summary

This PR adds the first real teacher-to-teacher Question Bank sharing foundation. Banks remain the content source of truth, classroom membership does not grant bank access, and share codes create explicit bank membership only.

## Schema / Migration

Added `supabase/clean-migrations/0026_bank_share_codes_and_members.sql`.

The migration adds:

- `public.bank_share_codes`
- hashed share-code helpers in `private`
- owner-only share-code and member-management RPCs
- a forward policy correction so `bank_members` writes are owner-controlled
- a profile read policy so active bank co-members can display member labels

Migration 0026 was manually applied to the clean Supabase project through the Dashboard SQL Editor after the SQL was corrected for the `create_bank_share_code` return column name.

## Share-Code Hashing Behavior

Raw share codes are returned only once from `public.create_bank_share_code`. The database stores `code_hash` and a short `code_hint`; it does not store the raw share code.

## RPCs Added

- `public.create_bank_share_code`
- `public.revoke_bank_share_code`
- `public.join_question_bank_by_code`
- `public.update_bank_member_role`
- `public.remove_bank_member`

Create/revoke/update/remove are owner-only. Join is authenticated and limited to teacher/admin/super-admin profiles. No owner share code is supported.

## Member Role Behavior

Supported roles remain `owner`, `editor`, and `viewer`.

- Owners manage share codes and members.
- Editors/viewers can read joined banks.
- Owners cannot remove or demote the last active owner.
- Removed members lose active bank access.

## Routes / Pages Implemented

- `/teacher/banks/join` is now a real teacher join form.
- `/teacher/banks/[bankId]/members` shows member management and share-code controls.
- `/teacher/banks/[bankId]` links to the member/share workbench and explains bank/classroom boundaries.

No student bank browsing route was added.

## Access Validation Status

Static, build, route, and live clean-Supabase validation passed.

Live bank-share smoke verified:

- teacher A creates a private smoke bank
- unrelated teacher B cannot read before joining
- student cannot read by default
- teacher A creates a viewer share code
- the DB stores only `code_hash` / `code_hint`, not the raw code
- teacher B joins with the raw share code
- teacher B can read the joined bank as viewer
- teacher B viewer cannot manage share codes
- teacher A updates teacher B to editor
- teacher A removes teacher B
- removed teacher B loses bank access
- revoked share code cannot be used
- smoke-created rows are cleaned up

Student default block remains preserved by the existing bank RLS. Explicit student bank browsing UI was not implemented.

## RLS / Security Result

Static RLS smoke verifies:

- `bank_share_codes` has RLS enabled
- share-code hashes use `extensions.digest`
- anonymous joins are not granted
- raw share codes are not stored as table columns
- member/share management is owner-controlled

## Smoke Coverage

Added `scripts/bank-share-members-smoke.mjs` and included it in `scripts/smoke-all.mjs`.

The smoke performs static route/migration checks immediately. Once migration 0026 is applied, it runs the live teacher A / teacher B workflow and cleans up only smoke-created bank data.

## Tests Run

- `node scripts/bank-share-members-smoke.mjs` passed live without skip
- `npm.cmd run smoke` passed, including live bank-share join/role/remove/revoked-code checks
- `npm.cmd run lint` passed
- `npm.cmd run build` passed
- `node scripts/security-smoke.mjs` passed
- `node scripts/route-smoke.mjs` passed
- `node scripts/supabase-rls-smoke.mjs` passed
- `node scripts/question-bank-foundation-smoke.mjs` passed and validates unrelated-teacher private-bank isolation
- `npm.cmd run perf:budget` passed

## Remaining Blockers

No remaining blocker for the bank share-code/member-role foundation. Future slices still need PDF import into banks, Review Draft approval into banks, assignment-from-bank, and bank question editing.

## Explicit Non-Goals

- no PDF import into bank
- no Review Draft approval into bank
- no public pull/private push
- no assignment-from-bank
- no bank question editing
- no student bank browsing UI
- no Google Classroom
- no wearable UI
- no provider calls
