# NPM Test and Web Rehearsal

## Overview

This document covers the automated NPM smoke tests and manual web browser rehearsal procedures for verifying the O2I platform MVP functionality. It includes environment setup, test account configuration, and comprehensive end-to-end validation of authentication, role-based access control, content management, and security hardening.

## Environment Setup

### Prerequisites

Ensure `.env.local` is configured with valid Supabase credentials:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
```

### Environment Variable Loading Optimization

The smoke test script dynamically resolves the project root directory and `.env.local` path to prevent path offset errors:

```javascript
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, "..");
const envPath = resolve(projectRoot, ".env.local");

dotenv.config({ path: envPath });
```

This configuration ensures the script correctly loads `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` regardless of working directory, resolving the `Error: Missing NEXT_PUBLIC_SUPABASE_URL` issue.

## Test Accounts

Create three test users in Supabase Auth:

| Role | Username | Email |
| --- | --- | --- |
| student | `student` | `student@local.app` |
| admin | `admin` | `admin@local.app` |
| admin (read-only) | `admin2` | `admin2@local.app` |

Set roles via SQL or `/admin/users` as super_admin:

```sql
update public.profiles set role = 'student' where email = 'student@local.app';
update public.profiles set role = 'admin' where email = 'admin@local.app';
update public.profiles set role = 'admin' where email = 'admin2@local.app';
```

Restrict `admin2` access:
- Can access `/admin` and `/admin/tags`, `/admin/questions`, `/admin/videos`
- Cannot access `/admin/users`

## Automated NPM Smoke Tests

### Running RLS Tests

```bash
npm run smoke:rls
```

Provide optional test credentials:

```bash
TEST_STUDENT_USERNAME=student \
TEST_STUDENT_PASSWORD=password \
TEST_ADMIN_USERNAME=admin \
TEST_ADMIN_PASSWORD=password \
TEST_SUPER_ADMIN_USERNAME=super_admin \
TEST_SUPER_ADMIN_PASSWORD=password \
npm run smoke:rls
```

### Test Coverage

The smoke test verifies:
- **Anon**: Only published content visible, no write access
- **Student**: Published content visible, cannot modify content
- **Admin**: Full CRUD on tags, questions, videos, and question images; cannot escalate role
- **Super Admin**: All admin operations + profile role management

## Manual Browser Rehearsal

### 1. Authentication Flow

**Login test sequence:**

1. Open `/auth/login`
2. Log in as `admin`, verify access to `/admin` and `/admin/users`
3. Log out
4. Log in as `admin2`, verify access to `/admin` but denied from `/admin/users`
5. Log out
6. Log in as `student`, verify access denied to `/admin`
7. Log out

### 2. Admin Tags Management

Create test tags:
- `AP Physics` (knowledge, parent: none)
- `AP Physics > Unit 2` (knowledge, parent: AP Physics)
- `Newton's Laws` (knowledge)
- `Tricky` (attribute)
- `High Frequency` (attribute)

**Validations:**
- Knowledge tags can have parent tags
- Attribute tags cannot have parent tags
- Draft/archived tags are not public
- Published tags can bind to questions

### 3. Admin Questions Management

Create and test a question:

**Validations:**
- Create operation succeeds
- Edit operation succeeds
- Empty title validation: shows "请填写该字段" error
- Tag binding: question can bind only one tag
- Tag unbinding: removes tag association
- Difficulty validation: accepts numeric rating
- Draft status: hidden from public `/questions`
- Published status: visible on `/questions` with published tag indicator

### 4. Admin Question Images

Upload images from the question create or edit form.

**Validations:**
- A new question requires code and title before the first image upload.
- First upload automatically saves a draft UUID and keeps the current form open.
- PNG, JPEG, WebP, and GIF images up to 6MB upload successfully.
- SVG, non-image files, and files larger than 6MB are rejected.
- Uploaded images show a preview and a public URL.
- `Copy URL` copies the URL for manual use in HTML.
- `Show on detail` displays the image below the public question body.
- Clicking a displayed public image opens an enlarged dialog.
- `Hide from detail` removes the image from the public question body without deleting it.
- Hidden and draft images use hard-to-guess UUID URLs, but the public bucket still serves a URL if it leaks. Do not use this bucket for confidential material.
- `Delete` removes the Storage object after confirmation.
- Deleting a question removes its managed Storage objects first.
- The first version does not insert URLs into HTML or render an HTML preview in the admin form.

### 5. Admin Videos Management

Create a video bound to a question:

**Validations:**
- Create operation succeeds
- `video_url` and `embed_url` properly stored
- Inherits one question tag (only one)
- Video tags are editable; can add/remove tags independently
- Same question cannot bind second video
- Draft videos do not appear on `/videos`
- Published videos appear on `/videos`

### 6. Public Pages Validation

#### /questions Page

- Displays published questions with:
  - Question title and metadata
  - Bound tag display
  - Difficulty rating
  - Search functionality
  - Tag filter
  - Difficulty filter
- Draft/archived questions hidden
- Published tag indicator visible on each question

#### /videos Page

- Displays published videos with:
  - Video title and metadata
  - Linked question display
  - Inherited tags from question
  - Embed URL rendering
- Draft/archived videos hidden
- Embed URL validation/warning if malformed
- Note: Video playback functionality out of scope for MVP

### 7. Security Hardening

**XSS Prevention Test:**

Attempt injecting into `content_html`:
1. Script payload: `<script>alert('xss')</script>`
2. Onerror payload: `<img src=x onerror="alert('xss')">`
3. JavaScript URL: `<a href="javascript:alert('xss')">click</a>`

**Expected behavior:**
- All payloads render as plain text
- No script execution
- No console errors
- No alert dialogs

**Role-based security:**
- Student cannot access `/admin` routes
- Student cannot create content via UI
- Direct API insert/update/delete fails under RLS for student role

## Next Steps

All MVP features listed above must pass before demo presentation. Future AI features (parsing, rubric, grading) remain out of scope for this rehearsal phase.
