import { NextResponse } from "next/server";

import { requirePracticeApiUser } from "@/lib/practice/auth";
import {
  releasePracticeAiOperationLease,
  requirePracticeAiAdmission,
  requirePracticeAiOperationLease,
} from "@/lib/practice/admission";
import {
  PRACTICE_INPUT_LIMITS,
  boundedPracticeIdList,
  boundedPracticeText,
  practiceValidationResponse,
} from "@/lib/practice/request-validation";
import { loadPracticeAIProfile } from "@/lib/practice/ai";
import {
  runPracticeRecommendationAgent,
  type PracticeRecommendationOutcome,
} from "@/lib/practice/agent-loop";
import { completePracticeSession } from "@/lib/practice/completion";
import {
  CURRENT_PRACTICE_SESSION_SCHEMA_VERSION,
  getOrCreatePracticePreference,
  normalizePracticeTagContext,
  persistRecommendationRound,
} from "@/lib/practice/persistence";
import { logPracticeProviderFailure } from "@/lib/practice/provider-safety";
import { PRACTICE_RECOMMENDATION_ERROR_CODES } from "@/lib/practice/recommendation-errors";
import { PRACTICE_SESSION_EXPIRED_MESSAGE } from "@/lib/practice/schema";
import type {
  PracticeRecommendRequest,
  PracticeRecommendResponse,
  PracticeCompletion,
  PracticeTraceEvent,
} from "@/lib/practice/types";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const DEFAULT_QUESTION_COUNT = 4;
const MAX_QUESTION_COUNT = 8;

type RecommendationRequestContext = {
  completedQuestionIds: string[];
  goal: string;
  questionCount: number;
  sessionId: string;
  sourceSelection: {
    bankIds: string[];
    includePublicCatalog: boolean;
  };
  userNextRoundNote: string;
  wrongQuestionIds: string[];
};

function recommendationFailure(outcome: PracticeRecommendationOutcome) {
  if (outcome === "ready") {
    outcome = "protocol_failed";
  }
  if (outcome === "scope_exhausted") {
    return {
      code: PRACTICE_RECOMMENDATION_ERROR_CODES.NO_CONTENT,
      error: "No eligible reviewed questions are available in this practice scope.",
      status: 404,
    };
  }
  if (outcome === "search_failed") {
    return {
      code: PRACTICE_RECOMMENDATION_ERROR_CODES.SEARCH_FAILED,
      error: "Practice could not search the selected sources.",
      status: 503,
    };
  }
  return {
    code: PRACTICE_RECOMMENDATION_ERROR_CODES.PROTOCOL_FAILED,
    error: "The recommendation agent did not complete a valid search and selection sequence.",
    status: 502,
  };
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function savedCompletion(value: unknown): PracticeCompletion | null {
  const completion = asObject(asObject(value).completion);
  const inventory = asObject(completion.inventory);
  if (completion.reportStatus === "generating") return null;
  if (!completion.completedAt || !completion.report) return null;
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

async function ensureToolPolicyNotice({
  completedRoundCount,
  messages,
  sessionId,
  supabase,
  userId,
}: {
  completedRoundCount: number;
  messages: unknown[];
  sessionId: string;
  supabase: any;
  userId: string;
}) {
  const records = messages.map(asObject);
  const noticeId = completedRoundCount > 0
    ? "finish_practice_enabled_after_first_round"
    : "finish_practice_disabled_initial";
  if (records.some((entry) => entry.kind === "tool_policy_notice" && entry.notice_id === noticeId)) {
    return { messages, notice: null };
  }

  const notice = {
    change:
      completedRoundCount > 0
        ? "finish_practice is now enabled for this self-study session."
        : "finish_practice is disabled until at least one round has been completed.",
    kind: "tool_policy_notice",
    notice_id: noticeId,
    policy_version: 1,
    round_count: completedRoundCount,
  };
  const nextMessages = [...messages, notice].slice(-80);
  const { error } = await supabase
    .from("practice_sessions")
    .update({ session_thread_messages: nextMessages })
    .eq("id", sessionId)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  return { messages: nextMessages, notice };
}

async function appendPolicyTransitionNotice({
  change,
  noticeId,
  sessionId,
  supabase,
  userId,
}: {
  change: string;
  noticeId: string;
  sessionId: string;
  supabase: any;
  userId: string;
}) {
  const { data, error: readError } = await supabase
    .from("practice_sessions")
    .select("session_thread_messages")
    .eq("id", sessionId)
    .eq("user_id", userId)
    .maybeSingle();
  if (readError) throw new Error(readError.message);
  const messages = Array.isArray(data?.session_thread_messages)
    ? data.session_thread_messages
    : [];
  if (
    messages.map(asObject).some(
      (entry: Record<string, unknown>) =>
        entry.kind === "tool_policy_notice" && entry.notice_id === noticeId,
    )
  ) {
    return null;
  }
  const notice = {
    change,
    kind: "tool_policy_notice",
    notice_id: noticeId,
    policy_version: 1,
  };
  const { error } = await supabase
    .from("practice_sessions")
    .update({ session_thread_messages: [...messages, notice].slice(-80) })
    .eq("id", sessionId)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  return notice;
}

function normalizeQuestionCount(value: unknown) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return DEFAULT_QUESTION_COUNT;
  }

  return Math.min(MAX_QUESTION_COUNT, Math.max(1, Math.trunc(parsed)));
}

function parseRequestBody(body: PracticeRecommendRequest): RecommendationRequestContext | NextResponse {
  let goal = "";
  let userNextRoundNote = "";
  let completedQuestionIds: string[] = [];
  let wrongQuestionIds: string[] = [];
  try {
    goal = boundedPracticeText(body.goal, {
      field: "goal",
      maxLength: PRACTICE_INPUT_LIMITS.GOAL_CHARS,
      required: true,
    });
    userNextRoundNote = boundedPracticeText(body.userNextRoundNote, {
      field: "userNextRoundNote",
      maxLength: PRACTICE_INPUT_LIMITS.NEXT_ROUND_NOTE_CHARS,
    });
    completedQuestionIds = boundedPracticeIdList(body.completedQuestionIds ?? [], {
      field: "completedQuestionIds",
      maxItemLength: PRACTICE_INPUT_LIMITS.QUESTION_ID_CHARS,
      maxItems: PRACTICE_INPUT_LIMITS.QUESTION_ID_LIST_ITEMS,
    });
    wrongQuestionIds = boundedPracticeIdList(body.wrongQuestionIds ?? [], {
      field: "wrongQuestionIds",
      maxItemLength: PRACTICE_INPUT_LIMITS.QUESTION_ID_CHARS,
      maxItems: PRACTICE_INPUT_LIMITS.QUESTION_ID_LIST_ITEMS,
    });
  } catch (error) {
    const validation = practiceValidationResponse(error);
    if (validation) {
      return NextResponse.json(validation.body, { status: validation.status });
    }
    throw error;
  }
  const sessionId = (body.sessionId ?? "").trim();
  const bankIds = Array.from(
    new Set((body.sourceSelection?.bankIds ?? []).map(String).filter(Boolean)),
  );

  if (!goal) {
    return NextResponse.json({ error: "Practice goal is required." }, { status: 400 });
  }

  if (!sessionId) {
    return NextResponse.json({ error: "sessionId is required." }, { status: 400 });
  }

  if (bankIds.length > 10) {
    return NextResponse.json({ error: "Choose at most 10 Libraries." }, { status: 400 });
  }

  return {
    completedQuestionIds,
    goal,
    questionCount: normalizeQuestionCount(body.questionCount),
    sessionId,
    sourceSelection: {
      bankIds,
      includePublicCatalog: body.sourceSelection?.includePublicCatalog !== false,
    },
    userNextRoundNote,
    wrongQuestionIds,
  };
}

function sseEncode(event: string, data: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function wantsEventStream(request: Request) {
  return request.headers.get("accept")?.includes("text/event-stream") ?? false;
}

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  }

  const supabase = await createClient();
  const auth = await requirePracticeApiUser(supabase);
  if (auth.response) {
    return auth.response;
  }

  const admission = await requirePracticeAiAdmission({ operation: "recommend", supabase });
  if (admission) return admission;

  const body = (await request.json()) as PracticeRecommendRequest;
  const parsed = parseRequestBody(body);
  if (parsed instanceof NextResponse) {
    return parsed;
  }

  const {
    completedQuestionIds,
    goal,
    questionCount,
    sessionId,
    sourceSelection,
    userNextRoundNote,
    wrongQuestionIds,
  } = parsed;
  const trace: PracticeTraceEvent[] = [];
  const sessionResult = await supabase
    .from("practice_sessions")
    .select("cache_prefix_version,completed_question_ids,course_framework_snapshot,long_term_memory_snapshot,outline_user_notes,session_plan,session_thread_messages,source_scope_locked_at,tag_context,status,summary,practice_rounds(id,status,score_total,review_summary),practice_session_sources(source_kind,bank_id)")
    .eq("user_id", auth.user.id)
    .eq("id", sessionId)
    .maybeSingle();

  if (sessionResult.error) {
    const failure = logPracticeProviderFailure({
      error: sessionResult.error,
      operation: "practice_recommendation_session",
    });
    return NextResponse.json({
      code: failure.code,
      correlationId: failure.correlationId,
      error: failure.message,
    }, { status: 500 });
  }

  if (!sessionResult.data) {
    return NextResponse.json({ error: "Practice session not found." }, { status: 404 });
  }

  const sessionData = sessionResult.data;
  let effectiveSources: Array<{
    bank_id: string | null;
    source_kind: string;
  }> = Array.isArray(sessionData.practice_session_sources)
    ? sessionData.practice_session_sources.map((source) => ({
        bank_id: source.bank_id ?? null,
        source_kind: source.source_kind,
      }))
    : [];
  if (sessionData.cache_prefix_version !== CURRENT_PRACTICE_SESSION_SCHEMA_VERSION) {
    return NextResponse.json({ error: PRACTICE_SESSION_EXPIRED_MESSAGE }, { status: 410 });
  }
  const existingCompletion = savedCompletion(sessionData.summary);
  if (sessionData.status === "completed" && existingCompletion) {
    if (wantsEventStream(request)) {
      const encoder = new TextEncoder();
      return new Response(new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encoder.encode(sseEncode("practice_completed", existingCompletion)));
          controller.close();
        },
      }), {
        headers: {
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
          "Content-Type": "text/event-stream; charset=utf-8",
        },
      });
    }
    return NextResponse.json({ completion: existingCompletion });
  }
  if (sessionData.status !== "active") {
    return NextResponse.json({ error: "This practice session is not active." }, { status: 409 });
  }
  if (!sessionData.source_scope_locked_at) {
    const { data: lockedSources, error: lockError } = await supabase.rpc(
      "lock_practice_session_sources_for_round",
      {
        p_bank_ids: sourceSelection.bankIds,
        p_include_public: sourceSelection.includePublicCatalog,
        p_session_id: sessionId,
      },
    );
    if (lockError) {
      return NextResponse.json(
        {
          code: lockError.code ?? "PRACTICE_SOURCE_LOCK_FAILED",
          error: lockError.message || "Practice sources could not be locked for this round.",
        },
        { status: 409 },
      );
    }
    effectiveSources = (lockedSources ?? []).map((source) => ({
      bank_id: source.bank_id,
      source_kind: source.source_kind,
    }));
  }
  const preference = await getOrCreatePracticePreference({ supabase, userId: auth.user.id });
  const completedFromSession = Array.isArray(sessionData.completed_question_ids)
    ? sessionData.completed_question_ids.map(String)
    : [];
  const wrongSet = new Set(wrongQuestionIds);
  const effectiveCompletedQuestionIds = Array.from(
    new Set([...completedFromSession, ...completedQuestionIds]),
  ).filter((questionId) => !wrongSet.has(questionId));
  const lockedLongTermMemory = String(sessionData.long_term_memory_snapshot ?? "").trim() ||
    preference.long_term_preference.trim();
  if (!String(sessionData.long_term_memory_snapshot ?? "").trim() && lockedLongTermMemory) {
    await supabase
      .from("practice_sessions")
      .update({ long_term_memory_snapshot: lockedLongTermMemory.slice(0, 1000) })
      .eq("user_id", auth.user.id)
      .eq("id", sessionId);
  }
  const tagContext = normalizePracticeTagContext(sessionData.tag_context, goal);
  const courseFrameworkSnapshot = sessionData.course_framework_snapshot;
  const cachePrefixVersion = CURRENT_PRACTICE_SESSION_SCHEMA_VERSION;
  const outlineUserNotes = String(sessionData.outline_user_notes ?? "");
  const sessionPlan = sessionData.session_plan ?? null;
  const completedRoundCount = Array.isArray(sessionData.practice_rounds)
    ? sessionData.practice_rounds.filter((round: {
        review_summary?: string | null;
        score_total?: number | null;
        status?: string;
      }) =>
        round.status === "completed" ||
        Number(round.score_total ?? 0) > 0 ||
        Boolean(round.review_summary),
      ).length
    : 0;
  const hasActiveRound = Array.isArray(sessionData.practice_rounds) &&
    sessionData.practice_rounds.some((round: { status?: string }) => round.status === "active");
  if (hasActiveRound) {
    return NextResponse.json(
      {
        code: "ROUND_ALREADY_ACTIVE",
        error: "Submit or finish the current practice round before generating another one.",
      },
      { status: 409 },
    );
  }
  const sourceKinds = new Set(
    effectiveSources.map((source) => source.source_kind),
  );
  if (sourceKinds.has("assignment")) {
    return NextResponse.json(
      { error: "Assignment practice cannot generate self-study rounds." },
      { status: 409 },
    );
  }
  const selectedBankIds = effectiveSources.flatMap((source) =>
    source.source_kind === "question_bank" && source.bank_id ? [source.bank_id] : [],
  );
  let activeMembershipCount = selectedBankIds.length;
  if (selectedBankIds.length > 0) {
    const { data: activeMemberships } = await supabase
      .from("bank_members")
      .select("bank_id")
      .eq("user_id", auth.user.id)
      .eq("status", "active")
      .in("bank_id", selectedBankIds);
    activeMembershipCount = activeMemberships?.length ?? 0;
  }
  const sourceAccessReduced = activeMembershipCount < selectedBankIds.length;
  const sourceAccessLost =
    !sourceKinds.has("public_catalog") &&
    selectedBankIds.length > 0 &&
    activeMembershipCount === 0;
  const policy = await ensureToolPolicyNotice({
    completedRoundCount,
    messages: Array.isArray(sessionData.session_thread_messages)
      ? sessionData.session_thread_messages
      : [],
    sessionId,
    supabase,
    userId: auth.user.id,
  });
  let sessionThreadMessages = policy.messages;
  const sourcePolicyNotice = sourceAccessReduced
    ? await appendPolicyTransitionNotice({
        change: `Practice source access changed: ${selectedBankIds.length - activeMembershipCount} selected Library source(s) are no longer readable. New questions will only come from the remaining authorized scope.`,
        noticeId: `source_scope_reduced_${activeMembershipCount}_of_${selectedBankIds.length}`,
        sessionId,
        supabase,
        userId: auth.user.id,
      })
    : null;
  if (sourcePolicyNotice) {
    sessionThreadMessages = [...sessionThreadMessages, sourcePolicyNotice].slice(-80);
  }

  const operationLease = await requirePracticeAiOperationLease({
    operation: "recommend",
    scopeId: sessionId,
    supabase,
  });
  if ("response" in operationLease) return operationLease.response;

  if (wantsEventStream(request)) {
    const encoder = new TextEncoder();

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (event: string, data: unknown) => {
          controller.enqueue(encoder.encode(sseEncode(event, data)));
        };

        try {
          send("start", { goal, questionCount });
          if (policy.notice) send("policy_notice", policy.notice);
          if (sourcePolicyNotice) send("policy_notice", sourcePolicyNotice);
          const profile = await loadPracticeAIProfile({
            requestId: `recommend:${sessionId}`,
          });
          const agentResult = await runPracticeRecommendationAgent({
            cachePrefixVersion,
            completedQuestionIds: effectiveCompletedQuestionIds,
            completedRoundCount,
            courseFrameworkSnapshot,
            goal,
            longTermMemory: lockedLongTermMemory,
            outlineUserNotes,
            onTrace: (event) => send("trace", event),
            profile,
            questionCount,
            sessionId,
            sessionPlan,
            sessionThreadMessages,
            supabase,
            tagContext,
            trace,
            userNextRoundNote,
          });
          const verifiedScopeExhausted =
            agentResult.recommendationOutcome === "scope_exhausted";
          const acceptedFinishRequest = Boolean(agentResult.finishRequested) &&
            (
              agentResult.finishRequested?.reason !== "scope_exhausted" ||
              verifiedScopeExhausted
            );
          if (
            agentResult.searchCallsSucceeded > 0 &&
            agentResult.inventory.unseen < questionCount * 2
          ) {
            const notice = await appendPolicyTransitionNotice({
              change: `Low inventory: ${agentResult.inventory.unseen} unseen and ${agentResult.inventory.needsRetry} eligible retry questions remain in the searched scope.`,
              noticeId: `low_inventory_${questionCount * 2}`,
              sessionId,
              supabase,
              userId: auth.user.id,
            });
            if (notice) send("policy_notice", notice);
          }

          const shouldComplete = acceptedFinishRequest ||
            (completedRoundCount > 0 && sourceAccessLost) ||
            (completedRoundCount > 0 && verifiedScopeExhausted);
          if (shouldComplete) {
            const trigger = acceptedFinishRequest ? "agent" : "backend";
            const reason = (acceptedFinishRequest ? agentResult.finishRequested?.reason : null) ??
              (sourceAccessLost ? "source_access_lost" : "scope_exhausted");
            const endNotice = await appendPolicyTransitionNotice({
              change: `Practice is ending: ${reason}. The main thread will now generate the final report.`,
              noticeId: `practice_ending_${reason}`,
              sessionId,
              supabase,
              userId: auth.user.id,
            });
            if (endNotice) send("policy_notice", endNotice);
            send("practice_ending", {
              inventory: agentResult.inventory,
              reason,
              trigger,
            });
            const completion = await completePracticeSession({
              cachePrefixVersion,
              courseFrameworkSnapshot,
              goal,
              inventory: agentResult.inventory,
              onDelta: (text) => send("practice_summary_delta", { text }),
              profile,
              reason,
              reportFocus: acceptedFinishRequest
                ? agentResult.finishRequested?.reportFocus
                : undefined,
              sessionId,
              sessionPlan,
              sessionThreadMessages,
              supabase,
              trigger,
              userId: auth.user.id,
            });
            send("practice_completed", completion);
            return;
          }

          if (!agentResult.recommendations.length) {
            const failure = recommendationFailure(agentResult.recommendationOutcome);
            send("error", {
              code: failure.code,
              error: failure.error,
              trace,
            });
            return;
          }

          const response: PracticeRecommendResponse = {
            llmUsage: agentResult.llmUsage,
            maxToolCalls: agentResult.maxToolCalls,
            mode: "ai",
            providerLabel: agentResult.providerLabel,
            recommendations: agentResult.recommendations,
            roundContract: agentResult.roundContract,
            roundGoal: agentResult.roundGoal,
            sessionMemory: agentResult.sessionMemory,
            sessionId,
            sessionPlan,
            sessionState: agentResult.sessionState,
            tagContext: agentResult.tagContext,
            trace,
          };

          response.roundId = await persistRecommendationRound({
            courseFrameworkSnapshot,
            llmUsage: agentResult.llmUsage,
            recommendations: agentResult.recommendations,
            response: { ...response, currentTaskSuffix: agentResult.currentTaskSuffix },
            sessionId,
            supabase,
            trace,
            userId: auth.user.id,
          });

          send("result", response);
        } catch (error) {
          const failure = logPracticeProviderFailure({
            error,
            operation: "practice_recommendation",
          });
          send("error", {
            code: failure.code,
            correlationId: failure.correlationId,
            error: failure.message,
            trace,
          });
        } finally {
          await releasePracticeAiOperationLease({
            leaseToken: operationLease.leaseToken,
            operation: "recommend",
            supabase,
          });
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "Content-Type": "text/event-stream; charset=utf-8",
      },
    });
  }

  try {
    const profile = await loadPracticeAIProfile({
      requestId: `recommend:${sessionId}`,
    });
    const agentResult = await runPracticeRecommendationAgent({
      cachePrefixVersion,
      completedQuestionIds: effectiveCompletedQuestionIds,
      completedRoundCount,
      courseFrameworkSnapshot,
      goal,
      longTermMemory: lockedLongTermMemory,
      outlineUserNotes,
      profile,
      questionCount,
      sessionId,
      sessionPlan,
      sessionThreadMessages,
      supabase,
      tagContext,
      trace,
      userNextRoundNote,
    });
    const verifiedScopeExhausted =
      agentResult.recommendationOutcome === "scope_exhausted";
    const acceptedFinishRequest = Boolean(agentResult.finishRequested) &&
      (
        agentResult.finishRequested?.reason !== "scope_exhausted" ||
        verifiedScopeExhausted
      );
    if (
      agentResult.searchCallsSucceeded > 0 &&
      agentResult.inventory.unseen < questionCount * 2
    ) {
      await appendPolicyTransitionNotice({
        change: `Low inventory: ${agentResult.inventory.unseen} unseen and ${agentResult.inventory.needsRetry} eligible retry questions remain in the searched scope.`,
        noticeId: `low_inventory_${questionCount * 2}`,
        sessionId,
        supabase,
        userId: auth.user.id,
      });
    }

    const shouldComplete = acceptedFinishRequest ||
      (completedRoundCount > 0 && sourceAccessLost) ||
      (completedRoundCount > 0 && verifiedScopeExhausted);
    if (shouldComplete) {
      const profileForCompletion = profile;
      const completionReason =
        (acceptedFinishRequest ? agentResult.finishRequested?.reason : null) ??
        (sourceAccessLost ? "source_access_lost" : "scope_exhausted");
      await appendPolicyTransitionNotice({
        change: `Practice is ending: ${completionReason}. The main thread will now generate the final report.`,
        noticeId: `practice_ending_${completionReason}`,
        sessionId,
        supabase,
        userId: auth.user.id,
      });
      const completion = await completePracticeSession({
        cachePrefixVersion,
        courseFrameworkSnapshot,
        goal,
        inventory: agentResult.inventory,
        profile: profileForCompletion,
        reason: completionReason,
        reportFocus: acceptedFinishRequest
          ? agentResult.finishRequested?.reportFocus
          : undefined,
        sessionId,
        sessionPlan,
        sessionThreadMessages,
        supabase,
        trigger: acceptedFinishRequest ? "agent" : "backend",
        userId: auth.user.id,
      });
      return NextResponse.json({ completion });
    }

    if (!agentResult.recommendations.length) {
      const failure = recommendationFailure(agentResult.recommendationOutcome);
      return NextResponse.json(
        {
          code: failure.code,
          error: failure.error,
          trace,
        },
        { status: failure.status },
      );
    }

    const response: PracticeRecommendResponse = {
      llmUsage: agentResult.llmUsage,
      maxToolCalls: agentResult.maxToolCalls,
      mode: "ai",
      providerLabel: agentResult.providerLabel,
      recommendations: agentResult.recommendations,
      roundContract: agentResult.roundContract,
      roundGoal: agentResult.roundGoal,
      sessionMemory: agentResult.sessionMemory,
      sessionId,
      sessionPlan,
      sessionState: agentResult.sessionState,
      tagContext: agentResult.tagContext,
      trace,
    };

    response.roundId = await persistRecommendationRound({
      courseFrameworkSnapshot,
      llmUsage: agentResult.llmUsage,
      recommendations: agentResult.recommendations,
      response: { ...response, currentTaskSuffix: agentResult.currentTaskSuffix },
      sessionId,
      supabase,
      trace,
      userId: auth.user.id,
    });

    return NextResponse.json(response);
  } catch (error) {
    const failure = logPracticeProviderFailure({
      error,
      operation: "practice_recommendation",
    });
    return NextResponse.json(
      {
        code: failure.code,
        correlationId: failure.correlationId,
        error: failure.message,
        trace,
      },
      { status: 500 },
    );
  } finally {
    await releasePracticeAiOperationLease({
      leaseToken: operationLease.leaseToken,
      operation: "recommend",
      supabase,
    });
  }
}
