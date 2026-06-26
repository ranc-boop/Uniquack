import { dirname, resolve } from "node:path";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: resolve(__dirname, "..", ".env.local") });

const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? process.env.SITE_URL ?? "http://localhost:3000";
const root = resolve(__dirname, "..");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function checkRoute(path, expectedText) {
  const response = await fetch(new URL(path, baseUrl));
  assert(response.status < 500, `${path} returned ${response.status}`);
  const text = await response.text();
  if (expectedText) {
    assert(text.includes(expectedText), `${path} did not include expected text: ${expectedText}`);
  }
  console.log(`PASS ${path} route smoke`);
}

async function checkAdminRoute(path, expectedText) {
  const response = await fetch(new URL(path, baseUrl), { redirect: "manual" });
  assert(response.status < 500, `${path} returned ${response.status}`);

  const location = response.headers.get("location") ?? "";
  if (response.status >= 300 && response.status < 400) {
    assert(
      location.startsWith("/auth/login") || location.includes("/auth/login"),
      `${path} redirected to unexpected location: ${location}`,
    );
    console.log(`PASS ${path} route smoke auth redirect`);
    return;
  }

  const text = await response.text();
  assert(text.includes(expectedText), `${path} did not include expected text: ${expectedText}`);
  console.log(`PASS ${path} route smoke`);
}

async function read(relativePath) {
  return readFile(resolve(root, relativePath), "utf8");
}

await checkRoute("/questions", "Question Bank");
await checkRoute("/videos", "Videos");
await checkAdminRoute("/admin", "Dashboard");
await checkAdminRoute("/admin/questions", "Questions");
await checkAdminRoute("/admin/review", "Review Drafts");
await checkAdminRoute("/admin/imports", "Manual JSON Import");
await checkAdminRoute("/admin/imports/pdf", "AI PDF Import");
await checkAdminRoute("/admin/imports/assets", "Bulk asset upload");
await checkAdminRoute("/admin/imports/package", "Package Import");
await checkAdminRoute("/admin/tags", "Taxonomy");
await checkAdminRoute("/admin/blueprints", "Question Blueprint Workspace");
await checkAdminRoute("/admin/blueprints/review", "Blueprint Review Queue");
await checkAdminRoute("/admin/blueprints/library", "Approved Blueprint Library");
await checkAdminRoute("/admin/blueprints/history", "History / Archive / Trash");
await checkAdminRoute("/admin/blueprints/sources", "Blueprint Import Sources");
const blueprintPage = await read("src/app/admin/blueprints/page.tsx");
const blueprintWorkspace = await read("src/components/blueprints/blueprint-workspace.tsx");
const blueprintActions = await read("src/app/admin/blueprints/actions.ts");
const aiPdfDashboard = await read("src/components/ai-pdf-dashboard/ai-pdf-control-dashboard.tsx");
const aiPdfPanel = await read("src/components/ai-pdf-import-panel.tsx");
const aiPdfImportLoading = await read("src/app/admin/imports/pdf/loading.tsx");
const aiPdfImportLoadingSkeleton = await read("src/components/ai-pdf-import-loading-skeleton.tsx");
const adminActionGroup = await read("src/components/admin/admin-action-group.tsx");
const adminCard = await read("src/components/admin/admin-card.tsx");
const adminDangerZone = await read("src/components/admin/admin-danger-zone.tsx");
const adminDebugDisclosure = await read("src/components/admin/admin-debug-disclosure.tsx");
const adminEmptyState = await read("src/components/admin/admin-empty-state.tsx");
const adminLayout = await read("src/app/admin/layout.tsx");
const adminLoadingState = await read("src/components/admin/admin-loading-state.tsx");
const adminPage = await read("src/app/admin/page.tsx");
const adminImportsPage = await read("src/app/admin/imports/page.tsx");
const adminSidebar = await read("src/components/admin/admin-sidebar.tsx");
const adminPageHeader = await read("src/components/admin/admin-page-header.tsx");
const adminStatusBadge = await read("src/components/admin/admin-status-badge.tsx");
const adminQuestionsPage = await read("src/app/admin/questions/page.tsx");
const adminQuestionsLoading = await read("src/app/admin/questions/loading.tsx");
const publicQuestionsPage = await read("src/app/questions/page.tsx");
const publicQuestionsLoading = await read("src/app/questions/loading.tsx");
const adminReviewPage = await read("src/app/admin/review/page.tsx");
const adminReviewLoading = await read("src/app/admin/review/loading.tsx");
const draftReviewCard = await read("src/components/draft-review-card.tsx");
const blueprintLoading = await read("src/components/blueprints/blueprint-list-skeleton.tsx");
const bulkAssetsPage = await read("src/app/admin/imports/assets/page.tsx");
const videosPage = await read("src/app/videos/page.tsx");
assert(
  adminReviewPage.includes("REVIEW_PAGE_SIZE") &&
    adminReviewPage.includes(".range(pageFrom, pageTo)") &&
    !adminReviewPage.includes(".limit(1000)"),
  "admin review route must keep draft and related data page-sized",
);
assert(
  bulkAssetsPage.includes("BULK_ASSET_EXISTING_FILE_LIMIT") &&
    !bulkAssetsPage.includes(".limit(2000)"),
  "bulk asset import route must keep existing-file lookup bounded to the draft window",
);
assert(
  videosPage.includes("VIDEOS_PAGE_SIZE") &&
    videosPage.includes(".range(") &&
    !videosPage.includes(".limit(100);"),
  "videos route must use paged video loading instead of a fixed 100-row initial query",
);
console.log("PASS route data loading stays paged on review, assets, and videos");
assert(
  adminQuestionsPage.includes("ADMIN_QUESTION_PAGE_SIZE = 50") &&
    adminQuestionsPage.includes("ADMIN_QUESTION_SUMMARY_SELECT") &&
    adminQuestionsPage.includes("ADMIN_QUESTION_DETAIL_SELECT") &&
    adminQuestionsPage.includes("focusedQuestionId && orderedQuestionIds.length") &&
    !adminQuestionsPage.includes('select("*"'),
  "admin questions must use summary-first paged list loading and focused detail loading",
);
assert(
  publicQuestionsPage.includes("const pageSize = 25") &&
    publicQuestionsPage.includes("search_questions_by_taxonomy") &&
    publicQuestionsPage.includes("page_limit: pageSize") &&
    publicQuestionsPage.includes("id, question_code, title, content_html, difficulty_rating, status"),
  "public questions must keep bounded taxonomy RPC summary loading",
);
assert(
  blueprintWorkspace.includes("BLUEPRINT_REVIEW_PAGE_SIZE = 50") &&
    blueprintWorkspace.includes("BLUEPRINT_LIBRARY_PAGE_SIZE = 50") &&
    blueprintWorkspace.includes("BLUEPRINT_SOURCE_PAGE_SIZE = 25") &&
    blueprintWorkspace.includes("loadReviewActions") &&
    blueprintWorkspace.includes("loadBlueprintLibrary") &&
    blueprintWorkspace.includes("loadImportSources") &&
    blueprintWorkspace.includes("loadBlueprintDetailSummaries") &&
    blueprintWorkspace.includes(".in(\"blueprint_id\", loadedBlueprintIds)"),
  "blueprint workspace must keep route-scoped bounded data loading",
);
console.log("PASS question and blueprint data loading stays summary-first and route-scoped");
assert(
  adminLayout.includes("AdminShell") &&
    adminSidebar.includes("Primary") &&
    adminSidebar.includes("Advanced tools") &&
    adminSidebar.includes("Settings") &&
    adminSidebar.includes("Dashboard") &&
    adminSidebar.includes("Questions") &&
    adminSidebar.includes("Review Drafts") &&
    adminSidebar.includes("Blueprint Library") &&
    adminSidebar.includes("AI Parsing") &&
    adminSidebar.includes("Practice") &&
    adminSidebar.includes("Videos") &&
    adminSidebar.includes("Manual JSON Import") &&
    adminSidebar.includes("Bulk Assets") &&
    adminSidebar.includes("Package Import") &&
    adminSidebar.includes("Taxonomy") &&
    adminSidebar.includes("/admin/blueprints") &&
    adminSidebar.includes("/admin/imports/pdf") &&
    adminSidebar.includes("aria-current") &&
    adminPageHeader.includes("title") &&
    adminPageHeader.includes("description"),
  "admin shell must expose grouped navigation, active state, and shared page header",
);
console.log("PASS admin shell exposes grouped navigation and shared page header");
assert(
  adminActionGroup.includes("AdminActionGroup") &&
    adminCard.includes("AdminCard") &&
    adminDangerZone.includes("AdminDangerZone") &&
    adminDebugDisclosure.includes("AdminDebugDisclosure") &&
    adminEmptyState.includes("AdminEmptyState") &&
    adminLoadingState.includes("AdminLoadingState") &&
    adminStatusBadge.includes("AdminStatusBadge"),
  "shared admin primitives must exist",
);
assert(
  [
    adminActionGroup,
    adminCard,
    adminDangerZone,
    adminDebugDisclosure,
    adminEmptyState,
    adminLoadingState,
    adminStatusBadge,
  ].every((source) => !source.trimStart().startsWith("\"use client\"") && !source.trimStart().startsWith("'use client'")),
  "shared admin primitives must stay server-compatible by default",
);
assert(
  adminPage.includes("AdminCard") &&
    adminPage.includes("AdminActionGroup") &&
    adminPage.includes("action={createDemoContent}") &&
    adminImportsPage.includes("AdminStatusBadge") &&
    adminImportsPage.includes("AdminDebugDisclosure") &&
    adminImportsPage.includes("AdminEmptyState") &&
    adminQuestionsPage.includes("AdminDangerZone") &&
    adminQuestionsPage.includes("action={bulkUpdateQuestions}") &&
    adminReviewPage.includes("AdminDangerZone") &&
    adminReviewPage.includes("action={bulkUpdateQuestions}") &&
    adminQuestionsLoading.includes("AdminLoadingState") &&
    adminReviewLoading.includes("AdminLoadingState"),
  "admin pages must use shared primitives without replacing server-action forms",
);
console.log("PASS shared admin primitives render server-compatible patterns");
assert(
  adminReviewPage.includes("AdminCard") &&
    adminReviewPage.includes("AdminActionGroup") &&
    adminReviewPage.includes("AdminEmptyState") &&
    adminReviewPage.includes("Review workflow") &&
    adminReviewPage.includes("Find draft questions") &&
    adminReviewPage.includes("Review selected drafts") &&
    adminReviewPage.includes("action={bulkUpdateQuestions}") &&
    draftReviewCard.includes("AdminDebugDisclosure") &&
    draftReviewCard.includes("AdminStatusBadge") &&
    draftReviewCard.includes("Edit / Review") &&
    draftReviewCard.includes("Source and AI import details") &&
    draftReviewCard.includes("Publish readiness") &&
    draftReviewCard.includes("Taxonomy review"),
  "review drafts UI must use shared primitives, clear workflow copy, and collapsed source/import details",
);
assert(
  adminQuestionsPage.includes("AdminCard") &&
    adminQuestionsPage.includes("AdminStatusBadge") &&
    adminQuestionsPage.includes("AdminActionGroup") &&
    adminQuestionsPage.includes("AdminEmptyState") &&
    adminQuestionsPage.includes("Content library filters") &&
    adminQuestionsPage.includes("Question library") &&
    adminQuestionsPage.includes("action={bulkUpdateQuestions}") &&
    adminQuestionsPage.includes("action={deleteQuestion}") &&
    publicQuestionsPage.includes("Published question filters") &&
    publicQuestionsPage.includes("official difficulty") &&
    publicQuestionsPage.includes("No published questions match these filters.") &&
    publicQuestionsLoading.includes("QuestionListSkeleton"),
  "question bank UI must keep bounded list behavior while rendering polished filter, list, and empty states",
);
console.log("PASS review and question bank UI polish keeps server-action behavior intact");
assert(
  adminQuestionsLoading.includes("Loading questions...") &&
    adminQuestionsLoading.includes("Showing first 50 questions") &&
    adminQuestionsLoading.includes("QuestionListSkeleton"),
  "admin questions route must expose shell-first loading copy and skeleton rows",
);
assert(
  publicQuestionsLoading.includes("Loading questions...") &&
    publicQuestionsLoading.includes("Showing first 25 published questions") &&
    publicQuestionsLoading.includes("QuestionListSkeleton"),
  "public questions route must expose shell-first loading copy and skeleton cards",
);
assert(
  adminReviewLoading.includes("Loading Review Drafts...") &&
    adminReviewLoading.includes("ReviewDraftListSkeleton"),
  "admin review route must expose shell-first loading copy and skeleton cards",
);
assert(
  blueprintLoading.includes("BlueprintWorkspaceLoading") &&
    blueprintLoading.includes("Loading blueprint workspace...") &&
    blueprintLoading.includes("BlueprintSubnav") &&
    blueprintLoading.includes("SourcePlanSkeleton"),
  "blueprint routes must expose shell-first subnav and skeleton workspace content",
);
assert(
  aiPdfImportLoading.includes("AIPdfImportLoadingSkeleton") &&
    aiPdfImportLoadingSkeleton.includes("Loading AI PDF import controls...") &&
    aiPdfImportLoadingSkeleton.includes("Uploaded PDF sources") &&
    aiPdfImportLoadingSkeleton.includes("Loading provider and private source PDF access") &&
    aiPdfImportLoadingSkeleton.includes("Loading AI PDF import dashboard"),
  "AI PDF import route must expose shell-first loading copy, source skeletons, and dashboard skeletons",
);
console.log("PASS progressive loading shells are present for questions, review, blueprints, and AI PDF import");
assert(
  adminSidebar.includes("Blueprint Library") &&
    adminSidebar.includes("/admin/blueprints"),
  "admin navigation must include Blueprint Library",
);
console.log("PASS admin navigation includes Blueprint Library");
assert(
  blueprintPage.includes("view=\"overview\"") &&
    blueprintWorkspace.includes("Question Blueprint Workspace") &&
    blueprintWorkspace.includes("Blueprint Review Queue") &&
    blueprintWorkspace.includes("Approved Blueprint Library") &&
    blueprintWorkspace.includes("History / Archive / Trash") &&
    blueprintWorkspace.includes("Blueprint Import Sources") &&
    blueprintWorkspace.includes("Review blueprints") &&
    blueprintWorkspace.includes("Open library") &&
    blueprintWorkspace.includes("Open sources") &&
    blueprintWorkspace.includes("Generate original draft questions") &&
    blueprintWorkspace.includes("Manual DeepSeek call") &&
    blueprintWorkspace.includes("Open Review Drafts") &&
    blueprintWorkspace.includes("Active library") &&
    blueprintWorkspace.includes("Archived / Trash") &&
    blueprintWorkspace.includes("Needs more evidence") &&
    blueprintWorkspace.includes("Rejected") &&
    blueprintWorkspace.includes("Edit taxonomy targets") &&
    blueprintWorkspace.includes("Quality gate blockers") &&
    blueprintWorkspace.includes("Generation disabled") &&
    blueprintWorkspace.includes("Grouped taxonomy targets") &&
    blueprintWorkspace.includes("Short pattern summary") &&
    blueprintWorkspace.includes("Source refs and internal notes") &&
    blueprintWorkspace.includes("Draft ID:") &&
    blueprintWorkspace.includes("overflowWrap: \"anywhere\"") &&
    blueprintWorkspace.includes("Blueprint folders") &&
    blueprintWorkspace.includes("All blueprints") &&
    blueprintWorkspace.includes("Unfiled") &&
    blueprintWorkspace.includes("Folder tree") &&
    blueprintWorkspace.includes("Move to folder") &&
    blueprintWorkspace.includes("No blueprints in this folder yet.") &&
    blueprintWorkspace.includes("Calibration status") &&
    blueprintWorkspace.includes("Run calibration preview") &&
    blueprintWorkspace.includes("Repair failed samples automatically") &&
    blueprintWorkspace.includes("rerun calibration using Quality mode") &&
    blueprintWorkspace.includes("Temporary calibration samples") &&
    blueprintWorkspace.includes("Run a successful calibration preview before generating Review Draft questions.") &&
    blueprintWorkspace.includes("Blueprint changed after the last successful calibration.") &&
    blueprintWorkspace.includes("Edit, version, split / merge") &&
    blueprintWorkspace.includes("Version history") &&
    blueprintWorkspace.includes("Edit blueprint fields") &&
    blueprintWorkspace.includes("Advanced split / merge") &&
    blueprintWorkspace.includes("Deprecate and replace") &&
    blueprintWorkspace.includes("Repair failed drafts automatically"),
  "blueprint workspace source is missing BP14 sections, BP15 repair controls, or existing BP6 controls",
);
assert(
  blueprintWorkspace.includes("AdminCard") &&
    blueprintWorkspace.includes("AdminStatusBadge") &&
    blueprintWorkspace.includes("AdminActionGroup") &&
    blueprintWorkspace.includes("AdminDangerZone") &&
    blueprintWorkspace.includes("AdminDebugDisclosure") &&
    blueprintWorkspace.includes("AdminEmptyState") &&
    blueprintWorkspace.includes("No AI import blueprint review plans found yet.") &&
    blueprintWorkspace.includes("AI import blueprint plans") &&
    blueprintWorkspace.includes("Generated drafts sent to Review") &&
    blueprintWorkspace.includes("Nothing to show here yet."),
  "blueprint workspace must use shared admin primitives for readable cards, statuses, empty states, and debug disclosure",
);
assert(
  blueprintWorkspace.includes("action={approveQuestionBlueprintReviewAction}") &&
    blueprintWorkspace.includes("action={rejectQuestionBlueprintReviewAction}") &&
    blueprintWorkspace.includes("action={storeBlueprintReviewActionsFromImportBatch}") &&
    blueprintWorkspace.includes("action={generateOriginalQuestionsFromApprovedBlueprint}") &&
    blueprintWorkspace.includes("Reject blueprint draft") &&
    blueprintWorkspace.includes("Move blueprint to trash"),
  "blueprint workspace must preserve server-action forms while separating destructive actions",
);
console.log("PASS blueprint workspace uses shared admin primitives without changing action wiring");
assert(
  blueprintActions.includes("generateOriginalQuestionsFromApprovedBlueprint") &&
    blueprintActions.includes("runBlueprintCalibrationPreview") &&
    blueprintActions.includes("archiveQuestionBlueprint") &&
    blueprintActions.includes("restoreQuestionBlueprint") &&
    blueprintActions.includes("moveQuestionBlueprintToTrash") &&
    blueprintActions.includes("createQuestionBlueprintFolder") &&
    blueprintActions.includes("moveQuestionBlueprintToFolder") &&
    blueprintActions.includes("archiveQuestionBlueprintFolder") &&
    blueprintActions.includes("updateBlueprintReviewActionTaxonomyTargets") &&
    blueprintActions.includes("loadActiveAssignableLeafTaxonomyByFacet") &&
    blueprintActions.includes("importBatchImportJson") &&
    blueprintActions.includes("executeDeepSeekBlueprintGeneration") &&
    blueprintActions.includes("repairQuestionBlueprintGenerationResult") &&
    blueprintActions.includes("modelQualityMode") &&
    blueprintActions.includes("loadActiveAssignableTaxonomyTagIds") &&
    blueprintActions.includes("question_blueprint_calibration_runs") &&
    blueprintActions.includes("updateQuestionBlueprintFields") &&
    blueprintActions.includes("splitQuestionBlueprint") &&
    blueprintActions.includes("createMergedQuestionBlueprintDraft") &&
    blueprintActions.includes("replaceQuestionBlueprint") &&
    blueprintActions.includes("question_blueprint_versions") &&
    blueprintActions.includes("Number(calibrationRun.blueprint_version) !== Number(blueprint.version)") &&
    blueprintActions.includes("generation_readiness !== \"generation_ready\"") &&
    !blueprintActions.includes(".delete(") &&
    !blueprintActions.includes("generateWithGeminiNativePdf") &&
    !blueprintActions.includes("callAIPdfExtractionProvider"),
  "/admin/blueprints action must use manual DeepSeek generation without AI PDF extraction",
);
console.log("PASS /admin/blueprints source exposes lifecycle-gated DeepSeek draft generation safely");
assert(
  aiPdfDashboard.includes("Blueprint Observation Clusters") &&
    aiPdfDashboard.includes("Source questions were split into separate blueprint") &&
    aiPdfDashboard.includes("candidates before DeepSeek analysis.") &&
    aiPdfDashboard.includes("Clusters:") &&
    aiPdfDashboard.includes("Drafts pending review:"),
  "AI PDF dashboard must show blueprint observation clustering metadata",
);
console.log("PASS AI PDF dashboard source surfaces blueprint observation clusters");
assert(
  aiPdfDashboard.includes("Blueprint observation completed") &&
    aiPdfDashboard.includes("Open Blueprint Library") &&
    aiPdfDashboard.includes("Review and approve extracted question blueprints") &&
    aiPdfDashboard.includes("No questions were created by design."),
  "AI PDF dashboard must show completed blueprint observation handoff",
);
assert(
  aiPdfPanel.includes("isAIPdfBlueprintObservationCompletePhase") &&
    aiPdfPanel.includes("BlueprintObservationCompletionCallout") &&
    aiPdfPanel.includes("Blueprint AI quality mode") &&
    aiPdfPanel.includes("blueprintModelQualityMode") &&
    aiPdfPanel.includes("Open Blueprint Library") &&
    aiPdfPanel.includes("No questions were created by design."),
  "AI PDF live panel must stop spinner and show blueprint completion handoff",
);
console.log("PASS AI PDF blueprint observation completion handoff is visible");
console.log("PASS route smoke uses taxonomy routes without legacy tag setup");
