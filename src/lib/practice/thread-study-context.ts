import type { PracticeSessionDetail } from "@/lib/practice/types";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export function threadStudyContext(session: PracticeSessionDetail | null) {
  const entries = session?.sessionThreadMessages ?? [];
  const records = entries
    .map(asRecord)
    .filter((entry): entry is Record<string, unknown> => Boolean(entry));
  const checkpoint = [...records]
    .reverse()
    .find((entry) => entry.kind === "thread_checkpoint");
  const currentTask = [...records]
    .reverse()
    .find((entry) => entry.kind === "current_task");
  const episode = [...records]
    .reverse()
    .find((entry) => entry.kind === "episode_card");

  if (!checkpoint && !currentTask && !episode) {
    return session?.sessionState || session?.sessionMemory || null;
  }

  return {
    checkpoint: checkpoint?.summary ?? checkpoint ?? null,
    latest_episode: episode?.summary ?? episode ?? null,
    latest_task: currentTask?.summary ?? currentTask ?? null,
    locked_long_term_memory: session?.longTermMemorySnapshot || "",
    thread_entries: records.length,
  };
}
