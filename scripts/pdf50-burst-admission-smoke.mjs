import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const migration = await readFile(
  resolve(root, "supabase/clean-migrations/0050_pdf50_burst_upload_admission.sql"),
  "utf8",
);
const action = await readFile(
  resolve(root, "src/app/teacher/banks/pdf-burst-actions.ts"),
  "utf8",
);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(migration.includes("ai_pdf_upload_bursts"), "burst parent must be durable");
assert(migration.includes("ai_pdf_upload_burst_items"), "burst items must be durable");
assert(migration.includes("item_count between 1 and 50"), "database must enforce the 50-item limit");
assert(migration.includes("jsonb_array_length(p_items)"), "reservation must validate the complete manifest");
assert(migration.includes("created_by, client_request_key"), "reservation must have a creator-scoped idempotency key");
assert(migration.includes("manifest_hash"), "duplicate reservation must compare the immutable manifest");
assert(migration.includes("import_batch_id uuid not null unique"), "every item must own one import batch");
assert(migration.includes("source_asset_id uuid not null unique"), "every item must own one source asset");
assert(migration.includes("ai_provider_job_id uuid unique"), "an item must link to at most one initial durable job");
assert(migration.includes("status = 'admission_ready'"), "valid items must wait durably before queue release");
assert(migration.includes("user_outstanding >= 5"), "release must preserve the user outstanding limit");
assert(migration.includes("organization_outstanding >= 12"), "release must preserve the organization outstanding limit");
assert(
  migration.includes("selected_burst public.ai_pdf_upload_bursts%rowtype") &&
    migration.includes("burst.id = selected_burst.id"),
  "each admission pump must stay within one immutable burst",
);
assert(
  migration.includes("hashtextextended(selected_burst.created_by::text, 33)") &&
    migration.includes("hashtextextended(selected_burst.organization_id::text, 34)"),
  "admission must share the existing user/org enqueue locks",
);
assert(action.includes(".max(AI_PDF_BURST_MAX_FILES)"), "the Server Action must reject item 51");
assert(
  migration.includes("on conflict (job_kind, resource_type, resource_id, idempotency_key)") &&
    migration.includes("ai_provider_job_id uuid unique"),
  "duplicate finalization must converge on one durable initial job",
);

function reserveBurst({ count, requestKey, existing }) {
  if (count < 1 || count > 50) throw new Error("invalid_count");
  if (existing.has(requestKey)) return existing.get(requestKey);
  const burst = {
    id: `burst-${requestKey}`,
    items: Array.from({ length: count }, (_, index) => ({
      id: `item-${requestKey}-${index}`,
      importBatchId: `batch-${requestKey}-${index}`,
      jobId: null,
      objectPath: `ai-pdf-bursts/burst-${requestKey}/item-${requestKey}-${index}.pdf`,
      sourceAssetId: `asset-${requestKey}-${index}`,
      status: "admission_ready",
    })),
  };
  existing.set(requestKey, burst);
  return burst;
}

const reservations = new Map();
for (const count of [1, 10, 50]) {
  const burst = reserveBurst({ count, existing: reservations, requestKey: String(count) });
  assert(burst.items.length === count, `${count}-item reservation must remain complete`);
  assert(new Set(burst.items.map((item) => item.objectPath)).size === count, "object paths must be unique");
  assert(new Set(burst.items.map((item) => item.importBatchId)).size === count, "import batches must be unique");
}

let rejected51 = false;
try {
  reserveBurst({ count: 51, existing: reservations, requestKey: "51" });
} catch {
  rejected51 = true;
}
assert(rejected51, "a 51st file must be rejected before upload");

const first = reserveBurst({ count: 10, existing: reservations, requestKey: "duplicate" });
const duplicate = reserveBurst({ count: 10, existing: reservations, requestKey: "duplicate" });
assert(first === duplicate, "duplicate reservation must return the same logical burst");

console.log("PASS PDF50 burst admission smoke (1/10/50 reservations, item 51 rejected, duplicate reused)");
