# Stage 0 Audit — Current Architecture

Date: 2026-08-13. Branch: `audit/behavior-architecture-baseline` (HEAD a685cf4).
Evidence basis: repository code, `supabase/clean-migrations/`, scripts, CI, docs. Facts below are **observed** unless marked Inference/Unknown.

## Stack (observed)

- Next.js 16.3 (webpack builds), React, TypeScript (~502 files / ~130k LOC under `src/`).
- Supabase: Auth, Postgres (RLS-heavy), Storage, via `@supabase/ssr` + `@supabase/supabase-js`.
- Tailwind + Radix UI + shadcn-style components; KaTeX for math; `sanitize-html`.
- Server-side PDF/visual tooling: `pdfjs-dist`, `@napi-rs/canvas`, `sharp`.
- Zod for validation; `server-only` markers on server libs.
- Tests: `node --test` unit tests (`test/*.mjs`), ~230 smoke/e2e scripts in `scripts/`, GitHub Actions CI (`.github/workflows/ci.yml`), embedded-postgres and local-Supabase test rigs.

## Deployment reality (observed — docs/runbooks/local-ai-jobs-worker.md)

**There is no live deployment.** The Next.js app runs locally; Auth/DB/Storage/AI job queue live in a hosted "Current Clean Supabase" project. A local runner (`npm run worker:dev`, `scripts/local-ai-jobs-worker.mjs`, OS-wide single-runner lock) wakes `POST /api/internal/ai-jobs/run`, which is the canonical worker execution boundary. Vercel is referenced in docs but not required today.

## Request path layers (observed)

1. `middleware.ts` → `src/lib/supabase/middleware.ts:updateSessionAndProtectRoutes`
   - refreshes Supabase session cookies for all matched routes;
   - role-gates `/admin`, `/teacher`, `/student` (plus `/admin/users` → super_admin);
   - **strips** any inbound `AUTH_CONTEXT_HEADER` then injects a verified, URL-encoded JSON auth context (profile row) for downstream reads;
   - applies no-store/noindex headers to "teacher focus" preview routes.
2. Server components (pages) + server actions (28 `"use server"` modules under `src/app/**/actions.ts`) — the main mutation surface.
3. Route handlers (`src/app/api/**`) — practice engine API, question-asset delivery, internal AI worker, teacher previews/focus-selections, published tags.
4. Domain libs (`src/lib/**`) — server-only modules that own queries/RPC calls.
5. Postgres with RLS (288 policies, 29 tables' `enable row level security` statements across the chain) + ~174 functions; `private` schema holds authorization helpers and privileged state; ~95 tables.

Supabase client creation is centralized in `src/lib/supabase/server.ts`: anon-key cookie client (RLS enforced) and `createServiceRoleClient()` (RLS bypass) used in exactly 9 files (see 03-authorization).

## Major domains (observed, with owning code)

| Domain | DB (clean-migrations) | Code |
|---|---|---|
| Identity & orgs | 0001, 0039–0041 (`profiles`, `organizations`, `organization_members`, privileged-field immutability + audit) | `src/lib/auth/*`, `src/app/auth/*`, `src/app/admin/users/*` |
| Taxonomy runtime | 0003, 0056, 0061 (`taxonomy_nodes/edges/facets/aliases/closure`) | `src/lib/tags/*` (runtime snapshot, db, display) |
| Source assets & import batches | 0004 (`import_batches`, `import_batch_items/assets`; also dormant `source_files`, `source_pages`, `import_jobs`) | `src/app/admin/imports/*`, `src/lib/batch-import`, `src/lib/package-import`, `src/lib/bulk-asset-import` |
| AI Parsing V1 (live) | works into `import_batches` + review drafts | `src/lib/ai-pdf-import/*` (~45 modules: preanalysis, segmentation, packets, extraction, coverage recovery, taxonomy tagging, visual evidence) |
| AI Parsing V2 (contracts only) | none (explicitly no schema change) | `src/lib/ai-pdf-import/v2/*`; contracts in `docs/architecture/ai-parsing-v2-*.md`; **no production module imports V2** (stated in doc; consistent with recent commits e03ff33/6bcfb80) |
| AI provider gateway | 0002, 0010–0014, 0035, 0042, 0049 (`ai_provider_profiles`, routing policies, circuit breaker, `private.ai_provider_gateway_token_hashes`) | `src/lib/ai-providers/*` (encryption, routing, resilience, network-safety), `src/app/admin/ai-settings/*` |
| Durable AI job queue | 0033–0038, 0050, 0051 (`ai_provider_jobs`, fencing, checkpoints, burst admission `ai_pdf_upload_bursts`) | `src/lib/ai-jobs/*`, `src/app/api/internal/ai-jobs/run/route.ts`, `scripts/local-ai-jobs-worker.mjs` |
| Review Drafts | 0006, 0016, 0027, 0066, 0071 (`review_batches`, `review_draft_items`, lineage) | `src/app/teacher/banks/actions.ts`, `src/app/admin/review/*`, `src/lib/question-banks.ts` |
| Question Bank / Library | 0025–0029, 0060–0062, 0067, 0070 (`question_banks`, `bank_members`, `bank_questions`, `bank_share_codes`) | `src/lib/question-banks.ts` (1.7k LOC), `src/app/teacher/banks/**` |
| Official Public Library | 0055, 0058, 0076, 0077 (system bank `system_key='official_public'`, `approval_status`, public submissions) | `src/app/admin/questions/*`, `src/app/questions/*`, `src/app/teacher/publish/*` |
| Blueprints | 0007, 0031 (`question_blueprints`, versions, folders, calibration; `bank_blueprints`) | `src/lib/blueprints/*`, `src/lib/teacher-blueprint*.ts`, `src/app/admin/blueprints/*`, `src/app/teacher/blueprints/*` |
| Classrooms | 0018–0020, 0030, 0043, 0044 (`classrooms`, `classroom_members`, hashed `classroom_join_codes`) | `src/lib/classrooms.ts`, `src/lib/teacher-classrooms.ts`, `src/app/teacher/classrooms/**`, `src/app/student/classrooms/**` |
| Assignments & progress | 0021–0024, 0028, 0057, 0059, 0068, 0069 (`assignments`, `assignment_items`, `student_assignment_progress`, idempotency receipts in `private`) | `src/lib/teacher-assignments.ts`, `src/lib/student-work.ts`, assignment actions |
| Practice engine | 0008, 0017, 0047–0049, 0052–0054, 0072–0075 (`practice_sessions/rounds/attempts/…`, admission windows, inflight leases) | `src/lib/practice/*` (~35 modules), `src/app/api/practice/*`, `src/components/practice/*` |
| Teacher insight | 0032 (feedback notes), 0060–0062 read models, focus receipts | `src/lib/teacher-progress.ts`, `teacher-dashboard.ts`, `teacher-feedback-notes.ts`, `teacher-focus-*.ts` |
| Videos | 0009 (`videos` in course-builder migration) | `src/app/videos/*`, `src/app/admin/videos/*` |
| Course Builder | 0009 (`course_generation_runs`, `course_plan_sources`) | `src/app/teacher/course-builder/*`, `src/lib/course-builder/assignment-bridge.ts` (thin) |

## Migration chains (observed)

- **Canonical:** `supabase/clean-migrations/` — 78 SQL files, **77 executable**; `0032_google_account_links.sql` is a deliberately blocked duplicate number (governance asserts it fails closed). Forward-only corrections (e.g. 0077 supersedes part of a 0045-era policy).
- **Legacy:** `supabase/migrations/` — 23 files from the old project; not referenced by canonical tooling. AGENTS.md forbids touching it.
- CI (`quality` job) enforces the plan via `scripts/canonical-migration-governance-smoke.mjs` (asserts exact counts 78/77 and the blocked file).
- Seeds: `supabase/clean-seeds/` (local bootstrap org, taxonomy, demo content); `supabase/development/` holds dev-only reset scripts.

## Data-flow summary (observed core loop)

```text
Teacher uploads PDF (burst reservation → 'ai-import-sources' storage, reserved paths)
  → enqueue_ai_provider_job (durable queue, idempotency key)
  → local runner wakes /api/internal/ai-jobs/run (AI_JOBS_INTERNAL_TOKEN)
  → worker claims jobs (lease + fencing), calls provider (Gemini adapters), checkpoints
  → persists import_batches / items → review_batches / review_draft_items (bank-scoped)
  → teacher reviews/edits/approves → approve_* RPCs enforce lineage → questions + bank_questions (approval_status)
  → teacher creates assignment from bank (idempotent RPC, readiness gates)
  → student My Work → practice session (assignment_practice_sessions linkage)
  → practice rounds/attempts + AI grade/hint/review (admission + leases)
  → evidence → teacher progress/feedback
```

Separately: official public library (system bank) ← submissions from banks, reviewed by admins; students/teachers can search public questions (incl. anonymously per 0058) and pull them into banks.

## Boundaries that folder names do NOT reflect (inference, from traced code)

- `src/lib/question-banks.ts`, `src/app/teacher/banks/actions.ts` (~2k LOC) and `src/lib/teacher-assignments.ts` are the real "core domain" modules; route folders are thin.
- The AI import pipeline's authoritative state machine lives in SQL RPCs (`*_fenced` functions, checkpoints) more than in `worker.ts`.
- The generated `src/types/database.ts` deliberately lags the migration chain; queue RPC calls are cast to `any` at the boundary (`src/lib/ai-jobs/queue.ts`).
