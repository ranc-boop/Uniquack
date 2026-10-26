# Uniquack

A learning platform built for the AI era: teachers and students work from the same reviewed question banks, and what happens in class and in self-study turns into learning evidence. Website: [uniquack.com](https://uniquack.com/).

## What it does

```text
PDF or owned material -> AI Parsing -> Review Draft -> Teacher approval
  -> Question Bank -> Assignment -> Practice -> Evidence -> Next move
```

- **Teachers:** turn their own materials into reviewed question banks, build blueprints, assign selected bank content, and see class patterns.
- **Students:** do assigned work, practice on their own, and keep a mistake book and study library.
- **Safety rules:** AI output never publishes itself, and no draft reaches students before a teacher approves it. Private content stays private by default.


## Stack

| Area | Choice |
|---|---|
| Language | TypeScript (app), Node.js `.mjs` (scripts), SQL (Postgres migrations) |
| Framework | Next.js 16 (App Router, webpack build), React |
| UI | Tailwind CSS 3, Radix UI, shadcn-style components, KaTeX for math |
| Backend | Supabase: Postgres with RLS, Auth, Storage |
| Validation | zod |
| PDF and images | pdfjs-dist, sharp, @napi-rs/canvas |
| AI | Provider adapters behind a server-side gateway (Gemini and DeepSeek among them), durable job queue with a local worker |
| Tests | Node test runner, `scripts/*-smoke.mjs` smokes, embedded Postgres, Playwright, knip, ESLint |
| Structure | Bank-first: banks hold content, classrooms hold rosters, assignments are deliveries (see the maps below) |

The in-repo docs and guardrails still use the working name EduStruct.

## Read first

| File | Why |
|---|---|
| [AGENTS.md](AGENTS.md) | Guardrails: workflow, role boundaries, review gates, migration safety, PR and test expectations |
| [CONTEXT.md](CONTEXT.md) | Product identity and bank-first model |
| [DESIGN.md](DESIGN.md) | UI design rules |
| [audit/README.md](audit/README.md) | Behavior baseline: architecture, contracts, authz, invariants, refactor register |
| [docs/README.md](docs/README.md) | Index of product and ops docs |

## Repository map

| Path | What lives there |
|---|---|
| `src/` | Application code (map below) |
| `supabase/clean-migrations/` | The canonical migration chain (`0001`–`0077`). Always use this, never `supabase/migrations/`. Fix applied migrations forward-only. |
| `supabase/clean-seeds/`, `supabase/seed.sql` | Seed data |
| `scripts/` | Node smoke tests, gates, evidence runners, operations scripts (`smoke-all.mjs` is the `npm run smoke` entry) |
| `test/` | Unit tests run with `npm test` (`test:core` for the core subset) |
| `fixtures/` | Golden sets and benchmark evidence for AI parsing. Treat as immutable. |
| `docs/` | Product docs, runbooks, security evidence; `docs/archive/` holds historical reports |
| `audit/` | Stage 0 and refactor-readiness audit |
| `.github/workflows/ci.yml` | CI: lint, typecheck, migration governance, security and route source smokes, embedded-DB smokes |

## `src/` map

```text
src/
  app/            Next.js routes
    admin/          platform operations: AI settings, imports, review, questions, tags, users, videos, blueprints
    teacher/        banks, ai-parsing, ai-jobs, blueprints, classrooms, course-builder, progress, publish
    student/        work, classrooms, groups, library, public-library, progress
    practice/       practice sessions
    mistakes/       wrong-question review
    questions/      public question browsing
    videos/         video pages
    auth/           login and auth actions
    api/            route handlers: admin/imports, internal/ai-jobs, practice/*, question-assets, tags, teacher
    i18n/           cookie-based locale switching
    local-test/     local-only test pages
  components/     UI. Feature folders (admin, ai-jobs, ai-pdf-dashboard, blueprints, practice, question-editor,
                  questions, review, student, tags, teacher, ui, i18n) plus shared files in the root
  lib/            Domain and server logic
    auth/           guards, roles, request context
    supabase/       client, server, middleware, config
    ai-providers/   provider adapters, routing, profiles, resilience, JSON repair
    ai-pdf-import/  PDF parsing pipeline: planning, packets, tagging, taxonomy, review drafts (service.ts is the orchestrator)
    ai-jobs/        durable job queue, worker, checkpoint fencing
    ai-operations/  cost catalog and usage accounting
    practice/       practice agent, grading, prompts, persistence
    blueprints/     question blueprint library and review
    batch-import/, bulk-asset-import/, package-import/, import-json/   other import paths
    questions/, tags/, storage/, sanitize/, markdown-latex/, html/, validations/   shared content helpers
    classrooms.ts, teacher-*.ts, student-work.ts, question-banks.ts    bank, classroom and assignment logic
  types/          database.ts (hand-written Supabase types) and shared types
middleware.ts     session refresh and route protection
```

## Where to look for a task

| Task | Start at |
|---|---|
| Teacher bank, import, review draft | `src/app/teacher/banks/`, `src/lib/question-banks.ts` |
| AI PDF import pipeline | `src/lib/ai-pdf-import/service.ts`, `src/lib/ai-jobs/worker.ts`, `scripts/local-ai-jobs-worker.mjs` |
| Assignment from a bank | `src/lib/teacher-assignments.ts`, `src/app/teacher/classrooms/` |
| Student practice and evidence | `src/lib/practice/`, `src/app/api/practice/`, `src/app/student/work/` |
| Authorization | `src/lib/auth/`, RLS in `supabase/clean-migrations/`, `docs/security/` |
| A database change | New forward-only file in `supabase/clean-migrations/`; read `docs/security/migration-release-process.md` first |

## Run

```bash
npm install
cp .env.example .env.local   # fill in Supabase URL and keys; never commit it
npm run dev                  # app
npm run worker:dev           # local AI jobs worker (see docs/runbooks/local-ai-jobs-worker.md)
```

## Check

```bash
npm run lint
npm run typecheck
npm run build
node scripts/security-smoke.mjs
node scripts/route-smoke.mjs
npm run smoke
npm run perf:budget
```

Some smokes need a configured Supabase project or an embedded Postgres, and fail without them. Run a script on its own to see which. Many smokes assert `src/` source text and read files under `docs/` by literal path, so grep `scripts/` before moving or renaming a file. 