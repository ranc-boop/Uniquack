import {
  estimatePDF50ProviderProofCostMicros,
  loadPDF50ProviderProofControl,
} from "./lib/pdf50-provider-proof-control.mjs";

const control = await loadPDF50ProviderProofControl();
const summary = Object.freeze({
  ...control,
  conservativeCostMicros: estimatePDF50ProviderProofCostMicros(control),
});

if (process.argv.includes("--json")) {
  console.log(JSON.stringify(summary));
} else {
  console.log(`PDF50_PROVIDER_PROOF_CONTROL=${summary.schema}`);
  console.log(`MODEL=${summary.model}`);
  console.log(`CLAIMED_JOBS=${summary.claimedJobs}`);
  console.log(`WORKER_ROUTE_INVOCATIONS=${summary.workerRouteInvocations}`);
  console.log(`PROVIDER_INFERENCE_ATTEMPTS=${summary.providerInferenceAttempts}`);
  console.log(`PROVIDER_MAX_OUTPUT_TOKENS=${summary.providerMaxOutputTokens}`);
  console.log(`PROVIDER_MAX_NETWORK_REQUESTS=${summary.providerMaxNetworkRequests}`);
  console.log(`APPROVED_BUDGET_USD=${summary.approvedBudgetUsd}`);
  console.log(`CONSERVATIVE_COST_MICROS=${summary.conservativeCostMicros}`);
}
