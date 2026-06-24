"use client";

import { useEffect, useMemo, useRef, useState, useTransition, type CSSProperties } from "react";
import { ArrowUp, ChevronsLeft, ChevronsRight, MoreHorizontal, Pencil, Plus, SlidersHorizontal, Trash2 } from "lucide-react";

import {
  FeedbackText,
  OptionText,
  QuestionText,
  SolutionText,
} from "@/components/math-content";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import type {
  PracticeAttemptInput,
  PracticeGradeResult,
  PracticeHintResponse,
  PracticeRecommendRequest,
  PracticeRecommendResponse,
  PracticeRecommendation,
  PracticeRoundHistory,
  PracticeReviewResponse,
  PracticeSessionDetail,
  PracticeSessionSummary,
  PracticeTraceEvent,
  PracticeWrongQuestionView,
} from "@/lib/practice/types";

type Phase = "start" | "thinking" | "recommended" | "practicing" | "feedback";
type AnswersState = Record<string, string | string[]>;
type HintsState = Record<string, string[]>;
type ApiError = { error?: string };

const starterGoals = [
  "AP Calculus: implicit differentiation with harder MCQs",
  "Review missed integration questions and explain traps",
  "Build a short mixed round on limits and continuity",
  "Practice FRQ-style derivative applications",
];

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
      const payload = JSON.parse(item.data);
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

function answerValue(answer: string | string[] | undefined) {
  return Array.isArray(answer) ? answer.join(", ") : answer ?? "";
}

function resultBadge(result: PracticeGradeResult | undefined) {
  if (!result) return null;
  if (result.isCorrect === true) {
    return <Badge className="border-transparent bg-emerald-600 text-white hover:bg-emerald-600">correct</Badge>;
  }
  if (result.isCorrect === false) {
    return <Badge variant="destructive">incorrect</Badge>;
  }
  return <Badge variant="outline">manual review</Badge>;
}

function formatDuration(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes ? `${minutes}m ${seconds.toString().padStart(2, "0")}s` : `${seconds}s`;
}

function latestProcessSummary(trace: PracticeTraceEvent[]) {
  const latest = [...trace]
    .reverse()
    .find((event) => event.thoughtSummary || event.outputSummary || event.inputSummary || event.error);
  return latest?.thoughtSummary || latest?.outputSummary || latest?.inputSummary || latest?.error ||
    "Waiting for the agent to choose its first step.";
}

function formatTrace(event: PracticeTraceEvent) {
  return [
    event.toolName,
    event.outputSummary ? `-> ${event.outputSummary}` : "",
    event.error ? `Error: ${event.error}` : "",
  ].filter(Boolean).join(" ");
}

function recommendationFromHistoryQuestion(
  question: PracticeRoundHistory["questions"][number],
): PracticeRecommendation {
  return {
    contentExcerpt: question.contentExcerpt,
    contentHtml: question.contentHtml,
    difficulty: question.difficulty,
    expectedSkill: question.expectedSkill,
    id: question.sourceQuestionId ?? question.id,
    options: question.options,
    questionCode: question.questionCode,
    questionType: question.questionType as PracticeRecommendation["questionType"],
    reason: question.reason || "Saved from this practice session.",
    source: question.source,
    tagIds: question.tagIds,
    title: question.title,
  };
}

function resultsFromHistoryRound(round: PracticeRoundHistory): PracticeGradeResult[] {
  return round.attempts.map((attempt) => ({
    explanation: attempt.explanation ?? "No saved explanation.",
    gradingMode: "manual" as const,
    isCorrect: attempt.isCorrect,
    questionId: attempt.sourceQuestionId ?? attempt.questionId ?? "",
    score: attempt.score,
    solutionHtml: attempt.solutionHtml,
  })).filter((result) => result.questionId);
}

function TracePanel({
  active = false,
  collapsed = false,
  onToggle,
  trace,
}: {
  active?: boolean;
  collapsed?: boolean;
  onToggle?: () => void;
  trace: PracticeTraceEvent[];
}) {
  if (!trace.length && !active) return null;

  return (
    <Card className={active ? "animate-in fade-in slide-in-from-bottom-2 duration-300" : undefined}>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">Generation process</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              UI-safe process notes plus compact backend summaries.
            </p>
          </div>
          {trace.length ? (
            <Button onClick={onToggle} size="sm" type="button" variant="outline">
              {collapsed ? "Expand" : "Collapse"}
            </Button>
          ) : null}
        </div>
      </CardHeader>
      <CardContent>
        {active ? (
          <div className="mb-4 flex items-center gap-3 rounded-md border bg-muted/20 p-3 text-sm">
            <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
            <span className="text-muted-foreground">{latestProcessSummary(trace)}</span>
          </div>
        ) : null}
        {collapsed ? (
          <div className="rounded-md border bg-muted/20 p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">{trace.length} events</Badge>
              <span className="text-muted-foreground">{latestProcessSummary(trace)}</span>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {trace.map((event, index) => (
              <details
                key={`${event.toolName}-${index}`}
                className="rounded-md border bg-muted/20 p-3 text-xs"
                open={active ? index >= trace.length - 3 : index >= trace.length - 2}
              >
                <summary className="cursor-pointer list-none">
                  <div className="inline-flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{event.phase}</Badge>
                    {event.iteration ? <Badge variant="secondary">step {event.iteration}</Badge> : null}
                    <span className="font-mono">{event.toolName}</span>
                    {event.elapsedMs !== undefined ? (
                      <span className="text-muted-foreground">{event.elapsedMs}ms</span>
                    ) : null}
                  </div>
                </summary>
                {event.thoughtSummary ? (
                  <div className="mt-3 rounded-md border bg-background p-2">
                    <p className="font-medium">Process note</p>
                    <p className="mt-1 text-muted-foreground">{event.thoughtSummary}</p>
                  </div>
                ) : null}
                {event.inputSummary ? (
                  <div className="mt-2 rounded-md border bg-background p-2">
                    <p className="font-medium">Tool input summary</p>
                    <p className="mt-1 break-words text-muted-foreground">{event.inputSummary}</p>
                  </div>
                ) : null}
                <div className="mt-2 rounded-md border bg-background p-2">
                  <p className="font-medium">Tool output summary</p>
                  <p className={event.error ? "mt-1 text-destructive" : "mt-1 break-words text-muted-foreground"}>
                    {formatTrace(event)}
                  </p>
                </div>
              </details>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function QuestionAnswerInput({
  answer,
  disabled,
  onChange,
  question,
}: {
  answer: string | string[] | undefined;
  disabled?: boolean;
  onChange: (value: string | string[]) => void;
  question: PracticeRecommendation;
}) {
  if (question.questionType === "mcq" && question.options.length) {
    return (
      <div className="space-y-2">
        {question.options.map((option) => {
          const selected = Array.isArray(answer) ? answer.includes(option.id) : answer === option.id;
          return (
            <label key={option.id} className="grid cursor-pointer gap-3 rounded-md border bg-background p-3 sm:grid-cols-[1.5rem_1fr]">
              <input
                checked={selected}
                disabled={disabled}
                name={`answer-${question.id}`}
                onChange={() => onChange(option.id)}
                type="radio"
              />
              <div className="space-y-1">
                <span className="font-mono text-xs text-muted-foreground">{option.label}</span>
                <OptionText className="border-none bg-transparent p-0" value={option.content_html} />
              </div>
            </label>
          );
        })}
      </div>
    );
  }

  return (
    <Textarea
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
      placeholder={question.questionType === "fill_blank" ? "Enter your final answer" : "Write your response"}
      value={answerValue(answer)}
    />
  );
}

export function PracticeAgentClient() {
  const [phase, setPhase] = useState<Phase>("start");
  const [sessions, setSessions] = useState<PracticeSessionSummary[]>([]);
  const [activeSession, setActiveSession] = useState<PracticeSessionDetail | null>(null);
  const [goal, setGoal] = useState("");
  const [questionCount, setQuestionCount] = useState(4);
  const [recommendation, setRecommendation] = useState<PracticeRecommendResponse | null>(null);
  const [answers, setAnswers] = useState<AnswersState>({});
  const [hints, setHints] = useState<HintsState>({});
  const [results, setResults] = useState<PracticeGradeResult[]>([]);
  const [review, setReview] = useState<PracticeReviewResponse | null>(null);
  const [liveTrace, setLiveTrace] = useState<PracticeTraceEvent[]>([]);
  const [reviewTrace, setReviewTrace] = useState<PracticeTraceEvent[]>([]);
  const [isTraceCollapsed, setIsTraceCollapsed] = useState(false);
  const [isLeftSidebarCollapsed, setIsLeftSidebarCollapsed] = useState(false);
  const [isRightSidebarCollapsed, setIsRightSidebarCollapsed] = useState(false);
  const [wrongQuestions, setWrongQuestions] = useState<PracticeWrongQuestionView[]>([]);
  const [selectedWrongQuestionIds, setSelectedWrongQuestionIds] = useState<string[]>([]);
  const [renamingSessionId, setRenamingSessionId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [thinkingElapsedMs, setThinkingElapsedMs] = useState(0);
  const [lastThinkingDurationMs, setLastThinkingDurationMs] = useState<number | null>(null);
  const [isPending, startTransition] = useTransition();
  const resultTopRef = useRef<HTMLDivElement | null>(null);
  const thinkingEndRef = useRef<HTMLDivElement | null>(null);
  const thinkingStartedAtRef = useRef<number | null>(null);

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
    const wrongPayload = nextSession
      ? await jsonRequest<{ wrongQuestions: PracticeWrongQuestionView[] }>(
          `/api/practice/wrong-questions?sessionId=${encodeURIComponent(nextSession.id)}`,
        )
      : { wrongQuestions: [] };
    setWrongQuestions(wrongPayload.wrongQuestions);

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
      trace: [],
    };
    const restoredResults = resultsFromHistoryRound(round);
    const restoredAnswers: AnswersState = {};
    const restoredHints: HintsState = {};

    for (const attempt of round.attempts) {
      const questionId = attempt.sourceQuestionId ?? attempt.questionId;
      if (!questionId) continue;
      restoredAnswers[questionId] = attempt.answer;
      restoredHints[questionId] = attempt.hints;
    }

    setRecommendation(restoredRecommendation);
    setAnswers(restoredAnswers);
    setHints(restoredHints);
    setResults(restoredResults);
    setLiveTrace([]);
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
        trace: [],
        updatedSessionMemory: session.sessionMemory,
      });
      setPhase("feedback");
    } else {
      setReview(null);
      setPhase("recommended");
    }
  }

  useEffect(() => {
    startTransition(async () => {
      try {
        const restoredSession = await refreshPracticeState();
        const pendingRoundRaw = window.sessionStorage.getItem("o2i:pendingPracticeRound");
        if (pendingRoundRaw) {
          const pendingRound = JSON.parse(pendingRoundRaw) as PracticeRecommendResponse;
          window.sessionStorage.removeItem("o2i:pendingPracticeRound");
          if (pendingRound.roundId && pendingRound.recommendations?.length) {
            setRecommendation(pendingRound);
            setGoal(pendingRound.roundGoal);
            setLiveTrace(pendingRound.trace ?? []);
            setIsTraceCollapsed(true);
            setPhase("recommended");
            if (pendingRound.sessionId) {
              await refreshPracticeState(pendingRound.sessionId);
            }
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
    "--practice-left": isLeftSidebarCollapsed ? "3.75rem" : "18rem",
    "--practice-right": isRightSidebarCollapsed ? "3.75rem" : "18rem",
  } as CSSProperties;

  const resultsById = new Map<string, PracticeGradeResult>(
    results.map((result) => [result.questionId, result]),
  );

  function resetRoundState() {
    setAnswers({});
    setHints({});
    setResults([]);
    setReview(null);
    setReviewTrace([]);
    setRecommendation(null);
  }

  function beginThinking() {
    // eslint-disable-next-line react-hooks/purity
    thinkingStartedAtRef.current = Date.now();
    setThinkingElapsedMs(0);
    setLastThinkingDurationMs(null);
    setPhase("thinking");
  }

  function finishThinking(nextPhase: Phase) {
    const startedAt = thinkingStartedAtRef.current;
    // eslint-disable-next-line react-hooks/purity
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
      body: JSON.stringify({ goal: trimmedGoal, title: "New practice session" }),
      method: "POST",
    });
    setActiveSession(payload.session);
    await refreshPracticeState(payload.session.id);
    void runPreferenceMerge();
    return payload.session;
  }

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
    setIsTraceCollapsed(false);
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
        setActiveSession({
          ...currentSession,
          goal: response.roundGoal,
          sessionMemory: response.sessionMemory,
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
    setAnswers((current) => ({ ...current, [questionId]: value }));
  }

  function requestHint(question: PracticeRecommendation) {
    setError(null);
    startTransition(async () => {
      try {
        const previousHints = hints[question.id] ?? [];
        const response = await jsonRequest<PracticeHintResponse>("/api/practice/hint", {
          body: JSON.stringify({
            currentAnswer: answers[question.id] ?? "",
            hintLevel: previousHints.length + 1,
            previousHints,
            questionId: question.id,
            sessionId: activeSession?.id,
          }),
          method: "POST",
        });
        setHints((current) => ({ ...current, [question.id]: [...previousHints, response.hint] }));
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : String(caught));
      }
    });
  }

  function submitRound() {
    if (!recommendation || !activeSession || !recommendation.roundId) return;

    const attempts: PracticeAttemptInput[] = recommendation.recommendations.map((question) => ({
      answer: answers[question.id] ?? "",
      hintCount: hints[question.id]?.length ?? 0,
      questionId: question.id,
    }));

    setError(null);
    beginThinking();
    setLiveTrace([]);
    setIsTraceCollapsed(false);

    startTransition(async () => {
      try {
        const reviewPayloadAttempts = attempts.map((attempt) => {
          const recommended = recommendation.recommendations.find((item) => item.id === attempt.questionId);
          return {
            ...attempt,
            questionCode: recommended?.questionCode,
            result: {
              explanation: "Pending AI review.",
              gradingMode: "manual" as const,
              isCorrect: null,
              questionId: attempt.questionId,
              score: null,
              solutionHtml: null,
            },
            title: recommended?.title,
          };
        });
        const reviewResponse = await jsonRequest<PracticeReviewResponse>("/api/practice/review", {
          body: JSON.stringify({
            attempts: reviewPayloadAttempts,
            goal: activeSession.goal || recommendation.roundGoal,
            hintsByQuestionId: hints,
            recommendations: recommendation.recommendations.map((question) => ({
              contentHtml: question.contentHtml,
              id: question.id,
              options: question.options,
              questionCode: question.questionCode,
              questionType: question.questionType,
              title: question.title,
            })),
            roundId: recommendation.roundId,
            sessionId: activeSession.id,
            sessionMemory: activeSession.sessionMemory,
          }),
          method: "POST",
        });

        setResults(reviewResponse.results ?? []);
        setReview(reviewResponse);
        setReviewTrace(reviewResponse.trace);
        setLiveTrace(reviewResponse.trace);
        setIsTraceCollapsed(true);
        setGoal("");
        await refreshPracticeState(activeSession.id);
        finishThinking("feedback");
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : String(caught));
        finishThinking("practicing");
      }
    });
  }

  function requestFeedbackNextRound() {
    if (!review) {
      requestRecommendation();
      return;
    }
    const studentThought = goal.trim();
    const nextGoal = studentThought
      ? `${review.nextRoundGoal} Student added: ${studentThought}`
      : review.nextRoundGoal;
    requestRecommendation(nextGoal);
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
        resetRoundState();
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
          body: JSON.stringify({ goal: "", title: "New practice session" }),
          method: "POST",
        });
        setActiveSession(payload.session);
        resetRoundState();
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
        setPhase("start");
        await refreshPracticeState();
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

  return (
    <div
      className="mx-[calc(50%-50vw)] grid min-h-[calc(100vh-7rem)] w-screen gap-4 px-3 transition-[grid-template-columns] duration-300 ease-out sm:px-4 xl:grid-cols-[var(--practice-left)_minmax(0,1fr)_var(--practice-right)]"
      style={practiceGridStyle}
    >
      <aside className="transition-all duration-300 xl:sticky xl:top-20 xl:h-[calc(100vh-5rem)] xl:overflow-y-auto">
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
        <div className="mt-auto rounded-lg bg-white/70 p-3 text-xs leading-5 text-slate-500 ring-1 ring-slate-200/70">
          Session history stays here while the center stays focused on the current round.
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
                    The agent is using your saved session memory, long-term preference, and question history.
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
                  {recommendation.recommendations.map((question, index) => (
                    <Card key={question.id} className="student-card-hover border-slate-200 shadow-sm">
                      <CardHeader>
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="flex min-w-0 gap-3">
                            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-sky-600 text-sm font-bold text-white">
                              {index + 1}
                            </span>
                            <div className="min-w-0">
                              <CardTitle className="text-xl leading-snug">{question.title}</CardTitle>
                              <p className="mt-2 text-sm font-medium text-slate-500">
                                {question.questionCode} / {question.questionType} / difficulty {question.difficulty}
                              </p>
                            </div>
                          </div>
                          {resultBadge(resultsById.get(question.id))}
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <QuestionText value={question.contentHtml} />
                        <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-4 text-sm">
                          <p className="font-bold text-amber-950">Why this question</p>
                          <FeedbackText className="mt-2 border-none bg-transparent p-0 text-amber-900" compact value={question.reason} />
                          <p className="mt-2 text-sm text-amber-900/80">
                            Expected skill:{" "}
                            <FeedbackText className="inline border-none bg-transparent p-0 text-sm text-amber-900/80" compact inline value={question.expectedSkill} />
                          </p>
                        </div>
                        <QuestionAnswerInput
                          answer={answers[question.id]}
                          disabled={phase === "feedback"}
                          onChange={(value) => updateAnswer(question.id, value)}
                          question={question}
                        />
                        <div className="flex flex-wrap items-center gap-2">
                          <Button disabled={isPending || phase === "feedback"} onClick={() => requestHint(question)} size="sm" type="button" variant="outline">
                            Hint
                          </Button>
                          <span className="text-sm text-slate-500">Hints are saved with the submitted round.</span>
                        </div>
                        {hints[question.id]?.length ? (
                          <div className="space-y-2">
                            {hints[question.id].map((hint, hintIndex) => (
                              <div key={`${question.id}-hint-${hintIndex}`} className="rounded-lg border border-sky-100 bg-sky-50/70 p-3 text-sm">
                                <span className="font-bold text-sky-900">Hint {hintIndex + 1}: </span>
                                <FeedbackText className="inline border-none bg-transparent p-0 text-sky-900/80" compact inline value={hint} />
                              </div>
                            ))}
                          </div>
                        ) : null}
                        {phase === "feedback" && resultsById.get(question.id) ? (
                          <div className="space-y-3 rounded-lg border border-emerald-200 bg-emerald-50/60 p-4">
                            <FeedbackText className="border-none bg-transparent p-0 text-emerald-950" compact value={resultsById.get(question.id)?.explanation} />
                            {resultsById.get(question.id)?.solutionHtml ? (
                              <div className="space-y-2">
                                <p className="text-sm font-bold text-emerald-950">Solution</p>
                                <SolutionText value={resultsById.get(question.id)?.solutionHtml ?? ""} />
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                      </CardContent>
                    </Card>
                  ))}
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
            <Card className="student-panel">
              <CardHeader>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-xl">Round review</CardTitle>
                    <FeedbackText className="mt-2 border-none bg-transparent p-0 text-slate-600" compact value={review.summary} />
                  </div>
                  <Badge variant="outline">{review.mode}</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-lg border border-slate-100 bg-slate-50/70 p-4">
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">Next round focus</p>
                  <FeedbackText className="mt-2 border-none bg-transparent p-0 text-sm leading-6 text-slate-700" compact value={review.nextRoundGoal} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="next-round-goal">Add your thoughts for the next round</Label>
                  <Input
                    id="next-round-goal"
                    onChange={(event) => setGoal(event.target.value)}
                    placeholder="Optional: ask for a focus, pace, or difficulty change"
                    value={goal}
                  />
                </div>
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div className="space-y-2">
                    <Label className="text-sm font-bold text-slate-800" htmlFor="review-next-count">
                      Questions
                    </Label>
                    <Input
                      className="h-11 w-28 border-slate-200 bg-white text-base shadow-sm"
                      id="review-next-count"
                      max={8}
                      min={1}
                      onChange={(event) => setQuestionCount(Number(event.target.value))}
                      type="number"
                      value={questionCount}
                    />
                  </div>
                  <Button className="h-11 px-6" disabled={isPending} onClick={requestFeedbackNextRound} type="button">
                    Start next round
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : null}

        </main>

        <aside className="transition-all duration-300 xl:sticky xl:top-20 xl:h-[calc(100vh-5rem)] xl:overflow-y-auto">
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
            <Card className="border-0 bg-white shadow-none ring-1 ring-slate-200/80">
              <CardHeader>
                <CardTitle className="text-lg">Session memory</CardTitle>
              </CardHeader>
              <CardContent>
                {activeSession.sessionMemory ? (
                  <FeedbackText className="border-none bg-transparent p-0 text-sm leading-6 text-slate-600" compact value={activeSession.sessionMemory} />
                ) : (
                  <p className="text-sm leading-6 text-slate-600">
                    Submit a round and the agent will summarize useful context for this session here.
                  </p>
                )}
              </CardContent>
            </Card>
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
