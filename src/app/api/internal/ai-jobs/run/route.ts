import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { runDurableAIProviderJobs } from "@/lib/ai-jobs/worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function hasValidInternalToken(request: Request) {
  const expected = process.env.AI_JOBS_INTERNAL_TOKEN;
  const received = request.headers.get("x-ai-jobs-internal-token");
  if (!expected || !received) return false;

  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(received);
  return (
    expectedBuffer.length === receivedBuffer.length &&
    timingSafeEqual(expectedBuffer, receivedBuffer)
  );
}

export async function POST(request: Request) {
  if (!hasValidInternalToken(request)) {
    return new NextResponse(null, { status: 404 });
  }

  try {
    const result = await runDurableAIProviderJobs({ limit: 2 });
    return NextResponse.json({
      accepted: true,
      claimed: result.claimed,
      completed: result.completed,
      failed: result.failed,
      retryWaiting: result.retryWaiting,
    });
  } catch {
    return NextResponse.json(
      { accepted: false, message: "The trusted AI worker could not run." },
      { status: 503 },
    );
  }
}
