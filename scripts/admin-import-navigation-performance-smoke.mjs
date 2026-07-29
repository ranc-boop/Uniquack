import { readFile } from "node:fs/promises";

const [importsPage, aiPdfPage, assetImportPage] = await Promise.all([
  readFile(new URL("../src/app/admin/imports/page.tsx", import.meta.url), "utf8"),
  readFile(
    new URL("../src/app/admin/imports/pdf/page.tsx", import.meta.url),
    "utf8",
  ),
  readFile(
    new URL("../src/app/admin/imports/assets/page.tsx", import.meta.url),
    "utf8",
  ),
]);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(
  importsPage.includes("const [params, , supabase] = await Promise.all([") &&
    importsPage.includes("const batchesPromise = showImport") &&
    importsPage.includes("const taxonomyPromise = showImport") &&
    importsPage.includes("batchesPromise,") &&
    importsPage.includes("taxonomyPromise,"),
  "Admin import navigation must overlap route/auth setup and load only the active view's batches or taxonomy dependency.",
);

assert(
  aiPdfPage.includes("const [params, profile, supabase] = await Promise.all([") &&
    aiPdfPage.includes("const batchesPromise = showImport") &&
    aiPdfPage.includes("const providerPromise =") &&
    aiPdfPage.includes("batchesPromise,") &&
    aiPdfPage.includes("sourceAssetsQuery,") &&
    aiPdfPage.includes("providerPromise,"),
  "AI Parsing navigation must overlap route/auth setup and active-view batches, sources, and provider reads.",
);

assert(
    aiPdfPage.includes("const sourceBatchIds = showImport") &&
    aiPdfPage.includes(": (batches ?? []).map((batch) => batch.id)") &&
    aiPdfPage.includes("if (sourceBatchIds.length)") &&
    aiPdfPage.includes("if (showImport)") &&
    aiPdfPage.includes(": (batches ?? [])"),
  "AI Parsing history must reuse its recent batch rows instead of reloading every source batch.",
);

assert(
  assetImportPage.includes('.eq("status", "draft")') &&
    assetImportPage.includes('.is("owner_bank_id", null)'),
  "Admin bulk asset matching must read only Central Public Library drafts.",
);

console.log("PASS admin import navigation loads only active-view data in bounded waves");
