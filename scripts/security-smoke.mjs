import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const root = resolve(__dirname, "..");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function read(relativePath) {
  return readFile(resolve(root, relativePath), "utf8");
}

const migration = await read("supabase/migrations/0011_math_taxonomy_source_of_truth.sql");
assert(migration.includes("create table if not exists public.taxonomy_nodes"), "taxonomy_nodes table is missing");
assert(migration.includes("create table if not exists public.question_taxonomy_assignments"), "question taxonomy assignments table is missing");
const developmentTaxonomySeed = await read("supabase/development/reset_math_taxonomy_seed_development_only.sql");
assert(developmentTaxonomySeed.includes("math.concept.algebra.equations"), "math-prefixed taxonomy seed is missing");
const legacySubjectRoot = ["subject", "math"].join(".");
assert(!migration.includes(legacySubjectRoot), `${legacySubjectRoot} should not exist in replacement taxonomy`);
console.log("PASS math-prefixed taxonomy schema and seed are present");

const rpc = await read("supabase/migrations/0012_taxonomy_question_search_rpc.sql");
assert(rpc.includes("create or replace function public.search_questions_by_taxonomy"), "taxonomy search RPC is missing");
assert(rpc.includes("matched_tags jsonb"), "taxonomy search RPC does not return matched tag metadata");
assert(rpc.includes("next_cursor text"), "taxonomy search RPC does not return a next cursor");
assert(rpc.includes("taxonomy_tag_path"), "taxonomy search RPC does not return tag paths");
assert(rpc.includes("to_tsvector"), "taxonomy search RPC does not use full-text search");
console.log("PASS taxonomy search RPC includes paths, cursor, and full-text matching");

const publicQuestions = await read("src/app/questions/page.tsx");
assert(publicQuestions.includes("search_questions_by_taxonomy"), "public questions page does not use taxonomy RPC");
console.log("PASS public questions page uses taxonomy search RPC");

const adminTags = await read("src/app/admin/tags/page.tsx");
assert(adminTags.includes("TaxonomyNodeCreateFields"), "taxonomy node form is missing parent tree picker");
assert(adminTags.includes("<details"), "taxonomy preview is missing collapsible tree rows");
console.log("PASS taxonomy admin uses parent tree creation and collapsible preview");

const batchJson = await read("src/lib/batch-import/json.ts");
assert(batchJson.includes("tag_ids"), "batch import does not accept tag_ids");
assert(!batchJson.includes(`tag_${"slugs"}`), "batch import still accepts legacy tag identifier arrays");
assert(!batchJson.includes(`tag_${"names"}`), "batch import still accepts legacy tag name arrays");
console.log("PASS batch import uses exact tag_ids only");

const practicePersistence = await read("supabase/migrations/0014_practice_persistence.sql");
for (const table of [
  "practice_sessions",
  "practice_rounds",
  "practice_round_questions",
  "practice_attempts",
  "practice_wrong_questions",
  "user_practice_preferences",
  "practice_preference_merge_jobs",
]) {
  assert(
    practicePersistence.includes(`alter table public.${table} enable row level security`),
    `${table} is missing RLS`,
  );
  assert(
    practicePersistence.includes(`on public.${table} for select`) &&
      practicePersistence.includes("using ((select auth.uid()) = user_id)"),
    `${table} is missing owner select policy`,
  );
}
assert(
  practicePersistence.includes("long_term_preference text not null default ''") &&
    practicePersistence.includes("check (length(long_term_preference) <= 1000)"),
  "practice preference 1000-character constraint is missing",
);
assert(
  practicePersistence.includes("question_snapshot jsonb") &&
    practicePersistence.includes("references public.questions(id) on delete set null"),
  "practice history must preserve snapshots when source questions are deleted",
);
console.log("PASS practice persistence has owner RLS, preference limit, and snapshot-safe question links");

const practiceClient = await read("src/components/practice/practice-agent-client.tsx");
assert(!practiceClient.includes("localStorage"), "practice client still uses localStorage");
assert(practiceClient.includes("/api/practice/sessions"), "practice client does not load database sessions");
assert(practiceClient.includes("/api/practice/wrong-questions"), "practice client does not load wrong-question records");
console.log("PASS practice client uses persisted sessions and wrong-question records");

const blueprint = await read("src/lib/taxonomy/question-blueprint.ts");
const aiBlueprint = await read("src/lib/ai-pdf-import/blueprint-builder.ts");
const blueprintGeneration = await read("src/lib/taxonomy/question-blueprint-generation.ts");
for (const exportName of [
  "QuestionBlueprintPlan",
  "QuestionBlueprintSection",
  "QuestionBlueprintRequirement",
  "QuestionBlueprintCandidateSet",
  "QuestionBlueprintCoverageGap",
  "QuestionBlueprintGenerationRequest",
  "QuestionBlueprintModelRoutingPlan",
  "buildQuestionBlueprintPlan",
  "validateQuestionBlueprintRequest",
  "buildBlueprintCandidatePlan",
  "buildBlueprintCoverageGaps",
  "buildBlueprintModelRoutingPlan",
  "summarizeQuestionBlueprintPlan",
]) {
  assert(blueprint.includes(exportName), `blueprint builder is missing ${exportName}`);
}
for (const facet of ["curriculum", "concept", "method", "task", "form"]) {
  assert(blueprint.includes(`"${facet}"`), `blueprint builder is missing ${facet} facet`);
}
for (const guard of [
  "invalid_taxonomy_tag",
  "wrong_facet",
  "tag_not_active_assignable_leaf",
  "difficulty_distribution_sum_mismatch",
  "question_type_distribution_sum_mismatch",
  "search_questions_by_taxonomy",
  "noDbWrite: true",
  "noGeneratedQuestions: true",
  "noProviderCall: true",
  "noReviewDraftWrite: true",
]) {
  assert(blueprint.includes(guard), `blueprint guard is missing: ${guard}`);
}
assert(!blueprint.includes("question_tags"), "blueprint builder must not use legacy question_tags");
assert(!blueprint.includes("video_tags"), "blueprint builder must not use legacy video_tags");
assert(!blueprint.includes("supabase.from("), "blueprint builder must not write or query the database directly");
assert(!blueprint.includes(".insert("), "blueprint builder must not insert database rows");
assert(!blueprint.includes(".update("), "blueprint builder must not update database rows");
assert(!blueprint.includes(".delete("), "blueprint builder must not delete database rows");
assert(!blueprint.includes("fetch("), "blueprint builder must not call providers or network APIs");
assert(aiBlueprint.includes("questionBlueprintPlan"), "AI PDF blueprint summary field is missing");
assert(aiBlueprint.includes("mergeQuestionBlueprintPlanIntoAIPdfSummary"), "AI PDF blueprint merge helper is missing");
assert(!aiBlueprint.includes("supabase.from("), "AI PDF blueprint builder must not write the database");
assert(!aiBlueprint.includes(".insert("), "AI PDF blueprint builder must not insert database rows");
assert(!aiBlueprint.includes(".update("), "AI PDF blueprint builder must not update database rows");
assert(!aiBlueprint.includes(".delete("), "AI PDF blueprint builder must not delete database rows");
assert(!aiBlueprint.includes("fetch("), "AI PDF blueprint builder must not call providers");
console.log("PASS question blueprint builder is planning-only and taxonomy-backed");

for (const exportName of [
  "buildBlueprintGenerationRequestPlan",
  "buildBlueprintGenerationRequests",
  "validateBlueprintGenerationRequest",
  "summarizeBlueprintGenerationRequestPlan",
]) {
  assert(
    blueprintGeneration.includes(exportName),
    `blueprint generation builder is missing ${exportName}`,
  );
}
for (const requiredShape of [
  "requestId",
  "blueprintId",
  "targetTags",
  "questionType",
  "difficultyRange",
  "promptPlan",
  "modelRoute",
  "safety",
  'status: "draft"',
]) {
  assert(
    blueprintGeneration.includes(requiredShape),
    `blueprint generation request schema is missing ${requiredShape}`,
  );
}
for (const routeHint of [
  "deepseek-v4-flash non-thinking",
  "deepseek-v4-flash thinking or OpenAI GPT-5.4 mini",
  "Gemini Flash family",
  "Gemini Flash-Lite",
  "OpenAI GPT-5.4 mini / GPT-5.4",
]) {
  assert(
    blueprintGeneration.includes(routeHint),
    `blueprint generation route hint is missing ${routeHint}`,
  );
}
for (const guard of [
  "generation_request_invalid_taxonomy_tag",
  "generation_request_wrong_facet",
  "generation_request_tag_not_active_assignable_leaf",
  "generation_request_not_a_coverage_gap",
  "generation_request_count_invalid",
  "generation_request_difficulty_range_invalid",
  "generation_request_question_type_invalid",
  "noDbWrite: true",
  "noGeneratedQuestions: true",
  "noProviderCall: true",
  "noReviewDraftWrite: true",
]) {
  assert(
    blueprintGeneration.includes(guard),
    `blueprint generation guard is missing ${guard}`,
  );
}
assert(!blueprintGeneration.includes("question_tags"), "blueprint generation builder must not use legacy question_tags");
assert(!blueprintGeneration.includes("video_tags"), "blueprint generation builder must not use legacy video_tags");
assert(!blueprintGeneration.includes("supabase.from("), "blueprint generation builder must not query the database");
assert(!blueprintGeneration.includes(".insert("), "blueprint generation builder must not insert database rows");
assert(!blueprintGeneration.includes(".update("), "blueprint generation builder must not update database rows");
assert(!blueprintGeneration.includes(".delete("), "blueprint generation builder must not delete database rows");
assert(!blueprintGeneration.includes("fetch("), "blueprint generation builder must not call providers");
console.log("PASS question blueprint generation requests are draft-only and taxonomy-backed");

const blueprintPage = await read("src/app/admin/blueprints/page.tsx");
for (const expectedText of [
  "Question blueprint preview",
  "Target taxonomy tags",
  "Total question count",
  "Difficulty distribution",
  "Question type distribution",
  "Reviewed-only candidates",
  "Blueprint summary",
  "Facet coverage",
  "Candidate question sets",
  "Missing coverage gaps",
  "Generation request drafts",
  "Model routing plan",
  "Draft only - no AI call yet",
  "Selected model route",
]) {
  assert(blueprintPage.includes(expectedText), `blueprint page is missing ${expectedText}`);
}
for (const helperName of [
  "buildBlueprintGenerationRequestPlan",
  "buildQuestionBlueprintPlan",
  "loadTaxonomyCatalog",
  "TaxonomyTagTreePicker",
]) {
  assert(blueprintPage.includes(helperName), `blueprint page does not use ${helperName}`);
}
assert(blueprintPage.includes("question_taxonomy_assignments"), "blueprint page must use taxonomy assignments for candidates");
assert(blueprintPage.includes("review_status"), "blueprint page must support reviewed-only candidates");
assert(!blueprintPage.includes("question_tags"), "blueprint page must not use legacy question_tags");
assert(!blueprintPage.includes("video_tags"), "blueprint page must not use legacy video_tags");
assert(!blueprintPage.includes("fetch("), "blueprint page must not call providers or network APIs directly");
assert(!blueprintPage.includes(".insert("), "blueprint page must not insert database rows");
assert(!blueprintPage.includes(".update("), "blueprint page must not update database rows");
assert(!blueprintPage.includes(".delete("), "blueprint page must not delete database rows");
assert(!blueprintPage.includes("createQuestion"), "blueprint page must not create questions");
assert(!blueprintPage.includes("createImport"), "blueprint page must not create review drafts");
console.log("PASS question blueprint preview UI is preview-only and taxonomy-backed");
