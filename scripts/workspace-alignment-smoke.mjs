import { readFile, readdir } from "node:fs/promises";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";

async function read(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

async function readSourceTree(directory) {
  const root = directory instanceof URL ? fileURLToPath(directory) : directory;
  const entries = await readdir(root, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map(async (entry) => {
        const path = join(root, entry.name);
        if (entry.isDirectory()) return readSourceTree(path);
        return extname(entry.name) === ".tsx" ? readFile(path, "utf8") : "";
      }),
    )
  ).join("\n");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const [
  styles,
  appChrome,
  bankContextNav,
  bankUi,
  studentLayout,
  studentPages,
  studentShell,
  studentSkeletons,
  adminSidebar,
  adminQuestions,
] = await Promise.all([
  read("src/app/globals.css"),
  read("src/components/app-chrome.tsx"),
  read("src/components/teacher/bank-context-nav.tsx"),
  read("src/app/teacher/banks/bank-ui.tsx"),
  read("src/app/student/layout.tsx"),
  readSourceTree(new URL("../src/app/student", import.meta.url)),
  read("src/components/student/student-workspace-shell.tsx"),
  read("src/components/student/student-loading-skeletons.tsx"),
  read("src/components/admin/admin-sidebar.tsx"),
  read("src/app/admin/questions/page.tsx"),
]);

assert(
  styles.includes(".teacher-shell") &&
    styles.includes("px-4 py-6 sm:px-6 lg:px-8") &&
    styles.includes(".bank-workbench") &&
    styles.includes("@apply space-y-6") &&
    !styles.includes(".bank-workbench:has"),
  "Teacher pages and Library pages must share one vertical gutter without implicit nested-sidebar grid placement.",
);

assert(
  bankContextNav.includes("Library workflow") &&
    bankContextNav.includes("md:flex") &&
    bankContextNav.includes("md:hidden") &&
    bankContextNav.includes('activeTool?.label ?? "More"'),
  "Library navigation must use one horizontal context bar with a compact mobile disclosure.",
);

assert(
    studentLayout.includes('className="student-shell space-y-6"') &&
    appChrome.includes('className="student-route-main"') &&
    (studentPages.match(/className="student-shell/g) ?? []).length === 1 &&
    !studentShell.includes('className="student-shell') &&
    !studentSkeletons.includes('className="student-shell'),
  "Student routes must render exactly one workspace gutter instead of nested student shells.",
);

assert(
  !adminSidebar.includes("UserRound") &&
    !adminSidebar.includes("Super admin") &&
    adminQuestions.includes('<AdminPageHeader title="Public Library"') &&
    adminQuestions.includes("showTitle={false}"),
  "Admin navigation must align with external page headers and must not repeat account identity in the sidebar.",
);

assert(
  !bankUi.includes("badges?:") &&
    !bankUi.includes("children: React.ReactNode;\n  eyebrow") &&
    bankUi.includes("subtitle?: string"),
  "Library page headers must expose only rendered, consistent header content.",
);

console.log("PASS workspace and Library alignment contract");
