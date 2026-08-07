# Authorization Matrix Security Test Design

> **Status:** APPROVED FOR EXECUTION — signed Frances, 2026-08-06 (local disposable target only)
> **Repo:** `1650512585qq-collab/o2iinstitute`  ·  **Stack:** TypeScript / JavaScript (Next.js + Supabase) / PL/pgSQL (RLS)
> **Pipeline idiom (`reverse-skill-main`):** `scope gate → case-init → routing → evidence schema → finding taxonomy`
> **Prime directive:** No ACT step runs until the Scope Gate below is signed. This document is the artifact to be reviewed/approved. It contains no exploit payloads and prescribes no active scanning or bulk requests.

---

## 1. One-Page Executive Design Summary

**Objective.** Verify that every `(role × resource × action)` triple in the o2i platform is enforced consistently across all three authorization layers — Next.js middleware, server-side service guards, and Supabase Row-Level Security (RLS) — and that no layer can be bypassed by manipulating **owner**, **tenant (organization)**, or **resource state**.

**Why this shape.** The codebase enforces authorization at three independent layers that must agree:

| Layer | Mechanism (observed, static read) | Failure it catches |
|-------|-----------------------------------|--------------------|
| Middleware | `middleware.ts` → `updateSessionAndProtectRoutes`; forwarded `AUTH_CONTEXT_HEADER` | Route reachable while unauthenticated / wrong role |
| Service | `src/lib/auth/guards.ts` (`requireAdmin/Teacher/Student/SuperAdmin`), `roles.ts` | Handler runs business logic without a role check |
| SQL / RLS | `supabase/clean-migrations/*.sql` (`organization_id`, `owner_id`, `owner_scope`, status checks) | Row returned/mutated across owner or tenant boundary |

A defect at any single layer, or a **disagreement between layers**, is a finding. The test strategy is therefore organized around three mutation axes — **owner**, **tenant**, **state** — because those are the three boundary columns the schema actually encodes (`owner_id`/`created_by`, `organization_id`, and the `status`/`approval_status` state machines).

**Roles under test.** `anonymous`, `student`, `teacher`, `admin`. Note: code distinguishes `admin` from `super_admin`; `super_admin` is the only role with user-management authority (`canManageUsers`). The matrix folds `super_admin` into `admin` with an explicit carve-out row.

**Design phase scope.** This document delivers: (A) Scope Gate, (B) Authorization Matrix, (C) Test-Case Strategy, (D) Evidence Schema, (E) Fix Design Template — plus a matrix draft table and a pre-execution checklist. **No requests are sent. No data is read from a live system. Execution is a separate, separately-approved phase.**

**Approval required before execution.** Sign-off on §2 (Scope Gate) and the §9 checklist gates the transition from DESIGN to ACT.

---

## 2. (A) Scope Gate

*Equivalent to `case-init.ps1 → work/<case>/scope.md` — no ACT until granted.*

### 2.1 In-scope assets / modules / endpoints

**Authorization surfaces (static-review + later dynamic verification):**
- `middleware.ts` and `src/lib/supabase/middleware.ts` — route protection & session refresh
- `src/lib/auth/roles.ts`, `src/lib/auth/guards.ts`, `src/lib/auth/request-context.ts` — role predicates and guards
- API route handlers under `src/app/api/**/route.ts`, in these families:
  - `api/practice/*` — sessions, grade, hint, review, recommend, sources, wrong-questions, progress/reset, assignments/start, preferences
  - `api/teacher/*` — banks/previews, focus-selections
  - `api/admin/*` — imports/pdf/segment-preview
  - `api/question-assets/[assetId]`, `api/tags/published`
  - `api/internal/ai-jobs/run` — internal job runner (trust-boundary review only; see out-of-scope)
- Supabase RLS policies in `supabase/clean-migrations/*.sql` and `supabase/migrations/*.sql` (read-only static review of policy text)

**Resource tables in scope:** `question_banks`, `bank_questions`, `questions`, `review_batches`, `review_draft_items`, `review_actions`, `review_source_references`, `assignments`, practice sessions/answers, `source_assets` / import jobs, `source_references`, `profiles`, `organizations`, official public library (`system_key = 'official_public'`).

### 2.2 Role set

| Role | Guard predicate | Intended authority |
|------|-----------------|--------------------|
| `anonymous` | none (pre-auth) | Public reads only (e.g. `tags/published`, published library) |
| `student` | `requireStudent` / `canAccessStudent` | Own practice sessions, submissions, own profile; consume assigned content |
| `teacher` | `requireTeacher` / `canAccessTeacher` | Own/org banks & questions, review drafts, assignments; publish within scope |
| `admin` | `requireAdmin` / `canAccessAdmin` | Org-wide management; import workspaces; read-only student workspace entry |
| *(carve-out)* `super_admin` | `requireSuperAdmin` / `canManageUsers` | User management only — modeled as an `admin`+ row |

### 2.3 Out-of-scope & prohibited actions

**Prohibited during any phase (design or execution):**
- **Production writes** of any kind. Testing targets a dedicated, seeded, non-production Supabase project/branch only.
- **Destructive operations** — no `DELETE`/`TRUNCATE`/`DROP`, no cascade triggers exercised against shared data, no queue/job draining, no state-machine transitions that cannot be rolled back on the test project.
- **Non-masked sensitive exports** — no export or persistence of real PII, credentials, tokens, or answer keys. Evidence stores **hashes**, never raw payloads (see §5).
- **Bulk / high-volume requests** — no fuzzing, no enumeration sweeps, no load. One deterministic request per test case.
- **Bot-detection / CAPTCHA bypass, credential entry, account creation** — excluded by policy.
- `api/internal/ai-jobs/run` and any service-role / internal trust boundary — **static review only**; no crafted invocation.
- **Auth secrets & tokens** — the `AUTH_CONTEXT_HEADER` forwarding trust boundary is reviewed by reading code; no forged-header traffic is generated in the design phase.

**Out-of-scope assets:** third-party providers (AI model vendors), Supabase platform internals, CI/CD infrastructure, anything outside the o2i repo and its dedicated test project.

---

## 3. (B) Authorization Matrix Design

### 3.1 Resource inventory

| # | Resource | Ownership columns (observed) | Tenant column |
|---|----------|------------------------------|---------------|
| R1 | official-public-library | `owner_scope='system'`, `system_key='official_public'` | none (global) |
| R2 | question-bank | `owner_id`, `owner_scope` (user/org/system) | `organization_id` |
| R3 | question | `created_by`, `approval_status`, `status` | `organization_id` |
| R4 | review-draft (batch/item) | `created_by`, `reviewer_id`, `status` | `organization_id` |
| R5 | assignment | teacher owner / assigned-to | `organization_id` |
| R6 | submission (practice session/answers) | `user_id` | `organization_id` |
| R7 | user-profile | `id` (self) | `default_organization_id` |
| R8 | organization (tenant) | membership | self |
| R9 | source-asset / import job | `created_by` | `organization_id` |

### 3.2 Action inventory

`create` · `read` · `update` · `delete` · `approve` · `publish` · `share` · `assign`

- `approve` / `publish` map to the two-state approval flow (`review_draft_items.status`, `questions.approval_status: pending → published`).
- `assign` / `share` map to assignments and library visibility (`visibility='public'`).
- `delete` is **allow/deny modeled only** — never executed against shared or production data (see §2.3).

### 3.3 Role → Resource → Action draft matrix

Legend: `✓` allow · `✗` deny · `Δ` conditional (own-scope / own-tenant only) · `—` not applicable

| Resource \ (Role·Action) | anon C/R/U/D | student C/R/U/D | teacher C/R/U/D | teacher approve/publish/share/assign | admin C/R/U/D | admin approve/publish/share/assign |
|---|---|---|---|---|---|---|
| R1 official-public-library | ✗/✓/✗/✗ | ✗/✓/✗/✗ | ✗/✓/✗/✗ | ✗/✗/✗/✗ | Δ/✓/Δ/✗ | ✓/✓/✗/✓ |
| R2 question-bank | ✗/✗/✗/✗ | ✗/Δ/✗/✗ | Δ/Δ/Δ/Δ | —/Δ/Δ/— | Δ/✓/Δ/Δ | Δ/✓/Δ/Δ |
| R3 question | ✗/Δ*/✗/✗ | ✗/Δ*/✗/✗ | Δ/Δ/Δ/Δ | Δ/Δ/Δ/— | Δ/✓/Δ/Δ | ✓/✓/Δ/✓ |
| R4 review-draft | ✗/✗/✗/✗ | ✗/✗/✗/✗ | Δ/Δ/Δ/Δ | Δ/Δ/—/— | Δ/✓/Δ/Δ | ✓/✓/—/— |
| R5 assignment | ✗/✗/✗/✗ | ✗/Δ/✗/✗ | Δ/Δ/Δ/Δ | —/—/Δ/Δ | Δ/✓/Δ/Δ | —/—/✓/✓ |
| R6 submission | ✗/✗/✗/✗ | Δ/Δ/Δ/✗ | ✗/Δ/✗/✗ | —/—/—/— | ✗/✓/✗/✗ | —/—/—/— |
| R7 user-profile | ✗/✗/✗/✗ | ✗/Δ/Δ/✗ | ✗/Δ/Δ/✗ | —/—/—/— | ✗/✓/Δ/✗ | —/—/—/— |
| R8 organization | ✗/✗/✗/✗ | ✗/Δ/✗/✗ | ✗/Δ/✗/✗ | —/—/—/— | ✗/Δ/Δ/✗ | —/—/—/— |
| R9 source-asset / import | ✗/✗/✗/✗ | ✗/✗/✗/✗ | Δ/Δ/Δ/Δ | —/—/—/— | Δ/✓/Δ/Δ | —/—/—/— |

`Δ*` = only questions in `published`/public state. **User management (R7 create/delete, role changes)** is a `super_admin`-only carve-out — expected DENY for plain `admin`.

> This matrix is a **hypothesis derived from static reading of guards + RLS**. Each cell becomes an expected-outcome oracle in §4; execution confirms or refutes it. Cells marked `Δ` are the highest-value test targets because they depend on runtime owner/tenant checks rather than static role checks.

---

## 4. (C) Test-Case Strategy (strategy only — no cases executed)

*Equivalent to `routing.md`: classify each candidate into exactly one mutation family, attach the expected rejection oracle, then queue for approval.*

Every test is a single deterministic request that takes a **legitimately authorized baseline request** and mutates exactly one boundary field, then asserts the expected rejection.

### 4.1 Category 1 — Owner mutation (IDOR / BOLA)
- **Definition:** Authenticated as actor A, target a resource owned by actor B **within the same tenant**. Mutate only the object identifier (`owner_id`/`user_id`/`created_by` target).
- **Applies to:** R2, R3, R4, R5, R6, R7, R9.
- **Expected rejection semantics:**
  - Read of another owner's private resource → **404** (preferred, avoids existence disclosure) or **403**.
  - Update/delete/approve of another owner's resource → **403**, or business denial code (e.g. `not_owner` / `forbidden`) with no state change.
  - RLS must independently return **zero rows** for the mutation even if a guard is bypassed.

### 4.2 Category 2 — Tenant mutation (cross-organization)
- **Definition:** Authenticated in tenant T1, target a resource in tenant T2 by mutating only `organization_id` scope.
- **Applies to:** every org-scoped resource (R2–R6, R9); R1 (system/global) is the control.
- **Expected rejection semantics:**
  - Cross-tenant read → **404 / empty result set**; never partial cross-tenant data.
  - Cross-tenant write/approve/assign/publish → **403** or business denial; RLS returns zero affected rows.
  - Special check: `owner_scope='system'` (official public library) must **not** be writable by tenant admins except through the sanctioned approval path.

### 4.3 Category 3 — State mutation (broken state machine / workflow bypass)
- **Definition:** Attempt a transition that skips required states or is not permitted for the role, against a resource the actor legitimately owns. Mutate only the target `status` / `approval_status`.
- **State machines (observed):**
  - review: `pending_review → in_review → approved | partial | rejected | archived`
  - question: `draft → review → published → archived → deprecated`
  - approval: `pending → published`
- **Expected rejection semantics:**
  - Illegal transition (e.g. `draft → published` skipping review; self-approval where separation is required) → **409 Conflict** or business denial code (e.g. `invalid_transition`), no persisted change.
  - Role-forbidden transition (e.g. student triggering `approve`) → **403**.
  - Publishing to the public library without passing two-state approval → business denial; verify DB constraint (`questions_approval_status_check`, `question_banks_system_ownership_check`) also rejects.

### 4.4 Expected-rejection code map

| Situation | Preferred code | Acceptable alternative |
|-----------|----------------|------------------------|
| Unauthenticated | 401 | redirect to `/auth/login` (page routes) |
| Authenticated, role/ownership forbidden | 403 | business denial JSON (`forbidden`/`not_owner`) |
| Existence must not be disclosed | 404 | 403 |
| Illegal state transition | 409 | business denial (`invalid_transition`) |
| RLS backstop (any of the above) | 0 rows affected / empty set | — |

Each executed case must satisfy **both** the HTTP-level oracle **and** the RLS backstop (defense-in-depth): a 403 at the service layer with rows still mutated by a service-role client is itself a finding.

---

## 5. (D) Evidence Schema

*Equivalent to `Evidence → Finding → Path`. Evidence is captured per test; raw sensitive content is never stored — only hashes.*

### 5.1 Minimum fields per test record

| Field | Type | Notes |
|-------|------|-------|
| `case_id` | string | Stable ID: `<category>-<resource>-<role>-<nnn>` |
| `actor` | string | Role + synthetic test-account id (no real user) |
| `endpoint` | string | Method + path (no query-string secrets) |
| `target_owner` | string | Owner id of the targeted resource (synthetic) |
| `tenant` | string | `organization_id` context of the request |
| `mutation_axis` | enum | `owner` \| `tenant` \| `state` |
| `payload_hash` | sha256 | Hash of request body; raw body not stored |
| `response_hash` | sha256 | Hash of response body; raw body not stored |
| `http_status` | int | Observed status code |
| `denial_code` | string\|null | Business denial code if any |
| `rls_rows_affected` | int | Backstop check result |
| `expected` | object | Oracle from §4 (expected status/code/rows) |
| `result` | enum | `pass` \| `fail` \| `inconclusive` |
| `request_id` | string | Correlation id for server-log join |
| `timestamp` | ISO-8601 | UTC |

### 5.2 Severity rubric

| Severity | Definition | Example class |
|----------|------------|---------------|
| **Critical** | Cross-tenant or privilege-escalation write/approve/publish succeeds; RLS also fails to block | Tenant admin writes another org's questions; student self-approves to public library |
| **High** | Cross-owner or cross-tenant **read** of private data, or a write blocked only at one layer (service OR RLS, not both) | IDOR read of another student's submission; guard blocks but RLS would allow |
| **Medium** | State-machine bypass with limited blast radius, or existence disclosure (403 vs 404 leak) contradicting the matrix | Illegal `draft→published` accepted then caught downstream |
| **Low** | Inconsistent-but-safe behavior; hardening opportunity | Wrong code returned (403 where 404 preferred) with correct denial |

---

## 6. (E) Fix Design Template (no code changes yet)

*Minimal-fix principle: fix at the **lowest layer that owns the invariant**, then add the missing layer as defense-in-depth. Never fix only at the UI/route layer.*

### 6.1 Minimal-fix principles by layer

| Layer | When it is the right fix | Minimal-fix shape |
|-------|--------------------------|-------------------|
| **Middleware** (`middleware.ts`, `supabase/middleware.ts`) | Route reachable pre-auth or by wrong role; matcher gap | Extend matcher / role gate; **never** the sole owner boundary — it cannot see row ownership |
| **Service** (`guards.ts`, route handlers) | Handler runs without a `require*` guard, or trusts client-supplied `owner_id`/`organization_id` | Add guard; derive owner/tenant from session (`getCurrentAuthContext`), never from request body; add explicit state-transition check |
| **SQL / RLS** (`clean-migrations/*.sql`) | Any row-level owner/tenant boundary; the authoritative backstop | Add/tighten `USING` + `WITH CHECK` on `owner_id`/`organization_id`; enforce state via `CHECK` constraints (as with `questions_approval_status_check`); prefer forward-only migration |

Ownership and tenant boundaries **must** be enforced in RLS regardless of service-layer checks. State-transition legality should have a DB `CHECK`/trigger where a bad transition would be unrecoverable.

### 6.2 Regression-baseline recommendations (CI-gated families)

Once a finding is fixed, the corresponding family becomes a permanent CI gate:

1. **Tenant-isolation family (Critical/High) — MUST gate CI.** One canary per org-scoped resource (R2–R6, R9) asserting cross-tenant read+write both fail at HTTP and RLS.
2. **Owner-isolation / IDOR family (High) — MUST gate CI.** One canary per owned resource asserting cross-owner read/update/delete denial.
3. **Two-state approval / publish family (Critical) — MUST gate CI.** Assert `draft→published` and library publish require the sanctioned path; assert DB constraints reject the shortcut.
4. **Role-guard presence (Medium) — SHOULD gate CI.** Static assertion that every `src/app/api/**/route.ts` mutating handler invokes a `require*` guard.
5. **RLS-backstop (High) — SHOULD gate CI.** For each policy-bearing table, a test that a service-role/bypassing client still gets zero rows across the boundary.

Recommend running families 1–3 as blocking checks on every PR touching `src/app/api/**`, `src/lib/auth/**`, or `supabase/**`.

---

## 7. Routing Summary (design → execution handoff)

```
scope-gate(signed?) ──no──► STOP (design only)
        │yes
        ▼
case-init: seed dedicated test project + synthetic accounts (A,B) × tenants (T1,T2)
        ▼
route each candidate → {owner | tenant | state} family  (§4)
        ▼
attach expected-rejection oracle + RLS backstop
        ▼
capture evidence record (§5, hashes only)
        ▼
classify finding (§6 severity) → minimal-fix layer → CI baseline
```

---

## 8. Detailed Matrix Draft Table (expanded, per §3.3)

Same content as §3.3 but one row per `(resource, action)` for reviewer annotation. Fill `Confirmed?` during static RLS review before any execution.

Confirmed against live RLS policies (all 76 clean-migrations applied to the local stack, 2026-08-06). `Confirmed?` legend: ✅ RLS matches hypothesis · ⚠️ diverges, see §8.1 note.

| Resource | Action | anon | student | teacher | admin | super_admin carve-out | Confirmed? (RLS) |
|----------|--------|------|---------|---------|-------|-----------------------|------------------------|
| official-public-library | read | ✓ | ✓ | ✓ | ✓ | ✓ | ⚠️ N1 |
| official-public-library | publish/approve | ✗ | ✗ | ✗ | ✓ (sanctioned path) | ✓ | ⚠️ N2 |
| question-bank | create | ✗ | ✗ | Δ own/org | Δ org | — | ⚠️ N3 |
| question-bank | read | ✗ | Δ published | Δ own/org | ✓ org | — | ✅ |
| question-bank | update | ✗ | ✗ | Δ own/org | Δ org | — | ✅ |
| question-bank | delete | ✗ | ✗ | Δ own | Δ org | — | ⚠️ N3 |
| question | read | Δ published | Δ published | Δ own/org | ✓ org | — | ✅ / ⚠️ N1 (anon) |
| question | create/update | ✗ | ✗ | Δ own/org | Δ org | — | ✅ |
| question | approve/publish | ✗ | ✗ | Δ own/org | ✓ org | — | ⚠️ N2 |
| question (orphan, no bank) | read/write | ✗ | ✗ | ✗ | ✓ global | ✓ global | ⚠️ N10 |
| review-draft | read | ✗ | ✗ | Δ own/org | ✓ org | — | ✅ |
| review-draft | approve/reject | ✗ | ✗ | Δ (separation?) | ✓ org | — | ⚠️ N5 |
| assignment | create | ✗ | ✗ | Δ own class | Δ org | — | ✅ |
| assignment | assign/share | ✗ | ✗ | Δ own class | ✓ org | — | ✅ |
| assignment | read | ✗ | Δ assigned-to | Δ own class | ✓ org | — | ✅ |
| submission | create | ✗ | Δ self | ✗ | ✗ | — | ✅ |
| submission | read | ✗ | Δ self | Δ own class students | ✓ org | — | ✅ |
| submission | update/delete | ✗ | Δ self (no delete) | ✗ | ✗ | — | ⚠️ N6 |
| user-profile | read | ✗ | Δ self | Δ self | ✓ org | ✓ | ⚠️ N7 |
| user-profile | update | ✗ | Δ self | Δ self | Δ self | ✓ (role/status) | ✅ |
| user-profile | create/delete/role-change | ✗ | ✗ | ✗ | ✗ | ✓ only | ✅ N3 |
| organization | read | ✗ | Δ member | Δ member | Δ member | ✓ | ✅ |
| organization | update | ✗ | ✗ | ✗ | Δ own org | ✓ | ⚠️ N8 |
| source-asset / import | create/read/update | ✗ | ✗ | Δ own/org | Δ org | — | ✅ N9 |

### 8.1 Static RLS review notes (divergences to verify live)

Tenant isolation overall is **confirmed**: `private.is_org_staff/is_org_admin/is_org_member` all key off `organization_members` (org + user + role + active) or `profiles.default_organization_id`, so cross-tenant access to org-scoped resources is denied. The notes below are where the hypothesis matrix was wrong or where RLS alone does not tell the whole story — these become the highest-priority live checks.

- **N1 — Public library requires authentication.** `private.can_read_official_public_question_v2` and `question_banks_official_public_read_v2` both require an active `profiles` row for `auth.uid()`. **Anonymous users are denied** on `questions`/`question_banks`, and only `approval_status='approved'` questions are visible. The matrix's "anon ✓ read public library" does not hold for these tables (any truly public read is a separate endpoint, e.g. `tags/published`). Live check: anon read → expect empty/deny, not success.
- **N2 — Publishing to the public library is super_admin-only.** `question_banks_update_managers` WITH CHECK allows `visibility='public'` only when `private.is_super_admin()`. A plain org `admin` **cannot** publish a bank to the official public library. The matrix overstated admin authority here.
- **N3 — No INSERT/DELETE policy on `question_banks` or `profiles`.** With RLS on and no permissive INSERT/DELETE policy, direct create/delete is denied for every non-service caller; these run through SECURITY DEFINER RPCs / the service role. Test create/delete via the API route, never a direct table write.
- **N5 — Review approval has no separation-of-duty at RLS.** `review_*_staff_access` lets any org staff / bank manager approve; RLS does not stop a draft's creator from approving their own item. Whether that's permitted is a service-layer business rule → Category-3 (state) live check.
- **N6 — Students can delete their own submissions.** `practice_sessions_student_delete` permits `user_id = auth.uid()`. The matrix said "no delete." Confirm this is intended.
- **N7 — Profile reads are broader than self.** Teachers/admins can read profiles of their **classroom roster** (`profiles_classroom_roster_read`) and **shared-bank members** (`profiles_bank_member_read`); super_admin reads all. Cross-tenant read of an unrelated profile is still denied. The matrix's teacher "Δ self" is too narrow.
- **N8 — Organization writes are super_admin-only.** `organizations_super_admin_write` gates ALL writes on `is_super_admin()`; an org `admin` cannot update the org row. The matrix overstated admin authority.
- **N9 — No `source_assets` table.** Import/source lives in `ai_import_jobs` + `import_batches`, tenant-scoped via `is_org_staff`. Confirmed isolation; just a naming correction.
- **N10 — Orphan questions are not tenant-scoped.** `questions_staff_access` grants full access when `owner_bank_id IS NULL AND private.is_admin()`, and `is_admin` is a **global** role check (`current_user_role() in ('admin','super_admin')`), not org-scoped. Bank-owned questions stay tenant-scoped, but a bank-less question is reachable by any admin regardless of org. **Highest-priority live check** — verify whether orphan questions can ever hold another tenant's data (potential High).

---

## 9. Pre-Execution Checklist (gates DESIGN → ACT)

**Authorization & environment**
- [ ] Written approval of this document (§2 Scope Gate signed)
- [ ] Dedicated non-production Supabase project/branch provisioned; production credentials absent from test env
- [ ] Synthetic accounts created: 2 owners (A, B) per role × 2 tenants (T1, T2); no real user data
- [ ] Seed data loaded (deterministic fixtures only; no real PII/answer keys)

**Safety rails**
- [ ] Test runner hard-capped to single-request-per-case; no loops/fuzzing/enumeration
- [ ] Destructive actions (`delete`/`truncate`/state-irreversible) disabled or run only against disposable rows
- [ ] Evidence store configured to persist **hashes only**; raw-body capture disabled
- [ ] `api/internal/ai-jobs/run` and service-role paths flagged static-review-only (no crafted calls)
- [ ] No forged `AUTH_CONTEXT_HEADER` traffic (trust-boundary is code-review only in this phase)

**Oracle & coverage**
- [ ] Every `Δ` cell in §8 has a mapped expected-rejection oracle (§4.4) and an RLS backstop assertion
- [ ] `Confirmed? (RLS text)` column completed via static policy review before any request is sent
- [ ] Severity rubric (§5.2) and evidence schema (§5.1) wired into the runner
- [ ] CI-gate families (§6.2 items 1–3) identified as blocking checks

*Sign-off is tracked in the Status header at the top of this document, not here.*
