import { NextResponse } from "next/server";

import { requirePracticeApiUser } from "@/lib/practice/auth";
import { loadPracticeAIProfile } from "@/lib/practice/ai";
import { runPracticeRecommendationAgent } from "@/lib/practice/agent-loop";
import {
  CURRENT_PRACTICE_SESSION_SCHEMA_VERSION,
  getOrCreatePracticePreference,
  normalizePracticeTagContext,
  persistRecommendationRound,
} from "@/lib/practice/persistence";
import { logPracticeProviderFailure } from "@/lib/practice/provider-safety";
import { PRACTICE_SESSION_EXPIRED_MESSAGE } from "@/lib/practice/schema";
import type {
  PracticeRecommendRequest,
  PracticeRecommendResponse,
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
  userNextRoundNote: string;
  wrongQuestionIds: string[];
};

function normalizeQuestionCount(value: unknown) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return DEFAULT_QUESTION_COUNT;
  }

  return Math.min(MAX_QUESTION_COUNT, Math.max(1, Math.trunc(parsed)));
}

function parseRequestBody(body: PracticeRecommendRequest): RecommendationRequestContext | NextResponse {
  const goal = (body.goal ?? "").trim().slice(0, 500);
  const sessionId = (body.sessionId ?? "").trim();

  if (!goal) {
    return NextResponse.json({ error: "Practice goal is required." }, { status: 400 });
  }

  if (!sessionId) {
    return NextResponse.json({ error: "sessionId is required." }, { status: 400 });
  }

  return {
    completedQuestionIds: Array.from(new Set(body.completedQuestionIds ?? [])),
    goal,
    questionCount: normalizeQuestionCount(body.questionCount),
    sessionId,
    userNextRoundNote: String(body.userNextRoundNote ?? "").trim().slice(0, 1200),
    wrongQuestionIds: Array.from(new Set(body.wrongQuestionIds ?? [])),
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

  const body = (await request.json()) as PracticeRecommendRequest;
  const parsed = parseRequestBody(body);
  if (parsed instanceof NextResponse) {
    return parsed;
  }

  const { completedQuestionIds, goal, questionCount, sessionId, userNextRoundNote, wrongQuestionIds } = parsed;
  const trace: PracticeTraceEvent[] = [];
  const sessionResult = await supabase
    .from("practice_sessions")
    .select("cache_prefix_version,completed_question_ids,course_framework_snapshot,long_term_memory_snapshot,outline_user_notes,session_plan,session_thread_messages,tag_context")
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
  if (sessionData.cache_prefix_version !== CURRENT_PRACTICE_SESSION_SCHEMA_VERSION) {
    return NextResponse.json({ error: PRACTICE_SESSION_EXPIRED_MESSAGE }, { status: 410 });
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
  const sessionThreadMessages = sessionData.session_thread_messages ?? [];

  if (wantsEventStream(request)) {
    const encoder = new TextEncoder();

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (event: string, data: unknown) => {
          controller.enqueue(encoder.encode(sseEncode(event, data)));
        };

        try {
          send("start", { goal, questionCount });
          const profile = await loadPracticeAIProfile({
            requestId: `recommend:${sessionId}`,
          });
          const agentResult = await runPracticeRecommendationAgent({
            cachePrefixVersion,
            completedQuestionIds: effectiveCompletedQuestionIds,
            courseFrameworkSnapshot,
            goal,
            longTermMemory: lockedLongTermMemory,
            outlineUserNotes,
            onTrace: (event) => send("trace", event),
            profile,
            questionCount,
            sessionPlan,
            sessionThreadMessages,
            supabase,
            tagContext,
            trace,
            userNextRoundNote,
          });

          if (!agentResult.recommendations.length) {
            send("error", {
              error: "No published questions are available for this practice request.",
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
      courseFrameworkSnapshot,
      goal,
      longTermMemory: lockedLongTermMemory,
      outlineUserNotes,
      profile,
      questionCount,
      sessionPlan,
      sessionThreadMessages,
      supabase,
      tagContext,
      trace,
      userNextRoundNote,
    });

    if (!agentResult.recommendations.length) {
      return NextResponse.json(
        {
          error: "No published questions are available for this practice request.",
          trace,
        },
        { status: 404 },
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
  }
}
