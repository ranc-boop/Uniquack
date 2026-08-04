import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  estimatePDF50ProviderProofCostMicros,
  loadPDF50ProviderProofControl,
  pdf50ProviderProofEnvironment,
} from "./lib/pdf50-provider-proof-control.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFile(resolve(root, path), "utf8");
const control = await loadPDF50ProviderProofControl();
const environment = pdf50ProviderProofEnvironment(control);
const [runtime, route, harness, launcher, runbook] = await Promise.all([
  read("src/lib/ai-jobs/provider-test-control.ts"),
  read("src/app/api/internal/ai-jobs/run/route.ts"),
  read("scripts/pdf50-end-to-end-live-e2e.mjs"),
  read("scripts/run-pdf50-end-to-end-live-e2e.ps1"),
  read("docs/runbooks/local-ai-jobs-worker.md"),
]);

assert.equal(control.claimedJobs, 1);
assert.equal(control.workerRouteInvocations, 1);
assert.equal(control.providerInferenceAttempts, 1);
assert.equal(control.providerMaxOutputTokens, 4_096);
assert.equal(control.providerMaxNetworkRequests, 68);
assert.equal(control.approvedBudgetUsd, 1);
assert.equal(estimatePDF50ProviderProofCostMicros(control), 131_073);

assert(runtime.includes("pdf50-provider-proof-control.json"));
assert(runtime.includes("PDF50_PROVIDER_PROOF_CONTROL"));
assert(route.includes("providerTestLimits?.maxClaimedJobs ?? 2"));
assert(harness.includes("loadPDF50ProviderProofControl"));
assert(harness.includes("pdf50ProviderProofEnvironment"));
assert(harness.includes("proofControl.providerMaxOutputTokens"));
assert(launcher.includes("pdf50-provider-proof-control-report.mjs"));

for (const [name, value] of Object.entries(environment)) {
  assert.equal(typeof value, "string");
  assert(value.length > 0);
  assert(harness.includes(`"${name}"`));
}

for (const copiedAssignment of [
  /PDF50_PROVIDER_TEST_MAX_INFERENCE_ATTEMPTS\s*=\s*"\d+"/,
  /PDF50_PROVIDER_TEST_MAX_NETWORK_REQUESTS\s*=\s*"\d+"/,
  /PDF50_PROVIDER_TEST_MAX_OUTPUT_TOKENS\s*=\s*"\d+"/,
  /PDF50_TOTAL_PROVIDER_TEST_BUDGET_USD\s*=\s*"\d+"/,
]) {
  assert(!copiedAssignment.test(launcher));
}

assert(runbook.includes("pdf50-provider-proof-control.json"));
assert(runbook.includes("pdf50-provider-proof-control-report.mjs"));
assert(!runbook.includes("at most four inference attempts"));
assert(!runbook.includes("at most 8,192 output tokens"));
assert(!runbook.includes("at most 136 Provider HTTP requests"));
assert(!runbook.includes("USD 5 total budget"));

console.log(
  "PASS PDF50 canonical proof-control parity (server, route, launcher, harness, runbook)",
);
