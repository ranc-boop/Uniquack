import { NextResponse } from "next/server";

import { requirePracticeApiUser } from "@/lib/practice/auth";
import {
  createPracticeSession,
  getPracticeSession,
  listPracticeSessions,
} from "@/lib/practice/persistence";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  }

  const supabase = await createClient();
  const auth = await requirePracticeApiUser(supabase);
  if (auth.response) {
    return auth.response;
  }

  try {
    const sessions = await listPracticeSessions({ supabase, userId: auth.user.id });
    const active = sessions[0]
      ? await getPracticeSession({ sessionId: sessions[0].id, supabase, userId: auth.user.id })
      : null;

    return NextResponse.json({ activeSession: active, sessions });
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
    title?: string;
  };

  try {
    const session = await createPracticeSession({
      courseFrameworkId: body.courseFrameworkId,
      goal: body.goal ?? "",
      supabase,
      title: body.title,
      userId: auth.user.id,
    });
    const detail = await getPracticeSession({ sessionId: session.id, supabase, userId: auth.user.id });

    return NextResponse.json({ session: detail ?? session });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
