import "server-only";

import {
  callPracticeChatModelStream,
  type PracticeChatMessage,
} from "@/lib/practice/ai";
import { stableStringify } from "@/lib/practice/context";
import { PRACTICE_SUMMARY_PROMPT_SAFETY_BOUNDARY } from "@/lib/practice/prompt-safety";
import type {
  PracticeCompletion,
  PracticeInventory,
} from "@/lib/practice/types";

type SupabaseLike = {
  from: (...args: any[]) => any;
};

type PracticeProfile = Parameters<typeof callPracticeChatModelStream>[0]["profile"];

type CompletionReason = PracticeCompletion["reason"];

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function readSavedCompletion(value: unknown): PracticeCompletion | null {
  const summary = asObject(value);
  const completion = asObject(summary.completion);
  const inventory = asObject(completion.inventory);
  if (completion.reportStatus === "generating") return null;
  if (!completion.report || !completion.completedAt) return null;

  const rawReason = String(completion.reason ?? "");
  return {
    completedAt: String(completion.completedAt),
    inventory: {
      deferred: Number(inventory.deferred ?? 0),
      eligible: Number(inventory.eligible ?? 0),
      mastered: Number(inventory.mastered ?? 0),
      needsRetry: Number(inventory.needsRetry ?? 0),
      ungraded: Number(inventory.ungraded ?? 0),
      unseen: Number(inventory.unseen ?? 0),
    },
    reason:
      rawReason === "goal_satisfied" ||
      rawReason === "diminishing_returns" ||
      rawReason === "source_access_lost"
        ? rawReason
        : "scope_exhausted",
    report: String(completion.report),
    trigger: completion.trigger === "agent" ? "agent" : "backend",
  };
}

function deterministicReport({
  correctCount,
  goal,
  incorrectCount,
  inventory,
  reason,
  retryCount,
  roundCount,
  sourceCoverage,
  strengthenTags,
  uniqueQuestionCount,
}: {
  correctCount: number;
  goal: string;
  incorrectCount: number;
  inventory: PracticeInventory;
  reason: CompletionReason;
  retryCount: number;
  roundCount: number;
  sourceCoverage: Array<{ count: number; name: string }>;
  strengthenTags: string[];
  uniqueQuestionCount: number;
}) {
  const reasonText = {
    diminishing_returns: "Further repetition in this session would have diminishing returns.",
    goal_satisfied: "The current learning goal has been satisfied for this session.",
    scope_exhausted: "No questions that are not yet attempted or eligible for retry remain in the selected scope.",
    source_access_lost: "The selected practice sources are no longer available.",
  }[reason];

  return [
    `Practice complete: ${goal || "self-study session"}.`,
    `You completed ${roundCount} round${roundCount === 1 ? "" : "s"} across ${uniqueQuestionCount} unique question${uniqueQuestionCount === 1 ? "" : "s"}.`,
    `Attempt evidence: ${correctCount} correct, ${incorrectCount} incorrect, and ${retryCount} repeat attempt${retryCount === 1 ? "" : "s"}.`,
    `Source coverage: ${sourceCoverage.length ? sourceCoverage.map((source) => `${source.name} (${source.count})`).join(", ") : "no source coverage recorded"}.`,
    strengthenTags.length
      ? `Still strengthen: ${strengthenTags.join(", ")}.`
      : "No unresolved taxonomy focus was identified.",
    reasonText,
    `Remaining inventory: ${inventory.unseen} not yet attempted, ${inventory.needsRetry} eligible retries, ${inventory.deferred} deferred retries, and ${inventory.mastered} answered correctly.`,
    "Start a new session with a broader Library scope or return to your mistakes when you are ready.",
  ].join("\n\n");
}

export async function completePracticeSession({
  cachePrefixVersion,
  courseFrameworkSnapshot,
  goal,
  inventory,
  onDelta,
  profile,
  reason,
  reportFocus,
  sessionId,
  sessionPlan,
  sessionThreadMessages,
  supabase,
  trigger,
  userId,
}: {
  cachePrefixVersion: string;
  courseFrameworkSnapshot?: unknown;
  goal: string;
  inventory: PracticeInventory;
  onDelta?: (text: string) => void | Promise<void>;
  profile: PracticeProfile;
  reason: CompletionReason;
  reportFocus?: string;
  sessionId: string;
  sessionPlan?: unknown;
  sessionThreadMessages?: unknown;
  supabase: SupabaseLike;
  trigger: PracticeCompletion["trigger"];
  userId: string;
}): Promise<PracticeCompletion> {
  const { data: existingSession, error: existingError } = await supabase
    .from("practice_sessions")
    .select("status,summary,session_thread_messages")
    .eq("id", sessionId)
    .eq("user_id", userId)
    .maybeSingle();
  if (existingError) throw new Error(existingError.message);

  const saved = readSavedCompletion(existingSession?.summary);
  if (saved) return saved;

  const completedAt = new Date().toISOString();
  const claimed = await supabase
    .from("practice_sessions")
    .update({
      completed_at: completedAt,
      status: "completed",
      summary: {
        completion: {
          completedAt,
          inventory,
          reason,
          report: "Generating final practice report…",
          reportStatus: "generating",
          trigger,
        },
      },
    })
    .eq("id", sessionId)
    .eq("user_id", userId)
    .eq("status", "active")
    .select("id")
    .maybeSingle();
  if (claimed.error) throw new Error(claimed.error.message);

  if (!claimed.data) {
    const { data: settled } = await supabase
      .from("practice_sessions")
      .select("summary")
      .eq("id", sessionId)
      .eq("user_id", userId)
      .maybeSingle();
    const settledCompletion = readSavedCompletion(settled?.summary);
    if (settledCompletion) return settledCompletion;

    const pending = asObject(asObject(settled?.summary).completion);
    const pendingInventory = asObject(pending.inventory);
    return {
      completedAt: String(pending.completedAt ?? completedAt),
      inventory: {
        deferred: Number(pendingInventory.deferred ?? inventory.deferred),
        eligible: Number(pendingInventory.eligible ?? inventory.eligible),
        mastered: Number(pendingInventory.mastered ?? inventory.mastered),
        needsRetry: Number(pendingInventory.needsRetry ?? inventory.needsRetry),
        ungraded: Number(pendingInventory.ungraded ?? inventory.ungraded),
        unseen: Number(pendingInventory.unseen ?? inventory.unseen),
      },
      reason,
      report: "Final practice report generation is already in progress.",
      trigger,
    };
  }

  const [{ data: rounds }, { data: attempts }, { data: sources }] = await Promise.all([
    supabase
      .from("practice_rounds")
      .select("id,round_index,round_goal,review_summary,score_correct,score_total")
      .eq("session_id", sessionId)
      .eq("user_id", userId)
      .order("round_index", { ascending: true }),
    supabase
      .from("practice_attempts")
      .select("source_question_id,is_correct,score,question_title,created_at")
      .eq("session_id", sessionId)
      .eq("user_id", userId)
      .order("created_at", { ascending: true }),
    supabase
      .from("practice_session_sources")
      .select("source_kind,bank_id,source_snapshot")
      .eq("session_id", sessionId),
  ]);

  const attemptRows = (attempts ?? []) as Array<{
    is_correct?: boolean | null;
    source_question_id?: string | null;
  }>;
  const questionIds = Array.from(new Set(
    attemptRows.flatMap((attempt) => attempt.source_question_id
      ? [attempt.source_question_id]
      : []),
  ));
  const uniqueQuestionCount = questionIds.length;
  const [{ data: questionRows }, { data: bankQuestionRows }, { data: taxonomyRows }] =
    questionIds.length
      ? await Promise.all([
          supabase
            .from("questions")
            .select("id,visibility,owner_bank_id")
            .in("id", questionIds),
          supabase
            .from("bank_questions")
            .select("bank_id,question_id")
            .eq("status", "active")
            .in("question_id", questionIds),
          supabase
            .from("question_taxonomy_assignments")
            .select("question_id,tag_id,taxonomy_nodes(label)")
            .eq("review_status", "approved")
            .in("question_id", questionIds),
        ])
      : [{ data: [] }, { data: [] }, { data: [] }];
  const latestByQuestion = new Map<string, boolean | null>();
  for (const attempt of attemptRows) {
    if (attempt.source_question_id) {
      latestByQuestion.set(attempt.source_question_id, attempt.is_correct ?? null);
    }
  }
  const unresolvedQuestionIds = new Set(
    Array.from(latestByQuestion.entries())
      .filter(([, isCorrect]) => isCorrect === false)
      .map(([questionId]) => questionId),
  );
  const strengthenTagLabels = (taxonomyRows ?? []).flatMap((row: {
      question_id?: string;
      taxonomy_nodes?: { label?: string } | Array<{ label?: string }> | null;
    }) => {
      if (!row.question_id || !unresolvedQuestionIds.has(row.question_id)) return [];
      const nodes = Array.isArray(row.taxonomy_nodes)
        ? row.taxonomy_nodes
        : row.taxonomy_nodes
          ? [row.taxonomy_nodes]
          : [];
      return nodes.flatMap((node) => node.label ? [node.label] : []);
    }) as string[];
  const strengthenTags = Array.from(new Set<string>(strengthenTagLabels)).slice(0, 8);
  const sourceCoverage = (sources ?? []).map((source: {
    bank_id?: string | null;
    source_kind?: string;
    source_snapshot?: unknown;
  }) => {
    const snapshot = asObject(source.source_snapshot);
    const count = source.source_kind === "public_catalog"
      ? (questionRows ?? []).filter((question: {
          owner_bank_id?: string | null;
          visibility?: string;
        }) => question.visibility === "public" && !question.owner_bank_id).length
      : source.source_kind === "question_bank"
        ? (bankQuestionRows ?? []).filter((link: { bank_id?: string }) =>
            link.bank_id === source.bank_id,
          ).length
        : uniqueQuestionCount;
    return {
      count,
      name: String(snapshot.name ?? snapshot.title ?? source.source_kind ?? "Practice source"),
    };
  });
  const correctCount = attemptRows.filter((attempt) => attempt.is_correct === true).length;
  const incorrectCount = attemptRows.filter((attempt) => attempt.is_correct === false).length;
  const retryCount = Math.max(0, attemptRows.length - uniqueQuestionCount);
  const fallback = deterministicReport({
    correctCount,
    goal,
    incorrectCount,
    inventory,
    reason,
    retryCount,
    roundCount: rounds?.length ?? 0,
    sourceCoverage,
    strengthenTags,
    uniqueQuestionCount,
  });
  let report = "";

  const effectiveThreadMessages = Array.isArray(existingSession?.session_thread_messages)
    ? existingSession.session_thread_messages
    : sessionThreadMessages;
  const threadMessages: PracticeChatMessage[] = Array.isArray(effectiveThreadMessages)
    ? effectiveThreadMessages.slice(-24).map((entry, index) => ({
        content: stableStringify(entry),
        name: `practice_thread_${index + 1}`,
        role: "assistant" as const,
      }))
    : [];

  try {
    const result = await callPracticeChatModelStream({
      debugContext: { phase: "session_completion", reason, sessionId },
      messages: [
        {
          role: "system",
          content:
            "You are the O2I Practice main thread. Produce only a concise final learning report. Do not call tools or recommend another question in this session.",
        },
        {
          role: "system",
          content: PRACTICE_SUMMARY_PROMPT_SAFETY_BOUNDARY,
        },
        {
          role: "system",
          content: stableStringify({
            cache_policy: { cache_prefix_version: cachePrefixVersion },
            course_framework: courseFrameworkSnapshot ?? null,
            session_plan: sessionPlan ?? null,
          }),
        },
        ...threadMessages,
        {
          role: "user",
          content: stableStringify({
            completion_reason: reason,
            correct_count: correctCount,
            final_inventory: inventory,
            goal,
            incorrect_count: incorrectCount,
            report_focus: reportFocus ?? "",
            retry_count: retryCount,
            rounds: rounds ?? [],
            source_coverage: sourceCoverage,
            strengthen_tags: strengthenTags,
            unique_question_count: uniqueQuestionCount,
          }),
        },
      ],
      onDelta: async (text) => {
        report += text;
        await onDelta?.(text);
      },
      profile,
      toolChoice: "none",
    });
    report = result.contentText.trim() || report.trim() || fallback;
  } catch {
    report = fallback;
    await onDelta?.(fallback);
  }

  const completion: PracticeCompletion = {
    completedAt,
    inventory,
    reason,
    report: report.slice(0, 5000),
    trigger,
  };
  const summary = {
    completion: {
      ...completion,
      reportStatus: "completed",
    },
  };

  const { error: saveError } = await supabase
    .from("practice_sessions")
    .update({ summary })
    .eq("id", sessionId)
    .eq("user_id", userId);
  if (saveError) throw new Error(saveError.message);

  await supabase.from("practice_reflection_records").insert({
    body: completion.report,
    created_by: userId,
    reflection_kind: "session_review",
    session_id: sessionId,
    summary,
    user_id: userId,
  });

  return completion;
}
