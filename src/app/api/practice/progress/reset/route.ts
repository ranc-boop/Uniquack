import { NextResponse } from "next/server";

import { requirePracticeApiUser } from "@/lib/practice/auth";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  }

  const supabase = await createClient();
  const auth = await requirePracticeApiUser(supabase);
  if (auth.response) return auth.response;

  const { data, error } = await supabase.rpc("reset_my_practice_progress");
  if (error || typeof data !== "string") {
    return NextResponse.json(
      { error: "Practice progress could not be reset. Please try again." },
      { status: 500 },
    );
  }

  return NextResponse.json({ resetAt: data });
}
