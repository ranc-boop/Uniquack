# Stage 0 Audit — Authorization / Data-Access Baseline

The model that exists **today** (clean-migrations chain through 0077), not any earlier design.

## 1. Role model (observed)

Two-tier, deliberately coupled (documented in `docs/security/findings.md` F-001):

| Layer | Storage | Values | Scope |
|---|---|---|---|
| Platform role | `profiles.role` | super_admin, admin, teacher, student | **global** (one per user) |
| Org role | `organization_members.role` | admin, teacher, student | per organization |
| Bank role | `bank_members.role` | owner, editor, viewer | per question bank |
| Classroom | `classroom_members` | teacher/co-teacher/student + status | per classroom |

Helper predicates (all `security definer` in schema `private`): `is_super_admin`, `is_admin`, `is_teacher_or_admin`, `current_user_role`, `is_org_admin/member/staff`, `is_question_bank_member/content_editor`, `can_manage_question_bank`, `can_read/manage_classroom`, `can_read/manage_assignment`, `can_read_question`, `can_read/manage_practice_session_evidence`, etc. RLS policies delegate to these; app code does not re-implement them (it adds route/action-level gating on top).

App-side gates (`src/lib/auth/roles.ts`): admin area = admin|super_admin; teacher area additionally admits admin|super_admin; student area = student only; user management = super_admin. `requireStudentWorkspace` admits admins **read-only** into the student UI (mutations still require student).

## 2. Enforcement layers (observed)

1. Middleware route gate (coarse, path-prefix based; only `/admin|/teacher|/student`).
2. Page/server-action guards (`requireAdmin/Teacher/Student/SuperAdmin`, `requireManageableBankForAction`, etc.).
3. **RLS as the final authority**: 288 policies; user-session (anon-key) clients for nearly all reads/writes.
4. `security definer` RPCs for multi-row/privileged transitions, each re-checking authorization internally (e.g. `approve_bank_review_question` checks `is_question_bank_content_editor`; `create_assignment_from_bank` checks classroom/bank management rights; `transition_profile_role_as_super_admin` checks super-admin).

## 3. Service-role usage (observed — the complete list)

`createServiceRoleClient()` (RLS bypass) appears in exactly 9 files, each following the pattern *authorize first with the user session/RPC, then do the privileged step*:

- `src/app/api/question-assets/[assetId]/route.ts` — sign storage URL **after** `can_read_question_asset` RPC returns true.
- `src/lib/ai-jobs/worker.ts` — trusted worker execution (behind internal token; DB also verifies via `is_trusted_ai_provider_worker` / worker-role RPC checks).
- `src/lib/practice/ai.ts` — provider routing/profile decryption after user auth + admission.
- `src/lib/ai-providers/profiles.ts` — gateway-token-verified provider profile CRUD.
- `src/app/teacher/banks/actions.ts` — coverage-recovery enqueue; approval finalize steps after `requireManageableBankForAction`.
- `src/app/teacher/banks/pdf-burst-actions.ts` — burst/job orchestration after bank-management checks (DB helper `can_actor_manage_ai_pdf_burst_bank`).
- `src/app/admin/questions/actions.ts` — admin/global library operations after `requireAdmin`.
- `src/lib/questions/copy-assets.ts` — asset copy between questions (called from privileged flows).
- `src/lib/supabase/server.ts` — the factory.

**Invariant to preserve:** service-role never executes before an explicit authorization check tied to the acting user (or the internal worker token).

## 4. Tenancy & content boundaries (observed, verified by the authz matrix run + CI gate)

- Bank isolation: private bank readable only by active members; org visibility requires org membership; owner/editor for mutations (`private.can_read/manage_question_bank`).
- Orphan questions (`owner_bank_id IS NULL`) = official/global library rows. Since **0077**, `questions_staff_access` requires `private.is_org_admin(organization_id)` — org-scoped, super_admin implied. This *supersedes* the earlier global-admin policy discussed in `docs/security/findings.md` F-001 (the finding predates 0077; CI N10 expectations were re-aligned in commit 9163c0e). The findings doc itself has not been updated to reflect 0077 — treat 0077 + CI as current truth.
- Classroom membership grants classroom visibility only — no bank access (no policy path from `classroom_members` to `question_banks`).
- Assignments expose only `assignment_items`; readiness triggers (0057, `private.enforce_assigned_item_library_readiness`) block unapproved bank questions from assigned deliveries; `private.prevent_assigned_library_question_regression` blocks un-approving questions already assigned.
- Practice evidence: owner-isolated; self-study evidence separated from assignment/course-framework evidence (0047/0048). Students can delete their own sessions (confirmed intended, findings log N6).
- Organizations: writes are super_admin-only (verified N8).
- Public library: only the system bank (`official_public`) can be `visibility='public'` (DB CHECK — stronger than any role gate, verified N2). Anonymous users can evaluate public-question policies without exposure of bank rows (0057/0058: `is_question_bank_member` granted to `anon`, returns false when `auth.uid()` is null).

## 5. Profile & privilege hardening (observed)

- 0039–0041: triggers `enforce_profile_privileged_field_immutability` / `enforce_profile_insert_immutability` + delete-privilege hardening; changes audited in `private.profile_privileged_change_audit_log`. Role changes go through `transition_profile_role_as_super_admin` only.
- Middleware auth-context header is stripped from inbound requests and validated on read (shape + `profile.id === userId`).

## 6. Secrets & token boundaries (observed)

- Provider API keys: encrypted at rest (`src/lib/ai-providers/encryption.ts`, `AI_PROVIDER_ENCRYPTION_KEY`); admin gateway RPCs verify a token whose hash lives in `private.ai_provider_gateway_token_hashes` (0042 hardening).
- Worker: `AI_JOBS_INTERNAL_TOKEN` compared with `timingSafeEqual`; failure returns 404 (route hidden).
- Share/join codes: stored as SHA-256 hashes with display hints only (`bank_share_codes`, `classroom_join_codes`).
- CSRF/origin: server actions rely on Next.js same-origin enforcement; the two fetch-POST teacher routes use `resolveTrustedPostOrigin` (Origin + Sec-Fetch-Site + configured site URL/proxy rules). Practice API POSTs rely on cookie auth without an explicit origin check (Supabase auth cookies; SameSite behavior applies) — recorded as a potential-issue watch item in 04-findings, not a confirmed vulnerability.

## 7. Storage access model (observed)

- `question-assets`: private bucket (0046 cutover; backfill scripts + zero-residual verification exist). All reads via `/api/question-assets/[assetId]` → boolean RPC → service-role 60s signed URL. Lint gate `check-question-assets-public-url.mjs` prevents reintroducing public URLs.
- `ai-import-sources`: uploads only to burst-reserved paths (`private.can_upload_reserved_ai_import_source_object`, 0050); worker/admin read paths via helpers (`can_manage_ai_import_source_object`).
- Storage-object policies live in the migrations (not in app code); flipping `storage.buckets.public` does not change policy outcomes (commented in-migration).

## 8. Known-good verification state (observed)

- Authorization matrix (local Supabase, 6 groups, 17 cases): all boundaries held as of the 2026-08-07 run; N10 re-encoded to org-scoped expectations after 0077; runs in CI (`authorization` job).
- RLS smoke `scripts/supabase-rls-smoke.mjs`, assets security smokes, worker fencing smokes exist and are referenced by AGENTS.md as expected PR checks.

## 9. Uncertainties in the authz model

- Study-group boundaries are specified in CONTEXT.md but no `study_group` tables exist in the chain — `/student/groups` UI vs schema mismatch (see 06-unknowns).
- `docs/security/findings.md` and `docs/security/authz-matrix-test-design.md` still describe the pre-0077 global-admin orphan policy in places; the implementation and CI are the source of truth.
- `user_profiles` view (0001) exposure/usage not fully traced.
