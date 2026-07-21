# Migration Application Register

This register is a release-control record, not a claim that a repository file
was applied merely because it exists. `SQL Editor` entries are historical
manual-apply reports that still require read-only catalog fingerprints for
full reconciliation. The release owner is unassigned until an accountable
operator records a future release.

| ID | File | Status | Method | Evidence | Owner | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| 0001 | foundations_identity_organizations | APPLIED_AND_REVIEWED | CLI/disposable baseline | remote apply report | unassigned | baseline |
| 0002 | provider_profiles_and_operation_logs | APPLIED_MANUALLY_NOT_LEDGERED | SQL Editor | gateway setup reports | platform security owner unassigned | active internal gateway; its direct provider-profile grant and full-row policy concern was hardened forward-only by 0042, while broader catalog capture remains pending |
| 0003 | taxonomy_runtime_source | APPLIED_AND_REVIEWED | CLI/disposable baseline | remote apply report | unassigned | baseline |
| 0004 | source_assets_and_import_jobs | APPLIED_AND_REVIEWED | CLI/disposable baseline | remote apply report | unassigned | baseline |
| 0005 | ai_parsing_pipeline | APPLIED_AND_REVIEWED | CLI/disposable baseline | remote apply report | unassigned | baseline |
| 0006 | review_drafts_and_question_bank | APPLIED_AND_REVIEWED | CLI/disposable baseline | remote apply report | unassigned | baseline |
| 0007 | blueprint_engine | APPLIED_AND_REVIEWED | CLI/disposable baseline | remote apply report | unassigned | baseline |
| 0008 | practice_agent_evidence | APPLIED_AND_REVIEWED | CLI/disposable baseline | remote apply report | unassigned | baseline |
| 0009 | course_builder_near_term | APPLIED_AND_REVIEWED | CLI/disposable baseline | remote apply report | unassigned | baseline |
| 0010 | provider_gateway_setup_rpc | APPLIED_MANUALLY_NOT_LEDGERED | SQL Editor | provider gateway report | unassigned | catalog capture pending |
| 0011 | provider_gateway_setup_rpc_role_fix | APPLIED_MANUALLY_NOT_LEDGERED | SQL Editor | provider gateway report | unassigned | catalog capture pending |
| 0012 | provider_gateway_setup_rpc_ambiguity_fix | APPLIED_MANUALLY_NOT_LEDGERED | SQL Editor | provider gateway report | unassigned | catalog capture pending |
| 0013 | provider_gateway_setup_rpc_conflict_fix | APPLIED_MANUALLY_NOT_LEDGERED | SQL Editor | provider gateway report | unassigned | catalog capture pending |
| 0014 | provider_profile_provider_check_gemini | APPLIED_MANUALLY_NOT_LEDGERED | SQL Editor | provider readiness report | unassigned | catalog capture pending |
| 0015 | question_assets_storage_bucket | APPLIED_MANUALLY_NOT_LEDGERED | SQL Editor | AI PDF quality report | unassigned | catalog capture pending |
| 0016 | review_draft_publish_lineage | APPLIED_MANUALLY_NOT_LEDGERED | SQL Editor | review lineage report | unassigned | catalog capture pending |
| 0017 | practice_sessions_session_state | APPLIED_MANUALLY_NOT_LEDGERED | SQL Editor | practice compatibility report | unassigned | catalog capture pending |
| 0018 | classroom_foundation | APPLIED_MANUALLY_NOT_LEDGERED | SQL Editor | classroom foundation report | unassigned | catalog capture pending |
| 0019 | classroom_join_code_display_and_roster_removal | APPLIED_MANUALLY_NOT_LEDGERED | SQL Editor | classroom workflow report | unassigned | catalog capture pending |
| 0020 | classroom_removed_member_rejoin_block | APPLIED_MANUALLY_NOT_LEDGERED | SQL Editor | classroom hardening report | unassigned | catalog capture pending |
| 0021 | student_work_assignments | APPLIED_MANUALLY_NOT_LEDGERED | SQL Editor | Student My Work report | unassigned | catalog capture pending |
| 0022 | student_work_assignment_policy_fix | APPLIED_MANUALLY_NOT_LEDGERED | SQL Editor | student policy report | unassigned | catalog capture pending |
| 0023 | student_work_assignment_manager_scope_fix | APPLIED_MANUALLY_NOT_LEDGERED | SQL Editor | manager-scope report | unassigned | catalog capture pending |
| 0024 | assignment_source_metadata | APPLIED_MANUALLY_NOT_LEDGERED | SQL Editor | bridge report | unassigned | catalog capture pending |
| 0025 | question_banks_foundation | APPLIED_MANUALLY_NOT_LEDGERED | SQL Editor | bank foundation report | unassigned | catalog capture pending |
| 0026 | bank_share_codes_and_members | APPLIED_MANUALLY_NOT_LEDGERED | SQL Editor | bank member report | unassigned | catalog capture pending |
| 0027 | bank_import_review_scope | APPLIED_MANUALLY_NOT_LEDGERED | SQL Editor | bank import/review report | unassigned | catalog capture pending |
| 0028 | assignment_from_bank_questions | APPLIED_MANUALLY_NOT_LEDGERED | SQL Editor | assignment-from-bank report | unassigned | catalog capture pending |
| 0029 | teacher_role_bank_public_boundary | APPLIED_MANUALLY_NOT_LEDGERED | SQL Editor | boundary report | unassigned | catalog capture pending |
| 0030 | teacher_classroom_rls_fix | APPLIED_MANUALLY_NOT_LEDGERED | SQL Editor | classroom RLS report | unassigned | catalog capture pending |
| 0031 | blueprint_library_foundation | APPLIED_MANUALLY_NOT_LEDGERED | SQL Editor | Blueprint Library report | unassigned | catalog capture pending |
| 0032 | google_account_links | UNAPPLIED_BLOCKED | blocked | Google design review | unassigned | never apply this artifact |
| 0032 | teacher_feedback_notes | APPLIED_MANUALLY_NOT_LEDGERED | SQL Editor | feedback-notes apply report | unassigned | active 0032 exception |
| 0033 | ai_provider_jobs | APPLIED_MANUALLY_NOT_LEDGERED | SQL Editor | durable queue report | unassigned | catalog capture pending |
| 0034 | ai_provider_jobs_worker_role_fix | APPLIED_MANUALLY_NOT_LEDGERED | SQL Editor | queue worker-role report | unassigned | catalog capture pending |
| 0035 | ai_provider_routing_circuit_breaker | APPLIED_MANUALLY_NOT_LEDGERED | SQL Editor | routing report | unassigned | catalog capture pending |
| 0036 | ai_operations_launch_readiness | UNKNOWN_REQUIRES_OWNER_DECISION | SQL Editor reported | reapply history | unassigned | fingerprint required after revert history |
| 0037 | ai_selective_execution_control | APPLIED_MANUALLY_NOT_LEDGERED | SQL Editor | selective execution report | unassigned | catalog capture pending |
| 0038 | ai_pdf_coverage_recovery_jobs | APPLIED_MANUALLY_NOT_LEDGERED | SQL Editor | coverage recovery report | unassigned | catalog capture pending |
| 0039 | profile_privileged_fields_immutability | APPLIED_MANUALLY_NOT_LEDGERED | SQL Editor | profile live validation | unassigned | applied exactly once |
| 0040 | profile_insert_and_role_transition_hardening | APPLIED_MANUALLY_NOT_LEDGERED | SQL Editor | profile live validation | unassigned | applied exactly once |
| 0041 | profile_delete_privilege_hardening | APPLIED_MANUALLY_NOT_LEDGERED | SQL Editor | profile live validation | unassigned | applied exactly once |
| 0042 | internal_provider_gateway_hardening | APPLIED_MANUALLY_NOT_LEDGERED | SQL Editor | post-0042 SQL Editor grant and alias validation | Jerry / Platform Security; Frances / Technical Operations backup pending founder confirmation | applied exactly once; anon/authenticated table access removed, service_role retained, stale helper/policy absent; runtime role/token validation remains |
| 0043 | classroom_creation_rls_hardening | PARTIALLY_APPLIED_FAILED | SQL Editor | sanitized 42723 function collision plus 0043-only helper catalog metadata | classroom security owner unassigned | do not replay; `private.can_create_classroom_in_organization(uuid)` proves pre-function statements reached live state |
| 0044 | classroom_creation_rpc_reconciliation | APPLIED_MANUALLY_NOT_LEDGERED | SQL Editor | sanitized post-0044 RPC/policy/grant metadata and completed disposable role-E2E evidence | classroom security owner unassigned | applied exactly once; final RPC hash 4ca996b5d78c040c67fd96d23bafea40; P0-CLS-01 is completed/live validated; no Supabase migration-ledger history is claimed |
| 0045 | question_read_authorization_helper | APPLIED_MANUALLY_NOT_LEDGERED | SQL Editor | live catalog validation plus exact-ID pre-cutover authorization matrix | storage security owner unassigned | applied exactly once; private helper has no browser or service-role execute grant, public wrapper is the only browser-callable authorization surface |
| 0046 | question_assets_bucket_private | APPLIED_MANUALLY_NOT_LEDGERED | SQL Editor | clean-database private-bucket post-cutover validation | storage security owner unassigned | applied exactly once; exactly one `question-assets` bucket is private, all nine residual checks are zero, direct public URL is denied, exact-ID cleanup passed; no historical-data backfill was needed or run |
| 0047 | practice_self_study_evidence_isolation | APPLIED_MANUALLY_NOT_LEDGERED | SQL Editor | sanitized helper catalog validation plus completed disposable role matrix | student security owner unassigned | applied exactly once; helpers are boolean, SECURITY DEFINER, postgres-owned, fixed-search-path; anon direct EXECUTE denied, authenticated policy-evaluation EXECUTE retained, service-role direct EXECUTE denied; P1-STUDENT-01 clean-db live validation completed with 0048 |
| 0048 | practice_course_framework_evidence_isolation | APPLIED_MANUALLY_NOT_LEDGERED | SQL Editor | sanitized post-apply catalog counts plus completed disposable framework-boundary role matrix | student security owner unassigned | applied exactly once; legacy policy count 0, Assignment-manager policy count 2, validated helper count 3, and RLS-enabled affected-table count 11; no ledger history is claimed |
| 0049 | practice_agent_provider_routing | NOT_YET_APPLIED | pending forward-only deployment migration | repository review and static security smoke | practice owner unassigned | canonical mainline Practice routing migration; no live application is claimed |
| 0050 | pdf50_burst_upload_admission | UNAPPLIED_PENDING_SEQUENCE_REVALIDATION | not applied | source-only migration sequence reconciliation | PDF50 release owner unassigned | PDF50 moved forward after main reserved 0049; localhost fresh-chain and upgrade reruns remain required; no hosted apply is claimed |

The complete machine-readable inventory, including exact filenames and status
labels, is `docs/security/live-schema-manifest.json`.

## Provider Gateway Ownership Record

The gateway is an **internal** server-side control for super-admin Admin / AI
Settings, not a third-party routing service. It carries only a server-only
gateway token to narrow safe-metadata and mutation RPCs. Provider execution and
workers resolve credentials directly through service role; they do not receive
the gateway token. Jerry / Platform Security is the primary gateway and token
rotation owner. Frances / Technical Operations is the designated backup, pending
founder confirmation before live rotation.

Migration `0042_internal_provider_gateway_hardening.sql` was applied exactly
once through SQL Editor. Sanitized validation confirmed no direct `anon` or
`authenticated` table privileges, retained `service_role` access, and absence
of the stale helper/policy. The register deliberately does not fabricate a
Supabase internal migration-ledger record. Runtime super-admin/token boundary
validation remains before the broader reconciliation gate can close.
