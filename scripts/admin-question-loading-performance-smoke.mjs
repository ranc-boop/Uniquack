import { readFile } from "node:fs/promises";

const page = await readFile(
  new URL("../src/app/admin/questions/page.tsx", import.meta.url),
  "utf8",
);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(
  page.includes(
    'const taxonomySearchPromise = focusedQuestionId',
  ) &&
    page.includes(
      'supabase.rpc("search_questions_by_taxonomy", taxonomySearchArgs)',
    ) &&
    page.includes("taxonomyCatalogPromise,") &&
    page.includes("focusedQuestionBundlePromise,") &&
    page.includes("taxonomySearchPromise,"),
  "Admin question list must start taxonomy catalog, focused edit, and search reads in the same wave.",
);

assert(
  page.includes("const rpcQuestions = taxonomyRpcError || focusedQuestionId") &&
    page.includes("id: row.question_id") &&
    page.includes("taxonomyAssignmentsFromRpcValue(row.matched_tags)") &&
    page.includes(
      "Promise.resolve({ data: rpcQuestions, error: null })",
    ),
  "Successful taxonomy search must directly supply question summaries and tag assignments without follow-up list queries.",
);

assert(
  page.includes('ADMIN_QUESTION_EDIT_SELECT') &&
    page.includes("question_assets(") &&
    page.includes("question_source_files(") &&
    page.includes("import_batch_items(") &&
    page.includes("question_taxonomy_assignments("),
  "Focused admin question edit must keep using one root-scoped peripheral-data bundle.",
);

assert(
  page.match(/\.is\("owner_bank_id", null\)/g)?.length >= 2,
  "Admin question search fallback and edit bundle must remain restricted to Central Public Library questions.",
);

console.log(
  "PASS Admin question loading uses the existing read-model RPC in one startup wave",
);
