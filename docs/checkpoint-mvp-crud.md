# MVP CRUD Checkpoint

Date: 2026-05-30

## Stable State

- Next.js App Router, TypeScript, Tailwind, shadcn/ui, and Supabase are initialized.
- Supabase schema and RLS are applied for profiles, tags, questions, videos, join tables, rubric steps, and Phase 2 attempts.
- RLS helper functions live in the private schema and are referenced with `(select private.*())` in policies.
- Public routes only render published questions, videos, and tags.
- Public routes include simple search, tag, and difficulty filters.
- Admin routes are protected by middleware and server-side role guards.
- Admin CRUD exists for tags, questions, and videos.
- Admin pages include basic success/error feedback, pending buttons, empty states, and delete confirmation.
- Admin dashboard includes an authenticated admin-only demo seed action that writes through normal RLS.
- Super admin user role management skeleton exists.
- Content HTML is sanitized before saving and before `dangerouslySetInnerHTML`.
- Tiptap dependency uses `@tiptap/extension-mathematics` with `katex`.
- Notifications use `sonner`.

## Project Hygiene

- `.env.local` is ignored by `.gitignore` through `.env*.local`.
- `.env.example` contains only empty placeholder variable names.
- No service role key is required or used by the app.
- This workspace is not currently a Git repository, and `git` is not available on PATH, so no commit checkpoint could be created here.

## Commands Passed

- `npm run lint`
- `npm run build`
- `npm run smoke`
- `npm run smoke:rls`
- `node scripts/route-smoke.mjs`

## Verified Behavior

- Signed-out users are redirected from `/admin` to `/auth/login`.
- Students can use public pages but are blocked from `/admin/*`.
- Admins can access `/admin`, `/admin/questions`, `/admin/tags`, and `/admin/videos`.
- Admins are blocked from `/admin/users`.
- Super admins can access `/admin/users`.
- Anon and student sessions only read published public records.
- Admin sessions can create/update/delete questions, videos, tags, and tag bindings through RLS.
- Students cannot create/update/delete questions, videos, or tag bindings.
- Sanitizer smoke checks remove script tags, event handlers, and `javascript:` URLs.
- Route smoke checks verify homepage, public filters, admin redirects, and role access.

## Known Issues

- Browser automation was unavailable in this session, so route checks used local HTTP requests with Supabase auth cookies.
- Production build uses `next build --webpack` because Turbopack can hit Windows `Access is denied` process-spawn failures in this environment.
- UI is intentionally demo-ready but not final branded polish.
- AI parsing, Supabase Storage upload, student answer submission, and advanced rich text editing remain out of scope.
