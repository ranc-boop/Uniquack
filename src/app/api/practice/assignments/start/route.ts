import { NextResponse } from "next/server";

import {
  normalizeAssignmentPracticeStartError,
  startAssignmentPractice,
  type AssignmentPracticeStartErrorCode,
} from "@/lib/practice/assignment-linkage";
import { requirePracticeApiUser } from "@/lib/practice/auth";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type AssignmentPracticeStartRequest = {
  assignmentId?: string;
};

const ASSIGNMENT_PRACTICE_START_PUBLIC_ERROR = "Unable to start assignment practice.";

function assignmentPracticeStartErrorResponse({
  code,
  status,
}: {
  code: AssignmentPracticeStartErrorCode;
  status: number;
}) {
  return NextResponse.json(
    { error: ASSIGNMENT_PRACTICE_START_PUBLIC_ERROR, code },
    { status },
  );
}

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) {
    return assignmentPracticeStartErrorResponse({
      code: "PRACTICE_START_FAILED",
      status: 503,
    });
  }

  const supabase = await createClient();
  const auth = await requirePracticeApiUser(supabase);
  if (auth.response) {
    return assignmentPracticeStartErrorResponse({
      code: "AUTHENTICATION_REQUIRED",
      status: 401,
    });
  }

  let body: AssignmentPracticeStartRequest;
  try {
    const parsed = (await request.json()) as unknown;
    body = parsed && typeof parsed === "object"
      ? parsed as AssignmentPracticeStartRequest
      : {};
  } catch {
    return assignmentPracticeStartErrorResponse({ code: "INVALID_REQUEST", status: 400 });
  }
  const assignmentId = typeof body.assignmentId === "string"
    ? body.assignmentId.trim()
    : "";

  if (!assignmentId) {
    return assignmentPracticeStartErrorResponse({ code: "INVALID_REQUEST", status: 400 });
  }

  try {
    const payload = await startAssignmentPractice({
      assignmentId,
      supabase,
      userId: auth.user.id,
    });
    return NextResponse.json(payload);
  } catch (cause) {
    const startError = normalizeAssignmentPracticeStartError(cause);
    console.warn("assignment_practice_start_failed", {
      code: startError.code,
      stage: startError.stage,
    });
    return assignmentPracticeStartErrorResponse({ code: startError.code, status: 400 });
  }
}
