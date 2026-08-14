# Resolution / Verification Queue

External checks and human/product decisions needed before the corresponding cleanup can proceed. Grouped for efficient batch resolution. Inherits unresolved Stage-0 unknowns (dropping those already resolved: legacy-chain scope and P1-1, per owner notes 2026-08-13).

## Group 1 — Product intent (one sitting with the owner)

- **Q-1 · Google account linking**: parked or dropped? Decides fate of excluded `0032_google_account_links.sql`, 5 RPCs, 5 smoke scripts, 2 spec docs. (Stage-0 №1; B-2)
- **Q-4 · "Teacher" role matrix**: one page mapping platform-role vs org-role vs bank-role vs classroom-role to each gated action. Prerequisite for any guard-helper consolidation (Z-07; B-4).
- **Q-5 · Videos domain**: keep / productize / retire. (Stage-0 №6; B-6)
- **Q-6 · Top-level surfaces** (`/practice`, `/mistakes`, `/questions`) vs `/student` workspace, and Study Groups placeholder UI: intended IA or to consolidate. (Stage-0 №5/№7; B-6)
- **Q-9 · `questions.status` end-state**: confirm the two-state `approval_status` is the future and legacy `status` is compatibility-only — sets direction for M-1 planning (no action now).

## Group 2 — HOSTED PARITY REQUIRED (single hosted-DB read-only session)

Verify against the hosted "Current Clean Supabase" project, read-only:

- **H-1**: row counts for dormant families: `source_files`, `source_pages`, `import_jobs`, `import_job_assets`, `ai_import_*` (7 tables), `course_plan_sources`. Empty ⇒ M-5 becomes plannable; non-empty ⇒ data-bearing, PRESERVE.
- **H-2**: applied-migration history parity vs repo chain (registers in `docs/security/migration-application-register.md`); refresh `live-schema-manifest.json` verdict.
- **H-3**: existence/grants of zero-reference functions `approve_review_item_to_bank`, `get_admin_ai_pdf_workspace_v1`, and the `*_legacy` family — confirm no hosted-side callers (pg_stat or grants review) before M-2/M-3 planning.
- **H-4**: live grant list for `private.*` helpers exposed to `anon`/`authenticated` matches migrations (Z-05).
- **H-5**: if/when types regeneration (RR-7) is attempted, generate from an embedded-postgres instance built from the canonical chain — not from hosted — then diff against hosted schema as a parity check.

## Group 3 — Repo-internal verification work (no human decision needed; do before cleanup)

- **V-1**: build the script→pinned-path index (G-0 tooling) and add it under `audit/` or `scripts/lib/`; without it no file move is safe.
- **V-2**: per-module call-set trace of `service.ts` into the planning modules (adaptive-reread, coverage-recovery-merge/runner, blueprint-observation, taxonomy plan modules) to finalize the S-5 prune list.
- **V-3**: TS↔SQL classroom join-code hash equivalence unit test (RR-3 prerequisite).
- **V-4**: capability-flag matrix snapshot test (RR-2 prerequisite).
- **V-5**: confirm `createAssignmentFromBankQuestions` / `submitBankQuestionsToPublicReview` runtime wiring (knip-flagged but script-referenced; likely bound via form actions) before any action-module split (RR-4).

## Group 4 — Owner designations

- **Q-7 · Canonical must-stay-green script list**: which of the ~230 scripts are (a) CI-gating, (b) on-demand release gates, (c) historical evidence. Unlocks B-5 script triage and shrinks G-0's blast radius.
- **Q-8 · Pin-remediation policy**: when a cleanup moves a pinned file, is updating the pinning smoke in the same PR acceptable as sole evidence, or must the smoke's *assertion intent* be re-validated? Sets the bar for B-3/RR-4/RR-8.

## Deferred re-checks (not blocking, calendar-bound)

- **Z-00 / Stage-0 P1-1**: re-review the platform-admin vs org-admin split when the app first deploys or when admin onboarding changes.
- **Z-08**: add explicit origin checks to practice mutations at deployment hardening.
- **F-001 coupling watch** (from `docs/security/findings.md`): re-run authz matrix N10 whenever `questions_staff_access`, `is_org_admin`, or role semantics change. Also: update `docs/security/findings.md` narrative to record the 0077 reversal (doc-only change, allowed anytime).
