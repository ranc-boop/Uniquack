# Durable AI job queue migration apply

## Scope

Apply only `supabase/clean-migrations/0033_ai_provider_jobs.sql` to the **clean Supabase project** after this branch is merged. Do not apply it to the archived/old Supabase project and do not rerun older migrations.

The migration creates a durable queue for only two kinds of server-owned work:

- `ai_pdf_extract`
- `blueprint_generate_questions`

It does not add provider credentials, change a provider/model, publish questions, create assignments, or expose bank content to students.

## Safe apply sequence

1. Confirm the Dashboard SQL Editor is connected to the clean project.
2. Open `supabase/clean-migrations/0033_ai_provider_jobs.sql` from the merged repository.
3. Review that it creates `public.ai_provider_jobs`, trusted-worker claim/heartbeat/finish RPCs, and RLS policies.
4. Run that one migration once through the SQL Editor or the approved clean-project migration workflow.
5. Verify only object names and grants, without selecting queue payloads:

```sql
select to_regclass('public.ai_provider_jobs') as ai_provider_jobs_table;

select routine_name
from information_schema.routines
where routine_schema = 'public'
  and routine_name in (
    'enqueue_ai_provider_job',
    'claim_ai_provider_jobs',
    'heartbeat_ai_provider_job',
    'finish_ai_provider_job',
    'cancel_ai_provider_job'
  )
order by routine_name;
```

6. Run `node scripts/durable-ai-job-queue-smoke.mjs` and the relevant RLS smoke against the clean project.

## Worker trigger

The queue intentionally does **not** let a teacher browser run provider work. A trusted scheduler or internal worker should call:

```text
POST /api/internal/ai-jobs/run
```

The caller must send the `x-ai-jobs-internal-token` header whose value matches the server-only `AI_JOBS_INTERNAL_TOKEN` environment variable. Configure the value through the hosting platform or existing secret-management workflow only. Do not put it in source control, chat, teacher UI, or a client bundle.

The route claims at most two jobs per invocation from the database. It accepts no job payload and returns only bounded aggregate counts.

Until a trusted trigger is configured, jobs remain visibly queued. Their private source PDF, selected Library, and Review Draft safety gate are preserved.

## Rollback risk

This is a forward-only clean migration. Do not drop queue rows to "undo" it. If the trigger must be paused, stop the scheduler; queued work remains recoverable and does not publish or assign anything.
