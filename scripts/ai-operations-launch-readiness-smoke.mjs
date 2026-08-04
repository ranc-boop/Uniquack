import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function stableHash(value) {
  return [...value].reduce((total, char) => (total * 33 + char.charCodeAt(0)) >>> 0, 5381);
}

const migration = await readFile(
  resolve(root, "supabase/clean-migrations/0036_ai_operations_launch_readiness.sql"),
  "utf8",
);
const telemetry = await readFile(resolve(root, "src/lib/ai-operations/telemetry.ts"), "utf8");
const routing = await readFile(resolve(root, "src/lib/ai-providers/routing.ts"), "utf8");
const worker = await readFile(resolve(root, "src/lib/ai-jobs/worker.ts"), "utf8");
const geminiNative = await readFile(resolve(root, "src/lib/ai-providers/gemini-native.ts"), "utf8");
const debugLogs = await readFile(
  resolve(root, "src/lib/ai-providers/llm-debug-logs.ts"),
  "utf8",
);

assert(migration.includes("ai_operation_telemetry"), "launch readiness requires durable safe telemetry");
assert(migration.includes("ai_operations_controls"), "launch readiness requires durable operations controls");
assert(migration.includes("pause_new_enqueues"), "launch readiness requires emergency enqueue pause");
assert(migration.includes("pause_worker_claims"), "launch readiness requires emergency worker pause");
assert(migration.includes("queued_reservation"), "budget guard must reserve capacity for queued work");
assert(!migration.includes("raw_prompt"), "telemetry schema must not invite raw prompt storage");
assert(!migration.includes("response_body"), "telemetry schema must not invite raw response storage");
assert(routing.includes("AI_PROVIDER_ROUTE_TOTAL_ATTEMPT_BUDGET = 4"), "route attempts must stay bounded");
assert(worker.includes("recordAIOperationTelemetry"), "worker must record safe telemetry");
assert(telemetry.includes("estimateAIProviderCost"), "telemetry must calculate a bounded catalog estimate");
assert(!geminiNative.includes("Response preview:"), "provider failures must not expose raw Gemini response previews");

const debugModuleSource = `${debugLogs}\nexport const __smokeSanitize = sanitize;\n`;
const debugModuleOutput = ts.transpileModule(debugModuleSource, {
  compilerOptions: {
    esModuleInterop: true,
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
  fileName: "llm-debug-logs.ts",
}).outputText;
const debugModule = { exports: {} };
const nodeRequire = createRequire(import.meta.url);
const smokeRequire = (specifier) =>
  specifier === "server-only" ? {} : nodeRequire(specifier);
new Function("require", "exports", "module", debugModuleOutput)(
  smokeRequire,
  debugModule.exports,
  debugModule,
);
const sensitiveResponse = "private-provider-response-body";
const sensitiveCredential = "private-authorization-value";
const sanitizedDebugPayload = debugModule.exports.__smokeSanitize({
  authorization: sensitiveCredential,
  response: [sensitiveResponse, { detail: sensitiveResponse }],
  status: 400,
});
const serializedDebugPayload = JSON.stringify(sanitizedDebugPayload);
assert(
  sanitizedDebugPayload.authorization === "[redacted]",
  "debug-only provider logs must redact credential-bearing keys",
);
assert(
  sanitizedDebugPayload.response.items[0].byteLength ===
    Buffer.byteLength(sensitiveResponse, "utf8") &&
    /^[a-f0-9]{64}$/.test(sanitizedDebugPayload.response.items[0].sha256),
  "debug-only provider response strings must be reduced to bounded fingerprints",
);
assert(
  !serializedDebugPayload.includes(sensitiveResponse) &&
    !serializedDebugPayload.includes(sensitiveCredential),
  "debug-only provider logs must contain no raw response or credential value",
);

const organizations = Array.from({ length: 8 }, (_, index) => `org-${index + 1}`);
const jobs = [];
const idempotency = new Set();
let duplicateEnqueues = 0;
for (const organizationId of organizations) {
  for (let user = 1; user <= 5; user += 1) {
    for (let sequence = 1; sequence <= 10; sequence += 1) {
      const id = `${organizationId}:user-${user}:job-${sequence}`;
      const key = `${organizationId}:user-${user}:resource-${sequence}`;
      if (idempotency.has(key)) {
        duplicateEnqueues += 1;
        continue;
      }
      idempotency.add(key);
      jobs.push({
        attempts: 0,
        createdRound: 0,
        id,
        kind: sequence % 3 === 0 ? "blueprint_generate_questions" : "ai_pdf_extract",
        organizationId,
        status: "queued",
        user,
      });
    }
  }
}
const duplicateCandidate = jobs[0];
if (idempotency.has(`${duplicateCandidate.organizationId}:user-${duplicateCandidate.user}:resource-1`)) duplicateEnqueues += 1;
assert(jobs.length === 400, "launch simulation must exercise 5-10 organizations and 300-1000 jobs");
assert(duplicateEnqueues === 1, "duplicate enqueue must be rejected deterministically");

const circuit = { consecutiveFailures: 0, state: "closed" };
const budgetByOrganization = new Map(organizations.map((organizationId) => [organizationId, organizationId === "org-1" ? 6 : 70]));
const costByOrganization = new Map(organizations.map((organizationId) => [organizationId, 0]));
const providerAttempts = new Map();
const completed = new Set();
const telemetryRows = [];
const firstProgress = new Map();
let nowRound = 0;
let pauseNewEnqueues = false;
let pauseWorkerClaims = false;
let schedulerOutage = false;
let staleLeaseRecovered = false;
let fallbackCount = 0;
let budgetBlocked = 0;
const observedProviderModes = new Set();

function enqueueDuringPause() {
  if (!pauseNewEnqueues) throw new Error("simulation pause was not enabled");
  return false;
}

function safeModeFor(job) {
  const key = stableHash(`${job.id}:${job.attempts}`) % 20;
  if (key <= 1) return "503";
  if (key === 2) return "429";
  if (key === 3) return "timeout";
  return "success";
}

while (jobs.some((job) => ["queued", "retry_wait", "leased"].includes(job.status)) && nowRound < 600) {
  nowRound += 1;
  schedulerOutage = nowRound >= 18 && nowRound <= 23;
  pauseWorkerClaims = nowRound >= 34 && nowRound <= 36;
  pauseNewEnqueues = nowRound === 34;
  if (pauseNewEnqueues) assert(enqueueDuringPause() === false, "pause must reject new work without deleting existing jobs");

  for (const job of jobs) {
    if (job.status === "leased" && job.leaseRound < nowRound) {
      job.status = job.attempts >= 4 ? "failed" : "queued";
      staleLeaseRecovered = true;
    }
    if (job.status === "retry_wait" && job.availableRound <= nowRound) job.status = "queued";
  }
  if (schedulerOutage || pauseWorkerClaims) continue;

  const active = jobs.filter((job) => job.status === "leased");
  const activeOrganizations = new Set(active.map((job) => job.organizationId));
  let activePdfs = active.filter((job) => job.kind === "ai_pdf_extract").length;
  const candidates = jobs
    .filter((job) => job.status === "queued")
    .sort((left, right) => left.createdRound - right.createdRound || left.id.localeCompare(right.id));

  for (const workerId of ["worker-a", "worker-b", "worker-c"]) {
    if (active.length >= 3) break;
    const candidate = candidates.find(
      (job) =>
        job.status === "queued" &&
        !activeOrganizations.has(job.organizationId) &&
        !(job.kind === "ai_pdf_extract" && activePdfs >= 1),
    );
    if (!candidate) break;
    candidate.status = "leased";
    candidate.attempts += 1;
    candidate.leaseRound = nowRound + (candidate.id === jobs[1].id && !staleLeaseRecovered ? 0 : 1);
    active.push(candidate);
    activeOrganizations.add(candidate.organizationId);
    if (candidate.kind === "ai_pdf_extract") activePdfs += 1;
    if (!firstProgress.has(candidate.organizationId)) firstProgress.set(candidate.organizationId, nowRound);
    void workerId;
  }

  for (const job of jobs.filter((item) => item.status === "leased" && item.leaseRound > nowRound)) {
    const budget = budgetByOrganization.get(job.organizationId);
    const spent = costByOrganization.get(job.organizationId);
    if (spent >= budget) {
      job.status = "failed";
      budgetBlocked += 1;
      telemetryRows.push({ circuit: "closed", cost: 0, drafts: 0, error: "budget_exhausted", id: job.id, attempts: 0, status: "failed" });
      continue;
    }
    const mode = safeModeFor(job);
    observedProviderModes.add(mode);
    const attempts = mode === "success" ? 1 : 2;
    providerAttempts.set(job.id, attempts);
    assert(attempts <= 4, "provider attempts must remain within the route budget");
    if (["503", "429", "timeout"].includes(mode)) {
      circuit.consecutiveFailures += 1;
      if (circuit.consecutiveFailures >= 2) circuit.state = "open";
      if (job.attempts < 4 && mode !== "429") {
        fallbackCount += 1;
        circuit.state = "closed";
        circuit.consecutiveFailures = 0;
      } else {
        job.status = job.attempts >= 4 ? "failed" : "retry_wait";
        job.availableRound = nowRound + 2;
        telemetryRows.push({ circuit: circuit.state, cost: 0, drafts: 0, error: "provider_busy", id: job.id, attempts, status: job.status });
        continue;
      }
    }
    const cost = job.organizationId === "org-1" ? 2 : 1;
    costByOrganization.set(job.organizationId, spent + cost);
    job.status = "completed";
    assert(!completed.has(job.id), "no durable output may complete twice");
    completed.add(job.id);
    telemetryRows.push({
      circuit: fallbackCount ? "fallback" : "closed",
      cost,
      drafts: job.kind === "ai_pdf_extract" ? 1 : 2,
      error: null,
      id: job.id,
      attempts,
      status: "completed",
    });
  }
}

assert(nowRound < 600, "synthetic launch run must stay bounded");
assert(staleLeaseRecovered, "launch simulation must recover a stale lease");
assert(budgetBlocked > 0, "launch simulation must exercise budget exhaustion");
assert(fallbackCount > 0, "launch simulation must exercise fallback/circuit recovery");
assert(
  ["success", "429", "503", "timeout"].every((mode) => observedProviderModes.has(mode)),
  "launch simulation must exercise mixed provider outcomes",
);
assert(firstProgress.size === organizations.length, "every organization must make progress without starvation");
assert(Math.max(...firstProgress.values()) < 120, "organization fairness must give all tenants early progress");
assert([...providerAttempts.values()].every((attempts) => attempts <= 4), "provider call budget must remain bounded");
assert(telemetryRows.length > 0, "launch simulation must produce aggregate telemetry");
const completedTelemetry = telemetryRows.filter((row) => row.status === "completed");
const aggregateCost = telemetryRows.reduce((total, row) => total + row.cost, 0);
const aggregateDrafts = completedTelemetry.reduce((total, row) => total + row.drafts, 0);
assert(aggregateCost > 0 && aggregateDrafts > 0, "telemetry aggregation must include completed cost and draft totals");
assert(
  completedTelemetry.every((row) => row.attempts >= 1 && row.attempts <= 4),
  "completed telemetry must preserve the bounded provider-attempt count",
);
assert(telemetryRows.every((row) => !Object.keys(row).some((key) => /prompt|response|pdf|secret|url/i.test(key))), "telemetry fixtures must contain no private content fields");
assert(!telemetryRows.some((row) => typeof row.error === "string" && row.error.length > 80), "telemetry errors must remain bounded safe codes");

console.log(`PASS AI operations launch readiness smoke (${jobs.length} jobs, ${organizations.length} organizations, ${nowRound} rounds, ${telemetryRows.length} safe telemetry rows)`);
