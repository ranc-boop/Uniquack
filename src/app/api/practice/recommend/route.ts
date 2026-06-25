import { NextResponse } from "next/server";

import { requirePracticeApiUser } from "@/lib/practice/auth";
import { loadPracticeAIProfile } from "@/lib/practice/ai";
import { runPracticeRecommendationAgent } from "@/lib/practice/agent-loop";
import {
  getOrCreatePracticePreference,
  normalizePracticeTagContext,
  persistRecommendationRound,
} from "@/lib/practice/persistence";
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

  const { completedQuestionIds, goal, questionCount, sessionId, wrongQuestionIds } = parsed;
  const trace: PracticeTraceEvent[] = [];
  const sessionResult = await supabase
    .from("practice_sessions")
    .select("completed_question_ids,course_framework_snapshot,session_memory,tag_context")
    .eq("user_id", auth.user.id)
    .eq("id", sessionId)
    .maybeSingle();

  if (sessionResult.error) {
    return NextResponse.json({ error: sessionResult.error.message }, { status: 500 });
  }

  if (!sessionResult.data) {
    return NextResponse.json({ error: "Practice session not found." }, { status: 404 });
  }

  const sessionData = sessionResult.data;
  const preference = await getOrCreatePracticePreference({ supabase, userId: auth.user.id });
  const completedFromSession = Array.isArray(sessionData.completed_question_ids)
    ? sessionData.completed_question_ids.map(String)
    : [];
  const wrongSet = new Set(wrongQuestionIds);
  const effectiveCompletedQuestionIds = Array.from(
    new Set([...completedFromSession, ...completedQuestionIds]),
  ).filter((questionId) => !wrongSet.has(questionId));
  const baseMemory = String(sessionData.session_memory ?? body.sessionMemory ?? "");
  const longTermPreference = preference.long_term_preference.trim();
  const tagContext = normalizePracticeTagContext(sessionData.tag_context, goal);
  const courseFrameworkSnapshot = sessionData.course_framework_snapshot;

  if (wantsEventStream(request)) {
    const encoder = new TextEncoder();

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (event: string, data: unknown) => {
          controller.enqueue(encoder.encode(sseEncode(event, data)));
        };

        try {
          send("start", { goal, questionCount });
          const profile = await loadPracticeAIProfile(supabase);
          const agentResult = await runPracticeRecommendationAgent({
            completedQuestionIds: effectiveCompletedQuestionIds,
            courseFrameworkSnapshot,
            goal,
            longTermMemory: longTermPreference,
            onTrace: (event) => send("trace", event),
            profile,
            questionCount,
            sessionMemory: baseMemory,
            supabase,
            tagContext,
            trace,
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
            roundGoal: agentResult.roundGoal,
            sessionMemory: agentResult.sessionMemory,
            sessionId,
            tagContext: agentResult.tagContext,
            trace,
          };

          response.roundId = await persistRecommendationRound({
            courseFrameworkSnapshot,
            llmUsage: agentResult.llmUsage,
            recommendations: agentResult.recommendations,
            response,
            sessionId,
            supabase,
            trace,
            userId: auth.user.id,
          });

          send("result", response);
        } catch (error) {
          send("error", {
            error: error instanceof Error ? error.message : String(error),
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
    const profile = await loadPracticeAIProfile(supabase);
    const agentResult = await runPracticeRecommendationAgent({
      completedQuestionIds: effectiveCompletedQuestionIds,
            courseFrameworkSnapshot,
      goal,
      longTermMemory: longTermPreference,
      profile,
      questionCount,
      sessionMemory: baseMemory,
      supabase,
      tagContext,
      trace,
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
      roundGoal: agentResult.roundGoal,
      sessionMemory: agentResult.sessionMemory,
      sessionId,
      tagContext: agentResult.tagContext,
      trace,
    };

    response.roundId = await persistRecommendationRound({
      courseFrameworkSnapshot,
      llmUsage: agentResult.llmUsage,
      recommendations: agentResult.recommendations,
      response,
      sessionId,
      supabase,
      trace,
      userId: auth.user.id,
    });

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : String(error),
        trace,
      },
      { status: 500 },
    );
  }
}
