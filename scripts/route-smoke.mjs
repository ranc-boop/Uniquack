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
assert(
  blueprintPage.includes("Generate original draft questions") &&
    blueprintPage.includes("Manual DeepSeek call") &&
    blueprintPage.includes("Open Review Drafts") &&
    blueprintPage.includes("Active library") &&
    blueprintPage.includes("Archived / Trash") &&
    blueprintPage.includes("Quality gate blockers") &&
    blueprintPage.includes("Generation disabled"),
  "/admin/blueprints source is missing BP6 manual generation CTA or review link",
);
assert(
  blueprintActions.includes("generateOriginalQuestionsFromApprovedBlueprint") &&
    blueprintActions.includes("archiveQuestionBlueprint") &&
    blueprintActions.includes("restoreQuestionBlueprint") &&
    blueprintActions.includes("moveQuestionBlueprintToTrash") &&
    blueprintActions.includes("importBatchImportJson") &&
    blueprintActions.includes("executeDeepSeekBlueprintGeneration") &&
    blueprintActions.includes("loadActiveAssignableTaxonomyTagIds") &&
    !blueprintActions.includes(".delete(") &&
    !blueprintActions.includes("generateWithGeminiNativePdf") &&
    !blueprintActions.includes("callAIPdfExtractionProvider"),
  "/admin/blueprints action must use manual DeepSeek generation without AI PDF extraction",
);
console.log("PASS /admin/blueprints source exposes lifecycle-gated DeepSeek draft generation safely");
console.log("PASS route smoke uses taxonomy routes without legacy tag setup");
