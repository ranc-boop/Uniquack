const counterNames = [
  "cleanupFailures",
  "cleanup",
  "inference",
  "inferenceRequests",
  "network",
  "polls",
  "uploads",
];

export function classifyPDF50ProviderCounterContract(
  counters,
  {
    completed,
    maxInferenceAttempts = 4,
    maxNetworkRequests = 136,
    maxPollRequestsPerInference = 30,
  },
) {
  if (
    !counterNames.every(
      (name) => Number.isFinite(counters[name]) && counters[name] >= 0,
    )
  ) {
    return "worker_provider_counter_contract_failed";
  }

  if (counters.cleanupFailures > 0) return "provider_cleanup_failed";

  if (
    counters.inference > maxInferenceAttempts ||
    counters.inferenceRequests > counters.inference ||
    counters.network > maxNetworkRequests ||
    counters.uploads > counters.inference * 2 ||
    counters.cleanup > counters.inference ||
    counters.polls > counters.inference * maxPollRequestsPerInference ||
    counters.cleanup * 2 > counters.uploads ||
    counters.cleanup < counters.inferenceRequests ||
    counters.network !==
      counters.cleanup +
        counters.inferenceRequests +
        counters.polls +
        counters.uploads
  ) {
    return "worker_provider_counter_contract_failed";
  }

  if (
    completed &&
    (counters.inference < 1 ||
      counters.inferenceRequests < 1 ||
      counters.uploads < 2 ||
      counters.cleanup < 1)
  ) {
    return "worker_provider_counter_contract_failed";
  }

  return null;
}

export function formatPDF50ProviderCounters(counters) {
  return counterNames.map((name) => `${name}:${counters[name]}`).join(",");
}
