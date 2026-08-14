# Appendix — RPC Call-Site Census (2026-08-13)

All 92 `public.*` functions from `supabase/clean-migrations/`, matched (word-boundary) against `src/`, `scripts/`, `test/`. `src/types/database.ts` hits count as type-only. Sorted by src refs ascending — top rows are the no-app-caller set discussed in doc 13.

| function | src | scripts/test | src files (≤3) | script files (≤2) |
|---|---|---|---|---|
| approve_review_item_to_bank | 0 | 0 |  |  |
| get_admin_ai_pdf_workspace_v1 | 0 | 0 |  |  |
| taxonomy_tag_path | 0 | 1 |  | scripts/security-smoke.mjs |
| approve_bank_review_questions | 0 | 2 |  | scripts/library-governance-db-smoke.mjs<br>scripts/teacher-bulk-workflow-smoke.mjs |
| get_ai_provider_profile_for_gateway | 0 | 2 |  | scripts/provider-gateway-hardening-smoke.mjs<br>scripts/security-smoke.mjs |
| link_google_to_current_profile | 0 | 2 |  | scripts/google-account-links-apply-smoke.mjs<br>scripts/google-account-links-rls-smoke.mjs |
| record_google_signin | 0 | 2 |  | scripts/google-account-links-apply-smoke.mjs<br>scripts/google-account-links-rls-smoke.mjs |
| reject_google_link | 0 | 2 |  | scripts/google-account-links-apply-smoke.mjs<br>scripts/google-account-links-rls-smoke.mjs |
| setup_ai_provider_gateway_token_hash | 0 | 2 |  | scripts/ai-provider-fallback-chaos-smoke.mjs<br>scripts/setup-clean-provider-gateway-token.mjs |
| unlink_google_account | 0 | 2 |  | scripts/google-account-links-apply-smoke.mjs<br>scripts/google-account-links-rls-smoke.mjs |
| publish_review_draft_questions | 0 | 4 |  | scripts/library-governance-db-smoke.mjs<br>scripts/pdf50-burst-security-smoke.mjs |
| approve_bank_review_question | 0 | 9 |  | scripts/ai-parsing-coverage-recovery-executor-smoke.mjs<br>scripts/bank-import-review-smoke.mjs |
| ensure_bank_import_review_lineage | 1 | 0 | src/lib/batch-import/service.ts |  |
| get_teacher_bank_import_workspace_v1 | 1 | 1 | src/lib/question-banks.ts | scripts/teacher-import-workspace-read-model-smoke.mjs |
| list_ai_provider_routing_policies_for_gateway | 1 | 1 | src/lib/ai-providers/routing.ts | scripts/ai-provider-fallback-chaos-smoke.mjs |
| review_public_question_submission | 1 | 1 | src/types/database.ts | scripts/library-governance-smoke.mjs |
| begin_ai_provider_job_pdf_processing_fenced | 1 | 2 | src/lib/ai-jobs/checkpoint.ts | scripts/pdf50-local-0051-release-gate.mjs<br>scripts/pdf50-worker-checkpoint-smoke.mjs |
| checkpoint_ai_provider_job_provider_result | 1 | 2 | src/lib/ai-jobs/checkpoint.ts | scripts/pdf50-local-0051-release-gate.mjs<br>scripts/pdf50-worker-checkpoint-smoke.mjs |
| create_teacher_focus_selection_receipt | 1 | 2 | src/lib/teacher-focus-selection.ts | scripts/library-governance-db-smoke.mjs<br>scripts/teacher-bulk-workflow-smoke.mjs |
| heartbeat_ai_provider_job_fenced | 1 | 2 | src/lib/ai-jobs/checkpoint.ts | scripts/pdf50-local-0051-release-gate.mjs<br>scripts/pdf50-worker-checkpoint-smoke.mjs |
| read_teacher_focus_selection_receipt | 1 | 2 | src/lib/teacher-focus-selection.ts | scripts/library-governance-db-smoke.mjs<br>scripts/teacher-bulk-workflow-smoke.mjs |
| set_bank_question_statuses | 1 | 2 | src/app/teacher/banks/actions.ts | scripts/library-governance-db-smoke.mjs<br>scripts/teacher-bulk-workflow-smoke.mjs |
| submit_bank_questions_to_public_review_for_bank | 1 | 2 | src/app/teacher/banks/actions.ts | scripts/library-governance-db-smoke.mjs<br>scripts/teacher-bulk-workflow-smoke.mjs |
| acquire_ai_provider_half_open_probe | 1 | 3 | src/lib/ai-providers/routing.ts | scripts/ai-provider-fallback-chaos-smoke.mjs<br>scripts/ai-provider-fallback-circuit-breaker-smoke.mjs |
| checkpoint_ai_provider_job_stage | 1 | 3 | src/lib/ai-jobs/checkpoint.ts | scripts/pdf50-local-0051-release-gate.mjs<br>scripts/pdf50-scale-qualification-live-e2e.mjs |
| finish_ai_provider_job_fenced | 1 | 3 | src/lib/ai-jobs/checkpoint.ts | scripts/pdf50-local-0051-release-gate.mjs<br>scripts/pdf50-worker-checkpoint-smoke.mjs |
| heartbeat_ai_provider_job | 1 | 3 | src/types/database.ts | scripts/durable-ai-job-queue-live-smoke.mjs<br>scripts/durable-ai-job-queue-smoke.mjs |
| persist_ai_provider_job_import_item_fenced | 1 | 3 | src/lib/batch-import/service.ts | scripts/pdf50-local-0051-release-gate.mjs<br>scripts/pdf50-worker-checkpoint-smoke.mjs |
| read_ai_provider_job_provider_result_checkpoint | 1 | 4 | src/lib/ai-jobs/checkpoint.ts | scripts/pdf50-end-to-end-live-e2e-safety-smoke.mjs<br>scripts/pdf50-end-to-end-live-e2e.mjs |
| cancel_ai_pdf_upload_burst_items | 1 | 6 | src/app/teacher/banks/pdf-burst-actions.ts | scripts/pdf50-clone-history-repair.mjs<br>scripts/pdf50-hosted-0050-apply.mjs |
| list_ai_provider_runtime_states_for_worker | 1 | 6 | src/lib/ai-providers/routing.ts | scripts/ai-provider-fallback-chaos-smoke.mjs<br>scripts/ai-provider-fallback-circuit-breaker-smoke.mjs |
| upsert_ai_provider_routing_policy_for_gateway | 1 | 6 | src/lib/ai-providers/routing.ts | scripts/ai-provider-fallback-chaos-smoke.mjs<br>scripts/pdf50-hosted-0050-apply.mjs |
| finish_ai_provider_job | 1 | 7 | src/types/database.ts | scripts/ai-operations-live-validation.mjs<br>scripts/ai-parsing-selective-execution-live-smoke.mjs |
| record_ai_provider_route_outcome | 1 | 8 | src/lib/ai-providers/routing.ts | scripts/ai-operations-live-validation.mjs<br>scripts/ai-provider-fallback-chaos-smoke.mjs |
| release_ai_pdf_burst_admission_jobs | 1 | 9 | src/lib/ai-pdf-import/burst-admission.ts | scripts/pdf50-clone-history-repair.mjs<br>scripts/pdf50-hosted-0050-apply.mjs |
| reserve_ai_pdf_upload_burst | 1 | 11 | src/app/teacher/banks/pdf-burst-actions.ts | scripts/ai-parsing-status-review-qa-smoke.mjs<br>scripts/ai-pdf-provider-failure-status-smoke.mjs |
| list_ai_provider_runtime_states_for_admin | 2 | 0 | src/lib/ai-operations/dashboard.ts<br>src/types/database.ts |  |
| archive_library_questions_v2 | 2 | 1 | src/app/admin/questions/actions.ts<br>src/types/database.ts | scripts/official-public-library-0076-hosted-apply.mjs |
| claim_practice_ai_request | 2 | 1 | src/lib/practice/admission.ts<br>src/types/database.ts | scripts/practice-0072-0073-hosted-apply.mjs |
| count_bank_question_rows_v2 | 2 | 1 | src/lib/question-banks.ts<br>src/types/database.ts | scripts/official-public-library-0076-hosted-apply.mjs |
| create_ai_provider_profile_for_gateway | 2 | 1 | src/app/admin/ai-settings/actions.ts<br>src/types/database.ts | scripts/provider-gateway-hardening-smoke.mjs |
| delete_ai_provider_profile_for_gateway | 2 | 1 | src/app/admin/ai-settings/actions.ts<br>src/types/database.ts | scripts/provider-gateway-hardening-smoke.mjs |
| initialize_practice_session_sources | 2 | 1 | src/lib/practice/persistence.ts<br>src/types/database.ts | scripts/practice-library-scope-finish-smoke.mjs |
| revoke_bank_share_code | 2 | 1 | src/app/teacher/banks/actions.ts<br>src/types/database.ts | scripts/bank-share-members-smoke.mjs |
| search_bank_question_rows_v2 | 2 | 1 | src/lib/question-banks.ts<br>src/types/database.ts | scripts/official-public-library-0076-hosted-apply.mjs |
| submit_bank_questions_to_public_review | 2 | 1 | src/app/teacher/banks/actions.ts<br>src/types/database.ts | scripts/library-governance-smoke.mjs |
| update_ai_provider_profile_for_gateway | 2 | 1 | src/app/admin/ai-settings/actions.ts<br>src/types/database.ts | scripts/provider-gateway-hardening-smoke.mjs |
| withdraw_public_question_submission | 2 | 1 | src/app/teacher/banks/actions.ts<br>src/types/database.ts | scripts/library-governance-smoke.mjs |
| attach_official_question_revision_assets_v2 | 2 | 2 | src/app/admin/questions/actions.ts<br>src/types/database.ts | scripts/official-public-library-0076-hosted-apply.mjs<br>scripts/official-public-library-smoke.mjs |
| claim_practice_ai_inflight_lease | 2 | 2 | src/lib/practice/admission.ts<br>src/types/database.ts | scripts/practice-0072-0073-hosted-apply.mjs<br>scripts/practice-ai-concurrency-smoke.mjs |
| count_bank_question_rows | 2 | 2 | src/lib/question-banks.ts<br>src/types/database.ts | scripts/library-governance-smoke.mjs<br>scripts/teacher-bank-loading-performance-smoke.mjs |
| create_bank_manual_question_draft | 2 | 2 | src/app/teacher/banks/bank-media-actions.ts<br>src/types/database.ts | scripts/library-governance-db-smoke.mjs<br>scripts/library-governance-smoke.mjs |
| create_bank_question_revision_draft | 2 | 2 | src/app/teacher/banks/actions.ts<br>src/types/database.ts | scripts/library-governance-db-smoke.mjs<br>scripts/library-governance-smoke.mjs |
| get_active_taxonomy_catalog_v1 | 2 | 2 | src/lib/tags/taxonomy-db.ts<br>src/types/database.ts | scripts/ai-parsing-eval/runtime-contract-smoke.mjs<br>scripts/taxonomy-catalog-loading-performance-smoke.mjs |
| list_ai_provider_profiles_for_gateway | 2 | 2 | src/lib/ai-providers/profiles.ts<br>src/types/database.ts | scripts/provider-gateway-hardening-smoke.mjs<br>scripts/student-assignment-practice-live-e2e.mjs |
| list_selectable_practice_sources | 2 | 2 | src/app/api/practice/sources/route.ts<br>src/types/database.ts | scripts/practice-0072-0073-hosted-apply.mjs<br>scripts/practice-library-scope-finish-smoke.mjs |
| list_teacher_question_bank_summaries_v1 | 2 | 2 | src/lib/question-banks.ts<br>src/types/database.ts | scripts/taxonomy-catalog-loading-performance-smoke.mjs<br>scripts/teacher-bank-loading-performance-smoke.mjs |
| lock_practice_session_sources_for_round | 2 | 2 | src/app/api/practice/recommend/route.ts<br>src/types/database.ts | scripts/google-account-links-baseline-smoke.mjs<br>scripts/practice-library-scope-finish-smoke.mjs |
| record_ai_operation_telemetry | 2 | 2 | src/lib/ai-operations/telemetry.ts<br>src/types/database.ts | scripts/ai-operations-live-validation.mjs<br>scripts/security-smoke.mjs |
| release_practice_ai_inflight_lease | 2 | 2 | src/lib/practice/admission.ts<br>src/types/database.ts | scripts/practice-0072-0073-hosted-apply.mjs<br>scripts/practice-ai-concurrency-smoke.mjs |
| reset_ai_provider_runtime_state_for_admin | 2 | 2 | src/app/admin/ai-settings/actions.ts<br>src/types/database.ts | scripts/ai-operations-live-validation.mjs<br>scripts/security-smoke.mjs |
| reset_my_practice_progress | 2 | 2 | src/app/api/practice/progress/reset/route.ts<br>src/types/database.ts | scripts/practice-0072-0073-hosted-apply.mjs<br>scripts/practice-cycle-reset-smoke.mjs |
| review_public_question_submission_v2 | 2 | 2 | src/app/admin/questions/governance-actions.ts<br>src/types/database.ts | scripts/library-governance-db-smoke.mjs<br>scripts/official-public-library-0076-hosted-apply.mjs |
| search_practice_questions_in_session | 2 | 2 | src/lib/practice/tools.ts<br>src/types/database.ts | scripts/practice-0072-0073-hosted-apply.mjs<br>scripts/practice-library-scope-finish-smoke.mjs |
| transition_profile_role_as_super_admin | 2 | 2 | src/app/admin/users/actions.ts<br>src/types/database.ts | scripts/profile-role-immutability-smoke.mjs<br>scripts/security-smoke.mjs |
| count_bank_review_questions | 2 | 3 | src/lib/question-banks.ts<br>src/types/database.ts | scripts/library-governance-db-smoke.mjs<br>scripts/library-governance-smoke.mjs |
| enqueue_ai_provider_job | 2 | 3 | src/lib/ai-jobs/queue.ts<br>src/types/database.ts | scripts/ai-operations-live-validation.mjs<br>scripts/durable-ai-job-queue-e2e-smoke.mjs |
| list_enabled_ai_provider_profiles_for_gateway | 2 | 3 | src/lib/ai-providers/profiles.ts<br>src/types/database.ts | scripts/practice-provider-execution-smoke.mjs<br>scripts/provider-gateway-hardening-smoke.mjs |
| pull_public_question_to_bank | 2 | 3 | src/app/teacher/banks/actions.ts<br>src/types/database.ts | scripts/library-governance-db-smoke.mjs<br>scripts/library-governance-smoke.mjs |
| resume_quarantined_assignment | 2 | 3 | src/app/teacher/classrooms/[id]/assignments/[assignmentId]/delivery-actions.ts<br>src/types/database.ts | scripts/library-governance-db-smoke.mjs<br>scripts/library-governance-smoke.mjs |
| search_bank_review_question_ids | 2 | 3 | src/lib/question-banks.ts<br>src/types/database.ts | scripts/library-governance-db-smoke.mjs<br>scripts/library-governance-smoke.mjs |
| add_classroom_co_teacher | 2 | 4 | src/app/teacher/classrooms/actions.ts<br>src/types/database.ts | scripts/classroom-create-rls-smoke.mjs<br>scripts/classroom-live-role-e2e.mjs |
| create_bank_share_code | 2 | 4 | src/app/teacher/banks/actions.ts<br>src/types/database.ts | scripts/bank-share-members-smoke.mjs<br>scripts/route-smoke.mjs |
| join_question_bank_by_code | 2 | 4 | src/app/teacher/banks/actions.ts<br>src/types/database.ts | scripts/bank-share-members-smoke.mjs<br>scripts/route-smoke.mjs |
| remove_bank_member | 2 | 4 | src/app/teacher/banks/actions.ts<br>src/types/database.ts | scripts/bank-share-members-smoke.mjs<br>scripts/route-smoke.mjs |
| remove_classroom_co_teacher | 2 | 4 | src/app/teacher/classrooms/actions.ts<br>src/types/database.ts | scripts/classroom-create-rls-smoke.mjs<br>scripts/classroom-live-role-e2e.mjs |
| update_bank_member_role | 2 | 4 | src/app/teacher/banks/actions.ts<br>src/types/database.ts | scripts/bank-share-members-smoke.mjs<br>scripts/route-smoke.mjs |
| get_ai_operations_worker_control | 2 | 5 | src/lib/ai-operations/telemetry.ts<br>src/types/database.ts | scripts/ai-jobs-scheduler-simulation.mjs<br>scripts/ai-operations-live-validation.mjs |
| search_questions_by_taxonomy | 2 | 6 | src/app/admin/videos/page.tsx<br>src/types/database.ts | scripts/admin-question-loading-performance-smoke.mjs<br>scripts/bank-import-review-smoke.mjs |
| can_read_question_asset | 2 | 7 | src/app/api/question-assets/[assetId]/route.ts<br>src/types/database.ts | scripts/ai-parsing-eval/question-asset-authorization-evidence.mjs<br>scripts/library-governance-db-smoke.mjs |
| claim_ai_provider_jobs | 2 | 7 | src/lib/ai-jobs/worker.ts<br>src/types/database.ts | scripts/ai-operations-live-validation.mjs<br>scripts/ai-parsing-selective-execution-live-smoke.mjs |
| set_classroom_student_membership_status | 2 | 14 | src/app/teacher/classrooms/actions.ts<br>src/types/database.ts | scripts/assignment-from-bank-smoke.mjs<br>scripts/assignment-practice-evidence-smoke.mjs |
| join_classroom_by_code | 2 | 17 | src/app/student/classrooms/join/actions.ts<br>src/types/database.ts | scripts/assignment-from-bank-smoke.mjs<br>scripts/assignment-practice-evidence-smoke.mjs |
| create_teacher_classroom | 2 | 19 | src/app/teacher/classrooms/actions.ts<br>src/types/database.ts | scripts/assignment-from-bank-smoke.mjs<br>scripts/assignment-practice-evidence-smoke.mjs |
| create_question_bank | 2 | 21 | src/app/teacher/banks/actions.ts<br>src/types/database.ts | scripts/assignment-from-bank-smoke.mjs<br>scripts/bank-import-review-smoke.mjs |
| cancel_ai_provider_job | 3 | 2 | src/app/admin/ai-settings/actions.ts<br>src/lib/ai-jobs/queue.ts<br>src/types/database.ts | scripts/ai-operations-live-validation.mjs<br>scripts/durable-ai-job-queue-live-smoke.mjs |
| search_bank_question_rows | 3 | 2 | src/app/teacher/banks/[bankId]/questions/page.tsx<br>src/lib/question-banks.ts<br>src/types/database.ts | scripts/library-governance-smoke.mjs<br>scripts/teacher-bank-loading-performance-smoke.mjs |
| finalize_ai_provider_job_import_batch_fenced | 3 | 3 | src/lib/ai-jobs/checkpoint.ts<br>src/lib/ai-pdf-import/service.ts<br>src/lib/batch-import/service.ts | scripts/pdf50-local-0051-release-gate.mjs<br>scripts/pdf50-worker-checkpoint-smoke.mjs |
| approve_library_questions_v2 | 3 | 7 | src/app/admin/questions/actions.ts<br>src/app/teacher/banks/actions.ts<br>src/types/database.ts | scripts/ai-parsing-status-review-qa-smoke.mjs<br>scripts/bank-import-review-smoke.mjs |
| create_assignment_from_bank | 3 | 12 | src/app/teacher/banks/actions.ts<br>src/app/teacher/publish/actions.ts<br>src/types/database.ts | scripts/assignment-creation-idempotency-db-smoke.mjs<br>scripts/assignment-from-bank-smoke.mjs |
| create_global_manual_question_draft | 4 | 1 | src/app/admin/questions/actions.ts<br>src/app/admin/questions/asset-actions.ts<br>src/app/admin/questions/source-file-actions.ts | scripts/teacher-role-bank-boundary-smoke.mjs |
| search_official_public_questions_v2 | 4 | 9 | src/app/admin/questions/page.tsx<br>src/app/questions/page.tsx<br>src/app/teacher/banks/[bankId]/questions/page.tsx | scripts/bank-import-review-smoke.mjs<br>scripts/library-governance-smoke.mjs |
