import "server-only";

import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

export type PracticeAiOperation =
  | "hint"
  | "preference_merge"
  | "recommend"
  | "review"
  | "session_title";

export async function requirePracticeAiAdmission({
  operation,
  supabase,
}: {
  operation: PracticeAiOperation;
  supabase: SupabaseClient<Database>;
}) {
  const { data, error } = await supabase.rpc("claim_practice_ai_request", {
    p_operation: operation,
  });
  const decision = data?.[0];

  if (error || !decision) {
    return NextResponse.json(
      {
        code: "PRACTICE_ADMISSION_UNAVAILABLE",
        error: "Practice AI admission is temporarily unavailable. Please try again later.",
      },
      { status: 503 },
    );
  }

  if (!decision.allowed) {
    const retryAfterSeconds = Math.max(1, Number(decision.retry_after_seconds) || 60);
    return NextResponse.json(
      {
        code: "PRACTICE_RATE_LIMITED",
        error: "Too many Practice AI requests. Please wait before trying again.",
        retryAfterSeconds,
      },
      {
        headers: { "Retry-After": String(retryAfterSeconds) },
        status: 429,
      },
    );
  }

  return null;
}
