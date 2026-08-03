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

> **Single-runner requirement:** Only one `npm run worker:dev` process should be active at a time.
> The command acquires an atomic operating-system-wide lock scoped to the local
> worker route. A second terminal fails closed instead of starting another
> wake-up loop. Stale locks are recovered only when their recorded process is no
> longer active. Server-side claim and fencing rules remain the final job-ownership
> boundary.

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
implicitly. Starting another `npm run dev` process also does not start or replace
the one permitted `worker:dev` process.

## Processing behavior

- One route invocation can be in flight at a time.
- A new invocation is not scheduled until the previous one completes.
- The server route keeps its normal limit of two considered jobs per invocation.
- The explicit bounded real-Provider proof mode lowers that limit to one job.
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
job and Provider request counts, status classifications, delays, and shutdown state. It does not print
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

## Bounded one-file Provider proof

`scripts/run-pdf50-end-to-end-live-e2e.ps1` is the operator entry point for the
real one-file validation. It loads allowlisted Current Clean, Teacher, and
Provider-decryption values from a Windows DPAPI credential vault, verifies the
expected project reference, starts an isolated local server, uploads one
synthetic one-page PDF through the real Teacher UI, and invokes the local worker
exactly once.

Create the vault once from a visible Windows PowerShell console:

```powershell
powershell.exe -ExecutionPolicy Bypass -File scripts\setup-pdf50-e2e-credential-vault.ps1
```

Every value is collected with a hidden prompt. The resulting CLIXML file is at
`%LOCALAPPDATA%\EduStruct\CredentialVaults\pdf50-e2e-secrets.clixml`, outside
the repository. On Windows, its `SecureString` values are protected by DPAPI
for the current Windows user on the current computer. Another Windows account
or another computer cannot decrypt the file. Access to the same Windows account
must therefore remain protected.

The vault contains only the seven allowlisted values required by this proof.
The one-job limit, cleanup acknowledgement, Provider mode, request ceilings,
and USD 5 total budget are fixed by the launcher and are not persisted as
operator input. Rerun the setup script and type
`REPLACE_PDF50_E2E_CREDENTIAL_VAULT` to rotate the vault atomically.

Validate the vault structure without decrypting a value to plaintext or
placing anything in the process environment:

```powershell
powershell.exe -ExecutionPolicy Bypass -File scripts\validate-pdf50-e2e-credential-vault.ps1
```

Run the proof without entering the credentials again:

```powershell
powershell.exe -ExecutionPolicy Bypass -File scripts\run-pdf50-end-to-end-live-e2e.ps1
```

The launcher fails closed when the vault is absent, malformed, from another
Windows identity, or cannot be decrypted. It converts one `SecureString` at a
time, places the plaintext only in the launcher process for the child proof,
zeros the temporary BSTR, and clears every process environment value in
`finally`. It never reads or creates `.env.local` and never prints a credential.

To remove the exact encrypted vault file:

```powershell
powershell.exe -ExecutionPolicy Bypass -File scripts\remove-pdf50-e2e-credential-vault.ps1
```

Deletion requires the exact acknowledgement
`DELETE_PDF50_E2E_CREDENTIAL_VAULT` and does not recursively remove any
directory.

The proof mode is server-owned and fail-closed:

- one route invocation and one claimed job;
- at most four inference attempts;
- at most 8,192 output tokens per inference;
- at most 136 Provider HTTP requests across the job;
- a total test-budget acknowledgement of USD 5;
- known-cost Gemini Native PDF with `gemini-2.5-flash-lite` only;
- exact hosted fixture and Storage cleanup.

The trusted server gate also computes a conservative token-cost ceiling before
the worker starts. Four attempts at the known model's 1,048,576-token input
window plus 8,192 output tokens produce a maximum catalog estimate of 432,540
micro-USD (about USD 0.433), below the approved USD 5 total. Actual usage is
recorded after the run and must also remain below USD 5.

The 136-request ceiling reserves four complete worst-case Gemini file
lifecycles: two upload requests, up to 30 status polls, one inference request,
and one cleanup request per attempt. Failed requests count before network I/O.
Cleanup success is recorded separately, and the proof does not pass when the
Provider file cleanup request fails. Attempt counters and actual inference HTTP
request counters remain separate, so upload failures cannot fabricate an
inference request. Normal worker operation does not inherit the proof-only
one-job, 136-request, 8,192-output-token, or USD 5 controls; its existing admin
operations control still applies.

Do not run the launcher against a production project or while unrelated queue
work exists. A passing one-file proof establishes the first operational gate
only; 4/10/50-file qualification remains a separate progression.

## Safe source-only verification

The focused smoke uses only local fake HTTP servers. It does not load an
environment file, connect to Supabase, call a Provider, or invoke the real local
application route.

```powershell
npm run smoke:local-ai-worker
```
