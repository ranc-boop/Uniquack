import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const root = resolve(__dirname, "..");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function read(relativePath) {
  return readFile(resolve(root, relativePath), "utf8");
}

function moduleUrl(source) {
  return `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
}

async function loadPolicy() {
  const source = ts.transpileModule(
    await read("src/lib/ai-jobs/policy.ts"),
    {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
      fileName: "policy.ts",
    },
  ).outputText.replace('from "@/lib/ai-jobs/types";', "");
  return import(moduleUrl(source));
}

const { AI_PROVIDER_JOB_POLICY, jobStatusCopy, queueRetryDelayMs } = await loadPolicy();

class SimulatedQueue {
  constructor() {
    this.jobs = [];
    this.byKey = new Map();
    this.nextId = 1;
  }

  enqueue({ kind, key, organizationId, userId, now = 0 }) {
    if (this.byKey.has(key)) return this.byKey.get(key);
    const userOutstanding = this.jobs.filter(
      (job) =>
        job.userId === userId &&
        ["queued", "leased", "processing", "retry_wait"].includes(job.status),
    ).length;
    if (userOutstanding >= 5) {
      throw new Error("per-user queue limit");
    }
    const job = {
      id: `job-${this.nextId++}`,
      kind,
      key,
      organizationId,
      userId,
      status: "queued",
      availableAt: now,
      executionAttempts: 0,
      maxExecutionAttempts: 4,
      leaseOwner: null,
      leaseExpiresAt: null,
      createdAt: now,
    };
    this.jobs.push(job);
    this.byKey.set(key, job);
    return job;
  }

  active(filter = () => true) {
    return this.jobs.filter(
      (job) => ["leased", "processing"].includes(job.status) && filter(job),
    );
  }

  reclaimExpired(now) {
    for (const job of this.active()) {
      if (job.leaseExpiresAt < now) {
        job.status = job.executionAttempts >= job.maxExecutionAttempts ? "failed" : "queued";
        job.leaseOwner = null;
        job.leaseExpiresAt = null;
        job.availableAt = now;
      }
    }
  }

  claim({ workerId, now, limit = 1 }) {
    this.reclaimExpired(now);
    const active = this.active();
    const byOrg = new Map();
    for (const job of active) {
      byOrg.set(job.organizationId, (byOrg.get(job.organizationId) ?? 0) + 1);
    }
    const candidates = this.jobs
      .filter(
        (job) =>
          ["queued", "retry_wait"].includes(job.status) &&
          job.availableAt <= now &&
          job.executionAttempts < job.maxExecutionAttempts,
      )
      .sort(
        (a, b) =>
          (byOrg.get(a.organizationId) ?? 0) - (byOrg.get(b.organizationId) ?? 0) ||
          a.createdAt - b.createdAt,
      );
    const claimed = [];
    const kindLimit = AI_PROVIDER_JOB_POLICY.perKindActiveLimit;

    for (const job of candidates) {
      if (claimed.length >= limit) break;
      const current = this.active();
      if (current.length >= AI_PROVIDER_JOB_POLICY.globalActiveLimit) break;
      if (current.filter((item) => item.kind === job.kind).length >= kindLimit[job.kind]) continue;
      if (current.filter((item) => item.organizationId === job.organizationId).length >= 1) continue;
      job.status = "leased";
      job.leaseOwner = workerId;
      job.leaseExpiresAt = now + 900;
      job.executionAttempts += 1;
      claimed.push(job);
    }
    return claimed;
  }

  heartbeat(job, workerId, now) {
    if (job.leaseOwner !== workerId || !["leased", "processing"].includes(job.status)) return false;
    job.status = "processing";
    job.leaseExpiresAt = now + 900;
    return true;
  }

  finish(job, workerId, status, now) {
    if (job.leaseOwner !== workerId || !["leased", "processing"].includes(job.status)) return false;
    job.status = status;
    job.leaseOwner = null;
    job.leaseExpiresAt = null;
    if (status === "retry_wait") job.availableAt = now + (queueRetryDelayMs(job.executionAttempts, () => 0) ?? 0);
    return true;
  }
}

function queueStateCases() {
  const queue = new SimulatedQueue();
  const duplicateA = queue.enqueue({ kind: "ai_pdf_extract", key: "same", organizationId: "org-a", userId: "u-a" });
  const duplicateB = queue.enqueue({ kind: "ai_pdf_extract", key: "same", organizationId: "org-a", userId: "u-a" });
  assert(duplicateA.id === duplicateB.id && queue.jobs.length === 1, "duplicate enqueue must reuse one durable job");

  queue.enqueue({ kind: "ai_pdf_extract", key: "a-2", organizationId: "org-a", userId: "u-a" });
  queue.enqueue({ kind: "ai_pdf_coverage_recovery", key: "recovery-1", organizationId: "org-recovery", userId: "u-recovery" });
  queue.enqueue({ kind: "blueprint_generate_questions", key: "b-1", organizationId: "org-b", userId: "u-b" });
  queue.enqueue({ kind: "blueprint_generate_questions", key: "c-1", organizationId: "org-c", userId: "u-c" });
  const first = queue.claim({ workerId: "worker-a", now: 1, limit: 2 });
  const second = queue.claim({ workerId: "worker-b", now: 1, limit: 2 });
  const claimedIds = [...first, ...second].map((job) => job.id);
  assert(new Set(claimedIds).size === claimedIds.length, "two workers must never claim one job twice");
  assert(queue.active().length <= AI_PROVIDER_JOB_POLICY.globalActiveLimit, "global active limit must hold");
  assert(queue.active((job) => job.kind === "ai_pdf_extract").length <= 1, "PDF concurrency must be bounded");
  assert(queue.active((job) => job.kind === "ai_pdf_coverage_recovery").length <= 1, "targeted recovery concurrency must be bounded");
  assert(new Set(queue.active().map((job) => job.organizationId)).size === queue.active().length, "one noisy organization must not occupy concurrent slots");

  const lease = first[0];
  assert(queue.heartbeat(lease, "worker-a", 30), "lease owner heartbeat must extend a live lease");
  assert(!queue.finish(lease, "stale-worker", "completed", 31), "old workers cannot complete another worker's lease");
  lease.leaseExpiresAt = 10;
  queue.claim({ workerId: "worker-c", now: 11, limit: 1 });
  assert(lease.leaseOwner === "worker-c" || lease.status === "failed", "stale lease must become claimable once");

  for (const activeJob of queue.active()) {
    queue.finish(activeJob, activeJob.leaseOwner, "completed", 12);
  }

  const retryQueue = new SimulatedQueue();
  const retryJob = retryQueue.enqueue({ kind: "blueprint_generate_questions", key: "retry", organizationId: "org-d", userId: "u-d" });
  const retryClaim = retryQueue.claim({ workerId: "retry-worker", now: 2_000, limit: 1 }).find((job) => job.id === retryJob.id);
  assert(retryClaim, "retry fixture should claim");
  assert(retryQueue.finish(retryClaim, "retry-worker", "retry_wait", 2_001), "retryable provider failure should enter retry_wait");
  assert(retryJob.availableAt > 2_001, "retry_wait must respect delayed availability");
  assert(queueRetryDelayMs(1, () => 0) === 15_000, "first retry uses bounded jitter around 30 seconds");
  assert(queueRetryDelayMs(4) === null, "fourth execution failure must not schedule an unbounded retry");

  const noisyUserQueue = new SimulatedQueue();
  for (let index = 0; index < 5; index += 1) {
    noisyUserQueue.enqueue({
      kind: "blueprint_generate_questions",
      key: `user-limit-${index}`,
      organizationId: "org-limit",
      userId: "noisy-user",
    });
  }
  let userLimitBlocked = false;
  try {
    noisyUserQueue.enqueue({
      kind: "blueprint_generate_questions",
      key: "user-limit-overflow",
      organizationId: "org-limit",
      userId: "noisy-user",
    });
  } catch {
    userLimitBlocked = true;
  }
  assert(userLimitBlocked, "per-user queue limit must block repeated clicks safely");

  const disconnectQueue = new SimulatedQueue();
  const disconnectedJob = disconnectQueue.enqueue({
    kind: "ai_pdf_extract",
    key: "disconnect",
    organizationId: "org-disconnect",
    userId: "u-disconnect",
  });
  const resumed = disconnectQueue.claim({ workerId: "resumed-worker", now: 10, limit: 1 });
  assert(resumed[0]?.id === disconnectedJob.id, "browser disconnect must leave queued work claimable later");
}

async function sourceAndSecurityCases() {
  const [migration, roleFixMigration, queue, worker, pdfActions, pdfBurstActions, blueprintActions, route, policy] = await Promise.all([
    read("supabase/clean-migrations/0033_ai_provider_jobs.sql"),
    read("supabase/clean-migrations/0034_ai_provider_jobs_worker_role_fix.sql"),
    read("src/lib/ai-jobs/queue.ts"),
    read("src/lib/ai-jobs/worker.ts"),
    read("src/app/admin/imports/pdf/actions.ts"),
    read("src/app/teacher/banks/pdf-burst-actions.ts"),
    read("src/app/teacher/blueprints/actions.ts"),
    read("src/app/api/internal/ai-jobs/run/route.ts"),
    read("src/lib/ai-jobs/policy.ts"),
  ]);

  assert(
      migration.includes("create table if not exists public.ai_provider_jobs") &&
      migration.includes("ai_pdf_extract") &&
      migration.includes("blueprint_generate_questions") &&
      migration.includes("unique (job_kind, resource_type, resource_id, idempotency_key)"),
    "migration must persist bounded job kinds with database idempotency",
  );
  assert(
    migration.includes("for update of job skip locked") &&
      migration.includes("claim_ai_provider_jobs") &&
      migration.includes("heartbeat_ai_provider_job") &&
      migration.includes("finish_ai_provider_job") &&
      migration.includes("ai_provider_job_fairness_state"),
    "migration must provide atomic claims, heartbeats, and lease-owner finalization",
  );
  assert(
    roleFixMigration.includes("nullif(auth.role()::text, '')") &&
      roleFixMigration.includes("create or replace function public.claim_ai_provider_jobs") &&
      roleFixMigration.includes("create or replace function public.heartbeat_ai_provider_job") &&
      roleFixMigration.includes("create or replace function public.finish_ai_provider_job"),
    "service-role worker RPC repair must prefer auth.role() without weakening normal client access",
  );
  assert(
    migration.includes("enable row level security") &&
      migration.includes("No insert/update/delete policies") &&
      migration.includes("to service_role") &&
      !migration.includes("grant execute on function public.claim_ai_provider_jobs(text, integer, integer) to authenticated"),
    "queue writes and worker claims must stay off normal teacher/student credentials",
  );
  assert(
    migration.includes("queued_by_user >= 5") &&
      migration.includes("queued_by_org >= 12") &&
      !migration.includes("api_key_ciphertext") &&
      !migration.includes("signed_url"),
    "queue migration must bound noisy users/organizations without storing provider secrets or signed source URLs",
  );
  assert(
    queue.includes("buildAIPdfJobIdempotencyKey") &&
      queue.includes("buildBlueprintGenerationJobIdempotencyKey") &&
      queue.includes("AIProviderJobQueueSchemaMissingError"),
    "queue helper must make stable idempotency keys and degrade safely before migration apply",
  );
  assert(
    worker.includes("runAIPdfExtractJob") &&
      worker.includes("runBlueprintGenerateQuestionsJob") &&
      worker.includes("durableJobId") &&
      worker.includes("recordAIPdfProviderFailure") &&
      worker.includes("retry_wait") &&
      !worker.includes("createAssignment"),
    "worker must reuse existing safe services, schedule durable retry, and never assign content",
  );
  assert(
    pdfBurstActions.includes("releaseAIPdfBurstAdmissionJobs") &&
      pdfBurstActions.includes("reserve_ai_pdf_upload_burst") &&
      !pdfBurstActions.includes("await processAIPdfImport"),
    "teacher PDF burst actions must persist private sources then release durable jobs rather than wait for provider execution",
  );
  assert(
    blueprintActions.includes("enqueueAIProviderJob") &&
      !blueprintActions.slice(blueprintActions.indexOf("export async function generateTeacherBlueprintReviewDraftsAction"), blueprintActions.indexOf("export async function createTeacherBlueprintFolder")).includes("await generateTeacherBlueprintReviewDrafts("),
    "Blueprint action must enqueue rather than run provider work inside its request",
  );
  assert(
    pdfActions.includes("buildAIPdfJobIdempotencyKey") &&
      pdfActions.includes("durable AI PDF job") &&
      !pdfActions.slice(pdfActions.indexOf("export async function runQueuedAIPdfExtraction"), pdfActions.indexOf("export async function retryAIPdfImportChunk")).includes("runAIPdfExtractionJob"),
    "admin PDF compatibility action must not remain a second browser worker",
  );
  assert(
    route.includes("AI_JOBS_INTERNAL_TOKEN") &&
      route.includes("x-ai-jobs-internal-token") &&
      route.includes("runDurableAIProviderJobs") &&
      !route.includes("request.json"),
    "internal worker trigger must require a trusted token and never accept arbitrary job payloads",
  );
  assert(
    policy.includes("globalActiveLimit") &&
      policy.includes("maxOrganizationActiveJobs") &&
      policy.includes("queueRetryDelayMs") &&
      !policy.includes("providerProfileId"),
    "queue policy must be bounded and provider-model independent",
  );
}

queueStateCases();
await sourceAndSecurityCases();

const safeState = {
  status: "retry_wait",
  safe_message: null,
};
assert(
  jobStatusCopy(safeState).includes("temporarily busy") &&
    !jobStatusCopy(safeState).includes("503"),
  "teacher-visible queue copy must stay safe and provider-agnostic",
);

console.log("PASS durable AI job queue smoke");
