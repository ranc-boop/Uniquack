# Refactor-Readiness Audit — Repository & Dependency Findings (Stage 1)

Date: 2026-08-13. Extends Stage 0 (`01-current-architecture.md`). Evidence: knip run (`npm run deadcode:audit`), an in-memory symbol census over `src/` + `scripts/` + `test/` (92 RPCs, 229 knip-flagged exports), and targeted import tracing.

Per project owner note (2026-08-13): schema/contract comparisons use **`supabase/clean-migrations/` only**; the legacy `supabase/migrations/` chain is out of comparison scope and is treated as frozen history.

## R-01 · Dependency direction is clean — PRESERVE the layering

**Observed:** zero `src/lib → src/app` imports; 13 components import server actions from `src/app` (normal Next.js wiring); `src/lib` modules import only sideways/down. The codebase has a real layering rule despite its size.
**Why it matters:** refactors can rely on `lib` being app-independent; anything that introduces `lib → app` imports is a regression.

## R-02 · Smoke scripts hard-pin source file paths and contents — the #1 structural refactor blocker

- **Severity:** P1 · **Confidence:** high · **Readiness:** BLOCKED (as a global constraint), per-file REQUIRES-REGRESSION-PROOF
- **Evidence:** 138 of ~230 scripts reference literal `"src/…"` paths (371 distinct paths). Two consumption modes: (a) **source-text assertions** — e.g. `scripts/security-smoke.mjs:228` reads `src/app/teacher/classrooms/[id]/assignments/actions.ts` and asserts content; `scripts/durable-ai-job-queue-smoke.mjs:293` asserts what a specific function body does *not* contain; (b) **transpile-imports** — scripts use the `typescript` package + dynamic `import(url)` to load `src/**/*.ts` modules (e.g. `scripts/lib/ai-parsing-v2-fixtures.mjs` imports `src/lib/ai-pdf-import/v2/*.ts`).
- **Current behavior:** any rename, move, split, or content change of a pinned file can break an unpredictable set of smokes; conversely, smokes keep "dead" files alive (see R-03).
- **Why it matters:** this inverts the usual safety relationship — the test harness itself is the tightest coupling in the repo. A cleanup stage must treat the script suite as a dependent, not just a verifier.
- **Refactor note:** before any file reorganization, build a path-pin index (script → pinned paths) and update scripts atomically with moves. Static tools (knip) cannot see the dynamic `import(url)` loads — never trust knip alone here.

## R-03 · knip "unused files" are pinned by smokes, not deletable

- **Severity:** P2 · **Readiness:** BLOCKED pending intent decision per file
- **Evidence:** knip reports 4 unused files. All but one are referenced by scripts as source-assertion targets: `src/app/teacher/classrooms/[id]/assignments/actions.ts` (129 LOC; pinned by `security-smoke.mjs` + `classroom-operations-smoke.mjs`), `src/components/app-primary-nav.tsx` (pinned by 2 perf smokes), `src/components/teacher/teacher-dashboard-panels.tsx` (pinned by progress-evidence smoke). `src/components/admin-question-edit-details.tsx` (60 LOC) has **no references anywhere** — the only genuinely orphaned file found.
- **Classification:** `admin-question-edit-details.tsx` = potentially consolidatable (SAFE-CANDIDATE after a UI check); the other three = historically duplicated / superseded UI kept alive by smoke pinning — decide together with the pinning scripts.

## R-04 · Unused-export census: 229 flagged, 67 script-consumed, ~162 with zero references

- **Severity:** P2 · **Readiness:** mixed (see register)
- **Evidence:** cross-check of every knip-flagged export against `scripts/` + `test/` by word-boundary search (results: `knip-crosscheck` census). 67 exports are consumed only by smoke scripts (invisible to knip). The ~162 zero-reference exports cluster heavily in `src/lib/ai-pdf-import/*` planning modules (`adaptive-reread*`, `coverage-recovery*`, `blueprint-observation*`, `taxonomy-{bootstrap,persistence,review}`, `display`, `chunking`, `packets`, `provider-runner`) plus `src/lib/blueprints/*`.
- **Important nuance:** these are unused **exports**, not unused modules — every one of those modules is imported by `src/lib/ai-pdf-import/service.ts` (verified), so the files are live; only part of their export surface is dead. Several modules read like design-documents-as-code ("plan paths", `*_PROMPT_CONTRACT`, `*_BASE_WARNINGS`) — apparently authored for planned features that were partially wired.
- **Classification:** historically duplicated / speculative surface. Export-level pruning is low-risk *except* that smokes may assert export names in source text (mode (a) of R-02) — each pruning batch needs a smoke sweep.

## R-05 · `src/lib` root is a flat mix of module styles

- **Severity:** P3 · **Readiness:** BLOCKED by R-02 (moves break pins)
- **Observed:** 14 flat `teacher-*.ts` files coexist with folder domains (`practice/`, `questions/`, `blueprints/`, `ai-pdf-import/`). Ownership is discoverable but inconsistent; `classrooms.ts` (join-code utils + org resolution) vs `teacher-classrooms.ts` (read models) is complementary, not duplicated (verified exports).
- **Why it matters:** cosmetic, but it is exactly the ambiguity that misroutes future agents ("where does teacher assignment logic live?" — answer: `teacher-assignments.ts` for read models, `classrooms/[id]/assignments/actions.ts` + `create_assignment_from_bank` RPC for writes).

## R-06 · Genuinely orphaned application surface (small)

- `src/app/admin/questions/actions.ts: deleteQuestion` — zero refs anywhere (superseded by 0070 delete flow). SAFE-CANDIDATE (verify no form posts by name).
- `src/components/admin-question-edit-details.tsx` — zero refs (R-03).
- `src/lib/teacher-assignments.ts: listManagedClassrooms, listAssignablePublishedQuestions` — zero refs; look like the pre-bank-first assignment path's read models. Historically duplicated; SAFE-CANDIDATE after confirming no smoke pins.
- `createAssignmentFromBankQuestions` + `submitBankQuestionsToPublicReview` exports in `src/app/teacher/banks/actions.ts` flagged unused by knip but **are** referenced by scripts — REQUIRES-REGRESSION-PROOF, likely wired via non-static form action references. Verify with runtime trace before touching.

## R-07 · `fixtures/` and `docs/` are load-bearing for the AI-parsing eval harness — PRESERVE

**Observed:** `fixtures/ai-parsing-golden`, `fixtures/ai-parsing-provider-benchmark-v1`, and `docs/architecture/ai-parsing-contract-fingerprints.json` are read by eval/fingerprint scripts (`scripts/ai-parsing-eval/*`, `ai-parsing-v2-foundation-fingerprint-smoke.mjs`). Treat frozen benchmark evidence as immutable (also an AGENTS.md rule).
