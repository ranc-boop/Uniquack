# Refactor-Readiness Audit — Authorization Findings (Stage 3)

Baseline: Stage 0 `03-authorization-data-access.md` (still accurate). This stage adds propagation analysis and refactor-risk classification.

## Owner decision applied (2026-08-13)

**Z-00 · Stage-0 P1-1 (platform-admin vs org-admin on the global library) is INTENDED for the current undeployed version.** The `/admin` UI admitting `profiles.role='admin'` while RLS (`questions_staff_access`, 0077) requires org-membership admin is by design; operators are expected to be enrolled org admins. Reclassified from open question → **tracked remaining item**: PRESERVE both layers as-is; re-review only when deployment/onboarding changes who holds the `admin` role. (Carried in the resolution queue as a deferred re-check, not a blocker.)

## Z-01 · Authorization truth lives in the DB; app layers are mirrors — keep the direction

- **Severity:** P1 (refactor risk) · **Readiness:** PRESERVE
- **Observed propagation chain:** middleware path gate → page/action guard (`require*`) → app capability mirror (`canManageBankContent`, `workspace.ts` flags) → RLS policy → `private.*` helper → (for multi-row transitions) SECURITY DEFINER RPC that re-checks internally.
- **Why it matters:** a refactor that *reorders* these (e.g., moving a check from RPC into app code "for reuse") silently converts an enforced boundary into an advisory one. Rule for cleanup: app-side checks may be added/removed freely **only if** the DB-side check they mirror stays; DB-side checks may never be weakened as part of "deduplication".

## Z-02 · Three app-side encodings of bank-role semantics can drift (mirror-consistency risk)

Same evidence as A-06. Additional authorization-specific risk: `bankQuestionWorkspaceCapabilities` hard-codes `canPublishGlobal: false` for bank scopes — the *actual* gate is the DB submission/review chain. If a future change enabled publish UI from capability flags alone, the DB would still block it (safe), but the reverse drift (UI hides an action the DB allows) already silently shapes behavior. Classify: REQUIRES-REGRESSION-PROOF (snapshot the flag matrix before consolidating).

## Z-03 · Service-role discipline is convention, partially smoke-guarded — formalize before cleanup

- **Severity:** P1 · **Readiness:** REQUIRES-REGRESSION-PROOF
- **Evidence:** 9-file service-role allowlist (Stage 0 §3 of authz doc) unchanged. `scripts/security-smoke.mjs` pins some of these files by path/content, but there is no lint rule banning new `createServiceRoleClient` imports.
- **Refactor risk:** moving code between files can silently carry service-role access into a broader module. Any file split/merge touching the 9 files must keep the authorize-then-privileged-step ordering visible and re-run `security-smoke.mjs`.
- **Recommendation (for cleanup stage, not now):** an ESLint no-restricted-imports rule with an explicit allowlist would convert the convention into a machine invariant.

## Z-04 · Hash-based credentials: one cross-language duplicate (classroom), one clean (bank)

Unchanged from Stage 0 (P1-3): classroom join-code normalize+SHA-256 exists in TS (`src/lib/classrooms.ts`, used at creation) and SQL (`private.classroom_join_code_hash`, used at join). Bank share codes are DB-only. **Readiness:** REQUIRES-REGRESSION-PROOF — the clean consolidation is to generate/hash classroom codes DB-side like bank codes, but that is a *behavioral* change to the creation path (RPC needed) → borderline REQUIRES-MIGRATION. Until then: a unit test asserting TS-hash == SQL-hash on sample codes is the cheap guard (currently none found).

## Z-05 · `anon`-granted helpers are intentional and load-bearing

**Observed:** `grant execute on function private.is_question_bank_member(uuid) to anon` (0057) exists so anonymous public-question RLS can evaluate membership (returns false with null uid). A cleanup pass "tightening grants on private schema" would break anonymous public-library search. **PRESERVE**; list of anon-granted private helpers should be captured before any grant hygiene work (HOSTED PARITY REQUIRED to confirm live grants match migrations).

## Z-06 · Route-level gating asymmetry is real but intended surface design

**Observed:** `/questions`, `/videos`, `/practice`, `/mistakes` are outside middleware role gates and self-guard (or serve anon via RLS). Given Z-00's spirit (undeployed version, intended IA), classify as **tracked remaining item** — no change during cleanup; revisit at deployment hardening. The one hard rule: none of these pages may gain mutations without an explicit guard, since middleware won't catch them.

## Z-07 · Multiple sources of truth for "who is a teacher"

- **Severity:** P2 · **Readiness:** BLOCKED (product semantics)
- **Observed:** platform `profiles.role='teacher'`, org `organization_members.role='teacher'`, and per-resource rights (bank owner/editor, classroom teacher/co-teacher) are all called "teacher" in code and docs. DB RPCs vary in which one they check (`create_question_bank` checks profile role ∈ teacher/admin/super_admin + org membership for org visibility; classroom RPCs check org staff helpers).
- **Why it matters:** refactoring guard helpers without a written matrix (which "teacher" concept gates which action) risks widening/narrowing access. Not fixable by code cleanup alone; needs a one-page product matrix first (queued).

## Z-08 · Practice API origin-check asymmetry (Stage 0 P1-8) — unchanged, watch item

No new evidence this stage. Cookie SameSite is the implicit CSRF control on `/api/practice/*` mutations; explicit `resolveTrustedPostOrigin` used only on the two teacher fetch-POST routes. Tracked remaining item for deployment hardening; no cleanup action.
