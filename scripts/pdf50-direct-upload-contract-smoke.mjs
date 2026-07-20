import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const component = await readFile(
  resolve(root, "src/components/teacher/teacher-pdf-burst-upload.tsx"),
  "utf8",
);
const burstActions = await readFile(
  resolve(root, "src/app/teacher/banks/pdf-burst-actions.ts"),
  "utf8",
);
const legacyTeacherActions = await readFile(
  resolve(root, "src/app/teacher/banks/actions.ts"),
  "utf8",
);
const adminActions = await readFile(
  resolve(root, "src/app/admin/imports/pdf/actions.ts"),
  "utf8",
);
const migration = await readFile(
  resolve(root, "supabase/clean-migrations/0049_pdf50_burst_upload_admission.sql"),
  "utf8",
);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(component.includes('multiple'), "teacher input must support multiple PDFs");
assert(component.includes("uploadToSignedUrl"), "browser must upload directly with a signed grant");
assert(component.includes("AI_PDF_BURST_UPLOAD_CONCURRENCY"), "browser upload concurrency must be bounded");
assert(component.includes('["Completed", counts.completed]'), "the UI must show completed item count");
assert(component.includes("View file status"), "persisted bursts must retain per-file status visibility");
assert(component.includes("contentType: \"application/pdf\""), "browser upload must set PDF MIME");
assert(burstActions.includes("createSignedUploadUrl"), "server must create exact signed upload grants");
assert(burstActions.includes("finalizeTeacherAIPdfBurstItem"), "each upload must finalize independently");
assert(burstActions.includes(".download(item.object_path)"), "finalization must validate one reserved object");
assert(!burstActions.includes("formData.get(\"pdf\")"), "burst action must not accept a raw File");
assert(!legacyTeacherActions.includes("pdfFile.arrayBuffer()"), "legacy Teacher raw PDF buffering must be removed");
assert(!legacyTeacherActions.includes("importBankPdfDrafts"), "legacy raw PDF Server Action must be removed");
assert(
  !burstActions.includes("FormData") &&
    !/:\s*File(?:\W|$)/.test(burstActions) &&
    !burstActions.includes("z.instanceof(File)") &&
    !burstActions.includes('formData.get("pdf")'),
  "burst actions must accept identifiers and metadata only",
);
assert(adminActions.includes("reserveAIPdfSourceUpload"), "existing Admin direct upload must remain compatible");
assert(adminActions.includes("finalizeAIPdfSourceUpload"), "existing Admin finalization must remain compatible");
assert(migration.includes("ai-pdf-bursts/%s/%s.pdf"), "object paths must be server generated");
assert(!migration.includes("signed_url") && !migration.includes("signedUrl"), "signed grants must never be stored");

console.log("PASS PDF50 direct-upload contract smoke (four-way browser pool, no raw Teacher PDF action)");
