import type {
  PracticeSessionDetail,
  PracticeSessionSummary,
} from "@/lib/practice/types";

export type Phase =
  | "start"
  | "thinking"
  | "recommended"
  | "practicing"
  | "feedback"
  | "ending"
  | "completed";
export type AnswersState = Record<string, string | string[]>;
export type HintsState = Record<string, string[]>;
export type AnswerWriteReason =
  | "INPUT"
  | "SESSION_HYDRATION"
  | "ROUND_CHANGE"
  | "SESSION_CHANGE"
  | "RESET"
  | "RETRY"
  | "COMPLETED_RESTORE"
  | "OTHER";
export type AnswerTransitionDiagnostics = {
  answerRefCurrent: "PRESENT" | "EMPTY" | "NOT_OBSERVED";
  answerRefAfterInput: "PRESENT" | "EMPTY" | "NOT_OBSERVED";
  answerResetAfterInput: "YES" | "NO" | "NOT_OBSERVED";
  answerStateCurrent: "PRESENT" | "EMPTY" | "NOT_OBSERVED";
  answerStateAfterInput: "PRESENT" | "EMPTY" | "NOT_OBSERVED";
  answerStateRefConsistency: "MATCH" | "MISMATCH" | "NOT_OBSERVED";
  lastWriteReason: AnswerWriteReason | "NOT_OBSERVED";
};
export type PracticeAgentClientProps = {
  assignmentId?: string | null;
  exitHref?: string;
  testOnlyDelayedHydration?: boolean;
};
export type PracticeSessionsPayload = {
  activeSession: PracticeSessionDetail | null;
  pagination?: {
    hasMore: boolean;
    nextOffset: number;
  };
  sessions: PracticeSessionSummary[];
};
export type TestOnlyDelayedHydrationStatus =
  | "NOT_ENABLED"
  | "NOT_REQUESTED"
  | "REQUESTED"
  | "REJECTED_AS_STALE"
  | "APPLIED"
  | "FAILED";

export const COLLAPSED_SIDEBAR_WIDTH = 60;
export const DEFAULT_LEFT_SIDEBAR_WIDTH = 304;
export const DEFAULT_RIGHT_SIDEBAR_WIDTH = 384;
export const SESSION_DETAIL_CACHE_LIMIT = 8;
