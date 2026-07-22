const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const STALE = "STALE_FENCE_REJECTED";

class FencedJob {
  constructor() {
    this.completed = false;
    this.fence = null;
    this.generation = 0;
    this.owner = null;
    this.stage = "queued";
    this.leaseUntil = 0;
  }

  claim(owner, now) {
    if (this.completed || (this.owner && this.leaseUntil > now)) return null;
    this.generation += 1;
    this.owner = owner;
    this.fence = `fence-${this.generation}`;
    this.leaseUntil = now + 5;
    this.stage = this.stage === "queued" ? "claimed" : this.stage;
    return this.fence;
  }

  mutate(owner, fence, stage, now) {
    if (this.owner !== owner || this.fence !== fence || this.leaseUntil <= now || this.completed) {
      return STALE;
    }
    this.stage = stage;
    return "APPLIED";
  }

  finish(owner, fence, now) {
    const result = this.mutate(owner, fence, "completed", now);
    if (result === "APPLIED") this.completed = true;
    return result;
  }
}

const job = new FencedJob();
const firstFence = job.claim("worker-a", 0);
assert(firstFence, "first claim must receive an immutable fence");
assert(job.mutate("worker-a", firstFence, "source_validated", 1) === "APPLIED", "current worker validates source");
assert(job.claim("worker-b", 1) === null, "duplicate wake-up must join/no-op while a lease is live");

const secondFence = job.claim("worker-b", 6);
assert(secondFence && secondFence !== firstFence, "reclaimed lease must get a new fence generation");
assert(job.mutate("worker-b", secondFence, "provider_result_checkpointed", 6) === "APPLIED", "recovery worker advances the stage");
for (const stage of ["provider_result_checkpointed", "drafts_persisted", "completed"]) {
  assert(
    job.mutate("worker-a", firstFence, stage, 6) === STALE,
    `stale worker must not write ${stage}`,
  );
}
assert(job.mutate("worker-b", secondFence, "drafts_persisted", 7) === "APPLIED", "current worker persists drafts");
assert(job.finish("worker-b", secondFence, 7) === "APPLIED", "current worker completes once");
assert(job.claim("worker-c", 8) === null, "completed jobs must not be claimed again");

console.log("PASS PDF50 worker immutable lease fencing and stale rejection");
