import { NextResponse } from "next/server";

import { requirePracticeApiUser } from "@/lib/practice/auth";
import { isPracticeFullCallLogEnabled, isPracticeStatsLogEnabled } from "@/lib/practice/context";
import {
  countPendingPreferenceJobs,
  getOrCreatePracticePreference,
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

  const [preference, pendingMergeCount] = await Promise.all([
    getOrCreatePracticePreference({ supabase, userId: auth.user.id }),
    countPendingPreferenceJobs({ supabase, userId: auth.user.id }),
  ]);

  return NextResponse.json({
    lastAgentUpdatedAt: preference.last_agent_updated_at,
    longTermPreference: preference.long_term_preference,
    pendingMergeCount,
    cacheStatsEnabled: isPracticeStatsLogEnabled(),
    fullCallLogsEnabled: isPracticeFullCallLogEnabled(),
  });
}

export async function PATCH(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  }

  const supabase = await createClient();
  const auth = await requirePracticeApiUser(supabase);
  if (auth.response) {
    return auth.response;
  }

  const body = (await request.json().catch(() => ({}))) as {
    longTermPreference?: string;
  };
  const longTermPreference = String(body.longTermPreference ?? "").trim();

  if (longTermPreference.length > 1000) {
    return NextResponse.json(
      { error: "Long-term preference must be 1000 characters or fewer." },
      { status: 400 },
    );
  }

  const { data, error } = await supabase
    .from("user_practice_preferences")
    .upsert(
      {
        long_term_preference: longTermPreference,
        user_id: auth.user.id,
      },
      { onConflict: "user_id" },
    )
    .select("long_term_preference,last_agent_updated_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const pendingMergeCount = await countPendingPreferenceJobs({ supabase, userId: auth.user.id });

  return NextResponse.json({
    lastAgentUpdatedAt: data.last_agent_updated_at,
    longTermPreference: data.long_term_preference,
    pendingMergeCount,
    cacheStatsEnabled: isPracticeStatsLogEnabled(),
    fullCallLogsEnabled: isPracticeFullCallLogEnabled(),
  });
}

export async function DELETE() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  }

  const supabase = await createClient();
  const auth = await requirePracticeApiUser(supabase);
  if (auth.response) {
    return auth.response;
  }

  const { data, error } = await supabase
    .from("user_practice_preferences")
    .upsert(
      {
        long_term_preference: "",
        user_id: auth.user.id,
      },
      { onConflict: "user_id" },
    )
    .select("long_term_preference,last_agent_updated_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const pendingMergeCount = await countPendingPreferenceJobs({ supabase, userId: auth.user.id });

  return NextResponse.json({
    lastAgentUpdatedAt: data.last_agent_updated_at,
    longTermPreference: data.long_term_preference,
    pendingMergeCount,
    cacheStatsEnabled: isPracticeStatsLogEnabled(),
    fullCallLogsEnabled: isPracticeFullCallLogEnabled(),
  });
}
