import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const require = createRequire(import.meta.url);
const jiti = require("jiti")(import.meta.url, {
  alias: { "@": resolve(root, "src") },
  cache: false,
});

const attemptState = jiti("../../src/lib/ai-providers/ai-pdf-attempt-state.ts");
const ledger = attemptState.createAIPdfProviderAttemptLedger();

assert.equal(attemptState.reserveAIPdfStructuralRepair(ledger, "single"), true);
assert.equal(attemptState.reserveAIPdfStructuralRepair(ledger, "single"), false);
assert.equal(attemptState.reserveAIPdfStructuralRepair(ledger, "chunk:1"), true);
assert.equal(attemptState.reserveAIPdfSourceRecovery(ledger, "single"), true);
assert.equal(attemptState.reserveAIPdfSourceRecovery(ledger, "single"), false);
assert.equal(attemptState.reserveAIPdfSourceRecovery(ledger, "chunk:1"), false);

attemptState.recordAIPdfProviderInference(ledger, {
  primaryReason: "FIRST_ATTEMPT",
  routeCandidateIndex: 0,
  scope: "single",
  sourceIncluded: true,
  transportAttempt: 1,
});
attemptState.recordAIPdfProviderInference(ledger, {
  primaryReason: "NETWORK_RETRY",
  routeCandidateIndex: 0,
  scope: "single",
  sourceIncluded: true,
  transportAttempt: 2,
});
attemptState.recordAIPdfProviderInference(ledger, {
  primaryReason: "STRUCTURAL_REPAIR_SOURCE_FREE",
  routeCandidateIndex: 0,
  scope: "single",
  sourceIncluded: false,
  transportAttempt: 1,
});

const restored = attemptState.parseAIPdfProviderAttemptLedger(
  JSON.parse(JSON.stringify(ledger)),
);
assert(restored);
assert.equal(restored.sourceRecoveryUsed, true);
assert.equal(restored.providerInferenceCount, 3);
assert.equal(restored.sourceInferenceCount, 2);
assert.equal(attemptState.reserveAIPdfSourceRecovery(restored, "reentered"), false);
assert.equal(attemptState.reserveAIPdfStructuralRepair(restored, "single"), false);

assert.equal(
  attemptState.aiPdfProviderRetryReason("provider_busy"),
  "PROVIDER_BUSY_RETRY",
);
assert.equal(
  attemptState.aiPdfProviderRetryReason("provider_rate_limited"),
  "RATE_LIMIT_RETRY",
);
assert.equal(
  attemptState.aiPdfProviderRetryReason("provider_network_error"),
  "NETWORK_RETRY",
);
assert.equal(
  attemptState.aiPdfProviderRetryReason("provider_timeout"),
  "TIMEOUT_RETRY",
);

attemptState.recordAIPdfCheckpointReplay(restored, "single");
assert.equal(restored.checkpointReplayCount, 1);
assert.equal(restored.providerInferenceCount, 3);
assert.deepEqual(restored.checkpointReplays, [{
  ordinal: 1,
  primaryReason: "CHECKPOINT_REPLAY_ZERO_INFERENCE",
  scope: "single",
}]);

console.log("AI_PARSING_PROVIDER_ATTEMPT_STATE=PASS");
