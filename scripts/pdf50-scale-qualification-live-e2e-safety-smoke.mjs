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

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
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
    50: [50, 50, 0, 50, 150],
  },
);
assert.equal(scaleProviderControl.mode, "BOUNDED_SCALE_REAL_PROVIDER");
assert.equal(scaleProviderControl.claimedJobs, 1);
assert.equal(scaleProviderControl.workerRouteInvocations, 1);
assert.equal(scaleProviderControl.providerInferenceAttempts, 3);
assert.equal(scaleProviderControl.providerMaxOutputTokens, 4_096);
assert.equal(scaleProviderControl.providerMaxNetworkRequests, 68);
assert.equal(scaleProviderControl.maxInputBytesPerAttempt, 50_000);
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
  PDF50_PROVIDER_TEST_MAX_INPUT_BYTES: "50000",
  PDF50_PROVIDER_TEST_MAX_NETWORK_REQUESTS: "68",
  PDF50_PROVIDER_TEST_MAX_OUTPUT_TOKENS: "4096",
  PDF50_PROVIDER_TEST_MODE: "BOUNDED_SCALE_REAL_PROVIDER",
  PDF50_TOTAL_PROVIDER_TEST_BUDGET_USD: "2",
});
assert.equal(control.maxExpectedQueueDepth, 5);
assert.equal(control.releaseLimit, 4);
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
assert.deepEqual(stageCosts, { 4: 79668, 10: 179253, 50: 995850 });
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
assert(harness.includes("cleanupFailures === 0"));
assert(harness.includes("replayCounters.inference === 0"));
assert(
  harness.includes(
    "completedJob.provider_attempt_count === firstCounters.inference",
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
    source.includes("completedCounters.cleanupFailures === 0") &&
    source.includes(
      "drain.counters.inference >= config.stageControl.providerJobs",
    ) &&
    source.includes("config.stageControl.maxProviderAttempts") &&
    source.includes("providerTestEnvironment: scaleProviderEnvironment")
  );
}

assert(satisfiesScaleSafetyContract(harness));
const mutationCases = [
  harness.replace("beforeCount === 0 && afterCount === 0", "true"),
  harness.replace('result.data === "STALE_FENCE_REJECTED"', "true"),
  harness.replace("replayCounters.inference === 0", "replayCounters.inference >= 0"),
  harness.replace(
    "completedCounters.cleanupFailures === 0",
    "completedCounters.cleanupFailures >= 0",
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
];
assert(mutationCases.every((mutated) => !satisfiesScaleSafetyContract(mutated)));

console.log(
  "PASS PDF50 4/10/50 scale qualification safety and conservative budget contract",
);
