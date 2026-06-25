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
const blueprintObservationClustering = await read("src/lib/ai-pdf-import/blueprint-observation-clustering.ts");
const questionBlueprintAnalyzer = await read("src/lib/ai-pdf-import/question-blueprint-analyzer.ts");
const questionBlueprintReview = await read("src/lib/blueprints/question-blueprint-review.ts");
const questionBlueprintLibrary = await read("src/lib/blueprints/question-blueprint-library.ts");
const questionBlueprintPersistence = await read("src/lib/blueprints/question-blueprint-persistence.ts");
const questionBlueprintGeneration = await read("src/lib/blueprints/question-blueprint-generation.ts");
const questionBlueprintGenerationReview = await read("src/lib/blueprints/question-blueprint-generation-review.ts");
const questionBlueprintQuality = await read("src/lib/blueprints/question-blueprint-quality.ts");
const questionBlueprintMigration = await read("supabase/migrations/0015_question_blueprint_library.sql");
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
  "AIBlueprintObservationClusterPlan",
  "AIBlueprintObservationCluster",
  "buildAIBlueprintObservationClusterPlan",
  "buildClusteredBlueprintObservationAnalyzerPlans",
  "mergeAIBlueprintObservationClusterPlanIntoSummary",
  "summarizeBlueprintObservationClusterPlan",
]) {
  assert(
    blueprintObservationClustering.includes(exportName),
    `blueprint observation clustering is missing ${exportName}`,
  );
}
for (const expectedText of [
  "blueprint_observation_cluster_plan_v1",
  "summary.aiPdfImport.blueprintObservationClusterPlan",
  "sourceBlockIds",
  "normalizedAnalyzerPacketIds",
  "singleBlockClusterCount",
  "mixedSourceWarningCount",
  "megaClusterAvoidedCount",
  "blueprint_observation_clustering_planning_only",
  "blueprint_observation_clustering_deterministic",
  "blueprint_observation_clustering_no_generation",
  "blueprint_observation_clustering_no_review_draft_write",
  "blueprint_observation_clustering_no_db_write",
  "blueprint_observation_clustering_no_provider_call",
  "blueprint_observation_cluster_uncertain_split",
  "blueprint_observation_cluster_mixed_signals_split",
  "blueprint_observation_cluster_mega_cluster_split",
  "textOnlyForAnalyzer: true",
  "rawPdfStored: false",
  "rawImageStored: false",
  "base64Stored: false",
  "providerResponseStored: false",
  "generatedQuestionCount: 0",
  "providerCallCount: 0",
  "reviewDraftWriteCount: 0",
  "rawStorageCount: 0",
]) {
  assert(
    blueprintObservationClustering.includes(expectedText),
    `blueprint observation clustering guard is missing ${expectedText}`,
  );
}
assert(
  blueprintObservationClustering.includes("taxonomySignals.join") &&
    blueprintObservationClustering.includes("representationGroup") &&
    blueprintObservationClustering.includes("promptVerb") &&
    blueprintObservationClustering.includes("answerStructure"),
  "blueprint observation clustering must fingerprint mixed-topic signals before analysis",
);
assert(
  blueprintObservationClustering.includes("MEGA_CLUSTER_MAX_BLOCKS") &&
    blueprintObservationClustering.includes("splitMegaClusters"),
  "blueprint observation clustering must avoid a single mega-cluster",
);
assert(
  !blueprintObservationClustering.includes("fetch("),
  "blueprint observation clustering must not call providers",
);
assert(
  !blueprintObservationClustering.includes("importBatchImportJson"),
  "blueprint observation clustering must not write Review Drafts",
);
assert(!blueprintObservationClustering.includes("supabase.from("), "blueprint observation clustering must not query the database");
assert(!blueprintObservationClustering.includes(".insert("), "blueprint observation clustering must not insert database rows");
assert(!blueprintObservationClustering.includes(".update("), "blueprint observation clustering must not update database rows");
assert(!blueprintObservationClustering.includes(".delete("), "blueprint observation clustering must not delete database rows");
console.log("PASS blueprint observation clustering is deterministic, bounded, and write-free");

for (const exportName of [
  "AIQuestionBlueprintDraftPlan",
  "AIQuestionBlueprintDraft",
  "buildQuestionBlueprintAnalyzerPrompt",
  "buildQuestionBlueprintDraftPlanFromObservationPlan",
  "buildQuestionBlueprintDraftPlanFromAnalyzerResponse",
  "buildQuestionBlueprintDraftPlanFromClusteredDraftPlans",
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
  "If packet IDs include blueprint observation cluster prefixes, analyze only that cluster and do not merge it with other clusters.",
  "Return JSON only.",
  "textOnlyForAnalyzer",
  "rawStorageCount: 0",
  "generatedQuestionCount: 0",
  "reviewDraftWriteCount: 0",
  "taxonomyGroundingStatus",
  "taxonomyTargetHints",
  "taxonomyUnresolved",
  "specificityScore",
  "specificityWarnings",
  "Bounded active assignable leaf taxonomy candidates by facet:",
  "Use exact active assignable leaf taxonomy tag IDs only",
  "Do not invent taxonomy IDs.",
  "Do not use parent IDs",
  "set taxonomyUnresolved: true",
  "buildQuestionBlueprintTaxonomyCandidateList",
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

for (const exportName of [
  "QuestionBlueprintReviewActionPlan",
  "QuestionBlueprintReviewAction",
  "buildQuestionBlueprintReviewActionPlan",
  "validateQuestionBlueprintReviewActionPlan",
  "mergeQuestionBlueprintReviewPlanIntoSummary",
  "summarizeQuestionBlueprintReviewActionPlan",
]) {
  assert(
    questionBlueprintReview.includes(exportName),
    `question blueprint review module is missing ${exportName}`,
  );
}
for (const expectedText of [
  "question_blueprint_review_plan_v1",
  "summary.aiPdfImport.questionBlueprintReviewPlan",
  "approve_blueprint",
  "reject_blueprint",
  "edit_blueprint",
  "merge_similar_blueprint",
  "mark_needs_more_evidence",
  "pending_review",
  "reviewRequired: true",
  "question_blueprint_review_planning_only",
  "question_blueprint_review_no_generated_questions",
  "question_blueprint_review_no_review_draft_write",
  "question_blueprint_review_no_db_write",
  "question_blueprint_review_no_provider_call",
  "generatedQuestionCount: 0",
  "reviewDraftWriteCount: 0",
  "libraryWriteCount: 0",
  "rawStorageCount: 0",
  "This blueprint needs taxonomy mapping before it can become a reusable library entry.",
  "draft.taxonomyGroundingStatus !== \"grounded\"",
]) {
  assert(
    questionBlueprintReview.includes(expectedText),
    `question blueprint review guard is missing ${expectedText}`,
  );
}
assert(!questionBlueprintReview.includes("fetch("), "question blueprint review must not call providers");
assert(!questionBlueprintReview.includes("importBatchImportJson"), "question blueprint review must not write Review Drafts");
assert(!questionBlueprintReview.includes("supabase.from("), "question blueprint review must not query the database");
assert(!questionBlueprintReview.includes(".insert("), "question blueprint review must not insert database rows");
assert(!questionBlueprintReview.includes(".update("), "question blueprint review must not update database rows");
assert(!questionBlueprintReview.includes(".delete("), "question blueprint review must not delete database rows");
console.log("PASS question blueprint review plan is pending-review and write-free");

for (const exportName of [
  "QuestionBlueprintLibraryEntry",
  "QuestionBlueprintLibraryPersistencePlan",
  "buildQuestionBlueprintLibraryPersistencePlan",
  "validateQuestionBlueprintLibraryPersistencePlan",
  "mergeQuestionBlueprintLibraryPersistencePlanIntoSummary",
  "summarizeQuestionBlueprintLibraryPersistencePlan",
]) {
  assert(
    questionBlueprintLibrary.includes(exportName),
    `question blueprint library module is missing ${exportName}`,
  );
}
for (const expectedText of [
  "question_blueprint_library_persistence_plan_v1",
  "summary.aiPdfImport.questionBlueprintLibraryPersistencePlan",
  "ownerScope",
  "system",
  "school",
  "teacher",
  "private",
  "status: \"draft\"",
  "question_blueprint_library_persistence_planning_only",
  "question_blueprint_library_no_db_write",
  "question_blueprint_library_no_generated_questions",
  "question_blueprint_library_no_review_draft_write",
  "question_blueprint_library_pending_human_approval",
  "libraryWriteCount: 0",
  "generatedQuestionCount: 0",
  "reviewDraftWriteCount: 0",
  "rawStorageCount: 0",
]) {
  assert(
    questionBlueprintLibrary.includes(expectedText),
    `question blueprint library guard is missing ${expectedText}`,
  );
}
assert(!questionBlueprintLibrary.includes("fetch("), "question blueprint library must not call providers");
assert(!questionBlueprintLibrary.includes("importBatchImportJson"), "question blueprint library must not write Review Drafts");
assert(!questionBlueprintLibrary.includes("supabase.from("), "question blueprint library must not query the database");
assert(!questionBlueprintLibrary.includes(".insert("), "question blueprint library must not insert database rows");
assert(!questionBlueprintLibrary.includes(".update("), "question blueprint library must not update database rows");
assert(!questionBlueprintLibrary.includes(".delete("), "question blueprint library must not delete database rows");
console.log("PASS question blueprint library persistence is contract-only and write-free");

for (const tableName of [
  "question_blueprints",
  "question_blueprint_examples",
  "question_blueprint_review_actions",
]) {
  assert(
    questionBlueprintMigration.includes(`create table if not exists public.${tableName}`),
    `question blueprint migration is missing ${tableName}`,
  );
  assert(
    questionBlueprintMigration.includes(`alter table public.${tableName} enable row level security`),
    `${tableName} must enable RLS`,
  );
  assert(
    questionBlueprintMigration.includes(`${tableName}_admin_crud`),
    `${tableName} must have admin-only CRUD policy`,
  );
}
for (const expectedText of [
  "owner_scope in ('system', 'school', 'teacher', 'private')",
  "status in ('draft', 'approved', 'deprecated')",
  "status in ('pending_review', 'approved', 'rejected', 'needs_more_evidence', 'archived')",
  "private.is_admin()",
  "to authenticated",
]) {
  assert(
    questionBlueprintMigration.includes(expectedText),
    `question blueprint migration guard is missing ${expectedText}`,
  );
}
assert(
  !questionBlueprintMigration.includes("to anon"),
  "question blueprint migration must not grant anon access",
);

for (const exportName of [
  "validateQuestionBlueprintRow",
  "buildQuestionBlueprintRowsFromApprovedActions",
  "buildQuestionBlueprintLibrarySeedPlan",
  "persistApprovedQuestionBlueprints",
  "summarizeQuestionBlueprintLibrary",
  "buildQuestionBlueprintReviewActionRowsFromImportSummary",
]) {
  assert(
    questionBlueprintPersistence.includes(exportName),
    `question blueprint persistence helper is missing ${exportName}`,
  );
}
for (const expectedText of [
  "QUESTION_BLUEPRINT_DB_TABLES",
  "question_blueprints",
  "question_blueprint_examples",
  "question_blueprint_review_actions",
  "taxonomyGroundingStatus",
  "taxonomyTargetHints",
  "taxonomyUnresolved",
  "specificityScore",
  "specificityWarnings",
  "question_blueprint_library_seed_plan_no_question_generation",
  "question_blueprint_library_seed_plan_no_review_draft_write",
  "question_blueprint_library_seed_plan_no_provider_call",
]) {
  assert(
    questionBlueprintPersistence.includes(expectedText),
    `question blueprint persistence guard is missing ${expectedText}`,
  );
}
assert(!questionBlueprintPersistence.includes("fetch("), "question blueprint persistence must not call providers");
assert(!questionBlueprintPersistence.includes("importBatchImportJson"), "question blueprint persistence must not write Review Drafts");
assert(!questionBlueprintPersistence.includes("callAIPdfExtractionProvider"), "question blueprint persistence must not run extraction");
console.log("PASS question blueprint DB migration and persistence helpers are admin-only");

for (const expectedText of [
  "validateQuestionBlueprintQuality",
  "generationReady",
  "generationBlockingReasons",
  "approvalReady",
  "approvalBlockingReasons",
  "At least one active assignable concept leaf is required.",
  "At least one active assignable method or task leaf is required.",
  "At least one active assignable form leaf is required.",
  "Originality constraints must be provided.",
  "Bounded source evidence is required.",
  "MCQ option and correct-answer guidance is required.",
  "MCQ distractor pattern is required.",
  "Fill-blank answer structure guidance is required.",
]) {
  assert(
    questionBlueprintQuality.includes(expectedText),
    `question blueprint quality gate is missing ${expectedText}`,
  );
}
assert(
  questionBlueprintPersistence.includes("getQuestionBlueprintApprovalReadinessFromReviewAction") &&
    questionBlueprintPersistence.includes("knownAssignableTagIds") &&
    questionBlueprintPersistence.includes("Blueprint is not approval-ready:"),
  "question blueprint persistence must enforce approval quality gates before approval",
);
assert(
  !questionBlueprintQuality.includes("fetch(") &&
    !questionBlueprintQuality.includes("supabase.from(") &&
    !questionBlueprintQuality.includes("importBatchImportJson"),
  "question blueprint quality helper must be pure and provider/DB-free",
);
console.log("PASS question blueprint quality gates block invalid approval/generation inputs");

for (const exportName of [
  "buildQuestionBlueprintGenerationRequest",
  "buildQuestionBlueprintGenerationPrompt",
  "executeDeepSeekBlueprintGeneration",
  "parseQuestionBlueprintGenerationProviderText",
  "runBlueprintOriginalityGuard",
  "summarizeQuestionBlueprintGenerationResult",
]) {
  assert(
    questionBlueprintGeneration.includes(exportName),
    `question blueprint generation helper is missing ${exportName}`,
  );
}
for (const expectedText of [
  "Generate original questions that follow the approved blueprint structure.",
  "Do not copy the source question wording, numbers, scenario, or surface details.",
  "Preserve concept/method/task/form and cognitive demand.",
  "Return JSON only.",
  "Only approved question blueprints can generate draft questions.",
  "manual_deepseek_text_only",
  "noGeminiCall: true",
  "noOpenAICall: true",
  "reviewRequired: true",
  "response_format: { type: \"json_object\" }",
  "DeepSeek blueprint generation failed with provider status",
  "Blueprint is not generation-ready:",
]) {
  assert(
    questionBlueprintGeneration.includes(expectedText),
    `question blueprint generation guard is missing ${expectedText}`,
  );
}
assert(
  questionBlueprintGeneration.includes("copiedPhraseCount >= 2") &&
    questionBlueprintGeneration.includes("Missing originality constraints from approved blueprint."),
  "question blueprint generation must include deterministic originality blocking",
);
assert(
  !questionBlueprintGeneration.includes("generateWithGeminiNativePdf") &&
    !questionBlueprintGeneration.includes("callAIPdfExtractionProvider"),
  "question blueprint generation must not call Gemini or AI PDF extraction",
);
assert(
  !questionBlueprintGeneration.includes("supabase.from(") &&
    !questionBlueprintGeneration.includes(".insert(") &&
    !questionBlueprintGeneration.includes(".update(") &&
    !questionBlueprintGeneration.includes(".delete("),
  "question blueprint generation helper must not write the database directly",
);
for (const exportName of [
  "buildBlueprintGeneratedReviewDrafts",
  "buildBlueprintGeneratedBatchImportJson",
  "validateBlueprintGeneratedReviewDraft",
  "summarizeBlueprintGeneratedReviewDraftPersistence",
]) {
  assert(
    questionBlueprintGenerationReview.includes(exportName),
    `question blueprint review handoff helper is missing ${exportName}`,
  );
}
for (const expectedText of [
  "source: \"blueprint_generation\"",
  "provider: \"deepseek\"",
  "reviewRequired: true",
  "originalityChecked: true",
  "status: \"draft\"",
]) {
  assert(
    questionBlueprintGenerationReview.includes(expectedText),
    `question blueprint review handoff guard is missing ${expectedText}`,
  );
}
assert(
  !questionBlueprintGenerationReview.includes("fetch(") &&
    !questionBlueprintGenerationReview.includes("supabase.from("),
  "question blueprint review handoff helper must not call providers or DB directly",
);
console.log("PASS question blueprint generation is DeepSeek-only, original-draft, and Review-only");

for (const expectedText of [
  "blueprint_observation",
  "processAIPdfBlueprintObservation",
  "buildAIBlueprintObservationProviderPrompt",
  "parseAIBlueprintObservationProviderText",
  "buildAndStoreQuestionBlueprintDraftPlan",
  "buildAIBlueprintObservationClusterPlan",
  "buildClusteredBlueprintObservationAnalyzerPlans",
  "mergeAIBlueprintObservationClusterPlanIntoSummary",
  "updateAIBlueprintObservationClusterPlan",
  "question_blueprint_clustering",
  "loadDeepSeekBlueprintAnalyzerProvider",
  "executeDeepSeekQuestionBlueprintAnalyzer",
  "buildQuestionBlueprintDraftPlanFromClusteredDraftPlans",
  "mergeQuestionBlueprintDraftPlanIntoSummary",
  "buildQuestionBlueprintReviewActionPlan",
  "mergeQuestionBlueprintReviewPlanIntoSummary",
  "buildQuestionBlueprintLibraryPersistencePlan",
  "mergeQuestionBlueprintLibraryPersistencePlanIntoSummary",
  "generateWithGeminiNativePdf",
  "mockBlueprintObservationProviderResponse",
  "Blueprint Observation Mode completed. Question blueprint review/library plans were created without generating questions.",
  "Question blueprint analyzer finished. No generated questions or Review Drafts were created.",
  "Blueprint review/library planning finished. Library persistence is planned only.",
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
  aiPdfService.includes("for (const clusterAnalyzerPlan of clusterAnalyzerPlans)") &&
    !aiPdfService.includes("Promise.all(clusterAnalyzerPlans"),
  "blueprint observation clustering must analyze clusters sequentially, not with unordered Promise.all",
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
  aiPdfDashboard.includes("Blueprint Observation Clusters") &&
    aiPdfDashboard.includes("Clusters:") &&
    aiPdfDashboard.includes("Single-block clusters:") &&
    aiPdfDashboard.includes("Mixed-source warnings:") &&
    aiPdfDashboard.includes("Source questions were split into separate blueprint") &&
    aiPdfDashboard.includes("candidates before DeepSeek analysis."),
  "AI PDF dashboard must surface blueprint observation cluster metadata",
);
assert(
  aiPdfDashboard.includes("Question Blueprint Drafts") &&
    aiPdfDashboard.includes("Draft count:") &&
    aiPdfDashboard.includes("Review required: yes") &&
    aiPdfDashboard.includes("No questions generated yet."),
  "AI PDF dashboard must surface question blueprint draft metadata",
);
assert(
  aiPdfDashboard.includes("Question Blueprint Review") &&
    aiPdfDashboard.includes("Drafts pending review:") &&
    aiPdfDashboard.includes("Approved-ready actions:") &&
    aiPdfDashboard.includes("Library persistence:") &&
    aiPdfDashboard.includes("planned only"),
  "AI PDF dashboard must surface question blueprint review/library metadata",
);
console.log("PASS blueprint observation mode is explicit, summary-only, and draft-free");

const blueprintPage = await read("src/app/admin/blueprints/page.tsx");
const blueprintActions = await read("src/app/admin/blueprints/actions.ts");
assert(
  blueprintPage.includes("Question Blueprint Library") &&
    blueprintPage.includes("Extract and review reusable assessment patterns from source questions.") &&
    blueprintPage.includes("Approved blueprints can later generate original draft questions"),
  "question blueprint library page copy is missing",
);
assert(blueprintPage.includes("requireAdmin"), "blueprint library page must remain admin-only");
assert(
  blueprintPage.includes("Setup needed") &&
    blueprintPage.includes("0015_question_blueprint_library.sql"),
  "blueprint library page must show setup-needed message when tables are missing",
);
assert(
  blueprintPage.includes("Pending blueprint review actions") &&
    blueprintPage.includes("Active library") &&
    blueprintPage.includes("Store review actions") &&
    blueprintPage.includes("Approve blueprint") &&
    blueprintPage.includes("Needs more evidence") &&
    blueprintPage.includes("Reject"),
  "blueprint library page must expose admin review workflow",
);
assert(
  blueprintActions.includes("requireAdmin") &&
    blueprintActions.includes("storeBlueprintReviewActionsFromImportBatch") &&
    blueprintActions.includes("updateBlueprintReviewActionTaxonomyTargets") &&
    blueprintActions.includes("approveQuestionBlueprintReviewAction") &&
    blueprintActions.includes("rejectQuestionBlueprintReviewAction") &&
    blueprintActions.includes("markQuestionBlueprintNeedsEvidence") &&
    blueprintActions.includes("persistApprovedQuestionBlueprints"),
  "blueprint library actions must be admin-only and use persistence helpers",
);
assert(
  blueprintActions.includes("loadActiveAssignableLeafTaxonomyByFacet") &&
    blueprintActions.includes("Parent taxonomy nodes cannot be used directly. Choose a specific assignable leaf tag.") &&
    blueprintActions.includes("taxonomyGroundingStatus") &&
    blueprintActions.includes("status: \"pending_review\"") &&
    blueprintActions.includes("draft_snapshot: nextSnapshot"),
  "blueprint taxonomy manual edit action must validate active assignable leaf tags and reopen review",
);
assert(
  blueprintPage.includes("Generate original draft questions") &&
    blueprintPage.includes("Manual DeepSeek call") &&
    blueprintPage.includes("Open Review Drafts") &&
    blueprintPage.includes("never published automatically"),
  "blueprint library page must expose manual BP6 generation and review handoff copy",
);
assert(
  blueprintPage.includes("Edit taxonomy targets") &&
    blueprintPage.includes("selectable=\"assignable_leaf\"") &&
    blueprintPage.includes("Needs more evidence") &&
    blueprintPage.includes("Rejected") &&
    blueprintPage.includes("Debug details") &&
    blueprintPage.includes("Raw reason:") &&
    blueprintPage.includes("This blueprint came from observation cluster") &&
    blueprintPage.includes("needs taxonomy mapping before approval"),
  "blueprint library page must expose manual taxonomy edit, status sections, and readable cluster copy",
);
assert(
  blueprintActions.includes("generateOriginalQuestionsFromApprovedBlueprint") &&
    blueprintActions.includes("archiveQuestionBlueprint") &&
    blueprintActions.includes("restoreQuestionBlueprint") &&
    blueprintActions.includes("moveQuestionBlueprintToTrash") &&
    blueprintActions.includes("loadActiveAssignableTaxonomyTagIds") &&
    blueprintActions.includes("loadDeepSeekBlueprintGenerationProvider") &&
    blueprintActions.includes("executeDeepSeekBlueprintGeneration") &&
    blueprintActions.includes("importBatchImportJson") &&
    blueprintActions.includes("reviewRequired: true") &&
    blueprintActions.includes("originalityChecked: true") &&
    blueprintActions.includes("DeepSeek provider is not configured or not enabled."),
  "blueprint generation action must be admin-only, DeepSeek-only, and Review-Draft-only",
);
assert(
  blueprintActions.includes("deleted_at: new Date().toISOString()") &&
    blueprintActions.includes("status: \"deprecated\"") &&
    blueprintActions.includes("Permanent delete is deferred to preserve lineage.") &&
    !blueprintActions.includes(".delete("),
  "blueprint lifecycle actions must use soft delete/archive and avoid hard delete",
);
assert(
  blueprintActions.indexOf("buildQuestionBlueprintGenerationRequest") <
    blueprintActions.indexOf("loadDeepSeekBlueprintGenerationProvider"),
  "blueprint generation readiness must be checked before loading/calling DeepSeek",
);
assert(
  !blueprintActions.includes("generateWithGeminiNativePdf") &&
    !blueprintActions.includes("callAIPdfExtractionProvider"),
  "blueprint generation action must not run Gemini or AI PDF extraction",
);
assert(!blueprintActions.includes("callAIPdfExtractionProvider"), "blueprint library actions must not run extraction");
for (const removedBlueprintSurface of [
  "Question blueprint preview",
  "QuestionBlueprintPlan",
  "Run DeepSeek draft generation",
  "Provider run shadow plan",
  "executeBlueprintGenerationRequestWithDeepSeek",
  "persistBlueprintReviewDrafts",
  "buildQuestionBlueprintPlan",
  "buildBlueprintProviderRunPlan",
  "buildBlueprintGenerationRequestPlan",
]) {
  assert(
    !blueprintPage.includes(removedBlueprintSurface),
    `old blueprint product surface remains on library page: ${removedBlueprintSurface}`,
  );
}
assert(
  blueprintPage.includes("Active library") &&
    blueprintPage.includes("Archived / Trash") &&
    blueprintPage.includes("Quality gate blockers") &&
    blueprintPage.includes("Generation disabled") &&
    blueprintPage.includes("Deprecate") &&
    blueprintPage.includes("Move to trash") &&
    blueprintPage.includes("Restore") &&
    blueprintPage.includes("Permanent") &&
    blueprintPage.includes("hard delete is intentionally deferred"),
  "blueprint page must expose lifecycle controls and readable quality blockers",
);
console.log("PASS question blueprint library admin surface has lifecycle gates and manual Review-Draft handoff");
