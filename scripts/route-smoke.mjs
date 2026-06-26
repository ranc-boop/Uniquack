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
const adminLayout = await read("src/app/admin/layout.tsx");
const adminSidebar = await read("src/components/admin/admin-sidebar.tsx");
const adminPageHeader = await read("src/components/admin/admin-page-header.tsx");
const adminQuestionsPage = await read("src/app/admin/questions/page.tsx");
const publicQuestionsPage = await read("src/app/questions/page.tsx");
const adminReviewPage = await read("src/app/admin/review/page.tsx");
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
