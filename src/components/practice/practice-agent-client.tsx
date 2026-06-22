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
  PracticeRecommendRequest,
  PracticeRecommendResponse,
  PracticeRecommendation,
  PracticeReviewResponse,
  PracticeTagContext,
  PracticeTraceEvent,
} from "@/lib/practice/types";

const STORAGE_KEY = "o2i.practice-agent.mvp";

type Phase = "start" | "thinking" | "recommended" | "practicing" | "feedback";

type SavedRoundSummary = {
  hintCounts: Record<string, number>;
  missedQuestionIds: string[];
  nextRoundGoal: string;
  recommendedQuestionIds: string[];
  reviewSummary: string;
  roundGoal: string;
  score: {
    correct: number;
    total: number;
  };
};

type SavedSession = {
  completedQuestionIds: string[];
  goal: string;
  memory: string;
  rounds: SavedRoundSummary[];
  sessionId: string;
  tagContext: PracticeTagContext;
};

type AnswersState = Record<string, string | string[]>;
type HintsState = Record<string, string[]>;

type ApiError = {
  error?: string;
};

function newSession(goal: string): SavedSession {
  return {
    completedQuestionIds: [],
    goal,
    memory: `Goal: ${goal}. No completed rounds yet.`,
    rounds: [],
    sessionId: crypto.randomUUID(),
    tagContext: { confirmedTagIds: [], lastGoal: goal, usefulTags: [], version: 1 },
  };
}

function normalizeTagContext(value: unknown, goal: string): PracticeTagContext {
  if (!value || typeof value !== "object") {
    return { confirmedTagIds: [], lastGoal: goal, usefulTags: [], version: 1 };
  }

  const record = value as Partial<PracticeTagContext>;
  return {
    confirmedTagIds: Array.isArray(record.confirmedTagIds)
      ? Array.from(new Set(record.confirmedTagIds.map(String).filter(Boolean))).slice(0, 24)
      : [],
    lastGoal: typeof record.lastGoal === "string" ? record.lastGoal.slice(0, 240) : goal,
    usefulTags: Array.isArray(record.usefulTags)
      ? record.usefulTags.map((tag) => {
          const item = tag && typeof tag === "object" ? tag as Record<string, unknown> : {};
          const searchableQuestionCount = Number(item.searchableQuestionCount);
          const source: PracticeTagContext["usefulTags"][number]["source"] =
            item.source === "browse" || item.source === "search" || item.source === "memory"
            ? item.source
            : "memory";

          return {
            searchableQuestionCount: Number.isFinite(searchableQuestionCount)
              ? Math.max(0, Math.trunc(searchableQuestionCount))
              : undefined,
            source,
            tagId: String(item.tagId ?? "").trim(),
          };
        }).filter((tag) => tag.tagId).slice(0, 24)
      : [],
    version: 1,
  };
}

function normalizeSavedSession(value: unknown): SavedSession | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Partial<SavedSession> & { rounds?: unknown[] };
  const goal = typeof record.goal === "string" ? record.goal : "";

  if (!goal) {
    return null;
  }

  return compactPersistedSession({
    completedQuestionIds: Array.isArray(record.completedQuestionIds)
      ? record.completedQuestionIds.map(String).filter(Boolean)
      : [],
    goal,
    memory: typeof record.memory === "string" ? record.memory : `Goal: ${goal}.`,
    rounds: Array.isArray(record.rounds)
      ? record.rounds.map((round) => {
          const item = round && typeof round === "object" ? round as Record<string, unknown> : {};
          const score = item.score && typeof item.score === "object" ? item.score as Record<string, unknown> : {};

          return {
            hintCounts: item.hintCounts && typeof item.hintCounts === "object" ? item.hintCounts as Record<string, number> : {},
            missedQuestionIds: Array.isArray(item.missedQuestionIds) ? item.missedQuestionIds.map(String) : [],
            nextRoundGoal: typeof item.nextRoundGoal === "string" ? item.nextRoundGoal : "",
            recommendedQuestionIds: Array.isArray(item.recommendedQuestionIds) ? item.recommendedQuestionIds.map(String) : [],
            reviewSummary: typeof item.reviewSummary === "string" ? item.reviewSummary : "",
            roundGoal: typeof item.roundGoal === "string" ? item.roundGoal : "",
            score: {
              correct: typeof score.correct === "number" ? score.correct : 0,
              total: typeof score.total === "number" ? score.total : 0,
            },
          };
        })
      : [],
    sessionId: typeof record.sessionId === "string" ? record.sessionId : crypto.randomUUID(),
    tagContext: normalizeTagContext(record.tagContext, goal),
  });
}

function loadSavedSession() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? normalizeSavedSession(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

function formatTrace(event: PracticeTraceEvent) {
  return [
    event.toolName,
    event.outputSummary ? `→ ${event.outputSummary}` : "",
    event.error ? `Error: ${event.error}` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

function compactPersistedSession(session: SavedSession): SavedSession {
  return {
    completedQuestionIds: Array.from(new Set(session.completedQuestionIds)).slice(-300),
    goal: session.goal,
    memory: session.memory.slice(0, 1600),
    rounds: session.rounds.slice(-12).map((round) => ({
      hintCounts: round.hintCounts,
      missedQuestionIds: round.missedQuestionIds.slice(0, 16),
      nextRoundGoal: round.nextRoundGoal.slice(0, 500),
      recommendedQuestionIds: round.recommendedQuestionIds.slice(0, 12),
      reviewSummary: round.reviewSummary.slice(0, 700),
      roundGoal: round.roundGoal.slice(0, 500),
      score: round.score,
    })),
    sessionId: session.sessionId,
    tagContext: normalizeTagContext(session.tagContext, session.goal),
  };
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  const payload = (await response.json()) as T & ApiError;

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

      if (!dataLines.length) {
        return null;
      }

      return { data: dataLines.join("\n"), event };
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
        if (errorPayload.trace?.length) {
          errorPayload.trace.forEach(onTrace);
        }
        throw new Error(errorPayload.error || "Practice recommendation failed.");
      }
    }

    if (done) {
      break;
    }
  }

  if (!result) {
    throw new Error("Practice recommendation stream ended before a result was returned.");
  }

  return result;
}

function answerValue(answer: string | string[] | undefined) {
  if (Array.isArray(answer)) {
    return answer.join(", ");
  }

  return answer ?? "";
}

function resultBadge(result: PracticeGradeResult | undefined) {
  if (!result) {
    return null;
  }

  if (result.isCorrect === true) {
    return <Badge variant="secondary">correct</Badge>;
  }

  if (result.isCorrect === false) {
    return <Badge variant="destructive">incorrect</Badge>;
  }

  return <Badge variant="outline">manual review</Badge>;
}

function latestProcessSummary(trace: PracticeTraceEvent[]) {
  const latest = [...trace]
    .reverse()
    .find((event) => event.thoughtSummary || event.outputSummary || event.inputSummary || event.error);

  if (!latest) {
    return "Waiting for the agent to choose its first step.";
  }

  return latest.thoughtSummary || latest.outputSummary || latest.inputSummary || latest.error || "";
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
  if (!trace.length && !active) {
    return null;
  }

  return (
    <Card className={active ? "animate-in fade-in slide-in-from-bottom-2 duration-300" : undefined}>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">Generation process</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              Shows UI-safe process notes from the model plus compact backend summaries of tool inputs and outputs.
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
        ) : null}
        <div className="space-y-2">
          {!collapsed && trace.map((event, index) => (
            <details
              key={`${event.toolName}-${index}`}
              className="animate-in fade-in slide-in-from-bottom-1 rounded-md border bg-muted/20 p-3 text-xs duration-300"
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
          const selected = Array.isArray(answer)
            ? answer.includes(option.id)
            : answer === option.id;

          return (
            <label
              key={option.id}
              className="grid cursor-pointer gap-3 rounded-md border bg-background p-3 sm:grid-cols-[1.5rem_1fr]"
            >
              <input
                checked={selected}
                disabled={disabled}
                name={`answer-${question.id}`}
                onChange={() => onChange(option.id)}
                type="radio"
              />
              <div className="space-y-1">
                <span className="font-mono text-xs text-muted-foreground">{option.label}</span>
                <OptionText
                  className="border-none bg-transparent p-0"
                  value={option.content_html}
                />
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
  const [session, setSession] = useState<SavedSession | null>(null);
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
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const resultTopRef = useRef<HTMLDivElement | null>(null);
  const thinkingEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;

    queueMicrotask(() => {
      if (cancelled) {
        return;
      }

      const saved = loadSavedSession();
      if (saved) {
        setSession(saved);
        setGoal(saved.goal);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (session) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(compactPersistedSession(session)));
    }
  }, [session]);

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

  const activeSession = useMemo(() => session ?? (goal.trim() ? newSession(goal.trim()) : null), [goal, session]);
  const latestTrace = useMemo(() => {
    if (phase === "feedback" && review) {
      return reviewTrace;
    }

    if (phase === "thinking") {
      return liveTrace;
    }

    return recommendation?.trace ?? liveTrace;
  }, [phase, liveTrace, recommendation, review, reviewTrace]);

  function resetRoundState() {
    setAnswers({});
    setHints({});
    setResults([]);
    setReview(null);
    setReviewTrace([]);
  }

  function requestRecommendation(nextGoal?: string) {
    const trimmedGoal = (nextGoal ?? goal).trim();

    if (!trimmedGoal) {
      setError("Enter a practice goal first.");
      return;
    }

    const currentSession = session ?? newSession(trimmedGoal);
    setSession(currentSession);
    setError(null);
    setPhase("thinking");
    setLiveTrace([]);
    setReviewTrace([]);
    setIsTraceCollapsed(false);
    setRecommendation(null);
    resetRoundState();

    startTransition(async () => {
      try {
        const response = await postRecommendationStream({
          body: {
          completedQuestionIds: currentSession.completedQuestionIds,
          goal: trimmedGoal,
          questionCount,
          sessionMemory: currentSession.memory,
          tagContext: currentSession.tagContext,
          },
          onTrace: (event) => setLiveTrace((current) => [...current, event]),
        });
        setRecommendation(response);
        setLiveTrace(response.trace);
        setIsTraceCollapsed(true);
        setGoal(trimmedGoal);
        setSession({
          ...currentSession,
          goal: trimmedGoal,
          memory: response.sessionMemory,
          tagContext: response.tagContext,
        });
        setPhase("recommended");
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : String(caught));
        setPhase("start");
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
        const response = await postJson<PracticeHintResponse>("/api/practice/hint", {
          currentAnswer: answers[question.id] ?? "",
          hintLevel: previousHints.length + 1,
          previousHints,
          questionId: question.id,
        });
        setHints((current) => ({
          ...current,
          [question.id]: [...previousHints, response.hint],
        }));
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : String(caught));
      }
    });
  }

  function submitRound() {
    if (!recommendation || !activeSession) {
      return;
    }

    const attempts: PracticeAttemptInput[] = recommendation.recommendations.map((question) => ({
      answer: answers[question.id] ?? "",
      hintCount: hints[question.id]?.length ?? 0,
      questionId: question.id,
    }));

    setError(null);
    setPhase("thinking");
    setLiveTrace([]);
    setIsTraceCollapsed(false);

    startTransition(async () => {
      try {
        const grade = await postJson<{ results: PracticeGradeResult[]; trace: PracticeTraceEvent[] }>(
          "/api/practice/grade",
          { attempts },
        );
        setLiveTrace(grade.trace);
        const resultsById = new Map(grade.results.map((result) => [result.questionId, result]));
        const reviewPayloadAttempts = attempts.map((attempt) => {
          const recommended = recommendation.recommendations.find((item) => item.id === attempt.questionId);
          const result = resultsById.get(attempt.questionId);

          if (!result) {
            throw new Error(`Missing grading result for ${attempt.questionId}`);
          }

          return {
            ...attempt,
            questionCode: recommended?.questionCode,
            result,
            title: recommended?.title,
          };
        });
        const reviewResponse = await postJson<PracticeReviewResponse>("/api/practice/review", {
          attempts: reviewPayloadAttempts,
          goal: activeSession.goal,
          recommendations: recommendation.recommendations.map((question) => ({
            difficulty: question.difficulty,
            id: question.id,
            questionCode: question.questionCode,
            questionType: question.questionType,
            reason: question.reason,
            tagIds: question.tagIds,
            title: question.title,
          })),
          sessionMemory: activeSession.memory,
        });
        const completedQuestionIds = Array.from(
          new Set([
            ...activeSession.completedQuestionIds,
            ...recommendation.recommendations.map((question) => question.id),
          ]),
        );
        const autoResults = grade.results.filter((result) => result.gradingMode === "auto");
        const savedRound: SavedRoundSummary = {
          hintCounts: Object.fromEntries(attempts.map((attempt) => [attempt.questionId, attempt.hintCount ?? 0])),
          missedQuestionIds: grade.results
            .filter((result) => result.isCorrect === false)
            .map((result) => result.questionId),
          nextRoundGoal: reviewResponse.nextRoundGoal,
          recommendedQuestionIds: recommendation.recommendations.map((question) => question.id),
          reviewSummary: reviewResponse.summary,
          roundGoal: recommendation.roundGoal,
          score: {
            correct: autoResults.filter((result) => result.isCorrect === true).length,
            total: autoResults.length,
          },
        };

        setResults(grade.results);
        setReview(reviewResponse);
        setReviewTrace([...grade.trace, ...reviewResponse.trace]);
        setLiveTrace([...grade.trace, ...reviewResponse.trace]);
        setIsTraceCollapsed(true);
        setSession({
          ...activeSession,
          completedQuestionIds,
          memory: reviewResponse.updatedSessionMemory,
          rounds: [...activeSession.rounds, savedRound],
        });
        setPhase("feedback");
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : String(caught));
        setPhase("practicing");
      }
    });
  }

  function clearSession() {
    window.localStorage.removeItem(STORAGE_KEY);
    setSession(null);
    setRecommendation(null);
    setGoal("");
    resetRoundState();
    setPhase("start");
  }

  const resultsById = new Map<string, PracticeGradeResult>(
    results.map((result) => [result.questionId, result]),
  );

  return (
    <div className="space-y-6">
      <div className="rounded-md border bg-gradient-to-r from-muted/50 to-background p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <Badge variant="secondary">Practice Agent MVP</Badge>
            <h1 className="text-3xl font-semibold tracking-tight">O2I Practice Agent</h1>
            <p className="max-w-3xl text-sm text-muted-foreground">
              A no-database-change MVP: only compact memory, completed ids,
              score summaries, missed ids, and hint counts are persisted locally.
              Current question HTML, solutions, and raw traces are not saved in localStorage.
            </p>
          </div>
          {session ? (
            <Button onClick={clearSession} type="button" variant="outline">
              Clear local session
            </Button>
          ) : null}
        </div>
      </div>

      {error ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Goal</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-[1fr_9rem_auto]">
          <div className="space-y-2">
            <Label htmlFor="goal">What do you want to practice?</Label>
            <Input
              id="goal"
              onChange={(event) => setGoal(event.target.value)}
              placeholder="e.g. AP Calculus implicit differentiation, harder MCQ first"
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
            <Button disabled={isPending} onClick={() => requestRecommendation()} type="button">
              {session?.rounds.length ? "Start next round" : "Generate round"}
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
                {recommendation
                  ? "The agent is grading submitted answers and preparing a compact round review."
                  : "The agent is choosing a retrieval path, calling question-bank tools, and preparing recommendations."}
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
          <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
            <div className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <CardTitle className="text-base">Recommended round</CardTitle>
                    <FeedbackText
                      className="mt-1 border-none bg-transparent p-0 text-muted-foreground"
                      compact
                      value={recommendation.roundGoal}
                    />
                    <p className="mt-1 text-xs text-muted-foreground">
                      Tool-call budget: max {recommendation.maxToolCalls} calls including finalization.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline">{recommendation.mode}</Badge>
                    {recommendation.providerLabel ? (
                      <Badge variant="secondary">{recommendation.providerLabel}</Badge>
                    ) : null}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {recommendation.recommendations.map((question, index) => (
                  <Card key={question.id} className="shadow-none">
                    <CardHeader>
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <CardTitle className="text-base">
                            {index + 1}. {question.title}
                          </CardTitle>
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
                        <FeedbackText
                          className="mt-1 border-none bg-transparent p-0 text-muted-foreground"
                          compact
                          value={question.reason}
                        />
                        <p className="mt-1 text-xs text-muted-foreground">
                          Expected skill:{" "}
                          <FeedbackText
                            className="inline border-none bg-transparent p-0 text-xs text-muted-foreground"
                            compact
                            inline
                            value={question.expectedSkill}
                          />
                        </p>
                      </div>
                      <QuestionAnswerInput
                        answer={answers[question.id]}
                        disabled={phase === "feedback"}
                        onChange={(value) => updateAnswer(question.id, value)}
                        question={question}
                      />
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          disabled={isPending || phase === "feedback"}
                          onClick={() => requestHint(question)}
                          size="sm"
                          type="button"
                          variant="outline"
                        >
                          Hint
                        </Button>
                        <span className="text-xs text-muted-foreground">
                          Hint calls are isolated and do not share the main agent context.
                        </span>
                      </div>
                      {hints[question.id]?.length ? (
                        <div className="space-y-2">
                          {hints[question.id].map((hint, hintIndex) => (
                            <div key={`${question.id}-hint-${hintIndex}`} className="rounded-md border bg-muted/30 p-3 text-sm">
                              <span className="font-medium">Hint {hintIndex + 1}: </span>
                              <FeedbackText
                                className="inline border-none bg-transparent p-0 text-muted-foreground"
                                compact
                                inline
                                value={hint}
                              />
                            </div>
                          ))}
                        </div>
                      ) : null}
                      {phase === "feedback" && resultsById.get(question.id) ? (
                        <div className="space-y-3 rounded-md border p-3">
                          <FeedbackText
                            className="border-none bg-transparent p-0 text-muted-foreground"
                            compact
                            value={resultsById.get(question.id)?.explanation}
                          />
                          {resultsById.get(question.id)?.solutionHtml ? (
                            <div className="space-y-2">
                              <p className="text-sm font-medium">Solution</p>
                              <SolutionText
                                value={resultsById.get(question.id)?.solutionHtml ?? ""}
                              />
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </CardContent>
                  </Card>
                ))}

                {phase !== "feedback" ? (
                  <div className="flex justify-end">
                    <Button disabled={isPending} onClick={submitRound} type="button">
                      Submit round
                    </Button>
                  </div>
                ) : null}
              </CardContent>
            </Card>
            </div>

            <div className="space-y-4">
              {session?.rounds.length ? (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Previous feedback used</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <FeedbackText
                      className="border-none bg-transparent p-0 text-muted-foreground"
                      compact
                      value={session.memory}
                    />
                  </CardContent>
                </Card>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {phase === "feedback" && review ? (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle className="text-base">Round review</CardTitle>
                <FeedbackText
                  className="mt-1 border-none bg-transparent p-0 text-muted-foreground"
                  compact
                  value={review.summary}
                />
              </div>
              <Badge variant="outline">{review.mode}</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-md border bg-muted/20 p-3 text-sm">
              <p className="font-medium">Next round direction</p>
              <FeedbackText
                className="mt-1 border-none bg-transparent p-0 text-muted-foreground"
                compact
                value={review.nextRoundGoal}
              />
            </div>
            <Button onClick={() => requestRecommendation(review.nextRoundGoal)} type="button">
              Generate next round from feedback
            </Button>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
