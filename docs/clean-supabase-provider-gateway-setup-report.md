# Clean Supabase Provider Gateway Setup Report

Date: 2026-06-30

Branch: `codex/clean-supabase-provider-gateway-setup`

## Summary

The likely root cause for `/admin/ai-settings` save/create returning `AI provider gateway access denied.` is that the local `AI_PROVIDER_GATEWAY_TOKEN` does not yet have a matching active SHA-256 hash row in `private.ai_provider_gateway_token_hashes`.

The app and clean migration both expect this flow:

- app reads `AI_PROVIDER_GATEWAY_TOKEN`
- admin provider actions pass that token to provider gateway RPCs
- clean migration verifies `sha256(gateway_token)` against `private.ai_provider_gateway_token_hashes`
- create/update/delete provider RPCs reject when the hash row is missing or disabled

## Helper Script

Created:

- `scripts/setup-clean-provider-gateway-token.mjs`

The helper:

- loads local `.env.local` without printing values
- reads `CLEAN_SUPABASE_SERVICE_ROLE_KEY` from process env only
- computes the SHA-256 hash of `AI_PROVIDER_GATEWAY_TOKEN` locally
- attempts to upsert only the hash into `private.ai_provider_gateway_token_hashes`
- never stores or prints the raw gateway token
- never prints the service-role key
- requires `CLEAN_PROVIDER_GATEWAY_CONFIRM=SETUP_CLEAN_PROVIDER_GATEWAY`
- refuses the known legacy Supabase project target

## Setup Run Result

The helper was run once with the clean disposable service-role key entered locally in PowerShell. No secret values were printed or written to committed files.

Result:

- gateway hash row inserted/upserted: `no`
- blocker: Supabase PostgREST returned `Invalid schema: private`

Interpretation:

The clean schema stores gateway token hashes in the `private` schema, which is correct for security. However, the disposable project does not expose `private` through the REST API, so a service-role Supabase JS client cannot directly upsert `private.ai_provider_gateway_token_hashes`.

This means the current schema has the secure table and verification RPCs, but it does not yet have a safe service-role-only setup RPC/helper path for inserting the first gateway token hash.

## What Was Not Done

- no old Supabase access
- no Vercel or production env changes
- no `.env.local` edits
- no migrations or seeds changed
- no SQL applied
- no auth users created
- no provider credentials configured
- no real provider API keys printed or committed
- no real AI provider calls

## Tests

Passed:

- `node --check scripts/setup-clean-provider-gateway-token.mjs`
- `npm.cmd run lint`
- `npm.cmd run build`
- `node scripts/security-smoke.mjs`

## Recommended Next Step

Add a narrow service-role-only gateway setup path as a separate explicit PR, or run a one-off sanitized SQL setup step in the Supabase SQL editor.

Recommended implementation path:

1. Add a setup RPC that is executable only by the `service_role` JWT role.
2. The RPC should accept a precomputed SHA-256 hash, never the raw gateway token.
3. The local helper should call that RPC instead of trying to write directly to the `private` schema through PostgREST.
4. After the hash row is inserted, restart the dev server and retry `/admin/ai-settings` provider create/save.

Until that hash row exists, `/admin/ai-settings` provider create/save may continue to return `AI provider gateway access denied.`
