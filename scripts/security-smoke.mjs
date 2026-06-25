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

const blueprintObservation = await read("src/lib/ai-pdf-import/blueprint-observation.ts");
const questionBlueprintAnalyzer = await read("src/lib/ai-pdf-import/question-blueprint-analyzer.ts");
const aiPdfService = await read("src/lib/ai-pdf-import/service.ts");
const aiPdfActions = await read("src/app/admin/imports/pdf/actions.ts");
const aiPdfPanel = await read("src/components/ai-pdf-import-panel.tsx");
const aiPdfDashboard = await read("src/components/ai-pdf-dashboard/ai-pdf-control-dashboard.tsx");
for (const exportName of [
  "AIBlueprintObservationPlan",
  "AIBlueprintObservationPacket",
  "AIBlueprintObservedQuestionBlock",
  "AINormalizedBlueprintObservationPacket",
  "buildAIBlueprintObservationPlanFromSummary",
  "buildBlueprintObservationPackets",
  "normalizeBlueprintObservationPackets",
  "validateBlueprintObservationPlan",
  "mergeAIBlueprintObservationPlanIntoSummary",
  "failedAIBlueprintObservationPlan",
  "summarizeBlueprintObservationPlan",
  "buildAIBlueprintObservationProviderPrompt",
  "buildAIBlueprintObservationPlanFromProviderResponse",
  "parseAIBlueprintObservationProviderText",
]) {
  assert(
    blueprintObservation.includes(exportName),
    `blueprint observation schema is missing ${exportName}`,
  );
}
for (const expectedText of [
  "blueprint_observation_plan_v1",
  "summary.aiPdfImport.blueprintObservationPlan",
  "blueprintObservationPlan",
  "textOnlyForAnalyzer: true",
  "rawPdfStored: false",
  "rawImageStored: false",
  "base64Stored: false",
  "providerResponseStored: false",
  "BLUEPRINT_OBSERVATION_EVIDENCE_SNIPPET_MAX_CHARS = 280",
  "blueprint_observation_planning_only",
  "blueprint_observation_no_provider_call",
  "blueprint_observation_no_generation",
  "blueprint_observation_no_review_draft_write",
  "blueprint_observation_no_raw_pdf_storage",
  "blueprint_observation_no_base64_storage",
  "blueprint_observation_missing_preanalysis",
  "blueprint_observation_missing_packet_plan",
  "You are not solving the problem.",
  "Only extract bounded structure/style observations",
  "generatedQuestionCount: 0",
  "providerCallCount: 0",
  "reviewDraftWriteCount: 0",
  "rawStorageCount: 0",
]) {
  assert(
    blueprintObservation.includes(expectedText),
    `blueprint observation guard is missing ${expectedText}`,
  );
}
assert(
  blueprintObservation.includes("boundedText("),
  "blueprint observation must bound evidence and summaries",
);
assert(
  blueprintObservation.includes("assetRefs"),
  "blueprint observation must keep asset references",
);
assert(
  !blueprintObservation.includes("fetch("),
  "blueprint observation must not call providers or network APIs",
);
assert(
  !blueprintObservation.includes("importBatchImportJson"),
  "blueprint observation must not write generated drafts to Review",
);
assert(!blueprintObservation.includes("question_tags"), "blueprint observation must not use legacy question_tags");
assert(!blueprintObservation.includes("video_tags"), "blueprint observation must not use legacy video_tags");
assert(!blueprintObservation.includes("supabase.from("), "blueprint observation must not query the database");
assert(!blueprintObservation.includes(".insert("), "blueprint observation must not insert database rows");
assert(!blueprintObservation.includes(".update("), "blueprint observation must not update database rows");
assert(!blueprintObservation.includes(".delete("), "blueprint observation must not delete database rows");
assert(
  !blueprintObservation.includes("executeBlueprintGenerationRequestWithDeepSeek"),
  "blueprint observation must not restore old DeepSeek execution",
);
assert(
  !blueprintObservation.includes("QuestionBlueprintPlan"),
  "blueprint observation must not restore the old QuestionBlueprintPlan",
);
console.log("PASS blueprint observation schema is planning-only, bounded, and provider-free");

for (const exportName of [
  "AIQuestionBlueprintDraftPlan",
  "AIQuestionBlueprintDraft",
  "buildQuestionBlueprintAnalyzerPrompt",
  "buildQuestionBlueprintDraftPlanFromObservationPlan",
  "buildQuestionBlueprintDraftPlanFromAnalyzerResponse",
  "parseQuestionBlueprintAnalyzerProviderText",
  "executeDeepSeekQuestionBlueprintAnalyzer",
  "skippedQuestionBlueprintDraftPlan",
  "failedQuestionBlueprintDraftPlan",
  "mergeQuestionBlueprintDraftPlanIntoSummary",
  "summarizeQuestionBlueprintDraftPlan",
]) {
  assert(
    questionBlueprintAnalyzer.includes(exportName),
    `question blueprint analyzer is missing ${exportName}`,
  );
}
for (const expectedText of [
  "question_blueprint_draft_plan_v1",
  "summary.aiPdfImport.questionBlueprintDraftPlan",
  "analysis_only",
  "DeepSeek provider is not configured or not enabled.",
  "You are analyzing the style and structure of a source question.",
  "Do not generate a new question.",
  "Do not solve the question.",
  "Do not copy wording.",
  "Return JSON only.",
  "textOnlyForAnalyzer",
  "rawStorageCount: 0",
  "generatedQuestionCount: 0",
  "reviewDraftWriteCount: 0",
  "question_blueprint_analyzer_text_only_packets",
  "question_blueprint_analyzer_no_generated_questions",
  "question_blueprint_analyzer_no_review_draft_write",
  "question_blueprint_analyzer_no_raw_pdf_storage",
  "question_blueprint_analyzer_no_image_or_base64_storage",
]) {
  assert(
    questionBlueprintAnalyzer.includes(expectedText),
    `question blueprint analyzer guard is missing ${expectedText}`,
  );
}
assert(
  questionBlueprintAnalyzer.includes("boundedText("),
  "question blueprint analyzer must bound evidence snippets",
);
assert(
  questionBlueprintAnalyzer.includes("buildQuestionBlueprintAnalyzerPrompt") &&
    questionBlueprintAnalyzer.includes("normalizedPacketsForAnalyzer"),
  "question blueprint analyzer must build prompts from normalized packets",
);
assert(
  questionBlueprintAnalyzer.includes("fetch("),
  "question blueprint analyzer should contain the DeepSeek text-only provider runner",
);
assert(
  !questionBlueprintAnalyzer.includes("importBatchImportJson"),
  "question blueprint analyzer must not write generated drafts to Review",
);
assert(!questionBlueprintAnalyzer.includes("question_tags"), "question blueprint analyzer must not use legacy question_tags");
assert(!questionBlueprintAnalyzer.includes("video_tags"), "question blueprint analyzer must not use legacy video_tags");
assert(!questionBlueprintAnalyzer.includes("supabase.from("), "question blueprint analyzer must not query the database");
assert(!questionBlueprintAnalyzer.includes(".insert("), "question blueprint analyzer must not insert database rows");
assert(!questionBlueprintAnalyzer.includes(".update("), "question blueprint analyzer must not update database rows");
assert(!questionBlueprintAnalyzer.includes(".delete("), "question blueprint analyzer must not delete database rows");
console.log("PASS question blueprint analyzer is text-only, bounded, and draft-free");

for (const expectedText of [
  "blueprint_observation",
  "processAIPdfBlueprintObservation",
  "buildAIBlueprintObservationProviderPrompt",
  "parseAIBlueprintObservationProviderText",
  "buildAndStoreQuestionBlueprintDraftPlan",
  "loadDeepSeekBlueprintAnalyzerProvider",
  "executeDeepSeekQuestionBlueprintAnalyzer",
  "mergeQuestionBlueprintDraftPlanIntoSummary",
  "generateWithGeminiNativePdf",
  "mockBlueprintObservationProviderResponse",
  "Blueprint Observation Mode completed. Question blueprint drafts were analyzed without creating questions.",
  "Question blueprint analyzer finished. No generated questions or Review Drafts were created.",
  "status: \"ready\"",
  "createdCount: 0",
  "createdQuestions: []",
]) {
  assert(
    aiPdfService.includes(expectedText),
    `AI PDF service is missing blueprint observation mode wiring: ${expectedText}`,
  );
}
const observationProcessor = aiPdfService.slice(
  aiPdfService.indexOf("async function processAIPdfBlueprintObservation"),
  aiPdfService.indexOf("async function processAIPdfSinglePass"),
);
assert(
  observationProcessor.includes("generateWithGeminiNativePdf"),
  "blueprint observation mode must use Gemini Native provider path when not mocked",
);
assert(
  observationProcessor.includes("isMockAIProviderUrl"),
  "blueprint observation mode must support mocked provider responses for tests",
);
assert(
  !observationProcessor.includes("importBatchImportJson"),
  "blueprint observation mode must not create Review Drafts",
);
assert(
  !observationProcessor.includes("buildImportJson"),
  "blueprint observation mode must not build question import JSON",
);
assert(
  !observationProcessor.includes("attachCroppedAssets"),
  "blueprint observation mode must not attach question crops",
);
assert(
  aiPdfService.includes("QUESTION_BLUEPRINT_ANALYZER_MISSING_DEEPSEEK_WARNING") &&
    aiPdfService.includes("skippedQuestionBlueprintDraftPlan"),
  "blueprint observation mode must handle missing DeepSeek config safely",
);
assert(
  aiPdfService.includes("providerInput.strategy !== \"gemini_native_pdf\"") &&
    aiPdfService.includes("providerInput.strategy !== \"mock\""),
  "blueprint observation mode must guard provider strategy",
);
assert(
  aiPdfActions.includes("\"blueprint_observation\"") &&
    aiPdfActions.includes("Blueprint observation mode requires a Gemini Native full PDF provider"),
  "AI PDF actions must validate blueprint observation mode before queueing",
);
assert(
  aiPdfPanel.includes("Blueprint observation only") &&
    aiPdfPanel.includes("stores safe structure/style metadata and creates no questions"),
  "AI PDF panel must expose blueprint observation mode with safe copy",
);
assert(
  aiPdfDashboard.includes("Blueprint Observation Mode") &&
    aiPdfDashboard.includes("Observation packets:") &&
    aiPdfDashboard.includes("Normalized analyzer packets:") &&
    aiPdfDashboard.includes("No questions were created."),
  "AI PDF dashboard must surface blueprint observation metadata",
);
assert(
  aiPdfDashboard.includes("Question Blueprint Drafts") &&
    aiPdfDashboard.includes("Draft count:") &&
    aiPdfDashboard.includes("Review required: yes") &&
    aiPdfDashboard.includes("No questions generated yet."),
  "AI PDF dashboard must surface question blueprint draft metadata",
);
console.log("PASS blueprint observation mode is explicit, summary-only, and draft-free");

const blueprintPage = await read("src/app/admin/blueprints/page.tsx");
assert(
  blueprintPage.includes("Blueprint Engine is being rebuilt around AI Parsing observation."),
  "blueprint rollback placeholder is missing",
);
assert(blueprintPage.includes("requireAdmin"), "blueprint placeholder must remain admin-only");
for (const removedBlueprintSurface of [
  "Question blueprint preview",
  "QuestionBlueprintPlan",
  "Generate missing questions with DeepSeek",
  "Run DeepSeek draft generation",
  "Provider run shadow plan",
  "executeBlueprintGenerationRequestWithDeepSeek",
  "persistBlueprintReviewDrafts",
  "loadAIProviderProfileForUse",
  "buildQuestionBlueprintPlan",
  "buildBlueprintProviderRunPlan",
  "buildBlueprintGenerationRequestPlan",
  "question_taxonomy_assignments",
  "fetch(",
  ".insert(",
  ".update(",
  ".delete(",
]) {
  assert(
    !blueprintPage.includes(removedBlueprintSurface),
    `old blueprint surface remains on placeholder page: ${removedBlueprintSurface}`,
  );
}
console.log("PASS old blueprint product surface is rolled back to an admin-only placeholder");
