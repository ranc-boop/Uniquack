"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";

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
import { Textarea } from "@/components/ui/textarea";
import type {
  PracticeAttemptInput,
  PracticeGradeResult,
  PracticeHintResponse,
  PracticePreferenceResponse,
  PracticeRecommendRequest,
  PracticeRecommendResponse,
  PracticeRecommendation,
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
  const [preference, setPreference] = useState<PracticePreferenceResponse | null>(null);
  const [preferenceDraft, setPreferenceDraft] = useState("");
  const [mergeStatus, setMergeStatus] = useState<"idle" | "running" | "failed" | "succeeded">("idle");
  const [wrongQuestions, setWrongQuestions] = useState<PracticeWrongQuestionView[]>([]);
  const [selectedWrongQuestionIds, setSelectedWrongQuestionIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [thinkingElapsedMs, setThinkingElapsedMs] = useState(0);
  const [lastThinkingDurationMs, setLastThinkingDurationMs] = useState<number | null>(null);
  const [isPending, startTransition] = useTransition();
  const resultTopRef = useRef<HTMLDivElement | null>(null);
  const thinkingEndRef = useRef<HTMLDivElement | null>(null);
  const thinkingStartedAtRef = useRef<number | null>(null);

  async function refreshPracticeState(preferredSessionId?: string) {
    const [sessionPayload, preferencePayload, wrongPayload] = await Promise.all([
      jsonRequest<{
        activeSession: PracticeSessionDetail | null;
        sessions: PracticeSessionSummary[];
      }>("/api/practice/sessions"),
      jsonRequest<PracticePreferenceResponse>("/api/practice/preferences"),
      jsonRequest<{ wrongQuestions: PracticeWrongQuestionView[] }>("/api/practice/wrong-questions"),
    ]);

    let nextSession = sessionPayload.activeSession;
    if (preferredSessionId) {
      const detail = await jsonRequest<{ session: PracticeSessionDetail }>(
        `/api/practice/sessions/${preferredSessionId}`,
      );
      nextSession = detail.session;
    }

    setSessions(sessionPayload.sessions);
    setActiveSession(nextSession);
    setPreference(preferencePayload);
    setPreferenceDraft(preferencePayload.longTermPreference);
    setWrongQuestions(wrongPayload.wrongQuestions);
  }

  useEffect(() => {
    startTransition(async () => {
      try {
        await refreshPracticeState();
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : String(caught));
      }
    });
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
    setMergeStatus("running");
    try {
      const merged = await jsonRequest<PracticePreferenceResponse & { status: string }>(
        "/api/practice/preferences/merge/run",
        { method: "POST", body: "{}" },
      );
      setPreference(merged);
      setPreferenceDraft(merged.longTermPreference);
      setMergeStatus(merged.status === "idle" ? "idle" : "succeeded");
    } catch {
      setMergeStatus("failed");
    }
  }

  async function ensureSession(trimmedGoal: string) {
    if (activeSession) return activeSession;
    const payload = await jsonRequest<{ session: PracticeSessionDetail }>("/api/practice/sessions", {
      body: JSON.stringify({ goal: trimmedGoal, title: trimmedGoal || "New practice session" }),
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
        const response = await postRecommendationStream({
          body: {
            goal: trimmedGoal,
            questionCount,
            sessionId: currentSession.id,
            wrongQuestionIds: wrongIds,
          },
          onTrace: (event) => setLiveTrace((current) => [...current, event]),
        });
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

  function switchSession(sessionId: string) {
    startTransition(async () => {
      try {
        const payload = await jsonRequest<{ session: PracticeSessionDetail }>(
          `/api/practice/sessions/${sessionId}`,
        );
        setActiveSession(payload.session);
        resetRoundState();
        setGoal("");
        setPhase("start");
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : String(caught));
      }
    });
  }

  function createNewSession() {
    startTransition(async () => {
      try {
        const payload = await jsonRequest<{ session: PracticeSessionDetail }>("/api/practice/sessions", {
          body: JSON.stringify({ goal: goal.trim(), title: goal.trim() || "New practice session" }),
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

  function savePreference() {
    startTransition(async () => {
      try {
        const payload = await jsonRequest<PracticePreferenceResponse>("/api/practice/preferences", {
          body: JSON.stringify({ longTermPreference: preferenceDraft }),
          method: "PATCH",
        });
        setPreference(payload);
        setPreferenceDraft(payload.longTermPreference);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : String(caught));
      }
    });
  }

  function clearPreference() {
    startTransition(async () => {
      try {
        const payload = await jsonRequest<PracticePreferenceResponse>("/api/practice/preferences", {
          method: "DELETE",
        });
        setPreference(payload);
        setPreferenceDraft("");
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

  return (
    <div className="space-y-6">
      <div className="rounded-md border bg-muted/20 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <Badge variant="secondary">Practice Agent</Badge>
            <h1 className="text-3xl font-semibold tracking-tight">O2I Practice Agent</h1>
            <p className="max-w-3xl text-sm text-muted-foreground">
              Sessions, round history, long-term preference, and active missed questions are saved to your account.
            </p>
          </div>
          <Button disabled={isPending} onClick={createNewSession} type="button" variant="outline">
            New session
          </Button>
        </div>
      </div>

      {error ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[280px_1fr_340px]">
        <aside className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Sessions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {sessions.length ? sessions.map((item) => (
                <div key={item.id} className="rounded-md border p-2">
                  <button
                    className="block w-full text-left text-sm font-medium"
                    onClick={() => switchSession(item.id)}
                    type="button"
                  >
                    {item.title}
                  </button>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {item.roundCount} rounds · {new Date(item.lastActivityAt).toLocaleString()}
                  </p>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    {activeSession?.id === item.id ? <Badge variant="secondary">active</Badge> : <span />}
                    <Button
                      disabled={isPending}
                      onClick={() => deleteSession(item.id)}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              )) : (
                <p className="text-sm text-muted-foreground">No saved sessions yet.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Long-term preference</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Textarea
                maxLength={1000}
                onChange={(event) => setPreferenceDraft(event.target.value.slice(0, 1000))}
                placeholder="Preferred pacing, recurring weak spots, style notes..."
                value={preferenceDraft}
              />
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{preferenceDraft.length}/1000</span>
                <span>
                  {mergeStatus === "running"
                    ? "Merging..."
                    : mergeStatus === "failed"
                      ? "Merge failed"
                      : preference?.pendingMergeCount
                        ? `${preference.pendingMergeCount} pending`
                        : "Up to date"}
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button disabled={isPending || preferenceDraft.length > 1000} onClick={savePreference} size="sm" type="button">
                  Save
                </Button>
                <Button disabled={isPending} onClick={clearPreference} size="sm" type="button" variant="outline">
                  Clear
                </Button>
                {preference?.pendingMergeCount || mergeStatus === "failed" ? (
                  <Button disabled={mergeStatus === "running"} onClick={runPreferenceMerge} size="sm" type="button" variant="outline">
                    Run merge
                  </Button>
                ) : null}
              </div>
            </CardContent>
          </Card>
        </aside>

        <main className="space-y-4">
          {phase === "thinking" ? (
            <div className="sticky top-3 z-20 flex items-center justify-between gap-3 rounded-md border bg-background/95 px-4 py-3 text-sm shadow-sm backdrop-blur">
              <div className="flex min-w-0 items-center gap-3">
                <span className="relative flex h-3 w-3 shrink-0">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
                  <span className="relative inline-flex h-3 w-3 rounded-full bg-primary" />
                </span>
                <span className="truncate font-medium">{recommendation ? "Reviewing your round" : "Thinking"}</span>
              </div>
              <span className="font-mono text-xs text-muted-foreground">{formatDuration(thinkingElapsedMs)}</span>
            </div>
          ) : lastThinkingDurationMs !== null && (phase === "recommended" || phase === "feedback") ? (
            <div className="rounded-md border bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
              Thought for <span className="font-mono text-foreground">{formatDuration(lastThinkingDurationMs)}</span>
            </div>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Goal</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-[1fr_9rem_auto]">
              <div className="space-y-2">
                <Label htmlFor="goal">
                  {phase === "feedback" ? "Add your thoughts for the next round" : "What do you want to practice?"}
                </Label>
                <Input
                  id="goal"
                  onChange={(event) => setGoal(event.target.value)}
                  placeholder={
                    phase === "feedback"
                      ? "Optional: ask for a focus, pace, or difficulty change"
                      : "e.g. AP Calculus implicit differentiation, harder MCQ first"
                  }
                  value={goal}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="count">Questions</Label>
                <Input
                  id="count"
                  max={8}
                  min={1}
                  onChange={(event) => setQuestionCount(Number(event.target.value))}
                  type="number"
                  value={questionCount}
                />
              </div>
              <div className="flex items-end">
                <Button
                  disabled={isPending}
                  onClick={() => (phase === "feedback" ? requestFeedbackNextRound() : requestRecommendation())}
                  type="button"
                >
                  {activeSession?.rounds.length ? "Start next round" : "Generate round"}
                </Button>
              </div>
            </CardContent>
          </Card>

          {phase === "thinking" ? (
            <div className="space-y-4">
              <Card>
                <CardContent className="space-y-3 p-6">
                  <div className="flex items-center gap-3 text-sm">
                    <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-primary" />
                    <span className="font-medium">
                      {recommendation ? "Reviewing your round" : "Generating your question set"}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground">
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
              <Card>
                <CardHeader>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <CardTitle className="text-base">Recommended round</CardTitle>
                      <FeedbackText className="mt-1 border-none bg-transparent p-0 text-muted-foreground" compact value={recommendation.roundGoal} />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="outline">{recommendation.mode}</Badge>
                      {recommendation.providerLabel ? <Badge variant="secondary">{recommendation.providerLabel}</Badge> : null}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {recommendation.recommendations.map((question, index) => (
                    <Card key={question.id} className="shadow-none">
                      <CardHeader>
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <CardTitle className="text-base">{index + 1}. {question.title}</CardTitle>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {question.questionCode} / {question.questionType} / difficulty {question.difficulty}
                            </p>
                          </div>
                          {resultBadge(resultsById.get(question.id))}
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <QuestionText value={question.contentHtml} />
                        <div className="rounded-md border bg-muted/20 p-3 text-sm">
                          <p className="font-medium">Why this question</p>
                          <FeedbackText className="mt-1 border-none bg-transparent p-0 text-muted-foreground" compact value={question.reason} />
                          <p className="mt-1 text-xs text-muted-foreground">
                            Expected skill:{" "}
                            <FeedbackText className="inline border-none bg-transparent p-0 text-xs text-muted-foreground" compact inline value={question.expectedSkill} />
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
                          <span className="text-xs text-muted-foreground">Hints are saved with the submitted round.</span>
                        </div>
                        {hints[question.id]?.length ? (
                          <div className="space-y-2">
                            {hints[question.id].map((hint, hintIndex) => (
                              <div key={`${question.id}-hint-${hintIndex}`} className="rounded-md border bg-muted/30 p-3 text-sm">
                                <span className="font-medium">Hint {hintIndex + 1}: </span>
                                <FeedbackText className="inline border-none bg-transparent p-0 text-muted-foreground" compact inline value={hint} />
                              </div>
                            ))}
                          </div>
                        ) : null}
                        {phase === "feedback" && resultsById.get(question.id) ? (
                          <div className="space-y-3 rounded-md border p-3">
                            <FeedbackText className="border-none bg-transparent p-0 text-muted-foreground" compact value={resultsById.get(question.id)?.explanation} />
                            {resultsById.get(question.id)?.solutionHtml ? (
                              <div className="space-y-2">
                                <p className="text-sm font-medium">Solution</p>
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
                      <Button disabled={isPending || !recommendation.roundId} onClick={submitRound} type="button">
                        Submit round
                      </Button>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            </div>
          ) : null}

          {phase === "feedback" && review ? (
            <Card>
              <CardHeader>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-base">Round review</CardTitle>
                    <FeedbackText className="mt-1 border-none bg-transparent p-0 text-muted-foreground" compact value={review.summary} />
                  </div>
                  <Badge variant="outline">{review.mode}</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="next-round-goal">Add your thoughts for the next round</Label>
                  <Input
                    id="next-round-goal"
                    onChange={(event) => setGoal(event.target.value)}
                    placeholder="Optional: ask for a focus, pace, or difficulty change"
                    value={goal}
                  />
                </div>
                <Button onClick={requestFeedbackNextRound} type="button">Generate next round</Button>
              </CardContent>
            </Card>
          ) : null}

          {activeSession?.rounds.length ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Saved history</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {activeSession.rounds.slice(-5).reverse().map((round) => (
                  <details key={round.id} className="rounded-md border p-3">
                    <summary className="cursor-pointer text-sm font-medium">
                      {round.roundGoal || "Practice round"} · {round.score.correct}/{round.score.total}
                    </summary>
                    {round.reviewSummary ? (
                      <FeedbackText className="mt-2 border-none bg-transparent p-0 text-sm text-muted-foreground" compact value={round.reviewSummary} />
                    ) : null}
                    <div className="mt-3 space-y-2">
                      {round.questions.map((question) => (
                        <div key={`${round.id}-${question.position}`} className="rounded-md border bg-muted/20 p-2 text-sm">
                          <p className="font-medium">{question.position}. {question.title}</p>
                          <p className="text-xs text-muted-foreground">{question.questionCode}</p>
                        </div>
                      ))}
                    </div>
                  </details>
                ))}
              </CardContent>
            </Card>
          ) : null}
        </main>

        <aside className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Active missed questions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {wrongQuestions.length ? wrongQuestions.map((question) => (
                <div key={question.id} className="rounded-md border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium">{question.title}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {question.questionCode} · missed {question.missCount} time{question.missCount === 1 ? "" : "s"}
                      </p>
                    </div>
                    <Button disabled={isPending} onClick={() => practiceWrongQuestion(question)} size="sm" type="button" variant="outline">
                      Practice
                    </Button>
                  </div>
                  {question.lastExplanation ? (
                    <FeedbackText className="mt-2 border-none bg-transparent p-0 text-xs text-muted-foreground" compact value={question.lastExplanation} />
                  ) : null}
                  {question.contentHtml ? (
                    <details className="mt-2 rounded-md border bg-muted/20 p-2 text-xs">
                      <summary className="cursor-pointer font-medium">Saved question snapshot</summary>
                      <QuestionText className="mt-2 border-none bg-transparent p-0" compact value={question.contentHtml} />
                    </details>
                  ) : null}
                </div>
              )) : (
                <p className="text-sm text-muted-foreground">No active missed questions.</p>
              )}
            </CardContent>
          </Card>

          {activeSession ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Session memory</CardTitle>
              </CardHeader>
              <CardContent>
                <FeedbackText className="border-none bg-transparent p-0 text-sm text-muted-foreground" compact value={activeSession.sessionMemory} />
              </CardContent>
            </Card>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
