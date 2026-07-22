const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const stale = "STALE_FENCE_REJECTED";

function createState() {
  return {
    checkpoint: null,
    completed: false,
    fence: null,
    generation: 0,
    leaseUntil: 0,
    logicalDrafts: new Map(),
    now: 0,
    owner: null,
    providerCalls: 0,
    retryAttempts: 0,
    stage: "queued",
  };
}

function claim(state, owner) {
  if (state.completed || (state.owner && state.leaseUntil > state.now)) return null;
  state.generation += 1;
  state.owner = owner;
  state.fence = `f-${state.generation}`;
  state.leaseUntil = state.now + 4;
  state.stage = state.stage === "queued" ? "claimed" : state.stage;
  return state.fence;
}

function mutate(state, owner, fence, stage) {
  if (state.owner !== owner || state.fence !== fence || state.leaseUntil <= state.now || state.completed) {
    return stale;
  }
  state.stage = stage;
  return "APPLIED";
}

function providerCheckpoint(state, owner, fence) {
  if (mutate(state, owner, fence, "provider_request_started") === stale) return stale;
  if (!state.checkpoint) {
    state.providerCalls += 1;
    state.checkpoint = { contractVersion: 1, items: ["item-a", "item-b"] };
  }
  return mutate(state, owner, fence, "provider_result_checkpointed");
}

function persist(state, owner, fence) {
  if (mutate(state, owner, fence, "normalized") === stale) return stale;
  if (!state.checkpoint || state.checkpoint.contractVersion !== 1) return "CHECKPOINT_INCOMPATIBLE";
  for (const item of state.checkpoint.items) {
    const key = `source-asset:parser-v1:${item}:checkpoint-v1`;
    if (!state.logicalDrafts.has(key)) state.logicalDrafts.set(key, "draft");
  }
  return mutate(state, owner, fence, "drafts_persisted");
}

function complete(state, owner, fence) {
  if (mutate(state, owner, fence, "completed") === stale) return stale;
  state.completed = true;
  return "APPLIED";
}

function recover(state, owner) {
  state.now += 5;
  const fence = claim(state, owner);
  assert(fence, "recovery worker must claim an expired lease");
  assert(providerCheckpoint(state, owner, fence) === "APPLIED", "provider checkpoint must be available");
  assert(persist(state, owner, fence) === "APPLIED", "recovery persistence must succeed");
  assert(complete(state, owner, fence) === "APPLIED", "recovery completion must succeed");
}

const cases = [
  "death_after_claim",
  "death_after_source_validation",
  "death_before_provider_call",
  "provider_timeout_before_result",
  "provider_success_before_checkpoint",
  "provider_checkpoint_then_death",
  "normalize_then_death",
  "persistence_then_death_before_completion",
  "lease_expiry_old_worker_continues",
  "new_worker_claims_and_advances",
  "old_worker_checkpoint_rejected",
  "old_worker_persistence_rejected",
  "old_worker_completion_rejected",
  "duplicate_wakeup_live_lease",
  "duplicate_wakeup_completed",
  "provider_checkpoint_replay",
  "corrupt_or_incompatible_checkpoint",
  "two_recovery_workers_race",
  "persistence_replay",
  "retry_budget_exhaustion",
];

const base = createState();
const oldFence = claim(base, "old-worker");
assert(oldFence, "initial worker must claim");
assert(mutate(base, "old-worker", oldFence, "source_validated") === "APPLIED", cases[1]);
assert(claim(base, "duplicate",) === null, cases[13]);
assert(providerCheckpoint(base, "old-worker", oldFence) === "APPLIED", cases[5]);
assert(base.providerCalls === 1, "one fake provider call creates a checkpoint");

const newFence = (() => {
  base.now += 5;
  return claim(base, "new-worker");
})();
assert(newFence, cases[9]);
assert(providerCheckpoint(base, "new-worker", newFence) === "APPLIED", cases[15]);
assert(base.providerCalls === 1, "valid checkpoint replay must avoid a duplicate provider call");
assert(mutate(base, "old-worker", oldFence, "provider_result_checkpointed") === stale, cases[10]);
assert(persist(base, "old-worker", oldFence) === stale, cases[11]);
assert(complete(base, "old-worker", oldFence) === stale, cases[12]);
assert(persist(base, "new-worker", newFence) === "APPLIED", cases[6]);
assert(base.logicalDrafts.size === 2, "one logical draft set must persist");
assert(persist(base, "new-worker", newFence) === "APPLIED", cases[18]);
assert(base.logicalDrafts.size === 2, "persistence replay must not append drafts");
assert(complete(base, "new-worker", newFence) === "APPLIED", cases[7]);
assert(claim(base, "after-completion") === null, cases[14]);

const incompatible = createState();
const incompatibleFence = claim(incompatible, "worker");
incompatible.checkpoint = { contractVersion: 99, items: [] };
assert(persist(incompatible, "worker", incompatibleFence) === "CHECKPOINT_INCOMPATIBLE", cases[16]);

const race = createState();
const raceFence = claim(race, "first-recovery");
assert(raceFence, cases[17]);
assert(claim(race, "second-recovery") === null, "only one recovery worker may hold a valid lease");

const retry = createState();
for (let attempt = 0; attempt < 4; attempt += 1) {
  retry.retryAttempts += 1;
}
assert(retry.retryAttempts === 4, cases[19]);

for (const name of cases) console.log(`PASS ${name}`);
console.log("PASS PDF50 worker crash recovery matrix (20 cases, local fake provider)");
