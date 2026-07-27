import { access, readFile } from "node:fs/promises";

async function read(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const priorityLoadingRoutes = [
  "src/app/loading.tsx",
  "src/app/admin/loading.tsx",
  "src/app/admin/questions/loading.tsx",
  "src/app/practice/loading.tsx",
  "src/app/student/loading.tsx",
  "src/app/teacher/loading.tsx",
  "src/app/teacher/banks/loading.tsx",
  "src/app/teacher/banks/[bankId]/loading.tsx",
  "src/app/teacher/banks/[bankId]/questions/loading.tsx",
];

await Promise.all(
  priorityLoadingRoutes.map((path) =>
    access(new URL(`../${path}`, import.meta.url)),
  ),
);

const [
  loadingIndicator,
  workspaceSkeleton,
  practiceClient,
  practicePanels,
  aiPdfLoader,
  jsonLoader,
  assetLoader,
  packageLoader,
] = await Promise.all([
  read("src/components/loading-indicator.tsx"),
  read("src/components/workspace-loading-skeleton.tsx"),
  read("src/components/practice/practice-agent-client.tsx"),
  read("src/components/practice/practice-session-scope-panels.tsx"),
  read("src/components/ai-pdf-import-panel-loader.tsx"),
  read("src/components/batch-import-json-panel-loader.tsx"),
  read("src/components/bulk-asset-upload-panel-loader.tsx"),
  read("src/components/package-import-panel-loader.tsx"),
]);

assert(
  loadingIndicator.includes('role="status"') &&
    loadingIndicator.includes('aria-live="polite"') &&
    loadingIndicator.includes("motion-safe:animate-spin"),
  "small loading feedback must be accessible and respect reduced-motion preferences",
);
assert(
  workspaceSkeleton.includes('aria-busy="true"') &&
    workspaceSkeleton.includes("motion-safe:animate-pulse"),
  "page-level loading must use an accessible skeleton",
);
assert(
  practiceClient.includes("useState(Boolean(assignmentId))") &&
    practiceClient.includes("sessionHistoryLoading") &&
    practiceClient.includes("restoreActive: false") &&
    practicePanels.includes("PracticeSessionListLoading") &&
    practicePanels.includes("Loading available question sources"),
  "Practice must show a usable fresh-session shell while secondary data hydrates",
);
for (const [name, source] of [
  ["AI PDF", aiPdfLoader],
  ["JSON import", jsonLoader],
  ["bulk asset", assetLoader],
  ["package import", packageLoader],
]) {
  assert(
    source.includes("<LoadingIndicator"),
    `${name} dynamic loader must not use silent text-only feedback`,
  );
}

console.log("PASS loading feedback and progressive hydration guard");
