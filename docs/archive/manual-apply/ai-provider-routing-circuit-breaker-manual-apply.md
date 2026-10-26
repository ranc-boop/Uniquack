# AI Provider Routing Circuit Breaker Manual Apply

## Scope

Apply only:

```text
supabase/clean-migrations/0035_ai_provider_routing_circuit_breaker.sql
```

This is a forward-only clean-schema migration. Do not rerun or edit applied
migrations `0033_ai_provider_jobs.sql` or
`0034_ai_provider_jobs_worker_role_fix.sql`.

## Safe Apply Steps

1. Sign in to the clean Supabase project with an administrator account.
2. Open the Dashboard SQL Editor.
3. Copy the full contents of `0035_ai_provider_routing_circuit_breaker.sql`.
4. Run it once.
5. Confirm the query succeeds before reopening Admin / AI Settings.

## What It Adds

- `public.ai_provider_routing_policies`: admin-only per-operation ordered routes.
- `public.ai_provider_routing_policy_members`: primary and explicit fallback
  profile references.
- `private.ai_provider_runtime_states`: shared cross-worker circuit state.
- Service-role-only RPCs for reading state, leasing one half-open probe, and
  recording bounded safe outcomes.

No provider key, prompt, PDF content, raw provider response, or raw provider
error is stored by this migration.

## Configure After Apply

Open **Admin / AI Settings**. For each operation that should run, choose an
enabled provider profile as the primary route and optionally one or two
compatible fallbacks. The UI appears only to super admins.

Current operation meanings:

- `AI PDF extraction`: requires an implemented PDF or page-image path.
- `Blueprint PDF observation`: requires the existing native Gemini PDF or mock
  path.
- `Blueprint text analysis`: requires the existing OpenAI-compatible JSON chat
  adapter.
- `Blueprint question generation`: requires text plus structured JSON support.

Teachers and students cannot choose provider profiles, models, keys, or
fallback order. Their queued work resolves the current route on the server.

## Verify Without a Provider Call

Run:

```powershell
node scripts\ai-provider-fallback-circuit-breaker-smoke.mjs
node scripts\security-smoke.mjs
```

After the migration is applied, manually confirm that Admin / AI Settings shows
the four routing panels. A separate bounded live validation is required before
claiming the shared circuit state has been exercised on the clean remote.
