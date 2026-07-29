import type { PracticeTraceEvent } from "@/lib/practice/types";

export function sanitizePublicPracticeTraceEvent(
  value: unknown,
): PracticeTraceEvent | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const sanitized = { ...(value as Record<string, unknown>) };
  delete sanitized.modelThought;
  delete sanitized.reasoningContent;
  if (sanitized.toolName === "model_tool_choice") {
    sanitized.inputSummary = sanitized.error
      ? "Model did not request an allowed backend action."
      : "Model selected the next backend action.";
  }

  return typeof sanitized.toolName === "string"
    ? sanitized as PracticeTraceEvent
    : null;
}

export function sanitizePublicPracticeTrace(value: unknown): PracticeTraceEvent[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map(sanitizePublicPracticeTraceEvent)
    .filter((event): event is PracticeTraceEvent => Boolean(event));
}
