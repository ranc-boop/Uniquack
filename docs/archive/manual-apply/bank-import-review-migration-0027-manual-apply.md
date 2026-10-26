# Manual Apply: Clean Migration 0027

Apply only this file to the clean Supabase project:

`supabase/clean-migrations/0027_bank_import_review_scope.sql`

Do not run the old migration chain. Do not run seeds. Do not touch provider
credentials.

This migration adds bank scope to imports and Review Drafts, adds private
bank ownership fields to questions, and creates the authenticated
`approve_bank_review_question` RPC. Approval through this RPC adds a reviewed
question to `bank_questions` without setting `questions.status = 'published'`.

After applying, run:

```bash
node scripts/bank-import-review-smoke.mjs
node scripts/supabase-rls-smoke.mjs
```

Expected result:

- teacher owner/editor can create bank-scoped imports
- teacher owner/editor can approve a Review Draft into the selected bank
- `bank_questions` receives the active row
- the question remains non-published and bank-scoped
- unrelated teachers/students cannot read private bank questions

## Post-apply function correction

If the live smoke fails during approval with:

```text
column reference "question_id" is ambiguous
```

the remote project still has the earlier `approve_bank_review_question`
function body. Copy and run only:

`docs/bank-import-review-0027-approve-function-reapply.sql`

That file redefines only the corrected
`public.approve_bank_review_question` function and does not apply the full
migration again.
