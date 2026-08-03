import type { PracticeTraceEvent } from "@/lib/practice/types";

const PUBLIC_TRACE_PHASES = new Set<PracticeTraceEvent["phase"]>([
  "context",
  "grading",
  "hint",
  "recommendation",
  "review",
]);

const PUBLIC_TRACE_TOOL_NAMES = new Set([
  "practice_browse_step",
  "practice_context_step",
  "practice_finalize_step",
  "practice_finish_step",
  "practice_grading_step",
  "practice_hint_step",
  "practice_model_step",
  "practice_progress_step",
  "practice_recommendation_step",
  "practice_review_step",
  "practice_search_step",
]);

function boundedInteger(value: unknown, maximum: number) {
  const numeric = Number(value);
  return Number.isFinite(numeric)
    ? Math.min(maximum, Math.max(0, Math.trunc(numeric)))
    : undefined;
}

function publicPracticeTraceToolName(
  phase: PracticeTraceEvent["phase"],
  sourceToolName: string,
) {
  if (PUBLIC_TRACE_TOOL_NAMES.has(sourceToolName)) return sourceToolName;

  if (phase === "context") return "practice_context_step";

  if (phase === "recommendation") {
    if (sourceToolName === "model_tool_choice") return "practice_model_step";
    if (
      sourceToolName === "model_tool_choice_start" ||
      sourceToolName === "model_usage" ||
      sourceToolName === "compact_agent_context"
    ) {
      return "practice_progress_step";
    }
    if (sourceToolName === "browse_taxonomy_batch") return "practice_browse_step";
    if (sourceToolName === "practice_search_batch") return "practice_search_step";
    if (sourceToolName === "finalize_recommendation") return "practice_finalize_step";
    if (sourceToolName === "finish_practice") return "practice_finish_step";
  }

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

function publicPracticeTraceSummary(
  phase: PracticeTraceEvent["phase"],
  toolName: string,
) {
  switch (toolName) {
    case "practice_browse_step":
      return "Checking topic and tag context.";
    case "practice_finalize_step":
      return "Choosing the questions for this round.";
    case "practice_finish_step":
      return "Closing the practice search loop.";
    case "practice_model_step":
      return "Choosing the next practice step.";
    case "practice_progress_step":
      return "Preparing the next practice step.";
    case "practice_search_step":
      return "Looking through authorized question candidates.";
  }

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
  const toolName = publicPracticeTraceToolName(phase, source.toolName);

  return {
    elapsedMs: boundedInteger(source.elapsedMs, 10 * 60 * 1000),
    error: source.error ? "This step could not be completed." : undefined,
    inputPayload: undefined,
    inputSummary: publicPracticeTraceSummary(phase, toolName),
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
    toolName,
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
