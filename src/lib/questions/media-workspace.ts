export type QuestionAssetView = {
  displayOnDetail: boolean;
  id: string;
  originalFilename: string;
  publicUrl: string;
  questionId: string | null;
};

export type QuestionSourceFileView = {
  id: string;
  mimeType: string;
  originalFilename: string;
  questionId: string | null;
  sizeBytes: number;
  status: "pending" | "ready" | "deleted";
};

export type QuestionAssetWorkspaceActions = {
  deleteAsset: (input: unknown) => Promise<{ assetId: string }>;
  ensureDraft: (input: unknown) => Promise<{ questionId: string }>;
  finalizeUpload: (input: unknown) => Promise<QuestionAssetView>;
  reserveUpload: (input: unknown) => Promise<{
    assetId: string;
    objectPath: string;
    token: string;
  }>;
  updateDisplay: (input: unknown) => Promise<{
    assetId: string;
    displayOnDetail: boolean;
  }>;
};

export type QuestionSourceFileWorkspaceActions = {
  cancelUpload: (input: unknown) => Promise<{
    cancelled: boolean;
    sourceFileId: string;
    storageCleanupError?: string;
  }>;
  createSignedUrl: (input: unknown) => Promise<{ signedUrl: string }>;
  deleteSourceFile: (input: unknown) => Promise<{ sourceFileId: string }>;
  ensureDraft: (input: unknown) => Promise<{ questionId: string }>;
  finalizeUpload: (input: unknown) => Promise<QuestionSourceFileView>;
  reserveUpload: (input: unknown) => Promise<{
    objectPath: string;
    sourceFileId: string;
    token: string;
  }>;
};
