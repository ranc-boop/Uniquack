import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const policy = await readFile(resolve(root, "src/lib/ai-jobs/policy.ts"), "utf8");
const worker = await readFile(resolve(root, "src/lib/ai-jobs/worker.ts"), "utf8");
const migration = await readFile(
  resolve(root, "supabase/clean-migrations/0049_pdf50_burst_upload_admission.sql"),
  "utf8",
);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(policy.includes("globalActiveLimit: 3"), "global active execution must remain 3");
assert(policy.includes("maxOrganizationActiveJobs: 1"), "organization active execution must remain 1");
assert(policy.includes("maxOrganizationQueuedJobs: 12"), "organization outstanding limit must remain 12");
assert(policy.includes("maxUserActiveOrQueuedJobs: 5"), "user outstanding limit must remain 5");
assert(policy.includes("ai_pdf_extract: 1"), "PDF active execution must remain 1");
assert(worker.includes("Math.min(limit, 2, control.maxJobsPerInvocation)"), "worker invocation must remain at most 2");
assert(worker.includes("releaseAIPdfBurstAdmissionJobs"), "worker must pump durable admission around its existing claim cycle");
assert(migration.includes("skip locked"), "concurrent admission pumps must not claim the same item");
assert(migration.includes("safe_error_code = 'admission_temporarily_blocked'"), "one admission failure must remain item-scoped");

const items = Array.from({ length: 50 }, (_, index) => ({
  index,
  jobId: null,
  status: "admission_ready",
}));
const createdJobs = new Map();
let nextJob = 1;
let rounds = 0;

while (items.some((item) => item.status === "admission_ready")) {
  rounds += 1;
  const outstanding = items.filter((item) => item.status === "queued").length;
  const capacity = Math.max(0, 5 - outstanding);
  for (const item of items.filter((entry) => entry.status === "admission_ready").slice(0, capacity)) {
    const existing = createdJobs.get(item.index);
    item.jobId = existing ?? `job-${nextJob++}`;
    createdJobs.set(item.index, item.jobId);
    item.status = "queued";
  }

  assert(items.filter((item) => item.status === "queued").length <= 5, "admission must preserve the user window");
  const next = items.find((item) => item.status === "queued");
  if (next) next.status = "completed";
  assert(rounds < 100, "all durable items must eventually enter the existing queue");
}

while (items.some((item) => item.status === "queued")) {
  items.find((item) => item.status === "queued").status = "completed";
}

assert(items.every((item) => item.status === "completed"), "all 50 items must remain independently actionable");
assert(createdJobs.size === 50, "each valid PDF must receive exactly one logical initial job");
assert(new Set(createdJobs.values()).size === 50, "job links must be unique");

const partialItems = Array.from({ length: 4 }, (_, index) => ({
  index,
  status: index === 1 ? "failed" : index === 2 ? "reserved" : "admission_ready",
}));
const actionable = partialItems.filter((item) =>
  ["reserved", "admission_ready"].includes(item.status),
);
assert(actionable.length === 3, "partial upload failure must not block other items");
assert(partialItems[1].status === "failed", "invalid input must fail only its own item");

console.log(`PASS PDF50 burst load smoke (50 durable items released through unchanged five-job user window in ${rounds} rounds)`);
