import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import {
  PDF50_PROVIDER_TEST_JOB_HEADER,
  parseTrustedAIProviderTestJobId,
  readTrustedAIProviderTestLimits,
} from "@/lib/ai-jobs/provider-test-control";
import { runDurableAIProviderJobs } from "@/lib/ai-jobs/worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 240;

const safeWorkerFailureReasons = new Set([
  "trusted_provider_test_claim_capacity_failed",
  "trusted_provider_test_claim_fence_missing",
  "trusted_provider_test_claim_read_failed",
  "trusted_provider_test_claim_update_failed",
  "trusted_provider_test_job_id_rejected",
  "trusted_provider_test_target_required",
]);

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
    const providerTestLimits = readTrustedAIProviderTestLimits();
    const requestedTestJobId = request.headers.get(
      PDF50_PROVIDER_TEST_JOB_HEADER,
    );
    if (!providerTestLimits && requestedTestJobId) {
      throw new Error("trusted_provider_test_job_id_without_test_mode");
    }
    const targetJobId = providerTestLimits
      ? parseTrustedAIProviderTestJobId(requestedTestJobId)
      : null;
    const result = await runDurableAIProviderJobs({
      limit: providerTestLimits?.maxClaimedJobs ?? 2,
      providerTestLimits,
      targetJobId,
    });
    return NextResponse.json({
      accepted: true,
      claimed: result.claimed,
      completed: result.completed,
      failed: result.failed,
      providerCleanupFailures: result.providerCleanupFailures,
      providerCleanupRequests: result.providerCleanupRequests,
      providerInferenceAttempts: result.providerInferenceAttempts,
      providerInferenceRequests: result.providerInferenceRequests,
      providerNetworkRequests: result.providerNetworkRequests,
      providerPollRequests: result.providerPollRequests,
      providerUploadRequests: result.providerUploadRequests,
      retryWaiting: result.retryWaiting,
    });
  } catch (error) {
    const reason =
      error instanceof Error && safeWorkerFailureReasons.has(error.message)
        ? error.message
        : "worker_execution_failed";
    return NextResponse.json(
      {
        accepted: false,
        message: "The trusted AI worker could not run.",
        reason,
      },
      { status: 503 },
    );
  }
}
