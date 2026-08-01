import type { PracticeTraceEvent } from "@/lib/practice/types";

const PUBLIC_TRACE_PHASES = new Set<PracticeTraceEvent["phase"]>([
  "context",
  "grading",
  "hint",
  "recommendation",
  "review",
]);

function boundedInteger(value: unknown, maximum: number) {
  const numeric = Number(value);
  return Number.isFinite(numeric)
    ? Math.min(maximum, Math.max(0, Math.trunc(numeric)))
    : undefined;
}

function publicPracticeTraceToolName(phase: PracticeTraceEvent["phase"]) {
  switch (phase) {
    case "grading":
      return "practice_grading_step";
    case "hint":
      return "practice_hint_step";
    case "recommendation":
      return "practice_recommendation_step";
    case "review":
      return "practice_review_step";
    default:
      return "practice_context_step";
  }
}

function publicPracticeTraceSummary(phase: PracticeTraceEvent["phase"]) {
  switch (phase) {
    case "grading":
      return "Checking the submitted answer.";
    case "hint":
      return "Preparing a bounded hint.";
    case "recommendation":
      return "Selecting questions from the authorized practice scope.";
    case "review":
      return "Building the round review.";
    default:
      return "Reading the authorized session context.";
  }
}

export function sanitizePublicPracticeTraceEvent(
  value: unknown,
): PracticeTraceEvent | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const source = value as Record<string, unknown>;
  if (typeof source.toolName !== "string") return null;
  const phase = PUBLIC_TRACE_PHASES.has(source.phase as PracticeTraceEvent["phase"])
    ? source.phase as PracticeTraceEvent["phase"]
    : "context";
  const resultCount = boundedInteger(source.resultCount, 10_000);

  return {
    elapsedMs: boundedInteger(source.elapsedMs, 10 * 60 * 1000),
    error: source.error ? "This step could not be completed." : undefined,
    inputPayload: undefined,
    inputSummary: publicPracticeTraceSummary(phase),
    iteration: boundedInteger(source.iteration, 100),
    llmUsage: undefined,
    outputPayload: undefined,
    outputSummary: resultCount === undefined
      ? undefined
      : `Processed ${resultCount} bounded item${resultCount === 1 ? "" : "s"}.`,
    phase,
    resultCount,
    savedFullPayload: undefined,
    thoughtSummary: undefined,
    toolCallId: undefined,
    toolName: publicPracticeTraceToolName(phase),
  };
}

export function sanitizePublicPracticeTrace(value: unknown): PracticeTraceEvent[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map(sanitizePublicPracticeTraceEvent)
    .filter((event): event is PracticeTraceEvent => Boolean(event));
}
