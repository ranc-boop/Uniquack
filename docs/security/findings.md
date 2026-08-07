# Authorization Matrix — Findings Log

Target: local disposable Supabase stack. Layer tested: SQL/RLS. See [design](authz-matrix-test-design.md) §5 for the evidence schema and §5.2 for the severity rubric. Raw evidence (hashes) under `docs/security/evidence/`.

---

## Coverage & negative results (run 2026-08-07, RLS layer, all controls green)

17 cases across 6 groups. A "secure" row means the boundary held as required; controls (a legitimate action that must succeed + a foreign action that must fail) passed in every group, so these verdicts are trustworthy.

| Group | What was tested | Outcome |
|-------|-----------------|---------|
| N10 | Orphan-question cross-tenant read/write | **FINDING F-001** (see below) |
| N2 | Org admin publishing a bank to the public library | Secure — blocked. Backed by DB `CHECK` `question_banks_official_public_visibility_check` (`visibility='public'` requires `owner_scope='system'`), so *no* role can flip an org bank public; the design note N2 (super_admin-only) is moot — the real gate is stricter. |
| N8 | Org admin updating the organization row | Secure — org admin blocked; super_admin allowed. Confirms N8 (org write is super_admin-only). |
| N6 | Student deleting their own submission | Confirmed divergence — RLS **allows** student self-delete (matrix said "no delete"). Intended owner-scoped behavior; **matrix corrected, not a vuln.** Student deleting another user's session is denied (control). |
| BANK | Question-bank owner + tenant isolation | Secure — teacher-B cannot read teacher-A's private bank; teacher@T2 cannot read a T1 org bank. |
| SUB | Submission owner isolation (read + write) | Secure — student cannot read or write another user's practice session. |

Net: tenant isolation, owner isolation, and privilege boundaries all hold **except** the orphan-question path (F-001).

---

## F-001 — Cross-tenant access to orphan (bank-less) questions via `questions_staff_access`

- **Severity:** High → Critical *(conditional on orphan questions existing in real data — see Exploitability)*
- **Category:** Tenant mutation (§4.2) — cross-organization
- **Design note:** N10 (§8.1)
- **Status:** CONFIRMED (read + write), controls green

### What
The `questions_staff_access` RLS policy on `public.questions` is:

```
ALL  USING/CHECK:  (owner_bank_id IS NULL) AND private.is_admin()
```

`private.is_admin()` = `private.current_user_role() in ('admin','super_admin')`, which reads `profiles.role` for the caller with **no `organization_id` comparison**. For any question with `owner_bank_id IS NULL`, the policy therefore grants full read/write/delete to *any* admin in *any* tenant. Bank-owned questions remain tenant-scoped (they route through `can_read/manage_question_bank`, which are org-scoped); only orphan questions are affected.

### Reproduction (local)
`node scripts/authz-matrix-runner.mjs N10`

| Case | Actor | Target | Expected (secure) | Observed | Verdict |
|------|-------|--------|-------------------|----------|---------|
| N10-C1 (control) | admin@T1 | orphan question in **T1** | 1 row (allow) | 1 row | PASS |
| N10-C2 (control) | teacher@T1 | orphan question in T2 | 0 rows (non-admin deny) | 0 rows | PASS |
| **N10-1** | admin@T1 | orphan question in **T2** | 0 rows (deny) | **1 row read** | **FAIL** |
| **N10-2** | admin@T1 | orphan question in **T2** | no mutation | **title mutated** (verified via service-role re-read) | **FAIL** |

Controls pass → the harness is valid and the failures are real, not a grant/setup artifact.

### Exploitability (determines final severity)
The `questions_staff_access` policy is `ALL`, and its `WITH CHECK` (`owner_bank_id IS NULL AND is_admin()`) also permits an admin to **create** orphan questions. The only other INSERT policy (`questions_bank_manager_draft_insert`) requires `owner_bank_id IS NOT NULL`, so orphan questions are producible **only** by admins/super_admins or the service role — not by ordinary users. Real-world impact hinges on whether any application code path (import, migration, admin tooling) ever produces `owner_bank_id IS NULL` rows carrying one tenant's content. Seed data currently has **0** orphan questions. If a path exists → Critical; if orphans never carry real cross-tenant data → latent, fix as defense-in-depth.

### Fix (per §6.1 — SQL/RLS layer owns this invariant)
Add a tenant clause to the policy so admin access is scoped to the caller's organization, e.g. gate on `private.is_org_admin(organization_id)` (org-scoped) instead of the global `is_admin()`, or add `AND private.is_org_member(organization_id)`. Forward-only migration. Then add this case to the CI tenant-isolation gate (§6.2 family 1).

### Follow-up
- [ ] Determine whether any code path creates `owner_bank_id IS NULL` questions (settles severity).
- [ ] Confirm the same policy's DELETE path is likewise cross-tenant (runner currently checks read+write).
