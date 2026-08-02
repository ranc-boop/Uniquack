import type {
  BankMemberRole,
  QuestionBankVisibility,
  TaxonomyReviewStatus,
} from "@/types/database";

export type TeacherQuestionPreviewDTO = {
  assets: Array<{
    altText: string;
    displayOnDetail: boolean;
    id: string;
    label: string;
    url: string;
  }>;
  bank: {
    accessSource:
      | "active_membership"
      | "organization_policy"
      | "platform_admin";
    canManage: boolean;
    id: string;
    name: string;
    role: BankMemberRole | null;
    organizationRole: "admin" | "teacher" | null;
    visibility: QuestionBankVisibility;
  };
  kind: "teacher-question-preview";
  provenance: {
    hasReviewLineage: boolean;
    sourceKind: string;
  };
  question: {
    answerSpec: unknown;
    bankQuestionId: string;
    code: string;
    contentHtml: string;
    difficulty: number;
    options: unknown;
    questionId: string;
    solutionHtml: string | null;
    status: string;
    title: string;
    type: string;
    updatedAt: string;
    visibility: string;
  };
  taxonomy: Array<{
    facetKey: string | null;
    label: string;
    reviewStatus: TaxonomyReviewStatus;
    tagId: string;
  }>;
};

export type ReviewPreviewDTO = {
  assets: TeacherQuestionPreviewDTO["assets"];
  bank: TeacherQuestionPreviewDTO["bank"];
  kind: "review-preview";
  provenance: {
    hasReviewLineage: boolean;
    sourceAccess: "not_requested";
    sourceKind: string;
  };
  question: Omit<TeacherQuestionPreviewDTO["question"], "bankQuestionId">;
  review: {
    hardErrors: string[];
    id: string;
    lineageStatus: "linked" | "missing";
    status: string;
    warnings: string[];
  };
  taxonomy: TeacherQuestionPreviewDTO["taxonomy"];
};

export type TeacherPreviewDTO =
  | ReviewPreviewDTO
  | TeacherQuestionPreviewDTO;

export type TeacherPreviewKind =
  | "assignment-selection"
  | "public-question"
  | "question"
  | "review";

export type TeacherPreviewResponse = {
  previews: TeacherPreviewDTO[];
};
