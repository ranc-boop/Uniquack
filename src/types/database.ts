export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type UserRole = "super_admin" | "admin" | "student";
export type ContentStatus = "draft" | "published" | "archived";
export type QuestionType = "mcq" | "fill_blank" | "frq" | "mixed";
export type QuestionSourceFormat = "markdown_latex" | "html";
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

export type Profile = {
  id: string;
  username: string;
  email: string | null;
  full_name: string | null;
  avatar_url: string | null;
  role: UserRole;
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
  source: string | null;
  created_by: string | null;
  updated_by: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
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
  source_type: "manual_json" | "manual_csv" | "ai_pdf" | "ai_image" | "ai_word";
  source_file_id: string | null;
  status: "draft" | "validating" | "ready" | "imported" | "failed";
  summary: Json;
  created_by: string;
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
  outline_user_notes: string;
  next_user_notes: string;
  cache_prefix_version: string;
  preference_dirty_at: string | null;
  status: "active" | "archived";
  preference_merged_at: string | null;
  last_activity_at: string;
  created_at: string;
  updated_at: string;
};

export type PracticeRound = {
  id: string;
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
  trace: Json;
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
  long_term_preference: string;
  last_agent_updated_at: string | null;
  created_at: string;
  updated_at: string;
};

export type PracticePreferenceMergeJob = {
  id: string;
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
  title: string;
  description: string;
  framework_prompt: string;
  learning_path: Json;
  allowed_tag_ids: string[];
  priority_rules: string;
  status: "active" | "archived";
  created_by: string | null;
  created_at: string;
  updated_at: string;
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
      profiles: TableDefinition<Profile>;
      ai_provider_profiles: TableDefinition<AIProviderProfile>;
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
      practice_rounds: TableDefinition<PracticeRound>;
      practice_round_questions: TableDefinition<PracticeRoundQuestion>;
      practice_attempts: TableDefinition<PracticeAttempt>;
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
      get_ai_provider_profile_for_gateway: {
        Args: {
          gateway_token: string;
          profile_id: string;
        };
        Returns: AIProviderProfile[];
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
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
