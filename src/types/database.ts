export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type UserRole = "super_admin" | "admin" | "student";
export type ContentStatus = "draft" | "published" | "archived";
export type TagType = "knowledge" | "attribute";
export type QuestionType = "mcq" | "frq" | "mixed";
export type QuestionSourceFormat = "markdown_latex" | "html";
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

export type Tag = {
  id: string;
  parent_id: string | null;
  name: string;
  slug: string;
  description: string | null;
  tag_type: TagType;
  status: ContentStatus;
  sort_order: number;
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
  linked_tag_id: string | null;
  status: ContentStatus;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type QuestionAsset = {
  id: string;
  question_id: string | null;
  object_path: string;
  mime_type: string;
  size_bytes: number;
  original_filename: string;
  status: "pending" | "ready";
  display_on_detail: boolean;
  created_by: string;
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
      tags: TableDefinition<Tag>;
      questions: TableDefinition<Question>;
      question_tags: TableDefinition<{
        question_id: string;
        tag_id: string;
        created_at: string;
        updated_at: string;
      }>;
      videos: TableDefinition<Video>;
      video_tags: TableDefinition<{
        video_id: string;
        tag_id: string;
        created_at: string;
        updated_at: string;
      }>;
      question_rubric_steps: TableDefinition<RubricStep>;
      question_assets: TableDefinition<QuestionAsset>;
      question_source_files: TableDefinition<QuestionSourceFile>;
      import_batches: TableDefinition<ImportBatch>;
      import_batch_items: TableDefinition<ImportBatchItem>;
      import_batch_assets: TableDefinition<ImportBatchAsset>;
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
      page_visits: TableDefinition<{
        id: string;
        ip_hash: string;
        country_code: string | null;
        country_name: string | null;
        pathname: string;
        user_agent: string | null;
        user_id: string | null;
        created_at: string;
      }>;
    };
    Views: {
      page_visit_country_stats: TableDefinition<{
        country_code: string | null;
        country_name: string | null;
        visit_count: number;
        unique_visitor_count: number;
        first_visit_at: string | null;
        last_visit_at: string | null;
      }>;
      page_visit_daily_stats: TableDefinition<{
        visit_date: string;
        country_code: string | null;
        country_name: string | null;
        visit_count: number;
        unique_visitor_count: number;
      }>;
    };
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
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
