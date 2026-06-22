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
  sessionMemory?: string;
  tagContext?: PracticeTagContext;
};

export type PracticeRecommendResponse = {
  maxToolCalls: number;
  mode: "ai" | "heuristic";
  providerLabel?: string;
  recommendations: PracticeRecommendation[];
  roundGoal: string;
  sessionMemory: string;
  tagContext: PracticeTagContext;
  trace: PracticeTraceEvent[];
};

export type PracticeHintRequest = {
  currentAnswer?: string | string[];
  hintLevel?: number;
  previousHints?: string[];
  questionId: string;
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
  recommendations?: Pick<
    PracticeRecommendation,
    "id" | "questionCode" | "title" | "questionType" | "difficulty" | "tagIds" | "reason"
  >[];
  sessionMemory?: string;
};

export type PracticeReviewResponse = {
  mode: "ai" | "heuristic";
  nextRoundGoal: string;
  providerLabel?: string;
  summary: string;
  trace: PracticeTraceEvent[];
  updatedSessionMemory: string;
};
