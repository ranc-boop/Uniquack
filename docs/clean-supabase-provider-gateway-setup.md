# Clean Supabase Provider Gateway Setup

This note explains the local clean Supabase AI provider gateway setup.

## Why Gemini Test Can Pass But Save Provider Can Fail

The `/admin/ai-settings` test button can test the API key currently typed into the form without saving it. Saving or updating provider profiles uses the provider gateway RPC path.

The gateway RPC checks:

- the signed-in user is a super admin
- `AI_PROVIDER_GATEWAY_TOKEN` exists on the server
- the SHA-256 hash of that token exists as an active row in `private.ai_provider_gateway_token_hashes`

If the typed Gemini key test succeeds but save/create fails with `AI provider gateway access denied.`, the likely cause is that the local `AI_PROVIDER_GATEWAY_TOKEN` does not yet have a matching active hash row in the clean Supabase project.

The private schema is intentionally not exposed through Supabase PostgREST. Setup should use the narrow service-role-only RPC introduced by `supabase/clean-migrations/0010_provider_gateway_setup_rpc.sql` and patched by the later clean provider-gateway migrations, not a direct client-readable upsert into the private table.

## Required Local Env

`.env.local` must contain these server/runtime values:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `AI_PROVIDER_GATEWAY_TOKEN`
- `AI_PROVIDER_ENCRYPTION_KEY`

`AI_PROVIDER_GATEWAY_TOKEN` and `AI_PROVIDER_ENCRYPTION_KEY` must never be `NEXT_PUBLIC_*`.

Real provider API keys should not be placed in `.env.local`. They should be entered through `/admin/ai-settings`, where they are encrypted server-side before storage.

## Setup Helper

Use:

```powershell
$env:CLEAN_SUPABASE_SERVICE_ROLE_KEY = Read-Host "Enter clean disposable service role key"
$env:CLEAN_PROVIDER_GATEWAY_CONFIRM = "SETUP_CLEAN_PROVIDER_GATEWAY"
node scripts/setup-clean-provider-gateway-token.mjs
Remove-Item Env:\CLEAN_SUPABASE_SERVICE_ROLE_KEY -ErrorAction SilentlyContinue
Remove-Item Env:\CLEAN_PROVIDER_GATEWAY_CONFIRM -ErrorAction SilentlyContinue
```

The helper:

- loads `NEXT_PUBLIC_SUPABASE_URL` and `AI_PROVIDER_GATEWAY_TOKEN` from local env
- reads the service-role key only from process env
- computes the SHA-256 hash locally
- sends only the hash to `public.setup_ai_provider_gateway_token_hash`
- lets the service-role-only RPC upsert the hash into `private.ai_provider_gateway_token_hashes`
- never stores or prints the raw gateway token
- never prints the service-role key
- refuses the known legacy Supabase project target
- requires `CLEAN_PROVIDER_GATEWAY_CONFIRM=SETUP_CLEAN_PROVIDER_GATEWAY`

## After Env Changes

Restart the local dev server after editing `.env.local`. Next.js server env is read by the running dev process, so provider gateway token or encryption-key changes may not take effect until restart.

## Safety Rules

- Do not commit `.env.local`
- Do not paste service-role keys into chat
- Do not commit service-role keys, provider API keys, gateway tokens, encryption keys, or raw SQL logs
- Do not apply this helper to the legacy Supabase project
- Do not use this helper to configure real provider credentials
