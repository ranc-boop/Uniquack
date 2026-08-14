# Stage 0 Audit — Unknowns / NEEDS HUMAN CONFIRMATION

Ambiguities Stage 0 could not resolve from the repository. Do not let cleanup silently resolve these.

1. **Google account linking — planned or abandoned?**
   `0032_google_account_links.sql` exists but is permanently excluded from the executable chain by the governance script; runtime has no Google sign-in; `docs/google-login-account-linking-plan.md` and `docs/sec-google-account-linking-spec.md` exist; RPCs (`link_google_to_current_profile`, `record_google_signin`, …) are defined only inside the blocked file. Is this feature parked (keep everything) or dropped (candidate for removal)? NEEDS HUMAN CONFIRMATION.

2. **Dormant table families from 0004/0005.**
   `source_files`, `source_pages`, `import_jobs`, `import_job_assets`, `ai_import_jobs`, `ai_import_extractions`, `ai_import_packets`, `ai_import_packet_plans`, `ai_import_preanalysis`, `ai_import_errors`, `ai_import_assets`, plus `course_plan_sources` — zero code references. Are they reserved for AI Parsing V2 persistence, hosted-data holdovers, or dead? They may also contain data in the hosted project (not inspectable from the repo). NEEDS HUMAN CONFIRMATION before any drop.

3. **Platform-admin vs org-admin access to the global library after 0077 (finding P1-1).**
   ~~NEEDS HUMAN CONFIRMATION~~ **RESOLVED 2026-08-13:** owner confirmed the split is intended in the current undeployed version. Tracked as a deferred re-check at deployment time (`17-resolution-queue.md`).

4. **Legacy `questions.status` / `published_at` end-state.**
   0076 declares them compatibility fields. Is the long-term intent to migrate all readers to `approval_status` + visibility and drop `status`, or do both remain load-bearing (e.g. archived/deprecated states)? Determines whether many code paths are transitional or permanent. NEEDS HUMAN CONFIRMATION.

5. **Study Groups.**
   `/student/groups` page and CONTEXT.md describe Study Groups as a product layer with explicit boundary rules, but no `study_group*` tables exist in the canonical chain. Placeholder UI ahead of schema, or scope cut? NEEDS HUMAN CONFIRMATION.

6. **Videos domain.**
   `/videos`, `/admin/videos`, `videos` table — absent from the product spec (CONTEXT.md). Legacy-demo carryover to keep, productize, or retire? NEEDS HUMAN CONFIRMATION.

7. **Top-level student surfaces vs `/student` workspace.**
   `/practice`, `/mistakes`, `/questions` exist outside the role-gated `/student` tree (self-guarded, student-usable). Is the split intentional (public/anon surfaces + workspace) or leftover IA to consolidate? CONTEXT.md's "Known Gaps" list appears stale, so intent cannot be read from docs. NEEDS HUMAN CONFIRMATION.

8. **Which smoke scripts are load-bearing.**
   CI runs a small set; `smoke-all.mjs` a larger one; ~150 scripts (pdf50 apply/gate/repair, hosted-apply, rehearsals) look like one-shot evidence tools. A canonical "must-stay-green" list does not exist. NEEDS HUMAN CONFIRMATION before treating any script as deletable or as a regression gate.

9. **Unversioned vs versioned RPC pairs.**
   For each pair (e.g. `approve_bank_review_question` vs `approve_library_questions_v2`, `review_public_question_submission` vs `_v2`, `search/count_bank_question_rows` vs `_v2`), is the older function still a supported contract (hosted callers? scripts?) or superseded? Requires per-function call-site tracing plus hosted-DB knowledge. NEEDS HUMAN CONFIRMATION per pair.

10. **`user_profiles` view and other 0001-era conveniences** — no app references found; hosted consumers unknown.

11. **Hosted vs repo schema parity.**
    The hosted "Current Clean Supabase" project has its own applied-migration history with documented manual applies and repairs (`docs/security/migration-application-register.md`, history-repair scripts). This audit inspected the repo chain only; live-schema parity was not re-verified. Treat `docs/security/live-schema-manifest.json` recency as unconfirmed.

12. **`docs/security/findings.md` status.**
    Still narrates the pre-0077 (global-admin orphan access) decision as current. Should be updated to record the 0077 reversal — flagged here rather than edited, per Stage 0 constraints.
