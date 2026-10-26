# Clean Supabase Post-Bootstrap Verification Report

## Executive Summary

Result: disposable post-bootstrap verification completed with two follow-up blockers before app cutover.

Confirmed current disposable DB state:

```text
auth.users: 1
organizations: 2
profiles: 1
organization_members: 1
```

The first admin bootstrap is internally aligned:

```text
profile default organization: edustruct-clean-mvp
organization membership: edustruct-clean-mvp
profile/member aligned: yes
```

However, seeded demo/product content belongs to a different organization:

```text
seed/demo content organization: edustruct-local-demo
admin bootstrap organization: edustruct-clean-mvp
```

That organization split is a blocker before app cutover or trusted end-to-end app smoke. It should be fixed in a separate alignment task rather than patched during this verification.

## Disposable Target Confirmation

- Target type: disposable clean Supabase project
- Target URL type: project root URL
- Old Supabase used: no intentional old target use
- Production/live used: no
- `.env.local` modified: no
- Vercel env modified: no
- migrations modified/applied: no
- seeds modified/applied: no
- app/frontend code modified: no
- provider credentials configured: no
- users created or mutated in this task: no

Private values were entered through local PowerShell prompts, used as process-only environment variables, and cleared after checks.

## Org / Content Alignment

Organizations:

```text
edustruct-local-demo: active
edustruct-clean-mvp: active
```

Profile and membership:

```text
super_admin:active profiles: 1
admin:active organization_members: 1
profile default org: edustruct-clean-mvp
membership org: edustruct-clean-mvp
```

Content ownership:

```text
review_batches: 1 owned by edustruct-local-demo
question_blueprints: 1 owned by edustruct-local-demo
practice_course_frameworks: 1 owned by edustruct-local-demo
questions: 2 owned by edustruct-local-demo
videos: 1 owned by edustruct-local-demo
course_generation_runs: 0
import_batches: 0
```

Tables that were missing or not organization-scoped in this inspection:

```text
review_draft_items
question_blueprint_folders
course_materials
```

Conclusion: `organizations = 2` is acceptable as an observed consequence of seed + bootstrap rehearsal, but it is a blocker for app cutover because the admin account is not attached to the organization that owns seeded content.

## Auth / Profile / Membership Counts

Safe count summary:

```text
auth.users: 1
profiles: 1
organization_members: 1
organizations: 2
```

No emails, user IDs, tokens, raw user objects, invite links, or raw API responses were printed.

## Provider Profiles

Provider profile summary:

```text
total provider profiles: 1
active rows: 1
enabled providers: 0
disabled providers: 1
rows with key material: 0
```

No provider credentials were configured in this task.

## Forbidden Legacy Object Check

The following legacy/deprecated object names are present but empty:

```text
page_visits: present, count 0
page_visit_country_stats: present, count 0
page_visit_daily_stats: present, count 0
five_facet_tag_nodes: present, count 0
five_facet_tag_edges: present, count 0
five_facet_tag_aliases: present, count 0
five_facet_curriculum_concept_mappings: present, count 0
five_facet_question_tag_assignments: present, count 0
five_facet_tag_review_actions: present, count 0
five_facet_video_tag_assignments: present, count 0
question_tags: present, count 0
video_tags: present, count 0
demo_learning_runs: present, count 0
```

This is a schema hygiene blocker for the clean canonical project. The tables are empty, so this is not a data leak, but the clean migration baseline still includes objects that the reset plan expected to be absent.

## Auth Bootstrap Validate-Only

The first verification runner had a local runner bug that omitted `BOOTSTRAP_ADMIN_PASSWORD`, so the auth bootstrap validate-only step was rerun in a focused validate-only prompt.

Focused validate-only result:

```json
{
  "execution_mode": "validate-only",
  "requested_user_count": 1,
  "clean_table_checks_passed": 1
}
```

Result: passed.

No dry-run or execute was run during this focused rerun.

## RLS Smoke

Command:

```text
node scripts/supabase-rls-smoke.mjs
```

Result: passed.

Observed checks:

```text
PASS question blueprint migration enables admin-only RLS
PASS public can read active taxonomy nodes
PASS public can call taxonomy search RPC for published approved content
PASS anon cannot write taxonomy nodes
```

Note: the smoke script still invokes dotenv and reported injected env entries from `.env.local`; process-only disposable env vars were set for the required Supabase URL/key values, and `.env.local` was not modified.

## Security Smoke

Command:

```text
node scripts/security-smoke.mjs
```

Result: passed.

Observed checks covered taxonomy schema/RPC, public question search, admin taxonomy UI patterns, batch import tag IDs, practice persistence, blueprint observation/analyzer/review/library flows, blueprint generation safety, calibration, and AI PDF blueprint observation safety.

## Route Smoke

Command:

```text
node scripts/route-smoke.mjs
```

Result: blocked.

Reason:

```text
localhost:3000 unavailable or timed out
```

No dev server was started in this verification task because the goal was to avoid app cutover or persistent env changes.

## Lint / Build

Lint/build were skipped because this task only adds this report document and does not modify app code.

## Scope / Safety Confirmation

- old Supabase used: no
- production/live used: no
- `.env.local` modified: no
- Vercel env modified: no
- migrations/seeds modified: no
- SQL applied: no
- provider credentials configured: no
- auth users created in this task: no
- profiles or memberships mutated in this task: no
- app cutover performed: no
- secret values printed: no
- secret values committed: no
- process secret env vars cleared: yes

## Blockers

1. Admin/content organization mismatch:

   ```text
   admin org: edustruct-clean-mvp
   seeded content org: edustruct-local-demo
   ```

2. Legacy/deprecated tables exist in the disposable schema, even though they are empty.

3. Route smoke was blocked because no local dev server was available under disposable process env.

## Recommended Next Task

Create a separate explicit alignment task before app cutover:

```text
Align disposable seed organization and bootstrap organization
```

That task should decide whether to:

- seed demo content directly into `edustruct-clean-mvp`, or
- bootstrap the first admin into `edustruct-local-demo`, or
- migrate/reassign seeded content to the bootstrap org.

Do not configure provider credentials or app/Vercel env cutover until org/content alignment is resolved and route smoke can run against the disposable env.
