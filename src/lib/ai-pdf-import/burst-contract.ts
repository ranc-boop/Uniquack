export const AI_PDF_BURST_MAX_FILES = 50;
export const AI_PDF_BURST_UPLOAD_CONCURRENCY = 4;

export type AIPdfBurstSafeStatus =
  | "reserved"
  | "uploading"
  | "admission_wait"
  | "queued"
  | "processing"
  | "completed"
  | "partial"
  | "failed"
  | "cancelled";

export type AIPdfBurstItemSafeStatus =
  | "reserved"
  | "finalizing"
  | "admission_ready"
  | "queued"
  | "processing"
  | "completed"
  | "failed"
  | "cancelled";

export type AIPdfBurstSafeItem = {
  clientItemKey: string;
  itemIndex: number;
  originalFilename: string;
  pageCount: number | null;
  safeErrorCode: string | null;
  status: AIPdfBurstItemSafeStatus;
};

export type AIPdfBurstSafeSummary = {
  admissionReadyCount: number;
  cancelledCount: number;
  completedCount: number;
  createdAt: string;
  failedCount: number;
  id: string;
  itemCount: number;
  items: AIPdfBurstSafeItem[];
  processingCount: number;
  queuedCount: number;
  reservedCount: number;
  status: AIPdfBurstSafeStatus;
  targetBankId: string;
};
