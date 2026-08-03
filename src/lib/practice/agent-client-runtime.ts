import {
  parsePracticeSseEvents as parseSseEvents,
  parsePracticeSsePayload,
  practiceApiErrorMessage,
} from "@/lib/practice/client-helpers";
import { resolveRestoredPracticeQuestionAssociation } from "@/lib/practice/answer-restore";
import {
  PRACTICE_RECOMMENDATION_ERROR_CODES,
  type PracticeRecommendationErrorCode,
} from "@/lib/practice/recommendation-errors";
import type {
  AssignmentPracticeStartPayload,
  PracticeAttemptInput,
  PracticeCompletion,
  PracticeGradeResult,
  PracticeGradeResponse,
  PracticeQuestionReview,
  PracticeRecommendRequest,
  PracticeRecommendResponse,
  PracticeReviewRequest,
  PracticeReviewResponse,
  PracticeSessionDetail,
  PracticeTraceEvent,
} from "@/lib/practice/types";

type ApiError = { code?: unknown; error?: unknown };

export const ASSIGNMENT_PRACTICE_START_ERROR = "Unable to start assignment practice.";

class PracticeRecommendationRequestError extends Error {
  code: PracticeRecommendationErrorCode | null;

  constructor(code: unknown, message: string) {
    super(message);
    this.name = "PracticeRecommendationRequestError";
    this.code = Object.values(PRACTICE_RECOMMENDATION_ERROR_CODES).includes(
      code as PracticeRecommendationErrorCode,
    )
      ? code as PracticeRecommendationErrorCode
      : null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && Boolean(value.trim());
}

function isCanonicalIdentity(value: unknown): value is string {
  return isNonEmptyString(value) && value === value.trim();
}

function hasOwn(value: object, key: PropertyKey) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function isDenseArray(
  value: unknown,
  isValidItem: (item: unknown) => boolean,
): value is unknown[] {
  if (!Array.isArray(value)) return false;

  for (let index = 0; index < value.length; index += 1) {
    if (!hasOwn(value, index) || !isValidItem(value[index])) return false;
  }

  return true;
}

function isStringArray(
  value: unknown,
  requireNonEmptyItems = false,
): value is string[] {
  return isDenseArray(
    value,
    (item) =>
      typeof item === "string" &&
      (!requireNonEmptyItems || Boolean(item.trim())),
  );
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isOptionalNullableString(value: unknown) {
  return value === undefined || isNullableString(value);
}

function isNullableCanonicalIdentity(value: unknown) {
  return value === null || isCanonicalIdentity(value);
}

function isOptionalNullableCanonicalIdentity(value: unknown) {
  return value === undefined || isNullableCanonicalIdentity(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isPracticeTraceEvent(value: unknown) {
  if (!isRecord(value)) return false;

  const optionalStringFields = [
    "error",
    "inputSummary",
    "modelThought",
    "outputSummary",
    "thoughtSummary",
    "toolCallId",
  ];
  const optionalNumberFields = ["elapsedMs", "iteration", "resultCount"];

  return (
    ["recommendation", "hint", "grading", "review", "context"].includes(
      String(value.phase),
    ) &&
    isNonEmptyString(value.toolName) &&
    optionalStringFields.every(
      (field) => value[field] === undefined || typeof value[field] === "string",
    ) &&
    optionalNumberFields.every(
      (field) => value[field] === undefined || isFiniteNumber(value[field]),
    ) &&
    (value.reasoningContent === undefined ||
      value.reasoningContent === null ||
      typeof value.reasoningContent === "string") &&
    (value.savedFullPayload === undefined ||
      typeof value.savedFullPayload === "boolean")
  );
}

function isPracticeTrace(value: unknown) {
  return isDenseArray(value, isPracticeTraceEvent);
}

function isQuestionOption(value: unknown) {
  return (
    isRecord(value) &&
    typeof value.content_html === "string" &&
    (value.content_source === undefined ||
      typeof value.content_source === "string") &&
    isNonEmptyString(value.id) &&
    typeof value.label === "string"
  );
}

function isPracticeQuestion(value: unknown) {
  return (
    isRecord(value) &&
    typeof value.contentExcerpt === "string" &&
    typeof value.contentHtml === "string" &&
    isFiniteNumber(value.difficulty) &&
    typeof value.expectedSkill === "string" &&
    isCanonicalIdentity(value.id) &&
    isDenseArray(value.options, isQuestionOption) &&
    typeof value.questionCode === "string" &&
    isOptionalNullableCanonicalIdentity(value.questionId) &&
    ["mcq", "fill_blank", "frq", "mixed"].includes(
      String(value.questionType),
    ) &&
    typeof value.reason === "string" &&
    isOptionalNullableString(value.source) &&
    isOptionalNullableCanonicalIdentity(value.sourceQuestionId) &&
    isStringArray(value.tagIds, true) &&
    typeof value.title === "string"
  );
}

function isPracticeAttempt(value: unknown) {
  return (
    isRecord(value) &&
    hasOwn(value, "answer") &&
    (typeof value.answer === "string" || isStringArray(value.answer)) &&
    isNullableString(value.explanation) &&
    isStringArray(value.hints) &&
    (value.isCorrect === null || typeof value.isCorrect === "boolean") &&
    isNullableCanonicalIdentity(value.questionId) &&
    (value.score === null || isFiniteNumber(value.score)) &&
    isNullableString(value.solutionHtml) &&
    isNullableCanonicalIdentity(value.sourceQuestionId)
  );
}

function hasValidRoundAttemptAssociations(value: Record<string, unknown>) {
  if (!Array.isArray(value.attempts) || !Array.isArray(value.questions)) {
    return false;
  }

  const attempts = value.attempts as Array<{
    questionId: string | null;
    sourceQuestionId: string | null;
  }>;
  const questions = value.questions as Array<{
    id: string;
    questionId?: string | null;
    sourceQuestionId?: string | null;
  }>;

  return attempts.every(
    (attempt) =>
      resolveRestoredPracticeQuestionAssociation(attempt, questions) !== null,
  );
}

function isPracticeRound(value: unknown) {
  return (
    isRecord(value) &&
    isNonEmptyString(value.id) &&
    isDenseArray(value.attempts, isPracticeAttempt) &&
    (value.nextRoundGoal === null || typeof value.nextRoundGoal === "string") &&
    isDenseArray(value.questions, isPracticeQuestion) &&
    isNullableString(value.reviewSummary) &&
    typeof value.roundGoal === "string" &&
    isRecord(value.score) &&
    isFiniteNumber(value.score.correct) &&
    isFiniteNumber(value.score.total) &&
    ["completed", "active", "skipped"].includes(String(value.status)) &&
    isPracticeTrace(value.trace) &&
    hasValidRoundAttemptAssociations(value)
  );
}

function isPracticeSourceSummary(value: unknown) {
  return (
    isRecord(value) &&
    isOptionalNullableString(value.assignmentId) &&
    isOptionalNullableString(value.bankId) &&
    (value.membershipRole === undefined ||
      value.membershipRole === null ||
      ["owner", "editor", "viewer"].includes(String(value.membershipRole))) &&
    typeof value.name === "string" &&
    ["assignment", "public_catalog", "question_bank"].includes(
      String(value.sourceKind),
    ) &&
    (value.visibility === undefined ||
      value.visibility === null ||
      ["private", "shared", "organization", "public"].includes(
        String(value.visibility),
      ))
  );
}

function isPracticeTagContext(value: unknown) {
  return (
    isRecord(value) &&
    isStringArray(value.confirmedTagIds, true) &&
    (value.lastGoal === undefined || typeof value.lastGoal === "string") &&
    isDenseArray(
      value.usefulTags,
      (tag) =>
        isRecord(tag) &&
        (tag.searchableQuestionCount === undefined ||
          isFiniteNumber(tag.searchableQuestionCount)) &&
        ["memory", "browse", "search"].includes(String(tag.source)) &&
        isNonEmptyString(tag.tagId),
    ) &&
    value.version === 1
  );
}

function isAssignmentPracticeStartPayload(
  value: unknown,
  expectedAssignmentId: string,
): value is AssignmentPracticeStartPayload {
  if (!isRecord(value)) return false;
  const assignment = value.assignment;
  const recommendation = value.recommendation;
  const session = value.session;
  if (!isRecord(assignment) || !isRecord(recommendation) || !isRecord(session)) {
    return false;
  }

  const assignmentValid =
    assignment.id === expectedAssignmentId &&
    isNonEmptyString(assignment.id) &&
    typeof assignment.title === "string" &&
    Number.isSafeInteger(assignment.itemCount) &&
    Number(assignment.itemCount) >= 0 &&
    (assignment.dueAt === null || typeof assignment.dueAt === "string");
  const recommendationValid =
    (recommendation.mode === "ai" || recommendation.mode === "heuristic") &&
    isFiniteNumber(recommendation.maxToolCalls) &&
    isDenseArray(recommendation.recommendations, isPracticeQuestion) &&
    (recommendation.roundId === undefined ||
      isNonEmptyString(recommendation.roundId)) &&
    typeof recommendation.roundGoal === "string" &&
    typeof recommendation.sessionMemory === "string" &&
    isPracticeTagContext(recommendation.tagContext) &&
    isPracticeTrace(recommendation.trace);
  const sessionValid =
    isNonEmptyString(session.id) &&
    isStringArray(session.completedQuestionIds, true) &&
    typeof session.createdAt === "string" &&
    typeof session.goal === "string" &&
    typeof session.lastActivityAt === "string" &&
    (session.outlineUserNotes === undefined ||
      typeof session.outlineUserNotes === "string") &&
    Number.isSafeInteger(session.roundCount) &&
    Number(session.roundCount) >= 0 &&
    isDenseArray(session.rounds, isPracticeRound) &&
    typeof session.sessionMemory === "string" &&
    isDenseArray(session.sourceScope, isPracticeSourceSummary) &&
    isOptionalNullableString(session.sourceScopeLockedAt) &&
    ["active", "archived", "completed"].includes(String(session.status)) &&
    isPracticeTagContext(session.tagContext) &&
    typeof session.title === "string";
  const recommendationSessionValid =
    recommendation.sessionId === undefined ||
    recommendation.sessionId === session.id;

  return (
    assignmentValid &&
    recommendationValid &&
    sessionValid &&
    recommendationSessionValid &&
    ["completed", "in_progress", "not_started"].includes(
      String(value.progressStatus),
    )
  );
}

export function validateAssignmentPracticeStartPayload(
  value: unknown,
  expectedAssignmentId: string,
): asserts value is AssignmentPracticeStartPayload {
  if (!isAssignmentPracticeStartPayload(value, expectedAssignmentId)) {
    throw new Error(ASSIGNMENT_PRACTICE_START_ERROR);
  }
}

export function isAbortError(error: unknown) {
  return error instanceof DOMException
    ? error.name === "AbortError"
    : error instanceof Error && error.name === "AbortError";
}

export function practiceRecommendationFailureMessage(error: unknown) {
  if (error instanceof PracticeRecommendationRequestError) {
    if (error.code === PRACTICE_RECOMMENDATION_ERROR_CODES.NO_CONTENT) {
      return "This practice scope has no eligible reviewed questions. Start a new session with another Library or include the Public Library.";
    }
    if (error.code === PRACTICE_RECOMMENDATION_ERROR_CODES.SEARCH_FAILED) {
      return "Practice could not search the selected sources. Try again; your current round has been kept.";
    }
    if (error.code === PRACTICE_RECOMMENDATION_ERROR_CODES.PROTOCOL_FAILED) {
      return "The recommendation agent did not complete a valid search-and-select sequence. Try again; your current round has been kept.";
    }
  }
  const message = error instanceof Error ? error.message : String(error);
  return message;
}

export async function postRecommendationStream({
  body,
  onEnding,
  onPolicyNotice,
  onSummaryDelta,
  onTrace,
  signal,
}: {
  body: PracticeRecommendRequest;
  onEnding: () => void;
  onPolicyNotice: (notice: Record<string, unknown>) => void;
  onSummaryDelta: (text: string) => void;
  onTrace: (event: PracticeTraceEvent) => void;
  signal: AbortSignal;
}): Promise<
  | { kind: "completed"; completion: PracticeCompletion }
  | { kind: "round"; recommendation: PracticeRecommendResponse }
> {
  const response = await fetch("/api/practice/recommend", {
    body: JSON.stringify(body),
    headers: {
      Accept: "text/event-stream",
      "Content-Type": "application/json",
    },
    method: "POST",
    signal,
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as ApiError | null;
    throw new PracticeRecommendationRequestError(
      payload?.code,
      practiceApiErrorMessage(payload?.error, response.status),
    );
  }
  if (!response.body) {
    throw new Error("Streaming response body is not available.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result: PracticeRecommendResponse | null = null;
  let completion: PracticeCompletion | null = null;

  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
    const parsed = parseSseEvents(done ? `${buffer}\n\n` : buffer);
    buffer = parsed.rest;

    for (const item of parsed.events) {
      const payload = parsePracticeSsePayload(item.data);
      if (item.event === "trace") {
        onTrace(payload as PracticeTraceEvent);
      } else if (item.event === "policy_notice") {
        onPolicyNotice(payload as Record<string, unknown>);
      } else if (item.event === "practice_ending") {
        onEnding();
      } else if (item.event === "practice_summary_delta") {
        onSummaryDelta(String((payload as { text?: string }).text ?? ""));
      } else if (item.event === "practice_completed") {
        completion = payload as PracticeCompletion;
      } else if (item.event === "result") {
        result = payload as PracticeRecommendResponse;
      } else if (item.event === "error") {
        const errorPayload = payload as ApiError & { trace?: PracticeTraceEvent[] };
        errorPayload.trace?.forEach(onTrace);
        throw new PracticeRecommendationRequestError(
          errorPayload.code,
          practiceApiErrorMessage(errorPayload.error, 500, "Practice recommendation failed."),
        );
      }
    }

    if (done) break;
  }

  if (completion) {
    return { completion, kind: "completed" };
  }
  if (!result) {
    throw new Error("Practice recommendation stream ended before a result was returned.");
  }
  return { kind: "round", recommendation: result };
}

export async function postReviewStream({
  body,
  onQuestionReview,
  onResult,
  onRoundReviewDelta,
  onRoundReviewStart,
  onTrace,
  signal,
}: {
  body: PracticeReviewRequest;
  onQuestionReview: (payload: { result: PracticeGradeResult; review: PracticeQuestionReview }) => void;
  onResult: (response: PracticeReviewResponse) => void;
  onRoundReviewDelta: (text: string) => void;
  onRoundReviewStart: () => void;
  onTrace: (event: PracticeTraceEvent) => void;
  signal: AbortSignal;
}) {
  const response = await fetch("/api/practice/review", {
    body: JSON.stringify(body),
    headers: {
      Accept: "text/event-stream",
      "Content-Type": "application/json",
    },
    method: "POST",
    signal,
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as ApiError | null;
    throw new Error(practiceApiErrorMessage(payload?.error, response.status));
  }
  if (!response.body) {
    throw new Error("Streaming response body is not available.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result: PracticeReviewResponse | null = null;

  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
    const parsed = parseSseEvents(done ? `${buffer}\n\n` : buffer);
    buffer = parsed.rest;

    for (const item of parsed.events) {
      const payload = parsePracticeSsePayload(item.data);
      if (item.event === "trace") {
        onTrace(payload as PracticeTraceEvent);
      } else if (item.event === "question_review") {
        onQuestionReview(payload as { result: PracticeGradeResult; review: PracticeQuestionReview });
      } else if (item.event === "round_review_start") {
        onRoundReviewStart();
      } else if (item.event === "round_review_delta") {
        onRoundReviewDelta(String((payload as { text?: string }).text ?? ""));
      } else if (item.event === "result") {
        result = payload as PracticeReviewResponse;
        onResult(result);
      } else if (item.event === "error") {
        const errorPayload = payload as ApiError & { trace?: PracticeTraceEvent[] };
        errorPayload.trace?.forEach(onTrace);
        throw new Error(practiceApiErrorMessage(errorPayload.error, 500, "Practice review failed."));
      }
    }

    if (done) break;
  }

  if (!result) {
    throw new Error("Practice review stream ended before a result was returned.");
  }
  return result;
}

export function reviewFromGradeFallback({
  activeSession,
  attempts,
  error,
  grade,
  recommendation,
}: {
  activeSession: PracticeSessionDetail;
  attempts: PracticeAttemptInput[];
  error: unknown;
  grade: PracticeGradeResponse;
  recommendation: PracticeRecommendResponse;
}): PracticeReviewResponse {
  const attemptedAnswerByQuestionId = new Map(attempts.map((attempt) => [attempt.questionId, attempt.answer]));
  const scored = grade.results.filter((result) => result.isCorrect !== null);
  const correct = grade.results.filter((result) => result.isCorrect === true).length;
  const manual = grade.results.length - scored.length;
  const providerNote = error instanceof Error ? error.message : String(error || "AI review unavailable");
  const progressNote = grade.assignmentProgress?.updated
    ? "Assignment progress was saved."
    : "Answers were graded where possible.";

  return {
    mode: "heuristic",
    nextRoundGoal: activeSession.goal || recommendation.roundGoal,
    questionReviews: grade.results.map((result) => ({
      isCorrect: result.isCorrect,
      judgmentReason: result.explanation,
      questionId: result.questionId,
      score: result.score,
      solutionKeyPoints: result.solutionHtml,
      studentAnswer: attemptedAnswerByQuestionId.get(result.questionId) ?? "",
      verdict: result.isCorrect === true ? "correct" : result.isCorrect === false ? "incorrect" : "needs_review",
    })),
    results: grade.results,
    roundPatterns: [
      `Auto-scored ${scored.length} of ${grade.results.length} question${grade.results.length === 1 ? "" : "s"}${scored.length ? ` (${correct} correct)` : ""}.`,
      ...(manual ? [`${manual} response${manual === 1 ? "" : "s"} need teacher or AI review for final scoring.`] : []),
    ],
    sessionId: activeSession.id,
    summary: `AI review was unavailable, so EduStruct used deterministic grading for this round. ${progressNote}`,
    trace: [
      ...grade.trace,
      {
        error: providerNote,
        inputSummary: "AI review stream failed; deterministic grade fallback used.",
        outputSummary: progressNote,
        phase: "review",
        resultCount: grade.results.length,
        toolName: "deterministic_grade_fallback",
      },
    ],
    updatedSessionMemory: activeSession.sessionMemory,
  };
}
