import { NextResponse } from "next/server";

import { requirePracticeApiUser } from "@/lib/practice/auth";
import {
  PRACTICE_INPUT_LIMITS,
  boundedPracticeText,
  practiceValidationResponse,
} from "@/lib/practice/request-validation";
import {
  createPracticeSession,
  getPracticeSession,
  listPracticeSessions,
} from "@/lib/practice/persistence";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const DEFAULT_SESSION_PAGE_SIZE = 25;
const MAX_SESSION_PAGE_SIZE = 50;

function boundedInteger(value: string | null, fallback: number, maximum: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed)
    ? Math.min(maximum, Math.max(0, parsed))
    : fallback;
}

export async function GET(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  }

  const supabase = await createClient();
  const auth = await requirePracticeApiUser(supabase);
  if (auth.response) {
    return auth.response;
  }

  try {
    const searchParams = new URL(request.url).searchParams;
    const limit = Math.max(
      1,
      boundedInteger(searchParams.get("limit"), DEFAULT_SESSION_PAGE_SIZE, MAX_SESSION_PAGE_SIZE),
    );
    const offset = boundedInteger(searchParams.get("offset"), 0, Number.MAX_SAFE_INTEGER);
    const sessionPage = await listPracticeSessions({
      limit: limit + 1,
      offset,
      supabase,
      userId: auth.user.id,
    });
    const hasMore = sessionPage.length > limit;
    const sessions = sessionPage.slice(0, limit);
    const includeActive = searchParams.get("includeActive") !== "0";
    const active = includeActive && offset === 0 && sessions[0]
      ? await getPracticeSession({
          sessionId: sessions[0].id,
          sessionSummary: sessions[0],
          supabase,
          userId: auth.user.id,
        })
      : null;

    return NextResponse.json({
      activeSession: active,
      pagination: {
        hasMore,
        nextOffset: offset + sessions.length,
      },
      sessions,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
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

  const body = (await request.json().catch(() => ({}))) as {
    courseFrameworkId?: string | null;
    goal?: string;
    sourceSelection?: {
      bankIds?: string[];
      includePublicCatalog?: boolean;
    };
    title?: string;
  };

  try {
    const goal = boundedPracticeText(body.goal, {
      field: "goal",
      maxLength: PRACTICE_INPUT_LIMITS.GOAL_CHARS,
    });
    const title = boundedPracticeText(body.title, {
      field: "title",
      maxLength: PRACTICE_INPUT_LIMITS.SESSION_TITLE_CHARS,
    });
    const session = await createPracticeSession({
      courseFrameworkId: body.courseFrameworkId,
      goal,
      sourceSelection: body.sourceSelection
        ? {
            bankIds: Array.isArray(body.sourceSelection.bankIds)
              ? body.sourceSelection.bankIds.map(String)
              : [],
            includePublicCatalog: body.sourceSelection.includePublicCatalog !== false,
          }
        : undefined,
      supabase,
      title,
      userId: auth.user.id,
    });

    return NextResponse.json({
      session: {
        ...session,
        rounds: [],
      },
    });
  } catch (error) {
    const validation = practiceValidationResponse(error);
    if (validation) {
      return NextResponse.json(validation.body, { status: validation.status });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
