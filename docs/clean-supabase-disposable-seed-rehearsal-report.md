# Clean Supabase Disposable Seed Rehearsal Report

## Executive Summary

Result: passed.

This run started from updated `main` after the clean Supabase baseline and disposable remote migration apply report were merged. A fresh branch was created for the seed rehearsal, and a seed-only temporary workspace was prepared outside the repo.

The clean seed SQL files were applied to the user-confirmed disposable clean Supabase validation project twice, in order, to verify remote idempotency:

1. `0001_local_bootstrap_organization.sql`
2. `0002_local_taxonomy_seed.sql`
3. `0003_local_demo_content_seed.sql`

Both seed passes completed successfully. No clean migrations were run in this task. No auth users were created. No provider credentials were configured. App environment variables were not changed.

## Environment

- Current branch for this report: `codex/disposable-clean-supabase-seed-rehearsal`
- Baseline source: latest `main`
- `AGENTS.md`: not present in repo root
- Target project type: user-confirmed disposable clean Supabase validation project
- Old Supabase project used: no
- Production/live project used: no

Secrets handling:

- The disposable connection details were set only inside command process environment for this run.
- The DB URL was not written to repo files.
- The DB URL was not committed.
- The full project ref and password are not included in this report.
- Secret environment values were cleared or not present before finishing.

## Tooling Note

Local `psql` was unavailable.

Docker was installed, but the Docker daemon was not running, so a disposable PostgreSQL client container could not be used.

To continue without writing or printing the DB URL, the seed files were executed from a linked temporary Supabase workspace using:

```text
npx.cmd supabase db query --linked --file <seed-file>
```

This was run only against the user-confirmed disposable validation project. No app runtime code, migrations, or environment files were modified.

## Temporary Workspace

Temporary workspace path:

```text
C:\Users\User\AppData\Local\Temp\edustruct-clean-supabase-seed-rehearsal
```

Workspace contents verified:

- `README.md`
- `supabase/seeds/` with exactly 3 clean seed draft files

Workspace exclusions verified:

- no clean migrations
- no old repo migrations
- no `docs/db-archive/`
- no legacy schema dump
- no `.env.local`
- no `output/`
- no app source files
- no package files
- no secrets intentionally written to workspace files

## Seed Pass 1

Result: passed.

Files applied in order:

```text
0001_local_bootstrap_organization.sql
0002_local_taxonomy_seed.sql
0003_local_demo_content_seed.sql
```

First failing seed file: none.

## Seed Pass 2 / Idempotency

Result: passed.

The same seed files were applied a second time in the same order. The second pass completed successfully, confirming the seed drafts are idempotent for the disposable remote project.

First failing seed file: none.

## Safe Row Count Summary

Safe row counts after the second seed pass:

```text
ai_provider_profiles: 1
auth.users: 0
course_generation_runs: 0
organization_members: 0
organizations: 1
practice_course_frameworks: 1
profiles: 0
question_blueprint_folders: 1
question_blueprints: 1
question_taxonomy_assignments: 10
questions: 2
review_batches: 1
review_draft_items: 1
taxonomy_aliases: 4
taxonomy_edges: 19
taxonomy_facets: 5
taxonomy_node_closure: 49
taxonomy_nodes: 18
videos: 1
```

## Guarded Auth-Dependent Behavior

`auth.users` remained `0`, confirming this seed rehearsal did not create auth users.

Because no matching auth users existed:

- `profiles` remained `0`
- `organization_members` remained `0`
- `course_generation_runs` remained `0`

This is expected guarded behavior. The seed drafts only attach profile/member/course-run rows when matching placeholder auth identities already exist through a separate approved auth bootstrap path.

## Provider Credential Verification

Provider metadata row count:

```text
total provider profiles: 1
enabled provider profiles: 0
profiles with key material: 0
```

The seed rehearsal created only a disabled placeholder provider metadata row. No usable provider credentials or encrypted key material were inserted.

## Forbidden Legacy Object Verification

Read-only catalog checks were run against the disposable remote project after seed rehearsal.

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

## Static Seed Sensitive Scan

Static scan patterns included:

```text
password
api_key
secret
token
SUPABASE
SERVICE_ROLE
postgres://
postgresql://
sk-
AIza
eyJ
```

Result: no real-looking credentials were found.

Matches were limited to seed file titles and README/comment safety language, including reminders that these are local/dev-only drafts, do not create production auth users, and should use service-role-only bootstrap paths separately.

## Scope Confirmations

- Clean migrations were not run in this task.
- Clean seed SQL was applied twice.
- Auth users were not created.
- Provider credentials were not configured.
- Auth bootstrap was not run.
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

NPM lint/build were skipped because this task changed only this report document and performed remote seed verification from a temporary workspace. No app code, migration files, or seed files were modified.

## Recommended Next Task

Run service-role-only auth bootstrap as a separate explicit PR/task.

Provider credentials, app cutover, Vercel/prod env changes, and legacy data import should remain separate and require explicit approval.
