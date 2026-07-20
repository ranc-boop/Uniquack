import { NextResponse } from "next/server";

import { callPracticeJsonModel, loadPracticeAIProfile } from "@/lib/practice/ai";
import { requirePracticeApiUser } from "@/lib/practice/auth";
import { logPracticeProviderFailure } from "@/lib/practice/provider-safety";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type SessionTitleResponse = {
  title?: string;
};

function cleanTitle(value: unknown) {
  if (typeof value !== "string") return "";
  return value
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
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

  const body = (await request.json().catch(() => ({}))) as { goal?: string };
  const goal = typeof body.goal === "string" ? body.goal.trim().slice(0, 500) : "";

  if (!goal) {
    return NextResponse.json({ error: "Goal is required." }, { status: 400 });
  }

  try {
    const profile = await loadPracticeAIProfile({
      requestId: `session-title:${auth.user.id}`,
    });
    const result = await callPracticeJsonModel<SessionTitleResponse>({
      debugContext: {
        operation: "practice_session_title",
        userId: auth.user.id,
      },
      messages: [
        {
          content:
            "You name O2I practice sessions. Return valid JSON only: {\"title\":\"...\"}. The title must be short, plain text, 3-7 words, and reflect the user's practice goal. No punctuation at the end.",
          role: "system",
        },
        {
          content: `Goal: ${goal}`,
          role: "user",
        },
      ],
      profile,
    });
    const title = cleanTitle(result.parsed.title) || cleanTitle(goal) || "New practice session";

    return NextResponse.json({ providerLabel: result.providerLabel, title });
  } catch (error) {
    const failure = logPracticeProviderFailure({
      error,
      operation: "practice_session_title",
    });
    return NextResponse.json(
      {
        code: failure.code,
        correlationId: failure.correlationId,
        error: failure.message,
      },
      { status: 500 },
    );
  }
}
