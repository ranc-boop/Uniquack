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
await checkAdminRoute(
  "/admin/blueprints",
  "Question Blueprint Library",
);
const blueprintPage = await read("src/app/admin/blueprints/page.tsx");
const blueprintActions = await read("src/app/admin/blueprints/actions.ts");
const aiPdfDashboard = await read("src/components/ai-pdf-dashboard/ai-pdf-control-dashboard.tsx");
const aiPdfPanel = await read("src/components/ai-pdf-import-panel.tsx");
const adminLayout = await read("src/app/admin/layout.tsx");
assert(
  adminLayout.includes("Blueprint Library") &&
    adminLayout.includes("/admin/blueprints"),
  "admin navigation must include Blueprint Library",
);
console.log("PASS admin navigation exposes Blueprint Library");
assert(
  blueprintPage.includes("Generate original draft questions") &&
    blueprintPage.includes("Manual DeepSeek call") &&
    blueprintPage.includes("Open Review Drafts") &&
    blueprintPage.includes("Active library") &&
    blueprintPage.includes("Archived / Trash") &&
    blueprintPage.includes("Needs more evidence") &&
    blueprintPage.includes("Rejected") &&
    blueprintPage.includes("Edit taxonomy targets") &&
    blueprintPage.includes("Quality gate blockers") &&
    blueprintPage.includes("Generation disabled"),
  "/admin/blueprints source is missing BP6 manual generation CTA or review link",
);
assert(
  blueprintActions.includes("generateOriginalQuestionsFromApprovedBlueprint") &&
    blueprintActions.includes("archiveQuestionBlueprint") &&
    blueprintActions.includes("restoreQuestionBlueprint") &&
    blueprintActions.includes("moveQuestionBlueprintToTrash") &&
    blueprintActions.includes("updateBlueprintReviewActionTaxonomyTargets") &&
    blueprintActions.includes("loadActiveAssignableLeafTaxonomyByFacet") &&
    blueprintActions.includes("importBatchImportJson") &&
    blueprintActions.includes("executeDeepSeekBlueprintGeneration") &&
    blueprintActions.includes("loadActiveAssignableTaxonomyTagIds") &&
    !blueprintActions.includes(".delete(") &&
    !blueprintActions.includes("generateWithGeminiNativePdf") &&
    !blueprintActions.includes("callAIPdfExtractionProvider"),
  "/admin/blueprints action must use manual DeepSeek generation without AI PDF extraction",
);
console.log("PASS /admin/blueprints source exposes lifecycle-gated DeepSeek draft generation safely");
assert(
  aiPdfDashboard.includes("Blueprint Observation Clusters") &&
    aiPdfDashboard.includes("Source questions were split into separate blueprint") &&
    aiPdfDashboard.includes("candidates before DeepSeek analysis."),
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
    aiPdfPanel.includes("Open Blueprint Library") &&
    aiPdfPanel.includes("No questions were created by design."),
  "AI PDF live panel must stop spinner and show blueprint completion handoff",
);
console.log("PASS AI PDF blueprint observation completion handoff is visible");
console.log("PASS route smoke uses taxonomy routes without legacy tag setup");
