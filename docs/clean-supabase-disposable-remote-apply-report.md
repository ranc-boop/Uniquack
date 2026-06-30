# Clean Supabase Disposable Remote Apply Report

## Executive Summary

Result: succeeded.

The user explicitly approved the previously ambiguous target as the disposable clean Supabase project. The retry progressed through:

- local process project ref setup
- Supabase CLI version check
- temporary workspace preparation
- temporary workspace inspection
- temporary workspace link to the approved disposable project
- private remote Postgres password retry
- direct TCP connectivity checks for Supabase pooler ports
- successful private-network retry
- migration status verification after apply
- read-only schema verification after apply

The first retry on a public network was blocked by TCP timeouts to the Supabase Postgres pooler. After switching to a private network, the Supabase pooler ports checked in this run were reachable, `npx.cmd supabase db push --yes` applied all 9 clean migrations, and `npx.cmd supabase migration list` confirmed local and remote versions are aligned from `0001` through `0009`.

Read-only schema verification found no forbidden legacy analytics / page visit / five-facet compatibility / legacy tag tables or matching routines. The expected clean MVP table groups are present.

Clean seeds were not applied. Auth users were not created. App environment variables were not changed.

## Initial State

- Current branch: `codex/clean-supabase-mvp-migrations`
- Starting commit: `c497b0b Retry disposable clean Supabase migration apply`
- `AGENTS.md`: not present in repo root
- Initial working tree: clean except intentionally untracked `output/`

## Disposable Remote Apply Result

Status: succeeded.

Previous blocking reason:

```text
Initial npx.cmd supabase db push timed out before returning a result.
Initial npx.cmd supabase migration list also timed out.
After private password retry, npx.cmd supabase migration list --password <redacted> failed to connect to the Supabase Postgres pooler with a TCP timeout.
Direct connectivity checks to the Supabase pooler ports checked in this run also failed.
```

Resolution:

```text
The user switched from a public network to a private network. Supabase pooler connectivity succeeded, and the clean migration set applied successfully.
```

The full project ref and database password were not printed or committed.

## Supabase CLI Check

Command:

```text
npx.cmd supabase --version
```

Result:

```text
2.108.0
```

Relevant CLI help confirmed:

- `supabase db push` supports `--password, -p string`
- `supabase migration list` supports `--password, -p string`
- `supabase db push` supports `--yes`

No password, connection string, token, or project secret was printed or committed in this task.

Update after private password retry:

- The user provided the disposable remote database password in chat.
- The password was used only in process memory for the retry command.
- The password was not written to repo files.
- The password was not committed.
- The password is not included in this report.

## Disposable Project Ref Handling

The project ref was set only inside the Codex PowerShell process for this run.

Masked form:

```text
no***tu
```

The full value was not written to any file and was not included in this report.

## Target Approval

The user explicitly confirmed:

```text
Approved: no***tu is the disposable clean Supabase project, proceed with migration apply.
```

Old Supabase was not used.

Production was not used.

## Temporary Workspace

The copy-only helper was run from repo root:

```text
scripts/prepare-clean-supabase-remote-workspace.ps1
```

Temporary workspace:

```text
C:\Users\User\AppData\Local\Temp\edustruct-clean-supabase-remote-apply
```

Workspace contents verified:

- `README.md`
- `supabase/migrations/` with exactly 9 clean migration files
- `supabase/seeds/` with exactly 3 clean seed draft files

Workspace exclusions verified:

- no old `supabase/migrations/`
- no `docs/db-archive/`
- no legacy schema dump
- no `.env.local`
- no `output/`
- no app source files

## Link Step

Command shape:

```text
npx.cmd supabase link --project-ref <DISPOSABLE_PROJECT_REF>
```

Result: succeeded.

The link command was run only from the temporary workspace, not from repo root.

## Migration Apply

Command shape:

```text
npx.cmd supabase db push --yes
```

Result: succeeded.

All clean migrations were applied to the approved disposable project from the temporary workspace:

- `0001_foundations_identity_organizations.sql`
- `0002_provider_profiles_and_operation_logs.sql`
- `0003_taxonomy_runtime_source.sql`
- `0004_source_assets_and_import_jobs.sql`
- `0005_ai_parsing_pipeline.sql`
- `0006_review_drafts_and_question_bank.sql`
- `0007_blueprint_engine.sql`
- `0008_practice_agent_evidence.sql`
- `0009_course_builder_near_term.sql`

First failing migration: none.

## Migration List / Status Summary

Command shape:

```text
npx.cmd supabase migration list
```

Initial result: timed out.

Retry command shape:

```text
npx.cmd supabase migration list --password <redacted>
```

Retry result: failed to connect to the Supabase Postgres pooler with a TCP timeout.

Private-network retry result: succeeded.

Confirmed migration status:

```text
Local 0001 -> Remote 0001
Local 0002 -> Remote 0002
Local 0003 -> Remote 0003
Local 0004 -> Remote 0004
Local 0005 -> Remote 0005
Local 0006 -> Remote 0006
Local 0007 -> Remote 0007
Local 0008 -> Remote 0008
Local 0009 -> Remote 0009
```

## Network / Port Check

Non-secret connectivity checks were run against the Supabase Postgres pooler host and the ports checked in this run.

Public-network result:

```text
TCP connectivity failed for the Supabase pooler ports checked in this run.
```

Private-network result:

```text
TCP connectivity succeeded for the Supabase pooler ports checked in this run.
```

The original blocker was network/port reachability, not a confirmed migration SQL failure.

## Forbidden Legacy Object Verification

Read-only verification was run against the remote disposable project.

Result: no matching forbidden legacy tables or routines were found for:

```text
page_visits
page_visit_country_stats
page_visit_daily_stats
five_facet_* runtime objects
question_tags
video_tags
demo_learning_runs
IP hash / analytics objects
```

## Expected Clean Table Group Verification

Read-only verification was run against the remote disposable project.

Expected clean MVP groups are present:

- organizations / profiles / organization_members
- provider profiles and operation logs
- taxonomy runtime source
- source assets and import jobs
- AI parsing pipeline
- review drafts and question bank
- blueprint engine
- practice agent evidence
- course builder near-term records
- videos

## Scope Confirmations

- Temporary workspace was used.
- Repo root `supabase/migrations/` was not used.
- Only clean migration files were staged in the temporary workspace for apply.
- The clean migrations were applied from the temporary workspace.
- Clean seeds were not applied.
- Auth users were not created.
- Provider credentials were not configured.
- App environment variables were not changed.
- `.env.local` was not modified.
- Vercel/production env was not modified.
- App/frontend code was not modified.
- `supabase/clean-migrations/` was not modified.
- `supabase/clean-seeds/` was not modified.
- Existing `supabase/migrations/` was not modified.
- The legacy schema dump was not applied or replayed.
- `output/` was left untracked by design.

## Recommended Next Task

Proceed to the next planned clean Supabase setup step, still using the same safety boundaries.

Suggested safe approach:

1. Keep the disposable project separate from production.
2. Decide whether to run the local-only clean seed drafts.
3. Plan service-role-only auth bootstrap separately.
4. Configure provider credentials separately.
5. Do not cut over app `.env.local` / Vercel env until seed/auth/provider setup is explicitly approved.

Do not apply legacy SQL dumps or bulk-copy legacy data into the disposable clean project.
