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
  inputPayload?: unknown;
  iteration?: number;
  llmUsage?: Record<string, unknown> | null;
  modelThought?: string;
  outputSummary?: string;
  reasoningContent?: string | null;
  outputPayload?: unknown;
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
  courseFrameworkId?: string | null;
  completedQuestionIds?: string[];
  goal: string;
  questionCount?: number;
  sessionId?: string;
  sessionMemory?: string;
  tagContext?: PracticeTagContext;
  userNextRoundNote?: string;
  wrongQuestionIds?: string[];
};

export type PracticeRecommendResponse = {
  llmUsage?: Record<string, unknown>[];
  maxToolCalls: number;
  mode: "ai" | "heuristic";
  providerLabel?: string;
  recommendations: PracticeRecommendation[];
  roundContract?: unknown;
  roundId?: string;
  roundGoal: string;
  sessionMemory: string;
  sessionId?: string;
  sessionPlan?: unknown;
  sessionState?: unknown;
  tagContext: PracticeTagContext;
  trace: PracticeTraceEvent[];
};

export type PracticeQuestionReview = {
  answerFormIssue?: string | null;
  conceptGap?: string | null;
  fixNext?: string | null;
  isCorrect?: boolean | null;
  judgmentReason?: string | null;
  missingOrExtraParts?: string | null;
  observedError?: string | null;
  personalizationLink?: string | null;
  questionId: string;
  score?: number | null;
  solutionKeyPoints?: string | null;
  studentAnswer?: string | string[] | null;
  verdict?: string | null;
};

export type PracticeMemoryUpdate = {
  longTermCandidate?: string | null;
  sessionMemoryNote?: string | null;
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
  userNextRoundNote?: string;
};

export type PracticeReviewResponse = {
  episodeCard?: unknown;
  llmUsage?: Record<string, unknown>[];
  memoryUpdate?: PracticeMemoryUpdate;
  mode: "ai" | "heuristic";
  nextRoundGoal?: string;
  providerLabel?: string;
  questionReviews?: PracticeQuestionReview[];
  results?: PracticeGradeResult[];
  roundPatterns?: string[];
  sessionId?: string;
  sessionState?: unknown;
  summary: string;
  trace: PracticeTraceEvent[];
  updatedSessionMemory: string;
};

export type PracticeCourseFrameworkSummary = {
  allowedTagIds: string[];
  description: string;
  frameworkPrompt: string;
  id: string;
  learningPath: unknown;
  priorityRules: string;
  status: "active" | "archived";
  title: string;
};

export type PracticeSessionSummary = {
  cachePrefixVersion?: string;
  completedQuestionIds: string[];
  courseFrameworkId?: string | null;
  courseFrameworkSnapshot?: unknown;
  createdAt: string;
  goal: string;
  id: string;
  lastActivityAt: string;
  longTermMemorySnapshot?: string;
  outlineUserNotes?: string;
  roundCount: number;
  sessionMemory: string;
  sessionPlan?: unknown;
  sessionState?: unknown;
  sessionThreadMessages?: unknown[];
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
    contentExcerpt: string;
    contentHtml: string;
    difficulty: number;
    expectedSkill: string;
    id: string;
    options: QuestionOption[];
    position: number;
    questionCode: string;
    questionId: string | null;
    questionType: string;
    reason: string;
    source: string | null;
    sourceQuestionId: string | null;
    tagIds: string[];
    title: string;
  }>;
  reviewSummary: string | null;
  roundGoal: string;
  score: {
    correct: number;
    total: number;
  };
  trace: PracticeTraceEvent[];
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
  cacheStatsEnabled?: boolean;
  fullCallLogsEnabled?: boolean;
  lastAgentUpdatedAt: string | null;
  longTermPreference: string;
  pendingMergeCount: number;
};
