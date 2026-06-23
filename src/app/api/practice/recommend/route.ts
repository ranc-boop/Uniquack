import { NextResponse } from "next/server";

import { requirePracticeApiUser } from "@/lib/practice/auth";
import { loadPracticeAIProfile } from "@/lib/practice/ai";
import { runPracticeRecommendationAgent } from "@/lib/practice/agent-loop";
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

  if (!goal) {
    return NextResponse.json({ error: "Practice goal is required." }, { status: 400 });
  }

  return {
    completedQuestionIds: Array.from(new Set(body.completedQuestionIds ?? [])),
    goal,
    questionCount: normalizeQuestionCount(body.questionCount),
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

  const { completedQuestionIds, goal, questionCount } = parsed;
  const trace: PracticeTraceEvent[] = [];

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
            completedQuestionIds,
            goal,
            onTrace: (event) => send("trace", event),
            profile,
            questionCount,
            sessionMemory: body.sessionMemory,
            supabase,
            tagContext: body.tagContext,
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
            maxToolCalls: agentResult.maxToolCalls,
            mode: "ai",
            providerLabel: agentResult.providerLabel,
            recommendations: agentResult.recommendations,
            roundGoal: agentResult.roundGoal,
            sessionMemory: agentResult.sessionMemory,
            tagContext: agentResult.tagContext,
            trace,
          };

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
      completedQuestionIds,
      goal,
      profile,
      questionCount,
      sessionMemory: body.sessionMemory,
      supabase,
      tagContext: body.tagContext,
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
      maxToolCalls: agentResult.maxToolCalls,
      mode: "ai",
      providerLabel: agentResult.providerLabel,
      recommendations: agentResult.recommendations,
      roundGoal: agentResult.roundGoal,
      sessionMemory: agentResult.sessionMemory,
      tagContext: agentResult.tagContext,
      trace,
    };

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
