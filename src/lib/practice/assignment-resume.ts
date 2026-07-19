export type AssignmentPracticeSessionLink = {
  createdAt: string;
  practiceSessionId: string;
};

export type AssignmentPracticeResumeResult<T> = {
  session: T;
  source: "progress_pointer" | "latest_link";
};

function orderedLinkedSessions({
  lastPracticeSessionId,
  linkedSessions,
}: {
  lastPracticeSessionId?: string | null;
  linkedSessions: AssignmentPracticeSessionLink[];
}) {
  const ordered = [...linkedSessions].sort((left, right) => {
    const createdOrder = right.createdAt.localeCompare(left.createdAt);
    return createdOrder || right.practiceSessionId.localeCompare(left.practiceSessionId);
  });
  const linkedIds = new Set(ordered.map((link) => link.practiceSessionId));
  const candidates: Array<{
    practiceSessionId: string;
    source: AssignmentPracticeResumeResult<unknown>["source"];
  }> = [];

  if (lastPracticeSessionId && linkedIds.has(lastPracticeSessionId)) {
    candidates.push({
      practiceSessionId: lastPracticeSessionId,
      source: "progress_pointer",
    });
  }

  for (const link of ordered) {
    if (link.practiceSessionId === lastPracticeSessionId) continue;
    candidates.push({
      practiceSessionId: link.practiceSessionId,
      source: "latest_link",
    });
  }

  return candidates;
}

export async function resolveAssignmentPracticeResumeSession<T>({
  lastPracticeSessionId,
  linkedSessions,
  loadSession,
}: {
  lastPracticeSessionId?: string | null;
  linkedSessions: AssignmentPracticeSessionLink[];
  loadSession: (practiceSessionId: string) => Promise<T | null>;
}): Promise<AssignmentPracticeResumeResult<T> | null> {
  for (const candidate of orderedLinkedSessions({
    lastPracticeSessionId,
    linkedSessions,
  })) {
    const session = await loadSession(candidate.practiceSessionId);
    if (session) {
      return {
        session,
        source: candidate.source,
      };
    }
  }

  return null;
}
