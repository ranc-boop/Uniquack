# Current Clean DB History Divergence Register

> **PRE-SEQUENCE-RECONCILIATION RECORD.** This bounded read-only audit was
> prepared before main reserved canonical `0049` for Practice routing and
> PDF50 moved to `0050`. It is retained for forensic context only and does not
> prove the live state of Practice `0049` or PDF50 `0050`. Hosted databases are
> untouched; a new approved read-only audit is required before any forward
> upgrade decision.

Result: **LIVE_SCHEMA_HISTORY_DIVERGENCE_REQUIRES_REPAIR**

Final planning classification: **REPAIR_PLAN_READY_0050_HARDENING_REQUIRED**

This register is a sanitized read-only reconciliation of the current clean
working database. It was produced from `PDF50_CURRENT_CLEAN_DATABASE_URL` only,
under `PDF50_CURRENT_CLEAN_READONLY_AUDIT=CONFIRMED`. No `.env.local` file,
validation database URL, disposable/fresh-chain workflow, Storage API,
Supabase management API, Provider, row content, credentials, hostnames,
project refs, usernames, or database URLs were used or reported.

## Read-Only Proof

| Check | Result |
|---|---|
| Connection authenticated | PASS |
| BEGIN READ ONLY | PASS |
| transaction_read_only | ON |
| default_transaction_read_only | OFF, informational only |
| Repeatable-read isolation | PASS |
| Transaction-local statement timeout | PASS |
| Transaction-local lock timeout | PASS |
| SELECT 1 | PASS |
| Rollback | PASS |
| Transaction ended | PASS |
| Connection closed | PASS |
| Database writes | 0 |
| Provider calls | 0 |

Safety checks also confirmed the expected branch, expected HEAD, Session
Pooler mode on port 5432, pooler username project-identity shape, production
and staging denylist clearance, SSL authentication, and bounded history
result size. The repository was intentionally modified after the initial clean
check only to add this plan and the read-only audit script.

## History Model

Tracking model: **mixed historical conventions with incomplete canonical history**

| Metric | Count |
|---|---:|
| Live migration-history rows | 21 |
| Canonical exact matches | 0 |
| Canonical legacy aliases | 19 |
| Grouped or batched records | 0 |
| Unmapped records | 2 |
| Ambiguous records | 0 |

The 19 canonical rows are four-digit, prefix-compatible historical aliases for
canonical migrations `0001` through `0019`. The two remaining rows correspond
to known legacy migrations but do not safely represent any canonical clean
migration. They must remain untouched during a history repair.

## Sanitized History Register

| Row | Safe label | Classification | Canonical or legacy mapping | Repair instruction |
|---|---|---|---|---|
| HIST-001 | 0001 | CANONICAL_LEGACY_ALIAS | `0001_foundations_identity_organizations.sql` | Preserve |
| HIST-002 | 0002 | CANONICAL_LEGACY_ALIAS | `0002_provider_profiles_and_operation_logs.sql` | Preserve |
| HIST-003 | 0003 | CANONICAL_LEGACY_ALIAS | `0003_taxonomy_runtime_source.sql` | Preserve |
| HIST-004 | 0004 | CANONICAL_LEGACY_ALIAS | `0004_source_assets_and_import_jobs.sql` | Preserve |
| HIST-005 | 0005 | CANONICAL_LEGACY_ALIAS | `0005_ai_parsing_pipeline.sql` | Preserve |
| HIST-006 | 0006 | CANONICAL_LEGACY_ALIAS | `0006_review_drafts_and_question_bank.sql` | Preserve |
| HIST-007 | 0007 | CANONICAL_LEGACY_ALIAS | `0007_blueprint_engine.sql` | Preserve |
| HIST-008 | 0008 | CANONICAL_LEGACY_ALIAS | `0008_practice_agent_evidence.sql` | Preserve |
| HIST-009 | 0009 | CANONICAL_LEGACY_ALIAS | `0009_course_builder_near_term.sql` | Preserve |
| HIST-010 | 0010 | CANONICAL_LEGACY_ALIAS | `0010_provider_gateway_setup_rpc.sql` | Preserve |
| HIST-011 | 0011 | CANONICAL_LEGACY_ALIAS | `0011_provider_gateway_setup_rpc_role_fix.sql` | Preserve |
| HIST-012 | 0012 | CANONICAL_LEGACY_ALIAS | `0012_provider_gateway_setup_rpc_ambiguity_fix.sql` | Preserve |
| HIST-013 | 0013 | CANONICAL_LEGACY_ALIAS | `0013_provider_gateway_setup_rpc_conflict_fix.sql` | Preserve |
| HIST-014 | 0014 | CANONICAL_LEGACY_ALIAS | `0014_provider_profile_provider_check_gemini.sql` | Preserve |
| HIST-015 | 0015 | CANONICAL_LEGACY_ALIAS | `0015_question_assets_storage_bucket.sql` | Preserve |
| HIST-016 | 0016 | CANONICAL_LEGACY_ALIAS | `0016_review_draft_publish_lineage.sql` | Preserve |
| HIST-017 | 0017 | CANONICAL_LEGACY_ALIAS | `0017_practice_sessions_session_state.sql` | Preserve |
| HIST-018 | 0018 | CANONICAL_LEGACY_ALIAS | `0018_classroom_foundation.sql` | Preserve |
| HIST-019 | 0019 | CANONICAL_LEGACY_ALIAS | `0019_classroom_join_code_display_and_roster_removal.sql` | Preserve |
| HIST-020 | legacy-timestamp-row-20 | UNMAPPED | `fix_private_schema_function_grants_for_rls` | Keep unmapped and untouched |
| HIST-021 | legacy-timestamp-row-21 | UNMAPPED | `fix_taxonomy_closure_rebuild_safe_delete` | Keep unmapped and untouched |

For both unmapped rows, the bounded version label is a sanitized legacy
timestamp row. Each corresponds to a known legacy migration file, not a known
canonical migration group. There is no earliest or latest canonical migration
that it can safely represent. Treating either row as canonical is unsafe.

## Canonical 0001-0048 Fingerprints

Fingerprint counts are deterministic source-derived object expectations from
the active canonical migration plan, compared to bounded live catalog evidence.
They are not live row counts. Columns are: T tables, C columns, V views,
F functions, Tr triggers, I indexes, K named constraints, R RLS-enabled
tables, P policies, B buckets. Migrations `0041` and `0046` include
specialized negative/configuration checks even where source object-add counts
are zero.

| No. | File | Classification | T | C | V | F | Tr | I | K | R | P | B |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 0001 | 0001_foundations_identity_organizations.sql | FULLY_REPRESENTED_AND_RECORDED | 3 | 25 | 1 | 8 | 3 | 2 | 0 | 3 | 7 | 0 |
| 0002 | 0002_provider_profiles_and_operation_logs.sql | FULLY_REPRESENTED_AND_RECORDED | 3 | 46 | 0 | 6 | 2 | 3 | 0 | 3 | 5 | 0 |
| 0003 | 0003_taxonomy_runtime_source.sql | FULLY_REPRESENTED_AND_RECORDED | 6 | 74 | 0 | 6 | 9 | 7 | 4 | 6 | 12 | 0 |
| 0004 | 0004_source_assets_and_import_jobs.sql | FULLY_REPRESENTED_AND_RECORDED | 8 | 93 | 0 | 0 | 7 | 10 | 2 | 8 | 13 | 0 |
| 0005 | 0005_ai_parsing_pipeline.sql | FULLY_REPRESENTED_AND_RECORDED | 7 | 81 | 0 | 0 | 6 | 6 | 0 | 7 | 9 | 0 |
| 0006 | 0006_review_drafts_and_question_bank.sql | FULLY_REPRESENTED_AND_RECORDED | 13 | 117 | 0 | 2 | 8 | 7 | 5 | 11 | 18 | 0 |
| 0007 | 0007_blueprint_engine.sql | FULLY_REPRESENTED_AND_RECORDED | 7 | 79 | 0 | 0 | 4 | 6 | 3 | 6 | 9 | 0 |
| 0008 | 0008_practice_agent_evidence.sql | FULLY_REPRESENTED_AND_RECORDED | 11 | 169 | 0 | 1 | 9 | 13 | 0 | 11 | 23 | 0 |
| 0009 | 0009_course_builder_near_term.sql | FULLY_REPRESENTED_AND_RECORDED | 5 | 66 | 1 | 0 | 3 | 6 | 0 | 4 | 13 | 0 |
| 0010 | 0010_provider_gateway_setup_rpc.sql | FULLY_REPRESENTED_AND_RECORDED | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 0 |
| 0011 | 0011_provider_gateway_setup_rpc_role_fix.sql | FULLY_REPRESENTED_AND_RECORDED | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 0 |
| 0012 | 0012_provider_gateway_setup_rpc_ambiguity_fix.sql | FULLY_REPRESENTED_AND_RECORDED | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 0 |
| 0013 | 0013_provider_gateway_setup_rpc_conflict_fix.sql | FULLY_REPRESENTED_AND_RECORDED | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 0 |
| 0014 | 0014_provider_profile_provider_check_gemini.sql | FULLY_REPRESENTED_AND_RECORDED | 1 | 0 | 0 | 0 | 0 | 0 | 1 | 0 | 0 | 0 |
| 0015 | 0015_question_assets_storage_bucket.sql | FULLY_REPRESENTED_AND_RECORDED | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 3 | 1 |
| 0016 | 0016_review_draft_publish_lineage.sql | FULLY_REPRESENTED_AND_RECORDED | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 0 |
| 0017 | 0017_practice_sessions_session_state.sql | FULLY_REPRESENTED_AND_RECORDED | 3 | 7 | 0 | 0 | 0 | 1 | 6 | 0 | 0 | 0 |
| 0018 | 0018_classroom_foundation.sql | FULLY_REPRESENTED_AND_RECORDED | 3 | 28 | 0 | 5 | 3 | 4 | 0 | 3 | 10 | 0 |
| 0019 | 0019_classroom_join_code_display_and_roster_removal.sql | FULLY_REPRESENTED_AND_RECORDED | 1 | 1 | 0 | 0 | 0 | 1 | 1 | 0 | 0 | 0 |
| 0020 | 0020_classroom_removed_member_rejoin_block.sql | FULLY_REPRESENTED_HISTORY_MISSING | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 0 |
| 0021 | 0021_student_work_assignments.sql | FULLY_REPRESENTED_HISTORY_MISSING | 4 | 32 | 0 | 2 | 2 | 6 | 2 | 4 | 13 | 0 |
| 0022 | 0022_student_work_assignment_policy_fix.sql | FULLY_REPRESENTED_HISTORY_MISSING | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 2 | 0 |
| 0023 | 0023_student_work_assignment_manager_scope_fix.sql | FULLY_REPRESENTED_HISTORY_MISSING | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 2 | 0 |
| 0024 | 0024_assignment_source_metadata.sql | FULLY_REPRESENTED_HISTORY_MISSING | 1 | 3 | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0 |
| 0025 | 0025_question_banks_foundation.sql | FULLY_REPRESENTED_HISTORY_MISSING | 3 | 29 | 0 | 3 | 2 | 7 | 0 | 3 | 6 | 0 |
| 0026 | 0026_bank_share_codes_and_members.sql | FULLY_REPRESENTED_HISTORY_MISSING | 1 | 11 | 0 | 11 | 1 | 2 | 0 | 1 | 5 | 0 |
| 0027 | 0027_bank_import_review_scope.sql | FULLY_REPRESENTED_HISTORY_MISSING | 4 | 5 | 0 | 2 | 0 | 4 | 0 | 0 | 9 | 0 |
| 0028 | 0028_assignment_from_bank_questions.sql | FULLY_REPRESENTED_HISTORY_MISSING | 2 | 2 | 0 | 2 | 0 | 2 | 1 | 0 | 1 | 0 |
| 0029 | 0029_teacher_role_bank_public_boundary.sql | FULLY_REPRESENTED_HISTORY_MISSING | 0 | 0 | 0 | 2 | 0 | 0 | 0 | 0 | 4 | 0 |
| 0030 | 0030_teacher_classroom_rls_fix.sql | FULLY_REPRESENTED_HISTORY_MISSING | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 2 | 0 |
| 0031 | 0031_blueprint_library_foundation.sql | FULLY_REPRESENTED_HISTORY_MISSING | 3 | 18 | 0 | 6 | 0 | 5 | 0 | 1 | 20 | 0 |
| 0032 | 0032_teacher_feedback_notes.sql | FULLY_REPRESENTED_HISTORY_MISSING | 1 | 14 | 0 | 5 | 1 | 3 | 0 | 1 | 5 | 0 |
| 0033 | 0033_ai_provider_jobs.sql | FULLY_REPRESENTED_HISTORY_MISSING | 2 | 36 | 0 | 7 | 1 | 4 | 2 | 2 | 1 | 0 |
| 0034 | 0034_ai_provider_jobs_worker_role_fix.sql | FULLY_REPRESENTED_HISTORY_MISSING | 0 | 0 | 0 | 3 | 0 | 0 | 0 | 0 | 0 | 0 |
| 0035 | 0035_ai_provider_routing_circuit_breaker.sql | FULLY_REPRESENTED_HISTORY_MISSING | 3 | 29 | 0 | 6 | 2 | 3 | 0 | 3 | 2 | 0 |
| 0036 | 0036_ai_operations_launch_readiness.sql | FULLY_REPRESENTED_HISTORY_MISSING | 2 | 51 | 0 | 5 | 2 | 4 | 0 | 2 | 2 | 0 |
| 0037 | 0037_ai_selective_execution_control.sql | FULLY_REPRESENTED_HISTORY_MISSING | 1 | 1 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 0 |
| 0038 | 0038_ai_pdf_coverage_recovery_jobs.sql | FULLY_REPRESENTED_HISTORY_MISSING | 1 | 0 | 0 | 3 | 0 | 0 | 2 | 0 | 0 | 0 |
| 0039 | 0039_profile_privileged_fields_immutability.sql | FULLY_REPRESENTED_HISTORY_MISSING | 1 | 7 | 0 | 2 | 1 | 1 | 0 | 1 | 3 | 0 |
| 0040 | 0040_profile_insert_and_role_transition_hardening.sql | FULLY_REPRESENTED_HISTORY_MISSING | 0 | 0 | 0 | 3 | 1 | 0 | 0 | 0 | 1 | 0 |
| 0041 | 0041_profile_delete_privilege_hardening.sql | FULLY_REPRESENTED_HISTORY_MISSING | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| 0042 | 0042_internal_provider_gateway_hardening.sql | FULLY_REPRESENTED_HISTORY_MISSING | 0 | 0 | 0 | 4 | 0 | 0 | 0 | 0 | 3 | 0 |
| 0043 | 0043_classroom_creation_rls_hardening.sql | FULLY_REPRESENTED_HISTORY_MISSING | 1 | 1 | 0 | 6 | 0 | 0 | 1 | 0 | 3 | 0 |
| 0044 | 0044_classroom_creation_rpc_reconciliation.sql | FULLY_REPRESENTED_HISTORY_MISSING | 1 | 1 | 0 | 6 | 0 | 0 | 1 | 0 | 3 | 0 |
| 0045 | 0045_question_read_authorization_helper.sql | FULLY_REPRESENTED_HISTORY_MISSING | 0 | 0 | 0 | 2 | 0 | 0 | 0 | 0 | 0 | 0 |
| 0046 | 0046_question_assets_bucket_private.sql | FULLY_REPRESENTED_HISTORY_MISSING | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| 0047 | 0047_practice_self_study_evidence_isolation.sql | FULLY_REPRESENTED_HISTORY_MISSING | 11 | 0 | 0 | 3 | 0 | 0 | 0 | 11 | 75 | 0 |
| 0048 | 0048_practice_course_framework_evidence_isolation.sql | FULLY_REPRESENTED_HISTORY_MISSING | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 2 | 0 |

Summary:

- Fully represented and recorded: `0001-0019` (19 migrations).
- Fully represented with canonical history missing: `0020-0048` (29 migrations).
- Fully represented by grouped history: none.
- Partially represented: none for `0001-0048`.
- Absent: none for `0001-0048`.
- Not safely determinable: none for `0001-0048`.
- Highest consecutive canonical head: `0048`.
- Canonical objects present without matching history: `0020-0048`.
- History entries whose required canonical objects are absent: none.

## 0050 Status

Migration `0050_pdf50_burst_upload_admission.sql` is not recorded in migration
history. Its live status is **PARTIALLY_PRESENT**.

| 0050 category | Expected | Present |
|---|---:|---:|
| Tables | 2 | 0 |
| Columns | 44 | 0 |
| Views | 0 | 0 |
| Functions | 11 | 0 |
| Triggers | 6 | 0 |
| Indexes | 4 | 0 |
| Named constraints | 0 | 0 |
| RLS-enabled tables | 2 | 0 |
| Policies | 5 | 0 |
| Buckets | 1 | 1 |
| Total expected objects | 75 | 1 |

The only currently present 0050 object category is the `ai-import-sources`
bucket. That bucket predates canonical 0050 through runtime/manual creation.
Potential 0050 collision categories: buckets only.

## Noncanonical Partition

The prior noncanonical counts were parser candidates, not all application
divergence. The corrected partition separates Supabase platform objects,
PostgreSQL-generated objects, parser misses, and real application objects
outside the canonical chain.

Against canonical `0050`:

| Category | Total candidates | Supabase platform | PostgreSQL generated | Parser miss | Application outside canonical | Unknown |
|---|---:|---:|---:|---:|---:|---:|
| Tables | 9 | 8 | 0 | 0 | 1 | 0 |
| Columns | 0 | 0 | 0 | 0 | 0 | 0 |
| Views | 0 | 0 | 0 | 0 | 0 | 0 |
| Functions | 0 | 0 | 0 | 0 | 0 | 0 |
| Triggers | 4 | 4 | 0 | 0 | 0 | 0 |
| Indexes | 8 | 8 | 0 | 0 | 0 | 0 |
| Constraints | 657 | 0 | 657 | 0 | 0 | 0 |
| RLS | 9 | 8 | 0 | 0 | 1 | 0 |
| Policies | 3 | 0 | 0 | 0 | 3 | 0 |
| Buckets | 0 | 0 | 0 | 0 | 0 | 0 |

True application objects outside the canonical chain:

- `private.ai_router_credential_hashes` table and RLS enablement.
- `storage.objects.ai_import_sources_admin_delete` policy.
- `storage.objects.ai_import_sources_admin_read` policy.
- `storage.objects.ai_import_sources_admin_upload` policy.

Against canonical `0048`, the `ai-import-sources` bucket is also an
application object outside the chain. Against canonical `0050`, it is a
partial 0050 object, not noncanonical.

No table, trigger, index, generated constraint, or platform Storage catalog
object should be dropped merely because it appeared in a noncanonical count.
The private provider-gateway table/RLS and the legacy Storage policies are
application-owned residuals that must be preserved or handled only by a
separately reviewed forward migration.

## Divergence Classification

The current live schema has full canonical object coverage through `0048`, but
the migration ledger records only canonical aliases through `0019`. It is not
an exact pure canonical-0048 schema because it also contains the preexisting
`ai-import-sources` bucket, three legacy admin Storage policies, and one
private provider-gateway table/RLS outside the canonical chain.

Required repair scope for a clone:

- Preserve all 21 existing history rows.
- Do not reinterpret HIST-020 or HIST-021 as canonical.
- Add or repair canonical history for `0020-0048` only after the object
  fingerprints above pass on the clone.
- Confirm the next canonical apply starts at `0050`.
- Harden 0050 bucket adoption before using 0050 against a clone that already
  has `ai-import-sources`.

No live repair, migration application, Storage mutation, row mutation, or
Provider call is authorized by this register.
