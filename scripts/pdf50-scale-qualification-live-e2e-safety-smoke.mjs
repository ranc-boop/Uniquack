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

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const [control, providerControl, harness, launcher, oneFileHarness, route, worker] =
  await Promise.all([
    loadPDF50ScaleQualificationControl(),
    loadPDF50ProviderProofControl(),
    readFile(resolve(root, "scripts/pdf50-scale-qualification-live-e2e.mjs"), "utf8"),
    readFile(
      resolve(root, "scripts/run-pdf50-scale-qualification-live-e2e.ps1"),
      "utf8",
    ),
    readFile(resolve(root, "scripts/pdf50-end-to-end-live-e2e.mjs"), "utf8"),
    readFile(resolve(root, "src/app/api/internal/ai-jobs/run/route.ts"), "utf8"),
    readFile(resolve(root, "src/lib/ai-jobs/worker.ts"), "utf8"),
  ]);

assert.equal(control.approvedBudgetUsd, 2);
assert.deepEqual(
  Object.fromEntries(
    Object.entries(control.stages).map(([stage, value]) => [
      stage,
      [value.files, value.completed, value.cancelled, value.providerAttempts],
    ]),
  ),
  {
    4: [4, 4, 0, 4],
    10: [10, 9, 1, 9],
    50: [50, 50, 0, 50],
  },
);
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
      inputMicrosPerMillion: providerControl.inputMicrosPerMillion,
      outputMicrosPerMillion: providerControl.outputMicrosPerMillion,
      outputTokensPerAttempt: providerControl.providerMaxOutputTokens,
      stage,
    }),
  ]),
);
assert.deepEqual(stageCosts, { 4: 46556, 10: 104751, 50: 581950 });
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
assert(harness.includes("completedJob.provider_attempt_count === 1"));
assert(harness.includes("controlled_read_after_write_delay"));
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
    source.includes("completedCounters.cleanupFailures === 0")
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
];
assert(mutationCases.every((mutated) => !satisfiesScaleSafetyContract(mutated)));

console.log(
  "PASS PDF50 4/10/50 scale qualification safety and conservative budget contract",
);
