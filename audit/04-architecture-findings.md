# Stage 0 Audit — Architecture Findings

Classification: P0 security/data-integrity · P1 behavior/architecture · P2 maintainability/redundancy · P3 minor.
Nothing here was fixed during Stage 0. Each finding states its evidence type.

## P0 — security / data-integrity

**P0-1. None confirmed.** The authz matrix (CI-gated), RLS smokes, fencing smokes, and private-bucket cutover all hold as of this audit. Items below with security texture are watch items, not confirmed vulnerabilities.

## P1 — behavior / architecture risk

**P1-1. Platform-admin vs org-admin mismatch on the global question library.** *(RESOLVED 2026-08-13: owner confirmed this split is intended for the current undeployed version — reclassified as a tracked remaining item, see `12-authorization-findings.md` Z-00 and the deferred re-checks in `17-resolution-queue.md`.)*
Migration 0077 changed `questions_staff_access` to require `private.is_org_admin(organization_id)` (org-member admin or super_admin). But the `/admin/questions` UI is admitted by `profiles.role ∈ {admin, super_admin}` (`canAccessAdmin`). A platform admin who is **not** an active `organization_members` admin of a question's org can open the admin UI yet get zero rows / silently failing mutations for those questions. Evidence: `supabase/clean-migrations/0077_*.sql`, `0001` (`is_org_admin`), `src/lib/auth/roles.ts`, `src/app/admin/questions/actions.ts`. Whether every intended platform admin is also enrolled as an org admin is a deployment/ops assumption, not enforced by schema.

**P1-2. Dual question lifecycle fields.** `questions.approval_status` (pending|approved, authoritative since 0076) coexists with legacy `questions.status` (draft|review|published|archived|deprecated) and `published_at`. 0076 explicitly says legacy fields are "compatibility". Both are still read/written across the codebase and RPCs (`search_bank_question_rows` vs `_v2` filter on different fields). Any cleanup that consolidates them can change visibility/assignability behavior. *(Observed fact + inference on risk.)*

**P1-3. Duplicated join-code hashing across languages.** Classroom join codes are normalized+SHA-256-hashed in TypeScript at creation (`src/lib/classrooms.ts` → used by `src/app/teacher/classrooms/actions.ts:133`) but verified in SQL at join (`private.classroom_join_code_hash`, 0018). Two implementations of one contract; divergence silently makes all new codes unjoinable. Bank share codes avoid this (generation and hashing both DB-side). *(Observed fact.)*

**P1-4. Two migration chains in-repo.** Canonical `supabase/clean-migrations/` (78 files/77 executable, governance-enforced) vs legacy `supabase/migrations/` (23 files, old project). Governance script + AGENTS.md + memory make the rule explicit, but the legacy chain remains an attractive wrong target for tools/agents (`supabase db` defaults to `supabase/migrations`). *(Observed fact; risk is process, not runtime.)*

**P1-5. Versioned + unversioned RPCs both live.** `search_bank_question_rows`/`_v2`, `count_bank_question_rows`/`_v2` are both called from `src/lib/question-banks.ts` depending on filter shape; `approve_bank_review_question(s)` coexists with `approve_library_questions_v2`; `review_public_question_submission` with `_v2`; read models `*_v1`. Whether the unversioned/older functions are still needed (vs dead) is per-function work; removing the wrong one breaks runtime immediately. *(Observed fact.)*

**P1-6. Docs/spec drift on product state.** `CONTEXT.md` "Known Gaps" still lists "current `/teacher` is not bank-first", "teacher navigation … incomplete", while the repo has a full bank-first teacher tree (`/teacher/banks/**` with review, members, assignments) and reports declaring these shipped. Similarly `docs/security/findings.md` still describes the pre-0077 global-admin orphan policy as current. Future agents reading docs first will mis-model the system. *(Observed discrepancy — recorded, not resolved.)*

**P1-7. Generated DB types lag; queue boundary typed as `any`.** `src/types/database.ts` intentionally trails applied migrations; `src/lib/ai-jobs/queue.ts` casts the Supabase client to `any` for all queue RPCs. RPC signature drift will not be caught at compile time on these paths. *(Observed fact.)*

**P1-8. Practice API POSTs have no explicit origin check.** `/api/practice/*` mutations rely on cookie auth only; `resolveTrustedPostOrigin` is applied only to the two teacher fetch-POST routes. Supabase SSR cookies' SameSite behavior likely mitigates CSRF, but the protection is implicit and asymmetric across the API surface. *(Potential issue; not verified exploitable.)*

## P2 — maintainability / redundancy

**P2-1. Dormant schema families.** Tables from 0004 (`source_files`, `source_pages`, `import_jobs`, `import_job_assets`) and 0005 (`ai_import_jobs`, `ai_import_extractions`, `ai_import_packets`, `ai_import_packet_plans`, `ai_import_preanalysis`, `ai_import_errors`, `ai_import_assets`) have **zero references** in `src/` and `scripts/` (verified by precise grep). The live import pipeline uses `import_batches*` + `ai_provider_jobs` + `question_source_files`. Also unused: `course_plan_sources`; `source_references` is referenced only once (`src/lib/course-builder/assignment-bridge.ts`). Whether these are reserved for AI Parsing V2 or obsolete is unknown (see 06-unknowns). Do not drop during cleanup without confirmation. *(Observed fact.)*

**P2-2. AI Parsing V1 vs V2 parallel structures.** `src/lib/ai-pdf-import/` (~45 modules, live) and `src/lib/ai-pdf-import/v2/` (contracts-only, tests import it directly, no production import — asserted in `docs/architecture/ai-parsing-v2-canonical-data-foundation.md` and consistent with fingerprint smoke). Intentional today, but it doubles the parsing vocabulary a refactor must keep straight. *(Observed fact.)*

**P2-3. Smoke-script sprawl.** ~230 scripts in `scripts/`; CI runs a small subset; `smoke-all.mjs` a larger one; many are one-shot rehearsal/evidence tools (pdf50 apply/repair/gate scripts, hosted-apply scripts). Ownership of "must-stay-green" vs "historical evidence" is undocumented. *(Observed fact.)*

**P2-4. Report/document sprawl with stale content.** 130+ files under `docs/` written per-PR; several contradict the current system (see P1-6). High noise for future automated agents. *(Observed.)*

**P2-5. `user_profiles` view (0001) appears unused by app code.** Grep finds no `src/` references. *(Observed; verify before removal.)*

**P2-6. Videos domain is disconnected from the product spec.** `/videos`, `/admin/videos`, `videos` table (created inside 0009 course-builder migration), taxonomy video tagging in legacy chain — but CONTEXT.md's product model never mentions videos. *(Observed discrepancy.)*

## P3 — minor / cosmetic

**P3-1. Naming drift:** "Question Bank" vs "Library" used interchangeably in code/PRDs/RPC names (`question_banks` tables, "Library Review" strings, `approve_library_questions_v2`).
**P3-2. Duplicate migration number 0032** (feedback-notes vs blocked google-links) is governed but permanently confusing; governance script hard-codes counts (78/77) that must be bumped every migration.
**P3-3. `docs/` contained a stray PDF with mojibake filename (`AP#U5fae…pdf`) — removed in the docs cleanup.**
**P3-4. Root-level `test/` vs `scripts/` split for tests is uneven (5 unit test files vs 230 scripts).**

## Watch items (carried from prior security work)

- **F-001 roles×question-access coupling** — resolved direction now org-scoped (0077); the coupling itself remains: `questions_staff_access`, `private.is_org_admin`, and the role model must change together. CI N10 encodes current intent.
- Service-role discipline: the 9-file allowlist (03 doc §3) is convention, not enforced by lint. `scripts/security-smoke.mjs` covers some invariants; confirm it guards service-role usage before relying on it.
