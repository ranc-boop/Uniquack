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

const [
  page,
  actions,
  helper,
  selectionControls,
  smokeAll,
] = await Promise.all([
  read("src/app/teacher/publish/page.tsx"),
  read("src/app/teacher/publish/actions.ts"),
  read("src/lib/teacher-publish.ts"),
  read("src/components/teacher/publish-selection-controls.tsx"),
  read("scripts/smoke-all.mjs"),
]);

assert(
  page.includes("Question Bank") &&
    page.includes("Blueprint") &&
    page.includes("Package") &&
    page.includes("Package publishing is not assignment-ready yet.") &&
    page.includes("Blueprint rows are not directly publishable") &&
    page.includes("Student preview") &&
    page.includes("Hidden from students") &&
    page.includes("Choose classroom delivery") &&
    page.includes("Selected students") &&
    page.includes("sourceType"),
  "Publish Center v2 page must expose bank/Blueprint/Package source modes, preview, and target controls",
);

assert(
  page.includes("PublishSelectionControls") &&
    selectionControls.includes('"use client"') &&
    selectionControls.includes("Select visible") &&
    selectionControls.includes("Clear"),
  "Publish Center v2 must provide checklist ergonomics without changing server-action forms",
);

assert(
  helper.includes("listPublishableBankQuestions") &&
    helper.includes("filterPublishableQuestions") &&
    helper.includes("verifyPublishableSelection") &&
    helper.includes("buildPublishAssignmentSourceSummary") &&
    helper.includes("question.status === \"draft\"") &&
    helper.includes("question.status === \"archived\"") &&
    helper.includes("question.status === \"deprecated\"") &&
    helper.includes("review_draft_items") &&
    helper.includes("blueprint_generation") &&
    helper.includes("exposesSourceBankToStudents: false") &&
    helper.includes("exposesBlueprintInternalsToStudents: false") &&
    helper.includes("exposesProviderMetadataToStudents: false"),
  "Publish Center helper must enforce approved-content filtering and sanitized assignment lineage",
);

assert(
  actions.includes("getTeacherQuestionBankDetail") &&
    actions.includes("canPublishFromBank") &&
    actions.includes("listPublishableBankQuestions") &&
    actions.includes("verifyPublishableSelection") &&
    actions.includes("buildPublishAssignmentSourceSummary") &&
    actions.includes("create_assignment_from_bank") &&
    actions.includes("source_summary") &&
    actions.includes("Selected classrooms must belong to the source bank organization.") &&
    !actions.includes("AI_PROVIDER") &&
    !actions.includes("providerProfiles") &&
    !actions.includes("published_at"),
  "Publish Center action must re-load source truth, call bank RPC, and avoid providers/global publish",
);

assert(
  smokeAll.includes("publish-center-v2-smoke.mjs"),
  "smoke-all must include Publish Center v2 smoke",
);

console.log("PASS publish-center-v2 smoke protects bank-first source, Blueprint lineage, and assignment-only delivery");
