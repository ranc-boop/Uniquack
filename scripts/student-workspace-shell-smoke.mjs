import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
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

function exists(relativePath) {
  return existsSync(resolve(root, relativePath));
}

const requiredFiles = [
  "src/app/student/page.tsx",
  "src/app/student/layout.tsx",
  "src/components/student/student-workspace-nav.tsx",
  "src/components/student/student-workspace-shell.tsx",
  "src/app/student/library/page.tsx",
  "src/app/student/groups/page.tsx",
  "src/app/student/public-library/page.tsx",
  "src/app/student/progress/page.tsx",
];

for (const file of requiredFiles) {
  assert(exists(file), `${file} must exist for the student workspace shell`);
}

const [
  studentPage,
  studentLayout,
  studentNav,
  studentShell,
  studyLibraryPage,
  studyGroupsPage,
  publicLibraryPage,
  progressPage,
  routeSmoke,
] = await Promise.all([
  read("src/app/student/page.tsx"),
  read("src/app/student/layout.tsx"),
  read("src/components/student/student-workspace-nav.tsx"),
  read("src/components/student/student-workspace-shell.tsx"),
  read("src/app/student/library/page.tsx"),
  read("src/app/student/groups/page.tsx"),
  read("src/app/student/public-library/page.tsx"),
  read("src/app/student/progress/page.tsx"),
  read("scripts/route-smoke.mjs"),
]);

const studentNavLabels = [
  "Dashboard",
  "My Work",
  "Practice",
  "Mistakes",
  "Study Library",
  "Study Groups",
  "Public Library",
  "Progress / Feedback",
];

for (const label of studentNavLabels) {
  assert(studentNav.includes(label), `student nav must include ${label}`);
}

const teacherOnlyLabels = [
  "Question Bank",
  "AI Parsing",
  "Blueprint",
  "Classroom",
  "Publish",
  "Teacher Progress",
];

for (const label of teacherOnlyLabels) {
  assert(!studentNav.includes(label), `student nav must not expose teacher module: ${label}`);
}

assert(studentLayout.includes("StudentWorkspaceNav"), "student layout must render the student workspace nav");
assert(studentPage.includes("Student Dashboard"), "/student must render a real dashboard");
assert(studentPage.includes("It does not open the teacher"), "student dashboard must preserve teacher private library boundary copy");
assert(studentShell.includes("StudentWorkspaceShell"), "student shell component must exist");
assert(studentShell.includes("StudentModuleCard"), "student module card component must exist");
assert(
  !studentShell.trimStart().startsWith("\"use client\"") &&
    !studentShell.trimStart().startsWith("'use client'") &&
    !studentNav.trimStart().startsWith("\"use client\"") &&
    !studentNav.trimStart().startsWith("'use client'"),
  "student shell/nav must remain server-compatible",
);
assert(
  studyLibraryPage.includes("without creating a new backend") &&
    studyGroupsPage.includes("do not grant access to teacher private banks") &&
    publicLibraryPage.includes("Public does not mean verified") &&
    progressPage.includes("Feedback history"),
  "student placeholder modules must be clearly shell-only and boundary-safe",
);
assert(
  routeSmoke.includes('checkAdminRoute("/student", "Student Dashboard")') &&
    routeSmoke.includes('checkAdminRoute("/student/library", "Study Library")') &&
    routeSmoke.includes('checkAdminRoute("/student/groups", "Study Groups")') &&
    routeSmoke.includes('checkAdminRoute("/student/public-library", "Public Library")') &&
    routeSmoke.includes('checkAdminRoute("/student/progress", "Progress / Feedback")'),
  "route-smoke must include student workspace route expectations",
);

const status = spawnSync("git", ["status", "--short"], {
  cwd: root,
  encoding: "utf8",
  shell: false,
});
assert(status.status === 0, "git status must be available for migration guard");
assert(
  !status.stdout
    .split(/\r?\n/)
    .some((line) => line.includes("supabase/clean-migrations/") || line.includes("supabase/migrations/")),
  "student workspace shell PR must not add or edit migrations",
);

console.log("PASS student workspace shell static smoke");
