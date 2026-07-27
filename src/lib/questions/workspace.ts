export type QuestionWorkspaceScope =
  | { kind: "global" }
  | {
      kind: "bank";
      bankId: string;
      role: "owner" | "editor" | "viewer";
    };

export type QuestionWorkspaceCapabilities = {
  canArchive: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canImport: boolean;
  canPublishGlobal: boolean;
  canReview: boolean;
};

export function bankQuestionWorkspaceCapabilities(
  role: "owner" | "editor" | "viewer",
): QuestionWorkspaceCapabilities {
  const canManage = role === "owner" || role === "editor";

  return {
    canArchive: canManage,
    canCreate: canManage,
    canEdit: canManage,
    canImport: canManage,
    canPublishGlobal: false,
    canReview: canManage,
  };
}

export const globalQuestionWorkspaceCapabilities: QuestionWorkspaceCapabilities = {
  canArchive: true,
  canCreate: true,
  canEdit: true,
  canImport: true,
  canPublishGlobal: true,
  canReview: true,
};
