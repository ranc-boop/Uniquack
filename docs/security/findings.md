# Authorization Matrix — Findings Log

Target: local disposable Supabase stack. Layer tested: SQL/RLS. See [design](authz-matrix-test-design.md) §5 for the evidence schema and §5.2 for the severity rubric. Raw evidence (hashes) under `docs/security/evidence/`.

---

## Coverage & negative results (run 2026-08-07, RLS layer, all controls green)

17 cases across 6 groups. A "secure" row means the boundary held as required; controls (a legitimate action that must succeed + a foreign action that must fail) passed in every group, so these verdicts are trustworthy.

| Group | What was tested | Outcome |
|-------|-----------------|---------|
| N10 | Orphan-question access vs admin role scope | **F-001 — WATCH item** (intended now; re-test if role model changes) |
| N2 | Org admin publishing a bank to the public library | Secure — blocked. Backed by DB `CHECK` `question_banks_official_public_visibility_check` (`visibility='public'` requires `owner_scope='system'`), so *no* role can flip an org bank public; the design note N2 (super_admin-only) is moot — the real gate is stricter. |
| N8 | Org admin updating the organization row | Secure — org admin blocked; super_admin allowed. Confirms N8 (org write is super_admin-only). |
| N6 | Student deleting their own submission | Confirmed divergence — RLS **allows** student self-delete (matrix said "no delete"). Intended owner-scoped behavior; **matrix corrected, not a vuln.** Student deleting another user's session is denied (control). |
| BANK | Question-bank owner + tenant isolation | Secure — teacher-B cannot read teacher-A's private bank; teacher@T2 cannot read a T1 org bank. |
| SUB | Submission owner isolation (read + write) | Secure — student cannot read or write another user's practice session. |

Net: tenant isolation, owner isolation, and privilege boundaries all hold. The one item worth tracking is a **roles × question-access coupling** (F-001), which is intended behavior today but fragile to future role-model changes.

---

## F-001 — Question access is coupled to the global-vs-org admin role model (roles × question-access cross-test)

- **Severity:** Informational / **WATCH** — *not a vulnerability under the current intended design.*
- **Category:** Roles × resource-access coupling (question access ↔ admin role scope)
- **Design note:** N10 (§8.1)
- **Status:** Intended, confirmed by product owner 2026-08-07. Re-test required if the role model or the policy changes.

### What
The `questions_staff_access` RLS policy on `public.questions`:

```
ALL  USING/CHECK:  (owner_bank_id IS NULL) AND private.is_admin()
```

`private.is_admin()` = `private.current_user_role() in ('admin','super_admin')`, reading `profiles.role` with **no `organization_id` clause**. So *any* platform admin can read/write/delete *any* orphan (`owner_bank_id IS NULL`) question, regardless of the question's organization.

### Why this is intended (not a bug)
Orphan questions **are** the official / global question library — created routinely by admins via the `create_global_manual_question_draft` RPC, and the admin UI is built on `.is("owner_bank_id", null)` (`src/app/admin/questions/actions.ts`). The system has a deliberate **two-tier admin model**:

| Role | Source | Scope | Helper |
|------|--------|-------|--------|
| Platform admin | `profiles.role = 'admin'` | **Global** (one value per user) | `is_admin()` |
| Org admin | `organization_members.role = 'admin'` | Per-organization | `is_org_admin(org)` |

A **global** platform admin managing **global** (bank-less) questions across orgs is by design. Org-level admins have `is_admin() = false` and get nothing from this policy (verified: control N10-C2, a non-admin, is denied). So there is no privilege escalation for org-scoped roles.

### Why it is recorded as a WATCH item
The behavior is only correct while the two-tier model holds. **This policy and the role model are coupled and must change together.** If a future change makes `profiles.role='admin'` org-scoped, or introduces per-org platform admins, **without** adding an `organization_id` clause to `questions_staff_access`, it immediately becomes a real cross-tenant IDOR (admin of org B reading/writing org A's orphaned questions).

Triggers that require re-review:
- `private.is_admin()` / `private.current_user_role()` definition changes
- `profiles.role` semantics change (e.g. becomes per-org)
- `questions_staff_access` is edited
- the meaning of `owner_bank_id IS NULL` changes

### Residual sub-item (Low — confirm intended)
`0027` defines `owner_bank_id … references question_banks(id) on delete set null`. Deleting a question bank moves its (possibly private) questions into the global pool (`owner_bank_id → NULL`), where global admins can then see them. Data-reclassification-on-delete; exposes only to global platform admins, not to other orgs. Confirm this is intended when a bank is deleted.

### Test evidence & regression guard
`node scripts/authz-matrix-runner.mjs N10` — with a **global** platform admin actor, cross-tenant read/write/delete of orphan questions **succeeds, as intended**; controls green. The N10 cases encode the *intended* expectation and carry an in-code note: if the role model becomes org-scoped, flip the expectations to "deny" and the same test guards the boundary. Recommend wiring N10 into CI to run on changes under `supabase/clean-migrations/**`, `src/lib/auth/**`, or the `profiles`/`organization_members` role model.

### Follow-up — both closed
- [x] Are there code paths that create orphan questions? **Yes** — the official/global library (`create_global_manual_question_draft`) and bank deletion (`ON DELETE SET NULL`). Orphans are a first-class, designed state.
- [x] Is the DELETE path also unscoped? **Yes** (policy is `ALL`) — and it is intended for global admins, same as read/write.
