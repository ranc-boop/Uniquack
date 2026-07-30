import { access, readdir, readFile } from "node:fs/promises";

async function read(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

async function exists(path) {
  return access(new URL(`../${path}`, import.meta.url)).then(
    () => true,
    () => false,
  );
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function collectRouteFiles(directory, prefix = "") {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      files.push(
        ...(await collectRouteFiles(
          new URL(`${entry.name}/`, directory),
          relativePath,
        )),
      );
    } else {
      files.push(relativePath);
    }
  }
  return files;
}

const routeFiles = await collectRouteFiles(new URL("../src/app/", import.meta.url));
const loadingDirectories = routeFiles
  .filter((path) => path.endsWith("/loading.tsx") || path === "loading.tsx")
  .map((path) => path.replace(/\/?loading\.tsx$/, ""));
const leakedAncestorBoundaries = routeFiles
  .filter((path) => path.endsWith("/page.tsx") || path === "page.tsx")
  .flatMap((pagePath) => {
    const pageDirectory = pagePath.replace(/\/?page\.tsx$/, "");
    const nearestLoadingDirectory = loadingDirectories
      .filter(
        (directory) =>
          pageDirectory === directory ||
          pageDirectory.startsWith(`${directory}/`),
      )
      .sort((left, right) => right.length - left.length)[0];
    return nearestLoadingDirectory && nearestLoadingDirectory !== pageDirectory
      ? [`${nearestLoadingDirectory || "/"} -> ${pageDirectory || "/"}`]
      : [];
  });
assert(
  leakedAncestorBoundaries.length === 0,
  `loading boundaries leak into child pages without a target-specific override: ${leakedAncestorBoundaries.join(", ")}`,
);

const priorityLoadingRoutes = [
  "src/app/admin/questions/loading.tsx",
  "src/app/practice/loading.tsx",
  "src/app/teacher/banks/[bankId]/questions/loading.tsx",
];

await Promise.all(
  priorityLoadingRoutes.map((path) =>
    access(new URL(`../${path}`, import.meta.url)),
  ),
);

const previewErrorRoutes = [
  "src/app/teacher/banks/[bankId]/questions/preview/error.tsx",
  "src/app/teacher/banks/[bankId]/questions/[bankQuestionId]/preview/error.tsx",
  "src/app/teacher/banks/[bankId]/review/bulk/error.tsx",
  "src/app/teacher/banks/[bankId]/review/[reviewItemId]/error.tsx",
  "src/app/teacher/classrooms/[id]/assignments/[assignmentId]/student-preview/error.tsx",
];
const previewErrors = await Promise.all(previewErrorRoutes.map(read));
assert(
  previewErrors.every(
    (source) =>
      source.includes("TeacherRouteError") &&
      source.includes("returnHref=") &&
      source.includes("reset={reset}"),
  ),
  "each focused preview needs a task-specific retry and safe return boundary",
);

const overBroadLoadingRoutes = [
  "src/app/loading.tsx",
  "src/app/admin/loading.tsx",
  "src/app/student/loading.tsx",
  "src/app/teacher/loading.tsx",
  "src/app/teacher/banks/loading.tsx",
  "src/app/teacher/banks/[bankId]/loading.tsx",
  "src/app/teacher/banks/[bankId]/imports/loading.tsx",
];
assert(
  !(await Promise.all(overBroadLoadingRoutes.map(exists))).some(Boolean),
  "shared route segments must not replace an entire workspace for a nested or query-only navigation",
);

const [
  loadingIndicator,
  practiceClient,
  practicePanels,
  importTransition,
  aiPdfLoader,
  jsonLoader,
  assetLoader,
  packageLoader,
  teacherRouteError,
  teacherRouteLoading,
] = await Promise.all([
  read("src/components/loading-indicator.tsx"),
  read("src/components/practice/practice-agent-client.tsx"),
  read("src/components/practice/practice-session-scope-panels.tsx"),
  read("src/components/teacher/teacher-bank-import-transition.tsx"),
  read("src/components/ai-pdf-import-panel-loader.tsx"),
  read("src/components/batch-import-json-panel-loader.tsx"),
  read("src/components/bulk-asset-upload-panel-loader.tsx"),
  read("src/components/package-import-panel-loader.tsx"),
  read("src/components/teacher/teacher-route-error.tsx"),
  read("src/components/teacher/teacher-route-loading.tsx"),
]);

assert(
  loadingIndicator.includes('role="status"') &&
    loadingIndicator.includes('aria-live="polite"') &&
    loadingIndicator.includes("motion-safe:animate-spin"),
  "small loading feedback must be accessible and respect reduced-motion preferences",
);
assert(
  teacherRouteError.includes("alertRef.current?.focus") &&
    teacherRouteError.includes("tabIndex={-1}") &&
    teacherRouteLoading.includes('role="status"'),
  "teacher loading and error boundaries must announce state and move keyboard focus into the error context",
);
assert(
  practiceClient.includes("useState(Boolean(assignmentId))") &&
    practiceClient.includes("sessionHistoryLoading") &&
    practiceClient.includes("restoreActive: false") &&
    practicePanels.includes("PracticeSessionListLoading") &&
    practicePanels.includes("Loading available question sources"),
  "Practice must show a usable fresh-session shell while secondary data hydrates",
);
assert(
  importTransition.includes("ImportModeSkeleton") &&
    importTransition.includes("router.prefetch") &&
    importTransition.includes("isPending && pendingMode") &&
    importTransition.includes("children"),
  "teacher import mode switches must retain the Library shell and show a target-mode skeleton locally",
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
