# Supabase Setup And RLS Testing

This phase verifies real Supabase Auth, RLS, middleware route protection, and the smallest CRUD loop. It intentionally does not cover AI parsing, Storage upload, student submissions, final dashboard polish, or advanced rich text editing.

## Environment Checklist

Create `.env.local` from `.env.example`:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
```

Required Supabase project settings:

- Auth providers: email/password enabled.
- Email confirmation: disabled for the MVP username flow, or test users must be confirmed manually.
- Site URL: `http://127.0.0.1:3000`
- Redirect URLs:
  - `http://127.0.0.1:3000/**`
  - `http://localhost:3000/**`

Username login convention:

- Users type `alice`.
- The app sends `alice@local.app` to Supabase Auth.
- The profile trigger stores `username` as `alice` unless explicit metadata provides another username.

## Apply Database SQL

Run this in the Supabase SQL Editor or through the Supabase CLI:

```bash
supabase db push
```

If applying manually:

1. Open `supabase/migrations/0001_initial_schema.sql`.
2. Run the whole file in the Supabase SQL Editor.
3. Create the first Auth user in Supabase Auth.
4. Edit `supabase/seed.sql`, replacing `REPLACE_WITH_FIRST_ADMIN_USERNAME@local.app`.
5. Run `supabase/seed.sql` to promote the first user to `super_admin`.

## Test Users

Create at least three Auth users:

| Intended role | Login username | Supabase email |
| --- | --- | --- |
| student | `student1` | `student1@local.app` |
| admin | `admin1` | `admin1@local.app` |
| super_admin | `owner1` | `owner1@local.app` |

Use `/admin/users` as `super_admin` or privileged SQL to set roles:

```sql
update public.profiles
set role = 'student'
where email = 'student1@local.app';

update public.profiles
set role = 'admin'
where email = 'admin1@local.app';

update public.profiles
set role = 'super_admin'
where email = 'owner1@local.app';
```

## Role-Based Checklist

### anon

- Visit `/questions` and `/videos` while signed out.
- Confirm only `published` questions/videos/tags are visible.
- Confirm draft/archived content created by admin does not appear.
- Direct Supabase API insert/update/delete into content tables should fail under anon RLS.

### student

- Sign in at `/auth/login` using username `student1`.
- Confirm public pages `/questions` and `/videos` load.
- Visit `/admin`; expected result: redirect to `/unauthorized` or blocked from admin UI.
- Direct Supabase API insert/update/delete into `tags`, `questions`, `videos`, and rubric tables should fail.
- Student answer submission remains out of scope; `user_question_attempts` insert/update should fail in MVP.

### admin

- Sign in as `admin1`.
- Confirm access:
  - `/admin`
  - `/admin/questions`
  - `/admin/tags`
  - `/admin/videos`
- Confirm `/admin/users` is blocked.
- Create a `published` tag.
- Create a `published` question with `difficulty_rating` and bind the tag.
- Create a `published` video bound to that question.
- Confirm `/questions` and `/videos` show the published records.
- Confirm admin cannot update `profiles.role` through direct client access.

### super_admin

- Sign in as `owner1`.
- Confirm all admin routes work.
- Confirm `/admin/users` works.
- Update a user's role in `/admin/users`.
- Confirm the changed role takes effect after that user signs in again or refreshes.

## Direct RLS Smoke Test

After `.env.local` is configured and test accounts exist, run:

```bash
npm run smoke:rls
```

Optional test credentials for the smoke script:

```bash
TEST_STUDENT_USERNAME=
TEST_STUDENT_PASSWORD=
TEST_ADMIN_USERNAME=
TEST_ADMIN_PASSWORD=
TEST_SUPER_ADMIN_USERNAME=
TEST_SUPER_ADMIN_PASSWORD=
```

The script checks direct Supabase API behavior. Middleware route behavior still needs browser/manual route checks because route protection depends on Next.js cookies.
