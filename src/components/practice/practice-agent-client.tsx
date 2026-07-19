"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, useTransition, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { ArrowUp, ChevronsLeft, ChevronsRight, MoreHorizontal, Pencil, Plus, SlidersHorizontal, Trash2 } from "lucide-react";

import {
  FeedbackText,
  QuestionText,
} from "@/components/math-content";
import { PracticeQuestionCard } from "@/components/practice/practice-question-card";
import { ReadableDataCard, threadStudyContext } from "@/components/practice/practice-readable-data-card";
import { PracticeRoundReviewPanel } from "@/components/practice/practice-round-review-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import {
  buildPracticeSubmittedAttempts,
  clearLegacyPracticeStorage,
  evaluatePracticeSubmittedAttempts,
  formatDuration,
  practiceAnswerKey,
  practiceSubmittedAttemptQuestionId,
  readPendingPracticeRound,
  recommendationFromHistoryQuestion,
  resultsFromHistoryRound,
} from "@/lib/practice/client-helpers";
import {
  buildRestoredPracticeAnswers,
  restoredPracticeQuestionId,
} from "@/lib/practice/answer-restore";
import type {
  PracticeAttemptInput,
  PracticeGradeResult,
  PracticeGradeResponse,
  PracticeHintResponse,
  PracticeCourseFrameworkSummary,
  PracticeQuestionReview,
  PracticeRecommendRequest,
  PracticeRecommendResponse,
  PracticeRecommendation,
  PracticeRoundHistory,
  PracticeReviewRequest,
  PracticeReviewResponse,
  PracticeSessionDetail,
  PracticeSessionSummary,
  PracticeTraceEvent,
  PracticeWrongQuestionView,
} from "@/lib/practice/types";

const TracePanel = dynamic(
  () => import("@/components/practice/practice-trace-panel").then((module) => module.TracePanel),
  {
    loading: () => null,
    ssr: false,
  },
);

type Phase = "start" | "thinking" | "recommended" | "practicing" | "feedback";
type AnswersState = Record<string, string | string[]>;
type HintsState = Record<string, string[]>;
type ApiError = { error?: string };
type PracticeAgentClientProps = {
  assignmentId?: string | null;
};
type AssignmentPracticeStartPayload = {
  assignment: {
    dueAt: string | null;
    id: string;
    itemCount: number;
    title: string;
  };
  progressStatus: "not_started" | "in_progress" | "completed";
  recommendation: PracticeRecommendResponse;
  session: PracticeSessionDetail;
};

const starterGoals = [
  "AP Calculus: implicit differentiation with harder MCQs",
  "Review missed integration questions and explain traps",
  "Build a short mixed round on limits and continuity",
  "Practice FRQ-style derivative applications",
];

const COLLAPSED_SIDEBAR_WIDTH = 60;
const DEFAULT_LEFT_SIDEBAR_WIDTH = 304;
const DEFAULT_RIGHT_SIDEBAR_WIDTH = 384;
const MIN_SIDEBAR_WIDTH = 240;
const MAX_SIDEBAR_WIDTH = 560;

function clampSidebarWidth(value: number) {
  return Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, Math.round(value)));
}

async function jsonRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const payload = (await response.json().catch(() => ({}))) as T & ApiError;

  if (!response.ok) {
    throw new Error(payload.error || `Request failed with ${response.status}`);
  }

  return payload;
}

function parseSseEvents(buffer: string) {
  const parts = buffer.split(/\n\n/);
  const rest = parts.pop() ?? "";
  const events = parts
    .map((part) => {
      let event = "message";
      const dataLines: string[] = [];

      for (const line of part.split(/\n/)) {
        if (line.startsWith("event:")) {
          event = line.slice("event:".length).trim();
        } else if (line.startsWith("data:")) {
          dataLines.push(line.slice("data:".length).trimStart());
        }
      }

      return dataLines.length ? { data: dataLines.join("\n"), event } : null;
    })
    .filter((event): event is { data: string; event: string } => event !== null);

  return { events, rest };
}

function parsePracticeSsePayload(data: string) {
  try {
    return JSON.parse(data) as unknown;
  } catch {
    throw new Error(
      "A live practice update could not be read. Your saved work is still available; please retry.",
    );
  }
}

async function postRecommendationStream({
  body,
  onTrace,
}: {
  body: PracticeRecommendRequest;
  onTrace: (event: PracticeTraceEvent) => void;
}) {
  const response = await fetch("/api/practice/recommend", {
    body: JSON.stringify(body),
    headers: {
      Accept: "text/event-stream",
      "Content-Type": "application/json",
    },
    method: "POST",
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as ApiError | null;
    throw new Error(payload?.error || `Request failed with ${response.status}`);
  }
  if (!response.body) {
    throw new Error("Streaming response body is not available.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result: PracticeRecommendResponse | null = null;

  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
    const parsed = parseSseEvents(buffer);
    buffer = parsed.rest;

    for (const item of parsed.events) {
      const payload = parsePracticeSsePayload(item.data);
      if (item.event === "trace") {
        onTrace(payload as PracticeTraceEvent);
      } else if (item.event === "result") {
        result = payload as PracticeRecommendResponse;
      } else if (item.event === "error") {
        const errorPayload = payload as ApiError & { trace?: PracticeTraceEvent[] };
        errorPayload.trace?.forEach(onTrace);
        throw new Error(errorPayload.error || "Practice recommendation failed.");
      }
    }

    if (done) break;
  }

  if (!result) {
    throw new Error("Practice recommendation stream ended before a result was returned.");
  }
  return result;
}

async function postReviewStream({
  body,
  onQuestionReview,
  onResult,
  onRoundReviewDelta,
  onRoundReviewStart,
  onTrace,
}: {
  body: PracticeReviewRequest;
  onQuestionReview: (payload: { result: PracticeGradeResult; review: PracticeQuestionReview }) => void;
  onResult: (response: PracticeReviewResponse) => void;
  onRoundReviewDelta: (text: string) => void;
  onRoundReviewStart: () => void;
  onTrace: (event: PracticeTraceEvent) => void;
}) {
  const response = await fetch("/api/practice/review", {
    body: JSON.stringify(body),
    headers: {
      Accept: "text/event-stream",
      "Content-Type": "application/json",
    },
    method: "POST",
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as ApiError | null;
    throw new Error(payload?.error || `Request failed with ${response.status}`);
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
    const parsed = parseSseEvents(buffer);
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
        throw new Error(errorPayload.error || "Practice review failed.");
      }
    }

    if (done) break;
  }

  if (!result) {
    throw new Error("Practice review stream ended before a result was returned.");
  }
  return result;
}

function reviewFromGradeFallback({
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

function subscribeToClientReady() {
  return () => {};
}

function getClientReadySnapshot() {
  return true;
}

function getServerClientReadySnapshot() {
  return false;
}

export function PracticeAgentClient({ assignmentId }: PracticeAgentClientProps) {
  const clientReady = useSyncExternalStore(
    subscribeToClientReady,
    getClientReadySnapshot,
    getServerClientReadySnapshot,
  );
  const [phase, setPhase] = useState<Phase>("start");
  const [sessions, setSessions] = useState<PracticeSessionSummary[]>([]);
  const [activeSession, setActiveSession] = useState<PracticeSessionDetail | null>(null);
  const [assignmentLaunch, setAssignmentLaunch] = useState<AssignmentPracticeStartPayload["assignment"] | null>(null);
  const [goal, setGoal] = useState("");
  const [questionCount, setQuestionCount] = useState(4);
  const [recommendation, setRecommendation] = useState<PracticeRecommendResponse | null>(null);
  const [answers, setAnswers] = useState<AnswersState>({});
  const answersRef = useRef<AnswersState>({});
  const [hints, setHints] = useState<HintsState>({});
  const [results, setResults] = useState<PracticeGradeResult[]>([]);
  const [review, setReview] = useState<PracticeReviewResponse | null>(null);
  const [liveTrace, setLiveTrace] = useState<PracticeTraceEvent[]>([]);
  const [reviewTrace, setReviewTrace] = useState<PracticeTraceEvent[]>([]);
  const [longTermMemory, setLongTermMemory] = useState("");
  const [longTermMemoryDraft, setLongTermMemoryDraft] = useState("");
  const [memoryEditing, setMemoryEditing] = useState(false);
  const [cacheStatsEnabled, setCacheStatsEnabled] = useState(false);
  const [fullCallLogsEnabled, setFullCallLogsEnabled] = useState(false);
  const [outlineNotes, setOutlineNotes] = useState("");
  const [outlineSaving, setOutlineSaving] = useState(false);
  const [nextRoundNote, setNextRoundNote] = useState("");
  const [courseFrameworks, setCourseFrameworks] = useState<PracticeCourseFrameworkSummary[]>([]);
  const [selectedCourseFrameworkId, setSelectedCourseFrameworkId] = useState("");
  const [isTraceCollapsed, setIsTraceCollapsed] = useState(false);
  const [isLeftSidebarCollapsed, setIsLeftSidebarCollapsed] = useState(false);
  const [isRightSidebarCollapsed, setIsRightSidebarCollapsed] = useState(false);
  const [leftSidebarWidth, setLeftSidebarWidth] = useState(DEFAULT_LEFT_SIDEBAR_WIDTH);
  const [rightSidebarWidth, setRightSidebarWidth] = useState(DEFAULT_RIGHT_SIDEBAR_WIDTH);
  const [wrongQuestions, setWrongQuestions] = useState<PracticeWrongQuestionView[]>([]);
  const [selectedWrongQuestionIds, setSelectedWrongQuestionIds] = useState<string[]>([]);
  const [renamingSessionId, setRenamingSessionId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submissionGuardDiagnostics, setSubmissionGuardDiagnostics] = useState<ReturnType<
    typeof evaluatePracticeSubmittedAttempts
  > & { guard: "BLOCKED" | "PASSED" } | null>(null);
  const [thinkingElapsedMs, setThinkingElapsedMs] = useState(0);
  const [lastThinkingDurationMs, setLastThinkingDurationMs] = useState<number | null>(null);
  const [isPending, startTransition] = useTransition();
  const resultTopRef = useRef<HTMLDivElement | null>(null);
  const thinkingEndRef = useRef<HTMLDivElement | null>(null);
  const thinkingStartedAtRef = useRef<number | null>(null);
  const assignmentLaunchStartedRef = useRef(false);

  async function refreshPracticeState(preferredSessionId?: string) {
    const sessionPayload = await jsonRequest<{
      activeSession: PracticeSessionDetail | null;
      sessions: PracticeSessionSummary[];
    }>("/api/practice/sessions");

    let nextSession = sessionPayload.activeSession;
    if (preferredSessionId) {
      const detail = await jsonRequest<{ session: PracticeSessionDetail }>(
        `/api/practice/sessions/${preferredSessionId}`,
      );
      nextSession = detail.session;
    }

    setSessions(sessionPayload.sessions);
    setActiveSession(nextSession);
    setOutlineNotes(nextSession?.outlineUserNotes ?? "");
    const wrongPayload = nextSession
      ? await jsonRequest<{ wrongQuestions: PracticeWrongQuestionView[] }>(
          `/api/practice/wrong-questions?sessionId=${encodeURIComponent(nextSession.id)}`,
        )
      : { wrongQuestions: [] };
    setWrongQuestions(wrongPayload.wrongQuestions);
    const preferencePayload = await jsonRequest<{
      cacheStatsEnabled?: boolean;
      fullCallLogsEnabled?: boolean;
      longTermPreference: string;
      pendingMergeCount: number;
    }>("/api/practice/preferences");
    setLongTermMemory(preferencePayload.longTermPreference);
    setLongTermMemoryDraft(preferencePayload.longTermPreference);
    setCacheStatsEnabled(Boolean(preferencePayload.cacheStatsEnabled));
    setFullCallLogsEnabled(Boolean(preferencePayload.fullCallLogsEnabled));
    const frameworkPayload = await jsonRequest<{
      frameworks: PracticeCourseFrameworkSummary[];
    }>("/api/practice/course-frameworks");
    setCourseFrameworks(frameworkPayload.frameworks);

    return nextSession;
  }

  function restoreRoundFromHistory(round: PracticeRoundHistory, session = activeSession) {
    if (!session || !round.questions.length) return;

    const restoredRecommendations = round.questions
      .map(recommendationFromHistoryQuestion)
      .filter((question) => question.id);
    if (!restoredRecommendations.length) return;

    const restoredRecommendation: PracticeRecommendResponse = {
      maxToolCalls: 0,
      mode: "heuristic",
      recommendations: restoredRecommendations,
      roundId: round.id,
      roundGoal: round.roundGoal || session.goal,
      sessionId: session.id,
      sessionMemory: session.sessionMemory,
      tagContext: session.tagContext,
      trace: round.trace ?? [],
    };
    const restoredResults = resultsFromHistoryRound(round);
    const restoredAnswers: AnswersState = buildRestoredPracticeAnswers(
      round.attempts,
      round.questions,
    );
    const restoredHints: HintsState = {};

    for (const attempt of round.attempts) {
      const questionId = restoredPracticeQuestionId(attempt, round.questions);
      if (!questionId) continue;
      restoredHints[questionId] = attempt.hints;
    }

    setRecommendation(restoredRecommendation);
    answersRef.current = restoredAnswers;
    setAnswers(restoredAnswers);
    setHints(restoredHints);
    setResults(restoredResults);
    setLiveTrace(round.trace ?? []);
    setReviewTrace([]);
    setIsTraceCollapsed(true);
    setGoal(round.nextRoundGoal ?? "");

    if (round.reviewSummary || restoredResults.length) {
      setReview({
        mode: "heuristic",
        nextRoundGoal: round.nextRoundGoal ?? session.goal,
        results: restoredResults,
        sessionId: session.id,
        summary: round.reviewSummary ?? "This round has saved review results.",
        trace: round.trace ?? [],
        updatedSessionMemory: session.sessionMemory,
      });
      setReviewTrace(round.trace ?? []);
      setPhase("feedback");
    } else {
      setReview(null);
      setPhase("recommended");
    }
  }

  useEffect(() => {
    if (phase === "thinking" && liveTrace.length) {
      thinkingEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [phase, liveTrace.length]);

  useEffect(() => {
    if (phase === "recommended" || phase === "feedback") {
      resultTopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [phase]);

  useEffect(() => {
    if (phase !== "thinking") return;
    const updateElapsed = () => {
      const startedAt = thinkingStartedAtRef.current;
      setThinkingElapsedMs(startedAt ? Date.now() - startedAt : 0);
    };
    updateElapsed();
    const timer = window.setInterval(updateElapsed, 1000);
    return () => window.clearInterval(timer);
  }, [phase]);

  const latestTrace = useMemo(() => {
    if (phase === "feedback" && review) return reviewTrace;
    if (phase === "thinking") return liveTrace;
    return recommendation?.trace ?? liveTrace;
  }, [phase, liveTrace, recommendation, review, reviewTrace]);
  const isStarterPractice =
    phase === "start" &&
    !recommendation &&
    !activeSession?.rounds.length &&
    !selectedWrongQuestionIds.length;
  const practiceGridStyle = {
    "--practice-left": `${isLeftSidebarCollapsed ? COLLAPSED_SIDEBAR_WIDTH : leftSidebarWidth}px`,
    "--practice-right": `${isRightSidebarCollapsed ? COLLAPSED_SIDEBAR_WIDTH : rightSidebarWidth}px`,
  } as CSSProperties;

  const resultsById = new Map<string, PracticeGradeResult>(
    results.map((result) => [result.questionId, result]),
  );
  const questionReviewsById = new Map<string, PracticeQuestionReview>(
    (review?.questionReviews ?? []).map((item) => [item.questionId, item]),
  );

  function resetRoundState() {
    setSubmissionGuardDiagnostics(null);
    answersRef.current = {};
    setAnswers({});
    setHints({});
    setResults([]);
    setReview(null);
    setLiveTrace([]);
    setReviewTrace([]);
    setRecommendation(null);
  }

  function resetSessionScopedDrafts() {
    setNextRoundNote("");
    setSelectedWrongQuestionIds([]);
    setRenamingSessionId(null);
    setRenameValue("");
  }

  function beginThinking() {
    thinkingStartedAtRef.current = Date.now();
    setThinkingElapsedMs(0);
    setLastThinkingDurationMs(null);
    setPhase("thinking");
  }

  function finishThinking(nextPhase: Phase) {
    const startedAt = thinkingStartedAtRef.current;
    if (startedAt) setLastThinkingDurationMs(Date.now() - startedAt);
    thinkingStartedAtRef.current = null;
    setPhase(nextPhase);
  }

  async function runPreferenceMerge() {
    try {
      await jsonRequest<{ status: string }>(
        "/api/practice/preferences/merge/run",
        { method: "POST", body: "{}" },
      );
      const preferencePayload = await jsonRequest<{ longTermPreference: string }>(
        "/api/practice/preferences",
      );
      setLongTermMemory(preferencePayload.longTermPreference);
    } catch {
      // Preference merge is intentionally opportunistic and should not block practice.
    }
  }

  async function updateSessionTitle(sessionId: string, title: string) {
    const payload = await jsonRequest<{ session: PracticeSessionDetail }>(
      `/api/practice/sessions/${sessionId}`,
      {
        body: JSON.stringify({ title }),
        method: "PATCH",
      },
    );
    setActiveSession((current) => (current?.id === sessionId ? payload.session : current));
    setSessions((current) =>
      current.map((item) => (item.id === sessionId ? { ...item, title: payload.session.title } : item)),
    );
    return payload.session;
  }

  async function autoNameSession(sessionId: string, trimmedGoal: string) {
    try {
      const payload = await jsonRequest<{ title: string }>("/api/practice/sessions/title", {
        body: JSON.stringify({ goal: trimmedGoal }),
        method: "POST",
      });
      if (payload.title) {
        await updateSessionTitle(sessionId, payload.title);
      }
    } catch {
      // Auto naming is a convenience; recommendation should keep moving if it fails.
    }
  }

  async function ensureSession(trimmedGoal: string) {
    if (activeSession) return activeSession;
    const payload = await jsonRequest<{ session: PracticeSessionDetail }>("/api/practice/sessions", {
      body: JSON.stringify({
        courseFrameworkId: selectedCourseFrameworkId || null,
        goal: trimmedGoal,
        title: "New practice session",
      }),
      method: "POST",
    });
    setActiveSession(payload.session);
    await refreshPracticeState(payload.session.id);
    void runPreferenceMerge();
    return payload.session;
  }

  async function startAssignmentPractice(launchAssignmentId: string) {
    setError(null);
    beginThinking();
    setLiveTrace([]);
    setReviewTrace([]);
    setIsTraceCollapsed(true);
    resetRoundState();
    resetSessionScopedDrafts();

    const payload = await jsonRequest<AssignmentPracticeStartPayload>(
      "/api/practice/assignments/start",
      {
        body: JSON.stringify({ assignmentId: launchAssignmentId }),
        method: "POST",
      },
    );

    setAssignmentLaunch(payload.assignment);
    setActiveSession(payload.session);
    const restoredSession = await refreshPracticeState(payload.session.id);
    const currentRound = restoredSession?.rounds[restoredSession.rounds.length - 1];

    if (restoredSession && currentRound?.questions.length) {
      restoreRoundFromHistory(currentRound, restoredSession);
      finishThinking(
        currentRound.reviewSummary || resultsFromHistoryRound(currentRound).length
          ? "feedback"
          : "recommended",
      );
      return;
    }

    setRecommendation(payload.recommendation);
    setLiveTrace(payload.recommendation.trace);
    setIsTraceCollapsed(true);
    setGoal(payload.recommendation.roundGoal);
    finishThinking("recommended");
  }

  useEffect(() => {
    startTransition(async () => {
      try {
        clearLegacyPracticeStorage();
        if (assignmentId && !assignmentLaunchStartedRef.current) {
          // This ref prevents a duplicate request within one mounted client.
          // Reload correctness comes from the server-side linked-session resume.
          assignmentLaunchStartedRef.current = true;
          await startAssignmentPractice(assignmentId);
          return;
        }

        const restoredSession = await refreshPracticeState();
        const pendingRound = readPendingPracticeRound();
        if (pendingRound) {
          setRecommendation(pendingRound);
          setGoal(pendingRound.roundGoal);
          setLiveTrace(pendingRound.trace ?? []);
          setIsTraceCollapsed(true);
          setPhase("recommended");
          if (pendingRound.sessionId) {
            await refreshPracticeState(pendingRound.sessionId);
          }
        } else if (restoredSession?.rounds.length) {
          restoreRoundFromHistory(restoredSession.rounds[restoredSession.rounds.length - 1], restoredSession);
        }
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : String(caught));
      }
    });
    // Run once on page entry to restore the latest persisted round.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function requestRecommendation(nextGoal?: string, wrongIds = selectedWrongQuestionIds) {
    const trimmedGoal = (nextGoal ?? goal).trim();
    if (!trimmedGoal) {
      setError("Enter a practice goal first.");
      return;
    }

    setError(null);
    beginThinking();
    setLiveTrace([]);
    setReviewTrace([]);
    setIsTraceCollapsed(true);
    resetRoundState();

    startTransition(async () => {
      try {
        const currentSession = await ensureSession(trimmedGoal);
        const shouldAutoName =
          currentSession.title === "New practice session" &&
          !currentSession.rounds.length;
        const titlePromise = shouldAutoName
          ? autoNameSession(currentSession.id, trimmedGoal)
          : Promise.resolve();
        const responsePromise = postRecommendationStream({
          body: {
            goal: trimmedGoal,
            questionCount,
            sessionId: currentSession.id,
            userNextRoundNote: nextRoundNote,
            wrongQuestionIds: wrongIds,
          },
          onTrace: (event) => setLiveTrace((current) => [...current, event]),
        });
        const [response] = await Promise.all([responsePromise, titlePromise]);
        setRecommendation(response);
        setLiveTrace(response.trace);
        setIsTraceCollapsed(true);
        setGoal(trimmedGoal);
        setSelectedWrongQuestionIds([]);
        setNextRoundNote("");
        setActiveSession({
          ...currentSession,
          goal: response.roundGoal,
          sessionMemory: response.sessionMemory,
          sessionPlan: response.sessionPlan ?? currentSession.sessionPlan,
          sessionState: response.sessionState ?? currentSession.sessionState,
          tagContext: response.tagContext,
        });
        await refreshPracticeState(currentSession.id);
        finishThinking("recommended");
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : String(caught));
        finishThinking(activeSession ? "start" : "start");
      }
    });
  }

  function updateAnswer(questionId: string, value: string | string[]) {
    const nextAnswers = { ...answersRef.current, [questionId]: value };
    answersRef.current = nextAnswers;
    setAnswers(nextAnswers);
  }

  function requestHint(question: PracticeRecommendation) {
    setError(null);
    startTransition(async () => {
      try {
        const questionId = practiceAnswerKey(question);
        const previousHints = hints[questionId] ?? [];
        const response = await jsonRequest<PracticeHintResponse>("/api/practice/hint", {
          body: JSON.stringify({
            currentAnswer: answersRef.current[questionId] ?? "",
            hintLevel: previousHints.length + 1,
            previousHints,
            questionId,
            sessionId: activeSession?.id,
          }),
          method: "POST",
        });
        setHints((current) => ({ ...current, [questionId]: [...previousHints, response.hint] }));
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : String(caught));
      }
    });
  }

  function submitRound() {
    if (!recommendation || !activeSession || !recommendation.roundId) return;

    const submittedAnswerSnapshot = Object.freeze({ ...answersRef.current });
    const submittedAttempts: PracticeReviewRequest["attempts"] = buildPracticeSubmittedAttempts(
      recommendation.recommendations,
      submittedAnswerSnapshot,
      hints,
    ).map((attempt) => {
      const recommended = recommendation.recommendations.find(
        (item) => practiceSubmittedAttemptQuestionId(item) === attempt.questionId,
      );
      return {
        ...attempt,
        questionCode: recommended?.questionCode,
        result: {
          explanation: "Reviewer judgment pending.",
          gradingMode: "manual" as const,
          isCorrect: null,
          questionId: attempt.questionId,
          score: null,
          solutionHtml: null,
        },
        title: recommended?.title,
      };
    });
    Object.freeze(submittedAttempts);
    const submissionEvaluation = evaluatePracticeSubmittedAttempts(
      recommendation.recommendations,
      submittedAttempts,
      submittedAnswerSnapshot,
    );
    const guardBlocked =
      submissionEvaluation.submittedAttempt !== "FOUND" ||
      submissionEvaluation.missingRequiredAttemptCount > 0;
    setSubmissionGuardDiagnostics({
      ...submissionEvaluation,
      guard: guardBlocked ? "BLOCKED" : "PASSED",
    });
    if (guardBlocked) {
      setError("Your answer was not captured. Please review it and try again.");
      return;
    }

    setError(null);
    thinkingStartedAtRef.current = Date.now();
    setThinkingElapsedMs(0);
    setLastThinkingDurationMs(null);
    setLiveTrace([]);
    setReviewTrace([]);
    setResults([]);
    setReview({
      mode: "ai",
      nextRoundGoal: activeSession.goal || recommendation.roundGoal,
      questionReviews: [],
      results: [],
      sessionId: activeSession.id,
      summary: "Generating round review...",
      trace: [],
      updatedSessionMemory: "",
    });
    setPhase("feedback");
    setIsTraceCollapsed(true);

    startTransition(async () => {
      try {
        await postReviewStream({
          body: {
            attempts: submittedAttempts,
            goal: activeSession.goal || recommendation.roundGoal,
            hintsByQuestionId: hints,
            recommendations: recommendation.recommendations.map((question) => ({
              contentHtml: question.contentHtml,
              id: practiceSubmittedAttemptQuestionId(question),
              options: question.options,
              questionCode: question.questionCode,
              questionType: question.questionType,
              sourceQuestionId: practiceSubmittedAttemptQuestionId(question),
              title: question.title,
            })),
            roundId: recommendation.roundId,
            sessionId: activeSession.id,
            sessionMemory: "",
            userNextRoundNote: nextRoundNote,
          },
          onQuestionReview: ({ result, review: questionReview }) => {
            setResults((current) => [
              ...current.filter((item) => item.questionId !== result.questionId),
              result,
            ]);
            setReview((current) => ({
              ...(current ?? {
                mode: "ai",
                nextRoundGoal: activeSession.goal || recommendation.roundGoal,
                results: [],
                sessionId: activeSession.id,
                summary: "Generating round review...",
                trace: [],
                updatedSessionMemory: "",
              }),
              questionReviews: [
                ...((current?.questionReviews ?? []).filter((item) => item.questionId !== questionReview.questionId)),
                questionReview,
              ],
              results: [
                ...((current?.results ?? []).filter((item) => item.questionId !== result.questionId)),
                result,
              ],
            }));
          },
          onResult: (reviewResponse) => {
            setResults(reviewResponse.results ?? []);
            setReview(reviewResponse);
            setReviewTrace(reviewResponse.trace);
            setLiveTrace(reviewResponse.trace);
          },
          onRoundReviewDelta: (text) => {
            setReview((current) => ({
              ...(current ?? {
                mode: "ai",
                nextRoundGoal: activeSession.goal || recommendation.roundGoal,
                questionReviews: [],
                results: [],
                sessionId: activeSession.id,
                trace: [],
                updatedSessionMemory: "",
              }),
              summary: `${current?.summary === "Generating round review..." ? "" : current?.summary ?? ""}${text}`,
            }));
          },
          onRoundReviewStart: () => {
            setReview((current) => ({
              ...(current ?? {
                mode: "ai",
                nextRoundGoal: activeSession.goal || recommendation.roundGoal,
                questionReviews: [],
                results: [],
                sessionId: activeSession.id,
                trace: [],
                updatedSessionMemory: "",
              }),
              summary: "",
            }));
          },
          onTrace: (event) => {
            setReviewTrace((current) => [...current, event]);
            setLiveTrace((current) => [...current, event]);
          },
        });
        setIsTraceCollapsed(true);
        setGoal("");
        await refreshPracticeState(activeSession.id);
        finishThinking("feedback");
      } catch (caught) {
        try {
          const grade = await jsonRequest<PracticeGradeResponse>("/api/practice/grade", {
            body: JSON.stringify({
              attempts: submittedAttempts,
              roundId: recommendation.roundId,
              sessionId: activeSession.id,
            }),
            method: "POST",
          });
          const fallbackReview = reviewFromGradeFallback({
            activeSession,
            attempts: submittedAttempts,
            error: caught,
            grade,
            recommendation,
          });
          setResults(grade.results);
          setReview(fallbackReview);
          setReviewTrace(fallbackReview.trace);
          setLiveTrace(fallbackReview.trace);
          setIsTraceCollapsed(true);
          setGoal("");
          await refreshPracticeState(activeSession.id);
          finishThinking("feedback");
        } catch (fallbackError) {
          const primaryMessage = caught instanceof Error ? caught.message : String(caught);
          const fallbackMessage = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
          setError(`${primaryMessage} Deterministic grading fallback also failed: ${fallbackMessage}`);
          finishThinking("feedback");
        }
      }
    });
  }

  function requestFeedbackNextRound() {
    if (!review) {
      requestRecommendation();
      return;
    }
    requestRecommendation(review.nextRoundGoal || activeSession?.goal || recommendation?.roundGoal || "");
  }

  function beginRenameSession(session: PracticeSessionSummary) {
    setRenamingSessionId(session.id);
    setRenameValue(session.title);
  }

  function submitRenameSession(sessionId: string) {
    const title = renameValue.trim();
    if (!title) {
      setRenamingSessionId(null);
      setRenameValue("");
      return;
    }
    startTransition(async () => {
      try {
        await updateSessionTitle(sessionId, title);
        setRenamingSessionId(null);
        setRenameValue("");
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : String(caught));
      }
    });
  }

  function switchSession(sessionId: string) {
    startTransition(async () => {
      try {
        const payload = await jsonRequest<{ session: PracticeSessionDetail }>(
          `/api/practice/sessions/${sessionId}`,
        );
        setActiveSession(payload.session);
        const wrongPayload = await jsonRequest<{ wrongQuestions: PracticeWrongQuestionView[] }>(
          `/api/practice/wrong-questions?sessionId=${encodeURIComponent(payload.session.id)}`,
        );
        setWrongQuestions(wrongPayload.wrongQuestions);
        setOutlineNotes(payload.session.outlineUserNotes ?? "");
        resetRoundState();
        resetSessionScopedDrafts();
        if (payload.session.rounds.length) {
          restoreRoundFromHistory(payload.session.rounds[payload.session.rounds.length - 1], payload.session);
        } else {
          setGoal("");
          setPhase("start");
        }
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : String(caught));
      }
    });
  }

  function createNewSession() {
    startTransition(async () => {
      try {
        const payload = await jsonRequest<{ session: PracticeSessionDetail }>("/api/practice/sessions", {
          body: JSON.stringify({
            courseFrameworkId: selectedCourseFrameworkId || null,
            goal: "",
            title: "New practice session",
          }),
          method: "POST",
        });
        setActiveSession(payload.session);
        setOutlineNotes(payload.session.outlineUserNotes ?? "");
        setWrongQuestions([]);
        resetRoundState();
        resetSessionScopedDrafts();
        setGoal("");
        setPhase("start");
        await refreshPracticeState(payload.session.id);
        void runPreferenceMerge();
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : String(caught));
      }
    });
  }

  function deleteSession(sessionId: string) {
    startTransition(async () => {
      try {
        await jsonRequest<{ ok: boolean }>(`/api/practice/sessions/${sessionId}`, { method: "DELETE" });
        resetRoundState();
        resetSessionScopedDrafts();
        setGoal("");
        setPhase("start");
        await refreshPracticeState();
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : String(caught));
      }
    });
  }

  function saveOutlineNotes() {
    if (!activeSession) return;
    setOutlineSaving(true);
    startTransition(async () => {
      try {
        const payload = await jsonRequest<{ session: PracticeSessionDetail }>(
          `/api/practice/sessions/${activeSession.id}`,
          {
            body: JSON.stringify({ outlineUserNotes: outlineNotes }),
            method: "PATCH",
          },
        );
        setActiveSession(payload.session);
        setOutlineNotes(payload.session.outlineUserNotes ?? "");
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : String(caught));
      } finally {
        setOutlineSaving(false);
      }
    });
  }

  function saveLongTermMemory() {
    startTransition(async () => {
      try {
        const payload = await jsonRequest<{ longTermPreference: string }>("/api/practice/preferences", {
          body: JSON.stringify({ longTermPreference: longTermMemoryDraft }),
          method: "PATCH",
        });
        setLongTermMemory(payload.longTermPreference);
        setLongTermMemoryDraft(payload.longTermPreference);
        setMemoryEditing(false);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : String(caught));
      }
    });
  }

  function clearLongTermMemory() {
    startTransition(async () => {
      try {
        const payload = await jsonRequest<{ longTermPreference: string }>("/api/practice/preferences", { method: "DELETE" });
        setLongTermMemory(payload.longTermPreference);
        setLongTermMemoryDraft(payload.longTermPreference);
        setMemoryEditing(false);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : String(caught));
      }
    });
  }

  function practiceWrongQuestion(question: PracticeWrongQuestionView) {
    const nextGoal = `Re-practice missed question ${question.questionCode}: ${question.title}`;
    setGoal(nextGoal);
    setSelectedWrongQuestionIds([question.sourceQuestionId]);
    requestRecommendation(nextGoal, [question.sourceQuestionId]);
  }

  function selectStarterGoal(nextGoal: string) {
    setGoal(nextGoal);
    requestRecommendation(nextGoal, []);
  }

  function beginSidebarResize(side: "left" | "right", event: ReactPointerEvent<HTMLButtonElement>) {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = side === "left" ? leftSidebarWidth : rightSidebarWidth;

    const handlePointerMove = (pointerEvent: PointerEvent) => {
      const delta = pointerEvent.clientX - startX;
      const nextWidth = side === "left"
        ? startWidth + delta
        : startWidth - delta;

      if (side === "left") {
        setLeftSidebarWidth(clampSidebarWidth(nextWidth));
      } else {
        setRightSidebarWidth(clampSidebarWidth(nextWidth));
      }
    };

    const handlePointerUp = () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp, { once: true });
  }

  return (
    <div
      className="mx-[calc(50%-50vw)] grid min-h-[calc(100vh-7rem)] w-screen gap-4 px-3 transition-[grid-template-columns] duration-300 ease-out sm:px-4 xl:grid-cols-[var(--practice-left)_minmax(0,1fr)_var(--practice-right)]"
      data-answer-map-has-rendered-key={submissionGuardDiagnostics?.answerMapHasRenderedKey}
      data-answer-map-has-submit-lookup-key={submissionGuardDiagnostics?.answerMapHasSubmitLookupKey}
      data-client-answer-snapshot={submissionGuardDiagnostics?.clientAnswerSnapshot}
      data-client-missing-answer-guard={submissionGuardDiagnostics?.guard}
      data-current-round-question-count={submissionGuardDiagnostics?.currentRoundQuestionCount}
      data-missing-required-attempt-count={submissionGuardDiagnostics?.missingRequiredAttemptCount}
      data-rendered-key-equals-submit-lookup-key={submissionGuardDiagnostics?.renderedKeyEqualsSubmitLookupKey}
      data-submit-identity-mapping={submissionGuardDiagnostics?.submitIdentityMapping}
      data-submit-question-has-source-identity={submissionGuardDiagnostics?.submitQuestionHasSourceIdentity}
      data-submitted-attempt={submissionGuardDiagnostics?.submittedAttempt}
      data-submitted-attempt-answer={submissionGuardDiagnostics?.submittedAttemptAnswer}
      data-submitted-attempt-count={submissionGuardDiagnostics?.submittedAttemptCount}
      data-testid="practice-submission-state"
      style={practiceGridStyle}
    >
      <aside className="relative transition-all duration-300 xl:sticky xl:top-20 xl:h-[calc(100vh-5rem)] xl:overflow-y-auto">
        {!isLeftSidebarCollapsed ? (
          <button
            aria-label="Resize sessions sidebar"
            className="student-focus-ring group absolute -right-2 top-0 z-40 hidden h-full w-4 cursor-col-resize rounded-full bg-transparent xl:block"
            onPointerDown={(event) => beginSidebarResize("left", event)}
            type="button"
          >
            <span className="absolute left-1/2 top-4 h-[calc(100%-2rem)] w-px -translate-x-1/2 rounded-full bg-slate-200 transition-all duration-200 group-hover:w-1 group-hover:bg-sky-400 group-active:w-1 group-active:bg-sky-600" />
            <span className="absolute left-1/2 top-1/2 h-12 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-slate-200 bg-white opacity-0 shadow-sm transition-opacity duration-200 group-hover:opacity-100" />
          </button>
        ) : null}
        {isLeftSidebarCollapsed ? (
          <div className="hidden h-full min-h-64 flex-col items-center border-r border-slate-200 bg-slate-50/80 px-2 py-5 xl:flex">
            <Button
              aria-label="Expand sessions sidebar"
              className="size-10 rounded-xl bg-slate-200/70 text-slate-900 hover:bg-slate-200"
              onClick={() => setIsLeftSidebarCollapsed(false)}
              size="icon"
              type="button"
              variant="ghost"
            >
              <ChevronsRight className="size-4" aria-hidden="true" />
            </Button>
            <div className="mt-8 flex flex-col items-center gap-4">
              <Button
                aria-label="New practice session"
                className="size-10"
                disabled={isPending}
                onClick={createNewSession}
                size="icon"
                type="button"
                variant="ghost"
              >
                <Plus className="size-5" aria-hidden="true" />
              </Button>
              <Button
                aria-label="Show sessions"
                className="size-10"
                onClick={() => setIsLeftSidebarCollapsed(false)}
                size="icon"
                type="button"
                variant="ghost"
              >
                <MoreHorizontal className="size-5" aria-hidden="true" />
              </Button>
            </div>
            <div className="mt-auto flex size-9 items-center justify-center rounded-full bg-slate-400 text-xs font-bold text-white">
              O2
            </div>
          </div>
        ) : (
        <div className="flex min-h-full flex-col border-r border-slate-200 bg-slate-50/80 px-4 py-6">
        <section>
          <div className="sticky top-3 z-30 mb-9 bg-slate-50/95 pb-2">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="student-eyebrow">Practice</p>
                <h2 className="mt-3 text-2xl font-bold tracking-tight text-slate-950">Sessions</h2>
                <p className="mt-1 text-xs font-medium text-slate-500">
                  {sessions.length} saved thread{sessions.length === 1 ? "" : "s"}
                </p>
              </div>
              <Button
                aria-label="Collapse sessions sidebar"
                className="hidden size-9 shrink-0 rounded-xl bg-slate-100 text-slate-700 shadow-sm hover:bg-slate-200 xl:inline-flex"
                onClick={() => setIsLeftSidebarCollapsed(true)}
                size="icon"
                type="button"
                variant="ghost"
              >
                <ChevronsLeft className="size-4" aria-hidden="true" />
              </Button>
            </div>
          </div>
          <div className="space-y-16">
            <button
              className="student-focus-ring group flex w-full cursor-pointer items-center gap-3 rounded-xl bg-white px-3 py-3 text-left ring-1 ring-slate-200/80 transition-all duration-200 hover:bg-sky-50 hover:ring-sky-200"
              disabled={isPending}
              onClick={createNewSession}
              type="button"
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-sky-600 text-white shadow-sm shadow-sky-950/10 transition-colors group-hover:bg-sky-700">
                <Plus className="size-4" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold text-slate-900">New practice session</span>
                <span className="block truncate text-xs text-slate-500">Start a fresh practice thread</span>
              </span>
            </button>
            <div className="space-y-3">
              <div className="flex items-center justify-between px-1">
                <p className="text-sm font-bold text-slate-950">Recent</p>
                <span className="h-px flex-1 bg-slate-100 ml-3" />
              </div>
              <div className="space-y-1">
              {sessions.length ? sessions.map((item) => (
                <div
                  key={item.id}
                  className={`group flex items-center gap-1 rounded-xl pr-1 transition-all duration-200 ${
                    activeSession?.id === item.id
                      ? "bg-white shadow-sm ring-1 ring-slate-200"
                      : "bg-transparent hover:bg-slate-50"
                  }`}
                >
                  <button
                    aria-current={activeSession?.id === item.id ? "true" : undefined}
                    className="student-focus-ring flex min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-left"
                    onClick={() => switchSession(item.id)}
                    type="button"
                  >
                    <span
                      className={`h-7 w-1 shrink-0 rounded-full ${
                        activeSession?.id === item.id ? "bg-sky-600" : "bg-slate-200 group-hover:bg-sky-300"
                      }`}
                    />
                    <span className="min-w-0 flex-1">
                      {renamingSessionId === item.id ? (
                        <Input
                          autoFocus
                          className="h-8 border-sky-200 bg-white text-sm font-bold"
                          onBlur={() => submitRenameSession(item.id)}
                          onChange={(event) => setRenameValue(event.target.value)}
                          onClick={(event) => event.stopPropagation()}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              submitRenameSession(item.id);
                            }
                            if (event.key === "Escape") {
                              event.preventDefault();
                              setRenamingSessionId(null);
                              setRenameValue("");
                            }
                          }}
                          value={renameValue}
                        />
                      ) : (
                        <span className="block truncate text-sm font-bold text-slate-900">{item.title}</span>
                      )}
                      <span className="block truncate text-xs leading-5 text-slate-500">
                        {item.roundCount} round{item.roundCount === 1 ? "" : "s"} ·{" "}
                        {new Date(item.lastActivityAt).toLocaleString()}
                      </span>
                    </span>
                  </button>
                  {activeSession?.id === item.id ? (
                    <span className="size-2 rounded-full bg-sky-600" aria-label="Current session" />
                  ) : null}
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        aria-label={`Session actions for ${item.title}`}
                        className="size-8 shrink-0 text-slate-500 opacity-70 hover:text-slate-900 group-hover:opacity-100"
                        disabled={isPending}
                        onClick={(event) => event.stopPropagation()}
                        size="icon"
                        type="button"
                        variant="ghost"
                      >
                        <MoreHorizontal className="size-4" aria-hidden="true" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent align="end" className="w-44 p-1">
                    <Button
                      className="h-9 w-full justify-start px-2 text-slate-700"
                      disabled={isPending}
                      onClick={() => beginRenameSession(item)}
                      size="sm"
                      type="button"
                      variant="ghost"
                    >
                      <Pencil className="size-4" aria-hidden="true" />
                      Rename session
                    </Button>
                    <Button
                      className="h-9 w-full justify-start px-2 text-destructive hover:text-destructive"
                        disabled={isPending}
                        onClick={() => deleteSession(item.id)}
                        size="sm"
                        type="button"
                        variant="ghost"
                      >
                        <Trash2 className="size-4" aria-hidden="true" />
                        Delete
                      </Button>
                    </PopoverContent>
                  </Popover>
                </div>
              )) : (
                <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50/80 p-4 text-sm leading-6 text-slate-600">
                  No saved sessions yet. Generate your first round to start a reusable study thread.
                </div>
              )}
              </div>
            </div>
          </div>
        </section>
        <div className="mt-auto space-y-3">
          <details className="rounded-lg bg-white/80 p-3 text-xs leading-5 text-slate-600 ring-1 ring-slate-200/70">
            <summary className="cursor-pointer text-sm font-bold text-slate-900">Long-term memory</summary>
            <div className="mt-3 space-y-2">
              {memoryEditing ? (
                <Textarea
                  className="min-h-28 bg-white text-xs"
                  onChange={(event) => setLongTermMemoryDraft(event.target.value)}
                  value={longTermMemoryDraft}
                />
              ) : longTermMemory.trim() ? (
                <FeedbackText className="border-none bg-transparent p-0 text-xs leading-5 text-slate-600" compact value={longTermMemory} />
              ) : (
                <p className="text-slate-500">
                  No durable learning pattern has been saved yet. It will update when a new session starts and old session evidence needs merging.
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                {memoryEditing ? (
                  <>
                    <Button disabled={isPending} onClick={saveLongTermMemory} size="sm" type="button" variant="secondary">Save</Button>
                    <Button disabled={isPending} onClick={() => { setMemoryEditing(false); setLongTermMemoryDraft(longTermMemory); }} size="sm" type="button" variant="outline">Cancel</Button>
                  </>
                ) : (
                  <Button disabled={isPending} onClick={() => setMemoryEditing(true)} size="sm" type="button" variant="outline">Edit</Button>
                )}
                <Button disabled={isPending || !longTermMemory.trim()} onClick={clearLongTermMemory} size="sm" type="button" variant="ghost">Clear</Button>
              </div>
              <p className="text-[11px] text-slate-400">
                Applies to newly created sessions. Token stats: {cacheStatsEnabled ? "on" : "off"}; full call logs: {fullCallLogsEnabled ? "on" : "off"}.
              </p>
            </div>
          </details>
          <div className="rounded-lg bg-white/70 p-3 text-xs leading-5 text-slate-500 ring-1 ring-slate-200/70">
            Session history stays here while the center stays focused on the current round.
          </div>
        </div>
        </div>
        )}
      </aside>

      {error ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive xl:col-span-2">
          {error}
        </div>
      ) : null}

        <main className="min-w-0 space-y-4 px-0 xl:px-2">
          {assignmentLaunch ? (
            <section className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
              <p className="font-bold">Assignment practice</p>
              <p className="mt-1 leading-6">
                Using {assignmentLaunch.itemCount} assigned question
                {assignmentLaunch.itemCount === 1 ? "" : "s"} from{" "}
                <span className="font-semibold">{assignmentLaunch.title}</span>.
              </p>
            </section>
          ) : null}
          {isStarterPractice ? (
            <section className="flex min-h-[calc(100vh-10rem)] items-center justify-center py-10">
              <div className="mx-auto w-full max-w-6xl space-y-8 text-center">
                <div className="space-y-3">
                  <Badge className="border-sky-200 bg-sky-50 text-sky-800 hover:bg-sky-50" variant="outline">
                    Practice Agent
                  </Badge>
                  <h1 className="text-4xl font-bold tracking-tight text-slate-950 sm:text-5xl">
                    Ready when you are.
                  </h1>
                  <p className="mx-auto max-w-2xl text-base leading-7 text-slate-600">
                    Tell O2I what you want to practice, or pick a starter goal below.
                  </p>
                </div>
                <div className="mx-auto max-w-5xl rounded-full border border-slate-200 bg-white p-2 shadow-[0_24px_70px_-42px_rgba(15,23,42,0.75)] ring-1 ring-slate-950/5">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <div className="flex min-w-0 flex-1 items-center px-3">
                      <Input
                        aria-label="Practice goal"
                        className="h-14 border-0 bg-transparent px-0 text-base shadow-none ring-offset-0 placeholder:text-slate-400 focus-visible:ring-0 focus-visible:ring-offset-0 sm:text-lg"
                        id="goal"
                        onChange={(event) => setGoal(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            requestRecommendation();
                          }
                        }}
                        placeholder="What do you want to practice?"
                        value={goal}
                      />
                    </div>
                    <div className="flex items-center justify-between gap-2 px-2 sm:justify-end">
                      {courseFrameworks.length ? (
                        <label className="flex h-10 items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 text-sm font-semibold text-slate-600">
                          <span>Framework</span>
                          <select
                            className="max-w-44 bg-transparent text-sm font-bold text-slate-900 outline-none"
                            onChange={(event) => setSelectedCourseFrameworkId(event.target.value)}
                            value={selectedCourseFrameworkId}
                          >
                            <option value="">None</option>
                            {courseFrameworks.map((framework) => (
                              <option key={framework.id} value={framework.id}>
                                {framework.title}
                              </option>
                            ))}
                          </select>
                        </label>
                      ) : null}
                      <label className="flex h-10 items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 text-sm font-semibold text-slate-600">
                        <SlidersHorizontal className="size-4" aria-hidden="true" />
                        <span>Questions</span>
                        <input
                          aria-label="Question count"
                          className="w-10 bg-transparent text-center font-mono text-slate-900 outline-none"
                          max={8}
                          min={1}
                          onChange={(event) => setQuestionCount(Number(event.target.value))}
                          type="number"
                          value={questionCount}
                        />
                      </label>
                      <Button
                        aria-label="Generate round"
                        className="size-12 rounded-full p-0"
                        disabled={isPending}
                        onClick={() => requestRecommendation()}
                        type="button"
                      >
                        <ArrowUp className="size-5" aria-hidden="true" />
                      </Button>
                    </div>
                  </div>
                </div>
                <div className="mx-auto grid max-w-5xl gap-2 sm:grid-cols-2">
                  {starterGoals.map((starterGoal) => (
                    <button
                      className="student-focus-ring rounded-full border border-slate-200 bg-white/80 px-4 py-3 text-left text-sm font-semibold text-slate-600 shadow-sm transition-all duration-200 hover:border-sky-200 hover:bg-sky-50 hover:text-sky-800 hover:shadow-md"
                      disabled={isPending}
                      key={starterGoal}
                      onClick={() => selectStarterGoal(starterGoal)}
                      type="button"
                    >
                      {starterGoal}
                    </button>
                  ))}
                </div>
              </div>
            </section>
          ) : (
            <section className="student-hero">
              <div className="flex flex-col gap-4">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="space-y-2">
                    <Badge className="border-sky-200 bg-sky-50 text-sky-800 hover:bg-sky-50" variant="outline">
                      Practice Agent
                    </Badge>
                    <h1 className="text-2xl font-bold tracking-tight text-slate-950">Practice session</h1>
                    <p className="max-w-3xl text-base leading-7 text-slate-600">
                      {activeSession
                        ? `Current session: ${activeSession.title}`
                        : "Create a session by generating your first round."}
                    </p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
                    <p className="font-semibold text-slate-950">{activeSession?.rounds.length ?? 0} saved rounds</p>
                    <p className="mt-1 text-slate-500">{wrongQuestions.length} active misses</p>
                  </div>
                </div>
                <div className="rounded-lg border border-slate-100 bg-slate-50/60 px-4 py-3">
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">
                    Current focus
                  </p>
                  <p className="mt-1 text-sm leading-6 text-slate-700">
                    {recommendation?.roundGoal || activeSession?.goal || "This session goal is set from the first prompt."}
                  </p>
                </div>
                <p className="text-sm leading-6 text-slate-500">
                  {selectedWrongQuestionIds.length
                    ? `${selectedWrongQuestionIds.length} missed question selected for priority practice.`
                    : "This focus carries through the current practice session."}
                </p>
              </div>
            </section>
          )}

          {phase === "thinking" ? (
            <div className="sticky top-24 z-20 flex items-center justify-between gap-3 rounded-lg border border-sky-200 bg-white/95 px-4 py-3 text-sm shadow-lg shadow-sky-950/5 backdrop-blur">
              <div className="flex min-w-0 items-center gap-3">
                <span className="relative flex h-3 w-3 shrink-0">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sky-600 opacity-60" />
                  <span className="relative inline-flex h-3 w-3 rounded-full bg-sky-600" />
                </span>
                <span className="truncate font-bold text-slate-900">{recommendation ? "Reviewing your round" : "Thinking"}</span>
              </div>
              <span className="font-mono text-sm text-slate-500">{formatDuration(thinkingElapsedMs)}</span>
            </div>
          ) : lastThinkingDurationMs !== null && (phase === "recommended" || phase === "feedback") ? (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              Thought for <span className="font-mono font-semibold">{formatDuration(lastThinkingDurationMs)}</span>
            </div>
          ) : null}

          {phase === "thinking" ? (
            <div className="space-y-4">
              <Card className="student-panel student-enter">
                <CardContent className="space-y-3 p-6">
                  <div className="flex items-center gap-3 text-sm">
                    <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-sky-600" />
                    <span className="font-bold text-slate-900">
                      {recommendation ? "Reviewing your round" : "Generating your question set"}
                    </span>
                  </div>
                  <p className="text-sm leading-6 text-slate-600">
                    The agent is using your saved practice thread, locked long-term memory snapshot, and question history.
                  </p>
                </CardContent>
              </Card>
              <TracePanel
                active
                collapsed={isTraceCollapsed}
                onToggle={() => setIsTraceCollapsed((current) => !current)}
                trace={latestTrace}
              />
              <div ref={thinkingEndRef} />
            </div>
          ) : null}

          {recommendation && (phase === "recommended" || phase === "practicing" || phase === "feedback") ? (
            <div ref={resultTopRef} className="scroll-mt-4 space-y-4">
              <TracePanel
                collapsed={isTraceCollapsed}
                onToggle={() => setIsTraceCollapsed((current) => !current)}
                trace={latestTrace}
              />
              <Card className="student-panel student-enter">
                <CardHeader>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <CardTitle className="text-2xl">Recommended round</CardTitle>
                      <FeedbackText className="mt-2 border-none bg-transparent p-0 text-base text-slate-600" compact value={recommendation.roundGoal} />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="outline">{recommendation.mode}</Badge>
                      {recommendation.providerLabel ? <Badge variant="secondary">{recommendation.providerLabel}</Badge> : null}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {recommendation.recommendations.map((question, index) => {
                    const questionId = practiceAnswerKey(question);
                    return (
                      <PracticeQuestionCard
                        clientReady={clientReady}
                        currentAnswer={answers[questionId]}
                        hints={hints[questionId] ?? []}
                        index={index}
                        isPending={isPending}
                        key={questionId}
                        onAnswerChange={(value) => updateAnswer(questionId, value)}
                        onHintRequest={requestHint}
                        phase={phase}
                        question={question}
                        result={resultsById.get(questionId)}
                        review={questionReviewsById.get(questionId)}
                      />
                    );
                  })}
                  {phase !== "feedback" ? (
                    <div className="flex justify-end">
                      <Button className="h-11 px-6" disabled={isPending || !recommendation.roundId} onClick={submitRound} type="button">
                        Submit round
                      </Button>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            </div>
          ) : null}

          {phase === "feedback" && review ? (
            <PracticeRoundReviewPanel
              isPending={isPending}
              nextRoundNote={nextRoundNote}
              onNextRoundNoteChange={setNextRoundNote}
              onQuestionCountChange={setQuestionCount}
              onStartNextRound={requestFeedbackNextRound}
              questionCount={questionCount}
              review={review}
            />
          ) : null}

        </main>

        <aside className="relative transition-all duration-300 xl:sticky xl:top-20 xl:h-[calc(100vh-5rem)] xl:overflow-y-auto">
          {!isRightSidebarCollapsed ? (
            <button
              aria-label="Resize study sidebar"
              className="student-focus-ring group absolute -left-2 top-0 z-40 hidden h-full w-4 cursor-col-resize rounded-full bg-transparent xl:block"
              onPointerDown={(event) => beginSidebarResize("right", event)}
              type="button"
            >
              <span className="absolute left-1/2 top-4 h-[calc(100%-2rem)] w-px -translate-x-1/2 rounded-full bg-slate-200 transition-all duration-200 group-hover:w-1 group-hover:bg-sky-400 group-active:w-1 group-active:bg-sky-600" />
              <span className="absolute left-1/2 top-1/2 h-12 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-slate-200 bg-white opacity-0 shadow-sm transition-opacity duration-200 group-hover:opacity-100" />
            </button>
          ) : null}
          {isRightSidebarCollapsed ? (
            <div className="hidden h-full min-h-64 flex-col items-center border-l border-slate-200 bg-slate-50/80 px-2 py-5 xl:flex">
              <Button
                aria-label="Expand study sidebar"
                className="size-10 rounded-xl bg-slate-200/70 text-slate-900 hover:bg-slate-200"
                onClick={() => setIsRightSidebarCollapsed(false)}
                size="icon"
                type="button"
                variant="ghost"
              >
                <ChevronsLeft className="size-4" aria-hidden="true" />
              </Button>
              <div className="mt-8 flex flex-col items-center gap-4">
                <Button
                  aria-label="Show study state"
                  className="size-10"
                  onClick={() => setIsRightSidebarCollapsed(false)}
                  size="icon"
                  type="button"
                  variant="ghost"
                >
                  <SlidersHorizontal className="size-5" aria-hidden="true" />
                </Button>
              </div>
              <div className="mt-auto flex size-9 items-center justify-center rounded-full bg-slate-400 text-xs font-bold text-white">
                O2
              </div>
            </div>
          ) : (
          <div className="min-h-full border-l border-slate-200 bg-slate-50/80 px-4 py-6">
          <div className="sticky top-3 z-30 mb-7 flex items-center justify-between gap-2 bg-slate-50/95 pb-2">
            <p className="student-eyebrow xl:hidden">Study State</p>
            <p className="hidden text-sm font-bold text-slate-950 xl:block">
              Study state
            </p>
            <Button
              aria-label="Collapse study sidebar"
              className="hidden size-9 shrink-0 rounded-xl bg-slate-100 text-slate-700 shadow-sm hover:bg-slate-200 xl:inline-flex"
              onClick={() => setIsRightSidebarCollapsed(true)}
              size="icon"
              type="button"
              variant="ghost"
            >
              <ChevronsRight className="size-4" aria-hidden="true" />
            </Button>
          </div>
          {activeSession ? (
            <div key={activeSession.id} className="space-y-4">
              <ReadableDataCard
                empty="No outline yet. Generate a round and the agent will form a lightweight study path here."
                title="Session outline"
                value={activeSession.sessionPlan}
              >
                <details className="rounded-lg border border-slate-200 bg-slate-50/70 p-3 text-xs">
                  <summary className="cursor-pointer font-semibold text-slate-700">Guide the outline</summary>
                  <div className="mt-3 space-y-2">
                    <Label htmlFor="outline-notes">Your notes</Label>
                    <Textarea
                      className="min-h-24 bg-white text-sm"
                      id="outline-notes"
                      onChange={(event) => setOutlineNotes(event.target.value)}
                      placeholder="Prioritize, skip, slow down, or change difficulty."
                      value={outlineNotes}
                    />
                    <Button disabled={outlineSaving || isPending} onClick={saveOutlineNotes} size="sm" type="button" variant="outline">
                      Save notes
                    </Button>
                  </div>
                </details>
              </ReadableDataCard>
              {recommendation?.roundContract ? (
                <ReadableDataCard
                  empty="Generate a round to see why these questions were chosen."
                  title="Why this round"
                  value={recommendation.roundContract}
                />
              ) : null}
              <ReadableDataCard
                empty="No saved practice thread yet. After a round, this will show the latest task, review evidence, and checkpoints."
                title="Practice thread"
                value={threadStudyContext(activeSession)}
              />
            </div>
          ) : null}

          <Card className="mt-4 border-0 bg-white shadow-none ring-1 ring-slate-200/80">
            <CardHeader>
              <CardTitle className="text-lg">Missed questions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {wrongQuestions.length ? wrongQuestions.map((question) => (
                <div key={question.id} className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-bold leading-snug text-slate-900">{question.title}</p>
                      <p className="mt-1 text-xs leading-5 text-slate-500">
                        {question.questionCode} · missed {question.missCount} time{question.missCount === 1 ? "" : "s"}
                      </p>
                    </div>
                    <Button disabled={isPending} onClick={() => practiceWrongQuestion(question)} size="sm" type="button" variant="outline">
                      Practice
                    </Button>
                  </div>
                  {question.lastExplanation ? (
                    <FeedbackText className="mt-2 border-none bg-transparent p-0 text-sm text-slate-600" compact value={question.lastExplanation} />
                  ) : null}
                  {question.contentHtml ? (
                    <details className="mt-2 rounded-md border border-slate-200 bg-slate-50/70 p-2 text-xs">
                      <summary className="cursor-pointer font-medium">Saved question snapshot</summary>
                      <QuestionText className="mt-2 border-none bg-transparent p-0" compact value={question.contentHtml} />
                    </details>
                  ) : null}
                </div>
              )) : (
                <p className="text-sm text-muted-foreground">No active missed questions in this session.</p>
              )}
            </CardContent>
          </Card>
          <div className="mt-4 rounded-lg bg-white/70 p-3 text-xs leading-5 text-slate-500 ring-1 ring-slate-200/70">
            Misses and memory update as you submit rounds.
          </div>
          </div>
          )}
        </aside>
    </div>
  );
}
