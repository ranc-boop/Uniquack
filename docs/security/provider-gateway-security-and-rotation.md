# Internal Provider Gateway Security And Rotation

## Purpose

The provider gateway is an internal server-side control for Admin / AI
Settings. It is not a third-party routing service and it is not available to
teachers, students, browsers, or provider vendors.

Supported control flow:

```text
authenticated Admin Server Action
-> requireSuperAdmin()
-> server-only AI_PROVIDER_GATEWAY_TOKEN
-> narrow Supabase gateway RPC
-> safe metadata or guarded mutation
```

Trusted AI execution uses a separate server-only path:

```text
trusted durable worker or server execution
-> createServiceRoleClient()
-> encrypted provider row in server memory
-> decrypt only for the provider request
```

No provider credential is returned to a page, Server Action result, log, API
response, or browser bundle.

## Admin Gateway Contract

| Operation | Entry point | Required gate | Result contract |
| --- | --- | --- | --- |
| List provider profiles | Admin AI Settings page | `requireSuperAdmin()` plus gateway verification | Safe metadata only |
| Create/update/delete provider | Admin AI Settings Server Actions | `requireSuperAdmin()` plus gateway verification | Identifier or no row data |
| Test new provider | Admin AI Settings Server Action | `requireSuperAdmin()` | Bounded connection-test status only |
| Test saved provider | Admin AI Settings Server Action | `requireSuperAdmin()` then service-role resolver | Bounded connection-test status only |
| List/save routing policy | Admin AI Settings page/Server Action | `requireSuperAdmin()` plus gateway verification | Safe policy metadata only |
| Circuit/reset operations | Admin AI Settings Server Action | `requireSuperAdmin()` | Safe operation status only |

Safe provider metadata is limited to identifier, display name, provider type,
base URL, model, enabled/default flags, capability flags, key-last-four, and
timestamps. It never includes encrypted key fields, credential references, or
decrypted credentials.

## Forward Migration

`supabase/clean-migrations/0042_internal_provider_gateway_hardening.sql` is a
forward-only change. It does not modify provider rows or encrypted values. It:

- removes the untracked request-header helper and policy alias;
- removes the credential-returning provider read RPC;
- replaces Admin list RPC definitions with explicit safe projections;
- revokes direct `public`, `anon`, and `authenticated` table access;
- removes full-row provider profile RLS policies;
- preserves service-role table access and reviewed gateway RPC execution.

It was applied exactly once through the clean project's SQL Editor. This record
does not fabricate Supabase internal migration-ledger history.

## Implementation Validation

The repository-only validation completed with `lint`, production `build`,
`security-smoke`, `route-smoke`, the canonical migration reconciliation smoke,
the focused provider-gateway hardening smoke, provider resilience/fallback
smokes, AI operations and AI Parsing QA smokes, durable job-queue smoke, and
the performance budget, audit, and analyzer checks passing.

The release operator's final SQL Editor checks confirmed no direct `anon` or
`authenticated` table privileges on `public.ai_provider_profiles`, retained
`service_role` table privileges, and absence of the stale request-header policy
and helper. No raw SQL Editor output, provider row, credential, digest, or
environment value was recorded.

Credential-dependent live role/token and worker checks remain blocked in this
isolated worktree because it has no environment credentials.
`supabase-rls-smoke` was attempted and stopped before live access because the
Supabase URL and anon key are unavailable here. Aggregate `npm run smoke` was
not run without approved credentials. No environment file was read, copied, or
changed to bypass either block.

## Ownership And Rotation

- Primary owner: Jerry / Platform Security.
- Designated backup: Frances / Technical Operations. Confirm this assignment
  with the release owner before the first live rotation.
- Stored locations: server-only deployment secret store and the private
  gateway-token digest table. Names only; never record values in docs, source,
  or tickets.

### Planned Rotation

1. Jerry opens a reviewed maintenance change and confirms Frances can perform
   the rollback/escalation role.
2. Generate a replacement token in the approved secret-management workflow.
3. Add only its digest to the private gateway-token digest table through the
   approved server-side setup path.
4. Update the server-only deployment secret, restart the server/worker fleet,
   and verify super-admin metadata and guarded mutation paths.
5. Verify worker provider resolution, fallback, circuit behavior, and error
   redaction without returning credentials.
6. Revoke the prior digest after all supported callers pass validation.

### Emergency Revocation

1. Jerry or Frances disables the affected digest through the approved
   super-admin path.
2. Pause provider work using existing operations controls if required.
3. Replace the deployment secret and validate the supported Admin and worker
   flows.
4. Record only timestamps, owner, status, and safe validation outcomes.

## Post-Apply Validation

Do not rerun `0042_internal_provider_gateway_hardening.sql`, replay the clean
migration history, or apply the legacy migration directory.

After application, record only sanitized evidence for:

- the confirmed absence of `private.has_ai_router_provider_access()` and
  `ai_provider_profiles_ai_router_read`;
- the confirmed direct table grants: no `anon` or `authenticated` privileges,
  with preserved service-role privileges;
- safe list RPC signatures, security-definer mode, fixed search path, and
  `authenticated` execute grants only where reviewed;
- absence of the credential-returning gateway read RPC;
- anonymous, student, teacher, ordinary-admin, and super-admin boundary checks;
- trusted worker routing/fallback/circuit behavior and credential redaction.

Run the focused gateway smoke, canonical migration reconciliation smoke, RLS
smoke, and the existing AI resilience/circuit/operations suites. The live
reconciliation gate stays blocked until the supported correct-token/
super-admin success path and negative role/token cases are safely validated.

## Scope

This hardening does not change provider rows, AI routing policy behavior,
teacher imports, Review Draft gates, assignment behavior, Google Login,
Classroom, Practice, Storage, or Student behavior.
