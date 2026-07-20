import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const migration = await readFile(
  resolve(root, "supabase/clean-migrations/0049_pdf50_burst_upload_admission.sql"),
  "utf8",
);
const component = await readFile(
  resolve(root, "src/components/teacher/teacher-pdf-burst-upload.tsx"),
  "utf8",
);
const actions = await readFile(
  resolve(root, "src/app/teacher/banks/pdf-burst-actions.ts"),
  "utf8",
);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(migration.includes("'ai-import-sources', 'ai-import-sources', false"), "source bucket must be private");
assert(migration.includes("array['application/pdf']"), "source bucket must allow only PDF MIME");
assert(migration.includes("file_size_limit = excluded.file_size_limit"), "bucket must enforce its size limit");
assert(migration.includes("profile.role in ('teacher', 'admin', 'super_admin')"), "students must be excluded from burst policies");
assert(migration.includes("member.role in ('owner', 'editor')"), "only Bank owners/editors may reserve");
assert(
  migration.includes("private.can_actor_manage_ai_pdf_burst_bank(auth.uid(), target_bank_id)"),
  "burst reads must reuse strict owner/editor authorization",
);
assert(!migration.includes("organization_members member"), "organization admin alone must not bypass Bank owner/editor membership");
assert(migration.includes("asset.object_path = p_object_path"), "Storage access must match an exact reserved asset");
assert(migration.includes("asset.created_by = auth.uid()"), "upload must remain bound to its reserver");
assert(migration.includes("grant select on table public.ai_pdf_upload_bursts to authenticated"), "managers need safe read access");
assert(!migration.includes("grant insert on table public.ai_pdf_upload"), "authenticated users must not insert burst rows directly");
assert(migration.includes("to service_role"), "reservation and admission RPCs must remain trusted-server only");
assert(!/on delete cascade/i.test(migration), "the forward migration must not add destructive cascades");
assert(!/public\s*=\s*true/i.test(migration), "the source bucket must never become public");
assert(!component.includes("objectPath}"), "Storage paths must not be rendered in UI text");
assert(!component.includes("jobId"), "job IDs must not be rendered in the burst UI");
assert(!component.includes("provider"), "provider details must not be rendered in the burst UI");
assert(actions.includes("requireManagedBank"), "reservation and finalization must re-check Bank management");
assert(!actions.includes('.from("assignments")'), "burst upload must not create Assignments");
assert(!actions.includes("publish_review_draft_questions"), "burst upload must not auto-publish drafts");
assert(actions.includes('reviewGate: "bank_review_required"'), "every import must retain the Bank Review Draft gate");

console.log("PASS PDF50 burst security smoke (private exact-path Storage, owner/editor RLS, no public source)");
