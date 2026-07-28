import { readFile } from "node:fs/promises";

const page = await readFile(
  new URL("../src/app/admin/questions/page.tsx", import.meta.url),
  "utf8",
);
const searchMaterializationMigration = await readFile(
  new URL(
    "../supabase/clean-migrations/0061_question_taxonomy_search_materialization.sql",
    import.meta.url,
  ),
  "utf8",
);
const currentSearchDefinitionMigration = await readFile(
  new URL(
    "../supabase/clean-migrations/0029_teacher_role_bank_public_boundary.sql",
    import.meta.url,
  ),
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

assert(
  searchMaterializationMigration.includes(
    "assignment_rows as materialized (",
  ) &&
    !searchMaterializationMigration.includes("security definer") &&
    searchMaterializationMigration.includes("security invoker") &&
    searchMaterializationMigration.includes(
      "and question.owner_bank_id is null",
    ),
  "Question search must materialize the page-bounded taxonomy enrichment while preserving invoker security and the central-question boundary.",
);

function searchFunctionBody(source) {
  const functionStart = source.indexOf(
    "create or replace function public.search_questions_by_taxonomy(",
  );
  assert(functionStart >= 0, "Question taxonomy search function is missing.");
  const bodyStart = source.indexOf("as $$", functionStart);
  const bodyEnd = source.indexOf("$$;", bodyStart);
  assert(bodyStart >= 0 && bodyEnd > bodyStart, "Question taxonomy search body is malformed.");
  return source
    .slice(bodyStart + "as $$".length, bodyEnd)
    .replace(/\r\n/g, "\n")
    .trim();
}

assert(
  searchFunctionBody(searchMaterializationMigration).replace(
    "assignment_rows as materialized (",
    "assignment_rows as (",
  ) === searchFunctionBody(currentSearchDefinitionMigration),
  "0061 must preserve the 0029 search semantics with MATERIALIZED as the only function-body change.",
);

console.log(
  "PASS Admin question loading uses a once-materialized read-model RPC in one startup wave",
);
