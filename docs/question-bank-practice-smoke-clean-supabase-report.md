# Question Bank to Practice Agent Smoke on Clean Supabase

Date: 2026-07-03

## Executive summary

The approved synthetic AI-import question is correctly published into the clean Supabase Question Bank and is visible through the public taxonomy/search path.

Question Bank and taxonomy/search smoke: **passed**.

Practice Agent smoke: **passed after clean schema patch**. The previous blocker was an authenticated custom practice round returning `500` because the disposable clean Supabase `practice_sessions` table was missing current Practice Agent runtime columns, starting with:

```text
practice_sessions.session_state
```

Clean migration `0017_practice_sessions_session_state.sql` was added and applied to the disposable clean Supabase project. After applying it, authenticated `/practice` returned `200`, `POST /api/practice/rounds/custom` returned `200`, attempt grading returned `200`, and wrong-question read returned `200`.

No additional Review Drafts were approved or published. No provider credentials were touched. No seeds, auth users, profiles, or organization memberships were changed.

## Approved synthetic question identified

- Question ID: `13ebfc76-7f5f-48cb-8d79-cd55880bf2da`
- Question code: `AI-F3EBACF3-001`
- Title: `Solve linear equation`
- Status: `published`
- Source kind: `ai_import`
- `source_review_item_id`: present
- Source/provenance: present
- Published timestamp: present
- Organization slug: `edustruct-clean-mvp`
- Organization status: `active`
- Question type: `mcq`
- Options: 4
- Content and solution fields: present

This question is from the tiny synthetic Gemini QA import, not from `calc_3.1_packet.pdf`.

## Question Bank result

Passed.

Verified:

- Authenticated `/admin/questions?search=AI-F3EBACF3-001` returned `200`.
- The admin question page response contained `AI-F3EBACF3-001`.
- Public `/questions?search=AI-F3EBACF3-001` returned `200`.
- Public `/questions/13ebfc76-7f5f-48cb-8d79-cd55880bf2da` returned `200`.
- Public question list/detail responses contained the synthetic question code.
- No route response contained obvious server-error copy.
- Source/provenance fields remained attached in the database.

## Taxonomy/search result

Passed.

The approved synthetic question has 2 taxonomy assignments:

- `math.form.multiple_choice`
- `math.task.determine`

Both assignments are:

- `review_status = approved`
- source = `batch_import`
- active taxonomy nodes
- assignable leaf nodes
- `node_kind = tag`

Search verification:

- `search_questions_by_taxonomy` found 1 row for `AI-F3EBACF3-001`.
- Filtering by one of the approved taxonomy tags returned rows and included the synthetic question.
- No legacy `five_facet`, `question_tags`, or legacy tag path was required for the question to be searchable.

## Practice Agent result

Passed after clean migration `0017_practice_sessions_session_state.sql`.

Passed:

- Authenticated `/practice` returned `200`.
- The page rendered practice copy and did not show a route/server error.
- The approved question is publicly readable from `questions` with the fields needed for practice recommendation shape:
  - `id`
  - `question_code`
  - `title`
  - `content_html`
  - `difficulty_rating`
  - `options`
  - `question_type`
  - `source`

Previous blocker:

- Authenticated `POST /api/practice/rounds/custom` with the approved synthetic question returned `500`.
- Dev server log shows:

```text
Error: column practice_sessions.session_state does not exist
```

This was a clean schema/app contract mismatch. Current practice runtime code references cache-first Practice Agent columns including `session_state`, `session_plan`, `session_thread_messages`, `next_user_notes`, `preference_dirty_at`, `practice_agent_episodes.cache_thread_entry`, and `practice_preference_merge_jobs.source_summary`.

Fix applied:

- Added `supabase/clean-migrations/0017_practice_sessions_session_state.sql`.
- Added/backfilled current Practice Agent JSON/text columns with safe defaults and object/array/length checks.
- Updated the `practice_sessions.cache_prefix_version` default to current runtime default `practice-session-v2` for new rows.
- Kept RLS policies unchanged.
- Applied migration `0017` to the disposable clean Supabase project; migration list now shows `0017` aligned locally and remotely.

Post-fix smoke:

- Authenticated `/practice` returned `200`.
- Authenticated `POST /api/practice/rounds/custom` with `AI-F3EBACF3-001` returned `200`.
- The custom round created 1 recommendation.
- Created session had `practice-session-v2`, object `session_state`, object `session_plan`, array `session_thread_messages`, and string `next_user_notes`.
- Provider-free attempt grading via `/api/practice/grade` returned `200`.
- Wrong-question read via `/api/practice/wrong-questions` returned `200`.
- Hint and review-summary routes were not called in this schema smoke because they may invoke Practice AI provider paths; this task intentionally avoided provider calls.

Scoped cleanup:

- The smoke used goal `Smoke check synthetic approved question`.
- No scoped practice session rows remained after the post-fix custom-round smoke.

## Visibility/safety result

Passed.

Verified:

- Draft question count remains non-zero; drafts are not exposed through the public published taxonomy search path.
- The approved synthetic question is visible where expected because it is published and has approved taxonomy assignments.
- Calc packet drafts remain untouched:
  - `calc_3.1_packet.pdf` batches: 2
  - Linked calc packet questions: 41
  - Published calc packet questions: 0
- No extra Review Drafts were approved or published in this task.
- Review Draft governance was not bypassed.
- Only clean migration `0017` was applied to the disposable clean Supabase project.
- No seed SQL was applied.

## Tests run

- Temporary provider-free Practice Agent custom-round smoke passed:
  - `/practice`: `200`
  - `/api/practice/rounds/custom`: `200`
  - `/api/practice/grade`: `200`
  - `/api/practice/wrong-questions`: `200`
  - scoped cleanup remaining: `0`
- `npm.cmd run lint` passed.
- `npm.cmd run build` passed.
- `node scripts/security-smoke.mjs` passed.
- `node scripts/supabase-rls-smoke.mjs` passed with network access.
- `node scripts/route-smoke.mjs` passed.
- `npm.cmd run smoke` passed with network access.

## Remaining blockers

No remaining blocker was found for the Practice Agent custom round clean-schema path.

Provider-backed hint/review-summary routes were intentionally not called in this schema compatibility smoke to avoid real Practice AI provider calls. They remain covered at the static/route level by the normal smoke suite.

## Recommended next task

Continue manual UI testing from Question Bank into Practice using the published synthetic question, then separately test provider-backed Practice hint/review flows only when the desired Practice AI provider path is configured for that test.

## Safety confirmations

- `.env.local` was not modified.
- No env values or secrets were printed.
- No provider credentials were configured or changed.
- No old Supabase project was touched.
- Clean migration `0017_practice_sessions_session_state.sql` was applied only to the disposable clean Supabase project.
- No old migrations were applied.
- No seed SQL was applied.
- No auth users were created.
- No profiles or organization memberships were mutated.
- No additional Review Drafts were approved, rejected, or published.
- No `calc_3.1_packet.pdf` drafts were touched.
- `.codex_tmp/` and `output/` were not committed.
