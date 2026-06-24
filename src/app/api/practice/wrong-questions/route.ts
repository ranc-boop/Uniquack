import { NextResponse } from "next/server";

import { requirePracticeApiUser } from "@/lib/practice/auth";
import { listActiveWrongQuestions } from "@/lib/practice/persistence";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

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
    const { searchParams } = new URL(request.url);
    const wrongQuestions = await listActiveWrongQuestions({
      sessionId: searchParams.get("sessionId"),
      supabase,
      userId: auth.user.id,
    });
    return NextResponse.json({ wrongQuestions });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
