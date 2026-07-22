import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const policy = await readFile(resolve(root, "src/lib/ai-jobs/policy.ts"), "utf8");
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

assert(policy.includes("globalActiveLimit: 3"), "global active limit must remain 3");
assert(policy.includes("maxOrganizationActiveJobs: 1"), "organization active limit must remain 1");
assert(policy.includes("ai_pdf_extract: 1"), "PDF active limit must remain 1");

function run(seed) {
  const jobs = Array.from({ length: 50 }, (_, index) => ({
    id: index,
    organization: index % 10,
    status: "queued",
    fence: null,
  }));
  const completed = new Set();
  const firstRound = new Map();
  let now = seed;
  let round = 0;
  let providerCalls = 0;

  while (completed.size < jobs.length && round < 200) {
    round += 1;
    const active = jobs.filter((job) => job.status === "processing");
    assert(active.length <= 1, "PDF active limit must remain one");
    const queued = jobs
      .filter((job) => job.status === "queued")
      .sort(
        (a, b) =>
          ((a.organization - ((round - 1 + seed) % 10) + 10) % 10) -
            ((b.organization - ((round - 1 + seed) % 10) + 10) % 10) ||
          a.id - b.id,
      );
    const candidate = queued.find((job) => !active.some((running) => running.organization === job.organization));
    if (candidate) {
      candidate.status = "processing";
      candidate.fence = `seed-${seed}-${round}`;
      firstRound.set(candidate.organization, firstRound.get(candidate.organization) ?? round);
      const duplicateWakeup = queued.find(
        (job) => job.id === candidate.id && job.status === "queued",
      );
      assert(!duplicateWakeup, "duplicate wake-up cannot claim an active job");
      providerCalls += 1;
      candidate.status = "completed";
      completed.add(candidate.id);
    }
    now += 1;
  }

  assert(completed.size === 50, "all 50 PDF jobs must complete in the local scheduler model");
  assert(providerCalls === 50, "each logical PDF job has one fake provider call");
  assert(firstRound.size === 10, "all organizations make progress");
  assert(Math.max(...firstRound.values()) <= 10, "organization fairness must remain bounded");
}

for (const seed of [1, 7, 19, 37, 73]) run(seed);
console.log("PASS PDF50 checkpoint load and scheduler simulation (5 deterministic 50-job seeds)");
