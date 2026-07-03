# Question Bank to Practice Agent Smoke on Clean Supabase

Date: 2026-07-03

## Executive summary

The approved synthetic AI-import question is correctly published into the clean Supabase Question Bank and is visible through the public taxonomy/search path.

Question Bank and taxonomy/search smoke: **passed**.

Practice Agent smoke: **partially blocked**. `/practice` loads for an authenticated user, and the approved question is readable in the published-question shape used by practice recommendations. However, the authenticated custom practice round API returns `500` because the clean Supabase `practice_sessions` table is missing runtime columns now required by the current Practice Agent code, starting with:

```text
practice_sessions.session_state
```

No additional Review Drafts were approved or published. No provider credentials were touched. No SQL, seeds, auth users, profiles, or organization memberships were changed.

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

Partially blocked.

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

Blocked:

- Authenticated `POST /api/practice/rounds/custom` with the approved synthetic question returned `500`.
- Dev server log shows:

```text
Error: column practice_sessions.session_state does not exist
```

This is a clean schema/app contract mismatch. Current practice runtime code references columns such as `session_state`, `session_plan`, `session_thread_messages`, and `next_user_notes`, but the clean migrations currently do not provide at least `practice_sessions.session_state`.

Scoped cleanup:

- The smoke used goal `Smoke check synthetic approved question`.
- No scoped practice session rows remained after the failed custom-round attempt.

## Visibility/safety result

Passed with one Practice API blocker noted above.

Verified:

- Draft question count remains non-zero; drafts are not exposed through the public published taxonomy search path.
- The approved synthetic question is visible where expected because it is published and has approved taxonomy assignments.
- Calc packet drafts remain untouched:
  - `calc_3.1_packet.pdf` batches: 2
  - Linked calc packet questions: 41
  - Published calc packet questions: 0
- No extra Review Drafts were approved or published in this task.
- Review Draft governance was not bypassed.

## Tests run

- `npm.cmd run lint` passed.
- `npm.cmd run build` passed.
- `node scripts/security-smoke.mjs` passed.
- `node scripts/supabase-rls-smoke.mjs` passed with network access.
- `node scripts/route-smoke.mjs` passed.
- `npm.cmd run smoke` passed with network access.

## Remaining blockers

Practice custom round execution is blocked by clean Supabase schema drift:

```text
practice_sessions.session_state does not exist
```

This likely requires a narrow clean migration to align `practice_sessions` with the current Practice Agent runtime contract. Based on code inspection, the follow-up should audit/add the full current set of practice runtime columns rather than patching only the first missing column.

## Recommended next task

Create a focused clean Supabase practice schema compatibility PR:

1. Compare `src/lib/practice/persistence.ts` and `src/app/api/practice/*` required columns against `supabase/clean-migrations/0008_practice_agent_evidence.sql` and `0009_course_builder_near_term.sql`.
2. Add a narrow clean migration for missing Practice Agent runtime columns.
3. Apply it only to the disposable clean Supabase project.
4. Re-run this same Question Bank to Practice Agent smoke and exercise `POST /api/practice/rounds/custom` with `AI-F3EBACF3-001`.

## Safety confirmations

- `.env.local` was not modified.
- No env values or secrets were printed.
- No provider credentials were configured or changed.
- No old Supabase project was touched.
- No SQL migrations or seeds were applied.
- No auth users were created.
- No profiles or organization memberships were mutated.
- No additional Review Drafts were approved, rejected, or published.
- No `calc_3.1_packet.pdf` drafts were touched.
- `.codex_tmp/` and `output/` were not committed.
