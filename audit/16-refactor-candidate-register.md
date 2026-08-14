# Refactor Candidate Register (cleanup-stage handoff)

Every candidate carries: severity, readiness, what must be preserved, and the regression evidence required. IDs cross-reference the stage docs (R/A/Z/C/D/I). Readiness legend: SAFE-CANDIDATE · REQUIRES-REGRESSION-PROOF (RRP) · REQUIRES-MIGRATION (RM) · BLOCKED · PRESERVE.

## Global constraint (applies to every candidate)

**G-0 · Smoke path-pinning (R-02).** 138 scripts pin 371 `src/` paths by literal string (source assertions + dynamic transpile-imports). *Before any file move/rename/split:* generate a pin index (grep `"src/` over `scripts/`), update pinned scripts in the same change, and run the affected smokes. knip output alone is never sufficient evidence of deadness.

## PRESERVE (do not touch during cleanup)

| ID | Item | Why |
|---|---|---|
| P-1 (A-03) | DB approval onion: `*_legacy` → v1 → `*_v2` function chain | v2 delegates internally; app calls v2 only. Flattening = RM + HOSTED PARITY REQUIRED |
| P-2 (A-08) | `runQueuedAIPdfExtraction` / `retryAIPdfImportChunk` compat stubs | Encode negative guarantees (no second worker); smoke-asserted |
| P-3 (I-01) | Worker fencing/checkpoint order; queue error-sniff strings (D-02) | Crash/concurrency semantics; sniff strings are contract |
| P-4 (I-02/I-03) | Admin-vs-teacher upload split; practice-vs-import AI pipelines | Intentional specialization with different quota/concurrency semantics |
| P-5 (A-02) | Separate provider loops in `chat.ts` vs `practice/ai.ts` | Different retry/streaming/tool semantics; shared substrate already factored |
| P-6 (Z-01) | Guard ordering: app mirrors never replace DB checks | Authorization architecture |
| P-7 (Z-05) | `anon` grants on `private.is_question_bank_member` | Load-bearing for anonymous public search |
| P-8 (D-06) | SQL error strings surfaced to UI/smokes | Behavior contract under current harness |
| P-9 (Z-00) | Admin-role vs org-admin split on global library (0077 + `canAccessAdmin`) | **Owner-confirmed intended** for the undeployed version; tracked remaining item |
| P-10 (R-07) | `fixtures/*` golden sets, contract fingerprints, frozen benchmark evidence | Immutable by AGENTS.md |
| P-11 (C-02) | `submit_bank_questions_to_public_review` + `…_for_bank` pair | Intentional dual selection shapes |

## SAFE-CANDIDATE (structural cleanup, low behavioral risk — still run G-0)

| ID | Item | Preserve | Evidence needed |
|---|---|---|---|
| S-1 (R-06) | Delete `src/components/admin-question-edit-details.tsx` (0 refs anywhere) | — | lint+build+`route-smoke` |
| S-2 (R-06) | Remove `deleteQuestion` export (`admin/questions/actions.ts`) | 0070 delete flow | grep form-action refs; admin question smokes |
| S-3 (D-01) | Remove phantom `user_question_attempts` type from `types/database.ts` | — | typecheck |
| S-4 (D-01) | Additively type missing tables (`review_batches`, `review_draft_items`, …) in `types/database.ts` | column nullability must match migrations, not guesses | typecheck + targeted smokes touching typed paths |
| S-5 (R-04/I-04) | Prune zero-reference **exports** (~162) in `ai-pdf-import`/`blueprints` planning modules, module by module | keep exports smokes assert as source text | per-batch: `npm run smoke` subset + G-0 pin sweep |
| S-6 (C-04) | Incremental zod-ification of FormData parsing in teacher bank actions | exact user-facing error strings | action-level smokes asserting messages |
| S-7 (I-02) | Extract *pure* shared upload helpers (path/mime validation) used by both import entries | both entries' authorization/quota flows unchanged | `pdf50-burst-security-smoke`, upload perf smoke |
| S-8 | Delete `src/lib/teacher-assignments.ts:listManagedClassrooms/listAssignablePublishedQuestions` (0 refs; pre-bank-first era) | file itself stays (other exports live) | G-0 sweep + teacher assignment smokes |

## REQUIRES-REGRESSION-PROOF

| ID | Item | Risk | Required proof before change |
|---|---|---|---|
| RR-1 (A-01) | Decompose `ai-pdf-import/service.ts` (6.1k LOC) | stage ordering, failure classification, checkpoint sequence | pdf50 worker checkpoint/fencing/crash smokes green pre+post; G-0 pin updates; ideally a golden-batch replay fixture |
| RR-2 (A-06/Z-02) | Consolidate 3 app-side capability/role mirrors into one module | silent access-surface change in UI | snapshot test of capability-flag matrix (role × scope) pre-change |
| RR-3 (Z-04) | Single-source classroom join-code hashing | all new codes unjoinable on divergence | add TS↔SQL hash-equivalence unit test *first*; full consolidation into DB RPC = RM |
| RR-4 (C-03) | Split giant server-action modules (`teacher/banks/actions.ts`, `admin/imports/pdf/actions.ts`) | form bindings, smoke pins, error copy | route click-through + workflow smokes; G-0 |
| RR-5 (C-01) | Unify `search/count_bank_question_rows` on the v2 variant | row order/count parity with null approval filter | DB-side parity proof; any SQL change = RM |
| RR-6 (Z-03) | Formalize service-role allowlist as lint rule | none (additive) | `security-smoke.mjs` + new rule green |
| RR-7 (D-01) | Full regeneration of `types/database.ts` from a canonical-chain DB | nullability/behavior drift | HOSTED PARITY REQUIRED; regen from embedded-postgres at exact chain instead |
| RR-8 (R-03) | Retire superseded UI files pinned by smokes (`app-primary-nav`, `teacher-dashboard-panels`, classroom assignments actions) | smoke assertions | decide intent, update pinning smokes in same change |

## REQUIRES-MIGRATION (never bundle with code cleanup)

| ID | Item | Notes |
|---|---|---|
| M-1 (D-03) | Consolidate `questions.status` vs `approval_status` | semantic data migration; hosted rows carry legacy states; HOSTED PARITY REQUIRED |
| M-2 (C-census) | Drop zero-reference RPCs (`approve_review_item_to_bank`, `get_admin_ai_pdf_workspace_v1`) | forward-only drop migration; HOSTED PARITY REQUIRED (hosted may have callers/grants) |
| M-3 (A-03) | Any flattening of the DB approval onion | + full library-governance DB smoke suite |
| M-4 (Z-04) | Move classroom code generation into a DB RPC (bank-code pattern) | changes creation path behavior |
| M-5 (D-04) | Any drop of dormant 0004/0005 tables | BLOCKED first (see queue) then RM |

## BLOCKED (need external answer — see resolution queue)

| ID | Item | Blocking question |
|---|---|---|
| B-1 (D-04) | Dormant 0004/0005 table families | hosted row counts + V2 reservation intent (Q-2) |
| B-2 (C-census) | Google-links RPCs + smokes + excluded 0032 | feature parked or dropped (Q-1) |
| B-3 (R-05) | `src/lib` re-foldering | G-0 pin remediation strategy decision (Q-8) |
| B-4 (Z-07) | Guard-helper refactor across "teacher" concepts | product matrix of role semantics (Q-4) |
| B-5 | Script triage (230 scripts → CI-gating / on-demand / historical) | owner designation of must-stay-green set (Q-7) |
| B-6 | Videos + top-level student surfaces + Study Groups UI | product intent (Q-5, Q-6) |
