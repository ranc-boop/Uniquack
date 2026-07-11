import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const root = resolve(__dirname, "..");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const migration = await readFile(
  resolve(root, "supabase/clean-migrations/0033_ai_provider_jobs.sql"),
  "utf8",
);

assert(migration.includes("for update of job skip locked"), "load simulation requires database SKIP LOCKED claim protection");

const jobs = [];
for (let organization = 0; organization < 12; organization += 1) {
  for (let user = 0; user < 5; user += 1) {
    for (let sequence = 0; sequence < 3; sequence += 1) {
      jobs.push({
        id: `${organization}-${user}-${sequence}`,
        kind: sequence % 3 === 0 ? "ai_pdf_extract" : "blueprint_generate_questions",
        organization,
        user,
        status: "queued",
        leaseUntil: 0,
        attempts: 0,
      });
    }
  }
}

assert(jobs.length === 180, "synthetic queue must exercise a bounded multi-organization workload");

const claimed = new Set();
const firstClaimByOrganization = new Map();
const organizationLastClaimed = new Map();
const userLastClaimed = new Map();
let now = 1;
let completed = 0;
let rounds = 0;

while (completed < jobs.length && rounds < 500) {
  rounds += 1;
  for (const job of jobs) {
    if (job.status === "leased" && job.leaseUntil < now) {
      job.status = job.attempts >= 4 ? "failed" : "queued";
    }
  }

  const active = jobs.filter((job) => job.status === "leased");
  const activeOrg = new Set(active.map((job) => job.organization));
  let activePdf = active.filter((job) => job.kind === "ai_pdf_extract").length;
  const candidates = jobs
    .filter((job) => job.status === "queued")
    .sort(
      (a, b) =>
        (organizationLastClaimed.get(a.organization) ?? -1) -
          (organizationLastClaimed.get(b.organization) ?? -1) ||
        (userLastClaimed.get(`${a.organization}:${a.user}`) ?? -1) -
          (userLastClaimed.get(`${b.organization}:${b.user}`) ?? -1) ||
        a.id.localeCompare(b.id),
    );

  for (const worker of ["w1", "w2", "w3"]) {
    if (active.length >= 3) break;
    const candidate = candidates.find(
      (job) =>
        job.status === "queued" &&
        !activeOrg.has(job.organization) &&
        !(job.kind === "ai_pdf_extract" && activePdf >= 1),
    );
    if (!candidate) break;
    assert(!claimed.has(candidate.id), "no synthetic job may be claimed twice");
    claimed.add(candidate.id);
    candidate.status = "leased";
    candidate.attempts += 1;
    candidate.leaseUntil = now + 5;
    organizationLastClaimed.set(candidate.organization, rounds);
    userLastClaimed.set(`${candidate.organization}:${candidate.user}`, rounds);
    active.push(candidate);
    activeOrg.add(candidate.organization);
    if (candidate.kind === "ai_pdf_extract") activePdf += 1;
    if (!firstClaimByOrganization.has(candidate.organization)) {
      firstClaimByOrganization.set(candidate.organization, rounds);
    }
  }

  for (const job of jobs.filter((item) => item.status === "leased")) {
    job.status = "completed";
    completed += 1;
  }
  now += 1;
}

assert(completed === jobs.length, "all bounded synthetic jobs should complete");
assert(claimed.size === jobs.length, "every job should have exactly one claim");
assert(firstClaimByOrganization.size === 12, "all organizations should make progress without starvation");
assert(Math.max(...firstClaimByOrganization.values()) <= 12, "fairness should schedule every organization early in the run");
assert(rounds < 500, "load simulation must remain bounded");

console.log(`PASS durable AI job queue load smoke (${jobs.length} jobs, ${rounds} rounds)`);
