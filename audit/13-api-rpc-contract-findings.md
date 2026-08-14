# Refactor-Readiness Audit — API / RPC Contract Findings (Stage 4)

Method: full census of all 92 `public.*` functions in `supabase/clean-migrations/` against every `src/`, `scripts/`, `test/` file (word-boundary match, includes dynamic-import consumers knip cannot see). Full table in `appendix-rpc-census.md`.

## Census summary (live-interface classification)

| Class | Count | Examples | Refactor stance |
|---|---|---|---|
| **Live app runtime** (≥1 src caller outside `types/database.ts`) | ~72 | `approve_library_questions_v2`, `create_assignment_from_bank`, `claim_practice_ai_request`, `reserve_ai_pdf_upload_burst`, all `*_fenced` | PRESERVE signatures/semantics |
| **DB-internal only** (0 src callers, called by other DB functions) | ≥3 | `approve_bank_review_question`(s→1 chain), `*_legacy` family (`approve_bank_review_question_legacy`, `create_question_bank_legacy`, `publish_review_draft_questions_legacy`) | PRESERVE — deleting breaks the v2 wrappers (A-03) |
| **Script/ops only** | ~10 | `setup_ai_provider_gateway_token_hash` (ops bootstrap), `get_ai_provider_profile_for_gateway`, `taxonomy_tag_path`, `approve_bank_review_questions` (bulk v1), `publish_review_draft_questions` | PRESERVE while the consuming scripts are canonical; each is queued for intent confirmation |
| **Blocked-feature RPCs** | 5 | `link_google_to_current_profile`, `record_google_signin`, `reject_google_link`, `unlink_google_account` (+ google smokes) | BLOCKED — exists only in the excluded 0032 migration; tied to Stage-0 unknown №1 |
| **Zero references anywhere** | 2 | `approve_review_item_to_bank` (0027-era, superseded), `get_admin_ai_pdf_workspace_v1` (explicitly disabled by 0065) | Candidate for *eventual* DB removal — REQUIRES-MIGRATION + HOSTED PARITY REQUIRED (may be applied and callable on hosted DB) |

## C-01 · Versioned-pair resolution: the app is already consolidated on the newest generation

- **Severity:** resolves a Stage-0 P1 · **Confidence:** high
- **Evidence:** src callers use `approve_library_questions_v2`, `review_public_question_submission_v2`, `search_official_public_questions_v2`, `attach_official_question_revision_assets_v2`, `archive_library_questions_v2` exclusively. The **one true dual-use pair** is `search/count_bank_question_rows` (no approval filter) vs `_v2` (with `p_approval_status`) — both live from `src/lib/question-banks.ts:1590-1618`, selected by filter shape.
- **Consequence:** Stage-0's "both generations live from app code" is narrower than feared. App-side ambiguity is essentially solved; remaining generational complexity is DB-internal (A-03) and script-side.
- **Refactor stance:** the `search/count` pair is a SAFE-CANDIDATE for app-side unification **only** by teaching the v2 function to accept a null approval filter with *proven* identical row ordering/count semantics — that proof is DB work → REQUIRES-REGRESSION-PROOF, and any DB change is REQUIRES-MIGRATION.

## C-02 · Duplicate live RPCs for the same user story: `submit_bank_questions_to_public_review` vs `…_for_bank`

Both called from `src/app/teacher/banks/actions.ts` (different selection shapes: explicit question ids vs whole-bank). Intentional pair per 0076 design; PRESERVE both; document the split at call sites during cleanup.

## C-03 · HTTP surface is stable and small; server actions are the real (unversioned) API

**Observed:** 22 route handlers (inventory in Stage 0 doc 02 §7) + 28 server-action modules. Server actions are invoked positionally by forms — signature changes are invisible to type-checking across the wire and only smoke-covered. Contract drift risk concentrates in the biggest action modules (`teacher/banks/actions.ts` 1,992 LOC, `admin/imports/pdf/actions.ts` 1,888 LOC).
**Refactor stance:** splitting action modules is desirable but every action export name/file is potentially pinned by smokes (R-02) and referenced by `<form action={…}>` closures — REQUIRES-REGRESSION-PROOF with a route-level click-through (`route-smoke.mjs`, relevant workflow smokes).

## C-04 · Validation is inconsistent across the action surface

- **Severity:** P2 · **Readiness:** SAFE-CANDIDATE (incremental)
- **Observed:** admin PDF actions parse inputs with zod schemas (`input: unknown` + `schema.parse`); many teacher bank actions read `FormData` fields with ad-hoc helpers (`plainObject`, `parseCurrentPageUuidSelection`, manual trims); practice API routes use dedicated request-validation modules. Three validation idioms for one tier.
- **Why it matters:** uneven input hardening and triple-maintained parsing helpers. Incremental zod-ification of FormData actions preserves behavior if error strings are kept (some smokes assert exact error messages — verify per action).

## C-05 · Read-model RPC naming (`*_v1`) is a versioned contract; treat suffixes as API

`get_active_taxonomy_catalog_v1`, `list_teacher_question_bank_summaries_v1`, `get_teacher_bank_import_workspace_v1` are live. `get_admin_ai_pdf_workspace_v1` was *disabled* by 0065 (its src caller removed) — the function may still exist hosted. Naming implies more generations will come; cleanup should not "drop the suffix".

## C-06 · `src/types/database.ts` Functions map is a hand-typed subset

Only some RPCs are typed; the rest are called through casts (`as unknown as …Rpc`, `SupabaseQueueClient = any`). See D-01/D-02 in the database findings. Contract drift between SQL signatures and this hand-typed map is not machine-checked anywhere.
