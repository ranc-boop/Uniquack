# Clean Supabase Org Content Alignment Report

Date: 2026-06-29

## Summary

The disposable clean Supabase project was aligned so seeded organization-scoped content now belongs to `edustruct-clean-mvp` instead of `edustruct-local-demo`.

The clean seed drafts were also patched so future disposable/local seed runs target:

- Organization name: `EduStruct Clean MVP Disposable`
- Organization slug: `edustruct-clean-mvp`

No app runtime code, migrations, provider credentials, Vercel environment, or `.env.local` files were changed.

## Seed Draft Changes

Updated:

- `supabase/clean-seeds/0001_local_bootstrap_organization.sql`
- `supabase/clean-seeds/0003_local_demo_content_seed.sql`

Changes:

- Bootstrap organization now uses `edustruct-clean-mvp`.
- Organization upsert now resolves by slug.
- Profile/member/provider placeholder rows resolve the organization by `slug = 'edustruct-clean-mvp'`.
- Demo content rows resolve organization ownership by `slug = 'edustruct-clean-mvp'`.

The deterministic organization UUID remains in the bootstrap insert as the seed identity for the clean MVP organization.

## Disposable Remote Alignment

Environment type: disposable remote Supabase project.

Before alignment, these rows belonged to `edustruct-local-demo`:

| Table | Rows moved |
| --- | ---: |
| `review_batches` | 1 |
| `question_blueprints` | 1 |
| `practice_course_frameworks` | 1 |
| `questions` | 2 |
| `videos` | 1 |
| `ai_provider_profiles` | 1 |

Tables checked with no old-org rows:

- `course_generation_runs`
- `import_batches`
- `practice_sessions`

After alignment, organization-scoped seeded runtime rows belong to `edustruct-clean-mvp`:

| Table | Rows under `edustruct-clean-mvp` |
| --- | ---: |
| `review_batches` | 1 |
| `question_blueprints` | 1 |
| `practice_course_frameworks` | 1 |
| `questions` | 2 |
| `videos` | 1 |
| `ai_provider_profiles` | 1 |

## Identity and Provider Safety

The alignment did not mutate:

- `auth.users`
- `profiles`
- `organization_members`

The old organization was not deleted.

Provider profile summary after alignment:

- Total provider profiles: 1
- Active rows: 1
- Enabled profiles: 0
- Disabled profiles: 1
- Rows with key material: 0

No provider credentials were configured or inserted.

## Two Organization State

The disposable remote still has two active organization rows:

- `edustruct-local-demo`
- `edustruct-clean-mvp`

This is not a cutover blocker for the disposable rehearsal because identity rows and seeded runtime content now point to `edustruct-clean-mvp`. The old org row has no aligned runtime content after this pass. If the disposable project should be strictly single-org before app cutover, archive or remove the old org in a separate explicit DB cleanup task.

## Legacy and Deprecated Objects

The following objects are still present but empty:

| Object group | Classification |
| --- | --- |
| `page_visits`, `page_visit_country_stats`, `page_visit_daily_stats` | Forbidden legacy analytics objects, empty |
| `five_facet_*` tables | Historical compatibility objects, empty and not current runtime source |
| `question_tags`, `video_tags` | Deprecated compatibility tables, empty |
| `demo_learning_runs` | Forbidden demo runtime object, empty |

No remote legacy tables were dropped in this task.

## Secret Scan

A conservative scan of `supabase/clean-seeds` matched only comments and README wording such as `Supabase`, `service-role-only`, and `secret material`.

No credential values, provider keys, JWT secrets, service role keys, database URLs, or passwords were found in the changed seed files.

## Verification

Disposable runner results:

- DB alignment: passed
- `node scripts/security-smoke.mjs`: passed
- `node scripts/supabase-rls-smoke.mjs`: passed
- `node scripts/route-smoke.mjs`: blocked by unavailable localhost dev server (`ECONNREFUSED` on port 3000)
- `npm.cmd run lint`: passed
- `npm.cmd run build`: passed
- Secret process environment cleanup: confirmed

## Next Recommended Step

After this branch is reviewed and merged, proceed with the app cutover rehearsal against the disposable clean project using `edustruct-clean-mvp`. Keep provider credentials and production environment wiring as separate explicit tasks.
