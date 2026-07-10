# Apply Teacher Feedback Notes Migration 0032

Run only the complete contents of:

```text
supabase/clean-migrations/0032_teacher_feedback_notes.sql
```

in the **clean disposable Supabase project** SQL Editor. Do not run the legacy
migration chain, seeds, or any unrelated clean migration.

## Expected Result

The apply creates `public.teacher_feedback_notes`, its supporting indexes and
updated-at trigger, and scoped helper functions/policies. It does not create
users, provider credentials, bank content, assignments, or feedback rows.

## Verify After Apply

Confirm the following exist:

- `public.teacher_feedback_notes`
- `private.can_manage_teacher_feedback_assignment`
- `private.can_write_teacher_feedback_note`
- `teacher_feedback_notes_teacher_read`
- `teacher_feedback_notes_student_sent_read`
- `teacher_feedback_notes_teacher_insert`

Then run the live validation with the existing ignored disposable credentials:

```powershell
node scripts/teacher-feedback-notes-mvp-smoke.mjs
```

The smoke creates isolated classroom/assignment/note fixtures and removes them
afterwards. It never calls a provider, publishes questions, or assigns source
bank access.
