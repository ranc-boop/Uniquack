export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type UserRole = "super_admin" | "admin" | "teacher" | "student";
export type ContentStatus =
  | "draft"
  | "review"
  | "published"
  | "archived"
  | "deprecated";
export type QuestionType = "mcq" | "fill_blank" | "frq" | "mixed";
export type QuestionSourceFormat = "markdown_latex" | "html" | "plain_text";
export type TaxonomyStatus = "active" | "deprecated" | "archived";
export type TaxonomyNodeKind = "subject" | "facet_root" | "tag";
export type TaxonomyReviewStatus =
  | "pending_review"
  | "approved"
  | "rejected"
  | "needs_review"
  | "archived";
export type ImportBatchAssetRole =
  | "source_pdf"
  | "ai_crop_candidate"
  | "unmatched"
  | "other";
export type ImportBatchAssetStatus =
  | "pending"
  | "ready"
  | "failed"
  | "deleted";

export type AIProviderProfile = {
  id: string;
  name: string;
  provider: string;
  base_url: string;
  model: string;
  api_key_ciphertext: string | null;
  api_key_iv: string | null;
  api_key_tag: string | null;
  api_key_last4: string | null;
  enabled: boolean;
  is_default: boolean;
  supports_pdf_input: boolean;
  supports_vision_images: boolean;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type AIProviderProfileSafe = Pick<
  AIProviderProfile,
  | "id"
  | "name"
  | "provider"
  | "base_url"
  | "model"
  | "enabled"
  | "is_default"
  | "supports_pdf_input"
  | "supports_vision_images"
  | "api_key_last4"
  | "created_at"
  | "updated_at"
>;

export type AIOperationsControl = {
  id: string;
  organization_id: string | null;
  operation_kind: string | null;
  selective_execution_enabled: boolean;
  pause_new_enqueues: boolean;
  pause_worker_claims: boolean;
  daily_estimated_cost_micros: number;
  monthly_estimated_cost_micros: number;
  queue_cost_reservation_micros: number;
  max_jobs_per_invocation: number;
  max_provider_calls_per_execution: number;
  alert_queue_depth: number;
  alert_oldest_queue_seconds: number;
  alert_worker_stale_seconds: number;
  alert_circuit_open_seconds: number;
  alert_fallback_rate_basis_points: number;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type AIOperationTelemetry = {
  id: string;
  organization_id: string;
  queue_job_id: string | null;
  operation_kind: string;
  provider_profile_id: string | null;
  provider: string | null;
  model: string | null;
  route_policy_version: number | null;
  route_position: number | null;
  fallback_used: boolean;
  provider_call_count: number;
  provider_retry_attempts: number;
  queue_execution_attempt: number;
  actual_input_tokens: number | null;
  actual_cached_input_tokens: number | null;
  actual_output_tokens: number | null;
  actual_total_tokens: number | null;
  estimated_input_tokens: number | null;
  estimated_output_tokens: number | null;
  estimated_total_tokens: number | null;
  estimated_input_cost_micros: number | null;
  estimated_cached_input_cost_micros: number | null;
  estimated_output_cost_micros: number | null;
  estimated_total_cost_micros: number | null;
  queue_wait_ms: number | null;
  provider_latency_ms: number | null;
  execution_latency_ms: number | null;
  drafts_created: number;
  final_status: "completed" | "retry_wait" | "failed" | "cancelled" | "skipped";
  safe_error_code: string | null;
  circuit_outcome: "closed" | "fallback" | "half_open_probe" | "open" | "unavailable";
  created_at: string;
};

export type Profile = {
  id: string;
  username: string;
  email: string | null;
  full_name: string | null;
  avatar_url: string | null;
  display_name: string | null;
  role: UserRole;
  status: "active" | "disabled";
  default_organization_id: string | null;
  created_at: string;
  updated_at: string;
};

export type Organization = {
  id: string;
  name: string;
  slug: string;
  status: "active" | "disabled" | "archived";
  created_at: string;
  updated_at: string;
};

export type OrganizationMember = {
  id: string;
  organization_id: string;
  user_id: string;
  role: "admin" | "teacher" | "student";
  status: "active" | "invited" | "disabled";
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type Classroom = {
  id: string;
  organization_id: string;
  owner_id: string;
  name: string;
  description: string | null;
  subject: string | null;
  status: "active" | "archived";
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type ClassroomMember = {
  id: string;
  classroom_id: string;
  user_id: string;
  role: "teacher" | "co_teacher" | "student";
  status: "active" | "invited" | "removed";
  joined_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ClassroomJoinCode = {
  id: string;
  classroom_id: string;
  code_hash: string;
  code_hint: string | null;
  display_code: string | null;
  status: "active" | "revoked" | "expired";
  expires_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type QuestionBankVisibility =
  | "private"
  | "shared"
  | "organization"
  | "public";
export type QuestionBankStatus = "active" | "archived" | "disabled";
export type QuestionBankOwnerScope = "user" | "organization" | "system";
export type QuestionApprovalStatus = "pending" | "approved";
export type QuestionGradingCapability =
  | "deterministic"
  | "ai_review"
  | "needs_configuration";
export type BankMemberRole = "owner" | "editor" | "viewer";
export type BankMemberStatus = "active" | "invited" | "removed";

export type QuestionBank = {
  id: string;
  organization_id: string | null;
  owner_id: string | null;
  owner_scope: QuestionBankOwnerScope;
  system_key: "official_public" | null;
  name: string;
  description: string | null;
  visibility: QuestionBankVisibility;
  status: QuestionBankStatus;
  metadata: Json;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type OfficialQuestionBank = Omit<
  QuestionBank,
  "organization_id" | "owner_id" | "owner_scope" | "system_key" | "visibility"
> & {
  organization_id: null;
  owner_id: null;
  owner_scope: "system";
  system_key: "official_public";
  visibility: "public";
};

export type BankMember = {
  id: string;
  bank_id: string;
  user_id: string;
  role: BankMemberRole;
  status: BankMemberStatus;
  invited_by: string | null;
  joined_at: string | null;
  created_at: string;
  updated_at: string;
};

export type BankQuestion = {
  id: string;
  bank_id: string;
  question_id: string;
  status: "active" | "archived" | "removed";
  source_kind:
    | "manual"
    | "review_draft"
    | "import"
    | "public_pull"
    | "course_builder";
  added_by: string | null;
  added_at: string;
  metadata: Json;
};

export type BankShareCode = {
  id: string;
  bank_id: string;
  code_hash: string;
  code_hint: string | null;
  role_granted: "viewer" | "editor";
  status: "active" | "revoked";
  created_by: string;
  expires_at: string | null;
  last_used_at: string | null;
  created_at: string;
  updated_at: string;
};

export type QuestionBlueprintVisibility =
  | "private"
  | "shared"
  | "organization"
  | "public";
export type QuestionBlueprintKind =
  | "manual"
  | "bank_generated"
  | "imported"
  | "course_builder";
export type QuestionBlueprintStatus =
  | "pending_review"
  | "approved"
  | "rejected"
  | "needs_more_evidence"
  | "archived"
  | "deprecated"
  | "trashed";

export type QuestionBlueprint = {
  id: string;
  organization_id: string | null;
  owner_scope: "system" | "school" | "teacher" | "private";
  owner_id: string | null;
  folder_id: string | null;
  status: QuestionBlueprintStatus;
  title: string;
  description: string | null;
  taxonomy_targets: Json;
  question_pattern: Json;
  required_elements: Json;
  answer_spec_pattern: Json;
  distractor_pattern: Json;
  difficulty_profile: Json;
  generation_constraints: Json;
  originality_constraints: Json;
  source_refs: Json;
  generation_ready: boolean;
  generation_readiness:
    | "uncalibrated"
    | "calibrating"
    | "generation_ready"
    | "needs_edit"
    | "blocked";
  generation_blocking_reasons: Json;
  calibration_status:
    | "not_calibrated"
    | "calibrating"
    | "calibrated"
    | "failed"
    | "invalidated";
  last_calibrated_at: string | null;
  last_calibration_run_id: string | null;
  version: number;
  created_by: string | null;
  updated_by: string | null;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  visibility: QuestionBlueprintVisibility;
  blueprint_kind: QuestionBlueprintKind;
  source_bank_id: string | null;
  source_kind: string | null;
  source_record_id: string | null;
  metadata: Json;
};

export type QuestionBlueprintFolder = {
  id: string;
  owner_scope: "system" | "school" | "teacher" | "private";
  owner_id: string | null;
  parent_id: string | null;
  name: string;
  slug: string;
  description: string | null;
  sort_order: number;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  organization_id: string | null;
  visibility: QuestionBlueprintVisibility;
  status: "active" | "archived";
};

export type BankBlueprint = {
  id: string;
  bank_id: string;
  blueprint_id: string;
  relation_kind: "linked" | "generated_from_bank" | "imported_to_bank";
  status: "active" | "archived";
  added_by: string;
  added_at: string;
  metadata: Json;
};

export type Assignment = {
  id: string;
  organization_id: string;
  classroom_id: string;
  created_by: string | null;
  title: string;
  instructions: string;
  status: "draft" | "assigned" | "archived";
  assigned_at: string | null;
  due_at: string | null;
  source_kind: "manual" | "course_builder_run" | "practice_framework" | "question_bank";
  source_record_id: string | null;
  source_summary: Json;
  created_at: string;
  updated_at: string;
};

export type AssignmentItem = {
  id: string;
  assignment_id: string;
  question_id: string | null;
  bank_question_id: string | null;
  source_bank_id: string | null;
  item_type: "question" | "practice_set" | "note";
  order_index: number;
  points: number | null;
  created_at: string;
};

export type StudentAssignmentProgress = {
  id: string;
  assignment_id: string;
  student_id: string;
  status: "not_started" | "in_progress" | "completed";
  started_at: string | null;
  completed_at: string | null;
  last_practice_session_id: string | null;
  evidence_summary: Json;
  created_at: string;
  updated_at: string;
};

export type AssignmentPracticeSession = {
  assignment_id: string;
  student_id: string;
  practice_session_id: string;
  created_at: string;
};

export type TeacherFeedbackNote = {
  id: string;
  organization_id: string;
  classroom_id: string;
  assignment_id: string;
  student_id: string | null;
  question_id: string | null;
  practice_attempt_id: string | null;
  author_id: string;
  visibility: "private_teacher" | "sent_to_student";
  status: "draft" | "sent" | "archived";
  body: string;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
};

export type TaxonomyFacet = {
  facet_key: string;
  subject_tag_id: string;
  root_tag_id: string;
  label: string;
  description: string | null;
  sort_order: number;
  status: TaxonomyStatus;
  config: Json;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type TaxonomyNode = {
  tag_id: string;
  node_kind: TaxonomyNodeKind;
  subject_tag_id: string | null;
  facet_key: string | null;
  label: string;
  description: string | null;
  is_assignable: boolean;
  sort_order: number;
  status: TaxonomyStatus;
  metadata: Json;
  deprecated_at: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type TaxonomyEdge = {
  id: string;
  from_tag_id: string;
  to_tag_id: string;
  edge_kind: "parent_child" | "related" | "maps_to";
  is_primary: boolean;
  sort_order: number;
  status: TaxonomyStatus;
  metadata: Json;
  deprecated_at: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type QuestionTaxonomyAssignment = {
  id: string;
  question_id: string;
  tag_id: string;
  confidence: number | null;
  source: "manual" | "ai_suggestion" | "batch_import" | "review_action";
  review_status: TaxonomyReviewStatus;
  evidence: Json;
  approved_by: string | null;
  approved_at: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type TaxonomyReviewAction = {
  id: string;
  action_id: string;
  question_id: string | null;
  question_ref: Json;
  action_kind:
    | "approve_bundle"
    | "reject_bundle"
    | "edit_bundle"
    | "approve_single_tag"
    | "reject_single_tag"
    | "replace_tag"
    | "mark_ambiguous"
    | "merge_alias_candidate"
    | "request_manual_review";
  target_tag_ids: string[];
  proposed_tag_ids: string[];
  reason: string;
  confidence: number | null;
  evidence: Json;
  review_status: TaxonomyReviewStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type Question = {
  id: string;
  organization_id: string;
  question_code: string;
  title: string;
  content_html: string;
  content_source: string | null;
  content_source_format: QuestionSourceFormat;
  solution_html: string | null;
  solution_source: string | null;
  solution_source_format: QuestionSourceFormat;
  answer_spec: Json;
  options: Json[];
  question_type: QuestionType;
  difficulty_rating: number;
  status: ContentStatus;
  approval_status: QuestionApprovalStatus;
  source: string | null;
  source_kind: string | null;
  source_review_item_id: string | null;
  owner_bank_id: string | null;
  revision_of_question_id: string | null;
  public_submission_id: string | null;
  visibility: QuestionBankVisibility;
  created_by: string | null;
  updated_by: string | null;
  reviewed_by: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type PublicQuestionSubmissionStatus =
  | "pending"
  | "in_review"
  | "changes_requested"
  | "accepted"
  | "rejected"
  | "withdrawn";

export type PublicQuestionSubmission = {
  id: string;
  source_bank_id: string;
  source_bank_question_id: string;
  source_question_id: string;
  supersedes_submission_id: string | null;
  submitted_snapshot: Json;
  submitted_by: string;
  status: PublicQuestionSubmissionStatus;
  review_reason: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  published_question_id: string | null;
  created_at: string;
  updated_at: string;
};

export type PublicQuestionSubmissionEvent = {
  id: string;
  submission_id: string;
  action_kind:
    | "submitted"
    | "review_started"
    | "changes_requested"
    | "accepted"
    | "rejected"
    | "withdrawn";
  actor_id: string | null;
  reason: string | null;
  evidence: Json;
  created_at: string;
};

export type Video = {
  id: string;
  question_id: string;
  title: string | null;
  video_url: string;
  embed_url: string;
  thumbnail_url: string | null;
  provider: string | null;
  duration_seconds: number | null;
  status: ContentStatus;
  created_by: string | null;
  updated_by: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

export type RubricStep = {
  id: string;
  question_id: string;
  step_order: number;
  content_html: string;
  max_points: number;
  linked_taxonomy_tag_id: string | null;
  status: ContentStatus;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type QuestionAsset = {
  id: string;
  question_id: string;
  asset_kind: "image" | "pdf" | "video" | "other";
  storage_bucket: string;
  storage_path: string;
  label: string | null;
  alt_text: string | null;
  display_order: number;
  display_on_detail: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type QuestionSourceFile = {
  id: string;
  question_id: string | null;
  object_path: string;
  mime_type: string;
  size_bytes: number;
  original_filename: string;
  status: "pending" | "ready" | "deleted";
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type ImportBatch = {
  id: string;
  organization_id: string | null;
  source_type:
    | "manual_json"
    | "manual_csv"
    | "ai_pdf"
    | "ai_image"
    | "ai_word"
    | "package"
    | "course_builder";
  source_file_id: string | null;
  target_bank_id: string | null;
  status:
    | "draft"
    | "validating"
    | "ready"
    | "imported"
    | "partial"
    | "failed"
    | "canceled";
  summary: Json;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type AIProviderJobKind =
  | "ai_pdf_extract"
  | "blueprint_generate_questions";

export type AIProviderJobStatus =
  | "queued"
  | "leased"
  | "processing"
  | "retry_wait"
  | "completed"
  | "failed"
  | "cancelled";

export type AIProviderJob = {
  id: string;
  organization_id: string;
  created_by: string;
  job_kind: AIProviderJobKind;
  resource_type: "import_batch" | "question_blueprint";
  resource_id: string;
  target_bank_id: string | null;
  provider_profile_id: string | null;
  status: AIProviderJobStatus;
  priority: number;
  fairness_key: string;
  idempotency_key: string;
  retry_generation: number;
  payload: Json;
  safe_result: Json;
  safe_error_code: string | null;
  safe_message: string | null;
  retryable: boolean;
  provider_attempt_count: number;
  execution_attempt_count: number;
  max_execution_attempts: number;
  available_at: string;
  lease_owner: string | null;
  lease_acquired_at: string | null;
  lease_expires_at: string | null;
  last_heartbeat_at: string | null;
  cancellation_requested_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  failed_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ImportBatchItem = {
  id: string;
  batch_id: string;
  item_index: number;
  raw_payload: Json;
  normalized_question_json: Json | null;
  validation_errors: Json[];
  status: "valid" | "invalid" | "imported" | "skipped";
  created_question_id: string | null;
  created_at: string;
  updated_at: string;
};

export type ImportBatchAsset = {
  id: string;
  batch_id: string;
  asset_role: ImportBatchAssetRole;
  object_path: string;
  mime_type: string;
  size_bytes: number;
  original_filename: string;
  status: ImportBatchAssetStatus;
  metadata: Json;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type PracticeSession = {
  id: string;
  user_id: string;
  title: string;
  goal: string;
  session_memory: string;
  tag_context: Json;
  completed_question_ids: string[];
  course_framework_id: string | null;
  course_framework_snapshot: Json | null;
  long_term_memory_snapshot: string;
  session_plan: Json;
  session_thread_messages: Json;
  session_state: Json;
  source_scope_locked_at: string | null;
  outline_user_notes: string;
  next_user_notes: string;
  cache_prefix_version: string;
  preference_dirty_at: string | null;
  status: "active" | "completed" | "abandoned" | "archived";
  summary: Json;
  completed_at: string | null;
  preference_merged_at: string | null;
  last_activity_at: string;
  created_at: string;
  updated_at: string;
};

export type PracticeSessionSource = {
  id: string;
  session_id: string;
  source_kind: "public_catalog" | "question_bank" | "assignment";
  bank_id: string | null;
  assignment_id: string | null;
  source_snapshot: Json;
  created_by: string;
  created_at: string;
};

export type PracticeRound = {
  id: string;
  organization_id: string | null;
  user_id: string;
  session_id: string;
  round_index: number;
  round_goal: string;
  review_summary: string | null;
  next_round_goal: string | null;
  score_correct: number;
  score_total: number;
  mode: string | null;
  provider_label: string | null;
  target_taxonomy_node_ids: string[];
  status: "active" | "completed" | "skipped";
  trace: Json;
  summary: Json;
  started_at: string;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type PracticeRoundQuestion = {
  id: string;
  user_id: string;
  session_id: string;
  round_id: string;
  question_id: string | null;
  source_question_id: string | null;
  question_code: string | null;
  title: string;
  content_html: string;
  question_type: string | null;
  difficulty_rating: number | null;
  position: number;
  question_snapshot: Json;
  reason: string | null;
  expected_skill: string | null;
  created_at: string;
  updated_at: string;
};

export type PracticeAttempt = {
  id: string;
  user_id: string;
  session_id: string;
  round_id: string;
  question_id: string | null;
  source_question_id: string | null;
  question_code: string | null;
  question_title: string;
  question_snapshot: Json;
  answer: Json;
  hint_count: number;
  hints: Json;
  grading_mode: "auto" | "manual";
  is_correct: boolean | null;
  score: number | null;
  explanation: string | null;
  solution_html: string | null;
  result: Json;
  created_at: string;
  updated_at: string;
};

export type PracticeHintEvent = {
  id: string;
  organization_id: string | null;
  user_id: string;
  session_id: string;
  round_id: string | null;
  attempt_id: string | null;
  hint_kind: "standard" | "scaffold" | "conceptual" | "worked_step";
  hint_level: number;
  prompt_context: Json;
  response_summary: string | null;
  created_at: string;
};

export type PracticeProgressReset = {
  user_id: string;
  reset_at: string;
  created_at: string;
  updated_at: string;
};

export type PracticeAiRequestWindow = {
  user_id: string;
  operation: "hint" | "preference_merge" | "recommend" | "review" | "session_title";
  window_seconds: 60 | 3600;
  window_started_at: string;
  request_count: number;
  updated_at: string;
};

export type PracticeWrongQuestion = {
  id: string;
  user_id: string;
  question_id: string | null;
  source_question_id: string;
  question_code: string | null;
  question_title: string;
  question_snapshot: Json;
  last_session_id: string | null;
  last_round_id: string | null;
  last_attempt_id: string | null;
  miss_count: number;
  last_answer: Json;
  last_explanation: string | null;
  last_missed_at: string;
  mastered_at: string | null;
  created_at: string;
  updated_at: string;
};

export type UserPracticePreference = {
  user_id: string;
  organization_id: string | null;
  long_term_preference: string;
  preferences: Json;
  summary: string | null;
  last_agent_updated_at: string | null;
  created_at: string;
  updated_at: string;
};

export type PracticePreferenceMergeJob = {
  id: string;
  organization_id: string | null;
  user_id: string;
  source_session_id: string | null;
  status: "pending" | "running" | "succeeded" | "failed";
  previous_preference: string;
  source_session_memory: string;
  source_summary: Json;
  result_preference: string | null;
  error_message: string | null;
  claimed_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type PracticeCourseFramework = {
  id: string;
  organization_id: string | null;
  title: string;
  description: string;
  framework_prompt: string;
  learning_path: Json;
  allowed_tag_ids: string[];
  priority_rules: string;
  status: "active" | "draft" | "preview" | "published" | "archived";
  framework_payload: Json;
  assigned_question_ids: string[];
  created_by: string | null;
  updated_by: string | null;
  teacher_id: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type PracticeAgentEpisode = {
  id: string;
  user_id: string;
  session_id: string;
  round_id: string | null;
  episode_index: number;
  recommend_context: Json;
  round_contract: Json;
  episode_card: Json;
  cache_thread_entry: Json;
  tool_trace_summary: Json;
  student_attempt_summary: Json;
  review_diagnosis: Json;
  memory_update: string;
  llm_usage: Json;
  created_at: string;
  updated_at: string;
};

type TableDefinition<Row, Insert = Partial<Row>, Update = Partial<Row>> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: never[];
};

export type Database = {
  public: {
    Tables: {
      organizations: TableDefinition<Organization>;
      profiles: TableDefinition<Profile>;
      organization_members: TableDefinition<OrganizationMember>;
      classrooms: TableDefinition<Classroom>;
      classroom_members: TableDefinition<ClassroomMember>;
      classroom_join_codes: TableDefinition<ClassroomJoinCode>;
      question_banks: TableDefinition<QuestionBank>;
      bank_members: TableDefinition<BankMember>;
      bank_questions: TableDefinition<BankQuestion>;
      bank_share_codes: TableDefinition<BankShareCode>;
      question_blueprints: TableDefinition<QuestionBlueprint>;
      question_blueprint_folders: TableDefinition<QuestionBlueprintFolder>;
      bank_blueprints: TableDefinition<BankBlueprint>;
      assignments: TableDefinition<Assignment>;
      assignment_items: TableDefinition<AssignmentItem>;
      student_assignment_progress: TableDefinition<StudentAssignmentProgress>;
      assignment_practice_sessions: TableDefinition<AssignmentPracticeSession>;
      teacher_feedback_notes: TableDefinition<TeacherFeedbackNote>;
      ai_provider_profiles: TableDefinition<AIProviderProfile>;
      ai_provider_jobs: TableDefinition<AIProviderJob>;
      ai_operations_controls: TableDefinition<AIOperationsControl>;
      ai_operation_telemetry: TableDefinition<AIOperationTelemetry>;
      taxonomy_facets: TableDefinition<TaxonomyFacet>;
      taxonomy_nodes: TableDefinition<TaxonomyNode>;
      taxonomy_edges: TableDefinition<TaxonomyEdge>;
      taxonomy_aliases: TableDefinition<{
        id: string;
        alias_text: string;
        normalized_alias: string;
        tag_id: string;
        status: "active" | "ambiguous" | "deprecated" | "archived";
        metadata: Json;
        deprecated_at: string | null;
        created_by: string | null;
        updated_by: string | null;
        created_at: string;
        updated_at: string;
      }>;
      taxonomy_node_closure: TableDefinition<{
        ancestor_tag_id: string;
        descendant_tag_id: string;
        depth: number;
      }>;
      questions: TableDefinition<Question>;
      public_question_submissions: TableDefinition<PublicQuestionSubmission>;
      public_question_submission_events: TableDefinition<PublicQuestionSubmissionEvent>;
      question_taxonomy_assignments: TableDefinition<QuestionTaxonomyAssignment>;
      taxonomy_review_actions: TableDefinition<TaxonomyReviewAction>;
      videos: TableDefinition<Video>;
      question_rubric_steps: TableDefinition<RubricStep>;
      question_assets: TableDefinition<QuestionAsset>;
      question_source_files: TableDefinition<QuestionSourceFile>;
      import_batches: TableDefinition<ImportBatch>;
      import_batch_items: TableDefinition<ImportBatchItem>;
      import_batch_assets: TableDefinition<ImportBatchAsset>;
      practice_sessions: TableDefinition<PracticeSession>;
      practice_session_sources: TableDefinition<PracticeSessionSource>;
      practice_rounds: TableDefinition<PracticeRound>;
      practice_round_questions: TableDefinition<PracticeRoundQuestion>;
      practice_attempts: TableDefinition<PracticeAttempt>;
      practice_hint_events: TableDefinition<PracticeHintEvent>;
      practice_ai_request_windows: TableDefinition<PracticeAiRequestWindow>;
      practice_progress_resets: TableDefinition<PracticeProgressReset>;
      practice_wrong_questions: TableDefinition<PracticeWrongQuestion>;
      user_practice_preferences: TableDefinition<UserPracticePreference>;
      practice_preference_merge_jobs: TableDefinition<PracticePreferenceMergeJob>;
      practice_course_frameworks: TableDefinition<PracticeCourseFramework>;
      practice_agent_episodes: TableDefinition<PracticeAgentEpisode>;
      user_question_attempts: TableDefinition<{
        id: string;
        user_id: string;
        question_id: string;
        step_id: string | null;
        submitted_answer_html: string | null;
        error_type: string | null;
        is_correct: boolean | null;
        score: number | null;
        created_at: string;
        updated_at: string;
      }>;
    };
    Views: Record<string, never>;
    Functions: {
      list_ai_provider_profiles_for_gateway: {
        Args: { gateway_token: string };
        Returns: AIProviderProfileSafe[];
      };
      list_enabled_ai_provider_profiles_for_gateway: {
        Args: { gateway_token: string };
        Returns: AIProviderProfileSafe[];
      };
      create_ai_provider_profile_for_gateway: {
        Args: {
          gateway_token: string;
          profile_api_key_ciphertext: string | null;
          profile_api_key_iv: string | null;
          profile_api_key_last4: string | null;
          profile_api_key_tag: string | null;
          profile_base_url: string;
          profile_enabled: boolean;
          profile_is_default: boolean;
          profile_model: string;
          profile_name: string;
          profile_provider: string;
          profile_supports_pdf_input: boolean;
          profile_supports_vision_images: boolean;
        };
        Returns: string;
      };
      update_ai_provider_profile_for_gateway: {
        Args: {
          gateway_token: string;
          profile_api_key_ciphertext: string | null;
          profile_api_key_iv: string | null;
          profile_api_key_last4: string | null;
          profile_api_key_tag: string | null;
          profile_base_url: string;
          profile_enabled: boolean;
          profile_id: string;
          profile_is_default: boolean;
          profile_model: string;
          profile_name: string;
          profile_provider: string;
          profile_supports_pdf_input: boolean;
          profile_supports_vision_images: boolean;
        };
        Returns: undefined;
      };
      delete_ai_provider_profile_for_gateway: {
        Args: {
          gateway_token: string;
          profile_id: string;
        };
        Returns: undefined;
      };
      get_ai_operations_worker_control: {
        Args: Record<string, never>;
        Returns: Array<{
          pause_worker_claims: boolean;
          max_jobs_per_invocation: number;
          max_provider_calls_per_execution: number;
          selective_execution_enabled: boolean;
        }>;
      };
      record_ai_operation_telemetry: {
        Args: Record<string, unknown>;
        Returns: string;
      };
      list_ai_provider_runtime_states_for_admin: {
        Args: Record<string, never>;
        Returns: Array<{
          provider_profile_id: string;
          operation_kind: string;
          circuit_state: "closed" | "open" | "half_open";
          consecutive_failure_count: number;
          open_until: string | null;
          last_safe_error_code: string | null;
          last_failure_at: string | null;
          last_success_at: string | null;
          updated_at: string;
        }>;
      };
      reset_ai_provider_runtime_state_for_admin: {
        Args: { p_provider_profile_id: string; p_operation_kind: string };
        Returns: boolean;
      };
      enqueue_ai_provider_job: {
        Args: {
          p_idempotency_key?: string | null;
          p_job_kind: AIProviderJobKind;
          p_payload?: Json;
          p_provider_profile_id?: string | null;
          p_resource_id: string;
          p_resource_type: "import_batch" | "question_blueprint";
          p_target_bank_id: string | null;
        };
        Returns: AIProviderJob;
      };
      claim_ai_provider_jobs: {
        Args: {
          p_lease_owner: string;
          p_lease_seconds?: number;
          p_limit?: number;
        };
        Returns: AIProviderJob[];
      };
      heartbeat_ai_provider_job: {
        Args: {
          p_job_id: string;
          p_lease_owner: string;
          p_lease_seconds?: number;
        };
        Returns: boolean;
      };
      finish_ai_provider_job: {
        Args: {
          p_available_at?: string | null;
          p_job_id: string;
          p_lease_owner: string;
          p_provider_attempt_count?: number;
          p_retryable?: boolean;
          p_safe_error_code?: string | null;
          p_safe_message?: string | null;
          p_safe_result?: Json;
          p_status: "completed" | "retry_wait" | "failed";
        };
        Returns: boolean;
      };
      cancel_ai_provider_job: {
        Args: { p_job_id: string };
        Returns: boolean;
      };
      create_question_bank: {
        Args: {
          bank_description?: string | null;
          bank_name: string;
          bank_visibility?: QuestionBankVisibility;
        };
        Returns: string;
      };
      transition_profile_role_as_super_admin: {
        Args: {
          p_next_role: "super_admin" | "admin" | "teacher" | "student";
          p_target_profile_id: string;
        };
        Returns: undefined;
      };
      create_bank_share_code: {
        Args: {
          expires_at?: string | null;
          granted_role?: "viewer" | "editor";
          target_bank_id: string;
        };
        Returns: Array<{
          raw_share_code: string;
          role_granted: "viewer" | "editor";
          share_code_expires_at: string | null;
          share_code_id: string;
        }>;
      };
      revoke_bank_share_code: {
        Args: { target_share_code_id: string };
        Returns: boolean;
      };
      join_question_bank_by_code: {
        Args: { raw_share_code: string };
        Returns: Array<{
          bank_id: string;
          bank_name: string;
          granted_role: "viewer" | "editor";
        }>;
      };
      update_bank_member_role: {
        Args: {
          new_role: "viewer" | "editor";
          target_bank_id: string;
          target_user_id: string;
        };
        Returns: boolean;
      };
      remove_bank_member: {
        Args: {
          target_bank_id: string;
          target_user_id: string;
        };
        Returns: boolean;
      };
      create_assignment_from_bank: {
        Args: {
          p_assign_now?: boolean;
          p_assignment_due_at?: string | null;
          p_assignment_instructions?: string | null;
          p_assignment_title: string;
          p_client_request_key?: string;
          p_selected_bank_question_ids?: string[];
          p_target_bank_id: string;
          p_target_classroom_id: string;
        };
        Returns: string;
      };
      search_questions_by_taxonomy: {
        Args: {
          assignment_review_status?: string | null;
          difficulty_max?: number | null;
          difficulty_min?: number | null;
          exclude_tag_ids?: string[];
          include_tag_ids?: string[];
          page_cursor?: string | null;
          page_limit?: number | null;
          page_offset?: number | null;
          question_status?: string | null;
          query_text?: string | null;
        };
        Returns: Array<{
          difficulty_rating: number;
          matched_tag_ids: string[];
          matched_tags: Json;
          next_cursor: string | null;
          question_code: string;
          question_id: string;
          question_type: string;
          status: string;
          title: string;
          total_count: number;
        }>;
      };
      search_official_public_questions_v2: {
        Args: {
          query_text?: string | null;
          difficulty_min?: number | null;
          difficulty_max?: number | null;
          page_limit?: number | null;
          page_offset?: number | null;
        };
        Returns: Array<{
          question_id: string;
          question_code: string;
          title: string;
          question_type: string;
          content_html: string;
          difficulty_rating: number;
          approval_status: QuestionApprovalStatus;
          total_count: number;
        }>;
      };
      approve_library_questions_v2: {
        Args: {
          p_target_bank_id: string;
          p_target_question_ids: string[];
        };
        Returns: Array<{
          question_id: string;
          bank_question_id: string;
          approval_status: QuestionApprovalStatus;
        }>;
      };
      attach_official_question_revision_assets_v2: {
        Args: {
          p_actor_id: string;
          p_copied_assets: Json;
          p_source_question_id: string;
          p_target_question_id: string;
        };
        Returns: number;
      };
      archive_library_questions_v2: {
        Args: {
          p_target_bank_id: string;
          p_target_bank_question_ids: string[];
        };
        Returns: Array<{
          bank_question_id: string;
          question_id: string;
          bank_question_status: "archived";
        }>;
      };
      review_public_question_submission_v2: {
        Args: {
          p_submission_id: string;
          p_decision: string;
          p_reason?: string | null;
          p_public_assets?: Json;
        };
        Returns: string | null;
      };
      get_active_taxonomy_catalog_v1: {
        Args: Record<string, never>;
        Returns: Json;
      };
      list_teacher_question_bank_summaries_v1: {
        Args: Record<string, never>;
        Returns: Array<{
          active_member_count: number;
          assignment_ready_count: number;
          created_at: string;
          created_by: string | null;
          description: string | null;
          id: string;
          import_batch_count: number;
          membership_role: string;
          metadata: Json;
          name: string;
          organization_id: string;
          owner_id: string;
          question_count: number;
          review_draft_count: number;
          status: string;
          updated_at: string;
          updated_by: string | null;
          visibility: string;
        }>;
      };
      initialize_practice_session_sources: {
        Args: {
          p_assignment_id?: string | null;
          p_bank_ids?: string[];
          p_include_public?: boolean;
          p_session_id: string;
        };
        Returns: Array<{
          assignment_id: string | null;
          bank_id: string | null;
          source_kind: string;
          source_snapshot: Json;
        }>;
      };
      lock_practice_session_sources_for_round: {
        Args: {
          p_bank_ids?: string[];
          p_include_public?: boolean;
          p_session_id: string;
        };
        Returns: Array<{
          assignment_id: string | null;
          bank_id: string | null;
          source_kind: string;
          source_snapshot: Json;
        }>;
      };
      list_selectable_practice_sources: {
        Args: Record<string, never>;
        Returns: Array<{
          mastered_count: number;
          membership_role: string | null;
          name: string;
          needs_retry_count: number;
          question_count: number;
          source_id: string | null;
          source_kind: string;
          ungraded_count: number;
          unseen_count: number;
          visibility: string;
        }>;
      };
      reset_my_practice_progress: {
        Args: Record<string, never>;
        Returns: string;
      };
      claim_practice_ai_request: {
        Args: { p_operation: string };
        Returns: Array<{
          allowed: boolean;
          retry_after_seconds: number;
          minute_count: number;
          hour_count: number;
        }>;
      };
      claim_practice_ai_inflight_lease: {
        Args: {
          p_operation: string;
          p_scope_id: string;
          p_ttl_seconds?: number;
        };
        Returns: Array<{
          acquired: boolean;
          lease_token: string | null;
          retry_after_seconds: number;
        }>;
      };
      release_practice_ai_inflight_lease: {
        Args: { p_lease_token: string; p_operation: string };
        Returns: boolean;
      };
      search_practice_questions_in_session: {
        Args: {
          p_difficulty_max?: number;
          p_difficulty_min?: number;
          p_include_tag_ids?: string[];
          p_page_limit?: number;
          p_query_text?: string | null;
          p_session_id: string;
        };
        Returns: Array<{
          deferred_count: number;
          difficulty_rating: number;
          eligible_count: number;
          mastered_count: number;
          matched_tag_ids: string[];
          needs_retry_count: number;
          question_code: string;
          question_id: string;
          question_type: string;
          selection_state: "unseen" | "needs_retry";
          title: string;
          ungraded_count: number;
          unseen_count: number;
        }>;
      };
      create_teacher_classroom: {
        Args: {
          p_description?: string | null;
          p_name: string;
          p_organization_id?: string | null;
          p_request_id?: string | null;
          p_subject?: string | null;
        };
        Returns: Array<{
          classroom_id: string;
          display_code: string;
        }>;
      };
      add_classroom_co_teacher: {
        Args: {
          p_classroom_id: string;
          p_teacher_user_id: string;
        };
        Returns: undefined;
      };
      remove_classroom_co_teacher: {
        Args: {
          p_classroom_id: string;
          p_member_id: string;
        };
        Returns: undefined;
      };
      set_classroom_student_membership_status: {
        Args: {
          p_classroom_id: string;
          p_member_id: string;
          p_status: string;
        };
        Returns: undefined;
      };
      join_classroom_by_code: {
        Args: { join_code: string };
        Returns: Array<{
          classroom_id: string;
          classroom_name: string;
          membership_id: string;
        }>;
      };
      can_read_question_asset: {
        Args: { p_asset_id: string };
        Returns: boolean;
      };
      create_bank_question_revision_draft: {
        Args: {
          p_actor_id?: string | null;
          p_bank_id: string;
          p_copied_assets?: Json;
          p_source_question_id: string;
        };
        Returns: string;
      };
      resume_quarantined_assignment: {
        Args: {
          p_assignment_id: string;
        };
        Returns: string;
      };
      create_bank_manual_question_draft: {
        Args: {
          p_bank_id: string;
          p_question_code: string;
          p_title: string;
        };
        Returns: string;
      };
      create_global_manual_question_draft: {
        Args: {
          p_question_code: string;
          p_title: string;
        };
        Returns: string;
      };
      submit_bank_questions_to_public_review: {
        Args: {
          p_public_license_confirmed: boolean;
          p_source_bank_question_ids: string[];
        };
        Returns: Array<{
          source_question_id: string;
          status: string;
          submission_id: string;
        }>;
      };
      review_public_question_submission: {
        Args: {
          p_decision: string;
          p_public_assets?: Json;
          p_reason?: string | null;
          p_submission_id: string;
        };
        Returns: string | null;
      };
      withdraw_public_question_submission: {
        Args: { p_submission_id: string };
        Returns: undefined;
      };
      pull_public_question_to_bank: {
        Args: {
          p_actor_id?: string | null;
          p_bank_id: string;
          p_copied_assets?: Json;
          p_public_question_id: string;
        };
        Returns: string;
      };
      count_bank_question_rows: {
        Args: {
          p_bank_id: string;
          p_query?: string | null;
          p_readiness?: string;
          p_source_kind?: string | null;
          p_taxonomy_tag_id?: string | null;
        };
        Returns: number;
      };
      count_bank_review_questions: {
        Args: {
          p_bank_id: string;
          p_query?: string | null;
          p_review_status?: string | null;
        };
        Returns: number;
      };
      search_bank_question_rows: {
        Args: {
          p_bank_id: string;
          p_limit?: number;
          p_offset?: number;
          p_query?: string | null;
          p_readiness?: string;
          p_source_kind?: string | null;
          p_taxonomy_tag_id?: string | null;
        };
        Returns: Array<{
          added_at: string;
          bank_question_id: string;
          bank_question_status: string;
          bank_source_kind: string;
          difficulty_rating: number;
          metadata: Json;
          published_at: string | null;
          question_code: string;
          question_id: string;
          question_source: string | null;
          question_source_kind: string | null;
          question_status: string;
          question_type: string;
          source_review_item_id: string | null;
          tag_summaries: Json;
          title: string;
          total_count: number;
          visibility: string;
        }>;
      };
      search_bank_question_rows_v2: {
        Args: {
          p_approval_status: QuestionApprovalStatus;
          p_bank_id: string;
          p_limit?: number;
          p_offset?: number;
          p_query?: string | null;
          p_readiness?: string;
          p_source_kind?: string | null;
          p_taxonomy_tag_id?: string | null;
        };
        Returns: Array<{
          added_at: string;
          bank_question_id: string;
          bank_question_status: string;
          bank_source_kind: string;
          difficulty_rating: number;
          metadata: Json;
          published_at: string | null;
          question_code: string;
          question_id: string;
          question_source: string | null;
          question_source_kind: string | null;
          question_status: string;
          question_type: string;
          source_review_item_id: string | null;
          tag_summaries: Json;
          title: string;
          total_count: number;
          visibility: string;
        }>;
      };
      count_bank_question_rows_v2: {
        Args: {
          p_approval_status: QuestionApprovalStatus;
          p_bank_id: string;
          p_query?: string | null;
          p_readiness?: string;
          p_source_kind?: string | null;
          p_taxonomy_tag_id?: string | null;
        };
        Returns: number;
      };
      search_bank_review_question_ids: {
        Args: {
          p_bank_id: string;
          p_limit?: number;
          p_offset?: number;
          p_query?: string | null;
          p_review_status?: string | null;
        };
        Returns: Array<{
          question_id: string;
          total_count: number;
        }>;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
