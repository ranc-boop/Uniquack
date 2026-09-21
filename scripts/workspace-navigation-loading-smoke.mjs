import { readFile, readdir } from "node:fs/promises";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";

async function readSourceTree(directory) {
  const root = directory instanceof URL ? fileURLToPath(directory) : directory;
  const entries = await readdir(root, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const path = join(root, entry.name);
      if (entry.isDirectory()) return readSourceTree(path);
      return extname(entry.name) === ".tsx" ? readFile(path, "utf8") : "";
    }),
  );
  return files.join("\n");
}

const [pendingLink, sidebar, questionPage, questionWorkbench, teacherLoading, routeFeedback, appChrome, teacherPages, teacherNav, bankUi, bankSettings, blueprintPage, globalStyles] =
  await Promise.all([
    readFile(
      new URL(
        "../src/components/route-pending-link.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL("../src/components/admin/admin-sidebar.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../src/app/admin/questions/page.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../src/components/questions/question-management-workbench.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL(
        "../src/app/teacher/banks/[bankId]/questions/loading.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL("../src/components/route-transition-feedback.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../src/components/app-chrome.tsx", import.meta.url),
      "utf8",
    ),
    readSourceTree(new URL("../src/app/teacher", import.meta.url)),
    readFile(new URL("../src/components/teacher/teacher-workspace-nav.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/app/teacher/banks/bank-ui.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/app/teacher/banks/[bankId]/settings/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/app/teacher/blueprints/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/app/globals.css", import.meta.url), "utf8"),
  ]);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function usesMessageKeys(source, ...keys) {
  return keys.every((key) => source.includes(`"${key}"`));
}

const routeProgressStart = globalStyles.indexOf(".route-progress");
const routeProgressEnd = globalStyles.indexOf(".loading-indicator-spinner", routeProgressStart);
const routeProgressStyles = globalStyles.slice(routeProgressStart, routeProgressEnd);

assert(
  pendingLink.includes("router.prefetch(href)") &&
    pendingLink.includes("onMouseEnter={(event) =>") &&
    pendingLink.includes("onFocus={(event) =>") &&
    pendingLink.includes("if (!event.defaultPrevented) prefetchTarget()") &&
    pendingLink.includes("prefetch={false}") &&
    pendingLink.includes("startTransition(() => router.push(href))"),
  "Admin navigation must prefetch only on intent and expose pending state.",
);

assert(
  sidebar.includes("<AdminPendingLink"),
  "Admin sidebar navigation must use intent prefetch.",
);

assert(
  questionPage.includes("QuestionManagementWorkbench") &&
    questionWorkbench.includes("<RoutePendingLink") &&
    questionWorkbench.includes("selected: item.id"),
  "Question rows must not viewport-prefetch every detail payload.",
);

assert(
  teacherLoading.includes("Loading Library questions") &&
    teacherLoading.includes("QuestionListSkeleton") &&
    teacherLoading.includes("motion-reduce:animate-none"),
  "Teacher question navigation must have a target-specific reduced-motion loading boundary.",
);

assert(
  appChrome.includes("<RouteTransitionFeedback") &&
    routeFeedback.includes('document.addEventListener("click", beginNavigation, true)') &&
    routeFeedback.includes('anchor.dataset.routeProgress !== "page"') &&
    routeFeedback.includes('setPhase("complete")') &&
    routeFeedback.includes('aria-live="polite"') &&
    usesMessageKeys(routeFeedback, "common.loadingPage") &&
    routeFeedback.includes('anchor.target !== "_self"') &&
    routeFeedback.includes('anchor.hasAttribute("download")'),
  "Only explicitly marked page navigation may use the single-pass global progress bar.",
);

assert(
  sidebar.includes('feedback="page"') &&
    teacherNav.includes('feedback="page"') &&
    pendingLink.includes('feedback?: "inline" | "page"') &&
    pendingLink.includes('data-route-progress={feedback === "page" ? "page" : undefined}'),
  "Workspace navigation must use page progress while local controls retain inline feedback.",
);

assert(
  !teacherPages.includes("<TeacherWorkspaceNav") &&
    !teacherPages.includes('from "@/components/teacher/teacher-workspace-nav"'),
  "Teacher pages must rely on AppChrome and must not render a second workspace navigation.",
);

assert(
  teacherNav.includes("<TeacherPendingLink") &&
    teacherNav.includes('href: "/questions?workspace=teacher"'),
  "Teacher workspace navigation must provide pending feedback and retain the teacher Public Library context.",
);

assert(
  !bankUi.includes('label: "Settings"') &&
    bankSettings.includes("redirect(`/teacher/banks/${bankId}`)"),
  "The removed Library Settings placeholder must keep a safe overview redirect.",
);

assert(
  !blueprintPage.includes("BlueprintSafetyStrip") &&
    !blueprintPage.includes("BlueprintWorkflowPanel"),
  "Blueprint Library must not repeat static workflow boundary cards.",
);

assert(
    !globalStyles.includes("grid-row: 1 / span 50") &&
    globalStyles.includes("@apply space-y-6") &&
    bankUi.includes("BankContextNav") &&
    globalStyles.includes("@keyframes route-progress-grow") &&
    !globalStyles.includes("route-progress-move") &&
    !routeProgressStyles.includes("infinite"),
  "Library navigation must align with the workbench and page progress must run once rather than loop.",
);

console.log("PASS workspace navigation uses intent prefetch and loading boundaries");
