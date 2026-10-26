# Durable AI Queue Worker Role Fix

## Why this forward-only patch is required

Live validation after applying `0033_ai_provider_jobs.sql` proved that a clean
Supabase service-role request could enqueue and read the queue but could not
claim work. The worker RPCs checked only the legacy
`request.jwt.claim.role` setting, which is empty for this project's current
PostgREST service-role requests.

`0034_ai_provider_jobs_worker_role_fix.sql` keeps the queue schema, RLS,
limits, leases, and grants unchanged. It only redefines:

- `public.claim_ai_provider_jobs`
- `public.heartbeat_ai_provider_job`
- `public.finish_ai_provider_job`

Each function now prefers `auth.role()` and retains the legacy setting as a
fallback. Normal authenticated users remain blocked; only `service_role` may
claim, heartbeat, or finish a job.

## Manual apply

1. Confirm the Supabase SQL Editor is connected to the clean project.
2. Run **only** `supabase/clean-migrations/0034_ai_provider_jobs_worker_role_fix.sql` once.
3. Do not rerun `0033` and do not apply this to the archived/old project.
4. Re-run:

```powershell
node scripts\durable-ai-job-queue-live-smoke.mjs
```

The smoke creates and removes only marked queue validation rows. It does not
call a provider, publish content, or create an Assignment.

## Production boundary

This patch does not enable production queue execution. The trusted worker
route still requires server-only `AI_JOBS_INTERNAL_TOKEN`, a deployed trigger,
and monitoring before queue processing can be enabled outside local validation.
