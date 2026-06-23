import type { QuestionType } from "@/types/database";
import type { QuestionOption } from "@/lib/questions/answer-spec";

export type PracticePhase =
  | "recommendation"
  | "hint"
  | "grading"
  | "review";

export type PracticeTraceEvent = {
  elapsedMs?: number;
  error?: string;
  inputSummary?: string;
  iteration?: number;
  outputSummary?: string;
  phase: PracticePhase | "context";
  resultCount?: number;
  savedFullPayload?: boolean;
  thoughtSummary?: string;
  toolCallId?: string;
  toolName: string;
};

export type PracticeTagContext = {
  confirmedTagIds: string[];
  lastGoal?: string;
  usefulTags: Array<{
    searchableQuestionCount?: number;
    source: "memory" | "browse" | "search";
    tagId: string;
  }>;
  version: 1;
};

export type PracticeQuestionCandidate = {
  contentExcerpt: string;
  contentHtml: string;
  difficulty: number;
  id: string;
  options: QuestionOption[];
  questionCode: string;
  questionType: QuestionType;
  source?: string | null;
  tagIds: string[];
  title: string;
};

export type PracticeRecommendation = PracticeQuestionCandidate & {
  expectedSkill: string;
  reason: string;
};

export type PracticeRecommendRequest = {
  completedQuestionIds?: string[];
  goal: string;
  questionCount?: number;
  sessionId?: string;
  sessionMemory?: string;
  tagContext?: PracticeTagContext;
  wrongQuestionIds?: string[];
};

export type PracticeRecommendResponse = {
  maxToolCalls: number;
  mode: "ai" | "heuristic";
  providerLabel?: string;
  recommendations: PracticeRecommendation[];
  roundId?: string;
  roundGoal: string;
  sessionMemory: string;
  sessionId?: string;
  tagContext: PracticeTagContext;
  trace: PracticeTraceEvent[];
};

export type PracticeHintRequest = {
  currentAnswer?: string | string[];
  hintLevel?: number;
  previousHints?: string[];
  questionId: string;
  sessionId?: string;
};

export type PracticeHintResponse = {
  hint: string;
  mode: "ai" | "heuristic";
  providerLabel?: string;
  trace: PracticeTraceEvent[];
};

export type PracticeAttemptInput = {
  answer: string | string[];
  hintCount?: number;
  questionId: string;
  timeSpentSeconds?: number;
};

export type PracticeGradeRequest = {
  attempts: PracticeAttemptInput[];
};

export type PracticeGradeResult = {
  acceptedAnswers?: string[];
  correctOptionIds?: string[];
  explanation: string;
  gradingMode: "auto" | "manual";
  isCorrect: boolean | null;
  questionId: string;
  score: number | null;
  solutionHtml: string | null;
};

export type PracticeGradeResponse = {
  results: PracticeGradeResult[];
  trace: PracticeTraceEvent[];
};

export type PracticeReviewAttempt = PracticeAttemptInput & {
  questionCode?: string;
  result: PracticeGradeResult;
  title?: string;
};

export type PracticeReviewRequest = {
  attempts: PracticeReviewAttempt[];
  goal: string;
  hintsByQuestionId?: Record<string, string[]>;
  recommendations?: Pick<
    PracticeRecommendation,
    | "id"
    | "questionCode"
    | "title"
    | "questionType"
    | "contentHtml"
    | "options"
  >[];
  roundId?: string;
  sessionId?: string;
  sessionMemory?: string;
};

export type PracticeReviewResponse = {
  mode: "ai" | "heuristic";
  nextRoundGoal: string;
  providerLabel?: string;
  results?: PracticeGradeResult[];
  sessionId?: string;
  summary: string;
  trace: PracticeTraceEvent[];
  updatedSessionMemory: string;
};

export type PracticeSessionSummary = {
  completedQuestionIds: string[];
  createdAt: string;
  goal: string;
  id: string;
  lastActivityAt: string;
  roundCount: number;
  sessionMemory: string;
  status: "active" | "archived";
  tagContext: PracticeTagContext;
  title: string;
};

export type PracticeRoundHistory = {
  attempts: Array<{
    answer: string | string[];
    explanation: string | null;
    hintCount: number;
    hints: string[];
    id: string;
    isCorrect: boolean | null;
    questionId: string | null;
    score: number | null;
    solutionHtml: string | null;
    sourceQuestionId: string | null;
  }>;
  id: string;
  nextRoundGoal: string | null;
  questions: Array<{
    contentHtml: string;
    difficulty: number;
    expectedSkill: string;
    id: string | null;
    position: number;
    questionCode: string;
    questionId: string | null;
    questionType: string;
    reason: string;
    sourceQuestionId: string | null;
    title: string;
  }>;
  reviewSummary: string | null;
  roundGoal: string;
  score: {
    correct: number;
    total: number;
  };
};

export type PracticeSessionDetail = PracticeSessionSummary & {
  rounds: PracticeRoundHistory[];
};

export type PracticeWrongQuestionView = {
  contentHtml: string;
  id: string;
  lastAnswer: string | string[];
  lastExplanation: string | null;
  lastMissedAt: string;
  masteredAt: string | null;
  missCount: number;
  questionCode: string;
  questionId: string | null;
  sourceQuestionId: string;
  title: string;
};

export type PracticePreferenceResponse = {
  lastAgentUpdatedAt: string | null;
  longTermPreference: string;
  pendingMergeCount: number;
};
