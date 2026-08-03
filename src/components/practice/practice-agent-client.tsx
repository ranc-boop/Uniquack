"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, useTransition, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { ArrowLeft, ArrowUp, ChevronsLeft, ChevronsRight, SlidersHorizontal } from "lucide-react";

import {
  FeedbackText,
  PracticeCompletionPanel,
  PracticeQuestionCard,
  PracticeRoundReviewPanel,
  QuestionText,
  ReadableDataCard,
  TracePanel,
} from "@/components/practice/practice-agent-dynamic";
import { PracticeSessionLoadingOverlay } from "@/components/practice/practice-loading";
import {
  COLLAPSED_SIDEBAR_WIDTH,
  DEFAULT_LEFT_SIDEBAR_WIDTH,
  DEFAULT_RIGHT_SIDEBAR_WIDTH,
  SESSION_DETAIL_CACHE_LIMIT,
  type AnswerTransitionDiagnostics,
  type AnswerWriteReason,
  type AnswersState,
  type HintsState,
  type Phase,
  type PracticeAgentClientProps,
  type PracticeSessionsPayload,
  type TestOnlyDelayedHydrationStatus,
} from "@/components/practice/practice-agent-types";
import {
  PracticeFrameworkSelector,
  PracticeRoundNavigator,
  PracticeSessionListLoading,
  PracticeSourceSelector,
  PracticeStarterGoals,
} from "@/components/practice/practice-session-scope-panels";
import {
  focusStudyDetails,
  PracticeAssignmentHandoff,
} from "@/components/practice/practice-assignment-handoff";
import { PracticeWorkspaceSkeleton } from "@/components/practice/practice-workspace-skeleton";
import { StudentPendingLink } from "@/components/student/student-pending-link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  buildPracticeSubmittedAttempts,
  clearLegacyPracticeStorage,
  clampPracticeSidebarWidth as clampSidebarWidth,
  evaluatePracticeSubmittedAttempts,
  hasSubmittedPracticeAnswer,
  practiceAnswerMapsMatch,
  practiceAnswerMapStatus,
  practiceJsonRequest as jsonRequest,
  practiceAnswerKey,
  practiceSubmittedAttemptQuestionId,
  readPendingPracticeRound,
  settlePracticeRequest,
} from "@/lib/practice/client-helpers";
import {
  ASSIGNMENT_PRACTICE_START_ERROR,
  isAbortError,
  postRecommendationStream,
  postReviewStream,
  practiceRecommendationFailureMessage,
  reviewFromGradeFallback,
  validateAssignmentPracticeStartPayload,
} from "@/lib/practice/agent-client-runtime";
import { PRACTICE_INPUT_LIMITS } from "@/lib/practice/request-validation";
import { restorePracticeRoundState } from "@/lib/practice/round-restoration";
import type {
  AssignmentPracticeStartPayload,
  PracticeAttemptInput,
  PracticeCompletion,
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
  PracticeSourceOption,
  PracticeTraceEvent,
  PracticeWrongQuestionView,
} from "@/lib/practice/types";
import { threadStudyContext } from "@/lib/practice/thread-study-context";

const PracticeSessionSidebar = dynamic(
  () =>
    import("@/components/practice/practice-session-sidebar").then(
      (module) => module.PracticeSessionSidebar,
    ),
  {
    loading: () => <PracticeSessionListLoading />,
    ssr: false,
  },
);

function readPracticeClock() {
  return Date.now();
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

function practiceRoundDraftKey(sessionId?: string | null, roundId?: string | null) {
  return sessionId && roundId ? `${sessionId}:${roundId}` : "";
}

export function PracticeAgentClient({
  assignmentId,
  exitHref = assignmentId ? `/student/work/${assignmentId}` : "/student",
  testOnlyDelayedHydration = false,
}: PracticeAgentClientProps) {
  const isAssignmentMode = Boolean(assignmentId);
  const exitLabel = isAssignmentMode
    ? exitHref === "/student/work"
      ? "Back to My Work"
      : "Back to Assignment"
    : "Back to Dashboard";
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
  const answerWriteMetaRef = useRef<{
    hadInput: boolean;
    lastWriteReason: AnswerWriteReason | "NOT_OBSERVED";
  }>({ hadInput: false, lastWriteReason: "NOT_OBSERVED" });
  const [answerTransitionDiagnostics, setAnswerTransitionDiagnostics] =
    useState<AnswerTransitionDiagnostics>({
      answerRefCurrent: "NOT_OBSERVED",
      answerRefAfterInput: "NOT_OBSERVED",
      answerResetAfterInput: "NOT_OBSERVED",
      answerStateCurrent: "NOT_OBSERVED",
      answerStateAfterInput: "NOT_OBSERVED",
      answerStateRefConsistency: "NOT_OBSERVED",
      lastWriteReason: "NOT_OBSERVED",
    });
  const [hints, setHints] = useState<HintsState>({});
  const [results, setResults] = useState<PracticeGradeResult[]>([]);
  const [review, setReview] = useState<PracticeReviewResponse | null>(null);
  const [liveTrace, setLiveTrace] = useState<PracticeTraceEvent[]>([]);
  const [reviewTrace, setReviewTrace] = useState<PracticeTraceEvent[]>([]);
  const [longTermMemory, setLongTermMemory] = useState("");
  const [longTermMemoryDraft, setLongTermMemoryDraft] = useState("");
  const [memoryEditing, setMemoryEditing] = useState(false);
  const [outlineNotes, setOutlineNotes] = useState("");
  const [outlineSaving, setOutlineSaving] = useState(false);
  const [nextRoundNote, setNextRoundNote] = useState("");
  const [courseFrameworks, setCourseFrameworks] = useState<PracticeCourseFrameworkSummary[]>([]);
  const [selectedCourseFrameworkId, setSelectedCourseFrameworkId] = useState("");
  const [practiceSources, setPracticeSources] = useState<PracticeSourceOption[]>([]);
  const [includePublicCatalog, setIncludePublicCatalog] = useState(true);
  const [selectedBankIds, setSelectedBankIds] = useState<string[]>([]);
  const [completion, setCompletion] = useState<PracticeCompletion | null>(null);
  const [streamedCompletionReport, setStreamedCompletionReport] = useState("");
  const [isTraceCollapsed, setIsTraceCollapsed] = useState(true);
  const [isLeftSidebarCollapsed, setIsLeftSidebarCollapsed] = useState(false);
  const [isRightSidebarCollapsed, setIsRightSidebarCollapsed] = useState(true);
  const [leftSidebarWidth, setLeftSidebarWidth] = useState(DEFAULT_LEFT_SIDEBAR_WIDTH);
  const [rightSidebarWidth, setRightSidebarWidth] = useState(DEFAULT_RIGHT_SIDEBAR_WIDTH);
  const [wrongQuestions, setWrongQuestions] = useState<PracticeWrongQuestionView[]>([]);
  const [selectedWrongQuestionIds, setSelectedWrongQuestionIds] = useState<string[]>([]);
  const [renamingSessionId, setRenamingSessionId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [answerErrorQuestionIndexes, setAnswerErrorQuestionIndexes] = useState<number[]>([]);
  const [submissionGuardDiagnostics, setSubmissionGuardDiagnostics] = useState<ReturnType<
    typeof evaluatePracticeSubmittedAttempts
  > & { guard: "BLOCKED" | "PASSED" } | null>(null);
  const [thinkingElapsedMs, setThinkingElapsedMs] = useState(0);
  const [lastThinkingDurationMs, setLastThinkingDurationMs] = useState<number | null>(null);
  const [workspaceLoading, setWorkspaceLoading] = useState(Boolean(assignmentId));
  const [sessionHistoryLoading, setSessionHistoryLoading] = useState(true);
  const [sessionHistoryHasMore, setSessionHistoryHasMore] = useState(false);
  const [sessionHistoryLoadingMore, setSessionHistoryLoadingMore] = useState(false);
  const [practiceSourcesLoading, setPracticeSourcesLoading] = useState(!assignmentId);
  const [courseFrameworksLoading, setCourseFrameworksLoading] = useState(true);
  const [preferenceLoading, setPreferenceLoading] = useState(true);
  const [sessionAction, setSessionAction] = useState<"creating" | "switching" | null>(null);
  const [isReviewStreaming, setIsReviewStreaming] = useState(false);
  const [isPending, startTransition] = useTransition();
  const resultTopRef = useRef<HTMLDivElement | null>(null);
  const answerErrorSummaryRef = useRef<HTMLDivElement | null>(null);
  const rightSidebarRef = useRef<HTMLElement | null>(null);
  const submitInFlightRef = useRef(false);
  const thinkingStartedAtRef = useRef<number | null>(null);
  const streamedReviewTextRef = useRef("");
  const streamedReviewFrameRef = useRef<number | null>(null);
  const roundAnswerDraftsRef = useRef<Record<string, AnswersState>>({});
  const sessionDetailCacheRef = useRef(new Map<string, PracticeSessionDetail>());
  const sessionDetailRequestRef = useRef(
    new Map<string, Promise<PracticeSessionDetail>>(),
  );
  const sessionWrongQuestionsCacheRef = useRef(
    new Map<string, PracticeWrongQuestionView[]>(),
  );
  const practiceSourcesCacheRef = useRef<PracticeSourceOption[] | null>(null);
  const practiceSourcesRequestRef = useRef<Promise<PracticeSourceOption[]> | null>(null);
  const activePracticeOperationRef = useRef<{
    controller: AbortController;
    token: number;
  } | null>(null);
  const practiceOperationSequenceRef = useRef(0);
  const initialHydrationStartedRef = useRef(false);
  const assignmentLaunchStartedRef = useRef(false);
  const testOnlyDelayedHydrationStartedRef = useRef(false);
  const [testOnlyDelayedHydrationStatus, setTestOnlyDelayedHydrationStatus] =
    useState<TestOnlyDelayedHydrationStatus>(
      testOnlyDelayedHydration ? "NOT_REQUESTED" : "NOT_ENABLED",
    );

  function cacheSessionDetail(session: PracticeSessionDetail | null | undefined) {
    if (!session) return;
    const cache = sessionDetailCacheRef.current;
    cache.delete(session.id);
    cache.set(session.id, session);
    while (cache.size > SESSION_DETAIL_CACHE_LIMIT) {
      const oldestSessionId = cache.keys().next().value;
      if (typeof oldestSessionId !== "string") break;
      cache.delete(oldestSessionId);
    }
  }

  function cacheSessionWrongQuestions(
    sessionId: string,
    wrongQuestions: PracticeWrongQuestionView[],
  ) {
    sessionWrongQuestionsCacheRef.current.set(sessionId, wrongQuestions);
  }

  function cachePracticeSources(sources: PracticeSourceOption[]) {
    practiceSourcesCacheRef.current = sources;
  }

  function loadPracticeSources() {
    const cached = practiceSourcesCacheRef.current;
    if (cached) {
      setPracticeSources(cached);
      setPracticeSourcesLoading(false);
      return Promise.resolve(cached);
    }
    if (practiceSourcesRequestRef.current) return practiceSourcesRequestRef.current;

    setPracticeSourcesLoading(true);
    let request: Promise<PracticeSourceOption[]>;
    request = jsonRequest<{ sources: PracticeSourceOption[] }>(
      "/api/practice/sources",
    )
      .then((payload) => {
        cachePracticeSources(payload.sources);
        setPracticeSources(payload.sources);
        return payload.sources;
      })
      .finally(() => {
        if (practiceSourcesRequestRef.current === request) {
          practiceSourcesRequestRef.current = null;
        }
        setPracticeSourcesLoading(false);
      });
    practiceSourcesRequestRef.current = request;
    return request;
  }

  async function loadPracticeSessionDetail(
    sessionId: string,
    signal?: AbortSignal,
  ) {
    const cached = sessionDetailCacheRef.current.get(sessionId);
    if (cached) return cached;
    const inFlight = sessionDetailRequestRef.current.get(sessionId);
    if (inFlight) return inFlight;

    let request: Promise<PracticeSessionDetail>;
    request = jsonRequest<{ session: PracticeSessionDetail }>(
      `/api/practice/sessions/${sessionId}`,
      { signal },
    )
      .then((payload) => {
        cacheSessionDetail(payload.session);
        return payload.session;
      })
      .finally(() => {
        if (sessionDetailRequestRef.current.get(sessionId) === request) {
          sessionDetailRequestRef.current.delete(sessionId);
        }
      });
    sessionDetailRequestRef.current.set(sessionId, request);
    return request;
  }

  function prefetchPracticeSession(sessionId: string) {
    if (
      sessionDetailCacheRef.current.has(sessionId) ||
      sessionDetailRequestRef.current.has(sessionId)
    ) {
      return;
    }
    void loadPracticeSessionDetail(sessionId).catch(() => undefined);
  }

  function beginPracticeOperation() {
    activePracticeOperationRef.current?.controller.abort();
    const controller = new AbortController();
    const token = practiceOperationSequenceRef.current + 1;
    practiceOperationSequenceRef.current = token;
    activePracticeOperationRef.current = { controller, token };
    return { controller, token };
  }

  function isPracticeOperationCurrent(token: number) {
    const active = activePracticeOperationRef.current;
    return active?.token === token && !active.controller.signal.aborted;
  }

  function finishPracticeOperation(token: number) {
    if (activePracticeOperationRef.current?.token === token) {
      activePracticeOperationRef.current = null;
    }
  }

  function cancelPracticeOperation({ resetReviewState = true }: { resetReviewState?: boolean } = {}) {
    activePracticeOperationRef.current?.controller.abort();
    activePracticeOperationRef.current = null;
    cancelPendingRoundReviewFrame();
    if (resetReviewState) {
      setIsReviewStreaming(false);
    }
  }

  function commitAnswers(
    nextAnswers: AnswersState,
    reason: AnswerWriteReason,
    { protectNewerInput = false }: { protectNewerInput?: boolean } = {},
  ) {
    if (protectNewerInput && answerWriteMetaRef.current.lastWriteReason === "INPUT") {
      return false;
    }

    const committedAnswers = Object.freeze({ ...nextAnswers }) as AnswersState;
    const hasAnyAnswer = Object.values(committedAnswers).some(hasSubmittedPracticeAnswer);
    const answerStatus = recommendation?.recommendations.length
      ? practiceAnswerMapStatus(recommendation.recommendations, committedAnswers)
      : hasAnyAnswer
        ? "PRESENT"
        : "EMPTY";
    const hadInput = answerWriteMetaRef.current.hadInput;
    const clearsInputGeneration =
      reason === "SESSION_CHANGE" ||
      reason === "ROUND_CHANGE" ||
      reason === "RESET" ||
      reason === "COMPLETED_RESTORE";
    answersRef.current = committedAnswers;
    setAnswers(committedAnswers);
    if (reason === "INPUT") {
      const draftKey = practiceRoundDraftKey(activeSession?.id, recommendation?.roundId);
      if (draftKey) {
        roundAnswerDraftsRef.current[draftKey] = committedAnswers;
      }
    }
    answerWriteMetaRef.current = {
      hadInput: reason === "INPUT" ? true : clearsInputGeneration ? false : hadInput,
      lastWriteReason: reason,
    };
    setAnswerTransitionDiagnostics((current) => ({
      answerRefCurrent: answerStatus,
      answerRefAfterInput: reason === "INPUT"
        ? answerStatus
        : current.answerRefAfterInput,
      answerResetAfterInput: reason === "INPUT"
        ? "NO"
        : hadInput && !hasAnyAnswer
          ? "YES"
          : current.answerResetAfterInput,
      answerStateCurrent: answerStatus,
      answerStateAfterInput: reason === "INPUT"
        ? answerStatus
        : current.answerStateAfterInput,
      answerStateRefConsistency: "MATCH",
      lastWriteReason: reason,
    }));
    return true;
  }

  async function refreshPracticeState(
    preferredSessionId?: string,
    {
      deferAuxiliary = false,
      loadWorkspaceOptions = false,
      commitActiveSession = true,
      restoreActive = true,
      skipSessionRequest = false,
      sessionOverride,
    }: {
      deferAuxiliary?: boolean;
      loadWorkspaceOptions?: boolean;
      commitActiveSession?: boolean;
      restoreActive?: boolean;
      skipSessionRequest?: boolean;
      sessionOverride?: PracticeSessionDetail;
    } = {},
  ) {
    const shouldRestoreSession = restoreActive || Boolean(preferredSessionId);
    const sessionPayloadPromise = skipSessionRequest
      ? Promise.resolve<PracticeSessionsPayload>({
          activeSession: null,
          sessions: [],
        })
      : jsonRequest<PracticeSessionsPayload>(
          shouldRestoreSession && !preferredSessionId
            ? "/api/practice/sessions"
            : "/api/practice/sessions?includeActive=0",
        );
    const preferenceStatePromise = loadWorkspaceOptions
      ? settlePracticeRequest(
          jsonRequest<{ longTermPreference: string }>("/api/practice/preferences"),
          (payload) => {
            setLongTermMemory(payload.longTermPreference);
            setLongTermMemoryDraft(payload.longTermPreference);
          },
          () => setPreferenceLoading(false),
        )
      : Promise.resolve(null);
    const frameworkStatePromise = loadWorkspaceOptions
      ? settlePracticeRequest(
          jsonRequest<{ frameworks: PracticeCourseFrameworkSummary[] }>(
            "/api/practice/course-frameworks",
          ),
          (payload) => setCourseFrameworks(payload.frameworks),
          () => setCourseFrameworksLoading(false),
        )
      : Promise.resolve(null);
    const eagerSourceStatePromise = !assignmentId && !shouldRestoreSession
      ? settlePracticeRequest(
          loadPracticeSources(),
          () => undefined,
          () => setPracticeSourcesLoading(false),
        )
      : null;
    let sessionPayload: PracticeSessionsPayload;
    try {
      sessionPayload = await sessionPayloadPromise;
    } finally {
      setSessionHistoryLoading(false);
    }

    let nextSession = restoreActive ? sessionPayload.activeSession : null;
    if (sessionOverride) {
      nextSession = sessionOverride;
    } else if (preferredSessionId) {
      const detail = await jsonRequest<{ session: PracticeSessionDetail }>(
        `/api/practice/sessions/${preferredSessionId}`,
      );
      nextSession = detail.session;
    }
    cacheSessionDetail(nextSession);

    const sourceOptionsPromise: Promise<PracticeSourceOption[]> = assignmentId
      ? Promise.resolve([])
      : loadPracticeSources();
    const sourceStatePromise = eagerSourceStatePromise ??
      settlePracticeRequest(
        sourceOptionsPromise,
        () => undefined,
        () => setPracticeSourcesLoading(false),
      );
    const wrongPayloadPromise = nextSession
      ? jsonRequest<{ wrongQuestions: PracticeWrongQuestionView[] }>(
          `/api/practice/wrong-questions?sessionId=${encodeURIComponent(nextSession.id)}`,
        )
      : Promise.resolve({ wrongQuestions: [] });
    const wrongStatePromise = settlePracticeRequest(
      wrongPayloadPromise,
      (payload) => {
        if (nextSession) {
          cacheSessionWrongQuestions(nextSession.id, payload.wrongQuestions);
        }
        setWrongQuestions(payload.wrongQuestions);
      },
    );
    const auxiliaryStatePromise = Promise.all([
      preferenceStatePromise,
      frameworkStatePromise,
      sourceStatePromise,
      wrongStatePromise,
    ]).then((errors) => ({ error: errors.find(Boolean) }));

    setSessions(
      isAssignmentMode && nextSession
        ? [nextSession]
        : sessionPayload.sessions,
    );
    setSessionHistoryHasMore(
      isAssignmentMode ? false : Boolean(sessionPayload.pagination?.hasMore),
    );
    if (commitActiveSession) setActiveSession(nextSession);
    setOutlineNotes(nextSession?.outlineUserNotes ?? "");
    if (nextSession?.status === "active" && nextSession.sourceScope.length) {
      setIncludePublicCatalog(
        nextSession.sourceScope.some((source) => source.sourceKind === "public_catalog"),
      );
      setSelectedBankIds(
        nextSession.sourceScope.flatMap((source) =>
          source.sourceKind === "question_bank" && source.bankId ? [source.bankId] : [],
        ),
      );
    }
    setCompletion(nextSession?.completion ?? null);
    if (nextSession?.completion) {
      setStreamedCompletionReport(nextSession.completion.report);
      setPhase("completed");
    }

    if (deferAuxiliary) {
      void auxiliaryStatePromise.then(({ error: auxiliaryError }) => {
        if (auxiliaryError) {
          setError(
            auxiliaryError instanceof Error
              ? auxiliaryError.message
              : String(auxiliaryError),
          );
        }
      });
    } else {
      const { error: auxiliaryError } = await auxiliaryStatePromise;
      if (auxiliaryError) throw auxiliaryError;
    }

    return nextSession;
  }

  function restoreRoundFromHistory(
    round: PracticeRoundHistory,
    session = activeSession,
    reason: AnswerWriteReason = round.status === "completed"
      ? "COMPLETED_RESTORE"
      : "SESSION_HYDRATION",
  ) {
    if (!session) return;
    const restored = restorePracticeRoundState(
      round,
      session,
      roundAnswerDraftsRef.current[practiceRoundDraftKey(session.id, round.id)],
    );
    if (!restored) return;

    setRecommendation(restored.recommendation);
    commitAnswers(restored.answers, reason, {
      protectNewerInput: reason === "SESSION_HYDRATION",
    });
    setHints(restored.hints);
    setResults(restored.results);
    setLiveTrace(restored.liveTrace);
    setReviewTrace(restored.reviewTrace);
    setGoal(restored.goal);
    setReview(restored.review);
    setPhase(restored.phase);
  }

  async function runTestOnlyDelayedHydration() {
    if (!testOnlyDelayedHydration || testOnlyDelayedHydrationStartedRef.current) return;
    testOnlyDelayedHydrationStartedRef.current = true;
    setTestOnlyDelayedHydrationStatus("REQUESTED");
    try {
      const payload = await jsonRequest<{ session: PracticeSessionDetail }>(
        "/__test__/practice-answer-state/delayed-hydration",
      );
      const delayedRound = payload.session.rounds[payload.session.rounds.length - 1];
      if (!delayedRound?.questions.length) {
        setTestOnlyDelayedHydrationStatus("FAILED");
        return;
      }
      restoreRoundFromHistory(delayedRound, payload.session, "SESSION_HYDRATION");
      setTestOnlyDelayedHydrationStatus(
        answerWriteMetaRef.current.lastWriteReason === "INPUT"
          ? "REJECTED_AS_STALE"
          : "APPLIED",
      );
    } catch {
      setTestOnlyDelayedHydrationStatus("FAILED");
    }
  }

  useEffect(() => {
    if (phase === "recommended" || phase === "feedback") {
      resultTopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [phase]);

  const latestTrace = useMemo(() => {
    if (phase === "feedback" && review) return reviewTrace;
    if (phase === "thinking") return liveTrace;
    return recommendation?.trace ?? liveTrace;
  }, [phase, liveTrace, recommendation, review, reviewTrace]);

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

  const isStarterPractice =
    phase === "start" &&
    !recommendation &&
    !activeSession?.rounds.length;
  const practiceNavigationLocked =
    sessionAction !== null ||
    isReviewStreaming ||
    isPending ||
    phase === "thinking" ||
    phase === "ending";
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
  function resetRoundState(reason: AnswerWriteReason = "RESET") {
    setSubmissionGuardDiagnostics(null);
    setAnswerErrorQuestionIndexes([]);
    commitAnswers({}, reason);
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
    setCompletion(null);
    setStreamedCompletionReport("");
  }

  function beginThinking() {
    thinkingStartedAtRef.current = readPracticeClock();
    setThinkingElapsedMs(0);
    setLastThinkingDurationMs(null);
    setIsTraceCollapsed(true);
    setPhase("thinking");
  }

  function finishThinking(nextPhase: Phase) {
    const startedAt = thinkingStartedAtRef.current;
    if (startedAt) setLastThinkingDurationMs(readPracticeClock() - startedAt);
    thinkingStartedAtRef.current = null;
    setPhase(nextPhase);
  }

  async function runPreferenceMerge() {
    try {
      const mergePayload = await jsonRequest<{
        longTermPreference: string;
        status: string;
      }>(
        "/api/practice/preferences/merge/run",
        { method: "POST", body: "{}" },
      );
      setLongTermMemory(mergePayload.longTermPreference);
    } catch {
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
    cacheSessionDetail(payload.session);
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
      // Auto naming is a convenience and must not block recommendation.
    }
  }

  async function ensureSession(trimmedGoal: string) {
    if (activeSession) return activeSession;
    if (isAssignmentMode) {
      throw new Error(
        "This assignment session is unavailable. Return to My Work and reopen this assignment.",
      );
    }
    const payload = await jsonRequest<{ session: PracticeSessionDetail }>("/api/practice/sessions", {
      body: JSON.stringify({
        courseFrameworkId: selectedCourseFrameworkId || null,
        goal: trimmedGoal,
        title: "New practice session",
      }),
      method: "POST",
    });
    cacheSessionDetail(payload.session);
    setActiveSession(payload.session);
    setSessions((current) => [
      payload.session,
      ...current.filter((item) => item.id !== payload.session.id),
    ]);
    void runPreferenceMerge();
    return payload.session;
  }

  async function startAssignmentPractice(launchAssignmentId: string) {
    setError(null);
    beginThinking();
    setLiveTrace([]);
    setReviewTrace([]);
    resetRoundState("SESSION_CHANGE");
    resetSessionScopedDrafts();

    const payload = await jsonRequest<unknown>(
      "/api/practice/assignments/start",
      {
        body: JSON.stringify({ assignmentId: launchAssignmentId }),
        method: "POST",
      },
    );

    validateAssignmentPracticeStartPayload(payload, launchAssignmentId);
    cacheSessionDetail(payload.session);
    const restoredSession = await refreshPracticeState(payload.session.id, {
      commitActiveSession: false,
      deferAuxiliary: true,
      loadWorkspaceOptions: true,
      restoreActive: false,
      skipSessionRequest: true,
      sessionOverride: payload.session,
    });
    if (restoredSession !== payload.session) {
      throw new Error(ASSIGNMENT_PRACTICE_START_ERROR);
    }

    setAssignmentLaunch(payload.assignment);
    cacheSessionDetail(payload.session);
    setActiveSession(payload.session);
    const currentRound = restoredSession?.rounds[restoredSession.rounds.length - 1];

    if (restoredSession && currentRound?.questions.length) {
      restoreRoundFromHistory(currentRound, restoredSession);
      const restoredCompleted = currentRound.status === "completed";
      finishThinking(restoredCompleted ? "feedback" : "recommended");
      if (!restoredCompleted) void runTestOnlyDelayedHydration();
      return;
    }

    setRecommendation(payload.recommendation);
    setLiveTrace(payload.recommendation.trace);
    setGoal(payload.recommendation.roundGoal);
    finishThinking("recommended");
    void runTestOnlyDelayedHydration();
  }

  useEffect(() => {
    if (initialHydrationStartedRef.current) return;
    initialHydrationStartedRef.current = true;

    startTransition(async () => {
      try {
        clearLegacyPracticeStorage();
        if (assignmentId && !assignmentLaunchStartedRef.current) {
          // Prevent duplicate assignment-start requests within one mounted client.
          assignmentLaunchStartedRef.current = true;
          await startAssignmentPractice(assignmentId);
          return;
        }

        const pendingRound = readPendingPracticeRound();
        if (pendingRound) {
          setRecommendation(pendingRound);
          setGoal(pendingRound.roundGoal);
          setLiveTrace(pendingRound.trace ?? []);
          setPhase("recommended");
          if (pendingRound.sessionId) {
            await refreshPracticeState(pendingRound.sessionId, {
              loadWorkspaceOptions: true,
            });
          } else {
            await refreshPracticeState(undefined, {
              deferAuxiliary: true,
              loadWorkspaceOptions: true,
              restoreActive: false,
            });
          }
        } else {
          const restoredSession = await refreshPracticeState(undefined, {
            deferAuxiliary: true,
            loadWorkspaceOptions: true,
            restoreActive: true,
          });
          const latestRound =
            restoredSession?.rounds[restoredSession.rounds.length - 1];
          if (
            restoredSession?.status !== "completed" &&
            latestRound?.questions.length
          ) {
            restoreRoundFromHistory(latestRound, restoredSession);
          }
        }
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : String(caught));
        finishThinking("start");
      } finally {
        setWorkspaceLoading(false);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => () => {
    activePracticeOperationRef.current?.controller.abort();
    activePracticeOperationRef.current = null;
    if (streamedReviewFrameRef.current !== null) {
      window.cancelAnimationFrame(streamedReviewFrameRef.current);
      streamedReviewFrameRef.current = null;
    }
  }, []);

  function appendRoundReviewDelta(text: string) {
    streamedReviewTextRef.current += text;
    if (streamedReviewFrameRef.current !== null) return;

    streamedReviewFrameRef.current = window.requestAnimationFrame(() => {
      streamedReviewFrameRef.current = null;
      const summary = streamedReviewTextRef.current;
      setReview((current) => ({
        ...(current ?? {
          mode: "ai",
          nextRoundGoal: activeSession?.goal || recommendation?.roundGoal || "",
          questionReviews: [],
          results: [],
          sessionId: activeSession?.id ?? "",
          trace: [],
          updatedSessionMemory: "",
        }),
        summary,
      }));
    });
  }

  function cancelPendingRoundReviewFrame() {
    if (streamedReviewFrameRef.current === null) return;
    window.cancelAnimationFrame(streamedReviewFrameRef.current);
    streamedReviewFrameRef.current = null;
  }

  function requestRecommendation(nextGoal?: string, wrongIds = selectedWrongQuestionIds) {
    if (
      isPending ||
      isReviewStreaming ||
      phase === "thinking" ||
      phase === "ending" ||
      sessionAction !== null
    ) {
      return;
    }
    const trimmedGoal = (nextGoal ?? goal).trim();
    if (!trimmedGoal) {
      setError("Enter a practice goal first.");
      return;
    }
    if (
      !assignmentId &&
      !activeSession?.sourceScopeLockedAt &&
      !includePublicCatalog &&
      selectedBankIds.length === 0
    ) {
      setError("Choose at least one Library or the Public Library.");
      return;
    }

    const phaseBeforeRecommendation = phase;
    const operation = beginPracticeOperation();
    setError(null);
    beginThinking();
    setLiveTrace([]);
    setReviewTrace([]);

    startTransition(async () => {
      try {
        const currentSession = await ensureSession(trimmedGoal);
        if (!isPracticeOperationCurrent(operation.token)) return;
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
            sourceSelection: {
              bankIds: selectedBankIds,
              includePublicCatalog,
            },
            userNextRoundNote: nextRoundNote,
            wrongQuestionIds: wrongIds,
          },
          onEnding: () => {
            if (!isPracticeOperationCurrent(operation.token)) return;
            setStreamedCompletionReport("");
            finishThinking("ending");
          },
          onPolicyNotice: () => undefined,
          onSummaryDelta: (text) => {
            if (!isPracticeOperationCurrent(operation.token)) return;
            setStreamedCompletionReport((current) => current + text);
          },
          onTrace: (event) => {
            if (!isPracticeOperationCurrent(operation.token)) return;
            setLiveTrace((current) => [...current, event]);
          },
          signal: operation.controller.signal,
        });
        const response = await responsePromise;
        if (!isPracticeOperationCurrent(operation.token)) return;
        void titlePromise;
        if (response.kind === "completed") {
          resetRoundState("ROUND_CHANGE");
          setCompletion(response.completion);
          setStreamedCompletionReport(response.completion.report);
          setGoal(trimmedGoal);
          setSelectedWrongQuestionIds([]);
          setNextRoundNote("");
          finishThinking("completed");
          await refreshPracticeState(currentSession.id, { deferAuxiliary: true })
            .catch(() => undefined);
          return;
        }
        const nextRecommendation = response.recommendation;
        resetRoundState("ROUND_CHANGE");
        setRecommendation(nextRecommendation);
        setLiveTrace(nextRecommendation.trace);
        setGoal(trimmedGoal);
        setSelectedWrongQuestionIds([]);
        setNextRoundNote("");
        const nextActiveSession = {
          ...currentSession,
          goal: nextRecommendation.roundGoal,
          sessionMemory: nextRecommendation.sessionMemory,
          sessionPlan: nextRecommendation.sessionPlan ?? currentSession.sessionPlan,
          sourceScopeLockedAt: currentSession.sourceScopeLockedAt ?? new Date().toISOString(),
          sessionState: nextRecommendation.sessionState ?? currentSession.sessionState,
          tagContext: nextRecommendation.tagContext,
        };
        cacheSessionDetail(nextActiveSession);
        setActiveSession(nextActiveSession);
        finishThinking("recommended");
        await refreshPracticeState(currentSession.id, { deferAuxiliary: true })
          .catch(() => undefined);
      } catch (caught) {
        if (
          operation.controller.signal.aborted ||
          !isPracticeOperationCurrent(operation.token) ||
          isAbortError(caught)
        ) {
          return;
        }
        setError(practiceRecommendationFailureMessage(caught));
        finishThinking(phaseBeforeRecommendation);
      } finally {
        finishPracticeOperation(operation.token);
      }
    });
  }

  function updateAnswer(questionId: string, value: string | string[]) {
    const nextAnswers = { ...answersRef.current, [questionId]: value };
    commitAnswers(nextAnswers, "INPUT");
    setAnswerErrorQuestionIndexes((current) =>
      current.filter((questionIndex) => {
        const question = recommendation?.recommendations[questionIndex - 1];
        return question ? practiceAnswerKey(question) !== questionId : false;
      }),
    );
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
            roundId: recommendation?.roundId,
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
    if (
      submitInFlightRef.current ||
      isPending ||
      isReviewStreaming ||
      !recommendation ||
      !activeSession ||
      !recommendation.roundId
    ) {
      return;
    }

    const submittedAnswerSnapshot = Object.freeze({ ...answersRef.current });
    const missingAnswerIndexes = recommendation.recommendations.flatMap(
      (question, index) =>
        hasSubmittedPracticeAnswer(
          submittedAnswerSnapshot[practiceAnswerKey(question)],
        )
          ? []
          : [index + 1],
    );
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
          gradingCapability: "needs_configuration" as const,
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
    const submittedAnswerState = practiceAnswerMapStatus(
      recommendation.recommendations,
      answers,
    );
    const submittedAnswerRef = practiceAnswerMapStatus(
      recommendation.recommendations,
      submittedAnswerSnapshot,
    );
    const submittedAnswerConsistency = practiceAnswerMapsMatch(
      recommendation.recommendations,
      answers,
      submittedAnswerSnapshot,
    );
    const guardBlocked =
      submissionEvaluation.submittedAttempt !== "FOUND" ||
      submissionEvaluation.missingRequiredAttemptCount > 0 ||
      submittedAnswerState !== "PRESENT" ||
      submittedAnswerRef !== "PRESENT" ||
      submittedAnswerConsistency !== "MATCH";
    setSubmissionGuardDiagnostics({
      ...submissionEvaluation,
      guard: guardBlocked ? "BLOCKED" : "PASSED",
    });
    if (guardBlocked) {
      setAnswerErrorQuestionIndexes(missingAnswerIndexes);
      setError("Your answer was not captured. Please review it and try again.");
      window.requestAnimationFrame(() => {
        answerErrorSummaryRef.current?.focus();
      });
      return;
    }

    const operation = beginPracticeOperation();
    setAnswerErrorQuestionIndexes([]);
    submitInFlightRef.current = true;
    setIsReviewStreaming(true);
    setError(null);
    beginThinking();
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
    streamedReviewTextRef.current = "";
    setPhase("feedback");

    startTransition(async () => {
      let deterministicGrade: PracticeGradeResponse | null = null;
      try {
        deterministicGrade = await jsonRequest<PracticeGradeResponse>("/api/practice/grade", {
          body: JSON.stringify({
            attempts: submittedAttempts,
            deferCompletion: true,
            roundId: recommendation.roundId,
            sessionId: activeSession.id,
          }),
          method: "POST",
          signal: operation.controller.signal,
        });
        if (!isPracticeOperationCurrent(operation.token)) return;
        setResults(deterministicGrade.results);

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
            if (!isPracticeOperationCurrent(operation.token)) return;
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
            if (!isPracticeOperationCurrent(operation.token)) return;
            cancelPendingRoundReviewFrame();
            streamedReviewTextRef.current = reviewResponse.summary;
            setResults(reviewResponse.results ?? []);
            setReview(reviewResponse);
            setReviewTrace(reviewResponse.trace);
            setLiveTrace(reviewResponse.trace);
          },
          onRoundReviewDelta: (text) => {
            if (!isPracticeOperationCurrent(operation.token)) return;
            appendRoundReviewDelta(text);
          },
          onRoundReviewStart: () => {
            if (!isPracticeOperationCurrent(operation.token)) return;
            cancelPendingRoundReviewFrame();
            streamedReviewTextRef.current = "";
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
            if (!isPracticeOperationCurrent(operation.token)) return;
            setReviewTrace((current) => [...current, event]);
            setLiveTrace((current) => [...current, event]);
          },
          signal: operation.controller.signal,
        });
        if (!isPracticeOperationCurrent(operation.token)) return;
        setGoal("");
        finishThinking("feedback");
        setIsReviewStreaming(false);
        await refreshPracticeState(activeSession.id, { deferAuxiliary: true })
          .catch(() => undefined);
      } catch (caught) {
        if (
          operation.controller.signal.aborted ||
          !isPracticeOperationCurrent(operation.token) ||
          isAbortError(caught)
        ) {
          return;
        }
        try {
          if (!deterministicGrade) {
            throw new Error("Deterministic grading did not complete before AI review failed.");
          }
          const grade = deterministicGrade;
          if (!isPracticeOperationCurrent(operation.token)) return;
          const fallbackReview = reviewFromGradeFallback({
            activeSession,
            attempts: submittedAttempts,
            error: caught,
            grade,
            recommendation,
          });
          cancelPendingRoundReviewFrame();
          streamedReviewTextRef.current = fallbackReview.summary;
          setResults(grade.results);
          setReview(fallbackReview);
          setReviewTrace(fallbackReview.trace);
          setLiveTrace(fallbackReview.trace);
          setGoal("");
          finishThinking("feedback");
          setIsReviewStreaming(false);
          await refreshPracticeState(activeSession.id, { deferAuxiliary: true })
            .catch(() => undefined);
        } catch (fallbackError) {
          if (
            operation.controller.signal.aborted ||
            !isPracticeOperationCurrent(operation.token) ||
            isAbortError(fallbackError)
          ) {
            return;
          }
          const primaryMessage = caught instanceof Error ? caught.message : String(caught);
          const fallbackMessage = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
          setError(`${primaryMessage} Deterministic grading fallback also failed: ${fallbackMessage}`);
          finishThinking("feedback");
          setIsReviewStreaming(false);
        }
        } finally {
          finishPracticeOperation(operation.token);
          submitInFlightRef.current = false;
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
    if (isAssignmentMode) {
      setError("Assignment Practice is locked to this assignment.");
      return;
    }
    cancelPracticeOperation();
    const operation = beginPracticeOperation();
    setSessionAction("switching");
    setError(null);
    startTransition(async () => {
      const cachedWrongQuestions = sessionWrongQuestionsCacheRef.current.get(sessionId);
      const cachedSources = practiceSourcesCacheRef.current;
      const sessionPromise = loadPracticeSessionDetail(
        sessionId,
        operation.controller.signal,
      );
      const wrongQuestionsPromise = cachedWrongQuestions
        ? Promise.resolve({ wrongQuestions: cachedWrongQuestions })
        : jsonRequest<{ wrongQuestions: PracticeWrongQuestionView[] }>(
            `/api/practice/wrong-questions?sessionId=${encodeURIComponent(sessionId)}`,
            { signal: operation.controller.signal },
          );
      const sourcesPromise = cachedSources
        ? Promise.resolve({ sources: cachedSources })
        : loadPracticeSources().then((sources) => ({ sources }));
      void wrongQuestionsPromise.catch(() => undefined);
      void sourcesPromise.catch(() => undefined);

      try {
        const session = await sessionPromise;
        if (!isPracticeOperationCurrent(operation.token)) return;
        cacheSessionDetail(session);
        setActiveSession(session);
        setOutlineNotes(session.outlineUserNotes ?? "");
        resetRoundState("SESSION_CHANGE");
        resetSessionScopedDrafts();
        if (cachedWrongQuestions) setWrongQuestions(cachedWrongQuestions);
        if (session.status === "completed" && session.completion) {
          setCompletion(session.completion);
          setStreamedCompletionReport(session.completion.report);
          setGoal(session.goal);
          setPhase("completed");
        } else if (session.rounds.length) {
          const latestRound = session.rounds[session.rounds.length - 1];
          restoreRoundFromHistory(
              latestRound,
              session,
              latestRound.status === "completed"
                ? "COMPLETED_RESTORE"
                : "SESSION_CHANGE",
          );
        } else {
          setGoal("");
          setPhase("start");
        }
        setSessionAction(null);

        void wrongQuestionsPromise
          .then((wrongPayload) => {
            if (!isPracticeOperationCurrent(operation.token)) return;
            cacheSessionWrongQuestions(session.id, wrongPayload.wrongQuestions);
            setWrongQuestions(wrongPayload.wrongQuestions);
          })
          .catch(() => {
            if (isPracticeOperationCurrent(operation.token)) setWrongQuestions([]);
          });
        void sourcesPromise
          .then((sourcePayload) => {
            if (!isPracticeOperationCurrent(operation.token)) return;
            cachePracticeSources(sourcePayload.sources);
            setPracticeSources(sourcePayload.sources);
          })
          .catch(() => {
            if (isPracticeOperationCurrent(operation.token)) setPracticeSources([]);
          });
        await Promise.allSettled([wrongQuestionsPromise, sourcesPromise]);
      } catch (caught) {
        if (
          operation.controller.signal.aborted ||
          !isPracticeOperationCurrent(operation.token) ||
          isAbortError(caught)
        ) {
          return;
        }
        setError(caught instanceof Error ? caught.message : String(caught));
      } finally {
        if (isPracticeOperationCurrent(operation.token)) {
          setSessionAction(null);
          finishPracticeOperation(operation.token);
        }
      }
    });
  }

  async function loadMoreSessions() {
    if (isAssignmentMode) return;
    setSessionHistoryLoadingMore(true);
    setError(null);
    try {
      const payload = await jsonRequest<PracticeSessionsPayload>(
        `/api/practice/sessions?includeActive=0&limit=25&offset=${sessions.length}`,
      );
      setSessions((current) => {
        const byId = new Map(current.map((item) => [item.id, item]));
        payload.sessions.forEach((item) => byId.set(item.id, item));
        return Array.from(byId.values());
      });
      setSessionHistoryHasMore(Boolean(payload.pagination?.hasMore));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setSessionHistoryLoadingMore(false);
    }
  }

  function createNewSession() {
    if (isAssignmentMode) {
      setError("Finish or return to this assignment before starting other Practice.");
      return;
    }
    cancelPracticeOperation();
    setSessionAction(null);
    setError(null);
    prepareScopedNewSession();
  }

  function resetPracticeProgress() {
    if (isAssignmentMode) return;
    cancelPracticeOperation();
    setError(null);
    startTransition(async () => {
      try {
        await jsonRequest<{ resetAt: string }>("/api/practice/progress/reset", {
          method: "POST",
        });
        prepareScopedNewSession();
        const payload = await jsonRequest<{ sources: PracticeSourceOption[] }>(
          "/api/practice/sources",
        );
        cachePracticeSources(payload.sources);
        setPracticeSources(payload.sources);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : String(caught));
      }
    });
  }

  function showHistoricalRound(roundId: string) {
    if (practiceNavigationLocked) return;
    const round = activeSession?.rounds.find((item) => item.id === roundId);
    if (round && activeSession) {
      restoreRoundFromHistory(round, activeSession, "COMPLETED_RESTORE");
    }
  }

  function showCompletionSummary() {
    if (practiceNavigationLocked) return;
    if (!activeSession?.completion) return;
    setRecommendation(null);
    setReview(null);
    setResults([]);
    setCompletion(activeSession.completion);
    setStreamedCompletionReport(activeSession.completion.report);
    setPhase("completed");
  }

  function prepareScopedNewSession({ retryMistakes = false } = {}) {
    if (isAssignmentMode && assignmentId) {
      startTransition(async () => {
        try {
          await startAssignmentPractice(assignmentId);
        } catch (caught) {
          setError(caught instanceof Error ? caught.message : String(caught));
        }
      });
      return;
    }
    cancelPracticeOperation();
    setSessionAction(null);
    const retryQuestionIds = retryMistakes
      ? wrongQuestions
          .filter((question) => !question.masteredAt)
          .map((question) => question.sourceQuestionId)
      : [];
    setActiveSession(null);
    roundAnswerDraftsRef.current = {};
    setOutlineNotes("");
    setWrongQuestions([]);
    resetRoundState("SESSION_CHANGE");
    resetSessionScopedDrafts();
    setGoal(retryMistakes ? "Review my remaining mistakes in the selected Libraries" : "");
    if (retryMistakes) {
      setSelectedWrongQuestionIds(retryQuestionIds);
    }
    setPhase("start");
    if (!isAssignmentMode && !practiceSourcesCacheRef.current) {
      void loadPracticeSources().catch(() => undefined);
    }
  }

  function deleteSession(sessionId: string) {
    if (isAssignmentMode) {
      setError("Assignment Practice sessions cannot be deleted from this workspace.");
      return;
    }
    const deletedWasActive = activeSession?.id === sessionId;
    if (deletedWasActive) setSessionAction("switching");
    setError(null);
    startTransition(async () => {
      let handedOffToSessionSwitch = false;
      try {
        await jsonRequest<{ ok: boolean }>(`/api/practice/sessions/${sessionId}`, { method: "DELETE" });
        const payload = await jsonRequest<PracticeSessionsPayload>("/api/practice/sessions?includeActive=0");
        setSessions(payload.sessions);
        setSessionHistoryHasMore(Boolean(payload.pagination?.hasMore));
        if (!deletedWasActive) return;
        const nextSession = payload.sessions.find((item) => item.id !== sessionId);
        if (nextSession) {
          handedOffToSessionSwitch = true;
          switchSession(nextSession.id);
          return;
        }
        setActiveSession(null);
        resetRoundState("SESSION_CHANGE");
        resetSessionScopedDrafts();
        setGoal("");
        setPhase("start");
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : String(caught));
      } finally {
        if (!handedOffToSessionSwitch) setSessionAction(null);
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

  function showStudyDetails() {
    setIsRightSidebarCollapsed(false);
    window.requestAnimationFrame(() => focusStudyDetails(rightSidebarRef.current));
  }

  if (workspaceLoading) return <PracticeWorkspaceSkeleton />;

  return (
    <div
      className={`mx-[calc(50%-50vw)] grid min-h-[calc(100vh-7rem)] w-screen gap-4 px-3 transition-[grid-template-columns] duration-300 ease-out sm:px-4 ${
        isAssignmentMode
          ? "xl:grid-cols-[minmax(0,1fr)_var(--practice-right)]"
          : "xl:grid-cols-[var(--practice-left)_minmax(0,1fr)_var(--practice-right)]"
      }`}
      data-answer-last-write-reason={answerTransitionDiagnostics.lastWriteReason}
      data-answer-map-has-rendered-key={submissionGuardDiagnostics?.answerMapHasRenderedKey}
      data-answer-map-has-submit-lookup-key={submissionGuardDiagnostics?.answerMapHasSubmitLookupKey}
      data-answer-ref-after-input={answerTransitionDiagnostics.answerRefAfterInput}
      data-answer-ref-before-submit={answerTransitionDiagnostics.answerRefCurrent}
      data-answer-reset-after-input={answerTransitionDiagnostics.answerResetAfterInput}
      data-answer-state-after-input={answerTransitionDiagnostics.answerStateAfterInput}
      data-answer-state-before-submit={answerTransitionDiagnostics.answerStateCurrent}
      data-answer-state-ref-consistency={answerTransitionDiagnostics.answerStateRefConsistency}
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
      data-test-only-delayed-hydration={
        testOnlyDelayedHydration ? testOnlyDelayedHydrationStatus : undefined
      }
      data-testid="practice-submission-state"
      style={practiceGridStyle}
    >
      {!isAssignmentMode ? (
        <PracticeSessionSidebar
          activeSessionId={activeSession?.id}
          isCollapsed={isLeftSidebarCollapsed}
          isPending={isPending}
          longTermMemory={longTermMemory}
          longTermMemoryDraft={longTermMemoryDraft}
          memoryEditing={memoryEditing}
          onBeginRename={beginRenameSession}
          onCancelRename={() => {
            setRenamingSessionId(null);
            setRenameValue("");
          }}
          onClearLongTermMemory={clearLongTermMemory}
          onCollapse={() => setIsLeftSidebarCollapsed(true)}
          onCreateNewSession={createNewSession}
          onDeleteSession={deleteSession}
          onExpand={() => setIsLeftSidebarCollapsed(false)}
          onLoadMore={() => void loadMoreSessions()}
          onPrefetchSession={prefetchPracticeSession}
          onResetPracticeProgress={resetPracticeProgress}
          onRenameValueChange={setRenameValue}
          onResize={(event) => beginSidebarResize("left", event)}
          onSaveLongTermMemory={saveLongTermMemory}
          onSetLongTermMemoryDraft={setLongTermMemoryDraft}
          onSetMemoryEditing={setMemoryEditing}
          onSubmitRename={submitRenameSession}
          onSwitchSession={switchSession}
          preferenceLoading={preferenceLoading}
          renameValue={renameValue}
          renamingSessionId={renamingSessionId}
          sessionHistoryHasMore={sessionHistoryHasMore}
          sessionHistoryLoading={sessionHistoryLoading}
          sessionHistoryLoadingMore={sessionHistoryLoadingMore}
          sessions={sessions}
        />
      ) : null}

        <main className="relative min-w-0 space-y-4 px-0 xl:px-2">
          <div className="sticky top-16 z-50 flex min-h-11 items-center border-b border-slate-200/80 bg-[#F5F5F7]/95 py-2 backdrop-blur-md">
            <Button asChild className="min-h-11" variant="outline">
              <StudentPendingLink feedback="page" href={exitHref} pendingLabel="Leaving…">
                <ArrowLeft aria-hidden="true" className="size-4" />
                {exitLabel}
              </StudentPendingLink>
            </Button>
          </div>
          {error ? (
            <div className="flex items-start justify-between gap-3 rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive" role="alert">
              <span className="min-w-0 flex-1">{error}</span>
              <Button className="shrink-0" onClick={() => setError(null)} size="sm" type="button" variant="ghost">Dismiss</Button>
            </div>
          ) : null}
          {sessionAction ? (
            <PracticeSessionLoadingOverlay action={sessionAction} />
          ) : null}
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
                {!assignmentId ? (
                  <PracticeSourceSelector
                    includePublicCatalog={includePublicCatalog}
                    loading={practiceSourcesLoading}
                    locked={Boolean(activeSession?.sourceScopeLockedAt)}
                    onIncludePublicCatalogChange={setIncludePublicCatalog}
                    onSelectedBankIdsChange={setSelectedBankIds}
                    practiceSources={practiceSources}
                    selectedBankIds={selectedBankIds}
                  />
                ) : null}
                <div className="mx-auto max-w-5xl rounded-full border border-slate-200 bg-white p-2 shadow-[0_24px_70px_-42px_rgba(15,23,42,0.75)] ring-1 ring-slate-950/5">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <div className="flex min-w-0 flex-1 items-center px-3">
                      <Input
                        aria-label="Practice goal"
                        className="h-14 border-0 bg-transparent px-0 text-base shadow-none ring-offset-0 placeholder:text-slate-400 focus-visible:ring-0 focus-visible:ring-offset-0 sm:text-lg"
                        id="goal"
                        maxLength={PRACTICE_INPUT_LIMITS.GOAL_CHARS}
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
                      {!isAssignmentMode ? (
                        <>
                          <PracticeFrameworkSelector
                            frameworks={courseFrameworks}
                            loading={courseFrameworksLoading}
                            onChange={setSelectedCourseFrameworkId}
                            value={selectedCourseFrameworkId}
                          />
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
                        </>
                      ) : null}
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
                <PracticeStarterGoals disabled={isPending} onSelect={selectStarterGoal} />
              </div>
            </section>
          ) : (
            <section className="student-hero">
              <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <h1 className="truncate text-xl font-semibold tracking-tight text-slate-950">
                      {activeSession?.title || "Practice"}
                    </h1>
                    {phase === "feedback" && review?.nextRoundGoal ? (
                      <FeedbackText className="mt-1 truncate border-none bg-transparent p-0 text-sm text-slate-500" compact value={review.nextRoundGoal} />
                    ) : null}
                  </div>
                  <Button
                    aria-label="Show study details"
                    className="xl:hidden"
                    onClick={showStudyDetails}
                    size="icon"
                    type="button"
                    variant="ghost"
                  >
                    <SlidersHorizontal className="size-4" aria-hidden="true" />
                  </Button>
                </div>
              </div>
            </section>
          )}

          {activeSession?.rounds.length ? (
            <PracticeRoundNavigator
              completed={Boolean(activeSession.completion)}
              disabled={practiceNavigationLocked}
              onSelectCompletion={showCompletionSummary}
              onSelectRound={showHistoricalRound}
              rounds={activeSession.rounds}
              selectedRoundId={phase === "completed" ? null : recommendation?.roundId ?? null}
            />
          ) : null}

          {phase === "thinking" ? (
            <div className="min-h-24">
              <TracePanel
                active
                collapsed={isTraceCollapsed}
                elapsedMs={thinkingElapsedMs}
                onToggle={() => setIsTraceCollapsed((current) => !current)}
                trace={latestTrace}
              />
            </div>
          ) : null}

          {phase === "ending" || phase === "completed" ? (
            <PracticeCompletionPanel
              assignmentId={assignmentId}
              completion={completion}
              isCompleted={phase === "completed"}
              onNewSession={() => prepareScopedNewSession()}
              onRetryMistakes={() => prepareScopedNewSession({ retryMistakes: true })}
              report={streamedCompletionReport || completion?.report || ""}
              retryAvailable={wrongQuestions.some((question) => !question.masteredAt)}
            />
          ) : null}

          {recommendation && (phase === "recommended" || phase === "practicing" || phase === "feedback") ? (
            <div ref={resultTopRef} className="scroll-mt-4 space-y-4">
              {lastThinkingDurationMs !== null ? (
                <TracePanel
                  collapsed={isTraceCollapsed}
                  elapsedMs={lastThinkingDurationMs}
                  onToggle={() => setIsTraceCollapsed((current) => !current)}
                  trace={latestTrace}
                />
              ) : null}
              <Card
                aria-busy={isPending || isReviewStreaming}
                className="student-panel student-enter"
              >
                <CardHeader>
                  <div>
                    <div>
                      <CardTitle className="text-xl">Your round</CardTitle>
                      <FeedbackText className="mt-2 border-none bg-transparent p-0 text-sm text-slate-600" compact value={recommendation.roundGoal} />
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {answerErrorQuestionIndexes.length ? (
                    <div
                      aria-labelledby="practice-answer-error-heading"
                      className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive"
                      ref={answerErrorSummaryRef}
                      tabIndex={-1}
                    >
                      <p className="font-bold" id="practice-answer-error-heading">
                        Answer the highlighted question
                        {answerErrorQuestionIndexes.length === 1 ? "" : "s"} before submitting.
                      </p>
                      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
                        {answerErrorQuestionIndexes.map((questionIndex) => (
                          <li key={questionIndex}>
                            <a
                              className="font-semibold underline underline-offset-4"
                              href={`#practice-question-${questionIndex}`}
                            >
                              Question {questionIndex}
                            </a>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {recommendation.recommendations.map((question, index) => {
                    const questionId = practiceAnswerKey(question);
                    const answerCommitted =
                      hasSubmittedPracticeAnswer(answers[questionId]) &&
                      answerTransitionDiagnostics.answerStateRefConsistency === "MATCH";
                    return (
                      <PracticeQuestionCard
                        answerCommitted={answerCommitted}
                        clientReady={clientReady}
                        currentAnswer={answers[questionId]}
                        hasAnswerError={answerErrorQuestionIndexes.includes(index + 1)}
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
                      <Button
                        className="h-11 px-6"
                        disabled={isPending || !recommendation.roundId}
                        onClick={submitRound}
                        type="button"
                      >
                        {isPending ? "Submitting round..." : "Submit round"}
                      </Button>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            </div>
          ) : null}

          {!isAssignmentMode && phase === "feedback" && review ? (
            <PracticeRoundReviewPanel
              isPending={isPending}
              isStreaming={isReviewStreaming}
              nextRoundNote={nextRoundNote}
              onNextRoundNoteChange={setNextRoundNote}
              onQuestionCountChange={setQuestionCount}
              onStartNextRound={requestFeedbackNextRound}
              questionCount={questionCount}
              review={review}
            />
          ) : null}

          <PracticeAssignmentHandoff
            assignmentId={assignmentId}
            visible={isAssignmentMode && phase === "feedback"}
          />

        </main>

        <aside
          className="relative scroll-mt-4 transition-all duration-300 xl:sticky xl:top-20 xl:h-[calc(100vh-5rem)] xl:overflow-y-auto"
          ref={rightSidebarRef}
          tabIndex={-1}
        >
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
                onClick={showStudyDetails}
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
                  onClick={showStudyDetails}
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
              className="inline-flex size-9 shrink-0 rounded-xl bg-slate-100 text-slate-700 shadow-sm hover:bg-slate-200"
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
              <Card className="border-0 bg-white shadow-none ring-1 ring-slate-200/80">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Practice sources</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-2">
                  {activeSession.sourceScope.length ? activeSession.sourceScope.map((source) => (
                    <Badge key={`${source.sourceKind}-${source.bankId ?? source.assignmentId ?? "public"}`} variant="outline">
                      {source.name}
                    </Badge>
                  )) : (
                    <span className="text-xs text-slate-500">Choose sources before starting the first round.</span>
                  )}
                </CardContent>
              </Card>
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
                      maxLength={PRACTICE_INPUT_LIMITS.OUTLINE_NOTES_CHARS}
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
          </div>
          )}
        </aside>
    </div>
  );
}
