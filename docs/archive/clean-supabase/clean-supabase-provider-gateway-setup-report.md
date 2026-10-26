# Clean Supabase Provider Gateway Setup Report

Date: 2026-07-01

Branch: `codex/clean-supabase-provider-gateway-setup`

## Summary

The likely root cause for `/admin/ai-settings` save/create returning `AI provider gateway access denied.` is that the local `AI_PROVIDER_GATEWAY_TOKEN` does not yet have a matching active SHA-256 hash row in `private.ai_provider_gateway_token_hashes`.

The app and clean migration both expect this flow:

- app reads `AI_PROVIDER_GATEWAY_TOKEN`
- admin provider actions pass that token to provider gateway RPCs
- clean migration verifies `sha256(gateway_token)` against `private.ai_provider_gateway_token_hashes`
- create/update/delete provider RPCs reject when the hash row is missing or disabled

## Service-Role Setup RPC

Added:

- `supabase/clean-migrations/0010_provider_gateway_setup_rpc.sql`
- `supabase/clean-migrations/0011_provider_gateway_setup_rpc_role_fix.sql`
- `supabase/clean-migrations/0012_provider_gateway_setup_rpc_ambiguity_fix.sql`
- `supabase/clean-migrations/0013_provider_gateway_setup_rpc_conflict_fix.sql`

The new RPC:

- is named `public.setup_ai_provider_gateway_token_hash`
- requires the caller JWT role to be `service_role`
- accepts only a lowercase 64-character SHA-256 hash
- upserts that hash into `private.ai_provider_gateway_token_hashes`
- does not accept the raw gateway token
- does not return private table contents or secret material
- keeps the `private` schema hidden from PostgREST

Migration `0011` keeps the same RPC contract and fixes service-role detection for Supabase JS service-role RPC calls. This is needed because migration `0010` had already been applied to the disposable remote before the role check was verified.

Migrations `0012` and `0013` keep the same RPC contract and fix PL/pgSQL ambiguity between the `token_hash` function parameter and the `token_hash` table column.

## Helper Script

Created:

- `scripts/setup-clean-provider-gateway-token.mjs`

The helper:

- loads local `.env.local` without printing values
- reads `CLEAN_SUPABASE_SERVICE_ROLE_KEY` from process env only
- computes the SHA-256 hash of `AI_PROVIDER_GATEWAY_TOKEN` locally
- calls `public.setup_ai_provider_gateway_token_hash` with only the hash
- never stores or prints the raw gateway token
- never prints the service-role key
- requires `CLEAN_PROVIDER_GATEWAY_CONFIRM=SETUP_CLEAN_PROVIDER_GATEWAY`
- refuses the known legacy Supabase project target

## Previous Setup Run Result

The helper was run once with the clean disposable service-role key entered locally in PowerShell. No secret values were printed or written to committed files.

Result:

- gateway hash row inserted/upserted: `no`
- blocker: Supabase PostgREST returned `Invalid schema: private`

Interpretation:

The clean schema stores gateway token hashes in the `private` schema, which is correct for security. However, the disposable project does not expose `private` through the REST API, so a service-role Supabase JS client cannot directly upsert `private.ai_provider_gateway_token_hashes`.

This means the current schema has the secure table and verification RPCs, but it does not yet have a safe service-role-only setup RPC/helper path for inserting the first gateway token hash.

## Patch Result

Migration `0010_provider_gateway_setup_rpc.sql` was added to provide the missing service-role-only setup path. The helper was patched to call the RPC instead of trying to write directly to the private schema.

During verification, the first RPC version rejected a service-role Supabase JS call because role detection used only `request.jwt.claim.role`. Migration `0011_provider_gateway_setup_rpc_role_fix.sql` corrects that by using `auth.role()` first and keeps `request.jwt.claim.role` as a fallback.

Disposable remote apply status: migrations `0010`, `0011`, `0012`, and `0013` were applied to the disposable clean Supabase project. The Supabase CLI emitted a Docker cache warning while pushing, but the final remote migration list showed `0010` through `0013` applied.

Gateway hash setup status: helper ran successfully after `0013`; result was `inserted_hash_row` with `rowsAffected: 1`.

## Provider Constraint Patch

After the gateway hash setup succeeded, `/admin/ai-settings` reached the provider profile insert path and exposed a separate clean-schema mismatch:

- UI error: `new row for relation "ai_provider_profiles" violates check constraint "ai_provider_profiles_provider_check"`
- Root cause: the clean migration `0002_provider_profiles_and_operation_logs.sql` only allowed coarse provider values: `gemini`, `openai`, `deepseek`, and `compatible`.
- Current app UI submits bounded adapter-mode values from `AI_PROVIDER_MODE_OPTIONS`.
- The Gemini Native full-PDF option submits `gemini_native`.
- The Gemini OpenAI-compatible page-image option submits `gemini_openai`.

Added:

- `supabase/clean-migrations/0014_provider_profile_provider_check_gemini.sql`

Migration `0014` drops and recreates `ai_provider_profiles_provider_check` with the app-supported provider mode values:

- `openai_compatible`
- `deepseek_openai`
- `gemini_openai`
- `gemini_native`
- `mock`

It also keeps the previous coarse compatibility values:

- `openai`
- `deepseek`
- `gemini`
- `compatible`

No provider credentials, raw gateway token, service-role key, DB password, provider key, or provider API calls were involved in this patch.

Disposable remote apply status: migration `0014` was applied to the disposable clean Supabase project. The final migration list showed local and remote `0014` aligned. The Supabase CLI again emitted a Docker cache warning while pushing, but the migration apply completed and the remote migration list confirmed `0014`.

## What Was Not Done

- no old Supabase access
- no Vercel or production env changes
- no `.env.local` edits
- no seeds changed
- no ad hoc SQL applied outside the clean migration files
- no auth users created
- no provider credentials configured
- no real provider API keys printed or committed
- no real AI provider calls
- no raw gateway token, service-role key, DB password, provider key, or hash was printed or committed

## Tests

Passed:

- `node --check scripts/setup-clean-provider-gateway-token.mjs`
- `npm.cmd run lint`
- `npm.cmd run build`
- `node scripts/security-smoke.mjs`

## Recommended Next Step

Restart the local dev server if needed, then retry `/admin/ai-settings` provider create/save with the Gemini provider profile.

The gateway hash row now exists in the disposable clean Supabase project. Migration `0014` is also applied there, so the clean provider profile constraint now accepts the app's current Gemini provider mode values.
