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

const teacherPage = await read("src/app/teacher/page.tsx");
const teacherNav = await read("src/components/teacher/teacher-workspace-nav.tsx");
const rootLayout = await read("src/app/layout.tsx");
const adminPage = await read("src/app/admin/page.tsx");

assert(
  teacherPage.includes("Bank-first teacher workflow") &&
    teacherPage.includes("Open Question Bank") &&
    teacherPage.includes("Import materials") &&
    teacherPage.includes("Student visibility stays assignment-only"),
  "teacher dashboard must preserve bank-first ownership and assignment-only student visibility copy",
);
assert(
  teacherNav.includes("/teacher/banks") &&
    teacherNav.includes("/teacher/ai-parsing") &&
    teacherNav.includes("/teacher/classrooms") &&
    !teacherNav.includes("/practice") &&
    !teacherNav.includes("/admin/imports/pdf"),
  "teacher nav must expose teacher modules without student practice or admin import primary routes",
);
assert(
  rootLayout.includes("teacherNavItems") &&
    rootLayout.includes("studentNavItems") &&
    rootLayout.includes("teacher\", \"admin\", \"super_admin"),
  "root layout must keep separate student and teacher primary navigation",
);
assert(
  adminPage.includes("Provider") || adminPage.includes("Admin"),
  "admin page must remain available for platform operations",
);

console.log("PASS teacher role/bank boundary smoke");
