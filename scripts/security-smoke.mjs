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
const blueprintProviderRunner = await read("src/lib/taxonomy/question-blueprint-provider-runner.ts");
const blueprintExecution = await read("src/lib/taxonomy/question-blueprint-execution.ts");
const blueprintReviewDrafts = await read("src/lib/taxonomy/question-blueprint-review-drafts.ts");
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

for (const exportName of [
  "buildBlueprintProviderRunPlan",
  "buildBlueprintProviderPayloadDrafts",
  "validateBlueprintProviderRunPlan",
  "summarizeBlueprintProviderRunPlan",
  "failedBlueprintProviderRunPlan",
]) {
  assert(
    blueprintProviderRunner.includes(exportName),
    `blueprint provider runner is missing ${exportName}`,
  );
}
for (const requiredShape of [
  "runId",
  "requestId",
  "providerKind",
  "modelName",
  'mode: "shadow_only"',
  "realCall: false",
  "promptPayloadPreview",
  "expectedOutputSchema",
  "safety",
  'status: "ready" | "blocked" | "skipped"',
]) {
  assert(
    blueprintProviderRunner.includes(requiredShape),
    `blueprint provider run schema is missing ${requiredShape}`,
  );
}
for (const outputField of [
  "draftQuestions",
  "title",
  "questionType",
  "contentHtml",
  "solutionHtml",
  "options",
  "answerSpec",
  "taxonomyTagIds",
  "difficulty",
  "rationale",
]) {
  assert(
    blueprintProviderRunner.includes(outputField),
    `blueprint provider expected output schema is missing ${outputField}`,
  );
}
for (const modelName of [
  "deepseek-v4-flash",
  "deepseek-v4-flash-thinking",
  "gemini-flash-family",
  "gemini-flash-lite",
  "gpt-5.4-mini",
  "gpt-5.4",
]) {
  assert(
    blueprintProviderRunner.includes(modelName),
    `blueprint provider route mapping is missing ${modelName}`,
  );
}
for (const guard of [
  "provider_run_real_call_enabled",
  "provider_run_not_shadow_only",
  "provider_run_safety_flags_missing",
  "provider_run_schema_missing_taxonomy_tags",
  "noDbWrite: true",
  "noGeneratedQuestionPersistence: true",
  "noProviderCall: true",
  "noReviewDraftWrite: true",
  "shadowOnly: true",
]) {
  assert(
    blueprintProviderRunner.includes(guard),
    `blueprint provider guard is missing ${guard}`,
  );
}
assert(!blueprintProviderRunner.includes("question_tags"), "blueprint provider runner must not use legacy question_tags");
assert(!blueprintProviderRunner.includes("video_tags"), "blueprint provider runner must not use legacy video_tags");
assert(!blueprintProviderRunner.includes("supabase.from("), "blueprint provider runner must not query the database");
assert(!blueprintProviderRunner.includes(".insert("), "blueprint provider runner must not insert database rows");
assert(!blueprintProviderRunner.includes(".update("), "blueprint provider runner must not update database rows");
assert(!blueprintProviderRunner.includes(".delete("), "blueprint provider runner must not delete database rows");
assert(!blueprintProviderRunner.includes("fetch("), "blueprint provider runner must not call providers");
console.log("PASS question blueprint provider runner is shadow-only and provider-call-free");

for (const exportName of [
  "executeBlueprintGenerationRequestWithDeepSeek",
  "parseBlueprintGeneratedQuestions",
  "validateBlueprintGeneratedQuestion",
  "buildBlueprintGeneratedDrafts",
]) {
  assert(
    blueprintExecution.includes(exportName),
    `blueprint DeepSeek execution is missing ${exportName}`,
  );
}
for (const guard of [
  'import "server-only"',
  "Blueprint generation V1 only supports DeepSeek text-only runs.",
  "response_format: { type: \"json_object\" }",
  "reviewRequired: true",
  'status: "draft"',
  "Generated questions are draft-only and require review.",
]) {
  assert(blueprintExecution.includes(guard), `blueprint DeepSeek execution guard is missing ${guard}`);
}
for (const outputField of [
  "title",
  "questionType",
  "contentHtml",
  "solutionHtml",
  "options",
  "answerSpec",
  "taxonomyTagIds",
  "difficulty",
]) {
  assert(
    blueprintExecution.includes(outputField),
    `blueprint DeepSeek generated draft schema is missing ${outputField}`,
  );
}
assert(blueprintExecution.includes("fetch("), "DeepSeek execution helper must contain the manual provider call");
assert(!blueprintExecution.includes("question_tags"), "blueprint DeepSeek execution must not use legacy question_tags");
assert(!blueprintExecution.includes("video_tags"), "blueprint DeepSeek execution must not use legacy video_tags");
assert(!blueprintExecution.includes("gemini"), "blueprint DeepSeek execution must not call Gemini");
assert(!blueprintExecution.includes("gpt-"), "blueprint DeepSeek execution must not call OpenAI fallback models");
assert(!blueprintExecution.includes("supabase.from("), "blueprint DeepSeek execution must not query the database");
assert(!blueprintExecution.includes(".insert("), "blueprint DeepSeek execution must not insert database rows");
assert(!blueprintExecution.includes(".update("), "blueprint DeepSeek execution must not update database rows");
assert(!blueprintExecution.includes(".delete("), "blueprint DeepSeek execution must not delete database rows");
console.log("PASS question blueprint DeepSeek execution is manual, server-only, and draft-only");

for (const exportName of [
  "buildBlueprintReviewDrafts",
  "validateBlueprintReviewDraft",
  "persistBlueprintReviewDrafts",
  "summarizeBlueprintReviewDraftPersistence",
]) {
  assert(
    blueprintReviewDrafts.includes(exportName),
    `blueprint review draft helper is missing ${exportName}`,
  );
}
for (const guard of [
  'import "server-only"',
  'source: "blueprint_generation"',
  'reviewRequired: true',
  'status: "draft"',
  "blueprint_review_draft_must_remain_draft",
  "blueprint_review_draft_invalid_taxonomy_tag",
  "blueprint_review_draft_answer_spec_required",
  "importBatchImportJson",
  "/admin/review?batch=",
]) {
  assert(
    blueprintReviewDrafts.includes(guard),
    `blueprint review draft guard is missing ${guard}`,
  );
}
assert(!blueprintReviewDrafts.includes("fetch("), "blueprint review drafts must not call providers");
assert(!blueprintReviewDrafts.includes("loadAIProviderProfileForUse"), "blueprint review drafts must not load provider keys");
assert(!blueprintReviewDrafts.includes("executeBlueprintGenerationRequestWithDeepSeek"), "blueprint review drafts must not execute providers");
assert(!blueprintReviewDrafts.includes("published"), "blueprint review drafts must not publish generated questions");
console.log("PASS question blueprint generated drafts are persisted through draft review queue only");

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
  "Provider run shadow plan",
  "Shadow only - no AI call yet",
  "Prompt preview summary",
  "Expected output schema",
  "Generate missing questions with DeepSeek",
  "Manual DeepSeek call",
  "Generated questions will be draft-only and sent to",
  "Review Drafts is the human review step before publishing.",
  "Advanced provider run details",
  "Run DeepSeek draft generation",
  "Send generated drafts to Review",
  "Open Review Drafts",
  "Provider result preview",
  "Generated questions are draft-only and require review.",
  "Parent taxonomy nodes cannot be used directly. Choose a specific assignable leaf tag.",
  "No active assignable leaf taxonomy tags are available.",
]) {
  assert(blueprintPage.includes(expectedText), `blueprint page is missing ${expectedText}`);
}
for (const helperName of [
  "executeBlueprintGenerationRequestWithDeepSeek",
  "buildBlueprintProviderRunPlan",
  "buildBlueprintGenerationRequestPlan",
  "buildQuestionBlueprintPlan",
  "loadAIProviderProfileForUse",
  "loadTaxonomyCatalog",
  "persistBlueprintReviewDrafts",
  "TaxonomyTagTreePicker",
  "activeAssignableLeafNodes",
  "GenerateMissingQuestionsCta",
  "strippedTargetWarnings",
  "selectedTagsByFacet",
  'selectable="assignable_leaf"',
]) {
  assert(blueprintPage.includes(helperName), `blueprint page does not use ${helperName}`);
}
assert(
  blueprintPage.includes("targetSelection.warnings"),
  "blueprint page must show readable warnings when parent target tags are stripped",
);
assert(blueprintPage.includes("question_taxonomy_assignments"), "blueprint page must use taxonomy assignments for candidates");
assert(blueprintPage.includes("review_status"), "blueprint page must support reviewed-only candidates");
assert(!blueprintPage.includes("question_tags"), "blueprint page must not use legacy question_tags");
assert(!blueprintPage.includes("video_tags"), "blueprint page must not use legacy video_tags");
assert(!blueprintPage.includes("fetch("), "blueprint page must not call providers or network APIs directly");
assert(!blueprintPage.includes(".insert("), "blueprint page must not insert database rows");
assert(!blueprintPage.includes(".update("), "blueprint page must not update database rows");
assert(!blueprintPage.includes(".delete("), "blueprint page must not delete database rows");
assert(!blueprintPage.includes("createQuestion"), "blueprint page must not create questions");
console.log("PASS question blueprint preview UI is taxonomy-backed and sends validated drafts to Review only");
