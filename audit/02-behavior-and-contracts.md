# Stage 0 Audit — Behavior & Contract Baseline

What the system observably does today, and the contracts a refactor must not break. "Observed" = traced in code/migrations; "Inference" marked explicitly.

## 1. Authentication behavior (observed)

- Login is **username + password** (`src/app/auth/actions.ts:signInWithUsername`). Usernames without `@` are mapped to a synthetic email `<username>@local.app` (`src/lib/auth/username.ts`) before `supabase.auth.signInWithPassword`.
- No Google/OAuth sign-in exists at runtime. A Google-account-links migration (`0032_google_account_links.sql`) and its RPCs are **excluded from the executable chain** by governance (see 06-unknowns).
- Session refresh happens only in middleware; server components cannot set cookies (comment in `src/lib/supabase/server.ts`).
- Middleware forwards a verified auth context header; `getCurrentAuthContext` (`src/lib/auth/guards.ts`) validates its shape (role ∈ {super_admin, admin, teacher, student}, `profile.id === userId`) and falls back to a direct Supabase read. Middleware deletes the inbound header first — clients cannot spoof it.

## 2. Route protection behavior (observed)

- `/admin/**` → admin | super_admin; `/admin/users/**` → super_admin only.
- `/teacher/**` → teacher | admin | super_admin.
- `/student/**` → student only at middleware level; page guard `requireStudentWorkspace` additionally admits admins read-only (documented in guards.ts as intentional: student **mutations** still use `requireStudent`).
- All other routes (`/`, `/questions`, `/videos`, `/practice`, `/mistakes`, `/auth/login`) pass middleware un-gated; they self-guard in the page (e.g. `/practice`, `/mistakes` redirect to login) or rely on RLS/anon policies (`/questions` public search works anonymously per 0058).
- Unauthorized role → redirect `/unauthorized`; unauthenticated → `/auth/login?next=…`.
- `/local-test/practice-answer-state` 404s unless `NODE_ENV !== 'production'` **and** `PRACTICE_ANSWER_STATE_LOCAL_BROWSER_E2E=ENABLED`.

## 3. Teacher bank-first workflow (observed)

- Create bank: `create_question_bank` RPC (roles teacher/admin/super_admin; org membership check when org visibility). Visibility ∈ private|shared|organization|public with 0076 constraint: only the system bank may be `public`.
- Membership: `bank_members` role ∈ owner|editor|viewer, status active|invited|removed. Share codes: `create_bank_share_code` / `join_question_bank_by_code` / `revoke_bank_share_code`; codes stored hashed (DB-side `private.bank_share_code_hash`), join is for collaboration, not student access.
- Import into bank:
  - manual drafts (`create_bank_manual_question_draft` RPC);
  - JSON batch import (preview + interactive import, LaTeX repair `src/lib/import-json`);
  - **PDF (primary path):** burst reservation (`reserve_ai_pdf_upload_burst` — admission control on count/bytes), direct upload to `ai-import-sources` reserved paths, enqueue durable jobs, worker parses, results land as bank-scoped `review_batches`/`review_draft_items`;
  - blueprint generation into review drafts (`src/lib/teacher-blueprint-generation.ts`);
  - pull from public library (`pull_public_question_to_bank`).
- Review: edit draft, needs-fix, reject, approve. Approval goes through `approve_bank_review_question(s)` / `approve_library_questions_v2` which enforce **strict bidirectional lineage** (question.source_review_item_id ↔ item.created_question_id, same bank, item_kind='question') — migration 0066, repair 0071.
- Approved questions carry `approval_status='approved'` (two-state model, 0076). Legacy `questions.status` (`draft|review|published|archived|deprecated`) remains as a compatibility field.
- Publish to public: `submit_bank_questions_to_public_review*` → admin `review_public_question_submission_v2` → official public (system) bank. Withdraw supported. Snapshot immutability trigger (`prevent_public_submission_snapshot_change`).
- Assignment creation: `create_assignment_from_bank` RPC, **idempotent** per `(actor_id, p_client_request_key)` with request-fingerprint receipts in `private.assignment_creation_requests` (0068/0069). Readiness gates (0057) block assigning bank-owned questions that are not approved; legacy violating assignments were quarantined, recoverable via `resume_quarantined_assignment` (0059).

## 4. Classroom & student workflow (observed)

- Teacher creates classroom via `create_teacher_classroom` RPC (0044 reconciled path); co-teachers via `add/remove_classroom_co_teacher`; student membership status via `set_classroom_student_membership_status`; removed members are blocked from rejoin (0020).
- Join codes: generated + SHA-256-hashed **in app code** at creation (`src/lib/classrooms.ts`, `src/app/teacher/classrooms/actions.ts`), verified **in SQL** at join (`join_classroom_by_code` → `private.classroom_join_code_hash`). The two hash implementations must stay equivalent (normalize: strip non-alnum, uppercase; SHA-256 hex).
- Student: `/student` workspace (My Work, classrooms, progress, library, public-library, groups). Assignment practice starts via `POST /api/practice/assignments/start`, which links assignments to practice sessions (`assignment_practice_sessions`).
- Study Groups (`/student/groups`) and student library pages exist as workspace surfaces; product docs describe more than is implemented (not deeply traced — see 06-unknowns).

## 5. Practice engine behavior (observed)

- All `/api/practice/*` handlers authenticate via `requirePracticeApiUser` (Supabase claims → 401 otherwise); data access then flows through RLS with the user's session.
- Session model: `practice_sessions` (status active|completed|abandoned|archived, session memory, tag context, recommendation state) → `practice_rounds` / `practice_round_questions` / `practice_attempts`, plus hint events, reflection records, wrong-question inventory, weakness links.
- Source scope: sessions are initialized with selectable sources (`initialize_practice_session_sources`, `list_selectable_practice_sources`), and the source scope **locks on first round** (0054). Library-scope + inventory rules from 0052.
- AI calls (grade/hint/review/recommend): DB-enforced admission — request windows (`claim_practice_ai_request`, 0073/0074) and single-flight leases (`claim/release_practice_ai_inflight_lease`, 0075). Provider routing/keys are resolved with the **service-role** client after user-level authorization (`src/lib/practice/ai.ts`), with prompt-safety and trace-safety modules around provider I/O.
- Evidence isolation: self-study evidence is separated from assignment evidence (0047/0048); RPC helpers `can_read/manage_practice_session_evidence`. Cycle reset (`reset_my_practice_progress`, 0072) records `practice_progress_resets`.
- Preferences: `user_practice_preferences` + merge jobs (`practice_preference_merge_jobs`) run via `/api/practice/preferences/merge/run`.

## 6. AI import / durable queue behavior (observed)

- Queue: `enqueue_ai_provider_job` with idempotency key (`buildAIPdfJobIdempotencyKey` = batch/source/retry-generation), kinds/resource types in `src/lib/ai-jobs/types.ts`.
- Worker: `POST /api/internal/ai-jobs/run` guarded by constant-time compare of `AI_JOBS_INTERNAL_TOKEN` (404 on failure). The route claims up to 2 jobs (`claim_ai_provider_jobs`), executes with **lease fencing** (`*_fenced` RPCs: begin/heartbeat/persist/finalize/finish; fence tokens set by `private.set_ai_provider_job_lease_fence`), provider-result checkpoints in `private.ai_provider_job_provider_result_checkpoints`, and crash recovery (0051).
- Provider layer: profiles stored encrypted (`AI_PROVIDER_ENCRYPTION_KEY`), Gemini adapters (native + structured output), JSON repair, response limits, network safety (blocks private networks/insecure HTTP unless env overrides), fallback + circuit breaker (0035), usage accounting/telemetry (`record_ai_operation_telemetry`), ops controls (`ai_operations_controls`, `get_ai_operations_worker_control`).
- Admin AI settings UI talks to gateway RPCs (`*_for_gateway`) that verify a gateway token hash (`setup_ai_provider_gateway_token_hash` / `private.verify_ai_provider_gateway`, hardened in 0042); raw provider config is asserted absent from teacher-facing forms (`assertNoRawProviderConfig`).

## 7. HTTP API contracts (observed route inventory)

| Route | Method(s) | Auth | Notes |
|---|---|---|---|
| `/api/practice/sessions` (+`/[sessionId]`, `/title`) | GET/POST/PATCH/DELETE | user claims | session CRUD/list |
| `/api/practice/assignments/start` | POST | user claims | assignment→session activation (atomicity smoke exists) |
| `/api/practice/rounds/custom`, `/grade`, `/hint`, `/review`, `/recommend`, `/wrong-questions`, `/sources`, `/course-frameworks`, `/preferences`, `/preferences/merge/run`, `/progress/reset` | GET/POST | user claims | practice engine surface |
| `/api/question-assets/[assetId]` | GET | user session → `can_read_question_asset` RPC | 302 → 60s signed URL; UUID-only input; `private, no-store`; 404 for unknown+unauthorized alike |
| `/api/internal/ai-jobs/run` | POST | `x-ai-jobs-internal-token` | worker boundary; 404 on bad token; maxDuration 240s |
| `/api/teacher/banks/[bankId]/previews` | POST | profile + origin check (`resolveTrustedPostOrigin`) | focus preview payloads |
| `/api/teacher/focus-selections` | POST | `requireTeacher` + origin check | selection receipts (RPC-backed) |
| `/api/admin/imports/pdf/segment-preview/[batchId]/[chunkIndex]` | GET | admin | segment preview |
| `/api/tags/published` | GET | public/session | published taxonomy |

Server actions (28 modules) are the rest of the mutation surface; Next.js enforces same-origin on them, and `resolveTrustedPostOrigin` additionally guards the two teacher fetch-POST routes.

## 8. Database contracts that must be preserved (observed)

- **RPC surface**: ~100 `public.*` functions (see 01 doc + `supabase/clean-migrations`). Both legacy and versioned variants are live simultaneously — e.g. `search_bank_question_rows` (no approval filter) *and* `search_bank_question_rows_v2` (with `p_approval_status`) are both called from `src/lib/question-banks.ts:1590-1618`. Do not remove either without call-site migration.
- **Key enums/CHECKs** (behavioral contracts):
  - `profiles.role` ∈ super_admin|admin|teacher|student; `status` ∈ active|disabled.
  - `question_banks.visibility` ∈ private|shared|organization|public; `owner_scope` ∈ user|organization|system; system ⇒ `system_key='official_public'` ∧ visibility='public' (CHECK); non-system banks can never be `public` (0076 mapped legacy public→shared).
  - `questions.approval_status` ∈ pending|approved (authoritative two-state); legacy `questions.status` retained for compatibility.
  - `questions` lineage CHECK: ai_import/blueprint questions cannot be `published` without `source_review_item_id`.
  - `bank_members.role` ∈ owner|editor|viewer; `bank_questions.source_kind` ∈ manual|review_draft|import|public_pull|course_builder.
  - `review_draft_items.status` ∈ pending_review|approved|rejected|needs_more_evidence|archived.
- **Storage buckets**: `question-assets` (private since 0046; access only via asset route/RPC) and `ai-import-sources` (reserved-path upload policies, 0050). Bucket names are referenced from code and DB policies.
- **Generated DB types** (`src/types/database.ts`) intentionally lag applied migrations; RPCs added after the last regeneration are called through casts. Regenerating types is safe; *depending* on them for the queue is currently not done by design (`src/lib/ai-jobs/queue.ts`).

## 9. Environment contract (observed)

Required/used: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `CLEAN_SUPABASE_SERVICE_ROLE_KEY` (preferred) / `SUPABASE_SERVICE_ROLE_KEY`, `AI_JOBS_INTERNAL_TOKEN`, `AI_PROVIDER_ENCRYPTION_KEY`, `AI_PROVIDER_GATEWAY_TOKEN`, `SITE_URL`/`NEXT_PUBLIC_SITE_URL`, `TRUST_PROXY_HEADERS`, safety toggles (`ENABLE_MOCK_AI_PROVIDER`, `ALLOW_PRIVATE_AI_PROVIDER_NETWORK`, `ALLOW_INSECURE_AI_PROVIDER_HTTP`, `PDF50_PROVIDER_TEST_MODE*`, `PRACTICE_AGENT_*`, `AI_IMPORT_LLM_DEBUG_LOGS`).

## 10. Test/verification harness (observed)

- CI: lint+typecheck+canonical-governance+security-smoke+route-smoke; embedded-postgres DB tests (library governance, assignment idempotency); **local Supabase authorization matrix** (`ci-authz-matrix-gate.mjs` → `authz-matrix-runner.mjs`, 6 groups, N10 encodes org-scoped orphan access per 0077).
- `npm run smoke` (`scripts/smoke-all.mjs`) aggregates a large subset; many scripts are one-off report/rehearsal tools kept for evidence. Which scripts are load-bearing beyond CI is not fully determined (see 06-unknowns).
