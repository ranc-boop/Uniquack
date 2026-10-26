# Clean Supabase Disposable Remote Apply Report

## Executive Summary

Result: passed.

This run started from updated `main` after the clean Supabase baseline-only PR was merged. A fresh branch was created and a fresh temporary apply workspace was prepared outside the repo. The temporary workspace copied only the clean MVP migration files into `supabase/migrations/` and staged clean seed drafts for reference only.

The user-confirmed disposable clean Supabase validation project was linked from the temporary workspace. The old Supabase project was not used, and no production/live app cutover was performed.

Migration status before push already showed local and remote versions aligned from `0001` through `0009`. Running `npx.cmd supabase db push --password <redacted>` from the temporary workspace returned `Remote database is up to date.` A second migration list confirmed `0001` through `0009` remained aligned.

Clean seeds were not applied. Auth users were not created. Provider credentials were not configured. App environment variables were not changed.

## Initial State

- Current branch for this report: `codex/disposable-clean-supabase-remote-apply`
- Baseline source: latest `main`
- Baseline merge present: yes
- `AGENTS.md`: not present in repo root
- Initial working tree: clean

## Disposable Remote Apply Result

Status: passed.

Target confirmation:

- Target project type: user-confirmed disposable clean Supabase validation project
- Masked project ref: `no***tu`
- Old Supabase project used: no
- Production/live project used: no
- Supabase dashboard branch label note: a dashboard `main` / `PRODUCTION` label alone was not treated as a blocker because the project itself was the user-confirmed disposable validation project.

Secrets handling:

- The disposable project ref and database password were set only inside command process environment for this run.
- The database password was not written to repo files.
- The database password was not committed.
- The full project ref is not included in this report.
- Secret environment values were cleared or not present before finishing.

## Supabase CLI Check

Command:

```text
npx.cmd supabase --version
```

Result:

```text
2.108.0
```

## Baseline Files Verified On Main

Clean migrations present:

```text
0001_foundations_identity_organizations.sql
0002_provider_profiles_and_operation_logs.sql
0003_taxonomy_runtime_source.sql
0004_source_assets_and_import_jobs.sql
0005_ai_parsing_pipeline.sql
0006_review_drafts_and_question_bank.sql
0007_blueprint_engine.sql
0008_practice_agent_evidence.sql
0009_course_builder_near_term.sql
```

Clean seed drafts present:

```text
0001_local_bootstrap_organization.sql
0002_local_taxonomy_seed.sql
0003_local_demo_content_seed.sql
README.md
```

## Temporary Workspace

Temporary workspace path:

```text
C:\Users\User\AppData\Local\Temp\edustruct-clean-supabase-remote-apply
```

Workspace contents verified:

- `README.md`
- `supabase/migrations/` with exactly 9 clean migration files
- `supabase/seeds/` with exactly 3 clean seed draft files

Workspace exclusions verified:

- no old repo `supabase/migrations/`
- no `docs/db-archive/`
- no legacy schema dump
- no `.env.local`
- no `output/`
- no app source files
- no package files
- no secrets intentionally written to workspace files

Supabase config was initialized only inside the temporary workspace.

## Link Step

Command shape:

```text
npx.cmd supabase link --project-ref <DISPOSABLE_PROJECT_REF> --password <redacted>
```

Result: succeeded.

The link command was run only from the temporary workspace, not from repo root.

## Migration List Before Push

Command shape:

```text
npx.cmd supabase migration list --password <redacted>
```

Result: local and remote versions were already aligned.

Summary:

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

## Migration Apply

Command shape:

```text
npx.cmd supabase db push --password <redacted>
```

Result:

```text
Remote database is up to date.
```

No seeds were applied. No auth bootstrap was run. No app cutover was run.

## Migration List After Push

Command shape:

```text
npx.cmd supabase migration list --password <redacted>
```

Result: local and remote versions remained aligned.

Summary:

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

First failing migration: none.

## Forbidden Legacy Object Verification

Read-only catalog checks were run against the disposable remote project.

No matching forbidden legacy tables were found for:

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

No matching forbidden legacy routines were found for:

```text
five_facet*
*analytics*
*page_visit*
*ip_hash*
search_questions_by_legacy_tags
```

## Expected Clean Table Group Verification

Read-only catalog verification found the expected clean MVP table groups:

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
- Only clean migration files were copied into the temporary workspace for apply.
- Clean seeds were staged in the temporary workspace only for future reference.
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
- Legacy data was not bulk-copied.
- `output/` was not handled or committed.
- Secret environment values were cleared or not present before finishing.

## Tests

NPM lint/build were skipped because this task changed only this report document and performed remote migration/status verification from a temporary workspace. No app code or migration files were modified.

## Recommended Next Task

Run a controlled clean seed rehearsal as a separate explicit branch/task.

The next task should still avoid auth bootstrap, provider credentials, app cutover, Vercel/prod env changes, and legacy data import unless each of those is explicitly approved in its own step.
