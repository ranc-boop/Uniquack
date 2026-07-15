# Live Schema And Migration Reconciliation

## Status

**BLOCKED - forward hardening is prepared but requires manual live application
and sanitized catalog validation.**

This is a release-control conclusion only. It does not state that the website
is deployment-ready.

## Scope And Evidence Boundary

This audit used a clean worktree from `origin/main` after the merged profile
security work. It did not touch the original workspace, user-owned `public/`,
protected stashes, `.env.local`, data, provider settings, or Supabase.

The repository inventory is deterministic and recorded in
`live-schema-manifest.json`. Direct database catalog transport was not treated
as evidence in this isolated audit, so the manifest deliberately remains
`BLOCKED_PENDING_READ_ONLY_METADATA_CAPTURE`. It does not invent migration-ledger
rows, timestamps, live policies, or function definitions.

## Canonical Source And Ledger Strategy

| Item | Conclusion |
| --- | --- |
| Canonical migration source | `supabase/clean-migrations` only |
| Legacy migration source | `supabase/migrations`; non-canonical and never apply to clean Supabase |
| Historical ledger | Incomplete for many SQL Editor applications; do not mutate Supabase internal history |
| Selected strategy | Repository-owned reconciliation manifest plus application register (Outcome A) |
| Forward migration | `0042_internal_provider_gateway_hardening.sql` is prepared, reviewed by focused source tests, and not yet applied. |

No remote mutation occurred in this PR. The release owner must apply `0042`
exactly once through the approved manual release path, then capture sanitized
catalog evidence before the reconciliation gate can close.

## AI Provider Gateway Call-Graph Reconciliation

### Final Classification: ACTIVE INTERNAL GATEWAY

This is not an external AI-routing service. Its historical purpose is a
server-side lock for **Admin / AI Settings** and provider management:

```text
super-admin server page/action
-> server-only AI_PROVIDER_GATEWAY_TOKEN
-> Supabase gateway RPC argument
-> active SHA-256 digest plus super-admin verification
-> provider-profile operation
```

The current source still uses this internal gateway:

- `src/app/admin/ai-settings/page.tsx` calls `requireSuperAdmin()` before
  listing provider metadata.
- `src/app/admin/ai-settings/actions.ts` calls `requireSuperAdmin()` before
  provider create, update, delete, saved-key test, and routing-policy actions;
  the provider CRUD actions call gateway RPCs with the server-only token.
- `src/lib/ai-providers/profiles.ts` uses the token only for safe Admin gateway
  metadata RPCs. Trusted server execution now resolves provider metadata and
  encrypted credentials directly through `createServiceRoleClient()`.
- `src/lib/ai-providers/routing.ts` still uses the token only for Admin routing
  policy management; its execution resolver uses the service-role provider
  path.
- `src/lib/ai-pdf-import/service.ts` uses the server-use resolver for provider
  selection and credential loading.
- `src/lib/ai-jobs/worker.ts` begins with `createServiceRoleClient()` and now
  resolves providers through the direct trusted service-role path.

The token module is marked `server-only`, and a source scan found no public
environment-variable name for it. Current code sends the token as a
server-to-Supabase RPC argument, not as a browser header. This is evidence of
the intended boundary, not proof that a compiled client bundle or live grant
cannot leak it; the replacement PR needs a dedicated negative test.

### Ownership and Rotation

Primary owner: **Jerry / Platform Security**. Designated backup owner:
**Frances / Technical Operations**; the release owner must confirm that
assignment before a live rotation. The token stays in server-only deployment
secret storage and the private gateway-digest table. It must never enter a
browser bundle, provider row, report, or source-control file. The rotation and
emergency procedure is recorded in
`docs/security/provider-gateway-security-and-rotation.md`.

### Named Live Helper/Policy

The exact live objects `private.has_ai_router_provider_access()` and
`ai_provider_profiles_ai_router_read` have **no static source references**.
Current code instead calls gateway RPCs backed by canonical
`private.verify_ai_provider_gateway(text)`. The named objects are therefore
untracked live authorization aliases within an active internal gateway, not an
external integration and not safe to preserve by assumption.

`0042_internal_provider_gateway_hardening.sql` removes both aliases
forward-only. Their live definitions, execution roles, and result-column access
still need read-only capture before and after application; until then, the
reconciliation gate remains blocked.

### Full-Row and Grant Risk

Canonical `0002_provider_profiles_and_operation_logs.sql` exposes two
different risks that must be reconciled together:

1. `public.get_ai_provider_profile_for_gateway` returns encrypted credential
   fields for server-side decryption. It is a public-schema,
   `authenticated`-executable RPC guarded by the token plus super-admin check.
2. `ai_provider_profiles_staff_read` is a full-row SELECT policy. RLS filters
   rows, not columns. If live `anon` or `authenticated` SELECT grants exist on
   `public.ai_provider_profiles`, a matching staff member could receive
   `api_key_ciphertext`, `api_key_iv`, `api_key_tag`, or `credential_ref`.

The canonical migration did not explicitly revoke direct table privileges on
`public.ai_provider_profiles`; the archived legacy chain contains a revoke but
is non-canonical and cannot be treated as proof of the live state. `0042`
removes the full-row RLS policies and revokes direct `public`, `anon`, and
`authenticated` table privileges while preserving service-role access. This
remains a P1 launch blocker until the migration is applied and the targeted
read-only privilege capture below confirms the result; escalate it to P0 if a
browser-reachable full-row credential path is confirmed before application.

### Safe Replace Plan

Do not preserve full-row provider access as-is. `0042` and its paired runtime
change implement this replacement:

1. Preserve the supported super-admin Admin gateway for safe metadata and
   guarded create/update/delete/routing RPCs.
2. Keep a separate service-role credential resolver. It may read encrypted
   fields and decrypt them only in server memory; it must never serialize a
   profile to a page, action result, operation log, or browser response.
3. Make every metadata list use an explicit allowlist. It may return IDs,
   name, provider, base URL, model, enabled/default/capability flags,
   `api_key_last4`, and timestamps, but never `api_key_ciphertext`,
   `api_key_iv`, `api_key_tag`, or `credential_ref`.
4. In `0042`, revoke direct `anon`/`authenticated` table privileges, remove the
   credential-returning read RPC, and replace safe metadata list functions with
   explicit allowlists.
5. In `0042`, remove the named live helper/policy forward-only. Record the
   platform security owner and token-rotation procedure before applying it.

The trusted service-role resolver is now the primary execution path. No
migration was applied in this task.

## Migration Inventory

All 43 clean-migration files are registered in
`docs/security/migration-application-register.md` and the JSON manifest.
Statuses distinguish reviewed baseline evidence, reported SQL Editor work,
known blocked work, and uncertainty. A file's presence is never treated as
proof that it ran.

### Duplicate 0032

- `0032_teacher_feedback_notes.sql` is recorded as reported SQL Editor work.
- `0032_google_account_links.sql` is `UNAPPLIED_BLOCKED`.
- Neither historical file was edited or renamed.
- Google is blocked because its caller-supplied identity RPC design is not the
  approved OAuth/OIDC design. No Google runtime behavior changed here.

The required future policy is monotonic unique prefixes, a reviewed active apply
plan, and a failed validation when duplicate active prefixes or blocked files
enter an apply path. The three Google foundation harnesses are now excluded
from aggregate smoke and remain explicit, isolated commands only:

```powershell
node scripts/google-account-links-baseline-smoke.mjs
node scripts/google-account-links-apply-smoke.mjs
node scripts/google-account-links-rls-smoke.mjs
```

They do not represent production coverage and do not authorize applying Google
0032. `scripts/migration-reconciliation-smoke.mjs` fails if any of those
harnesses are reintroduced to `scripts/smoke-all.mjs`.

## Canonical Test Coverage Reconciliation

The following release/security fixture reads were retargeted without removing
their authorization intent:

| Previous legacy fixture | Canonical replacement | Preserved security claim |
| --- | --- | --- |
| `0011_math_taxonomy_source_of_truth.sql` | `0003_taxonomy_runtime_source.sql` | taxonomy nodes and paths are controlled by the canonical runtime schema |
| `0012_taxonomy_question_search_rpc.sql` | `0029_teacher_role_bank_public_boundary.sql` plus `0003` | taxonomy search, cursor, full-text search, and paths remain canonical |
| `0014_practice_persistence.sql` | `0008_practice_agent_evidence.sql` | practice evidence RLS, preference limit, and snapshot safety remain checked |
| legacy Blueprint 0016/0018/0020/0021 | `0007_blueprint_engine.sql` | Blueprint tables, versions, calibration, and staff-scoped RLS remain checked |

`security-smoke` keeps its existing product and authorization assertions and
now passes against clean migration sources. `supabase-rls-smoke` keeps the
table/RLS assertions but maps the Blueprint contract to `0007`. Four
bank/Review/AI smoke fixtures now enumerate only `clean-migrations` when they
prove that no unrelated migration was introduced.

Source-level assertion counts were preserved or improved: `security-smoke`
remains 210 and `supabase-rls-smoke` increases from 35 to 36. The additional
RLS-smoke assertion preserves the existing Blueprint lifecycle snapshot and
soft-delete/no-hard-delete contract while the migration checks become more
specific for canonical Blueprint Engine staff read/write, examples,
review-actions, versions, and calibration policies.

The three Google account-link foundation harnesses were the aggregate references
to blocked 0032: baseline, apply, and RLS. They were removed from
`scripts/smoke-all.mjs`, not deleted. They remain isolated foundation tests and
must not be represented as clean-release validation. The reconciliation control
also scans every directly imported aggregate harness for actual legacy-migration
file reads; a text-only negative assertion is not treated as migration
consumption.

## Validation Record

The following local and source-level validation passed in this clean worktree:

- `npm.cmd run lint`
- `npm.cmd run build`
- `node scripts/migration-reconciliation-smoke.mjs`
- `node scripts/security-smoke.mjs`
- `node scripts/route-smoke.mjs`
- `node scripts/bank-scoped-ai-pdf-import-bridge-smoke.mjs`
- `node scripts/ai-pdf-provider-failure-status-smoke.mjs`
- `node scripts/ai-parsing-status-review-qa-smoke.mjs`
- `node scripts/review-draft-actions-mvp-smoke.mjs`
- `npm.cmd run perf:budget`
- `npm.cmd run perf:audit`
- `npm.cmd run analyze`

The three isolated Google foundation scripts were syntax-checked with
`node --check`. They were deliberately not executed: their current purpose is
to exercise the blocked Google `0032` migration and they must not be used as
release coverage or cause that migration to be applied.

`node scripts/supabase-rls-smoke.mjs` and therefore the final live stage of
`npm.cmd run smoke` are **blocked**, not passed, because this detached clean
worktree has no `NEXT_PUBLIC_SUPABASE_URL` or
`NEXT_PUBLIC_SUPABASE_ANON_KEY`. No environment file was read or copied to
work around that guard. Before a deployment conclusion, rerun them with the
approved clean-Supabase smoke environment and the read-only catalog capture.

## Repository Versus Live Drift

| Class | Object | Runtime reference | Security impact | Safe action |
| --- | --- | --- | --- | --- |
| UNTRACKED_LIVE_AUTHORIZATION_ALIAS | `private.has_ai_router_provider_access()` | No direct source call. The active internal gateway uses `private.verify_ai_provider_gateway(text)` through public gateway RPCs. | May duplicate or widen provider-profile authorization beyond the active app path. | Capture definition and execution grants; replace the active control plane before removing this alias forward-only. |
| UNTRACKED_LIVE_AUTHORIZATION_ALIAS | `ai_provider_profiles_ai_router_read` | No direct source policy reference. | Could return full provider rows when combined with broad grants or a security-definer helper. | Capture normalized policy and table grants; do not preserve it as-is. |
| P1_UNVERIFIED_DIRECT_TABLE_PRIVILEGES | `public.ai_provider_profiles` `anon`/`authenticated` grants | Canonical `0002` has full-row staff read and no explicit direct-table revoke. | If such grants exist live, RLS can authorize encrypted credential columns. | Capture granular table privileges; harden to no browser-direct full-row access in the dedicated forward PR. |
| LEDGER_ONLY_DRIFT | Later SQL Editor migrations | Reported in prior validation, not reliably ledgered | Reproducibility and rollback risk | Fingerprint each object from a read-only catalog capture and record an owner-signed application entry |
| DEFINITION_DRIFT / UNKNOWN | `0036_ai_operations_launch_readiness.sql` | Current repository contains the file | Revert/reapply history makes live state uncertain | Capture object fingerprints before declaring it applied |

The named live helper/policy lacks a direct source reference, but the internal
gateway itself is active. This is not proof that the aliases are obsolete. They
block deletion and preservation until their live definitions and grants are
captured.

## Read-Only SQL Editor Capture

Run each query separately. Return only object names, booleans, normalized
expressions, and aggregate counts. Do not return table data, roles' passwords,
credential values, provider key material, request headers, or database URLs.

```sql
select n.nspname as schema_name
from pg_namespace n
where n.nspname in ('public', 'private', 'storage')
order by 1;

select table_schema, table_name, column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema in ('public', 'private', 'storage')
order by table_schema, table_name, ordinal_position;

select connamespace::regnamespace::text as schema_name,
       conrelid::regclass::text as table_name,
       conname, contype, pg_get_constraintdef(oid, true) as definition
from pg_constraint
where connamespace::regnamespace::text in ('public', 'private', 'storage')
order by 1, 2, 3;

select schemaname, tablename, indexname, indexdef
from pg_indexes
where schemaname in ('public', 'private', 'storage')
order by 1, 2, 3;
```

```sql
select n.nspname as schema_name, c.relname as table_name,
       c.relrowsecurity as rls_enabled, c.relforcerowsecurity as rls_forced
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where c.relkind = 'r' and n.nspname in ('public', 'private', 'storage')
order by 1, 2;

select schemaname, tablename, policyname, roles, cmd,
       pg_get_expr(qual, polrelid, true) as using_expression,
       pg_get_expr(with_check, polrelid, true) as check_expression
from pg_policies p
join pg_policy po on po.polname = p.policyname
join pg_class c on c.oid = po.polrelid and c.relname = p.tablename
join pg_namespace n on n.oid = c.relnamespace and n.nspname = p.schemaname
where p.schemaname in ('public', 'private', 'storage')
order by schemaname, tablename, policyname;

select n.nspname as schema_name, p.proname,
       pg_get_function_identity_arguments(p.oid) as identity_arguments,
       p.prosecdef as security_definer,
       coalesce(array_to_string(p.proconfig, ', '), '') as function_config,
       pg_get_functiondef(p.oid) as normalized_definition
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname in ('public', 'private')
order by 1, 2, 3;
```

```sql
select routine_schema, routine_name, grantee, privilege_type
from information_schema.routine_privileges
where routine_schema in ('public', 'private')
order by 1, 2, 3, 4;

select table_schema, table_name, grantee, privilege_type
from information_schema.table_privileges
where table_schema in ('public', 'private', 'storage')
order by 1, 2, 3, 4;

select event_object_schema as schema_name, event_object_table as table_name,
       trigger_name, event_manipulation, action_timing, action_statement
from information_schema.triggers
where event_object_schema in ('public', 'private', 'storage')
order by 1, 2, 3, 4;

select id, public, file_size_limit, allowed_mime_types
from storage.buckets
order by id;

select extname, extversion
from pg_extension
where extname in ('pgcrypto', 'pg_net', 'uuid-ossp')
order by extname;
```

For the untracked router path, return metadata only:

```sql
select n.nspname as schema_name, p.proname,
       pg_get_function_identity_arguments(p.oid) as identity_arguments,
       p.prosecdef as security_definer,
       coalesce(array_to_string(p.proconfig, ', '), '') as function_config
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'private' and p.proname = 'has_ai_router_provider_access';

select schemaname, tablename, policyname, roles, cmd,
       pg_get_expr(qual, polrelid, true) as using_expression,
       pg_get_expr(with_check, polrelid, true) as check_expression
from pg_policies p
join pg_policy po on po.polname = p.policyname
join pg_class c on c.oid = po.polrelid and c.relname = p.tablename
join pg_namespace n on n.oid = c.relnamespace and n.nspname = p.schemaname
where p.schemaname = 'public'
  and p.tablename = 'ai_provider_profiles'
  and p.policyname = 'ai_provider_profiles_ai_router_read';

select grantee, privilege_type
from information_schema.table_privileges
where table_schema = 'public'
  and table_name = 'ai_provider_profiles'
  and grantee in ('anon', 'authenticated', 'service_role')
order by grantee, privilege_type;

select routine_schema, routine_name, grantee, privilege_type
from information_schema.routine_privileges
where routine_schema = 'public'
  and routine_name in (
    'list_ai_provider_profiles_for_gateway',
    'list_enabled_ai_provider_profiles_for_gateway',
    'get_ai_provider_profile_for_gateway',
    'create_ai_provider_profile_for_gateway',
    'update_ai_provider_profile_for_gateway',
    'delete_ai_provider_profile_for_gateway'
  )
order by routine_name, grantee, privilege_type;
```

The existing Supabase migration ledger must be queried only through its
supported metadata view if one is available in the project. Do not mutate an
internal ledger to repair history. If no supported view exists, record that
fact and rely on the repository register plus catalog fingerprints.

## Findings

### P1 - Duplicate Prefix And Blocked Google Apply Path

Two `0032` files exist. The active plan excludes Google, but the current
aggregate smoke no longer invokes its three Google foundation harnesses. The
new reconciliation smoke fails if they are reintroduced. Google remains blocked
until its approved OAuth/OIDC redesign exists; this is not evidence that Google
should be applied.

### P1 - Active Internal Provider Gateway Hardening Awaits Live Apply

The supported gateway remains active only for super-admin Admin Settings
metadata and guarded mutations. Trusted execution now uses service role
directly, safe lists are allowlisted, and `0042` removes the stale alias and
credential-returning RPC. Manual apply plus post-apply catalog/RLS validation
is still required.

### P1 - Provider-Profile Full-Row Access Awaits Live Confirmation

`0042` removes the full-row policies and revokes direct table grants. Until the
targeted privilege query proves the live result, this remains a P1 launch
blocker; escalate it to P0 if a browser-reachable `anon` or `authenticated`
path can return encrypted provider credential columns.

### P1 - Historical Application Ledger Is Incomplete

Many clean migrations were reported as SQL Editor applications. Their file
history and focused smoke reports are useful evidence but cannot prove the
current catalog state. A sanitized catalog fingerprint is required.

### P2 - Historic Fixtures Are Isolated From Release Coverage

The release/security/RLS smoke paths now read canonical clean migrations only.
The historical Practice thread-cache fixture still references an older
non-canonical migration, but it is already an explicit standalone command and
is not included by `scripts/smoke-all.mjs`. It is recorded as historic coverage,
not a clean-release or canonical-schema assertion.

### Informational - Profile Gate

Migrations `0039` through `0041` retain their verified SHA-256 fingerprints in
the manifest. The previously confirmed profile self-promotion, identity insert,
and client deletion gate remains closed, subject to the separate live validation
already recorded.

## Next Safe Actions

1. Confirm Jerry and Frances as the accountable rotation owners.
2. Apply `0042_internal_provider_gateway_hardening.sql` exactly once through
   the approved manual release path.
3. Capture provider-profile table grants, RLS policies, and gateway-function
   grants with sanitized read-only catalog queries.
4. Keep Google foundation harnesses isolated until a redesigned, uniquely
   numbered Google migration is approved; never add them to aggregate smoke.
5. Record fingerprints and named owners in the application register.
6. Run `node scripts/migration-reconciliation-smoke.mjs --require-live-reconciliation`.

## Remaining Launch Blockers

This audit does not clear Teacher Classroom creation RLS, private question-asset
delivery, signed-in Student E2E, Student self-study evidence isolation, Google
Login redesign, Vertex/Cloud Run/Cloud Tasks production readiness, 50-job
qualification, monitoring, legal, privacy, or the provider-gateway live-apply
and verification gate.
