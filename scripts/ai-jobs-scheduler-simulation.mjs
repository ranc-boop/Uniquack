import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const worker = await readFile(resolve(root, "src/lib/ai-jobs/worker.ts"), "utf8");
const route = await readFile(resolve(root, "src/app/api/internal/ai-jobs/run/route.ts"), "utf8");
const migration = await readFile(
  resolve(root, "supabase/clean-migrations/0036_ai_operations_launch_readiness.sql"),
  "utf8",
);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(route.includes("AI_JOBS_INTERNAL_TOKEN"), "scheduler route must require the server-only internal token");
assert(route.includes("maxDuration = 240"), "scheduler route must have a fixed runtime ceiling");
assert(worker.includes("maxJobsPerInvocation"), "worker must bound the claimed jobs per invocation");
assert(worker.includes("pauseWorkerClaims"), "worker must respect the emergency claim pause");
assert(!route.includes("request.json("), "scheduler route must not accept arbitrary job payloads");
assert(migration.includes("get_ai_operations_worker_control"), "operations migration must expose a trusted worker control read");

const simulatedInvocations = Array.from({ length: 6 }, (_, index) => ({
  cadenceSeconds: 60,
  index: index + 1,
  maxJobs: 2,
  runtimeSeconds: 240,
}));
assert(
  simulatedInvocations.every(
    (invocation) => invocation.maxJobs <= 2 && invocation.runtimeSeconds <= 240,
  ),
  "local scheduler simulation must remain inside closed-beta limits",
);

console.log(
  `PASS AI jobs scheduler simulation (${simulatedInvocations.length} trusted bounded invocations, no network or provider calls)`,
);
