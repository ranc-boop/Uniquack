# Local Durable AI Worker

## Current architecture

EduStruct has no live deployment. The application runs locally while Auth,
Database, Storage, and the durable AI queue use the hosted Current Clean
Supabase project.

```text
local Next.js application
-> hosted Current Clean Supabase queue
-> local worker runner
-> local internal worker route
-> configured remote Provider
-> hosted private Review Draft persistence
```

The local runner only wakes `POST /api/internal/ai-jobs/run`. That route remains
the canonical execution boundary and continues to choose and claim work. The
runner sends no job ID, operation payload, source reference, Provider choice, or
request body.

Vercel is not currently required. There is no production scheduler or deployed
worker route to configure.

## Start locally

Use two terminals. Supply the same strong, process-scoped
`AI_JOBS_INTERNAL_TOKEN` value to both processes through the approved local
secret-entry method. The value must be 32 to 512 visible ASCII characters and
must not be a placeholder. Do not place it in source, a command-line argument,
chat, or a committed environment file.

Terminal 1:

```powershell
$secureToken = Read-Host "AI_JOBS_INTERNAL_TOKEN" -AsSecureString
$env:AI_JOBS_INTERNAL_TOKEN = [System.Net.NetworkCredential]::new("", $secureToken).Password
Remove-Variable secureToken
npm run dev
```

Terminal 2:

```powershell
$secureToken = Read-Host "AI_JOBS_INTERNAL_TOKEN" -AsSecureString
$env:AI_JOBS_INTERNAL_TOKEN = [System.Net.NetworkCredential]::new("", $secureToken).Password
Remove-Variable secureToken
npm run worker:dev
```

Enter the same value at both hidden prompts. Closing each terminal clears its
process-scoped environment.

`worker:dev` defaults to:

```text
http://127.0.0.1:3000/api/internal/ai-jobs/run
```

If the local Next server uses another loopback port, set
`AI_JOBS_LOCAL_ROUTE_URL` in the worker process to the complete local route.
Only `localhost`, `127.0.0.1`, and `::1` are accepted. Credential-bearing URLs,
query strings, alternate paths, LAN addresses, public hosts, and redirects are
rejected. The runner cannot target a remote deployment.

Safety verdict: `LOCAL_WORKER_RUNNER_CANNOT_TARGET_REMOTE_DEPLOYMENTS`.

The normal `npm run dev` command is unchanged and never starts the worker
implicitly.

## Processing behavior

- One route invocation can be in flight at a time.
- A new invocation is not scheduled until the previous one completes.
- The server route keeps its fixed limit of two considered jobs per invocation.
- Existing queue claim policy keeps AI PDF extraction at one active slot; this
  runner does not alter Provider, PDF, recovery, or Blueprint concurrency.
- Active work uses a short bounded delay before the next wake-up.
- An idle queue uses a longer bounded polling interval.
- An unavailable local server uses bounded exponential backoff.
- Authentication rejection stops immediately.
- Three consecutive fatal worker responses stop the runner.
- `Ctrl+C` aborts the current local HTTP request, clears timers, and shuts down
  without starting another invocation.

Console output contains only timestamps, invocation numbers, safe aggregate
counts, status classifications, delays, and shutdown state. It does not print
tokens, source IDs, filenames, prompts, object paths, Provider responses, or
Review Draft content.

## Important queue warning

Normal local development does not automatically invoke Providers. Running
`npm run worker:dev` against the local application may process real jobs already
stored in the hosted Current Clean queue and may call the configured remote
Provider.

Do not start the runner merely to test that the command exists. Before
processing existing jobs, use a separately approved bounded proof that checks
the target project, queue scope, Provider budget, cleanup expectations, and the
specific jobs allowed to run.

Closing either the local Next server or the worker runner stops queue
processing. Jobs remain durable in Supabase and can be resumed by a later
authorized worker session.

## Safe source-only verification

The focused smoke uses only local fake HTTP servers. It does not load an
environment file, connect to Supabase, call a Provider, or invoke the real local
application route.

```powershell
npm run smoke:local-ai-worker
```
