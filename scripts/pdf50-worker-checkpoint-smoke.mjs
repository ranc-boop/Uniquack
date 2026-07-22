import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => readFile(resolve(root, relativePath), "utf8");
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const [migration, worker, checkpoint, service, batchImport, policy] = await Promise.all([
  read("supabase/clean-migrations/0051_pdf50_worker_checkpoint_fencing.sql"),
  read("src/lib/ai-jobs/worker.ts"),
  read("src/lib/ai-jobs/checkpoint.ts"),
  read("src/lib/ai-pdf-import/service.ts"),
  read("src/lib/batch-import/service.ts"),
  read("src/lib/ai-jobs/policy.ts"),
]);

for (const required of [
  "execution_fence_token",
  "lease_generation",
  "checkpoint_stage",
  "checkpoint_version",
  "private.ai_provider_job_provider_result_checkpoints",
  "set_ai_provider_job_lease_fence",
  "heartbeat_ai_provider_job_fenced",
  "checkpoint_ai_provider_job_stage",
  "checkpoint_ai_provider_job_provider_result",
  "read_ai_provider_job_provider_result_checkpoint",
  "begin_ai_provider_job_pdf_processing_fenced",
  "persist_ai_provider_job_import_item_fenced",
  "finalize_ai_provider_job_import_batch_fenced",
  "finish_ai_provider_job_fenced",
  "STALE_FENCE_REJECTED",
  "revoke all on function public.finish_ai_provider_job",
]) {
  assert(migration.includes(required), `0051 is missing ${required}`);
}

assert(
  !/grant execute on function public\.(?:heartbeat_ai_provider_job_fenced|checkpoint_ai_provider_job_stage|checkpoint_ai_provider_job_provider_result|read_ai_provider_job_provider_result_checkpoint|begin_ai_provider_job_pdf_processing_fenced|persist_ai_provider_job_import_item_fenced|finalize_ai_provider_job_import_batch_fenced|finish_ai_provider_job_fenced)[\s\S]*?to authenticated/i.test(
    migration,
  ),
  "fenced worker RPCs must not be browser executable",
);
assert(
  migration.includes("grant all privileges on table private.ai_provider_job_provider_result_checkpoints to service_role") &&
    migration.includes("revoke all privileges on table private.ai_provider_job_provider_result_checkpoints from public, anon, authenticated"),
  "provider checkpoint payloads must be private/service-role-only",
);
assert(
  !migration.includes("createAssignment") &&
    !migration.includes("published_at") &&
    !migration.includes("api_key") &&
    !migration.includes("signed_url"),
  "0051 must not add assignment, publication, credential, or signed URL behavior",
);

assert(
  worker.includes("heartbeatAIProviderJobFence") &&
    worker.includes("checkpointAIProviderJobProviderResult") &&
    worker.includes("finishAIProviderJobFence") &&
    worker.includes("buildPdfPersistenceLineageKey") &&
    !worker.includes('rpc("finish_ai_provider_job"') &&
    !worker.includes('rpc("heartbeat_ai_provider_job"'),
  "worker must use only the fenced heartbeat and finish contract",
);
assert(
  checkpoint.includes("AIProviderJobFenceLostError") &&
    checkpoint.includes("STALE_FENCE_REJECTED") &&
    checkpoint.includes("read_ai_provider_job_provider_result_checkpoint"),
  "checkpoint client must reject stale fences and isolate protected reads",
);
assert(
  service.includes("providerResultCheckpoint") &&
    service.includes("onProviderResultCheckpoint") &&
    service.includes("onCheckpointStage") &&
    service.includes("parseAIPdfProviderResultCheckpoint"),
  "PDF service must support checkpoint reuse before persistence",
);
assert(
  batchImport.includes("persistenceLineageKey") &&
    batchImport.includes("persistence_lineage_key") &&
    batchImport.includes("persist_ai_provider_job_import_item_fenced") &&
    batchImport.includes("finalize_ai_provider_job_import_batch_fenced") &&
    batchImport.includes("ignoreDuplicates: true"),
  "draft persistence must carry a deterministic replay key and use the fence in its write transaction",
);
assert(
  policy.includes("globalActiveLimit: 3") &&
    policy.includes("maxOrganizationActiveJobs: 1") &&
    policy.includes("ai_pdf_extract: 1") &&
    policy.includes("maxUserActiveOrQueuedJobs: 5") &&
    policy.includes("maxOrganizationQueuedJobs: 12"),
  "PDF50 concurrency and admission limits must remain unchanged",
);

console.log("PASS PDF50 worker checkpoint source contract");
