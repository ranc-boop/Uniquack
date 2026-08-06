import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  estimatePDF50ScaleStageCostMicros,
  loadPDF50ScaleQualificationControl,
  parsePriorConservativeMicros,
} from "./lib/pdf50-scale-qualification-control.mjs";
import { loadPDF50ProviderProofControl } from "./lib/pdf50-provider-proof-control.mjs";
import {
  estimatePDF50ScaleProviderAttemptCostMicros,
  loadPDF50ScaleProviderProofControl,
  pdf50ScaleProviderProofEnvironment,
} from "./lib/pdf50-scale-provider-proof-control.mjs";
import {
  numeric,
  proofControlEnvironment,
  validatedProviderTestEnvironment,
} from "./pdf50-end-to-end-live-e2e.mjs";
import {
  aggregateQualityObservatories,
  conservativeUsageCostMicros,
} from "./pdf50-scale-qualification-live-e2e.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
assert.equal(numeric(null), null);
assert.equal(numeric(undefined), null);
assert.equal(numeric(""), null);
assert.equal(numeric("12"), 12);
assert.equal(conservativeUsageCostMicros(100, 20), 18);

const attemptHistogram = {
  ANSWER_CONSISTENCY_REPAIR: 0,
  APPLICATION_VALIDATION_REPAIR: 0,
  BLANK_REQUIRED_FIELD_REPAIR: 0,
  CHECKPOINT_REPLAY_ZERO_INFERENCE: 1,
  FIRST_ATTEMPT: 1,
  NETWORK_RETRY: 0,
  PROVIDER_BUSY_RETRY: 0,
  RATE_LIMIT_RETRY: 0,
  SOURCE_BACKED_SEMANTIC_RECOVERY: 0,
  SOURCE_LINEAGE_REPAIR: 0,
  STRUCTURAL_SCHEMA_REPAIR: 0,
  TAXONOMY_REPAIR: 0,
  TIMEOUT_RETRY: 0,
  VISUAL_ASSOCIATION_REPAIR: 0,
};
const qualitySnapshot = {
  attemptHistogram,
  attemptReasonVersion: 3,
  attempts: [
    {
      outcome: "success",
      reason: "FIRST_ATTEMPT",
      usage: {
        cachedInputTokens: null,
        candidateOutputTokens: 20,
        inputTokens: 100,
        outputTokens: 20,
        thoughtTokens: null,
        totalTokens: 120,
      },
    },
  ],
  attemptsPerJob: 1,
  checkpointReplayCount: 1,
  contextAccountingVersion: 2,
  contextComposition: {
    componentBytes: {
      extractionInstructions: 10,
      fixedTransportOverhead: 5,
      previousResponse: 0,
      semanticRecoveryInstructions: 0,
      sourceInput: 100,
      structuralRepairInstructions: 0,
      structuredSchema: 20,
      systemInstructions: 5,
      taxonomyCandidates: 30,
    },
    providerReportedInputTokens: 100,
    providerReportedOutputTokens: 20,
    repeatedPreviousResponseBytes: 0,
    repeatedSourceBytes: 0,
    totalSerializedRequestBytes: 170,
  },
  contractEvidence: {
    candidateSubsetBytes: 30,
    candidateSubsetSha256:
      "fd11666a6ea207244dd5c60529aef812f73c8e82120f02b5348bb4db02970262",
    fullTaxonomySnapshotBytes: 40,
    fullTaxonomySnapshotSha256:
      "05c3179f0ce67f4828a66ddfdb7bd4c59752aceb390055cb26ba5192ddcafebe",
    parsingContractSha256: "a".repeat(64),
    promptContractVersion: "prompt-v1",
    repairPolicyVersion: "repair-v1",
    retrievalAlgorithmVersion: "retrieval-v1",
    schemaContractVersion: "schema-v1",
    taxonomySnapshotSha256:
      "05c3179f0ce67f4828a66ddfdb7bd4c59752aceb390055cb26ba5192ddcafebe",
  },
  firstAttemptSuccess: true,
  observatoryVersion: 4,
  parsingContractVersion: "ai-pdf-parsing/provider-neutral-v4",
};
const qualityBatch = (snapshot) => ({
  id: "batch-1",
  summary: { aiPdfImport: { qualityObservatory: snapshot } },
});
const aggregate = aggregateQualityObservatories({
  batches: [qualityBatch(qualitySnapshot)],
  completedBatchSet: new Set(["batch-1"]),
});
assert.equal(aggregate.providerInferenceAttemptCount, 1);
assert.equal(aggregate.checkpointReplays, 1);
assert.equal(aggregate.providerUsageComplete, true);
assert.equal(aggregate.cachedInputUsageComplete, false);
assert.equal(aggregate.thoughtUsageComplete, false);
assert.equal(aggregate.providerReportedInputTokens, 100);
assert.equal(aggregate.providerReportedOutputTokens, 20);
assert.equal(aggregate.attemptHistogram.FIRST_ATTEMPT, 1);
assert.throws(() =>
  aggregateQualityObservatories({
    batches: [
      qualityBatch({
        ...qualitySnapshot,
        attemptsPerJob: 0,
      }),
    ],
    completedBatchSet: new Set(["batch-1"]),
  }),
);
assert.throws(() =>
  aggregateQualityObservatories({
    batches: [
      qualityBatch({
        ...qualitySnapshot,
        contractEvidence: {
          ...qualitySnapshot.contractEvidence,
          taxonomySnapshotSha256: "b".repeat(64),
        },
      }),
    ],
    completedBatchSet: new Set(["batch-1"]),
  }),
);
const [
  control,
  providerControl,
  scaleProviderControl,
  harness,
  launcher,
  oneFileHarness,
  providerTestControl,
  route,
  worker,
] = await Promise.all([
    loadPDF50ScaleQualificationControl(),
    loadPDF50ProviderProofControl(),
    loadPDF50ScaleProviderProofControl(),
    readFile(resolve(root, "scripts/pdf50-scale-qualification-live-e2e.mjs"), "utf8"),
    readFile(
      resolve(root, "scripts/run-pdf50-scale-qualification-live-e2e.ps1"),
      "utf8",
    ),
    readFile(resolve(root, "scripts/pdf50-end-to-end-live-e2e.mjs"), "utf8"),
    readFile(resolve(root, "src/lib/ai-jobs/provider-test-control.ts"), "utf8"),
    readFile(resolve(root, "src/app/api/internal/ai-jobs/run/route.ts"), "utf8"),
    readFile(resolve(root, "src/lib/ai-jobs/worker.ts"), "utf8"),
  ]);

assert.equal(control.approvedBudgetUsd, 2);
assert.equal(providerControl.mode, "BOUNDED_ONE_JOB_REAL_PROVIDER");
assert.equal(providerControl.providerInferenceAttempts, 1);
assert.equal(providerControl.approvedBudgetUsd, 1);
assert.deepEqual(
  Object.fromEntries(
    Object.entries(control.stages).map(([stage, value]) => [
      stage,
      [
        value.files,
        value.completed,
        value.cancelled,
        value.providerJobs,
        value.maxProviderAttempts,
      ],
    ]),
  ),
  {
    4: [4, 4, 0, 4, 12],
    10: [10, 9, 1, 9, 27],
    50: [50, 50, 0, 50, 75],
  },
);
assert.equal(scaleProviderControl.mode, "BOUNDED_SCALE_REAL_PROVIDER");
assert.equal(scaleProviderControl.claimedJobs, 1);
assert.equal(scaleProviderControl.workerRouteInvocations, 1);
assert.equal(scaleProviderControl.providerInferenceAttempts, 3);
assert.equal(scaleProviderControl.providerMaxOutputTokens, 4_096);
assert.equal(scaleProviderControl.providerMaxNetworkRequests, 68);
assert.equal(scaleProviderControl.maxInputBytesPerAttempt, 200_000);
assert.equal(
  scaleProviderControl.maxInputBytesPerAttempt,
  scaleProviderControl.maxInputTokensPerAttempt * 4,
  "the UTF-8 transport-byte guard must remain distinct from the token-cost ceiling",
);
assert.equal(scaleProviderControl.approvedBudgetUsd, 2);
assert.equal(
  control.conservativeInputTokensPerProviderAttempt,
  scaleProviderControl.maxInputTokensPerAttempt,
);
assert.equal(
  scaleProviderControl.inputMicrosPerMillion,
  providerControl.inputMicrosPerMillion,
);
assert.equal(
  scaleProviderControl.outputMicrosPerMillion,
  providerControl.outputMicrosPerMillion,
);
assert.equal(
  estimatePDF50ScaleProviderAttemptCostMicros(scaleProviderControl),
  6_639,
);
assert.deepEqual(pdf50ScaleProviderProofEnvironment(scaleProviderControl), {
  AI_JOBS_LOCAL_MAX_INVOCATIONS: "1",
  PDF50_PROVIDER_TEST_MAX_INFERENCE_ATTEMPTS: "3",
  PDF50_PROVIDER_TEST_MAX_INPUT_BYTES: "200000",
  PDF50_PROVIDER_TEST_MAX_NETWORK_REQUESTS: "68",
  PDF50_PROVIDER_TEST_MAX_OUTPUT_TOKENS: "4096",
  PDF50_PROVIDER_TEST_MODE: "BOUNDED_SCALE_REAL_PROVIDER",
  PDF50_TOTAL_PROVIDER_TEST_BUDGET_USD: "2",
});
const scaleProofEnvironment =
  pdf50ScaleProviderProofEnvironment(scaleProviderControl);
assert.deepEqual(
  validatedProviderTestEnvironment(proofControlEnvironment),
  proofControlEnvironment,
);
assert.deepEqual(
  validatedProviderTestEnvironment(scaleProofEnvironment),
  scaleProofEnvironment,
);
assert.throws(
  () =>
    validatedProviderTestEnvironment({
      ...scaleProofEnvironment,
      PDF50_PROVIDER_TEST_UNAPPROVED: "1",
    }),
  /worker_evidence_failed/,
);
assert.equal(control.maxExpectedQueueDepth, 5);
assert.equal(control.releaseLimit, 4);
assert.equal(control.stages[50].maxProviderAttempts, 50 + 25);
assert.equal(parsePriorConservativeMicros("0"), 0);
assert.equal(parsePriorConservativeMicros("733257"), 733257);
for (const value of ["", "-1", "01", "1.5", "200000000"]) {
  assert.throws(() => parsePriorConservativeMicros(value));
}

const stageCosts = Object.fromEntries(
  ["4", "10", "50"].map((stage) => [
    stage,
    estimatePDF50ScaleStageCostMicros({
      control,
      inputMicrosPerMillion: scaleProviderControl.inputMicrosPerMillion,
      outputMicrosPerMillion: scaleProviderControl.outputMicrosPerMillion,
      outputTokensPerAttempt: scaleProviderControl.providerMaxOutputTokens,
      stage,
    }),
  ]),
);
assert.deepEqual(stageCosts, { 4: 79668, 10: 179253, 50: 497925 });
assert(
  Object.values(stageCosts).reduce((total, value) => total + value, 0) <
    control.approvedBudgetUsd * 1_000_000,
);

for (const source of [harness, launcher]) {
  assert(!source.includes("dotenv"));
  assert(!source.includes(".env.local"));
  assert(!source.includes("TEST_TEACHER_USERNAME"));
  assert(!source.includes("TEST_TEACHER_PASSWORD"));
}
assert(harness.includes("AI_JOBS_LOCAL_TARGET_JOB_ID"));
assert(harness.includes("AI_JOBS_LOCAL_PROVIDER_TEST_INTERRUPTION"));
assert(harness.includes('const providerInterruption = "after_provider_checkpoint"'));
assert(harness.includes('p_stage: "normalized"'));
assert(harness.includes('result.data === "STALE_FENCE_REJECTED"'));
assert(harness.includes("Choose no more than 50 PDFs at once."));
assert(harness.includes("beforeCount === 0 && afterCount === 0"));
assert(harness.includes("release_ai_pdf_burst_admission_jobs"));
assert(harness.includes("p_burst_id: burstId"));
assert(harness.includes("cleanupScaleFixture"));
assert(harness.includes("finally"));
assert(harness.includes("SYNTHETIC_RESIDUE_COUNT"));
assert(harness.includes("PROCESS_ENVIRONMENT_CLEARED"));
assert(harness.includes("reviewItems.length === stageControl.completed"));
assert(harness.includes('item.status === "pending_review"'));
assert(harness.includes("bankQuestionCount === 0 && assignmentCount === 0"));
assert(harness.includes("verifyCrossOrganizationIsolation"));
assert(harness.includes("verifyTeacherUI"));
assert(harness.includes("page.reload"));
assert(harness.includes("newPage"));
assert(harness.includes("actualCostMicros"));
assert(harness.includes("usageUnknown"));
assert(harness.includes("provider_budget_exceeded"));
assert(harness.includes("let providerWorkStarted = false"));
assert(harness.includes("providerWorkStarted = true"));
assert(
  harness.includes(
    "const consumedStageCost = providerWorkStarted ? stageCost : 0",
  ),
);
assert(harness.includes("RUN_CONSERVATIVE_CEILING_CONSUMED_MICROS"));
assert(harness.includes("cleanupFailures === 0"));
assert(harness.includes("replayCounters.inference === 0"));
assert(harness.includes("retryableScaleProviderCodes.has"));
assert(
  harness.includes('expected: ["completed", "retry_wait", "failed"]'),
);
assert(harness.includes("await waitForExactJobAvailable"));
assert(
  harness.includes(
    "const before = await waitForExactJobAvailable({ jobId, service })",
  ) &&
    harness.includes('["queued", "retry_wait"].includes(job?.status)') &&
    harness.includes("Number.isFinite(availableAt)") &&
    harness.includes("availableAt <= Date.now()"),
);
assert(harness.includes('outcome: "unclaimed_exit"'));
assert(harness.includes("counters.inputBytesMax <="));
assert(harness.includes("PROVIDER_INPUT_BYTES_MAX="));
assert(harness.includes('label: "checkpoint_attempt"'));
assert(
  harness.includes(
    'retryJob.checkpoint_stage === "provider_result_checkpointed"',
  ),
);
assert(
  harness.includes(
    "completedJob.provider_attempt_count === interruptedJobProviderAttempts",
  ),
);
assert(harness.includes("providerTestEnvironment: scaleProviderEnvironment"));
assert(
  harness.includes(
    "drain.counters.inference >= config.stageControl.providerJobs",
  ),
);
assert(harness.includes("config.stageControl.maxProviderAttempts"));
assert(
  !harness.includes(
    "drain.counters.inference === config.stageControl.providerAttempts",
  ),
);
assert(harness.includes("controlled_read_after_write_delay"));
assert(harness.includes("waitForBurstItemStatus"));
assert(harness.includes("waitForTerminalBurst"));
assert(harness.includes("SAFE_TERMINAL_AGGREGATE"));
assert(harness.includes("processedJobIds.length < control.stages[stage].completed"));
assert(!harness.includes("processedJobIds.length < control.completed"));
assert(harness.includes('const burstCard = summary.locator("..")'));
assert(harness.includes('const details = burstCard.locator("details")'));
assert(!harness.includes('activePage.locator("details").first()'));
assert(harness.includes("SAFE_LOCAL_WORKER_FAILURE="));
assert(harness.includes("SAFE_JOB_STATE="));
assert(harness.includes('label: "unexpected_terminal"'));
assert(harness.includes("PARTIAL_PROVIDER_NETWORK_REQUESTS="));
assert(!harness.includes("console.log(output)"));
assert(harness.includes('getByRole("button", { name: "Cancel unstarted" })'));
assert(
  harness.includes(
    '"05c3179f0ce67f4828a66ddfdb7bd4c59752aceb390055cb26ba5192ddcafebe"',
  ),
);
assert(
  harness.includes(
    '"fd11666a6ea207244dd5c60529aef812f73c8e82120f02b5348bb4db02970262"',
  ),
);
assert(harness.includes("PROVIDER_USAGE_METADATA_COMPLETE="));
assert(harness.includes("USAGE_DERIVED_CONSERVATIVE_COST_MICROS="));
assert(harness.includes("row.provider_latency_ms ?? row.execution_latency_ms"));

assert(launcher.includes("Import-Clixml -LiteralPath $VaultPath"));
assert(launcher.includes("Set-ProcessValueFromSecureString"));
assert(launcher.includes('[ValidateSet("4", "10", "50")]'));
assert(launcher.includes("PDF50_SCALE_PRIOR_CONSERVATIVE_MICROS"));
assert(launcher.includes("DISPOSABLE_PDF50_SCALE_QUALIFICATION"));
assert(launcher.includes("DELETE_PDF50_SCALE_QUALIFICATION_FIXTURES"));
assert(launcher.includes("Remove-Item \"Env:NODE_ENV\""));
assert(!launcher.includes("ConvertFrom-SecureString -AsPlainText"));

assert(oneFileHarness.includes("const isDirectInvocation"));
assert(oneFileHarness.includes("export {"));
assert(
  oneFileHarness.includes(
    "providerTestEnvironment = proofControlEnvironment",
  ),
);
assert(oneFileHarness.includes("validatedProviderTestEnvironment"));
assert(providerTestControl.includes("pdf50-scale-provider-proof-control.json"));
assert(providerTestControl.includes("PDF50_SCALE_PROVIDER_PROOF_CONTROL"));
assert(providerTestControl.includes("PDF50_SCALE_PROVIDER_TEST_MODE"));
assert(route.includes("PDF50_PROVIDER_TEST_INTERRUPTION_HEADER"));
assert(route.includes("parseTrustedAIProviderTestInterruption"));
assert(worker.includes("TrustedProviderCheckpointInterruptionError"));
assert(worker.includes("checkpointAIProviderJobProviderResult"));
assert(
  worker.includes(
    "providerInputBytesMax: providerExecutionSummary.providerInputBytesMax",
  ),
);
assert(
  worker.indexOf("checkpointAIProviderJobProviderResult") <
    worker.indexOf("throw new TrustedProviderCheckpointInterruptionError()"),
);
assert(
  worker.includes("!(error instanceof TrustedProviderCheckpointInterruptionError)"),
);

function satisfiesScaleSafetyContract(source) {
  return (
    source.includes("beforeCount === 0 && afterCount === 0") &&
    source.includes('result.data === "STALE_FENCE_REJECTED"') &&
    source.includes("replayCounters.inference === 0") &&
    source.includes(
      "retryableScaleProviderCodes.has(outcomeJob.safe_error_code)",
    ) &&
    source.includes(
      'retryJob.checkpoint_stage === "provider_result_checkpointed"',
    ) &&
    source.includes(
      "completedJob.provider_attempt_count === interruptedJobProviderAttempts",
    ) &&
    source.includes(
      "remainingJobsAfterCurrent <=\n      maxProviderAttempts",
    ) &&
    source.includes('expected: ["completed", "retry_wait", "failed"]') &&
    source.includes("counters.inputBytesMax <=") &&
    source.includes(
      "counters.cleanupFailures === 0 &&\n      (!requireInference",
    ) &&
    source.includes(
      "drain.counters.inference >= config.stageControl.providerJobs",
    ) &&
    source.includes("config.stageControl.maxProviderAttempts") &&
    source.includes("providerTestEnvironment: scaleProviderEnvironment") &&
    source.includes(
      "const before = await waitForExactJobAvailable({ jobId, service })",
    ) &&
    source.includes('["queued", "retry_wait"].includes(job?.status)') &&
    source.includes("availableAt <= Date.now()")
  );
}

function satisfiesQualityEvidenceContract(source) {
  return (
    source.includes(
      "numeric(snapshot.attemptsPerJob) === records.length",
    ) &&
    source.includes(
      "quality.providerInferenceAttemptCount === drain.counters.inference",
    ) &&
    source.includes(
      "snapshot.firstAttemptSuccess === (records[0]?.outcome === \"success\")",
    ) &&
    source.includes(
      "numeric(histogram.CHECKPOINT_REPLAY_ZERO_INFERENCE) ===",
    ) &&
    source.includes("providerUsageComplete = false") &&
    source.includes(
      "telemetryProviderCalls !== drain.counters.inference",
    )
  );
}

assert(satisfiesScaleSafetyContract(harness));
assert(satisfiesQualityEvidenceContract(harness));
const mutationCases = [
  harness.replace("beforeCount === 0 && afterCount === 0", "true"),
  harness.replace('result.data === "STALE_FENCE_REJECTED"', "true"),
  harness.replace("replayCounters.inference === 0", "replayCounters.inference >= 0"),
  harness.replace(
    "retryableScaleProviderCodes.has(outcomeJob.safe_error_code)",
    "true",
  ),
  harness.replace(
    'retryJob.checkpoint_stage === "provider_result_checkpointed"',
    "true",
  ),
  harness.replace(
    "completedJob.provider_attempt_count === interruptedJobProviderAttempts",
    "true",
  ),
  harness.replace(
    "remainingJobsAfterCurrent <=\n      maxProviderAttempts",
    "remainingJobsAfterCurrent <=\n      Number.MAX_VALUE",
  ),
  harness.replace(
    'expected: ["completed", "retry_wait", "failed"]',
    'expected: ["completed"]',
  ),
  harness.replace(
    "counters.inputBytesMax <=",
    "counters.inputBytesMax >=",
  ),
  harness.replace(
    "counters.cleanupFailures === 0 &&\n      (!requireInference",
    "counters.cleanupFailures >= 0 &&\n      (!requireInference",
  ),
  harness.replace(
    "drain.counters.inference >= config.stageControl.providerJobs",
    "drain.counters.inference >= 0",
  ),
  harness.replace("config.stageControl.maxProviderAttempts", "Number.MAX_VALUE"),
  harness.replace(
    "providerTestEnvironment: scaleProviderEnvironment",
    "providerTestEnvironment: proofControlEnvironment",
  ),
  harness.replace(
    '["queued", "retry_wait"].includes(job?.status)',
    'job?.status === "retry_wait"',
  ),
  harness.replace(
    "const before = await waitForExactJobAvailable({ jobId, service })",
    "const before = await loadJob({ jobId, service })",
  ),
];
assert(mutationCases.every((mutated) => !satisfiesScaleSafetyContract(mutated)));

const qualityMutationCases = [
  harness.replace(
    "numeric(snapshot.attemptsPerJob) === records.length",
    "true",
  ),
  harness.replace(
    "quality.providerInferenceAttemptCount === drain.counters.inference",
    "true",
  ),
  harness.replace(
    'snapshot.firstAttemptSuccess === (records[0]?.outcome === "success")',
    "true",
  ),
  harness.replace(
    "numeric(histogram.CHECKPOINT_REPLAY_ZERO_INFERENCE) ===",
    "0 ===",
  ),
  harness.replace("providerUsageComplete = false", "providerUsageComplete = true"),
  harness.replace(
    "telemetryProviderCalls !== drain.counters.inference",
    "false",
  ),
];
assert(
  qualityMutationCases.every(
    (mutated) => !satisfiesQualityEvidenceContract(mutated),
  ),
);

console.log(
  "PASS PDF50 4/10/50 scale qualification safety and conservative budget contract",
);
