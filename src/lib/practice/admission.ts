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

export type PracticeAiLeasedOperation = "hint" | "recommend" | "review";

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

export async function requirePracticeAiOperationLease({
  operation,
  scopeId,
  supabase,
}: {
  operation: PracticeAiLeasedOperation;
  scopeId: string;
  supabase: SupabaseClient<Database>;
}): Promise<{ leaseToken: string } | { response: NextResponse }> {
  const { data, error } = await supabase.rpc("claim_practice_ai_inflight_lease", {
    p_operation: operation,
    p_scope_id: scopeId,
    p_ttl_seconds: 300,
  });
  const decision = data?.[0];

  if (error || !decision) {
    return {
      response: NextResponse.json(
        {
          code: "PRACTICE_ADMISSION_UNAVAILABLE",
          error: "Practice AI admission is temporarily unavailable. Please try again later.",
        },
        { status: 503 },
      ),
    };
  }

  if (!decision.acquired || !decision.lease_token) {
    const retryAfterSeconds = Math.max(1, Number(decision.retry_after_seconds) || 5);
    return {
      response: NextResponse.json(
        {
          code: "PRACTICE_OPERATION_IN_PROGRESS",
          error: "A Practice AI request of this type is already running.",
          retryAfterSeconds,
        },
        { headers: { "Retry-After": String(retryAfterSeconds) }, status: 409 },
      ),
    };
  }

  return { leaseToken: decision.lease_token };
}

export async function releasePracticeAiOperationLease({
  leaseToken,
  operation,
  supabase,
}: {
  leaseToken: string;
  operation: PracticeAiLeasedOperation;
  supabase: SupabaseClient<Database>;
}) {
  const { data, error } = await supabase.rpc("release_practice_ai_inflight_lease", {
    p_lease_token: leaseToken,
    p_operation: operation,
  });
  return !error && data === true;
}
