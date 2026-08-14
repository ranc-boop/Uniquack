# Stage 0 Audit — Behavioral Invariants

Rules a future refactor must preserve. Each is backed by current implementation, migrations, tests, or CI (citation in parentheses). Items marked *(assumption)* are believed-intended but not machine-enforced.

## Migration & schema governance

1. Only `supabase/clean-migrations/` is canonical; forward-only corrections; never edit applied migrations; `0032_google_account_links.sql` stays excluded from the executable chain. (CI `canonical-migration-governance-smoke.mjs`; AGENTS.md.)
2. `supabase/migrations/` (legacy chain) is frozen and must not be applied or edited. (AGENTS.md; governance tooling ignores it.)

## Review & publishing safety

3. **No AI auto-publish.** AI-imported or blueprint-generated questions cannot be published/assigned without review lineage: CHECK `questions_ai_or_blueprint_requires_review_lineage` (0006) + strict bidirectional lineage on approval (`approve_bank_review_question*`, 0066/0071).
4. Bank-owned questions must be **approved** (`approval_status='approved'`) before they can be part of an assigned assignment; DB triggers enforce it and block regression of already-assigned questions. (0057 readiness triggers, 0059 quarantine/recovery, `library-governance-db-smoke` in CI.)
5. Only the system bank (`owner_scope='system'`, `system_key='official_public'`) may have `visibility='public'`; no role can flip another bank public. (CHECK constraints, 0076; authz-matrix N2.)
6. Publishing to the official public library goes through submission + admin review (`submit_bank_questions_to_public_review*` → `review_public_question_submission_v2`); submission snapshots are immutable (`prevent_public_submission_snapshot_change`).
7. Source lineage fields (`source_review_item_id`, review batch/bank scoping, `question_source_references`) are preserved through approval and revision flows. (0066; AGENTS.md.)

## Authorization boundaries

8. RLS is the final authority; app-layer guards are additive. User-facing reads/writes use the anon-key session client.
9. Service-role clients run only **after** an authorization decision tied to the acting user or the internal worker token (current 9-file pattern, 03 doc §3). *(assumption — convention, verify `security-smoke.mjs` coverage before relying on it)*
10. Classroom membership grants no bank access; assignment exposes only its `assignment_items`; study-group-style access must not leak teacher content. (Policy graph; CONTEXT.md; authz-matrix BANK/SUB groups.)
11. Orphan questions (`owner_bank_id IS NULL`) are manageable only by an org admin of the question's organization or a super_admin. (0077; CI N10 encodes this — flip N10 if intent changes.)
12. Organization rows are writable only by super_admin. (authz-matrix N8.)
13. Profiles: privileged fields (role, status, org) are immutable except via `transition_profile_role_as_super_admin`; changes are audited. (0039–0041.)
14. Students may delete their own practice sessions/submissions; never another user's. (authz-matrix N6 — intended.)
15. Middleware must strip inbound `AUTH_CONTEXT_HEADER` before setting its own verified value. (`src/lib/supabase/middleware.ts:55`.)
16. `/admin/users` requires super_admin; `/teacher` admits admin/super_admin; `/student` mutations require the student role (admin access to student UI is read-only via `requireStudentWorkspace`).

## Storage & assets

17. `question-assets` bucket stays private; asset delivery only via `/api/question-assets/[assetId]` → `can_read_question_asset` RPC → short-lived (60s) signed URL; the route never trusts caller-supplied paths; unknown and unauthorized are indistinguishable (404). (0046; route code; `check-question-assets-public-url` lint gate in `npm run lint`.)
18. AI import uploads land only on burst-reserved paths in `ai-import-sources`. (0050 policies; burst smokes.)

## Durable AI queue & providers

19. The internal worker route is the only worker execution boundary; it authenticates via constant-time token compare and never accepts job IDs/payloads from the wake-up runner (outside explicit test mode). (`/api/internal/ai-jobs/run`; runbook.)
20. Job execution respects lease fencing: state transitions go through `*_fenced` RPCs carrying the fence token; a fenced-out worker's writes are rejected. (0051; `pdf50-worker-fencing-smoke`.)
21. Job enqueue is idempotent per idempotency key (batch/source/retry-generation). (`enqueue_ai_provider_job`; queue.ts.)
22. Provider secrets are never returned to clients or logged; provider keys are encrypted at rest; gateway admin RPCs require the gateway token (hash-verified in `private`). (0042; encryption.ts; AGENTS.md no-print rule.)
23. Provider network safety defaults hold: no private-network or plain-HTTP provider endpoints unless explicitly overridden by env. (`network-safety.ts`.)

## Assignments & practice

24. Standard assignment creation is retry-safe: same `(actor, client_request_key)` returns the same assignment; fingerprint mismatch is an error. (0068/0069; CI `assignment-creation-idempotency-db-smoke`.)
25. A practice session's source scope locks on first round; library-scope/inventory rules of 0052 apply thereafter. (0054.)
26. Self-study evidence and assignment/course-framework evidence remain isolated. (0047/0048; isolation smokes + live e2e.)
27. Practice AI calls are admission-controlled in the DB (request windows + single-flight inflight leases); client retries cannot bypass them. (0073–0075.)
28. Practice cycle reset preserves an auditable reset record and does not delete evidence wholesale. (0072 `practice_progress_resets`, `reset_my_practice_progress`.)
29. All `/api/practice/*` endpoints require an authenticated Supabase user and operate under that user's RLS identity. (`requirePracticeApiUser`.)

## Auth & identity

30. Login maps bare usernames to `<username>@local.app` before password auth; changing this mapping strands existing accounts. (`src/lib/auth/username.ts`.)
31. Join/share codes are stored hashed (SHA-256) with hints only; classroom join-code hashing in TS and SQL must remain byte-equivalent (normalize = strip non-alphanumerics, uppercase). (0018/0026; `src/lib/classrooms.ts`.)
32. Removed classroom members cannot rejoin via code. (0020.)

## Contract stability

33. Live RPC surface (both versioned and unversioned variants currently called from code — see 02 doc §8) must keep signatures/semantics until call sites migrate.
34. `taxonomy_*` tables are the runtime taxonomy source of truth; question/weakness taxonomy assignments are trigger-validated against them. (0003/0056; validate triggers; `check-math-content-usage` lint.)
35. AI Parsing V2 stays unwired to production runtime until a deliberate integration change; its contracts are fingerprint-guarded. (`docs/architecture/ai-parsing-v2-canonical-data-foundation.md`; `ai-parsing-v2-foundation-fingerprint-smoke`.)
