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
  solution_html: string | null;
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
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
